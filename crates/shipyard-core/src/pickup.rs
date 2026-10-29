//! Reconcile and pickup rules of the tick, and the model of `.shipyard/automation.yaml`
//! (spec `sync`, REQ-002, REQ-003, REQ-004, REQ-006, REQ-007). No I/O: the engine fetches,
//! these functions decide.

use std::collections::{BTreeMap, HashSet};
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::project::Issue;
use crate::run::RunState;
use crate::work_item::{Comment, Status, StatusCategory, WorkItem};

/// Repository path of the automation file.
pub const AUTOMATION_FILE: &str = ".shipyard/automation.yaml";
pub const DEFAULT_LABEL: &str = "shipyard";
/// Seconds. REQ-001, REQ-002.
pub const DEFAULT_INTERVAL: u32 = 60;
pub const MIN_INTERVAL: u32 = 30;
pub const DEFAULT_CONCURRENCY: u32 = 2;
/// The reason that the engine records on a run that it stops (REQ-004).
pub const REASON_TERMINAL: &str = "ticket terminal";
/// Another machine holds the live claim stamp (REQ-009, REQ-010).
pub const REASON_CLAIM_LOST: &str = "claim lost to another machine";

// ---- the automation file

/// Which tickets an agent may take. A ticket must match every set part (REQ-006).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields, default)]
pub struct Filter {
    /// The file holds a team handle. The caller replaces it with the tracker person id or name
    /// before it picks up (`work` resolves handles).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    /// The tracker ids and names of the member that `assignee` names. The caller fills it from the
    /// team file (REQ-006). It is never in the file. Empty: only the handle itself matches.
    #[serde(skip)]
    pub accounts: Vec<String>,
    /// `null` turns the label filter off.
    pub label: Option<String>,
    /// Status names. Empty means the `Todo` category.
    pub statuses: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
}

impl Default for Filter {
    fn default() -> Self {
        Self {
            assignee: None,
            accounts: Vec::new(),
            label: Some(DEFAULT_LABEL.into()),
            statuses: Vec::new(),
            component: None,
            priority: None,
        }
    }
}

/// Run limits (REQ-007). `global` counts the active runs of every project on this machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields, default)]
pub struct Limits {
    pub global: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_project: Option<u32>,
    /// By ticket status name at pickup.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub per_status: BTreeMap<String, u32>,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            global: DEFAULT_CONCURRENCY,
            per_project: None,
            per_status: BTreeMap::new(),
        }
    }
}

/// The tracker status and labels of one run state.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields, default)]
pub struct StateMapping {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<String>,
}

/// The four write switches of `factory`. All off by default (`q:Q-002`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields, default)]
pub struct Writes {
    pub push: bool,
    pub pull_request: bool,
    pub tracker_transition: bool,
    pub tracker_comment: bool,
}

impl Writes {
    /// May the engine write a claim stamp to the tracker? The stamp is a comment, so it follows
    /// `tracker_comment` (`q:Q-020`, option 2). With it off, a claim stays on this machine.
    pub fn stamp_allowed(&self) -> bool {
        self.tracker_comment
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields, default)]
pub struct Automation {
    /// Poll interval in seconds. At least 30.
    pub interval: u32,
    pub pickup: Filter,
    pub concurrency: Limits,
    /// Key: a run state name (`RunState::as_str`).
    pub status_map: BTreeMap<String, StateMapping>,
    pub writes: Writes,
    /// The reviewers of a pull request that a run opens (`delivery` REQ-012, `q:Q-029`).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub reviewers: Vec<String>,
    /// The assignee of that pull request when the ticket names none (`delivery` REQ-012).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
}

impl Default for Automation {
    fn default() -> Self {
        Self {
            interval: DEFAULT_INTERVAL,
            pickup: Filter::default(),
            concurrency: Limits::default(),
            status_map: BTreeMap::new(),
            writes: Writes::default(),
            reviewers: Vec::new(),
            assignee: None,
        }
    }
}

impl Automation {
    pub fn validate(&self) -> Vec<Issue> {
        let mut out = Vec::new();
        if self.interval < MIN_INTERVAL {
            out.push(Issue {
                field: "interval".into(),
                value: self.interval.to_string(),
            });
        }
        for key in self.status_map.keys() {
            if RunState::from_str(key).is_err() {
                out.push(Issue {
                    field: format!("status_map.{key}"),
                    value: key.clone(),
                });
            }
        }
        out
    }

    /// A terminal status: the `Done` category, or the status that the map gives to `Done` (REQ-004).
    pub fn terminal(&self, status: &Status) -> bool {
        status.category == StatusCategory::Done
            || self
                .status_map
                .get(RunState::Done.as_str())
                .and_then(|m| m.status.as_deref())
                .is_some_and(|s| s.eq_ignore_ascii_case(&status.name))
    }
}

// ---- mirror shapes

