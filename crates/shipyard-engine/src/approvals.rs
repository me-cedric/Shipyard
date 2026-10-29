//! Write switches and approvals (spec `factory`, REQ-025, REQ-026; `questions-loop` REQ-016).
//!
//! A write with its switch on goes out at once. A write without its switch waits in the queue
//! until a person approves it (Home / Inbox). A rejection drops it and blocks the run. A push with
//! force with lease always waits (`delivery` REQ-015). Each step of the life of a write is one
//! `write` event in the run log.

use serde::{Deserialize, Serialize};
use serde_json::json;
use shipyard_core::pickup::{Writes, answer_marker, question_marker};
use shipyard_core::run::RunEvent;
use shipyard_store::run_log::kind;

use crate::jobs::{Slot, Work};
use crate::ports::PortResult;
use crate::run_engine::{Factory, Inner};

fn set(slot: Option<&Slot>, made: String) {
    if let Some(s) = slot {
        *s.lock().unwrap_or_else(|e| e.into_inner()) = Some(made);
    }
}

/// One write of the factory. The approval names it exactly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Write {
    /// Move the ticket to a status (`tracker_transition`).
    Transition { key: String, status: String },
    /// Set the labels of the ticket to this list (`tracker_transition`, REQ-008).
    Labels { key: String, labels: Vec<String> },
    /// Post a comment (`tracker_comment`). A question comment holds its marker.
    Comment { key: String, body: String },
    /// Push the run branch (`push`). With lease: always an approval.
    Push {
        run: String,
        branch: String,
        base: String,
        force_with_lease: bool,
    },
    /// Open the pull request of the run as a draft (`pull_request`). The labels exist already.
    OpenPr {
        run: String,
        branch: String,
        base: String,
        title: String,
        body: String,
        labels: Vec<String>,
        reviewers: Vec<String>,
        draft: bool,
    },
    /// Reply on each thread and resolve it (`pull_request`, `delivery` REQ-019).
    ResolveThreads {
        run: String,
        threads: Vec<String>,
        reply: String,
    },
}

impl Write {
    /// Is the switch of this write on?
    pub fn allowed(&self, w: &Writes) -> bool {
        match self {
            Self::Transition { .. } | Self::Labels { .. } => w.tracker_transition,
            Self::Comment { .. } => w.tracker_comment,
            Self::Push {
                force_with_lease, ..
            } => w.push && !force_with_lease,
            Self::OpenPr { .. } | Self::ResolveThreads { .. } => w.pull_request,
        }
    }

    /// A push, a pull request or a thread reply: a write that needs a live pull request branch.
    pub(crate) fn is_delivery(&self) -> bool {
        matches!(
            self,
            Self::Push { .. } | Self::OpenPr { .. } | Self::ResolveThreads { .. }
        )
    }

    /// Two writes of the same slot: the newer one replaces a pending older one. Only the last
    /// ticket move of a run matters.
    fn same_slot(&self, other: &Self) -> bool {
        matches!(
            (self, other),
            (Self::Transition { .. }, Self::Transition { .. })
                | (Self::Labels { .. }, Self::Labels { .. })
        )
    }
}

/// A write that waits for a person.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Approval {
    pub id: u64,
    /// The ULID of the run.
    pub run: String,
    pub write: Write,
}

impl Inner {
    /// Send the write when its switch is on, else queue it.
    pub(crate) fn write(&mut self, run_id: &str, write: Write) {
        self.write_with(run_id, write, None);
    }

    /// `write`, and `slot` gets the id that the write made once it went out.
    pub(crate) fn write_with(&mut self, run_id: &str, write: Write, slot: Option<Slot>) {
        let allowed = self
            .project_of(run_id)
            .is_some_and(|p| write.allowed(&p.automation.writes));
        if allowed {
            self.send(run_id, &write, slot);
            return;
        }
        if let Some(old) = self
            .approvals
            .iter()
            .position(|a| a.run == run_id && a.write.same_slot(&write))
        {
            let old = self.approvals.remove(old);
            self.log_write(run_id, Some(old.id), "replaced", &old.write);
        }
        self.next_approval += 1;
        let id = self.next_approval;
        self.log_write(run_id, Some(id), "pending", &write);
        self.approvals.push(Approval {
            id,
            run: run_id.into(),
            write,
        });
    }

