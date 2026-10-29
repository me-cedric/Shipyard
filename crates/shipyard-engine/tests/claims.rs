//! Claims, stamps and stale takeover with two machines (spec `sync`, REQ-008, REQ-009, REQ-010).

mod common;

use common::{World, auto, secs};
use shipyard_core::pickup::REASON_CLAIM_LOST;
use shipyard_engine::claims::{Claims, Outcome};
use shipyard_engine::fake::todo;
use shipyard_store::mirror::Mirror;

/// A claim helper for one machine: its own mirror, the shared tracker.
struct Side {
    mirror: Mirror,
    name: &'static str,
    stamp: bool,
}

impl Side {
    fn new(name: &'static str, stamp: bool) -> Self {
        Self {
            mirror: Mirror::open_memory().unwrap(),
            name,
            stamp,
        }
    }

    fn claims<'a>(&'a self, w: &'a World) -> Claims<'a> {
        Claims {
            mirror: &self.mirror,
            tracker: &w.tracker,
            source: "jira",
            machine: self.name,
            stale: secs(600),
            stamp: self.stamp,
            now: shipyard_engine::Clock::now(&w.clock),
        }
    }
}

#[test]
fn a_claim_writes_the_stamp_and_a_second_claim_on_one_machine_is_held() {
    let w = World::new();
    let a = Side::new("A", true);
    assert_eq!(
        a.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Won { stamped: true }
    );
    assert_eq!(w.tracker.stamp_holders("A-1"), ["A"]);
    assert!(a.mirror.claims("jira").unwrap()[0].stamped);
    assert_eq!(a.claims(&w).claim("A-1", "To Do").unwrap(), Outcome::Held);
    assert_eq!(w.tracker.stamp_writes(), 1);
}

#[test]
fn machine_b_does_not_take_a_ticket_that_machine_a_stamped() {
    let w = World::new();
    let (a, b) = (Side::new("A", true), Side::new("B", true));
    a.claims(&w).claim("A-1", "To Do").unwrap();
    assert_eq!(
        b.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Lost {
            machine: "A".into()
        }
    );
    assert!(
        b.mirror.claims("jira").unwrap().is_empty(),
        "the local claim of B is released"
    );
    assert_eq!(w.tracker.stamp_holders("A-1"), ["A"], "B wrote nothing");
}

#[test]
fn a_live_stamp_stops_a_machine_that_may_not_write() {
    let w = World::new();
    let (a, b) = (Side::new("A", true), Side::new("B", false));
    a.claims(&w).claim("A-1", "To Do").unwrap();
    assert_eq!(
        b.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Lost {
            machine: "A".into()
        }
    );
}

#[test]
fn two_machines_that_write_at_once_agree_on_the_older_stamp() {
    let w = World::new();
    let b = Side::new("B", true);
    // A writes its stamp between the read of B and the write of B.
    w.tracker.race_stamp("A");
    assert_eq!(
        b.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Lost {
            machine: "A".into()
        }
    );
    assert_eq!(
        w.tracker.stamp_holders("A-1"),
        ["A"],
        "B took its stamp back"
    );
    assert!(b.mirror.claims("jira").unwrap().is_empty());
}

#[test]
fn a_refused_stamp_releases_the_claim_and_no_run_starts() {
    let w = World::new();
    w.tracker.refuse_stamps(true);
    let a = Side::new("A", true);
    assert!(matches!(
        a.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Failed(_)
    ));
    assert!(a.mirror.claims("jira").unwrap().is_empty());
    // The same through the engine: no run starts.
    w.tracker.put(todo("A-1"));
    let mut m = w.machine("A", auto(true));
    let r = m.engine.tick(false).unwrap();
    assert!(r.started.is_empty());
    assert!(r.errors.iter().any(|e| e.contains("refused")), "{r:?}");
    assert!(m.dispatch.started().is_empty());
}

#[test]
fn with_the_switch_off_the_claim_is_local_and_the_tracker_gets_no_write() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut m = w.machine("A", auto(false));
    let r = m.engine.tick(false).unwrap();
    assert_eq!(r.started, ["A-1"]);
    assert_eq!(w.tracker.stamp_writes(), 0);
    assert!(w.tracker.stamp_holders("A-1").is_empty());
    assert!(!m.dispatch.started()[0].stamped);
    assert!(!m.engine.mirror().claims("jira").unwrap()[0].stamped);
    // A tracker that cannot hold a stamp behaves the same with the switch on.
    let w2 = World::new();
    w2.tracker.put(todo("A-1"));
    w2.tracker.set_can_stamp(false);
    let mut m2 = w2.machine("A", auto(true));
    assert_eq!(m2.engine.tick(false).unwrap().started, ["A-1"]);
    assert_eq!(w2.tracker.stamp_writes(), 0);
}

#[test]
fn a_claim_is_stale_after_ten_minutes_without_a_refresh_and_another_machine_takes_over() {
    let w = World::new();
    let (a, b) = (Side::new("A", true), Side::new("B", true));
    a.claims(&w).claim("A-1", "To Do").unwrap();
    w.clock.advance(secs(599));
    assert!(matches!(
        b.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Lost { .. }
    ));
    w.clock.advance(secs(1));
    assert_eq!(
        b.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Won { stamped: true }
    );
    assert_eq!(w.tracker.stamp_holders("A-1"), ["A", "B"]);
    // A is stale and B is live: A does not win it back by reading.
    assert!(matches!(
        a.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Held
    ));
}

