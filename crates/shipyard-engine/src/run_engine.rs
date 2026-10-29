//! The factory (spec `factory`, REQ-006, REQ-007, REQ-009, REQ-013, REQ-022 to REQ-024, REQ-035,
//! REQ-036). It implements [`Dispatch`]: the tick hands it claimed tickets, stops and events.
//!
//! It is synchronous and driven from outside. [`Factory::pump`] reads the agent events with no
//! wait, checks the clocks against the [`Clock`], and starts the next steps. The app calls it in a
//! loop; each `SyncEvent::Tick` calls it too. A test calls it with fakes and a fake clock.
//!
//! Rules that the engine decides (core has no step to state mapping):
//! - A step with `action` is an action. A step with `max_rounds` is a review. A step with
//!   `mode: plan` or `gate: human` is a plan step. Every other step is a build step.
//! - A build or review step that starts in `Planning` sends `PlanReady { gate: false }`. A review
//!   or an action that starts in `Working` sends `BuildDone`. A plan step with `gate: human` that
//!   ends sends `PlanReady { gate: true }`.
//! - Agents run only while the run clocks run (`RunState::clocks_run`). Any other state stops
//!   them; each one keeps its CLI session and starts again, resumed, when the run comes back.
//! - Every run change goes through `Run::apply`. A refusal is a `note` event in the run log.

use std::collections::{BTreeMap, BTreeSet};
use std::ops::{Deref, DerefMut};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_core::pickup::{ActiveRun, Automation, SyncEvent};
use shipyard_core::run::{self, BudgetLevel, Run, RunEvent, RunState};
use shipyard_core::work_item::WorkKind;
use shipyard_core::workflow::{self, Gate, Mode, Step, StepState, Workflow, Workspace};
use shipyard_store::automation_file::status_map;
use shipyard_store::factory_files::Loaded;
use shipyard_store::mirror::Mirror;
use shipyard_store::ref_index::RefIndex;
use shipyard_store::run_log::{RunLog, kind};

use crate::Clock;
use crate::approvals::{Approval, Write};
use crate::persist::Replay;
use crate::ports::{
    AgentEvent, AgentRun, Agents, Brief, Dispatch, Git, Pulls, StartRequest, Workspaces, Writer,
};
use crate::pull_request::Delivered;
use crate::questions::Asked;
use crate::review::Finding;
use crate::tools::Message;

/// A ticket label `wf:<id>` picks the workflow (REQ-009).
pub const WORKFLOW_LABEL: &str = "wf:";
/// Run log kind of a budget alert and of a question reminder.
pub const ALERT: &str = "alert";

/// Model tiers (`top`, `mid`, `small`) to a model of each runner. A name that is not a tier of
/// the runner goes to the runner as it is. A runner with no row uses its own default model.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tiers(pub BTreeMap<String, BTreeMap<String, String>>);

impl Default for Tiers {
    fn default() -> Self {
        let claude = [("top", "opus"), ("mid", "sonnet"), ("small", "haiku")]
            .map(|(t, m)| (t.to_string(), m.to_string()));
        Self(BTreeMap::from([("claude".into(), claude.into())]))
    }
}

