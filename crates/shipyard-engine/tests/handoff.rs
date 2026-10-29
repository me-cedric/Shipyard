//! Hand-off of comments and pull request events (spec `sync`, REQ-011, REQ-012).

mod common;

use common::{World, auto, secs};
use shipyard_core::pickup::{Ci, PrEventKind, PrState, PullSnapshot, SyncEvent};
use shipyard_core::work_item::StatusCategory;
use shipyard_engine::fake::{comment, ticket, todo};
use shipyard_store::mirror::Mirror;

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

fn comments(events: &[SyncEvent]) -> Vec<(String, Option<String>)> {
    events
        .iter()
        .filter_map(|e| match e {
            SyncEvent::Comment {
                comment, answers, ..
            } => Some((comment.id.clone(), answers.clone())),
            _ => None,
        })
        .collect()
}

fn pr_kinds(events: &[SyncEvent]) -> Vec<(u64, PrEventKind)> {
    events
        .iter()
        .filter_map(|e| match e {
            SyncEvent::Pr(p) => Some((p.number, p.kind)),
            _ => None,
        })
        .collect()
}

#[test]
fn a_new_comment_reaches_questions_loop_once() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    // The run exists. A person comments on the tracker site.
    w.tracker
        .add_comment("A-1", comment("11", "please use option 2"));
    w.clock.advance(secs(70));
    m.engine.tick(false).unwrap();
    assert_eq!(
        comments(&m.dispatch.handed_off()),
        [("11".to_string(), None)]
    );
    // The same comment does not go again, now or on a forced tick.
    w.clock.advance(secs(70));
    m.engine.tick(false).unwrap();
    m.engine.tick(true).unwrap();
    assert_eq!(comments(&m.dispatch.handed_off()).len(), 1);
}

#[test]
fn the_comments_that_exist_when_a_ticket_is_first_seen_are_not_new() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    w.tracker.add_comment("A-1", comment("01", "old chat"));
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap(); // claims the ticket
    w.clock.advance(secs(70));
    m.engine.tick(false).unwrap(); // first scan: a baseline
    assert!(comments(&m.dispatch.handed_off()).is_empty());
    w.tracker.add_comment("A-1", comment("02", "new chat"));
    w.clock.advance(secs(70));
    m.engine.tick(false).unwrap();
    assert_eq!(
        comments(&m.dispatch.handed_off()),
        [("02".to_string(), None)]
    );
}

#[test]
fn an_answer_after_a_marker_names_its_question() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    w.tracker.add_comment(
        "A-1",
        comment("01", "<!-- shipyard:q Q-007 -->\n1. yes\n2. no"),
    );
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    w.clock.advance(secs(70));
    m.engine.tick(false).unwrap();
    // The marker is older than the mirror and nobody answered yet: nothing goes.
    assert!(comments(&m.dispatch.handed_off()).is_empty());
    w.tracker.add_comment("A-1", comment("02", "2"));
    w.tracker.add_comment("A-1", comment("03", "/answer 2"));
    w.clock.advance(secs(70));
    m.engine.tick(false).unwrap();
    assert_eq!(
        comments(&m.dispatch.handed_off()),
        [
            ("02".to_string(), Some("Q-007".to_string())),
            ("03".to_string(), Some("Q-007".to_string()))
        ]
    );
}

#[test]
fn an_answer_that_waited_before_the_first_scan_is_still_sent() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    w.tracker
        .add_comment("A-1", comment("01", "<!-- shipyard:q Q-001 -->"));
    w.tracker.add_comment("A-1", comment("02", "go with 1"));
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    w.clock.advance(secs(70));
    m.engine.tick(false).unwrap();
    assert_eq!(
        comments(&m.dispatch.handed_off()),
        [("02".to_string(), Some("Q-001".to_string()))]
    );
}

#[test]
fn a_merge_reaches_delivery_once_and_before_the_stop_step() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    w.forge.put(pull(7, PrState::Open));
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    m.dispatch
        .set_run_state("run-1", shipyard_core::run::RunState::PROpen, Some(7));
    w.clock.advance(secs(70));
    w.forge.put(pull(7, PrState::Merged));
    w.tracker.update("A-1", "2026-10-29T10:03:00Z", |t| {
        t.item.status.name = "Done".into();
        t.item.status.category = StatusCategory::Done;
    });
    let r = m.engine.tick(false).unwrap();
    assert!(r.stopped.is_empty());
    assert_eq!(
        pr_kinds(&m.dispatch.handed_off()),
        [(7, PrEventKind::Merged)]
    );
    w.clock.advance(secs(70));
    m.engine.tick(false).unwrap();
    m.engine.tick(true).unwrap();
    assert_eq!(pr_kinds(&m.dispatch.handed_off()).len(), 1, "once");
}

