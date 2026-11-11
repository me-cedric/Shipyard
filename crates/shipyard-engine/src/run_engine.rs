//! The factory (spec `factory`, REQ-006, REQ-007, REQ-009, REQ-013, REQ-022 to REQ-024, REQ-035,
//! REQ-036). It implements [`Dispatch`]: the tick hands it claimed tickets, stops and events.
//!
//! It is synchronous and driven from outside. [`Factory::pump`] reads the agent events with no
//! wait, checks the clocks against the [`Clock`], and starts the next steps. The app calls it in a
//! loop; each `SyncEvent::Tick` calls it too. A test calls it with fakes and a fake clock.
//!
//! Rules that the engine decides (core has no step to state mapping):
//! - A step with `action` is an action. A step with `max_rounds` or the role `reviewer` is a
//!   review. A step with
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

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_core::pickup::{ActiveRun, Automation, SyncEvent};
use shipyard_core::rights::{Area, Right};
use shipyard_core::run::{self, BudgetLevel, Cause, Escalation, Run, RunEvent, RunState};
use shipyard_core::work::Team;
use shipyard_core::work_item::WorkKind;
use shipyard_core::workflow::{self, Effort, Gate, Mode, Step, StepState, Workflow, Workspace};
use shipyard_store::automation_file::status_map;
use shipyard_store::factory_files::Loaded;
use shipyard_store::mirror::Mirror;
use shipyard_store::ref_index::RefIndex;
use shipyard_store::run_log::{RunLog, kind};

use crate::Clock;
use crate::approvals::{Approval, Write};
use crate::fence::{NOTICE, fence};
use crate::jobs::{Job, Work, run_all};
use crate::persist::Replay;
use crate::ports::{
    AgentEvent, AgentRun, Agents, Brief, Dispatch, Git, Pulls, StartRequest, Workspaces, Writer,
};
use crate::pull_request::{Delivered, Stuck};
use crate::questions::Asked;
use crate::review::Finding;
use crate::tools::Message;

/// A ticket label `wf:<id>` picks the workflow (REQ-009).
pub const WORKFLOW_LABEL: &str = "wf:";
/// A ticket key with this prefix is not in an issue tracker: the run writes nothing to a tracker.
pub const TICKETLESS_PREFIX: &str = "docs:";
/// On a ticketless run, a label `base:<branch>` names the branch that the run starts from and
/// that its pull request targets.
pub const BASE_LABEL: &str = "base:";
/// Run log kind of a budget alert and of a question reminder.
pub const ALERT: &str = "alert";

/// Model tiers (`top`, `mid`, `small`) to a model of each runner. A name that is not a tier of
/// the runner goes to the runner as it is. A runner with no row uses its own default model.
/// The entry `<tier>:effort` holds the reasoning level of a tier.
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

    /// The reasoning level that Settings gives to the tier `name`. A level that a step or a role
    /// names wins over it.
    pub fn effort(&self, runner: &str, name: &str) -> Option<Effort> {
        match self.0.get(runner)?.get(&format!("{name}:effort"))?.as_str() {
            "low" => Some(Effort::Low),
            "medium" => Some(Effort::Medium),
            "high" => Some(Effort::High),
            "xhigh" => Some(Effort::Xhigh),
            "max" => Some(Effort::Max),
            _ => None,
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
}

impl Default for Config {
    fn default() -> Self {
        Self {
            runner: "claude".into(),
            tiers: Tiers::default(),
            max_tokens: None,
        }
    }
}

/// The person who starts the runs of a project on this machine, and the rights of that person
/// (`team-rights` REQ-009). A run keeps the one of its start.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Actor {
    /// The handle of the member, else `solo` or `unknown`.
    pub by: String,
    pub rights: Vec<Right>,
    /// The areas at `none` for this person: the read tools of the run refuse them (REQ-018).
    #[serde(default)]
    pub hidden: Vec<Area>,
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
    /// The ref index of this project: `read_ref` of its runs reads it, never the index of
    /// another project (`factory` REQ-049). `None`: the tool is an error.
    pub refs: Option<Arc<Mutex<RefIndex>>>,
    /// The docs and pull request languages (`project-creator` REQ-005, REQ-006).
    pub languages: shipyard_core::project::ProjectLanguages,
}

/// A step as the views and `delivery` see it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StepInfo {
    pub id: String,
    pub state: StepState,
    /// One child, with the step id, for a step with no `for_each`.
    pub units: Vec<UnitInfo>,
}

/// A unit as the views see it: its AI tool session and the folder that the tool ran in.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UnitInfo {
    pub id: String,
    pub state: StepState,
    pub runner: String,
    /// The session id of the AI tool. `None`: no event with it yet.
    pub session: Option<String>,
    /// The folder of the last start. Empty: never started.
    pub dir: String,
    /// Unix seconds: the last start and the last event.
    pub started: u64,
    pub last: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RunInfo {
    pub id: String,
    pub project: String,
    pub key: String,
    /// The ticket title and address, for the cards.
    pub title: String,
    pub url: String,
    pub workflow: String,
    pub run: Run,
    pub pr: Option<u64>,
    pub cost_usd: f64,
    pub tokens: u64,
    pub turns: u32,
    pub budget_usd: Option<f64>,
    pub steps: Vec<StepInfo>,
    /// The P0 and P1 findings that are left when the review rounds are spent (the Inbox card).
    pub findings: Vec<Finding>,
    /// The worktrees that a merged run left behind, with their files (`delivery` REQ-025).
    pub worktree_kept: Option<String>,
    /// Why the run stopped for a person (REQ-053). `None`: no escalation, or a log from before.
    pub escalation: Option<Escalation>,
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
    /// The folder of the last start.
    #[serde(default)]
    pub dir: String,
    /// Stopped by a side state: start again with the session.
    pub parked: bool,
    pub output: Value,
    pub text: String,
    pub cost: f64,
    /// The runner and the model that the last start used. Empty: never started.
    #[serde(default)]
    pub runner: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub tokens: u64,
    /// The worktree of this child is joined into the run folder.
    pub merged: bool,
    /// The join of this child conflicted once: it ran again from the run branch.
    #[serde(default)]
    pub redone: bool,
    /// The id of the current attempt (REQ-059). The step token names it: a call of another
    /// attempt is ignored.
    #[serde(default)]
    pub attempt: String,
    /// A fixer: this child does its task again in the run worktree, after a second conflict at
    /// the join (REQ-057). It counts as joined.
    #[serde(default)]
    pub fixer: bool,
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
            dir: String::new(),
            parked: false,
            output: Value::Null,
            text: String::new(),
            cost: 0.0,
            runner: String::new(),
            model: None,
            tokens: 0,
            merged: false,
            redone: false,
            attempt: String::new(),
            fixer: false,
        }
    }
}

