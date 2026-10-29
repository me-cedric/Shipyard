//! The pull request, CI and repository shapes. Every adapter maps its API to these.

use serde::{Deserialize, Serialize};
use shipyard_http::TestOutcome;
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ForgeKind {
    #[serde(rename = "github")]
    GitHub,
    #[serde(rename = "gitlab")]
    GitLab,
    AzureDevOps,
}

impl ForgeKind {
    pub const ALL: [ForgeKind; 3] = [Self::GitHub, Self::GitLab, Self::AzureDevOps];

    /// The scope or permission that a read needs, in the words of the product.
    pub fn read_scope(self) -> &'static str {
        match self {
            Self::GitHub => "Pull requests: read",
            Self::GitLab => "read_api",
            Self::AzureDevOps => "Code: Read",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PullState {
    Open,
    Closed,
    Merged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StateFilter {
    #[default]
    Open,
    Closed,
    Merged,
    All,
}

/// One pull request, merge request or Azure DevOps pull request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PullRequest {
    /// GitHub number, GitLab `iid`, Azure DevOps `pullRequestId`. It makes the ref `pr:<forge>:<number>`.
    pub number: u64,
    pub title: String,
    pub state: PullState,
    pub draft: bool,
    pub author: String,
    pub source_branch: String,
    pub target_branch: String,
    pub head_sha: String,
    pub url: String,
    /// ISO 8601. Azure DevOps has no update time: it gives the close time, or the creation time.
    pub updated: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PullQuery {
    pub state: StateFilter,
    /// Items per page. 0 means 30. The cap is 100.
    pub limit: usize,
    /// Opaque. The `next` of the previous page.
    pub cursor: Option<String>,
}

impl PullQuery {
    pub fn page_size(&self) -> usize {
        match self.limit {
            0 => 30,
            n => n.min(100),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CheckState {
    Pending,
    Passing,
    Failing,
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Check {
    pub name: String,
    pub state: CheckState,
    pub url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CiState {
    /// No check exists.
    None,
    Pending,
    Passing,
    Failing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CiStatus {
    pub state: CiState,
    /// Sorted by name.
    pub checks: Vec<Check>,
}

impl CiStatus {
    /// One failing check fails the whole. Else one pending check makes it pending.
    pub(crate) fn from_checks(mut checks: Vec<Check>) -> Self {
        checks.sort_by(|a, b| a.name.cmp(&b.name));
        let any = |s| checks.iter().any(|c| c.state == s);
        let state = if any(CheckState::Failing) {
            CiState::Failing
        } else if any(CheckState::Pending) {
            CiState::Pending
        } else if any(CheckState::Passing) {
            CiState::Passing
        } else {
            CiState::None
        };
        Self { state, checks }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    /// `owner/repo`, `group/subgroup/project` or `project/repo`.
    pub slug: String,
    pub url: String,
    pub default_branch: String,
    pub archived: bool,
    /// `Some(false)` marks a repository that the account cannot push to (REQ-019).
    /// `None` means the forge does not say. Azure DevOps never says in a listing.
    pub can_push: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page<T> {
    pub items: Vec<T>,
    /// `Some` when more items exist.
    pub next: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ForgeError {
    #[error(transparent)]
    Http(#[from] shipyard_http::Error),
    #[error("setting: {0}")]
    Config(String),
    #[error("not found: {0}")]
    NotFound(String),
    /// The forge answered, but refused the write or sent an error object (GitHub GraphQL).
    #[error("{0}")]
    Rejected(String),
}

impl ForgeError {
    /// A 404 becomes `NotFound`.
    pub(crate) fn not_found(self, what: &str) -> Self {
        match self {
            Self::Http(shipyard_http::Error::Status { status: 404, .. }) => {
                Self::NotFound(what.to_string())
            }
            other => other,
        }
    }
}

/// The failed call as a test outcome (REQ-012). A 404 on a private repository means the
/// token cannot see it: the forge hides it.
pub(crate) fn outcome(error: ForgeError, kind: ForgeKind) -> TestOutcome {
    let unseen = |what: &str| TestOutcome::Failed {
        reason: format!("{what} not found: check the name and that the token can read it"),
    };
    match error {
        ForgeError::Http(shipyard_http::Error::Status { status: 404, .. }) => {
            unseen("the repository")
        }
        ForgeError::Http(e) => TestOutcome::from_error(&e, kind.read_scope()),
        ForgeError::NotFound(what) => unseen(&what),
        other => TestOutcome::Failed {
            reason: other.to_string(),
        },
    }
}

/// A repository slug as path segments, or an error. A segment is never empty, `.` or `..`.
/// `min` is the least number of segments.
pub(crate) fn segments(slug: &str, min: usize, max: usize) -> Result<Vec<&str>, ForgeError> {
    let parts: Vec<&str> = slug.split('/').collect();
    let ok = (min..=max).contains(&parts.len())
        && parts.iter().all(|p| {
            !p.is_empty()
                && *p != "."
                && *p != ".."
                && !p.chars().any(|c| c.is_control() || "?#%\\".contains(c))
        });
    if ok {
        Ok(parts)
    } else {
        Err(ForgeError::Config(format!("not a repository name: {slug}")))
    }
}

/// `refs/heads/main` as `main`.
pub(crate) fn branch(reference: &str) -> String {
    reference
        .strip_prefix("refs/heads/")
        .unwrap_or(reference)
        .to_string()
}
