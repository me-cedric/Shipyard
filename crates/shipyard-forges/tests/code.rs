//! Code / Pull requests calls on a fake forge (spec `code`, REQ-018 to REQ-023, REQ-025):
//! list, detail, open, comment, verdict, merge, mark ready and a refused write. No network.

use serde_json::{Value, json};
use shipyard_forges::*;
use shipyard_http::Method;
use shipyard_http::fake::FakeHttp;
use shipyard_secrets::Secret;
use std::sync::Arc;

fn build(kind: ForgeKind, url: &str, fake: Arc<FakeHttp>) -> Box<dyn CodeApi> {
    let config = ForgeConfig {
        kind,
        url: url.into(),
    };
    connect_code_api(&config, Secret::new("tok-code-secret"), fake).expect("connect")
}

fn bodies(fake: &FakeHttp, method: Method, url_has: &str) -> Vec<Value> {
    fake.requests()
        .into_iter()
        .filter(|r| r.method == method && r.url.contains(url_has))
        .map(|r| r.body.unwrap_or(Value::Null))
        .collect()
}

fn gh_pull(draft: bool) -> String {
    json!({
        "number": 12, "title": "fix(auth): login", "state": "open", "draft": draft,
        "user": {"login": "bot"}, "head": {"ref": "fix/auth/login", "sha": "abc"},
        "base": {"ref": "main"}, "html_url": "u", "updated_at": "2026-10-29T10:00:00Z",
        "node_id": "PR_node"
    })
    .to_string()
}

fn github(draft: bool) -> (Box<dyn CodeApi>, Arc<FakeHttp>) {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/repos/acme/web/pulls/12/reviews",
        200,
        &json!([
            {"user": {"login": "r1"}, "state": "CHANGES_REQUESTED"},
            {"user": {"login": "r1"}, "state": "APPROVED"},
            {"user": {"login": "r2"}, "state": "COMMENTED"},
            {"user": {"login": "r3"}, "state": "CHANGES_REQUESTED"}
        ])
        .to_string(),
    )
    .get(
        "/repos/acme/web/pulls/12/files",
        200,
        &json!([
            {"filename": "src/a.rs", "status": "modified", "patch": "@@ -1 +1 @@\n-a\n+b"},
            {"filename": "img.png", "status": "added"}
        ])
        .to_string(),
    )
    .get(
        "/repos/acme/web/pulls/12/commits",
        200,
        &json!([
            {"sha": "abc", "commit": {"message": "fix(auth): login\n\nbody"}}
        ])
        .to_string(),
    )
    .get(
        "/repos/acme/web/pulls?state=open",
        200,
        &format!("[{}]", gh_pull(draft)),
    )
    .post(
        "/repos/acme/web/pulls",
        "\"draft\":true",
        201,
        &gh_pull(true),
    )
    .post("/issues/12/comments", "looks good", 201, "{}")
    .post("/pulls/12/reviews", "APPROVE", 200, "{}")
    .post("/pulls/12/reviews", "REQUEST_CHANGES", 200, "{}")
    .put("/pulls/12/merge", "\"merge_method\":\"squash\"", 200, "{}")
    .get(
        "/repos/acme/web/pulls/12",
        200,
        &gh_pull(draft).replace("\"node_id\"", "\"body\":\"Why\",\"node_id\""),
    )
    .post(
        "/graphql",
        "markPullRequestReadyForReview",
        200,
        &json!({"data": {}}).to_string(),
    );
    (
        build(ForgeKind::GitHub, "https://github.com", fake.clone()),
        fake,
    )
}

