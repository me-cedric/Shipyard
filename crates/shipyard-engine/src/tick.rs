//! The tick loop (spec `sync`, REQ-001, REQ-002, REQ-003, REQ-014).
//!
//! One tick runs these steps in this order: fetch, compare, update the mirror, hand off events,
//! stop runs, pick up new work. The engine never picks up before the stop step ends.
//! One timer per connection decides which connection a tick polls. A failed poll keeps the mirror,
//! and the next poll of that connection comes later (`backoff`).

use std::collections::BTreeSet;
use std::sync::Arc;
use std::time::Duration;

use shipyard_core::pickup::{
    ActiveRun, Automation, MIN_INTERVAL, PickupInput, PullSnapshot, REASON_CLAIM_LOST, SyncEvent,
    Ticket, changed_tickets, diff_pulls, matches, pickup, stops,
};
use shipyard_store::mirror::{Mirror, Poll, SyncState};

use crate::claims::{Claims, Outcome};
use crate::handoff::{comment_events, deliver};
use crate::ports::{Dispatch, ForgePort, ListQuery, StartRequest, TrackerPort, collect_pages};
use crate::{Clock, Result, iso};

/// A poll asks for items updated since the last good poll, minus this margin. It covers clock
/// drift and the time zone of Jira (`WorkQuery::updated_since` in `shipyard-trackers`).
const MARGIN: Duration = Duration::from_secs(120);
/// The longest wait after a failure, unless the interval is longer.
const MAX_BACKOFF: Duration = Duration::from_secs(300);
/// Jitter is up to this share of the interval, added to it.
const JITTER_SHARE: f64 = 0.2;

/// Splits a connection id from its container in a mirror key. A connection id holds no `@`.
const SCOPE_SEP: char = '@';

/// The key of the rows of one connection and one container (Jira project key, `owner/repo`) in the
/// mirror: its cursor, claims and tickets. Two projects on one connection with two containers get
/// two keys, so a poll of one never moves the cursor of the other.
pub fn source_key(connection: &str, scope: Option<&str>) -> String {
    match scope {
        Some(scope) => format!("{connection}{SCOPE_SEP}{scope}"),
        None => connection.into(),
    }
}

/// The connection id of a mirror key.
pub fn connection_of(source: &str) -> &str {
    source.split(SCOPE_SEP).next().unwrap_or(source)
}

#[derive(Debug, Clone)]
pub struct Config {
    /// Names this machine in the stamps.
    pub machine: String,
    pub project: String,
    /// The mirror key of the tracker: `source_key` of its connection and container.
    pub tracker: String,
    /// The mirror key of the forge.
    pub forge: Option<String>,
    /// A stamp that nobody refreshed for this long is stale (`q:Q-021`, working assumption).
    pub stale: Duration,
    /// A tick reads at most this many pages from one connection. The import reads them all.
    pub max_pages: u32,
}

