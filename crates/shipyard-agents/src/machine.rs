//! The AI sessions of this computer and what they cost, whatever started them.
//!
//! Source: Legacy `infrastructure/ai_sessions.rs` (process list, folder of a process, agent and
//! helper detection) and `infrastructure/finops.rs` (the transcript formats of Claude Code and
//! Codex, the de-duplication of Claude entries). Legacy asks `ccusage` for prices; this reader
//! needs no network and prices from [`price`], a list price that is only indicative.
//!
//! Read-only, except [`stop`]. A transcript is the agent's own history, so the tokens of a session
//! are exact and its cost is an estimate.
//!
//! shortcut: a day is the UTC day of the timestamp, and a session is found on Unix only
//! (`ps`, `lsof`, `/proc`). Add `chrono` and a Windows process reader when either is needed.

use crate::which::quiet;
use serde::Serialize;
use serde_json::Value;
use specta::Type;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime};

/// A transcript written this recently belongs to an agent at work.
const WORKING_WINDOW: Duration = Duration::from_secs(45);

/// The finished sessions the list keeps at most.
const DONE_CAP: usize = 20;

/// A session counts as recent when its history changed in this time.
const RECENT: Duration = Duration::from_secs(24 * 3600);

/// One AI session on this computer.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MachineSession {
    /// `pid:<n>` for a running session, `log:<id>` for a finished one.
    pub key: String,
    /// `claude`, `codex`, `copilot`, `gemini`, `opencode` or `cursor`.
    pub runner: String,
    /// The last model that the history names, or `""`.
    pub model: String,
    /// The last segment of the working folder.
    pub project: String,
    pub cwd: String,
    pub title: String,
    /// `working`, `idle` or `done`.
    pub state: String,
    pub tokens: f64,
    /// An estimate from the list price. `0` for a model with no price.
    pub cost_usd: f64,
    /// The process to stop, for a running session.
    pub pid: Option<u32>,
}

/// The use of one model by one runner on one day in one project.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SpendRow {
    /// `YYYY-MM-DD`, UTC.
    pub day: String,
    pub runner: String,
    pub model: String,
    pub project: String,
    pub tokens: f64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
struct Tokens {
    input: f64,
    output: f64,
    cache_read: f64,
    cache_write: f64,
}

impl Tokens {
    fn total(&self) -> f64 {
        self.input + self.output + self.cache_read + self.cache_write
    }
}

/// One history file, read.
#[derive(Debug, Clone, Default)]
pub struct Transcript {
    pub id: String,
    pub runner: &'static str,
    pub cwd: String,
    pub title: String,
    pub model: String,
    pub modified: Option<SystemTime>,
    /// `(day, model)` to its tokens.
    by_day: BTreeMap<(String, String), Tokens>,
}

/// USD per million tokens: input, output, cache read, cache write. List prices, so an estimate.
/// `None` for a model that this table does not know.
pub fn price(model: &str) -> Option<[f64; 4]> {
    let m = model.to_ascii_lowercase();
    let table: [(&str, [f64; 4]); 7] = [
        ("claude-opus", [15.0, 75.0, 1.5, 18.75]),
        ("claude-sonnet", [3.0, 15.0, 0.3, 3.75]),
        ("claude-haiku", [1.0, 5.0, 0.1, 1.25]),
        ("gpt-5-mini", [0.25, 2.0, 0.025, 0.0]),
        ("gpt-5", [1.25, 10.0, 0.125, 0.0]),
        ("o3", [2.0, 8.0, 0.5, 0.0]),
        ("gemini", [1.25, 10.0, 0.31, 0.0]),
    ];
    table
        .iter()
        .find(|(prefix, _)| m.contains(prefix))
        .map(|(_, p)| *p)
}

fn cost(model: &str, t: &Tokens) -> f64 {
    price(model).map_or(0.0, |p| {
        (t.input * p[0] + t.output * p[1] + t.cache_read * p[2] + t.cache_write * p[3]) / 1e6
    })
}

fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn day_of(ts: &str) -> String {
    ts.get(..10).unwrap_or("").to_string()
}

