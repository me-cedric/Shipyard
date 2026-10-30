//! Contract tests for the tracker writes (spec `work`, REQ-002, REQ-006, REQ-008, REQ-022, REQ-023,
//! REQ-026, REQ-029). A fake `Http` answers; no test uses the network.

use serde_json::Value;
use shipyard_core::work::*;
use shipyard_core::work_item::TrackerKind;
use shipyard_http::fake::FakeHttp;
use shipyard_http::{Error as HttpError, Method};
use shipyard_secrets::Secret;
use shipyard_trackers::work::*;
use shipyard_trackers::{Capability, TrackerConfig, TrackerError, WorkItem};
use std::sync::Arc;

fn writer(kind: TrackerKind, url: &str, fake: &Arc<FakeHttp>) -> Box<dyn TrackerWrite> {
    let config = TrackerConfig {
        kind,
        url: url.into(),
        user: Some("ada@example.com".into()),
    };
    connect_write(&config, Secret::new("tok-write-secret"), fake.clone()).expect("connect")
}

fn jira(kind: TrackerKind, fake: &Arc<FakeHttp>) -> Box<dyn TrackerWrite> {
    writer(kind, "https://jira.example.com", fake)
}

fn github(fake: &Arc<FakeHttp>) -> Box<dyn TrackerWrite> {
    writer(TrackerKind::GitHubIssues, "https://github.com", fake)
}

fn sent(fake: &FakeHttp, method: Method) -> Vec<(String, String)> {
    fake.requests()
        .into_iter()
        .filter(|r| r.method == method)
        .map(|r| (r.url, r.body.map(|b| b.to_string()).unwrap_or_default()))
        .collect()
}

fn writes(fake: &FakeHttp) -> usize {
    fake.requests()
        .iter()
        .filter(|r| r.method != Method::Get)
        .count()
}

// ---- assign (REQ-006)

