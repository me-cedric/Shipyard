//! Contract tests for the writes of GitLab Issues, Azure DevOps and Linear (spec `work`, REQ-002,
//! REQ-006, REQ-008, REQ-022, REQ-023, REQ-026). A fake `Http` answers from recorded JSON; no test
//! uses the network. The comment calls are in `comments.rs`.

use serde_json::{Value, json};
use shipyard_core::work::*;
use shipyard_core::work_item::TrackerKind;
use shipyard_http::fake::FakeHttp;
use shipyard_http::{Error as HttpError, Method, Request};
use shipyard_secrets::Secret;
use shipyard_trackers::work::*;
use shipyard_trackers::{Capability, TrackerConfig, TrackerError};
use std::sync::Arc;

macro_rules! fx {
    ($path:literal) => {
        include_str!(concat!("fixtures/", $path))
    };
}

fn writer(kind: TrackerKind, url: &str, fake: &Arc<FakeHttp>) -> Box<dyn TrackerWrite> {
    let config = TrackerConfig {
        kind,
        url: url.into(),
        user: None,
    };
    connect_write(&config, Secret::new("tok-write-secret"), fake.clone()).expect("connect")
}

fn gitlab(fake: &Arc<FakeHttp>) -> Box<dyn TrackerWrite> {
    writer(TrackerKind::GitLabIssues, "https://gitlab.com", fake)
}

fn azure(fake: &Arc<FakeHttp>) -> Box<dyn TrackerWrite> {
    writer(TrackerKind::AzureDevOps, "https://dev.azure.com/acme", fake)
}

fn linear(fake: &Arc<FakeHttp>) -> Box<dyn TrackerWrite> {
    writer(TrackerKind::Linear, "https://linear.app", fake)
}

fn writes(fake: &FakeHttp) -> Vec<Request> {
    fake.requests()
        .into_iter()
        .filter(|r| r.method != Method::Get)
        .collect()
}

fn body(r: &Request) -> String {
    r.body.as_ref().map(ToString::to_string).unwrap_or_default()
}

fn variables(r: &Request) -> Value {
    r.body.as_ref().unwrap()["variables"].clone()
}

// ================================================================ GitLab Issues

const ISSUE: &str = "https://gitlab.com/api/v4/projects/acme%2Fweb/issues/12";

