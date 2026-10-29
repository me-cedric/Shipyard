//! Gemini CLI: `gemini --prompt=<brief> --output-format stream-json`.
//!
//! Stream: `init` (session id), `message` (assistant text chunks), `tool_use`, `tool_result`,
//! `error`, `result` (token stats). MCP servers go in a settings file named by
//! `GEMINI_CLI_SYSTEM_SETTINGS_PATH` (mode `0600`, removed at the end), not in an argument.
//!
//! shortcut: the flag names (`--approval-mode`, `--allowed-tools`, `--resume`) follow the Gemini
//! CLI docs and are not tried against a real binary here. Check them in the first manual run.

use super::*;

pub struct Gemini;

impl Runner for Gemini {
    fn id(&self) -> &'static str {
        "gemini"
    }

    fn bin(&self) -> &'static str {
        "gemini"
    }

    fn launch(&self, spec: &RunSpec, program: PathBuf) -> Result<Launch, AgentError> {
        let mut args: Vec<String> = vec![
            "--output-format".into(),
            "stream-json".into(),
            "--approval-mode".into(),
            match spec.mode {
                Mode::Plan => "plan",
                Mode::Auto => "auto_edit",
            }
            .into(),
        ];
        if let Some(m) = &spec.model {
            args.extend(["--model".into(), m.clone()]);
        }
        if !spec.allowed_tools.is_empty() {
            args.extend(["--allowed-tools".into(), spec.allowed_tools.join(",")]);
        }
        if let Some(id) = &spec.resume {
            args.extend(["--resume".into(), id.clone()]);
        }
        let mut vars = Vec::new();
        let mut cleanup = Vec::new();
        if !spec.mcp.is_empty() {
            let path = spec.scratch.join(format!("gemini-{}.json", run_tag(spec)));
            let settings = serde_json::json!({ "mcpServers": mcp_map(&spec.mcp) });
            write_private(&path, &settings.to_string())?;
            // The path is not a secret; the file is.
            vars.push((
                "GEMINI_CLI_SYSTEM_SETTINGS_PATH".to_string(),
                shipyard_secrets::Secret::new(path.to_string_lossy().into_owned()),
            ));
            cleanup.push(path);
        }
        // `--prompt=<brief>` in one argument: a brief that starts with `-` is not read as a flag.
        args.push(format!("--prompt={}", spec.prompt));
        Ok(Launch {
            program,
            args,
            vars,
            stdin: Stdin::Closed,
            cleanup,
        })
    }

    fn parser(&self, _: &RunSpec) -> Box<dyn Parser> {
        Box::new(GeminiParser)
    }
}

struct GeminiParser;

impl Parser for GeminiParser {
    fn line(&mut self, line: &str) -> Step {
        let Some(v) = json(line) else {
            return Step::default();
        };
        let mut out = Vec::new();
        match s(&v, "type").as_str() {
            "init" => {
                let id = s(&v, "session_id");
                if !id.is_empty() {
                    out.push(Event::Session { id });
                }
            }
            "message" if s(&v, "role") == "assistant" => {
                let text = s(&v, "content");
                if !text.is_empty() {
                    out.push(Event::Text { text });
                }
            }
            "tool_use" => {
                out.push(Event::Turn);
                out.push(Event::ToolCall {
                    id: s(&v, "tool_id"),
                    name: s(&v, "tool_name"),
                    input: tool_target(v.get("parameters")),
                });
            }
            "tool_result" => out.push(Event::ToolResult {
                id: s(&v, "tool_id"),
                ok: s(&v, "status") == "success",
                output: cap(&s(&v, "output")),
            }),
            "error" => out.push(Event::Error {
                message: s(&v, "message"),
            }),
            "result" => {
                let stats = v.get("stats").unwrap_or(&Value::Null);
                out.push(Event::Usage {
                    input_tokens: find_u64(stats, "input_tokens").unwrap_or_default(),
                    output_tokens: find_u64(stats, "output_tokens").unwrap_or_default(),
                    cached_tokens: find_u64(stats, "cached").unwrap_or_default(),
                    cost_usd: None,
                });
                let status = s(&v, "status");
                if !status.is_empty() && status != "success" {
                    out.push(Event::Error {
                        message: format!("Gemini CLI ended with status {status}"),
                    });
                }
            }
            _ => {}
        }
        Step::events(out)
    }
}