/// A guard that failed before an attempt (REQ-056): it waits with the backoff and uses no retry.
#[derive(Serialize, Deserialize)]
pub(crate) struct GuardFail {
    /// The last cause. A new cause changes only the text: causes that take turns still escalate.
    pub why: String,
    /// Seconds: the first failure of any guard since the last attempt, and the next try.
    pub since: u64,
    pub retry_at: u64,
    pub tries: u32,
}

/// The counts of the whole run (REQ-052, REQ-054, REQ-055). They are saved with the run: no
/// round, retry or restart resets them.
#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub(crate) struct Counts {
    /// Failed attempts of each unit id.
    pub attempts: BTreeMap<String, u32>,
    pub feedback_rounds: u32,
    pub fix_rounds: u32,
    /// The fingerprint and the blocking count of the last review round that asked for a fix.
    pub last_review: Option<(u64, usize)>,
    /// The fingerprint of the last failure of each unit id.
    pub last_failure: BTreeMap<String, u64>,
    /// What unblocks gave: `review_rounds`, `feedback_rounds`, `fix_rounds`, `attempts:<unit>`.
    pub extra: BTreeMap<String, u32>,
    /// The fixer rounds that ran (`rebase`, `empty`): the same cause again escalates.
    pub fixers: BTreeSet<String>,
    pub guard: Option<GuardFail>,
    /// The escalations so far: the attempt of the stop report key.
    pub escalations: u32,
    /// The fix of the last allowed review round runs on the top model tier (REQ-036).
    pub top_tier: bool,
    /// A pause of the day budget of this key (`day:<date>`): the next day resumes it.
    pub day_pause: Option<String>,
}

impl Counts {
    pub fn extra(&self, key: &str) -> u32 {
        self.extra.get(key).copied().unwrap_or(0)
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
    /// The gate commands of a review run outside the lock: the verdict is not in yet. After a
    /// restart, or when the run changed in between, the next pump asks again.
    #[serde(default)]
    pub gating: bool,
    /// The next round of the step works in the run worktree as one unit, not in child
    /// worktrees: it resolves a rebase conflict of the run branch.
    #[serde(default)]
    pub in_run: bool,
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
    /// Tokens that a person added at a resume, on top of `Config::max_tokens`.
    #[serde(default)]
    pub extra_tokens: u64,
    /// Turns that a person added at a resume, on top of `limits.max_turns`.
    #[serde(default)]
    pub extra_turns: u32,
    pub alerted: bool,
    pub rounds: u32,
    pub questions: Vec<Asked>,
    pub d: Delivered,
    /// What agents told the person (`message` to `person`).
    #[serde(default)]
    pub messages: Vec<Message>,
    /// Who started the run. `None`: a run of an older Shipyard, or no person was set.
    #[serde(default)]
    pub by: Option<Actor>,
    #[serde(default)]
    pub c: Counts,
    /// The record of the last escalation, until the run goes on.
    #[serde(default)]
    pub escalation: Option<Escalation>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Kind {
    Plan,
    Build,
    Review,
    Action,
}

/// The prompt of a resumed session that has no note and no answer to read.
const RESUME: &str = "Continue the step where you stopped. End it with the `report` tool.\n";

pub(crate) fn kind_of(s: &Step) -> Kind {
    if s.action.is_some() {
        Kind::Action
    } else if s.max_rounds.is_some() || s.role.as_deref() == Some("reviewer") {
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
    /// Runs that changed since their last save (`persist`).
    pub dirty: BTreeSet<String>,
    /// Writes that the log shows after the last save of a run (`persist::recover`).
    pub replay: BTreeMap<String, Vec<Replay>>,
    /// The global state that the last save holds: `(seq, next_approval, kill)`.
    pub saved_meta: (u64, u64, bool),
    /// Slow work that goes out when the lock goes (`jobs`).
    pub jobs: Vec<Job>,
    /// The gates of each run that are out.
    pub busy: BTreeMap<String, u32>,
    /// The pushes and pull requests of each run that are out.
    pub delivering: BTreeMap<String, u32>,
    /// A counter of the changes of each run: a job that ends after a change does not decide.
    pub gens: BTreeMap<String, u64>,
    /// The app quits: a gate that ends now was stopped, and its verdict is not a finding.
    pub closing: bool,
    /// The day and member budgets that sent their alert: `day:<date>`, `member:<name>`
    /// (REQ-022). The run budget has its flag in `RunRec::alerted`.
    pub alerted: BTreeSet<String>,
    /// Running totals of each open project. `set_project` builds them from the log.
    pub spent: BTreeMap<String, crate::usage::Spent>,
    /// The person of each project on this machine (`set_actor`).
    pub actors: BTreeMap<String, Actor>,
    /// The team file of each project (`set_team`). No entry: no reply on the ticket unblocks a
    /// run (`questions-loop` REQ-022).
    pub teams: BTreeMap<String, Team>,
}

pub struct Factory {
    inner: Mutex<Inner>,
}

/// The lock of the factory. When it goes, the change is saved (`Inner::persist`) and the jobs of
/// the change run with no lock (`jobs`): every public call is one change, so the save holds a
/// whole change or none, and a slow call holds nobody.
pub(crate) struct Guard<'a> {
    inner: Option<MutexGuard<'a, Inner>>,
    lock: &'a Mutex<Inner>,
}

impl Deref for Guard<'_> {
    type Target = Inner;

    fn deref(&self) -> &Inner {
        self.inner.as_deref().expect("the lock is held")
    }
}

impl DerefMut for Guard<'_> {
    fn deref_mut(&mut self) -> &mut Inner {
        self.inner.as_deref_mut().expect("the lock is held")
    }
}

