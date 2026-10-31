//! The factory host (spec `factory` T018, `delivery`, `questions-loop`): the one `Factory` of this
//! machine, its ports over the real crates, the agent tools endpoint, the pump loop, the events and
//! the data that the Factory views read.
//!
//! - [`FactoryHost`] holds the `Factory`. It is the `Dispatch` of every sync engine, so a claimed
//!   ticket becomes a run. Each `SyncEvent::Tick` pumps the factory and tells the views.
//! - [`RunnerAgents`] starts the runner CLIs. Each (run, step) gets a scratch folder under
//!   `<app data>/agents/` (never in a worktree) and its own MCP session on the loopback endpoint.
//! - [`attach`] gives the factory the ports of one project. It runs when the sync engine of the
//!   project is made or changes, so a new file or a new connection applies at once.
//! - [`FactoryHost::tick`] is the body of the background loop: pump, release the claims of the
//!   runs that ended, tell the views what changed.
//!
//! A command is a plain function over `&AppState`. The command module of the feature wraps it.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, SystemTime};

use serde::Serialize;
use shipyard_agents::runner::{self, McpEntry, Mode as RunMode, Recv, RunSpec};
use shipyard_core::delivery::{Lane, lane};
use shipyard_core::pickup::{ActiveRun, SyncEvent};
use shipyard_core::project::ProjectFile;
use shipyard_core::run::{RunEvent, RunState};
use shipyard_core::workflow::{DEFAULT_ROLES, Effort, Mode, StepState, Workflow};
use shipyard_engine::ports::{
    AgentEvent, AgentRun, Agents, Brief, Dispatch, PortResult, StartRequest,
};
use shipyard_engine::run_engine::{Config, Factory, Project, RunInfo, Tiers};
use shipyard_git::code::FileDiff;
use shipyard_mcp::proxy::Proxy;
use shipyard_mcp::server::Server;
use shipyard_mcp::session::{Binding, Sessions};
use shipyard_mcp::tools::agent::AgentEvents;
use shipyard_mcp::transport::Http;
use shipyard_secrets::Secret;
use shipyard_store::automation_file::{AutomationRead, read_automation, set_budget};
use shipyard_store::factory_files::{
    FileIssue, Loaded, ROLES_DIR, Role, WORKFLOWS_DIR, default_roles, load, parse_role,
    parse_workflow, seed,
};
use shipyard_store::mirror::Mirror;
use shipyard_store::project::{FileRead, read_project_file, write_atomic};
use shipyard_store::run_log::RunLog;
use specta::Type;

use crate::commands::sync::{Active, active, ensure, tracker_source};
use crate::commands::{Api, AppState, Res, err};
use crate::delivery::{Folders, ForgePulls, PrRowView, ProjectWriter, pr_rows};
use crate::sync::Plan;

/// The run log file in the app data folder.
pub const LOG_FILE: &str = "runs.sqlite";
/// The runner of the factory (`q:Q-024`: Claude Code first). Its id is the prefix of a run branch.
pub const RUNNER: &str = "claude";
/// The views read again on these events. The payload of each is [`Ping`].
pub const RUN_EVENT: &str = "factory-run";
pub const APPROVAL_EVENT: &str = "factory-approval";
pub const QUESTION_EVENT: &str = "factory-question";
pub const MESSAGE_EVENT: &str = "factory-message";
/// How often the loop pumps the factory.
pub const PUMP_EVERY: Duration = Duration::from_secs(1);
/// The ticket workflow when a ticket has no `wf:` label and the project names none.
const DEFAULT_WORKFLOW: &str = "feature";
/// The longest workflow or role file that a view can save.
const MAX_FILE: usize = 64 * 1024;
const MAX_PAGE: u32 = 500;
/// The longest run diff, in bytes. The view says when a file is cut.
const MAX_RUN_DIFF: usize = 256 * 1024;

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ---------------------------------------------------------------- events

/// What an event says: the run, and the item of the run that changed (an approval id, a question
/// id, a message number). The view reads the data again.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Ping {
    pub run: String,
    pub id: String,
}

type Emitter = Box<dyn Fn(&str, &Ping) + Send + Sync>;

/// What the last `publish` saw, to find what changed.
#[derive(Default)]
struct Seen {
    runs: BTreeMap<String, String>,
    approvals: BTreeSet<u64>,
    questions: BTreeSet<(String, String)>,
    messages: BTreeMap<String, usize>,
}

// ---------------------------------------------------------------- the host

/// The name, size and modified time of each workflow and role file.
type Stamp = Vec<(String, u64, Option<SystemTime>)>;

/// No file watcher: the files are small and few, so the loop reads their metadata.
fn files_stamp(root: &Path) -> Stamp {
    let mut out = Vec::new();
    for dir in [WORKFLOWS_DIR, ROLES_DIR] {
        let Ok(files) = std::fs::read_dir(root.join(dir)) else {
            continue;
        };
        for f in files.flatten() {
            if let Ok(m) = f.metadata() {
                let name = format!("{dir}/{}", f.file_name().to_string_lossy());
                out.push((name, m.len(), m.modified().ok()));
            }
        }
    }
    out.sort();
    out
}

/// The address and the sessions of the agent tools endpoint, once it listens.
pub struct Endpoint {
    pub sessions: Arc<Sessions>,
    pub url: String,
}

pub struct FactoryHost {
    pub factory: Arc<Factory>,
    /// A second connection to the run log file, for the pages of the views.
    log: Mutex<RunLog>,
    /// Why the run log file could not open. The factory then runs on a scratch log.
    degraded: Option<String>,
    endpoint: Arc<OnceLock<Endpoint>>,
    http: Mutex<Option<Http>>,
    emit: OnceLock<Emitter>,
    seen: Mutex<Option<Seen>>,
    /// The last valid workflows and roles of each project (`load` keeps them across a bad edit).
    loaded: Mutex<HashMap<String, Loaded>>,
    mirrors: Mutex<HashMap<String, Arc<Mutex<Mirror>>>>,
    /// What `.shipyard/workflows` and `.shipyard/roles` looked like when each project took its
    /// files. The loop compares it with the disk (`reload_changed`).
    stamps: Mutex<HashMap<String, Stamp>>,
}

