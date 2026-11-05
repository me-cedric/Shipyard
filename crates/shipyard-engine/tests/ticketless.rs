//! A run with no issue tracker ticket (`docs-freshness`): it writes nothing to a tracker and its
//! pull request targets the branch that the label `base:` names.

mod fx;

use fx::{Fx, writes};
use shipyard_core::pickup::Writes;
use shipyard_engine::approvals::Write;

const FILES: [&str; 1] = ["docs/models/a.c4"];

#[test]
fn a_ticketless_run_makes_no_tracker_write_and_targets_its_base_branch() {
    // Every switch off: a tracker write would wait in the approvals.
    let fx = Fx::new(Writes::default(), &[]);
    let run = fx.start("docs:models", &["wf:docs-update", "base:topic"]);
    assert!(fx.f.approvals().is_empty(), "no tracker write waits: {run}");
    fx.git.set_changes(&FILES, &FILES);
    fx.done(&run, "update");
    let pending = fx.f.approvals();
    assert!(
        pending
            .iter()
            .all(|a| matches!(a.write, Write::Push { .. } | Write::OpenPr { .. }))
    );
    assert!(!pending.is_empty(), "the pull request waits for a click");
    let open = pending.iter().find_map(|a| match &a.write {
        Write::OpenPr { base, .. } | Write::Push { base, .. } => Some(base.clone()),
        _ => None,
    });
    assert_eq!(open.as_deref(), Some("topic"));
}

#[test]
fn a_real_ticket_still_moves_with_the_switch_on() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &["wf:docs-update"]);
    assert!(
        fx.writer
            .sent()
            .iter()
            .any(|w| matches!(w, Write::Transition { .. } | Write::Labels { .. })),
        "{run}"
    );
}