#[test]
fn gitlab_assigns_by_user_id_and_adds_a_label_without_replacing_the_others() {
    let fake = Arc::new(FakeHttp::new());
    fake.put("/projects/acme%2Fweb/issues/12", "", 200, "{}");
    let w = gitlab(&fake);
    w.assign("acme/web#12", "1").unwrap();
    w.add_label("acme/web#12", "shipyard").unwrap();
    let w_ = writes(&fake);
    assert_eq!(w_[0].url, ISSUE);
    assert_eq!(body(&w_[0]), r#"{"assignee_ids":[1]}"#);
    assert_eq!(body(&w_[1]), r#"{"add_labels":"shipyard"}"#);
    // A name is not an id, and a comma would split a label in two: nothing goes out.
    assert!(matches!(
        w.assign("acme/web#12", "ada"),
        Err(TrackerError::Config(_))
    ));
    assert!(matches!(
        w.add_label("acme/web#12", "a,b"),
        Err(TrackerError::Config(_))
    ));
    assert!(matches!(
        w.remove_label("acme/web#12", "a,b"),
        Err(TrackerError::Config(_))
    ));
    assert_eq!(writes(&fake).len(), 2);
    assert_eq!(fake.requests()[0].method, Method::Put);
}

#[test]
fn gitlab_has_two_states_and_refuses_the_rest_without_a_request() {
    let fake = Arc::new(FakeHttp::new());
    fake.put("/issues/12", r#""state_event":"close""#, 200, "{}")
        .put("/issues/12", r#""state_event":"reopen""#, 200, "{}");
    let w = gitlab(&fake);
    w.transition("acme/web#12", "Closed").unwrap();
    w.transition("acme/web#12", "opened").unwrap();
    assert!(matches!(
        w.transition("acme/web#12", "In Review"),
        Err(TrackerError::Refused(_))
    ));
    assert_eq!(writes(&fake).len(), 2);

    let fake = Arc::new(FakeHttp::new());
    fake.put("/issues/12", "", 400, r#"{"message":"cannot close"}"#);
    let err = gitlab(&fake)
        .transition("acme/web#12", "closed")
        .unwrap_err();
    assert!(
        matches!(&err, TrackerError::Refused(why) if why.contains("cannot close")),
        "{err:?}"
    );
}

fn entry() -> TimeEntry {
    TimeEntry {
        id: "e1".into(),
        day: "2026-10-29".into(),
        minutes: 90,
        note: "review of the login".into(),
        ticket: Some("acme/web#12".into()),
        worklog: None,
    }
}

#[test]
fn a_gitlab_worklog_is_sent_by_graphql_with_the_mark_and_the_anchored_day() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/projects/acme%2Fweb/issues/12",
        200,
        fx!("gitlab/issue.json"),
    )
    .post(
        "graphql",
        "timelogCreate",
        200,
        fx!("gitlab/timelog_created.json"),
    )
    .post(
        "graphql",
        "timelogs(first",
        200,
        fx!("gitlab/timelogs_empty.json"),
    );
    let out = send_worklog(&*gitlab(&fake), &Click::by_person(), &entry(), 60, true).unwrap();
    let Sent::Sent(log) = out else {
        panic!("{out:?}")
    };
    assert_eq!(
        (log.id.as_str(), log.minutes),
        ("gid://gitlab/Timelog/9", 90)
    );
    let create = fake
        .requests()
        .into_iter()
        .find(|r| body(r).contains("timelogCreate"))
        .unwrap();
    assert!(create.url.ends_with("/api/graphql"), "{}", create.url);
    let input = &variables(&create)["input"];
    assert_eq!(input["issuableId"], "gid://gitlab/Issue/8012");
    assert_eq!(input["timeSpent"], "90m");
    assert_eq!(input["spentAt"], "2026-10-29T09:00:00.000+01:00");
    let note = input["summary"].as_str().unwrap();
    assert!(note.starts_with("review of the login") && parse_mark(note).as_deref() == Some("e1"));
}

#[test]
fn a_gitlab_worklog_found_by_its_mark_is_not_sent_again() {
    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "graphql",
        "timelogs(first",
        200,
        fx!("gitlab/timelogs_marked.json"),
    );
    let out = send_worklog(&*gitlab(&fake), &Click::by_person(), &entry(), 0, true).unwrap();
    assert!(matches!(out, Sent::AlreadyThere(l) if l.id.ends_with("/4") && l.minutes == 90));
    assert!(
        fake.requests()
            .iter()
            .all(|r| !body(r).contains("timelogCreate"))
    );
}

#[test]
fn a_refused_gitlab_worklog_names_the_reason() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/projects/acme%2Fweb/issues/12",
        200,
        fx!("gitlab/issue.json"),
    )
    .post(
        "graphql",
        "timelogCreate",
        200,
        r#"{"data":{"timelogCreate":{"timelog":null,"errors":["Time spent must be positive"]}}}"#,
    );
    let w = gitlab(&fake);
    let log = NewWorklog {
        minutes: 0,
        note: "x",
        started: "2026-10-29T09:00:00.000+0000",
        reduce_remaining: false,
    };
    let err = w
        .add_worklog(&Click::by_person(), "acme/web#12", &log)
        .unwrap_err();
    assert!(
        matches!(&err, TrackerError::Refused(why) if why.contains("positive")),
        "{err:?}"
    );
}

#[test]
fn gitlab_creates_an_issue_with_the_label_and_sets_the_estimate_in_minutes() {
    let fake = Arc::new(FakeHttp::new());
    fake.post("/issues/14/time_estimate", "960m", 200, "{}")
        .post(
            "/projects/acme%2Fweb/issues",
            r#""title":"Build""#,
            201,
            fx!("gitlab/issue_created.json"),
        );
    let made = gitlab(&fake)
        .create(
            "acme/web",
            false,
            &Fields {
                title: Some("Build".into()),
                description: Some("d".into()),
                days: Some(2.0),
                parent: Some("acme/web#1".into()),
            },
            "est:lot#a",
        )
        .unwrap();
    assert_eq!(made.key, "acme/web#14");
    assert_eq!(made.skipped, [Field::Parent]);
    let w_ = writes(&fake);
    assert_eq!(
        body(&w_[0]),
        r#"{"description":"d","labels":"est:lot#a","title":"Build"}"#
    );
    assert!(w_[1].url.ends_with("/issues/14/time_estimate"));
}