#[test]
fn jira_cloud_assigns_by_account_id_and_data_center_by_name() {
    let fake = Arc::new(FakeHttp::new());
    fake.put("/rest/api/2/issue/PROJ-1/assignee", "accountId", 204, "");
    jira(TrackerKind::JiraCloud, &fake)
        .assign("PROJ-1", "acc-9")
        .unwrap();
    let put = sent(&fake, Method::Put);
    assert_eq!(put[0].1, r#"{"accountId":"acc-9"}"#);

    let fake = Arc::new(FakeHttp::new());
    fake.put(
        "/rest/api/2/issue/PROJ-1/assignee",
        r#""name":"ada""#,
        204,
        "",
    );
    jira(TrackerKind::JiraDataCenter, &fake)
        .assign("PROJ-1", "ada")
        .unwrap();
    assert_eq!(writes(&fake), 1);
}

#[test]
fn github_assigns_through_the_issue() {
    let fake = Arc::new(FakeHttp::new());
    fake.patch(
        "/repos/acme/web/issues/5",
        r#"{"assignees":["ada"]}"#,
        200,
        "{}",
    );
    github(&fake).assign("acme/web#5", "ada").unwrap();
    assert!(
        sent(&fake, Method::Patch)[0]
            .0
            .starts_with("https://api.github.com/repos/acme/web/issues/5")
    );
}

#[test]
fn a_refusal_of_the_tracker_reaches_the_caller_and_the_secret_does_not() {
    let fake = Arc::new(FakeHttp::new());
    fake.put("/assignee", "", 403, "no permission");
    let err = jira(TrackerKind::JiraCloud, &fake)
        .assign("PROJ-1", "x")
        .unwrap_err();
    assert!(matches!(
        err,
        TrackerError::Http(HttpError::Status { status: 403, .. })
    ));
    assert!(!format!("{err:?}").contains("tok-write-secret"));
}

// ---- label (REQ-008)

#[test]
fn the_pickup_label_is_added_without_replacing_the_others() {
    let fake = Arc::new(FakeHttp::new());
    fake.put("/rest/api/2/issue/PROJ-1", "", 204, "");
    jira(TrackerKind::JiraCloud, &fake)
        .add_label("PROJ-1", "shipyard")
        .unwrap();
    assert_eq!(
        sent(&fake, Method::Put)[0].1,
        r#"{"update":{"labels":[{"add":"shipyard"}]}}"#
    );

    let fake = Arc::new(FakeHttp::new());
    fake.post(
        "/repos/acme/web/issues/5/labels",
        r#"{"labels":["shipyard"]}"#,
        200,
        "[]",
    );
    github(&fake).add_label("acme/web#5", "shipyard").unwrap();
    assert_eq!(writes(&fake), 1);
}

// ---- ticket edit (Q-123)

#[test]
fn a_label_is_removed_and_a_priority_is_set_where_the_tracker_has_them() {
    let fake = Arc::new(FakeHttp::new());
    fake.put("/rest/api/2/issue/PROJ-1", "", 204, "");
    let w = jira(TrackerKind::JiraCloud, &fake);
    w.remove_label("PROJ-1", "old").unwrap();
    w.set_priority("PROJ-1", "high").unwrap();
    let puts = sent(&fake, Method::Put);
    assert_eq!(puts[0].1, r#"{"update":{"labels":[{"remove":"old"}]}}"#);
    assert_eq!(puts[1].1, r#"{"fields":{"priority":{"name":"High"}}}"#);
    assert!(matches!(
        w.set_priority("PROJ-1", "urgent"),
        Err(TrackerError::Config(_))
    ));

    let fake = Arc::new(FakeHttp::new());
    fake.delete("/repos/acme/web/issues/5/labels/old", 200, "[]");
    let w = github(&fake);
    w.remove_label("acme/web#5", "old").unwrap();
    assert_eq!(writes(&fake), 1);
    // GitHub has no priority field: nothing is sent.
    assert!(matches!(
        w.set_priority("acme/web#5", "high"),
        Err(TrackerError::Refused(_))
    ));
    assert_eq!(writes(&fake), 1);
}

// ---- transition (REQ-002)

const TRANSITIONS: &str = r#"{"transitions":[
  {"id":"11","name":"Start","to":{"name":"In Progress"}},
  {"id":"31","name":"Finish","to":{"name":"Done"}}]}"#;

#[test]
fn a_transition_finds_the_id_by_the_target_status() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/issue/PROJ-1/transitions", 200, TRANSITIONS)
        .post("/issue/PROJ-1/transitions", r#""id":"31""#, 204, "");
    jira(TrackerKind::JiraCloud, &fake)
        .transition("PROJ-1", "done")
        .unwrap();
    assert_eq!(
        sent(&fake, Method::Post)[0].1,
        r#"{"transition":{"id":"31"}}"#
    );
}

#[test]
fn a_transition_the_workflow_does_not_offer_is_refused_and_sends_nothing() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/issue/PROJ-1/transitions", 200, TRANSITIONS);
    let err = jira(TrackerKind::JiraCloud, &fake)
        .transition("PROJ-1", "Archived")
        .unwrap_err();
    match err {
        TrackerError::Refused(why) => assert!(why.contains("In Progress, Done"), "{why}"),
        other => panic!("{other:?}"),
    }
    assert_eq!(writes(&fake), 0);
}

#[test]
fn a_400_on_the_transition_is_a_refusal_with_the_reason() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/issue/PROJ-1/transitions", 200, TRANSITIONS)
        .post(
            "/issue/PROJ-1/transitions",
            "",
            400,
            r#"{"errors":{"resolution":"Resolution is required"}}"#,
        );
    let err = jira(TrackerKind::JiraCloud, &fake)
        .transition("PROJ-1", "Done")
        .unwrap_err();
    assert!(
        matches!(&err, TrackerError::Refused(why) if why.contains("Resolution is required")),
        "{err:?}"
    );
}