#[test]
fn list_and_detail_read_files_and_commits() {
    let (api, _) = github(false);
    let page = api
        .list_pulls("acme/web", &PullQuery::default())
        .expect("list");
    assert_eq!(page.items[0].number, 12);
    let files = api.files("acme/web", 12).expect("files");
    assert_eq!(files[0].path, "src/a.rs");
    assert!(files[0].patch.as_deref().unwrap().contains("+b"));
    assert_eq!(files[1].patch, None);
    let v = api.verdicts("acme/web", 12).expect("verdicts");
    assert_eq!(
        v.iter()
            .map(|x| (x.reviewer.as_str(), x.state.as_str()))
            .collect::<Vec<_>>(),
        [("r1", "approved"), ("r3", "changes-requested")]
    );
    let commits = api.commits("acme/web", 12).expect("commits");
    assert_eq!(commits[0].summary, "fix(auth): login");
    assert_eq!(api.description("acme/web", 12).unwrap(), "Why");
}

#[test]
fn open_comment_verdict_and_mark_ready_send_one_write_each() {
    let (api, fake) = github(true);
    let new = NewPull {
        title: "fix(auth): login".into(),
        body: String::new(),
        source: "fix/auth/login".into(),
        target: "main".into(),
        draft: true,
    };
    assert_eq!(api.create_pull("acme/web", &new).unwrap().number, 12);
    api.comment("acme/web", 12, "looks good").unwrap();
    api.verdict("acme/web", 12, Verdict::Approve, "").unwrap();
    api.verdict("acme/web", 12, Verdict::RequestChanges, "rename it")
        .unwrap();
    api.mark_ready("acme/web", 12).unwrap();
    assert_eq!(bodies(&fake, Method::Post, "/issues/12/comments").len(), 1);
    assert_eq!(bodies(&fake, Method::Post, "/pulls/12/reviews").len(), 2);
    assert_eq!(bodies(&fake, Method::Post, "/graphql").len(), 1);
}

#[test]
fn text_rules_refuse_before_any_write() {
    let (api, fake) = github(false);
    assert!(api.comment("acme/web", 12, "  ").is_err());
    assert!(
        api.verdict("acme/web", 12, Verdict::RequestChanges, "")
            .is_err()
    );
    assert!(
        fake.requests().iter().all(|r| r.method == Method::Get),
        "a refused call sent a write"
    );
}

#[test]
fn a_draft_cannot_merge_and_a_ready_one_merges() {
    let (api, fake) = github(true);
    let e = api.merge("acme/web", 12, MergeMethod::Squash).unwrap_err();
    assert!(e.to_string().contains("draft"), "{e}");
    assert!(bodies(&fake, Method::Put, "/merge").is_empty());
    let (api, fake) = github(false);
    api.merge("acme/web", 12, MergeMethod::Squash).unwrap();
    assert_eq!(bodies(&fake, Method::Put, "/merge").len(), 1);
}

#[test]
fn a_refused_write_shows_the_forge_message_and_no_retry() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/repos/acme/web/pulls/12", 200, &gh_pull(false))
        .put(
            "/pulls/12/merge",
            "",
            405,
            "{\"message\":\"Base branch was modified\"}",
        );
    let api = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    let e = api.merge("acme/web", 12, MergeMethod::Merge).unwrap_err();
    assert!(e.to_string().contains("405"), "{e}");
    assert!(e.to_string().contains("Base branch was modified"), "{e}");
    assert_eq!(bodies(&fake, Method::Put, "/merge").len(), 1);
}

#[test]
fn gitlab_offers_two_methods_and_azure_three() {
    let g = build(
        ForgeKind::GitLab,
        "https://gitlab.com",
        Arc::new(FakeHttp::new()),
    );
    assert_eq!(g.merge_methods(), [MergeMethod::Merge, MergeMethod::Squash]);
    let a = build(
        ForgeKind::AzureDevOps,
        "https://dev.azure.com/acme",
        Arc::new(FakeHttp::new()),
    );
    assert_eq!(a.merge_methods().len(), 3);
    assert!(g.merge("a/b", 1, MergeMethod::Rebase).is_err());
}

