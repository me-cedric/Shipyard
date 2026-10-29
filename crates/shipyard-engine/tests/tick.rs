//! The tick: schedule, order, reconcile, failure (spec `sync`, REQ-001, REQ-002, REQ-003, REQ-004,
//! REQ-014). A fake clock and fake trackers drive it.

mod common;

use common::{Machine, START, World, auto, secs};
use shipyard_core::pickup::{ActiveRun, Ci, PrState, PullSnapshot};
use shipyard_core::run::RunState;
use shipyard_core::work_item::StatusCategory;
use shipyard_engine::fake::{ticket, todo};
use shipyard_engine::tick::backoff;
use shipyard_engine::{Clock, iso};

fn pull(number: u64, state: PrState) -> PullSnapshot {
    PullSnapshot {
        number,
        title: "pr".into(),
        state,
        draft: false,
        head_sha: "abc".into(),
        url: "u".into(),
        ci: Ci::Pending,
        changes_requested: false,
        updated: "2026-10-29T10:00:00Z".into(),
    }
}

fn working(id: &str, key: &str, pr: Option<u64>) -> ActiveRun {
    ActiveRun {
        run_id: id.into(),
        project: "ship".into(),
        key: key.into(),
        state: if pr.is_some() {
            RunState::PROpen
        } else {
            RunState::Working
        },
        status: "To Do".into(),
        pr,
    }
}

#[test]
fn iso_formats_the_epoch_and_a_known_date() {
    assert_eq!(iso(secs(0)), "1970-01-01T00:00:00Z");
    assert_eq!(iso(secs(START)), "2026-10-29T10:00:00Z");
    assert_eq!(iso(secs(951_782_399)), "2000-02-28T23:59:59Z");
    assert_eq!(iso(secs(951_782_400)), "2000-02-29T00:00:00Z");
}

#[test]
fn the_wait_after_a_failure_doubles_up_to_five_minutes() {
    let w: Vec<u64> = (0..6).map(|n| backoff(secs(60), n).as_secs()).collect();
    assert_eq!(w, [60, 120, 240, 300, 300, 300]);
    // A long interval is never shortened.
    assert_eq!(backoff(secs(600), 3).as_secs(), 600);
}

#[test]
fn the_first_tick_polls_at_once_and_the_next_asks_for_changes_since() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut m = w.machine("m1", auto(false));
    let r = m.engine.tick(false).unwrap();
    assert_eq!(r.polled, ["jira", "github"]);
    assert_eq!(w.tracker.queries()[0].since, None);
    w.clock.advance(secs(80));
    m.engine.tick(false).unwrap();
    // The last good poll started at START. The query goes back 2 minutes more.
    assert_eq!(
        w.tracker.queries()[1].since.as_deref(),
        Some(iso(secs(START - 120)).as_str())
    );
}

#[test]
fn a_tick_before_the_interval_does_not_poll() {
    let w = World::new();
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    w.clock.advance(secs(59));
    let r = m.engine.tick(false).unwrap();
    assert!(r.polled.is_empty());
    assert_eq!(w.log.count("list"), 1);
}

#[test]
fn the_next_poll_is_the_interval_plus_jitter_and_never_under_it() {
    let w = World::new();
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    // The fixed jitter source gives 0.5: 60 s + 10% of 60 s.
    assert_eq!(m.engine.next_due(), secs(START + 66));
    w.clock.advance(secs(65));
    assert!(m.engine.tick(false).unwrap().polled.is_empty());
    w.clock.advance(secs(1));
    assert_eq!(m.engine.tick(false).unwrap().polled.len(), 2);
}

#[test]
fn the_interval_never_goes_under_30_seconds() {
    let w = World::new();
    let mut a = auto(false);
    a.interval = 5;
    let mut m = w.machine("m1", a);
    m.engine.tick(false).unwrap();
    assert!(m.engine.next_due() >= secs(START + 30));
}

#[test]
fn polls_over_three_minutes_come_about_every_minute_with_different_delays() {
    let w = World::new();
    let Machine { engine, .. } = w.machine("m1", auto(false));
    let mut shares = [0.0, 1.0, 0.5].into_iter().cycle();
    let mut engine = engine.with_jitter(move || shares.next().unwrap());
    let clock = w.clock.clone();
    let log = w.log.clone();
    let end = secs(START + 180);
    // The time of each tracker poll. The forge has its own timer and its own wake-ups.
    let (mut polls, mut seen, mut last) = (Vec::new(), 0, 0);
    engine
        .run(|wait| {
            // The tick before this call ran at `last`.
            let n = log.count("list");
            if n != seen {
                seen = n;
                polls.push(last);
            }
            clock.advance(wait);
            last = clock.now().as_secs() - START;
            clock.now() < end
        })
        .unwrap();
    let delays: Vec<u64> = polls.windows(2).map(|t| t[1] - t[0]).collect();
    assert!(delays.len() >= 2, "{polls:?}");
    // Each delay holds the interval plus a share of up to 20 %. A wake-up for the forge can
    // come first, so a poll may be a few seconds later than its timer.
    assert!(delays.iter().all(|d| (60..=80).contains(d)), "{delays:?}");
    assert!(
        delays.iter().any(|d| *d != delays[0]),
        "same delay each time: {delays:?}"
    );
}

