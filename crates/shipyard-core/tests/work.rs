//! Work rules (spec `work`, REQ-003, REQ-007, REQ-010, REQ-011, REQ-016, REQ-017, REQ-024, REQ-025).

use shipyard_core::work::*;
use shipyard_core::work_item::{Status, StatusCategory, TimeTracking, WorkItem, WorkKind};
use std::collections::BTreeMap;

fn member(handle: &str, role: &str, capacity: f64, skills: &[&str], rate: f64) -> Member {
    Member {
        name: handle.to_uppercase(),
        handle: handle.into(),
        trackers: vec![format!("acct-{handle}")],
        role: role.into(),
        capacity,
        skills: skills.iter().map(|s| s.to_string()).collect(),
        day_rate: Some(rate),
        availability: Availability::default(),
    }
}

fn team(members: Vec<Member>) -> Team {
    Team {
        members,
        locked: false,
    }
}

fn task(id: &str, role: &str, days: f64) -> Task {
    Task {
        id: id.into(),
        name: format!("Task {id}"),
        role: role.into(),
        days: Some(days),
        ..Task::default()
    }
}

fn sheet(tasks: Vec<Task>) -> Sheet {
    Sheet {
        name: "Lot 1".into(),
        currency: "EUR".into(),
        margin_rate: 0.1,
        features: vec![Feature {
            id: "login".into(),
            name: "Login".into(),
            description: String::new(),
            tasks,
        }],
        frozen: false,
    }
}

fn rates(pairs: &[(&str, f64)]) -> BTreeMap<String, f64> {
    pairs.iter().map(|(k, v)| (k.to_string(), *v)).collect()
}

// ---- dates

#[test]
fn dates_round_trip_and_refuse_a_fake_day() {
    assert_eq!(iso(parse_day("2026-10-29").unwrap()), "2026-10-29");
    assert_eq!(
        parse_day("2026-10-30").unwrap() - parse_day("2026-10-29").unwrap(),
        1
    );
    assert_eq!(iso(parse_day("2028-02-29").unwrap()), "2028-02-29");
    assert!(parse_day("2027-02-29").is_none());
    assert!(parse_day("2026-13-01").is_none());
    assert!(parse_day("29/10/2026").is_none());
    assert!(parse_day("2026-1-01").is_none());
}

// ---- team (REQ-003)

#[test]
fn a_duplicate_handle_is_named() {
    let t = team(vec![
        member("ana", "dev", 5.0, &[], 500.0),
        member("ana", "qa", 5.0, &[], 400.0),
    ]);
    assert_eq!(t.check().unwrap_err(), "duplicate handle `ana`");
}

#[test]
fn a_tracker_account_that_two_members_share_is_refused() {
    let mut a = member("ana", "dev", 5.0, &[], 500.0);
    let mut b = member("bob", "dev", 5.0, &[], 500.0);
    a.trackers = vec!["Shared".into()];
    b.trackers = vec!["shared".into()];
    assert_eq!(
        team(vec![a, b]).check().unwrap_err(),
        "duplicate handle `shared`"
    );
}

#[test]
fn a_member_may_list_its_own_handle_as_a_tracker_account() {
    let mut a = member("ana", "dev", 5.0, &[], 500.0);
    a.trackers = vec!["ana".into()];
    assert!(team(vec![a]).check().is_ok());
}

#[test]
fn a_bad_handle_and_a_bad_capacity_are_refused() {
    assert!(
        team(vec![member("Ana Dupont", "dev", 5.0, &[], 1.0)])
            .check()
            .is_err()
    );
    assert!(
        team(vec![member("ana", "dev", 9.0, &[], 1.0)])
            .check()
            .is_err()
    );
}

#[test]
fn resolve_finds_a_member_by_handle_or_tracker_account() {
    let t = team(vec![member("ana", "dev", 5.0, &[], 500.0)]);
    assert_eq!(t.resolve("ANA").unwrap().handle, "ana");
    assert_eq!(t.resolve("acct-ana").unwrap().handle, "ana");
    assert!(t.resolve("nobody").is_none());
}

// ---- suggestion (REQ-007)

