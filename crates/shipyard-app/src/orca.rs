//! The coding-agent sessions that Orca runs (<https://www.onorca.dev>), read for Factory / Sessions.
//!
//! Orca is an outside agent environment: its `orca` CLI comes with the desktop
//! app. Shipyard only reads `orca terminal list
//! --json` and brings a terminal forward with `orca terminal switch`. It never starts, stops, removes
//! or types into a session. The program is found in the
//! tool folders of a desktop app (`which::search_dirs`), and a click is the proof of an open.

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Res, blocking, err};

/// Where the desktop app is downloaded from. The CLI comes with it.
pub const DOWNLOAD_URL: &str = "https://www.onorca.dev/download";
/// A read that takes longer is an Orca that does not answer, not a slow one.
const TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Default, PartialEq, Serialize, Type)]
pub struct OrcaSession {
    pub id: String,
    /// The title of the terminal, as Orca shows it.
    pub title: String,
    /// `claude`, `codex`, `copilot`, `gemini`, `opencode`, `cursor`, or empty.
    pub agent: String,
    /// The last part of the worktree folder.
    pub worktree: String,
    pub project: String,
    pub branch: String,
    /// What the agent does or asks, in the words of Orca.
    pub activity: String,
    pub since: String,
    /// The share of the context window in use, 0 to 100.
    pub context: Option<u32>,
    /// `working`, `idle`, `done` or `unknown`.
    pub state: String,
}

#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OrcaStatus {
    /// The `orca` CLI is on the path.
    pub installed: bool,
    /// The CLI answered: the Orca app runs.
    pub running: bool,
    pub sessions: Vec<OrcaSession>,
    /// Why the list is empty when it should not be, in the words of Orca.
    pub message: String,
    pub download_url: String,
}

fn program() -> Option<std::path::PathBuf> {
    shipyard_agents::which::which("orca", &shipyard_agents::which::search_dirs())
}

/// A missing CLI and a closed Orca are a status, not an error.
pub fn status() -> OrcaStatus {
    let mut out = OrcaStatus {
        download_url: DOWNLOAD_URL.into(),
        ..Default::default()
    };
    let Some(bin) = program() else { return out };
    out.installed = true;
    match run(&bin, &["terminal", "list", "--json"]) {
        Ok(json) => {
            out.running = true;
            out.sessions = sessions_of(&json);
        }
        Err(e) => out.message = e,
    }
    out
}

/// Brings one terminal forward in Orca. It changes what Orca shows, never what runs. It needs the
/// click of a person.
pub fn open(terminal: &str, click: bool) -> Res<()> {
    if !click {
        return Err("this change needs the click of a person".into());
    }
    let handle = terminal.trim();
    if handle.is_empty()
        || handle.len() > 200
        || handle.starts_with('-')
        || handle.chars().any(char::is_control)
    {
        return Err("not an Orca terminal handle".into());
    }
    let bin = program().ok_or("the orca command is not installed")?;
    run(
        &bin,
        &["terminal", "switch", "--terminal", handle, "--json"],
    )
    .map(|_| ())
}

fn run(bin: &std::path::Path, args: &[&str]) -> Result<Value, String> {
    let mut child = Command::new(bin)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("orca did not start: {e}"))?;
    let (mut out, mut errs) = (child.stdout.take(), child.stderr.take());
    let read = |r: Option<&mut dyn Read>| {
        let mut buf = String::new();
        if let Some(r) = r {
            let _ = r.read_to_string(&mut buf);
        }
        buf
    };
    let o = std::thread::spawn(move || read(out.as_mut().map(|r| r as &mut dyn Read)));
    let e = std::thread::spawn(move || read(errs.as_mut().map(|r| r as &mut dyn Read)));
    let started = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        if started.elapsed() >= TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Orca did not answer in 5 seconds.".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let (stdout, stderr) = (o.join().unwrap_or_default(), e.join().unwrap_or_default());
    if !status.success() {
        let why = stderr.lines().rev().find(|l| !l.trim().is_empty());
        return Err(why.map_or("Orca is not running.".into(), |l| l.trim().into()));
    }
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Orca answered with something that is not JSON: {e}"))
}

/// The sessions of an `orca terminal list --json` answer, wherever the list sits.
pub fn sessions_of(json: &Value) -> Vec<OrcaSession> {
    let list = match json {
        Value::Array(items) => items.as_slice(),
        Value::Object(map) => ["terminals", "items", "data", "result", "sessions"]
            .iter()
            .find_map(|k| map.get(*k).and_then(Value::as_array))
            .map_or(&[][..], Vec::as_slice),
        _ => &[],
    };
    list.iter()
        .filter(|v| v.is_object())
        .map(session_of)
        .collect()
}