#[test]
fn gitlab_verdicts_and_merge() {
    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb/merge_requests/9";
    let mr = json!({"iid": 9, "state": "opened", "draft": false, "title": "t"}).to_string();
    fake.get(root, 200, &mr)
        .post(&format!("{root}/approve"), "", 201, "{}")
        .post(
            &format!("{root}/notes"),
            "Changes requested: rename",
            201,
            "{}",
        )
        .put(&format!("{root}/merge"), "\"squash\":true", 200, "{}");
    let api = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    api.verdict("acme/web", 9, Verdict::Approve, "").unwrap();
    api.verdict("acme/web", 9, Verdict::RequestChanges, "rename")
        .unwrap();
    api.merge("acme/web", 9, MergeMethod::Squash).unwrap();
    assert_eq!(bodies(&fake, Method::Post, "/notes").len(), 1);
}

#[test]
fn azure_votes_and_completes() {
    let fake = Arc::new(FakeHttp::new());
    let root = "/proj/_apis/git/repositories/web/pullrequests/5";
    let pr = json!({
        "pullRequestId": 5, "status": "active", "isDraft": false,
        "lastMergeSourceCommit": {"commitId": "abc"}
    })
    .to_string();
    fake.get(
        "/_apis/connectionData",
        200,
        &json!({"authenticatedUser": {"id": "u1"}}).to_string(),
    )
    .put(&format!("{root}/reviewers/u1"), "\"vote\":-5", 200, "{}")
    .patch(root, "\"mergeStrategy\":\"squash\"", 200, "{}")
    .get(root, 200, &pr);
    let api = build(
        ForgeKind::AzureDevOps,
        "https://dev.azure.com/acme",
        fake.clone(),
    );
    api.verdict("proj/web", 5, Verdict::RequestChanges, "")
        .unwrap_err();
    api.merge("proj/web", 5, MergeMethod::Squash).unwrap();
    assert_eq!(bodies(&fake, Method::Patch, root).len(), 1);
}

#[test]
fn close_sends_the_close_write_for_an_open_pull_request_only() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/repos/acme/web/pulls/12", 200, &gh_pull(false))
        .patch("/pulls/12", "\"state\":\"closed\"", 200, "{}");
    let api = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    api.close("acme/web", 12).unwrap();
    assert_eq!(bodies(&fake, Method::Patch, "/pulls/12").len(), 1);

    let fake = Arc::new(FakeHttp::new());
    let merged = gh_pull(false).replace("\"open\"", "\"closed\"");
    fake.get("/repos/acme/web/pulls/12", 200, &merged);
    let api = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    let e = api.close("acme/web", 12).unwrap_err();
    assert!(e.to_string().contains("not open"), "{e}");
    assert!(bodies(&fake, Method::Patch, "/pulls").is_empty());

    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb/merge_requests/9";
    let mr = json!({"iid": 9, "state": "opened", "draft": false, "title": "t"}).to_string();
    fake.get(root, 200, &mr)
        .put(root, "\"state_event\":\"close\"", 200, "{}");
    let api = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    api.close("acme/web", 9).unwrap();
    assert_eq!(bodies(&fake, Method::Put, root).len(), 1);
}

// ---- review with each note on its line (spec `agent-pr`, REQ-004)

fn notes() -> Vec<LineNote> {
    let note = |path: &str, line, text: &str| LineNote {
        path: path.into(),
        line,
        text: text.into(),
    };
    vec![
        note("src/a.rs", 2, "P1 no test"),
        note("src/a.rs", 9, "P2 rename"),
        note("img.png", 1, "P2 binary"),
    ]
}

fn review_bodies(fake: &FakeHttp, url_has: &str) -> Vec<Value> {
    bodies(fake, Method::Post, url_has)
}