impl Tiers {
    pub fn model(&self, runner: &str, name: &str) -> Option<String> {
        const TIERS: [&str; 3] = ["top", "mid", "small"];
        match self.0.get(runner).and_then(|m| m.get(name)) {
            Some(m) => Some(m.clone()),
            None if TIERS.contains(&name) => None,
            None => Some(name.into()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    /// The runner of every step (`q:Q-024`: Claude Code first).
    pub runner: String,
    pub tiers: Tiers,
    /// A token budget of each run, next to the money budget of the workflow. `None`: no limit.
    pub max_tokens: Option<u64>,
    /// One reminder of an open question after this time (`q:Q-028`).
    pub remind_after: Duration,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            runner: "claude".into(),
            tiers: Tiers::default(),
            max_tokens: None,
            remind_after: Duration::from_secs(24 * 3600),
        }
    }
}

/// One project of this machine. `set_project` again after a reload: a run keeps the workflow
/// that it started with.
pub struct Project {
    pub automation: Automation,
    pub files: Loaded,
    /// The workflow of a ticket with no `wf:` label (`projects` REQ-007).
    pub default_workflow: String,
    /// The working copy: the RAID files of spec questions go there.
    pub root: PathBuf,
    /// The mirror source of the tracker (`tick::source_key`).
    pub source: String,
    /// The mirror file of the tick (`Mirror::open` on the same path).
    pub mirror: Arc<Mutex<Mirror>>,
    pub writer: Arc<dyn Writer>,
    pub workspaces: Arc<dyn Workspaces>,
    /// The local git work of delivery.
    pub git: Arc<dyn Git>,
    /// The forge reads of delivery.
    pub pulls: Arc<dyn Pulls>,
    /// The connection id of the forge: it makes `pr:<forge>:<number>`.
    pub forge: String,
    /// The gate commands (`gates` of `.shipyard/project.yaml`, `q:Q-030`).
    pub gates: Vec<String>,
    /// The base branch that the project declares. `None`: `develop`, else the default branch.
    pub base: Option<String>,
    /// The reviewers of a pull request (`q:Q-029`). Empty: the `reviewers` of `automation`. Both
    /// empty: a run blocks before it opens one.
    pub reviewers: Vec<String>,
}

/// A step as the views and `delivery` see it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StepInfo {
    pub id: String,
    pub state: StepState,
    /// `(child id, state)`. One child, with the step id, for a step with no `for_each`.
    pub units: Vec<(String, StepState)>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RunInfo {
    pub id: String,
    pub project: String,
    pub key: String,
    pub workflow: String,
    pub run: Run,
    pub pr: Option<u64>,
    pub cost_usd: f64,
    pub tokens: u64,
    pub turns: u32,
    pub budget_usd: f64,
    pub steps: Vec<StepInfo>,
    /// The P0 and P1 findings that are left when the review rounds are spent (the Inbox card).
    pub findings: Vec<Finding>,
    /// The worktrees that a merged run left behind, with their files (`delivery` REQ-025).
    pub worktree_kept: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct Unit {
    pub id: String,
    pub item: Option<Value>,
    /// The role of a subtask (`spawn_subtask`). `None`: the role of the step.
    #[serde(default)]
    pub role: Option<String>,
    pub state: StepState,
    pub failures: u32,
    /// Seconds. Not before this time after a failure.
    pub retry_at: Option<u64>,
    /// A process: it does not survive a restart. The unit starts again from `session`.
    #[serde(skip)]
    pub agent: Option<Box<dyn AgentRun>>,
    pub started: u64,
    /// The last event, in seconds: the stall timer.
    pub last: u64,
    pub session: Option<String>,
    /// Stopped by a side state: start again with the session.
    pub parked: bool,
    pub output: Value,
    pub text: String,
    pub cost: f64,
    /// The worktree of this child is joined into the run folder.
    pub merged: bool,
}

impl Unit {
    pub(crate) fn new(id: String, item: Option<Value>) -> Self {
        Self {
            id,
            item,
            role: None,
            state: StepState::Pending,
            failures: 0,
            retry_at: None,
            agent: None,
            started: 0,
            last: 0,
            session: None,
            parked: false,
            output: Value::Null,
            text: String::new(),
            cost: 0.0,
            merged: false,
        }
    }
}

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct StepRec {
    pub state: StepState,
    pub units: Vec<Unit>,
    pub output: Value,
    /// Review findings of a fix round, a plan rejection: they go in the next brief.
    pub notes: Vec<String>,
    /// A child conflict stopped the join of the worktrees: try again when the run comes back.
    pub merge_pending: bool,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct RunRec {
    pub id: String,
    pub project: String,
    pub key: String,
    pub title: String,
    pub description: String,
    pub url: String,
    pub kind: WorkKind,
    /// The ticket status at pickup.
    pub status: String,
    /// The ticket status and labels after the writes that went out.
    pub ticket_status: String,
    pub labels: Vec<String>,
    pub wf: Workflow,
    pub run: Run,
    pub pr: Option<u64>,
    pub steps: BTreeMap<String, StepRec>,
    pub turns: u32,
    pub cost: f64,
    pub tokens: u64,
    /// Budget that a person added at a resume (REQ-005).
    pub extra_usd: f64,
    pub alerted: bool,
    pub rounds: u32,
    pub questions: Vec<Asked>,
    pub d: Delivered,
    /// What agents told the person (`message` to `person`).
    #[serde(default)]
    pub messages: Vec<Message>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Kind {
    Plan,
    Build,
    Review,
    Action,
}

pub(crate) fn kind_of(s: &Step) -> Kind {
    if s.action.is_some() {
        Kind::Action
    } else if s.max_rounds.is_some() {
        Kind::Review
    } else if s.mode == Mode::Plan || s.gate == Gate::Human {
        Kind::Plan
    } else {
        Kind::Build
    }
}

fn rank(l: BudgetLevel) -> u8 {
    match l {
        BudgetLevel::Under => 0,
        BudgetLevel::Alert => 1,
        BudgetLevel::Spent => 2,
    }
}

pub(crate) struct Inner {
    pub cfg: Config,
    pub agents: Arc<dyn Agents>,
    pub clock: Arc<dyn Clock>,
    pub log: RunLog,
    pub kill: bool,
    pub projects: BTreeMap<String, Project>,
    pub runs: BTreeMap<String, RunRec>,
    pub approvals: Vec<Approval>,
    pub next_approval: u64,
    pub ended: Vec<(String, String)>,
    pub errors: Vec<String>,
    pub seq: u64,
    /// The ref index of the app (`read_ref`).
    pub refs: Option<Arc<Mutex<RefIndex>>>,
    /// Runs that changed since their last save (`persist`).
    pub dirty: BTreeSet<String>,
    /// Writes that the log shows after the last save of a run (`persist::recover`).
    pub replay: BTreeMap<String, Vec<Replay>>,
    /// The global state that the last save holds: `(seq, next_approval, kill)`.
    pub saved_meta: (u64, u64, bool),
}

pub struct Factory {
    inner: Mutex<Inner>,
}

/// The lock of the factory. A change is saved when the lock goes (`Inner::persist`): every public
/// call is one change, so the save holds a whole change or none.
pub(crate) struct Guard<'a>(MutexGuard<'a, Inner>);

impl Deref for Guard<'_> {
    type Target = Inner;

    fn deref(&self) -> &Inner {
        &self.0
    }
}

impl DerefMut for Guard<'_> {
    fn deref_mut(&mut self) -> &mut Inner {
        &mut self.0
    }
}

impl Drop for Guard<'_> {
    fn drop(&mut self) {
        self.0.persist();
    }
}

