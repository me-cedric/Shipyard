//! OpenCode: `opencode run --format json <brief>`.
//!
//! Stream: every event holds `sessionID`; `step_start`, `text`, `tool_use` (sent once the tool
//! ended, with its input and output), `step_finish` (tokens and cost), `error`. The agent `plan`
//! reads only; `build` edits. MCP servers go in a config file named by `OPENCODE_CONFIG`
//! (mode `0600`, removed at the end).
//!
//! shortcut: the event field names follow the OpenCode docs and are not tried against a real
//! binary here. The parser skips a field it does not find.

use super::*;
use shipyard_secrets::Secret;

pub struct OpenCode;

impl Runner for OpenCode {
    fn id(&self) -> &'static str {
        "opencode"
    }

    fn bin(&self) -> &'static str {
        "opencode"
    }

    fn launch(&self, spec: &RunSpec, program: PathBuf) -> Result<Launch, AgentError> {
        let mut args: Vec<String> = vec![
            "run".into(),
            "--format".into(),
            "json".into(),
            "--agent".into(),
            match spec.mode {
                Mode::Plan => "plan",
                Mode::Auto => "build",
            }
            .into(),
        ];
        if let Some(m) = &spec.model {
            args.extend(["--model".into(), m.clone()]);
        }
        if let Some(id) = &spec.resume {
            args.extend(["--session".into(), id.clone()]);
        }
        let mut vars = Vec::new();
        let mut cleanup = Vec::new();
        if !spec.mcp.is_empty() {
            let path = spec
                .scratch
                .join(format!("opencode-{}.json", run_tag(spec)));
            let mut servers = serde_json::Map::new();
            for e in &spec.mcp {
                let command: Vec<&String> = std::iter::once(&e.command).chain(&e.args).collect();
                let environment: serde_json::Map<String, Value> = e
                    .vars
                    .iter()
                    .map(|(k, v)| (k.clone(), Value::String(v.expose().to_string())))
                    .collect();
                servers.insert(
                    e.name.clone(),
                    serde_json::json!({
                        "type": "local", "command": command,
                        "environment": environment, "enabled": true
                    }),
                );
            }
            write_private(&path, &serde_json::json!({ "mcp": servers }).to_string())?;
            vars.push((
                "OPENCODE_CONFIG".to_string(),
                Secret::new(path.to_string_lossy().into_owned()),
            ));
            cleanup.push(path);
        }
        // After `--`, so a brief that starts with `-` is not read as a flag.
        args.extend(["--".into(), spec.prompt.clone()]);
        Ok(Launch {
            program,
            args,
            vars,
            stdin: Stdin::Closed,
            cleanup,
        })
    }

    fn parser(&self, _: &RunSpec) -> Box<dyn Parser> {
        Box::new(OpenCodeParser::default())
    }
}

#[derive(Default)]
struct OpenCodeParser {
    session: bool,
}

impl Parser for OpenCodeParser {
    fn line(&mut self, line: &str) -> Step {
        let Some(v) = json(line) else {
            return Step::default();
        };
        let mut out = Vec::new();
        let id = s(&v, "sessionID");
        if !self.session && !id.is_empty() {
            self.session = true;
            out.push(Event::Session { id });
        }
        let part = v.get("part").unwrap_or(&Value::Null);
        match s(&v, "type").as_str() {
            "step_start" => out.push(Event::Turn),
            "text" => {
                let text = s(part, "text");
                if !text.is_empty() {
                    out.push(Event::Text { text });
                }
            }
            "tool_use" => {
                let state = part.get("state").unwrap_or(&Value::Null);
                let call = s(part, "callID");
                out.push(Event::ToolCall {
                    id: call.clone(),
                    name: s(part, "tool"),
                    input: tool_target(state.get("input")),
                });
                let status = s(state, "status");
                if matches!(status.as_str(), "completed" | "error") {
                    out.push(Event::ToolResult {
                        id: call,
                        ok: status == "completed",
                        output: cap(&s(state, "output")),
                    });
                }
            }
            "step_finish" => {
                let tokens = part.get("tokens").unwrap_or(&Value::Null);
                out.push(Event::Usage {
                    input_tokens: n(tokens, "input"),
                    output_tokens: n(tokens, "output"),
                    cached_tokens: tokens
                        .pointer("/cache/read")
                        .and_then(Value::as_u64)
                        .unwrap_or(0),
                    cost_usd: part.get("cost").and_then(Value::as_f64),
                });
            }
            "error" => {
                let message = ["/error/data/message", "/error/message", "/error/name"]
                    .iter()
                    .find_map(|p| v.pointer(p).and_then(Value::as_str))
                    .unwrap_or("OpenCode reported an error");
                out.push(Event::Error {
                    message: message.to_string(),
                });
            }
            _ => {}
        }
        Step::events(out)
    }
}
