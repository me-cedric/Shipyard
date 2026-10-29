//! Agent runners, HTTP model providers and MCP server control (spec `connections`,
//! REQ-006 to REQ-010).
//!
//! A secret stays in a `Secret` and in the OS keychain (REQ-011). An MCP server gets its secrets
//! in environment variables of its own process, and nowhere else.

pub mod mcp_control;
pub mod runners;
pub mod which;

#[cfg(unix)]
pub mod fake;

use mcp_control::Dependency;

#[derive(Debug, thiserror::Error)]
pub enum AgentError {
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Http(#[from] shipyard_http::Error),
    #[error(transparent)]
    Secret(#[from] shipyard_secrets::SecretError),
    /// The provider answered, but with an error or with no text.
    #[error("{0}")]
    Provider(String),
    #[error("unknown MCP server: {0}")]
    UnknownServer(String),
    #[error("missing dependency: {}", names(.0))]
    MissingDependencies(Vec<Dependency>),
    #[error("missing setting: {}", .0.join(", "))]
    NotConfigured(Vec<String>),
    /// A dependency manager failed, or cannot run here.
    #[error("{0}")]
    Install(String),
    /// A running server failed: it did not answer, it exited or it refused.
    #[error("{0}")]
    Server(String),
}

fn names(deps: &[Dependency]) -> String {
    deps.iter()
        .map(|d| d.label.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}
