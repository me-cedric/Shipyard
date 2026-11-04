//! The models and the reasoning levels that each agent tool accepts (Settings / Agents and rules).
//!
//! The tool says it when it can: Codex lists its models and their levels (`codex debug models`),
//! OpenCode lists its models (`opencode models`), Claude Code and Copilot name the levels in their
//! help. What a tool does not say comes from the table of this file. A tool with no list and no
//! table gives no model: the view then takes free text.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::which::{quiet, search_dirs, which};

/// How long a tool has to print its list.
const WAIT: Duration = Duration::from_secs(5);
/// A list of the tool beyond this is cut: a picker does not need more.
const MAX_MODELS: usize = 500;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct ModelChoice {
    pub id: String,
    /// The levels that this model accepts. Empty: the model takes no effort.
    pub efforts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct Catalog {
    pub runner: String,
    pub models: Vec<ModelChoice>,
    /// The levels of the default model of the tool. Empty: the tool takes no effort.
    pub efforts: Vec<String>,
}

/// The levels that the engine passes on. A level beyond these has no `Effort` and would be dropped,
/// so no picker offers it (Codex lists `minimal`).
pub const LEVELS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];
const CODEX_LEVELS: [&str; 3] = ["low", "medium", "high"];

fn words(list: &[&str]) -> Vec<String> {
    list.iter().map(|w| w.to_string()).collect()
}

/// The table of a tool, for what it cannot list. shortcut: a constant table per tool, a tool
/// version that lists more replaces it. Haiku, Gemini and the Claude models of Copilot take no
/// effort; OpenCode has no table.
fn table(runner: &str, levels: &[String]) -> Vec<ModelChoice> {
    let pick = |id: &str, on: bool| ModelChoice {
        id: id.into(),
        efforts: if on { levels.to_vec() } else { Vec::new() },
    };
    match runner {
        "claude" => vec![
            pick("opus", true),
            pick("sonnet", true),
            pick("haiku", false),
        ],
        "codex" => vec![pick("gpt-5-codex", true), pick("gpt-5", true)],
        "copilot" => vec![pick("claude-sonnet-4.5", false), pick("gpt-5", true)],
        "gemini" => [
            "gemini-2.5-pro",
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
        ]
        .map(|id| pick(id, false))
        .to_vec(),
        _ => Vec::new(),
    }
}

/// The levels in the table of a tool.
fn table_levels(runner: &str) -> Vec<String> {
    match runner {
        "claude" => words(&LEVELS),
        "copilot" => words(&LEVELS[..4]),
        "codex" => words(&CODEX_LEVELS),
        _ => Vec::new(),
    }
}

/// The catalog of a runner, from the tool when it can list and from the table for the rest.
/// Blocks for up to a few seconds: call it in a blocking task.
pub fn catalog(runner: &str) -> Catalog {
    catalog_in(runner, &search_dirs(), WAIT)
}

pub fn catalog_in(runner: &str, dirs: &[PathBuf], wait: Duration) -> Catalog {
    let program = which(runner, dirs);
    let ask = |args: &[&str]| program.as_deref().and_then(|p| output(p, args, wait));
    let mut levels = table_levels(runner);
    let mut models = Vec::new();
    match runner {
        "claude" | "copilot" => {
            let found = ask(&["--help"])
                .map(|h| levels_in_help(&h))
                .unwrap_or_default();
            if !found.is_empty() {
                levels = found;
            }
        }
        "codex" => {
            if let Some((list, first)) = ask(&["debug", "models"]).and_then(|j| codex_models(&j)) {
                models = list;
                levels = first;
            }
        }
        "opencode" => {
            models = ask(&["models"])
                .map(|t| opencode_models(&t))
                .unwrap_or_default();
        }
        _ => {}
    }
    if models.is_empty() {
        models = table(runner, &levels);
    }
    Catalog {
        runner: runner.into(),
        models,
        efforts: levels,
    }
}

/// What the program prints on stdout, or `None` when it does not start or does not end in time.
fn output(program: &Path, args: &[&str], wait: Duration) -> Option<String> {
    let mut cmd = Command::new(program);
    // The temp folder: a tool that scans its working folder does not scan a project.
    cmd.args(args)
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = quiet(&mut cmd).spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    // A list can be larger than the pipe: read while the tool runs.
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut out = String::new();
        let _ = stdout.read_to_string(&mut out);
        let _ = tx.send(out);
    });
    let start = Instant::now();
    let out = rx.recv_timeout(wait).ok();
    // A tool can close stdout and run on: it gets the rest of the time limit, then it is killed.
    let ended = loop {
        match child.try_wait() {
            Ok(Some(_)) => break true,
            Ok(None) if start.elapsed() < wait => std::thread::sleep(Duration::from_millis(10)),
            _ => break false,
        }
    };
    if !ended {
        let _ = child.kill();
        let _ = child.wait();
    }
    out.filter(|_| ended)
}

