//! The close of a merged run (spec `delivery`, REQ-022 to REQ-025).
//!
//! The tick hands the merge event to the run before it stops runs for a terminal ticket. The run
//! is `Merged` (the ticket moves with the state map: the `tracker_transition` switch or an
//! approval, and no move for a ticket that the forge closed). Then the run summary goes to the
//! ticket once (`tracker_comment` or an approval). Then the worktrees go, and a dirty one stays
//! with its files named. Last, the run is `Done` and its claim goes (`Factory::take_ended`). The
//! run log stays. A write that waits for a click does not hold the run: it goes on after the
//! click.

use serde_json::json;
use shipyard_core::run::RunEvent;
use shipyard_store::pr;
use shipyard_store::run_log::kind;

use crate::approvals::Write;
use crate::run_engine::Inner;

impl Inner {
    /// The run summary (REQ-024): the outcome, the `pr:` ref, the gate, the review rounds and the
    /// cost. No secret, no attribution: it holds only what the run log holds.
    fn summary(&self, run_id: &str) -> String {
        let rec = &self.runs[run_id];
        let forge = self.project_of(run_id).map_or("", |p| p.forge.as_str());
        let pr = rec.pr.map_or_else(
            || "none".to_string(),
            |n| pr::pr_ref(forge, n).unwrap_or_else(|_| format!("#{n}")),
        );
        let gate = if rec.d.gate.is_empty() {
            "none".to_string()
        } else {
            rec.d
                .gate
                .iter()
                .map(|g| {
                    let verdict = if g.passed { "passed" } else { "failed" };
                    format!("`{}` {verdict}, {}", g.command, g.counts)
                })
                .collect::<Vec<_>>()
                .join("; ")
        };
        format!(
            "Shipyard run run:{run_id}: merged.\n\nPull request: {pr}\nGate: {gate}\n\
             Review fix rounds: {}\nCost: ${:.2}",
            rec.rounds, rec.cost
        )
    }

    /// Summary, worktrees, then `Done`. The run is `Merged` already.
    pub(crate) fn close_merged(&mut self, run_id: &str) {
        self.drop_delivery_approvals(run_id);
        let (Some(writer), key) = (
            self.project_of(run_id).map(|p| p.writer.clone()),
            self.runs[run_id].key.clone(),
        ) else {
            return;
        };
        if !self.runs[run_id].d.summarized && writer.can_comment() {
            self.rec(run_id).d.summarized = true;
            let body = shipyard_core::delivery::clean_outgoing(&self.summary(run_id));
            self.write(run_id, Write::Comment { key, body });
        }
        if let Some(git) = self.project_of(run_id).map(|p| p.git.clone()) {
            match git.remove_worktrees(run_id) {
                Ok(()) => {}
                Err(e) => {
                    self.log(run_id, None, kind::NOTE, json!({"worktree_kept": e}));
                    self.rec(run_id).d.kept = Some(e);
                }
            }
        }
        self.transition(run_id, RunEvent::Closed);
    }
}