#[test]
fn github_has_two_states_and_refuses_the_rest_without_a_request() {
    let fake = Arc::new(FakeHttp::new());
    fake.patch(
        "/repos/acme/web/issues/5",
        r#"{"state":"closed"}"#,
        200,
        "{}",
    );
    let w = github(&fake);
    w.transition("acme/web#5", "Closed").unwrap();
    assert!(matches!(
        w.transition("acme/web#5", "In Review"),
        Err(TrackerError::Refused(_))
    ));
    assert_eq!(writes(&fake), 1);
}

// ---- worklog (REQ-022, REQ-023)

fn entry(worklog: Option<&str>) -> TimeEntry {
    TimeEntry {
        id: "e1".into(),
        day: "2026-10-29".into(),
        minutes: 90,
        note: "review of the login".into(),
        ticket: Some("PROJ-1".into()),
        worklog: worklog.map(String::from),
    }
}

const POSTED: &str = r#"{"id":"10234","timeSpentSeconds":5400,"comment":"x","started":"2026-10-29T09:00:00.000+0100"}"#;

#[test]
fn a_worklog_carries_the_mark_the_anchored_start_and_the_choice_on_the_remaining_estimate() {
    for (reduce, adjust) in [
        (true, "adjustEstimate=auto"),
        (false, "adjustEstimate=leave"),
    ] {
        let fake = Arc::new(FakeHttp::new());
        fake.get("/issue/PROJ-1/worklog", 200, r#"{"worklogs":[]}"#)
            .post("/issue/PROJ-1/worklog", "", 201, POSTED);
        let out = send_worklog(
            &*jira(TrackerKind::JiraCloud, &fake),
            &Click::by_person(),
            &entry(None),
            60,
            reduce,
        )
        .unwrap();
        let Sent::Sent(log) = out else {
            panic!("{out:?}")
        };
        assert_eq!(log.id, "10234");
        let (url, body) = &sent(&fake, Method::Post)[0];
        assert!(url.contains(adjust), "{url}");
        let v: Value = serde_json::from_str(body).unwrap();
        assert_eq!(v["timeSpentSeconds"], 5400);
        assert_eq!(v["started"], "2026-10-29T09:00:00.000+0100");
        let note = v["comment"].as_str().unwrap();
        assert!(
            note.starts_with("review of the login") && parse_mark(note).as_deref() == Some("e1")
        );
    }
}

#[test]
fn the_start_anchors_at_nine_in_the_offset_of_the_machine() {
    assert_eq!(
        started_at("2026-10-29", 60).unwrap(),
        "2026-10-29T09:00:00.000+0100"
    );
    assert_eq!(
        started_at("2026-10-29", -330).unwrap(),
        "2026-10-29T09:00:00.000-0530"
    );
    assert_eq!(
        started_at("2026-10-29", 0).unwrap(),
        "2026-10-29T09:00:00.000+0000"
    );
    assert!(started_at("29/10/2026", 0).is_err());
}

#[test]
fn a_lost_response_is_named_and_the_next_send_finds_the_worklog_by_its_mark() {
    // The first send: the lookup is empty, the post fails on the wire.
    let fake = Arc::new(FakeHttp::new());
    fake.get("/issue/PROJ-1/worklog", 200, r#"{"worklogs":[]}"#);
    let err = send_worklog(
        &*jira(TrackerKind::JiraCloud, &fake),
        &Click::by_person(),
        &entry(None),
        0,
        true,
    )
    .unwrap_err();
    assert!(matches!(err, TrackerError::Lost(_)), "{err:?}");

    // The next send: the tracker holds the worklog with the mark. Nothing goes out.
    let held = format!(
        r#"{{"worklogs":[{{"id":"10234","timeSpentSeconds":5400,"comment":{},"started":"s"}}]}}"#,
        serde_json::to_string(&worklog_note("review", "e1")).unwrap()
    );
    let fake = Arc::new(FakeHttp::new());
    fake.get("/issue/PROJ-1/worklog", 200, &held);
    let out = send_worklog(
        &*jira(TrackerKind::JiraCloud, &fake),
        &Click::by_person(),
        &entry(None),
        0,
        true,
    )
    .unwrap();
    assert!(matches!(out, Sent::AlreadyThere(l) if l.id == "10234" && l.minutes == 90));
    assert_eq!(
        writes(&fake),
        0,
        "a lost response never causes a second worklog"
    );
}

#[test]
fn no_worklog_goes_out_when_the_lookup_fails() {
    let fake = Arc::new(FakeHttp::new()); // no route: the lookup fails on the wire
    let err = send_worklog(
        &*jira(TrackerKind::JiraCloud, &fake),
        &Click::by_person(),
        &entry(None),
        0,
        true,
    )
    .unwrap_err();
    assert!(
        matches!(err, TrackerError::Http(HttpError::Transport(_))),
        "{err:?}"
    );
    assert_eq!(writes(&fake), 0);
}

#[test]
fn an_entry_with_a_receipt_and_an_entry_with_no_ticket_are_not_sent() {
    let fake = Arc::new(FakeHttp::new());
    let w = jira(TrackerKind::JiraCloud, &fake);
    let click = Click::by_person();
    assert!(matches!(
        send_worklog(&*w, &click, &entry(Some("10234")), 0, true),
        Err(TrackerError::Refused(_))
    ));
    let mut none = entry(None);
    none.ticket = None;
    assert!(matches!(
        send_worklog(&*w, &click, &none, 0, true),
        Err(TrackerError::Config(_))
    ));
    assert!(fake.requests().is_empty());
}

#[test]
fn a_tracker_without_time_tracking_is_refused_before_any_request() {
    let fake = Arc::new(FakeHttp::new());
    let err =
        send_worklog(&*github(&fake), &Click::by_person(), &entry(None), 0, true).unwrap_err();
    assert!(matches!(
        err,
        TrackerError::Unsupported(Capability::TimeTracking)
    ));
    assert!(fake.requests().is_empty());
}

#[test]
fn the_worklogs_of_a_ticket_are_read_with_their_notes() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/issue/PROJ-1/worklog",
        200,
        r#"{"worklogs":[{"id":"1","timeSpentSeconds":1800,"comment":"by hand","started":"s"},{"id":"2","timeSpentSeconds":3600}]}"#,
    );
    let logs = jira(TrackerKind::JiraDataCenter, &fake)
        .worklogs("PROJ-1")
        .unwrap();
    assert_eq!(
        (logs[0].id.as_str(), logs[0].minutes, logs[0].note.as_str()),
        ("1", 30, "by hand")
    );
    assert_eq!((logs[1].minutes, logs[1].note.as_str()), (60, ""));
}

