//! The third-party MCP servers, served through the Shipyard MCP endpoint (REQ-017).
//!
//! The endpoint lists its own tools and the tools of each active server, each named
//! `<server-id>__<tool>`. A call goes to the server that owns the tool. The processes and the
//! secrets are in [`McpControl`]: a secret stays in the keychain and reaches only the child.
//!
//! shortcut: the tool list of a server is its first page. Follow `nextCursor` if a server needs it.

use serde_json::{Value, json};
use shipyard_agents::AgentError;
use shipyard_agents::mcp_control::McpControl;
use std::sync::Arc;

/// What joins the server id and the tool in a proxied name. A server id never holds it, so the
/// first occurrence splits the name.
pub const SEP: &str = "__";

/// `jira__search_issues` gives `("jira", "search_issues")`. `None` for a Shipyard tool.
pub fn split(name: &str) -> Option<(&str, &str)> {
    name.split_once(SEP)
        .filter(|(server, tool)| !server.is_empty() && !tool.is_empty())
}

pub struct Proxy {
    control: Arc<McpControl>,
}

impl Proxy {
    pub fn new(control: Arc<McpControl>) -> Self {
        Self { control }
    }

    pub fn control(&self) -> &McpControl {
        &self.control
    }

    /// The tools of each active server, renamed. A server that does not start, or does not answer,
    /// adds nothing: the endpoint keeps serving the others. The servers start in parallel.
    pub fn tools(&self) -> Vec<Value> {
        let ids = self.control.enabled_ids();
        std::thread::scope(|scope| {
            let jobs: Vec<_> = ids
                .iter()
                .map(|id| scope.spawn(move || self.server_tools(id)))
                .collect();
            jobs.into_iter()
                .flat_map(|job| job.join().unwrap_or_default())
                .collect()
        })
    }

    fn server_tools(&self, id: &str) -> Vec<Value> {
        let Ok(answer) = self.control.request(id, "tools/list", json!({})) else {
            return Vec::new();
        };
        let tools = answer.pointer("/result/tools").and_then(Value::as_array);
        tools
            .into_iter()
            .flatten()
            .filter_map(|tool| {
                let name = tool.get("name")?.as_str()?;
                let mut renamed = tool.clone();
                renamed["name"] = Value::String(format!("{id}{SEP}{name}"));
                Some(renamed)
            })
            .collect()
    }

    /// Call a proxied tool and return the `result` of the server. A name with no active server is
    /// [`AgentError::UnknownServer`]: the same answer as an unknown Shipyard tool. A server that
    /// died starts again first.
    pub fn call(&self, name: &str, arguments: &Value) -> Result<Value, AgentError> {
        let (id, tool) = split(name).ok_or_else(|| AgentError::UnknownServer(name.to_string()))?;
        if !self.control.is_enabled(id) {
            return Err(AgentError::UnknownServer(id.to_string()));
        }
        let answer = self.control.request(
            id,
            "tools/call",
            json!({ "name": tool, "arguments": arguments }),
        )?;
        if let Some(error) = answer.get("error") {
            let said = error.get("message").and_then(Value::as_str);
            return Err(AgentError::Server(
                said.map_or_else(|| error.to_string(), str::to_string),
            ));
        }
        Ok(answer.get("result").cloned().unwrap_or(Value::Null))
    }

    /// One request of a relay, for an active server: the whole JSON-RPC response, or `None`.
    pub fn forward(&self, server: &str, method: &str, params: Value) -> Option<Value> {
        if !self.control.is_enabled(server) {
            return None;
        }
        self.control.request(server, method, params).ok()
    }
}
