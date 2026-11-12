//! Pull request write and feedback calls (spec `delivery`, REQ-011 to REQ-013, REQ-016, REQ-019,
//! REQ-021). One scenario set runs against GitHub, GitLab and Azure DevOps on inline JSON in the
//! shape of each product. No test uses the network.

use serde_json::{Value, json};
use shipyard_forges::*;
use shipyard_http::Method;
use shipyard_http::fake::FakeHttp;
use shipyard_secrets::Secret;
use std::sync::Arc;

const SECRET: &str = "tok-pr-secret";
const GUID: &str = "11111111-2222-3333-4444-555555555555";

struct Case {
    name: &'static str,
    api: Box<dyn PullApi>,
    fake: Arc<FakeHttp>,
    repo: &'static str,
    /// The number of the pull request in the fixtures.
    number: u64,
}

impl Case {
    fn sent(&self, method: Method, url_has: &str) -> Vec<Value> {
        self.fake
            .requests()
            .into_iter()
            .filter(|r| r.method == method && r.url.contains(url_has))
            .map(|r| r.body.unwrap_or(Value::Null))
            .collect()
    }

    fn count(&self, method: Method, url_has: &str) -> usize {
        self.sent(method, url_has).len()
    }
}

fn build(kind: ForgeKind, url: &str, fake: Arc<FakeHttp>) -> Box<dyn PullApi> {
    let config = ForgeConfig {
        kind,
        url: url.into(),
    };
    connect_pull_api(&config, Secret::new(SECRET), fake).expect("connect")
}

fn s(v: &str) -> String {
    v.to_string()
}

fn names(v: &[&str]) -> Vec<String> {
    v.iter().map(|x| x.to_string()).collect()
}

// ---- GitHub

fn gh_pull(draft: bool) -> String {
    json!({
        "number": 12, "title": "fix(auth): login", "state": "open", "draft": draft,
        "user": {"login": "bot"}, "head": {"ref": "fix/auth/login", "sha": "abc"},
        "base": {"ref": "main"}, "html_url": "https://github.com/acme/web/pull/12",
        "updated_at": "2026-10-29T10:00:00Z", "node_id": "PR_node",
        "mergeable": true, "mergeable_state": "clean"
    })
    .to_string()
}

fn github() -> Case {
    let fake = Arc::new(FakeHttp::new());
    // find: the open one comes after a closed one
    fake.get(
        "/repos/acme/web/pulls?head=acme%3Afix%2Fauth%2Flogin",
        200,
        &format!(
            "[{},{}]",
            json!({"number": 3, "state": "closed", "head": {"ref": "fix/auth/login"}, "base": {"ref": "main"}}),
            gh_pull(true)
        ),
    )
    .get(
        "/repos/acme/web/pulls?head=acme%3Anone",
        200,
        "[]",
    )
    .post("/repos/acme/web/pulls", "\"draft\":true", 201, &gh_pull(true))
    .post("/repos/acme/web/pulls", "\"draft\":false", 201, &gh_pull(false))
    .get("/repos/acme/web/pulls/12/reviews", 200, &json!([
        {"user": {"login": "r1"}, "state": "CHANGES_REQUESTED"},
        {"user": {"login": "r2"}, "state": "APPROVED"},
        {"user": {"login": "r3"}, "state": "CHANGES_REQUESTED"},
        {"user": {"login": "r3"}, "state": "APPROVED"}
    ]).to_string())
    .get("/repos/acme/web/pulls/12", 200, &gh_pull(false))
    .get("/commits/abc/check-runs", 200, &json!({"check_runs": [
        {"name": "build", "status": "completed", "conclusion": "failure", "html_url": "u"}
    ]}).to_string())
    .get("/commits/abc/status", 200, &json!({"statuses": []}).to_string())
    .get("/repos/acme/web/labels", 200, &json!([{"name": "feat"}, {"name": "Bug"}]).to_string())
    .post("/issues/12/labels", "", 200, &json!([{"name": "feat"}]).to_string())
    .post("/pulls/12/requested_reviewers", "", 201, &gh_pull(true))
    .post("/graphql", "markPullRequestReadyForReview", 200, &json!({"data": {"markPullRequestReadyForReview": {"pullRequest": {"isDraft": false}}}}).to_string())
    .post("/graphql", "reviewThreads", 200, &json!({"data": {"repository": {"pullRequest": {"reviewThreads": {"nodes": [
        {"id": "T1", "isResolved": false, "path": "src/a.rs", "line": 10,
         "comments": {"nodes": [{"id": "C0", "author": {"login": "rev"}, "body": "rename", "createdAt": "2026-10-29T09:00:00Z"}, {"id": "C9", "author": {"login": "bot"}, "body": "ok", "createdAt": "2026-10-29T09:05:00Z"}]}},
        {"id": "T2", "isResolved": true, "path": null, "line": null, "comments": {"nodes": []}}
    ]}}}}}).to_string())
    .get("/repos/acme/web/issues/12/comments", 200, &json!([
        {"id": 1, "user": {"login": "rev"}, "body": "first", "created_at": "2026-10-29T10:00:00Z"},
        {"id": 2, "user": {"login": "bot"}, "body": "second", "created_at": "2026-10-29T11:00:00Z"}
    ]).to_string())
    .post("/graphql", "addPullRequestReviewThreadReply", 200, &json!({"data": {"addPullRequestReviewThreadReply": {"comment": {"id": "C1"}}}}).to_string())
    .post("/graphql", "unresolveReviewThread", 200, &json!({"data": {"unresolveReviewThread": {"thread": {"isResolved": false}}}}).to_string())
    .post("/graphql", "resolveReviewThread", 200, &json!({"data": {"resolveReviewThread": {"thread": {"isResolved": true}}}}).to_string());
    Case {
        name: "github",
        api: build(ForgeKind::GitHub, "https://github.com", fake.clone()),
        fake,
        repo: "acme/web",
        number: 12,
    }
}

