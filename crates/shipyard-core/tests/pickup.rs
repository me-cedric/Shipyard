//! Reconcile and pickup rules (spec `sync`, REQ-003, REQ-004, REQ-006, REQ-007).

use shipyard_core::pickup::*;
use shipyard_core::run::RunState;
use shipyard_core::work_item::{Comment, Person, Status, StatusCategory, WorkItem, WorkKind};

fn ticket(key: &str, status: &str, category: StatusCategory) -> Ticket {
    Ticket::new(WorkItem {
        key: key.into(),
        title: format!("title {key}"),
        description: String::new(),
        kind: WorkKind::Task,
        status: Status {
            name: status.into(),
            category,
        },
        assignee: Some(Person {
            id: "u1".into(),
            name: "Alice".into(),
        }),
        labels: vec!["shipyard".into()],
        parent: None,
        url: String::new(),
        updated: "2026-10-29T10:00:00Z".into(),
        time: None,
    })
}

fn todo(key: &str) -> Ticket {
    ticket(key, "To Do", StatusCategory::Todo)
}

fn run(id: &str, key: &str, state: RunState) -> ActiveRun {
    ActiveRun {
        run_id: id.into(),
        project: "ship".into(),
        key: key.into(),
        state,
        status: "To Do".into(),
        pr: None,
    }
}

fn pick<'a>(
    auto: &'a Automation,
    tickets: &'a [Ticket],
    active: &'a [ActiveRun],
    held: &'a [String],
    kill: bool,
) -> Vec<String> {
    pick_with(auto, tickets, active, held, kill, 0)
}

fn pick_with<'a>(
    auto: &'a Automation,
    tickets: &'a [Ticket],
    active: &'a [ActiveRun],
    held: &'a [String],
    kill: bool,
    reserved: usize,
) -> Vec<String> {
    pickup(&PickupInput {
        auto,
        project: "ship",
        tickets,
        active,
        held,
        kill_switch: kill,
        reserved,
    })
    .into_iter()
    .map(|t| t.item.key.clone())
    .collect()
}

fn pr(number: u64, state: PrState) -> PullSnapshot {
    PullSnapshot {
        number,
        title: "t".into(),
        state,
        draft: false,
        head_sha: "abc".into(),
        url: "u".into(),
        ci: Ci::Pending,
        changes_requested: false,
        updated: "2026-10-29T10:00:00Z".into(),
    }
}

// ---- filter (REQ-006)

#[test]
fn default_label_is_shipyard_and_a_match_is_picked() {
    let auto = Automation::default();
    assert_eq!(auto.pickup.label.as_deref(), Some("shipyard"));
    assert_eq!(pick(&auto, &[todo("A-1")], &[], &[], false), ["A-1"]);
}

#[test]
fn a_ticket_without_the_label_is_not_picked() {
    let mut t = todo("A-1");
    t.item.labels = vec!["other".into()];
    assert!(pick(&Automation::default(), &[t], &[], &[], false).is_empty());
}

#[test]
fn a_label_of_null_turns_the_label_filter_off() {
    let mut auto = Automation::default();
    auto.pickup.label = None;
    let mut t = todo("A-1");
    t.item.labels.clear();
    assert_eq!(pick(&auto, &[t], &[], &[], false), ["A-1"]);
}

#[test]
fn the_assignee_matches_by_id_or_name_and_another_member_does_not() {
    let mut auto = Automation::default();
    auto.pickup.assignee = Some("U1".into());
    assert_eq!(pick(&auto, &[todo("A-1")], &[], &[], false), ["A-1"]);
    auto.pickup.assignee = Some("alice".into());
    assert_eq!(pick(&auto, &[todo("A-1")], &[], &[], false), ["A-1"]);
    auto.pickup.assignee = Some("bob".into());
    assert!(pick(&auto, &[todo("A-1")], &[], &[], false).is_empty());
    let mut none = todo("A-2");
    none.item.assignee = None;
    assert!(pick(&auto, &[none], &[], &[], false).is_empty());
}

#[test]
fn an_empty_status_set_means_the_to_do_category() {
    let auto = Automation::default();
    let doing = ticket("A-1", "In Progress", StatusCategory::InProgress);
    assert!(pick(&auto, &[doing], &[], &[], false).is_empty());
}

