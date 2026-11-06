//! Claude Code: `claude -p --output-format stream-json --verbose`, the brief on stdin.
//!
//! Stream: `system` (init, session id), `assistant` (text and `tool_use` blocks), `user`
//! (`tool_result` blocks), `result` (usage and cost for the whole run).

use super::*;

pub struct Claude;

impl Runner for Claude {
    fn id(&self) -> &'static str {
        "claude"
    }

    fn bin(&self) -> &'static str {
        "claude"
    }

    fn launch(&self, spec: &RunSpec, program: PathBuf) -> Result<Launch, AgentError> {
        let mut args: Vec<String> = ["-p", "--output-format", "stream-json", "--verbose"]
            .map(String::from)
            .into();
        // `auto` keeps Claude's safety classifier; `plan` is read only; `acceptEdits` takes edits.
        match (spec.mode, spec.approval) {
            (Mode::Auto, Approval::Bypass) => args.push("--dangerously-skip-permissions".into()),
            (mode, approval) => {
                args.push("--permission-mode".into());
                args.push(
                    match (mode, approval) {
                        (Mode::Plan, _) if spec.tools_only => "default",
                        (Mode::Plan, _) => "plan",
                        (Mode::Auto, Approval::Edits) => "acceptEdits",
                        _ => "auto",
                    }
                    .into(),
                );
            }
        }
        // `--allowedTools` only pre-approves. `--tools` cuts the built-in set itself: a plan run
        // cannot call `Edit` or `Write` whatever the permission mode says. `Bash` stays only when
        // the step lists a `Bash` rule. MCP tools are not built in: this flag leaves them alone.
        if spec.mode == Mode::Plan {
            let bash = spec.allowed_tools.iter().any(|t| t.starts_with("Bash"));
            let set = if bash {
                "Read,Grep,Glob,Bash"
            } else {
                "Read,Grep,Glob"
            };
            args.extend(["--tools".into(), set.into()]);
        }
        if let Some(m) = &spec.model {
            args.extend(["--model".into(), m.clone()]);
        }
        if let Some(e) = &spec.effort {
            args.extend(["--effort".into(), e.clone()]);
        }
        if !spec.allowed_tools.is_empty() {
            args.extend(["--allowedTools".into(), spec.allowed_tools.join(",")]);
        }
        if let Some(id) = &spec.resume {
            args.extend(["--resume".into(), id.clone()]);
        }
        let mut cleanup = Vec::new();
        if !spec.mcp.is_empty() {
            // The file holds the secrets of the servers: owner only, removed at the end.
            let path = spec
                .scratch
                .join(format!("mcp-claude-{}.json", run_tag(spec)));
            let config = serde_json::json!({ "mcpServers": mcp_map(&spec.mcp) });
            write_private(&path, &config.to_string())?;
            args.extend(["--mcp-config".into(), path.to_string_lossy().into_owned()]);
            cleanup.push(path);
        }
        Ok(Launch {
            program,
            args,
            vars: Vec::new(),
            stdin: Stdin::Text(spec.prompt.clone()),
            cleanup,
        })
    }

    fn http_mcp(&self) -> bool {
        true
    }

    fn parser(&self, _: &RunSpec) -> Box<dyn Parser> {
        Box::new(ClaudeParser::default())
    }
}

#[derive(Default)]
struct ClaudeParser {
    session: bool,
    /// The id of the last model message: one message comes as several `assistant` lines.
    message: String,
    /// Tokens already sent live, so the `result` totals add only the rest.
    sent: [u64; 3],
    /// The cost already sent live, from the list prices: the `result` adds only the rest.
    sent_cost: f64,
}

impl ClaudeParser {
    fn session(&mut self, v: &Value, out: &mut Vec<Event>) {
        let id = s(v, "session_id");
        if !self.session && !id.is_empty() {
            self.session = true;
            out.push(Event::Session { id });
        }
    }
}

