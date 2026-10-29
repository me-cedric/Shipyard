//! The `.shipyard/automation.yaml` codec (spec `sync`, REQ-002, REQ-004, REQ-006, REQ-007).

use shipyard_core::pickup::{AUTOMATION_FILE, Automation, StateMapping};
use shipyard_store::automation_file::{
    AutomationRead, parse_automation, read_automation, render_automation, set_budget,
    write_automation,
};

const FULL: &str = "\
interval: 45
pickup:
  assignee: alice
  label: ready
  statuses: [To Do, Ready]
  component: api
  priority: High
concurrency:
  global: 3
  per_project: 2
  per_status:
    Ready: 1
status_map:
  Working:
    status: In Progress
    labels: [shipyard-working]
  Done:
    status: Closed
writes:
  push: true
  tracker_comment: true
reviewers: [bob, carol]
assignee: dave
";

#[test]
fn an_empty_file_gives_the_defaults() {
    assert_eq!(parse_automation("").unwrap(), Automation::default());
    assert_eq!(
        parse_automation("pickup: {}\n").unwrap(),
        Automation::default()
    );
}

#[test]
fn every_part_is_read() {
    let a = parse_automation(FULL).unwrap();
    assert_eq!(a.interval, 45);
    assert_eq!(a.pickup.assignee.as_deref(), Some("alice"));
    assert_eq!(a.pickup.label.as_deref(), Some("ready"));
    assert_eq!(a.pickup.statuses, ["To Do", "Ready"]);
    assert_eq!(a.pickup.component.as_deref(), Some("api"));
    assert_eq!(a.pickup.priority.as_deref(), Some("High"));
    assert_eq!(a.concurrency.global, 3);
    assert_eq!(a.concurrency.per_project, Some(2));
    assert_eq!(a.concurrency.per_status["Ready"], 1);
    assert_eq!(a.reviewers, ["bob", "carol"]);
    assert_eq!(a.assignee.as_deref(), Some("dave"));
    assert_eq!(
        a.status_map["Working"],
        StateMapping {
            status: Some("In Progress".into()),
            labels: vec!["shipyard-working".into()]
        }
    );
    assert_eq!(a.status_map["Done"].status.as_deref(), Some("Closed"));
    assert!(a.writes.push && a.writes.tracker_comment);
    assert!(!a.writes.pull_request && !a.writes.tracker_transition);
}

#[test]
fn write_switches_default_off_and_a_null_label_turns_the_filter_off() {
    let a = parse_automation("pickup:\n  label: ~\n").unwrap();
    assert_eq!(a.pickup.label, None);
    let w = parse_automation("writes: {}\n").unwrap().writes;
    assert!(!w.push && !w.pull_request && !w.tracker_transition && !w.tracker_comment);
}

#[test]
fn an_interval_under_30_is_refused_with_its_line() {
    let issues = parse_automation("pickup: {}\ninterval: 10\n").unwrap_err();
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].0, Some(2));
    assert!(issues[0].1.contains("interval"), "{:?}", issues[0]);
    assert!(parse_automation("interval: 30\n").is_ok());
}

#[test]
fn an_unknown_key_a_bad_run_state_and_a_wrong_type_are_refused() {
    assert!(parse_automation("surprise: 1\n").is_err());
    assert!(parse_automation("pickup:\n  colour: red\n").is_err());
    assert!(parse_automation("writes:\n  deploy: true\n").is_err());
    assert!(parse_automation("status_map:\n  Flying:\n    status: x\n").is_err());
    assert!(parse_automation("concurrency:\n  global: many\n").is_err());
}

#[test]
fn reviewers_and_assignee_are_optional_and_stay_out_when_unset() {
    let a = parse_automation("interval: 60\n").unwrap();
    assert!(a.reviewers.is_empty() && a.assignee.is_none());
    let text = render_automation(&a).unwrap();
    assert!(
        !text.contains("reviewers") && !text.contains("assignee"),
        "{text}"
    );
    assert!(parse_automation("reviewers: alice\n").is_err());
}

