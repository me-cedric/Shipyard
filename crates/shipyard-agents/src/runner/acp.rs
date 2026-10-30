//! GitHub Copilot over the Agent Client Protocol: `copilot --acp`.
//!
//! JSON-RPC over stdin and stdout. The parser is a small state machine: `initialize`, then
//! `session/new` (or `session/load` to resume), then the model and effort options, then one
//! `session/prompt`. The answer streams as `session/update` notifications and Copilot asks
//! before each tool (`session/request_permission`): this client answers from the run mode, so
//! no person is needed. The process stays alive after the answer, so the parser ends the run on
//! the prompt response and the driver kills the group.

use super::*;
use serde_json::json;
use std::path::Path;

pub struct Copilot;

impl Runner for Copilot {
    fn id(&self) -> &'static str {
        "copilot"
    }

    fn bin(&self) -> &'static str {
        "copilot"
    }

    fn launch(&self, _: &RunSpec, program: PathBuf) -> Result<Launch, AgentError> {
        // MCP servers and the brief go through the protocol, not through arguments or files.
        Ok(Launch {
            program,
            args: vec!["--acp".into()],
            vars: Vec::new(),
            stdin: Stdin::Open,
            cleanup: Vec::new(),
        })
    }

    fn parser(&self, spec: &RunSpec) -> Box<dyn Parser> {
        Box::new(AcpParser::new(spec))
    }
}

const INIT: u64 = 1;
const SESSION: u64 = 2;
/// Ids 3 and up are the option requests. The prompt has a fixed id far above them.
const PROMPT: u64 = 100;

#[derive(PartialEq)]
enum Stage {
    Init,
    Session,
    Prompt,
}

struct AcpParser {
    stage: Stage,
    spec_prompt: String,
    dir: PathBuf,
    mode: Mode,
    model: Option<String>,
    effort: Option<String>,
    resume: Option<String>,
    mcp: Value,
    session: String,
}

fn rpc(id: u64, method: &str, params: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }).to_string()
}

impl AcpParser {
    fn new(spec: &RunSpec) -> Self {
        // ACP wants the server list inline, with env as `[{name, value}]`.
        let mcp = spec
            .mcp
            .iter()
            .map(|e| {
                let vars: Vec<Value> = e
                    .vars
                    .iter()
                    .map(|(k, v)| json!({ "name": k, "value": v.expose() }))
                    .collect();
                json!({ "name": e.name, "command": e.command, "args": e.args, "env": vars })
            })
            .collect();
        Self {
            stage: Stage::Init,
            spec_prompt: spec.prompt.clone(),
            dir: spec.dir.clone(),
            mode: spec.mode,
            model: spec.model.clone(),
            effort: spec.effort.clone(),
            resume: spec.resume.clone(),
            mcp: Value::Array(mcp),
            session: String::new(),
        }
    }

    fn open_session(&self) -> String {
        match &self.resume {
            Some(id) => rpc(
                SESSION,
                "session/load",
                json!({ "sessionId": id, "cwd": self.dir, "mcpServers": self.mcp }),
            ),
            None => rpc(
                SESSION,
                "session/new",
                json!({ "cwd": self.dir, "mcpServers": self.mcp }),
            ),
        }
    }

    /// The options and the prompt, once the session exists.
    fn prompt_lines(&self) -> Vec<String> {
        let option = |id: u64, key: &str, value: &str| {
            rpc(
                id,
                "session/set_config_option",
                json!({ "sessionId": self.session, "configId": key, "value": value }),
            )
        };
        let mut lines = Vec::new();
        if let Some(m) = &self.model {
            lines.push(option(3, "model", m));
        }
        if let Some(e) = &self.effort {
            // A level that the model does not take is refused and left at the default.
            lines.push(option(4, "reasoning_effort", e));
        }
        lines.push(rpc(
            PROMPT,
            "session/prompt",
            json!({ "sessionId": self.session, "prompt": [{ "type": "text", "text": self.spec_prompt }] }),
        ));
        lines
    }

    /// Whether the run mode lets Copilot run this tool. Plan reads. Auto stays in the workspace
    /// and off the web.
    fn allowed(&self, tool: &Value) -> bool {
        let kind = tool["kind"].as_str().unwrap_or("other");
        match self.mode {
            Mode::Plan => matches!(kind, "read" | "search" | "think"),
            Mode::Auto => {
                kind != "fetch"
                    && tool["locations"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|l| l["path"].as_str())
                        .all(|p| Path::new(p).starts_with(&self.dir))
            }
        }
    }
}

