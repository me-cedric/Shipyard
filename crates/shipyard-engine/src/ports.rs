//! What the engine needs from the outside. The app wraps the `Tracker` and `Forge` adapters of
//! `shipyard-trackers` and `shipyard-forges` in these traits. W6 implements [`Dispatch`].
//! An error is a message that a person can read.

use std::path::PathBuf;
use std::time::Duration;

pub use shipyard_agents::runner::Event as AgentEvent;
use shipyard_core::delivery::GateCheck;
use shipyard_core::pickup::{ActiveRun, PullSnapshot, SyncEvent, Ticket};
use shipyard_core::work_item::Comment;
use shipyard_core::workflow::{Effort, Mode, Workspace};

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

    /// The stamps of the ticket, oldest first by first claim: a refreshed stamp keeps the place of
    /// the first one. Stale ones are included.
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

// ---- factory ports (W6)

/// What a step asks the runner to do. The app maps it to `shipyard_agents::runner::RunSpec`: it
/// adds the secrets and the MCP entry, and binds the MCP session to `run` and `step`.
#[derive(Debug, Clone, PartialEq)]
pub struct Brief {
    /// The ULID of `run:<ulid>`.
    pub run: String,
    /// The step id, or `<step>-<n>` for child n (from 1) of a `for_each` step.
    pub step: String,
    pub project: String,
    /// The runner id (`claude`, `codex`, ...).
    pub runner: String,
    /// The model in the words of the runner. `None`: the runner default.
    pub model: Option<String>,
    pub effort: Option<Effort>,
    pub mode: Mode,
    /// The Shipyard tool names that the step may call (`report`, `ask_question`, ...).
    pub tools: Vec<String>,
    pub prompt: String,
    pub dir: PathBuf,
    // The app gives each (`run`, `step`) its own scratch folder for `RunSpec::scratch`: under the
    // app data, never inside `dir`. The MCP config with the token and the brief go there.
    /// The CLI session to resume ([`AgentEvent::Session`] of an earlier start).
    pub resume: Option<String>,
}

/// One agent in progress. Dropping it must stop the agent.
pub trait AgentRun: Send {
    /// The next event, with no wait. `None`: no event now.
    fn next(&mut self) -> Option<AgentEvent>;

    fn cancel(&mut self);
}

/// The runners, as the factory sees them. The app wraps `shipyard_agents::runner::start`.
pub trait Agents: Send + Sync {
    fn start(&self, brief: &Brief) -> PortResult<Box<dyn AgentRun>>;

    /// The agent of `step` (`Brief::step`) ended, was stopped or failed: revoke its MCP session
    /// (`Sessions::revoke_step`) and remove its scratch folder. A start opens a new session.
    fn end(&self, _run: &str, _step: &str) {}
}

/// The folders of the steps. The app wraps `shipyard_git::Repo::child_worktree_add`.
pub trait Workspaces: Send + Sync {
    /// The folder of a step. `child` is set for `Workspace::Worktree`: one worktree for each.
    fn dir(&self, run: &str, workspace: Workspace, child: Option<&str>) -> PortResult<PathBuf>;
}

/// The writes of a project: tracker, push, pull request. The factory calls `send` only when the
/// switch is on or after a person approved the write.
pub trait Writer: Send + Sync {
    /// `false`: the tracker has no comments. A question then gets no comment.
    fn can_comment(&self) -> bool;

    /// Send one write. Returns the id that it made: the comment id, the pull request number, else
    /// an empty string.
    fn send(&self, write: &crate::approvals::Write) -> PortResult<String>;
}

// ---- delivery ports (W6)

/// How a merge or a rebase ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Merge {
    /// It went through and kept the history as it was (or there was nothing to do). A joined
    /// child is a commit on the run branch.
    Clean,
    /// A rebase moved commits: a branch that is on the remote needs a force with lease.
    Rewrote,
    /// It stopped. The folder is as it was before. The files that conflict.
    Conflicts(Vec<String>),
}