/// A mirrored ticket. `components` and `priority` are not in the shared work item shape: an
/// adapter fills them when its tracker has them. A filter part with no data never matches.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ticket {
    pub item: WorkItem,
    #[serde(default)]
    pub components: Vec<String>,
    #[serde(default)]
    pub priority: Option<String>,
}

impl Ticket {
    pub fn new(item: WorkItem) -> Self {
        Self {
            item,
            components: Vec::new(),
            priority: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrState {
    Open,
    Closed,
    Merged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Ci {
    None,
    Pending,
    Passing,
    Failing,
}

/// A mirrored pull request. A project has one forge repository, so the number is the key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PullSnapshot {
    pub number: u64,
    pub title: String,
    pub state: PrState,
    pub draft: bool,
    pub head_sha: String,
    pub url: String,
    pub ci: Ci,
    /// The forge adapter sets it from the reviews.
    pub changes_requested: bool,
    pub updated: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrEventKind {
    Opened,
    Merged,
    Closed,
    ChangesRequested,
    CiPassed,
    CiFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrEvent {
    pub number: u64,
    pub kind: PrEventKind,
    pub title: String,
    pub head_sha: String,
    pub url: String,
}

/// What the engine hands to the other capabilities (REQ-011, REQ-012, REQ-016).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SyncEvent {
    /// A new ticket comment, for `questions-loop`. `answers` is the question id of the latest
    /// marker before the comment.
    Comment {
        key: String,
        comment: Comment,
        answers: Option<String>,
    },
    /// A pull request, CI or merge event, for `delivery`.
    Pr(PrEvent),
    /// One per tick, for every listener. Never stored.
    Tick { at: u64, changed: u32 },
}

/// A run that the factory holds, as far as the tick needs it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveRun {
    pub run_id: String,
    pub project: String,
    pub key: String,
    pub state: RunState,
    /// The ticket status name at pickup. The status limit counts it.
    pub status: String,
    /// The pull request number of the run, once it has one.
    pub pr: Option<u64>,
}

// ---- reconcile

/// The fetched tickets that are new or differ from the mirror.
pub fn changed_tickets<'a>(known: &[Ticket], fetched: &'a [Ticket]) -> Vec<&'a Ticket> {
    fetched
        .iter()
        .filter(|f| {
            known
                .iter()
                .find(|k| k.item.key == f.item.key)
                .is_none_or(|k| k != *f)
        })
        .collect()
}

/// The events of the pull requests that changed. One change can give several events.
pub fn diff_pulls(known: &[PullSnapshot], fetched: &[PullSnapshot]) -> Vec<PrEvent> {
    let mut out = Vec::new();
    for f in fetched {
        let old = known.iter().find(|k| k.number == f.number);
        if old == Some(f) {
            continue;
        }
        let mut push = |kind| {
            out.push(PrEvent {
                number: f.number,
                kind,
                title: f.title.clone(),
                head_sha: f.head_sha.clone(),
                url: f.url.clone(),
            })
        };
        if old.is_none() && f.state == PrState::Open {
            push(PrEventKind::Opened);
        }
        if f.ci != old.map_or(Ci::None, |o| o.ci) {
            match f.ci {
                Ci::Passing => push(PrEventKind::CiPassed),
                Ci::Failing => push(PrEventKind::CiFailed),
                _ => {}
            }
        }
        if f.state == PrState::Open
            && f.changes_requested
            && !old.is_some_and(|o| o.changes_requested)
        {
            push(PrEventKind::ChangesRequested);
        }
        if f.state != PrState::Open && old.is_none_or(|o| o.state != f.state) {
            push(if f.state == PrState::Merged {
                PrEventKind::Merged
            } else {
                PrEventKind::Closed
            });
        }
    }
    out
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stop {
    pub run_id: String,
    pub reason: String,
}

/// A run that still works or waits. A run that already ends is never stopped.
fn live(state: RunState) -> bool {
    !matches!(
        state,
        RunState::Merged | RunState::Done | RunState::Failed | RunState::Cancelled
    )
}

/// The runs to stop: the ticket is terminal and the pull request did not merge (REQ-004).
/// A ticket that the mirror lacks never stops a run.
pub fn stops(
    auto: &Automation,
    runs: &[ActiveRun],
    tickets: &[Ticket],
    pulls: &[PullSnapshot],
) -> Vec<Stop> {
    runs.iter()
        .filter(|r| live(r.state))
        .filter(|r| {
            tickets
                .iter()
                .find(|t| t.item.key == r.key)
                .is_some_and(|t| auto.terminal(&t.item.status))
        })
        .filter(|r| {
            !r.pr.is_some_and(|n| {
                pulls
                    .iter()
                    .any(|p| p.number == n && p.state == PrState::Merged)
            })
        })
        .map(|r| Stop {
            run_id: r.run_id.clone(),
            reason: REASON_TERMINAL.into(),
        })
        .collect()
}

// ---- pickup

pub struct PickupInput<'a> {
    pub auto: &'a Automation,
    pub project: &'a str,
    pub tickets: &'a [Ticket],
    /// The active runs of every project on this machine.
    pub active: &'a [ActiveRun],
    /// Keys that a claim holds.
    pub held: &'a [String],
    pub kill_switch: bool,
}

fn eq(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

/// Does the ticket match every set filter part? It does not check the terminal state.
pub fn matches(filter: &Filter, t: &Ticket) -> bool {
    let item = &t.item;
    filter
        .label
        .as_deref()
        .is_none_or(|l| item.labels.iter().any(|x| eq(x, l)))
        && filter.assignee.as_deref().is_none_or(|a| {
            item.assignee.as_ref().is_some_and(|p| {
                std::iter::once(a)
                    .chain(filter.accounts.iter().map(String::as_str))
                    .any(|x| eq(&p.id, x) || eq(&p.name, x))
            })
        })
        && if filter.statuses.is_empty() {
            item.status.category == StatusCategory::Todo
        } else {
            filter.statuses.iter().any(|s| eq(s, &item.status.name))
        }
        && filter
            .component
            .as_deref()
            .is_none_or(|c| t.components.iter().any(|x| eq(x, c)))
        && filter
            .priority
            .as_deref()
            .is_none_or(|p| t.priority.as_deref().is_some_and(|x| eq(x, p)))
}

/// The tickets to claim, oldest update first, within every limit (REQ-006, REQ-007).
pub fn pickup<'a>(input: &PickupInput<'a>) -> Vec<&'a Ticket> {
    let PickupInput { auto, project, .. } = *input;
    if input.kill_switch {
        return Vec::new();
    }
    let lim = &auto.concurrency;
    let mine = || input.active.iter().filter(|r| r.project == project);
    let mut global = (lim.global as usize).saturating_sub(input.active.len());
    let mut per_project = lim
        .per_project
        .map(|p| (p as usize).saturating_sub(mine().count()));
    // Remaining slots for each limited status name, lower case.
    let mut per_status: BTreeMap<String, usize> = lim
        .per_status
        .iter()
        .map(|(s, n)| {
            let used = mine().filter(|r| eq(&r.status, s)).count();
            (s.to_ascii_lowercase(), (*n as usize).saturating_sub(used))
        })
        .collect();