fn last_segment(path: &str) -> String {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .to_string()
}

fn add(t: &mut Transcript, ts: &str, model: &str, u: Tokens) {
    let day = day_of(ts);
    if day.is_empty() {
        return;
    }
    let e = t.by_day.entry((day, model.to_string())).or_default();
    e.input += u.input;
    e.output += u.output;
    e.cache_read += u.cache_read;
    e.cache_write += u.cache_write;
    if !model.is_empty() {
        t.model = model.to_string();
    }
}

/// Claude Code: one `assistant` entry for each content block of an answer, each copy with the same
/// usage, so an entry counts once by message id and request id.
pub fn parse_claude(id: &str, lines: impl Iterator<Item = String>) -> Transcript {
    let mut t = Transcript {
        id: id.into(),
        runner: "claude",
        ..Default::default()
    };
    let mut seen = HashSet::new();
    for line in lines {
        let Ok(e) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if t.cwd.is_empty() {
            t.cwd = text(&e, "cwd").into();
        }
        match text(&e, "type") {
            "ai-title" => {
                let title = [text(&e, "aiTitle"), text(&e, "title")]
                    .into_iter()
                    .find(|s| !s.is_empty());
                if let Some(title) = title {
                    t.title = title.into();
                }
            }
            "assistant" => {
                let Some(msg) = e.get("message") else {
                    continue;
                };
                let Some(u) = msg.get("usage") else {
                    continue;
                };
                let key = format!("{}:{}", text(msg, "id"), text(&e, "requestId"));
                if key != ":" && !seen.insert(key) {
                    continue;
                }
                let n = |k: &str| u.get(k).and_then(Value::as_f64).unwrap_or(0.0);
                let tokens = Tokens {
                    input: n("input_tokens"),
                    output: n("output_tokens"),
                    cache_read: n("cache_read_input_tokens"),
                    cache_write: n("cache_creation_input_tokens"),
                };
                add(&mut t, text(&e, "timestamp"), text(msg, "model"), tokens);
            }
            _ => {}
        }
    }
    t
}

/// Codex: each `token_count` event is one call; cached input sits inside its input total.
pub fn parse_codex(id: &str, lines: impl Iterator<Item = String>) -> Transcript {
    let mut t = Transcript {
        id: id.into(),
        runner: "codex",
        ..Default::default()
    };
    let mut model = String::new();
    let mut last_total = -1.0;
    for line in lines {
        let Ok(e) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let p = e.get("payload").unwrap_or(&Value::Null);
        match text(&e, "type") {
            "session_meta" => {
                t.cwd = text(p, "cwd").into();
                if !text(p, "id").is_empty() {
                    t.id = text(p, "id").into();
                }
            }
            "turn_context" if !text(p, "model").is_empty() => model = text(p, "model").into(),
            "event_msg" => match text(p, "type") {
                "user_message" if t.title.is_empty() => {
                    t.title = text(p, "message").chars().take(80).collect();
                }
                "token_count" => {
                    let Some(info) = p.get("info") else { continue };
                    let Some(u) = info.get("last_token_usage") else {
                        continue;
                    };
                    // A repeated event carries the same running total.
                    let total = info["total_token_usage"]["total_tokens"]
                        .as_f64()
                        .unwrap_or(-1.0);
                    if total >= 0.0 && total == last_total {
                        continue;
                    }
                    last_total = total;
                    let n = |k: &str| u.get(k).and_then(Value::as_f64).unwrap_or(0.0);
                    let cached = n("cached_input_tokens");
                    let tokens = Tokens {
                        input: (n("input_tokens") - cached).max(0.0),
                        output: n("output_tokens"),
                        cache_read: cached,
                        cache_write: 0.0,
                    };
                    add(&mut t, text(&e, "timestamp"), &model, tokens);
                }
                _ => {}
            },
            _ => {}
        }
    }
    t
}

/// The folders that hold the histories.
#[derive(Debug, Clone)]
pub struct Roots {
    pub claude: PathBuf,
    pub codex: PathBuf,
}

