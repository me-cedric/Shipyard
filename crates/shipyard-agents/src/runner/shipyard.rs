//! The Shipyard MCP entry of a run (`add-factory` REQ-037, `add-connections` REQ-018).
//!
//! The app serves the agent tools on a loopback HTTP endpoint with a token for each step. A CLI
//! that reads `type: http` entries (Claude Code) calls the endpoint itself. Any other CLI starts
//! `shipyard --mcp-bridge`, a stdio server that forwards each line to the endpoint. In both
//! cases the URL and the token go to the private MCP file, never to an argument.

use super::*;

/// The flag of `shipyard-cli` that starts the stdio bridge.
pub const BRIDGE_FLAG: &str = "--mcp-bridge";
/// The environment variables that the bridge reads.
pub const URL_ENV: &str = "SHIPYARD_MCP_URL";
pub const TOKEN_ENV: &str = "SHIPYARD_MCP_TOKEN";

/// `http://127.0.0.1:<port>` or `http://localhost:<port>`, then a path. Nothing else: the token
/// must never leave this machine.
fn loopback(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("http://") else {
        return false;
    };
    let host_port = rest.split('/').next().unwrap_or_default();
    ["127.0.0.1", "localhost"].iter().any(|h| {
        host_port
            .strip_prefix(h)
            .is_some_and(|p| p.is_empty() || p.starts_with(':'))
    }) && !url.contains('@')
}

impl McpEntry {
    /// The `shipyard` entry for `runner`: an HTTP entry when the CLI takes one, else the bridge
    /// started from `exe`. Fails for a URL that is not on this machine.
    pub fn shipyard(
        runner: &dyn Runner,
        exe: &Path,
        url: &str,
        token: &Secret,
    ) -> Result<Self, AgentError> {
        if !loopback(url) {
            return Err(AgentError::Invalid(
                "the Shipyard MCP endpoint must be on the loopback address".into(),
            ));
        }
        let entry = Self {
            name: "shipyard".into(),
            command: String::new(),
            args: Vec::new(),
            vars: Vec::new(),
            http: None,
        };
        Ok(if runner.http_mcp() {
            let bearer = Secret::new(format!("Bearer {}", token.expose()));
            Self {
                http: Some(HttpEntry {
                    url: url.into(),
                    headers: vec![("Authorization".into(), bearer)],
                }),
                ..entry
            }
        } else {
            Self {
                command: exe.to_string_lossy().into_owned(),
                args: vec![BRIDGE_FLAG.into()],
                vars: vec![
                    (URL_ENV.into(), Secret::new(url)),
                    (TOKEN_ENV.into(), token.clone()),
                ],
                ..entry
            }
        })
    }
}
