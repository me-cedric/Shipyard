//! Codec tests for the work files (spec `work`, REQ-003, REQ-009, REQ-010, REQ-017, REQ-021).
//! The files hold decisions and entries only: no total and no computed date.

use shipyard_core::work::*;
use shipyard_store::seal::{self, SealError};
use shipyard_store::work::*;
use std::collections::BTreeMap;

const TEAM: &str = "\
members:
  - name: Ana
    handle: ana
    trackers: [ana-gh, 5b10a2844c20165700ede21g]
    role: dev
    capacity: 4
    skills: [api, rust]
    dayRate: 600
    availability:
      from: 2026-11-02
      absences:
        - { from: 2026-12-24, to: 2026-12-31 }
  - name: Bob
    handle: bob
    role: qa
    capacity: 5
";

fn team() -> Team {
    read_team(TEAM, None).unwrap()
}

const SHEET: &str = "\
name: Lot 1
currency: EUR
marginRate: 0.1
features:
  - id: login
    name: Login
    tasks:
      - { id: build-login, name: Build, role: dev, days: 5 }
      - { id: test-login, name: Test, role: qa, percent: 20, ticket: PROJ-12 }
";

// ---- team (REQ-003)

#[test]
fn a_team_file_reads_every_field() {
    let t = team();
    assert_eq!(t.members.len(), 2);
    let ana = &t.members[0];
    assert_eq!(
        (ana.handle.as_str(), ana.role.as_str(), ana.capacity),
        ("ana", "dev", 4.0)
    );
    assert_eq!(ana.trackers, ["ana-gh", "5b10a2844c20165700ede21g"]);
    assert_eq!(ana.skills, ["api", "rust"]);
    assert_eq!(ana.day_rate, Some(600.0));
    assert_eq!(ana.availability.from.as_deref(), Some("2026-11-02"));
    assert_eq!(ana.availability.absences[0].to, "2026-12-31");
    assert_eq!(t.members[1].day_rate, None);
    assert!(!t.locked);
}

#[test]
fn a_duplicate_handle_is_refused_by_name() {
    let text = TEAM.replace("handle: bob", "handle: ana");
    let err = read_team(&text, None).unwrap_err();
    assert_eq!(err.to_string(), "duplicate handle `ana`");
}

#[test]
fn the_last_valid_team_stays_when_a_file_is_refused() {
    let last = team();
    let load = load_team(
        Some(&TEAM.replace("handle: bob", "handle: ana")),
        None,
        &last,
    );
    assert_eq!(load.team, last);
    assert_eq!(load.error.as_deref(), Some("duplicate handle `ana`"));
    let ok = load_team(Some(TEAM), None, &Team::default());
    assert!(ok.error.is_none() && ok.team.members.len() == 2);
    assert_eq!(
        load_team(None, None, &last).team,
        Team::default(),
        "no file is an empty team"
    );
}

#[test]
fn an_unknown_key_is_refused_so_no_total_hides_in_the_team() {
    assert!(read_team(&format!("{TEAM}totalCost: 5\n"), None).is_err());
}

#[test]
fn a_team_round_trips_and_stays_text() {
    let t = team();
    let text = write_team(&t, None).unwrap();
    assert!(text.contains("dayRate: 600.0") || text.contains("dayRate: 600"));
    assert_eq!(read_team(&text, None).unwrap(), t);
}

// ---- seal of the day rate (REQ-005)

#[test]
fn a_sealed_rate_is_unreadable_and_opens_with_the_passphrase() {
    let t = team();
    let text = write_team(&t, Some("pw")).unwrap();
    assert!(!text.contains("dayRate: 6"), "{text}");
    assert!(text.contains(seal::PREFIX));
    assert!(text.contains("capacity"), "only the rate is sealed");
    assert_eq!(read_team(&text, Some("pw")).unwrap(), t);
    assert_eq!(
        read_team(&text, Some("other")).unwrap_err().to_string(),
        SealError::WrongPassphrase.to_string()
    );
}

