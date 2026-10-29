//! What the engine needs from the outside. The app wraps the `Tracker` and `Forge` adapters of
//! `shipyard-trackers` and `shipyard-forges` in these traits. W6 implements [`Dispatch`].
//! An error is a message that a person can read.

use std::time::Duration;

use shipyard_core::pickup::{ActiveRun, PullSnapshot, SyncEvent, Ticket};
use shipyard_core::work_item::Comment;

pub type PortResult<T> = Result<T, String>;

pub struct Page<T> {
    pub items: Vec<T>,
    /// `Some` when more items exist. Pass it back as `ListQuery::cursor`.
    pub next: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ListQuery {
    /// ISO 8601. With it: the items updated since, closed ones too (a run must see a ticket
    /// close). Without it: the open items only.
    pub since: Option<String>,
    pub cursor: Option<String>,
}

/// A claim stamp on a ticket (REQ-009). A person can see it as a comment that holds a machine id.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stamp {
    pub machine: String,
    /// The time since the stamp was written or last refreshed, by the clock of the tracker. A
    /// local clock would drift between two machines (plan, Risks).
    pub age: Duration,
}

pub trait TrackerPort: Send + Sync {
    fn list(&self, query: &ListQuery) -> PortResult<Page<Ticket>>;

    fn get(&self, key: &str) -> PortResult<Ticket>;

    /// Oldest first. Empty when the tracker has no comments.
    fn comments(&self, key: &str) -> PortResult<Vec<Comment>>;

    /// `false` when the tracker cannot hold a stamp. The claim then stays on this machine.
    fn can_stamp(&self) -> bool {
        true
    }

    /// The stamps of the ticket, oldest first by creation. Stale ones are included.
    fn stamps(&self, key: &str) -> PortResult<Vec<Stamp>>;

    /// A tracker write. Create the stamp of `machine`, or refresh it. The engine calls this only
    /// when `Writes::stamp_allowed` is on.
    fn write_stamp(&self, key: &str, machine: &str) -> PortResult<()>;

    /// A tracker write. Remove the stamp of `machine`.
    fn clear_stamp(&self, key: &str, machine: &str) -> PortResult<()>;
}

pub trait ForgePort: Send + Sync {
    /// With `since`: the pull requests updated since, merged and closed ones too. Without it: the
    /// open ones.
    fn pulls(&self, query: &ListQuery) -> PortResult<Page<PullSnapshot>>;

    fn pull(&self, number: u64) -> PortResult<PullSnapshot>;
}

/// What the engine asks the ticket to start.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartRequest {
    pub project: String,
    pub ticket: Ticket,
    /// The ticket status at pickup.
    pub status: String,
    pub machine: String,
    /// The claim stamp is on the ticket. `false`: the claim is local only (`q:Q-020`).
    pub stamped: bool,
}

/// The factory, as the tick sees it (W6 implements it).
pub trait Dispatch: Send + Sync {
    /// The global kill switch (`add-factory` REQ-024). On: no pickup.
    fn kill_switch(&self) -> bool;

    /// Every run that has not ended, for every project on this machine.
    fn active_runs(&self) -> Vec<ActiveRun>;

    /// Create a run for a claimed ticket. Return `Ok` only when `active_runs` lists the run:
    /// the engine releases a claim that no active run holds.
    fn start(&self, request: &StartRequest) -> Result<(), String>;

    /// Stop a run. The reason goes on the run (`REASON_TERMINAL`). The engine releases the claim.
    fn stop(&self, run_id: &str, reason: &str) -> Result<(), String>;

    /// Receive an event: a comment for `questions-loop`, a pull request event for `delivery`, a
    /// tick. An error keeps a comment or pull request event for the next tick (at least once).
    fn event(&self, event: &SyncEvent) -> Result<(), String>;
}

/// Read pages until the last one, or until `max_pages`. The flag says that pages were left.
pub fn collect_pages<T>(
    max_pages: u32,
    mut get: impl FnMut(Option<String>) -> PortResult<Page<T>>,
) -> PortResult<(Vec<T>, bool)> {
    let (mut items, mut cursor) = (Vec::new(), None);
    for _ in 0..max_pages {
        let page = get(cursor.take())?;
        items.extend(page.items);
        match page.next {
            Some(next) => cursor = Some(next),
            None => return Ok((items, false)),
        }
    }
    Ok((items, true))
}
