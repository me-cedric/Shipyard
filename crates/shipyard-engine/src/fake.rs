//! Fakes for the tests of the engine and of the wiring: a clock, a tracker, a forge and a
//! factory. Each one is a handle: a clone shares the state, so two engines ("machines") can use
//! one fake tracker. All of them write one shared [`Log`] to check the order of the calls.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use shipyard_core::pickup::{ActiveRun, PrState, PullSnapshot, SyncEvent, Ticket};
use shipyard_core::run::RunState;
use shipyard_core::work_item::{Comment, Person, Status, StatusCategory, WorkItem, WorkKind};

use crate::Clock;
use shipyard_core::delivery::GateCheck;

use crate::ports::{
    Branches, Changes, Dispatch, FailedCheck, ForgePort, Git, ListQuery, Merge, Page, PortResult,
    Pulls, ReviewInput, Stamp, StartRequest, Thread, TrackerPort,
};

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ---- clock and log

#[derive(Clone, Default)]
pub struct FakeClock(Arc<Mutex<Duration>>);

impl FakeClock {
    pub fn new(start: Duration) -> Self {
        Self(Arc::new(Mutex::new(start)))
    }

    pub fn advance(&self, by: Duration) {
        *lock(&self.0) += by;
    }
}

impl Clock for FakeClock {
    fn now(&self) -> Duration {
        *lock(&self.0)
    }
}

/// The calls of every fake in order, as short strings: `list`, `get:KEY`, `event:comment`,
/// `stop:RUN`, `start:KEY`, `stamp:MACHINE:KEY`.
#[derive(Clone, Default)]
pub struct Log(Arc<Mutex<Vec<String>>>);

impl Log {
    pub fn push(&self, line: impl Into<String>) {
        lock(&self.0).push(line.into());
    }

    pub fn lines(&self) -> Vec<String> {
        lock(&self.0).clone()
    }

    /// The index of the first line that starts with `prefix`.
    pub fn first(&self, prefix: &str) -> Option<usize> {
        lock(&self.0).iter().position(|l| l.starts_with(prefix))
    }

    pub fn count(&self, prefix: &str) -> usize {
        lock(&self.0)
            .iter()
            .filter(|l| l.starts_with(prefix))
            .count()
    }
}

// ---- builders

pub fn ticket(key: &str, status: &str, category: StatusCategory) -> Ticket {
    Ticket::new(WorkItem {
        key: key.into(),
        title: format!("title {key}"),
        description: String::new(),
        kind: WorkKind::Task,
        status: Status {
            name: status.into(),
            category,
        },
        assignee: Some(Person {
            id: "u1".into(),
            name: "Alice".into(),
        }),
        labels: vec!["shipyard".into()],
        parent: None,
        url: format!("https://tracker.test/{key}"),
        updated: "2026-10-29T10:00:00Z".into(),
        time: None,
    })
}

/// A ticket in `To Do` with the label `shipyard`: a match for the default filter.
pub fn todo(key: &str) -> Ticket {
    ticket(key, "To Do", StatusCategory::Todo)
}

pub fn comment(id: &str, body: &str) -> Comment {
    Comment {
        id: id.into(),
        author: Person {
            id: "u2".into(),
            name: "Bob".into(),
        },
        body: body.into(),
        created: format!("2026-10-29T11:00:{id:0>2}Z"),
    }
}

// ---- tracker

#[derive(Default)]
struct TrackerState {
    tickets: BTreeMap<String, Ticket>,
    comments: BTreeMap<String, Vec<Comment>>,
    /// `(machine, refreshed at)`, in creation order.
    stamps: BTreeMap<String, Vec<(String, Duration)>>,
    queries: Vec<ListQuery>,
    page_size: usize,
    fail: Option<String>,
    refuse_stamp: bool,
    can_stamp: bool,
    /// Every page says that another one follows.
    endless: bool,
    /// A stamp that another machine writes just before the next `write_stamp`.
    race: Option<String>,
    stamp_writes: usize,
}

