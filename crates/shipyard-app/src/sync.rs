//! The sync host (spec `sync`, REQ-001, REQ-005, REQ-013, REQ-014): the adapters that give the
//! engine its ports, a placeholder for the factory, and one engine for each open project.
//!
//! The engine is synchronous, like the adapters. A project engine runs its tick loop on its own
//! thread; the sync action and the import run on the thread of the caller (a blocking task).
//! Both take the same lock, so two ticks never overlap.
//!
//! The adapters build the connection adapter for each call. A secret or an address that a person
//! changes then applies at once, and a removed connection shows as a failed poll.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::time::Duration;

use shipyard_core::pickup::{ActiveRun, Automation, Ci, PrState, PullSnapshot, SyncEvent, Ticket};
use shipyard_core::run::RunState;
use shipyard_core::work_item::StatusCategory;
use shipyard_engine::ports::{
    Dispatch, ForgePort, ListQuery, Page, PortResult, Stamp, StartRequest, TrackerPort,
};
use shipyard_engine::tick::{Config, Engine, TickReport, connection_of, source_key};
use shipyard_engine::{Clock, SystemClock, import::ImportPlan};
use shipyard_forges::{CiState, ForgeKind, PullQuery, PullRequest, PullState, StateFilter};
use shipyard_store::mirror::{Mirror, SyncState};
use shipyard_trackers::WorkQuery;
use shipyard_trackers::marker;
use shipyard_trackers::work::{TrackerWrite, all_comments};

use crate::connections::{Connections, Res};

/// Items for each request. The adapters cap a page at 100.
const PAGE: usize = 100;
/// The notes that the placeholder keeps.
const MAX_NOTES: usize = 200;
/// The wait after a store error, so a broken file does not loop hot.
const STORE_RETRY: Duration = Duration::from_secs(30);

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ---------------------------------------------------------------- adapters

/// A tracker connection as the engine's port.
///
/// The claim stamp (`add-sync` REQ-009) is a comment that holds the hidden marker
/// `<!-- shipyard:claim <machine>.<first claim> -->` (`shipyard_trackers::marker`). The engine
/// writes it only when the `tracker_comment` switch is on. The stamp is not a human comment:
/// `comments` leaves it out, so `questions-loop` never sees it.
///
/// A stamp counts only when the account of this connection wrote it: every machine of the person
/// uses that account. A look-alike that another person typed is a plain comment.
///
/// The age of a stamp is the time of the tracker (`Date` header of its answer) minus the creation
/// time of the comment, so a machine with a wrong clock reads stamps as they are. The first claim
/// time rides in the marker: a refresh writes a new comment but keeps the place of the first
/// stamp, so a leftover of a lost race never ends a live run.
pub struct TrackerAdapter {
    conns: Arc<Connections>,
    id: String,
    scope: Option<String>,
    /// The account id of the connection, read once.
    account: OnceLock<String>,
}

/// A stamp is written again only when it is older than this. The stale time is 10 minutes
/// (`q:Q-021`), so a stamp that a tick refreshes each minute still never goes stale, with far fewer
/// writes to the ticket.
const REFRESH_AFTER: Duration = Duration::from_secs(180);

/// One stamp on a ticket.
struct Found {
    id: String,
    machine: String,
    /// Unix seconds, or `None` when the time does not parse. Such a stamp counts as live.
    created: Option<u64>,
    /// Unix seconds of the first claim of the machine, from the marker. Old stamps lack it.
    since: Option<u64>,
}

impl Found {
    /// The age by the clock of the tracker, `now` in Unix seconds.
    fn age(&self, now: u64) -> Duration {
        self.created.map_or(Duration::ZERO, |c| {
            Duration::from_secs(now.saturating_sub(c))
        })
    }
}

/// `machine.since` or a bare `machine`.
fn split_arg(arg: &str) -> (String, Option<u64>) {
    match arg.rsplit_once('.') {
        Some((m, n)) if !m.is_empty() => n
            .parse()
            .map_or_else(|_| (arg.to_string(), None), |n| (m.to_string(), Some(n))),
        _ => (arg.to_string(), None),
    }
}