impl Roots {
    pub fn from_env() -> Self {
        let home = std::env::var_os("HOME")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .map(PathBuf::from)
            .unwrap_or_default();
        let under = |var: &str, dir: &str, sub: &str| {
            std::env::var_os(var)
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(dir))
                .join(sub)
        };
        Self {
            claude: under("CLAUDE_CONFIG_DIR", ".claude", "projects"),
            codex: under("CODEX_HOME", ".codex", "sessions"),
        }
    }
}

fn jsonl_files(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            if depth > 0 {
                jsonl_files(&path, depth - 1, out);
            }
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            out.push(path);
        }
    }
}

/// Every history changed in the last `window`, newest first.
pub fn scan(roots: &Roots, window: Duration, now: SystemTime) -> Vec<Transcript> {
    let since = now - window;
    let mut found: Vec<(PathBuf, &'static str)> = Vec::new();
    let (mut claude, mut codex) = (Vec::new(), Vec::new());
    // Claude: `<project>/<session>.jsonl`, one level down. Codex: `YYYY/MM/DD/rollout-*.jsonl`.
    jsonl_files(&roots.claude, 1, &mut claude);
    jsonl_files(&roots.codex, 3, &mut codex);
    found.extend(claude.into_iter().map(|p| (p, "claude")));
    found.extend(codex.into_iter().map(|p| (p, "codex")));
    let mut out: Vec<Transcript> = found
        .into_iter()
        .filter_map(|(path, runner)| {
            let modified = std::fs::metadata(&path).and_then(|m| m.modified()).ok()?;
            if modified < since {
                return None;
            }
            let id = path.file_stem()?.to_str()?.to_string();
            let file = std::fs::File::open(&path).ok()?;
            let lines = BufReader::new(file).lines().map_while(Result::ok);
            let mut t = if runner == "claude" {
                parse_claude(&id, lines)
            } else {
                parse_codex(&id, lines)
            };
            t.modified = Some(modified);
            Some(t)
        })
        .collect();
    out.sort_by_key(|a| std::cmp::Reverse(a.modified));
    out
}

/// The spend rows from `since_day` (`YYYY-MM-DD`) on, one for each day, runner, model and project.
pub fn spend(transcripts: &[Transcript], since_day: &str) -> Vec<SpendRow> {
    let mut sum: BTreeMap<(String, String, String, String), Tokens> = BTreeMap::new();
    for t in transcripts {
        for ((day, model), u) in &t.by_day {
            if day.as_str() < since_day {
                continue;
            }
            let key = (
                day.clone(),
                t.runner.into(),
                model.clone(),
                last_segment(&t.cwd),
            );
            let e = sum.entry(key).or_default();
            e.input += u.input;
            e.output += u.output;
            e.cache_read += u.cache_read;
            e.cache_write += u.cache_write;
        }
    }
    sum.into_iter()
        .map(|((day, runner, model, project), u)| SpendRow {
            cost_usd: cost(&model, &u),
            tokens: u.total(),
            day,
            runner,
            model,
            project,
        })
        .collect()
}

/// `YYYY-MM-DD` (UTC) of a time. Hinnant's civil-from-days.
pub fn day_string(t: SystemTime) -> String {
    let days = t
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() / 86_400) as i64
        + 719_468;
    let era = days.div_euclid(146_097);
    let doe = days.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

/// `YYYY-MM-DDTHH:MM:SSZ` of a time.
pub fn timestamp(t: SystemTime) -> String {
    let secs = t
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    let r = secs % 86_400;
    format!(
        "{}T{:02}:{:02}:{:02}Z",
        day_string(t),
        r / 3600,
        r % 3600 / 60,
        r % 60
    )
}

/// The spend of the last `days` days, today included.
pub fn report(roots: &Roots, days: u32) -> Vec<SpendRow> {
    let now = SystemTime::now();
    let days = days.clamp(1, 365);
    let since = day_string(now - Duration::from_secs(u64::from(days - 1) * 86_400));
    spend(
        &scan(roots, Duration::from_secs(u64::from(days) * 86_400), now),
        &since,
    )
}

/* ---------- Processes ---------- */

/// One process, as `ps` lists it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Proc {
    pub pid: u32,
    pub ppid: u32,
    pub command: String,
}