impl Parser for ClaudeParser {
    fn line(&mut self, line: &str) -> Step {
        let Some(v) = json(line) else {
            return Step::default();
        };
        let mut out = Vec::new();
        match s(&v, "type").as_str() {
            "system" => self.session(&v, &mut out),
            "assistant" => {
                let id = v
                    .pointer("/message/id")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if id.is_empty() || id != self.message {
                    self.message = id.to_string();
                    out.push(Event::Turn);
                    // Live usage of this message: the count moves while the run works.
                    if let Some(u) = v.pointer("/message/usage") {
                        let now = [
                            n(u, "input_tokens"),
                            n(u, "output_tokens"),
                            n(u, "cache_read_input_tokens") + n(u, "cache_creation_input_tokens"),
                        ];
                        if now.iter().any(|t| *t > 0) {
                            for (sent, t) in self.sent.iter_mut().zip(now) {
                                *sent += t;
                            }
                            // shortcut: list prices of `machine::price`, an estimate; the
                            // `result` line corrects it when the AI tool gets to send it.
                            let model = s(v.get("message").unwrap_or(&Value::Null), "model");
                            let cost = crate::machine::price(&model).map(|p| {
                                (n(u, "input_tokens") as f64 * p[0]
                                    + n(u, "output_tokens") as f64 * p[1]
                                    + n(u, "cache_read_input_tokens") as f64 * p[2]
                                    + n(u, "cache_creation_input_tokens") as f64 * p[3])
                                    / 1e6
                            });
                            self.sent_cost += cost.unwrap_or(0.0);
                            out.push(Event::Usage {
                                input_tokens: now[0],
                                output_tokens: now[1],
                                cached_tokens: now[2],
                                cost_usd: cost,
                            });
                        }
                    }
                }
                for block in v
                    .pointer("/message/content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    match s(block, "type").as_str() {
                        "text" => {
                            let text = s(block, "text");
                            if !text.is_empty() {
                                out.push(Event::Text { text });
                            }
                        }
                        "tool_use" => out.push(Event::ToolCall {
                            id: s(block, "id"),
                            name: s(block, "name"),
                            input: tool_target(block.get("input")),
                        }),
                        _ => {}
                    }
                }
            }
            "user" => {
                for block in v
                    .pointer("/message/content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    if s(block, "type") == "tool_result" {
                        out.push(Event::ToolResult {
                            id: s(block, "tool_use_id"),
                            ok: block.get("is_error").and_then(Value::as_bool) != Some(true),
                            output: cap(&result_text(block.get("content"))),
                        });
                    }
                }
            }
            "result" => {
                self.session(&v, &mut out);
                let usage = v.get("usage");
                let count = |key: &str| usage.map_or(0, |u| n(u, key));
                // The totals of the run, less what the messages sent live.
                let [i, o, c] = self.sent;
                self.sent = [0; 3];
                let live = std::mem::take(&mut self.sent_cost);
                out.push(Event::Usage {
                    input_tokens: count("input_tokens").saturating_sub(i),
                    output_tokens: count("output_tokens").saturating_sub(o),
                    // Two cache counters: what the run read cheaply.
                    cached_tokens: (count("cache_read_input_tokens")
                        + count("cache_creation_input_tokens"))
                    .saturating_sub(c),
                    cost_usd: v
                        .get("total_cost_usd")
                        .and_then(Value::as_f64)
                        .map(|total| (total - live).max(0.0)),
                });
                let failed = v.get("is_error").and_then(Value::as_bool) == Some(true)
                    || s(&v, "subtype").starts_with("error");
                if failed {
                    let said = s(&v, "result");
                    out.push(Event::Error {
                        message: if said.is_empty() {
                            s(&v, "subtype")
                        } else {
                            said
                        },
                    });
                }
            }
            _ => {}
        }
        Step::events(out)
    }
}

/// A tool result is a string or a list of `{type: text, text}` blocks.
fn result_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(t)) => t.clone(),
        Some(Value::Array(blocks)) => blocks
            .iter()
            .filter_map(|b| b.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}