impl Factory {
    /// A factory over a run log file. It takes back what the file holds: the runs, the approval
    /// queue and the open questions come from the saves, and a running step starts again, on its
    /// CLI session when it has one, when its project is open (`set_project`) and the pump runs.
    /// A read that fails is in [`Factory::take_errors`].
    pub fn new(cfg: Config, agents: Arc<dyn Agents>, clock: Arc<dyn Clock>, log: RunLog) -> Self {
        let mut inner = Inner {
            cfg,
            agents,
            clock,
            log,
            kill: false,
            projects: BTreeMap::new(),
            runs: BTreeMap::new(),
            approvals: Vec::new(),
            next_approval: 0,
            ended: Vec::new(),
            errors: Vec::new(),
            seq: 0,
            refs: None,
            dirty: BTreeSet::new(),
            replay: BTreeMap::new(),
            saved_meta: (0, 0, false),
        };
        inner.recover();
        inner.persist();
        Self {
            inner: Mutex::new(inner),
        }
    }

    pub(crate) fn lock(&self) -> Guard<'_> {
        Guard(self.inner.lock().unwrap_or_else(|e| e.into_inner()))
    }

    /// The ref index that `read_ref` reads (`factory` REQ-020). Without it the tool is an error.
    pub fn set_refs(&self, index: Arc<Mutex<RefIndex>>) {
        self.lock().refs = Some(index);
    }

    /// Add a project, or replace it after a reload of its files.
    pub fn set_project(&self, id: &str, project: Project) {
        self.lock().projects.insert(id.into(), project);
    }

    /// Read the agents, check the clocks, start the next steps. Call it often.
    pub fn pump(&self) {
        self.lock().pump();
    }

    pub fn runs(&self) -> Vec<RunInfo> {
        let inner = self.lock();
        inner.runs.values().map(|r| inner.info(r)).collect()
    }

    pub fn run_info(&self, run_id: &str) -> Option<RunInfo> {
        let inner = self.lock();
        inner.runs.get(run_id).map(|r| inner.info(r))
    }

    /// `(project, ticket key)` of each run that ended since the last call. Call
    /// `tick::Engine::release(key)` for each one; the next tick releases them anyway.
    pub fn take_ended(&self) -> Vec<(String, String)> {
        std::mem::take(&mut self.lock().ended)
    }

    /// Run log appends and port calls that failed outside a run decision.
    pub fn take_errors(&self) -> Vec<String> {
        std::mem::take(&mut self.lock().errors)
    }

    /// The run kill switch (REQ-024).
    pub fn cancel(&self, run_id: &str) -> Result<(), String> {
        self.lock().cancel_run(run_id, "kill switch")
    }

    /// The global kill switch: on cancels every active run and stops pickup (REQ-024).
    pub fn set_kill_switch(&self, on: bool) {
        let mut inner = self.lock();
        inner.kill = on;
        if on {
            for id in inner.live_ids() {
                // A merged run is not cancelled: it goes to `Done` (the refusal is the answer).
                let _ = inner.cancel_run(&id, "global kill switch");
            }
        }
    }

    /// A person approves the plan at `PlanReview`.
    pub fn approve_plan(&self, run_id: &str) -> Result<(), String> {
        let mut inner = self.lock();
        inner.checked(run_id, RunEvent::PlanApproved)?;
        for s in inner.rec(run_id).steps.values_mut() {
            if s.state == StepState::Gate {
                s.state = StepState::Done;
            }
        }
        inner.pump_run(run_id);
        Ok(())
    }

    /// A person rejects the plan: the gate step runs again with the note (REQ-002).
    pub fn reject_plan(&self, run_id: &str, note: &str) -> Result<(), String> {
        let mut inner = self.lock();
        inner.checked(run_id, RunEvent::PlanRejected)?;
        for s in inner.rec(run_id).steps.values_mut() {
            if s.state == StepState::Gate {
                reset(s, note);
            }
        }
        Ok(())
    }

    /// A person raises the budget and resumes a paused run (REQ-005, `q:Q-053`).
    pub fn resume(&self, run_id: &str, add_usd: f64) -> Result<RunState, String> {
        let mut inner = self.lock();
        if !(add_usd >= 0.0 && add_usd.is_finite()) {
            return Err("the added budget must be a positive number".into());
        }
        inner.run(run_id)?;
        inner.rec(run_id).extra_usd += add_usd;
        let budget_left = inner.budget_level(run_id) != BudgetLevel::Spent;
        inner.checked(run_id, RunEvent::Resume { budget_left })?;
        Ok(inner.rec(run_id).run.state)
    }

    /// A person clears the cause of `Blocked` (`q:Q-025` option 1, the click).
    pub fn unblock(&self, run_id: &str) -> Result<(), String> {
        self.lock().checked(run_id, RunEvent::Unblock)
    }

    /// Any other run event, for `delivery` (`Closed` after the merge, `FixStarted`).
    pub fn apply(&self, run_id: &str, event: RunEvent) -> Result<RunState, String> {
        let mut inner = self.lock();
        inner.checked(run_id, event)?;
        Ok(inner.rec(run_id).run.state)
    }
}

/// A step back to `Pending` with fresh children and a note for the next brief.
pub(crate) fn reset(s: &mut StepRec, note: &str) {
    s.state = StepState::Pending;
    s.units.clear();
    s.output = Value::Null;
    if !note.is_empty() {
        s.notes.push(note.into());
    }
}

