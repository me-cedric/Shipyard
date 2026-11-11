//! Run states of the factory and their transition table (spec `factory`, REQ-001 to REQ-007,
//! REQ-022, REQ-036). No I/O: the engine applies events, logs the result and keeps the clocks.

use std::collections::BTreeMap;
use std::fmt;
use std::str::FromStr;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::pickup::StateMapping;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub enum RunState {
    Queued,
    Claimed,
    Planning,
    PlanReview,
    Working,
    SelfReview,
    PROpen,
    ChangesRequested,
    Merged,
    Done,
    WaitingForAnswer,
    Blocked,
    RetryQueued,
    Paused,
    Failed,
    Cancelled,
}

impl RunState {
    /// Main path first, then side states.
    pub const ALL: [RunState; 16] = [
        Self::Queued,
        Self::Claimed,
        Self::Planning,
        Self::PlanReview,
        Self::Working,
        Self::SelfReview,
        Self::PROpen,
        Self::ChangesRequested,
        Self::Merged,
        Self::Done,
        Self::WaitingForAnswer,
        Self::Blocked,
        Self::RetryQueued,
        Self::Paused,
        Self::Failed,
        Self::Cancelled,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "Queued",
            Self::Claimed => "Claimed",
            Self::Planning => "Planning",
            Self::PlanReview => "PlanReview",
            Self::Working => "Working",
            Self::SelfReview => "SelfReview",
            Self::PROpen => "PROpen",
            Self::ChangesRequested => "ChangesRequested",
            Self::Merged => "Merged",
            Self::Done => "Done",
            Self::WaitingForAnswer => "WaitingForAnswer",
            Self::Blocked => "Blocked",
            Self::RetryQueued => "RetryQueued",
            Self::Paused => "Paused",
            Self::Failed => "Failed",
            Self::Cancelled => "Cancelled",
        }
    }
}

impl RunState {
    /// `Failed`, `Cancelled` and `Done` take no event (REQ-005).
    pub fn is_final(self) -> bool {
        matches!(self, Self::Failed | Self::Cancelled | Self::Done)
    }

    /// A side state stores the return state (REQ-005).
    pub fn is_side(self) -> bool {
        matches!(
            self,
            Self::WaitingForAnswer | Self::Blocked | Self::RetryQueued | Self::Paused
        )
    }

    /// A main path state that is not final. A side state starts from here (REQ-004).
    pub fn is_active(self) -> bool {
        !self.is_final() && !self.is_side()
    }

    /// The stall timer and the budget clock run only while an agent works. They stop in
    /// `WaitingForAnswer` (REQ-006) and in every state that waits for a person or the forge.
    pub fn clocks_run(self) -> bool {
        matches!(self, Self::Planning | Self::Working | Self::SelfReview)
    }
}

/// What happens to a run. The engine maps tool calls, sync events and clicks to these.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RunEvent {
    Claim,
    Start,
    /// The plan step ended. `gate` is its `gate: human` (REQ-003).
    PlanReady {
        gate: bool,
    },
    PlanApproved,
    PlanRejected,
    BuildDone,
    /// A blocking finding with rounds left (REQ-036).
    FixRound,
    /// The last step of a workflow with no pull request step ended.
    Finished,
    PrOpened,
    /// A CI failure or a review comment (REQ-002).
    ChangesRequested,
    FixStarted,
    /// The pull request merged. The engine sends it only to a run that holds a pull request, so
    /// `Working` and `SelfReview` mean a fix round (the first build has no pull request yet). A
    /// side state takes it too: a merge never waits (REQ-002).
    PrMerged,
    /// The merge close ended (`delivery` REQ-022).
    Closed,
    Ask,
    /// An escalation (REQ-053): a person must act.
    Block,
    Retry,
    BudgetStop,
    /// Runs of older logs only: the engine sends no new run to `Failed` (`q:Q-166`).
    Fail,
    Cancel,
    Answered,
    Unblock,
    RetryDue,
    /// A person resumes a paused run. `budget_left` is false when the budget is still spent.
    Resume {
        budget_left: bool,
    },
}

/// A transition that the table does not list. The engine logs it (REQ-001).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Refused {
    pub from: RunState,
    pub event: RunEvent,
}

impl fmt::Display for Refused {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "refused {:?} in {}", self.event, self.from.as_str())
    }
}

impl std::error::Error for Refused {}