#[test]
fn github_review_puts_a_note_on_its_line_and_the_rest_in_the_body() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/repos/acme/web/pulls/12/files",
        200,
        &json!([
            {"filename": "src/a.rs", "status": "modified", "patch": "@@ -1,2 +1,3 @@\n a\n+b\n c"},
            {"filename": "img.png", "status": "added"}
        ])
        .to_string(),
    )
    .post("/pulls/12/reviews", "", 200, "{}");
    let api = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    api.review("acme/web", 12, "abc", None, "Summary", &notes())
        .unwrap();
    let sent = review_bodies(&fake, "/pulls/12/reviews");
    assert_eq!(sent.len(), 1, "one review");
    let r = &sent[0];
    assert_eq!(r["commit_id"], "abc");
    assert_eq!(r["event"], "COMMENT");
    let c = r["comments"].as_array().unwrap();
    assert_eq!(c.len(), 1);
    assert_eq!(
        (c[0]["path"].as_str(), c[0]["line"].as_u64()),
        (Some("src/a.rs"), Some(2))
    );
    assert_eq!(c[0]["side"], "RIGHT");
    let body = r["body"].as_str().unwrap();
    assert!(body.starts_with("Summary"), "{body}");
    assert!(body.contains("`src/a.rs:9` P2 rename") && body.contains("`img.png:1` P2 binary"));
    assert!(
        !body.contains("no test"),
        "the line note is not in the body"
    );
}

#[test]
fn github_review_without_a_line_in_the_diff_sends_one_body() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/repos/acme/web/pulls/12/files",
        200,
        &json!([{"filename": "src/a.rs", "status": "modified", "patch": "@@ -1 +1 @@\n-a\n+b"}])
            .to_string(),
    )
    .post("/pulls/12/reviews", "REQUEST_CHANGES", 200, "{}");
    let api = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    api.review(
        "acme/web",
        12,
        "abc",
        Some(Verdict::RequestChanges),
        "Fix these",
        &notes(),
    )
    .unwrap();
    let sent = review_bodies(&fake, "/pulls/12/reviews");
    assert_eq!(sent.len(), 1);
    assert!(sent[0].get("comments").is_none(), "{}", sent[0]);
    assert!(sent[0]["body"].as_str().unwrap().contains("`src/a.rs:9`"));
}

#[test]
fn github_review_falls_back_to_one_body_when_the_forge_refuses_a_line() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/repos/acme/web/pulls/12/files",
        200,
        &json!([{"filename": "src/a.rs", "status": "modified", "patch": "@@ -1,2 +1,3 @@\n a\n+b\n c"}])
            .to_string(),
    )
    .post("/pulls/12/reviews", "\"comments\"", 422, "{\"message\":\"bad line\"}")
    .post("/issues/12/comments", "", 201, "{}");
    let api = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    api.review("acme/web", 12, "abc", None, "Summary", &notes())
        .unwrap();
    assert_eq!(review_bodies(&fake, "/pulls/12/reviews").len(), 1);
    let sent = review_bodies(&fake, "/issues/12/comments");
    assert_eq!(sent.len(), 1, "the retry is one comment");
    assert!(
        sent[0]["body"]
            .as_str()
            .unwrap()
            .contains("`src/a.rs:2` P1 no test")
    );
}

#[test]
fn a_request_for_changes_needs_a_text_before_any_write() {
    let (api, fake) = github(false);
    let e = api
        .review(
            "acme/web",
            12,
            "abc",
            Some(Verdict::RequestChanges),
            "",
            &[],
        )
        .unwrap_err();
    assert!(e.to_string().contains("needs some text"), "{e}");
    assert!(fake.requests().iter().all(|r| r.method == Method::Get));
}