/// A run id: a ULID (48 bits of milliseconds, 80 bits from a counter and the time).
fn ulid(ms: u64, seq: u64) -> String {
    const CROCKFORD: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut x = seq ^ ms.rotate_left(17) ^ 0x9E37_79B9_7F4A_7C15;
    // xorshift: the low bits differ for each run of one machine; `seq` keeps them unique.
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    let entropy = (u128::from(x) << 16 | u128::from(seq & 0xFFFF)) & ((1 << 80) - 1);
    let v = u128::from(ms & 0xFFFF_FFFF_FFFF) << 80 | entropy;
    (0..26)
        .rev()
        .map(|i| CROCKFORD[((v >> (i * 5)) & 31) as usize] as char)
        .collect()
}

impl Inner {
    pub(crate) fn now_s(&self) -> u64 {
        self.clock.now().as_secs()
    }

    pub(crate) fn rec(&mut self, run_id: &str) -> &mut RunRec {
        self.runs
            .get_mut(run_id)
            .expect("a run that the caller found")
    }

    pub(crate) fn run(&self, run_id: &str) -> Result<&RunRec, String> {
        self.runs
            .get(run_id)
            .ok_or_else(|| format!("no run {run_id}"))
    }

    pub(crate) fn project_of(&self, run_id: &str) -> Option<&Project> {
        self.projects.get(&self.runs.get(run_id)?.project)
    }

    fn live_ids(&self) -> Vec<String> {
        self.runs
            .values()
            .filter(|r| !r.run.state.is_final())
            .map(|r| r.id.clone())
            .collect()
    }

    pub(crate) fn log(&mut self, run_id: &str, step: Option<&str>, kind: &str, payload: Value) {
        self.dirty.insert(run_id.to_string());
        let ts = self.clock.now().as_millis() as u64;
        if let Err(e) = self.log.append(run_id, step, kind, &payload, ts) {
            self.errors.push(format!("run log {run_id}: {e}"));
        }
    }

    fn info(&self, r: &RunRec) -> RunInfo {
        RunInfo {
            id: r.id.clone(),
            project: r.project.clone(),
            key: r.key.clone(),
            workflow: r.wf.id.clone(),
            run: r.run,
            pr: r.pr,
            cost_usd: r.cost,
            tokens: r.tokens,
            turns: r.turns,
            budget_usd: r.wf.limits.budget_usd + r.extra_usd,
            steps: r
                .wf
                .steps
                .iter()
                .map(|s| {
                    let rec = &r.steps[&s.id];
                    StepInfo {
                        id: s.id.clone(),
                        state: rec.state,
                        units: rec.units.iter().map(|u| (u.id.clone(), u.state)).collect(),
                    }
                })
                .collect(),
            findings: r.d.findings.clone(),
            worktree_kept: r.d.kept.clone(),
        }
    }

    /// The one way to cancel a run: a click, the global kill switch or a terminal ticket. A merged
    /// run is never cancelled: it goes to `Done` through `delivery`. A final run stays as it is.
    /// The open ticket questions are withdrawn with no comment (REQ-018).
    pub(crate) fn cancel_run(&mut self, run_id: &str, reason: &str) -> Result<(), String> {
        let state = self.run(run_id)?.run.state;
        if state == RunState::Merged {
            return Err("a merged run goes to Done, not Cancelled".into());
        }
        if state.is_final() {
            return Ok(());
        }
        self.withdraw_ticket_questions(run_id);
        self.log(run_id, None, kind::NOTE, json!({"stop": reason}));
        self.checked(run_id, RunEvent::Cancel)
    }

    /// `transition` for a person's click: a refusal is an error.
    pub(crate) fn checked(&mut self, run_id: &str, event: RunEvent) -> Result<(), String> {
        let from = self.run(run_id)?.run.state;
        if self.transition(run_id, event) {
            Ok(())
        } else {
            Err(format!("refused {event:?} in {}", from.as_str()))
        }
    }

    /// The one way to change a run: `Run::apply`, the log, the agents, the ticket.
    pub(crate) fn transition(&mut self, run_id: &str, event: RunEvent) -> bool {
        let Some(rec) = self.runs.get_mut(run_id) else {
            return false;
        };
        let from = rec.run;
        let to = match from.apply(event) {
            Ok(to) => to,
            Err(refused) => {
                self.log(
                    run_id,
                    None,
                    kind::NOTE,
                    json!({"refused": refused.to_string()}),
                );
                return false;
            }
        };
        rec.run = to;
        if !to.state.clocks_run() {
            park(rec);
        }
        let ended = to.state.is_final() && !from.state.is_final();
        if ended {
            self.ended.push((rec.project.clone(), rec.key.clone()));
        }
        let payload = json!({
            "from": from.state, "to": to.state, "event": event, "return_to": to.return_to,
        });
        self.log(run_id, None, kind::STATE, payload);
        if ended {
            // No push, pull request or thread reply has a target in a final state.
            self.drop_delivery_approvals(run_id);
        }
        if from.state != to.state {
            self.map_ticket(run_id, to.state);
        }
        true
    }

    /// Move the ticket to the status and labels of the state (REQ-008).
    fn map_ticket(&mut self, run_id: &str, state: RunState) {
        let Some(p) = self.project_of(run_id) else {
            return;
        };
        let map = status_map(&p.automation);
        let rec = &self.runs[run_id];
        let key = rec.key.clone();
        let target = map.get(state.as_str()).cloned().unwrap_or_default();
        let labels = run::staged_labels(&rec.labels, &map, state);
        // The forge can close the ticket at the merge: no second move (`delivery` REQ-023).
        let closed = matches!(state, RunState::Merged | RunState::Done)
            && p.mirror
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .ticket(&p.source, &rec.key)
                .ok()
                .flatten()
                .is_some_and(|t| p.automation.terminal(&t.item.status));
        let status = target.status.filter(|s| *s != rec.ticket_status && !closed);
        let labels_changed = labels != rec.labels;
        if let Some(status) = status {
            self.write(
                run_id,
                Write::Transition {
                    key: key.clone(),
                    status,
                },
            );
        }
        if labels_changed {
            self.write(run_id, Write::Labels { key, labels });
        }
    }

