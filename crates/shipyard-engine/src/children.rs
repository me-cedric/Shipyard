//! The join of the child worktrees at fan-in (spec `factory` REQ-013; `delivery` REQ-025).
//!
//! A step with `workspace: worktree` runs each child in its own worktree. When the last child
//! ends, the engine merges each child into the run branch, in child order, as a squash: one
//! commit for each child (`Git::merge_child`). The pull request step commits what is left. The
//! first conflict of a child removes its worktree and runs it again from the run branch, which
//! holds the siblings that joined. A second conflict blocks the run with the files in the event,
//! and keeps every worktree. After a click on `unblock` the join tries again for the children
//! that are not joined, and a child that conflicts again gets one more redo. When all are joined,
//! the worktrees of the children go.

use std::sync::Arc;

use serde_json::json;
use shipyard_core::delivery;
use shipyard_core::workflow::StepState;
use shipyard_store::run_log::kind;

use crate::ports::{Git, Merge};
use crate::run_engine::Inner;

impl Inner {
    /// `true` when every child is joined and cleaned up. `false`: the run is blocked, or a child
    /// that conflicted runs again. A first conflict of a child is a redo from the run branch, with
    /// the siblings that joined; a second one blocks the run.
    pub(crate) fn join_children(&mut self, run_id: &str, sid: &str) -> bool {
        let Some(git) = self.project_of(run_id).map(|p| p.git.clone()) else {
            return self.block(run_id, sid, "the project is not open");
        };
        let rec = &self.runs[run_id];
        let title = rec.title.lines().next().unwrap_or_default().to_string();
        let ty = delivery::commit_type(rec.kind);
        let ids: Vec<(String, bool, bool)> = rec.steps[sid]
            .units
            .iter()
            .map(|u| (u.id.clone(), u.merged, u.redone))
            .collect();
        let mut redo = Vec::new();
        for (i, (child, merged, redone)) in ids.iter().enumerate() {
            if *merged {
                continue;
            }
            let message =
                delivery::conventional(ty, &delivery::kebab(sid), &format!("{title} ({child})"));
            let why = match git.merge_child(run_id, child, &message) {
                Ok(Merge::Conflicts(files)) if !*redone => {
                    redo.push((i, files));
                    continue;
                }
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
        if !redo.is_empty() {
            return self.redo(run_id, sid, &git, redo);
        }
        for (child, _, _) in &ids {
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

    /// Start the conflicted children again in fresh worktrees from the run branch, with a note.
    /// Always `false`: the step waits for them.
    fn redo(
        &mut self,
        run_id: &str,
        sid: &str,
        git: &Arc<dyn Git>,
        redo: Vec<(usize, Vec<String>)>,
    ) -> bool {
        for (i, files) in redo {
            let child = self.runs[run_id].steps[sid].units[i].id.clone();
            // A worktree that stays is used again: its redo conflicts again and blocks the run.
            if let Err(e) = git.remove_child(run_id, &child) {
                let note = json!({"note": format!("worktree of {child} stays: {e}")});
                self.log(run_id, Some(&child), kind::NOTE, note);
            }
            let s = self.rec(run_id).steps.get_mut(sid).expect("step");
            let u = &mut s.units[i];
            let whose = match &u.item {
                Some(item) => format!("The first change for the item {item}"),
                None => "Your first change".into(),
            };
            u.redone = true;
            u.state = StepState::Pending;
            u.session = None;
            u.parked = false;
            u.retry_at = None;
            u.output = serde_json::Value::Null;
            u.text.clear();
            s.notes.push(format!(
                "{whose} conflicted with another task on {}. The run branch now holds the \
                 other tasks. Do this task again on top of it.",
                files.join(", ")
            ));
            s.merge_pending = false;
            self.log(
                run_id,
                Some(&child),
                kind::NOTE,
                json!({"redo": child, "files": files}),
            );
        }
        false
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