#[test]
fn a_status_set_matches_names_and_never_a_terminal_ticket() {
    let mut auto = Automation::default();
    auto.pickup.statuses = vec!["ready".into(), "Done".into()];
    let ready = ticket("A-1", "Ready", StatusCategory::Todo);
    let done = ticket("A-2", "Done", StatusCategory::Done);
    let other = todo("A-3");
    assert_eq!(pick(&auto, &[ready, done, other], &[], &[], false), ["A-1"]);
}

#[test]
fn a_status_mapped_to_done_is_terminal() {
    let mut auto = Automation::default();
    auto.status_map.insert(
        "Done".into(),
        StateMapping {
            status: Some("Shipped".into()),
            labels: vec![],
        },
    );
    auto.pickup.statuses = vec!["Shipped".into()];
    let t = ticket("A-1", "Shipped", StatusCategory::InProgress);
    assert!(auto.terminal(&t.item.status));
    assert!(pick(&auto, &[t], &[], &[], false).is_empty());
}

#[test]
fn component_and_priority_must_match_when_set_and_unknown_data_does_not_match() {
    let mut auto = Automation::default();
    auto.pickup.component = Some("api".into());
    auto.pickup.priority = Some("High".into());
    let mut hit = todo("A-1");
    hit.components = vec!["API".into()];
    hit.priority = Some("high".into());
    let mut wrong = todo("A-2");
    wrong.components = vec!["web".into()];
    wrong.priority = Some("High".into());
    let unknown = todo("A-3");
    assert_eq!(
        pick(&auto, &[hit, wrong, unknown], &[], &[], false),
        ["A-1"]
    );
}

#[test]
fn the_kill_switch_stops_every_pickup() {
    assert!(pick(&Automation::default(), &[todo("A-1")], &[], &[], true).is_empty());
}

#[test]
fn a_ticket_with_a_run_or_a_claim_is_not_picked_again() {
    let auto = Automation::default();
    let running = [run("r1", "A-1", RunState::Working)];
    let held = ["A-2".to_string()];
    let all = [todo("A-1"), todo("A-2"), todo("A-3")];
    let mut a = auto.clone();
    a.concurrency.global = 9;
    assert_eq!(pick(&a, &all, &running, &held, false), ["A-3"]);
}

// ---- concurrency (REQ-007)

#[test]
fn five_matches_and_no_setting_give_two_picks_oldest_first() {
    let mut tickets: Vec<_> = (1..=5).map(|i| todo(&format!("A-{i}"))).collect();
    tickets[4].item.updated = "2026-10-01T00:00:00Z".into();
    tickets[3].item.updated = "2026-10-02T00:00:00Z".into();
    assert_eq!(
        pick(&Automation::default(), &tickets, &[], &[], false),
        ["A-5", "A-4"]
    );
}

#[test]
fn active_runs_use_the_global_slots() {
    let tickets = [todo("A-2"), todo("A-3")];
    let active = [run("r1", "A-1", RunState::Working)];
    assert_eq!(
        pick(&Automation::default(), &tickets, &active, &[], false),
        ["A-2"]
    );
    let two = [active[0].clone(), run("r2", "A-9", RunState::Queued)];
    assert!(pick(&Automation::default(), &tickets, &two, &[], false).is_empty());
}

#[test]
fn a_review_uses_a_global_slot_like_a_run() {
    let tickets = [todo("A-2")];
    let auto = Automation::default();
    assert_eq!(pick_with(&auto, &tickets, &[], &[], false, 0), ["A-2"]);
    let one = [run("r1", "A-1", RunState::Working)];
    assert_eq!(pick_with(&auto, &tickets, &one, &[], false, 0), ["A-2"]);
    // One run and one review fill the two global slots.
    assert!(pick_with(&auto, &tickets, &one, &[], false, 1).is_empty());
}

#[test]
fn the_project_limit_counts_only_runs_of_the_project() {
    let mut auto = Automation::default();
    auto.concurrency.global = 5;
    auto.concurrency.per_project = Some(1);
    let mut other = run("r9", "Z-1", RunState::Working);
    other.project = "other".into();
    let tickets = [todo("A-1"), todo("A-2")];
    assert_eq!(pick(&auto, &tickets, &[other], &[], false), ["A-1"]);
    let mine = [run("r1", "A-7", RunState::Working)];
    assert!(pick(&auto, &tickets, &mine, &[], false).is_empty());
}

