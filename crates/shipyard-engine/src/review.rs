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

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_core::delivery::GateCheck;
use shipyard_core::run::{self, MAX_ROUNDS, RunEvent};
use shipyard_core::workflow::{Action, Step, StepState};
use shipyard_store::run_log::kind;

use crate::jobs::Work;
use crate::ports::{Git, PortResult};
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
                // A finding that cannot be read, or that has an unknown severity, fails closed.
                let raw: Raw = match serde_json::from_value(v.clone()) {
                    Ok(raw) => raw,
                    Err(_) => {
                        return Ok(Finding {
                            severity: Severity::P1,
                            path: None,
                            line: None,
                            text: v.to_string(),
                        });
                    }
                };
                let severity = severity(&raw.severity).unwrap_or(Severity::P1);
                let text = raw.text.unwrap_or_default();
                let (Some(path), Some(line)) = (raw.path, raw.line) else {
                    // An uncited P0 or P1 finding blocks. Only a bad citation is dropped.
                    return if severity == Severity::P2 {
                        Err("no path and line".to_string())
                    } else {
                        Ok(Finding {
                            severity,
                            path: None,
                            line: None,
                            text,
                        })
                    };
                };
                if !inside(&path) || line == 0 {
                    return Err("the citation is not a path in the working copy".into());
                }
                match git.as_ref().map(|g| g.line(run_id, &path, line)) {
                    Some(Ok(Some(_))) => Ok(Finding {
                        severity,
                        path: Some(path),
                        line: Some(line),
                        text,
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

    /// The gate commands of the project and the git port that runs them (REQ-006). Only a
    /// workflow with a pull request has a gate.
    fn gate_plan(&mut self, run_id: &str) -> Option<(Arc<dyn Git>, Vec<String>)> {
        self.rec(run_id).d.gate.clear();
        let rec = &self.runs[run_id];
        let opens_pr = rec
            .wf
            .steps
            .iter()
            .any(|s| s.action == Some(Action::OpenPr));
        let p = self.project_of(run_id)?;
        (opens_pr && !p.gates.is_empty()).then(|| (p.git.clone(), p.gates.clone()))
    }

    /// A red gate command is a P1 finding.
    fn gate_findings(&mut self, run_id: &str, result: PortResult<Vec<GateCheck>>) -> Vec<Finding> {
        let p1 = |text: String| Finding {
            severity: Severity::P1,
            path: None,
            line: None,
            text,
        };
        match result {
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

    /// The gate ran with no lock and the run did not change: its verdict joins the review.
    pub(crate) fn gate_done(
        &mut self,
        run_id: &str,
        step: &Step,
        mut findings: Vec<Finding>,
        dropped: Vec<Value>,
        criteria: Value,
        result: PortResult<Vec<GateCheck>>,
    ) {
        if let Some(s) = self.rec(run_id).steps.get_mut(&step.id) {
            s.gating = false;
        }
        let red = self.gate_findings(run_id, result);
        let blocking = !red.is_empty();
        findings.extend(red);
        self.review_finish(run_id, step, findings, dropped, criteria, blocking);
    }

    /// A review whose gate verdict was lost (a restart, a change of the run): run the gate again.
    pub(crate) fn regate(&mut self, run_id: &str) {
        if !self.runs[run_id].run.state.clocks_run() {
            return;
        }
        let steps: Vec<Step> = self.runs[run_id]
            .wf
            .steps
            .iter()
            .filter(|s| self.runs[run_id].steps[&s.id].gating)
            .cloned()
            .collect();
        for step in steps {
            self.review_done(run_id, &step, false);
        }
    }

    /// The review step ended (REQ-004, REQ-006). `blocking` is the outcome of the report, used
    /// when the report has no `findings` list.
    pub(crate) fn review_done(&mut self, run_id: &str, step: &Step, outcome_blocks: bool) {
        let out = self.runs[run_id].steps[&step.id].output.clone();
        let (mut findings, mut dropped) = (Vec::new(), Vec::new());
        if let Some(list) = out["findings"].as_array() {
            (findings, dropped) = self.check_findings(run_id, list);
        }
        // The findings decide. With no finding at all, the outcome decides: a reviewer that did
        // not end with `done` and left no usable finding does not pass the run.
        let blocking =
            findings.iter().any(Finding::blocking) || (findings.is_empty() && outcome_blocks);
        if blocking && !findings.iter().any(Finding::blocking) {
            // The summary is the finding.
            let text = out["summary"]
                .as_str()
                .filter(|t| !t.is_empty())
                .unwrap_or(
                    "the review ended with no usable finding and an outcome that is not done",
                )
                .to_string();
            findings.push(Finding {
                severity: Severity::P1,
                path: None,
                line: None,
                text,
            });
        }
        let criteria = out["criteria"].clone();
        if !blocking && let Some((git, gates)) = self.gate_plan(run_id) {
            // The commands run with no lock (`jobs`): the review goes on from `gate_done`.
            self.rec(run_id)
                .steps
                .get_mut(&step.id)
                .expect("step")
                .gating = true;
            let work = Work::Gate {
                git,
                gates,
                step: step.clone(),
                findings,
                dropped,
                criteria,
            };
            self.queue(run_id, work);
            return;
        }
        self.review_finish(run_id, step, findings, dropped, criteria, blocking);
    }

    /// The end of a review: the log, the verdict, the fix round or the next step.
    fn review_finish(
        &mut self,
        run_id: &str,
        step: &Step,
        findings: Vec<Finding>,
        dropped: Vec<Value>,
        criteria: Value,
        blocking: bool,
    ) {
        let notes = findings
            .iter()
            .map(Finding::describe)
            .collect::<Vec<_>>()
            .join("\n");
        let rounds = self.runs[run_id].rounds;
        let payload = json!({
            "round": rounds + 1, "blocking": blocking, "findings": findings,
            "dropped": dropped, "criteria": criteria, "gate": self.runs[run_id].d.gate,
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

// ---- the agent review of a pull request (spec `agent-pr`, REQ-002 to REQ-004)

/// What the agent reviewer is told about a pull request.
pub struct PullBrief<'a> {
    pub number: u32,
    pub title: &'a str,
    pub description: &'a str,
    pub source: &'a str,
    pub target: &'a str,
    pub head: &'a str,
    /// Each changed file with its patch, when the code host gave one.
    pub files: &'a [(String, Option<String>)],
    /// The project has the compass `review` skill.
    pub skill: bool,
    /// The project has the `reviewer` role.
    pub role: bool,
}

/// The longest diff that goes in a prompt.
const MAX_DIFF: usize = 120_000;

/// The prompt of an agent review. A project with the compass `review` skill or the `reviewer` role
/// gets them named; any other project gets the built-in checklist only (REQ-003).
pub fn pull_prompt(b: &PullBrief) -> String {
    let mut t = format!(
        "Review pull request #{} \"{}\" ({} into {}) at the head commit {}. You work in a fresh \
         context, in a read-only copy of the head commit.\n",
        b.number, b.title, b.source, b.target, b.head
    );
    match (b.skill, b.role) {
        (true, true) => t.push_str("Follow the project `review` skill, as the `reviewer` role.\n"),
        (true, false) => t.push_str("Follow the project `review` skill.\n"),
        (false, true) => t.push_str("Act as the project `reviewer` role.\n"),
        (false, false) => {}
    }
    if !b.description.trim().is_empty() {
        t.push_str(&format!("\nDescription:\n{}\n", b.description.trim()));
    }
    t.push_str(&format!("\n{CHECKLIST}\n\nChanged files and patches:\n"));
    let mut left = MAX_DIFF;
    for (path, patch) in b.files {
        let patch = patch.as_deref().unwrap_or("(no patch)");
        let cut = patch.len().min(left);
        let cut = (0..=cut)
            .rev()
            .find(|i| patch.is_char_boundary(*i))
            .unwrap_or(0);
        t.push_str(&format!("\n--- {path}\n{}\n", &patch[..cut]));
        left -= cut;
        if cut < patch.len() {
            t.push_str("(patch cut)\n");
        }
        if left == 0 {
            t.push_str("\n(more files were cut)\n");
            break;
        }
    }
    t.push_str(
        "\nAnswer with one JSON object and nothing else: {\"summary\": a short text, \"verdict\": \
         \"approve\" | \"comment\" | \"request_changes\", \"findings\": a list of {\"severity\": \
         \"P0\"|\"P1\"|\"P2\", \"path\", \"line\" (a line of the new file), \"text\"}}. A finding \
         with a path that the pull request does not change, or with no line, is dropped.\n",
    );
    t
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DraftVerdict {
    Approve,
    Comment,
    RequestChanges,
}

/// The draft of a review: what the agent said, with the findings that cite a changed file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Draft {
    pub summary: String,
    pub verdict: DraftVerdict,
    pub findings: Vec<Finding>,
    /// The findings that cited no changed file or no line.
    pub dropped: usize,
}

/// Reads the answer of the agent reviewer. `changed` lists the paths that the pull request
/// changes: a finding on any other path is dropped. An approval with a P0 or P1 finding becomes a
/// comment: the agent does not approve what it found a defect in.
pub fn parse_draft(text: &str, changed: &[String]) -> Result<Draft, String> {
    let (start, end) = (text.find('{'), text.rfind('}'));
    let (Some(start), Some(end)) = (start, end.filter(|e| Some(*e) > start)) else {
        return Err("the review has no result".into());
    };
    let v: Value = serde_json::from_str(&text[start..=end])
        .map_err(|_| "the review has no result".to_string())?;
    let mut findings = Vec::new();
    let mut dropped = 0;
    for f in v["findings"].as_array().into_iter().flatten() {
        let raw: Result<Raw, _> = serde_json::from_value(f.clone());
        let kept = raw.ok().and_then(|r| {
            let (path, line) = (r.path?, r.line?);
            (inside(&path) && line > 0 && changed.contains(&path)).then(|| Finding {
                severity: severity(&r.severity).unwrap_or(Severity::P1),
                path: Some(path),
                line: Some(line),
                text: r.text.unwrap_or_default(),
            })
        });
        match kept {
            Some(f) => findings.push(f),
            None => dropped += 1,
        }
    }
    let verdict = match v["verdict"]
        .as_str()
        .unwrap_or("comment")
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '-'], "_")
        .as_str()
    {
        "approve" if findings.iter().any(Finding::blocking) => DraftVerdict::Comment,
        "approve" => DraftVerdict::Approve,
        "request_changes" => DraftVerdict::RequestChanges,
        _ => DraftVerdict::Comment,
    };
    Ok(Draft {
        summary: v["summary"].as_str().unwrap_or_default().trim().to_string(),
        verdict,
        findings,
        dropped,
    })
}

// ---- the agent-written text of a new pull request (spec `agent-pr`, REQ-005)

/// What the agent writer is told about the branch.
pub struct TextBrief<'a> {
    pub branch: &'a str,
    pub base: &'a str,
    /// The work items and spec changes that the branch links to, as refs (`wi:KEY`, `change:id`).
    pub refs: &'a [String],
    /// The changed files with their patches.
    pub files: &'a [(String, String)],
    /// The project has the `pr-flow` skill.
    pub flow: bool,
}

/// The prompt that asks for a title and a body. With the `pr-flow` skill the body lists the
/// impacts and the refs. The agent never opens the pull request: the person does.
pub fn text_prompt(b: &TextBrief) -> String {
    let mut t = format!(
        "Write the title and the body of a pull request for the branch {} into {}. Do not open it \
         and do not edit files.\n",
        b.branch, b.base
    );
    if b.flow {
        t.push_str(
            "Follow the project `pr-flow` skill: the body lists the impacts and the refs.\n",
        );
    }
    if !b.refs.is_empty() {
        t.push_str(&format!("Linked refs: {}.\n", b.refs.join(", ")));
    }
    t.push_str("\nChanged files and patches:\n");
    let mut left = MAX_DIFF;
    for (path, patch) in b.files {
        let cut = patch.len().min(left);
        let cut = (0..=cut)
            .rev()
            .find(|i| patch.is_char_boundary(*i))
            .unwrap_or(0);
        t.push_str(&format!("\n--- {path}\n{}\n", &patch[..cut]));
        left -= cut;
        if left == 0 {
            t.push_str("\n(more files were cut)\n");
            break;
        }
    }
    t.push_str(
        "\nAnswer with one JSON object and nothing else: {\"title\": one line of 72 characters or \
         fewer, \"body\": Markdown}.\n",
    );
    t
}

/// The title and the body of the answer. An empty title is an error.
pub fn parse_text(text: &str) -> Result<(String, String), String> {
    let (start, end) = (text.find('{'), text.rfind('}'));
    let (Some(start), Some(end)) = (start, end.filter(|e| Some(*e) > start)) else {
        return Err("the agent wrote no text".into());
    };
    let v: Value = serde_json::from_str(&text[start..=end])
        .map_err(|_| "the agent wrote no text".to_string())?;
    let title = v["title"].as_str().unwrap_or_default().trim().to_string();
    if title.is_empty() {
        return Err("the agent wrote no title".into());
    }
    let body = v["body"].as_str().unwrap_or_default().trim().to_string();
    Ok((title, body))
}