/// The state of one run and the state it returns to from a side state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Run {
    pub state: RunState,
    pub return_to: Option<RunState>,
}

impl Default for Run {
    fn default() -> Self {
        Self::new()
    }
}

impl Run {
    pub fn new() -> Self {
        Self {
            state: RunState::Queued,
            return_to: None,
        }
    }

    /// The next run, or a refusal. The one transition table of the factory.
    pub fn apply(self, event: RunEvent) -> Result<Run, Refused> {
        use RunEvent as E;
        use RunState as S;
        let to = |state| {
            Ok(Run {
                state,
                return_to: None,
            })
        };
        let side = |state| {
            Ok(Run {
                state,
                return_to: Some(self.state),
            })
        };
        let back = || self.return_to.map_or(Err(()), to);
        let next = match (self.state, event) {
            (S::Queued, E::Claim) => to(S::Claimed),
            (S::Claimed, E::Start) => to(S::Planning),
            (S::Planning, E::PlanReady { gate: true }) => to(S::PlanReview),
            (S::Planning, E::PlanReady { gate: false }) => to(S::Working),
            (S::PlanReview, E::PlanApproved) => to(S::Working),
            (S::PlanReview, E::PlanRejected) => to(S::Planning),
            (S::Working, E::BuildDone) => to(S::SelfReview),
            (S::Working | S::SelfReview, E::Finished) => to(S::Done),
            // A person closes a run blocked with nothing to deliver: the work is on the base.
            (S::Blocked, E::Finished) => to(S::Done),
            (S::SelfReview, E::FixRound) => to(S::Working),
            (S::SelfReview, E::PrOpened) => to(S::PROpen),
            (S::PROpen, E::ChangesRequested) => to(S::ChangesRequested),
            // A pull request that merges while the run fixes it (`delivery` REQ-022): the fix is
            // moot, the engine stops the agents and the close follows.
            (
                S::PROpen
                | S::ChangesRequested
                | S::Working
                | S::SelfReview
                | S::WaitingForAnswer
                | S::Blocked
                | S::RetryQueued
                | S::Paused,
                E::PrMerged,
            ) => to(S::Merged),
            // An escalated wait or retry keeps the state that it returns to (REQ-005).
            (S::WaitingForAnswer | S::RetryQueued, E::Block) => Ok(Run {
                state: S::Blocked,
                return_to: self.return_to,
            }),
            (S::ChangesRequested, E::FixStarted) => to(S::Working),
            (S::Merged, E::Closed) => to(S::Done),
            // Several questions: the return state stays the one before the first (questions-loop REQ-014).
            (S::WaitingForAnswer, E::Ask) => Ok(self),
            (S::WaitingForAnswer, E::Answered)
            | (S::Blocked, E::Unblock)
            | (S::RetryQueued, E::RetryDue)
            | (S::Paused, E::Resume { budget_left: true }) => back(),
            (S::Paused, E::Resume { budget_left: false }) => Ok(self),
            (s, E::Cancel) if !s.is_final() => to(S::Cancelled),
            (s, E::Ask) if s.is_active() => side(S::WaitingForAnswer),
            (s, E::Block) if s.is_active() => side(S::Blocked),
            (s, E::Retry) if s.is_active() => side(S::RetryQueued),
            (s, E::BudgetStop) if s.is_active() => side(S::Paused),
            (s, E::Fail) if s.is_active() => to(S::Failed),
            _ => Err(()),
        };
        next.map_err(|()| Refused {
            from: self.state,
            event,
        })
    }
}

pub const RETRY_BASE: Duration = Duration::from_secs(10);
pub const RETRY_CAP: Duration = Duration::from_secs(300);
/// The failed attempt of a step that escalates, across all rounds (REQ-052).
pub const ATTEMPT_BREAKER: u32 = 3;
/// The default caps of a run (REQ-035, REQ-054, `q:Q-167`).
pub const REVIEW_ROUNDS: u32 = 4;
pub const FEEDBACK_ROUNDS: u32 = 3;
pub const FIX_ROUNDS: u32 = 8;
/// A guard that fails this long with one cause escalates (REQ-056).
pub const GUARD_ESCALATE: Duration = Duration::from_secs(30 * 60);
/// The budget share that raises the one alert (REQ-022).
pub const BUDGET_ALERT: f64 = 0.8;