#[test]
fn a_gitlab_update_writes_the_changed_fields_only() {
    let fake = Arc::new(FakeHttp::new());
    fake.put("/issues/12", "", 200, "{}");
    gitlab(&fake)
        .update(
            "acme/web#12",
            &Fields {
                title: Some("New".into()),
                ..Fields::default()
            },
        )
        .unwrap();
    assert_eq!(body(&writes(&fake)[0]), r#"{"title":"New"}"#);
}

#[test]
fn gitlab_and_azure_set_the_type_and_the_due_date_and_linear_the_due_date_only() {
    let fake = Arc::new(FakeHttp::new());
    fake.put("/issues/12", "", 200, "{}");
    let w = gitlab(&fake);
    w.set_issue_type("acme/web#12", "Incident").unwrap();
    w.set_due_date("acme/web#12", Some("2026-11-30")).unwrap();
    w.set_due_date("acme/web#12", None).unwrap();
    let sent = writes(&fake);
    assert_eq!(body(&sent[0]), r#"{"issue_type":"incident"}"#);
    assert_eq!(body(&sent[1]), r#"{"due_date":"2026-11-30"}"#);
    assert_eq!(body(&sent[2]), r#"{"due_date":""}"#);

    let fake = Arc::new(FakeHttp::new());
    fake.patch("/_apis/wit/workitems/412", "", 200, "{}");
    let w = azure(&fake);
    w.set_issue_type("412", "Bug").unwrap();
    w.set_due_date("412", Some("2026-11-30")).unwrap();
    w.set_due_date("412", None).unwrap();
    let p = patches(&fake);
    assert!(body(&p[0]).contains("System.WorkItemType"));
    assert!(body(&p[1]).contains(r#""value":"2026-11-30""#));
    assert!(body(&p[2]).contains(r#""op":"remove""#));

    let fake = Arc::new(FakeHttp::new());
    assert!(matches!(
        linear(&fake).set_issue_type("ENG-1", "Bug"),
        Err(TrackerError::Refused(_))
    ));
    assert!(writes(&fake).is_empty());
}

fn sheet() -> Sheet {
    Sheet {
        name: "Lot".into(),
        currency: "EUR".into(),
        margin_rate: 0.0,
        features: vec![Feature {
            id: "login".into(),
            name: "Login".into(),
            description: "Sign in".into(),
            tasks: vec![Task {
                id: "a".into(),
                name: "Build".into(),
                role: "dev".into(),
                days: Some(2.0),
                ..Task::default()
            }],
        }],
    }
}

#[test]
fn an_apply_on_gitlab_creates_flat_issues_and_says_the_parent_was_skipped() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/projects/acme%2Fweb/issues?", 200, "[]")
        .post("/time_estimate", "960m", 200, "{}")
        .post(
            "/projects/acme%2Fweb/issues",
            r#""title":"Login""#,
            201,
            r#"{"iid":7}"#,
        )
        .post(
            "/projects/acme%2Fweb/issues",
            r#""title":"Build""#,
            201,
            r#"{"iid":8}"#,
        );
    let preview = plan_diff(rows("lot", &sheet()), &[]);
    let out = apply(&*gitlab(&fake), "acme/web", &preview);
    assert!(out.iter().all(|r| r.error.is_none()), "{out:?}");
    assert_eq!(out[1].key.as_deref(), Some("acme/web#8"));
    assert_eq!(out[1].skipped, [Field::Parent]);
    assert!(out[0].skipped.is_empty());
}

// ================================================================ Azure DevOps

const WORKITEM: &str = "https://dev.azure.com/acme/_apis/wit/workitems/412?api-version=7.1";

fn patches(fake: &FakeHttp) -> Vec<Request> {
    fake.requests()
        .into_iter()
        .filter(|r| r.method == Method::Patch)
        .collect()
}

#[test]
fn azure_patches_with_a_json_patch_document_and_its_content_type() {
    let fake = Arc::new(FakeHttp::new());
    fake.patch("/_apis/wit/workitems/412", "", 200, "{}");
    azure(&fake).assign("412", "ada@example.com").unwrap();
    let p = &patches(&fake)[0];
    assert_eq!(p.url, WORKITEM);
    assert_eq!(
        body(p),
        r#"[{"op":"add","path":"/fields/System.AssignedTo","value":"ada@example.com"}]"#
    );
    assert!(
        p.headers
            .iter()
            .any(|(n, v)| *n == "Content-Type" && v == "application/json-patch+json")
    );
}

#[test]
fn azure_adds_a_tag_to_the_others_and_guards_the_revision() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "workitems/412?fields=System.Tags&",
        200,
        fx!("azure/item_tags.json"),
    )
    .patch("/_apis/wit/workitems/412", "", 200, "{}");
    let w = azure(&fake);
    w.add_label("412", "shipyard").unwrap();
    assert_eq!(
        body(&patches(&fake)[0]),
        r#"[{"op":"test","path":"/rev","value":7},{"op":"add","path":"/fields/System.Tags","value":"bug; web; shipyard"}]"#
    );
    // A tag that is there already, in another case: no write.
    w.add_label("412", "WEB").unwrap();
    assert_eq!(patches(&fake).len(), 1);
    assert!(matches!(
        w.add_label("412", "a;b"),
        Err(TrackerError::Config(_))
    ));
}

#[test]
fn azure_sets_the_state_and_a_rule_error_is_a_refusal_with_the_reason() {
    let fake = Arc::new(FakeHttp::new());
    fake.patch("/_apis/wit/workitems/412", "Closed", 200, "{}");
    azure(&fake).transition("412", "Closed").unwrap();
    assert_eq!(
        body(&patches(&fake)[0]),
        r#"[{"op":"add","path":"/fields/System.State","value":"Closed"}]"#
    );

    let fake = Arc::new(FakeHttp::new());
    fake.patch(
        "/_apis/wit/workitems/412",
        "",
        400,
        r#"{"message":"TF401320: Rule Error for field State."}"#,
    );
    let err = azure(&fake).transition("412", "Done").unwrap_err();
    assert!(
        matches!(&err, TrackerError::Refused(why) if why.contains("TF401320")),
        "{err:?}"
    );
}

#[test]
fn azure_cannot_hold_a_worklog_entry_and_sends_nothing() {
    let fake = Arc::new(FakeHttp::new());
    let w = azure(&fake);
    let mut e = entry();
    e.ticket = Some("412".into());
    let err = send_worklog(&*w, &Click::by_person(), &e, 0, true).unwrap_err();
    assert!(
        matches!(err, TrackerError::Unsupported(Capability::TimeTracking)),
        "{err:?}"
    );
    assert!(fake.requests().is_empty());
}

#[test]
fn azure_creates_a_story_of_the_type_that_the_project_has_and_reads_the_types_once() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/Payments/_apis/wit/workitemtypes",
        200,
        fx!("azure/types.json"),
    )
    .post(
        "/Payments/_apis/wit/workitems/$User%20Story",
        "",
        200,
        fx!("azure/created.json"),
    );
    let w = azure(&fake);
    let f = Fields {
        title: Some("Build <it>".into()),
        description: Some("a & b\nc".into()),
        days: Some(2.0),
        parent: Some("400".into()),
    };
    let made = w.create("Payments", false, &f, "est:lot#a").unwrap();
    assert_eq!(made.key, "500");
    assert!(made.skipped.is_empty());
    w.create("Payments", false, &f, "est:lot#b").unwrap();
    let types = fake
        .requests()
        .iter()
        .filter(|r| r.url.contains("workitemtypes"))
        .count();
    assert_eq!(types, 1, "the type is kept for the project");

    let post = fake
        .requests()
        .into_iter()
        .find(|r| r.method == Method::Post)
        .unwrap();
    let ops: Vec<Value> = serde_json::from_str(&body(&post)).unwrap();
    let by = |path: &str| ops.iter().find(|o| o["path"] == path).unwrap()["value"].clone();
    assert_eq!(by("/fields/System.Title"), "Build <it>");
    assert_eq!(by("/fields/System.Description"), "a &amp; b<br>c");
    assert_eq!(
        by("/fields/Microsoft.VSTS.Scheduling.OriginalEstimate"),
        json!(16.0)
    );
    assert_eq!(by("/fields/System.Tags"), "est:lot#a");
    assert_eq!(
        by("/relations/-"),
        json!({"rel": "System.LinkTypes.Hierarchy-Reverse", "url": "https://dev.azure.com/acme/_apis/wit/workItems/400"})
    );
}

#[test]
fn azure_creates_an_epic_with_no_type_lookup() {
    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "/Payments/_apis/wit/workitems/$Epic",
        "",
        200,
        fx!("azure/created.json"),
    );
    azure(&fake)
        .create(
            "Payments",
            true,
            &Fields {
                title: Some("Login".into()),
                ..Fields::default()
            },
            "est:lot#login",
        )
        .unwrap();
    assert_eq!(fake.requests().len(), 1);
}

#[test]
fn a_story_type_with_no_estimate_field_is_written_again_without_it_and_says_so() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/Payments/_apis/wit/workitemtypes",
        200,
        fx!("azure/types.json"),
    )
    .post(
        "/workitems/$User%20Story",
        "OriginalEstimate",
        400,
        r#"{"message":"The field 'Microsoft.VSTS.Scheduling.OriginalEstimate' does not exist"}"#,
    )
    .post(
        "/workitems/$User%20Story",
        "",
        200,
        fx!("azure/created.json"),
    );
    let made = azure(&fake)
        .create(
            "Payments",
            false,
            &Fields {
                title: Some("Build".into()),
                days: Some(1.0),
                ..Fields::default()
            },
            "l",
        )
        .unwrap();
    assert_eq!(
        (made.key.as_str(), made.skipped.as_slice()),
        ("500", [Field::Estimate].as_slice())
    );
    let last = fake.requests().pop().unwrap();
    assert!(!body(&last).contains("OriginalEstimate"));
}

