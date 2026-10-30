//! Work commands over a fake tracker (spec `work` T011 and T012, REQ-003 to REQ-029). A memory
//! keychain and a fake HTTP client stand in for the world. No test uses the network.

use std::path::Path;
use std::sync::Arc;

use shipyard_core::pickup::Ticket;
use shipyard_core::work::{
    Action, Availability, Calendar, Decisions, Feature, Field, Member, Reason, Row, RowKind, Sheet,
    Span, Task, TaskDecision, Team, TimeState,
};
use shipyard_core::work_item::{Person, Status, StatusCategory, WorkItem, WorkKind};
use shipyard_http::{Method, fake::FakeHttp};
use shipyard_secrets::{MemoryStore, Secret};
use shipyard_store::project::{FileRead, read_project_file, write_project_file};
use shipyard_store::ref_query::State;

use super::*;
use crate::commands::sync::tracker_source;
use crate::commands::{projects, refs};
use crate::connections::{ConnectionDraft, ConnectionGroup, ConnectionKind, Connections};

const PASS: &str = "correct horse battery";

pub(crate) struct Fx {
    _data: tempfile::TempDir,
    pub(crate) repo: tempfile::TempDir,
    pub(crate) s: AppState,
    pub(crate) http: Arc<FakeHttp>,
    tracker: String,
    /// The mirror key of the tracker rows.
    source: String,
}

fn fx_with(kind: ConnectionKind, scope: Option<&str>) -> Fx {
    fx_wrapped(kind, scope, |http| http)
}

/// An `Http` that runs `hook` once, before the first write to the tracker: another writer touches
/// the files while the tracker answers.
struct Hooked {
    inner: Arc<FakeHttp>,
    hook: Mutex<Option<Box<dyn FnOnce() + Send>>>,
}

impl shipyard_http::Http for Hooked {
    fn send(
        &self,
        r: &shipyard_http::Request,
    ) -> Result<shipyard_http::Response, shipyard_http::Error> {
        if r.method == Method::Post
            && let Some(hook) = self.hook.lock().unwrap().take()
        {
            hook();
        }
        self.inner.send(r)
    }
}

fn fx_wrapped(
    kind: ConnectionKind,
    scope: Option<&str>,
    wrap: impl FnOnce(Arc<FakeHttp>) -> Arc<dyn shipyard_http::Http>,
) -> Fx {
    let repo = tempfile::tempdir().unwrap();
    shipyard_git::project::init(repo.path()).unwrap();
    let data = tempfile::tempdir().unwrap();
    let http = Arc::new(FakeHttp::new());
    let conns = Arc::new(Connections::new(
        data.path(),
        Arc::new(MemoryStore::default()),
        wrap(http.clone()),
    ));
    let c = conns
        .add(ConnectionDraft {
            name: "Tracker".into(),
            group: ConnectionGroup::Tracker,
            kind,
            url: if kind == ConnectionKind::GitHub {
                "https://github.com".into()
            } else {
                "https://jira.example.com".into()
            },
            user: Some("ana@acme.test".into()),
        })
        .unwrap();
    conns
        .set_secret(&c.id, Secret::new("tok-work-secret"))
        .unwrap();
    let s = AppState::with_connections(data.path().join("data"), conns);
    projects::open(&s, repo.path().to_str().unwrap()).unwrap();
    let FileRead::Valid(mut f) = read_project_file(repo.path()).unwrap() else {
        panic!("a valid file")
    };
    f.connections = Some(shipyard_core::project::ProjectConnections {
        tracker: Some(c.id.clone()),
        forge: None,
        tracker_scope: scope.map(String::from),
    });
    write_project_file(repo.path(), &f).unwrap();
    let a = active(&s).unwrap().unwrap();
    let source = tracker_source(&s, &a).unwrap().unwrap();
    Fx {
        _data: data,
        repo,
        s,
        http,
        tracker: c.id,
        source,
    }
}

pub(crate) fn fx() -> Fx {
    fx_with(ConnectionKind::JiraCloud, Some("PROJ"))
}

impl Fx {
    fn file(&self, rel: &str) -> String {
        std::fs::read_to_string(self.repo.path().join(rel)).unwrap_or_default()
    }

    fn exists(&self, rel: &str) -> bool {
        self.repo.path().join(rel).exists()
    }

    pub(crate) fn writes(&self) -> usize {
        self.http
            .requests()
            .iter()
            .filter(|r| r.method != Method::Get)
            .count()
    }

    pub(crate) fn item(&self, key: &str) -> WorkItem {
        self.s
            .sync
            .mirror()
            .unwrap()
            .ticket(&self.source, key)
            .unwrap()
            .unwrap()
            .item
    }

    pub(crate) fn put(&self, items: Vec<WorkItem>) {
        let tickets: Vec<Ticket> = items.into_iter().map(Ticket::new).collect();
        self.s
            .sync
            .mirror()
            .unwrap()
            .put_tickets(&self.source, &tickets)
            .unwrap();
    }
}

fn member(handle: &str, role: &str, skills: &[&str], rate: f64) -> Member {
    Member {
        name: handle.to_uppercase(),
        handle: handle.into(),
        trackers: vec![format!("acc-{handle}"), format!("{handle}@acme.test")],
        role: role.into(),
        capacity: 5.0,
        skills: skills.iter().map(|s| s.to_string()).collect(),
        day_rate: Some(rate),
        availability: Availability::default(),
    }
}

/// A team of five: two developers, a QA, a designer and a lead.
fn team5() -> Team {
    Team {
        members: vec![
            member("ana", "dev", &["api", "rust"], 500.0),
            member("bob", "dev", &["api", "web"], 480.0),
            member("cy", "qa", &["test"], 400.0),
            member("di", "design", &["ui"], 450.0),
            member("ed", "lead", &["api", "plan"], 700.0),
        ],
        locked: false,
    }
}

fn task(id: &str, name: &str, role: &str, days: f64) -> Task {
    Task {
        id: id.into(),
        name: name.into(),
        role: role.into(),
        days: Some(days),
        ..Task::default()
    }
}

/// The lot of the apply tests: one epic and two stories.
fn lot() -> Sheet {
    Sheet {
        name: "Lot".into(),
        currency: "EUR".into(),
        margin_rate: 0.1,
        features: vec![Feature {
            id: "login".into(),
            name: "Login".into(),
            description: "Sign in".into(),
            tasks: vec![task("a", "Build", "dev", 2.0), task("b", "Test", "qa", 1.0)],
        }],
    }
}

pub(crate) fn ticket(key: &str, title: &str, labels: &[&str]) -> WorkItem {
    WorkItem {
        key: key.into(),
        title: title.into(),
        description: String::new(),
        kind: WorkKind::Story,
        status: Status {
            name: "To Do".into(),
            category: StatusCategory::Todo,
        },
        assignee: None,
        labels: labels.iter().map(|l| l.to_string()).collect(),
        parent: None,
        url: format!("https://jira.example.com/browse/{key}"),
        updated: "2026-10-28T09:30:00.000+0000".into(),
        time: None,
    }
}

/// The Jira issue JSON that a refresh reads.
pub(crate) fn issue(
    key: &str,
    summary: &str,
    desc: &str,
    label: &str,
    parent: Option<&str>,
    secs: u32,
) -> String {
    let parent = parent.map_or(String::new(), |p| format!(r#""parent":{{"key":"{p}"}},"#));
    let time = if secs > 0 {
        format!(r#""timetracking":{{"originalEstimateSeconds":{secs}}},"#)
    } else {
        String::new()
    };
    format!(
        r#"{{"id":"1","key":"{key}","fields":{{"summary":"{summary}","description":"{desc}","labels":["{label}"],{parent}{time}
        "issuetype":{{"name":"Story"}},"status":{{"name":"To Do","statusCategory":{{"key":"new"}}}},"updated":"u"}}}}"#
    )
}

fn save_team(f: &Fx, team: Team) {
    team_save(&f.s, team).unwrap();
}

// ---------------------------------------------------------------- team (REQ-003, REQ-004)

