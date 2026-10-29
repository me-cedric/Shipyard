//! The run state to tracker status and label mapping of `.shipyard/automation.yaml` (spec
//! `factory`, REQ-008, REQ-025).

use shipyard_core::pickup::{AUTOMATION_FILE, Automation};
use shipyard_core::run::{RunState, staged_labels};
use shipyard_store::automation_file::{
    default_status_map, load_automation, parse_automation, render_automation, status_map,
};

fn labels(
    m: &std::collections::BTreeMap<String, shipyard_core::pickup::StateMapping>,
    s: RunState,
) -> Vec<&str> {
    m[s.as_str()].labels.iter().map(String::as_str).collect()
}

#[test]
fn the_default_map_has_a_row_for_each_of_the_sixteen_states() {
    let m = default_status_map();
    assert_eq!(m.len(), 16);
    for s in RunState::ALL {
        assert!(m.contains_key(s.as_str()), "{s:?}");
    }
    // The plan table.
    assert_eq!(m["Queued"].status, None);
    assert_eq!(m["Working"].status.as_deref(), Some("In Progress"));
    assert_eq!(m["PlanReview"].status.as_deref(), Some("In Progress"));
    assert_eq!(m["WaitingForAnswer"].status.as_deref(), Some("Needs info"));
    assert_eq!(m["PROpen"].status.as_deref(), Some("In Review"));
    assert_eq!(m["Merged"].status.as_deref(), Some("Done"));
    assert_eq!(m["Done"].status.as_deref(), Some("Done"));
    assert_eq!(m["Failed"].status, None);
    assert_eq!(
        labels(&m, RunState::WaitingForAnswer),
        ["shipyard:needs-you"]
    );
    assert_eq!(labels(&m, RunState::PlanReview), ["shipyard:needs-you"]);
    assert_eq!(labels(&m, RunState::SelfReview), ["shipyard:running"]);
    assert!(m["Done"].labels.is_empty() && m["Cancelled"].labels.is_empty());
    // Every status row that the table gives, and the map validates as a file.
    let a = Automation {
        status_map: m,
        ..Automation::default()
    };
    assert_eq!(
        parse_automation(&render_automation(&a).unwrap()).unwrap(),
        a
    );
}

#[test]
fn a_file_row_replaces_its_default_row_and_a_missing_row_keeps_the_default() {
    let a = parse_automation(
        "status_map:\n  WaitingForAnswer:\n    status: Blocked\n    labels: [asking]\n",
    )
    .unwrap();
    let m = status_map(&a);
    assert_eq!(m.len(), 16);
    assert_eq!(m["WaitingForAnswer"].status.as_deref(), Some("Blocked"));
    assert_eq!(labels(&m, RunState::WaitingForAnswer), ["asking"]);
    assert_eq!(m["Working"], default_status_map()["Working"]);
    // No file rows at all: the defaults.
    assert_eq!(status_map(&Automation::default()), default_status_map());
}

#[test]
fn the_labels_follow_a_move_through_the_core_rule() {
    let m = status_map(&Automation::default());
    let to = |cur: &[&str], s| {
        staged_labels(
            &cur.iter().map(|c| c.to_string()).collect::<Vec<_>>(),
            &m,
            s,
        )
    };
    // A person's label stays. The label of the old state goes.
    assert_eq!(
        to(&["bug", "shipyard:running"], RunState::WaitingForAnswer),
        ["bug", "shipyard:needs-you"]
    );
    assert_eq!(to(&["bug", "shipyard:needs-you"], RunState::Done), ["bug"]);
}

fn put(dir: &std::path::Path, text: &str) {
    std::fs::create_dir_all(dir.join(".shipyard")).unwrap();
    std::fs::write(dir.join(AUTOMATION_FILE), text).unwrap();
}

#[test]
fn a_bad_file_keeps_the_last_valid_automation_and_names_the_line() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "interval: 45\n");
    let first = load_automation(dir.path(), &Automation::default()).unwrap();
    assert_eq!(first.automation.interval, 45);
    assert!(first.issues.is_none());

    put(
        dir.path(),
        "interval: 45\nstatus_map:\n  Flying:\n    status: x\n",
    );
    let l = load_automation(dir.path(), &first.automation).unwrap();
    assert_eq!(
        l.automation, first.automation,
        "the last valid mapping stays"
    );
    assert_eq!(l.issues.as_ref().unwrap()[0].0, Some(3));

    // A fixed file loads, a missing file is the defaults.
    put(dir.path(), "interval: 50\n");
    assert_eq!(
        load_automation(dir.path(), &l.automation)
            .unwrap()
            .automation
            .interval,
        50
    );
    std::fs::remove_file(dir.path().join(AUTOMATION_FILE)).unwrap();
    let gone = load_automation(dir.path(), &l.automation).unwrap();
    assert_eq!(gone.automation, Automation::default());
    assert!(gone.issues.is_none());
}