    let mut candidates: Vec<&Ticket> = input
        .tickets
        .iter()
        .filter(|t| matches(&auto.pickup, t) && !auto.terminal(&t.item.status))
        .filter(|t| !mine().any(|r| r.key == t.item.key))
        .filter(|t| !input.held.contains(&t.item.key))
        .collect();
    candidates.sort_by(|a, b| (&a.item.updated, &a.item.key).cmp(&(&b.item.updated, &b.item.key)));

    let mut out = Vec::new();
    for t in candidates {
        let status = t.item.status.name.to_ascii_lowercase();
        let status_free = per_status.get(&status).is_none_or(|n| *n > 0);
        if global == 0 || per_project == Some(0) || !status_free {
            continue;
        }
        global -= 1;
        per_project = per_project.map(|n| n - 1);
        if let Some(n) = per_status.get_mut(&status) {
            *n -= 1;
        }
        out.push(t);
    }
    out
}

// ---- question markers

/// The question id of a marker `<!-- shipyard:q Q-NNN -->` in a comment body (`adr:0008`).
pub fn question_marker(body: &str) -> Option<&str> {
    marker(body, "shipyard:q")
}

/// The question id of an answer marker `<!-- shipyard:a Q-NNN -->`: the comment that the system
/// posts when a person answers in the app (`add-questions-loop` REQ-016).
pub fn answer_marker(body: &str) -> Option<&str> {
    marker(body, "shipyard:a")
}

fn marker<'a>(body: &'a str, tag: &str) -> Option<&'a str> {
    let rest = body[body.find("<!--")? + 4..].trim_start();
    let rest = rest.strip_prefix(tag)?.trim_start();
    let id = rest.split_whitespace().next()?;
    let digits = id.strip_prefix("Q-")?;
    let closed = rest[id.len()..].trim_start().starts_with("-->");
    (closed && !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())).then_some(id)
}

/// For each comment, in order: the question that it answers. A marker counts only in a comment
/// that the system posted (`posted` holds those ids, `add-questions-loop` REQ-009): a look-alike
/// that another person wrote, or a quoted marker in a reply, is a plain comment. A comment after a
/// marker answers the latest marker. A marker comment answers nothing. A comment of the system
/// with an answer marker (`answer_marker`) is the echo of an answer that a person gave in the app:
/// it answers nothing and leaves the latest marker as it was.
pub fn answers<'a>(comments: &'a [Comment], posted: &HashSet<String>) -> Vec<Option<&'a str>> {
    let mut open = None;
    comments
        .iter()
        .map(|c| {
            if posted.contains(&c.id) && answer_marker(&c.body).is_some() {
                return None;
            }
            match question_marker(&c.body).filter(|_| posted.contains(&c.id)) {
                Some(q) => {
                    open = Some(q);
                    None
                }
                None => open,
            }
        })
        .collect()
}