#[test]
fn the_team_is_edited_as_text_and_a_duplicate_keeps_the_last_valid_team() {
    let f = fx();
    assert!(team_get(&f.s).unwrap().team.members.is_empty());
    save_team(&f, team5());
    assert!(f.file(".shipyard/team.yaml").contains("handle: ana"));

    // Edit: capacity 5 to 4.
    let mut t = team_get(&f.s).unwrap().team;
    t.members[0].capacity = 4.0;
    let back = team_save(&f.s, t.clone()).unwrap();
    assert_eq!(back.team.members[0].capacity, 4.0);
    assert!(f.file(".shipyard/team.yaml").contains("capacity: 4"));

    // A duplicate handle is refused and the file stays.
    let before = f.file(".shipyard/team.yaml");
    let mut dup = t.clone();
    dup.members[1].handle = "ana".into();
    let e = team_save(&f.s, dup).unwrap_err();
    assert!(e.contains("ana"), "{e}");
    assert_eq!(f.file(".shipyard/team.yaml"), before);

    // A file that was edited by hand into a duplicate: the view names it and keeps the last team.
    std::fs::write(
        f.repo.path().join(".shipyard/team.yaml"),
        before.replace("handle: bob", "handle: ana"),
    )
    .unwrap();
    let v = team_get(&f.s).unwrap();
    assert!(v.error.as_deref().is_some_and(|e| e.contains("ana")));
    assert_eq!(v.team.members.len(), 5);
    assert_eq!(v.team.members[1].handle, "bob");
}

#[test]
fn the_context_names_the_flags_the_scope_the_label_and_the_member_of_this_machine() {
    let f = fx();
    save_team(&f, team5());
    let c = context(&f.s, 0).unwrap();
    assert_eq!(c.tracker.as_deref(), Some(f.tracker.as_str()));
    assert_eq!(c.scope.as_deref(), Some("PROJ"));
    assert_eq!(c.pickup_label.as_deref(), Some("shipyard"));
    // The `user` of the connection is a tracker account of the member.
    assert_eq!(c.me.as_deref(), Some("ana"));
    assert!(c.capabilities.unwrap().time_tracking && c.capabilities.unwrap().assignee);
    assert_eq!(c.today.len(), 10);
    // GitHub has no time tracking.
    let g = fx_with(ConnectionKind::GitHub, None);
    assert!(
        !context(&g.s, 0)
            .unwrap()
            .capabilities
            .unwrap()
            .time_tracking
    );
}

// ---------------------------------------------------------------- suggestion (REQ-007)

#[test]
fn the_suggestion_ranks_by_skill_and_by_the_days_the_plan_books_and_assigns_nothing() {
    let f = fx();
    save_team(&f, team5());
    f.put(vec![ticket(
        "PROJ-5",
        "Add the export API",
        &["api", "shipyard"],
    )]);

    let ranked = suggest(&f.s, "PROJ-5").unwrap();
    // The pickup label is no skill. Members with the skill rank first.
    assert!(ranked[0].reasons.contains(&Reason::Skill {
        skill: "api".into()
    }));
    assert!(
        !ranked
            .iter()
            .flat_map(|r| &r.reasons)
            .any(|r| matches!(r, Reason::MissingSkill { skill } if skill == "shipyard"))
    );
    assert_eq!(ranked.len(), 5);

    // A five day task of the plan fills one developer for the week.
    sheet_save(
        &f.s,
        "lot",
        Sheet {
            features: vec![Feature {
                id: "f".into(),
                name: "F".into(),
                description: String::new(),
                tasks: vec![task("t", "T", "dev", 5.0)],
            }],
            ..lot()
        },
    )
    .unwrap();
    let ranked = suggest(&f.s, "PROJ-5").unwrap();
    let full = ranked
        .iter()
        .find(|r| r.reasons.contains(&Reason::Full))
        .unwrap();
    assert_eq!(full.handle, "ana", "the first developer takes the task");
    assert_ne!(ranked[0].handle, "ana", "the full member ranks below");
    assert!(
        ranked.iter().position(|r| r.handle == "ana")
            > ranked.iter().position(|r| r.handle == "bob")
    );
    assert_eq!(f.writes(), 0, "a suggestion writes nothing");
    assert!(f.item("PROJ-5").assignee.is_none());
    assert!(suggest(&f.s, "PROJ-404").is_err());
}

// ---------------------------------------------------------------- tracker writes by a person

#[test]
fn assign_sends_the_first_account_of_the_member_and_only_on_a_click() {
    let f = fx();
    save_team(&f, team5());
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    f.http
        .put("/rest/api/2/issue/PROJ-5/assignee", "acc-ana", 204, "")
        .get(
            "/rest/api/2/issue/PROJ-5",
            200,
            r#"{"key":"PROJ-5","fields":{"summary":"T","labels":[],"issuetype":{"name":"Story"},
               "status":{"name":"To Do","statusCategory":{"key":"new"}},
               "assignee":{"accountId":"acc-ana","displayName":"Ana"},"updated":"u"}}"#,
        );
    // No click, no write.
    assert!(assign(&f.s, "PROJ-5", "ana", false).is_err());
    assert_eq!(f.writes(), 0);
    // An unknown member and a member with no account are refused before a request.
    assert!(
        assign(&f.s, "PROJ-5", "zed", true)
            .unwrap_err()
            .contains("unknown member")
    );
    let mut t = team5();
    t.members[3].trackers.clear();
    save_team(&f, t);
    assert!(
        assign(&f.s, "PROJ-5", "di", true)
            .unwrap_err()
            .contains("no tracker account")
    );
    assert_eq!(f.writes(), 0);

    assign(&f.s, "PROJ-5", "ana", true).unwrap();
    assert_eq!(f.writes(), 1);
    // The mirror shows the new assignee at once, and the row names the member.
    assert_eq!(f.item("PROJ-5").assignee.unwrap().id, "acc-ana");
    let rows = crate::commands::sync::items(&f.s, &Default::default()).unwrap();
    assert_eq!(rows[0].member.as_deref(), Some("ana"));
}

#[test]
fn mark_adds_the_pickup_label_of_automation_yaml() {
    let f = fx();
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    f.http
        .put("/rest/api/2/issue/PROJ-5", "labels", 204, "")
        .get(
            "/rest/api/2/issue/PROJ-5",
            200,
            &issue("PROJ-5", "T", "", "shipyard", None, 0),
        );
    assert!(mark(&f.s, "PROJ-5", false).is_err());
    mark(&f.s, "PROJ-5", true).unwrap();
    let put = f
        .http
        .requests()
        .into_iter()
        .find(|r| r.method == Method::Put)
        .unwrap();
    assert_eq!(
        put.body.unwrap().to_string(),
        r#"{"update":{"labels":[{"add":"shipyard"}]}}"#
    );
    assert_eq!(f.item("PROJ-5").labels, ["shipyard"]);

    // A label that automation.yaml turned off cannot be added.
    std::fs::write(
        f.repo.path().join(".shipyard/automation.yaml"),
        "pickup:\n  label: null\n",
    )
    .unwrap();
    assert!(
        mark(&f.s, "PROJ-5", true)
            .unwrap_err()
            .contains("pickup label is off")
    );
}

#[test]
fn mark_for_run_adds_the_workflow_label_and_the_pickup_label_on_a_click_only() {
    let f = fx();
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    f.http
        .put("/rest/api/2/issue/PROJ-5", "labels", 204, "")
        .get(
            "/rest/api/2/issue/PROJ-5",
            200,
            &issue("PROJ-5", "T", "", "wf:feature", None, 0),
        );
    assert!(mark_for_run(&f.s, "PROJ-5", "feature", false).is_err());
    assert_eq!(f.writes(), 0);
    mark_for_run(&f.s, "PROJ-5", "feature", true).unwrap();
    let bodies: Vec<String> = f
        .http
        .requests()
        .into_iter()
        .filter(|r| r.method == Method::Put)
        .map(|r| r.body.unwrap().to_string())
        .collect();
    assert_eq!(
        bodies,
        [
            r#"{"update":{"labels":[{"add":"wf:feature"}]}}"#,
            r#"{"update":{"labels":[{"add":"shipyard"}]}}"#
        ]
    );
}