impl FactoryHost {
    /// `agents`: the runner port. `None` is the real one ([`RunnerAgents`]); a test gives a fake.
    pub fn new(dir: &Path, tiers: Tiers, agents: Option<Arc<dyn Agents>>) -> Self {
        let endpoint = Arc::new(OnceLock::new());
        let agents = agents.unwrap_or_else(|| {
            Arc::new(RunnerAgents::new(dir, endpoint.clone())) as Arc<dyn Agents>
        });
        let path = dir.join(LOG_FILE);
        // A layout that this build does not know is an error, never a reset. The factory then runs
        // on a scratch log: nothing is written over the file, and the writer and the reader of
        // the views share this one file. `run_log_degraded` tells the person.
        let (write, read, degraded) = match (RunLog::open(&path), RunLog::open(&path)) {
            (Ok(w), Ok(r)) => (w, r, None),
            (Err(x), _) | (_, Err(x)) => {
                eprintln!("run log {}: {x}", path.display());
                let scratch = std::env::temp_dir()
                    .join(format!("shipyard-run-log-{}.sqlite", std::process::id()));
                let _ = std::fs::remove_file(&scratch);
                let (w, r) = match (RunLog::open(&scratch), RunLog::open(&scratch)) {
                    (Ok(w), Ok(r)) => (w, r),
                    // No folder to write: two logs in memory, the views then see no page.
                    _ => {
                        let mem = || RunLog::open_memory().expect("an in-memory run log");
                        (mem(), mem())
                    }
                };
                (w, r, Some(x.to_string()))
            }
        };
        let cfg = Config {
            runner: RUNNER.into(),
            tiers,
            ..Config::default()
        };
        let factory = Arc::new(Factory::new(
            cfg,
            agents,
            Arc::new(shipyard_engine::SystemClock),
            write,
        ));
        // A crash leaves the scratch folder of an agent behind: it holds a dead token.
        let live = factory
            .active_runs()
            .into_iter()
            .map(|r| r.run_id)
            .collect();
        sweep_scratch(dir, &live);
        Self {
            factory,
            log: Mutex::new(read),
            degraded,
            endpoint,
            http: Mutex::new(None),
            emit: OnceLock::new(),
            seen: Mutex::new(None),
            loaded: Mutex::new(HashMap::new()),
            mirrors: Mutex::new(HashMap::new()),
            stamps: Mutex::new(HashMap::new()),
        }
    }

    /// The reason that the run log file did not open, or `None` when it did.
    pub fn degraded(&self) -> Option<&str> {
        self.degraded.as_deref()
    }

    pub fn log(&self) -> MutexGuard<'_, RunLog> {
        lock(&self.log)
    }

    /// Serve the agent tools on `127.0.0.1` (`factory` REQ-016, REQ-037). The factory answers the
    /// tools; `proxy` adds the tools of the enabled MCP servers. Call it once, at app start.
    pub fn start_mcp(&self, proxy: Arc<Proxy>) -> io::Result<()> {
        if self.endpoint.get().is_some() {
            return Ok(());
        }
        let events: Arc<dyn AgentEvents> = self.factory.clone();
        let server = Arc::new(Server::new(events).with_proxy(proxy));
        let http = Http::start(server.clone(), 0)?;
        let _ = self.endpoint.set(Endpoint {
            sessions: server.sessions().clone(),
            url: http.url(),
        });
        *lock(&self.http) = Some(http);
        Ok(())
    }

    /// The URL of the endpoint, once it listens.
    pub fn mcp_url(&self) -> Option<String> {
        self.endpoint.get().map(|e| e.url.clone())
    }

    /// Called with an event name and a [`Ping`] when a run, an approval, a question or a message
    /// changes. Only the first call counts.
    pub fn on_event(&self, f: impl Fn(&str, &Ping) + Send + Sync + 'static) {
        let _ = self.emit.set(Box::new(f));
    }

    /// Compare the factory with what the last call saw and send one event for each change. The
    /// first call only learns the state: the views read on mount.
    pub fn publish(&self) {
        let runs = self.factory.runs();
        let approvals = self.factory.approvals();
        let questions = self.factory.questions();
        let messages = self.factory.messages();

        let mut now = Seen::default();
        for r in &runs {
            now.runs
                .insert(r.id.clone(), serde_json::to_string(r).unwrap_or_default());
        }
        now.approvals = approvals.iter().map(|a| a.id).collect();
        now.questions = questions
            .iter()
            .map(|(r, q)| (r.clone(), q.id.clone()))
            .collect();
        for (run, _) in &messages {
            *now.messages.entry(run.clone()).or_default() += 1;
        }
        let mut pings: Vec<(&str, Ping)> = Vec::new();
        let mut seen = lock(&self.seen);
        if let Some(old) = seen.as_ref() {
            let ping = |run: &str, id: String| Ping {
                run: run.into(),
                id,
            };
            for (id, fp) in &now.runs {
                if old.runs.get(id) != Some(fp) {
                    pings.push((RUN_EVENT, ping(id, String::new())));
                }
            }
            for a in approvals.iter().filter(|a| !old.approvals.contains(&a.id)) {
                pings.push((APPROVAL_EVENT, ping(&a.run, a.id.to_string())));
            }
            for k in now.questions.difference(&old.questions) {
                pings.push((QUESTION_EVENT, ping(&k.0, k.1.clone())));
            }
            for (run, n) in &now.messages {
                let before = old.messages.get(run).copied().unwrap_or(0);
                for i in before..*n {
                    pings.push((MESSAGE_EVENT, ping(run, i.to_string())));
                }
            }
        }
        *seen = Some(now);
        drop(seen);
        if let Some(emit) = self.emit.get() {
            for (name, p) in &pings {
                emit(name, p);
            }
        }
    }

    /// One turn of the loop: pump, release the claim of each run that ended, report the errors
    /// that the factory kept, tell the views. `release(project, ticket key)` frees the claim.
    pub fn tick(&self, release: impl Fn(&str, &str)) {
        self.factory.pump();
        for (project, key) in self.factory.take_ended() {
            release(&project, &key);
        }
        for e in self.factory.take_errors() {
            eprintln!("factory: {e}");
        }
        self.publish();
    }

    fn last_loaded(&self, project: &str) -> Loaded {
        lock(&self.loaded).get(project).cloned().unwrap_or_default()
    }

    fn mirror_of(&self, s: &AppState, project: &str) -> Res<Arc<Mutex<Mirror>>> {
        let mut map = lock(&self.mirrors);
        if let Some(m) = map.get(project) {
            return Ok(m.clone());
        }
        let m = Arc::new(Mutex::new(s.sync.mirror().map_err(err)?));
        map.insert(project.into(), m.clone());
        Ok(m)
    }
}

