//! The pickup label goes at `Done` (spec `sync`, REQ-019). The default map already drops the
//! label `shipyard` at the claim: these tests use a pickup label that the map does not name.

mod fx;

use fx::{Fx, writes};
use shipyard_core::pickup::{PrEvent, PrEventKind, SyncEvent, Writes};
use shipyard_core::run::RunState;
use shipyard_engine::approvals::{Write, label_moves};
use shipyard_engine::ports::Dispatch;
use shipyard_engine::run_engine::Config;

fn fx(writes: Writes) -> Fx {
    Fx::build(writes, &[], Config::default(), |p| {
        p.automation.pickup.label = Some("ai".into());
    })
}

/// A bug run whose pull request (number 7) merged.
fn done(fx: &Fx) {
    let run = fx.start("SHIP-1", &["ai", "wf:bug"]);
    for step in ["triage", "fix", "review"] {
        fx.done(&run, step);
    }
    while let Some(a) =
        fx.f.approvals()
            .into_iter()
            .find(|a| matches!(a.write, Write::Push { .. } | Write::OpenPr { .. }))
    {
        fx.f.approve(a.id).unwrap();
    }
    assert_eq!(fx.state(&run), RunState::PROpen);
    fx.f.event(&SyncEvent::Pr(PrEvent {
        number: 7,
        kind: PrEventKind::Merged,
        title: String::new(),
        head_sha: String::new(),
        url: String::new(),
    }))
    .unwrap();
    assert_eq!(fx.state(&run), RunState::Done);
}

fn has_pickup(w: &Write) -> bool {
    matches!(w, Write::Labels { labels, .. } if labels.iter().any(|l| l == "ai"))
}

#[test]
fn at_done_the_issue_loses_the_pickup_label() {
    let fx = fx(writes(true));
    done(&fx);
    let labels: Vec<Write> = fx
        .writer
        .sent()
        .into_iter()
        .filter(|w| matches!(w, Write::Labels { .. }))
        .collect();
    assert!(has_pickup(&labels[0]), "{labels:?}");
    assert!(!has_pickup(labels.last().unwrap()), "{labels:?}");
    assert!(fx.f.approvals().is_empty());
}

#[test]
fn with_the_switch_off_the_label_stays_and_no_approval_removes_it() {
    let fx = fx(Writes::default());
    done(&fx);
    let labels: Vec<Write> =
        fx.f.approvals()
            .into_iter()
            .map(|a| a.write)
            .chain(fx.writer.sent())
            .filter(|w| matches!(w, Write::Labels { .. }))
            .collect();
    assert!(labels.iter().all(has_pickup), "{labels:?}");
}

#[test]
fn a_label_that_a_person_added_survives_each_state_change() {
    let fx = fx(writes(true));
    done(&fx);
    // The ticket in the tracker: the labels of the pickup, and `urgent` that a person added
    // during the run. The writer moves only the labels of Shipyard.
    let mut have = vec!["ai".to_string(), "wf:bug".into(), "urgent".into()];
    for w in fx.writer.sent() {
        if let Write::Labels {
            labels, managed, ..
        } = w
        {
            let (add, remove) = label_moves(&have, &labels, &managed);
            have.retain(|l| !remove.contains(l));
            have.extend(add);
        }
    }
    assert_eq!(have, ["wf:bug", "urgent"]);
}

#[test]
fn label_moves_ignore_case_and_an_old_approval_only_adds() {
    let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    let managed = s(&["shipyard:blocked", "shipyard:review"]);
    // The ticket has the label in another case: nothing moves.
    let (add, remove) = label_moves(
        &s(&["Shipyard:Blocked"]),
        &s(&["shipyard:blocked"]),
        &managed,
    );
    assert!(add.is_empty() && remove.is_empty(), "{add:?} {remove:?}");
    // An approval queued by an older version has no `managed`: it adds, it removes nothing.
    let (add, remove) = label_moves(&s(&["urgent"]), &s(&["shipyard:review"]), &[]);
    assert_eq!((add, remove), (s(&["shipyard:review"]), vec![]));
}