#[derive(Clone)]
pub struct FakeTracker {
    state: Arc<Mutex<TrackerState>>,
    clock: FakeClock,
    log: Log,
}

impl FakeTracker {
    pub fn new(clock: &FakeClock, log: &Log) -> Self {
        let state = TrackerState {
            page_size: 100,
            can_stamp: true,
            ..TrackerState::default()
        };
        Self {
            state: Arc::new(Mutex::new(state)),
            clock: clock.clone(),
            log: log.clone(),
        }
    }

    pub fn put(&self, t: Ticket) {
        lock(&self.state).tickets.insert(t.item.key.clone(), t);
    }

    /// Change a ticket with `f`, and bump its `updated` to `at`.
    pub fn update(&self, key: &str, at: &str, f: impl FnOnce(&mut Ticket)) {
        let mut s = lock(&self.state);
        let t = s.tickets.get_mut(key).expect("known ticket");
        f(t);
        t.item.updated = at.into();
    }

    pub fn add_comment(&self, key: &str, c: Comment) {
        lock(&self.state)
            .comments
            .entry(key.into())
            .or_default()
            .push(c);
    }

    pub fn set_page_size(&self, n: usize) {
        lock(&self.state).page_size = n;
    }

    pub fn fail_with(&self, message: Option<&str>) {
        lock(&self.state).fail = message.map(Into::into);
    }

    pub fn refuse_stamps(&self, on: bool) {
        lock(&self.state).refuse_stamp = on;
    }

    pub fn set_endless(&self, on: bool) {
        lock(&self.state).endless = on;
    }

    pub fn set_can_stamp(&self, on: bool) {
        lock(&self.state).can_stamp = on;
    }

    pub fn race_stamp(&self, machine: &str) {
        lock(&self.state).race = Some(machine.into());
    }

    pub fn queries(&self) -> Vec<ListQuery> {
        lock(&self.state).queries.clone()
    }

    pub fn stamp_writes(&self) -> usize {
        lock(&self.state).stamp_writes
    }

    /// Machines that hold a stamp on the ticket, in creation order.
    pub fn stamp_holders(&self, key: &str) -> Vec<String> {
        lock(&self.state)
            .stamps
            .get(key)
            .map(|v| v.iter().map(|(m, _)| m.clone()).collect())
            .unwrap_or_default()
    }

    fn check(&self) -> PortResult<()> {
        lock(&self.state).fail.clone().map_or(Ok(()), Err)
    }
}

impl TrackerPort for FakeTracker {
    fn list(&self, q: &ListQuery) -> PortResult<Page<Ticket>> {
        self.log.push("list");
        self.check()?;
        let mut s = lock(&self.state);
        s.queries.push(q.clone());
        let all: Vec<Ticket> = s
            .tickets
            .values()
            .filter(|t| match &q.since {
                Some(since) => t.item.updated.as_str() >= since.as_str(),
                None => t.item.status.category != StatusCategory::Done,
            })
            .cloned()
            .collect();
        let start: usize = q.cursor.as_deref().map_or(0, |c| c.parse().unwrap_or(0));
        let end = (start + s.page_size).min(all.len());
        Ok(Page {
            items: all[start..end].to_vec(),
            next: (s.endless || end < all.len()).then(|| end.to_string()),
        })
    }

    fn get(&self, key: &str) -> PortResult<Ticket> {
        self.log.push(format!("get:{key}"));
        self.check()?;
        lock(&self.state)
            .tickets
            .get(key)
            .cloned()
            .ok_or_else(|| format!("not found: {key}"))
    }

    fn comments(&self, key: &str) -> PortResult<Vec<Comment>> {
        self.log.push(format!("comments:{key}"));
        self.check()?;
        Ok(lock(&self.state)
            .comments
            .get(key)
            .cloned()
            .unwrap_or_default())
    }

    fn can_stamp(&self) -> bool {
        lock(&self.state).can_stamp
    }