#[test]
fn azure_moves_a_story_to_another_epic_by_removing_the_old_link_first() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("%24expand=relations", 200, fx!("azure/item_relations.json"))
        .patch("/_apis/wit/workitems/412", "", 200, "{}");
    let made = azure(&fake)
        .update(
            "412",
            &Fields {
                parent: Some("410".into()),
                ..Fields::default()
            },
        )
        .unwrap();
    assert!(made.skipped.is_empty());
    assert_eq!(
        body(&patches(&fake)[0]),
        r#"[{"op":"remove","path":"/relations/1"},{"op":"add","path":"/relations/-","value":{"rel":"System.LinkTypes.Hierarchy-Reverse","url":"https://dev.azure.com/acme/_apis/wit/workItems/410"}}]"#
    );
}

#[test]
fn an_azure_update_with_no_field_sends_nothing_and_a_crafted_id_never_reaches_the_url() {
    let fake = Arc::new(FakeHttp::new());
    let w = azure(&fake);
    w.update("412", &Fields::default()).unwrap();
    assert!(w.assign("412/../x", "a").is_err());
    assert!(fake.requests().is_empty());
}

// ================================================================ Linear

fn linear_fake() -> Arc<FakeHttp> {
    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "graphql",
        "issue(id: $id) { id }",
        200,
        fx!("linear/issue_id.json"),
    );
    fake
}