#[test]
fn the_skill_and_free_capacity_rank_the_members() {
    let t = team(vec![
        member("bob", "dev", 5.0, &["ui"], 500.0),
        member("ana", "dev", 4.0, &["api"], 500.0),
    ]);
    let ranked = suggest(&["api".into()], &t, &BTreeMap::new());
    assert_eq!(ranked[0].handle, "ana");
    assert!(ranked[0].reasons.contains(&Reason::Skill {
        skill: "api".into()
    }));
    assert!(ranked[0].reasons.contains(&Reason::FreeDays { days: 4.0 }));
    assert_eq!(ranked[1].handle, "bob");
    assert!(ranked[1].reasons.contains(&Reason::MissingSkill {
        skill: "api".into()
    }));
}

#[test]
fn a_full_member_with_the_skill_still_ranks_above_a_free_one_without_it() {
    let t = team(vec![
        member("ana", "dev", 4.0, &["api"], 500.0),
        member("bob", "dev", 5.0, &[], 500.0),
    ]);
    let booked = BTreeMap::from([("ana".to_string(), 4.0)]);
    let ranked = suggest(&["API".into()], &t, &booked);
    assert_eq!(ranked[0].handle, "ana");
    assert!(ranked[0].reasons.contains(&Reason::Full));
}

#[test]
fn equal_scores_sort_by_handle() {
    let t = team(vec![
        member("bob", "dev", 5.0, &[], 1.0),
        member("ana", "dev", 5.0, &[], 1.0),
    ]);
    let ranked = suggest(&[], &t, &BTreeMap::new());
    assert_eq!(
        ranked.iter().map(|s| s.handle.as_str()).collect::<Vec<_>>(),
        ["ana", "bob"]
    );
}

// ---- effort maths (REQ-010, REQ-011)

#[test]
fn a_percent_task_takes_a_share_of_the_build_and_never_feeds_it() {
    let mut qa = task("qa", "qa", 0.0);
    qa.days = None;
    qa.percent = Some(20.0);
    let mut licence = task("licence", "dev", 4.0);
    licence.other = true;
    let s = sheet(vec![
        task("a", "dev", 10.0),
        task("b", "dev", 5.0),
        licence,
        qa,
    ]);
    s.check().unwrap();
    assert_eq!(build_days(&s), 15.0);
    let t = totals(&s, &rates(&[("dev", 500.0), ("qa", 400.0)]));
    // 10 + 5 + 4 + 3 (20 % of 15)
    assert_eq!(t.days, 22.0);
    assert_eq!(t.cost, 19.0 * 500.0 + 3.0 * 400.0);
    assert!((t.price - t.cost * 1.1).abs() < 1e-6);
    assert!((t.margin - t.cost * 0.1).abs() < 1e-6);
    assert!(t.unrated.is_empty());
}

#[test]
fn a_ratio_lands_on_a_whole_hour() {
    assert_eq!(round_to_hour(0.470_833), 0.5);
    assert_eq!(round_to_hour(1.0), 1.0);
}

#[test]
fn a_role_with_no_rate_costs_nothing_and_is_named() {
    let t = totals(
        &sheet(vec![task("a", "ghost", 3.0)]),
        &rates(&[("dev", 500.0)]),
    );
    assert_eq!((t.days, t.cost), (3.0, 0.0));
    assert_eq!(t.unrated, ["ghost"]);
}

#[test]
fn the_rate_of_a_shared_role_is_the_mean() {
    let t = team(vec![
        member("ana", "Dev", 5.0, &[], 400.0),
        member("bob", "dev", 5.0, &[], 600.0),
        member("cy", "qa", 5.0, &[], 300.0),
    ]);
    let r = role_rates(&t);
    assert_eq!(r["dev"], 500.0);
    assert_eq!(r["qa"], 300.0);
}

#[test]
fn a_sheet_needs_days_or_percent_and_a_valid_unique_id() {
    let mut both = task("a", "dev", 1.0);
    both.percent = Some(10.0);
    assert!(sheet(vec![both]).check().is_err());
    let mut none = task("a", "dev", 1.0);
    none.days = None;
    assert!(sheet(vec![none]).check().is_err());
    assert!(sheet(vec![task("A b", "dev", 1.0)]).check().is_err());
    assert!(
        sheet(vec![task("a", "dev", 1.0), task("a", "dev", 1.0)])
            .check()
            .is_err()
    );
    assert!(sheet(vec![task("login", "dev", 1.0)]).check().is_err()); // the feature has this id
}

#[test]
fn the_portfolio_adds_the_sheets() {
    let a = sheet(vec![task("a", "dev", 10.0)]);
    let b = sheet(vec![task("b", "dev", 5.0)]);
    let r = rates(&[("dev", 100.0)]);
    let p = portfolio(&[("one".into(), a.clone()), ("two".into(), b.clone())], &r);
    assert_eq!(p.total.days, 15.0);
    assert_eq!(p.total.cost, totals(&a, &r).cost + totals(&b, &r).cost);
    assert_eq!(p.sheets.len(), 2);
}

