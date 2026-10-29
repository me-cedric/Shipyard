//! Write switches and approvals (spec `factory`, REQ-025, REQ-026; `questions-loop` REQ-016).
//!
//! A write with its switch on goes out at once. A write without its switch waits in the queue
//! until a person approves it (Home / Inbox). A rejection drops it and blocks the run. A push with
//! force with lease always waits (`delivery` REQ-015). Each step of the life of a write is one
//! `write` event in the run log.

use serde::Serialize;
use serde_json::json;
use shipyard_core::pickup::{Writes, question_marker};
use shipyard_core::run::RunEvent;
use shipyard_store::run_log::kind;

use crate::run_engine::{Factory, Inner};

/// One write of the factory. The approval names it exactly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Approval {
    pub id: u64,
    /// The ULID of the run.
    pub run: String,
    pub write: Write,
}

impl Inner {
    /// Send the write when its switch is on, else queue it. `Some(id)` when it went out.
    pub(crate) fn write(&mut self, run_id: &str, write: Write) -> Option<String> {
        let allowed = self
            .project_of(run_id)
            .is_some_and(|p| write.allowed(&p.automation.writes));
        if allowed {
            return self.send(run_id, &write);
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
        None
    }

    /// Send one write and apply what it made. An error is logged: the caller decides.
    pub(crate) fn send(&mut self, run_id: &str, write: &Write) -> Option<String> {
        let writer = self.project_of(run_id).map(|p| p.writer.clone())?;
        match writer.send(write) {
            Ok(made) => {
                self.log_write_made(run_id, write, &made);
                self.sent(run_id, write, &made);
                Some(made)
            }
            Err(e) => {
                self.log(
                    run_id,
                    None,
                    kind::WRITE,
                    json!({"state": "failed", "write": write, "error": e}),
                );
                if matches!(write, Write::OpenPr { .. } | Write::Push { .. }) {
                    self.action_failed(run_id, &e);
                }
                None
            }
        }
    }

    /// What a sent write changes in the run.
    fn sent(&mut self, run_id: &str, write: &Write, made: &str) {
        let Some(rec) = self.runs.get_mut(run_id) else {
            return;
        };
        match write {
            Write::Push { .. } => {
                rec.d.pushed = true;
                rec.d.rewrote = false;
                self.advance_pr(run_id);
            }
            Write::Transition { status, .. } => rec.ticket_status = status.clone(),
            Write::Labels { labels, .. } => rec.labels = labels.clone(),
            Write::Comment { key, body } => {
                // A question comment: remember its id, so `answers` reads it as a marker.
                let posted = match self.projects.get(&rec.project) {
                    Some(p) if question_marker(body).is_some() => p
                        .mirror
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .question_posted(&p.source, key, made),
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
        let payload = json!({"state": "sent", "write": write, "made": made});
        self.log(run_id, None, kind::WRITE, payload);
    }
}

impl Factory {
    /// The writes that wait for a person, oldest first.
    pub fn approvals(&self) -> Vec<Approval> {
        self.lock().approvals.clone()
    }

    /// A person's click: send the write. `Err` when no such approval waits.
    pub fn approve(&self, id: u64) -> Result<Option<String>, String> {
        let mut inner = self.lock();
        let a = inner.take_approval(id)?;
        inner.log_write(&a.run, Some(id), "approved", &a.write);
        Ok(inner.send(&a.run, &a.write))
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
        Ok(inner.write(run_id, write))
    }
}

impl Inner {
    fn take_approval(&mut self, id: u64) -> Result<Approval, String> {
        let at = self
            .approvals
            .iter()
            .position(|a| a.id == id)
            .ok_or_else(|| format!("no approval {id} waits"))?;
        Ok(self.approvals.remove(at))
    }
}