// ---- GitLab

fn gl_mr(title: &str, draft: bool) -> String {
    json!({
        "iid": 9, "title": title, "state": "opened", "draft": draft,
        "author": {"username": "bot"}, "source_branch": "fix/auth/login", "target_branch": "main",
        "sha": "abc", "web_url": "https://gitlab.com/acme/web/-/merge_requests/9",
        "updated_at": "2026-10-29T10:00:00Z", "has_conflicts": false,
        "detailed_merge_status": "mergeable", "merge_status": "can_be_merged",
        "head_pipeline": {"id": 77}
    })
    .to_string()
}

fn gitlab() -> Case {
    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb";
    fake.get(
        &format!("{root}/merge_requests?source_branch=fix%2Fauth%2Flogin"),
        200,
        &format!(
            "[{},{}]",
            json!({"iid": 2, "state": "closed", "source_branch": "fix/auth/login"}),
            gl_mr("Draft: fix(auth): login", true)
        ),
    )
    .get(&format!("{root}/merge_requests?source_branch=none"), 200, "[]")
    .post(&format!("{root}/merge_requests"), "Draft: fix(auth): login", 201, &gl_mr("Draft: fix(auth): login", true))
    .post(&format!("{root}/merge_requests"), "\"title\":\"fix(auth): login\"", 201, &gl_mr("fix(auth): login", false))
    .get(&format!("{root}/merge_requests/9/discussions"), 200, &json!([
        {"id": "d1", "individual_note": false, "notes": [
            {"id": 1, "body": "rename", "author": {"username": "rev"}, "resolvable": true, "resolved": false,
             "created_at": "2026-10-29T09:00:00Z", "system": false, "position": {"new_path": "src/a.rs", "new_line": 10}}]},
        {"id": "d2", "individual_note": true, "notes": [
            {"id": 2, "body": "hello", "author": {"username": "rev"}, "resolvable": false, "resolved": false, "system": false}]},
        {"id": "d3", "individual_note": false, "notes": [
            {"id": 3, "body": "done", "author": {"username": "rev"}, "resolvable": true, "resolved": true, "system": false}]}
    ]).to_string())
    // Newest first, as the call asks.
    .get(&format!("{root}/merge_requests/9/notes"), 200, &json!([
        {"id": 3, "body": "second", "author": {"username": "bot"}, "system": false, "resolvable": false, "created_at": "2026-10-29T11:00:00Z"},
        {"id": 2, "body": "first", "author": {"username": "rev"}, "system": false, "resolvable": false, "created_at": "2026-10-29T10:00:00Z"},
        {"id": 4, "body": "rename", "author": {"username": "rev"}, "system": false, "resolvable": true, "created_at": "2026-10-29T09:00:00Z"},
        {"id": 1, "body": "joined", "author": {"username": "sys"}, "system": true, "resolvable": false, "created_at": "2026-10-29T08:00:00Z"}
    ]).to_string())
    .post(&format!("{root}/merge_requests/9/discussions/d1/notes"), "", 201, "{}")
    .put(&format!("{root}/merge_requests/9/discussions/d1"), "\"resolved\":false", 200, "{}")
    .put(&format!("{root}/merge_requests/9/discussions/d1"), "\"resolved\":true", 200, "{}")
    .get(&format!("{root}/labels"), 200, &json!([{"name": "feat"}, {"name": "Bug"}]).to_string())
    .get("/api/v4/users?username=rev", 200, &json!([{"id": 42, "username": "rev"}]).to_string())
    .get("/api/v4/users?username=ghost", 200, "[]")
    .put(&format!("{root}/merge_requests/9"), "add_labels", 200, &gl_mr("x", true))
    .put(&format!("{root}/merge_requests/9"), "reviewer_ids", 200, &gl_mr("x", true))
    .put(&format!("{root}/merge_requests/9"), "\"title\":\"fix(auth): login\"", 200, &gl_mr("fix(auth): login", false))
    .get(&format!("{root}/merge_requests/9"), 200, &gl_mr("Draft: fix(auth): login", true))
    .get(&format!("{root}/pipelines/77/jobs"), 200, &json!([{"name": "build", "status": "success", "web_url": "u"}]).to_string());
    Case {
        name: "gitlab",
        api: build(ForgeKind::GitLab, "https://gitlab.com", fake.clone()),
        fake,
        repo: "acme/web",
        number: 9,
    }
}

// ---- Azure DevOps