// ---- Gantt (REQ-016, REQ-017)

fn plan(s: &Sheet, t: &Team, c: &Calendar, d: &Decisions) -> Gantt {
    gantt("lot", s, t, c, d, "2026-11-02") // a Monday
}

#[test]
fn one_member_works_the_tasks_in_order() {
    let t = team(vec![member("ana", "dev", 5.0, &[], 500.0)]);
    let s = sheet(vec![task("a", "dev", 2.0), task("b", "dev", 3.0)]);
    let g = plan(&s, &t, &Calendar::default(), &Decisions::default());
    assert_eq!(
        (g.bars[0].start.as_str(), g.bars[0].end.as_str()),
        ("2026-11-02", "2026-11-03")
    );
    assert_eq!(
        (g.bars[1].start.as_str(), g.bars[1].end.as_str()),
        ("2026-11-04", "2026-11-06")
    );
    assert_eq!(g.bars[0].member.as_deref(), Some("ana"));
}

#[test]
fn a_part_time_member_takes_longer() {
    let t = team(vec![member("ana", "dev", 2.5, &[], 500.0)]);
    let g = plan(
        &sheet(vec![task("a", "dev", 2.0)]),
        &t,
        &Calendar::default(),
        &Decisions::default(),
    );
    // half a day each working day: four working days
    assert_eq!(g.bars[0].end, "2026-11-05");
}

#[test]
fn a_weekend_a_holiday_and_an_absence_hold_the_work() {
    let mut m = member("ana", "dev", 5.0, &[], 500.0);
    m.availability.absences = vec![Span {
        from: "2026-11-03".into(),
        to: "2026-11-03".into(),
    }];
    let cal = Calendar {
        holidays: vec!["2026-11-05".into()],
        ..Calendar::default()
    };
    let g = plan(
        &sheet(vec![task("a", "dev", 4.0)]),
        &team(vec![m]),
        &cal,
        &Decisions::default(),
    );
    // Mon 2, (Tue 3 absent), Wed 4, (Thu 5 holiday), Fri 6, (weekend), Mon 9
    assert_eq!(
        (g.bars[0].start.as_str(), g.bars[0].end.as_str()),
        ("2026-11-02", "2026-11-09")
    );
}

#[test]
fn availability_dates_bound_the_work() {
    let mut m = member("ana", "dev", 5.0, &[], 500.0);
    m.availability.from = Some("2026-11-09".into());
    let g = plan(
        &sheet(vec![task("a", "dev", 1.0)]),
        &team(vec![m]),
        &Calendar::default(),
        &Decisions::default(),
    );
    assert_eq!(g.bars[0].start, "2026-11-09");
}

#[test]
fn a_fixed_start_and_a_member_choice_are_kept() {
    let t = team(vec![
        member("ana", "dev", 5.0, &[], 1.0),
        member("bob", "dev", 5.0, &[], 1.0),
    ]);
    let s = sheet(vec![task("a", "dev", 1.0)]);
    let d = Decisions {
        tasks: BTreeMap::from([(
            "est:lot#a".into(),
            TaskDecision {
                start: Some("2026-11-11".into()),
                member: Some("bob".into()),
            },
        )]),
        ..Decisions::default()
    };
    let no_country = Calendar {
        country: String::new(),
        ..Calendar::default()
    };
    let g = plan(&s, &t, &no_country, &d);
    assert_eq!(g.bars[0].member.as_deref(), Some("bob"));
    assert_eq!(g.bars[0].start, "2026-11-11");
    // France is the default country: 11 November is a public holiday, so the work starts the next day.
    let g = plan(&s, &t, &Calendar::default(), &d);
    assert_eq!(g.bars[0].start, "2026-11-12");
}

#[test]
fn a_task_with_no_choice_goes_to_the_member_of_its_role_who_finishes_first() {
    let t = team(vec![
        member("ana", "dev", 5.0, &[], 1.0),
        member("bob", "dev", 5.0, &[], 1.0),
    ]);
    let s = sheet(vec![task("a", "dev", 5.0), task("b", "dev", 1.0)]);
    let g = plan(&s, &t, &Calendar::default(), &Decisions::default());
    assert_eq!(g.bars[0].member.as_deref(), Some("ana"));
    assert_eq!(g.bars[1].member.as_deref(), Some("bob"));
    assert_eq!(g.bars[1].start, "2026-11-02");
}

