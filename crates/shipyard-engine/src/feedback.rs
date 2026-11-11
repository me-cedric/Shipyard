//! Pull request events and the feedback loop (spec `delivery`, REQ-018 to REQ-020, REQ-026).
//!
//! The tick hands each event of a pull request to the run that holds it. A merge goes to the close
//! (`merge.rs`). A CI failure or a review that asks for changes starts a feedback round:
//! `PROpen`, `ChangesRequested`, `Working`, in the same run folder. The failed checks (names, URLs,
//! log tails) and the open threads go to the builder steps as notes. The review and the pull
//! request step run again, and the push goes to the same pull request. Each round counts against
//! `feedback_rounds` and `fix_rounds` of the whole run, and against the budget and the max turns:
//! a spent cap escalates, and the feedback of the round stays for the unblock or the resume
//! (`delivery` REQ-020). A merge applies in any state that is not final. A pull request that
//! closes without a merge cancels the run with one stop report, and leaves the worktree and the
//! ticket as they are (`delivery` REQ-026).

use serde_json::json;
use shipyard_core::pickup::PrEventKind;
use shipyard_core::run::{BudgetLevel, Cause, RunEvent, RunState};
use shipyard_core::workflow::{Action, Step, Workflow};
use shipyard_store::run_log::kind;

use crate::fence::fence;
use crate::ports::{FailedCheck, Thread};
use crate::run_engine::{Inner, Kind, cap_of, kind_of, reset};

fn check_text(c: &FailedCheck) -> String {
    let mut t = format!("- check `{}` failed: {}", c.name, c.url);
    if let Some(tail) = c.tail.as_deref().filter(|t| !t.trim().is_empty()) {
        t.push_str(&format!("\n  Log tail:\n{}", fence("ci log", tail)));
    }
    t
}

fn thread_text(t: &Thread) -> String {
    let at = match (&t.path, t.line) {
        (Some(p), Some(l)) => format!("{p}:{l}"),
        (Some(p), None) => p.clone(),
        _ => "the pull request".into(),
    };
    format!(
        "- thread `{}` on {at}:\n{}",
        t.id,
        fence("review thread", &t.text)
    )
}

/// The pull request step, the review that it needs, and the builders behind the review: the
/// steps that run again before the next push. `true`: a builder.
pub(crate) fn pr_chain(wf: &Workflow, action: &Step) -> Vec<(String, bool)> {
    let mut again = vec![(action.id.clone(), false)];
    for n in &action.needs {
        let Some(step) = wf.step(n) else { continue };
        let review = kind_of(step) == Kind::Review;
        again.push((n.clone(), !review));
        if review {
            again.extend(step.needs.iter().map(|b| (b.clone(), true)));
        }
    }
    again
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
                    // A merge in any state: the agents stop and the questions go (REQ-002).
                    if self.transition(&id, RunEvent::PrMerged) {
                        self.withdraw_ticket_questions(&id);
                        self.close_merged(&id);
                    }
                }
                PrEventKind::ChangesRequested | PrEventKind::CiFailed => {
                    self.feedback(&id, number, event);
                }
                PrEventKind::Closed => self.pr_closed(&id, number),
                PrEventKind::Opened | PrEventKind::CiPassed => {}
            }
        }
    }

    /// A pull request that closed with no merge, in any state that is not final: a person's
    /// decision. The run is cancelled and posts one stop report (REQ-026).
    fn pr_closed(&mut self, run_id: &str, number: u64) {
        let state = self.runs[run_id].run.state;
        if state == RunState::Merged || state.is_final() {
            return;
        }
        if self.cancel_run(run_id, "pull request closed").is_ok() {
            let line = format!("The pull request #{number} closed without a merge.");
            let record = self.record(run_id, Cause::PullRequestClosed, &[line]);
            self.stop_report(run_id, &record);
        }
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
        self.feedback_note(run_id, note, threads);
    }

    /// A person sends the pull request back with a text, when the forge refuses a review that asks
    /// for changes (the author reviews their own pull request): the same round starts, with the text.
    pub(crate) fn send_back(&mut self, number: u64, text: &str) {
        let ids: Vec<String> = self
            .runs
            .values()
            .filter(|r| r.pr == Some(number) && !r.run.state.is_final())
            .map(|r| r.id.clone())
            .collect();
        for id in ids {
            let event = json!({"number": number, "event": "ChangesRequested"});
            self.log(&id, None, kind::PR, event);
            let note = format!("A reviewer asks for changes:\n{}", fence("review", text));
            self.feedback_note(&id, note, Vec::new());
        }
    }

    fn feedback_note(&mut self, run_id: &str, note: String, threads: Vec<String>) {
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
        // The feedback stays in the record: the unblock or the resume takes it.
        let lines = rec.d.feedback.clone();
        if rec
            .wf
            .limits
            .max_turns
            .is_some_and(|m| rec.turns >= m + rec.extra_turns)
        {
            let why = format!("max turns ({}): no room for a feedback round", rec.turns);
            self.escalate(run_id, Cause::MaxTurns, &[why]);
            return;
        }
        if self.budget_level(run_id) == BudgetLevel::Spent {
            self.check_budget(run_id);
            return;
        }
        let (count, cap) = cap_of(&self.runs[run_id], "feedback_rounds");
        if count >= cap {
            self.escalate(run_id, Cause::FeedbackRounds, &lines);
            return;
        }
        if !self.take_fix_round(run_id, &lines) {
            return;
        }
        self.rec(run_id).c.feedback_rounds += 1;
        let notes = std::mem::take(&mut self.rec(run_id).d.feedback).join("\n");
        if !self.transition(run_id, RunEvent::ChangesRequested) {
            return;
        }
        let rec = self.rec(run_id);
        rec.d.fixing = true;
        rec.d.pushed = false;
        rec.d.sha = None;
        rec.d.findings.clear();
        let wf = rec.wf.clone();
        let Some(action) = wf.steps.iter().find(|s| s.action == Some(Action::OpenPr)) else {
            return;
        };
        for (sid, builder) in pr_chain(&wf, action) {
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