#[test]
fn a_status_limit_of_one_picks_one_of_two() {
    let mut auto = Automation::default();
    auto.concurrency.global = 5;
    auto.concurrency.per_status.insert("To Do".into(), 1);
    assert_eq!(
        pick(&auto, &[todo("A-1"), todo("A-2")], &[], &[], false),
        ["A-1"]
    );
}

// ---- reconcile (REQ-003, REQ-004)

#[test]
fn changed_tickets_are_the_new_and_the_different() {
    let known = [todo("A-1"), todo("A-2")];
    let mut moved = todo("A-2");
    moved.item.status.name = "Done".into();
    let fetched = [todo("A-1"), moved.clone(), todo("A-3")];
    let keys: Vec<_> = changed_tickets(&known, &fetched)
        .into_iter()
        .map(|t| t.item.key.as_str())
        .collect();
    assert_eq!(keys, ["A-2", "A-3"]);
}

#[test]
fn a_run_whose_ticket_is_terminal_stops_with_the_reason() {
    let auto = Automation::default();
    let tickets = [ticket("A-1", "Done", StatusCategory::Done), todo("A-2")];
    let runs = [
        run("r1", "A-1", RunState::Working),
        run("r2", "A-2", RunState::Working),
    ];
    assert_eq!(
        stops(&auto, &runs, &tickets, &[]),
        [Stop {
            run_id: "r1".into(),
            reason: REASON_TERMINAL.into()
        }]
    );
}

#[test]
fn a_run_whose_pr_merged_is_not_stopped() {
    let auto = Automation::default();
    let tickets = [ticket("A-1", "Done", StatusCategory::Done)];
    let mut r = run("r1", "A-1", RunState::PROpen);
    r.pr = Some(7);
    assert!(stops(&auto, &[r.clone()], &tickets, &[pr(7, PrState::Merged)]).is_empty());
    // An open or closed pull request does not protect the run.
    assert_eq!(
        stops(&auto, &[r.clone()], &tickets, &[pr(7, PrState::Open)]).len(),
        1
    );
    assert_eq!(
        stops(&auto, &[r], &tickets, &[pr(7, PrState::Closed)]).len(),
        1
    );
}

#[test]
fn runs_that_already_end_and_unknown_tickets_are_left_alone() {
    let auto = Automation::default();
    let tickets = [ticket("A-1", "Done", StatusCategory::Done)];
    for s in [
        RunState::Merged,
        RunState::Done,
        RunState::Failed,
        RunState::Cancelled,
    ] {
        assert!(
            stops(&auto, &[run("r", "A-1", s)], &tickets, &[]).is_empty(),
            "{s:?}"
        );
    }
    assert!(
        stops(
            &auto,
            &[run("r", "NOPE-1", RunState::Working)],
            &tickets,
            &[]
        )
        .is_empty()
    );
}

#[test]
fn a_waiting_or_paused_run_stops_too() {
    let auto = Automation::default();
    let tickets = [ticket("A-1", "Done", StatusCategory::Done)];
    for s in [
        RunState::WaitingForAnswer,
        RunState::Paused,
        RunState::Queued,
        RunState::RetryQueued,
    ] {
        assert_eq!(
            stops(&auto, &[run("r", "A-1", s)], &tickets, &[]).len(),
            1,
            "{s:?}"
        );
    }
}

// ---- pull request events (REQ-012)

#[test]
fn pr_events_follow_the_change() {
    let kinds = |known: Vec<PullSnapshot>, now: Vec<PullSnapshot>| -> Vec<PrEventKind> {
        diff_pulls(&known, &now)
            .into_iter()
            .map(|e| e.kind)
            .collect()
    };
    let open = pr(1, PrState::Open);
    assert_eq!(kinds(vec![], vec![open.clone()]), [PrEventKind::Opened]);
    assert!(kinds(vec![open.clone()], vec![open.clone()]).is_empty());
    let merged = PullSnapshot {
        state: PrState::Merged,
        ..open.clone()
    };
    assert_eq!(
        kinds(vec![open.clone()], vec![merged.clone()]),
        [PrEventKind::Merged]
    );
    assert!(
        kinds(
            vec![merged],
            vec![PullSnapshot {
                updated: "x".into(),
                ..pr(1, PrState::Merged)
            }]
        )
        .is_empty()
    );
    let closed = PullSnapshot {
        state: PrState::Closed,
        ..open.clone()
    };
    assert_eq!(
        kinds(vec![open.clone()], vec![closed]),
        [PrEventKind::Closed]
    );
    let asked = PullSnapshot {
        changes_requested: true,
        ..open.clone()
    };
    assert_eq!(
        kinds(vec![open.clone()], vec![asked.clone()]),
        [PrEventKind::ChangesRequested]
    );
    assert!(
        kinds(
            vec![asked],
            vec![PullSnapshot {
                updated: "x".into(),
                changes_requested: true,
                ..open.clone()
            }]
        )
        .is_empty()
    );
    let failing = PullSnapshot {
        ci: Ci::Failing,
        ..open.clone()
    };
    let passing = PullSnapshot {
        ci: Ci::Passing,
        ..open.clone()
    };
    assert_eq!(
        kinds(vec![open.clone()], vec![failing]),
        [PrEventKind::CiFailed]
    );
    assert_eq!(
        kinds(vec![open.clone()], vec![passing]),
        [PrEventKind::CiPassed]
    );
}