#[test]
fn a_refused_transition_reaches_the_view_and_the_mirror_keeps_its_row() {
    let f = fx();
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    f.http.get(
        "/issue/PROJ-5/transitions",
        200,
        r#"{"transitions":[{"id":"11","name":"Start","to":{"name":"In Progress"}}]}"#,
    );
    let e = transition(&f.s, "PROJ-5", "Archived", true).unwrap_err();
    assert!(e.contains("In Progress"), "{e}");
    assert_eq!(f.writes(), 0);
    assert_eq!(f.item("PROJ-5").status.name, "To Do");
    assert!(transition(&f.s, "PROJ-5", "Done", false).is_err());
}

// ---------------------------------------------------------------- seal (REQ-005, REQ-014)

#[test]
fn seal_makes_the_files_unreadable_and_a_wrong_passphrase_shows_no_number() {
    let f = fx();
    save_team(&f, team5());
    sheet_save(&f.s, "lot", lot()).unwrap();
    assert_eq!(
        seal_state(&f.s).unwrap(),
        SealState {
            sealed: false,
            unlocked: false
        }
    );

    let st = seal_all(&f.s, PASS).unwrap();
    assert_eq!(
        st,
        SealState {
            sealed: true,
            unlocked: true
        }
    );
    let sheet_text = f.file("docs/costing/lot.yaml");
    let team_text = f.file(".shipyard/team.yaml");
    assert!(sheet_text.starts_with("SHIPYARD-SEALED-v1:") && !sheet_text.contains("Login"));
    assert!(
        team_text.contains("dayRate: SHIPYARD-SEALED-v1:") && !team_text.contains("dayRate: 500")
    );
    assert!(team_text.contains("handle: ana"), "only the rate is sealed");
    // The view still works while it is unlocked, with the numbers.
    assert!(sheet_get(&f.s, "lot").unwrap().totals.price > 0.0);

    // Lock: no passphrase on this machine. A locked state and no number.
    assert_eq!(
        lock_session(&f.s).unwrap(),
        SealState {
            sealed: true,
            unlocked: false
        }
    );
    let list = list_sheets(&f.s).unwrap();
    assert_eq!(
        (list[0].state, list[0].totals.is_none()),
        (SheetState::Locked, true)
    );
    assert!(sheet_get(&f.s, "lot").is_err());
    let v = team_get(&f.s).unwrap();
    assert!(v.locked && v.team.members.iter().all(|m| m.day_rate.is_none()));
    // A write would drop the sealed values: it is refused, the files stay.
    assert!(team_save(&f.s, v.team).is_err());
    assert!(sheet_save(&f.s, "lot", lot()).is_err());
    assert!(
        sheet_save(&f.s, "new", lot()).is_err(),
        "a new sheet is not written plain"
    );
    assert_eq!(f.file("docs/costing/lot.yaml"), sheet_text);
    assert_eq!(f.file(".shipyard/team.yaml"), team_text);

    // A wrong passphrase is refused, keeps the lock and never echoes either passphrase.
    let e = unlock(&f.s, "wrong passphrase").unwrap_err();
    assert!(
        e.contains("does not open") && !e.contains("wrong passphrase") && !e.contains(PASS),
        "{e}"
    );
    assert!(!seal_state(&f.s).unwrap().unlocked);
    assert!(sheet_get(&f.s, "lot").is_err());
    // The right one opens, and a write seals again with it.
    assert!(unlock(&f.s, PASS).unwrap().unlocked);
    assert!(sheet_get(&f.s, "lot").unwrap().totals.price > 0.0);
    sheet_save(&f.s, "second", lot()).unwrap();
    assert!(
        f.file("docs/costing/second.yaml")
            .starts_with("SHIPYARD-SEALED-v1:")
    );
    team_save(&f.s, team_get(&f.s).unwrap().team).unwrap();
    assert!(
        f.file(".shipyard/team.yaml")
            .contains("dayRate: SHIPYARD-SEALED-v1:")
    );

    // The passphrase is in no file of the repository.
    for rel in [
        "docs/costing/lot.yaml",
        "docs/costing/second.yaml",
        ".shipyard/team.yaml",
    ] {
        assert!(!f.file(rel).contains(PASS));
    }
}

#[test]
fn seal_again_with_another_passphrase_is_refused_and_unseal_restores_plain_text() {
    let f = fx();
    save_team(&f, team5());
    sheet_save(&f.s, "lot", lot()).unwrap();
    let plain_sheet = f.file("docs/costing/lot.yaml");
    seal_all(&f.s, PASS).unwrap();
    let sealed = f.file("docs/costing/lot.yaml");
    // A plain sheet written outside, then seal with another passphrase: the sealed ones do not open.
    assert!(seal_all(&f.s, "another one").is_err());
    assert_eq!(f.file("docs/costing/lot.yaml"), sealed);
    assert!(seal_all(&f.s, "  ").is_err());
    // Sealing twice with the right one does not churn the sealed files.
    seal_all(&f.s, PASS).unwrap();
    assert_eq!(f.file("docs/costing/lot.yaml"), sealed);

    assert!(unseal_all(&f.s, "another one").is_err());
    assert_eq!(f.file("docs/costing/lot.yaml"), sealed);
    let st = unseal_all(&f.s, PASS).unwrap();
    assert_eq!(
        st,
        SealState {
            sealed: false,
            unlocked: false
        }
    );
    assert_eq!(f.file("docs/costing/lot.yaml"), plain_sheet);
    assert!(f.file(".shipyard/team.yaml").contains("dayRate: 500"));
    assert!(unseal_all(&f.s, PASS).is_err(), "nothing is sealed");
    assert!(unlock(&f.s, PASS).is_err(), "nothing is sealed");
}

// ---------------------------------------------------------------- estimates (REQ-009 to REQ-011, REQ-015)

#[test]
fn a_sheet_holds_entries_and_no_total_and_the_four_views_agree() {
    let f = fx();
    save_team(&f, team5());
    let mut s1 = lot();
    s1.features[0].tasks.push(Task {
        id: "qa".into(),
        name: "QA pass".into(),
        role: "qa".into(),
        percent: Some(25.0),
        ..Task::default()
    });
    let v = sheet_save(&f.s, "lot", s1).unwrap();
    // The build tasks hold 3 days: the 25 % task is three quarters of a day.
    assert_eq!(v.days["qa"], 0.75);
    let text = f.file("docs/costing/lot.yaml");
    for word in ["price", "cost", "margin:", "totals", "dayRate"] {
        assert!(!text.contains(word), "{word} in the file");
    }
    // Two sheets. The summary, the monthly spread and the portfolio carry equal totals.
    sheet_save(
        &f.s,
        "lot-2",
        Sheet {
            name: "Lot 2".into(),
            features: vec![Feature {
                id: "x".into(),
                name: "X".into(),
                description: String::new(),
                tasks: vec![task("y", "Y", "dev", 3.0)],
            }],
            ..lot()
        },
    )
    .unwrap();
    let list = list_sheets(&f.s).unwrap();
    assert_eq!(
        list.iter().map(|i| i.slug.as_str()).collect::<Vec<_>>(),
        ["lot", "lot-2"]
    );
    let p = portfolio(&f.s).unwrap();
    let (a, b) = (
        sheet_get(&f.s, "lot").unwrap(),
        sheet_get(&f.s, "lot-2").unwrap(),
    );
    let spread: f64 = a.spread.iter().chain(&b.spread).map(|m| m.days).sum();
    let spread_cost: f64 = a.spread.iter().chain(&b.spread).map(|m| m.cost).sum();
    assert!((p.total.days - (a.totals.days + b.totals.days)).abs() < 1e-9);
    assert!((p.total.days - spread).abs() < 1e-9);
    assert!((p.total.cost - spread_cost).abs() < 1e-6);
    assert!(a.totals.margin > 0.0 && (a.totals.price - a.totals.cost * 1.1).abs() < 1e-6);
    // An invalid sheet is refused and not written.
    let mut bad = lot();
    bad.features[0].tasks[0].days = None;
    assert!(sheet_save(&f.s, "bad", bad).is_err());
    assert!(!f.exists("docs/costing/bad.yaml"));
    assert!(sheet_get(&f.s, "nope").is_err());
    assert!(
        sheet_save(&f.s, "../x", lot()).is_err(),
        "a slug is no path"
    );
}