// ---- apply (REQ-026)

fn sheet() -> Sheet {
    Sheet {
        name: "Lot".into(),
        currency: "EUR".into(),
        margin_rate: 0.0,
        features: vec![Feature {
            id: "login".into(),
            name: "Login".into(),
            description: "Sign in".into(),
            tasks: vec![
                Task {
                    id: "a".into(),
                    name: "Build".into(),
                    role: "dev".into(),
                    days: Some(2.0),
                    ..Task::default()
                },
                Task {
                    id: "b".into(),
                    name: "Test".into(),
                    role: "qa".into(),
                    days: Some(1.0),
                    ..Task::default()
                },
            ],
        }],
    }
}

fn preview(mirror: &[WorkItem]) -> Vec<DiffRow> {
    plan_diff(rows("lot", &sheet()), mirror)
}

const NO_ISSUES: &str = r#"{"issues":[]}"#;

#[test]
fn apply_creates_the_epic_first_then_the_stories_under_it() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/search/jql", 200, NO_ISSUES)
        .post(
            "/rest/api/2/issue",
            r#""name":"Epic""#,
            201,
            r#"{"id":"1","key":"PROJ-10"}"#,
        )
        .post(
            "/rest/api/2/issue",
            r#""key":"PROJ-10""#,
            201,
            r#"{"id":"2","key":"PROJ-11"}"#,
        );
    let results = apply(&*jira(TrackerKind::JiraCloud, &fake), "PROJ", &preview(&[]));
    assert_eq!(results.len(), 3);
    assert!(results.iter().all(|r| r.error.is_none()), "{results:?}");
    assert_eq!(results[0].key.as_deref(), Some("PROJ-10"));
    assert_eq!(results[1].key.as_deref(), Some("PROJ-11"));

    let posts = sent(&fake, Method::Post);
    let epic: Value = serde_json::from_str(&posts[0].1).unwrap();
    assert_eq!(epic["fields"]["labels"][0], "est:lot#login");
    assert_eq!(epic["fields"]["project"]["key"], "PROJ");
    assert!(
        epic["fields"].get("timetracking").is_none(),
        "an epic has no estimate"
    );
    let story: Value = serde_json::from_str(&posts[1].1).unwrap();
    assert_eq!(story["fields"]["summary"], "Build");
    assert_eq!(story["fields"]["issuetype"]["name"], "Story");
    assert_eq!(story["fields"]["parent"]["key"], "PROJ-10");
    assert_eq!(story["fields"]["timetracking"]["originalEstimate"], "960m");
}

