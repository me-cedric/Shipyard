//! The work item shape and the capability flags (spec `connections`, REQ-003, REQ-004). No I/O.
//! Every tracker adapter maps its own API shape to these types. A field that belongs to one
//! tracker stays inside its adapter.

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Capability {
    Hierarchy,
    Transitions,
    Labels,
    Comments,
    TimeTracking,
    Assignee,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
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

    /// Call this before a request that needs the flag. The error is the missing flag (REQ-003).
    pub fn require(&self, capability: Capability) -> Result<(), Capability> {
        if self.has(capability) {
            Ok(())
        } else {
            Err(capability)
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