#[test]
fn a_task_shows_its_estimate_beside_the_original_estimate_of_its_ticket() {
    let f = fx();
    save_team(&f, team5());
    let mut s = lot();
    s.features[0].tasks[0].ticket = Some("PROJ-5".into());
    let mut t = ticket("PROJ-5", "Build the form", &[]);
    t.time = Some(shipyard_core::work_item::TimeTracking {
        estimate_minutes: Some(960),
        spent_minutes: None,
    });
    f.put(vec![t]);
    let v = sheet_save(&f.s, "lot", s).unwrap();
    assert_eq!(v.tickets.len(), 1);
    assert_eq!(
        (
            v.tickets[0].task.as_str(),
            v.tickets[0].estimate_minutes,
            v.days["a"]
        ),
        ("a", Some(960), 2.0)
    );
}

// ---------------------------------------------------------------- Excel (REQ-012, REQ-013)

#[test]
fn excel_exports_previews_and_replaces_only_after_the_confirm() {
    let f = fx();
    save_team(&f, team5());
    sheet_save(&f.s, "lot", lot()).unwrap();
    let book = f.repo.path().join("lot.xlsx");
    excel_write(&f.s, "lot", book.to_str().unwrap()).unwrap();
    assert!(book.metadata().unwrap().len() > 0);

    // Another sheet exists. The preview shows the workbook and writes nothing.
    let mut other = lot();
    other.features[0].tasks[0].days = Some(9.0);
    sheet_save(&f.s, "target", other).unwrap();
    let before = f.file("docs/costing/target.yaml");
    let pv = excel_read(&f.s, book.to_str().unwrap(), None).unwrap();
    assert!(pv.refused.is_empty(), "{:?}", pv.refused);
    assert_eq!(f.file("docs/costing/target.yaml"), before);
    // No confirm, no replace. The preview waits.
    assert!(
        excel_replace(&f.s, "target", false)
            .unwrap_err()
            .contains("confirmation")
    );
    assert_eq!(f.file("docs/costing/target.yaml"), before);
    // The confirm replaces: the round trip keeps the totals.
    let v = excel_replace(&f.s, "target", true).unwrap();
    let want = sheet_get(&f.s, "lot").unwrap().totals;
    assert_eq!((v.totals.days, v.totals.price), (want.days, want.price));
    assert_ne!(f.file("docs/costing/target.yaml"), before);
    assert!(
        excel_replace(&f.s, "target", true).is_err(),
        "the preview is used once"
    );
}

#[test]
fn an_excel_path_is_validated() {
    let f = fx();
    sheet_save(&f.s, "lot", lot()).unwrap();
    let dir = f.repo.path();
    let txt = dir.join("a.txt");
    std::fs::write(&txt, "x").unwrap();
    let big = dir.join("big.xlsx");
    std::fs::write(&big, vec![0u8; MAX_BYTES + 1]).unwrap();
    for bad in [
        "lot.xlsx",
        "/nope/missing.xlsx",
        txt.to_str().unwrap(),
        dir.to_str().unwrap(),
        big.to_str().unwrap(),
        "",
    ] {
        assert!(excel_read(&f.s, bad, None).is_err(), "{bad:?}");
    }
    for bad in [
        "lot.xlsx",
        txt.to_str().unwrap(),
        "/nope/dir/out.xlsx",
        dir.to_str().unwrap(),
        "",
    ] {
        assert!(excel_write(&f.s, "lot", bad).is_err(), "{bad:?}");
    }
    // A broken workbook is an error, and nothing waits for a confirm.
    let junk = dir.join("junk.xlsx");
    std::fs::write(&junk, "not a workbook").unwrap();
    assert!(excel_read(&f.s, junk.to_str().unwrap(), None).is_err());
    assert!(excel_replace(&f.s, "lot", true).is_err());
}

// ---------------------------------------------------------------- plan (REQ-016, REQ-017)

#[test]
fn the_plan_moves_with_the_team_and_stores_only_the_decisions_of_a_person() {
    let f = fx();
    save_team(&f, team5());
    sheet_save(&f.s, "lot", lot()).unwrap();
    let v = plan(&f.s, "lot").unwrap();
    assert_eq!(v.gantt.bars.len(), 2);
    assert_eq!(v.gantt.bars[0].member.as_deref(), Some("ana"));
    let start = v.gantt.bars[0].start.clone();
    assert!(start >= v.today, "the plan starts today or later");

    // The only member of the role is away for ten days: the dates move and no plan file appears.
    let mut t = team_get(&f.s).unwrap().team;
    t.members[2].availability = Availability {
        absences: vec![Span {
            from: v.today.clone(),
            to: shipyard_core::work::iso(shipyard_core::work::parse_day(&v.today).unwrap() + 10),
        }],
        ..Availability::default()
    };
    team_save(&f.s, t).unwrap();
    let moved = plan(&f.s, "lot").unwrap();
    assert!(moved.gantt.bars[1].start > v.gantt.bars[1].start);
    assert!(
        !f.exists("docs/planning/plan.yaml"),
        "a computed date has no file"
    );

    // A fixed start and a member choice are the only things in the file.
    let mut d = Decisions::default();
    d.tasks.insert(
        "est:lot#a".into(),
        TaskDecision {
            start: Some("2027-02-01".into()),
            member: Some("bob".into()),
        },
    );
    decisions_save(&f.s, &d).unwrap();
    let text = f.file("docs/planning/plan.yaml");
    assert!(text.contains("2027-02-01") && text.contains("bob") && !text.contains("end"));
    let p = plan(&f.s, "lot").unwrap();
    assert_eq!(
        (
            p.gantt.bars[0].start.as_str(),
            p.gantt.bars[0].member.as_deref()
        ),
        ("2027-02-01", Some("bob"))
    );
    // A bad decision is refused.
    d.tasks.insert("not a ref".into(), TaskDecision::default());
    assert!(decisions_save(&f.s, &d).is_err());

    // A holiday: no task works on that day.
    let day = p.gantt.bars[0].start.clone();
    let cal = Calendar {
        holidays: vec![day.clone()],
        ..Calendar::default()
    };
    calendar_save(&f.s, &cal).unwrap();
    assert_ne!(plan(&f.s, "lot").unwrap().gantt.bars[0].start, day);
    assert!(
        calendar_save(
            &f.s,
            &Calendar {
                holidays: vec!["x".into()],
                ..Calendar::default()
            }
        )
        .is_err()
    );
}

// ---------------------------------------------------------------- time (REQ-020 to REQ-024)

fn worklog_routes(f: &Fx, held: &str) {
    f.http.get("/issue/PROJ-5/worklog", 200, held);
}

#[test]
fn an_entry_needs_a_member_and_goes_in_the_file_of_the_month_and_nothing_is_sent() {
    let f = fx();
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    // No team: the member of this machine does not resolve.
    let e = time_write(&f.s, None, "2026-10-26", 120, "api", Some("PROJ-5")).unwrap_err();
    assert!(e.contains("cannot resolve the member"), "{e}");
    save_team(&f, team5());
    // The `user` of the connection is a tracker account of `ana`.
    let entry = time_write(&f.s, None, "2026-10-26", 120, "api", Some("wi:PROJ-5")).unwrap();
    assert_eq!(entry.ticket.as_deref(), Some("PROJ-5"));
    assert!(
        f.file("docs/time/ana/2026-10.yaml")
            .contains("minutes: 120")
    );
    // A second month is a second file. Another member is another folder.
    time_write(&f.s, Some("bob"), "2026-11-02", 30, "", None).unwrap();
    assert!(f.exists("docs/time/bob/2026-11.yaml"));

    let v = time_month(&f.s, None, "2026-10").unwrap();
    assert_eq!(
        (v.member.as_str(), v.rows.len(), v.can_send),
        ("ana", 1, true)
    );
    assert_eq!(v.rows[0].state, TimeState::ToSend);

    // A refused entry: no duration, a day that is no date, a ticket the mirror lacks, an unknown member.
    assert!(time_write(&f.s, None, "2026-10-26", 0, "", None).is_err());
    assert!(time_write(&f.s, None, "26/10/2026", 10, "", None).is_err());
    assert!(time_write(&f.s, None, "2026-10-26", 10, "", Some("PROJ-404")).is_err());
    assert!(time_write(&f.s, Some("zed"), "2026-10-26", 10, "", None).is_err());
    assert_eq!(f.writes(), 0, "no worklog without the click of a person");
}

