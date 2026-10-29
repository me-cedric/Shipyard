//! The agent tools that act on the run (spec `factory` REQ-019, REQ-020): `handoff`, `message`,
//! `spawn_subtask` and `read_ref`. The server checks the shape (`shipyard_mcp::tools::agent`);
//! the factory decides what the run allows. A refusal is an `Err` that the agent reads.
//!
//! - `message` to a step adds a note to the step. A running target stops after its turn and starts
//!   again on its CLI session with the note: the CLI has no way to take a line in the middle of a
//!   turn. A target that has not started gets the note in its brief. `message` to `person` is an
//!   Inbox item ([`Factory::messages`]).
//! - `handoff` ends the calling child, with the summary as its output, and gives the summary to
//!   the step of the role as a note. The step runs when its `needs` are done, as it always does.
//! - `spawn_subtask` adds a child to the calling `for_each` step. The child has its own worktree
//!   and joins like the others. Limits: the step needs `for_each` and a worktree workspace; the
//!   children that run now stay under `max_parallel`; the run budget is under 80 %. The turn
//!   limit of the workflow bounds the rest.
//! - `read_ref` reads the ref index. A ref that is not resolved is an error, never a guess.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_core::run::{BUDGET_ALERT, BudgetLevel};
use shipyard_core::workflow::{StepState, Workspace};
use shipyard_mcp::tools::agent::{Handoff, Message as ToolMessage, SpawnSubtask};
use shipyard_mcp::tools::read_ref;
use shipyard_store::ref_query::State;
use shipyard_store::run_log::kind;

use crate::run_engine::{Factory, Inner, Unit};

/// Run log kind of a message to the person and of its read mark.
pub const MESSAGE: &str = "message";

/// What an agent told the person (`message` to `person`). It shows in Home / Inbox.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Message {
    /// The step or child that wrote it.
    pub from: String,
    pub text: String,
    /// Seconds.
    pub at: u64,
    pub read: bool,
}

impl Factory {
    /// Every message to the person, with its run id, oldest first in each run.
    pub fn messages(&self) -> Vec<(String, Message)> {
        let inner = self.lock();
        inner
            .runs
            .values()
            .flat_map(|r| r.messages.iter().map(|m| (r.id.clone(), m.clone())))
            .collect()
    }

    /// The person read message number `n` (from 0) of a run.
    pub fn read_message(&self, run_id: &str, n: usize) -> Result<(), String> {
        let mut inner = self.lock();
        inner.run(run_id)?;
        let m = inner
            .rec(run_id)
            .messages
            .get_mut(n)
            .ok_or_else(|| format!("run {run_id} has no message {n}"))?;
        m.read = true;
        inner.log(run_id, None, MESSAGE, json!({"read": n}));
        Ok(())
    }
}

impl Inner {
    /// The step and the position of a running child by its id.
    pub(crate) fn locate(&self, run_id: &str, child: &str) -> Result<(String, usize), String> {
        self.run(run_id)?
            .steps
            .iter()
            .find_map(|(sid, s)| {
                let i = s
                    .units
                    .iter()
                    .position(|u| u.id == child && u.state == StepState::Running)?;
                Some((sid.clone(), i))
            })
            .ok_or_else(|| format!("step {child} is not running"))
    }

    /// One `tool` event: the call is in the log and the stall timer of the step starts again.
    pub(crate) fn tool_event(&mut self, run_id: &str, step: &str, payload: Value) {
        let now = self.now_s();
        for u in self
            .rec(run_id)
            .steps
            .values_mut()
            .flat_map(|s| &mut s.units)
        {
            if u.id == step {
                u.last = now;
            }
        }
        self.log(run_id, Some(step), kind::TOOL, payload);
    }