fn mutations(fake: &FakeHttp) -> Vec<Request> {
    fake.requests()
        .into_iter()
        .filter(|r| body(r).contains("mutation"))
        .collect()
}

#[test]
fn linear_assigns_by_user_id_through_the_issue_uuid() {
    let fake = linear_fake();
    fake.post(
        "graphql",
        "issueUpdate",
        200,
        r#"{"data":{"issueUpdate":{"success":true}}}"#,
    );
    linear(&fake).assign("ENG-42", "u1").unwrap();
    let m = &mutations(&fake)[0];
    assert_eq!(
        variables(m),
        json!({"id": "uuid-ENG-42", "input": {"assigneeId": "u1"}})
    );
}

#[test]
fn linear_adds_a_label_that_exists_in_the_workspace_and_skips_one_the_issue_has() {
    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "graphql",
        "issueAddLabel",
        200,
        r#"{"data":{"issueAddLabel":{"success":true}}}"#,
    )
    .post(
        "graphql",
        "issueLabels(first",
        200,
        fx!("linear/label_found.json"),
    )
    .post(
        "graphql",
        "labels { nodes { name } }",
        200,
        fx!("linear/issue_labels.json"),
    );
    linear(&fake).add_label("ENG-42", "shipyard").unwrap();
    // The label of another team is not used: the workspace label is.
    assert_eq!(
        variables(&mutations(&fake)[0]),
        json!({"id": "uuid-ENG-42", "labelId": "lab-ws"})
    );

    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "graphql",
        "labels { nodes { name } }",
        200,
        fx!("linear/issue_labels_has.json"),
    );
    linear(&fake).add_label("ENG-42", "shipyard").unwrap();
    assert!(mutations(&fake).is_empty());
}

#[test]
fn linear_creates_the_label_when_no_team_can_use_one() {
    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "graphql",
        "issueAddLabel",
        200,
        r#"{"data":{"issueAddLabel":{"success":true}}}"#,
    )
    .post(
        "graphql",
        "issueLabelCreate",
        200,
        r#"{"data":{"issueLabelCreate":{"success":true,"issueLabel":{"id":"lab-new"}}}}"#,
    )
    .post(
        "graphql",
        "issueLabels(first",
        200,
        fx!("linear/label_none.json"),
    )
    .post(
        "graphql",
        "labels { nodes { name } }",
        200,
        fx!("linear/issue_labels.json"),
    );
    linear(&fake).add_label("ENG-42", "shipyard").unwrap();
    let m = mutations(&fake);
    assert_eq!(
        variables(&m[0])["input"],
        json!({"name": "shipyard", "teamId": "team-1"})
    );
    assert_eq!(variables(&m[1])["labelId"], "lab-new");
}

