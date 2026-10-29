//! Write switches and approvals (spec `factory`, REQ-008, REQ-025, REQ-026).

mod fx;

use fx::{Fx, ONE, writes};
use shipyard_core::pickup::Writes;
use shipyard_core::run::RunState;
use shipyard_engine::approvals::Write;

fn labels(l: &[&str]) -> Vec<String> {
    l.iter().map(|s| s.to_string()).collect()
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
                labels: labels(&["shipyard:running"])
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
fn rejection_drops_the_write_and_blocks_the_run() {
    let fx = Fx::new(Writes::default(), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    let id = fx.f.approvals()[0].id;
    fx.f.reject(id).unwrap();
    assert_eq!(fx.state(&run), RunState::Blocked);
    assert!(fx.writer.sent().is_empty());
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
            labels: labels(&[])
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
    assert_eq!(a.write, Write::OpenPr { run: run.clone() });
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
        force_with_lease: false,
    };
    assert_eq!(fx.f.write(&run, plain), Ok(Some(String::new())));
    let lease = Write::Push {
        run: run.clone(),
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
    // The `pr` step has no retry: the run fails.
    assert_eq!(fx.state(&run), RunState::Failed);
    assert!(
        fx.logged(&run, "write")
            .iter()
            .any(|w| w["error"] == "forge down")
    );
}
