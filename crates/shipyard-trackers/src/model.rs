//! The work item shape and the contract types. Every adapter maps its own API shape to these.
//! A field that belongs to one tracker stays inside its adapter (REQ-004).
//!
//! shortcut: this module belongs in `shipyard-core` (`work_item.rs`, T002). It lives here until
//! the core owner adds the type; move it then and re-export it from here.

use serde::{Deserialize, Serialize};
use shipyard_http::TestOutcome;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TrackerKind {
    JiraCloud,
    JiraDataCenter,
    #[serde(rename = "github")]
    GitHubIssues,
    #[serde(rename = "gitlab")]
    GitLabIssues,
    AzureDevOps,
    Linear,
}

impl TrackerKind {
    pub const ALL: [TrackerKind; 6] = [
        Self::JiraCloud,
        Self::JiraDataCenter,
        Self::GitHubIssues,
        Self::GitLabIssues,
        Self::AzureDevOps,
        Self::Linear,
    ];

    /// What this product can do (REQ-003). Static by kind.
    pub fn capabilities(self) -> Capabilities {
        let all = Capabilities {
            hierarchy: true,
            transitions: true,
            labels: true,
            comments: true,
            time_tracking: true,
            assignee: true,
        };
        match self {
            Self::JiraCloud | Self::JiraDataCenter | Self::AzureDevOps => all,
            // Issues are flat; open and closed are the only states; no time fields.
            Self::GitHubIssues => Capabilities {
                hierarchy: false,
                time_tracking: false,
                ..all
            },
            Self::GitLabIssues => Capabilities {
                hierarchy: false,
                ..all
            },
            // Linear has an estimate in points, not a time record.
            Self::Linear => Capabilities {
                time_tracking: false,
                ..all
            },
        }
    }

