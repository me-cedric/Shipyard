//! The JSON-RPC 2.0 core of the Shipyard MCP server (REQ-016, REQ-037). The transports
//! ([`crate::transport`]) only carry messages to [`Server::handle`].
//!
//! Each call is bound to a run and a step through its token.

use crate::outside::{self, Outside};
use crate::proxy::{self, Proxy};
use crate::session::{Session, Sessions};
use crate::tools::agent::{self, AgentEvents};
use serde_json::{Value, json};
use std::sync::Arc;

/// The wire revisions that this server speaks, newest first. All use plain JSON-RPC over one POST.
const VERSIONS: &[&str] = &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

/// The start of a ref resource URI. A ref is percent-encoded after it: `shipyard://ref/spec%3Aa%23REQ-1`.
pub const REF_URI: &str = "shipyard://ref/";

/// The limits of one call.
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub calls_per_minute: u32,
    /// Largest `arguments` of a call, in bytes.
    pub max_args: usize,
    /// Largest answer of the engine, in bytes.
    pub max_answer: usize,
    /// Largest `report`, in bytes.
    pub max_report: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            calls_per_minute: 60,
            max_args: 64 * 1024,
            max_answer: 256 * 1024,
            max_report: 32 * 1024,
        }
    }
}

pub struct Server {
    events: Arc<dyn AgentEvents>,
    sessions: Arc<Sessions>,
    proxy: Option<Arc<Proxy>>,
    /// The open project and the switches of the outside agents, read at each call.
    outside: Option<Arc<dyn Fn() -> Option<Outside> + Send + Sync>>,
    limits: Limits,
    /// Milliseconds. A test replaces it.
    clock: Box<dyn Fn() -> u64 + Send + Sync>,
}

fn error(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message.into() } })
}

/// An error that the agent reads and can fix: a tool result with `isError`, not a protocol error.
fn tool_error(message: impl Into<String>) -> Value {
    json!({ "content": [{ "type": "text", "text": message.into() }], "isError": true })
}

fn decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = text.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

impl Server {
    pub fn new(events: Arc<dyn AgentEvents>) -> Self {
        let start = std::time::Instant::now();
        Self {
            events,
            sessions: Arc::default(),
            proxy: None,
            outside: None,
            limits: Limits::default(),
            clock: Box::new(move || start.elapsed().as_millis() as u64),
        }
    }

    /// Merge the tools of the connected MCP servers into `tools/list` (REQ-017 of connections).
    pub fn with_proxy(mut self, proxy: Arc<Proxy>) -> Self {
        self.proxy = Some(proxy);
        self
    }

    /// Serve the tools of [`outside`] to the sessions that may call them.
    pub fn with_outside(
        mut self,
        source: impl Fn() -> Option<Outside> + Send + Sync + 'static,
    ) -> Self {
        self.outside = Some(Arc::new(source));
        self
    }

    pub fn with_limits(mut self, limits: Limits) -> Self {
        self.limits = limits;
        self
    }

    pub fn with_clock(mut self, clock: impl Fn() -> u64 + Send + Sync + 'static) -> Self {
        self.clock = Box::new(clock);
        self
    }

    /// Open a session for a step here, and give its token to the agent.
    pub fn sessions(&self) -> &Arc<Sessions> {
        &self.sessions
    }

    /// Answer one JSON-RPC message of the agent that holds `token`. `None`: a notification.
    pub fn handle(&self, token: &str, request: &Value) -> Option<Value> {
        let id = request.get("id").cloned()?;
        let Some(session) = self.sessions.resolve(token) else {
            return Some(error(id, -32001, "unauthorized: the token is not valid"));
        };
        let method = request.get("method").and_then(Value::as_str).unwrap_or("");
        let params = request.get("params").unwrap_or(&Value::Null);
        let result = match method {
            "initialize" => json!({
                "protocolVersion": negotiated(params),
                "capabilities": {
                    "tools": { "listChanged": false },
                    "resources": { "subscribe": false, "listChanged": false }
                },
                "serverInfo": { "name": "shipyard", "version": env!("CARGO_PKG_VERSION") },
                "instructions": "Shipyard run tools. Call report when your step ends. Call ask_question when a person must decide."
            }),
            "ping" => json!({}),
            "tools/list" => {
                let mut tools = agent::definitions(|n| session.allows(n));
                if let Some(proxy) = &self.proxy {
                    tools.extend(proxy.tools().into_iter().filter(|t| {
                        t.get("name")
                            .and_then(Value::as_str)
                            .is_some_and(|n| session.allows(n))
                    }));
                }
                if let Some(o) = self.outside.as_ref().and_then(|f| f()) {
                    tools.extend(
                        outside::definitions(&o)
                            .into_iter()
                            .filter(|t| t["name"].as_str().is_some_and(|n| session.allows(n))),
                    );
                }
                json!({ "tools": tools })
            }
            "tools/call" => self.call(&session, params),
            "resources/list" => json!({ "resources": [] }),
            "resources/templates/list" => json!({ "resourceTemplates": [{
                "uriTemplate": format!("{REF_URI}{{ref}}"),
                "name": "ref",
                "description": "A ref such as spec:auth#REQ-003, percent-encoded.",
                "mimeType": "application/json"
            }] }),
            "resources/read" => match self.read(&session, params) {
                Ok(v) => v,
                Err(why) => return Some(error(id, -32602, why)),
            },
            _ => return Some(error(id, -32601, "Method not found")),
        };
        Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
    }