#[test]
fn apply_never_writes_the_status_or_the_assignee() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/search/jql", 200, NO_ISSUES).post(
        "/rest/api/2/issue",
        "",
        201,
        r#"{"key":"PROJ-10"}"#,
    );
    apply(&*jira(TrackerKind::JiraCloud, &fake), "PROJ", &preview(&[]));
    for (url, body) in fake
        .requests()
        .iter()
        .filter(|r| r.method != Method::Get)
        .map(|r| (r.url.clone(), r.body.clone().unwrap().to_string()))
    {
        for word in ["assignee", "status", "transition"] {
            assert!(
                !body.contains(word) && !url.contains(word),
                "{word} in {url} {body}"
            );
        }
    }
}

#[test]
fn a_failed_row_keeps_the_rows_already_written_and_a_child_of_a_failed_epic_is_not_sent() {
    // Story fails: the epic stays written, each story names its error.
    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/search/jql", 200, NO_ISSUES)
        .post(
            "/rest/api/2/issue",
            r#""name":"Epic""#,
            201,
            r#"{"key":"PROJ-10"}"#,
        )
        .post(
            "/rest/api/2/issue",
            "",
            400,
            r#"{"errors":{"summary":"bad"}}"#,
        );
    let results = apply(&*jira(TrackerKind::JiraCloud, &fake), "PROJ", &preview(&[]));
    assert_eq!(results[0].key.as_deref(), Some("PROJ-10"));
    assert!(results[0].error.is_none());
    assert!(results[1].error.as_deref().unwrap().contains("400"));
    assert!(results[2].error.is_some(), "the next row still runs");

    // Epic fails: no story is sent.
    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/search/jql", 200, NO_ISSUES)
        .post("/rest/api/2/issue", "", 400, "{}");
    let results = apply(&*jira(TrackerKind::JiraCloud, &fake), "PROJ", &preview(&[]));
    assert_eq!(sent(&fake, Method::Post).len(), 1);
    assert_eq!(results[1].error.as_deref(), Some("its epic has no ticket"));
}