    /// The scope or permission that a read needs, in the words of the product.
    pub fn read_scope(self) -> &'static str {
        match self {
            Self::JiraCloud | Self::JiraDataCenter => "Browse projects",
            Self::GitHubIssues => "Issues: read",
            Self::GitLabIssues => "read_api",
            Self::AzureDevOps => "Work Items: Read",
            Self::Linear => "read",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Capability {
    Hierarchy,
    Transitions,
    Labels,
    Comments,
    TimeTracking,
    Assignee,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Capabilities {
    pub hierarchy: bool,
    pub transitions: bool,
    pub labels: bool,
    pub comments: bool,
    pub time_tracking: bool,
    pub assignee: bool,
}

impl Capabilities {
    pub fn has(&self, capability: Capability) -> bool {
        match capability {
            Capability::Hierarchy => self.hierarchy,
            Capability::Transitions => self.transitions,
            Capability::Labels => self.labels,
            Capability::Comments => self.comments,
            Capability::TimeTracking => self.time_tracking,
            Capability::Assignee => self.assignee,
        }
    }

    /// Call this before a request that needs the flag. It sends nothing (REQ-003).
    pub fn require(&self, capability: Capability) -> Result<(), TrackerError> {
        if self.has(capability) {
            Ok(())
        } else {
            Err(TrackerError::Unsupported(capability))
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkKind {
    Epic,
    Story,
    Task,
    Bug,
    Subtask,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StatusCategory {
    Todo,
    InProgress,
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Status {
    pub name: String,
    pub category: StatusCategory,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Person {
    /// The id that the tracker uses. Not comparable across trackers.
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimeTracking {
    pub estimate_minutes: Option<u64>,
    pub spent_minutes: Option<u64>,
}

/// One ticket, the same shape for every tracker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkItem {
    /// Unique inside one connection: `PROJ-12`, `owner/repo#5`, `group/project#7`, `ENG-42`, `1234`.
    pub key: String,
    pub title: String,
    /// Plain text or Markdown. Never HTML.
    pub description: String,
    pub kind: WorkKind,
    pub status: Status,
    pub assignee: Option<Person>,
    pub labels: Vec<String>,
    /// The key of the parent item. `None` when there is none or when hierarchy is off.
    pub parent: Option<String>,
    pub url: String,
    /// ISO 8601, as the tracker wrote it.
    pub updated: String,
    /// `None` when time tracking is off or the item has no time data.
    pub time: Option<TimeTracking>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Comment {
    pub id: String,
    pub author: Person,
    /// Plain text or Markdown.
    pub body: String,
    pub created: String,
}

/// What to list. Every field narrows the result.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkQuery {
    /// The container to list from: Jira project key, GitHub `owner/repo`, GitLab project path,
    /// Azure DevOps project name, Linear team key. `None` lists across the account: the items
    /// assigned to the person (GitHub, GitLab) or all visible items (the others).
    pub scope: Option<String>,
    /// ISO 8601. Keep items updated at or after it.
    /// shortcut: Jira reads the cutoff in the account time zone; a caller re-reads a small margin.
    pub updated_since: Option<String>,
    pub label: Option<String>,
    pub assignee_me: bool,
    /// Items per page. 0 means 50. The cap is 100.
    pub limit: usize,
    /// Opaque. The `next` of the previous page.
    pub cursor: Option<String>,
}

impl WorkQuery {
    pub fn page_size(&self) -> usize {
        match self.limit {
            0 => 50,
            n => n.min(100),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page<T> {
    pub items: Vec<T>,
    /// `Some` when more items exist. Pass it as `WorkQuery::cursor`.
    pub next: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum TrackerError {
    /// The tracker lacks the capability. No request was sent.
    #[error("this tracker does not support {0:?}")]
    Unsupported(Capability),
    #[error(transparent)]
    Http(#[from] shipyard_http::Error),
    #[error("setting: {0}")]
    Config(String),
    #[error("not found: {0}")]
    NotFound(String),
}

impl TrackerError {
    /// A 404 from `get` becomes `NotFound`.
    pub(crate) fn not_found(self, what: &str) -> Self {
        match self {
            Self::Http(shipyard_http::Error::Status { status: 404, .. }) => {
                Self::NotFound(what.to_string())
            }
            other => other,
        }
    }
}

/// Check the query against the flags, and its text, before any request.
pub(crate) fn check_query(caps: &Capabilities, q: &WorkQuery) -> Result<(), TrackerError> {
    if q.label.is_some() {
        caps.require(Capability::Labels)?;
    }
    if q.assignee_me {
        caps.require(Capability::Assignee)?;
    }
    if let Some(since) = &q.updated_since {
        let ok = since.len() >= 10
            && since
                .chars()
                .all(|c| c.is_ascii_digit() || "-T:.Z+".contains(c));
        if !ok {
            return Err(TrackerError::Config(format!(
                "updated_since is not an ISO 8601 time: {since}"
            )));
        }
    }
    Ok(())
}

/// The failed call as a test outcome (REQ-012).
pub(crate) fn outcome(error: TrackerError, kind: TrackerKind) -> TestOutcome {
    match error {
        TrackerError::Http(e) => TestOutcome::from_error(&e, kind.read_scope()),
        other => TestOutcome::Failed {
            reason: other.to_string(),
        },
    }
}

pub(crate) fn kind_from_name(name: &str) -> WorkKind {
    let n = name.to_ascii_lowercase();
    if n.contains("epic") {
        WorkKind::Epic
    } else if n.contains("bug") || n.contains("defect") || n.contains("incident") {
        WorkKind::Bug
    } else if n.contains("sub-task") || n.contains("subtask") {
        WorkKind::Subtask
    } else if n.contains("story") {
        WorkKind::Story
    } else if n.contains("task") || n.contains("issue") {
        WorkKind::Task
    } else {
        WorkKind::Other
    }
}

/// `Task`, or `Bug` when a label says so. For trackers with no issue type.
pub(crate) fn kind_from_labels(labels: &[String]) -> WorkKind {
    if labels.iter().any(|l| l.eq_ignore_ascii_case("bug")) {
        WorkKind::Bug
    } else {
        WorkKind::Task
    }
}

pub(crate) fn minutes(seconds: Option<u64>) -> Option<u64> {
    seconds.map(|s| s / 60)
}

pub(crate) fn time(
    estimate_seconds: Option<u64>,
    spent_seconds: Option<u64>,
) -> Option<TimeTracking> {
    (estimate_seconds.is_some() || spent_seconds.is_some()).then(|| TimeTracking {
        estimate_minutes: minutes(estimate_seconds),
        spent_minutes: minutes(spent_seconds),
    })
}

/// HTML as plain text: tags removed, the common entities decoded.
pub(crate) fn plain_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut tag = String::new();
    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                tag.clear();
            }
            '>' if in_tag => {
                in_tag = false;
                let name = tag.trim_start_matches('/').to_ascii_lowercase();
                if name.starts_with("br")
                    || name.starts_with("p")
                    || name.starts_with("div")
                    || name.starts_with("li")
                {
                    out.push('\n');
                }
            }
            _ if in_tag => tag.push(c),
            _ => out.push(c),
        }
    }
    let out = out
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&");
    out.lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}