#[test]
fn the_sync_action_polls_now_and_restarts_the_timer() {
    let w = World::new();
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    w.clock.advance(secs(20));
    let r = m.engine.sync_now().unwrap();
    assert_eq!(r.polled.len(), 2);
    assert_eq!(m.engine.next_due(), secs(START + 20 + 66));
}

#[test]
fn a_tick_follows_the_six_steps_in_order() {
    let w = World::new();
    let mut a = auto(false);
    a.concurrency.global = 5;
    let mut m = w.machine("m1", a);
    w.tracker.put(todo("A-1"));
    w.tracker.put(todo("A-3"));
    w.forge.put(pull(7, PrState::Open));
    assert_eq!(m.engine.tick(false).unwrap().started, ["A-1", "A-3"]);
    w.log.push("--");
    // A-3 closes, the CI of pull request 7 fails, a new ticket is ready.
    w.tracker.update("A-3", "2026-10-29T10:05:00Z", |t| {
        t.item.status.name = "Done".into();
        t.item.status.category = StatusCategory::Done;
    });
    w.tracker.put(todo("A-2"));
    w.forge.put(PullSnapshot {
        ci: Ci::Failing,
        ..pull(7, PrState::Open)
    });
    let r = m.engine.tick(true).unwrap();
    assert_eq!(
        (r.stopped.as_slice(), r.started.as_slice()),
        (&["run-2".to_string()][..], &["A-2".to_string()][..])
    );
    let after = w.log.lines().split_off(w.log.first("--").unwrap() + 1);
    let pos = |p: &str| after.iter().position(|l| l.starts_with(p)).unwrap();
    // fetch, hand off, stop, pick up
    assert!(pos("list") < pos("event:pr"), "{after:?}");
    assert!(pos("event:pr") < pos("stop:run-2"), "{after:?}");
    assert!(pos("stop:run-2") < pos("start:A-2"), "{after:?}");
}

#[test]
fn a_ticket_that_closes_stops_its_run_with_the_reason_and_frees_the_claim() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut m = w.machine("m1", auto(false));
    let r = m.engine.tick(false).unwrap();
    assert_eq!(r.started, ["A-1"]);
    assert_eq!(m.engine.mirror().claims("jira").unwrap().len(), 1);
    w.clock.advance(secs(70));
    w.tracker.update("A-1", "2026-10-29T10:02:00Z", |t| {
        t.item.status = shipyard_core::work_item::Status {
            name: "Done".into(),
            category: StatusCategory::Done,
        };
    });
    let r = m.engine.tick(false).unwrap();
    assert_eq!(r.stopped, ["run-1"]);
    assert_eq!(
        m.dispatch.stopped(),
        [("run-1".to_string(), "ticket terminal".to_string())]
    );
    assert!(m.engine.mirror().claims("jira").unwrap().is_empty());
}

#[test]
fn a_project_does_not_release_the_claim_of_a_run_of_another_project() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut m = w.machine("m1", auto(false));
    // The claim and the run belong to another project that shares the source.
    m.engine
        .mirror()
        .claim("jira", "A-1", "m1", "To Do", false, START)
        .unwrap();
    m.dispatch.add_run(ActiveRun {
        project: "other".into(),
        ..working("run-9", "A-1", None)
    });
    let r = m.engine.tick(false).unwrap();
    assert!(r.errors.is_empty(), "{r:?}");
    assert_eq!(m.engine.mirror().claims("jira").unwrap().len(), 1);
}

#[test]
fn a_ticket_closed_by_a_merge_does_not_cancel_the_run() {
    let w = World::new();
    let mut m = w.machine("m1", auto(false));
    w.tracker.put(ticket("A-1", "To Do", StatusCategory::Todo));
    m.dispatch.add_run(working("r1", "A-1", Some(7)));
    w.forge.put(pull(7, PrState::Open));
    m.engine.tick(false).unwrap();
    w.clock.advance(secs(70));
    // The forge merges and closes the ticket in one go.
    w.forge.put(pull(7, PrState::Merged));
    w.tracker.update("A-1", "2026-10-29T10:02:00Z", |t| {
        t.item.status.name = "Done".into();
        t.item.status.category = StatusCategory::Done;
    });
    let r = m.engine.tick(false).unwrap();
    assert!(r.stopped.is_empty(), "{r:?}");
    // Delivery got the merge event first.
    assert!(m.dispatch.handed_off().iter().any(|e| matches!(e,
        shipyard_core::pickup::SyncEvent::Pr(p) if p.kind == shipyard_core::pickup::PrEventKind::Merged)));
}

