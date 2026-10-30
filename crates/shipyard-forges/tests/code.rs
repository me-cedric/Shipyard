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