    /// Rate and size checks of one call. `Err` is the message for the agent.
    fn admit(&self, session: &Session, size: usize) -> Result<(), String> {
        if let Err(wait) = session.take((self.clock)(), self.limits.calls_per_minute) {
            return Err(format!(
                "rate limit: {} calls per minute. Wait {} s.",
                self.limits.calls_per_minute,
                wait.div_ceil(1000)
            ));
        }
        if size > self.limits.max_args {
            return Err(format!(
                "arguments: {size} bytes, the limit is {}",
                self.limits.max_args
            ));
        }
        Ok(())
    }

    fn call(&self, session: &Session, params: &Value) -> Value {
        let name = params.get("name").and_then(Value::as_str).unwrap_or("");
        let args = params
            .get("arguments")
            .filter(|a| !a.is_null())
            .cloned()
            .unwrap_or_else(|| json!({}));
        let size = args.to_string().len();
        if proxy::split(name).is_some() {
            let Some(proxy) = &self.proxy else {
                return tool_error(format!("unknown tool: {name}"));
            };
            if !session.allows(name) {
                return tool_error(format!(
                    "the step {} may not call {name}",
                    session.binding.step
                ));
            }
            if let Err(why) = self.admit(session, size) {
                return tool_error(why);
            }
            return proxy
                .call(name, &args)
                .unwrap_or_else(|e| tool_error(e.to_string()));
        }
        if outside::NAMES.contains(&name) {
            if !session.allows(name) {
                return tool_error(format!(
                    "the step {} may not call {name}",
                    session.binding.step
                ));
            }
            if let Err(why) = self.admit(session, size) {
                return tool_error(why);
            }
            let Some(o) = self.outside.as_ref().and_then(|f| f()) else {
                return tool_error("no project is open in Shipyard");
            };
            return outside::call(&o, name, &args).unwrap_or_else(tool_error);
        }
        if !agent::NAMES.contains(&name) {
            return tool_error(format!("unknown tool: {name}"));
        }
        if !session.allows(name) {
            return tool_error(format!(
                "the step {} may not call {name}",
                session.binding.step
            ));
        }
        if let Err(why) = self.admit(session, size) {
            return tool_error(why);
        }
        match agent::parse(name, &args, self.limits.max_report) {
            Err(why) => tool_error(why),
            Ok(event) => self.emit(session, event),
        }
    }

    fn emit(&self, session: &Session, event: agent::AgentEvent) -> Value {
        match self.events.emit(&session.binding, event) {
            Err(why) => tool_error(why),
            Ok(answer) => {
                let text = answer.to_string();
                if text.len() > self.limits.max_answer {
                    return tool_error(format!(
                        "answer: {} bytes, the limit is {}",
                        text.len(),
                        self.limits.max_answer
                    ));
                }
                let structured = if answer.is_object() {
                    answer
                } else {
                    json!({ "result": answer })
                };
                json!({ "content": [{ "type": "text", "text": text }], "structuredContent": structured })
            }
        }
    }

    fn read(&self, session: &Session, params: &Value) -> Result<Value, String> {
        let uri = params.get("uri").and_then(Value::as_str).unwrap_or("");
        let reference = uri
            .strip_prefix(REF_URI)
            .and_then(decode)
            .ok_or_else(|| format!("unknown resource: {uri}"))?;
        if !session.allows("read_ref") {
            return Err(format!(
                "the step {} may not read refs",
                session.binding.step
            ));
        }
        self.admit(session, reference.len())?;
        let event = agent::parse("read_ref", &json!({ "ref": reference }), 0)?;
        let answer = self.events.emit(&session.binding, event)?;
        let text = answer.to_string();
        if text.len() > self.limits.max_answer {
            return Err("the ref is too large".into());
        }
        Ok(json!({ "contents": [{ "uri": uri, "mimeType": "application/json", "text": text }] }))
    }
}

/// The version of the client when this server speaks it, else the newest.
fn negotiated(params: &Value) -> &'static str {
    let asked = params.get("protocolVersion").and_then(Value::as_str);
    VERSIONS
        .iter()
        .find(|v| Some(**v) == asked)
        .copied()
        .unwrap_or(VERSIONS[0])
}
