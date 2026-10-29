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
         "comments": {"nodes": [{"author": {"login": "rev"}, "body": "rename"}, {"author": {"login": "bot"}, "body": "ok"}]}},
        {"id": "T2", "isResolved": true, "path": null, "line": null, "comments": {"nodes": []}}
    ]}}}}}).to_string())
    .post("/graphql", "addPullRequestReviewThreadReply", 200, &json!({"data": {"addPullRequestReviewThreadReply": {"comment": {"id": "C1"}}}}).to_string())
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
             "system": false, "position": {"new_path": "src/a.rs", "new_line": 10}}]},
        {"id": "d2", "individual_note": true, "notes": [
            {"id": 2, "body": "hello", "author": {"username": "rev"}, "resolvable": false, "resolved": false, "system": false}]},
        {"id": "d3", "individual_note": false, "notes": [
            {"id": 3, "body": "done", "author": {"username": "rev"}, "resolvable": true, "resolved": true, "system": false}]}
    ]).to_string())
    .post(&format!("{root}/merge_requests/9/discussions/d1/notes"), "", 201, "{}")
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
         "comments": [{"id": 1, "content": "rename", "author": {"displayName": "rev"}, "commentType": "text"}],
         "threadContext": {"filePath": "/src/a.rs", "rightFileStart": {"line": 10}}},
        {"id": 4, "status": "fixed", "comments": [{"id": 1, "content": "x", "author": {"displayName": "rev"}, "commentType": "text"}]},
        {"id": 6, "status": "active", "comments": [{"id": 1, "content": "joined", "author": {"displayName": "sys"}, "commentType": "system"}]}
    ]}).to_string())
    .post(&format!("{root}/pullrequests/5/threads/3/comments"), "\"content\"", 201, "{}")
    .patch(&format!("{root}/pullrequests/5/threads/3"), "\"status\":\"fixed\"", 200, "{}")
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
        c.api.resolve_thread(c.repo, c.number, &id).unwrap();
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