#[test]
fn render_then_parse_gives_the_same_value() {
    let a = parse_automation(FULL).unwrap();
    assert_eq!(
        parse_automation(&render_automation(&a).unwrap()).unwrap(),
        a
    );
    let d = Automation::default();
    let text = render_automation(&d).unwrap();
    assert!(!text.contains("assignee"), "{text}");
    assert_eq!(parse_automation(&text).unwrap(), d);
    // A null label must come back as a null label, not as the default.
    let mut none = Automation::default();
    none.pickup.label = None;
    assert_eq!(
        parse_automation(&render_automation(&none).unwrap()).unwrap(),
        none
    );
}

#[test]
fn a_missing_file_reads_as_missing_and_the_caller_uses_the_defaults() {
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(
        read_automation(dir.path()).unwrap(),
        AutomationRead::Missing
    ));
}

#[test]
fn write_then_read_and_an_invalid_value_is_never_written() {
    let dir = tempfile::tempdir().unwrap();
    let a = parse_automation(FULL).unwrap();
    write_automation(dir.path(), &a).unwrap();
    assert!(dir.path().join(AUTOMATION_FILE).exists());
    match read_automation(dir.path()).unwrap() {
        AutomationRead::Valid(got) => assert_eq!(got, a),
        _ => panic!("expected a valid file"),
    }
    let mut bad = a.clone();
    bad.interval = 5;
    assert!(write_automation(dir.path(), &bad).is_err());
    match read_automation(dir.path()).unwrap() {
        AutomationRead::Valid(got) => assert_eq!(got.interval, 45, "the old file stays"),
        _ => panic!("expected a valid file"),
    }
}

#[test]
fn a_broken_file_reads_as_invalid() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".shipyard")).unwrap();
    std::fs::write(dir.path().join(AUTOMATION_FILE), "interval: 3\n").unwrap();
    assert!(matches!(
        read_automation(dir.path()).unwrap(),
        AutomationRead::Invalid(_)
    ));
}

#[test]
fn budgets_default_to_none_and_stay_out_of_the_file() {
    let a = parse_automation("interval: 60\n").unwrap();
    assert!(a.budgets.is_empty());
    assert!(!render_automation(&a).unwrap().contains("budgets"));
}

#[test]
fn a_budgets_block_is_read_and_its_keys_and_values_are_checked() {
    let a = parse_automation(
        "budgets:\n  day:\n    '*': 20\n    2026-10-29: 5.5\n  member:\n    Alice: 10\n",
    )
    .unwrap();
    assert_eq!(a.budgets.for_day("2026-10-29"), Some(5.5));
    assert_eq!(a.budgets.for_day("2026-10-30"), Some(20.0));
    assert_eq!(a.budgets.for_member("Alice"), Some(10.0));
    assert_eq!(a.budgets.for_member("Bob"), None);
    for bad in [
        "budgets:\n  day:\n    monday: 5\n",
        "budgets:\n  day:\n    '*': 0\n",
        "budgets:\n  member:\n    Alice: -1\n",
        "budgets:\n  week: {}\n",
        "budgets:\n  member:\n    Alice: many\n",
    ] {
        assert!(parse_automation(bad).is_err(), "{bad}");
    }
}

#[test]
fn set_budget_writes_clears_and_refuses() {
    let dir = tempfile::tempdir().unwrap();
    set_budget(dir.path(), "member", "Alice", Some(7.0)).unwrap();
    set_budget(dir.path(), "day", "*", Some(30.0)).unwrap();
    let AutomationRead::Valid(a) = read_automation(dir.path()).unwrap() else {
        panic!("expected a valid file");
    };
    assert_eq!(a.budgets.for_member("Alice"), Some(7.0));
    assert_eq!(a.budgets.for_day("2026-01-01"), Some(30.0));
    set_budget(dir.path(), "member", "Alice", None).unwrap();
    assert!(set_budget(dir.path(), "week", "x", Some(1.0)).is_err());
    assert!(set_budget(dir.path(), "day", "monday", Some(1.0)).is_err());
    assert!(set_budget(dir.path(), "member", "Bob", Some(-2.0)).is_err());
    let AutomationRead::Valid(a) = read_automation(dir.path()).unwrap() else {
        panic!("expected a valid file");
    };
    assert_eq!(a.budgets.for_member("Alice"), None, "cleared");
    assert_eq!(
        a.budgets.for_day("2026-01-01"),
        Some(30.0),
        "refusals kept the file"
    );
}