/// The index is read again this often (in turns of the loop) while a run is active: an agent that
/// calls `read_ref` sees the files that a person just saved.
const REINDEX_EVERY: u32 = 30;

/// Take the workflow and role files of the active project again when a file changed on disk (a
/// person edited it in an editor, or a branch switch brought another one).
fn reload_changed(s: &AppState) {
    let Ok(Some(a)) = active(s) else { return };
    if files_changed(s, &a.entry.id, Path::new(&a.entry.path)) {
        let _ = ensure(s);
    }
}

fn files_changed(s: &AppState, id: &str, root: &Path) -> bool {
    lock(&s.factory.stamps)
        .get(id)
        .is_some_and(|old| *old != files_stamp(root))
}

/// Bring up to date the ref index of each project that has an active run.
fn reindex_active(s: &AppState) {
    let projects: BTreeSet<String> = s
        .factory
        .factory
        .active_runs()
        .into_iter()
        .map(|r| r.project)
        .collect();
    let Ok(registry) = s.registry() else { return };
    let entries: Vec<_> = projects
        .iter()
        .filter_map(|id| registry.get(id).cloned())
        .collect();
    drop(registry);
    for entry in entries {
        let _ = crate::commands::refs::reindex_repo(s, &entry);
    }
}

/// The background loop (`PUMP_EVERY`): one thread for the life of the app. A run that ends frees
/// the claim of its ticket in the sync engine of its project.
pub fn spawn_loop(app: tauri::AppHandle) {
    use tauri::Manager;
    std::thread::spawn(move || {
        let mut turn = 0u32;
        loop {
            std::thread::sleep(PUMP_EVERY);
            turn = turn.wrapping_add(1);
            let s = app.state::<AppState>();
            reload_changed(&s);
            if turn.is_multiple_of(REINDEX_EVERY) {
                reindex_active(&s);
            }
            s.factory.tick(|project, key| {
                if let Some(r) = s.sync.running(project)
                    && let Err(e) = r.with(|e| e.release(key).map(|_| ()))
                {
                    eprintln!("factory: release {key}: {e}");
                }
            });
            if turn.is_multiple_of(crate::pr_agent::AUTO_EVERY) {
                crate::pr_agent::auto_tick(&app);
            }
        }
    });
}

/// The factory is the `Dispatch` of each sync engine. The host adds the events for the views.
impl FactoryHost {
    /// A person sends a pull request back with a text: a feedback round on the run that holds it.
    pub fn send_back(&self, number: u64, text: &str) {
        self.factory.send_back(number, text);
        self.publish();
    }
}

impl Dispatch for FactoryHost {
    fn kill_switch(&self) -> bool {
        self.factory.kill_switch()
    }

    fn active_runs(&self) -> Vec<ActiveRun> {
        self.factory.active_runs()
    }

    fn reserved(&self) -> usize {
        crate::pr_agent::running_count()
    }

    fn start(&self, request: &StartRequest) -> Result<(), String> {
        let out = self.factory.start(request);
        self.publish();
        out
    }

    fn stop(&self, run_id: &str, reason: &str) -> Result<(), String> {
        let out = self.factory.stop(run_id, reason);
        self.publish();
        out
    }

    fn event(&self, event: &SyncEvent) -> Result<(), String> {
        let out = self.factory.event(event);
        self.publish();
        out
    }
}

// ---------------------------------------------------------------- the runner port

/// The Shipyard tools of a step as the CLI names them: `mcp__shipyard__<tool>`.
fn cli_tools(tools: &[String]) -> Vec<String> {
    tools
        .iter()
        .map(|t| format!("mcp__shipyard__{t}"))
        .collect()
}

fn effort_text(e: Effort) -> &'static str {
    match e {
        Effort::Low => "low",
        Effort::Medium => "medium",
        Effort::High => "high",
        Effort::Xhigh => "xhigh",
        Effort::Max => "max",
    }
}

