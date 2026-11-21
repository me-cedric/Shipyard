//! Releases (spec `code-host-tickets`, REQ-004): a release is the version of the issue tracker.
//! Jira: the fix version. GitHub and GitLab: the milestone. Azure DevOps: the iteration. Linear:
//! the project. A fake `Http` answers; no test uses the network.

use serde_json::{Value, json};
use shipyard_core::work_item::TrackerKind;
use shipyard_http::fake::FakeHttp;
use shipyard_http::{Method, Request};
use shipyard_secrets::Secret;
use shipyard_trackers::work::*;
use shipyard_trackers::{Tracker, TrackerConfig, TrackerError, connect};
use std::sync::Arc;

fn config(kind: TrackerKind, url: &str) -> TrackerConfig {
    TrackerConfig {
        kind,
        url: url.into(),
        user: Some("ada@example.com".into()),
    }
}

fn writer(kind: TrackerKind, url: &str, fake: &Arc<FakeHttp>) -> Box<dyn TrackerWrite> {
    connect_write(
        &config(kind, url),
        Secret::new("tok-release-secret"),
        fake.clone(),
    )
    .unwrap()
}

fn reader(kind: TrackerKind, url: &str, fake: &Arc<FakeHttp>) -> Box<dyn Tracker> {
    connect(
        &config(kind, url),
        Secret::new("tok-release-secret"),
        fake.clone(),
    )
    .unwrap()
}

fn writes(fake: &FakeHttp) -> Vec<Request> {
    fake.requests()
        .into_iter()
        .filter(|r| r.method != Method::Get)
        .collect()
}

fn body(r: &Request) -> Value {
    r.body.clone().unwrap_or(Value::Null)
}

// ---- Jira: the fix version

#[test]
fn jira_reads_the_first_fix_version_lists_the_versions_and_sets_one() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/rest/api/2/issue/PROJ-1",
        200,
        &json!({"key": "PROJ-1", "fields": {
            "summary": "s", "issuetype": {"name": "Story"}, "status": {"name": "To Do"},
            "fixVersions": [{"name": "MVP 1"}, {"name": "MVP 2"}], "labels": []
        }})
        .to_string(),
    )
    .get(
        "/rest/api/2/project/PROJ/versions",
        200,
        &json!([{"name": "MVP 1"}, {"name": "MVP 2", "released": true}]).to_string(),
    )
    .put("/rest/api/2/issue/PROJ-1", "", 204, "");
    let item = reader(TrackerKind::JiraCloud, "https://jira.example.com", &fake)
        .get("PROJ-1")
        .unwrap();
    assert_eq!(item.release.as_deref(), Some("MVP 1"));
    let w = writer(TrackerKind::JiraCloud, "https://jira.example.com", &fake);
    assert_eq!(w.releases("PROJ").unwrap(), ["MVP 1", "MVP 2"]);
    w.set_release("PROJ-1", Some("MVP 1")).unwrap();
    w.set_release("PROJ-1", None).unwrap();
    let sent = writes(&fake);
    assert_eq!(
        body(&sent[0]),
        json!({"fields": {"fixVersions": [{"name": "MVP 1"}]}})
    );
    assert_eq!(body(&sent[1]), json!({"fields": {"fixVersions": []}}));
}

// ---- GitHub and GitLab: the milestone