const EXISTING: &str = r#"{"issues":[
 {"key":"PROJ-10","fields":{"summary":"Login","description":"Sign in","labels":["est:lot#login"],
   "issuetype":{"name":"Epic"},"status":{"name":"To Do","statusCategory":{"key":"new"}},"updated":"u"}},
 {"key":"PROJ-11","fields":{"summary":"Build","description":"","labels":["est:lot#a"],"parent":{"key":"PROJ-10"},
   "issuetype":{"name":"Story"},"status":{"name":"To Do","statusCategory":{"key":"new"}},"updated":"u",
   "timetracking":{"originalEstimateSeconds":57600}}},
 {"key":"PROJ-12","fields":{"summary":"Old title","description":"","labels":["est:lot#b"],"parent":{"key":"PROJ-10"},
   "issuetype":{"name":"Story"},"status":{"name":"To Do","statusCategory":{"key":"new"}},"updated":"u",
   "timetracking":{"originalEstimateSeconds":28800}}}
]}"#;

#[test]
fn a_second_apply_on_a_stale_preview_creates_no_duplicate() {
    // The preview still says "create" for every row (the mirror is behind), the tracker has them all.
    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/search/jql", 200, EXISTING).put(
        "/rest/api/2/issue/PROJ-12",
        "summary",
        204,
        "",
    );
    let results = apply(&*jira(TrackerKind::JiraCloud, &fake), "PROJ", &preview(&[]));
    assert_eq!(sent(&fake, Method::Post).len(), 0, "no create");
    assert_eq!(
        results.iter().map(|r| r.action).collect::<Vec<_>>(),
        [Action::Unchanged, Action::Unchanged, Action::Update]
    );
    assert_eq!(results[2].key.as_deref(), Some("PROJ-12"));
    // Only the changed field goes out.
    let put = &sent(&fake, Method::Put)[0];
    assert!(put.0.ends_with("/issue/PROJ-12"));
    assert_eq!(put.1, r#"{"fields":{"summary":"Test"}}"#);
}

#[test]
fn an_update_row_writes_the_changed_fields_only() {
    let item = |v: &str| -> WorkItem { serde_json::from_str(v).unwrap() };
    let mirror = vec![item(
        r#"{"key":"PROJ-12","title":"Test","description":"","kind":"story","status":{"name":"To Do","category":"todo"},
            "assignee":null,"labels":["est:lot#b"],"parent":null,"url":"","updated":"","time":{"estimate_minutes":60,"spent_minutes":null}}"#,
    )];
    let preview = plan_diff(rows("lot", &sheet()), &mirror);
    let row = preview
        .iter()
        .find(|d| d.row.reference == "est:lot#b")
        .unwrap();
    assert_eq!(row.action, Action::Update);
    assert_eq!(row.changes, [Field::Estimate]);
    let fake = Arc::new(FakeHttp::new());
    fake.put("/rest/api/2/issue/PROJ-12", "originalEstimate", 204, "");
    let out = apply(
        &*jira(TrackerKind::JiraCloud, &fake),
        "PROJ",
        std::slice::from_ref(row),
    );
    assert!(out[0].error.is_none(), "{out:?}");
    assert_eq!(
        sent(&fake, Method::Put)[0].1,
        r#"{"fields":{"timetracking":{"originalEstimate":"480m"}}}"#
    );
}

#[test]
fn data_center_without_an_epic_link_field_skips_the_parent_and_says_so() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/search?", 200, NO_ISSUES)
        .get("/rest/api/2/field", 200, "[]")
        .post("/rest/api/2/issue", "", 201, r#"{"key":"PROJ-10"}"#);
    let results = apply(
        &*jira(TrackerKind::JiraDataCenter, &fake),
        "PROJ",
        &preview(&[]),
    );
    assert_eq!(results[1].skipped, [Field::Parent]);
    assert!(!sent(&fake, Method::Post)[1].1.contains("parent"));
}

fn dc_fields(fake: &FakeHttp) -> &FakeHttp {
    fake.get(
        "/rest/api/2/field",
        200,
        include_str!("fixtures/jira/fields_dc.json"),
    )
}

