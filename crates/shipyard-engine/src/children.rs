//! The join of the child worktrees at fan-in (spec `factory` REQ-013; `delivery` REQ-025).
//!
//! A step with `workspace: worktree` runs each child in its own worktree. When the last child
//! ends, the engine merges each child into the run folder, in child order, as a squash: the
//! change stays uncommitted there, and the pull request step makes the one commit. A conflict
//! blocks the run with the files in the event, and keeps every worktree. After a click on
//! `unblock` the join tries again for the children that are not joined. When all are joined, the
//! worktrees of the children go.

use serde_json::json;
use shipyard_core::workflow::StepState;
use shipyard_store::run_log::kind;

use crate::ports::Merge;
use crate::run_engine::Inner;

impl Inner {
    /// `true` when every child is joined and cleaned up. `false`: the run is blocked.
    pub(crate) fn join_children(&mut self, run_id: &str, sid: &str) -> bool {
        let Some(git) = self.project_of(run_id).map(|p| p.git.clone()) else {
            return self.block(run_id, sid, "the project is not open");
        };
        let ids: Vec<(String, bool)> = self.runs[run_id].steps[sid]
            .units
            .iter()
            .map(|u| (u.id.clone(), u.merged))
            .collect();
        for (i, (child, merged)) in ids.iter().enumerate() {
            if *merged {
                continue;
            }
            let why = match git.merge_child(run_id, child) {
                Ok(Merge::Conflicts(files)) => {
                    format!("merge conflict: child {child}: {}", files.join(", "))
                }
                Ok(_) => {
                    self.rec(run_id).steps.get_mut(sid).expect("step").units[i].merged = true;
                    self.log(run_id, Some(child), kind::NOTE, json!({"merged": child}));
                    continue;
                }
                Err(e) => format!("merge of child {child}: {e}"),
            };
            self.rec(run_id)
                .steps
                .get_mut(sid)
                .expect("step")
                .merge_pending = true;
            return self.block(run_id, sid, &why);
        }
        for (child, _) in &ids {
            if let Err(e) = git.remove_child(run_id, child) {
                let note = json!({"note": format!("worktree of {child} stays: {e}")});
                self.log(run_id, Some(child), kind::NOTE, note);
            }
        }
        self.rec(run_id)
            .steps
            .get_mut(sid)
            .expect("step")
            .merge_pending = false;
        true
    }

    /// A run that came back from `Blocked` joins the children that are left, then the step ends.
    pub(crate) fn retry_merges(&mut self, run_id: &str) {
        if !self.runs[run_id].run.state.clocks_run() {
            return;
        }
        let pending: Vec<String> = self.runs[run_id]
            .steps
            .iter()
            .filter(|(_, s)| s.merge_pending && s.state == StepState::Running)
            .map(|(id, _)| id.clone())
            .collect();
        for sid in pending {
            self.step_done(run_id, &sid, false);
        }
    }
}