#[test]
fn gitlab_review_opens_one_discussion_with_a_position_for_each_line() {
    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb/merge_requests/9";
    fake.get(
        &format!("{root}/diffs"),
        200,
        &json!([{"new_path": "src/a.rs", "diff": "@@ -1,2 +1,3 @@\n a\n+b\n c"}]).to_string(),
    )
    .get(
        root,
        200,
        &json!({"iid": 9, "diff_refs": {"base_sha": "b1", "start_sha": "s1", "head_sha": "h1"}})
            .to_string(),
    )
    .post(&format!("{root}/discussions"), "", 201, "{}")
    .post(&format!("{root}/notes"), "", 201, "{}");
    let api = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    api.review("acme/web", 9, "h1", None, "Summary", &notes())
        .unwrap();
    let d = bodies(&fake, Method::Post, "/discussions");
    assert_eq!(d.len(), 1);
    let p = &d[0]["position"];
    assert_eq!(d[0]["body"], "P1 no test");
    assert_eq!(
        (
            p["new_path"].as_str(),
            p["new_line"].as_u64(),
            p["head_sha"].as_str(),
            p["base_sha"].as_str()
        ),
        (Some("src/a.rs"), Some(2), Some("h1"), Some("b1"))
    );
    assert_eq!(p["position_type"], "text");
    let n = bodies(&fake, Method::Post, "/notes");
    assert_eq!(n.len(), 1);
    assert!(
        n[0]["body"]
            .as_str()
            .unwrap()
            .contains("`src/a.rs:9` P2 rename")
    );
}

#[test]
fn gitlab_review_moves_a_refused_discussion_into_the_body() {
    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb/merge_requests/9";
    fake.get(
        &format!("{root}/diffs"),
        200,
        &json!([{"new_path": "src/a.rs", "diff": "@@ -1,2 +1,3 @@\n a\n+b\n c"}]).to_string(),
    )
    .get(
        root,
        200,
        &json!({"iid": 9, "diff_refs": {"base_sha": "b1", "start_sha": "s1", "head_sha": "h1"}})
            .to_string(),
    )
    .post(
        &format!("{root}/discussions"),
        "",
        400,
        "{\"message\":\"line_code\"}",
    )
    .post(&format!("{root}/approve"), "", 201, "{}")
    .post(&format!("{root}/notes"), "", 201, "{}");
    let api = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    api.review(
        "acme/web",
        9,
        "h1",
        Some(Verdict::Approve),
        "",
        &notes()[..1],
    )
    .unwrap();
    assert_eq!(bodies(&fake, Method::Post, "/approve").len(), 1);
    let n = bodies(&fake, Method::Post, "/notes");
    assert!(
        n[0]["body"]
            .as_str()
            .unwrap()
            .contains("`src/a.rs:2` P1 no test")
    );
}

#[test]
fn gitlab_review_posts_no_line_comment_when_the_verdict_fails() {
    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb/merge_requests/9";
    fake.get(
        &format!("{root}/diffs"),
        200,
        &json!([{"new_path": "src/a.rs", "diff": "@@ -1,2 +1,3 @@\n a\n+b\n c"}]).to_string(),
    )
    .get(
        root,
        200,
        &json!({"iid": 9, "diff_refs": {"base_sha": "b1", "start_sha": "s1", "head_sha": "h1"}})
            .to_string(),
    )
    .post(&format!("{root}/discussions"), "", 201, "{}")
    .post(&format!("{root}/approve"), "", 401, "{\"message\":\"401\"}");
    let api = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    let sent = api.review(
        "acme/web",
        9,
        "h1",
        Some(Verdict::Approve),
        "",
        &notes()[..1],
    );
    assert!(sent.is_err());
    // A retry after the error cannot post a line comment twice.
    assert!(bodies(&fake, Method::Post, "/discussions").is_empty());
}

#[test]
fn github_accepts_a_request_for_changes_with_an_empty_summary_and_line_notes() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/repos/acme/web/pulls/12/files",
        200,
        &json!([{"filename": "src/a.rs", "status": "modified", "patch": "@@ -1,2 +1,3 @@\n a\n+b\n c"}])
            .to_string(),
    )
    .post("/pulls/12/reviews", "", 200, "{}");
    let api = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    api.review(
        "acme/web",
        12,
        "abc",
        Some(Verdict::RequestChanges),
        "",
        &notes()[..1],
    )
    .unwrap();
    assert_eq!(review_bodies(&fake, "/pulls/12/reviews").len(), 1);
}

