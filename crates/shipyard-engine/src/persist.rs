//! A restart (spec `factory` REQ-021; `questions-loop`; `delivery`). The run log is the record.
//! The engine adds a small save for each run in the same file (`RunLog::save_snapshot`): the
//! run record, its steps, questions and the approvals that wait. Each public call of the factory
//! is one change, and the save follows it (`Guard`). At the start [`Inner::recover`] reads the
//! saves back, so the runs, the approval queue and the open questions survive.
//!
//! What a restart does with a run:
//! - A step that ran has no agent now. It goes back to `Pending` and keeps its CLI session. The
//!   pump starts it again: resumed on the session when it has one, else with a new brief.
//! - A run that waited (`PlanReview`, `WaitingForAnswer`, `Blocked`, `PROpen`, ...) waits.
//! - A run in `Merged` goes on with the close. The close is safe to repeat.
//! - A run that has no save and no end in the log is named in `take_errors`. It is not guessed.
//!
//! Writes. A save can be older than the log: the crash came after a write went out and before
//! the save. The log shows the writes after the save, each with its idempotency key (the write
//! itself, as text). When the engine makes the same write again, it does not send it a second
//! time: a write with a result is taken as done (`replayed`), and a comment or a thread reply
//! with an intent and no result may have gone out, so it is not sent again (at most once).
//! Another write is safe to repeat: the pull request step finds the real state first.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::json;
use shipyard_core::run::RunState;
use shipyard_core::workflow::StepState;
use shipyard_store::run_log::kind;

use crate::approvals::{Approval, Write};
use crate::run_engine::{Inner, RunRec};

const META: &str = "meta";

/// A write that the log shows after the last save of its run.
pub(crate) struct Replay {
    key: String,
    /// The id that the writer gave. `None`: the intent is in the log and the result is not.
    made: Option<String>,
}

#[derive(Serialize)]
struct Save<'a> {
    rec: &'a RunRec,
    approvals: Vec<&'a Approval>,
}

#[derive(Deserialize)]
struct Load {
    rec: RunRec,
    #[serde(default)]
    approvals: Vec<Approval>,
}

/// The idempotency key of a write: the write as text. Two writes with the same text, in the
/// window of one crash, are one write.
pub(crate) fn key_of(write: &Write) -> String {
    serde_json::to_string(write).unwrap_or_default()
}

/// A comment and a thread reply are not safe to repeat. The ticket moves, the labels, the push
/// and the pull request are: each one sets a state, and the pull request step finds it first.
fn repeats_badly(write: &Write) -> bool {
    matches!(write, Write::Comment { .. } | Write::ResolveThreads { .. })
}

impl Inner {
    /// Save each run that changed, and the global state when it changed.
    pub(crate) fn persist(&mut self) {
        for id in std::mem::take(&mut self.dirty) {
            let Some(rec) = self.runs.get(&id) else {
                continue;
            };
            let approvals = self.approvals.iter().filter(|a| a.run == id).collect();
            let saved = serde_json::to_value(Save { rec, approvals })
                .map_err(|e| e.to_string())
                .and_then(|value| {
                    let event = self.log.last_id(&id).map_err(|e| e.to_string())?;
                    let key = format!("run:{id}");
                    self.log
                        .save_snapshot(&key, event, &value)
                        .map_err(|e| e.to_string())
                });
            if let Err(e) = saved {
                self.errors.push(format!("run save {id}: {e}"));
            }
        }
        let meta = (self.seq, self.next_approval, self.kill);
        if meta != self.saved_meta {
            let value = json!({"seq": meta.0, "next_approval": meta.1, "kill": meta.2});
            match self.log.save_snapshot(META, 0, &value) {
                Ok(()) => self.saved_meta = meta,
                Err(e) => self.errors.push(format!("run save {META}: {e}")),
            }
        }
    }