impl TrackerAdapter {
    pub fn new(conns: Arc<Connections>, id: &str, scope: Option<String>) -> Self {
        Self {
            conns,
            id: id.into(),
            scope,
            account: OnceLock::new(),
        }
    }

    fn tracker(&self) -> PortResult<Box<dyn TrackerWrite>> {
        self.conns.tracker_write(&self.id)
    }

    /// The time of the tracker now, in Unix seconds: the local clock plus the skew that the last
    /// answer showed.
    fn now(&self) -> u64 {
        let local = SystemClock.now().as_secs() as i64;
        u64::try_from(local + self.conns.clock_skew(&self.id)).unwrap_or(0)
    }

    /// The account of the connection. shortcut: it is read once for the life of the engine. A new
    /// secret for another account takes effect with the next engine.
    fn account(&self, w: &dyn TrackerWrite) -> PortResult<String> {
        if let Some(id) = self.account.get() {
            return Ok(id.clone());
        }
        let id = w.me().map_err(|e| e.to_string())?.id;
        Ok(self.account.get_or_init(|| id).clone())
    }

    /// The stamps of a ticket, oldest first claim first. Two stamps with one time order by id, so
    /// two machines agree on the winner.
    fn found(&self, w: &dyn TrackerWrite, key: &str) -> PortResult<Vec<Found>> {
        let account = self.account(w)?;
        let mut out: Vec<Found> = all_comments(w, key)
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|c| c.author.id == account)
            .filter_map(|c| {
                let (machine, since) = split_arg(&marker::find(&c.body, CLAIM)?);
                Some(Found {
                    machine,
                    since,
                    created: epoch_secs(&c.created),
                    id: c.id,
                })
            })
            .collect();
        out.sort_by(|a, b| {
            let order = |f: &Found| (f.since.or(f.created), f.created, f.id.len(), f.id.clone());
            order(a).cmp(&order(b))
        });
        Ok(out)
    }
}

/// The marker kind of a claim stamp.
const CLAIM: &str = "claim";

impl TrackerPort for TrackerAdapter {
    fn list(&self, q: &ListQuery) -> PortResult<Page<Ticket>> {
        let page = self
            .tracker()?
            .search(&WorkQuery {
                scope: self.scope.clone(),
                updated_since: q.since.clone(),
                limit: PAGE,
                cursor: q.cursor.clone(),
                ..WorkQuery::default()
            })
            .map_err(|e| e.to_string())?;
        // With `since` a closed ticket matters: a run must see it close. Without, open ones only.
        let all = q.since.is_some();
        Ok(Page {
            items: page
                .items
                .into_iter()
                .filter(|i| all || i.status.category != StatusCategory::Done)
                .map(Ticket::new)
                .collect(),
            next: page.next,
        })
    }

    fn get(&self, key: &str) -> PortResult<Ticket> {
        let item = self.tracker()?.get(key).map_err(|e| e.to_string())?;
        Ok(Ticket::new(item))
    }

    fn comments(&self, key: &str) -> PortResult<Vec<shipyard_core::work_item::Comment>> {
        let t = self.tracker()?;
        if !t.capabilities().comments {
            return Ok(Vec::new());
        }
        let mut all = t.comments(key).map_err(|e| e.to_string())?;
        all.retain(|c| marker::find(&c.body, CLAIM).is_none());
        Ok(all)
    }

    fn can_stamp(&self) -> bool {
        self.tracker().is_ok_and(|t| t.capabilities().comments)
    }

    fn stamps(&self, key: &str) -> PortResult<Vec<Stamp>> {
        let t = self.tracker()?;
        if !t.capabilities().comments {
            return Ok(Vec::new());
        }
        let found = self.found(&*t, key)?;
        // After `found`: the answers of that read set the skew.
        let now = self.now();
        Ok(found
            .into_iter()
            .map(|f| Stamp {
                age: f.age(now),
                machine: f.machine,
            })
            .collect())
    }