/// What the run changed, as paths of the working copy.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Changes {
    /// Files with an uncommitted change in the run folder.
    pub uncommitted: Vec<String>,
    /// Every file that the run branch changes against the base, committed or not.
    pub files: Vec<String>,
}

/// What the reviewer gets (`delivery` REQ-001, REQ-002).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReviewInput {
    /// The commit that the review judges.
    pub head: String,
    /// The change against the base, uncommitted files included.
    pub diff: String,
    /// `(path, text)` of the spec files at the base commit. A change that edits its own spec does
    /// not judge itself.
    pub specs: Vec<(String, String)>,
}

/// The local git work of delivery, on the folder and the branch of one run. The app wraps
/// `shipyard_git::Repo` and runs the gate commands. An error is a message that a person can read.
pub trait Git: Send + Sync {
    /// Join one child into the run branch. Commit what the child left in its worktree, with
    /// `message`, then squash the child branch onto the run branch as one commit with `message`
    /// (`shipyard_git::delivery::squash_child`). `message` follows `<type>(<scope>): <subject>`.
    /// Conflicts leave the run folder as it was.
    fn merge_child(&self, run: &str, child: &str, message: &str) -> PortResult<Merge>;

    /// Remove the worktree of a child and its branch. A fix round then starts a new child from
    /// the run branch.
    fn remove_child(&self, run: &str, child: &str) -> PortResult<()>;

    fn changes(&self, run: &str, base: &str) -> PortResult<Changes>;

    fn review_input(&self, run: &str, base: &str) -> PortResult<ReviewInput>;

    /// The impacts digest of the run against `base`, for the pull request body (`code` REQ-032,
    /// Q-079). `None`: this port gives no digest. An error is not fatal: the body has no digest.
    fn digest(&self, _run: &str, _base: &str) -> PortResult<Option<String>> {
        Ok(None)
    }

    /// The text of line `line` (from 1) of `path` in the run folder. `None`: no such file or line.
    fn line(&self, run: &str, path: &str, line: u32) -> PortResult<Option<String>>;

    /// The name of the run branch.
    fn branch(&self, run: &str) -> PortResult<String>;

    /// Refused for a branch that is on the remote already (`delivery` REQ-007).
    fn rename_branch(&self, run: &str, new: &str) -> PortResult<()>;

    /// Commit these files and only them. Returns the commit id.
    fn commit(
        &self,
        run: &str,
        paths: &[String],
        summary: &str,
        description: &str,
    ) -> PortResult<String>;

    /// Rebase the run branch onto the base.
    fn rebase(&self, run: &str, base: &str) -> PortResult<Merge>;

    /// Run the gate commands of the project in the run folder. One result for each command.
    fn gate(&self, run: &str, commands: &[String]) -> PortResult<Vec<GateCheck>>;

    /// Remove the child worktrees that are left. A dirty one stays and the error names its files
    /// (`delivery` REQ-025).
    fn remove_worktrees(&self, run: &str) -> PortResult<()>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Branches {
    pub names: Vec<String>,
    pub default: String,
}

/// A failed check of a pull request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FailedCheck {
    pub name: String,
    pub url: String,
    /// The end of the log, when the forge gives it.
    pub tail: Option<String>,
}

/// An open review conversation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Thread {
    pub id: String,
    pub path: Option<String>,
    pub line: Option<u32>,
    /// The comments, oldest first, as one text.
    pub text: String,
}

/// What delivery reads from the forge. The app wraps `shipyard_forges::PullApi`. The writes go
/// through [`Writer`], behind the switches.
pub trait Pulls: Send + Sync {
    fn branches(&self) -> PortResult<Branches>;

    /// The labels that exist on the forge.
    fn labels(&self) -> PortResult<Vec<String>>;

    /// The open pull request of a source branch (`delivery` REQ-016).
    fn find(&self, branch: &str) -> PortResult<Option<u64>>;

    fn failed_checks(&self, number: u64) -> PortResult<Vec<FailedCheck>>;

    /// The threads that are not resolved.
    fn threads(&self, number: u64) -> PortResult<Vec<Thread>>;
}