/// The agent that a command line runs.
pub fn agent_of_command(command: &str) -> Option<&'static str> {
    let lower = command.replace('\\', "/").to_ascii_lowercase();
    for (package, agent) in [
        ("@anthropic-ai/claude-code/", "claude"),
        ("@openai/codex/", "codex"),
        ("@github/copilot/", "copilot"),
        ("@google/gemini-cli/", "gemini"),
        ("/opencode-ai/", "opencode"),
    ] {
        if lower.contains(package) {
            return Some(agent);
        }
    }
    // `node /…/bin/claude --resume`: the first two words cover a launcher and its script.
    for word in command.split_whitespace().take(2) {
        let base = word.rsplit(['/', '\\']).next().unwrap_or(word);
        let agent = match base.to_ascii_lowercase().as_str() {
            "claude" => "claude",
            "codex" => "codex",
            "copilot" => "copilot",
            "gemini" => "gemini",
            "opencode" => "opencode",
            "cursor-agent" => "cursor",
            _ => continue,
        };
        return Some(agent);
    }
    None
}

/// An agent binary started as a tool server, not as a session: `claude mcp serve`.
pub fn is_helper(command: &str) -> bool {
    let words: Vec<&str> = command.split_whitespace().collect();
    words
        .iter()
        .any(|w| matches!(*w, "--claude-in-chrome-mcp" | "--mcp" | "mcp-server"))
        || words
            .windows(2)
            .any(|w| agent_of_command(w[0]).is_some() && w[1] == "mcp")
}

fn output(program: &str, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null()).stderr(Stdio::null());
    quiet(&mut cmd);
    let out = cmd.output().ok()?;
    // `lsof` exits 1 when a process left meanwhile; what it printed holds.
    (!out.stdout.is_empty()).then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

fn processes() -> Vec<Proc> {
    if cfg!(windows) {
        return Vec::new();
    }
    let Some(out) = output("ps", &["-axww", "-o", "pid=,ppid=,command="]) else {
        return Vec::new();
    };
    out.lines()
        .filter_map(|line| {
            let mut parts = line.trim_start().splitn(3, char::is_whitespace);
            let pid = parts.next()?.trim().parse().ok()?;
            let ppid = parts.next()?.trim().parse().ok()?;
            Some(Proc {
                pid,
                ppid,
                command: parts.next().unwrap_or("").trim().into(),
            })
        })
        .collect()
}

fn cwds(pids: &[u32]) -> HashMap<u32, String> {
    let mut out = HashMap::new();
    if pids.is_empty() || cfg!(windows) {
        return out;
    }
    if cfg!(target_os = "linux") {
        for pid in pids {
            if let Ok(path) = std::fs::read_link(format!("/proc/{pid}/cwd")) {
                out.insert(*pid, path.to_string_lossy().into_owned());
            }
        }
        return out;
    }
    let list = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let Some(text) = output("lsof", &["-a", "-d", "cwd", "-Fpn", "-p", &list]) else {
        return out;
    };
    let mut pid = 0;
    for line in text.lines() {
        if let Some(p) = line.strip_prefix('p') {
            pid = p.parse().unwrap_or(0);
        } else if let Some(n) = line.strip_prefix('n')
            && pid != 0
        {
            out.insert(pid, n.into());
        }
    }
    out
}

/// The agent processes that are sessions: a launcher and the binary it starts are one session.
pub fn agent_procs(procs: &[Proc]) -> Vec<(Proc, &'static str)> {
    let by_pid: HashMap<u32, &Proc> = procs.iter().map(|p| (p.pid, p)).collect();
    procs
        .iter()
        .filter_map(|p| agent_of_command(&p.command).map(|a| (p, a)))
        .filter(|(p, _)| !is_helper(&p.command))
        .filter(|(p, a)| {
            let mut at = by_pid.get(&p.ppid);
            for _ in 0..40 {
                let Some(parent) = at else { return true };
                if agent_of_command(&parent.command) == Some(*a) {
                    return false;
                }
                at = by_pid.get(&parent.ppid);
            }
            true
        })
        .map(|(p, a)| (p.clone(), a))
        .collect()
}