    /// Phase one of a write: log its intent and queue the call, which runs with no lock
    /// (`jobs`). After a restart a write that the log shows is not sent a second time
    /// (`persist`).
    pub(crate) fn send(&mut self, run_id: &str, write: &Write, slot: Option<Slot>) {
        let Some(writer) = self.project_of(run_id).map(|p| p.writer.clone()) else {
            return;
        };
        let key = crate::persist::key_of(write);
        match self.take_replay(run_id, write) {
            Some(Some(made)) => {
                let payload =
                    json!({"state": "replayed", "key": key, "write": write, "made": made});
                self.log(run_id, None, kind::WRITE, payload);
                self.sent(run_id, write, &made, true);
                set(slot.as_ref(), made);
                return;
            }
            Some(None) => {
                self.maybe_sent(run_id, write);
                return;
            }
            None => {}
        }
        let intent = json!({"state": "sending", "key": key, "write": write});
        self.log(run_id, None, kind::WRITE, intent);
        let work = Work::Write {
            write: write.clone(),
            writer,
            slot,
        };
        self.queue(run_id, work);
    }

    /// Phase two of a write. An error is logged. A pull request that opened is a fact and is
    /// recorded. The next stage runs only when the run did not change (`same`).
    pub(crate) fn write_done(
        &mut self,
        run_id: &str,
        write: &Write,
        result: PortResult<String>,
        same: bool,
        slot: Option<Slot>,
    ) {
        match result {
            Ok(made) => {
                self.log_write_made(run_id, write, &made);
                self.sent(run_id, write, &made, same);
                set(slot.as_ref(), made);
            }
            Err(e) => {
                let key = crate::persist::key_of(write);
                self.log(
                    run_id,
                    None,
                    kind::WRITE,
                    json!({"state": "failed", "key": key, "write": write, "error": e}),
                );
                if same && matches!(write, Write::OpenPr { .. } | Write::Push { .. }) {
                    self.action_failed(run_id, &e);
                }
            }
        }
    }

    /// What a sent write changes in the run.
    fn sent(&mut self, run_id: &str, write: &Write, made: &str, same: bool) {
        let Some(rec) = self.runs.get_mut(run_id) else {
            return;
        };
        match write {
            Write::Push { .. } => {
                rec.d.pushed = true;
                rec.d.rewrote = false;
                // A run that changed goes on from the next pump (`drive_pr`).
                if same {
                    self.advance_pr(run_id);
                }
            }
            Write::Transition { status, .. } => rec.ticket_status = status.clone(),
            Write::Labels { labels, .. } => rec.labels = labels.clone(),
            Write::Comment { key, body } => {
                // A question comment: remember its id, so `answers` reads it as a marker.
                let posted = match self.projects.get(&rec.project) {
                    Some(p)
                        if question_marker(body)
                            .or_else(|| answer_marker(body))
                            .is_some() =>
                    {
                        p.mirror
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .question_posted(&p.source, key, made)
                    }
                    _ => Ok(()),
                };
                if let Err(e) = posted {
                    let note = json!({"note": format!("question_posted: {e}")});
                    self.log(run_id, None, kind::NOTE, note);
                }
            }
            Write::OpenPr { .. } => self.pr_opened(run_id, made),
            Write::ResolveThreads { .. } => {}
        }
    }

    fn log_write(&mut self, run_id: &str, id: Option<u64>, state: &str, write: &Write) {
        let payload = json!({"approval": id, "state": state, "write": write});
        self.log(run_id, None, kind::WRITE, payload);
    }

    fn log_write_made(&mut self, run_id: &str, write: &Write, made: &str) {
        let key = crate::persist::key_of(write);
        let payload = json!({"state": "sent", "key": key, "write": write, "made": made});
        self.log(run_id, None, kind::WRITE, payload);
    }
}

impl Factory {
    /// The writes that wait for a person, oldest first.
    pub fn approvals(&self) -> Vec<Approval> {
        self.lock().approvals.clone()
    }