impl Config {
    pub fn new(machine: &str, project: &str, tracker: &str) -> Self {
        Self {
            machine: machine.into(),
            project: project.into(),
            tracker: tracker.into(),
            forge: None,
            stale: Duration::from_secs(600),
            max_pages: 20,
        }
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct TickReport {
    /// The connections that this tick polled with success.
    pub polled: Vec<String>,
    /// `(connection, message)`. The mirror stays as it was.
    pub failed: Vec<(String, String)>,
    /// New and changed mirror rows.
    pub changed: u32,
    /// Events that the factory took.
    pub delivered: u32,
    /// Run ids.
    pub stopped: Vec<String>,
    /// Ticket keys.
    pub started: Vec<String>,
    /// Ticket keys that another machine holds.
    pub lost: Vec<String>,
    pub errors: Vec<String>,
}

/// The sync state of one connection for Settings / Connections (REQ-013).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceState {
    pub source: String,
    pub state: SyncState,
    /// When the next poll is due, as time since the epoch.
    pub next: Duration,
}

/// The wait after `failures` failed polls in a row: the interval doubles for each one, up to
/// 5 minutes (or the interval, when it is longer).
pub fn backoff(interval: Duration, failures: u32) -> Duration {
    interval
        .saturating_mul(2u32.saturating_pow(failures))
        .min(interval.max(MAX_BACKOFF))
}

pub struct Engine {
    pub(crate) cfg: Config,
    pub(crate) auto: Automation,
    pub(crate) mirror: Mirror,
    pub(crate) tracker: Box<dyn TrackerPort>,
    pub(crate) forge: Option<Box<dyn ForgePort>>,
    pub(crate) dispatch: Arc<dyn Dispatch>,
    pub(crate) clock: Arc<dyn Clock>,
    /// A number in `[0, 1)`.
    jitter: Box<dyn FnMut() -> f64 + Send>,
    tracker_next: Duration,
    forge_next: Duration,
}

/// A small generator for the default jitter. It needs no quality: it spreads the polls of many
/// machines.
fn time_jitter() -> Box<dyn FnMut() -> f64 + Send> {
    let mut x = crate::SystemClock.now().subsec_nanos() as u64 | 1;
    Box::new(move || {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        (x >> 11) as f64 / (1u64 << 53) as f64
    })
}

impl Engine {
    /// `forge` is used only when `cfg.forge` names its connection.
    pub fn new(
        cfg: Config,
        auto: Automation,
        mirror: Mirror,
        tracker: Box<dyn TrackerPort>,
        forge: Option<Box<dyn ForgePort>>,
        dispatch: Arc<dyn Dispatch>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            cfg,
            auto,
            mirror,
            tracker,
            forge,
            dispatch,
            clock,
            jitter: time_jitter(),
            tracker_next: Duration::ZERO,
            forge_next: Duration::ZERO,
        }
    }

    /// Replace the jitter source. A test uses a fixed one.
    pub fn with_jitter(mut self, jitter: impl FnMut() -> f64 + Send + 'static) -> Self {
        self.jitter = Box::new(jitter);
        self
    }

    pub fn mirror(&self) -> &Mirror {
        &self.mirror
    }

    /// The file changed. The new interval counts from the next poll.
    pub fn set_automation(&mut self, auto: Automation) {
        self.auto = auto;
    }

    /// The interval of the file, never under the floor (REQ-002).
    fn interval(&self) -> Duration {
        Duration::from_secs(u64::from(self.auto.interval.max(MIN_INTERVAL)))
    }

    fn after_ok(&mut self) -> Duration {
        let interval = self.interval();
        let jitter = interval.mul_f64(JITTER_SHARE * (self.jitter)().clamp(0.0, 1.0));
        self.clock.now() + interval + jitter
    }

    fn forge_source(&self) -> Option<&str> {
        self.forge.as_ref().and(self.cfg.forge.as_deref())
    }

    /// When the next poll of any connection is due.
    pub fn next_due(&self) -> Duration {
        match self.forge_source() {
            Some(_) => self.tracker_next.min(self.forge_next),
            None => self.tracker_next,
        }
    }

    pub fn states(&self) -> Result<Vec<SourceState>> {
        let mut out = vec![SourceState {
            source: self.cfg.tracker.clone(),
            state: self.mirror.state(&self.cfg.tracker)?,
            next: self.tracker_next,
        }];
        if let Some(f) = self.forge_source() {
            out.push(SourceState {
                source: f.into(),
                state: self.mirror.state(f)?,
                next: self.forge_next,
            });
        }
        Ok(out)
    }

    /// The sync action: poll every connection now. The timers restart (REQ-013).
    pub fn sync_now(&mut self) -> Result<TickReport> {
        self.tick(true)
    }

    /// Run ticks until `sleep` returns `false`. `sleep` waits for the given time, and returns
    /// `false` to stop the loop. A store error ends the loop: the caller logs it and starts again.
    pub fn run(&mut self, mut sleep: impl FnMut(Duration) -> bool) -> Result<()> {
        loop {
            self.tick(false)?;
            let wait = self.next_due().saturating_sub(self.clock.now());
            if !sleep(wait) {
                return Ok(());
            }
        }
    }