/// An id that becomes a folder name: plain characters, not `.`-led or `-`-led.
fn plain(id: &str) -> bool {
    !id.is_empty()
        && !id.starts_with(['.', '-'])
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

/// The path of the `shipyard` binary that the bridge entry of a CLI starts. It sits next to the
/// app binary: the release build ships it as the `externalBin` sidecar (`tauri.release.conf.json`).
/// A dev build has none and falls back to `shipyard` on the `PATH`.
pub fn cli_path() -> PathBuf {
    let name = if cfg!(windows) {
        "shipyard.exe"
    } else {
        "shipyard"
    };
    std::env::current_exe()
        .ok()
        .and_then(|p| Some(p.parent()?.join(name)))
        .filter(|p| p.exists())
        .unwrap_or_else(|| name.into())
}

/// Remove each folder `<app data>/agents/<run>` of a run that is not live. No agent process
/// survives a start, so a folder of a run that ended or is gone is left over from a crash.
fn sweep_scratch(data: &Path, live: &BTreeSet<String>) {
    let Ok(runs) = std::fs::read_dir(data.join("agents")) else {
        return;
    };
    for run in runs.flatten() {
        let dead = run.file_name().to_str().is_none_or(|n| !live.contains(n));
        if dead && run.path().is_dir() {
            let _ = std::fs::remove_dir_all(run.path());
        }
    }
}

/// One agent process, as the factory reads it.
struct Proc(runner::Run);

impl AgentRun for Proc {
    fn next(&mut self) -> Option<AgentEvent> {
        match self.0.recv_timeout(Duration::ZERO) {
            Recv::Event(e) => Some(e),
            Recv::Idle | Recv::Done => None,
        }
    }

    fn cancel(&mut self) {
        self.0.cancel();
    }
}

/// Starts the runner CLIs (`shipyard_agents::runner`). Each start opens an MCP session for its
/// step and ends it in [`Agents::end`] (`factory` REQ-016, REQ-037).
pub struct RunnerAgents {
    data: PathBuf,
    endpoint: Arc<OnceLock<Endpoint>>,
    exe: PathBuf,
    /// Run this program in place of the CLI. A test sets it.
    pub program: Option<PathBuf>,
}

impl RunnerAgents {
    pub fn new(data: &Path, endpoint: Arc<OnceLock<Endpoint>>) -> Self {
        Self {
            data: data.into(),
            endpoint,
            exe: cli_path(),
            program: None,
        }
    }

    /// `<app data>/agents/<run>/<step>`: the folder of one unit. It is never inside a worktree.
    fn scratch(&self, run: &str, step: &str) -> PortResult<PathBuf> {
        if !plain(run) || !plain(step) {
            return Err(format!("`{run}/{step}` is not a plain run and step id"));
        }
        Ok(self.data.join("agents").join(run).join(step))
    }
}

impl Agents for RunnerAgents {
    fn start(&self, b: &Brief) -> PortResult<Box<dyn AgentRun>> {
        let runner =
            runner::runner(&b.runner).ok_or_else(|| format!("unknown runner `{}`", b.runner))?;
        let endpoint = self
            .endpoint
            .get()
            .ok_or("the agent tools endpoint is not running")?;
        let scratch = self.scratch(&b.run, &b.step)?;
        std::fs::create_dir_all(&scratch).map_err(err)?;
        let (token, _) = endpoint
            .sessions
            .open(Binding {
                run: b.run.clone(),
                step: b.step.clone(),
                tools: b.tools.clone(),
            })
            .map_err(|x| format!("no token for the agent: {x}"))?;
        let started = (|| {
            let entry = McpEntry::shipyard(&*runner, &self.exe, &endpoint.url, &Secret::new(token))
                .map_err(err)?;
            let mut spec = RunSpec::new(&b.prompt, &b.dir, &scratch);
            spec.model = b.model.clone();
            spec.effort = b.effort.map(|e| effort_text(e).to_string());
            spec.mode = match b.mode {
                Mode::Plan => RunMode::Plan,
                Mode::Auto => RunMode::Auto,
            };
            spec.allowed_tools = cli_tools(&b.tools);
            spec.mcp = vec![entry];
            spec.resume = b.resume.clone();
            spec.program = self.program.clone();
            runner::start(&*runner, spec).map_err(err)
        })();
        match started {
            Ok(run) => Ok(Box::new(Proc(run))),
            Err(x) => {
                // No process runs: no token and no folder stay.
                self.end(&b.run, &b.step);
                Err(x)
            }
        }
    }

    fn end(&self, run: &str, step: &str) {
        if let Some(e) = self.endpoint.get() {
            e.sessions.revoke_step(run, step);
        }
        if let Ok(dir) = self.scratch(run, step) {
            let _ = std::fs::remove_dir_all(&dir);
            // The run folder goes when it holds no other step.
            if let Some(parent) = dir.parent() {
                let _ = std::fs::remove_dir(parent);
            }
        }
    }
}

// ---------------------------------------------------------------- one project

/// Give the factory the ports of `a`: its files, its mirror, its connections. Call it each time
/// the sync engine of the project is made or changes. Seeds the workflows and roles on the first use.
pub(crate) fn attach(s: &AppState, a: &Active, plan: &Plan) -> Res<()> {
    let root = Path::new(&a.entry.path);
    let id = a.entry.id.clone();
    let host = &s.factory;
    seed(root).map_err(err)?;
    // Before the read: an edit during the read shows as a change at the next turn.
    lock(&host.stamps).insert(id.clone(), files_stamp(root));
    let files = load(root, &host.last_loaded(&id)).map_err(err)?;
    lock(&host.loaded).insert(id.clone(), files.clone());
    let file = match read_project_file(root).map_err(err)? {
        FileRead::Valid(f) => f,
        _ => ProjectFile::new(&a.entry.name, &a.entry.key),
    };
    let folders = Arc::new(Folders {
        root: root.into(),
        data: s.dir.clone(),
        project: id.clone(),
        runner: RUNNER.into(),
        declared_base: None,
        specs: file.path("specs").to_string(),
        secrets: {
            let mut all = s.agents.secret_values();
            all.extend(s.connections.secret_values());
            all
        },
    });
    let writer = ProjectWriter {
        conns: s.connections.clone(),
        tracker: plan.tracker.clone(),
        forge: plan.forge.clone(),
        folders: folders.clone(),
    };
    host.factory.set_project(
        &id,
        Project {
            automation: plan.automation.clone(),
            files,
            default_workflow: file
                .default_workflow
                .clone()
                .unwrap_or_else(|| DEFAULT_WORKFLOW.into()),
            root: root.into(),
            source: plan.tracker_source(),
            mirror: host.mirror_of(s, &id)?,
            writer: Arc::new(writer),
            workspaces: folders.clone(),
            git: folders,
            pulls: Arc::new(ForgePulls {
                conns: s.connections.clone(),
                forge: plan.forge.clone(),
                root: root.into(),
            }),
            forge: plan
                .forge
                .as_ref()
                .map_or_else(|| "none".into(), |(id, _)| id.clone()),
            gates: file.gates.clone(),
            base: None,
            reviewers: Vec::new(),
            // `read_ref` of a run reads the index of its own project.
            refs: Some(s.index_of(&id)?),
        },
    );
    Ok(())
}

// ---------------------------------------------------------------- views

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UnitView {
    pub id: String,
    pub state: StepState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StepView {
    pub id: String,
    pub state: StepState,
    pub units: Vec<UnitView>,
}

/// A P0 or P1 finding that blocks the pull request (the Inbox card).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FindingView {
    /// `P0`, `P1` or `P2`.
    pub severity: String,
    pub path: Option<String>,
    pub line: Option<u32>,
    pub text: String,
}

/// A run with what a card needs (`factory` REQ-027, REQ-038).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RunView {
    pub id: String,
    /// `run:<id>`.
    pub reference: String,
    pub project: String,
    /// The ticket.
    pub key: String,
    pub title: String,
    pub url: String,
    pub workflow: String,
    pub state: RunState,
    /// The state that a side state returns to.
    pub return_to: Option<RunState>,
    pub lane: Lane,
    /// The pull request of the run, from the mirror.
    pub pr: Option<PrRowView>,
    pub cost_usd: f64,
    pub tokens: u32,
    pub turns: u32,
    pub budget_usd: f64,
    pub steps: Vec<StepView>,
    pub findings: Vec<FindingView>,
    pub worktree_kept: Option<String>,
    pub open_questions: u32,
    pub approvals: u32,
}

