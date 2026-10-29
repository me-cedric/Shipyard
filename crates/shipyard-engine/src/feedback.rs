//! Pull request events and the feedback loop (spec `delivery`, REQ-018 to REQ-020, REQ-026).
//!
//! The tick hands each event of a pull request to the run that holds it. A merge goes to the close
//! (`merge.rs`). A CI failure or a review that asks for changes starts a feedback round:
//! `PROpen`, `ChangesRequested`, `Working`, in the same run folder. The failed checks (names, URLs,
//! log tails) and the open threads go to the builder steps as notes. The review and the pull
//! request step run again, and the push goes to the same pull request. The loop counts against
//! the budget and the max turns of the run: at the turn limit the run fails, and at the budget the
//! run pauses (`Usage` of the agents) with the feedback of the round kept for the resume. A pull request that closes without a merge
//! blocks the run and leaves the worktree and the ticket as they are.

use serde_json::json;
use shipyard_core::pickup::PrEventKind;
use shipyard_core::run::{RunEvent, RunState};
use shipyard_core::workflow::Action;
use shipyard_store::run_log::kind;

use crate::ports::{FailedCheck, Thread};
use crate::run_engine::{Inner, Kind, kind_of, reset};

fn check_text(c: &FailedCheck) -> String {
    let mut t = format!("- check `{}` failed: {}", c.name, c.url);
    if let Some(tail) = c.tail.as_deref().filter(|t| !t.trim().is_empty()) {
        t.push_str(&format!("\n  Log tail:\n{tail}"));
    }
    t
}

fn thread_text(t: &Thread) -> String {
    let at = match (&t.path, t.line) {
        (Some(p), Some(l)) => format!("{p}:{l}"),
        (Some(p), None) => p.clone(),
        _ => "the pull request".into(),
    };
    format!("- thread `{}` on {at}: {}", t.id, t.text)
}

impl Inner {
    pub(crate) fn on_pr(&mut self, number: u64, event: PrEventKind) {
        let ids: Vec<String> = self
            .runs
            .values()
            .filter(|r| r.pr == Some(number) && !r.run.state.is_final())
            .map(|r| r.id.clone())
            .collect();
        for id in ids {
            let note = json!({"number": number, "event": format!("{event:?}")});
            self.log(&id, None, kind::PR, note);
            match event {
                PrEventKind::Merged => {
                    if self.transition(&id, RunEvent::PrMerged) {
                        self.close_merged(&id);
                    }
                }
                PrEventKind::ChangesRequested | PrEventKind::CiFailed => {
                    self.feedback(&id, number, event);
                }
                PrEventKind::Closed => self.pr_closed(&id),
                PrEventKind::Opened | PrEventKind::CiPassed => {}
            }
        }
    }

    /// A pull request that closed with no merge (REQ-026). A run that works on a fix is blocked
    /// too: its pull request is gone.
    fn pr_closed(&mut self, run_id: &str) {
        let state = self.runs[run_id].run.state;
        if state == RunState::Merged || !state.is_active() {
            return;
        }
        let note = json!({"blocked": "pull request closed"});
        self.log(run_id, None, kind::NOTE, note);
        self.transition(run_id, RunEvent::Block);
    }

    /// The text of a feedback event: what the forge says is wrong. A read that fails still gives
    /// a note, so the event is never lost.
    fn gather(&mut self, run_id: &str, number: u64, event: PrEventKind) -> (String, Vec<String>) {
        let Some(pulls) = self.project_of(run_id).map(|p| p.pulls.clone()) else {
            return (format!("The pull request event: {event:?}."), Vec::new());
        };
        if event == PrEventKind::CiFailed {
            return match pulls.failed_checks(number) {
                Ok(checks) if !checks.is_empty() => {
                    let list: Vec<String> = checks.iter().map(check_text).collect();
                    (format!("CI failed:\n{}", list.join("\n")), Vec::new())
                }
                Ok(_) => (
                    "CI failed. The forge names no failed check.".into(),
                    Vec::new(),
                ),
                Err(e) => (
                    format!("CI failed. The checks cannot be read: {e}"),
                    Vec::new(),
                ),
            };
        }
        match pulls.threads(number) {
            Ok(threads) if !threads.is_empty() => {
                let list: Vec<String> = threads.iter().map(thread_text).collect();
                let ids = threads.into_iter().map(|t| t.id).collect();
                (
                    format!("A reviewer asks for changes:\n{}", list.join("\n")),
                    ids,
                )
            }
            Ok(_) => (
                "A reviewer asks for changes. No open thread is left.".into(),
                Vec::new(),
            ),
            Err(e) => (
                format!("A reviewer asks for changes. The threads cannot be read: {e}"),
                Vec::new(),
            ),
        }
    }

    fn feedback(&mut self, run_id: &str, number: u64, event: PrEventKind) {
        let (note, threads) = self.gather(run_id, number, event);
        let rec = self.rec(run_id);
        for t in threads {
            if !rec.d.threads.contains(&t) {
                rec.d.threads.push(t);
            }
        }
        if rec.d.fixing {
            // A second signal during the round: the builder reads it with the first one.
            self.add_note(run_id, &note);
        } else {
            self.rec(run_id).d.feedback.push(note);
            self.take_feedback(run_id);
        }
    }

    /// Start a feedback round with the feedback that waits, when the run can take it (`PROpen`)
    /// and the limits allow it (REQ-020).
    pub(crate) fn take_feedback(&mut self, run_id: &str) {
        let rec = &self.runs[run_id];
        if rec.d.feedback.is_empty() || rec.run.state != RunState::PROpen {
            return;
        }
        if rec.turns >= rec.wf.limits.max_turns {
            let why = format!("max turns ({}): no room for a feedback round", rec.turns);
            self.log(run_id, None, kind::NOTE, json!({"stop": why}));
            self.transition(run_id, RunEvent::Fail);
            return;
        }
        let notes = std::mem::take(&mut self.rec(run_id).d.feedback).join("\n");
        if !self.transition(run_id, RunEvent::ChangesRequested) {
            return;
        }
        let rec = self.rec(run_id);
        rec.d.fixing = true;
        rec.d.pushed = false;
        rec.d.sha = None;
        rec.d.findings.clear();
        rec.rounds = 0;
        let wf = rec.wf.clone();
        let Some(action) = wf.steps.iter().find(|s| s.action == Some(Action::OpenPr)) else {
            return;
        };
        // The pull request step, the review that it needs, and the builders behind the review.
        let mut again = vec![(action.id.clone(), false)];
        for n in &action.needs {
            let Some(step) = wf.step(n) else { continue };
            let review = kind_of(step) == Kind::Review;
            again.push((n.clone(), !review));
            if review {
                again.extend(step.needs.iter().map(|b| (b.clone(), true)));
            }
        }
        for (sid, builder) in again {
            if let Some(s) = self.rec(run_id).steps.get_mut(&sid) {
                reset(s, if builder { &notes } else { "" });
            }
        }
        self.log(run_id, None, kind::NOTE, json!({"feedback": notes}));
        self.transition(run_id, RunEvent::FixStarted);
    }

    /// A second signal during a round: add the note to the builders that run again.
    fn add_note(&mut self, run_id: &str, note: &str) {
        let wf = self.runs[run_id].wf.clone();
        for step in wf.steps.iter().filter(|s| kind_of(s) == Kind::Build) {
            if let Some(s) = self.rec(run_id).steps.get_mut(&step.id)
                && s.state != shipyard_core::workflow::StepState::Done
            {
                s.notes.push(note.into());
            }
        }
    }
}
