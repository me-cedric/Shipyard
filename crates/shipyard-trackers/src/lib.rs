//! The `Tracker` trait and the read-only adapters: Jira Cloud, Jira Data Center, GitHub Issues,
//! GitLab Issues, Azure DevOps and Linear.
//!
//! Each adapter maps its API to [`WorkItem`]. No adapter shares a type or a call with another
//! (REQ-004). A caller checks [`Tracker::capabilities`] first; a call that needs an absent
//! capability returns [`TrackerError::Unsupported`] and sends no request (REQ-003).
//! The adapters send no write (Q-002). Writes live in [`work`]. A secret stays in a [`Secret`] (REQ-011).

mod azure;
mod github;
mod gitlab;
mod jira;
mod linear;
pub mod marker;
mod model;
pub mod work;
mod write_azure;
mod write_gitlab;
mod write_linear;

use serde::{Deserialize, Serialize};
use shipyard_http::Http;
use shipyard_secrets::Secret;
use std::sync::Arc;

pub use model::*;
pub use shipyard_http::{Client, Error as HttpError, TestOutcome};

/// The settings of a tracker connection that are not secret (REQ-013).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrackerConfig {
    pub kind: TrackerKind,
    /// The address a person uses in the browser: `https://acme.atlassian.net`,
    /// `https://jira.corp.example`, `https://github.com` or a GitHub Enterprise host,
    /// `https://gitlab.com` or a self-managed host, `https://dev.azure.com/acme`.
    /// Linear ignores it.
    pub url: String,
    /// The account email. Jira Cloud needs it. The other kinds ignore it.
    pub user: Option<String>,
}

pub trait Tracker: Send + Sync {
    fn kind(&self) -> TrackerKind;

    fn capabilities(&self) -> Capabilities {
        self.kind().capabilities()
    }

    /// The account behind the credential.
    fn me(&self) -> Result<Person, TrackerError>;

    /// One page of items. Order is not promised.
    fn search(&self, query: &WorkQuery) -> Result<Page<WorkItem>, TrackerError>;

    fn get(&self, key: &str) -> Result<WorkItem, TrackerError>;

    /// The containers that a person can pick as the scope: Jira projects, repositories, Azure
    /// projects or Linear teams. The most recent 100. Empty when the API lists none.
    fn scopes(&self) -> Result<Vec<Scope>, TrackerError> {
        Ok(Vec::new())
    }

    /// Needs the `comments` flag.
    fn comments(&self, key: &str) -> Result<Vec<Comment>, TrackerError>;

    /// A read-only check of the credential and of the read permission (REQ-012).
    fn test(&self) -> TestOutcome {
        let kind = self.kind();
        let account = match self.me() {
            Ok(me) => me.name,
            Err(e) => return model::outcome(e, kind),
        };
        match self.search(&WorkQuery {
            limit: 1,
            ..WorkQuery::default()
        }) {
            Ok(_) => TestOutcome::Passed { account },
            Err(e) => model::outcome(e, kind),
        }
    }
}

/// Build the adapter for a connection. The address is validated: a typo must not send the token elsewhere.
pub fn connect(
    config: &TrackerConfig,
    secret: Secret,
    http: Arc<dyn Http>,
) -> Result<Box<dyn Tracker>, TrackerError> {
    let base = || shipyard_http::base_url(&config.url).map_err(TrackerError::from);
    Ok(match config.kind {
        TrackerKind::JiraCloud => {
            let user = config.user.clone().filter(|u| !u.trim().is_empty());
            let user = user
                .ok_or_else(|| TrackerError::Config("Jira Cloud needs the account email".into()))?;
            Box::new(jira::Jira::cloud(http, base()?, user, secret))
        }
        TrackerKind::JiraDataCenter => Box::new(jira::Jira::data_center(http, base()?, secret)),
        TrackerKind::GitHubIssues => Box::new(github::GitHub::new(http, &base()?, secret)),
        TrackerKind::GitLabIssues => Box::new(gitlab::GitLab::new(http, &base()?, secret)),
        TrackerKind::AzureDevOps => Box::new(azure::Azure::new(http, base()?, secret)),
        TrackerKind::Linear => Box::new(linear::Linear::new(http, secret)),
    })
}