fn run_view(r: &RunInfo, pulls: &[PrRowView], questions: u32, approvals: u32) -> RunView {
    let pr =
        r.pr.and_then(|n| pulls.iter().find(|p| u64::from(p.number) == n).cloned());
    let signal = pr.as_ref().map(|p| shipyard_core::delivery::PrSignal {
        ci: match p.ci.as_str() {
            "passing" => shipyard_core::delivery::Ci::Passing,
            "failing" => shipyard_core::delivery::Ci::Failing,
            _ => shipyard_core::delivery::Ci::Pending,
        },
        changes_requested: p.review == "changes_requested",
        draft: p.draft,
    });
    RunView {
        id: r.id.clone(),
        reference: format!("run:{}", r.id),
        project: r.project.clone(),
        key: r.key.clone(),
        title: r.title.clone(),
        url: r.url.clone(),
        workflow: r.workflow.clone(),
        state: r.run.state,
        return_to: r.run.return_to,
        lane: lane(r.run.state, signal.as_ref()),
        pr,
        cost_usd: r.cost_usd,
        tokens: u32::try_from(r.tokens).unwrap_or(u32::MAX),
        turns: r.turns,
        budget_usd: r.budget_usd,
        steps: r
            .steps
            .iter()
            .map(|s| StepView {
                id: s.id.clone(),
                state: s.state,
                units: s
                    .units
                    .iter()
                    .map(|(id, state)| UnitView {
                        id: id.clone(),
                        state: *state,
                    })
                    .collect(),
            })
            .collect(),
        findings: r
            .findings
            .iter()
            .map(|f| FindingView {
                severity: format!("{:?}", f.severity),
                path: f.path.clone(),
                line: f.line,
                text: f.text.clone(),
            })
            .collect(),
        worktree_kept: r.worktree_kept.clone(),
        open_questions: questions,
        approvals,
    }
}

/// The runs of the active project, newest first, each in its lane.
pub fn runs(s: &AppState) -> Res<Vec<RunView>> {
    let Some(a) = active(s)? else {
        return Ok(Vec::new());
    };
    let pulls = pr_rows(s)?;
    let f = &s.factory.factory;
    let (questions, approvals) = (f.questions(), f.approvals());
    let mut out: Vec<RunView> = f
        .runs()
        .iter()
        .filter(|r| r.project == a.entry.id)
        .map(|r| {
            let open = questions
                .iter()
                .filter(|(run, q)| {
                    *run == r.id && q.state == shipyard_core::question::QuestionState::Open
                })
                .count();
            let waiting = approvals.iter().filter(|ap| ap.run == r.id).count();
            run_view(r, &pulls, open as u32, waiting as u32)
        })
        .collect();
    out.reverse();
    Ok(out)
}

pub fn run_get(s: &AppState, run: &str) -> Res<Option<RunView>> {
    Ok(runs(s)?.into_iter().find(|r| r.id == run))
}

/// One event of the run log. `payload` is JSON text.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RunLogEvent {
    pub id: u32,
    pub step: Option<String>,
    pub kind: String,
    pub payload: String,
    /// Unix milliseconds.
    pub ts: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RunLogPage {
    pub events: Vec<RunLogEvent>,
    /// Pass it as `after` for the next page.
    pub last: u32,
    pub more: bool,
}

/// A page of the run log, oldest first, after the event `after` (`0`: from the start).
pub fn run_log(s: &AppState, run: &str, after: u32, limit: u32) -> Res<RunLogPage> {
    if !matches!(
        shipyard_core::refs::parse(&format!("run:{run}")),
        Some(shipyard_core::refs::Ref::Run { step: None, .. })
    ) {
        return Err(format!("`{run}` is not a run id"));
    }
    let limit = limit.clamp(1, MAX_PAGE) as usize;
    let mut events = s
        .factory
        .log()
        .page(run, i64::from(after), limit + 1)
        .map_err(err)?;
    let more = events.len() > limit;
    events.truncate(limit);
    let last = events.last().map_or(after, |e| e.id as u32);
    Ok(RunLogPage {
        events: events
            .into_iter()
            .map(|e| RunLogEvent {
                id: e.id as u32,
                step: e.step,
                kind: e.kind,
                payload: e.payload.to_string(),
                ts: e.ts as f64,
            })
            .collect(),
        last,
        more,
    })
}

/// One agent session: a step, or a child of a step, that started (`factory` REQ-031).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub run: String,
    /// The ticket.
    pub key: String,
    pub step: String,
    pub runner: String,
    pub model: Option<String>,
    pub state: StepState,
    pub tokens: u32,
    pub cost_usd: f64,
    /// The pull request of an agent review. A review is no run: the stop of a session uses it.
    pub pull: Option<u32>,
}

/// The live sessions and the latest ended ones of the active project, newest first. The running
/// agent reviews come first (`agent-pr` REQ-008).
pub fn sessions(s: &AppState) -> Res<Vec<SessionView>> {
    let Some(a) = active(s)? else {
        return Ok(Vec::new());
    };
    let runs = s
        .factory
        .factory
        .sessions()
        .into_iter()
        .filter(|x| x.project == a.entry.id)
        .map(|x| SessionView {
            run: x.run,
            key: x.key,
            step: x.step,
            runner: x.runner,
            model: x.model,
            state: x.state,
            tokens: u32::try_from(x.tokens).unwrap_or(u32::MAX),
            cost_usd: x.cost_usd,
            pull: None,
        });
    Ok(crate::pr_agent::sessions(&a.entry.id)
        .into_iter()
        .chain(runs)
        .collect())
}

