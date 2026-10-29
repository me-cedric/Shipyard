//! The review step and the finding check (spec `delivery`, REQ-001 to REQ-006).
//!
//! The `reviewer` role starts in a fresh context: it gets the base, the head, the diff, the
//! criteria (the ticket and the specs at the base commit) and the compass `review` checklist. It
//! never gets the output of a builder. It ends with `report`; `output.findings` holds one
//! `{severity, path, line, text}` for each defect, and `output.criteria` one `{id, verdict,
//! reason}` for each criterion. The engine opens each cited line and drops a finding with a bad
//! citation. A P0 or P1 finding, or a red gate (a P1 finding), sends the run to a fix round; a P2
//! finding stays in the run log. `SelfReview` posts nothing outside the run log.
//!
//! A report with no `findings` list keeps the earlier rule: an outcome that is not `done` blocks,
//! and the summary is the finding.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_core::run::{self, MAX_ROUNDS, RunEvent};
use shipyard_core::workflow::{Action, Step, StepState};
use shipyard_store::run_log::kind;

use crate::run_engine::{Inner, reset};

/// Run log kind of a review round: the kept findings, the dropped ones, the criteria, the gate.
pub const REVIEW: &str = "review";

/// The checks of the compass `review` skill (`.claude/skills/review/SKILL.md`, "What to check").
const CHECKLIST: &str = "\
Checklist (compass `review`). Report correctness defects and requirement gaps only. Skip style.
- Spec axis: mark each criterion OK, KO or not verified. Look both ways: a criterion that the code does not meet, and code that no criterion asks for.
- Standards axis: module boundaries, logger, input validation, error handling, repository conventions. A test for each new branch, guard and error path. Docs that follow the behavior.
- Scope: the diff matches the ticket title. Call out a change that weakens a lint or CI gate.
- A renamed route, selector or label that breaks an existing test. A passing test that asserts a removed behavior.
- `verified` only for what you ran. Say `not verified`, with the reason, for what you did not run.
- Do not edit files. Do not post anywhere.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    P0,
    P1,
    P2,
}

/// One defect. A finding of the reviewer cites `path` and `line`; the red gate has none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Finding {
    pub severity: Severity,
    pub path: Option<String>,
    pub line: Option<u32>,
    pub text: String,
}

impl Finding {
    /// P0 and P1 block the pull request (REQ-004).
    pub fn blocking(&self) -> bool {
        self.severity != Severity::P2
    }

    fn describe(&self) -> String {
        match (&self.path, self.line) {
            (Some(p), Some(l)) => format!("[{:?}] {p}:{l} {}", self.severity, self.text),
            _ => self.text.clone(),
        }
    }
}

#[derive(Deserialize)]
struct Raw {
    severity: String,
    path: Option<String>,
    line: Option<u32>,
    text: Option<String>,
}

fn severity(s: &str) -> Option<Severity> {
    match s.trim().to_ascii_uppercase().as_str() {
        "P0" => Some(Severity::P0),
        "P1" => Some(Severity::P1),
        "P2" => Some(Severity::P2),
        _ => None,
    }
}

/// A path inside the working copy: relative, no `..`.
fn inside(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path.split('/').any(|c| c == ".." || c.is_empty())
}

impl Inner {
    /// The text after the ticket in the brief of a reviewer (REQ-001, REQ-002): the base, the
    /// head, the criteria, the standards, the checklist and the diff. `Err` blocks the run.
    pub(crate) fn review_context(&mut self, run_id: &str) -> Result<String, String> {
        let base = self.base_of(run_id)?;
        let git = self
            .project_of(run_id)
            .map(|p| p.git.clone())
            .ok_or("the project is not open")?;
        let input = git
            .review_input(run_id, &base)
            .map_err(|e| format!("review input: {e}"))?;
        let rec = &self.runs[run_id];
        let mut t = format!("\nBase: {base}\nHead: {}\n", input.head);
        t.push_str(&format!(
            "\nCriteria. The ticket {} above, and the specs below at the base commit:\n",
            rec.key
        ));
        if input.specs.is_empty() {
            t.push_str("(no spec file)\n");
        }
        for (path, text) in &input.specs {
            t.push_str(&format!("\n--- {path}\n{text}\n"));
        }
        t.push_str(
            "\nStandards: the rules of the repository (`AGENTS.md`, module docs, lint config).\n",
        );
        t.push_str(&format!("\n{CHECKLIST}\n"));
        t.push_str(&format!("\nDiff:\n{}\n", input.diff));
        t.push_str(
            "\nEnd with `report`. Put in `output`: `findings`, a list of {severity: P0|P1|P2, \
             path, line, text} (a finding with no real path and line is dropped), and `criteria`, \
             a list of {id, verdict: OK|KO|not verified, reason}.\n",
        );
        Ok(t)
    }