    pub(crate) fn pump(&mut self) {
        for id in self.live_ids() {
            // A run that came back from a restart waits for its project. Until then it is not
            // blocked: it only does not move.
            if self.project_of(&id).is_some() {
                self.pump_run(&id);
            }
        }
    }

    pub(crate) fn pump_run(&mut self, run_id: &str) {
        // A crash between the merge and the close: the close is safe to repeat.
        if self.runs[run_id].run.state == RunState::Merged {
            self.close_merged(run_id);
            return;
        }
        let now = self.now_s();
        let due = {
            let rec = &self.runs[run_id];
            rec.run.state == RunState::RetryQueued
                && rec
                    .steps
                    .values()
                    .flat_map(|s| &s.units)
                    .all(|u| u.retry_at.is_none_or(|t| t <= now))
        };
        if due {
            self.transition(run_id, RunEvent::RetryDue);
        }
        self.remind(run_id, now);
        if self.clocks(run_id) {
            self.read_agents(run_id, now);
        }
        if self.clocks(run_id) {
            self.check_clocks(run_id, now);
        }
        self.retry_merges(run_id);
        self.drive_pr(run_id);
        self.take_feedback(run_id);
        self.schedule(run_id, now);
    }

    fn clocks(&self, run_id: &str) -> bool {
        self.runs[run_id].run.state.clocks_run()
    }

    fn read_agents(&mut self, run_id: &str, now: u64) {
        let mut events = Vec::new();
        for (sid, s) in &mut self.rec(run_id).steps {
            for (i, u) in s.units.iter_mut().enumerate() {
                while let Some(a) = u.agent.as_mut() {
                    let Some(e) = a.next() else { break };
                    let exit = matches!(e, AgentEvent::Exit { .. });
                    events.push((sid.clone(), i, e));
                    if exit {
                        break;
                    }
                }
            }
        }
        for (sid, i, e) in events {
            let unit_id = self.runs[run_id].steps[&sid].units[i].id.clone();
            let payload = serde_json::to_value(&e).unwrap_or(Value::Null);
            self.log(run_id, Some(&unit_id), kind::RUNNER, payload);
            if self.clocks(run_id) {
                self.on_agent_event(run_id, &sid, i, e, now);
            }
        }
    }

    fn on_agent_event(&mut self, run_id: &str, sid: &str, i: usize, e: AgentEvent, now: u64) {
        let rec = self.rec(run_id);
        let max_turns = rec.wf.limits.max_turns;
        let u = &mut rec.steps.get_mut(sid).expect("step").units[i];
        if u.state != StepState::Running {
            return;
        }
        u.last = now;
        match e {
            AgentEvent::Session { id } => u.session = Some(id),
            AgentEvent::Text { text } => u.text = text,
            AgentEvent::Turn => {
                rec.turns += 1;
                if rec.turns > max_turns {
                    let note = json!({"stop": format!("max turns ({max_turns})")});
                    self.log(run_id, None, kind::NOTE, note);
                    self.transition(run_id, RunEvent::Fail);
                }
            }
            AgentEvent::Usage {
                input_tokens,
                output_tokens,
                cost_usd,
                ..
            } => {
                let cost = cost_usd.unwrap_or(0.0);
                u.cost += cost;
                rec.cost += cost;
                rec.tokens += input_tokens + output_tokens;
                self.check_budget(run_id);
            }
            AgentEvent::Exit { code, cancelled } => {
                u.agent = None;
                if cancelled {
                    self.unit_failed(run_id, sid, i, "the agent was cancelled");
                } else if code == Some(0) {
                    let output = json!({"summary": u.text});
                    self.unit_done(run_id, sid, i, output, false);
                } else {
                    let reason = format!("the agent exited with {code:?}");
                    self.unit_failed(run_id, sid, i, &reason);
                }
            }
            AgentEvent::ToolCall { .. } | AgentEvent::ToolResult { .. } => {}
            AgentEvent::Error { .. } => {}
        }
    }

    pub(crate) fn budget_level(&self, run_id: &str) -> BudgetLevel {
        let rec = &self.runs[run_id];
        let money = run::budget_level(rec.cost, rec.wf.limits.budget_usd + rec.extra_usd);
        let tokens = self.cfg.max_tokens.map_or(BudgetLevel::Under, |m| {
            run::budget_level(rec.tokens as f64, m as f64)
        });
        let steps = rec.wf.steps.iter().filter_map(|s| {
            let spent: f64 = rec.steps[&s.id].units.iter().map(|u| u.cost).sum();
            s.budget
                .map(|b| run::budget_level(spent, b + rec.extra_usd))
        });
        [money, tokens]
            .into_iter()
            .chain(steps)
            .max_by_key(|l| rank(*l))
            .unwrap_or(BudgetLevel::Under)
    }