    /// `message` (REQ-019).
    pub(crate) fn message(
        &mut self,
        run_id: &str,
        from: &str,
        m: ToolMessage,
    ) -> Result<Value, String> {
        let (own, _) = self.locate(run_id, from)?;
        if m.to == "person" {
            let now = self.now_s();
            let rec = self.rec(run_id);
            let n = rec.messages.len();
            rec.messages.push(Message {
                from: from.into(),
                text: m.text.clone(),
                at: now,
                read: false,
            });
            self.tool_event(run_id, from, json!({"tool": "message", "to": "person"}));
            let payload = json!({"n": n, "from": from, "to": "person", "text": m.text});
            self.log(run_id, Some(from), MESSAGE, payload);
            return Ok(json!({"ok": true}));
        }
        let (sid, unit) = self.target(run_id, &m.to)?;
        // A sibling child of the same step is a fair target. The caller and its own step are not.
        if m.to == from || (unit.is_none() && sid == own) {
            return Err("a step cannot message itself".into());
        }
        let note = format!("Message from `{from}`: {}", m.text);
        self.deliver(run_id, &sid, unit.as_deref(), note);
        self.tool_event(
            run_id,
            from,
            json!({"tool": "message", "to": m.to, "text": m.text}),
        );
        self.log(
            run_id,
            Some(from),
            MESSAGE,
            json!({"from": from, "to": m.to, "text": m.text}),
        );
        self.pump_run(run_id);
        Ok(json!({"ok": true}))
    }

    /// A step by its id, or a child by its id: `(step, child)`. It must not have ended.
    fn target(&self, run_id: &str, to: &str) -> Result<(String, Option<String>), String> {
        let rec = self.run(run_id)?;
        let (sid, unit) = match rec.wf.step(to) {
            Some(s) => (s.id.clone(), None),
            None => rec
                .steps
                .iter()
                .find_map(|(sid, s)| {
                    s.units
                        .iter()
                        .any(|u| u.id == to)
                        .then(|| (sid.clone(), Some(to.to_string())))
                })
                .ok_or_else(|| format!("no step `{to}` in this run"))?,
        };
        let step = &rec.steps[&sid];
        let state = match &unit {
            Some(id) => step.units.iter().find(|u| u.id == *id).map(|u| u.state),
            None => Some(step.state),
        };
        match state {
            Some(StepState::Pending | StepState::Running) => Ok((sid, unit)),
            _ => Err(format!("step `{to}` has ended")),
        }
    }

    /// Add a note to a step. A child of it that runs stops now and starts again with the note, on
    /// its CLI session when it has one (`only`: this child alone).
    fn deliver(&mut self, run_id: &str, sid: &str, only: Option<&str>, note: String) {
        let s = self.rec(run_id).steps.get_mut(sid).expect("step");
        s.notes.push(note);
        for u in s
            .units
            .iter_mut()
            .filter(|u| only.is_none_or(|o| o == u.id))
        {
            if let Some(mut agent) = u.agent.take() {
                agent.cancel();
                u.state = StepState::Pending;
                u.parked = true;
            }
        }
    }