/// The levels that `--effort` names in the help of a tool: `(low, medium)` or
/// `(choices: "low", "medium")`.
fn levels_in_help(help: &str) -> Vec<String> {
    let Some(at) = help
        .find("--effort")
        .or_else(|| help.find("--reasoning-effort"))
    else {
        return Vec::new();
    };
    let rest = &help[at..];
    let Some((_, inner)) = rest.split_once('(') else {
        return Vec::new();
    };
    let Some((inner, _)) = inner.split_once(')') else {
        return Vec::new();
    };
    let inner = inner.trim().trim_start_matches("choices:");
    let out: Vec<String> = inner
        .split(',')
        .map(|w| w.trim().trim_matches('"').to_string())
        .collect();
    if out
        .iter()
        .all(|w| !w.is_empty() && w.chars().all(|c| c.is_ascii_lowercase()))
    {
        out
    } else {
        Vec::new()
    }
}

/// The listed models of `codex debug models`, and the levels of the first one.
fn codex_models(json: &str) -> Option<(Vec<ModelChoice>, Vec<String>)> {
    let v: Value = serde_json::from_str(json).ok()?;
    let list: Vec<ModelChoice> = v
        .get("models")?
        .as_array()?
        .iter()
        .filter(|m| m.get("visibility").and_then(Value::as_str) == Some("list"))
        .filter_map(|m| {
            Some(ModelChoice {
                id: m.get("slug")?.as_str()?.to_string(),
                efforts: m
                    .get("supported_reasoning_levels")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|l| Some(l.get("effort")?.as_str()?.to_string()))
                    .filter(|e| LEVELS.contains(&e.as_str()))
                    .collect(),
            })
        })
        .collect();
    let first = list.first()?.efforts.clone();
    Some((list, first))
}

/// One `provider/model` for each line of `opencode models`.
fn opencode_models(text: &str) -> Vec<ModelChoice> {
    text.lines()
        .map(str::trim)
        .filter(|l| l.contains('/') && !l.contains(char::is_whitespace))
        .take(MAX_MODELS)
        .map(|id| ModelChoice {
            id: id.into(),
            efforts: Vec::new(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_levels_come_from_the_help_of_the_tool() {
        let claude = "  --effort <level>   Effort level (low, medium, high, xhigh, max)\n";
        assert_eq!(
            levels_in_help(claude),
            ["low", "medium", "high", "xhigh", "max"]
        );
        let copilot = "  --effort, --reasoning-effort <level>  Set it (choices:\n   \"low\", \"medium\", \"high\")\n";
        assert_eq!(levels_in_help(copilot), ["low", "medium", "high"]);
        // No flag, or a text that is no list of words: no level.
        assert!(levels_in_help("--model <m>  A model (any name)").is_empty());
        assert!(levels_in_help("--effort <n>  A number (1 to 5, or more)").is_empty());
    }

    #[test]
    fn codex_lists_its_models_with_their_levels_and_hides_the_hidden_ones() {
        let json = r#"{"models":[
            {"slug":"hid","visibility":"hide","supported_reasoning_levels":[{"effort":"low"}]},
            {"slug":"a","visibility":"list","supported_reasoning_levels":[{"effort":"minimal"},{"effort":"low"},{"effort":"high"}]},
            {"slug":"b","visibility":"list","supported_reasoning_levels":[]}]}"#;
        let (list, first) = codex_models(json).unwrap();
        assert_eq!(
            list.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
            ["a", "b"]
        );
        // `minimal` has no `Effort` in the engine: the picker does not offer it.
        assert_eq!(first, ["low", "high"]);
        assert!(list[1].efforts.is_empty());
        assert!(codex_models("not json").is_none());
    }

    #[test]
    fn opencode_gives_one_model_for_each_provider_line() {
        let list =
            opencode_models("anthropic/claude-sonnet\nwarning: slow start\n\nopenai/gpt-5\n");
        assert_eq!(
            list.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
            ["anthropic/claude-sonnet", "openai/gpt-5"]
        );
    }
}