/// Tokens and money of a day or a member, with its budget (`null`: none).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SpendView {
    /// A UTC day `YYYY-MM-DD`, or a member name (`""`: no assignee).
    pub key: String,
    pub tokens: u32,
    pub usd: f64,
    pub budget: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RunSpendView {
    pub run: String,
    /// The ticket.
    pub key: String,
    pub tokens: u32,
    pub usd: f64,
    /// The budget of the run.
    pub budget: Option<f64>,
    /// The model requests of the run: each turn of an agent is one.
    pub iterations: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UsageView {
    pub runs: Vec<RunSpendView>,
    /// Newest day first.
    pub days: Vec<SpendView>,
    pub members: Vec<SpendView>,
}

fn spend_view(x: shipyard_engine::usage::Spend) -> SpendView {
    SpendView {
        key: x.key,
        tokens: u32::try_from(x.tokens).unwrap_or(u32::MAX),
        usd: x.usd,
        budget: x.budget,
    }
}

/// Usage of the active project per run, per UTC day and per member (`factory` REQ-032).
pub fn usage(s: &AppState) -> Res<UsageView> {
    let Some(a) = active(s)? else {
        return Ok(UsageView {
            runs: Vec::new(),
            days: Vec::new(),
            members: Vec::new(),
        });
    };
    let f = &s.factory.factory;
    let (days, members) = f.usage(&a.entry.id);
    let mut runs: Vec<RunSpendView> = f
        .runs()
        .into_iter()
        .filter(|r| r.project == a.entry.id)
        .map(|r| RunSpendView {
            iterations: u32::try_from(f.requests(&r.id).len()).unwrap_or(u32::MAX),
            run: r.id,
            key: r.key,
            tokens: u32::try_from(r.tokens).unwrap_or(u32::MAX),
            usd: r.cost_usd,
            budget: Some(r.budget_usd),
        })
        .collect();
    runs.reverse();
    Ok(UsageView {
        runs,
        days: days.into_iter().map(spend_view).collect(),
        members: members.into_iter().map(spend_view).collect(),
    })
}

/// Set a budget in `.shipyard/automation.yaml`, or clear it (`usd` is `None`). `scope` is `day`
/// (key: a UTC day or `*`) or `member` (key: a name or `*`). The engine counts it at once.
pub fn budget_save(s: &AppState, scope: &str, key: &str, usd: Option<f64>) -> Res<()> {
    let (id, root) = root_of(s)?;
    set_budget(&root, scope, key, usd).map_err(err)?;
    if let AutomationRead::Valid(a) = read_automation(&root).map_err(err)? {
        s.factory.factory.set_budgets(&id, a.budgets);
    }
    Ok(())
}

/// The diff of a run folder against its base, one entry for each file (`factory` REQ-028).
pub fn diff_of_run(s: &AppState, run: &str) -> Res<Vec<FileDiff>> {
    let (id, root) = root_of(s)?;
    s.factory
        .factory
        .run_info(run)
        .filter(|r| r.project == id)
        .ok_or_else(|| format!("no run {run}"))?;
    Folders {
        root,
        data: s.dir.clone(),
        project: id,
        runner: RUNNER.into(),
        declared_base: None,
        specs: String::new(),
        secrets: Vec::new(),
    }
    .run_diff(run, MAX_RUN_DIFF)
}

/// `run:<id>` and `run:<id>/<step>` resolve from the factory (`factory` REQ-021). A run that this
/// machine does not know stays unresolved: it falls through to the index, which finds nothing.
pub fn resolve_run(s: &AppState, text: &str) -> Option<shipyard_store::ref_query::Resolved> {
    use shipyard_core::refs::{Ref, parse};
    use shipyard_store::ref_query::{Resolved, State};
    let Some(Ref::Run { id, step }) = parse(text) else {
        return None;
    };
    let r = s.factory.factory.run_info(&id)?;
    let step_ok = step.as_deref().is_none_or(|st| {
        r.steps
            .iter()
            .any(|x| x.id == st || x.units.iter().any(|(u, _)| u == st))
    });
    Some(Resolved {
        target: text.into(),
        kind: "run".into(),
        state: if step_ok {
            State::Resolved
        } else {
            State::Unresolved
        },
        title: Some(format!("{}: {}", r.key, r.title)),
        status: Some(r.run.state.as_str().into()),
        location: (!r.url.is_empty()).then(|| r.url.clone()),
    })
}

// ---------------------------------------------------------------- run actions

fn done<T>(s: &AppState, out: Result<T, String>) -> Res<T> {
    s.factory.publish();
    out
}

/// Start a run on a ticket of the mirror by hand (the "Run" action of a ticket). The sync tick
/// starts the runs of labelled tickets by itself. Returns the run id.
pub fn start(s: &AppState, key: &str) -> Res<String> {
    let a = active(s)?.ok_or("no project is open")?;
    let source = tracker_source(s, &a)?.ok_or("the project has no tracker connection")?;
    let ticket = s
        .sync
        .mirror()
        .map_err(err)?
        .ticket(&source, key)
        .map_err(err)?
        .ok_or_else(|| format!("{key} is not in the mirror: sync first"))?;
    ensure(s)?;
    let f = &s.factory.factory;
    // The engine refuses a second active run on the ticket, under its own lock.
    let status = ticket.item.status.name.clone();
    let out = f.start(&StartRequest {
        project: a.entry.id.clone(),
        ticket,
        status,
        machine: s.sync.machine().into(),
        stamped: false,
    });
    s.factory.publish();
    out?;
    f.active_runs()
        .into_iter()
        .find(|r| r.project == a.entry.id && r.key == key)
        .map(|r| r.run_id)
        .ok_or_else(|| "the run did not start".into())
}

pub fn cancel(s: &AppState, run: &str) -> Res<()> {
    done(s, s.factory.factory.cancel(run))
}

/// Raise the budget and resume a paused run (`factory` REQ-005).
pub fn resume(s: &AppState, run: &str, add_usd: f64, add_tokens: u32) -> Res<RunState> {
    done(
        s,
        s.factory
            .factory
            .resume_with(run, add_usd, u64::from(add_tokens)),
    )
}

pub fn unblock(s: &AppState, run: &str) -> Res<()> {
    done(s, s.factory.factory.unblock(run))
}

pub fn approve_plan(s: &AppState, run: &str) -> Res<()> {
    done(s, s.factory.factory.approve_plan(run))
}

pub fn reject_plan(s: &AppState, run: &str, note: &str) -> Res<()> {
    done(s, s.factory.factory.reject_plan(run, note))
}

pub fn kill_switch(s: &AppState) -> bool {
    s.factory.factory.kill_switch()
}

/// The global kill switch (`factory` REQ-024): on cancels every active run and stops pickup.
pub fn set_kill_switch(s: &AppState, on: bool) -> bool {
    s.factory.factory.set_kill_switch(on);
    if on {
        crate::pr_agent::stop_all();
    }
    s.factory.publish();
    on
}

/// A run that a person moves by hand to a state that the machine allows (`delivery`: `Closed`
/// after a close on the forge). Any other event stays with the engine.
pub fn close(s: &AppState, run: &str) -> Res<RunState> {
    done(s, s.factory.factory.apply(run, RunEvent::Closed))
}

// ---------------------------------------------------------------- workflows and roles

fn root_of(s: &AppState) -> Res<(String, PathBuf)> {
    let e = s
        .registry()?
        .active()
        .cloned()
        .ok_or("no project is open")?;
    Ok((e.id, PathBuf::from(e.path)))
}

/// A workflow or role id becomes a file name: lower case, digits, `-` and `_`.
fn file_id(id: &str) -> Res<&str> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && !id.starts_with(['-', '_'])
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '_'));
    if ok {
        Ok(id)
    } else {
        Err(format!("`{id}` is not an id: use a-z, 0-9, - and _"))
    }
}

