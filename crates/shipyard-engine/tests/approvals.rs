//! Write switches and approvals (spec `factory`, REQ-008, REQ-025, REQ-026).

mod fx;

use fx::{Fx, ONE, writes};
use shipyard_core::pickup::Writes;
use shipyard_core::run::{Cause, RunEvent, RunState};
use shipyard_engine::approvals::Write;

fn labels(l: &[&str]) -> Vec<String> {
    l.iter().map(|s| s.to_string()).collect()
}

/// The labels of the default state map and the pickup label `shipyard`.
fn managed() -> Vec<String> {
    let map = shipyard_store::automation_file::default_status_map();
    let mut all: Vec<String> = map.into_values().flat_map(|m| m.labels).collect();
    all.sort();
    all.dedup();
    all
}

#[test]
fn switch_on_sends_the_ticket_move_at_once() {
    let fx = Fx::new(writes(true), &[ONE]);
    fx.start("SHIP-1", &[]);
    assert_eq!(
        fx.writer.sent(),
        [
            Write::Transition {
                key: "SHIP-1".into(),
                status: "In Progress".into()
            },
            Write::Labels {
                key: "SHIP-1".into(),
                labels: labels(&["shipyard:running"]),
                managed: managed(),
            },
        ]
    );
    assert!(fx.f.approvals().is_empty());
}