    /// One alert at 80 %, a hard stop at 100 % (REQ-022).
    fn check_budget(&mut self, run_id: &str) {
        let level = self.budget_level(run_id);
        let rec = self.rec(run_id);
        let (cost, tokens) = (rec.cost, rec.tokens);
        if level != BudgetLevel::Under && !rec.alerted {
            rec.alerted = true;
            let payload = json!({"budget": "80 %", "cost_usd": cost, "tokens": tokens});
            self.log(run_id, None, ALERT, payload);
        }
        if level == BudgetLevel::Spent {
            self.transition(run_id, RunEvent::BudgetStop);
        }
    }

    /// Stall timeout and step timeout (REQ-023): the step failed.
    fn check_clocks(&mut self, run_id: &str, now: u64) {
        let rec = &self.runs[run_id];
        let stall = u64::from(rec.wf.limits.stall_s);
        let mut late = Vec::new();
        for s in &rec.wf.steps {
            for (i, u) in rec.steps[&s.id].units.iter().enumerate() {
                if u.agent.is_none() || u.state != StepState::Running {
                    continue;
                }
                if now.saturating_sub(u.last) >= stall {
                    late.push((s.id.clone(), i, format!("stall: no event for {stall} s")));
                } else if let Some(t) = s.timeout
                    && now.saturating_sub(u.started) >= u64::from(t)
                {
                    late.push((s.id.clone(), i, format!("timeout: {t} s")));
                }
            }
        }
        for (sid, i, why) in late {
            if self.clocks(run_id) {
                self.unit_failed(run_id, &sid, i, &why);
            }
        }
    }

    pub(crate) fn unit_failed(&mut self, run_id: &str, sid: &str, i: usize, reason: &str) {
        let now = self.now_s();
        let retry = self.runs[run_id].wf.step(sid).map_or(0, |s| s.retry);
        let s = self.rec(run_id).steps.get_mut(sid).expect("step");
        let u = &mut s.units[i];
        u.agent = None;
        u.failures += 1;
        let (unit_id, failures) = (u.id.clone(), u.failures);
        let event = run::after_failure(failures, retry);
        if event == RunEvent::Retry {
            u.state = StepState::Pending;
            u.parked = false;
            u.retry_at = Some(now + run::retry_delay(failures).as_secs());
        } else {
            u.state = StepState::Failed;
            s.state = StepState::Failed;
        }
        let payload = json!({"step_failed": reason, "failures": failures});
        self.log(run_id, Some(&unit_id), kind::NOTE, payload);
        self.transition(run_id, event);
    }

    pub(crate) fn unit_done(&mut self, run_id: &str, sid: &str, i: usize, out: Value, block: bool) {
        let s = self.rec(run_id).steps.get_mut(sid).expect("step");
        let u = &mut s.units[i];
        u.agent = None;
        u.state = StepState::Done;
        u.output = out;
        let states: Vec<StepState> = s.units.iter().map(|u| u.state).collect();
        if workflow::fan_in(&states) == StepState::Done {
            self.step_done(run_id, sid, block);
        }
    }

    pub(crate) fn step_done(&mut self, run_id: &str, sid: &str, blocking: bool) {
        let step = self.runs[run_id].wf.step(sid).cloned().expect("step");
        // The children of a worktree step join the run folder before the step ends.
        if step.workspace == Workspace::Worktree && !self.join_children(run_id, sid) {
            return;
        }
        let s = self.rec(run_id).steps.get_mut(sid).expect("step");
        s.output = match step.for_each {
            Some(_) => {
                json!({"children": s.units.iter().map(|u| u.output.clone()).collect::<Vec<_>>()})
            }
            None => s.units.first().map_or(Value::Null, |u| u.output.clone()),
        };
        if kind_of(&step) == Kind::Review {
            self.review_done(run_id, &step, blocking);
        } else if step.gate == Gate::Human {
            let s = self.rec(run_id).steps.get_mut(sid).expect("step");
            s.state = StepState::Gate;
            if self.runs[run_id].run.state == RunState::Planning {
                self.transition(run_id, RunEvent::PlanReady { gate: true });
            }
        } else {
            self.rec(run_id).steps.get_mut(sid).expect("step").state = StepState::Done;
        }
    }

    /// Start what can start: runnable steps, then pending children (REQ-013).
    fn schedule(&mut self, run_id: &str, now: u64) {
        for _ in 0..64 {
            if !self.clocks(run_id) {
                return;
            }
            let rec = &self.runs[run_id];
            if rec.steps.values().all(|s| s.state == StepState::Done) {
                if rec.run.state == RunState::Planning {
                    self.transition(run_id, RunEvent::PlanReady { gate: false });
                }
                self.transition(run_id, RunEvent::Finished);
                return;
            }
            let states = rec
                .steps
                .iter()
                .map(|(k, s)| (k.clone(), s.state))
                .collect();
            if let Some(sid) = workflow::runnable(&rec.wf, &states).into_iter().next() {
                self.start_step(run_id, &sid);
                continue;
            }
            let mut next = None;
            for step in &rec.wf.steps {
                let s = &rec.steps[&step.id];
                if s.state != StepState::Running || step.action.is_some() {
                    continue;
                }
                let par = if step.for_each.is_some() {
                    step.max_parallel()
                } else {
                    1
                };
                let states: Vec<StepState> = s.units.iter().map(|u| u.state).collect();
                if let Some(i) = workflow::next_children(&states, par).into_iter().next() {
                    next = Some((step.id.clone(), i));
                    break;
                }
            }
            match next {
                Some((sid, i)) => {
                    if !self.start_unit(run_id, &sid, i, now) {
                        return;
                    }
                }
                None => return,
            }
        }
    }