#[test]
fn a_locked_machine_hides_the_rate_and_refuses_to_write() {
    let text = write_team(&team(), Some("pw")).unwrap();
    let locked = read_team(&text, None).unwrap();
    assert!(locked.locked);
    assert_eq!(locked.members[0].day_rate, None);
    assert_eq!(locked.members[0].name, "Ana");
    // a write would drop the sealed rate
    assert!(write_team(&locked, None).is_err());
    assert!(write_team(&locked, Some("pw")).is_err());
}

// ---- sheet (REQ-009, REQ-010)

#[test]
fn a_sheet_reads_and_round_trips() {
    let s = read_sheet(SHEET, None).unwrap();
    assert_eq!(s.features[0].tasks[1].percent, Some(20.0));
    assert_eq!(s.features[0].tasks[1].ticket.as_deref(), Some("PROJ-12"));
    let text = write_sheet(&s, None).unwrap();
    assert_eq!(read_sheet(&text, None).unwrap(), s);
}

#[test]
fn the_sheet_file_holds_no_computed_total() {
    let s = read_sheet(SHEET, None).unwrap();
    let text = write_sheet(&s, None).unwrap().to_lowercase();
    for word in ["total", "cost", "price", "margin:", "spent"] {
        assert!(!text.contains(word), "`{word}` in {text}");
    }
    // a hand-written total is refused, not kept
    assert!(read_sheet(&format!("{SHEET}total: 12\n"), None).is_err());
    assert!(read_sheet(&SHEET.replace("days: 5 }", "days: 5, cost: 3000 }"), None).is_err());
}

#[test]
fn a_bad_sheet_is_refused_with_the_reason() {
    let err = read_sheet(&SHEET.replace("build-login", "Build Login"), None).unwrap_err();
    assert!(err.to_string().contains("not a row id"), "{err}");
    let err = read_sheet(&SHEET.replace("percent: 20", "percent: 20, days: 2"), None).unwrap_err();
    assert!(err.to_string().contains("days or percent"), "{err}");
}

#[test]
fn a_sealed_sheet_shows_unreadable_text_and_a_locked_state() {
    let s = read_sheet(SHEET, None).unwrap();
    let text = write_sheet(&s, Some("pw")).unwrap();
    assert!(seal::is_sealed(&text));
    assert!(!text.contains("Login") && !text.contains("marginRate"));
    assert_eq!(read_sheet(&text, Some("pw")).unwrap(), s);
    assert!(matches!(
        read_sheet(&text, None),
        Err(WorkError::Seal(SealError::Locked))
    ));
    assert!(matches!(
        read_sheet(&text, Some("no")),
        Err(WorkError::Seal(SealError::WrongPassphrase))
    ));
}

#[test]
fn one_sealer_reads_and_writes_many_files() {
    let mut sealer = seal::Sealer::new("pw").unwrap();
    let s = read_sheet(SHEET, None).unwrap();
    let one = write_sheet_with(&s, Some(&mut sealer)).unwrap();
    let two = write_sheet_with(&s, Some(&mut sealer)).unwrap();
    assert_ne!(one, two, "a fresh nonce for each write");
    for text in [&one, &two] {
        assert_eq!(read_sheet_with(text, Some(&mut sealer)).unwrap(), s);
        assert_eq!(read_sheet(text, Some("pw")).unwrap(), s);
    }
    let team_text = write_team_with(&team(), Some(&mut sealer)).unwrap();
    assert_eq!(
        read_team_with(&team_text, Some(&mut sealer)).unwrap(),
        team()
    );
    assert!(matches!(
        read_sheet_with(&one, None),
        Err(WorkError::Seal(SealError::Locked))
    ));
}

#[test]
fn the_paths_are_fixed() {
    assert_eq!(TEAM_PATH, ".shipyard/team.yaml");
    assert_eq!(sheet_path("lot-1").unwrap(), "docs/costing/lot-1.yaml");
    assert!(sheet_path("../x").is_err());
    assert!(sheet_path("Lot 1").is_err());
}

// ---- plan decisions and calendar (REQ-017)