/// Why a run escalates (REQ-053). A closed list: the stop report and the notice name it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Cause {
    ReviewRounds,
    FeedbackRounds,
    FixRounds,
    Attempts,
    Retries,
    SameFailure,
    NoProgress,
    ChildConflict,
    RebaseConflict,
    NothingToDeliver,
    ReleaseBase,
    NoReviewer,
    PushRejected,
    PullRequestRejected,
    Guard,
    NoAnswer,
    Budget,
    MaxTurns,
    PullRequestClosed,
}

impl Cause {
    /// The cause in plain words, for the stop report.
    pub fn text(self) -> &'static str {
        match self {
            Self::ReviewRounds => "review rounds spent",
            Self::FeedbackRounds => "feedback rounds spent",
            Self::FixRounds => "fix rounds spent",
            Self::Attempts => "attempts spent",
            Self::Retries => "retries spent",
            Self::SameFailure => "same failure",
            Self::NoProgress => "no progress",
            Self::ChildConflict => "child conflict",
            Self::RebaseConflict => "rebase conflict",
            Self::NothingToDeliver => "nothing to deliver",
            Self::ReleaseBase => "release base",
            Self::NoReviewer => "no reviewer",
            Self::PushRejected => "push rejected",
            Self::PullRequestRejected => "pull request rejected",
            Self::Guard => "a check before the attempt failed",
            Self::NoAnswer => "no answer",
            Self::Budget => "budget spent",
            Self::MaxTurns => "max turns",
            Self::PullRequestClosed => "pull request closed",
        }
    }

    /// A budget and max turns stay in `Paused`: a resume needs room (REQ-053).
    pub fn pauses(self) -> bool {
        matches!(self, Self::Budget | Self::MaxTurns)
    }
}

/// The one record of an escalation (REQ-053): the cause, the last lines (10 at most), what the
/// run tried and the action of the person. `attempt` counts the escalations of the run: with the
/// run and the cause it is the key of the stop report (REQ-058).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Escalation {
    pub cause: Cause,
    pub lines: Vec<String>,
    pub tried: String,
    pub action: String,
    pub attempt: u32,
}

/// The delay of retry number `n` (from 1): `min(10 s * 2^(n-1), 5 min)` (REQ-007).
pub fn retry_delay(n: u32) -> Duration {
    let doublings = n.saturating_sub(1).min(5);
    (RETRY_BASE * 2u32.pow(doublings)).min(RETRY_CAP)
}

/// After a failed attempt: `None` queues a retry, else the cause of the escalation (REQ-007,
/// REQ-052). `failures` counts the failures of the unit in this round, `attempts` its failed
/// attempts in the whole run, both from 1. `extra` is the attempts that unblocks gave.
pub fn after_failure(failures: u32, retry: u32, attempts: u32, extra: u32) -> Option<Cause> {
    if attempts >= ATTEMPT_BREAKER + extra {
        Some(Cause::Attempts)
    } else if failures > retry + extra {
        Some(Cause::Retries)
    } else {
        None
    }
}

/// What a review round leads to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Next {
    /// No blocking finding: go on to the pull request.
    Go,
    /// A fix round with no click.
    Fix,
    Escalate(Cause),
}

/// The verdict of a review round (REQ-036, REQ-055). `blocking` counts the P0 and P1 findings,
/// `fp` is their fingerprint, `last` the fingerprint and the count of the round before.
/// `rounds_done` counts the fix rounds of the whole run, against `cap`.
pub fn after_review(
    blocking: usize,
    fp: u64,
    last: Option<(u64, usize)>,
    rounds_done: u32,
    cap: u32,
) -> Next {
    match last {
        _ if blocking == 0 => Next::Go,
        Some((f, _)) if f == fp => Next::Escalate(Cause::SameFailure),
        Some((_, n)) if blocking >= n => Next::Escalate(Cause::NoProgress),
        _ if rounds_done >= cap => Next::Escalate(Cause::ReviewRounds),
        _ => Next::Fix,
    }
}

/// One item with no line numbers, times, ids or temporary paths, in lower case (REQ-055).
fn normalize(item: &str) -> String {
    let id = |w: &str| {
        let core = w.trim_matches(|c: char| !c.is_ascii_alphanumeric());
        core.len() >= 7
            && core.bytes().any(|b| b.is_ascii_digit())
            && core.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    };
    let temp = |w: &str| {
        ["/tmp/", "/var/folders/", "/private/"]
            .iter()
            .any(|t| w.contains(t))
    };
    item.to_lowercase()
        .split_whitespace()
        .filter(|w| !id(w) && !temp(w))
        .map(|w| w.replace(|c: char| c.is_ascii_digit(), ""))
        .collect::<Vec<_>>()
        .join(" ")
}