#[test]
fn the_order_decision_gives_capacity_first() {
    let t = team(vec![member("ana", "dev", 5.0, &[], 1.0)]);
    let s = sheet(vec![task("a", "dev", 2.0), task("b", "dev", 2.0)]);
    let d = Decisions {
        order: vec!["est:lot#b".into()],
        ..Decisions::default()
    };
    let g = plan(&s, &t, &Calendar::default(), &d);
    assert_eq!(g.bars[0].task, "est:lot#a"); // the output keeps the sheet order
    assert_eq!(g.bars[1].start, "2026-11-02");
    assert_eq!(g.bars[0].start, "2026-11-04");
}

#[test]
fn a_task_with_no_member_runs_a_day_for_each_day_of_effort() {
    let g = plan(
        &sheet(vec![task("a", "ghost", 3.0)]),
        &team(vec![]),
        &Calendar::default(),
        &Decisions::default(),
    );
    assert_eq!(g.bars[0].member, None);
    assert_eq!(
        (g.bars[0].start.as_str(), g.bars[0].end.as_str()),
        ("2026-11-02", "2026-11-04")
    );
}

#[test]
fn a_team_change_moves_the_dates_and_the_inputs_stay_as_they_were() {
    let s = sheet(vec![task("a", "dev", 4.0)]);
    let d = Decisions::default();
    let full = team(vec![member("ana", "dev", 5.0, &[], 1.0)]);
    let half = team(vec![member("ana", "dev", 2.5, &[], 1.0)]);
    let before = plan(&s, &full, &Calendar::default(), &d);
    let after = plan(&s, &half, &Calendar::default(), &d);
    assert_ne!(before.bars[0].end, after.bars[0].end);
    assert_eq!(d, Decisions::default());
}

#[test]
fn the_spread_sums_to_the_summary() {
    let t = team(vec![
        member("ana", "dev", 5.0, &[], 500.0),
        member("bob", "qa", 3.0, &[], 300.0),
    ]);
    let mut qa = task("qa", "qa", 0.0);
    qa.days = None;
    qa.percent = Some(30.0);
    let s = sheet(vec![task("a", "dev", 15.0), task("b", "dev", 7.5), qa]);
    let g = gantt(
        "lot",
        &s,
        &t,
        &Calendar::default(),
        &Decisions::default(),
        "2026-11-20",
    );
    let spread = g.spread();
    assert!(spread.len() >= 2, "the work crosses a month");
    let sum = totals(&s, &role_rates(&t));
    let days: f64 = spread.iter().map(|m| m.days).sum();
    let cost: f64 = spread.iter().map(|m| m.cost).sum();
    assert!((days - sum.days).abs() < 1e-6, "{days} vs {}", sum.days);
    assert!((cost - sum.cost).abs() < 1e-6, "{cost} vs {}", sum.cost);
    assert_eq!(spread[0].month, "2026-11");
}

// ---- plan diff (REQ-025)

fn ticket(
    key: &str,
    title: &str,
    label: &str,
    minutes: Option<u64>,
    parent: Option<&str>,
) -> WorkItem {
    WorkItem {
        key: key.into(),
        title: title.into(),
        description: String::new(),
        kind: WorkKind::Story,
        status: Status {
            name: "To do".into(),
            category: StatusCategory::Todo,
        },
        assignee: None,
        labels: vec![label.into()],
        parent: parent.map(String::from),
        url: String::new(),
        updated: String::new(),
        time: minutes.map(|m| TimeTracking {
            estimate_minutes: Some(m),
            spent_minutes: None,
        }),
    }
}

#[test]
fn a_feature_is_an_epic_and_a_task_is_a_story() {
    let r = rows("lot", &sheet(vec![task("a", "dev", 2.0)]));
    assert_eq!(r.len(), 2);
    assert_eq!(
        (r[0].reference.as_str(), r[0].kind, r[0].days),
        ("est:lot#login", RowKind::Epic, None)
    );
    assert_eq!(
        (r[1].reference.as_str(), r[1].kind, r[1].days),
        ("est:lot#a", RowKind::Story, Some(2.0))
    );
    assert_eq!(r[1].parent.as_deref(), Some("est:lot#login"));
}