    fn stamps(&self, key: &str) -> PortResult<Vec<Stamp>> {
        self.check()?;
        let now = self.clock.now();
        Ok(lock(&self.state)
            .stamps
            .get(key)
            .map(|v| {
                v.iter()
                    .map(|(m, at)| Stamp {
                        machine: m.clone(),
                        age: now.saturating_sub(*at),
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    fn write_stamp(&self, key: &str, machine: &str) -> PortResult<()> {
        self.log.push(format!("stamp:{machine}:{key}"));
        self.check()?;
        let now = self.clock.now();
        let mut s = lock(&self.state);
        if s.refuse_stamp {
            return Err("the tracker refused the comment".into());
        }
        s.stamp_writes += 1;
        if let Some(other) = s.race.take() {
            s.stamps.entry(key.into()).or_default().push((other, now));
        }
        let list = s.stamps.entry(key.into()).or_default();
        match list.iter_mut().find(|(m, _)| m == machine) {
            Some(entry) => entry.1 = now,
            None => list.push((machine.into(), now)),
        }
        Ok(())
    }

    fn clear_stamp(&self, key: &str, machine: &str) -> PortResult<()> {
        self.log.push(format!("unstamp:{machine}:{key}"));
        self.check()?;
        if let Some(list) = lock(&self.state).stamps.get_mut(key) {
            list.retain(|(m, _)| m != machine);
        }
        Ok(())
    }
}

// ---- forge

#[derive(Default)]
struct ForgeState {
    pulls: BTreeMap<u64, PullSnapshot>,
    fail: Option<String>,
}

#[derive(Clone, Default)]
pub struct FakeForge {
    state: Arc<Mutex<ForgeState>>,
    log: Log,
}

impl FakeForge {
    pub fn new(log: &Log) -> Self {
        Self {
            state: Arc::default(),
            log: log.clone(),
        }
    }

    pub fn put(&self, p: PullSnapshot) {
        lock(&self.state).pulls.insert(p.number, p);
    }

    pub fn fail_with(&self, message: Option<&str>) {
        lock(&self.state).fail = message.map(Into::into);
    }
}

impl ForgePort for FakeForge {
    fn pulls(&self, q: &ListQuery) -> PortResult<Page<PullSnapshot>> {
        self.log.push("pulls");
        let s = lock(&self.state);
        if let Some(e) = &s.fail {
            return Err(e.clone());
        }
        let items = s
            .pulls
            .values()
            .filter(|p| q.since.is_some() || p.state == PrState::Open)
            .cloned()
            .collect();
        Ok(Page { items, next: None })
    }

    fn pull(&self, number: u64) -> PortResult<PullSnapshot> {
        self.log.push(format!("pull:{number}"));
        let s = lock(&self.state);
        if let Some(e) = &s.fail {
            return Err(e.clone());
        }
        s.pulls
            .get(&number)
            .cloned()
            .ok_or_else(|| format!("not found: #{number}"))
    }
}

// ---- factory

#[derive(Default)]
struct DispatchState {
    runs: Vec<ActiveRun>,
    started: Vec<StartRequest>,
    stopped: Vec<(String, String)>,
    events: Vec<SyncEvent>,
    kill: bool,
    fail_start: bool,
    fail_events: bool,
    next: u32,
}

#[derive(Clone, Default)]
pub struct FakeDispatch {
    state: Arc<Mutex<DispatchState>>,
    log: Log,
}

impl FakeDispatch {
    pub fn new(log: &Log) -> Self {
        Self {
            state: Arc::default(),
            log: log.clone(),
        }
    }

    pub fn set_kill(&self, on: bool) {
        lock(&self.state).kill = on;
    }

    pub fn fail_start(&self, on: bool) {
        lock(&self.state).fail_start = on;
    }

    pub fn fail_events(&self, on: bool) {
        lock(&self.state).fail_events = on;
    }

    /// A run that exists already, for example `Working` on a ticket.
    pub fn add_run(&self, run: ActiveRun) {
        lock(&self.state).runs.push(run);
    }

    pub fn set_run_state(&self, run_id: &str, state: RunState, pr: Option<u64>) {
        let mut s = lock(&self.state);
        let r = s.runs.iter_mut().find(|r| r.run_id == run_id).expect("run");
        r.state = state;
        r.pr = pr;
    }

    /// A run ends: the factory drops it from the active list.
    pub fn end_run(&self, run_id: &str) {
        lock(&self.state).runs.retain(|r| r.run_id != run_id);
    }

    pub fn started(&self) -> Vec<StartRequest> {
        lock(&self.state).started.clone()
    }

    pub fn started_keys(&self) -> Vec<String> {
        self.started()
            .into_iter()
            .map(|r| r.ticket.item.key)
            .collect()
    }

    pub fn stopped(&self) -> Vec<(String, String)> {
        lock(&self.state).stopped.clone()
    }

    pub fn events(&self) -> Vec<SyncEvent> {
        lock(&self.state).events.clone()
    }

    /// The events without the tick events.
    pub fn handed_off(&self) -> Vec<SyncEvent> {
        self.events()
            .into_iter()
            .filter(|e| !matches!(e, SyncEvent::Tick { .. }))
            .collect()
    }
}

impl Dispatch for FakeDispatch {
    fn kill_switch(&self) -> bool {
        lock(&self.state).kill
    }

    fn active_runs(&self) -> Vec<ActiveRun> {
        lock(&self.state).runs.clone()
    }

    fn start(&self, r: &StartRequest) -> Result<(), String> {
        self.log.push(format!("start:{}", r.ticket.item.key));
        let mut s = lock(&self.state);
        if s.fail_start {
            return Err("the factory is not ready".into());
        }
        s.next += 1;
        let run_id = format!("run-{}", s.next);
        s.runs.push(ActiveRun {
            run_id,
            project: r.project.clone(),
            key: r.ticket.item.key.clone(),
            state: RunState::Claimed,
            status: r.status.clone(),
            pr: None,
        });
        s.started.push(r.clone());
        Ok(())
    }

    fn stop(&self, run_id: &str, reason: &str) -> Result<(), String> {
        self.log.push(format!("stop:{run_id}"));
        let mut s = lock(&self.state);
        s.runs.retain(|r| r.run_id != run_id);
        s.stopped.push((run_id.into(), reason.into()));
        Ok(())
    }

    fn event(&self, e: &SyncEvent) -> Result<(), String> {
        let name = match e {
            SyncEvent::Comment { .. } => "comment",
            SyncEvent::Pr(_) => "pr",
            SyncEvent::Tick { .. } => "tick",
        };
        self.log.push(format!("event:{name}"));
        let mut s = lock(&self.state);
        if s.fail_events && !matches!(e, SyncEvent::Tick { .. }) {
            return Err("the listener is busy".into());
        }
        s.events.push(e.clone());
        Ok(())
    }
}

// ---- factory: agents, writer, workspaces

#[derive(Default)]
struct AgentsState {
    briefs: Vec<crate::ports::Brief>,
    queues: Vec<std::collections::VecDeque<crate::ports::AgentEvent>>,
    live: Vec<bool>,
    fail: Option<String>,
    ended: Vec<(String, String)>,
}

/// A runner with no process. Each start is one agent; a test pushes its events.
#[derive(Clone, Default)]
pub struct FakeAgents(Arc<Mutex<AgentsState>>);

impl FakeAgents {
    /// The `(run, step)` pairs that the factory ended, in order.
    pub fn ended(&self) -> Vec<(String, String)> {
        lock(&self.0).ended.clone()
    }

    pub fn briefs(&self) -> Vec<crate::ports::Brief> {
        lock(&self.0).briefs.clone()
    }

    /// The step ids of the agents that run now, in start order.
    pub fn running(&self) -> Vec<String> {
        let s = lock(&self.0);
        s.briefs
            .iter()
            .zip(&s.live)
            .filter(|(_, l)| **l)
            .map(|(b, _)| b.step.clone())
            .collect()
    }

    /// Give an event to the last agent started for `step`.
    pub fn push(&self, step: &str, e: crate::ports::AgentEvent) {
        let mut s = lock(&self.0);
        let i = s
            .briefs
            .iter()
            .rposition(|b| b.step == step)
            .expect("an agent of the step");
        s.queues[i].push_back(e);
    }

    pub fn fail_start(&self, message: Option<&str>) {
        lock(&self.0).fail = message.map(Into::into);
    }
}

struct FakeAgent(Arc<Mutex<AgentsState>>, usize);

impl crate::ports::AgentRun for FakeAgent {
    fn next(&mut self) -> Option<crate::ports::AgentEvent> {
        lock(&self.0).queues[self.1].pop_front()
    }

    fn cancel(&mut self) {
        lock(&self.0).live[self.1] = false;
    }
}

impl Drop for FakeAgent {
    fn drop(&mut self) {
        lock(&self.0).live[self.1] = false;
    }
}

impl crate::ports::Agents for FakeAgents {
    fn start(&self, brief: &crate::ports::Brief) -> PortResult<Box<dyn crate::ports::AgentRun>> {
        let mut s = lock(&self.0);
        if let Some(e) = &s.fail {
            return Err(e.clone());
        }
        s.briefs.push(brief.clone());
        s.queues.push(Default::default());
        s.live.push(true);
        Ok(Box::new(FakeAgent(self.0.clone(), s.briefs.len() - 1)))
    }

    fn end(&self, run: &str, step: &str) {
        lock(&self.0).ended.push((run.into(), step.into()));
    }
}

#[derive(Default)]
struct WriterState {
    sent: Vec<crate::approvals::Write>,
    no_comments: bool,
    fail: Option<String>,
    pulls: Option<FakePulls>,
    delay: Duration,
}

/// Records each write. A comment gets the id `c<n>`, a pull request the number 7.
#[derive(Clone, Default)]
pub struct FakeWriter(Arc<Mutex<WriterState>>);

impl FakeWriter {
    pub fn sent(&self) -> Vec<crate::approvals::Write> {
        lock(&self.0).sent.clone()
    }

    pub fn set_can_comment(&self, on: bool) {
        lock(&self.0).no_comments = !on;
    }

    pub fn fail_with(&self, message: Option<&str>) {
        lock(&self.0).fail = message.map(Into::into);
    }

    /// Each `send` takes this long, with no lock of the fake held.
    pub fn set_delay(&self, delay: Duration) {
        lock(&self.0).delay = delay;
    }

    /// A pull request that this writer opens is then found by `pulls`.
    pub fn link(&self, pulls: &FakePulls) {
        lock(&self.0).pulls = Some(pulls.clone());
    }
}

impl crate::ports::Writer for FakeWriter {
    fn can_comment(&self) -> bool {
        !lock(&self.0).no_comments
    }

    fn send(&self, w: &crate::approvals::Write) -> PortResult<String> {
        use crate::approvals::Write;
        let delay = lock(&self.0).delay;
        std::thread::sleep(delay);
        let mut s = lock(&self.0);
        if let Some(e) = &s.fail {
            return Err(e.clone());
        }
        s.sent.push(w.clone());
        if let (Write::OpenPr { branch, .. }, Some(pulls)) = (w, &s.pulls) {
            pulls.put(branch, 7);
        }
        Ok(match w {
            Write::Comment { .. } => format!("c{}", s.sent.len()),
            Write::OpenPr { .. } => "7".into(),
            _ => String::new(),
        })
    }
}

/// `/wt/<run>/<child>` for a worktree, `/wt/<run>` for the shared one. Records the calls.
#[derive(Clone, Default)]
pub struct FakeWorkspaces(Arc<Mutex<Vec<Call>>>);

/// `(run, child)` of one `dir` call.
pub type Call = (String, Option<String>);

impl FakeWorkspaces {
    pub fn calls(&self) -> Vec<Call> {
        lock(&self.0).clone()
    }
}

impl crate::ports::Workspaces for FakeWorkspaces {
    fn dir(
        &self,
        run: &str,
        _workspace: shipyard_core::workflow::Workspace,
        child: Option<&str>,
    ) -> PortResult<std::path::PathBuf> {
        lock(&self.0).push((run.into(), child.map(Into::into)));
        let base = std::path::PathBuf::from("/wt").join(run);
        Ok(child.map_or(base.clone(), |c| base.join(c)))
    }
}

// ---- delivery: git and forge reads

struct GitState {
    calls: Vec<String>,
    conflicts: BTreeMap<String, Vec<String>>,
    fail: BTreeMap<String, String>,
    branch: String,
    changes: Changes,
    lines: BTreeMap<String, u32>,
    rebase: Merge,
    failing: Vec<String>,
    dirty: Option<String>,
    input: ReviewInput,
    merge_messages: Vec<String>,
    gate_delay: Duration,
    digest: Option<String>,
}

/// The local git work of a run, with no repository. Each call is one line in [`FakeGit::calls`]:
/// `merge_child <child>`, `commit <paths>`, `rename <new>`, and so on. By default the branch is
/// `claude/work`, one file `src/a.rs` of 10 lines changed, a clean rebase, a green gate.
#[derive(Clone)]
pub struct FakeGit(Arc<Mutex<GitState>>);

impl Default for FakeGit {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(GitState {
            calls: Vec::new(),
            conflicts: BTreeMap::new(),
            fail: BTreeMap::new(),
            branch: "claude/work".into(),
            changes: Changes {
                uncommitted: vec!["src/a.rs".into()],
                files: vec!["src/a.rs".into()],
            },
            lines: BTreeMap::from([("src/a.rs".to_string(), 10)]),
            rebase: Merge::Clean,
            failing: Vec::new(),
            dirty: None,
            input: ReviewInput {
                head: "abc123".into(),
                diff: "diff --git a/src/a.rs b/src/a.rs".into(),
                specs: Vec::new(),
            },
            merge_messages: Vec::new(),
            gate_delay: Duration::ZERO,
            digest: None,
        })))
    }
}

impl FakeGit {
    pub fn calls(&self) -> Vec<String> {
        lock(&self.0).calls.clone()
    }

    /// The commit message that each `merge_child` got, in order.
    pub fn merge_messages(&self) -> Vec<String> {
        lock(&self.0).merge_messages.clone()
    }

    pub fn count(&self, prefix: &str) -> usize {
        self.calls()
            .iter()
            .filter(|c| c.starts_with(prefix))
            .count()
    }

    /// `merge_child` of this child stops on these files. An empty list: it goes through again.
    pub fn conflict(&self, child: &str, files: &[&str]) {
        let mut s = lock(&self.0);
        if files.is_empty() {
            s.conflicts.remove(child);
        } else {
            s.conflicts
                .insert(child.into(), files.iter().map(|f| f.to_string()).collect());
        }
    }

    /// The operation fails with this message: `merge_child`, `commit`, `rename`, `rebase`,
    /// `gate`, `changes`. `None`: it works again.
    pub fn fail(&self, op: &str, message: Option<&str>) {
        let mut s = lock(&self.0);
        match message {
            Some(m) => s.fail.insert(op.into(), m.into()),
            None => s.fail.remove(op),
        };
    }

    pub fn set_branch(&self, name: &str) {
        lock(&self.0).branch = name.into();
    }

    pub fn branch_now(&self) -> String {
        lock(&self.0).branch.clone()
    }

    pub fn set_changes(&self, uncommitted: &[&str], files: &[&str]) {
        let to = |l: &[&str]| l.iter().map(|f| f.to_string()).collect();
        lock(&self.0).changes = Changes {
            uncommitted: to(uncommitted),
            files: to(files),
        };
    }

    /// A file of `n` lines in the run folder.
    pub fn set_lines(&self, path: &str, n: u32) {
        lock(&self.0).lines.insert(path.into(), n);
    }

    pub fn set_rebase(&self, m: Merge) {
        lock(&self.0).rebase = m;
    }

    /// A gate command that fails.
    pub fn fail_gate(&self, command: &str) {
        lock(&self.0).failing.push(command.into());
    }

    /// Each `gate` call takes this long, with no lock of the fake held.
    pub fn set_gate_delay(&self, delay: Duration) {
        lock(&self.0).gate_delay = delay;
    }

    pub fn clear_gate(&self) {
        lock(&self.0).failing.clear();
    }

    /// `remove_worktrees` keeps a dirty worktree with these files.
    pub fn set_dirty(&self, files: Option<&str>) {
        lock(&self.0).dirty = files.map(Into::into);
    }

    pub fn set_input(&self, input: ReviewInput) {
        lock(&self.0).input = input;
    }

    /// The digest that `digest` returns. `None`: no digest.
    pub fn set_digest(&self, digest: Option<&str>) {
        lock(&self.0).digest = digest.map(Into::into);
    }
}

impl GitState {
    fn check(&mut self, op: &str, line: String) -> PortResult<()> {
        self.calls.push(line);
        match self.fail.get(op) {
            Some(m) => Err(m.clone()),
            None => Ok(()),
        }
    }
}

impl Git for FakeGit {
    fn merge_child(&self, _run: &str, child: &str, message: &str) -> PortResult<Merge> {
        let mut s = lock(&self.0);
        s.check("merge_child", format!("merge_child {child}"))?;
        s.merge_messages.push(message.into());
        Ok(match s.conflicts.get(child) {
            Some(files) => Merge::Conflicts(files.clone()),
            None => Merge::Clean,
        })
    }

    fn remove_child(&self, _run: &str, child: &str) -> PortResult<()> {
        lock(&self.0).check("remove_child", format!("remove_child {child}"))
    }

    fn digest(&self, _run: &str, _base: &str) -> PortResult<Option<String>> {
        Ok(lock(&self.0).digest.clone())
    }

    fn changes(&self, _run: &str, base: &str) -> PortResult<Changes> {
        let mut s = lock(&self.0);
        s.check("changes", format!("changes {base}"))?;
        Ok(s.changes.clone())
    }

    fn review_input(&self, _run: &str, base: &str) -> PortResult<ReviewInput> {
        let mut s = lock(&self.0);
        s.check("review_input", format!("review_input {base}"))?;
        Ok(s.input.clone())
    }

    fn line(&self, _run: &str, path: &str, line: u32) -> PortResult<Option<String>> {
        let mut s = lock(&self.0);
        s.check("line", format!("line {path}:{line}"))?;
        Ok(s.lines
            .get(path)
            .filter(|n| line >= 1 && line <= **n)
            .map(|_| format!("line {line}")))
    }

    fn branch(&self, _run: &str) -> PortResult<String> {
        Ok(lock(&self.0).branch.clone())
    }

    fn rename_branch(&self, _run: &str, new: &str) -> PortResult<()> {
        let mut s = lock(&self.0);
        s.check("rename", format!("rename {new}"))?;
        s.branch = new.into();
        Ok(())
    }

    fn commit(
        &self,
        _run: &str,
        paths: &[String],
        summary: &str,
        description: &str,
    ) -> PortResult<String> {
        let mut s = lock(&self.0);
        s.check(
            "commit",
            format!("commit {} | {summary} | {description}", paths.join(",")),
        )?;
        s.changes.uncommitted.clear();
        Ok(format!("c0ffee{}", s.calls.len()))
    }

    fn rebase(&self, _run: &str, base: &str) -> PortResult<Merge> {
        let mut s = lock(&self.0);
        s.check("rebase", format!("rebase {base}"))?;
        Ok(s.rebase.clone())
    }

    fn gate(&self, _run: &str, commands: &[String]) -> PortResult<Vec<GateCheck>> {
        let delay = {
            let mut s = lock(&self.0);
            s.check("gate", format!("gate {}", commands.join(" && ")))?;
            s.gate_delay
        };
        std::thread::sleep(delay);
        let s = lock(&self.0);
        Ok(commands
            .iter()
            .map(|c| {
                let passed = !s.failing.contains(c);
                GateCheck {
                    command: c.clone(),
                    passed,
                    counts: if passed {
                        "12 passed"
                    } else {
                        "1 failed, 11 passed"
                    }
                    .into(),
                }
            })
            .collect())
    }

    fn remove_worktrees(&self, _run: &str) -> PortResult<()> {
        let mut s = lock(&self.0);
        s.check("remove_worktrees", "remove_worktrees".into())?;
        match &s.dirty {
            Some(files) => Err(format!("the worktree has uncommitted changes: {files}")),
            None => Ok(()),
        }
    }
}

struct PullsState {
    branches: Branches,
    labels: Vec<String>,
    found: BTreeMap<String, u64>,
    checks: Vec<FailedCheck>,
    threads: Vec<Thread>,
    fail: Option<String>,
    calls: Vec<String>,
}

/// The forge reads of delivery. By default: branches `main` and `develop`, the labels `feat`,
/// `fix` and `engine`, no pull request.
#[derive(Clone)]
pub struct FakePulls(Arc<Mutex<PullsState>>);

impl Default for FakePulls {
    fn default() -> Self {
        let own = |l: &[&str]| l.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        Self(Arc::new(Mutex::new(PullsState {
            branches: Branches {
                names: own(&["main", "develop"]),
                default: "main".into(),
            },
            labels: own(&["feat", "fix", "engine"]),
            found: BTreeMap::new(),
            checks: Vec::new(),
            threads: Vec::new(),
            fail: None,
            calls: Vec::new(),
        })))
    }
}

impl FakePulls {
    /// An open pull request of this source branch.
    pub fn put(&self, branch: &str, number: u64) {
        lock(&self.0).found.insert(branch.into(), number);
    }

    pub fn close(&self, branch: &str) {
        lock(&self.0).found.remove(branch);
    }

    pub fn set_branches(&self, names: &[&str], default: &str) {
        lock(&self.0).branches = Branches {
            names: names.iter().map(|n| n.to_string()).collect(),
            default: default.into(),
        };
    }

    pub fn set_labels(&self, labels: &[&str]) {
        lock(&self.0).labels = labels.iter().map(|l| l.to_string()).collect();
    }

    pub fn set_checks(&self, checks: Vec<FailedCheck>) {
        lock(&self.0).checks = checks;
    }

    pub fn set_threads(&self, threads: Vec<Thread>) {
        lock(&self.0).threads = threads;
    }

    /// Every read fails with this message. `None`: they work again.
    pub fn fail_with(&self, message: Option<&str>) {
        lock(&self.0).fail = message.map(Into::into);
    }

    pub fn calls(&self) -> Vec<String> {
        lock(&self.0).calls.clone()
    }

    fn read<T>(&self, call: String, get: impl FnOnce(&PullsState) -> T) -> PortResult<T> {
        let mut s = lock(&self.0);
        s.calls.push(call);
        match &s.fail {
            Some(e) => Err(e.clone()),
            None => Ok(get(&s)),
        }
    }
}

impl Pulls for FakePulls {
    fn branches(&self) -> PortResult<Branches> {
        self.read("branches".into(), |s| s.branches.clone())
    }

    fn labels(&self) -> PortResult<Vec<String>> {
        self.read("labels".into(), |s| s.labels.clone())
    }

    fn find(&self, branch: &str) -> PortResult<Option<u64>> {
        self.read(format!("find {branch}"), |s| s.found.get(branch).copied())
    }

    fn failed_checks(&self, number: u64) -> PortResult<Vec<FailedCheck>> {
        self.read(format!("failed_checks {number}"), |s| s.checks.clone())
    }

    fn threads(&self, number: u64) -> PortResult<Vec<Thread>> {
        self.read(format!("threads {number}"), |s| s.threads.clone())
    }
}