#[test]
fn github_reads_the_milestone_and_sets_it_by_number() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/repos/acme/web/issues/5",
        200,
        &json!({"number": 5, "title": "t", "state": "open", "labels": [],
                "repository_url": "https://api.github.com/repos/acme/web",
                "milestone": {"title": "MVP 1", "number": 3}})
        .to_string(),
    )
    .get(
        "/repos/acme/web/milestones",
        200,
        &json!([{"title": "MVP 1", "number": 3}, {"title": "MVP 2", "number": 4}]).to_string(),
    )
    .patch("/repos/acme/web/issues/5", "", 200, "{}");
    let item = reader(TrackerKind::GitHubIssues, "https://github.com", &fake)
        .get("acme/web#5")
        .unwrap();
    assert_eq!(item.release.as_deref(), Some("MVP 1"));
    let w = writer(TrackerKind::GitHubIssues, "https://github.com", &fake);
    assert_eq!(w.releases("acme/web").unwrap(), ["MVP 1", "MVP 2"]);
    w.set_release("acme/web#5", Some("MVP 2")).unwrap();
    w.set_release("acme/web#5", None).unwrap();
    let sent = writes(&fake);
    assert_eq!(body(&sent[0]), json!({"milestone": 4}));
    assert_eq!(body(&sent[1]), json!({"milestone": null}));
    // A release that the issue tracker lacks is refused and nothing is sent.
    let before = writes(&fake).len();
    assert!(matches!(
        w.set_release("acme/web#5", Some("Nope")),
        Err(TrackerError::Refused(_))
    ));
    assert_eq!(writes(&fake).len(), before);
}

#[test]
fn gitlab_reads_the_milestone_and_sets_it_by_id() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/projects/acme%2Fweb/issues/12",
        200,
        &json!({"iid": 12, "title": "t", "state": "opened", "labels": [],
                "references": {"full": "acme/web#12"}, "milestone": {"title": "MVP 1", "id": 77}})
        .to_string(),
    )
    .get(
        "/projects/acme%2Fweb/milestones",
        200,
        &json!([{"title": "MVP 1", "id": 77}, {"title": "MVP 2", "id": 78}]).to_string(),
    )
    .put("/projects/acme%2Fweb/issues/12", "", 200, "{}");
    let item = reader(TrackerKind::GitLabIssues, "https://gitlab.com", &fake)
        .get("acme/web#12")
        .unwrap();
    assert_eq!(item.release.as_deref(), Some("MVP 1"));
    let w = writer(TrackerKind::GitLabIssues, "https://gitlab.com", &fake);
    assert_eq!(w.releases("acme/web").unwrap(), ["MVP 1", "MVP 2"]);
    w.set_release("acme/web#12", Some("MVP 2")).unwrap();
    w.set_release("acme/web#12", None).unwrap();
    let sent = writes(&fake);
    assert_eq!(body(&sent[0]), json!({"milestone_id": 78}));
    assert_eq!(body(&sent[1]), json!({"milestone_id": 0}));
}

// ---- Azure DevOps: the iteration

#[test]
fn azure_reads_the_iteration_and_sets_its_path() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/_apis/work/teamsettings/iterations",
        200,
        &json!({"value": [
            {"name": "MVP 1", "path": "Web\\MVP 1"}, {"name": "MVP 2", "path": "Web\\MVP 2"}
        ]})
        .to_string(),
    )
    .get(
        "/_apis/wit/workitems/412",
        200,
        &json!({"id": 412, "fields": {
            "System.Title": "t", "System.WorkItemType": "Bug", "System.State": "New",
            "System.TeamProject": "Web", "System.IterationPath": "Web\\MVP 1"
        }, "_links": {"html": {"href": "u"}}})
        .to_string(),
    )
    .patch("/_apis/wit/workitems/412", "", 200, "{}");
    let item = reader(
        TrackerKind::AzureDevOps,
        "https://dev.azure.com/acme",
        &fake,
    )
    .get("412")
    .unwrap();
    assert_eq!(item.release.as_deref(), Some("MVP 1"));
    let w = writer(
        TrackerKind::AzureDevOps,
        "https://dev.azure.com/acme",
        &fake,
    );
    assert_eq!(w.releases("Web").unwrap(), ["MVP 1", "MVP 2"]);
    w.set_release("412", Some("MVP 2")).unwrap();
    w.set_release("412", None).unwrap();
    let sent = writes(&fake);
    assert!(
        body(&sent[0])
            .to_string()
            .contains(r#""value":"Web\\MVP 2""#)
    );
    // No release: the iteration goes back to the root of the project.
    assert!(body(&sent[1]).to_string().contains(r#""value":"Web""#));
}

#[test]
fn an_azure_work_item_in_the_root_iteration_has_no_release() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/_apis/wit/workitems/9",
        200,
        &json!({"id": 9, "fields": {"System.Title": "t", "System.IterationPath": "Web"},
                "_links": {"html": {"href": "u"}}})
        .to_string(),
    );
    let item = reader(
        TrackerKind::AzureDevOps,
        "https://dev.azure.com/acme",
        &fake,
    )
    .get("9")
    .unwrap();
    assert_eq!(item.release, None);
}