// ---- question markers (REQ-011)

fn comment(id: &str, body: &str) -> Comment {
    Comment {
        id: id.into(),
        author: Person {
            id: "u".into(),
            name: "n".into(),
        },
        body: body.into(),
        created: "2026-10-29T10:00:00Z".into(),
    }
}

#[test]
fn a_marker_names_its_question() {
    assert_eq!(
        question_marker("<!-- shipyard:q Q-012 -->\nWhich one?"),
        Some("Q-012")
    );
    assert_eq!(
        question_marker("text <!--  shipyard:q   Q-7  --> text"),
        Some("Q-7")
    );
    assert_eq!(question_marker("<!-- shipyard:q Q-x -->"), None);
    assert_eq!(question_marker("<!-- shipyard:q -->"), None);
    assert_eq!(question_marker("no marker"), None);
}

#[test]
fn a_comment_after_a_marker_answers_the_latest_question() {
    let comments = [
        comment("1", "hello"),
        comment("2", "<!-- shipyard:q Q-001 -->\n1. a\n2. b"),
        comment("3", "2"),
        comment("4", "<!-- shipyard:q Q-002 -->"),
        comment("5", "free text"),
    ];
    let posted = ["2", "4"].map(String::from).into();
    let got: Vec<_> = answers(&comments, &posted)
        .into_iter()
        .map(|a| a.map(str::to_string))
        .collect();
    assert_eq!(
        got,
        [None, None, Some("Q-001".into()), None, Some("Q-002".into())]
    );
}

#[test]
fn the_answer_comment_of_the_system_is_no_reply() {
    assert_eq!(
        answer_marker("<!-- shipyard:a Q-012 -->\nAnswer: 2"),
        Some("Q-012")
    );
    assert_eq!(answer_marker("<!-- shipyard:q Q-012 -->"), None);
    assert_eq!(question_marker("<!-- shipyard:a Q-012 -->"), None);
    let comments = [
        comment("1", "<!-- shipyard:q Q-001 -->\n1. a\n2. b"),
        comment("2", "<!-- shipyard:a Q-001 -->\nAnswer: 2"),
        comment("3", "a person writes later"),
        // A look-alike that the system did not post is a plain comment.
        comment("4", "<!-- shipyard:a Q-001 -->\nAnswer: 1"),
    ];
    let posted = ["1", "2"].map(String::from).into();
    let got: Vec<_> = answers(&comments, &posted)
        .into_iter()
        .map(|a| a.map(str::to_string))
        .collect();
    assert_eq!(
        got,
        [None, None, Some("Q-001".into()), Some("Q-001".into())]
    );
}

#[test]
fn a_marker_counts_only_in_a_comment_that_the_system_posted() {
    let comments = [
        comment("1", "<!-- shipyard:q Q-001 -->\n1. a"),
        comment("2", "<!-- shipyard:q Q-999 -->"),
        comment("3", "> <!-- shipyard:q Q-998 -->\nI think 1"),
        comment("4", "1"),
    ];
    let posted = ["1"].map(String::from).into();
    let got: Vec<_> = answers(&comments, &posted)
        .into_iter()
        .map(|a| a.map(str::to_string))
        .collect();
    // A look-alike or a quoted marker neither opens a question nor moves the open one.
    assert_eq!(
        got,
        [
            None,
            Some("Q-001".into()),
            Some("Q-001".into()),
            Some("Q-001".into())
        ]
    );
    let none = Default::default();
    assert!(answers(&comments, &none).iter().all(Option::is_none));
}

// ---- the file model (REQ-002)