impl Drop for Guard<'_> {
    fn drop(&mut self) {
        let Some(mut inner) = self.inner.take() else {
            return;
        };
        inner.persist();
        // A panic unwinds: leave the jobs, do not run work in a drop that cannot fail.
        while !std::thread::panicking() && !inner.jobs.is_empty() {
            let jobs = std::mem::take(&mut inner.jobs);
            drop(inner);
            let done = run_all(&jobs);
            inner = self.lock.lock().unwrap_or_else(|e| e.into_inner());
            for (job, done) in jobs.into_iter().zip(done) {
                inner.apply_job(job, done);
            }
            inner.persist();
        }
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
            dirty: BTreeSet::new(),
            replay: BTreeMap::new(),
            saved_meta: (0, 0, false),
            jobs: Vec::new(),
            busy: BTreeMap::new(),
            delivering: BTreeMap::new(),
            gens: BTreeMap::new(),
            closing: false,
            alerted: BTreeSet::new(),
            spent: BTreeMap::new(),
            actors: BTreeMap::new(),
            teams: BTreeMap::new(),
        };
        inner.recover();
        inner.persist();
        Self {
            inner: Mutex::new(inner),
        }
    }

    pub(crate) fn lock(&self) -> Guard<'_> {
        Guard {
            inner: Some(self.inner.lock().unwrap_or_else(|e| e.into_inner())),
            lock: &self.inner,
        }
    }

    /// The ref index of a project, for the `read_ref` of its runs (`factory` REQ-020). A project
    /// that gets its index with `Project::refs` needs no call.
    pub fn set_refs(&self, project: &str, index: Arc<Mutex<RefIndex>>) {
        if let Some(p) = self.lock().projects.get_mut(project) {
            p.refs = Some(index);
        }
    }

    /// The tier map after an edit. A step that starts later uses it; a running step keeps its model.
    pub fn set_tiers(&self, tiers: Tiers) {
        self.lock().cfg.tiers = tiers;
    }

    /// Add a project, or replace it after a reload of its files.
    pub fn set_project(&self, id: &str, project: Project) {
        let mut inner = self.lock();
        inner.projects.insert(id.into(), project);
        let spent = inner.build_spent(id);
        inner.spent.insert(id.into(), spent);
        // A switch turned on sends the writes of that kind that wait.
        inner.release_allowed();
    }

    /// The person who starts the next runs of a project: a click or the pickup of the tick.
    /// `None` clears it: the switches alone decide a write.
    pub fn set_actor(&self, project: &str, actor: Option<Actor>) {
        let mut inner = self.lock();
        match actor {
            Some(a) => inner.actors.insert(project.into(), a),
            None => inner.actors.remove(project),
        };
        inner.release_allowed();
    }

    /// The team file of a project, for the replies on the ticket (`questions-loop` REQ-022).
    /// `None`: the file cannot be read, and no reply unblocks a run.
    pub fn set_team(&self, project: &str, team: Option<Team>) {
        let mut inner = self.lock();
        match team {
            Some(t) => inner.teams.insert(project.into(), t),
            None => inner.teams.remove(project),
        };
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

    /// The app quits: stop every agent process and end its session. No run changes state, so the
    /// next start takes each step back on its CLI session (`persist`).
    pub fn shutdown(&self) {
        let mut inner = self.lock();
        inner.closing = true;
        let mut ended = Vec::new();
        for rec in inner.runs.values_mut() {
            for u in rec.steps.values_mut().flat_map(|s| &mut s.units) {
                if let Some(mut a) = u.agent.take() {
                    a.cancel();
                    ended.push((rec.id.clone(), u.id.clone()));
                }
            }
        }
        for (run, step) in ended {
            inner.agents.end(&run, &step);
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
        self.resume_with(run_id, add_usd, 0, None)
    }

    /// `resume`, with tokens added to the token limit too. A pause for `max_tokens` needs them.
    /// `note`: a message for the agents, kept like the one of `unblock_with`.
    pub fn resume_with(
        &self,
        run_id: &str,
        add_usd: f64,
        add_tokens: u64,
        note: Option<&str>,
    ) -> Result<RunState, String> {
        let mut inner = self.lock();
        if !(add_usd >= 0.0 && add_usd.is_finite()) {
            return Err("the added budget must be a positive number".into());
        }
        inner.run(run_id)?;
        inner.take_limits(run_id);
        inner.rec(run_id).extra_usd += add_usd;
        inner.rec(run_id).extra_tokens += add_tokens;
        // A run paused at its max turns gets one more set of turns.
        let rec = inner.rec(run_id);
        if rec
            .wf
            .limits
            .max_turns
            .is_some_and(|max| rec.turns >= max + rec.extra_turns)
        {
            rec.extra_turns = rec.turns;
        }
        let budget_left = inner.budget_level(run_id) != BudgetLevel::Spent;
        let note = note.map(str::trim).filter(|n| !n.is_empty());
        // A refused resume adds no note.
        let before = inner.run(run_id)?.run.state;
        inner.checked(run_id, RunEvent::Resume { budget_left })?;
        if inner.rec(run_id).run.state != RunState::Paused {
            let rec = inner.rec(run_id);
            rec.c.day_pause = None;
            rec.escalation = None;
        }
        if let Some(n) = note
            && before == RunState::Paused
            && inner.rec(run_id).run.state != RunState::Paused
        {
            for s in inner.rec(run_id).steps.values_mut() {
                if matches!(s.state, StepState::Running | StepState::Failed) {
                    s.notes.push(n.into());
                }
            }
            inner.log(run_id, None, kind::NOTE, json!({"note": n, "by": "person"}));
        }
        Ok(inner.rec(run_id).run.state)
    }

    /// A person clears the cause of `Blocked` (`q:Q-025` option 1, the click).
    pub fn unblock(&self, run_id: &str) -> Result<(), String> {
        self.unblock_with(run_id, None)
    }

    /// `unblock` with a message for the agents: it goes into the notes of each step that runs
    /// or failed, so the next brief or the resumed session reads it. A child that conflicted at
    /// the join gets one more redo. A review that spent its fix rounds gets one more round.
    pub fn unblock_with(&self, run_id: &str, note: Option<&str>) -> Result<(), String> {
        self.lock().unblock_with(run_id, note)
    }

    /// A person ends a run whose pull request step found no change to deliver: the work is on
    /// the base already. The run goes to `Done`, with the reason in the run log.
    pub fn close_done(&self, run_id: &str) -> Result<(), String> {
        let mut inner = self.lock();
        let rec = inner.run(run_id)?;
        if rec.run.state != RunState::Blocked || rec.d.stuck != Some(Stuck::Empty) {
            return Err("only a run blocked with nothing to deliver closes as done".into());
        }
        let why = "closed by a person: the run branch has no change to deliver";
        inner.log(
            run_id,
            None,
            kind::NOTE,
            json!({"done": why, "by": "person"}),
        );
        inner.checked(run_id, RunEvent::Finished)?;
        inner.rec(run_id).d.stuck = None;
        inner.remove_worktrees(run_id);
        Ok(())
    }

    /// Send the pull request back with a text: a feedback round on the run that holds it.
    pub fn send_back(&self, number: u64, text: &str) {
        self.lock().send_back(number, text);
    }

    /// Any other run event, for `delivery` (`Closed` after the merge, `FixStarted`).
    pub fn apply(&self, run_id: &str, event: RunEvent) -> Result<RunState, String> {
        let mut inner = self.lock();
        inner.checked(run_id, event)?;
        Ok(inner.rec(run_id).run.state)
    }
}

/// The rounds of a cap of the run, and the cap with what unblocks gave.
pub(crate) fn cap_of(rec: &RunRec, cap: &str) -> (u32, u32) {
    let l = &rec.wf.limits;
    let (count, limit) = match cap {
        "review_rounds" => {
            // A step `max_rounds` only lowers the cap (REQ-036).
            let lowest = rec.wf.steps.iter().filter_map(|s| s.max_rounds).min();
            (
                rec.rounds,
                lowest.map_or(l.review_cap(), |m| m.min(l.review_cap())),
            )
        }
        "feedback_rounds" => (rec.c.feedback_rounds, l.feedback_cap()),
        _ => (rec.c.fix_rounds, l.fix_cap()),
    };
    (count, limit + rec.c.extra(cap))
}

fn spent(rec: &RunRec, cap: &str) -> bool {
    let (count, limit) = cap_of(rec, cap);
    count >= limit
}

/// A step back to `Pending` with fresh children and a note for the next brief.
pub(crate) fn reset(s: &mut StepRec, note: &str) {
    s.state = StepState::Pending;
    s.gating = false;
    s.in_run = false;
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
    /// A resume and an unblock take the limits that the workflow has now (REQ-035): a limit that
    /// a person removed no longer stops the run, and a raised cap gives more rounds.
    fn take_limits(&mut self, run_id: &str) {
        let wf_id = self.rec(run_id).wf.id.clone();
        if let Some(now) = self
            .project_of(run_id)
            .and_then(|p| p.files.workflow(&wf_id))
            .map(|w| w.limits)
        {
            let limits = &mut self.rec(run_id).wf.limits;
            limits.budget_usd = now.budget_usd;
            limits.max_turns = now.max_turns;
            limits.review_rounds = now.review_rounds;
            limits.feedback_rounds = now.feedback_rounds;
            limits.fix_rounds = now.fix_rounds;
        }
    }

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

    pub(crate) fn log(&mut self, run_id: &str, step: Option<&str>, kind: &str, mut payload: Value) {
        // Each event names the person of the run (`team-rights` REQ-010).
        if let (Some(a), Some(map)) = (
            self.runs.get(run_id).and_then(|r| r.by.as_ref()),
            payload.as_object_mut(),
        ) {
            map.entry("by").or_insert_with(|| a.by.clone().into());
        }
        self.dirty.insert(run_id.to_string());
        let ts = self.clock.now().as_millis() as u64;
        if let Err(e) = self.log.append(run_id, step, kind, &payload, ts) {
            self.errors.push(format!("run log {run_id}: {e}"));
        } else if kind == kind::RUNNER && payload["type"] == "usage" {
            self.add_day(run_id, &payload, ts);
        }
    }

    fn info(&self, r: &RunRec) -> RunInfo {
        RunInfo {
            id: r.id.clone(),
            project: r.project.clone(),
            key: r.key.clone(),
            title: r.title.clone(),
            url: r.url.clone(),
            workflow: r.wf.id.clone(),
            run: r.run,
            pr: r.pr,
            cost_usd: r.cost,
            tokens: r.tokens,
            turns: r.turns,
            budget_usd: r.wf.limits.budget_usd.map(|b| b + r.extra_usd),
            steps: r
                .wf
                .steps
                .iter()
                .map(|s| {
                    let rec = &r.steps[&s.id];
                    StepInfo {
                        id: s.id.clone(),
                        state: rec.state,
                        units: rec
                            .units
                            .iter()
                            .map(|u| UnitInfo {
                                id: u.id.clone(),
                                state: u.state,
                                runner: u.runner.clone(),
                                session: u.session.clone(),
                                dir: u.dir.clone(),
                                started: u.started,
                                last: u.last,
                            })
                            .collect(),
                    }
                })
                .collect(),
            findings: r.d.findings.clone(),
            worktree_kept: r.d.kept.clone(),
            escalation: r.escalation.clone(),
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
        let stopped = if to.state.clocks_run() {
            Vec::new()
        } else {
            park(rec)
        };
        *self.gens.entry(run_id.into()).or_default() += 1;
        for step in stopped {
            self.agents.end(run_id, &step);
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
        if self.runs[run_id].key.starts_with(TICKETLESS_PREFIX) {
            return;
        }
        let Some(p) = self.project_of(run_id) else {
            return;
        };
        let map = status_map(&p.automation);
        let rec = &self.runs[run_id];
        let key = rec.key.clone();
        let target = map.get(state.as_str()).cloned().unwrap_or_default();
        // A move that waits in the queue of this change counts as made (`jobs`).
        let (mut ticket_status, mut ticket_labels) =
            (rec.ticket_status.clone(), rec.labels.clone());
        for job in self.jobs.iter().filter(|j| j.run == run_id) {
            match &job.work {
                Work::Write {
                    write: Write::Transition { status, .. },
                    ..
                } => ticket_status = status.clone(),
                Work::Write {
                    write: Write::Labels { labels, .. },
                    ..
                } => ticket_labels = labels.clone(),
                _ => {}
            }
        }
        let mut labels = run::staged_labels(&ticket_labels, &map, state);
        // At `Done` the pickup label goes, only with the switch on: no approval for it (`sync`
        // REQ-019).
        if let (RunState::Done, true, Some(pick)) = (
            state,
            p.automation.writes.tracker_transition,
            p.automation.pickup.label.as_deref(),
        ) {
            labels.retain(|l| !l.eq_ignore_ascii_case(pick));
        }
        // The forge can close the ticket at the merge: no second move (`delivery` REQ-023).
        let closed = matches!(state, RunState::Merged | RunState::Done)
            && p.mirror
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .ticket(&p.source, &rec.key)
                .ok()
                .flatten()
                .is_some_and(|t| p.automation.terminal(&t.item.status));
        let status = target.status.filter(|s| *s != ticket_status && !closed);
        let labels_changed = labels != ticket_labels;
        // The labels that Shipyard owns: the state map and the pickup label.
        let mut managed: Vec<String> = map.values().flat_map(|m| m.labels.clone()).collect();
        managed.extend(p.automation.pickup.label.clone());
        managed.sort();
        managed.dedup();
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
            self.write(
                run_id,
                Write::Labels {
                    key,
                    labels,
                    managed,
                },
            );
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
        // A job of the run is out: its result moves the run.
        if self.is_busy(run_id) {
            return;
        }
        // A crash between the merge and the close: the close is safe to repeat.
        if self.runs[run_id].run.state == RunState::Merged {
            self.close_merged(run_id);
            return;
        }
        let now = self.now_s();
        self.resume_next_day(run_id);
        let due = {
            let rec = &self.runs[run_id];
            rec.run.state == RunState::RetryQueued
                && rec.c.guard.as_ref().is_none_or(|g| g.retry_at <= now)
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
        self.regate(run_id);
        if self.is_busy(run_id) {
            return;
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
                if let Some(max_turns) = max_turns.filter(|m| rec.turns > m + rec.extra_turns) {
                    // A pause, not a failure: a person can give the run more turns (REQ-023).
                    let why = format!("max turns ({max_turns})");
                    self.escalate(run_id, Cause::MaxTurns, &[why]);
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
                u.tokens += input_tokens + output_tokens;
                rec.cost += cost;
                rec.tokens += input_tokens + output_tokens;
                self.add_member(run_id, input_tokens + output_tokens, cost);
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

    /// The level of the budgets of the run itself, and of the shared ones by key.
    fn budget_levels(&self, run_id: &str) -> (BudgetLevel, Vec<(String, BudgetLevel)>) {
        let rec = &self.runs[run_id];
        let money = rec.wf.limits.budget_usd.map_or(BudgetLevel::Under, |b| {
            run::budget_level(rec.cost, b + rec.extra_usd)
        });
        let tokens = self.cfg.max_tokens.map_or(BudgetLevel::Under, |m| {
            run::budget_level(rec.tokens as f64, (m + rec.extra_tokens) as f64)
        });
        let steps = rec.wf.steps.iter().filter_map(|s| {
            let spent: f64 = rec.steps[&s.id].units.iter().map(|u| u.cost).sum();
            s.budget
                .map(|b| run::budget_level(spent, b + rec.extra_usd))
        });
        let own = [money, tokens]
            .into_iter()
            .chain(steps)
            .max_by_key(|l| rank(*l))
            .unwrap_or(BudgetLevel::Under);
        (own, self.spend_levels(run_id))
    }

    pub(crate) fn budget_level(&self, run_id: &str) -> BudgetLevel {
        let (own, shared) = self.budget_levels(run_id);
        shared
            .into_iter()
            .map(|(_, l)| l)
            .chain([own])
            .max_by_key(|l| rank(*l))
            .unwrap_or(BudgetLevel::Under)
    }

    /// One alert at 80 %, a hard stop at 100 % (REQ-022).
    pub(crate) fn check_budget(&mut self, run_id: &str) {
        let (own, shared) = self.budget_levels(run_id);
        let stop =
            own == BudgetLevel::Spent || shared.iter().any(|(_, l)| *l == BudgetLevel::Spent);
        let rec = self.rec(run_id);
        let (cost, tokens) = (rec.cost, rec.tokens);
        let mut keys = Vec::new();
        if own != BudgetLevel::Under && !rec.alerted {
            rec.alerted = true;
            keys.push(format!("run:{run_id}"));
        }
        for (key, l) in &shared {
            if *l != BudgetLevel::Under && self.alerted.insert(key.clone()) {
                keys.push(key.clone());
            }
        }
        for key in keys {
            let payload = json!({"budget": "80 %", "key": key, "cost_usd": cost, "tokens": tokens});
            self.log(run_id, None, ALERT, payload);
        }
        if stop {
            self.budget_stop(run_id, own, &shared);
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

    /// A failed attempt (REQ-007, REQ-052, REQ-055): a retry with the backoff, else an
    /// escalation. The same failure twice in a row escalates at once.
    pub(crate) fn unit_failed(&mut self, run_id: &str, sid: &str, i: usize, reason: &str) {
        let now = self.now_s();
        let retry = self.runs[run_id].wf.step(sid).map_or(0, |s| s.retry);
        let rec = self.rec(run_id);
        let u = &mut rec.steps.get_mut(sid).expect("step").units[i];
        u.agent = None;
        u.failures += 1;
        let (unit_id, failures) = (u.id.clone(), u.failures);
        let attempts = {
            let a = rec.c.attempts.entry(unit_id.clone()).or_default();
            *a += 1;
            *a
        };
        let extra = rec.c.extra(&format!("attempts:{unit_id}"));
        let fp = run::fingerprint(&[reason]);
        let same = rec.c.last_failure.insert(unit_id.clone(), fp) == Some(fp);
        let cause = run::after_failure(failures, retry, attempts, extra)
            .or(same.then_some(Cause::SameFailure));
        let s = rec.steps.get_mut(sid).expect("step");
        let u = &mut s.units[i];
        if cause.is_none() {
            u.state = StepState::Pending;
            u.parked = false;
            u.retry_at = Some(now + run::retry_delay(failures).as_secs());
        } else {
            u.state = StepState::Failed;
            s.state = StepState::Failed;
        }
        self.agents.end(run_id, &unit_id);
        let payload = json!({
            "step_failed": reason, "failures": failures, "attempts": attempts,
            "fingerprint": format!("{fp:016x}"),
        });
        self.log(run_id, Some(&unit_id), kind::NOTE, payload);
        match cause {
            None => {
                self.transition(run_id, RunEvent::Retry);
            }
            Some(c) => {
                self.escalate(run_id, c, &[format!("{unit_id}: {reason}")]);
            }
        }
    }

    pub(crate) fn unit_done(&mut self, run_id: &str, sid: &str, i: usize, out: Value, block: bool) {
        let s = self.rec(run_id).steps.get_mut(sid).expect("step");
        let u = &mut s.units[i];
        u.agent = None;
        u.state = StepState::Done;
        u.output = out;
        let unit_id = u.id.clone();
        self.rec(run_id).c.last_failure.remove(&unit_id);
        self.agents.end(run_id, &unit_id);
        let s = self.rec(run_id).steps.get_mut(sid).expect("step");
        let states: Vec<StepState> = s.units.iter().map(|u| u.state).collect();
        if workflow::fan_in(&states) == StepState::Done {
            self.step_done(run_id, sid, block);
        }
    }

    pub(crate) fn step_done(&mut self, run_id: &str, sid: &str, blocking: bool) {
        let step = self.runs[run_id].wf.step(sid).cloned().expect("step");
        // The children of a worktree step join the run folder before the step ends.
        let in_run = self.runs[run_id].steps[sid].in_run;
        if step.workspace == Workspace::Worktree && !in_run && !self.join_children(run_id, sid) {
            return;
        }
        let s = self.rec(run_id).steps.get_mut(sid).expect("step");
        s.in_run = false;
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
        let in_run = self.runs[run_id].steps[sid].in_run;
        let units = match step.source().filter(|_| !in_run) {
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
                        self.escalate(run_id, Cause::Attempts, &[why]);
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
                Err(stop) => return self.stopped(run_id, sid, stop),
            }
        } else {
            None
        };
        let rec = &self.runs[run_id];
        let Some(p) = self.projects.get(&rec.project) else {
            return self.guard_failed(run_id, "the project is not open");
        };
        let u = &rec.steps[sid].units[i];
        let role_name = u.role.as_deref().or(step.role.as_deref());
        let role = role_name.and_then(|r| p.files.role(r));
        let worktree = step.workspace == Workspace::Worktree && !rec.steps[sid].in_run && !u.fixer;
        let child = worktree.then_some(u.id.as_str());
        let dir = match p.workspaces.dir(run_id, step.workspace, child) {
            Ok(d) => d,
            Err(e) => return self.guard_failed(run_id, &format!("workspace: {e}")),
        };
        let runner = self.cfg.runner.clone();
        // The fix of the last allowed review round runs on the top tier (REQ-036).
        let top = rec.c.top_tier && kind_of(&step) == Kind::Build;
        let named = match top {
            true => Some("top".to_string()),
            false => step
                .model
                .clone()
                .or_else(|| role.as_ref().and_then(|r| r.model.clone())),
        };
        let tier_effort = named
            .as_deref()
            .and_then(|n| self.cfg.tiers.effort(&runner, n));
        let model = named.and_then(|m| self.cfg.tiers.model(&runner, &m));
        let resume = u
            .session
            .clone()
            .filter(|_| u.parked && !step.fresh_context);
        let prompt = match resume {
            // A resumed session keeps its context. With no note and no answer, it still needs a
            // line: an empty prompt stops the AI tool (after Shipyard restarts, for example).
            Some(_) => Some(self.resume_prompt(run_id, sid))
                .filter(|p| !p.trim().is_empty())
                .unwrap_or_else(|| RESUME.into()),
            None => {
                let prompt = role.map(|r| r.prompt).unwrap_or_default();
                self.brief(run_id, &step, i, prompt, review.as_deref())
            }
        };
        let ms = self.clock.now().as_millis() as u64;
        let attempt = ulid(ms, self.seq + 1);
        let brief = Brief {
            run: run_id.into(),
            step: u.id.clone(),
            attempt: attempt.clone(),
            project: rec.project.clone(),
            runner,
            model,
            effort: match top {
                true => Some(Effort::High),
                false => step
                    .effort
                    .or_else(|| p.files.role(role_name?)?.effort)
                    .or(tier_effort),
            },
            mode: step.mode,
            tools: step.tools.clone(),
            prompt,
            dir,
            resume,
        };
        self.seq += 1;
        match self.agents.start(&brief) {
            Ok(agent) => {
                self.rec(run_id).c.guard = None;
                let u = &mut self.rec(run_id).steps.get_mut(sid).expect("step").units[i];
                u.attempt = attempt;
                u.agent = Some(agent);
                u.runner = brief.runner.clone();
                u.dir = brief.dir.display().to_string();
                u.model = brief.model.clone();
                u.state = StepState::Running;
                u.started = now;
                u.last = now;
                u.parked = false;
                u.retry_at = None;
                let payload = json!({
                    "start": brief.step, "runner": brief.runner, "model": brief.model,
                    "effort": brief.effort, "mode": brief.mode, "resume": brief.resume.is_some(),
                    "attempt": brief.attempt,
                });
                self.log(run_id, Some(&brief.step), kind::RUNNER, payload);
                true
            }
            Err(e) => self.guard_failed(run_id, &format!("runner: {e}")),
        }
    }

    /// `Factory::unblock_with` under the lock: the click, or a reply of a member on the ticket.
    pub(crate) fn unblock_with(&mut self, run_id: &str, note: Option<&str>) -> Result<(), String> {
        // A refused click adds no note.
        if self.run(run_id)?.run.state != RunState::Blocked {
            return self.checked(run_id, RunEvent::Unblock);
        }
        let note = note.map(str::trim).filter(|n| !n.is_empty());
        let stuck = self.rec(run_id).d.stuck.take();
        // The current limits, and one more round or attempt of the spent cap (REQ-054).
        self.take_limits(run_id);
        let rec = self.rec(run_id);
        let cause = rec.escalation.take().map(|e| e.cause);
        let cap = match cause {
            Some(Cause::ReviewRounds) => Some("review_rounds"),
            Some(Cause::FeedbackRounds) => Some("feedback_rounds"),
            Some(Cause::FixRounds) => Some("fix_rounds"),
            _ => None,
        };
        // A cap that a person raised in the workflow gives its own rounds, and no extra one.
        if let Some(cap) = cap.filter(|c| spent(rec, c)) {
            *rec.c.extra.entry(cap.into()).or_default() += 1;
        }
        rec.c.guard = None;
        for s in rec.steps.values_mut() {
            if let Some(n) = note
                && matches!(s.state, StepState::Running | StepState::Failed)
            {
                s.notes.push(n.into());
            }
            if s.merge_pending {
                s.units.iter_mut().for_each(|u| u.redone = false);
            }
            // A step that spent its attempts or retries gets one more attempt (REQ-052).
            if s.state == StepState::Failed {
                s.state = match s.units.is_empty() {
                    true => StepState::Pending,
                    false => StepState::Running,
                };
                for u in s.units.iter_mut().filter(|u| u.state == StepState::Failed) {
                    *rec.c.extra.entry(format!("attempts:{}", u.id)).or_default() += 1;
                    u.state = StepState::Pending;
                    u.parked = false;
                    u.retry_at = None;
                }
            }
        }
        if let Some(n) = note {
            self.log(run_id, None, kind::NOTE, json!({"note": n, "by": "person"}));
        }
        self.checked(run_id, RunEvent::Unblock)?;
        self.round_after_cap(run_id, note);
        if let Some(stuck) = stuck {
            self.unstick(run_id, stuck, note);
        }
        Ok(())
    }

    /// The one way to stop a run for a person (REQ-053): the agents stop, the run keeps one
    /// record and posts one stop report. `Blocked`, or `Paused` for a budget or max turns. The
    /// questions loop calls it too. `false` when the table refuses the move.
    pub(crate) fn escalate(&mut self, run_id: &str, cause: Cause, lines: &[String]) -> bool {
        let Some(rec) = self.runs.get(run_id) else {
            return false;
        };
        let state = rec.run.state;
        let event = match cause.pauses() {
            true => RunEvent::BudgetStop,
            false => RunEvent::Block,
        };
        if rec.run.apply(event).is_err() {
            let note = json!({"refused": format!("escalate {}", cause.text()), "from": state});
            self.log(run_id, None, kind::NOTE, note);
            return false;
        }
        let record = self.record(run_id, cause, lines);
        // The reason that the run page shows: `stop` for a pause, `blocked` for a block.
        let what = if cause.pauses() { "stop" } else { "blocked" };
        let why = record.lines.first().map_or(cause.text(), String::as_str);
        let note = json!({what: why, "cause": cause, "escalation": record});
        self.log(run_id, None, kind::NOTE, note);
        self.transition(run_id, event);
        self.stop_report(run_id, &record);
        true
    }

    /// The escalation record of the run (REQ-053): at most the 10 last lines.
    pub(crate) fn record(&mut self, run_id: &str, cause: Cause, lines: &[String]) -> Escalation {
        let all: Vec<String> = lines
            .iter()
            .flat_map(|l| l.lines())
            .filter(|l| !l.trim().is_empty())
            // A CI log or a runner error can echo a token: the record goes on the ticket.
            .map(
                |l| match shipyard_store::code::scan_text("log", l).is_empty() {
                    true => l.to_string(),
                    false => "[line hidden: it held a secret]".to_string(),
                },
            )
            .collect();
        let lines = all[all.len().saturating_sub(10)..].to_vec();
        let rec = &self.runs[run_id];
        let [r, x, f] = ["review_rounds", "fix_rounds", "feedback_rounds"].map(|c| cap_of(rec, c));
        let tried = format!(
            "{} review rounds of {}, {} fix rounds of {}, {} feedback rounds of {}, {} failed \
             attempts.",
            r.0,
            r.1,
            x.0,
            x.1,
            f.0,
            f.1,
            rec.c.attempts.values().sum::<u32>(),
        );
        let action = match cause {
            Cause::Budget => "Raise the budget, then resume the run.",
            Cause::MaxTurns => "Resume the run: it gets one more set of turns.",
            Cause::NothingToDeliver => {
                "Reply on the ticket or use Unblock with a message, or close the run as done."
            }
            Cause::ReleaseBase => "Set the base branch of the project, then use Unblock.",
            Cause::NoReviewer => "Name a reviewer in the Automation settings, then use Unblock.",
            Cause::PullRequestClosed => "Comment on the ticket to start a new run.",
            _ => "Reply on the ticket, or use Unblock with a message: the run gets one more round.",
        };
        let rec = self.rec(run_id);
        rec.c.escalations += 1;
        let record = Escalation {
            cause,
            lines,
            tried,
            action: action.into(),
            attempt: rec.c.escalations,
        };
        rec.escalation = Some(record.clone());
        record
    }

    /// The stop report (REQ-058): one ticket comment with the marker, when the tracker takes
    /// comments and `tracker_comment` is on. Else the notice only, with no approval. The key goes
    /// in the log before the send: a restart sends no second report.
    pub(crate) fn stop_report(&mut self, run_id: &str, r: &Escalation) {
        let key = format!("{run_id}:{:?}:{}", r.cause, r.attempt);
        let rec = &self.runs[run_id];
        if rec.key.starts_with(TICKETLESS_PREFIX) {
            return;
        }
        let reported = self.log.run(run_id).unwrap_or_default().iter().any(|e| {
            e.kind == kind::NOTE && e.payload["stop_report"].as_str() == Some(key.as_str())
        });
        let Some(p) = self.project_of(run_id) else {
            return;
        };
        let lines = match r.lines.is_empty() {
            true => String::new(),
            false => format!("\nLast lines:\n\n```text\n{}\n```\n", r.lines.join("\n")),
        };
        let body = format!(
            "<!-- shipyard:stop {run_id} -->\nShipyard stopped the run run:{run_id}: {}.\n{lines}\n\
             Tried: {}\n\nAction: {}\n",
            r.cause.text(),
            r.tried,
            r.action
        );
        let write = Write::Comment {
            key: rec.key.clone(),
            body: shipyard_core::delivery::clean_outgoing(&body),
        };
        if reported || !p.writer.can_comment() || !self.may_send(run_id, &write) {
            return;
        }
        self.log(run_id, None, kind::NOTE, json!({"stop_report": key}));
        self.send(run_id, &write, None);
    }

    /// A guard failed before an attempt (REQ-056): the run waits in `RetryQueued` with the
    /// backoff, and uses no retry. 30 min of failed guards escalates, whatever the causes,
    /// except a project that is not open. Always `false`: the run stopped.
    pub(crate) fn guard_failed(&mut self, run_id: &str, why: &str) -> bool {
        let now = self.now_s();
        let open = self.project_of(run_id).is_some();
        let c = &mut self.rec(run_id).c;
        let g = c.guard.get_or_insert_with(|| GuardFail {
            why: String::new(),
            since: now,
            retry_at: now,
            tries: 0,
        });
        g.why = why.into();
        g.tries += 1;
        g.retry_at = now + run::retry_delay(g.tries).as_secs();
        let (tries, long) = (g.tries, now - g.since >= run::GUARD_ESCALATE.as_secs());
        if open && long {
            c.guard = None;
            self.escalate(run_id, Cause::Guard, &[why.into()]);
            return false;
        }
        self.log(
            run_id,
            None,
            kind::NOTE,
            json!({"guard": why, "tries": tries}),
        );
        self.transition(run_id, RunEvent::Retry);
        false
    }

    /// One more fix round (REQ-054): `false` when the cap is spent, and the run escalated.
    pub(crate) fn take_fix_round(&mut self, run_id: &str, lines: &[String]) -> bool {
        if spent(&self.runs[run_id], "fix_rounds") {
            self.escalate(run_id, Cause::FixRounds, lines);
            return false;
        }
        self.rec(run_id).c.fix_rounds += 1;
        true
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
        p.push_str(NOTICE);
        if let Some(project) = self.projects.get(&rec.project) {
            p.push_str(&project.languages.brief_text());
        }
        if let Some(skill) = &step.skill {
            p.push_str(&format!("Use the skill `{skill}`.\n\n"));
        }
        let ticket = format!("{}\n\n{}", rec.title, rec.description);
        let source = format!("ticket {}", rec.key);
        p.push_str(&format!(
            "Ticket {}:\n{}\n",
            rec.key,
            fence(&source, &ticket)
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
        // One active run for each ticket. The check and the insert share one lock, so two
        // starts of the same ticket (a click, a tick) cannot both pass.
        if self.runs.values().any(|r| {
            !r.run.state.is_final() && r.project == req.project && r.key == req.ticket.item.key
        }) {
            return Err(format!("a run is active on {}", req.ticket.item.key));
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
            .workflow(wf_id)
            .ok_or_else(|| format!("no workflow `{wf_id}`"))?;
        let ms = self.clock.now().as_millis() as u64;
        self.seq += 1;
        let id = ulid(ms, self.seq);
        let mut rec = RunRec {
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
            extra_tokens: 0,
            extra_turns: 0,
            alerted: false,
            rounds: 0,
            questions: Vec::new(),
            d: Delivered::default(),
            messages: Vec::new(),
            by: self.actors.get(&req.project).cloned(),
            c: Counts::default(),
            escalation: None,
        };
        let base = item
            .key
            .starts_with(TICKETLESS_PREFIX)
            .then(|| item.labels.iter().find_map(|l| l.strip_prefix(BASE_LABEL)))
            .flatten()
            .map(str::to_string);
        if let Some(b) = &base {
            rec.d.base = Some(b.clone());
        }
        let payload = json!({
            "ticket": format!("wi:{}", item.key), "workflow": format!("wf:{}", rec.wf.id),
            "machine": req.machine, "stamped": req.stamped,
        });
        self.runs.insert(id.clone(), rec);
        if let (Some(b), Some(p)) = (&base, self.projects.get(&req.project)) {
            p.workspaces.set_base(&id, b);
        }
        self.add_member(&id, 0, 0.0);
        self.log(&id, None, kind::NOTE, payload);
        self.transition(&id, RunEvent::Claim);
        self.transition(&id, RunEvent::Start);
        Ok(())
    }
}

/// Stop the agents of a run that left the clock states. Each keeps its session. The ids of the
/// units that stopped.
fn park(rec: &mut RunRec) -> Vec<String> {
    let mut stopped = Vec::new();
    for u in rec.steps.values_mut().flat_map(|s| &mut s.units) {
        if let Some(mut a) = u.agent.take() {
            a.cancel();
            u.state = StepState::Pending;
            u.parked = true;
            stopped.push(u.id.clone());
        }
    }
    stopped
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
                stop,
            } => inner.on_comment(key, comment, answers.as_deref(), stop.as_deref()),
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

    #[test]
    fn a_tier_effort_is_read_for_the_levels_the_engine_knows() {
        let t = Tiers(BTreeMap::from([(
            "codex".to_string(),
            BTreeMap::from([
                ("top:effort".to_string(), "high".to_string()),
                ("mid:effort".to_string(), "minimal".to_string()),
            ]),
        )]));
        assert_eq!(t.effort("codex", "top"), Some(Effort::High));
        assert_eq!(t.effort("codex", "mid"), None);
        assert_eq!(t.effort("codex", "small"), None);
        assert_eq!(t.effort("claude", "top"), None);
    }
}
