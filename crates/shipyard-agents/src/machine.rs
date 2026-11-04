//! The AI sessions of this computer and what they cost, whatever started them.
//!
//! It covers the process list, the folder of a process, agent and helper detection, and the
//! transcript formats of Claude Code and Codex (with the de-duplication of Claude entries). This
//! reader needs no network and prices from [`price`], a list price that is only indicative.
//!
//! Read-only, except [`stop`]. A transcript is the agent's own history, so the tokens of a session
//! are exact and its cost is an estimate.
//!
//! shortcut: a day is the UTC day of the timestamp, and a session is found on Unix only
//! (`ps`, `lsof`, `/proc`). Add `chrono` and a Windows process reader when either is needed.

use crate::which::quiet;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
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
    // Opus 4.5 and later cost 5 and 25. The older Opus models keep the generic row below.
    let opus_now = [5.0, 25.0, 0.5, 6.25];
    let table: &[(&str, [f64; 4])] = &[
        ("claude-opus-4-5", opus_now),
        ("claude-opus-4-6", opus_now),
        ("claude-opus-4-7", opus_now),
        ("claude-opus-4-8", opus_now),
        ("claude-opus-4-9", opus_now),
        ("claude-opus-5", opus_now),
        ("claude-opus-6", opus_now),
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
    /// The file that keeps the read histories between two starts. `None`: memory only.
    pub cache: Option<PathBuf>,
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
            cache: None,
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

/// A history that was read, keyed by its path. It stays valid while the size and the modified
/// time stay the same. A history is huge (a machine holds gigabytes), so a request reads only the
/// files that changed since the one before. [`Roots::cache`] keeps the same data on disk, so the
/// first request after a start reads only the new files.
type Cached = (u64, SystemTime, Transcript);
static CACHE: LazyLock<Mutex<HashMap<PathBuf, Cached>>> = LazyLock::new(Default::default);
/// The cache files that the memory has read already.
static LOADED: LazyLock<Mutex<HashSet<PathBuf>>> = LazyLock::new(Default::default);

const DISK_VERSION: u32 = 1;

#[derive(Serialize, Deserialize)]
struct DiskEntry {
    path: PathBuf,
    len: u64,
    secs: u64,
    nanos: u32,
    runner: String,
    id: String,
    cwd: String,
    title: String,
    model: String,
    days: Vec<(String, String, [f64; 4])>,
}

#[derive(Serialize, Deserialize)]
struct Disk {
    version: u32,
    entries: Vec<DiskEntry>,
}

/// Read the cache file into memory. `false` when the file exists but is broken or old.
fn load_disk(file: &Path) -> bool {
    let Ok(text) = std::fs::read(file) else {
        return true;
    };
    let Ok(disk) = serde_json::from_slice::<Disk>(&text) else {
        return false;
    };
    if disk.version != DISK_VERSION {
        return false;
    }
    let Ok(mut c) = CACHE.lock() else {
        return true;
    };
    for e in disk.entries {
        let runner = match e.runner.as_str() {
            "claude" => "claude",
            "codex" => "codex",
            _ => continue,
        };
        let modified = SystemTime::UNIX_EPOCH + Duration::new(e.secs, e.nanos);
        let by_day = e
            .days
            .into_iter()
            .map(|(d, m, t)| {
                let tokens = Tokens {
                    input: t[0],
                    output: t[1],
                    cache_read: t[2],
                    cache_write: t[3],
                };
                ((d, m), tokens)
            })
            .collect();
        let t = Transcript {
            id: e.id,
            runner,
            cwd: e.cwd,
            title: e.title,
            model: e.model,
            modified: Some(modified),
            by_day,
        };
        c.entry(e.path).or_insert((e.len, modified, t));
    }
    true
}

/// Write the cache of these roots to disk. A failed write only costs a slower next start.
fn save_disk(file: &Path, roots: &Roots) {
    let Ok(c) = CACHE.lock() else { return };
    let entries = c
        .iter()
        .filter(|(p, _)| p.starts_with(&roots.claude) || p.starts_with(&roots.codex))
        .filter_map(|(path, (len, modified, t))| {
            let d = modified.duration_since(SystemTime::UNIX_EPOCH).ok()?;
            Some(DiskEntry {
                path: path.clone(),
                len: *len,
                secs: d.as_secs(),
                nanos: d.subsec_nanos(),
                runner: t.runner.into(),
                id: t.id.clone(),
                cwd: t.cwd.clone(),
                title: t.title.clone(),
                model: t.model.clone(),
                days: t
                    .by_day
                    .iter()
                    .map(|((d, m), u)| {
                        (
                            d.clone(),
                            m.clone(),
                            [u.input, u.output, u.cache_read, u.cache_write],
                        )
                    })
                    .collect(),
            })
        })
        .collect();
    drop(c);
    let Ok(bytes) = serde_json::to_vec(&Disk {
        version: DISK_VERSION,
        entries,
    }) else {
        return;
    };
    // A name of its own, so two scans at the same time do not write one file.
    static N: AtomicUsize = AtomicUsize::new(0);
    let tmp = file.with_extension(format!(
        "{}-{}.tmp",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    if std::fs::write(&tmp, bytes).is_err() || std::fs::rename(&tmp, file).is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
}

fn read_transcript(
    path: &Path,
    runner: &'static str,
    len: u64,
    modified: SystemTime,
    parsed: &AtomicUsize,
) -> Option<Transcript> {
    let key = (len, modified);
    let hit = CACHE
        .lock()
        .ok()?
        .get(path)
        .filter(|c| (c.0, c.1) == key)
        .map(|c| c.2.clone());
    if let Some(t) = hit {
        return Some(t);
    }
    let id = path.file_stem()?.to_str()?.to_string();
    let file = std::fs::File::open(path).ok()?;
    let lines = BufReader::new(file).lines().map_while(Result::ok);
    let mut t = if runner == "claude" {
        parse_claude(&id, lines)
    } else {
        parse_codex(&id, lines)
    };
    t.modified = Some(modified);
    parsed.fetch_add(1, Ordering::Relaxed);
    if let Ok(mut c) = CACHE.lock() {
        c.insert(path.to_path_buf(), (len, modified, t.clone()));
    }
    Some(t)
}

/// What a scan tells while it reads: the histories read so far, how many files it read, how many
/// it found.
pub type OnProgress<'a> = &'a (dyn Fn(usize, usize, &[Transcript]) + Sync);

/// The shortest time between two progress calls, and the most files between them.
const PROGRESS_EVERY: Duration = Duration::from_millis(250);
const PROGRESS_FILES: usize = 50;

/// Every history changed in the last `window`, newest first.
pub fn scan(roots: &Roots, window: Duration, now: SystemTime) -> Vec<Transcript> {
    scan_with(roots, window, now, &|_, _, _| {})
}

/// [`scan`] that calls `progress` at most every 250 ms or 50 files.
pub fn scan_with(
    roots: &Roots,
    window: Duration,
    now: SystemTime,
    progress: OnProgress,
) -> Vec<Transcript> {
    let since = now - window;
    // A broken file counts as a miss: the write at the end replaces it.
    let mut bad = false;
    if let Some(file) = &roots.cache {
        let first = LOADED.lock().is_ok_and(|mut l| l.insert(file.clone()));
        bad = first && !load_disk(file);
    }
    let mut found: Vec<(PathBuf, &'static str)> = Vec::new();
    let (mut claude, mut codex) = (Vec::new(), Vec::new());
    // Claude: `<project>/<session>.jsonl`, one level down. Codex: `YYYY/MM/DD/rollout-*.jsonl`.
    jsonl_files(&roots.claude, 1, &mut claude);
    jsonl_files(&roots.codex, 3, &mut codex);
    found.extend(claude.into_iter().map(|p| (p, "claude")));
    found.extend(codex.into_iter().map(|p| (p, "codex")));
    // A deleted history leaves the cache.
    if let Ok(mut c) = CACHE.lock() {
        let live: HashSet<&Path> = found.iter().map(|(p, _)| p.as_path()).collect();
        let (c_claude, c_codex) = (&roots.claude, &roots.codex);
        c.retain(|p, _| {
            live.contains(p.as_path()) || !(p.starts_with(c_claude) || p.starts_with(c_codex))
        });
    }
    let todo: Vec<_> = found
        .into_iter()
        .filter_map(|(path, runner)| {
            let m = std::fs::metadata(&path).ok()?;
            let modified = m.modified().ok()?;
            (modified >= since).then_some((path, runner, m.len(), modified))
        })
        .collect();
    // The first read parses gigabytes: every core takes the next file.
    let next = AtomicUsize::new(0);
    let parsed = AtomicUsize::new(0);
    let read = AtomicUsize::new(0);
    let last = Mutex::new(std::time::Instant::now());
    let done = Mutex::new(Vec::with_capacity(todo.len()));
    let threads = std::thread::available_parallelism()
        .map_or(1, |n| n.get())
        .min(8);
    std::thread::scope(|s| {
        for _ in 0..threads {
            s.spawn(|| {
                while let Some((path, runner, len, modified)) =
                    todo.get(next.fetch_add(1, Ordering::Relaxed))
                {
                    let t = read_transcript(path, runner, *len, *modified, &parsed);
                    let mut d = done.lock().unwrap_or_else(|e| e.into_inner());
                    d.extend(t);
                    let n = read.fetch_add(1, Ordering::Relaxed) + 1;
                    let mut at = last.lock().unwrap_or_else(|e| e.into_inner());
                    if n.is_multiple_of(PROGRESS_FILES) || at.elapsed() >= PROGRESS_EVERY {
                        *at = std::time::Instant::now();
                        progress(n, todo.len(), &d);
                    }
                }
            });
        }
    });
    if let Some(file) = &roots.cache
        && (bad || parsed.load(Ordering::Relaxed) > 0)
    {
        save_disk(file, roots);
    }
    let mut out = done.into_inner().unwrap_or_else(|e| e.into_inner());
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

/// The spend so far, while a scan reads.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendProgress {
    pub rows: Vec<SpendRow>,
    pub read: usize,
    pub found: usize,
}

/// The spend of the last `days` days, today included.
pub fn report(roots: &Roots, days: u32) -> Vec<SpendRow> {
    report_with(roots, days, &|_| {})
}

/// [`report`] that tells the totals so far while the scan reads.
pub fn report_with(
    roots: &Roots,
    days: u32,
    progress: &(dyn Fn(SpendProgress) + Sync),
) -> Vec<SpendRow> {
    let now = SystemTime::now();
    let days = days.clamp(1, 365);
    let since = day_string(now - Duration::from_secs(u64::from(days - 1) * 86_400));
    let all = scan_with(
        roots,
        Duration::from_secs(u64::from(days) * 86_400),
        now,
        &|read, found, so_far| {
            progress(SpendProgress {
                rows: spend(so_far, &since),
                read,
                found,
            });
        },
    );
    spend(&all, &since)
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
    // The first word is the agent, or a launcher and then the second word is its script:
    // `node /…/bin/claude --resume`. `vim claude` and `python ./codex` are not agents.
    let base = |w: &str| {
        w.rsplit(['/', '\\'])
            .next()
            .unwrap_or(w)
            .to_ascii_lowercase()
    };
    let mut words = command.split_whitespace();
    let first = base(words.next()?);
    let word = match first.as_str() {
        "node" | "bun" | "deno" | "npx" => base(words.next()?),
        _ => first,
    };
    Some(match word.as_str() {
        "claude" => "claude",
        "codex" => "codex",
        "copilot" => "copilot",
        "gemini" => "gemini",
        "opencode" => "opencode",
        "cursor-agent" => "cursor",
        _ => return None,
    })
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
    fn opus_45_and_later_cost_less_than_the_older_opus() {
        assert_eq!(price("claude-opus-4-5-20251101").unwrap()[..2], [5.0, 25.0]);
        assert_eq!(price("claude-opus-5").unwrap()[..2], [5.0, 25.0]);
        assert_eq!(price("claude-opus-4-1").unwrap()[..2], [15.0, 75.0]);
        assert_eq!(price("claude-opus-4").unwrap()[..2], [15.0, 75.0]);
    }

    #[test]
    fn only_a_launcher_makes_its_second_word_an_agent() {
        assert_eq!(
            agent_of_command("node /x/bin/claude --resume"),
            Some("claude")
        );
        assert_eq!(agent_of_command("/usr/bin/bun codex"), Some("codex"));
        assert_eq!(agent_of_command("/opt/bin/claude"), Some("claude"));
        for not_agent in ["vim claude", "less codex", "python ./codex", "node"] {
            assert_eq!(agent_of_command(not_agent), None, "{not_agent}");
        }
    }

    fn write_claude(dir: &Path, text: &str) -> Roots {
        std::fs::create_dir_all(dir.join("p")).unwrap();
        std::fs::write(dir.join("p/s.jsonl"), text).unwrap();
        Roots {
            claude: dir.to_path_buf(),
            codex: dir.join("none"),
            cache: None,
        }
    }

    fn entry(day: &str, tokens: u32) -> String {
        format!(
            r#"{{"type":"assistant","cwd":"/w/app","timestamp":"{day}T10:00:00Z","message":{{"id":"m{day}","model":"claude-sonnet-4","usage":{{"input_tokens":{tokens}}}}}}}"#
        )
    }

    #[test]
    fn a_scan_reads_a_file_again_only_when_its_size_or_time_changed() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        let day = day_string(now);
        let roots = write_claude(dir.path(), &entry(&day, 111));
        let file = dir.path().join("p/s.jsonl");
        let at = std::fs::metadata(&file).unwrap().modified().unwrap();
        let tokens = || {
            scan(&roots, Duration::from_secs(3600), now)[0]
                .by_day
                .values()
                .map(Tokens::total)
                .sum::<f64>()
        };
        assert_eq!(tokens(), 111.0);
        // Same size, same time: the cache answers, so the file is not read.
        std::fs::write(&file, entry(&day, 222)).unwrap();
        std::fs::File::options()
            .write(true)
            .open(&file)
            .unwrap()
            .set_modified(at)
            .unwrap();
        assert_eq!(tokens(), 111.0);
        // A new size: read again.
        std::fs::write(&file, entry(&day, 2222)).unwrap();
        assert_eq!(tokens(), 2222.0);
    }

    fn with_cache(roots: &Roots, dir: &Path) -> Roots {
        Roots {
            cache: Some(dir.join("cache.json")),
            ..roots.clone()
        }
    }

    /// Forget what the memory holds for `dir`, as a restart does.
    fn restart(dir: &Path) {
        CACHE.lock().unwrap().retain(|p, _| !p.starts_with(dir));
        LOADED.lock().unwrap().retain(|p| !p.starts_with(dir));
    }

    fn first_tokens(roots: &Roots, now: SystemTime) -> f64 {
        scan(roots, Duration::from_secs(3600), now)[0]
            .by_day
            .values()
            .map(Tokens::total)
            .sum()
    }

    #[test]
    fn the_disk_cache_answers_after_a_restart_until_the_file_changes() {
        let dir = tempfile::tempdir().unwrap();
        let (now, day) = (SystemTime::now(), day_string(SystemTime::now()));
        let roots = write_claude(dir.path(), &entry(&day, 111));
        let roots = with_cache(&roots, dir.path());
        let file = dir.path().join("p/s.jsonl");
        let at = std::fs::metadata(&file).unwrap().modified().unwrap();
        assert_eq!(first_tokens(&roots, now), 111.0);
        assert!(roots.cache.as_ref().unwrap().exists());
        // Same size, same time: the disk answers, so the file is not read.
        std::fs::write(&file, entry(&day, 222)).unwrap();
        std::fs::File::options()
            .write(true)
            .open(&file)
            .unwrap()
            .set_modified(at)
            .unwrap();
        restart(dir.path());
        assert_eq!(first_tokens(&roots, now), 111.0);
        // A new size: a miss, read again.
        std::fs::write(&file, entry(&day, 2222)).unwrap();
        restart(dir.path());
        assert_eq!(first_tokens(&roots, now), 2222.0);
    }

    #[test]
    fn a_broken_or_old_cache_file_is_ignored_and_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let (now, day) = (SystemTime::now(), day_string(SystemTime::now()));
        let roots = write_claude(dir.path(), &entry(&day, 111));
        let roots = with_cache(&roots, dir.path());
        let cache = roots.cache.clone().unwrap();
        for bad in ["not json", r#"{"version":0,"entries":[]}"#] {
            std::fs::write(&cache, bad).unwrap();
            restart(dir.path());
            assert_eq!(first_tokens(&roots, now), 111.0);
            let fixed = std::fs::read_to_string(&cache).unwrap();
            assert!(fixed.contains(r#""version":1"#), "{bad}");
        }
    }

    #[test]
    fn a_scan_tells_its_progress_with_growing_counts() {
        let dir = tempfile::tempdir().unwrap();
        let day = day_string(SystemTime::now());
        for i in 0..120 {
            std::fs::create_dir_all(dir.path().join("p")).unwrap();
            std::fs::write(dir.path().join(format!("p/s{i}.jsonl")), entry(&day, 10)).unwrap();
        }
        let roots = Roots {
            claude: dir.path().to_path_buf(),
            codex: dir.path().join("none"),
            cache: None,
        };
        let calls = Mutex::new(Vec::new());
        let rows = report_with(&roots, 1, &|p| calls.lock().unwrap().push(p));
        let calls = calls.into_inner().unwrap();
        // 120 files give at least the calls at 50 and 100 files.
        assert!(calls.len() >= 2);
        assert!(calls.windows(2).all(|w| w[0].read < w[1].read));
        assert!(calls.iter().all(|c| c.found == 120));
        assert!(calls.last().unwrap().rows[0].tokens > 0.0);
        assert_eq!(rows[0].tokens, 1200.0);
    }

    #[test]
    fn the_month_total_is_the_cost_that_the_sessions_show() {
        let dir = tempfile::tempdir().unwrap();
        let now = SystemTime::now();
        let text = [
            entry(&day_string(now), 1_000_000),
            entry(&day_string(now - Duration::from_secs(86_400)), 1_000_000),
        ]
        .join("\n");
        let roots = write_claude(dir.path(), &text);
        let sessions = join(&[], &HashMap::new(), &scan(&roots, RECENT, now), now);
        let rows = spend(
            &scan(&roots, Duration::from_secs(7 * 86_400), now),
            &day_string(now - Duration::from_secs(6 * 86_400)),
        );
        assert!((rows.iter().map(|r| r.cost_usd).sum::<f64>() - sessions[0].cost_usd).abs() < 1e-9);
        assert!((sessions[0].cost_usd - 6.0).abs() < 1e-9);
    }

    #[test]
    fn stop_refuses_a_process_that_is_not_an_agent() {
        assert!(stop(std::process::id()).is_err());
    }
}