    /// The findings of a report that cite a line that exists, and the ones that do not.
    fn check_findings(&self, run_id: &str, list: &[Value]) -> (Vec<Finding>, Vec<Value>) {
        let git = self.project_of(run_id).map(|p| p.git.clone());
        let (mut kept, mut dropped) = (Vec::new(), Vec::new());
        for v in list {
            let verdict = (|| {
                let raw: Raw = serde_json::from_value(v.clone()).map_err(|e| e.to_string())?;
                let severity = severity(&raw.severity).ok_or("unknown severity")?;
                let (Some(path), Some(line)) = (raw.path, raw.line) else {
                    return Err("no path and line".to_string());
                };
                if !inside(&path) || line == 0 {
                    return Err("the citation is not a path in the working copy".into());
                }
                match git.as_ref().map(|g| g.line(run_id, &path, line)) {
                    Some(Ok(Some(_))) => Ok(Finding {
                        severity,
                        path: Some(path),
                        line: Some(line),
                        text: raw.text.unwrap_or_default(),
                    }),
                    Some(Ok(None)) => Err("the cited line does not exist".to_string()),
                    Some(Err(e)) => Err(format!("the cited line cannot be read: {e}")),
                    None => Err("the project is not open".to_string()),
                }
            })();
            match verdict {
                Ok(f) => kept.push(f),
                Err(why) => dropped.push(json!({"finding": v, "reason": why})),
            }
        }
        (kept, dropped)
    }

    /// The gate commands of the project, in the run folder (REQ-006). A red command is a P1
    /// finding. Only a workflow with a pull request has a gate.
    fn gate_findings(&mut self, run_id: &str) -> Vec<Finding> {
        self.rec(run_id).d.gate.clear();
        let rec = &self.runs[run_id];
        let opens_pr = rec
            .wf
            .steps
            .iter()
            .any(|s| s.action == Some(Action::OpenPr));
        let Some(p) = self.project_of(run_id) else {
            return Vec::new();
        };
        if !opens_pr || p.gates.is_empty() {
            return Vec::new();
        }
        let (git, gates) = (p.git.clone(), p.gates.clone());
        let p1 = |text: String| Finding {
            severity: Severity::P1,
            path: None,
            line: None,
            text,
        };
        match git.gate(run_id, &gates) {
            Ok(checks) => {
                let red = checks
                    .iter()
                    .filter(|c| !c.passed)
                    .map(|c| p1(format!("the gate `{}` failed: {}", c.command, c.counts)))
                    .collect();
                self.rec(run_id).d.gate = checks;
                red
            }
            Err(e) => vec![p1(format!("the gate did not run: {e}"))],
        }
    }

    /// The review step ended (REQ-004, REQ-006). `blocking` is the outcome of the report, used
    /// when the report has no `findings` list.
    pub(crate) fn review_done(&mut self, run_id: &str, step: &Step, blocking: bool) {
        let out = self.runs[run_id].steps[&step.id].output.clone();
        let (mut findings, mut dropped) = (Vec::new(), Vec::new());
        let blocking = match out["findings"].as_array() {
            Some(list) => {
                (findings, dropped) = self.check_findings(run_id, list);
                findings.iter().any(Finding::blocking)
            }
            None => blocking,
        };
        let mut blocking = blocking;
        if out["findings"].is_null() && blocking {
            // The earlier rule: the summary is the finding.
            let text = out["summary"].as_str().unwrap_or("").to_string();
            findings.push(Finding {
                severity: Severity::P1,
                path: None,
                line: None,
                text,
            });
        }
        if !blocking {
            let red = self.gate_findings(run_id);
            blocking = !red.is_empty();
            findings.extend(red);
        }
        let notes = findings
            .iter()
            .map(Finding::describe)
            .collect::<Vec<_>>()
            .join("\n");
        let rounds = self.runs[run_id].rounds;
        let payload = json!({
            "round": rounds + 1, "blocking": blocking, "findings": findings,
            "dropped": dropped, "criteria": out["criteria"], "gate": self.runs[run_id].d.gate,
        });
        self.log(run_id, Some(&step.id), REVIEW, payload);
        self.rec(run_id).d.findings = findings.into_iter().filter(Finding::blocking).collect();
        let max = step.max_rounds.unwrap_or(MAX_ROUNDS);
        let s = self.rec(run_id).steps.get_mut(&step.id).expect("step");
        match run::after_review(blocking, rounds, max) {
            None => {
                s.state = StepState::Done;
                self.rec(run_id).d.findings.clear();
            }
            Some(RunEvent::FixRound) => {
                reset(s, "");
                let rec = self.rec(run_id);
                rec.rounds += 1;
                let note = format!("Fix round {}: {notes}", rec.rounds);
                for n in &step.needs {
                    if let Some(need) = rec.steps.get_mut(n) {
                        reset(need, &note);
                    }
                }
                self.transition(run_id, RunEvent::FixRound);
            }
            Some(event) => {
                reset(s, "");
                let why = format!("review: {max} fix rounds spent, a P0 or P1 finding is left");
                self.log(run_id, Some(&step.id), kind::NOTE, json!({"blocked": why}));
                self.transition(run_id, event);
            }
        }
    }
}