    /// One tick. With `force`, every connection is polled, due or not.
    pub fn tick(&mut self, force: bool) -> Result<TickReport> {
        let now = self.clock.now();
        let mut rep = TickReport::default();
        // 1 to 3: fetch, compare, update the mirror.
        if force || now >= self.tracker_next {
            self.poll_tracker(&mut rep)?;
        }
        if self.forge_source().is_some() && (force || now >= self.forge_next) {
            self.poll_forge(&mut rep)?;
        }
        // 4: hand off.
        rep.delivered = deliver(&self.mirror, &*self.dispatch, &mut rep.errors)?;
        // 5 and 6: stop, then pick up.
        self.stop_runs(&mut rep)?;
        self.pick_up(&mut rep)?;
        self.heartbeat(&mut rep)?;
        let tick = SyncEvent::Tick {
            at: self.clock.now().as_secs(),
            changed: rep.changed,
        };
        if let Err(e) = self.dispatch.event(&tick) {
            rep.errors.push(format!("tick event: {e}"));
        }
        Ok(rep)
    }

    fn runs(&self) -> Vec<ActiveRun> {
        self.dispatch
            .active_runs()
            .into_iter()
            .filter(|r| r.project == self.cfg.project)
            .collect()
    }

    fn fail(
        &mut self,
        source: &str,
        forge: bool,
        message: String,
        rep: &mut TickReport,
    ) -> Result<()> {
        self.mirror.mark_failed(source, &message)?;
        let n = self.mirror.state(source)?.failures;
        let next = self.clock.now() + backoff(self.interval(), n);
        if forge {
            self.forge_next = next;
        } else {
            self.tracker_next = next;
        }
        rep.failed.push((source.into(), message));
        Ok(())
    }

    /// The `updated since` text for the next poll, from the last good poll.
    fn since(state: &SyncState) -> Option<String> {
        state
            .last_ok
            .map(|t| iso(Duration::from_secs(t).saturating_sub(MARGIN)))
    }

    fn poll_tracker(&mut self, rep: &mut TickReport) -> Result<()> {
        let src = self.cfg.tracker.clone();
        let started = self.clock.now();
        let since = Self::since(&self.mirror.state(&src)?);
        let fetched = collect_pages(self.cfg.max_pages, |cursor| {
            self.tracker.list(&ListQuery {
                since: since.clone(),
                cursor,
            })
        });
        let (mut fetched, truncated) = match fetched {
            Ok(v) => v,
            Err(e) => return self.fail(&src, false, e, rep),
        };
        if truncated {
            rep.errors.push(format!(
                "{src}: more than {} pages: import the backlog to read the rest",
                self.cfg.max_pages
            ));
        }
        // A cut-off list leaves items unread. The cursor stays, so no unread item falls behind it.
        let at = (!truncated).then_some(started.as_secs());
        let known = self.mirror.tickets(&src)?;

        // The tickets that matter most must be current, whether the list returned them or not.
        let claims = self.mirror.claims(&src)?;
        let active: BTreeSet<String> = self
            .runs()
            .into_iter()
            .map(|r| r.key)
            .chain(claims.into_iter().map(|c| c.key))
            .collect();
        let mut watched = active.clone();
        watched.extend(self.mirror.adopted(&src)?);
        for key in watched {
            if fetched.iter().any(|t| t.item.key == key) {
                continue;
            }
            match self.tracker.get(&key) {
                Ok(t) => fetched.push(t),
                Err(e) => rep.errors.push(format!("{key}: {e}")),
            }
        }
        let changed: Vec<Ticket> = changed_tickets(&known, &fetched)
            .into_iter()
            .cloned()
            .collect();

        let (mut events, mut seen) = (Vec::new(), Vec::new());
        for key in &active {
            match self.tracker.comments(key) {
                Ok(comments) => {
                    let (ev, ids) = comment_events(
                        key,
                        &comments,
                        &self.mirror.seen(&src, key)?,
                        &self.mirror.questions(&src, key)?,
                    );
                    events.extend(ev);
                    seen.push((key.clone(), ids));
                }
                Err(e) => rep.errors.push(format!("{key}: {e}")),
            }
        }
        self.mirror.commit(
            &src,
            &Poll {
                tickets: &changed,
                pulls: &[],
                seen: &seen,
                events: &events,
                at,
            },
        )?;
        rep.changed += changed.len() as u32;
        rep.polled.push(src);
        self.tracker_next = self.after_ok();
        Ok(())
    }