fn az_pull(draft: bool) -> String {
    json!({
        "pullRequestId": 5, "title": "fix(auth): login", "status": "active", "isDraft": draft,
        "createdBy": {"displayName": "bot"}, "sourceRefName": "refs/heads/fix/auth/login",
        "targetRefName": "refs/heads/main", "lastMergeSourceCommit": {"commitId": "abc"},
        "creationDate": "2026-10-29T10:00:00Z", "mergeStatus": "succeeded",
        "reviewers": [{"vote": 10}, {"vote": -5}],
        "labels": [{"name": "feat"}, {"name": "Bug"}]
    })
    .to_string()
}

fn azure() -> Case {
    let fake = Arc::new(FakeHttp::new());
    let root = "/proj/_apis/git/repositories/web";
    fake.get(
        "sourceRefName",
        200,
        &json!({"value": [
            {"pullRequestId": 1, "status": "abandoned", "sourceRefName": "refs/heads/fix/auth/login"},
            serde_json::from_str::<Value>(&az_pull(true)).unwrap()
        ]}).to_string(),
    )
    .post(&format!("{root}/pullrequests"), "\"isDraft\":true", 201, &az_pull(true))
    .post(&format!("{root}/pullrequests"), "\"isDraft\":false", 201, &az_pull(false))
    .patch(&format!("{root}/pullrequests/5"), "\"isDraft\":false", 200, &az_pull(false))
    .get(&format!("{root}/pullrequests?"), 200, &json!({"value": [serde_json::from_str::<Value>(&az_pull(true)).unwrap()]}).to_string())
    .post(&format!("{root}/pullrequests/5/labels"), "", 200, "{}")
    .post(&format!("{root}/pullrequests/5/reviewers"), GUID, 200, "{}")
    .get(&format!("{root}/pullrequests/5/threads"), 200, &json!({"value": [
        {"id": 3, "status": "active",
         "comments": [{"id": 1, "content": "rename", "author": {"displayName": "rev"}, "commentType": "text", "publishedDate": "2026-10-29T09:00:00Z"}],
         "threadContext": {"filePath": "/src/a.rs", "rightFileStart": {"line": 10}}},
        {"id": 7, "status": "active", "comments": [{"id": 1, "content": "second", "author": {"displayName": "bot"}, "commentType": "text", "publishedDate": "2026-10-29T11:00:00Z"}]},
        {"id": 4, "status": "fixed", "comments": [{"id": 1, "content": "first", "author": {"displayName": "rev"}, "commentType": "text", "publishedDate": "2026-10-29T10:00:00Z"}]},
        {"id": 6, "status": "active", "comments": [{"id": 1, "content": "joined", "author": {"displayName": "sys"}, "commentType": "system"}]}
    ]}).to_string())
    .post(&format!("{root}/pullrequests/5/threads/3/comments"), "\"content\"", 201, "{}")
    .patch(&format!("{root}/pullrequests/5/threads/3"), "\"status\":\"fixed\"", 200, "{}")
    .patch(&format!("{root}/pullrequests/5/threads/3"), "\"status\":\"active\"", 200, "{}")
    .get(&format!("{root}/pullrequests/5/statuses"), 200, &json!({"value": [
        {"state": "succeeded", "context": {"name": "ci"}, "targetUrl": "u"}]}).to_string())
    .get(&format!("{root}/pullrequests/5"), 200, &json!({
        "pullRequestId": 5, "title": "t", "status": "active", "isDraft": false,
        "sourceRefName": "refs/heads/fix/auth/login", "targetRefName": "refs/heads/main",
        "lastMergeSourceCommit": {"commitId": "abc"}, "mergeStatus": "conflicts",
        "reviewers": [{"vote": 10}, {"vote": -5}]
    }).to_string());
    Case {
        name: "azure",
        api: build(
            ForgeKind::AzureDevOps,
            "https://dev.azure.com/acme",
            fake.clone(),
        ),
        fake,
        repo: "proj/web",
        number: 5,
    }
}

fn cases() -> Vec<Case> {
    vec![github(), gitlab(), azure()]
}

fn new_pull(draft: bool) -> NewPull {
    NewPull {
        title: s("fix(auth): login"),
        body: s("Opening paragraph."),
        source: s("fix/auth/login"),
        target: s("main"),
        draft,
    }
}

#[test]
fn a_pull_request_opens_as_a_draft_or_ready() {
    for c in cases() {
        let draft = c.api.create_pull(c.repo, &new_pull(true)).unwrap();
        assert_eq!(draft.number, c.number, "{}", c.name);
        assert!(draft.draft, "{}", c.name);
        assert_eq!(draft.source_branch, "fix/auth/login", "{}", c.name);
        let ready = c.api.create_pull(c.repo, &new_pull(false)).unwrap();
        assert!(!ready.draft, "{}", c.name);
    }
}

#[test]
fn a_pull_request_needs_a_title_two_branches_and_a_different_target() {
    for c in cases() {
        for bad in [
            NewPull {
                title: s("  "),
                ..new_pull(true)
            },
            NewPull {
                source: s(""),
                ..new_pull(true)
            },
            NewPull {
                target: s("fix/auth/login"),
                ..new_pull(true)
            },
        ] {
            assert!(
                matches!(c.api.create_pull(c.repo, &bad), Err(ForgeError::Config(_))),
                "{}",
                c.name
            );
        }
        assert!(c.fake.requests().is_empty(), "{}", c.name);
    }
}