    /// Read the saves back. It never fails the start: a save that cannot be read is named in
    /// `errors`, and its run stays in the log.
    pub(crate) fn recover(&mut self) {
        let snaps = match self.log.snapshots() {
            Ok(s) => s,
            Err(e) => {
                self.errors.push(format!("run saves: {e}"));
                return;
            }
        };
        let mut known = HashSet::new();
        for snap in snaps {
            if snap.key == META {
                let n = |k: &str| snap.value[k].as_u64().unwrap_or(0);
                (self.seq, self.next_approval) = (n("seq"), n("next_approval"));
                self.kill = snap.value["kill"].as_bool().unwrap_or(false);
                self.saved_meta = (self.seq, self.next_approval, self.kill);
                continue;
            }
            let Some(id) = snap.key.strip_prefix("run:") else {
                continue;
            };
            known.insert(id.to_string());
            let load: Load = match serde_json::from_value(snap.value) {
                Ok(l) => l,
                Err(e) => {
                    self.errors
                        .push(format!("run {id}: the save cannot be read: {e}"));
                    continue;
                }
            };
            let mut rec = load.rec;
            let wf = &rec.wf;
            for (sid, step) in &mut rec.steps {
                // An action step has no agent: the pull request step finds its place again.
                let action = wf.step(sid).is_some_and(|s| s.action.is_some());
                for u in &mut step.units {
                    if u.state == StepState::Running && !action {
                        u.state = StepState::Pending;
                        u.parked = true;
                    }
                }
            }
            let live = !rec.run.state.is_final();
            self.next_approval = load
                .approvals
                .iter()
                .map(|a| a.id)
                .fold(self.next_approval, u64::max);
            self.approvals.extend(load.approvals);
            self.runs.insert(id.to_string(), rec);
            self.replay_window(id, snap.event);
            if live {
                self.log(id, None, kind::NOTE, json!({"restart": "the run is back"}));
            }
        }
        self.approvals.sort_by_key(|a| a.id);
        self.name_orphans(&known);
    }

    /// The writes in the log after the save of `run`, with their keys.
    fn replay_window(&mut self, run: &str, after: i64) {
        let tail = match self.log.after(run, after) {
            Ok(t) => t,
            Err(e) => {
                self.errors.push(format!("run log {run}: {e}"));
                return;
            }
        };
        let mut window: Vec<Replay> = Vec::new();
        for e in tail.iter().filter(|e| e.kind == kind::WRITE) {
            let Some(key) = e.payload["key"].as_str() else {
                continue;
            };
            let made = e.payload["made"].as_str().map(str::to_string);
            match e.payload["state"].as_str() {
                Some("sending") => window.push(Replay {
                    key: key.into(),
                    made: None,
                }),
                Some("sent") => match window
                    .iter_mut()
                    .rfind(|r| r.key == key && r.made.is_none())
                {
                    Some(r) => r.made = made,
                    None => window.push(Replay {
                        key: key.into(),
                        made,
                    }),
                },
                // A failed write was not made: the engine may try it again.
                Some("failed") => {
                    if let Some(i) = window.iter().rposition(|r| r.key == key) {
                        window.remove(i);
                    }
                }
                _ => {}
            }
        }
        if !window.is_empty() {
            self.replay.insert(run.into(), window);
        }
    }

    /// A run in the log with no save and no end: name it.
    fn name_orphans(&mut self, known: &HashSet<String>) {
        let Ok(runs) = self.log.runs() else { return };
        for run in runs
            .iter()
            .filter(|r| !known.contains(*r) && !r.starts_with(crate::budget::RUN_PREFIX))
        {
            let ended = self
                .log
                .last(run, kind::STATE)
                .ok()
                .flatten()
                .and_then(|e| {
                    e.payload["to"]
                        .as_str()
                        .and_then(|s| s.parse::<RunState>().ok())
                })
                .is_some_and(RunState::is_final);
            if !ended {
                self.errors.push(format!(
                    "run {run} has no save and no end in the log: not resumed"
                ));
            }
        }
    }

    /// The write was sent before a restart, or may have been. `Some(Some(made))`: it is done.
    /// `Some(None)`: it may be done and is not safe to repeat. `None`: send it.
    pub(crate) fn take_replay(&mut self, run_id: &str, write: &Write) -> Option<Option<String>> {
        let key = key_of(write);
        let window = self.replay.get_mut(run_id)?;
        let at = window.iter().position(|r| r.key == key)?;
        let found = window.remove(at);
        match found.made {
            Some(made) => Some(Some(made)),
            None if repeats_badly(write) => Some(None),
            None => None,
        }
    }

    /// Note a write that may have gone out before a restart.
    pub(crate) fn maybe_sent(&mut self, run_id: &str, write: &Write) {
        let note = json!({
            "note": "a write may have gone out before the restart: it is not sent again",
            "write": write,
        });
        self.log(run_id, None, kind::NOTE, note);
    }
}