#[test]
fn switch_off_queues_an_approval_that_names_the_write() {
    let fx = Fx::new(Writes::default(), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    assert!(fx.writer.sent().is_empty());
    let pending = fx.f.approvals();
    assert_eq!(pending.len(), 2);
    assert_eq!(pending[0].run, run);
    assert_eq!(
        pending[0].write,
        Write::Transition {
            key: "SHIP-1".into(),
            status: "In Progress".into()
        }
    );
    // One click sends it.
    fx.f.approve(pending[0].id).unwrap();
    assert_eq!(fx.writer.sent(), [pending[0].write.clone()]);
    assert_eq!(fx.f.approvals().len(), 1);
    assert!(fx.f.approve(pending[0].id).is_err());
    let log = fx.logged(&run, "write");
    assert!(log.iter().any(|w| w["state"] == "pending"));
    assert!(log.iter().any(|w| w["state"] == "sent"));
}

#[test]
fn a_rejected_ticket_move_is_skipped_and_the_run_goes_on() {
    let fx = Fx::new(Writes::default(), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    let before = fx.state(&run);
    let id = fx.f.approvals()[0].id;
    fx.f.reject(id).unwrap();
    assert_eq!(fx.state(&run), before);
    assert_eq!(before, RunState::Working);
    assert!(fx.writer.sent().is_empty());
    assert!(
        fx.logged(&run, "write")
            .iter()
            .any(|w| w["state"] == "rejected")
    );
}

#[test]
fn a_rejected_push_escalates_with_one_stop_report() {
    let fx = Fx::new(no_push(), &[]);
    let (run, id) = waiting_push(&fx);
    fx.f.reject(id).unwrap();
    assert_eq!(fx.state(&run), RunState::Blocked);
    let e = fx.f.run_info(&run).unwrap().escalation.unwrap();
    assert_eq!(e.cause, Cause::PushRejected);
    let reports: Vec<Write> = fx
        .writer
        .sent()
        .into_iter()
        .filter(|w| matches!(w, Write::Comment { body, .. } if body.contains("<!-- shipyard:stop")))
        .collect();
    assert_eq!(reports.len(), 1, "{reports:?}");
    assert!(
        !fx.writer
            .sent()
            .iter()
            .any(|w| matches!(w, Write::Push { .. }))
    );
}

#[test]
fn every_comment_of_shipyard_is_stored_as_its_own() {
    let fx = Fx::new(no_push(), &[]);
    let (run, id) = waiting_push(&fx);
    let summary = Write::Comment {
        key: "SHIP-1".into(),
        body: "a summary".into(),
    };
    let made = fx.f.write(&run, summary).unwrap().unwrap();
    // The stop report of the rejected push is a comment too.
    fx.f.reject(id).unwrap();
    let own = fx
        .mirror
        .lock()
        .unwrap()
        .questions(fx::SOURCE, "SHIP-1")
        .unwrap();
    let comments = fx
        .writer
        .sent()
        .iter()
        .filter(|w| matches!(w, Write::Comment { .. }))
        .count();
    assert_eq!(comments, 2);
    assert_eq!(own.len(), 2, "{own:?}");
    assert!(own.contains(&made));
}

#[test]
fn a_rejected_pull_request_escalates() {
    let mut w = writes(true);
    w.pull_request = false;
    let fx = Fx::new(w, &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    for step in ["triage", "fix", "review"] {
        fx.done(&run, step);
    }
    let a = fx.f.approvals().pop().unwrap();
    assert!(matches!(a.write, Write::OpenPr { .. }));
    fx.f.reject(a.id).unwrap();
    assert_eq!(fx.state(&run), RunState::Blocked);
    let e = fx.f.run_info(&run).unwrap().escalation.unwrap();
    assert_eq!(e.cause, Cause::PullRequestRejected);
}

#[test]
fn a_newer_ticket_move_replaces_the_pending_one() {
    let fx = Fx::new(Writes::default(), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.f.cancel(&run).unwrap();
    let moves: Vec<Write> =
        fx.f.approvals()
            .into_iter()
            .map(|a| a.write)
            .filter(|w| matches!(w, Write::Labels { .. }))
            .collect();
    // Cancelled maps to no label: only the last move waits.
    assert_eq!(
        moves,
        [Write::Labels {
            key: "SHIP-1".into(),
            labels: labels(&[]),
            managed: managed(),
        }]
    );
}

#[test]
fn pull_request_without_its_switch_waits_for_a_click() {
    let mut w = writes(true);
    w.pull_request = false;
    let fx = Fx::new(w, &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    for step in ["triage", "fix", "review"] {
        fx.done(&run, step);
    }
    assert_eq!(fx.state(&run), RunState::SelfReview);
    let a = fx.f.approvals().pop().unwrap();
    assert!(matches!(&a.write, Write::OpenPr { run: r, draft: true, .. } if *r == run));
    fx.f.approve(a.id).unwrap();
    assert_eq!(fx.state(&run), RunState::PROpen);
    assert_eq!(fx.f.run_info(&run).unwrap().pr, Some(7));
}

#[test]
fn force_with_lease_always_waits() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    let plain = Write::Push {
        run: run.clone(),
        branch: "feat/x/y".into(),
        base: "main".into(),
        force_with_lease: false,
    };
    assert_eq!(fx.f.write(&run, plain), Ok(Some(String::new())));
    let lease = Write::Push {
        run: run.clone(),
        branch: "feat/x/y".into(),
        base: "main".into(),
        force_with_lease: true,
    };
    assert_eq!(fx.f.write(&run, lease.clone()), Ok(None));
    assert_eq!(fx.f.approvals().pop().unwrap().write, lease);
}

#[test]
fn a_failed_pull_request_write_is_a_failed_step() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    for step in ["triage", "fix"] {
        fx.done(&run, step);
    }
    fx.writer.fail_with(Some("forge down"));
    fx.done(&run, "review");
    // The `pr` step has no retry: the run escalates, and no new run is `Failed` (`q:Q-166`).
    assert_eq!(fx.state(&run), RunState::Blocked);
    let e = fx.f.run_info(&run).unwrap().escalation.unwrap();
    assert_eq!(e.cause, Cause::Retries);
    assert!(
        fx.logged(&run, "write")
            .iter()
            .any(|w| w["error"] == "forge down")
    );
}

/// A bug run in `SelfReview` whose first push waits for a click.
fn waiting_push(fx: &Fx) -> (String, u64) {
    fx.git.set_branch("fix/engine/login");
    let run = fx.start("SHIP-1", &["wf:bug"]);
    for step in ["triage", "fix", "review"] {
        fx.done(&run, step);
    }
    assert_eq!(fx.state(&run), RunState::SelfReview);
    let id =
        fx.f.approvals()
            .into_iter()
            .find(|a| matches!(a.write, Write::Push { .. }))
            .unwrap()
            .id;
    (run, id)
}

fn no_push() -> Writes {
    Writes {
        push: false,
        ..writes(true)
    }
}

#[test]
fn a_cancelled_run_drops_its_delivery_approvals_and_a_click_sends_nothing() {
    let fx = Fx::new(no_push(), &[]);
    let (run, id) = waiting_push(&fx);
    fx.f.cancel(&run).unwrap();
    assert!(
        fx.f.approvals()
            .iter()
            .all(|a| !matches!(a.write, Write::Push { .. }))
    );
    assert!(fx.f.approve(id).is_err());
    assert!(
        !fx.writer
            .sent()
            .iter()
            .any(|w| matches!(w, Write::Push { .. }))
    );
    assert!(
        fx.logged(&run, "write")
            .iter()
            .any(|w| w["state"] == "dropped" && w["write"]["kind"] == "push")
    );
}

#[test]
fn a_failed_run_drops_its_delivery_approvals() {
    let fx = Fx::new(no_push(), &[]);
    let (run, id) = waiting_push(&fx);
    fx.f.apply(&run, RunEvent::Fail).unwrap();
    assert_eq!(fx.state(&run), RunState::Failed);
    assert!(fx.f.approve(id).is_err());
    assert!(
        fx.f.approvals()
            .iter()
            .all(|a| !matches!(a.write, Write::Push { .. }))
    );
}

#[test]
fn no_approval_goes_out_while_the_kill_switch_is_on() {
    let fx = Fx::new(Writes::default(), &[ONE]);
    fx.start("SHIP-1", &[]);
    let id = fx.f.approvals()[0].id;
    fx.f.set_kill_switch(true);
    let err = fx.f.approve(id).unwrap_err();
    assert!(err.contains("kill switch"), "{err}");
    assert!(fx.writer.sent().is_empty());
    // The click stays queued: it goes out when the switch is off.
    fx.f.set_kill_switch(false);
    assert!(fx.f.approve(id).is_ok());
}

#[test]
fn a_delivery_approval_waits_while_the_run_is_in_a_side_state() {
    let fx = Fx::new(no_push(), &[]);
    let (run, id) = waiting_push(&fx);
    fx.f.apply(&run, RunEvent::Block).unwrap();
    let err = fx.f.approve(id).unwrap_err();
    assert!(err.contains("Blocked"), "{err}");
    assert!(
        !fx.writer
            .sent()
            .iter()
            .any(|w| matches!(w, Write::Push { .. }))
    );
    // The approval stays. After the unblock the click goes out and the run goes on.
    fx.f.unblock(&run).unwrap();
    assert_eq!(fx.state(&run), RunState::SelfReview);
    fx.f.approve(id).unwrap();
    assert_eq!(fx.state(&run), RunState::PROpen);
}

/// A slow tracker write goes out with no lock: the views answer while it runs.
#[test]
fn a_slow_write_does_not_hold_the_factory() {
    use std::time::{Duration, Instant};
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.writer.set_delay(Duration::from_millis(600));
    let before = fx.writer.sent().len();
    std::thread::scope(|s| {
        let f = fx.f.clone();
        let run = run.clone();
        let write = s.spawn(move || {
            let comment = Write::Comment {
                key: "SHIP-1".into(),
                body: "hello".into(),
            };
            f.write(&run, comment).unwrap()
        });
        std::thread::sleep(Duration::from_millis(100));
        let t = Instant::now();
        assert_eq!(fx.f.runs().len(), 1);
        assert!(
            t.elapsed() < Duration::from_millis(300),
            "{:?}",
            t.elapsed()
        );
        assert!(!write.is_finished(), "the write was still out");
        assert!(write.join().unwrap().is_some());
    });
    assert_eq!(fx.writer.sent().len(), before + 1);
}

#[test]
fn a_write_that_the_member_of_the_run_cannot_do_waits_with_its_switch_on() {
    use shipyard_core::rights::Right;
    use shipyard_engine::run_engine::Actor;
    let fx = Fx::new(writes(true), &[ONE]);
    // `cy` has no `work.edit`: the ticket moves of the run wait for a person who has it.
    let cy = Actor {
        by: "cy".into(),
        rights: vec![Right::CodeWrite],
        hidden: Vec::new(),
    };
    fx.f.set_actor("ship", Some(cy));
    let run = fx.start("SHIP-1", &[]);
    assert!(fx.writer.sent().is_empty());
    let pending = fx.f.approvals();
    assert_eq!(pending.len(), 2);
    assert!(pending.iter().all(|a| a.write.right() == Right::WorkEdit));
    // Each event of the run names its member.
    let log = fx.logged(&run, "write");
    assert!(!log.is_empty() && log.iter().all(|w| w["by"] == "cy"));
    // One click of a person with the right sends it.
    fx.f.approve(pending[0].id).unwrap();
    assert_eq!(fx.writer.sent(), [pending[0].write.clone()]);
    // A run of a member with the right sends at once.
    fx.f.set_actor(
        "ship",
        Some(Actor {
            by: "ana".into(),
            rights: vec![Right::WorkEdit],
            hidden: Vec::new(),
        }),
    );
    fx.f.cancel(&run).unwrap();
    fx.start("SHIP-2", &[]);
    assert!(fx.writer.sent().len() > 1);
}

#[test]
fn a_run_with_no_member_has_no_right_and_its_writes_wait() {
    let fx = Fx::new(writes(true), &[ONE]);
    // A project whose person cannot be found: fail closed (`team-rights` REQ-009).
    fx.f.set_actor("ship", None);
    fx.start("SHIP-1", &[]);
    assert!(fx.writer.sent().is_empty());
    assert!(!fx.f.approvals().is_empty());
}

#[test]
fn a_run_from_before_team_rights_acts_for_the_person_of_the_project_and_waiting_writes_go() {
    let fx = Fx::new(writes(true), &[ONE]);
    // No person yet: the writes of the run wait.
    fx.f.set_actor("ship", None);
    fx.start("SHIP-1", &[]);
    assert!(fx.writer.sent().is_empty());
    let waiting = fx.f.approvals().len();
    assert!(waiting > 0);
    // The person of this machine is known again (a restart, a sign-in): the run has no member
    // of its own, so it acts for that person, and the writes that wait go out with no click.
    fx.f.set_actor("ship", Some(fx::solo()));
    assert!(fx.f.approvals().is_empty());
    assert_eq!(fx.writer.sent().len(), waiting);
}