#[test]
fn the_pull_request_of_a_branch_is_found_again_and_the_open_one_wins() {
    for c in cases() {
        let found = c.api.find_pull(c.repo, "fix/auth/login").unwrap().unwrap();
        assert_eq!(found.number, c.number, "{}", c.name);
        assert_eq!(found.state, PullState::Open, "{}", c.name);
    }
    // No pull request: `None`, so the caller may open one.
    for c in [github(), gitlab()] {
        assert!(
            c.api.find_pull(c.repo, "none").unwrap().is_none(),
            "{}",
            c.name
        );
    }
}

#[test]
fn only_existing_labels_are_added_and_none_is_created_or_removed() {
    for c in cases() {
        let out = c
            .api
            .add_labels(c.repo, c.number, &names(&["feat", "bug", "billing"]))
            .unwrap();
        // The spelling of the forge wins, and a case difference is not a missing label.
        assert_eq!(out.applied, names(&["feat", "Bug"]), "{}", c.name);
        assert_eq!(out.missing, names(&["billing"]), "{}", c.name);
        let body = serde_json::to_string(
            &c.fake
                .requests()
                .into_iter()
                .filter_map(|r| r.body)
                .collect::<Vec<_>>(),
        )
        .unwrap();
        assert!(!body.contains("billing"), "{}", c.name);
        // Never a delete, and never a call that creates a label.
        assert!(
            c.fake.requests().iter().all(|r| r.method != Method::Delete),
            "{}",
            c.name
        );
        assert!(
            c.fake.requests().iter().all(|r| {
                r.method != Method::Post
                    || !r.url.split('?').next().unwrap().ends_with("web/labels")
            }),
            "{}",
            c.name
        );
    }
}

#[test]
fn no_label_to_add_sends_no_write() {
    for c in cases() {
        let out = c
            .api
            .add_labels(c.repo, c.number, &names(&["billing"]))
            .unwrap();
        assert!(out.applied.is_empty(), "{}", c.name);
        assert!(
            c.fake.requests().iter().all(|r| r.method == Method::Get),
            "{}",
            c.name
        );
    }
}

#[test]
fn reviewers_are_requested() {
    let c = github();
    c.api.add_reviewers(c.repo, 12, &names(&["rev"])).unwrap();
    assert_eq!(
        c.sent(Method::Post, "/pulls/12/requested_reviewers"),
        [json!({"reviewers": ["rev"]})]
    );

    let c = gitlab();
    c.api.add_reviewers(c.repo, 9, &names(&["rev"])).unwrap();
    assert_eq!(
        c.sent(Method::Put, "/merge_requests/9"),
        [json!({"reviewer_ids": [42]})]
    );
    // An unknown name is an error, not a silent skip: the pull request needs a reviewer.
    assert!(matches!(
        c.api.add_reviewers(c.repo, 9, &names(&["ghost"])),
        Err(ForgeError::NotFound(_))
    ));

    let c = azure();
    c.api.add_reviewers(c.repo, 5, &names(&[GUID])).unwrap();
    assert_eq!(c.sent(Method::Post, "/reviewers"), [json!([{"id": GUID}])]);
    assert!(matches!(
        c.api.add_reviewers(c.repo, 5, &names(&["rev@acme.com"])),
        Err(ForgeError::Config(_))
    ));
}

#[test]
fn a_draft_is_marked_ready() {
    let c = github();
    c.api.mark_ready(c.repo, 12).unwrap();
    assert_eq!(c.count(Method::Post, "/graphql"), 1);

    let c = gitlab();
    c.api.mark_ready(c.repo, 9).unwrap();
    assert_eq!(
        c.sent(Method::Put, "/merge_requests/9"),
        [json!({"title": "fix(auth): login"})]
    );

    let c = azure();
    c.api.mark_ready(c.repo, 5).unwrap();
    assert_eq!(
        c.sent(Method::Patch, "/pullrequests/5"),
        [json!({"isDraft": false})]
    );
}

#[test]
fn review_threads_are_listed_with_their_comments_and_state() {
    for c in cases() {
        let threads = c.api.threads(c.repo, c.number).unwrap();
        let open: Vec<_> = threads.iter().filter(|t| !t.resolved).collect();
        assert_eq!(open.len(), 1, "{}", c.name);
        let t = open[0];
        assert!(!t.id.is_empty(), "{}", c.name);
        assert_eq!(t.comments[0].body, "rename", "{}", c.name);
        assert!(!t.comments[0].author.is_empty(), "{}", c.name);
        assert!(!t.comments[0].id.is_empty(), "{}", c.name);
        assert!(
            t.comments[0].created.starts_with("2026-10-29T09"),
            "{}",
            c.name
        );
        assert_eq!(
            t.path.as_deref().map(|p| p.trim_start_matches('/')),
            Some("src/a.rs"),
            "{}",
            c.name
        );
        assert_eq!(t.line, Some(10), "{}", c.name);
        // A plain comment or a system message is not a thread.
        assert!(
            threads.iter().all(|t| t.id != "d2" && t.id != "6"),
            "{}",
            c.name
        );
    }
}