fn text(v: &Value) -> String {
    match v {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

fn first(v: &Value, keys: &[&str]) -> String {
    keys.iter()
        .map(|k| text(&v[*k]))
        .find(|t| !t.is_empty())
        .unwrap_or_default()
}

/// A folder path is long: keep its last segment.
fn short(path: &str) -> String {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(path)
        .to_string()
}

fn session_of(v: &Value) -> OrcaSession {
    let or = |own: String, key: &[&str]| {
        if own.is_empty() {
            first(&v["worktree"], key)
        } else {
            own
        }
    };
    let worktree = or(
        first(v, &["worktreeName", "worktree", "branch", "cwd", "path"]),
        &["name", "branch", "path"],
    );
    let project = or(
        first(v, &["repoName", "repo", "project", "workspace"]),
        &["repoName", "repo", "project"],
    );
    let branch = or(first(v, &["branch", "gitBranch"]), &["branch", "gitBranch"]);
    let context = ["contextPercent", "contextUsage", "context"]
        .iter()
        .find_map(|k| v[*k].as_f64())
        .map(|n| if n <= 1.0 { n * 100.0 } else { n })
        .map(|n| n.clamp(0.0, 100.0).round() as u32);
    // The agent is named in whichever field Orca filled: try them all.
    let haystack = [
        "agent",
        "agentType",
        "program",
        "command",
        "process",
        "title",
        "name",
    ]
    .iter()
    .map(|k| text(&v[*k]))
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase();
    OrcaSession {
        id: first(v, &["id", "terminalId", "handle", "terminal"]),
        title: first(v, &["title", "name", "label", "tabTitle"]),
        agent: agent_of(&haystack).into(),
        worktree: short(&worktree),
        project: short(&project),
        branch,
        activity: first(
            v,
            &[
                "statusText",
                "summary",
                "lastLine",
                "subtitle",
                "comment",
                "description",
            ],
        ),
        since: first(
            v,
            &[
                "stateSince",
                "updatedAt",
                "lastActivityAt",
                "startedAt",
                "createdAt",
            ],
        ),
        context,
        state: state_of(&first(v, &["state", "status", "agentState", "activity"])),
    }
}

/// The agent that a program or a title names.
pub fn agent_of(text: &str) -> &'static str {
    ["claude", "codex", "copilot", "gemini", "opencode", "cursor"]
        .into_iter()
        .find(|w| text.contains(w))
        .unwrap_or("")
}

/// The state words of Orca, folded into `working`, `idle`, `done` and `unknown`.
pub fn state_of(raw: &str) -> String {
    let s = raw.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| s.contains(w));
    if s.is_empty() {
        "unknown"
    } else if has(&["exit", "done", "stop", "close", "dead", "finish"]) {
        "done"
    } else if has(&["idle", "wait", "ready", "prompt", "input"]) {
        "idle"
    } else if has(&["busy", "run", "work", "active", "think", "stream"]) {
        "working"
    } else {
        "unknown"
    }
    .into()
}

#[tauri::command]
#[specta::specta]
pub async fn orca_status(app: AppHandle) -> Res<OrcaStatus> {
    blocking(app, |_| Ok(status())).await
}

#[tauri::command]
#[specta::specta]
pub async fn orca_open(app: AppHandle, terminal: String, click: bool) -> Res<()> {
    blocking(app, move |_| open(&terminal, click).map_err(err)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_bare_list_and_a_wrapped_list_read_the_same() {
        let item = json!({ "id": "t1", "title": "Claude Code", "worktree": "/repo/.orca/feat-login", "state": "running" });
        let (bare, wrapped) = (
            sessions_of(&json!([item.clone()])),
            sessions_of(&json!({ "terminals": [item] })),
        );
        assert_eq!(bare, wrapped);
        assert_eq!(
            (
                bare[0].agent.as_str(),
                bare[0].worktree.as_str(),
                bare[0].state.as_str()
            ),
            ("claude", "feat-login", "working")
        );
    }

    #[test]
    fn other_field_names_and_a_rich_session_still_read() {
        let s = &sessions_of(
            &json!([{ "terminalId": 7, "name": "fix bug", "command": "codex --full-auto", "worktree": { "name": "fix-42", "branch": "feat/x", "repoName": "hush" }, "status": "waiting", "contextPercent": 0.34 }]),
        )[0];
        assert_eq!(
            (s.id.as_str(), s.agent.as_str(), s.worktree.as_str()),
            ("7", "codex", "fix-42")
        );
        assert_eq!(
            (s.project.as_str(), s.branch.as_str(), s.state.as_str()),
            ("hush", "feat/x", "idle")
        );
        assert_eq!(s.context, Some(34));
    }

    #[test]
    fn anything_else_reads_as_no_session_and_states_fold_into_four_words() {
        assert!(sessions_of(&json!("nope")).is_empty());
        assert!(sessions_of(&json!({ "ok": true })).is_empty());
        assert!(sessions_of(&json!([1, "x"])).is_empty());
        assert_eq!(state_of("Exited (0)"), "done");
        assert_eq!(state_of("busy"), "working");
        assert_eq!(state_of(""), "unknown");
    }

    #[test]
    fn an_open_needs_a_click_and_a_real_handle() {
        assert!(open("t1", false).is_err());
        for bad in ["", "t1\n--json", "--help"] {
            assert!(open(bad, true).is_err(), "{bad:?}");
        }
    }
}