    fn poll_forge(&mut self, rep: &mut TickReport) -> Result<()> {
        let (Some(src), Some(forge)) = (self.cfg.forge.clone(), self.forge.as_deref()) else {
            return Ok(());
        };
        let started = self.clock.now();
        let state = self.mirror.state(&src)?;
        let since = Self::since(&state);
        let fetched = collect_pages(self.cfg.max_pages, |cursor| {
            forge.pulls(&ListQuery {
                since: since.clone(),
                cursor,
            })
        });
        let (mut fetched, truncated) = match fetched {
            Ok(v) => v,
            Err(e) => return self.fail(&src, true, e, rep),
        };
        if truncated {
            rep.errors.push(format!(
                "{src}: more than {} pages: the rest waits for the next poll",
                self.cfg.max_pages
            ));
        }
        let at = (!truncated).then_some(started.as_secs());
        let known = self.mirror.pulls(&src)?;
        // A run needs its pull request current, even when the list left it out.
        let wanted: Vec<u64> = self.runs().into_iter().filter_map(|r| r.pr).collect();
        for n in &wanted {
            if fetched.iter().all(|p| p.number != *n) {
                match forge.pull(*n) {
                    Ok(p) => fetched.push(p),
                    Err(e) => rep.errors.push(format!("pr {n}: {e}")),
                }
            }
        }
        let mut events = diff_pulls(&known, &fetched);
        if state.last_ok.is_none() {
            // The first read of a forge is a baseline: only the pull requests of runs are news.
            events.retain(|e| wanted.contains(&e.number));
        }
        let changed: Vec<PullSnapshot> = fetched
            .into_iter()
            .filter(|f| known.iter().find(|k| k.number == f.number) != Some(f))
            .collect();
        let events: Vec<SyncEvent> = events.into_iter().map(SyncEvent::Pr).collect();
        self.mirror.commit(
            &src,
            &Poll {
                tickets: &[],
                pulls: &changed,
                seen: &[],
                events: &events,
                at,
            },
        )?;
        rep.changed += changed.len() as u32;
        rep.polled.push(src);
        self.forge_next = self.after_ok();
        Ok(())
    }