#[test]
fn a_refresh_keeps_the_claim_live() {
    let w = World::new();
    let (a, b) = (Side::new("A", true), Side::new("B", true));
    a.claims(&w).claim("A-1", "To Do").unwrap();
    for _ in 0..3 {
        w.clock.advance(secs(400));
        let hb = a.claims(&w).heartbeat(&["A-1".to_string()]).unwrap();
        assert!(hb.lost.is_empty() && hb.errors.is_empty(), "{hb:?}");
    }
    assert!(matches!(
        b.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Lost { .. }
    ));
}

#[test]
fn release_removes_the_claim_and_the_stamp_and_frees_the_ticket() {
    let w = World::new();
    let (a, b) = (Side::new("A", true), Side::new("B", true));
    a.claims(&w).claim("A-1", "To Do").unwrap();
    let r = a.claims(&w).release("A-1").unwrap();
    assert!(r.existed && r.stamp_error.is_none());
    assert!(w.tracker.stamp_holders("A-1").is_empty());
    assert!(a.mirror.claims("jira").unwrap().is_empty());
    assert_eq!(
        b.claims(&w).claim("A-1", "To Do").unwrap(),
        Outcome::Won { stamped: true }
    );
}

#[test]
fn a_claim_without_an_active_run_is_released_by_the_heartbeat() {
    let w = World::new();
    let a = Side::new("A", true);
    a.claims(&w).claim("A-1", "To Do").unwrap();
    a.claims(&w).claim("A-2", "To Do").unwrap();
    let hb = a.claims(&w).heartbeat(&["A-2".to_string()]).unwrap();
    assert_eq!(hb.orphans, ["A-1"]);
    assert!(w.tracker.stamp_holders("A-1").is_empty());
    assert_eq!(a.mirror.claims("jira").unwrap().len(), 1);
}

#[test]
fn two_machines_with_one_filter_never_run_one_ticket() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut a = w.machine("A", auto(true));
    let mut b = w.machine("B", auto(true));
    let ra = a.engine.tick(false).unwrap();
    let rb = b.engine.tick(false).unwrap();
    assert_eq!(ra.started, ["A-1"]);
    assert!(rb.started.is_empty());
    assert_eq!(rb.lost, ["A-1"]);
    assert_eq!(
        a.dispatch.started_keys().len() + b.dispatch.started_keys().len(),
        1
    );
}

#[test]
fn a_stale_claim_is_taken_over_and_the_old_machine_stops_its_run() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut a = w.machine("A", auto(true));
    let mut b = w.machine("B", auto(true));
    assert_eq!(a.engine.tick(false).unwrap().started, ["A-1"]);
    // A sleeps for 11 minutes: no tick, no refresh.
    w.clock.advance(secs(660));
    let rb = b.engine.tick(false).unwrap();
    assert_eq!(rb.started, ["A-1"], "B takes the stale claim");
    // A wakes up. Its next tick sees the live stamp of B and stops its own run.
    let ra = a.engine.tick(false).unwrap();
    assert_eq!(ra.lost, ["A-1"]);
    assert_eq!(
        a.dispatch.stopped(),
        [("run-1".to_string(), REASON_CLAIM_LOST.to_string())]
    );
    assert!(a.engine.mirror().claims("jira").unwrap().is_empty());
    assert_eq!(
        w.tracker.stamp_holders("A-1"),
        ["A", "B"].map(String::from),
        "B keeps its stamp"
    );
    // B is still running, and its refresh keeps the claim live.
    w.clock.advance(secs(300));
    b.engine.tick(false).unwrap();
    w.clock.advance(secs(300));
    let rb = b.engine.tick(false).unwrap();
    assert!(rb.lost.is_empty() && rb.stopped.is_empty(), "{rb:?}");
}

#[test]
fn a_failed_start_gives_the_claim_and_the_stamp_back() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut a = w.machine("A", auto(true));
    a.dispatch.fail_start(true);
    let r = a.engine.tick(false).unwrap();
    assert!(r.started.is_empty());
    assert!(w.tracker.stamp_holders("A-1").is_empty());
    assert!(a.engine.mirror().claims("jira").unwrap().is_empty());
    a.dispatch.fail_start(false);
    let r = a.engine.tick(true).unwrap();
    assert_eq!(r.started, ["A-1"]);
}

#[test]
fn a_run_that_ends_releases_its_claim_and_the_ticket_can_run_again_elsewhere() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut a = w.machine("A", auto(true));
    let mut b = w.machine("B", auto(true));
    a.engine.tick(false).unwrap();
    a.dispatch.end_run("run-1");
    // The factory calls release at the end of the run.
    a.engine.release("A-1").unwrap();
    assert!(w.tracker.stamp_holders("A-1").is_empty());
    assert_eq!(b.engine.tick(false).unwrap().started, ["A-1"]);
}

#[test]
fn the_heartbeat_releases_a_claim_whose_run_ended_without_a_call() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut a = w.machine("A", auto(true));
    a.engine.tick(false).unwrap();
    a.dispatch.end_run("run-1");
    a.engine.tick(true).unwrap();
    assert!(a.engine.mirror().claims("jira").unwrap().is_empty());
    assert!(w.tracker.stamp_holders("A-1").is_empty());
    assert_eq!(
        a.dispatch.started_keys(),
        ["A-1"],
        "no second start in the same tick"
    );
}