    /// `handoff` (REQ-019).
    pub(crate) fn handoff(
        &mut self,
        run_id: &str,
        from: &str,
        h: Handoff,
    ) -> Result<Value, String> {
        let (own, i) = self.locate(run_id, from)?;
        let rec = self.run(run_id)?;
        let role_of =
            |s: &shipyard_core::workflow::Step| s.role.clone().unwrap_or_else(|| "none".into());
        let target = match &h.step {
            Some(t) => {
                let step = rec
                    .wf
                    .step(t)
                    .ok_or_else(|| format!("no step `{t}` in this run"))?;
                if step.role.as_deref() != Some(h.role.as_str()) {
                    return Err(format!(
                        "step `{t}` has the role `{}`, not `{}`",
                        role_of(step),
                        h.role
                    ));
                }
                t.clone()
            }
            None => rec
                .wf
                .steps
                .iter()
                .find(|s| {
                    s.id != own
                        && s.role.as_deref() == Some(h.role.as_str())
                        && matches!(
                            rec.steps[&s.id].state,
                            StepState::Pending | StepState::Running
                        )
                })
                .map(|s| s.id.clone())
                .ok_or_else(|| {
                    format!("no step with role `{}` is left in this workflow", h.role)
                })?,
        };
        if target == own {
            return Err("a step cannot hand off to itself".into());
        }
        if !matches!(
            rec.steps[&target].state,
            StepState::Pending | StepState::Running
        ) {
            return Err(format!("step `{target}` has ended"));
        }
        let note = format!("Handoff from `{from}` ({}): {}", h.role, h.summary);
        self.deliver(run_id, &target, None, note);
        let payload =
            json!({"tool": "handoff", "role": h.role, "step": target, "summary": h.summary});
        self.tool_event(run_id, from, payload);
        let out = json!({"summary": h.summary, "handoff": {"role": h.role, "step": target}});
        self.unit_done(run_id, &own, i, out, false);
        self.pump_run(run_id);
        Ok(json!({"ok": true, "step": target}))
    }

    /// `spawn_subtask` (REQ-019).
    pub(crate) fn spawn(
        &mut self,
        run_id: &str,
        from: &str,
        s: SpawnSubtask,
    ) -> Result<Value, String> {
        let (sid, _) = self.locate(run_id, from)?;
        let rec = self.run(run_id)?;
        let step = rec.wf.step(&sid).expect("step");
        if step.for_each.is_none() {
            return Err(format!(
                "step `{sid}` has no `for_each`: only a fan-out step can spawn a subtask"
            ));
        }
        if step.workspace != Workspace::Worktree {
            return Err(format!(
                "step `{sid}` has no worktree workspace: a subtask needs its own worktree"
            ));
        }
        let p = self.project_of(run_id).ok_or("the project is not open")?;
        if p.files.role(&s.role).is_none() {
            return Err(format!("unknown role `{}`", s.role));
        }
        if self.budget_level(run_id) != BudgetLevel::Under {
            return Err(format!(
                "the run budget is at {} % or more: no new subtask",
                (BUDGET_ALERT * 100.0) as u32
            ));
        }
        let max = step.max_parallel() as usize;
        let units = &rec.steps[&sid].units;
        let running = units
            .iter()
            .filter(|u| u.state == StepState::Running)
            .count();
        if running >= max {
            return Err(format!(
                "step `{sid}` runs {running} of {max} children: wait for one to end, then spawn"
            ));
        }
        let child = format!("{sid}-{}", units.len() + 1);
        let item = json!({"title": s.title, "brief": s.brief});
        let mut unit = Unit::new(child.clone(), Some(item));
        unit.role = Some(s.role.clone());
        self.rec(run_id)
            .steps
            .get_mut(&sid)
            .expect("step")
            .units
            .push(unit);
        let payload =
            json!({"tool": "spawn_subtask", "child": child, "title": s.title, "role": s.role});
        self.tool_event(run_id, from, payload);
        self.pump_run(run_id);
        Ok(json!({"child": child, "state": "queued"}))
    }

    /// `read_ref` (REQ-020): the resolved entity, or an error.
    pub(crate) fn read_ref(
        &mut self,
        run_id: &str,
        from: &str,
        reference: &str,
    ) -> Result<Value, String> {
        self.run(run_id)?;
        self.tool_event(run_id, from, json!({"tool": "read_ref", "ref": reference}));
        let index = self.refs.clone().ok_or("the ref index is not open")?;
        let found = {
            let index = index.lock().unwrap_or_else(|e| e.into_inner());
            read_ref::read_ref(&index, reference)?
        };
        match found.resolved.state {
            State::Resolved => serde_json::to_value(found).map_err(|e| e.to_string()),
            State::Unresolved => Err(format!(
                "{reference} is unresolved: its source is not indexed"
            )),
            State::Broken => Err(format!("{reference} is broken: no such entity")),
        }
    }
}
