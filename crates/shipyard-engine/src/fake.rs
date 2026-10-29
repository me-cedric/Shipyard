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
use crate::ports::{
    Dispatch, ForgePort, ListQuery, Page, PortResult, Stamp, StartRequest, TrackerPort,
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