fn too_big(text: &str) -> Res<()> {
    if text.len() > MAX_FILE {
        return Err(format!("the file is over {} KiB", MAX_FILE / 1024));
    }
    Ok(())
}

fn role_names(loaded: &Loaded) -> Vec<String> {
    let mut names: Vec<String> = DEFAULT_ROLES.iter().map(|r| r.to_string()).collect();
    names.extend(
        loaded
            .roles
            .keys()
            .filter(|n| !DEFAULT_ROLES.contains(&n.as_str()))
            .cloned(),
    );
    names
}

/// One reason to refuse a workflow or role file, with the line of its field (`factory` REQ-010).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IssueView {
    /// Repository-relative path.
    pub file: String,
    pub line: Option<u32>,
    pub message: String,
}

impl From<&FileIssue> for IssueView {
    fn from(i: &FileIssue) -> Self {
        Self {
            file: i.file.clone(),
            line: i.line.and_then(|l| u32::try_from(l).ok()),
            message: i.message.clone(),
        }
    }
}

/// One workflow of the project (`factory` REQ-010). An invalid file shows its last valid version
/// and its issue.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowItem {
    pub id: String,
    pub steps: Vec<String>,
    pub issue: Option<IssueView>,
}

/// The workflow files, from the disk now. A file that broke keeps its last valid version.
fn fresh(s: &AppState) -> Res<(PathBuf, Loaded)> {
    let (id, root) = root_of(s)?;
    let loaded = load(&root, &s.factory.last_loaded(&id)).map_err(err)?;
    Ok((root, loaded))
}