#[test]
fn the_diff_marks_create_update_and_unchanged() {
    let r = rows(
        "lot",
        &sheet(vec![
            task("a", "dev", 2.0),
            task("b", "dev", 1.0),
            task("c", "dev", 1.0),
        ]),
    );
    let mirror = vec![
        ticket("P-1", "Login", "est:lot#login", None, None),
        ticket("P-2", "Task a", "est:lot#a", Some(960), Some("P-1")),
        ticket("P-3", "Old title", "est:lot#b", Some(480), Some("P-1")),
    ];
    let d = plan_diff(r, &mirror);
    let by = |reference: &str| d.iter().find(|x| x.row.reference == reference).unwrap();
    assert_eq!(by("est:lot#login").action, Action::Unchanged);
    assert_eq!(by("est:lot#a").action, Action::Unchanged);
    assert_eq!(by("est:lot#b").action, Action::Update);
    assert_eq!(by("est:lot#b").changes, [Field::Title]);
    assert_eq!(by("est:lot#b").key.as_deref(), Some("P-3"));
    assert_eq!(by("est:lot#c").action, Action::Create);
    assert_eq!(by("est:lot#c").key, None);
}

#[test]
fn a_changed_estimate_and_a_moved_parent_are_updates() {
    let r = rows("lot", &sheet(vec![task("a", "dev", 3.0)]));
    let mirror = vec![
        ticket("P-1", "Login", "est:lot#login", None, None),
        ticket("P-2", "Task a", "est:lot#a", Some(480), Some("P-9")),
    ];
    let d = plan_diff(r, &mirror);
    assert_eq!(d[1].changes, [Field::Estimate, Field::Parent]);
}

#[test]
fn the_diff_reads_the_effort_from_the_sheet_each_time() {
    let mirror = vec![ticket("P-2", "Task a", "est:lot#a", Some(480), None)];
    let one = plan_diff(rows("lot", &sheet(vec![task("a", "dev", 1.0)])), &mirror);
    let two = plan_diff(rows("lot", &sheet(vec![task("a", "dev", 2.0)])), &mirror);
    assert_eq!(one[1].action, Action::Unchanged);
    assert!(two[1].changes.contains(&Field::Estimate));
}

// ---- time (REQ-023, REQ-024)

fn entry(id: &str, minutes: u32, worklog: Option<&str>) -> TimeEntry {
    TimeEntry {
        id: id.into(),
        day: "2026-10-29".into(),
        minutes,
        note: "work".into(),
        ticket: Some("P-1".into()),
        worklog: worklog.map(String::from),
    }
}

#[test]
fn the_mark_is_the_last_one_in_the_note() {
    let note = worklog_note("fix\nshipyard log=fake", "e1");
    assert_eq!(parse_mark(&note).as_deref(), Some("e1"));
    assert_eq!(parse_mark(&worklog_note("", "e2")).as_deref(), Some("e2"));
    assert_eq!(parse_mark("no mark"), None);
}

#[test]
fn a_row_is_in_the_tracker_to_send_or_only_in_the_tracker() {
    let logs = vec![
        TrackerLog {
            id: "10".into(),
            minutes: 60,
            note: String::new(),
        },
        TrackerLog {
            id: "11".into(),
            minutes: 30,
            note: "by hand".into(),
        },
    ];
    let rows = reconcile(&[entry("e1", 60, Some("10")), entry("e2", 45, None)], &logs);
    assert_eq!(rows[0].state, TimeState::InTracker);
    assert!(!rows[0].differs);
    assert_eq!(rows[1].state, TimeState::ToSend);
    assert_eq!(rows[2].state, TimeState::OnlyInTracker);
    assert_eq!(rows.len(), 3);
}

#[test]
fn a_difference_of_duration_is_flagged_and_not_corrected() {
    let logs = vec![TrackerLog {
        id: "10".into(),
        minutes: 90,
        note: String::new(),
    }];
    let rows = reconcile(&[entry("e1", 60, Some("10"))], &logs);
    assert!(rows[0].differs);
    assert_eq!(rows[0].entry.as_ref().unwrap().minutes, 60);
}

#[test]
fn a_lost_response_finds_the_worklog_by_its_mark_and_never_offers_a_second_send() {
    let logs = vec![TrackerLog {
        id: "10".into(),
        minutes: 60,
        note: worklog_note("work", "e1"),
    }];
    let rows = reconcile(&[entry("e1", 60, None)], &logs);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].state, TimeState::InTracker);
    assert!(rows[0].lost_receipt);
}