/// The id of the first option of the wanted kinds.
fn option_id(options: &Value, kinds: [&str; 2]) -> Option<String> {
    let list = options.as_array()?;
    kinds.iter().find_map(|k| {
        list.iter()
            .find(|o| o["kind"].as_str() == Some(k))
            .and_then(|o| o["optionId"].as_str().map(str::to_string))
    })
}

impl Parser for AcpParser {
    fn start(&mut self) -> Vec<String> {
        vec![rpc(
            INIT,
            "initialize",
            json!({ "protocolVersion": 1, "clientCapabilities": {} }),
        )]
    }

    fn line(&mut self, line: &str) -> Step {
        let Some(v) = json(line) else {
            return Step::default();
        };
        let mut step = Step::default();
        let reply_id = v.get("id").and_then(Value::as_u64);
        let method = v.get("method").and_then(Value::as_str);

        // A response to a request of ours.
        if method.is_none() && reply_id.is_some() {
            let id = reply_id.unwrap_or_default();
            let error = v.get("error").map(|e| {
                e["message"]
                    .as_str()
                    .unwrap_or("GitHub Copilot refused the request")
                    .to_string()
            });
            match (id, &self.stage) {
                (INIT, Stage::Init) => {
                    if let Some(message) = error {
                        step.events.push(Event::Error { message });
                        step.done = true;
                    } else {
                        self.stage = Stage::Session;
                        step.send.push(self.open_session());
                    }
                }
                (SESSION, Stage::Session) => {
                    if let Some(message) = error {
                        step.events.push(Event::Error { message });
                        step.done = true;
                    } else {
                        let named = v.pointer("/result/sessionId").and_then(Value::as_str);
                        self.session = named
                            .map(str::to_string)
                            .or_else(|| self.resume.clone())
                            .unwrap_or_default();
                        if !self.session.is_empty() {
                            step.events.push(Event::Session {
                                id: self.session.clone(),
                            });
                        }
                        self.stage = Stage::Prompt;
                        step.send = self.prompt_lines();
                    }
                }
                (PROMPT, Stage::Prompt) => {
                    step.done = true;
                    if let Some(message) = error {
                        step.events.push(Event::Error { message });
                    } else {
                        let u = v.pointer("/result/usage").unwrap_or(&Value::Null);
                        step.events.push(Event::Usage {
                            input_tokens: n(u, "inputTokens"),
                            output_tokens: n(u, "outputTokens"),
                            cached_tokens: n(u, "cachedReadTokens"),
                            cost_usd: None,
                        });
                    }
                }
                // The answer to an option request: a refused level is not a failure.
                _ => {}
            }
            return step;
        }

        match method {
            Some("session/update") => {
                let u = &v["params"]["update"];
                match u["sessionUpdate"].as_str() {
                    Some("agent_message_chunk") => {
                        let text = s(&u["content"], "text");
                        if !text.is_empty() {
                            step.events.push(Event::Text { text });
                        }
                    }
                    Some("tool_call") => {
                        step.events.push(Event::Turn);
                        let name = u["title"].as_str().or(u["kind"].as_str()).unwrap_or("tool");
                        step.events.push(Event::ToolCall {
                            id: s(u, "toolCallId"),
                            name: name.to_string(),
                            input: u
                                .pointer("/locations/0/path")
                                .and_then(Value::as_str)
                                .map(cap)
                                .unwrap_or_default(),
                        });
                    }
                    Some("tool_call_update") => {
                        let status = s(u, "status");
                        if matches!(status.as_str(), "completed" | "failed") {
                            step.events.push(Event::ToolResult {
                                id: s(u, "toolCallId"),
                                ok: status == "completed",
                                output: u
                                    .pointer("/content/0/content/text")
                                    .and_then(Value::as_str)
                                    .map(cap)
                                    .unwrap_or_default(),
                            });
                        }
                    }
                    _ => {}
                }
            }
            Some("session/request_permission") => {
                let tool = &v["params"]["toolCall"];
                let ok = self.allowed(tool);
                let choice = if ok {
                    option_id(&v["params"]["options"], ["allow_once", "allow_always"])
                } else {
                    option_id(&v["params"]["options"], ["reject_once", "reject_always"])
                };
                let outcome = match choice {
                    Some(id) => json!({ "outcome": "selected", "optionId": id }),
                    None => json!({ "outcome": "cancelled" }),
                };
                step.send.push(
                    json!({ "jsonrpc": "2.0", "id": v["id"], "result": { "outcome": outcome } })
                        .to_string(),
                );
            }
            // A request this client does not serve gets an answer, or Copilot waits.
            Some(_) if v.get("id").is_some() => step.send.push(
                json!({
                    "jsonrpc": "2.0", "id": v["id"],
                    "error": { "code": -32601, "message": "not supported by Shipyard" }
                })
                .to_string(),
            ),
            _ => {}
        }
        step
    }
}