#[test]
fn data_center_names_the_epic_and_links_the_story_through_the_epic_link_field() {
    let fake = Arc::new(FakeHttp::new());
    dc_fields(&fake)
        .get("/rest/api/2/search?", 200, NO_ISSUES)
        .post(
            "/rest/api/2/issue",
            r#""name":"Epic""#,
            201,
            r#"{"key":"PROJ-10"}"#,
        )
        .post("/rest/api/2/issue", "", 201, r#"{"key":"PROJ-11"}"#);
    let results = apply(
        &*jira(TrackerKind::JiraDataCenter, &fake),
        "PROJ",
        &preview(&[]),
    );
    assert!(
        results
            .iter()
            .all(|r| r.error.is_none() && r.skipped.is_empty()),
        "{results:?}"
    );
    let posts = sent(&fake, Method::Post);
    let epic: Value = serde_json::from_str(&posts[0].1).unwrap();
    assert_eq!(
        epic["fields"]["customfield_10101"], "Login",
        "Epic Name is required"
    );
    let story: Value = serde_json::from_str(&posts[1].1).unwrap();
    assert_eq!(story["fields"]["customfield_10100"], "PROJ-10", "Epic Link");
    assert!(
        story["fields"].get("parent").is_none()
            && story["fields"].get("customfield_10101").is_none()
    );
    let lookups = fake
        .requests()
        .iter()
        .filter(|r| r.url.contains("/field"))
        .count();
    assert_eq!(lookups, 1, "the field ids are read once for the connection");
}

#[test]
fn data_center_moves_a_story_to_another_epic_by_the_epic_link_field() {
    let fake = Arc::new(FakeHttp::new());
    dc_fields(&fake).put("/rest/api/2/issue/PROJ-11", "", 204, "");
    let done = jira(TrackerKind::JiraDataCenter, &fake)
        .update(
            "PROJ-11",
            &Fields {
                parent: Some("PROJ-12".into()),
                ..Fields::default()
            },
        )
        .unwrap();
    assert!(done.skipped.is_empty());
    assert_eq!(
        sent(&fake, Method::Put)[0].1,
        r#"{"fields":{"customfield_10100":"PROJ-12"}}"#
    );
}

#[test]
fn jira_cloud_never_reads_the_field_list_nor_names_the_epic() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/search/jql", 200, NO_ISSUES)
        .post(
            "/rest/api/2/issue",
            r#""name":"Epic""#,
            201,
            r#"{"key":"PROJ-10"}"#,
        )
        .post("/rest/api/2/issue", "", 201, r#"{"key":"PROJ-11"}"#);
    apply(&*jira(TrackerKind::JiraCloud, &fake), "PROJ", &preview(&[]));
    assert!(fake.requests().iter().all(|r| !r.url.contains("/field")));
    assert!(!sent(&fake, Method::Post)[0].1.contains("customfield"));
}

#[test]
fn jira_creates_with_the_issue_types_of_the_project() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/search/jql", 200, NO_ISSUES)
        .post(
            "/rest/api/2/issue",
            r#""name":"Initiative""#,
            201,
            r#"{"key":"PROJ-10"}"#,
        )
        .post(
            "/rest/api/2/issue",
            r#""name":"Récit""#,
            201,
            r#"{"key":"PROJ-11"}"#,
        );
    let w = jira(TrackerKind::JiraCloud, &fake);
    w.set_issue_types("Initiative", "Récit");
    apply(&*w, "PROJ", &preview(&[]));
    assert!(sent(&fake, Method::Post)[0].1.contains("Initiative"));
    assert!(sent(&fake, Method::Post)[1].1.contains("Récit"));
}