#[test]
fn a_failed_forge_poll_keeps_a_run_with_a_pull_request_alive() {
    let w = World::new();
    let mut m = w.machine("m1", auto(false));
    w.tracker.put(ticket("A-1", "To Do", StatusCategory::Todo));
    m.dispatch.add_run(working("r1", "A-1", Some(7)));
    w.forge.put(pull(7, PrState::Open));
    m.engine.tick(false).unwrap();
    w.clock.advance(secs(70));
    w.forge.fail_with(Some("502"));
    w.tracker.update("A-1", "2026-10-29T10:02:00Z", |t| {
        t.item.status.name = "Done".into();
        t.item.status.category = StatusCategory::Done;
    });
    let r = m.engine.tick(false).unwrap();
    assert!(r.stopped.is_empty());
    assert_eq!(r.failed.len(), 1);
}

#[test]
fn a_failed_poll_keeps_the_mirror_shows_failed_and_retries_later() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut a = auto(false);
    a.concurrency.global = 0;
    let mut m = w.machine("m1", a);
    m.engine.tick(false).unwrap();
    assert_eq!(m.engine.mirror().tickets("jira").unwrap().len(), 1);
    w.tracker.fail_with(Some("network is down"));
    let mut waits = Vec::new();
    for _ in 0..4 {
        w.clock.advance(secs(400));
        let r = m.engine.tick(false).unwrap();
        assert_eq!(
            r.failed,
            [("jira".to_string(), "network is down".to_string())]
        );
        waits.push(m.engine.states().unwrap()[0].next.as_secs() - w.clock.now().as_secs());
    }
    // After n failures the wait is min(60 s * 2^n, 300 s), when the interval is 60 s.
    assert_eq!(waits, [120, 240, 300, 300]);
    let st = &m.engine.states().unwrap()[0].state;
    assert_eq!(
        (st.failures, st.error.as_deref()),
        (4, Some("network is down"))
    );
    assert_eq!(
        m.engine.mirror().tickets("jira").unwrap().len(),
        1,
        "the mirror stays"
    );
    w.tracker.fail_with(None);
    w.clock.advance(secs(400));
    let r = m.engine.tick(false).unwrap();
    assert_eq!(r.polled.len(), 2);
    assert_eq!(m.engine.states().unwrap()[0].state.failures, 0);
}

#[test]
fn nothing_is_picked_up_from_a_stale_mirror() {
    let w = World::new();
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    w.tracker.put(todo("A-1"));
    w.clock.advance(secs(70));
    w.tracker.fail_with(Some("down"));
    assert!(m.engine.tick(false).unwrap().started.is_empty());
    w.tracker.fail_with(None);
    w.clock.advance(secs(400));
    assert_eq!(m.engine.tick(false).unwrap().started, ["A-1"]);
}

#[test]
fn pickup_follows_the_filter_the_limit_and_the_kill_switch() {
    let w = World::new();
    for i in 1..=5 {
        w.tracker.put(todo(&format!("A-{i}")));
    }
    let mut other = todo("B-1");
    other.item.labels.clear();
    w.tracker.put(other);
    let mut m = w.machine("m1", auto(false));
    m.dispatch.set_kill(true);
    assert!(m.engine.tick(false).unwrap().started.is_empty());
    m.dispatch.set_kill(false);
    let r = m.engine.tick(true).unwrap();
    assert_eq!(
        r.started,
        ["A-1", "A-2"],
        "two by default, no label, no pickup"
    );
    let r = m.engine.tick(true).unwrap();
    assert!(r.started.is_empty(), "the two slots are full");
}

#[test]
fn a_ticket_that_changed_since_the_poll_is_read_again_before_the_claim() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut m = w.machine("m1", auto(false));
    m.dispatch.set_kill(true);
    m.engine.tick(false).unwrap();
    // The mirror holds A-1 with its label. Then a person takes the label away.
    w.tracker
        .update("A-1", "2026-10-29T10:00:30Z", |t| t.item.labels.clear());
    m.dispatch.set_kill(false);
    w.clock.advance(secs(10));
    let r = m.engine.tick(false).unwrap();
    assert!(
        r.polled.is_empty(),
        "the poll is not due, so the mirror is old"
    );
    assert!(r.started.is_empty(), "{r:?}");
    assert!(m.engine.mirror().claims("jira").unwrap().is_empty());
    // The mirror got the fresh ticket.
    let t = m.engine.mirror().ticket("jira", "A-1").unwrap().unwrap();
    assert!(t.item.labels.is_empty());
}

#[test]
fn the_tick_event_goes_to_the_listeners_each_tick() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    let ticks = m
        .dispatch
        .events()
        .into_iter()
        .filter(|e| matches!(e, shipyard_core::pickup::SyncEvent::Tick { changed: 1, .. }))
        .count();
    assert_eq!(ticks, 1);
}
