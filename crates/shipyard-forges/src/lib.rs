//! The `Forge` trait and the read-only adapters: GitHub, GitLab and Azure DevOps.
//!
//! An adapter lists and reads pull requests, reads CI status, and lists repositories with a
//! push marker (REQ-005, REQ-019). It sends no write. Create a remote repository, open a pull
//! request and push are later, and need an approval (Q-002).

mod azure;
mod github;
mod gitlab;
mod model;
pub mod pull_request;

use serde::{Deserialize, Serialize};
use shipyard_http::Http;
use shipyard_secrets::Secret;
use std::sync::Arc;

pub use model::*;
pub use pull_request::*;
pub use shipyard_http::{Client, Error as HttpError, TestOutcome};

/// The settings of a forge connection that are not secret (REQ-013).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ForgeConfig {
    pub kind: ForgeKind,
    /// The address a person uses in the browser: `https://github.com` or a GitHub Enterprise host,
    /// `https://gitlab.com` or a self-managed host, `https://dev.azure.com/acme`.
    pub url: String,
}

pub trait Forge: Send + Sync {
    fn kind(&self) -> ForgeKind;

    /// The account behind the credential: its display name.
    fn me(&self) -> Result<String, ForgeError>;

    /// One page of pull requests of `repo`. Newest update first, except Azure DevOps (newest created).
    fn list_pulls(&self, repo: &str, query: &PullQuery) -> Result<Page<PullRequest>, ForgeError>;

    fn pull(&self, repo: &str, number: u64) -> Result<PullRequest, ForgeError>;

    /// The checks of the head commit of the pull request.
    fn ci_status(&self, repo: &str, number: u64) -> Result<CiStatus, ForgeError>;

    /// One page of the repositories that the account can reach. Each one has a push marker.
    fn list_repos(
        &self,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<Page<Repository>, ForgeError>;

    /// The push target check (REQ-019): read `can_push` of the result.
    fn repository(&self, repo: &str) -> Result<Repository, ForgeError>;

    /// A read-only check of the credential and the read permission (REQ-012).
    /// With `repo`, it also reads that repository's pull requests.
    fn test(&self, repo: Option<&str>) -> TestOutcome;
}

/// Build the adapter for a connection. The address is validated: a typo must not send the token elsewhere.
pub fn connect(
    config: &ForgeConfig,
    secret: Secret,
    http: Arc<dyn Http>,
) -> Result<Box<dyn Forge>, ForgeError> {
    let base = shipyard_http::base_url(&config.url)?;
    Ok(match config.kind {
        ForgeKind::GitHub => Box::new(github::GitHub::new(http, &base, secret)),
        ForgeKind::GitLab => Box::new(gitlab::GitLab::new(http, &base, secret)),
        ForgeKind::AzureDevOps => Box::new(azure::Azure::new(http, base, secret)),
    })
}

/// Like [`connect`], for the pull request calls. The result reads as a [`Forge`] too.
pub fn connect_pull_api(
    config: &ForgeConfig,
    secret: Secret,
    http: Arc<dyn Http>,
) -> Result<Box<dyn PullApi>, ForgeError> {
    let base = shipyard_http::base_url(&config.url)?;
    Ok(match config.kind {
        ForgeKind::GitHub => Box::new(github::GitHub::new(http, &base, secret)),
        ForgeKind::GitLab => Box::new(gitlab::GitLab::new(http, &base, secret)),
        ForgeKind::AzureDevOps => Box::new(azure::Azure::new(http, base, secret)),
    })
}