pub fn workflows(s: &AppState) -> Res<Vec<WorkflowItem>> {
    let (_, loaded) = fresh(s)?;
    let issue_of = |id: &str| {
        let file = format!("{WORKFLOWS_DIR}/{id}.yaml");
        loaded.issues.iter().find(|i| i.file == file).cloned()
    };
    let mut items: BTreeMap<String, WorkflowItem> = loaded
        .workflows
        .iter()
        .map(|(id, wf)| {
            let item = WorkflowItem {
                id: id.clone(),
                steps: wf.steps.iter().map(|st| st.id.clone()).collect(),
                issue: issue_of(id).as_ref().map(IssueView::from),
            };
            (id.clone(), item)
        })
        .collect();
    // A new file that never parsed has no last version: it still shows, with its issue.
    for i in &loaded.issues {
        if let Some(id) = i
            .file
            .strip_prefix(&format!("{WORKFLOWS_DIR}/"))
            .and_then(|f| f.strip_suffix(".yaml"))
        {
            items.entry(id.to_string()).or_insert_with(|| WorkflowItem {
                id: id.to_string(),
                steps: Vec::new(),
                issue: Some(i.into()),
            });
        }
    }
    Ok(items.into_values().collect())
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowFile {
    pub id: String,
    pub text: String,
    /// The parsed workflow, when the text is valid.
    pub workflow: Option<Workflow>,
    pub issue: Option<IssueView>,
}

fn issue(id: &str, line: Option<usize>, message: String) -> FileIssue {
    FileIssue {
        file: format!("{WORKFLOWS_DIR}/{id}.yaml"),
        line,
        message,
    }
}

fn check_workflow(id: &str, text: &str, loaded: &Loaded) -> (Option<Workflow>, Option<IssueView>) {
    match parse_workflow(id, text, &role_names(loaded)) {
        Ok(wf) => (Some(wf), None),
        Err((line, msg)) => (None, Some((&issue(id, line, msg)).into())),
    }
}

pub fn workflow_read(s: &AppState, id: &str) -> Res<WorkflowFile> {
    let id = file_id(id)?;
    let (root, loaded) = fresh(s)?;
    let text = std::fs::read_to_string(root.join(WORKFLOWS_DIR).join(format!("{id}.yaml")))
        .map_err(|_| format!("no workflow `{id}`"))?;
    let (workflow, issue) = check_workflow(id, &text, &loaded);
    Ok(WorkflowFile {
        id: id.into(),
        text,
        workflow,
        issue,
    })
}

/// The first issue of a text, or `None`. Nothing is written.
pub fn workflow_validate(s: &AppState, id: &str, text: &str) -> Res<Option<IssueView>> {
    let id = file_id(id)?;
    too_big(text)?;
    let (_, loaded) = fresh(s)?;
    Ok(check_workflow(id, text, &loaded).1)
}

/// Write the file after the check. An invalid text is refused: the file never holds one that the
/// reload would drop.
pub fn workflow_save(s: &AppState, id: &str, text: &str) -> Res<()> {
    crate::work::refuse_read_only(s)?;
    if let Some(i) = workflow_validate(s, id, text)? {
        return Err(match i.line {
            Some(l) => format!("{}:{l}: {}", i.file, i.message),
            None => format!("{}: {}", i.file, i.message),
        });
    }
    let (_, root) = root_of(s)?;
    write_atomic(
        &root.join(WORKFLOWS_DIR).join(format!("{id}.yaml")),
        text.as_bytes(),
    )
    .map_err(err)?;
    // The factory takes the new file at once.
    let _ = ensure(s);
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RoleItem {
    pub id: String,
    pub description: String,
    /// A tier (`top`, `mid`, `small`) or a model id.
    pub model: Option<String>,
    pub effort: Option<Effort>,
    /// A file in `.shipyard/roles/` exists.
    pub file: bool,
    /// A default role ships with the app.
    pub bundled: bool,
}

pub fn roles(s: &AppState) -> Res<Vec<RoleItem>> {
    let (_, loaded) = fresh(s)?;
    Ok(role_names(&loaded)
        .into_iter()
        .filter_map(|id| {
            let r = loaded.role(&id)?;
            Some(RoleItem {
                file: loaded.roles.contains_key(&id),
                bundled: default_roles().iter().any(|(n, _)| *n == id),
                id,
                description: r.description,
                model: r.model,
                effort: r.effort,
            })
        })
        .collect())
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RoleFile {
    pub id: String,
    /// The file, or the bundled text of a default role that has no file.
    pub text: String,
    pub role: Option<Role>,
    pub issue: Option<IssueView>,
}

fn role_issue(id: &str, line: Option<usize>, message: String) -> FileIssue {
    FileIssue {
        file: format!("{ROLES_DIR}/{id}.md"),
        line,
        message,
    }
}

pub fn role_read(s: &AppState, id: &str) -> Res<RoleFile> {
    let id = file_id(id)?;
    let (root, _) = fresh(s)?;
    let text = match std::fs::read_to_string(root.join(ROLES_DIR).join(format!("{id}.md"))) {
        Ok(t) => t,
        Err(_) => default_roles()
            .iter()
            .find(|(n, _)| *n == id)
            .map(|(_, t)| t.to_string())
            .ok_or_else(|| format!("no role `{id}`"))?,
    };
    let (role, issue) = match parse_role(id, &text) {
        Ok(r) => (Some(r), None),
        Err((line, msg)) => (None, Some((&role_issue(id, line, msg)).into())),
    };
    Ok(RoleFile {
        id: id.into(),
        text,
        role,
        issue,
    })
}

/// Write a role file after the check. The next brief of a step with this role uses it.
pub fn role_save(s: &AppState, id: &str, text: &str) -> Res<()> {
    crate::work::refuse_read_only(s)?;
    let id = file_id(id)?;
    too_big(text)?;
    if let Err((line, msg)) = parse_role(id, text) {
        let i = role_issue(id, line, msg);
        return Err(match i.line {
            Some(l) => format!("{}:{l}: {}", i.file, i.message),
            None => format!("{}: {}", i.file, i.message),
        });
    }
    let (_, root) = root_of(s)?;
    write_atomic(
        &root.join(ROLES_DIR).join(format!("{id}.md")),
        text.as_bytes(),
    )
    .map_err(err)?;
    let _ = ensure(s);
    Ok(())
}

// ---------------------------------------------------------------- commands

use tauri::AppHandle;

use crate::commands::blocking;

#[tauri::command]
#[specta::specta]
pub async fn runs_list(app: AppHandle) -> Api<Vec<RunView>> {
    blocking(app, runs).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_get_one(app: AppHandle, run: String) -> Api<Option<RunView>> {
    blocking(app, move |s| run_get(s, &run)).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_log_page(app: AppHandle, run: String, after: u32, limit: u32) -> Api<RunLogPage> {
    blocking(app, move |s| run_log(s, &run, after, limit)).await
}

#[tauri::command]
#[specta::specta]
pub async fn sessions_list(app: AppHandle) -> Api<Vec<SessionView>> {
    blocking(app, sessions).await
}

#[tauri::command]
#[specta::specta]
pub async fn usage_get(app: AppHandle) -> Api<UsageView> {
    blocking(app, usage).await
}

/// `usd` of `null` clears the budget.
#[tauri::command]
#[specta::specta]
pub async fn budget_set(app: AppHandle, scope: String, key: String, usd: Option<f64>) -> Api<()> {
    blocking(app, move |s| budget_save(s, &scope, &key, usd)).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_diff(app: AppHandle, run: String) -> Api<Vec<FileDiff>> {
    blocking(app, move |s| diff_of_run(s, &run)).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_start(app: AppHandle, key: String) -> Api<String> {
    blocking(app, move |s| start(s, &key)).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_cancel(app: AppHandle, run: String) -> Api<()> {
    blocking(app, move |s| cancel(s, &run)).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_resume(
    app: AppHandle,
    run: String,
    add_usd: f64,
    add_tokens: u32,
) -> Api<RunState> {
    blocking(app, move |s| resume(s, &run, add_usd, add_tokens)).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_unblock(app: AppHandle, run: String) -> Api<()> {
    blocking(app, move |s| unblock(s, &run)).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_plan_approve(app: AppHandle, run: String) -> Api<()> {
    blocking(app, move |s| approve_plan(s, &run)).await
}

#[tauri::command]
#[specta::specta]
pub async fn run_plan_reject(app: AppHandle, run: String, note: String) -> Api<()> {
    blocking(app, move |s| reject_plan(s, &run, &note)).await
}

/// Why the run log file did not open, or `null`. The runs of this session are then not kept.
#[tauri::command]
#[specta::specta]
pub async fn run_log_degraded(app: AppHandle) -> Api<Option<String>> {
    blocking(app, |s| Ok(s.factory.degraded().map(str::to_string))).await
}

#[tauri::command]
#[specta::specta]
pub async fn kill_switch_get(app: AppHandle) -> Api<bool> {
    blocking(app, |s| Ok(kill_switch(s))).await
}

#[tauri::command]
#[specta::specta]
pub async fn kill_switch_set(app: AppHandle, on: bool) -> Api<bool> {
    blocking(app, move |s| Ok(set_kill_switch(s, on))).await
}

#[tauri::command]
#[specta::specta]
pub async fn workflows_list(app: AppHandle) -> Api<Vec<WorkflowItem>> {
    blocking(app, workflows).await
}

#[tauri::command]
#[specta::specta]
pub async fn workflow_get(app: AppHandle, id: String) -> Api<WorkflowFile> {
    blocking(app, move |s| workflow_read(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn workflow_check(app: AppHandle, id: String, text: String) -> Api<Option<IssueView>> {
    blocking(app, move |s| workflow_validate(s, &id, &text)).await
}

#[tauri::command]
#[specta::specta]
pub async fn workflow_write(app: AppHandle, id: String, text: String) -> Api<()> {
    blocking(app, move |s| workflow_save(s, &id, &text)).await
}

#[tauri::command]
#[specta::specta]
pub async fn roles_list(app: AppHandle) -> Api<Vec<RoleItem>> {
    blocking(app, roles).await
}

#[tauri::command]
#[specta::specta]
pub async fn role_get(app: AppHandle, id: String) -> Api<RoleFile> {
    blocking(app, move |s| role_read(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn role_write(app: AppHandle, id: String, text: String) -> Api<()> {
    blocking(app, move |s| role_save(s, &id, &text)).await
}

#[cfg(test)]
pub(crate) mod tests;