/// The fingerprint of a failure: the normalized items, sorted, in a 64-bit FNV-1a hash. Line
/// numbers, times, ids and the order of the items do not change it (REQ-055).
pub fn fingerprint<S: AsRef<str>>(items: &[S]) -> u64 {
    let mut lines: Vec<String> = items.iter().map(|i| normalize(i.as_ref())).collect();
    lines.sort();
    lines
        .join("\n")
        .bytes()
        .fold(0xcbf2_9ce4_8422_2325, |h, b| {
            (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
        })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum BudgetLevel {
    Under,
    /// 80 % or more: raise one alert.
    Alert,
    /// 100 %: hard stop, the run goes to `Paused`.
    Spent,
}

pub fn budget_level(spent: f64, budget: f64) -> BudgetLevel {
    if spent >= budget {
        BudgetLevel::Spent
    } else if spent >= budget * BUDGET_ALERT {
        BudgetLevel::Alert
    } else {
        BudgetLevel::Under
    }
}

/// A clock in seconds that runs only while the run state lets it (REQ-006). The engine keeps
/// one for the stall timer (reset at each event) and one for the run time.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Stopwatch {
    /// Seconds counted before `since`.
    pub spent: u64,
    /// Running since this time, in seconds.
    pub since: Option<u64>,
}

impl Stopwatch {
    pub fn started(now: u64) -> Self {
        Self {
            spent: 0,
            since: Some(now),
        }
    }

    pub fn read(&self, now: u64) -> u64 {
        self.spent + self.since.map_or(0, |s| now.saturating_sub(s))
    }

    /// Run or stop the clock for the new state.
    pub fn follow(&mut self, state: RunState, now: u64) {
        match (state.clocks_run(), self.since) {
            (true, None) => self.since = Some(now),
            (false, Some(_)) => {
                *self = Self {
                    spent: self.read(now),
                    since: None,
                }
            }
            _ => {}
        }
    }

    /// Back to zero, and keep the running state.
    pub fn reset(&mut self, now: u64) {
        self.spent = 0;
        self.since = self.since.map(|_| now);
    }
}

/// The ticket labels after a move to `state`: each label that the map gives to another state
/// goes, the labels of `state` come, every other label stays (REQ-008).
pub fn staged_labels(
    current: &[String],
    map: &BTreeMap<String, StateMapping>,
    state: RunState,
) -> Vec<String> {
    let target = map
        .get(state.as_str())
        .map_or(&[][..], |m| m.labels.as_slice());
    let mapped = |l: &String| map.values().any(|m| m.labels.contains(l));
    let mut out: Vec<String> = current
        .iter()
        .filter(|l| !mapped(l) || target.contains(l))
        .cloned()
        .collect();
    for l in target {
        if !out.contains(l) {
            out.push(l.clone());
        }
    }
    out
}

impl FromStr for RunState {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, ()> {
        Self::ALL.into_iter().find(|v| v.as_str() == s).ok_or(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_ignores_lines_ids_and_order() {
        let a = fingerprint(&[
            "P1 src/a.rs:10 unchecked unwrap",
            "gate `cargo test` failed: 3 tests",
        ]);
        let b = fingerprint(&[
            "gate `cargo test` failed: 4 tests",
            "P1 src/a.rs:12 unchecked unwrap",
        ]);
        assert_eq!(a, b);
        let id = fingerprint(&["error in /tmp/x1/a.rs at 01JRUN00000000000000000AA sha 3f9a2c1d"]);
        let other =
            fingerprint(&["error in /tmp/y2/a.rs at 01JRUN00000000000000000BB sha 9e8d7c6b"]);
        assert_eq!(id, other);
        assert_ne!(a, fingerprint(&["P1 src/a.rs:10 a missing check"]));
    }

    #[test]
    fn sixteen_states_round_trip() {
        assert_eq!(RunState::ALL.len(), 16);
        for s in RunState::ALL {
            assert_eq!(s.as_str().parse(), Ok(s));
        }
        assert!("queued".parse::<RunState>().is_err());
    }
}