#[test]
fn defaults_and_the_interval_floor() {
    let a = Automation::default();
    assert_eq!((a.interval, a.concurrency.global), (60, 2));
    assert!(!a.writes.push && !a.writes.pull_request);
    assert!(!a.writes.tracker_transition && !a.writes.tracker_comment);
    assert!(a.validate().is_empty());
    let mut bad = Automation {
        interval: 29,
        ..Automation::default()
    };
    bad.status_map
        .insert("Flying".into(), StateMapping::default());
    let fields: Vec<_> = bad.validate().into_iter().map(|i| i.field).collect();
    assert_eq!(fields, ["interval", "status_map.Flying"]);
    bad.interval = 30;
    bad.status_map.clear();
    assert!(bad.validate().is_empty());
}

#[test]
fn the_claim_stamp_follows_the_comment_switch() {
    let mut w = Writes::default();
    assert!(!w.stamp_allowed());
    w.tracker_comment = true;
    assert!(w.stamp_allowed());
}

#[test]
fn a_resolved_handle_matches_every_account_of_the_member() {
    let mut auto = Automation::default();
    // The handle `ana` is not a tracker name. The caller resolved it through the team file.
    auto.pickup.assignee = Some("ana".into());
    assert!(pick(&auto, &[todo("A-1")], &[], &[], false).is_empty());
    auto.pickup.accounts = vec!["U9".into(), "U1".into()];
    assert_eq!(pick(&auto, &[todo("A-1")], &[], &[], false), ["A-1"]);
    auto.pickup.accounts = vec!["U9".into()];
    assert!(pick(&auto, &[todo("A-1")], &[], &[], false).is_empty());
    // Accounts without an assignee filter change nothing.
    auto.pickup.assignee = None;
    assert_eq!(pick(&auto, &[todo("A-1")], &[], &[], false), ["A-1"]);
}

#[test]
fn a_day_budget_key_needs_a_real_month_and_day() {
    let issues = |day: &str| {
        let mut auto = Automation::default();
        auto.budgets.day.insert(day.into(), 5.0);
        auto.validate().len()
    };
    assert_eq!(issues("2026-10-29"), 0);
    assert_eq!(issues("*"), 0);
    for bad in ["2026-13-45", "2026-00-10", "2026-12-32", "2026-01-00"] {
        assert_eq!(issues(bad), 1, "{bad}");
    }
}

// ---- the automatic review (spec `agent-pr`, REQ-006)

fn pull(number: u64, state: PrState, draft: bool, head: &str) -> PullSnapshot {
    PullSnapshot {
        number,
        title: format!("pr {number}"),
        state,
        draft,
        head_sha: head.into(),
        url: String::new(),
        ci: Ci::None,
        changes_requested: false,
        updated: String::new(),
    }
}

#[test]
fn an_open_pull_request_with_no_review_of_its_head_is_due_once() {
    let pulls = [
        pull(1, PrState::Open, false, "a1"),
        pull(2, PrState::Open, false, "b2"),
        pull(3, PrState::Open, true, "c3"),
        pull(4, PrState::Merged, false, "d4"),
    ];
    let none = |_: u64, _: &str| false;
    // Off: nothing is due, whatever the pull requests are.
    assert!(reviews_due(AutoReview::Off, &pulls, none).is_empty());
    let due = reviews_due(AutoReview::Draft, &pulls, none);
    assert_eq!(due, [(1, "a1".to_string()), (2, "b2".to_string())]);
    // The second tick: a review of the head commit exists, so a new head commit alone is due.
    let done = |n: u64, h: &str| (n, h) == (1, "a1");
    assert_eq!(
        reviews_due(AutoReview::Post, &pulls, done),
        [(2, "b2".to_string())]
    );
    let moved = [pull(1, PrState::Open, false, "a9")];
    assert_eq!(reviews_due(AutoReview::Post, &moved, done).len(), 1);
}

#[test]
fn the_automatic_review_choice_defaults_to_off_and_round_trips() {
    assert_eq!(Automation::default().auto_review, AutoReview::Off);
    let a: Automation = serde_json::from_str(r#"{"auto_review":"draft"}"#).unwrap();
    assert_eq!(a.auto_review, AutoReview::Draft);
    assert!(serde_json::from_str::<Automation>(r#"{"auto_review":"maybe"}"#).is_err());
    assert!(
        !serde_json::to_string(&Automation::default())
            .unwrap()
            .contains("auto_review")
    );
}