    /// Add the stamp, or write it again when it is old. The new stamp goes in before the old one
    /// goes out, so the ticket never shows a gap. The new stamp keeps the first claim time.
    fn write_stamp(&self, key: &str, machine: &str) -> PortResult<()> {
        let t = self.tracker()?;
        let mine: Vec<Found> = self
            .found(&*t, key)?
            .into_iter()
            .filter(|f| f.machine == machine)
            .collect();
        let now = self.now();
        if mine.last().is_some_and(|f| f.age(now) < REFRESH_AFTER) {
            return Ok(());
        }
        let since = mine
            .first()
            .and_then(|f| f.since.or(f.created))
            .unwrap_or(now);
        t.add_comment(key, &marker::make(CLAIM, &format!("{machine}.{since}")))
            .map_err(|e| e.to_string())?;
        for old in mine {
            // An old copy that stays goes stale and does no harm: it is this machine's own.
            let _ = t.delete_comment(key, &old.id);
        }
        Ok(())
    }

    fn clear_stamp(&self, key: &str, machine: &str) -> PortResult<()> {
        let t = self.tracker()?;
        for f in self
            .found(&*t, key)?
            .into_iter()
            .filter(|f| f.machine == machine)
        {
            t.delete_comment(key, &f.id).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

/// Unix seconds of an ISO 8601 time: `2026-10-29T10:00:00Z`, with an optional fraction and a
/// `Z`, `+01:00` or `+0100` offset. `None` when the text is not one.
pub fn epoch_secs(t: &str) -> Option<u64> {
    let num = |from: usize, len: usize| -> Option<i64> { t.get(from..from + len)?.parse().ok() };
    let b = t.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || !matches!(b[10], b'T' | b' ') {
        return None;
    }
    let (y, m, d) = (num(0, 4)?, num(5, 2)?, num(8, 2)?);
    let (h, mi, s) = (num(11, 2)?, num(14, 2)?, num(17, 2)?);
    let rest = t[19..].trim_start_matches(|c: char| c == '.' || c.is_ascii_digit());
    let offset = match rest.as_bytes().first() {
        None | Some(b'Z') => 0,
        Some(&sign @ (b'+' | b'-')) => {
            let digits: String = rest[1..].chars().filter(char::is_ascii_digit).collect();
            if digits.len() != 4 {
                return None;
            }
            let secs =
                (digits[..2].parse::<i64>().ok()? * 60 + digits[2..].parse::<i64>().ok()?) * 60;
            if sign == b'+' { secs } else { -secs }
        }
        _ => return None,
    };
    // Days since the epoch from a civil date (Howard Hinnant's algorithm).
    let y = y - i64::from(m <= 2);
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let days = era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468;
    u64::try_from(days * 86_400 + h * 3600 + mi * 60 + s - offset).ok()
}

/// A forge connection and its repository as the engine's port.
pub struct ForgeAdapter {
    conns: Arc<Connections>,
    id: String,
    repo: String,
}

impl ForgeAdapter {
    pub fn new(conns: Arc<Connections>, id: &str, repo: &str) -> Self {
        Self {
            conns,
            id: id.into(),
            repo: repo.into(),
        }
    }

    /// The CI state needs one request for each open pull request.
    /// shortcut: each tick reads it again for every open pull request of the page; add a cache
    /// when a repository has many.
    fn snapshot(&self, f: &dyn shipyard_forges::Forge, p: PullRequest) -> PortResult<PullSnapshot> {
        let ci = if p.state == PullState::Open {
            f.ci_status(&self.repo, p.number)
                .map_err(|e| e.to_string())?
                .state
        } else {
            CiState::None
        };
        Ok(PullSnapshot {
            number: p.number,
            title: p.title,
            state: match p.state {
                PullState::Open => PrState::Open,
                PullState::Closed => PrState::Closed,
                PullState::Merged => PrState::Merged,
            },
            draft: p.draft,
            head_sha: p.head_sha,
            url: p.url,
            ci: match ci {
                CiState::None => Ci::None,
                CiState::Pending => Ci::Pending,
                CiState::Passing => Ci::Passing,
                CiState::Failing => Ci::Failing,
            },
            // The adapter reads no reviews yet.
            changes_requested: false,
            updated: p.updated,
        })
    }
}

impl ForgePort for ForgeAdapter {
    fn pulls(&self, q: &ListQuery) -> PortResult<Page<PullSnapshot>> {
        let f = self.conns.forge(&self.id)?;
        let page = f
            .list_pulls(
                &self.repo,
                &PullQuery {
                    state: if q.since.is_some() {
                        StateFilter::All
                    } else {
                        StateFilter::Open
                    },
                    limit: PAGE,
                    cursor: q.cursor.clone(),
                },
            )
            .map_err(|e| e.to_string())?;
        let since = q.since.as_deref();
        // Newest update first, except Azure DevOps: an old item on the page ends the walk.
        // shortcut: ISO strings compare as text, so a time zone offset can misplace one by hours.
        let ordered = f.kind() != ForgeKind::AzureDevOps;
        let done =
            ordered && since.is_some_and(|s| page.items.iter().any(|p| p.updated.as_str() < s));
        let mut items = Vec::new();
        for p in page.items {
            // An open pull request is read again: a CI change does not move its update time.
            if p.state == PullState::Open || since.is_none_or(|s| p.updated.as_str() >= s) {
                items.push(self.snapshot(&*f, p)?);
            }
        }
        Ok(Page {
            items,
            next: if done { None } else { page.next },
        })
    }

    fn pull(&self, number: u64) -> PortResult<PullSnapshot> {
        let f = self.conns.forge(&self.id)?;
        let p = f.pull(&self.repo, number).map_err(|e| e.to_string())?;
        self.snapshot(&*f, p)
    }
}

// ---------------------------------------------------------------- the placeholder

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoteKind {
    WouldStart,
    Stopped,
    Comment,
    Pull,
}

/// What the placeholder recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Note {
    pub kind: NoteKind,
    pub key: String,
    pub text: String,
}

type Listener = Box<dyn Fn() + Send + Sync>;

/// The factory is W6. Until it lands, this holds its place: a started run is a record that no
/// agent runs, and it counts as an active run so that the claim and the limits stay true. It keeps
/// the global kill switch. W6 replaces it with a `Dispatch` that runs agents.
#[derive(Default)]
pub struct Placeholder {
    kill: AtomicBool,
    runs: Mutex<Vec<ActiveRun>>,
    notes: Mutex<VecDeque<Note>>,
    tick: OnceLock<Listener>,
}

impl Placeholder {
    pub fn set_kill_switch(&self, on: bool) {
        self.kill.store(on, Ordering::SeqCst);
    }

    /// The last records, oldest first.
    pub fn notes(&self) -> Vec<Note> {
        lock(&self.notes).iter().cloned().collect()
    }

    fn note(&self, kind: NoteKind, key: &str, text: String) {
        let mut notes = lock(&self.notes);
        if notes.len() == MAX_NOTES {
            notes.pop_front();
        }
        notes.push_back(Note {
            kind,
            key: key.into(),
            text,
        });
    }

    fn changed(&self) {
        if let Some(f) = self.tick.get() {
            f();
        }
    }
}

impl Dispatch for Placeholder {
    fn kill_switch(&self) -> bool {
        self.kill.load(Ordering::SeqCst)
    }

    fn active_runs(&self) -> Vec<ActiveRun> {
        lock(&self.runs).clone()
    }

    fn start(&self, r: &StartRequest) -> Result<(), String> {
        let key = &r.ticket.item.key;
        {
            let mut runs = lock(&self.runs);
            if !runs.iter().any(|a| a.project == r.project && a.key == *key) {
                runs.push(ActiveRun {
                    run_id: format!("placeholder:{}:{key}", r.project),
                    project: r.project.clone(),
                    key: key.clone(),
                    state: RunState::Queued,
                    status: r.status.clone(),
                    pr: None,
                });
            }
        }
        self.note(
            NoteKind::WouldStart,
            key,
            format!("would start a run on {key}"),
        );
        Ok(())
    }

    fn stop(&self, run_id: &str, reason: &str) -> Result<(), String> {
        let mut runs = lock(&self.runs);
        if let Some(at) = runs.iter().position(|a| a.run_id == run_id) {
            let run = runs.remove(at);
            drop(runs);
            self.note(
                NoteKind::Stopped,
                &run.key,
                format!("stopped {}: {reason}", run.key),
            );
        }
        Ok(())
    }

    fn event(&self, event: &SyncEvent) -> Result<(), String> {
        match event {
            SyncEvent::Tick { .. } => self.changed(),
            SyncEvent::Comment { key, .. } => {
                self.note(NoteKind::Comment, key, format!("new comment on {key}"))
            }
            SyncEvent::Pr(e) => self.note(
                NoteKind::Pull,
                &e.number.to_string(),
                format!("pull request {} {:?}", e.number, e.kind),
            ),
        }
        Ok(())
    }
}

// ---------------------------------------------------------------- the host

/// What one project engine needs. The host rebuilds the engine when it changes, except the
/// automation: that one applies in place.
#[derive(Debug, Clone, PartialEq)]
pub struct Plan {
    pub project: String,
    pub tracker: String,
    /// The container of the tracker (Jira project key, `owner/repo`). `None` lists the account.
    pub scope: Option<String>,
    /// The forge connection id and the repository slug.
    pub forge: Option<(String, String)>,
    pub automation: Automation,
}

impl Plan {
    fn same_engine(&self, other: &Plan) -> bool {
        (&self.tracker, &self.scope, &self.forge) == (&other.tracker, &other.scope, &other.forge)
    }

    /// The mirror key of the tracker rows: its cursor, claims and tickets belong to this
    /// connection and this container only.
    pub fn tracker_source(&self) -> String {
        source_key(&self.tracker, self.scope.as_deref())
    }

    /// The mirror key of the forge rows.
    pub fn forge_source(&self) -> Option<String> {
        self.forge
            .as_ref()
            .map(|(id, repo)| source_key(id, Some(repo)))
    }

    /// `(connection id, mirror key)` of each source that the engine polls.
    pub fn sources(&self) -> Vec<(String, String)> {
        std::iter::once((self.tracker.clone(), self.tracker_source()))
            .chain(
                self.forge
                    .iter()
                    .zip(self.forge_source())
                    .map(|((id, _), source)| (id.clone(), source)),
            )
            .collect()
    }
}

pub struct Running {
    plan: Mutex<Plan>,
    engine: Mutex<Engine>,
    ticking: AtomicBool,
    stop: AtomicBool,
    wake: (Mutex<u64>, Condvar),
    pending: Mutex<Option<ImportPlan>>,
}

impl Running {
    pub fn plan(&self) -> Plan {
        lock(&self.plan).clone()
    }

    pub fn is_ticking(&self) -> bool {
        self.ticking.load(Ordering::SeqCst)
    }

    fn wake_up(&self) {
        *lock(&self.wake.0) += 1;
        self.wake.1.notify_all();
    }

    /// One tick, now or when due. The thread of the caller waits for the engine lock.
    pub fn tick(&self, force: bool) -> Res<TickReport> {
        let mut e = lock(&self.engine);
        self.ticking.store(true, Ordering::SeqCst);
        let out = e.tick(force).map_err(|e| e.to_string()).map(|mut r| {
            // A view knows the connection, not its mirror key.
            for c in r
                .polled
                .iter_mut()
                .chain(r.failed.iter_mut().map(|f| &mut f.0))
            {
                *c = connection_of(c).to_string();
            }
            r
        });
        self.ticking.store(false, Ordering::SeqCst);
        drop(e);
        // The timers moved: the loop computes its wait again.
        self.wake_up();
        out
    }

    /// The automation file changed. The new interval counts from the next poll.
    pub fn set_automation(&self, auto: Automation) {
        lock(&self.plan).automation = auto.clone();
        lock(&self.engine).set_automation(auto);
        self.wake_up();
    }

    /// Run `f` on the engine. It waits for a tick in progress.
    pub fn with<T>(&self, f: impl FnOnce(&Engine) -> shipyard_engine::Result<T>) -> Res<T> {
        f(&lock(&self.engine)).map_err(|e| e.to_string())
    }

    /// Read the open tickets of the tracker and keep the plan until `import`. Nothing is written
    /// (REQ-015). Returns the count to show.
    pub fn plan_import(&self) -> Res<usize> {
        let plan = self.with(|e| e.import_plan())?;
        let count = plan.count();
        *lock(&self.pending) = Some(plan);
        Ok(count)
    }

    /// Write the planned import to the mirror. Returns the count written.
    pub fn import(&self) -> Res<usize> {
        let plan = lock(&self.pending)
            .take()
            .ok_or("no import is planned: read the backlog first")?;
        self.with(|e| e.import(&plan))
    }
}

/// Wait up to `wait`, and return early when the generation moved or the engine stops.
fn nap(r: &Running, seen: u64, wait: Duration) {
    let g = lock(&r.wake.0);
    let _ = r.wake.1.wait_timeout_while(g, wait, |now| {
        *now == seen && !r.stop.load(Ordering::SeqCst)
    });
}

/// The loop of a project engine: tick when due, then wait for the due time, a wake-up or the stop.
/// `Engine::run` holds the engine for the whole loop, so the sync action could not tick.
fn run_loop(r: Arc<Running>) {
    while !r.stop.load(Ordering::SeqCst) {
        let seen = *lock(&r.wake.0);
        let wait = {
            let mut e = lock(&r.engine);
            if SystemClock.now() >= e.next_due() {
                r.ticking.store(true, Ordering::SeqCst);
                let res = e.tick(false);
                r.ticking.store(false, Ordering::SeqCst);
                if let Err(err) = res {
                    eprintln!("sync: {err}");
                    STORE_RETRY
                } else {
                    e.next_due().saturating_sub(SystemClock.now())
                }
            } else {
                e.next_due().saturating_sub(SystemClock.now())
            }
        };
        nap(&r, seen, wait);
    }
}

pub struct SyncHost {
    mirror: PathBuf,
    conns: Arc<Connections>,
    machine: String,
    pub dispatch: Arc<Placeholder>,
    /// Run each engine on its own thread. A test turns it off and ticks by hand.
    background: bool,
    engines: Mutex<HashMap<String, Arc<Running>>>,
}

/// A stable id of this installation. Two machines never share it.
fn machine_id(dir: &Path) -> String {
    let file = dir.join("machine-id");
    if let Ok(id) = std::fs::read_to_string(&file) {
        let id = id.trim();
        if !id.is_empty() {
            return id.into();
        }
    }
    let nanos = SystemClock.now().as_nanos();
    let id = format!("m-{nanos:x}-{:x}", std::process::id());
    let _ = std::fs::write(&file, &id);
    id
}

impl SyncHost {
    pub fn new(dir: &Path, conns: Arc<Connections>, background: bool) -> Self {
        Self {
            mirror: dir.join("mirror.sqlite"),
            conns,
            machine: machine_id(dir),
            dispatch: Arc::new(Placeholder::default()),
            background,
            engines: Mutex::new(HashMap::new()),
        }
    }

    /// Called after each tick and each change of the mirror. The app sends the `sync-tick` event.
    /// Only the first call counts.
    pub fn on_change(&self, f: impl Fn() + Send + Sync + 'static) {
        let _ = self.dispatch.tick.set(Box::new(f));
    }

    pub fn changed(&self) {
        self.dispatch.changed();
    }

    /// A new connection to the mirror file. Readers need no engine.
    pub fn mirror(&self) -> shipyard_store::Result<Mirror> {
        Mirror::open(&self.mirror)
    }

    pub fn mirror_exists(&self) -> bool {
        self.mirror.exists()
    }

    pub fn running(&self, project: &str) -> Option<Arc<Running>> {
        lock(&self.engines).get(project).cloned()
    }

    /// Make the engine of `project` match the plan. `None` stops it. An unchanged plan only
    /// applies the automation.
    pub fn apply(&self, project: &str, plan: Option<Plan>) -> Res<()> {
        let mut engines = lock(&self.engines);
        let Some(plan) = plan else {
            if let Some(old) = engines.remove(project) {
                old.stop.store(true, Ordering::SeqCst);
                old.wake_up();
            }
            return Ok(());
        };
        // Only the open project polls. The engine of another project stops: it would poll and
        // pick up work for a project that nobody works in.
        engines.retain(|id, old| {
            let keep = id == project;
            if !keep {
                old.stop.store(true, Ordering::SeqCst);
                old.wake_up();
            }
            keep
        });
        if let Some(old) = engines.get(project).cloned() {
            if old.plan().same_engine(&plan) {
                // The new rules wait for a tick in progress. The map must not wait with them.
                drop(engines);
                if old.plan().automation != plan.automation {
                    old.set_automation(plan.automation);
                }
                return Ok(());
            }
            old.stop.store(true, Ordering::SeqCst);
            old.wake_up();
        }
        let r = Arc::new(self.build(&plan)?);
        engines.insert(project.into(), r.clone());
        if self.background {
            std::thread::spawn(move || run_loop(r));
        }
        Ok(())
    }

    fn build(&self, plan: &Plan) -> Res<Running> {
        let mut cfg = Config::new(&self.machine, &plan.project, &plan.tracker_source());
        let tracker = TrackerAdapter::new(self.conns.clone(), &plan.tracker, plan.scope.clone());
        let forge: Option<Box<dyn ForgePort>> = plan.forge.as_ref().map(|(id, repo)| {
            cfg.forge = plan.forge_source();
            Box::new(ForgeAdapter::new(self.conns.clone(), id, repo)) as Box<dyn ForgePort>
        });
        let mirror = Mirror::open(&self.mirror).map_err(|e| e.to_string())?;
        let engine = Engine::new(
            cfg,
            plan.automation.clone(),
            mirror,
            Box::new(tracker),
            forge,
            self.dispatch.clone(),
            Arc::new(SystemClock),
        );
        Ok(Running {
            plan: Mutex::new(plan.clone()),
            engine: Mutex::new(engine),
            ticking: AtomicBool::new(false),
            stop: AtomicBool::new(false),
            wake: (Mutex::new(0), Condvar::new()),
            pending: Mutex::new(None),
        })
    }

    /// The sync state of each connection of the project, from the mirror. It never waits for a
    /// tick in progress.
    pub fn states(&self, project: &str) -> Res<Vec<(String, SyncState, bool)>> {
        let Some(r) = self.running(project) else {
            return Ok(Vec::new());
        };
        if !self.mirror_exists() {
            return Ok(Vec::new());
        }
        let mirror = self.mirror().map_err(|e| e.to_string())?;
        let ticking = r.is_ticking();
        r.plan()
            .sources()
            .into_iter()
            .map(|(id, source)| {
                let state = mirror.state(&source).map_err(|e| e.to_string())?;
                Ok((id, state, ticking))
            })
            .collect()
    }
}

// ---------------------------------------------------------------- remote address rules

/// The repository slug of a remote address: `owner/repo`, `group/sub/project`, or
/// `project/repo` for Azure DevOps. `None` when the address names no repository.
pub fn repo_slug(url: &str) -> Option<String> {
    let url = url.trim();
    // `ssh://host/path`, `https://host/path` or `user@host:path`.
    let (host, path) = match url.split_once("://") {
        Some((_, rest)) => rest.split_once('/')?,
        None => url.split_once(':')?,
    };
    let host = host.rsplit('@').next().unwrap_or(host);
    let path = path.trim_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    let azure_ssh =
        host.ends_with("ssh.dev.azure.com") || host.ends_with("vs-ssh.visualstudio.com");
    let out = if let Some(i) = parts.iter().position(|p| *p == "_git") {
        // `org/project/_git/repo`
        let project = parts.get(i.checked_sub(1)?)?;
        format!("{project}/{}", parts.get(i + 1)?)
    } else if azure_ssh && parts.len() == 4 && parts[0] == "v3" {
        format!("{}/{}", parts[2], parts[3])
    } else if parts.len() >= 2 {
        parts.join("/")
    } else {
        return None;
    };
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_iso_time_gives_unix_seconds_in_every_form_a_tracker_writes() {
        // 2026-10-29T10:00:00Z, in each form.
        let t = shipyard_engine::iso(Duration::from_secs(1_793_268_000));
        assert_eq!(t, "2026-10-29T10:00:00Z");
        for text in [
            "2026-10-29T10:00:00Z",
            "2026-10-29T10:00:00.123Z",
            "2026-10-29T11:00:00.000+0100",
            "2026-10-29T11:00:00+01:00",
            "2026-10-29T05:00:00-05:00",
        ] {
            assert_eq!(epoch_secs(text), Some(1_793_268_000), "{text}");
        }
        assert_eq!(epoch_secs("1970-01-01T00:00:00Z"), Some(0));
        for bad in ["", "yesterday", "2026-10-29", "2026-10-29T10:00:00x"] {
            assert_eq!(epoch_secs(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_remote_address_gives_the_repository_slug() {
        for (url, slug) in [
            ("https://github.com/acme/web.git", Some("acme/web")),
            ("git@github.com:acme/web.git", Some("acme/web")),
            ("ssh://git@host.example/acme/web", Some("acme/web")),
            (
                "https://gitlab.com/group/sub/proj.git",
                Some("group/sub/proj"),
            ),
            (
                "https://dev.azure.com/org/proj/_git/repo",
                Some("proj/repo"),
            ),
            ("git@ssh.dev.azure.com:v3/org/proj/repo", Some("proj/repo")),
            ("https://github.com/", None),
            ("/local/path", None),
        ] {
            assert_eq!(repo_slug(url).as_deref(), slug, "{url}");
        }
    }

    #[test]
    fn the_placeholder_counts_a_started_run_and_forgets_a_stopped_one() {
        use shipyard_core::work_item::{Status, WorkItem, WorkKind};
        let item = WorkItem {
            key: "ACME-1".into(),
            title: "t".into(),
            description: String::new(),
            kind: WorkKind::Task,
            status: Status {
                name: "To Do".into(),
                category: StatusCategory::Todo,
            },
            assignee: None,
            labels: vec![],
            parent: None,
            url: String::new(),
            updated: String::new(),
            time: None,
        };
        let p = Placeholder::default();
        let req = StartRequest {
            project: "acme".into(),
            ticket: Ticket::new(item),
            status: "To Do".into(),
            machine: "m".into(),
            stamped: false,
        };
        p.start(&req).unwrap();
        p.start(&req).unwrap();
        let runs = p.active_runs();
        assert_eq!(runs.len(), 1, "one run for each ticket");
        assert!(!p.kill_switch());
        p.set_kill_switch(true);
        assert!(p.kill_switch());
        p.stop(&runs[0].run_id, "ticket terminal").unwrap();
        assert!(p.active_runs().is_empty());
        let kinds: Vec<_> = p.notes().iter().map(|n| n.kind).collect();
        assert_eq!(
            kinds,
            [
                NoteKind::WouldStart,
                NoteKind::WouldStart,
                NoteKind::Stopped
            ]
        );
    }
}