#[test]
fn a_thread_gets_a_reply_and_is_then_resolved() {
    for c in cases() {
        let id = c
            .api
            .threads(c.repo, c.number)
            .unwrap()
            .into_iter()
            .find(|t| !t.resolved)
            .unwrap()
            .id;
        c.api
            .reply_thread(c.repo, c.number, &id, "Fixed in abc1234.")
            .unwrap();
        c.api.resolve_thread(c.repo, c.number, &id, true).unwrap();
        let writes: Vec<_> = c
            .fake
            .requests()
            .into_iter()
            .filter(|r| r.method != Method::Get && r.body.is_some())
            .map(|r| r.body.unwrap().to_string())
            .filter(|b| !b.contains("reviewThreads"))
            .collect();
        assert!(
            writes.iter().any(|b| b.contains("Fixed in abc1234.")),
            "{} {writes:?}",
            c.name
        );
        assert_eq!(writes.len(), 2, "{} {writes:?}", c.name);
    }
}

#[test]
fn a_reply_needs_text() {
    for c in cases() {
        assert!(
            matches!(
                c.api.reply_thread(c.repo, c.number, "x", "  "),
                Err(ForgeError::Config(_))
            ),
            "{}",
            c.name
        );
    }
}

#[test]
fn the_state_of_a_pull_request_gives_draft_ci_review_and_merge() {
    let c = github();
    let st = c.api.status(c.repo, 12).unwrap();
    assert_eq!(st.state, PullState::Open);
    assert!(!st.draft);
    assert_eq!(st.ci, CiState::Failing);
    // r1 asked for changes and never changed their mind; r3 changed it.
    assert!(st.changes_requested);
    assert_eq!(st.mergeable, Mergeable::Clean);
    assert_eq!(st.head_sha, "abc");

    let c = gitlab();
    let st = c.api.status(c.repo, 9).unwrap();
    assert_eq!(st.state, PullState::Open);
    assert!(st.draft);
    assert_eq!(st.ci, CiState::Passing);
    assert!(!st.changes_requested);
    assert_eq!(st.mergeable, Mergeable::Clean);

    let c = azure();
    let st = c.api.status(c.repo, 5).unwrap();
    assert_eq!(st.ci, CiState::Passing);
    // Vote -5 is "waiting for the author".
    assert!(st.changes_requested);
    assert_eq!(st.mergeable, Mergeable::Conflict);
}

#[test]
fn merge_states_map_to_clean_conflict_blocked_or_unknown() {
    let gh =
        |mergeable: Value, state: &str| {
            let fake = Arc::new(FakeHttp::new());
            fake.get("/pulls/1/reviews", 200, "[]")
            .get("/pulls/1", 200, &json!({
                "number": 1, "state": "open", "mergeable": mergeable, "mergeable_state": state,
                "head": {"sha": "s"}
            }).to_string())
            .get("/check-runs", 200, &json!({"check_runs": []}).to_string())
            .get("/status", 200, &json!({"statuses": []}).to_string());
            build(ForgeKind::GitHub, "https://github.com", fake)
                .status("acme/web", 1)
                .unwrap()
                .mergeable
        };
    assert_eq!(gh(json!(true), "clean"), Mergeable::Clean);
    assert_eq!(gh(json!(false), "dirty"), Mergeable::Conflict);
    assert_eq!(gh(json!(true), "blocked"), Mergeable::Blocked);
    assert_eq!(gh(json!(true), "behind"), Mergeable::Blocked);
    assert_eq!(gh(Value::Null, "unknown"), Mergeable::Unknown);

    let gl = |extra: Value| {
        let fake = Arc::new(FakeHttp::new());
        let mut mr = json!({"iid": 1, "state": "opened"});
        mr.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        fake.get("/merge_requests/1", 200, &mr.to_string());
        build(ForgeKind::GitLab, "https://gitlab.com", fake)
            .status("acme/web", 1)
            .unwrap()
            .mergeable
    };
    assert_eq!(gl(json!({"has_conflicts": true})), Mergeable::Conflict);
    assert_eq!(
        gl(json!({"merge_status": "can_be_merged"})),
        Mergeable::Clean
    );
    assert_eq!(gl(json!({"merge_status": "checking"})), Mergeable::Unknown);
    assert_eq!(
        gl(json!({"detailed_merge_status": "not_approved"})),
        Mergeable::Blocked
    );
}

#[test]
fn a_merged_or_closed_pull_request_is_reported_as_such() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/pulls/1/reviews", 200, "[]")
        .get("/pulls/1", 200, &json!({
            "number": 1, "state": "closed", "merged_at": "2026-10-29T10:00:00Z", "head": {"sha": "s"}
        }).to_string())
        .get("/check-runs", 200, &json!({"check_runs": []}).to_string())
        .get("/status", 200, &json!({"statuses": []}).to_string());
    let st = build(ForgeKind::GitHub, "https://github.com", fake)
        .status("acme/web", 1)
        .unwrap();
    assert_eq!(st.state, PullState::Merged);

    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/merge_requests/1",
        200,
        &json!({"iid": 1, "state": "closed"}).to_string(),
    );
    let st = build(ForgeKind::GitLab, "https://gitlab.com", fake)
        .status("acme/web", 1)
        .unwrap();
    assert_eq!(st.state, PullState::Closed);
    assert_eq!(st.ci, CiState::None);
}