#[test]
fn linear_moves_to_a_state_of_the_team_and_refuses_one_it_has_not() {
    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "graphql",
        "issueUpdate",
        200,
        r#"{"data":{"issueUpdate":{"success":true}}}"#,
    )
    .post("graphql", "team { states", 200, fx!("linear/states.json"));
    let w = linear(&fake);
    w.transition("ENG-42", "done").unwrap();
    assert_eq!(
        variables(&mutations(&fake)[0]),
        json!({"id": "uuid-ENG-42", "input": {"stateId": "s3"}})
    );
    let err = w.transition("ENG-42", "Archived").unwrap_err();
    assert!(
        matches!(&err, TrackerError::Refused(why) if why.contains("Todo, In Progress, Done")),
        "{err:?}"
    );
    assert_eq!(mutations(&fake).len(), 1);
}

#[test]
fn a_mutation_that_linear_does_not_apply_is_a_refusal() {
    let fake = linear_fake();
    fake.post(
        "graphql",
        "issueUpdate",
        200,
        r#"{"data":{"issueUpdate":{"success":false}}}"#,
    );
    let err = linear(&fake).assign("ENG-42", "u1").unwrap_err();
    assert!(matches!(err, TrackerError::Refused(_)), "{err:?}");
}

#[test]
fn linear_has_no_worklog() {
    let fake = Arc::new(FakeHttp::new());
    let mut e = entry();
    e.ticket = Some("ENG-42".into());
    let err = send_worklog(&*linear(&fake), &Click::by_person(), &e, 0, true).unwrap_err();
    assert!(
        matches!(err, TrackerError::Unsupported(Capability::TimeTracking)),
        "{err:?}"
    );
    assert!(fake.requests().is_empty());
}

#[test]
fn linear_creates_an_issue_in_the_team_with_the_label_and_the_parent() {
    let fake = linear_fake();
    fake.post(
        "graphql",
        "issueCreate",
        200,
        fx!("linear/issue_created.json"),
    )
    .post(
        "graphql",
        "issueLabels(first",
        200,
        fx!("linear/label_found.json"),
    )
    .post("graphql", "teams(filter", 200, fx!("linear/teams.json"));
    let made = linear(&fake)
        .create(
            "ENG",
            false,
            &Fields {
                title: Some("Build".into()),
                description: Some("d".into()),
                days: Some(2.0),
                parent: Some("ENG-42".into()),
            },
            "est:lot#a",
        )
        .unwrap();
    assert_eq!(made.key, "ENG-77");
    assert_eq!(made.skipped, [Field::Estimate]);
    assert_eq!(
        variables(&mutations(&fake)[0])["input"],
        json!({"teamId": "team-1", "title": "Build", "description": "d", "labelIds": ["lab-ws"], "parentId": "uuid-ENG-42"})
    );
}

#[test]
fn linear_names_a_team_that_does_not_exist() {
    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "graphql",
        "teams(filter",
        200,
        r#"{"data":{"teams":{"nodes":[]}}}"#,
    );
    let err = linear(&fake)
        .create("NOPE", false, &Fields::default(), "l")
        .unwrap_err();
    assert!(matches!(err, TrackerError::NotFound(_)), "{err:?}");
    assert!(mutations(&fake).is_empty());
}

#[test]
fn linear_updates_the_changed_fields_only_and_a_transport_error_names_no_secret() {
    let fake = linear_fake();
    fake.post(
        "graphql",
        "issueUpdate",
        200,
        r#"{"data":{"issueUpdate":{"success":true}}}"#,
    );
    linear(&fake)
        .update(
            "ENG-42",
            &Fields {
                title: Some("New".into()),
                ..Fields::default()
            },
        )
        .unwrap();
    assert_eq!(
        variables(&mutations(&fake)[0])["input"],
        json!({"title": "New"})
    );

    let fake = Arc::new(FakeHttp::new());
    let err = linear(&fake).assign("ENG-42", "u1").unwrap_err();
    assert!(matches!(err, TrackerError::Http(HttpError::Transport(_))));
    assert!(!format!("{err:?}").contains("tok-write-secret"));
}