fn gitlab_diff_mocks(fake: &FakeHttp, root: &str) {
    fake.get(
        &format!("{root}/diffs"),
        200,
        &json!([{"new_path": "src/a.rs", "diff": "@@ -1,2 +1,3 @@\n a\n+b\n c"}]).to_string(),
    )
    .get(
        root,
        200,
        &json!({"iid": 9, "diff_refs": {"base_sha": "b1", "start_sha": "s1", "head_sha": "h1"}})
            .to_string(),
    );
}

#[test]
fn gitlab_review_reports_the_failed_line_notes_apart_after_the_verdict_went_out() {
    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb/merge_requests/9";
    gitlab_diff_mocks(&fake, root);
    fake.post(&format!("{root}/discussions"), "", 400, "{}")
        .post(&format!("{root}/approve"), "", 201, "{}")
        .post(&format!("{root}/notes"), "", 500, "{}");
    let api = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    let failed = api
        .review(
            "acme/web",
            9,
            "h1",
            Some(Verdict::Approve),
            "",
            &notes()[..1],
        )
        .expect("the verdict is sent: no error, or a retry posts it twice");
    assert_eq!(failed, notes()[..1].to_vec());
    assert_eq!(bodies(&fake, Method::Post, "/approve").len(), 1);
}

#[test]
fn a_request_for_changes_with_an_empty_summary_and_line_notes_is_accepted() {
    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb/merge_requests/9";
    gitlab_diff_mocks(&fake, root);
    fake.post(&format!("{root}/discussions"), "", 201, "{}")
        .post(&format!("{root}/notes"), "", 201, "{}");
    let api = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    let failed = api
        .review(
            "acme/web",
            9,
            "h1",
            Some(Verdict::RequestChanges),
            "",
            &notes()[..1],
        )
        .unwrap();
    assert!(failed.is_empty());
    assert_eq!(bodies(&fake, Method::Post, "/discussions").len(), 1);
    // Still refused when there is neither a summary nor a note.
    assert!(
        api.review("acme/web", 9, "h1", Some(Verdict::RequestChanges), "", &[])
            .is_err()
    );
}

#[test]
fn gitlab_review_of_an_older_commit_puts_every_note_in_the_body() {
    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb/merge_requests/9";
    fake.get(
        &format!("{root}/diffs"),
        200,
        &json!([{"new_path": "src/a.rs", "diff": "@@ -1,2 +1,3 @@\n a\n+b\n c"}]).to_string(),
    )
    .get(
        root,
        200,
        &json!({"iid": 9, "diff_refs": {"base_sha": "b1", "start_sha": "s1", "head_sha": "h2"}})
            .to_string(),
    )
    .post(&format!("{root}/discussions"), "", 201, "{}")
    .post(&format!("{root}/notes"), "", 201, "{}");
    let api = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    api.review("acme/web", 9, "h1", None, "Summary", &notes()[..1])
        .unwrap();
    assert!(bodies(&fake, Method::Post, "/discussions").is_empty());
    let n = bodies(&fake, Method::Post, "/notes");
    assert_eq!(n.len(), 1);
    assert!(
        n[0]["body"]
            .as_str()
            .unwrap()
            .contains("`src/a.rs:2` P1 no test")
    );
}

#[test]
fn azure_review_keeps_the_one_body() {
    let fake = Arc::new(FakeHttp::new());
    let root = "/proj/_apis/git/repositories/web/pullrequests/5";
    fake.post(&format!("{root}/threads"), "src/a.rs:2", 200, "{}");
    let api = build(
        ForgeKind::AzureDevOps,
        "https://dev.azure.com/acme",
        fake.clone(),
    );
    api.review("proj/web", 5, "abc", None, "Summary", &notes()[..1])
        .unwrap();
    let t = bodies(&fake, Method::Post, "/threads");
    assert_eq!(t.len(), 1);
    assert!(
        t[0]["comments"][0]["content"]
            .as_str()
            .unwrap()
            .starts_with("Summary")
    );
}