#[test]
fn a_graphql_error_is_an_error_and_no_token_shows_in_it() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/pulls/12", 200, &gh_pull(true)).post(
        "/graphql",
        "",
        200,
        &json!({"errors": [{"message": format!("Resource not accessible {SECRET}")}]}).to_string(),
    );
    let api = build(ForgeKind::GitHub, "https://github.com", fake);
    let err = api.mark_ready("acme/web", 12).unwrap_err();
    assert!(matches!(err, ForgeError::Rejected(_)));
    assert!(!err.to_string().contains(SECRET));
}

#[test]
fn a_repository_name_that_climbs_out_is_refused_before_any_request() {
    for c in cases() {
        assert!(c.api.find_pull("../x", "b").is_err(), "{}", c.name);
        assert!(c.fake.requests().is_empty(), "{}", c.name);
    }
}

// ---- create a remote repository (add-connections T006)

#[test]
fn a_private_repository_is_created_on_each_forge() {
    // GitHub: the account itself uses /user/repos, an organization its own route.
    let fake = Arc::new(FakeHttp::new());
    let repo = json!({"full_name": "acme/new", "html_url": "u", "default_branch": "main",
        "permissions": {"push": true}})
    .to_string();
    fake.get("/user", 200, r#"{"login":"me"}"#)
        .post("/orgs/acme/repos", "\"private\":true", 201, &repo)
        .post("/user/repos", "\"name\":\"mine\"", 201, &repo);
    let gh = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    let made = gh.create_repo("acme/new").unwrap();
    assert_eq!(
        (made.slug.as_str(), made.can_push),
        ("acme/new", Some(true))
    );
    gh.create_repo("me/mine").unwrap();
    let posts: Vec<String> = fake
        .requests()
        .into_iter()
        .filter(|r| r.method == Method::Post)
        .map(|r| r.url)
        .collect();
    assert_eq!(posts.len(), 2);
    assert!(posts[0].ends_with("/orgs/acme/repos") && posts[1].ends_with("/user/repos"));

    // GitLab: the namespace id comes first, the project is private.
    let fake = Arc::new(FakeHttp::new());
    fake.get("/namespaces/acme%2Fteam", 200, r#"{"id":42}"#)
        .post(
            "/projects",
            "\"namespace_id\":42",
            201,
            r#"{"path_with_namespace":"acme/team/new","web_url":"u","default_branch":"main"}"#,
        );
    let gl = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    assert_eq!(
        gl.create_repo("acme/team/new").unwrap().slug,
        "acme/team/new"
    );
    let sent = fake
        .requests()
        .into_iter()
        .find(|r| r.method == Method::Post)
        .and_then(|r| r.body)
        .unwrap();
    assert_eq!(sent["visibility"], "private");

    // Azure DevOps: the project is in the path.
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/_apis/projects/Payments",
        200,
        r#"{"visibility":"private"}"#,
    )
    .post(
        "/Payments/_apis/git/repositories",
        "\"name\":\"new\"",
        201,
        r#"{"id":"r2","name":"new","project":{"name":"Payments"},"webUrl":"u"}"#,
    );
    let az = build(ForgeKind::AzureDevOps, "https://dev.azure.com/acme", fake);
    assert_eq!(az.create_repo("Payments/new").unwrap().slug, "Payments/new");
}

#[test]
fn a_bad_slug_or_a_refusal_creates_nothing() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/user", 200, r#"{"login":"me"}"#).post(
        "/orgs/acme/repos",
        "",
        422,
        r#"{"message":"name exists"}"#,
    );
    let gh = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    assert!(gh.create_repo("web").is_err(), "no owner");
    assert!(gh.create_repo("acme/../x").is_err());
    assert!(gh.create_repo("acme/new").is_err(), "the forge refuses");
    assert!(
        fake.requests()
            .iter()
            .filter(|r| r.method == Method::Post)
            .count()
            == 1,
        "only the refused call went out"
    );
}