/// Join the running agents with their histories: the running first, then the finished.
pub fn join(
    agents: &[(Proc, &'static str)],
    folders: &HashMap<u32, String>,
    transcripts: &[Transcript],
    now: SystemTime,
) -> Vec<MachineSession> {
    let mut used: Vec<&str> = Vec::new();
    let view = |t: &Transcript, key: String, state: &str, cwd: String, pid: Option<u32>| {
        let tokens = t.by_day.values().map(Tokens::total).sum();
        let cost_usd = t.by_day.iter().map(|((_, m), u)| cost(m, u)).sum();
        MachineSession {
            key,
            runner: t.runner.into(),
            model: t.model.clone(),
            project: last_segment(&cwd),
            cwd,
            title: t.title.clone(),
            state: state.into(),
            tokens,
            cost_usd,
            pid,
        }
    };
    let mut out = Vec::new();
    for (p, runner) in agents {
        let cwd = folders.get(&p.pid).cloned().unwrap_or_default();
        let t = transcripts
            .iter()
            .find(|t| t.runner == *runner && !used.contains(&t.id.as_str()) && t.cwd == cwd);
        let state = match t.and_then(|t| t.modified) {
            Some(m) if now.duration_since(m).unwrap_or_default() <= WORKING_WINDOW => "working",
            _ => "idle",
        };
        let key = format!("pid:{}", p.pid);
        match t {
            Some(t) => {
                used.push(&t.id);
                out.push(view(t, key, state, cwd, Some(p.pid)));
            }
            None => out.push(MachineSession {
                key,
                runner: runner.to_string(),
                project: last_segment(&cwd),
                cwd,
                state: state.into(),
                pid: Some(p.pid),
                ..Default::default()
            }),
        }
    }
    for t in transcripts
        .iter()
        .filter(|t| !used.contains(&t.id.as_str()))
        .take(DONE_CAP)
    {
        out.push(view(
            t,
            format!("log:{}", t.id),
            "done",
            t.cwd.clone(),
            None,
        ));
    }
    out
}

/// Every AI session of the last day on this computer.
pub fn sessions(roots: &Roots) -> Vec<MachineSession> {
    let now = SystemTime::now();
    let agents = agent_procs(&processes());
    let folders = cwds(&agents.iter().map(|(p, _)| p.pid).collect::<Vec<_>>());
    join(&agents, &folders, &scan(roots, RECENT, now), now)
}

/// End a running session. `Err` when the process is not an agent session now: a stale or forged
/// pid must never end another program.
pub fn stop(pid: u32) -> Result<(), String> {
    let procs = processes();
    if !agent_procs(&procs).iter().any(|(p, _)| p.pid == pid) {
        return Err(format!("no AI session runs as process {pid}"));
    }
    let pid = pid.to_string();
    let mut cmd = Command::new("kill");
    cmd.args(["-TERM", &pid]);
    quiet(&mut cmd);
    let ok = cmd.status().map(|s| s.success()).unwrap_or(false);
    ok.then_some(())
        .ok_or_else(|| format!("could not stop process {pid}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(s: &str) -> impl Iterator<Item = String> + '_ {
        s.lines().map(str::to_string)
    }

    #[test]
    fn claude_counts_a_message_once_and_prices_it() {
        let text = r#"{"type":"ai-title","aiTitle":"Fix login"}
{"type":"assistant","cwd":"/w/app","timestamp":"2026-10-01T10:00:00Z","requestId":"r1","message":{"id":"m1","model":"claude-sonnet-4","usage":{"input_tokens":1000000,"output_tokens":0}}}
{"type":"assistant","cwd":"/w/app","timestamp":"2026-10-01T10:00:01Z","requestId":"r1","message":{"id":"m1","model":"claude-sonnet-4","usage":{"input_tokens":1000000,"output_tokens":0}}}
not json"#;
        let t = parse_claude("s1", lines(text));
        assert_eq!((t.title.as_str(), t.cwd.as_str()), ("Fix login", "/w/app"));
        let rows = spend(&[t], "2026-10-01");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].tokens, 1_000_000.0);
        assert!((rows[0].cost_usd - 3.0).abs() < 1e-9);
        assert_eq!(rows[0].project, "app");
    }

    #[test]
    fn codex_skips_a_repeated_total_and_splits_cached_input() {
        let text = r#"{"type":"session_meta","payload":{"id":"c1","cwd":"/w/api"}}
{"type":"turn_context","payload":{"model":"gpt-5"}}
{"type":"event_msg","timestamp":"2026-10-02T09:00:00Z","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":100},"last_token_usage":{"input_tokens":80,"cached_input_tokens":30,"output_tokens":20}}}}
{"type":"event_msg","timestamp":"2026-10-02T09:00:01Z","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":100},"last_token_usage":{"input_tokens":80,"cached_input_tokens":30,"output_tokens":20}}}}"#;
        let t = parse_codex("x", lines(text));
        assert_eq!(t.id, "c1");
        let rows = spend(&[t], "2026-10-01");
        assert_eq!(rows[0].tokens, 100.0);
        assert_eq!(rows[0].model, "gpt-5");
        assert!(spend(&[parse_codex("x", lines(text))], "2026-10-03").is_empty());
    }

    #[test]
    fn agents_are_found_and_helpers_and_children_are_not() {
        let procs = [
            Proc {
                pid: 1,
                ppid: 0,
                command: "/bin/zsh".into(),
            },
            Proc {
                pid: 2,
                ppid: 1,
                command: "node /usr/lib/@anthropic-ai/claude-code/cli.js".into(),
            },
            Proc {
                pid: 3,
                ppid: 2,
                command: "claude --resume".into(),
            },
            Proc {
                pid: 4,
                ppid: 1,
                command: "claude mcp serve".into(),
            },
            Proc {
                pid: 5,
                ppid: 1,
                command: "codex".into(),
            },
        ];
        let got: Vec<_> = agent_procs(&procs)
            .iter()
            .map(|(p, a)| (p.pid, *a))
            .collect();
        assert_eq!(got, [(2, "claude"), (5, "codex")]);
    }

    #[test]
    fn a_running_agent_takes_its_history_and_the_rest_is_done() {
        let now = SystemTime::now();
        let mut live = parse_claude(
            "a",
            lines(
                r#"{"type":"assistant","cwd":"/w/app","timestamp":"2026-10-01T10:00:00Z","message":{"id":"1","model":"claude-opus-4","usage":{"output_tokens":1000000}}}"#,
            ),
        );
        live.modified = Some(now);
        let mut old = parse_claude(
            "b",
            lines(r#"{"type":"ai-title","cwd":"/w/other","aiTitle":"Old"}"#),
        );
        old.modified = Some(now - Duration::from_secs(3600));
        let agents = [(
            Proc {
                pid: 9,
                ppid: 1,
                command: "claude".into(),
            },
            "claude",
        )];
        let folders = HashMap::from([(9, "/w/app".to_string())]);
        let got = join(&agents, &folders, &[live, old], now);
        assert_eq!((got[0].state.as_str(), got[0].pid), ("working", Some(9)));
        assert!((got[0].cost_usd - 75.0).abs() < 1e-9);
        assert_eq!(
            (got[1].state.as_str(), got[1].title.as_str()),
            ("done", "Old")
        );
    }

    #[test]
    fn a_day_is_the_utc_date() {
        let at = |secs| SystemTime::UNIX_EPOCH + Duration::from_secs(secs);
        assert_eq!(day_string(at(0)), "1970-01-01");
        assert_eq!(day_string(at(1_782_864_000)), "2026-07-01");
        assert_eq!(day_string(at(1_709_164_800 + 86_399)), "2024-02-29");
    }

    #[test]
    fn stop_refuses_a_process_that_is_not_an_agent() {
        assert!(stop(std::process::id()).is_err());
    }
}