    /// The run state that the step needs before it starts.
    fn phase(&mut self, run_id: &str, k: Kind) {
        if k == Kind::Plan {
            return;
        }
        if self.runs[run_id].run.state == RunState::Planning {
            self.transition(run_id, RunEvent::PlanReady { gate: false });
        }
        if matches!(k, Kind::Review | Kind::Action)
            && self.runs[run_id].run.state == RunState::Working
        {
            self.transition(run_id, RunEvent::BuildDone);
        }
    }

    fn start_step(&mut self, run_id: &str, sid: &str) {
        let step = self.runs[run_id].wf.step(sid).cloned().expect("step");
        self.phase(run_id, kind_of(&step));
        if !self.clocks(run_id) {
            return;
        }
        if step.action.is_some() {
            let s = self.rec(run_id).steps.get_mut(sid).expect("step");
            let mut u = Unit::new(sid.into(), None);
            u.state = StepState::Running;
            s.units = vec![u];
            s.state = StepState::Running;
            self.advance_pr(run_id);
            return;
        }
        let units = match step.source() {
            None => vec![Unit::new(sid.into(), None)],
            Some(src) => {
                let rec = &self.runs[run_id];
                let list = rec.steps.get(src.step).map(|s| &s.output[src.field]);
                match list.and_then(Value::as_array) {
                    Some(items) => items
                        .iter()
                        .enumerate()
                        .map(|(n, it)| Unit::new(format!("{sid}-{}", n + 1), Some(it.clone())))
                        .collect(),
                    None => {
                        let why =
                            format!("`{}` is not a list", src.step.to_owned() + "." + src.field);
                        self.log(run_id, Some(sid), kind::NOTE, json!({"step_failed": why}));
                        self.rec(run_id).steps.get_mut(sid).expect("step").state =
                            StepState::Failed;
                        self.transition(run_id, RunEvent::Fail);
                        return;
                    }
                }
            }
        };
        let s = self.rec(run_id).steps.get_mut(sid).expect("step");
        s.state = if units.is_empty() {
            StepState::Done
        } else {
            StepState::Running
        };
        if units.is_empty() {
            s.output = json!({"children": []});
        }
        s.units = units;
    }

    /// Start the agent of one unit. `false` when the run stopped.
    fn start_unit(&mut self, run_id: &str, sid: &str, i: usize, now: u64) -> bool {
        let step = self.runs[run_id].wf.step(sid).cloned().expect("step");
        let review = if kind_of(&step) == Kind::Review {
            match self.review_context(run_id) {
                Ok(text) => Some(text),
                Err(e) => return self.block(run_id, sid, &e),
            }
        } else {
            None
        };
        let rec = &self.runs[run_id];
        let Some(p) = self.projects.get(&rec.project) else {
            return self.block(run_id, sid, "the project is not open");
        };
        let u = &rec.steps[sid].units[i];
        let role_name = u.role.as_deref().or(step.role.as_deref());
        let role = role_name.and_then(|r| p.files.role(r));
        let child = (step.workspace == Workspace::Worktree).then_some(u.id.as_str());
        let dir = match p.workspaces.dir(run_id, step.workspace, child) {
            Ok(d) => d,
            Err(e) => return self.block(run_id, sid, &format!("workspace: {e}")),
        };
        let runner = self.cfg.runner.clone();
        let model = step
            .model
            .clone()
            .or_else(|| role.as_ref().and_then(|r| r.model.clone()))
            .and_then(|m| self.cfg.tiers.model(&runner, &m));
        let resume = u
            .session
            .clone()
            .filter(|_| u.parked && !step.fresh_context);
        let prompt = match resume {
            Some(_) => self.resume_prompt(run_id, sid),
            None => {
                let prompt = role.map(|r| r.prompt).unwrap_or_default();
                self.brief(run_id, &step, i, prompt, review.as_deref())
            }
        };
        let brief = Brief {
            run: run_id.into(),
            step: u.id.clone(),
            project: rec.project.clone(),
            runner,
            model,
            effort: step.effort.or_else(|| p.files.role(role_name?)?.effort),
            mode: step.mode,
            tools: step.tools.clone(),
            prompt,
            dir,
            resume,
        };
        match self.agents.start(&brief) {
            Ok(agent) => {
                let u = &mut self.rec(run_id).steps.get_mut(sid).expect("step").units[i];
                u.agent = Some(agent);
                u.state = StepState::Running;
                u.started = now;
                u.last = now;
                u.parked = false;
                u.retry_at = None;
                let payload = json!({
                    "start": brief.step, "runner": brief.runner, "model": brief.model,
                    "effort": brief.effort, "mode": brief.mode, "resume": brief.resume.is_some(),
                });
                self.log(run_id, Some(&brief.step), kind::RUNNER, payload);
                true
            }
            Err(e) => self.block(run_id, sid, &format!("runner: {e}")),
        }
    }

    pub(crate) fn block(&mut self, run_id: &str, sid: &str, why: &str) -> bool {
        self.log(run_id, Some(sid), kind::NOTE, json!({"blocked": why}));
        self.transition(run_id, RunEvent::Block);
        false
    }