    /// A person's click: send the write. `Err` when no such approval waits, while the kill
    /// switch is on, and for a delivery write of a run that ended (the write is dropped) or that
    /// is in a side state (the write stays: click again when the run goes on). A ticket move or
    /// a comment of an ended run still goes: it is the close.
    pub fn approve(&self, id: u64) -> Result<Option<String>, String> {
        let mut inner = self.lock();
        inner.check_approvable(id)?;
        let a = inner.take_approval(id)?;
        inner.log_write(&a.run, Some(id), "approved", &a.write);
        let slot = Slot::default();
        inner.send(&a.run, &a.write, Some(slot.clone()));
        // The lock goes at the end of the block and the call runs (`jobs`).
        drop(inner);
        let made = slot.lock().unwrap_or_else(|e| e.into_inner()).take();
        Ok(made)
    }

    /// A person rejects the write: it is dropped and the run goes to `Blocked` (REQ-026).
    pub fn reject(&self, id: u64) -> Result<(), String> {
        let mut inner = self.lock();
        let a = inner.take_approval(id)?;
        inner.log_write(&a.run, Some(id), "rejected", &a.write);
        inner.transition(&a.run, RunEvent::Block);
        Ok(())
    }

    /// A write of another capability (`delivery`: push, pull request). It follows the switches.
    /// `Ok(Some(id))`: sent. `Ok(None)`: it waits for a person, or it failed (see the run log).
    pub fn write(&self, run_id: &str, write: Write) -> Result<Option<String>, String> {
        let mut inner = self.lock();
        inner.run(run_id)?;
        let slot = Slot::default();
        inner.write_with(run_id, write, Some(slot.clone()));
        drop(inner);
        let made = slot.lock().unwrap_or_else(|e| e.into_inner()).take();
        Ok(made)
    }
}

impl Inner {
    /// The pull request merged: a push, a pull request or a thread reply that waits for a click
    /// has no target now. Drop them. The ticket move and the summary stay: they are the close.
    pub(crate) fn drop_delivery_approvals(&mut self, run_id: &str) {
        let (gone, kept): (Vec<_>, Vec<_>) = std::mem::take(&mut self.approvals)
            .into_iter()
            .partition(|a| a.run == run_id && a.write.is_delivery());
        self.approvals = kept;
        for a in gone {
            self.log_write(run_id, Some(a.id), "dropped", &a.write);
        }
    }

    /// A question comment that waits for a click is dropped: the answer comment holds the
    /// question (`questions-loop` REQ-016). `true` when one was dropped.
    pub(crate) fn drop_question_approvals(&mut self, run_id: &str, qid: &str) -> bool {
        let (gone, kept): (Vec<_>, Vec<_>) = std::mem::take(&mut self.approvals)
            .into_iter()
            .partition(|a| {
                a.run == run_id
                    && matches!(&a.write, Write::Comment { body, .. } if question_marker(body) == Some(qid))
            });
        self.approvals = kept;
        for a in &gone {
            self.log_write(run_id, Some(a.id), "replaced", &a.write);
        }
        !gone.is_empty()
    }

    fn check_approvable(&mut self, id: u64) -> Result<(), String> {
        let a = self
            .approvals
            .iter()
            .find(|a| a.id == id)
            .ok_or_else(|| format!("no approval {id} waits"))?
            .clone();
        if self.kill {
            return Err("the kill switch is on: no write goes out".into());
        }
        let Some(state) = self.runs.get(&a.run).map(|r| r.run.state) else {
            return Ok(());
        };
        if a.write.is_delivery() && state.is_final() {
            self.drop_delivery_approvals(&a.run);
            return Err(format!(
                "the run is {}: the write is dropped",
                state.as_str()
            ));
        }
        if a.write.is_delivery() && state.is_side() {
            return Err(format!(
                "the run is {}: approve the write when it goes on",
                state.as_str()
            ));
        }
        Ok(())
    }

    fn take_approval(&mut self, id: u64) -> Result<Approval, String> {
        let at = self
            .approvals
            .iter()
            .position(|a| a.id == id)
            .ok_or_else(|| format!("no approval {id} waits"))?;
        Ok(self.approvals.remove(at))
    }
}
