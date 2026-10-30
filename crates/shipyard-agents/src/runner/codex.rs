//! Codex: `codex exec --json`, the brief on stdin (`-`).
//!
//! A first run is `codex exec --json ...`; a resumed run is `codex exec resume <id> --json ...`
//! (the subcommand must come right after `exec`, or `resume` is read as the prompt). A resume
//! takes no `--sandbox`, so the mode travels as `-c` config keys there. MCP servers go in a
//! profile file in the Codex home, selected with `--profile`, mode `0600`, removed at the end.
//! The session id is named by Codex on `thread.started`.

use super::*;
use std::collections::HashSet;

pub struct Codex;

fn toml_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Codex layers `<home>/<name>.config.toml` over the person's `config.toml`.
fn profile_toml(entries: &[McpEntry]) -> String {
    let mut out = String::from("# Written by Shipyard for one run. Removed when the run ends.\n");
    for e in entries {
        let args: Vec<String> = e.args.iter().map(|a| toml_str(a)).collect();
        out.push_str(&format!("\n[mcp_servers.{}]\n", e.name));
        out.push_str(&format!("command = {}\n", toml_str(&e.command)));
        out.push_str(&format!("args = [{}]\n", args.join(", ")));
        if !e.vars.is_empty() {
            let vars: Vec<String> = e
                .vars
                .iter()
                .map(|(k, v)| format!("{k} = {}", toml_str(v.expose())))
                .collect();
            out.push_str(&format!("env = {{ {} }}\n", vars.join(", ")));
        }
    }
    out
}

fn codex_home(spec: &RunSpec) -> Result<PathBuf, AgentError> {
    if let Some(h) = &spec.codex_home {
        return Ok(h.clone());
    }
    if let Some(h) = std::env::var_os("CODEX_HOME") {
        return Ok(PathBuf::from(h));
    }
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|h| PathBuf::from(h).join(".codex"))
        .ok_or_else(|| AgentError::Run("cannot find the Codex home folder".into()))
}

impl Runner for Codex {
    fn id(&self) -> &'static str {
        "codex"
    }

    fn bin(&self) -> &'static str {
        "codex"
    }

    fn launch(&self, spec: &RunSpec, program: PathBuf) -> Result<Launch, AgentError> {
        let mut args: Vec<String> = vec!["exec".into()];
        let resumed = spec.resume.is_some();
        if let Some(id) = &spec.resume {
            args.extend(["resume".into(), id.clone()]);
        }
        args.push("--json".into());
        // The sandbox is enforced by the operating system, not by asking the model.
        let tier: &[&str] = match (spec.mode, resumed) {
            (Mode::Plan, false) => &["--sandbox", "read-only"],
            (Mode::Plan, true) => &["-c", "sandbox_mode=\"read-only\""],
            (Mode::Auto, false) => &[
                "--sandbox",
                "workspace-write",
                "-c",
                "approval_policy=\"never\"",
            ],
            (Mode::Auto, true) => &[
                "-c",
                "sandbox_mode=\"workspace-write\"",
                "-c",
                "approval_policy=\"never\"",
            ],
        };
        args.extend(tier.iter().map(|a| a.to_string()));
        if let Some(m) = &spec.model {
            args.extend(["--model".into(), m.clone()]);
        }
        if let Some(e) = &spec.effort {
            args.extend(["-c".into(), format!("model_reasoning_effort=\"{e}\"")]);
        }
        let mut cleanup = Vec::new();
        if !spec.mcp.is_empty() {
            let profile = format!("shipyard-{}", run_tag(spec));
            let path = codex_home(spec)?.join(format!("{profile}.config.toml"));
            write_private(&path, &profile_toml(&spec.mcp))?;
            args.extend(["--profile".into(), profile]);
            cleanup.push(path);
        }
        // `-` reads the brief from stdin: no length limit, nothing in the process list.
        args.push("-".into());
        Ok(Launch {
            program,
            args,
            vars: Vec::new(),
            stdin: Stdin::Text(spec.prompt.clone()),
            cleanup,
        })
    }

    fn parser(&self, _: &RunSpec) -> Box<dyn Parser> {
        Box::new(CodexParser::default())
    }
}

#[derive(Default)]
struct CodexParser {
    started: HashSet<String>,
}

/// Items that are the answer or the thinking, not work.
fn is_message(kind: &str) -> bool {
    matches!(kind, "agent_message" | "reasoning")
}

impl Parser for CodexParser {
    fn line(&mut self, line: &str) -> Step {
        let Some(v) = json(line) else {
            return Step::default();
        };
        let mut out = Vec::new();
        let item = v.get("item");
        let kind = item.map(|i| s(i, "type")).unwrap_or_default();
        let id = item.map(|i| s(i, "id")).unwrap_or_default();
        match s(&v, "type").as_str() {
            "thread.started" => {
                let id = s(&v, "thread_id");
                if !id.is_empty() {
                    out.push(Event::Session { id });
                }
            }
            "turn.started" => out.push(Event::Turn),
            "item.started" if !is_message(&kind) => {
                self.started.insert(id.clone());
                out.push(Event::ToolCall {
                    id,
                    name: kind.clone(),
                    input: call_input(item),
                });
            }
            "item.completed" => {
                let item = item.cloned().unwrap_or(Value::Null);
                if kind == "agent_message" {
                    let text = s(&item, "text");
                    if !text.is_empty() {
                        out.push(Event::Text { text });
                    }
                } else if !is_message(&kind) {
                    // A work item may arrive only as `completed`: report the call first.
                    if !self.started.remove(&id) {
                        out.push(Event::ToolCall {
                            id: id.clone(),
                            name: kind.clone(),
                            input: call_input(Some(&item)),
                        });
                    }
                    let failed = s(&item, "status") == "failed"
                        || item
                            .get("exit_code")
                            .and_then(Value::as_i64)
                            .is_some_and(|c| c != 0);
                    let output = ["aggregated_output", "output", "text"]
                        .iter()
                        .map(|k| s(&item, k))
                        .find(|t| !t.is_empty())
                        .unwrap_or_default();
                    out.push(Event::ToolResult {
                        id,
                        ok: !failed,
                        output: cap(&output),
                    });
                }
            }
            "turn.completed" => {
                // Codex counts the cached part inside `input_tokens`: report it as it is.
                if let Some(input) = find_u64(&v, "input_tokens") {
                    out.push(Event::Usage {
                        input_tokens: input,
                        output_tokens: find_u64(&v, "output_tokens").unwrap_or_default(),
                        cached_tokens: find_u64(&v, "cached_input_tokens").unwrap_or_default(),
                        cost_usd: None,
                    });
                }
            }
            "turn.failed" => out.push(Event::Error {
                message: error_text(v.pointer("/error/message")),
            }),
            "error" => out.push(Event::Error {
                message: error_text(v.get("message")),
            }),
            _ => {}
        }
        Step::events(out)
    }
}

fn error_text(v: Option<&Value>) -> String {
    let t = v.and_then(Value::as_str).unwrap_or_default();
    if t.is_empty() {
        "Codex reported an error".into()
    } else {
        t.to_string()
    }
}

/// A command, or the path of a file change, or the name of an MCP tool.
fn call_input(item: Option<&Value>) -> String {
    let Some(item) = item else {
        return String::new();
    };
    let direct = tool_target(Some(item));
    if !direct.is_empty() {
        return direct;
    }
    let tool = format!("{}.{}", s(item, "server"), s(item, "tool"));
    if tool.len() > 1 {
        return tool;
    }
    item.pointer("/changes/0/path")
        .and_then(Value::as_str)
        .map(cap)
        .unwrap_or_default()
}