    /// The first brief of a unit: role, skill, ticket, inputs, item, notes, answers.
    /// A reviewer gets `review` (the diff, the criteria) in place of the outputs of the builders.
    fn brief(
        &self,
        run_id: &str,
        step: &Step,
        i: usize,
        role_prompt: String,
        review: Option<&str>,
    ) -> String {
        let rec = &self.runs[run_id];
        let mut p = role_prompt;
        if !p.is_empty() {
            p.push_str("\n\n");
        }
        if let Some(skill) = &step.skill {
            p.push_str(&format!("Use the skill `{skill}`.\n\n"));
        }
        p.push_str(&format!(
            "Ticket {}: {}\n\n{}\n",
            rec.key, rec.title, rec.description
        ));
        match review {
            Some(text) => p.push_str(text),
            None => {
                for n in &step.needs {
                    if let Some(s) = rec.steps.get(n) {
                        p.push_str(&format!("\nOutput of `{n}`:\n{}\n", s.output));
                    }
                }
            }
        }
        if let Some(item) = &rec.steps[&step.id].units[i].item {
            p.push_str(&format!("\nYour item:\n{item}\n"));
        }
        p.push_str(&self.resume_prompt(run_id, &step.id));
        p.push_str("\nEnd the step with the `report` tool.\n");
        p
    }

    /// The notes of the step and the answers of the run. A resumed session gets only this.
    fn resume_prompt(&self, run_id: &str, sid: &str) -> String {
        let mut p = String::new();
        let notes = &self.runs[run_id].steps[sid].notes;
        if !notes.is_empty() {
            p.push_str("\nNotes:\n");
            for n in notes {
                p.push_str(&format!("- {n}\n"));
            }
        }
        p.push_str(&self.answers_text(run_id));
        p
    }

    fn start(&mut self, req: &StartRequest) -> Result<(), String> {
        if self.kill {
            return Err("the global kill switch is on".into());
        }
        let p = self
            .projects
            .get(&req.project)
            .ok_or_else(|| format!("project {} is not open", req.project))?;
        let item = &req.ticket.item;
        let wf_id = item
            .labels
            .iter()
            .find_map(|l| l.strip_prefix(WORKFLOW_LABEL))
            .unwrap_or(&p.default_workflow);
        let wf = p
            .files
            .workflows
            .get(wf_id)
            .cloned()
            .ok_or_else(|| format!("no workflow `{wf_id}`"))?;
        let ms = self.clock.now().as_millis() as u64;
        self.seq += 1;
        let id = ulid(ms, self.seq);
        let rec = RunRec {
            id: id.clone(),
            project: req.project.clone(),
            key: item.key.clone(),
            title: item.title.clone(),
            description: item.description.clone(),
            url: item.url.clone(),
            kind: item.kind,
            status: req.status.clone(),
            ticket_status: item.status.name.clone(),
            labels: item.labels.clone(),
            steps: wf
                .steps
                .iter()
                .map(|s| (s.id.clone(), StepRec::default()))
                .collect(),
            wf,
            run: Run::new(),
            pr: None,
            turns: 0,
            cost: 0.0,
            tokens: 0,
            extra_usd: 0.0,
            alerted: false,
            rounds: 0,
            questions: Vec::new(),
            d: Delivered::default(),
            messages: Vec::new(),
        };
        let payload = json!({
            "ticket": format!("wi:{}", item.key), "workflow": format!("wf:{}", rec.wf.id),
            "machine": req.machine, "stamped": req.stamped,
        });
        self.runs.insert(id.clone(), rec);
        self.log(&id, None, kind::NOTE, payload);
        self.transition(&id, RunEvent::Claim);
        self.transition(&id, RunEvent::Start);
        Ok(())
    }
}

/// Stop the agents of a run that left the clock states. Each keeps its session.
fn park(rec: &mut RunRec) {
    for u in rec.steps.values_mut().flat_map(|s| &mut s.units) {
        if let Some(mut a) = u.agent.take() {
            a.cancel();
            u.state = StepState::Pending;
            u.parked = true;
        }
    }
}

impl Dispatch for Factory {
    fn kill_switch(&self) -> bool {
        self.lock().kill
    }

    fn active_runs(&self) -> Vec<ActiveRun> {
        let inner = self.lock();
        inner
            .runs
            .values()
            .filter(|r| !r.run.state.is_final())
            .map(|r| ActiveRun {
                run_id: r.id.clone(),
                project: r.project.clone(),
                key: r.key.clone(),
                state: r.run.state,
                status: r.status.clone(),
                pr: r.pr,
            })
            .collect()
    }

    fn start(&self, request: &StartRequest) -> Result<(), String> {
        self.lock().start(request)
    }

    fn stop(&self, run_id: &str, reason: &str) -> Result<(), String> {
        self.lock().cancel_run(run_id, reason)
    }

    fn event(&self, event: &SyncEvent) -> Result<(), String> {
        let mut inner = self.lock();
        match event {
            SyncEvent::Tick { .. } => inner.pump(),
            SyncEvent::Comment {
                key,
                comment,
                answers,
            } => inner.on_comment(key, comment, answers.as_deref()),
            SyncEvent::Pr(e) => inner.on_pr(e.number, e.kind),
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ulid_is_a_run_ref() {
        let a = ulid(1_793_268_000_000, 1);
        let b = ulid(1_793_268_000_000, 2);
        assert_ne!(a, b);
        assert!(
            shipyard_core::refs::parse(&format!("run:{a}")).is_some(),
            "{a}"
        );
    }

    #[test]
    fn tiers_map_per_runner() {
        let t = Tiers::default();
        assert_eq!(t.model("claude", "top").as_deref(), Some("opus"));
        assert_eq!(t.model("codex", "top"), None);
        assert_eq!(t.model("codex", "gpt-5"), Some("gpt-5".into()));
    }
}