#[test]
fn the_send_needs_a_click_writes_the_receipt_last_and_offers_the_entry_once() {
    let f = fx();
    save_team(&f, team5());
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    let e = time_write(&f.s, None, "2026-10-29", 90, "review", Some("PROJ-5")).unwrap();
    worklog_routes(&f, r#"{"worklogs":[]}"#);
    f.http.post(
        "/issue/PROJ-5/worklog",
        "",
        201,
        r#"{"id":"10234","timeSpentSeconds":5400,"comment":"x","started":"s"}"#,
    );
    // No click: nothing is sent and the entry has no receipt.
    assert!(worklog_send(&f.s, None, "2026-10-29", &e.id, 60, true, false).is_err());
    assert_eq!(f.writes(), 0);
    assert!(f.file("docs/time/ana/2026-10.yaml").contains(&e.id));

    let sent = worklog_send(&f.s, None, "2026-10-29", &e.id, 60, true, true).unwrap();
    assert_eq!(
        (sent.entry.worklog.as_deref(), sent.already_there),
        (Some("10234"), false)
    );
    assert!(
        f.file("docs/time/ana/2026-10.yaml")
            .contains("worklog: '10234'")
            || f.file("docs/time/ana/2026-10.yaml")
                .contains("worklog: \"10234\"")
            || f.file("docs/time/ana/2026-10.yaml")
                .contains("worklog: 10234")
    );
    let post = f
        .http
        .requests()
        .into_iter()
        .find(|r| r.method == Method::Post)
        .unwrap();
    assert!(post.url.contains("adjustEstimate=auto"));
    assert!(post.body.unwrap().to_string().contains("shipyard log="));
    // A receipt: the entry is not offered again.
    assert!(worklog_send(&f.s, None, "2026-10-29", &e.id, 60, true, true).is_err());
    assert_eq!(f.writes(), 1);
    let row = &time_month(&f.s, None, "2026-10").unwrap().rows[0];
    assert_eq!(row.state, TimeState::InTracker);
    // An id that is no entry of the month.
    assert!(worklog_send(&f.s, None, "2026-10-29", "nope", 60, true, true).is_err());
    assert!(worklog_send(&f.s, None, "2026-10-29", &e.id, 3000, true, true).is_err());
}

#[test]
fn today_is_the_day_of_the_screen_and_not_the_day_of_greenwich() {
    // 2026-10-29 23:30 UTC.
    let secs = 1_793_268_000 + 13 * 3600 + 1800;
    assert_eq!(local_day(secs, 0), "2026-10-29");
    assert_eq!(
        local_day(secs, 120),
        "2026-10-30",
        "Paris is already tomorrow"
    );
    assert_eq!(local_day(secs, -300), "2026-10-29");
    assert_eq!(local_day(secs - 24 * 3600, -300), "2026-10-28");
    let f = fx();
    assert!(context(&f.s, 15 * 60).is_err());
    // The offset that the view sent applies to the plan too.
    context(&f.s, 14 * 60).unwrap();
    assert_eq!(today(&f.s), local_day(now_secs(), 14 * 60));
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

#[test]
fn a_send_keeps_an_entry_that_another_write_added_while_the_tracker_answered() {
    let root = Arc::new(std::sync::OnceLock::<PathBuf>::new());
    let at = root.clone();
    let f = fx_wrapped(ConnectionKind::JiraCloud, Some("PROJ"), move |inner| {
        Arc::new(Hooked {
            inner,
            hook: Mutex::new(Some(Box::new(move || {
                let file = at.get().unwrap().join("docs/time/ana/2026-10.yaml");
                let late = TimeEntry {
                    id: "late".into(),
                    day: "2026-10-29".into(),
                    minutes: 15,
                    note: "typed while the send ran".into(),
                    ticket: None,
                    worklog: None,
                };
                let text = add_to_month(std::fs::read_to_string(&file).ok().as_deref(), late);
                write_atomic(&file, text.unwrap().as_bytes()).unwrap();
            }))),
        })
    });
    root.set(f.repo.path().to_path_buf()).unwrap();
    save_team(&f, team5());
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    let e = time_write(&f.s, None, "2026-10-29", 90, "review", Some("PROJ-5")).unwrap();
    worklog_routes(&f, r#"{"worklogs":[]}"#);
    f.http.post(
        "/issue/PROJ-5/worklog",
        "",
        201,
        r#"{"id":"10234","timeSpentSeconds":5400,"comment":"x","started":"s"}"#,
    );
    worklog_send(&f.s, None, "2026-10-29", &e.id, 0, false, true).unwrap();
    let file = f.file("docs/time/ana/2026-10.yaml");
    assert!(file.contains("id: late"), "the late entry stays: {file}");
    assert!(file.contains("10234"), "the receipt is stored: {file}");
}

#[test]
fn two_sends_of_one_entry_make_one_worklog() {
    let f = fx();
    save_team(&f, team5());
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    let e = time_write(&f.s, None, "2026-10-29", 90, "review", Some("PROJ-5")).unwrap();
    // The fake tracker keeps no state, so only the lock stops the second post.
    worklog_routes(&f, r#"{"worklogs":[]}"#);
    f.http.post(
        "/issue/PROJ-5/worklog",
        "",
        201,
        r#"{"id":"10234","timeSpentSeconds":5400,"comment":"x","started":"s"}"#,
    );
    let results: Vec<_> = std::thread::scope(|t| {
        let sends: Vec<_> = (0..4)
            .map(|_| t.spawn(|| worklog_send(&f.s, None, "2026-10-29", &e.id, 0, false, true)))
            .collect();
        sends.into_iter().map(|h| h.join().unwrap()).collect()
    });
    assert_eq!(
        results.iter().filter(|r| r.is_ok()).count(),
        1,
        "{results:?}"
    );
    assert_eq!(f.writes(), 1);
}

#[test]
fn a_lost_response_stores_no_receipt_and_the_next_send_finds_the_worklog_by_its_mark() {
    // First send: the lookup is empty and the post fails on the wire.
    let f = fx();
    save_team(&f, team5());
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    let e = time_write(&f.s, None, "2026-10-29", 90, "review", Some("PROJ-5")).unwrap();
    worklog_routes(&f, r#"{"worklogs":[]}"#);
    let err = worklog_send(&f.s, None, "2026-10-29", &e.id, 0, true, true).unwrap_err();
    assert!(err.contains("answer was lost"), "{err}");
    assert!(!f.file("docs/time/ana/2026-10.yaml").contains("worklog:"));

    // The tracker holds the worklog: the mark is found, nothing is sent, the receipt is stored.
    let g = fx();
    save_team(&g, team5());
    g.put(vec![ticket("PROJ-5", "T", &[])]);
    let e = time_write(&g.s, None, "2026-10-29", 90, "review", Some("PROJ-5")).unwrap();
    let held = format!(
        r#"{{"worklogs":[{{"id":"777","timeSpentSeconds":10800,"comment":{},"started":"s"}}]}}"#,
        serde_json::to_string(&shipyard_core::work::worklog_note("review", &e.id)).unwrap()
    );
    worklog_routes(&g, &held);
    // The fetch flags the difference (90 minutes here, 180 there) and offers the receipt.
    let rows = time_rows(&g.s, None, "PROJ-5").unwrap();
    assert_eq!(
        (rows.len(), rows[0].differs, rows[0].lost_receipt),
        (1, true, true)
    );
    assert_eq!(
        rows[0].entry.as_ref().unwrap().minutes,
        90,
        "both values stay"
    );
    let sent = worklog_send(&g.s, None, "2026-10-29", &e.id, 0, false, true).unwrap();
    assert!(sent.already_there);
    assert_eq!(sent.entry.worklog.as_deref(), Some("777"));
    assert_eq!(
        g.writes(),
        0,
        "a lost response never causes a second worklog"
    );
    assert_eq!(
        time_month(&g.s, None, "2026-10").unwrap().rows[0].state,
        TimeState::InTracker
    );
}

#[test]
fn a_worklog_that_only_the_tracker_holds_shows_as_such_and_a_tracker_without_time_is_refused() {
    let f = fx();
    save_team(&f, team5());
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    worklog_routes(
        &f,
        r#"{"worklogs":[{"id":"9","timeSpentSeconds":1800,"comment":"by hand","started":"s"}]}"#,
    );
    let rows = time_rows(&f.s, None, "wi:PROJ-5").unwrap();
    assert_eq!(
        (rows[0].state, rows[0].entry.is_none()),
        (TimeState::OnlyInTracker, true)
    );

    let g = fx_with(ConnectionKind::GitHub, Some("acme/web"));
    save_team(&g, team5());
    g.put(vec![ticket("PROJ-5", "T", &[])]);
    let e = time_write(&g.s, None, "2026-10-29", 30, "", Some("PROJ-5")).unwrap();
    assert!(!time_month(&g.s, None, "2026-10").unwrap().can_send);
    let err = worklog_send(&g.s, None, "2026-10-29", &e.id, 0, false, true).unwrap_err();
    assert!(err.contains("TimeTracking"), "{err}");
    assert_eq!(g.writes(), 0);
}

// ---------------------------------------------------------------- apply (REQ-019, REQ-025, REQ-026)

pub(crate) const NO_ISSUES: &str = r#"{"issues":[]}"#;

fn apply_routes(f: &Fx) {
    f.http
        .get("/rest/api/2/search/jql", 200, NO_ISSUES)
        .post(
            "/rest/api/2/issue",
            r#""name":"Epic""#,
            201,
            r#"{"id":"1","key":"PROJ-10"}"#,
        )
        .post(
            "/rest/api/2/issue",
            r#""summary":"Build""#,
            201,
            r#"{"id":"2","key":"PROJ-11"}"#,
        )
        .post(
            "/rest/api/2/issue",
            r#""summary":"Test""#,
            201,
            r#"{"id":"3","key":"PROJ-12"}"#,
        )
        .get(
            "/rest/api/2/issue/PROJ-10",
            200,
            &issue("PROJ-10", "Login", "Sign in", "est:lot#login", None, 0),
        )
        .get(
            "/rest/api/2/issue/PROJ-11",
            200,
            &issue("PROJ-11", "Build", "", "est:lot#a", Some("PROJ-10"), 57_600),
        )
        .get(
            "/rest/api/2/issue/PROJ-12",
            200,
            &issue("PROJ-12", "Test", "", "est:lot#b", Some("PROJ-10"), 28_800),
        );
}

#[test]
fn the_preview_writes_nothing_and_an_apply_writes_each_row_then_a_second_apply_changes_nothing() {
    let f = fx();
    save_team(&f, team5());
    sheet_save(&f.s, "lot", lot()).unwrap();
    apply_routes(&f);

    let pv = preview(&f.s, &["lot".into()]).unwrap();
    assert_eq!(
        pv.iter().map(|d| d.action).collect::<Vec<_>>(),
        [Action::Create, Action::Create, Action::Create]
    );
    assert_eq!(f.writes(), 0, "the preview sends nothing");
    // No click, no write.
    assert!(apply(&f.s, &["lot".into()], false).is_err());
    assert_eq!(f.writes(), 0);

    let out = apply(&f.s, &["lot".into()], true).unwrap();
    assert!(out.iter().all(|r| r.error.is_none()), "{out:?}");
    assert_eq!(
        out.iter()
            .filter_map(|r| r.key.as_deref())
            .collect::<Vec<_>>(),
        ["PROJ-10", "PROJ-11", "PROJ-12"]
    );
    // The mirror holds the written tickets, so the preview shows them as unchanged.
    let after = preview(&f.s, &["lot".into()]).unwrap();
    assert!(
        after.iter().all(|d| d.action == Action::Unchanged),
        "{after:?}"
    );
    let writes = f.writes();
    let again = apply(&f.s, &["lot".into()], true).unwrap();
    assert!(again.iter().all(|r| r.action == Action::Unchanged));
    assert_eq!(f.writes(), writes, "a second apply creates nothing");
    // Neither the status nor the assignee went out.
    for r in f.http.requests().iter().filter(|r| r.method != Method::Get) {
        let all = format!(
            "{} {}",
            r.url,
            r.body.clone().map(|b| b.to_string()).unwrap_or_default()
        );
        assert!(
            !all.contains("assignee") && !all.contains("transition"),
            "{all}"
        );
    }
}

#[test]
fn plan_and_apply_read_the_effort_of_the_sheet_and_keep_no_copy() {
    let f = fx();
    save_team(&f, team5());
    sheet_save(&f.s, "lot", lot()).unwrap();
    apply_routes(&f);
    apply(&f.s, &["lot".into()], true).unwrap();
    // One edit in the sheet: the build task is 5 days now.
    let mut s = lot();
    s.features[0].tasks[0].days = Some(5.0);
    sheet_save(&f.s, "lot", s).unwrap();
    let pv = preview(&f.s, &["lot".into()]).unwrap();
    assert_eq!(pv[1].action, Action::Update);
    assert_eq!(pv[1].changes, [Field::Estimate]);
    assert_eq!(pv[1].row.days, Some(5.0));
    assert_eq!(plan(&f.s, "lot").unwrap().gantt.bars[0].days, 5.0);
}

#[test]
fn a_failed_row_keeps_the_rows_before_it_and_apply_needs_a_container() {
    let f = fx();
    sheet_save(&f.s, "lot", lot()).unwrap();
    f.http
        .get("/rest/api/2/search/jql", 200, NO_ISSUES)
        .post(
            "/rest/api/2/issue",
            r#""name":"Epic""#,
            201,
            r#"{"key":"PROJ-10"}"#,
        )
        .post(
            "/rest/api/2/issue",
            r#""summary":"Build""#,
            201,
            r#"{"key":"PROJ-11"}"#,
        )
        .post(
            "/rest/api/2/issue",
            "",
            400,
            r#"{"errors":{"summary":"bad"}}"#,
        )
        .get(
            "/rest/api/2/issue/PROJ-10",
            200,
            &issue("PROJ-10", "Login", "Sign in", "est:lot#login", None, 0),
        )
        .get(
            "/rest/api/2/issue/PROJ-11",
            200,
            &issue("PROJ-11", "Build", "", "est:lot#a", Some("PROJ-10"), 57_600),
        );
    let out = apply(&f.s, &["lot".into()], true).unwrap();
    assert!(out[0].error.is_none() && out[1].error.is_none());
    assert!(out[2].error.as_deref().unwrap().contains("400"));
    // The rows before it stay in the mirror.
    assert_eq!(f.item("PROJ-10").title, "Login");
    assert_eq!(f.item("PROJ-11").parent.as_deref(), Some("PROJ-10"));

    // A project with no scope setting cannot create.
    let g = fx_with(ConnectionKind::JiraCloud, None);
    sheet_save(&g.s, "lot", lot()).unwrap();
    let e = apply(&g.s, &["lot".into()], true).unwrap_err();
    assert!(e.contains("trackerScope"), "{e}");
    assert_eq!(g.writes(), 0);
    // The preview needs no scope.
    assert_eq!(preview(&g.s, &["lot".into()]).unwrap().len(), 3);
    assert!(preview(&g.s, &["nope".into()]).is_err());
}

// ---------------------------------------------------------------- one item from a ref (REQ-029)

fn from_ref() -> Row {
    Row {
        reference: "diagram:context".into(),
        kind: RowKind::Story,
        title: "Draw the context".into(),
        description: "From the diagram".into(),
        days: None,
        parent: None,
    }
}

#[test]
fn one_click_creates_one_item_with_the_source_ref_as_its_label_and_a_second_click_none() {
    let f = fx();
    f.http
        .get("/rest/api/2/search/jql", 200, NO_ISSUES)
        .post(
            "/rest/api/2/issue",
            r#"diagram:context"#,
            201,
            r#"{"key":"PROJ-20"}"#,
        )
        .get(
            "/rest/api/2/issue/PROJ-20",
            200,
            &issue(
                "PROJ-20",
                "Draw the context",
                "From the diagram",
                "diagram:context",
                None,
                0,
            ),
        );
    let pv = item_preview(&f.s, from_ref()).unwrap();
    assert_eq!(pv.action, Action::Create);
    assert_eq!(f.writes(), 0, "no item before the click");
    assert!(item_create(&f.s, from_ref(), false).is_err());
    assert_eq!(f.writes(), 0);

    let r = item_create(&f.s, from_ref(), true).unwrap();
    assert_eq!(
        (r.key.as_deref(), r.error.as_deref()),
        (Some("PROJ-20"), None)
    );
    assert_eq!(f.writes(), 1);
    assert_eq!(f.item("PROJ-20").labels, ["diagram:context"]);
    assert_eq!(
        item_preview(&f.s, from_ref()).unwrap().action,
        Action::Unchanged
    );
    let second = item_create(&f.s, from_ref(), true).unwrap();
    assert_eq!(second.action, Action::Unchanged);
    assert_eq!(f.writes(), 1, "the second click creates none");

    // A row that is no ref, or has no title, is refused.
    let mut bad = from_ref();
    bad.reference = "not a ref".into();
    assert!(item_create(&f.s, bad, true).is_err());
    let mut bad = from_ref();
    bad.title = " ".into();
    assert!(item_preview(&f.s, bad).is_err());
}

// ---------------------------------------------------------------- entities (REQ-027)

#[test]
fn members_and_sheets_resolve_and_show_their_backlinks() {
    let f = fx();
    save_team(&f, team5());
    let mut s = lot();
    s.features[0].tasks[0].ticket = Some("PROJ-5".into());
    sheet_save(&f.s, "lot", s).unwrap();
    let mut d = Decisions::default();
    d.tasks.insert(
        "est:lot#a".into(),
        TaskDecision {
            start: None,
            member: Some("ana".into()),
        },
    );
    decisions_save(&f.s, &d).unwrap();
    let mut it = ticket("PROJ-5", "Build the form", &[]);
    it.assignee = Some(Person {
        id: "acc-ana".into(),
        name: "Ana".into(),
    });
    f.put(vec![it]);

    let r = refs::resolve(&f.s, "member:ana").unwrap().unwrap();
    assert_eq!(
        (r.state, r.title.as_deref()),
        (State::Resolved, Some("ANA"))
    );
    let r = refs::resolve(&f.s, "est:lot").unwrap().unwrap();
    assert_eq!(
        (r.state, r.title.as_deref()),
        (State::Resolved, Some("Lot"))
    );
    assert_eq!(
        refs::resolve(&f.s, "est:lot#a")
            .unwrap()
            .unwrap()
            .title
            .as_deref(),
        Some("Build")
    );
    assert_eq!(
        refs::resolve(&f.s, "member:zed").unwrap().unwrap().state,
        State::Unresolved
    );

    let backlinks = |target: &str| -> Vec<String> {
        refs::with_index(&f.s, |i| i.backlinks(target))
            .unwrap()
            .into_iter()
            .flat_map(|g| g.items.into_iter().map(|b| b.source))
            .collect()
    };
    // The member: the sheet that the plan assigns and the item that is assigned to the member.
    assert_eq!(backlinks("member:ana"), ["est:lot", "wi:PROJ-5"]);
    assert_eq!(backlinks("wi:PROJ-5"), ["est:lot"]);
    // The sheet and the member are in the search.
    let hits = refs::with_index(&f.s, |i| i.search("ana", 10)).unwrap();
    assert!(hits.iter().any(|h| h.target == "member:ana"));
}

#[test]
fn a_sealed_sheet_stays_opaque_in_the_index() {
    let f = fx();
    save_team(&f, team5());
    sheet_save(&f.s, "lot", lot()).unwrap();
    seal_all(&f.s, PASS).unwrap();
    let r = refs::resolve(&f.s, "est:lot").unwrap().unwrap();
    assert_eq!(
        (r.state, r.status.as_deref()),
        (State::Resolved, Some("sealed"))
    );
    assert_eq!(
        refs::resolve(&f.s, "est:lot#login").unwrap().unwrap().state,
        State::Unresolved
    );
    // The index file holds no title of a sealed sheet.
    let hits = refs::with_index(&f.s, |i| i.search("login", 10)).unwrap();
    assert!(hits.is_empty(), "{hits:?}");
}

// ---------------------------------------------------------------- secrets

#[test]
fn no_error_and_no_file_holds_the_passphrase_or_the_token() {
    let f = fx();
    save_team(&f, team5());
    sheet_save(&f.s, "lot", lot()).unwrap();
    let mut errors = vec![
        unlock(&f.s, PASS).unwrap_err(), // nothing sealed
        seal_all(&f.s, " ").unwrap_err(),
    ];
    seal_all(&f.s, PASS).unwrap();
    lock_session(&f.s).unwrap();
    errors.push(unlock(&f.s, "bad pass").unwrap_err());
    errors.push(seal_all(&f.s, "bad pass").unwrap_err());
    errors.push(unseal_all(&f.s, "bad pass").unwrap_err());
    errors.push(sheet_get(&f.s, "lot").unwrap_err());
    errors.push(team_save(&f.s, team5()).unwrap_err());
    for e in errors {
        for secret in [PASS, "bad pass", "tok-work-secret"] {
            assert!(!e.contains(secret), "{e}");
        }
    }
    fn walk(dir: &Path, out: &mut Vec<String>) {
        for e in std::fs::read_dir(dir).unwrap().flatten() {
            let p = e.path();
            if p.file_name().is_some_and(|n| n == ".git") {
                continue;
            }
            if p.is_dir() {
                walk(&p, out);
            } else if let Ok(t) = std::fs::read_to_string(&p) {
                out.push(t);
            }
        }
    }
    let mut texts = Vec::new();
    walk(f.repo.path(), &mut texts);
    walk(&f.s.dir, &mut texts);
    assert!(
        texts
            .iter()
            .all(|t| !t.contains(PASS) && !t.contains("tok-work-secret"))
    );
}

#[test]
fn legacy_json_sheets_and_team_open_in_place_and_save_in_their_format() {
    let f = fx();
    let put = |rel: &str, text: &str| {
        let p = f.repo.path().join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    };
    put(
        "docs/costing/mvp.json",
        r#"{"version":1,"plan":{"p":[1]},"meta":{"name":"MVP","currency":"EUR","marginRate":0.1},
        "features":[{"id":"f1","name":"Login","tasks":[{"id":"t1","name":"Form","personaId":"dev","mandays":3,"chargeType":"days","kind":"build"}]}]}"#,
    );
    put(
        "docs/planning/team.json",
        r#"{"version":1,"members":[{"id":"m","name":"Ana","email":"ana@x.io","personaId":"dev","tjm":500,"windows":[]}]}"#,
    );
    let v = sheet_get(&f.s, "mvp").unwrap();
    assert_eq!(v.sheet.features[0].tasks[0].days, Some(3.0));
    assert!(
        v.totals.price > 0.0,
        "the team rate prices the Legacy sheet"
    );
    let mut sheet = v.sheet;
    sheet.features[0].tasks[0].days = Some(5.0);
    sheet_save(&f.s, "mvp", sheet).unwrap();
    assert!(!f.exists("docs/costing/mvp.yaml"), "no YAML twin");
    let text = f.file("docs/costing/mvp.json");
    assert!(text.contains("\"mandays\": 5.0") && text.contains("\"plan\""));
    assert!(excel_replace(&f.s, "mvp", true).is_err());

    let mut t = team_get(&f.s).unwrap().team;
    assert_eq!(t.members[0].handle, "ana");
    t.members[0].day_rate = Some(600.0);
    team_save(&f.s, t).unwrap();
    assert!(!f.exists(".shipyard/team.yaml"));
    assert!(f.file("docs/planning/team.json").contains("\"tjm\": 600.0"));
    assert_eq!(
        team_get(&f.s).unwrap().team.members[0].day_rate,
        Some(600.0)
    );
}

#[test]
fn legacy_calendar_and_plan_json_open_in_place_and_save_in_their_format() {
    let f = fx();
    let put = |rel: &str, text: &str| {
        let p = f.repo.path().join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    };
    put(
        "docs/costing/mvp.json",
        r#"{"version":1,"meta":{"name":"MVP","currency":"EUR"},
        "features":[{"id":"f1","name":"Login","tasks":[{"id":"t1","name":"Form","personaId":"dev","mandays":3,"chargeType":"days","kind":"build"}]}]}"#,
    );
    put(
        "docs/planning/calendar.json",
        r#"{"version":1,"workingDays":[1,2,3,4],"holidays":[{"date":"2026-12-24","name":"Bridge"}]}"#,
    );
    put(
        "docs/planning/plan.json",
        r#"{"version":1,"tasks":[{"taskId":"t1","memberIds":["ana"],"anchor":"start-on","anchorDate":"2026-11-02","durationDays":2,"alsoAfter":[],"note":"n"}]}"#,
    );
    let v = plan(&f.s, "mvp").unwrap();
    assert_eq!(v.calendar.working_days, [1, 2, 3, 4]);
    assert_eq!(v.calendar.holidays, ["2026-12-24"]);
    assert_eq!(
        v.decisions.tasks["est:mvp#t1"].start.as_deref(),
        Some("2026-11-02")
    );
    let mut cal = v.calendar;
    cal.holidays.push("2026-12-31".into());
    calendar_save(&f.s, &cal).unwrap();
    let mut d = v.decisions;
    d.tasks.get_mut("est:mvp#t1").unwrap().member = Some("bob".into());
    decisions_save(&f.s, &d).unwrap();
    assert!(!f.exists("docs/planning/calendar.yaml") && !f.exists("docs/planning/plan.yaml"));
    assert!(f.file("docs/planning/calendar.json").contains("Bridge"));
    let plan_text = f.file("docs/planning/plan.json");
    assert!(plan_text.contains("\"bob\"") && plan_text.contains("\"durationDays\": 2"));
}

#[test]
fn a_ticket_thread_reads_comments_posts_one_edits_the_title_and_adds_a_label() {
    let f = fx();
    f.put(vec![ticket("PROJ-5", "T", &[])]);
    f.http
        .get(
            "/rest/api/2/issue/PROJ-5/comment",
            200,
            r#"{"startAt":0,"maxResults":100,"total":2,"comments":[
            {"id":"1","author":{"accountId":"a","displayName":"Grace"},"body":"Seen.","created":"2026-10-28T10:00:00.000+0000"},
            {"id":"2","author":{"accountId":"a","displayName":"Grace"},"body":"(shipyard:claim m.1)","created":"2026-10-28T11:00:00.000+0000"}]}"#,
        )
        .post(
            "/rest/api/2/issue/PROJ-5/comment",
            "",
            201,
            r#"{"id":"3","author":{"accountId":"a","displayName":"Ana"},"body":"ok","created":"2026-10-29T10:00:00.000+0000"}"#,
        )
        .put("/rest/api/2/issue/PROJ-5", "summary", 204, "")
        .put("/rest/api/2/issue/PROJ-5", "labels", 204, "")
        .put("/rest/api/2/issue/PROJ-5", "priority", 204, "")
        .put("/rest/api/2/issue/PROJ-5", "issuetype", 204, "")
        .put("/rest/api/2/issue/PROJ-5", "duedate", 204, "")
        .get(
            "/rest/api/2/issue/PROJ-5",
            200,
            &issue("PROJ-5", "New", "", "", None, 0),
        );
    let comments = ticket_comments(&f.s, "PROJ-5").unwrap();
    assert_eq!(comments.len(), 1, "a claim stamp is not a comment");
    assert_eq!(
        (comments[0].author.as_str(), comments[0].body.as_str()),
        ("Grace", "Seen.")
    );

    // A write needs the click of a person, and each value is checked before the tracker is called.
    let writes = f.writes();
    assert!(ticket_comment_add(&f.s, "PROJ-5", "ok", false).is_err());
    assert!(ticket_comment_add(&f.s, "PROJ-5", "  ", true).is_err());
    assert!(ticket_edit(&f.s, "PROJ-5", Some(" ".into()), None, None, true).is_err());
    assert!(ticket_edit(&f.s, "PROJ-5", None, None, Some(-1.0), true).is_err());
    assert!(ticket_label_add(&f.s, "PROJ-5", "two words", true).is_err());
    assert!(ticket_label_add(&f.s, "PROJ-5", "a,b", true).is_err());
    assert!(ticket_label_add(&f.s, "PROJ-5", "x", false).is_err());
    assert_eq!(f.writes(), writes, "no refused call reached the tracker");

    ticket_comment_add(&f.s, "PROJ-5", " ok ", true).unwrap();
    ticket_edit(&f.s, "PROJ-5", Some("New".into()), None, None, true).unwrap();
    assert_eq!(f.item("PROJ-5").title, "New");
    ticket_label_add(&f.s, "PROJ-5", "urgent", true).unwrap();
    let sent: Vec<_> = f
        .http
        .requests()
        .into_iter()
        .filter(|r| r.method != Method::Get)
        .map(|r| r.body.map(|b| b.to_string()).unwrap_or_default())
        .collect();
    assert!(sent.iter().any(|b| b.contains(r#""summary":"New""#)));
    assert!(sent.iter().any(|b| b.contains(r#"{"add":"urgent"}"#)));

    // Q-123: the capability flags, the label remove and the priority.
    let caps = ticket_edit_caps(&f.s).unwrap();
    assert!(caps.remove_label && caps.priority && caps.status && caps.assignee);
    assert!(ticket_label_remove(&f.s, "PROJ-5", "urgent", false).is_err());
    assert!(ticket_label_remove(&f.s, "PROJ-5", "two words", true).is_err());
    assert!(ticket_label_remove(&f.s, "PROJ-5", "a,b", true).is_err());
    assert!(ticket_priority_set(&f.s, "PROJ-5", "high", false).is_err());
    ticket_label_remove(&f.s, "PROJ-5", "urgent", true).unwrap();
    ticket_priority_set(&f.s, "PROJ-5", "high", true).unwrap();
    // Q-125: the type and the due date need a click and a valid day, and the flags name them.
    assert!(caps.issue_type && caps.due_date && caps.estimate);
    assert!(ticket_type_set(&f.s, "PROJ-5", "Bug", false).is_err());
    assert!(ticket_type_set(&f.s, "PROJ-5", " ", true).is_err());
    assert!(ticket_due_set(&f.s, "PROJ-5", Some("30/11/2026"), true).is_err());
    ticket_type_set(&f.s, "PROJ-5", "Bug", true).unwrap();
    ticket_due_set(&f.s, "PROJ-5", Some("2026-11-30"), true).unwrap();
    let sent: Vec<_> = f
        .http
        .requests()
        .into_iter()
        .filter_map(|r| r.body.map(|b| b.to_string()))
        .collect();
    assert!(sent.iter().any(|b| b.contains(r#"{"remove":"urgent"}"#)));
    assert!(
        sent.iter()
            .any(|b| b.contains(r#""priority":{"name":"High"}"#))
    );
    assert!(
        sent.iter()
            .any(|b| b.contains(r#""issuetype":{"name":"Bug"}"#))
    );
    assert!(sent.iter().any(|b| b.contains(r#""duedate":"2026-11-30""#)));
}