#[test]
fn ci_and_review_events_follow_the_pull_request() {
    let w = World::new();
    w.tracker.put(ticket("A-1", "To Do", StatusCategory::Todo));
    w.forge.put(pull(7, PrState::Open));
    let mut m = w.machine("m1", auto(false));
    m.dispatch.add_run(shipyard_core::pickup::ActiveRun {
        run_id: "r1".into(),
        project: "ship".into(),
        key: "A-1".into(),
        state: shipyard_core::run::RunState::PROpen,
        status: "To Do".into(),
        pr: Some(7),
    });
    m.engine.tick(false).unwrap();
    // The first read gives the pull request of the run as new.
    assert_eq!(
        pr_kinds(&m.dispatch.handed_off()),
        [(7, PrEventKind::Opened)]
    );
    w.clock.advance(secs(70));
    w.forge.put(PullSnapshot {
        ci: Ci::Failing,
        ..pull(7, PrState::Open)
    });
    m.engine.tick(false).unwrap();
    w.clock.advance(secs(70));
    w.forge.put(PullSnapshot {
        ci: Ci::Failing,
        changes_requested: true,
        ..pull(7, PrState::Open)
    });
    m.engine.tick(false).unwrap();
    w.clock.advance(secs(70));
    w.forge.put(PullSnapshot {
        ci: Ci::Passing,
        ..pull(7, PrState::Open)
    });
    m.engine.tick(false).unwrap();
    assert_eq!(
        pr_kinds(&m.dispatch.handed_off()),
        [
            (7, PrEventKind::Opened),
            (7, PrEventKind::CiFailed),
            (7, PrEventKind::ChangesRequested),
            (7, PrEventKind::CiPassed)
        ]
    );
}

#[test]
fn the_first_read_of_a_forge_is_a_baseline_for_pull_requests_without_a_run() {
    let w = World::new();
    for n in 1..=5 {
        w.forge.put(pull(n, PrState::Open));
    }
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    assert!(pr_kinds(&m.dispatch.handed_off()).is_empty());
    assert_eq!(m.engine.mirror().pulls("github").unwrap().len(), 5);
    // A pull request that opens later is news.
    w.clock.advance(secs(70));
    w.forge.put(pull(6, PrState::Open));
    m.engine.tick(false).unwrap();
    assert_eq!(
        pr_kinds(&m.dispatch.handed_off()),
        [(6, PrEventKind::Opened)]
    );
}

#[test]
fn a_refused_event_stays_queued_and_goes_at_the_next_tick() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let mut m = w.machine("m1", auto(false));
    m.engine.tick(false).unwrap();
    m.dispatch.fail_events(true);
    w.tracker.add_comment("A-1", comment("11", "answer"));
    w.clock.advance(secs(70));
    let r = m.engine.tick(false).unwrap();
    assert_eq!(r.delivered, 0);
    assert!(r.errors.iter().any(|e| e.contains("hand-off")), "{r:?}");
    assert!(comments(&m.dispatch.handed_off()).is_empty());
    m.dispatch.fail_events(false);
    w.clock.advance(secs(70));
    let r = m.engine.tick(false).unwrap();
    assert_eq!(r.delivered, 1);
    assert_eq!(
        comments(&m.dispatch.handed_off()),
        [("11".to_string(), None)]
    );
    m.engine.tick(true).unwrap();
    assert_eq!(comments(&m.dispatch.handed_off()).len(), 1);
}

#[test]
fn a_queued_event_survives_a_restart() {
    let w = World::new();
    w.tracker.put(todo("A-1"));
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("mirror.sqlite");
    let mut first = w.machine_with("m1", auto(false), Mirror::open(&path).unwrap());
    first.engine.tick(false).unwrap();
    first.dispatch.fail_events(true);
    w.tracker.add_comment("A-1", comment("11", "answer"));
    w.clock.advance(secs(70));
    first.engine.tick(false).unwrap();
    drop(first);
    // The app restarts with the same mirror file and a factory that works.
    let mut second = w.machine_with("m1", auto(false), Mirror::open(&path).unwrap());
    second.dispatch.add_run(shipyard_core::pickup::ActiveRun {
        run_id: "r9".into(),
        project: "ship".into(),
        key: "A-1".into(),
        state: shipyard_core::run::RunState::Working,
        status: "To Do".into(),
        pr: None,
    });
    second.engine.tick(true).unwrap();
    assert_eq!(
        comments(&second.dispatch.handed_off()),
        [("11".to_string(), None)]
    );
}