    fn claims(&self) -> Claims<'_> {
        Claims {
            mirror: &self.mirror,
            tracker: &*self.tracker,
            source: &self.cfg.tracker,
            machine: &self.cfg.machine,
            stale: self.cfg.stale,
            stamp: self.auto.writes.stamp_allowed() && self.tracker.can_stamp(),
            now: self.clock.now(),
        }
    }

    /// Stop each run whose ticket is terminal, except a run whose pull request merged.
    fn stop_runs(&self, rep: &mut TickReport) -> Result<()> {
        let tickets = self.mirror.tickets(&self.cfg.tracker)?;
        let (pulls, forge_ok) = match self.forge_source() {
            Some(f) => (self.mirror.pulls(f)?, self.mirror.state(f)?.failures == 0),
            None => (Vec::new(), true),
        };
        // With a failed forge poll the mirror may miss a merge. A run with a pull request waits.
        let runs: Vec<ActiveRun> = self
            .runs()
            .into_iter()
            .filter(|r| forge_ok || r.pr.is_none())
            .collect();
        for stop in stops(&self.auto, &runs, &tickets, &pulls) {
            match self.dispatch.stop(&stop.run_id, &stop.reason) {
                Ok(()) => {
                    rep.stopped.push(stop.run_id.clone());
                    if let Some(r) = runs.iter().find(|r| r.run_id == stop.run_id) {
                        let released = self.claims().release(&r.key)?;
                        rep.errors.extend(released.stamp_error);
                    }
                }
                Err(e) => rep.errors.push(format!("stop {}: {e}", stop.run_id)),
            }
        }
        Ok(())
    }

    fn pick_up(&self, rep: &mut TickReport) -> Result<()> {
        let src = &self.cfg.tracker;
        // The mirror is stale after a failed poll. Do not start work from it.
        if self.mirror.state(src)?.failures > 0 {
            return Ok(());
        }
        let tickets = self.mirror.tickets(src)?;
        let active = self.dispatch.active_runs();
        let held: Vec<String> = self
            .mirror
            .claims(src)?
            .into_iter()
            .map(|c| c.key)
            .collect();
        let picks: Vec<Ticket> = pickup(&PickupInput {
            auto: &self.auto,
            project: &self.cfg.project,
            tickets: &tickets,
            active: &active,
            held: &held,
            kill_switch: self.dispatch.kill_switch(),
            reserved: self.dispatch.reserved(),
        })
        .into_iter()
        .cloned()
        .collect();
        for pick in picks {
            let key = pick.item.key.clone();
            // The mirror is up to one interval old. Read the ticket again before a claim.
            let ticket = match self.tracker.get(&key) {
                Ok(t) => t,
                Err(e) => {
                    rep.errors.push(format!("{key}: {e}"));
                    continue;
                }
            };
            if ticket != pick {
                self.mirror
                    .put_tickets(src, std::slice::from_ref(&ticket))?;
            }
            if !matches(&self.auto.pickup, &ticket) || self.auto.terminal(&ticket.item.status) {
                continue;
            }
            let status = ticket.item.status.name.clone();
            match self.claims().claim(&key, &status)? {
                Outcome::Won { stamped } => {
                    self.baseline(&key)?;
                    let request = StartRequest {
                        project: self.cfg.project.clone(),
                        ticket,
                        status,
                        machine: self.cfg.machine.clone(),
                        stamped,
                    };
                    match self.dispatch.start(&request) {
                        Ok(()) => rep.started.push(key),
                        Err(e) => {
                            let released = self.claims().release(&key)?;
                            rep.errors.extend(released.stamp_error);
                            rep.errors.push(format!("start {key}: {e}"));
                        }
                    }
                }
                Outcome::Held => {}
                Outcome::Lost { .. } => rep.lost.push(key),
                Outcome::Failed(e) => rep.errors.push(format!("claim {key}: {e}")),
            }
        }
        Ok(())
    }

    /// The comments that a ticket has when its run starts are not new. Remember them now, so a
    /// comment that comes before the next poll is still news. An answer to a marker is sent.
    fn baseline(&self, key: &str) -> Result<()> {
        let src = &self.cfg.tracker;
        match self.tracker.comments(key) {
            Ok(comments) => {
                let (events, ids) = comment_events(
                    key,
                    &comments,
                    &self.mirror.seen(src, key)?,
                    &self.mirror.questions(src, key)?,
                );
                self.mirror.record(src, &[(key.to_string(), ids)], &events)
            }
            // The first poll with the run reads them as a baseline instead.
            Err(_) => Ok(()),
        }
    }

    /// Refresh the stamps, drop claims that no run holds, and stop a run whose claim another
    /// machine took (REQ-010). A run of any project holds its claim: two projects can share one
    /// source, and a project must not release the claims of the other.
    fn heartbeat(&self, rep: &mut TickReport) -> Result<()> {
        let runs = self.dispatch.active_runs();
        let keys: Vec<String> = runs.iter().map(|r| r.key.clone()).collect();
        let hb = self.claims().heartbeat(&keys)?;
        rep.errors.extend(hb.errors);
        for key in hb.lost {
            for run in runs.iter().filter(|r| r.key == key) {
                match self.dispatch.stop(&run.run_id, REASON_CLAIM_LOST) {
                    Ok(()) => rep.stopped.push(run.run_id.clone()),
                    Err(e) => rep.errors.push(format!("stop {}: {e}", run.run_id)),
                }
            }
            // Only the local row goes: the stamp on the ticket is the other machine's now.
            self.mirror.release(&self.cfg.tracker, &key)?;
            rep.lost.push(key);
        }
        Ok(())
    }

    /// The factory calls this when a run ends, so the claim and the stamp go at once. The next
    /// tick would release them as well.
    pub fn release(&self, key: &str) -> Result<crate::claims::Released> {
        self.claims().release(key)
    }
}