// ---- booked days (REQ-007)

#[test]
fn booked_days_count_the_planned_work_inside_the_window() {
    let t = team(vec![
        member("ana", "dev", 5.0, &[], 500.0),
        member("bob", "qa", 5.0, &[], 400.0),
    ]);
    let sheets = vec![(
        "lot".to_string(),
        sheet(vec![task("a", "dev", 3.0), task("b", "dev", 4.0)]),
    )];
    let book = |span| {
        booked(
            &sheets,
            &t,
            &Calendar::default(),
            &Decisions::default(),
            "2026-11-02", // a Monday
            span,
        )
    };
    // Seven days from Monday hold five working days of ana. Bob has no task.
    assert_eq!(book(7), BTreeMap::from([("ana".to_string(), 5.0)]));
    assert_eq!(book(2), BTreeMap::from([("ana".to_string(), 2.0)]));
    // The sum over the sheets: a second lot books the same member again.
    let two = vec![
        sheets[0].clone(),
        ("other".to_string(), sheet(vec![task("c", "dev", 1.0)])),
    ];
    let all = booked(
        &two,
        &t,
        &Calendar::default(),
        &Decisions::default(),
        "2026-11-02",
        7,
    );
    assert_eq!(all["ana"], 6.0);
}

#[test]
fn booked_days_feed_the_suggestion() {
    let t = team(vec![
        member("ana", "dev", 5.0, &["api"], 500.0),
        member("bob", "dev", 5.0, &["api"], 500.0),
    ]);
    let sheets = vec![("lot".to_string(), sheet(vec![task("a", "dev", 5.0)]))];
    let b = booked(
        &sheets,
        &t,
        &Calendar::default(),
        &Decisions::default(),
        "2026-11-02",
        7,
    );
    // The task goes to the first member that finishes first (ana, by handle). She is full.
    let ranked = suggest(&["api".to_string()], &t, &b);
    assert_eq!(ranked[0].handle, "bob");
    assert!(ranked[1].reasons.contains(&Reason::Full));
}

// ---- three-point estimate, freeze and load

#[test]
fn a_three_point_task_counts_its_expected_days_and_checks_its_order() {
    let mut t = task("a", "dev", 2.0);
    t.optimistic = Some(1.0);
    t.pessimistic = Some(6.0);
    // (1 + 4 × 2 + 6) / 6 = 2.5
    assert_eq!(fixed_days(&t), Some(2.5));
    let s = sheet(vec![t.clone(), task("b", "dev", 1.0)]);
    assert_eq!(totals(&s, &rates(&[("dev", 100.0)])).days, 3.5);
    assert!(s.check().is_ok());
    t.optimistic = Some(3.0);
    assert!(sheet(vec![t.clone()]).check().is_err());
    t.pessimistic = None;
    assert!(sheet(vec![t]).check().is_err());
}

#[test]
fn the_load_sums_the_sheets_and_shows_a_member_over_capacity() {
    let t = team(vec![member("ana", "dev", 5.0, &[], 500.0)]);
    let two = vec![
        ("lot".to_string(), sheet(vec![task("a", "dev", 2.0)])),
        ("other".to_string(), sheet(vec![task("c", "dev", 1.0)])),
    ];
    let l = load(
        &two,
        &t,
        &Calendar::default(),
        &Decisions::default(),
        "2026-11-02",
    );
    let ana = &l.members[0];
    assert_eq!(ana.handle, "ana");
    // Monday holds one day of each lot: two days on a capacity of one.
    assert_eq!(
        (
            ana.days[0].day.as_str(),
            ana.days[0].used,
            ana.days[0].capacity
        ),
        ("2026-11-02", 2.0, 1.0)
    );
    assert_eq!(l.team.len(), 2);
    assert!(
        load(
            &[],
            &t,
            &Calendar::default(),
            &Decisions::default(),
            "2026-11-02"
        )
        .team
        .is_empty()
    );
}

#[test]
fn an_old_calendar_has_no_country_and_a_new_one_has_france() {
    let old: Calendar = serde_json::from_str(r#"{"workingDays":[1,2,3],"holidays":[]}"#).unwrap();
    assert_eq!(old.country, "");
    assert!(old.public_holidays("2026-01-01").is_empty());
    let set: Calendar = serde_json::from_str(r#"{"country":"DE"}"#).unwrap();
    assert_eq!(set.country, "DE");
    assert_eq!(Calendar::default().country, "FR");
}