// ---- Linear: the project

#[test]
fn linear_reads_the_project_lists_the_projects_and_sets_one() {
    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "/graphql",
        "projects(first",
        200,
        &json!({"data": {"projects": {"nodes": [
            {"id": "p1", "name": "MVP 1"}, {"id": "p2", "name": "MVP 2"}
        ]}}})
        .to_string(),
    )
    .post(
        "/graphql",
        "issue(id",
        200,
        &json!({"data": {"issue": {"id": "uuid-1"}}}).to_string(),
    )
    .post(
        "/graphql",
        "issueUpdate",
        200,
        &json!({"data": {"issueUpdate": {"success": true}}}).to_string(),
    );
    let w = writer(TrackerKind::Linear, "https://linear.app", &fake);
    assert_eq!(w.releases("ENG").unwrap(), ["MVP 1", "MVP 2"]);
    w.set_release("ENG-1", Some("MVP 2")).unwrap();
    w.set_release("ENG-1", None).unwrap();
    let updates: Vec<Value> = writes(&fake)
        .iter()
        .map(|r| body(r)["variables"].clone())
        .filter(|v| v.get("input").is_some())
        .collect();
    assert_eq!(updates[0]["input"], json!({"projectId": "p2"}));
    assert_eq!(updates[1]["input"], json!({"projectId": null}));
}

// ---- The types of ticket that the issue tracker holds (REQ-005 of `code-host-tickets`)

#[test]
fn each_issue_tracker_lists_its_types_of_ticket() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/rest/api/2/project/PROJ",
        200,
        &json!({"issueTypes": [{"name": "Story"}, {"name": "Spike"}]}).to_string(),
    );
    let w = writer(TrackerKind::JiraCloud, "https://jira.example.com", &fake);
    assert_eq!(w.issue_types("PROJ").unwrap(), ["Story", "Spike"]);

    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/Web/_apis/wit/workitemtypes",
        200,
        &json!({"value": [{"name": "Bug"}, {"name": "Spike"}]}).to_string(),
    );
    let w = writer(
        TrackerKind::AzureDevOps,
        "https://dev.azure.com/acme",
        &fake,
    );
    assert_eq!(w.issue_types("Web").unwrap(), ["Bug", "Spike"]);

    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/orgs/acme/issue-types",
        200,
        &json!([{"name": "Task"}, {"name": "Bug"}]).to_string(),
    );
    let w = writer(TrackerKind::GitHubIssues, "https://github.com", &fake);
    assert_eq!(w.issue_types("acme/web").unwrap(), ["Task", "Bug"]);
    // A repository of a person has no issue types: the list is empty, not an error.
    let none = Arc::new(FakeHttp::new());
    none.get("/orgs/ada/issue-types", 404, "{}");
    let w = writer(TrackerKind::GitHubIssues, "https://github.com", &none);
    assert!(w.issue_types("ada/web").unwrap().is_empty());

    let fake = Arc::new(FakeHttp::new());
    let w = writer(TrackerKind::GitLabIssues, "https://gitlab.com", &fake);
    assert_eq!(
        w.issue_types("acme/web").unwrap(),
        ["issue", "incident", "task"]
    );
    assert!(fake.requests().is_empty());
    // Linear has no type: Add refuses every kind there.
    let w = writer(TrackerKind::Linear, "https://linear.app", &fake);
    assert!(w.issue_types("ENG").unwrap().is_empty());
}