#[test]
fn decisions_hold_an_order_a_start_and_a_member_only() {
    let d = Decisions {
        order: vec!["est:lot#b".into(), "est:lot#a".into()],
        tasks: BTreeMap::from([(
            "est:lot#a".into(),
            TaskDecision {
                start: Some("2026-11-09".into()),
                member: Some("ana".into()),
            },
        )]),
    };
    let text = write_decisions(&d).unwrap();
    assert_eq!(read_decisions(&text).unwrap(), d);
    // a computed date has no key to live in
    assert!(read_decisions("tasks:\n  est:lot#a: { end: 2026-11-12 }\n").is_err());
    assert!(read_decisions("bars: []\n").is_err());
}

#[test]
fn a_decision_with_a_bad_ref_or_date_is_refused() {
    assert!(read_decisions("tasks:\n  nope: { start: 2026-11-09 }\n").is_err());
    assert!(read_decisions("tasks:\n  est:lot#a: { start: 2026-02-31 }\n").is_err());
    assert!(
        read_decisions("order: [est:lot]\n").is_err(),
        "a sheet ref is not a task ref"
    );
}

#[test]
fn a_calendar_reads_working_days_and_holidays() {
    let c = read_calendar("workingDays: [1, 2, 3, 4]\nholidays: [2026-12-25]\n").unwrap();
    assert_eq!(c.working_days, [1, 2, 3, 4]);
    assert_eq!(read_calendar(&write_calendar(&c).unwrap()).unwrap(), c);
    assert!(read_calendar("workingDays: [0]\n").is_err());
    assert!(read_calendar("holidays: [2026-02-30]\n").is_err());
    assert_eq!(read_calendar("").unwrap(), Calendar::default());
}

// ---- time (REQ-021)

fn entry(id: &str, day: &str) -> TimeEntry {
    TimeEntry {
        id: id.into(),
        day: day.into(),
        minutes: 90,
        note: "review".into(),
        ticket: Some("PROJ-12".into()),
        worklog: None,
    }
}

#[test]
fn a_time_file_is_one_file_for_each_member_and_month() {
    assert_eq!(
        time_path("ana", "2026-10-29").unwrap(),
        "docs/time/ana/2026-10.yaml"
    );
    assert_eq!(
        time_path("ana", "2026-11-01").unwrap(),
        "docs/time/ana/2026-11.yaml"
    );
    assert!(time_path("../ana", "2026-10-29").is_err());
    assert!(time_path("ana", "2026-10-99").is_err());
}

#[test]
fn time_entries_round_trip_with_their_receipt() {
    let mut sent = entry("e2", "2026-10-30");
    sent.worklog = Some("10234".into());
    let list = vec![entry("e1", "2026-10-29"), sent];
    let text = write_time(&list).unwrap();
    assert_eq!(read_time(&text).unwrap(), list);
    assert!(!text.contains("hours") && !text.contains("total"));
}

#[test]
fn a_time_file_refuses_two_months_a_repeated_id_and_an_empty_duration() {
    assert!(write_time(&[entry("e1", "2026-10-29"), entry("e2", "2026-11-01")]).is_err());
    assert!(write_time(&[entry("e1", "2026-10-29"), entry("e1", "2026-10-30")]).is_err());
    let mut zero = entry("e1", "2026-10-29");
    zero.minutes = 0;
    assert!(write_time(&[zero]).is_err());
    assert!(
        read_time("entries:\n  - { id: e1, day: 2026-10-29, minutes: 5, hours: 1 }\n").is_err()
    );
    assert_eq!(read_time("").unwrap(), vec![]);
}

#[test]
fn adding_an_entry_keeps_the_file_sorted_and_refuses_a_repeat() {
    let text = time_add(None, entry("e2", "2026-10-30")).unwrap();
    let text = time_add(Some(&text), entry("e1", "2026-10-29")).unwrap();
    let ids: Vec<String> = read_time(&text)
        .unwrap()
        .into_iter()
        .map(|e| e.id)
        .collect();
    assert_eq!(ids, ["e1", "e2"]);
    assert!(time_add(Some(&text), entry("e1", "2026-10-31")).is_err());
}