#[test]
fn a_flat_tracker_reports_what_it_cannot_hold() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/repos/acme/web/issues?", 200, "[]")
        .post(
            "/repos/acme/web/issues",
            r#""title":"Login""#,
            201,
            r#"{"number":7}"#,
        )
        .post(
            "/repos/acme/web/issues",
            r#""title":"Build""#,
            201,
            r#"{"number":8}"#,
        )
        .post(
            "/repos/acme/web/issues",
            r#""title":"Test""#,
            201,
            r#"{"number":9}"#,
        );
    let results = apply(&*github(&fake), "acme/web", &preview(&[]));
    assert_eq!(results[1].key.as_deref(), Some("acme/web#8"));
    assert_eq!(results[1].skipped, [Field::Estimate, Field::Parent]);
    assert!(results[0].skipped.is_empty());
    let body = &sent(&fake, Method::Post)[1].1;
    assert!(body.contains("est:lot#a") && !body.contains("parent") && !body.contains("estimate"));
}

#[test]
fn the_preview_of_a_flat_tracker_does_not_ask_for_an_estimate_it_cannot_hold() {
    let caps = TrackerKind::GitHubIssues.capabilities();
    let item: WorkItem = serde_json::from_str(
        r#"{"key":"acme/web#8","title":"Build","description":"","kind":"task","status":{"name":"open","category":"todo"},
            "assignee":null,"labels":["est:lot#a"],"parent":null,"url":"","updated":"","time":null}"#,
    )
    .unwrap();
    let d = diff(&caps, rows("lot", &sheet()), std::slice::from_ref(&item));
    assert_eq!(
        d.iter()
            .find(|r| r.row.reference == "est:lot#a")
            .unwrap()
            .action,
        Action::Unchanged
    );
    let rich = diff(
        &TrackerKind::JiraCloud.capabilities(),
        rows("lot", &sheet()),
        &[item],
    );
    assert_eq!(
        rich.iter()
            .find(|r| r.row.reference == "est:lot#a")
            .unwrap()
            .action,
        Action::Update
    );
}

// ---- one item from a ref (REQ-029)

fn from_ref() -> Row {
    Row {
        reference: "spec:auth#REQ-001".into(),
        kind: RowKind::Story,
        title: "Sign in".into(),
        description: "The person signs in.".into(),
        days: None,
        parent: None,
    }
}

#[test]
fn one_click_creates_one_item_with_the_ref_as_its_label_and_a_second_click_creates_none() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/search/jql", 200, NO_ISSUES).post(
        "/rest/api/2/issue",
        "",
        201,
        r#"{"key":"PROJ-20"}"#,
    );
    let w = jira(TrackerKind::JiraCloud, &fake);
    let first = create_from_ref(&*w, "PROJ", from_ref(), &[]);
    assert_eq!(
        (first.action, first.key.as_deref()),
        (Action::Create, Some("PROJ-20"))
    );
    let body: Value = serde_json::from_str(&sent(&fake, Method::Post)[0].1).unwrap();
    assert_eq!(body["fields"]["labels"][0], "spec:auth#REQ-001");

    // The mirror has the item now.
    let item: WorkItem = serde_json::from_str(
        r#"{"key":"PROJ-20","title":"Sign in","description":"The person signs in.","kind":"story",
            "status":{"name":"To Do","category":"todo"},"assignee":null,"labels":["spec:auth#REQ-001"],
            "parent":null,"url":"","updated":"","time":null}"#,
    )
    .unwrap();
    let fake = Arc::new(FakeHttp::new());
    let second = create_from_ref(
        &*jira(TrackerKind::JiraCloud, &fake),
        "PROJ",
        from_ref(),
        &[item],
    );
    assert_eq!(
        (second.action, second.key.as_deref()),
        (Action::Unchanged, Some("PROJ-20"))
    );
    assert!(
        fake.requests().is_empty(),
        "nothing is sent for an item that exists"
    );
}

#[test]
fn jira_cloud_needs_the_email_as_for_reads() {
    let config = TrackerConfig {
        kind: TrackerKind::JiraCloud,
        url: "https://a.atlassian.net".into(),
        user: None,
    };
    let fake = Arc::new(FakeHttp::new());
    assert!(connect_write(&config, Secret::new("t"), fake).is_err());
}