#[test]
fn a_namespace_with_no_id_and_a_public_azure_project_create_nothing() {
    let fake = Arc::new(FakeHttp::new());
    // The create calls answer: only the check can stop the call.
    let made = r#"{"path_with_namespace":"acme/new","web_url":"u","name":"new","webUrl":"u"}"#;
    fake.get("/namespaces/acme", 200, r#"{"name":"acme"}"#)
        .post("/projects", "", 201, made)
        .post("/Open/_apis/git/repositories", "", 201, made);
    let gl = build(ForgeKind::GitLab, "https://gitlab.com", fake.clone());
    assert!(gl.create_repo("acme/new").is_err());

    fake.get("/_apis/projects/Open", 200, r#"{"visibility":"public"}"#);
    let az = build(
        ForgeKind::AzureDevOps,
        "https://dev.azure.com/acme",
        fake.clone(),
    );
    let e = az.create_repo("Open/new").unwrap_err().to_string();
    assert!(e.contains("public"), "{e}");
    assert!(
        fake.requests().iter().all(|r| r.method != Method::Post),
        "no repository was written"
    );
}

#[test]
fn general_comments_are_read_oldest_first_and_no_system_note_or_line_comment_is_one() {
    for c in cases() {
        let got = c.api.issue_comments(c.repo, c.number).unwrap();
        let bodies: Vec<&str> = got.iter().map(|g| g.body.as_str()).collect();
        assert_eq!(bodies, ["first", "second"], "{}", c.name);
        assert!(
            got.iter()
                .all(|g| !g.id.is_empty() && !g.author.is_empty() && !g.created.is_empty()),
            "{} {got:?}",
            c.name
        );
        let ids: std::collections::HashSet<_> = got.iter().map(|g| &g.id).collect();
        assert_eq!(ids.len(), got.len(), "{}", c.name);
    }
}

fn gh_comment(n: u64) -> Value {
    json!({"id": n, "user": {"login": "u"}, "body": format!("c{n}"), "created_at": "t"})
}

/// A GitHub fake with `total` comments in pages of 100 and a `Link` header with the last page.
fn gh_comments(total: u64) -> (Arc<FakeHttp>, Box<dyn PullApi>) {
    let fake = Arc::new(FakeHttp::new());
    let last = total.div_ceil(100).max(1);
    // Descending: `&page=1` is a prefix of `&page=10`.
    for page in (1..=last).rev() {
        let from = (page - 1) * 100 + 1;
        let body: Vec<Value> = (from..=total.min(from + 99)).map(gh_comment).collect();
        let link = format!(r#"<https://api.github.com/x?per_page=100&page={last}>; rel="last""#);
        fake.get_with(
            &format!("/issues/12/comments?per_page=100&page={page}"),
            200,
            &[("Link", link.as_str())],
            &json!(body).to_string(),
        );
    }
    fake.post(
        "/graphql",
        "reviewThreads",
        200,
        &json!({"data": {"repository": {"pullRequest": {"reviewThreads": {"nodes": []}}}}})
            .to_string(),
    );
    let api = build(ForgeKind::GitHub, "https://github.com", fake.clone());
    (fake, api)
}

#[test]
fn github_general_comments_follow_the_pages() {
    let (fake, api) = gh_comments(101);
    let talk = api.conversation("acme/web", 12).unwrap();
    assert_eq!(talk.comments.len(), 101);
    assert_eq!(talk.comments[100].body, "c101");
    assert!(!talk.comments_truncated);
    // Page 1 once, page 2 once.
    let reads = fake
        .requests()
        .into_iter()
        .filter(|r| r.method == Method::Get);
    assert_eq!(reads.count(), 2);
}

#[test]
fn github_general_comments_keep_the_newest_pages_and_say_so() {
    // 1,200 comments make 12 pages. The 10 newest pages are 3 to 12.
    let (fake, api) = gh_comments(1200);
    let talk = api.conversation("acme/web", 12).unwrap();
    assert!(talk.comments_truncated);
    let got = talk.comments;
    assert_eq!(got.len(), 1000);
    assert_eq!(
        (got[0].body.as_str(), got[999].body.as_str()),
        ("c201", "c1200")
    );
    assert!(fake.requests().iter().all(|r| !r.url.contains("&page=2")));
}

fn gh_thread(id: &str, total: u64, shown: u64) -> Value {
    let nodes: Vec<Value> = (0..shown)
        .map(|i| json!({"id": format!("{id}c{i}"), "author": {"login": "a"}, "body": "b", "createdAt": "t"}))
        .collect();
    json!({"id": id, "isResolved": false, "path": "a.rs", "line": 1,
        "comments": {"totalCount": total, "nodes": nodes}})
}

fn gh_threads(pages: &[(Vec<Value>, bool)]) -> Box<dyn PullApi> {
    let fake = Arc::new(FakeHttp::new());
    // The cursor of the page that was read decides the answer.
    for (i, (nodes, more)) in pages.iter().enumerate().rev() {
        let after = if i == 0 {
            "\"after\":null".to_string()
        } else {
            format!("\"after\":\"P{i}\"")
        };
        fake.post(
            "/graphql",
            &after,
            200,
            &json!({"data": {"repository": {"pullRequest": {"reviewThreads": {
                "pageInfo": {"hasNextPage": more, "endCursor": format!("P{}", i + 1)},
                "nodes": nodes}}}}})
            .to_string(),
        );
    }
    fake.get("/issues/12/comments", 200, "[]");
    build(ForgeKind::GitHub, "https://github.com", fake)
}

#[test]
fn a_github_thread_with_more_comments_than_shown_says_so() {
    let api = gh_threads(&[(vec![gh_thread("T1", 80, 50), gh_thread("T2", 2, 2)], false)]);
    let talk = api.conversation("acme/web", 12).unwrap();
    assert!(!talk.threads_truncated);
    let totals: Vec<(usize, u32)> = talk
        .threads
        .iter()
        .map(|t| (t.comments.len(), t.comments_total))
        .collect();
    assert_eq!(totals, [(50, 80), (2, 2)]);
}

#[test]
fn github_threads_are_paged_to_three_pages_and_say_so() {
    let page = |n: usize| {
        (0..100)
            .map(|i| gh_thread(&format!("T{n}-{i}"), 1, 1))
            .collect::<Vec<_>>()
    };
    // Two pages: all read, no flag.
    let api = gh_threads(&[(page(0), true), (page(1), false)]);
    let talk = api.conversation("acme/web", 12).unwrap();
    assert_eq!((talk.threads.len(), talk.threads_truncated), (200, false));
    // Four pages on offer: three read, flag set.
    let api = gh_threads(&[
        (page(0), true),
        (page(1), true),
        (page(2), true),
        (page(3), false),
    ]);
    let talk = api.conversation("acme/web", 12).unwrap();
    assert_eq!((talk.threads.len(), talk.threads_truncated), (300, true));
}

#[test]
fn a_thread_is_reopened_and_the_reply_goes_to_the_right_place() {
    for c in cases() {
        let id = c
            .api
            .threads(c.repo, c.number)
            .unwrap()
            .into_iter()
            .find(|t| !t.resolved)
            .unwrap()
            .id;
        c.api.reply_thread(c.repo, c.number, &id, "Why?").unwrap();
        c.api.resolve_thread(c.repo, c.number, &id, false).unwrap();
        let (reply, reopen) = match c.name {
            "github" => (
                c.sent(Method::Post, "/graphql"),
                c.sent(Method::Post, "/graphql"),
            ),
            "gitlab" => (
                c.sent(Method::Post, "/discussions/d1/notes"),
                c.sent(Method::Put, "/discussions/d1"),
            ),
            _ => (
                c.sent(Method::Post, "/threads/3/comments"),
                c.sent(Method::Patch, "/threads/3"),
            ),
        };
        let flat = |v: &[Value]| v.iter().map(Value::to_string).collect::<String>();
        assert!(flat(&reply).contains("Why?"), "{} {reply:?}", c.name);
        let wanted = match c.name {
            "github" => "unresolveReviewThread",
            "gitlab" => r#""resolved":false"#,
            _ => r#""status":"active""#,
        };
        assert!(flat(&reopen).contains(wanted), "{} {reopen:?}", c.name);
    }
}

/// A GitLab fake with `notes` merge request notes, newest first, in pages of 100. The ones with an
/// id up to `system_to` and an even id are system notes.
fn gl_notes(total: u64, system_to: u64) -> Box<dyn PullApi> {
    let fake = Arc::new(FakeHttp::new());
    let root = "/api/v4/projects/acme%2Fweb/merge_requests/9";
    let pages = total.div_ceil(100);
    for page in (1..=pages).rev() {
        let hi = total - (page - 1) * 100;
        let body: Vec<Value> = (hi.saturating_sub(99).max(1)..=hi)
            .rev()
            .map(|id| {
                json!({"id": id, "body": format!("n{id}"), "author": {"username": "u"},
                "system": id <= system_to && id % 2 == 0, "resolvable": false, "created_at": "t"})
            })
            .collect();
        let next = if page < pages {
            (page + 1).to_string()
        } else {
            String::new()
        };
        fake.get_with(
            &format!("{root}/notes?per_page=100&page={page}&"),
            200,
            &[("x-next-page", next.as_str())],
            &json!(body).to_string(),
        );
    }
    fake.get(&format!("{root}/discussions"), 200, "[]");
    build(ForgeKind::GitLab, "https://gitlab.com", fake)
}

#[test]
fn gitlab_notes_are_read_newest_first_system_notes_are_dropped_and_all_comments_show() {
    // 250 notes, 120 of them system notes: 130 comments, none lost.
    let talk = gl_notes(250, 240).conversation("acme/web", 9).unwrap();
    assert!(!talk.comments_truncated);
    assert_eq!(talk.comments.len(), 130);
    let ids: Vec<u64> = talk
        .comments
        .iter()
        .map(|c| c.id.parse().unwrap())
        .collect();
    assert!(ids.windows(2).all(|w| w[0] < w[1]), "oldest first");
    assert_eq!((ids[0], ids[129]), (1, 250));
}

#[test]
fn gitlab_notes_stop_at_ten_pages_keep_the_newest_and_say_so() {
    let talk = gl_notes(1100, 0).conversation("acme/web", 9).unwrap();
    assert!(talk.comments_truncated);
    assert_eq!(talk.comments.len(), 1000);
    assert_eq!(talk.comments[0].body, "n101");
    assert_eq!(talk.comments[999].body, "n1100");
}

#[test]
fn azure_reads_the_threads_once_for_the_whole_conversation() {
    let c = azure();
    let talk = c.api.conversation(c.repo, c.number).unwrap();
    assert_eq!((talk.threads.len(), talk.comments.len()), (1, 2));
    let reads = c
        .fake
        .requests()
        .into_iter()
        .filter(|r| r.url.contains("/threads"))
        .count();
    assert_eq!(reads, 1);
}

#[test]
fn a_refusal_of_the_forge_reaches_the_caller_unchanged() {
    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "/graphql",
        "addPullRequestReviewThreadReply",
        200,
        &json!({"errors": [{"message": "Could not resolve to a node with the global id of 'T9'"}]})
            .to_string(),
    );
    let api = build(ForgeKind::GitHub, "https://github.com", fake);
    let e = api.reply_thread("acme/web", 12, "T9", "hi").unwrap_err();
    assert_eq!(
        e.to_string(),
        "Could not resolve to a node with the global id of 'T9'"
    );
}
