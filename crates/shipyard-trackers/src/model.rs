//! The contract types of the trackers. The work item shape and the flags live in `shipyard-core`
//! (`work_item.rs`) and are re-exported here. A field that belongs to one tracker stays inside
//! its adapter (REQ-004).

use shipyard_http::TestOutcome;

pub use shipyard_core::work_item::*;

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
    /// The tracker refused a change that a person asked for, for example a transition that the
    /// workflow does not allow. The text names the reason.
    #[error("the tracker refused the change: {0}")]
    Refused(String),
    /// A write left and its answer did not come back. The change may be in the tracker.
    #[error("the answer was lost, the change may be in the tracker: {0}")]
    Lost(String),
}

impl From<Capability> for TrackerError {
    fn from(capability: Capability) -> Self {
        Self::Unsupported(capability)
    }
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

/// A page of 100 comments or more is rare. This cap stops a loop on a tracker that never ends.
const MAX_PAGES: usize = 50;

/// Read every page: `page` gets the cursor, `None` first, then each `next`.
pub(crate) fn every<T>(
    mut page: impl FnMut(Option<&str>) -> Result<Page<T>, TrackerError>,
) -> Result<Vec<T>, TrackerError> {
    let (mut out, mut cursor) = (Vec::new(), None::<String>);
    for _ in 0..MAX_PAGES {
        let p = page(cursor.as_deref())?;
        out.extend(p.items);
        match p.next {
            Some(next) => cursor = Some(next),
            None => break,
        }
    }
    Ok(out)
}

/// A comment or ticket id that goes into a URL path: digits only, so a crafted id cannot reach
/// another path.
pub(crate) fn digits<'a>(what: &str, id: &'a str) -> Result<&'a str, TrackerError> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err(TrackerError::Config(format!(
            "a {what} id is digits, not {id}"
        )));
    }
    Ok(id)
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
