//! The tools for an agent that Shipyard did not start: a Claude Code or Codex that a person runs in
//! a terminal. They work on the folder of the open project, and each group is a switch that the
//! person turns on in Settings (all off by default).
//!
//! The groups are reads, writes, git, forge, exec and delivery. A path stays inside
//! the folder, and a secret file (`.env*`, `.git`) is never read or written.
//!
//! The ticket, ADR and QA groups follow the same rule: off by
//! default, and a read-only project takes no comment, no proposal and no check.
//!
//! shortcut: no resources. Add them when an outside agent needs them.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// The groups of tools that an outside agent may call.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Switches {
    pub reads: bool,
    pub writes: bool,
    pub git: bool,
    pub forge: bool,
    pub exec: bool,
    pub delivery: bool,
    pub tickets: bool,
    pub adrs: bool,
    pub qa: bool,
}

/// How the app answers a ticket tool: the tool name and its arguments give a text or a message.
/// The tracker is in the app, not in this crate.
#[derive(Clone)]
pub struct TicketPort(pub Arc<TicketFn>);

pub type TicketFn = dyn Fn(&str, &Value) -> Result<String, String> + Send + Sync;

impl std::fmt::Debug for TicketPort {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("TicketPort")
    }
}

/// The open project and the switches, read at each call so a switch acts at once.
#[derive(Debug, Clone)]
pub struct Outside {
    pub root: PathBuf,
    pub switches: Switches,
    /// When it is not empty, only these tools of the switched-on groups run.
    pub only: Vec<String>,
    /// The profile of the project is read only: `project_write_file` and `run_check` refuse.
    pub read_only: bool,
    /// The ticket tools answer through it. `None`: they say that no tracker is wired.
    pub tickets: Option<TicketPort>,
}

impl Outside {
    /// True when the switches and the allow list let the tool run.
    pub fn allows(&self, name: &str) -> bool {
        group(name, &self.switches) && (self.only.is_empty() || self.only.iter().any(|n| n == name))
    }
}

/// The tool names. One group each.
pub const NAMES: [&str; 20] = [
    "project_list_files",
    "project_read_file",
    "project_write_file",
    "git_status",
    "git_log",
    "git_diff",
    "forge_remote",
    "run_check",
    "delivery_diff",
    "ticket_list",
    "ticket_read",
    "ticket_comment",
    "adr_list",
    "adr_read",
    "adr_propose",
    "qa_run_check",
    "qa_read_report",
    "docs_stale",
    "spec_validate",
    "qa_run_scanner",
];

/// The tools that change nothing: the "read only" preset of the allow list.
pub const READ_ONLY: [&str; 14] = [
    "project_list_files",
    "project_read_file",
    "git_status",
    "git_log",
    "git_diff",
    "forge_remote",
    "delivery_diff",
    "ticket_list",
    "ticket_read",
    "adr_list",
    "adr_read",
    "qa_read_report",
    "docs_stale",
    "spec_validate",
];

const MAX_READ: u64 = 256 * 1024;
const MAX_OUT: usize = 128 * 1024;
const CHECK_DEFAULT_SECS: u64 = 900;
const CHECK_MAX_SECS: u64 = 3600;

fn group(name: &str, s: &Switches) -> bool {
    match name {
        "project_list_files" | "project_read_file" => s.reads,
        "project_write_file" => s.writes,
        "git_status" | "git_log" | "git_diff" => s.git,
        "forge_remote" => s.forge,
        "run_check" | "qa_run_check" => s.exec,
        "delivery_diff" => s.delivery,
        "ticket_list" | "ticket_read" | "ticket_comment" => s.tickets,
        "adr_list" | "adr_read" | "adr_propose" => s.adrs,
        "qa_read_report" | "docs_stale" | "spec_validate" | "qa_run_scanner" => s.qa,
        _ => false,
    }
}

/// The tool names that `o` turns on.
pub fn enabled(o: &Outside) -> Vec<&'static str> {
    NAMES.into_iter().filter(|n| o.allows(n)).collect()
}

fn tool(name: &str, description: &str, props: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": { "type": "object", "properties": props, "required": required, "additionalProperties": false }
    })
}

fn check_props() -> Value {
    json!({
        "name": { "type": "string", "enum": ["test", "lint", "typecheck"] },
        "timeout_secs": { "type": "integer", "minimum": 10, "maximum": CHECK_MAX_SECS }
    })
}

/// The `tools/list` entries for the tools that `o` turns on.
pub fn definitions(o: &Outside) -> Vec<Value> {
    let path = json!({ "type": "string" });
    let all = [
        tool(
            "project_list_files",
            "List a folder of the open project.",
            json!({ "path": path }),
            &[],
        ),
        tool(
            "project_read_file",
            "Read a text file of the open project.",
            json!({ "path": path }),
            &["path"],
        ),
        tool(
            "project_write_file",
            "Write a text file of the open project.",
            json!({ "path": path, "text": { "type": "string" } }),
            &["path", "text"],
        ),
        tool(
            "git_status",
            "The git status of the open project.",
            json!({}),
            &[],
        ),
        tool(
            "git_log",
            "The last commits of the open project.",
            json!({ "limit": { "type": "integer", "minimum": 1, "maximum": 100 } }),
            &[],
        ),
        tool(
            "git_diff",
            "The uncommitted changes of the open project.",
            json!({}),
            &[],
        ),
        tool(
            "forge_remote",
            "The remote URL of the open project.",
            json!({}),
            &[],
        ),
        tool(
            "run_check",
            "Run the gates of the open project (`.shipyard/project.yaml`), or the one that name picks. Without gates, name is required.",
            check_props(),
            &[],
        ),
        tool(
            "delivery_diff",
            "The changes of the branch against its base.",
            json!({ "base": { "type": "string" } }),
            &[],
        ),
        tool(
            "ticket_list",
            "List the tickets of the open project that the app has synced.",
            json!({ "limit": { "type": "integer", "minimum": 1, "maximum": 200 } }),
            &[],
        ),
        tool(
            "ticket_read",
            "Read one ticket and its comments.",
            json!({ "key": { "type": "string" } }),
            &["key"],
        ),
        tool(
            "ticket_comment",
            "Add a comment to a ticket.",
            json!({ "key": { "type": "string" }, "body": { "type": "string" } }),
            &["key", "body"],
        ),
        tool(
            "adr_list",
            "List the ADRs of the open project.",
            json!({}),
            &[],
        ),
        tool(
            "adr_read",
            "Read one ADR by its number.",
            json!({ "number": { "type": "string" } }),
            &["number"],
        ),
        tool(
            "adr_propose",
            "Write a new ADR with the status proposed. A person accepts or rejects it.",
            json!({ "title": { "type": "string" } }),
            &["title"],
        ),
        tool(
            "qa_run_check",
            "Run the gates of the open project, or the one that name picks, and keep the report. Without gates, name is required.",
            check_props(),
            &[],
        ),
        tool(
            "qa_read_report",
            "Read the last quality reports of the open project.",
            json!({}),
            &[],
        ),
        tool(
            "docs_stale",
            "List the docs of the branch that did not follow the code, against the base branch.",
            json!({}),
            &[],
        ),
        tool(
            "spec_validate",
            "Validate one OpenSpec change in strict mode.",
            json!({ "id": { "type": "string" } }),
            &["id"],
        ),
        tool(
            "qa_run_scanner",
            "Run one scanner (secrets, dependencies, code or skills) and keep the report.",
            json!({ "name": { "type": "string", "enum": ["secrets", "dependencies", "code", "skills"] } }),
            &["name"],
        ),
    ];
    all.into_iter()
        .filter(|t| t["name"].as_str().is_some_and(|n| o.allows(n)))
        .collect()
}

/// A path of the project: relative, with no `..`, and not a secret.
fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = Path::new(rel);
    if rel.is_absolute()
        || rel.components().any(|c| match c {
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => true,
            Component::Normal(n) => shipyard_core::code::is_secret_name(&n.to_string_lossy()),
            Component::CurDir => false,
        })
    {
        return Err("the path must stay inside the project and name no secret file".into());
    }
    let full = root.join(rel);
    // A link that leaves the project is refused: check the real place of the nearest parent.
    let mut near = full.as_path();
    while !near.exists() {
        near = near.parent().ok_or("bad path")?;
    }
    let real = near.canonicalize().map_err(|e| e.to_string())?;
    let base = root.canonicalize().map_err(|e| e.to_string())?;
    if !real.starts_with(&base) {
        return Err("the path leaves the project".into());
    }
    Ok(full)
}

/// The start of a file resource URI. The path follows, percent-encoded: `shipyard://file/docs%2Fa.md`.
pub const FILE_URI: &str = "shipyard://file/";

/// The folders of the project skills. A skill is a folder with a `SKILL.md`.
const SKILL_DIRS: [&str; 2] = [".claude/skills", ".agents/skills"];

/// The files that `resources/list` names, at most.
const MAX_RESOURCES: usize = 200;
const SKIP_DIRS: [&str; 4] = ["node_modules", "target", "dist", "build"];

/// The files that a tool of the group reads may be a prompt or a resource: the same two switches.
fn may_read(o: &Outside) -> bool {
    o.allows("project_read_file")
}

fn encode(rel: &str) -> String {
    rel.bytes()
        .map(|b| match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// The text of a skill and its `description` from the front matter.
fn skill_text(root: &Path, name: &str) -> Option<String> {
    if name.is_empty() || name.contains(['/', '\\']) || name.starts_with('.') {
        return None;
    }
    SKILL_DIRS.iter().find_map(|d| {
        let path = inside(root, &format!("{d}/{name}/SKILL.md")).ok()?;
        let meta = std::fs::metadata(&path).ok()?;
        (meta.is_file() && meta.len() <= MAX_READ)
            .then(|| std::fs::read_to_string(path).ok())
            .flatten()
    })
}

fn front_matter(text: &str) -> (String, &str) {
    let Some(rest) = text.strip_prefix("---\n") else {
        return (String::new(), text);
    };
    let Some((head, body)) = rest.split_once("\n---") else {
        return (String::new(), text);
    };
    let description = head
        .lines()
        .find_map(|l| l.strip_prefix("description:"))
        .map(|d| d.trim().trim_matches(['"', '\'']).to_string())
        .unwrap_or_default();
    (description, body.trim_start_matches(['-', '\n']))
}

/// The `prompts/list` entries: the skills of the project. Empty when the read tools are off.
pub fn prompts(o: &Outside) -> Vec<Value> {
    if !may_read(o) {
        return Vec::new();
    }
    let mut names: Vec<String> = SKILL_DIRS
        .iter()
        .filter_map(|d| std::fs::read_dir(o.root.join(d)).ok())
        .flatten()
        .flatten()
        .filter(|e| e.path().join("SKILL.md").is_file())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names.dedup();
    names
        .into_iter()
        .filter_map(|n| {
            let (description, _) = front_matter(&skill_text(&o.root, &n)?);
            Some(json!({ "name": n, "description": description }))
        })
        .collect()
}

/// The `prompts/get` answer: the skill as one user message.
pub fn prompt(o: &Outside, name: &str) -> Result<Value, String> {
    if !may_read(o) {
        return Err("the read tools are turned off in the Shipyard settings".into());
    }
    let text = skill_text(&o.root, name).ok_or_else(|| format!("unknown prompt: {name}"))?;
    let (description, body) = front_matter(&text);
    Ok(json!({
        "description": description,
        "messages": [{ "role": "user", "content": { "type": "text", "text": body } }]
    }))
}

fn walk(root: &Path, dir: &Path, depth: usize, out: &mut Vec<Value>) {
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = read.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().into_owned();
        let Ok(kind) = e.file_type() else { continue };
        if out.len() >= MAX_RESOURCES || shipyard_core::code::is_secret_name(&name) {
            continue;
        }
        if kind.is_dir() {
            if depth < 3 && !name.starts_with('.') && !SKIP_DIRS.contains(&name.as_str()) {
                walk(root, &e.path(), depth + 1, out);
            }
        } else if kind.is_file()
            && e.metadata().is_ok_and(|m| m.len() <= MAX_READ)
            && let Ok(rel) = e.path().strip_prefix(root)
        {
            let rel = rel.to_string_lossy().replace('\\', "/");
            out.push(json!({ "uri": format!("{FILE_URI}{}", encode(&rel)), "name": rel }));
        }
    }
}

/// The `resources/list` entries: the project files that `project_read_file` may read. A link is
/// not followed. Empty when the read tools are off.
pub fn resources(o: &Outside) -> Vec<Value> {
    let mut out = Vec::new();
    if may_read(o) {
        walk(&o.root, &o.root, 0, &mut out);
    }
    out
}

/// The `resources/read` answer for a file URI. It goes through `project_read_file`, so the switch,
/// the allow list and the path rules are the same.
pub fn read_resource(o: &Outside, uri: &str, path: &str) -> Result<Value, String> {
    let text = call(o, "project_read_file", &json!({ "path": path }))?;
    let body = text["content"][0]["text"].as_str().unwrap_or_default();
    Ok(json!({ "contents": [{ "uri": uri, "mimeType": "text/plain", "text": body }] }))
}

fn drain(p: Option<impl Read + Send + 'static>, tail: bool) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let Some(mut p) = p else { return String::new() };
        if !tail {
            let mut s = String::new();
            let _ = p.take(MAX_OUT as u64).read_to_string(&mut s);
            return s;
        }
        // A check keeps its last bytes: the verdict is at the end. The pipe is read to its end,
        // so the child never blocks on a full pipe.
        let (mut buf, mut chunk) = (Vec::new(), [0u8; 8192]);
        while let Ok(n) = p.read(&mut chunk) {
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&chunk[..n]);
            if buf.len() > MAX_OUT * 2 {
                buf.drain(..buf.len() - MAX_OUT);
            }
        }
        buf.drain(..buf.len().saturating_sub(MAX_OUT));
        String::from_utf8_lossy(&buf).into_owned()
    })
}

/// Run a program. `Ok` is (success, output): `Err` means it did not start or ran too long. The
/// program leads its own process group, so a stop kills its children too. `tail` keeps the end of
/// the output, with stderr first.
fn exec(
    root: &Path,
    program: &str,
    args: &[&str],
    deadline: Duration,
    tail: bool,
) -> Result<(bool, String), String> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut cmd, 0);
    let mut child = cmd.spawn().map_err(|e| format!("{program}: {e}"))?;
    let (o, e) = (
        drain(child.stdout.take(), tail),
        drain(child.stderr.take(), tail),
    );
    let start = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            // The shell ended. A child that it left holds the pipes open: kill the group.
            shipyard_agents::runner::kill_group(child.id());
            break s;
        }
        if start.elapsed() > deadline {
            shipyard_agents::runner::kill_group(child.id());
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "{program} ran longer than {} s and was stopped",
                deadline.as_secs()
            ));
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let (o, e) = (o.join().unwrap_or_default(), e.join().unwrap_or_default());
    let text = if tail {
        format!("{e}\n{o}")
    } else if o.is_empty() {
        e
    } else {
        o
    };
    Ok((status.success(), text))
}

fn run(root: &Path, program: &str, args: &[&str], deadline: Duration) -> Result<String, String> {
    match exec(root, program, args, deadline, false)? {
        (true, text) => Ok(text),
        (false, text) => Err(format!("{program} failed: {}", text.trim())),
    }
}

fn arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str)
}

/// The command for a check, from the files of the project.
fn check_command(root: &Path, name: &str) -> Result<(&'static str, Vec<&'static str>), String> {
    let node = root.join("package.json").is_file();
    let rust = root.join("Cargo.toml").is_file();
    Ok(match (name, node, rust) {
        ("test", true, _) => ("pnpm", vec!["test"]),
        ("lint", true, _) => ("pnpm", vec!["lint"]),
        ("typecheck", true, _) => ("pnpm", vec!["typecheck"]),
        ("test", false, true) => ("cargo", vec!["test"]),
        ("lint", false, true) => ("cargo", vec!["clippy"]),
        ("typecheck", false, true) => ("cargo", vec!["check"]),
        _ => return Err(format!("no {name} command for this project")),
    })
}

/// The gates of the project file. Empty when the file is missing, not valid or has no gates.
fn gates(root: &Path) -> Vec<String> {
    match shipyard_store::project::read_project_file(root) {
        Ok(shipyard_store::project::FileRead::Valid(f)) => f.gates,
        _ => Vec::new(),
    }
}

/// The commands of a check. The project file names them, never the agent: the `gates` (those that
/// match `name`, or all when `name` is absent), else the one command that the files of the project
/// show.
fn check_commands(root: &Path, name: Option<&str>) -> Result<Vec<String>, String> {
    let all = gates(root);
    if all.is_empty() {
        let (program, a) = check_command(root, name.ok_or("name is required")?)?;
        return Ok(vec![format!("{program} {}", a.join(" "))]);
    }
    let Some(name) = name else { return Ok(all) };
    let words: &[&str] = match name {
        "test" => &["test"],
        "lint" => &["lint", "clippy", "fmt"],
        "typecheck" => &["typecheck", "tsc"],
        _ => return Err(format!("no {name} command for this project")),
    };
    let picked: Vec<String> = all
        .iter()
        .filter(|g| words.iter().any(|w| g.contains(w)))
        .cloned()
        .collect();
    if picked.is_empty() {
        return Err(format!(
            "no gate matches {name}. The gates are: {}",
            all.join("; ")
        ));
    }
    Ok(picked)
}

/// The time that a check call may use: `timeout_secs`, from 10 s to 1 h, default 900 s.
fn check_limit(args: &Value) -> Duration {
    let secs = args.get("timeout_secs").and_then(Value::as_u64);
    Duration::from_secs(secs.unwrap_or(CHECK_DEFAULT_SECS).clamp(10, CHECK_MAX_SECS))
}

/// Run the commands one after the other, as the gates of the app run: `sh -c` in the project
/// folder. The time limit covers the whole call. Returns (all passed, the last lines of each).
fn run_gates(root: &Path, commands: &[String], limit: Duration) -> (bool, String) {
    let (sh, flag) = if cfg!(windows) {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };
    let start = Instant::now();
    let (mut passed, mut out) = (true, Vec::new());
    for c in commands {
        let left = limit.saturating_sub(start.elapsed());
        let (ok, text) = if left.is_zero() {
            (false, "not run: the time limit ended".into())
        } else {
            exec(root, sh, &[flag, c], left, true).unwrap_or_else(|e| (false, e))
        };
        passed &= ok;
        let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
        let tail = lines[lines.len().saturating_sub(40)..].join("\n");
        out.push(format!(
            "{} {c}\n{tail}",
            if ok { "passed" } else { "failed" }
        ));
    }
    (passed, out.join("\n"))
}

fn project_file(root: &Path) -> shipyard_core::project::ProjectFile {
    match shipyard_store::project::read_project_file(root) {
        Ok(shipyard_store::project::FileRead::Valid(f)) => f,
        _ => shipyard_core::project::ProjectFile::new("", ""),
    }
}

fn adr(root: &Path, name: &str, args: &Value) -> Result<String, String> {
    use shipyard_store::madr;
    let p = project_file(root);
    let all = madr::list(root, &p);
    match name {
        "adr_list" => Ok(all
            .iter()
            .map(|a| format!("{} [{}] {}", a.number, a.status, a.title))
            .collect::<Vec<_>>()
            .join("\n")),
        "adr_read" => {
            let n = arg(args, "number").ok_or("number is required")?;
            let a = all
                .iter()
                .find(|a| a.number == n)
                .ok_or_else(|| format!("no ADR {n}"))?;
            std::fs::read_to_string(inside(root, &a.path)?).map_err(|e| e.to_string())
        }
        _ => {
            let title = arg(args, "title").ok_or("title is required")?.trim();
            if title.is_empty() || title.contains(['\n', '\r']) {
                return Err("the title must be one line".into());
            }
            let date = shipyard_core::work::iso(
                (std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(0, |d| d.as_secs())
                    / 86_400) as i32,
            );
            let (file, text) = madr::new_adr(&madr::next_number(&all), title, &date);
            let rel = format!("{}/{file}", p.path("decisions"));
            let full = inside(root, &rel)?;
            if let Some(dir) = full.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            std::fs::write(&full, text).map_err(|e| e.to_string())?;
            Ok(format!("proposed {rel}"))
        }
    }
}

/// Run a check and keep its report, as the Code page does. The output stays here as its last lines.
fn qa_run(root: &Path, args: &Value) -> Result<String, String> {
    use shipyard_store::code::{QualityReport, ReportKind};
    let commands = check_commands(root, arg(args, "name"))?;
    let start = Instant::now();
    let (passed, tail) = run_gates(root, &commands, check_limit(args));
    let at = {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_secs());
        format!(
            "{}T00:00:00Z",
            shipyard_core::work::iso((secs / 86_400) as i32)
        )
    };
    let report = QualityReport {
        kind: ReportKind::Check,
        name: commands.join(" && "),
        at,
        passed,
        duration_ms: start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32,
        tail: tail.clone(),
        findings: Vec::new(),
    };
    shipyard_store::code::save_quality(root, &report, &[]).map_err(|e| e.to_string())?;
    Ok(format!(
        "{}\n{tail}",
        if passed { "passed" } else { "failed" }
    ))
}

/// The tools that the app answers: it holds the state that they need.
fn app_tool(o: &Outside, name: &str, args: &Value) -> Result<String, String> {
    let port = o
        .tickets
        .as_ref()
        .ok_or("the app is not wired to this server")?;
    (port.0)(name, args)
}

/// Strict validation of one change of the project.
fn spec_validate(root: &Path, args: &Value) -> Result<String, String> {
    let id = arg(args, "id").ok_or("id is required")?;
    let dir = inside(root, project_file(root).path("specs"))?;
    let found = shipyard_store::openspec_validate::run(&dir, id);
    if found.is_empty() {
        return Ok(format!("{id}: valid"));
    }
    Ok(found
        .iter()
        .map(|f| {
            let at = f.line.map_or(f.path.clone(), |l| format!("{}:{l}", f.path));
            format!("{} {} {at} {}", f.level, f.artifact, f.message)
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

/// Run one tool. `Err` is a message for the agent. A switch that is off refuses the call.
pub fn call(o: &Outside, name: &str, args: &Value) -> Result<Value, String> {
    if !NAMES.contains(&name) {
        return Err(format!("unknown tool: {name}"));
    }
    if !o.allows(name) {
        return Err(format!("{name} is turned off in the Shipyard settings"));
    }
    let writes = matches!(
        name,
        "project_write_file"
            | "run_check"
            | "ticket_comment"
            | "adr_propose"
            | "qa_run_check"
            | "qa_run_scanner"
    );
    if o.read_only && writes {
        return Err("the profile of this project is read only".into());
    }
    let root = o.root.as_path();
    let text = match name {
        "project_list_files" => {
            let dir = inside(root, arg(args, "path").unwrap_or(""))?;
            let mut names: Vec<String> = std::fs::read_dir(&dir)
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .map(|e| {
                    let slash = if e.path().is_dir() { "/" } else { "" };
                    format!("{}{slash}", e.file_name().to_string_lossy())
                })
                .filter(|n| !shipyard_core::code::is_secret_name(n.trim_end_matches('/')))
                .collect();
            names.sort();
            names.join("\n")
        }
        "project_read_file" => {
            let path = inside(root, arg(args, "path").ok_or("path is required")?)?;
            let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            if !meta.is_file() || meta.len() > MAX_READ {
                return Err(format!("not a file, or larger than {MAX_READ} bytes"));
            }
            std::fs::read_to_string(&path).map_err(|e| e.to_string())?
        }
        "project_write_file" => {
            let path = inside(root, arg(args, "path").ok_or("path is required")?)?;
            // The gates live here: an agent that runs them must not edit them.
            if path
                .strip_prefix(root)
                .ok()
                .and_then(|p| p.components().next())
                .is_some_and(|c| c.as_os_str().eq_ignore_ascii_case(".shipyard"))
            {
                return Err("the .shipyard folder is not writable by an agent".into());
            }
            let body = arg(args, "text").ok_or("text is required")?;
            if body.len() as u64 > MAX_READ {
                return Err(format!("text is larger than {MAX_READ} bytes"));
            }
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            std::fs::write(&path, body).map_err(|e| e.to_string())?;
            format!("wrote {} bytes", body.len())
        }
        "git_status" => run(
            root,
            "git",
            &["status", "--short", "--branch"],
            Duration::from_secs(20),
        )?,
        "git_log" => {
            let n = args
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(20)
                .clamp(1, 100);
            run(
                root,
                "git",
                &["log", "--oneline", &format!("-{n}")],
                Duration::from_secs(20),
            )?
        }
        "git_diff" => run(
            root,
            "git",
            &["diff", "--no-color"],
            Duration::from_secs(20),
        )?,
        "forge_remote" => run(
            root,
            "git",
            &["remote", "get-url", "origin"],
            Duration::from_secs(20),
        )?,
        "run_check" => {
            let commands = check_commands(root, arg(args, "name"))?;
            match run_gates(root, &commands, check_limit(args)) {
                (true, text) => text,
                (false, text) => return Err(text),
            }
        }
        "ticket_list" | "ticket_read" | "ticket_comment" => {
            if name == "ticket_comment" && arg(args, "body").is_none_or(|b| b.trim().is_empty()) {
                return Err("body is required".into());
            }
            let port = o
                .tickets
                .as_ref()
                .ok_or("no tracker is wired to this server")?;
            (port.0)(name, args)?
        }
        "adr_list" | "adr_read" | "adr_propose" => adr(root, name, args)?,
        "qa_run_check" => qa_run(root, args)?,
        "docs_stale" => app_tool(o, name, args)?,
        "qa_run_scanner" => {
            if !["secrets", "dependencies", "code", "skills"]
                .contains(&arg(args, "name").ok_or("name is required")?)
            {
                return Err("name is not a scanner".into());
            }
            app_tool(o, name, args)?
        }
        "spec_validate" => spec_validate(root, args)?,
        "qa_read_report" => {
            let all = shipyard_store::code::list_quality(root);
            serde_json::to_string_pretty(&all).map_err(|e| e.to_string())?
        }
        _ => {
            let base = arg(args, "base").unwrap_or("main");
            // A base that starts with `-` would be an option of git.
            if base.starts_with('-') || base.contains("..") {
                return Err("base is not a branch name".into());
            }
            run(
                root,
                "git",
                &["diff", "--no-color", &format!("{base}...HEAD")],
                Duration::from_secs(30),
            )?
        }
    };
    let text: String = text.chars().take(MAX_OUT).collect();
    Ok(json!({ "content": [{ "type": "text", "text": text }] }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all() -> Switches {
        Switches {
            reads: true,
            writes: true,
            git: true,
            forge: true,
            exec: true,
            delivery: true,
            tickets: true,
            adrs: true,
            qa: true,
        }
    }

    fn open(dir: &Path, s: Switches) -> Outside {
        Outside {
            root: dir.to_path_buf(),
            switches: s,
            only: Vec::new(),
            read_only: false,
            tickets: Some(TicketPort(Arc::new(|name, _| Ok(format!("ran {name}"))))),
        }
    }

    #[test]
    fn a_switch_that_is_off_hides_and_refuses_its_tools() {
        let s = Switches {
            reads: true,
            ..Default::default()
        };
        let dir = tempfile::tempdir().unwrap();
        let mut o = open(dir.path(), s);
        assert_eq!(enabled(&o), ["project_list_files", "project_read_file"]);
        assert_eq!(definitions(&o).len(), 2);
        let err = call(
            &o,
            "project_write_file",
            &json!({ "path": "a", "text": "x" }),
        )
        .unwrap_err();
        assert!(err.contains("turned off"));
        // A tool outside the allowed list is refused too.
        o.only = vec!["project_list_files".into()];
        assert_eq!(enabled(&o), ["project_list_files"]);
        assert!(call(&o, "project_read_file", &json!({ "path": "a" })).is_err());
        assert_eq!(enabled(&open(dir.path(), all())).len(), NAMES.len());
    }

    #[test]
    fn a_path_cannot_leave_the_project_or_reach_a_secret() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".env"), "KEY=1").unwrap();
        let o = open(dir.path(), all());
        for bad in ["../x", "/etc/passwd", ".env", "a/../../b", ".git/config"] {
            assert!(
                call(&o, "project_read_file", &json!({ "path": bad })).is_err(),
                "{bad}"
            );
        }
        let list = call(&o, "project_list_files", &json!({})).unwrap();
        assert!(!list.to_string().contains(".env"));
    }

    #[test]
    fn a_secret_name_is_refused_whatever_its_case() {
        let dir = tempfile::tempdir().unwrap();
        let o = open(dir.path(), all());
        for bad in [
            ".ENV",
            ".Env.local",
            ".GIT/config",
            "a/.Git",
            "k.PEM",
            "id_rsa",
        ] {
            assert!(
                call(&o, "project_read_file", &json!({ "path": bad })).is_err(),
                "{bad}"
            );
            let w = json!({ "path": bad, "text": "x" });
            assert!(call(&o, "project_write_file", &w).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_read_only_project_takes_no_write_and_no_check() {
        let dir = tempfile::tempdir().unwrap();
        let mut o = open(dir.path(), all());
        o.read_only = true;
        let w = json!({ "path": "a.md", "text": "x" });
        assert!(
            call(&o, "project_write_file", &w)
                .unwrap_err()
                .contains("read only")
        );
        assert!(
            call(&o, "run_check", &json!({ "name": "test" }))
                .unwrap_err()
                .contains("read only")
        );
        assert!(!dir.path().join("a.md").exists());
    }

    #[test]
    fn the_shipyard_folder_is_not_writable() {
        let dir = tempfile::tempdir().unwrap();
        let o = open(dir.path(), all());
        for bad in [
            ".shipyard/project.yaml",
            ".shipyard/roles/a.md",
            ".Shipyard/x",
        ] {
            let w = json!({ "path": bad, "text": "gates: []" });
            assert!(call(&o, "project_write_file", &w).is_err(), "{bad}");
        }
        assert!(!dir.path().join(".shipyard").exists());
    }

    #[test]
    fn a_check_needs_the_exec_switch_not_the_qa_switch() {
        let dir = tempfile::tempdir().unwrap();
        let o = open(
            dir.path(),
            Switches {
                qa: true,
                ..Switches::default()
            },
        );
        assert!(
            call(&o, "qa_run_check", &json!({ "name": "test" }))
                .unwrap_err()
                .contains("turned off")
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_gate_that_leaves_a_child_does_not_hang() {
        let dir = tempfile::tempdir().unwrap();
        with_gates(dir.path(), &["sleep 30 & echo done"]);
        let o = open(dir.path(), all());
        let start = Instant::now();
        let got = call(&o, "run_check", &json!({})).unwrap();
        assert!(start.elapsed() < Duration::from_secs(10));
        assert!(got["content"][0]["text"].as_str().unwrap().contains("done"));
    }

    #[test]
    fn write_then_read_inside_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let o = open(dir.path(), all());
        call(
            &o,
            "project_write_file",
            &json!({ "path": "docs/a.md", "text": "hello" }),
        )
        .unwrap();
        let got = call(&o, "project_read_file", &json!({ "path": "docs/a.md" })).unwrap();
        assert_eq!(got["content"][0]["text"], "hello");
    }

    #[cfg(unix)]
    #[test]
    fn a_link_out_of_the_project_is_refused() {
        let out = tempfile::tempdir().unwrap();
        std::fs::write(out.path().join("s.txt"), "secret").unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(out.path(), dir.path().join("link")).unwrap();
        let o = open(dir.path(), all());
        assert!(call(&o, "project_read_file", &json!({ "path": "link/s.txt" })).is_err());
    }

    #[test]
    fn a_delivery_base_cannot_be_an_option() {
        let dir = tempfile::tempdir().unwrap();
        let o = open(dir.path(), all());
        assert!(call(&o, "delivery_diff", &json!({ "base": "--output=x" })).is_err());
    }

    #[test]
    fn the_new_groups_are_off_by_default_and_a_read_only_project_refuses_them() {
        let dir = tempfile::tempdir().unwrap();
        let off = open(dir.path(), Switches::default());
        assert!(enabled(&off).is_empty());
        let err = call(&off, "ticket_list", &json!({})).unwrap_err();
        assert!(err.contains("turned off"));
        let mut o = open(dir.path(), all());
        o.read_only = true;
        for (tool, args) in [
            ("ticket_comment", json!({ "key": "A-1", "body": "x" })),
            ("adr_propose", json!({ "title": "Use X" })),
            ("qa_run_check", json!({ "name": "test" })),
        ] {
            assert!(
                call(&o, tool, &args).unwrap_err().contains("read only"),
                "{tool}"
            );
        }
        assert!(call(&o, "ticket_list", &json!({})).is_ok());
        assert!(call(&o, "qa_read_report", &json!({})).is_ok());
    }

    #[test]
    fn a_ticket_call_goes_to_the_app_and_an_empty_comment_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let o = open(dir.path(), all());
        let got = call(&o, "ticket_read", &json!({ "key": "A-1" })).unwrap();
        assert_eq!(got["content"][0]["text"], "ran ticket_read");
        assert!(call(&o, "ticket_comment", &json!({ "key": "A-1", "body": " " })).is_err());
    }

    #[test]
    fn an_adr_is_proposed_listed_and_read() {
        let dir = tempfile::tempdir().unwrap();
        let o = open(dir.path(), all());
        call(&o, "adr_propose", &json!({ "title": "Use SQLite" })).unwrap();
        let list = call(&o, "adr_list", &json!({})).unwrap();
        assert!(
            list["content"][0]["text"]
                .as_str()
                .unwrap()
                .contains("[proposed] Use SQLite")
        );
        let text = call(&o, "adr_read", &json!({ "number": "0001" })).unwrap();
        assert!(
            text["content"][0]["text"]
                .as_str()
                .unwrap()
                .contains("status: proposed")
        );
        assert!(call(&o, "adr_propose", &json!({ "title": "a\nb" })).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn an_adr_that_links_out_of_the_project_is_not_read() {
        let (dir, other) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let o = open(dir.path(), all());
        call(&o, "adr_propose", &json!({ "title": "Use SQLite" })).unwrap();
        let outside = other.path().join("secret.md");
        std::fs::write(&outside, "---\nstatus: proposed\n---\n# Out\n").unwrap();
        let dec = std::fs::read_dir(dir.path().join("docs/decisions")).unwrap();
        let adr = dec.flatten().next().unwrap().path();
        std::fs::remove_file(&adr).unwrap();
        std::os::unix::fs::symlink(&outside, &adr).unwrap();
        let err = call(&o, "adr_read", &json!({ "number": "0001" })).unwrap_err();
        assert!(err.contains("leaves the project"), "{err}");
    }

    fn with_gates(dir: &Path, gates: &[&str]) {
        std::fs::create_dir_all(dir.join(".shipyard")).unwrap();
        let list: String = gates.iter().map(|g| format!("  - {g}\n")).collect();
        let text = format!("name: X\nkey: X\ngates:\n{list}");
        std::fs::write(dir.join(".shipyard/project.yaml"), text).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_check_runs_the_gates_of_the_project_file() {
        let dir = tempfile::tempdir().unwrap();
        with_gates(dir.path(), &["echo test-one", "echo lint-two"]);
        let o = open(dir.path(), all());
        let text = |r: Result<Value, String>| r.unwrap()["content"][0]["text"].to_string();
        let both = text(call(&o, "run_check", &json!({})));
        assert!(
            both.contains("test-one") && both.contains("lint-two"),
            "{both}"
        );
        // `name` picks the gates that match it.
        let one = text(call(&o, "run_check", &json!({ "name": "lint" })));
        assert!(
            one.contains("lint-two") && !one.contains("test-one"),
            "{one}"
        );
        assert!(call(&o, "run_check", &json!({ "name": "typecheck" })).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_red_gate_fails_the_check_and_the_report_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        with_gates(dir.path(), &["echo test-bad && exit 3"]);
        let o = open(dir.path(), all());
        let err = call(&o, "run_check", &json!({})).unwrap_err();
        assert!(
            err.starts_with("failed") && err.contains("test-bad"),
            "{err}"
        );
        let got = call(&o, "qa_run_check", &json!({ "name": "test" })).unwrap();
        assert!(
            got["content"][0]["text"]
                .as_str()
                .unwrap()
                .starts_with("failed")
        );
        let all = shipyard_store::code::list_quality(dir.path());
        assert!(!all[0].passed);
    }

    #[test]
    fn the_check_time_limit_has_bounds() {
        let secs = |v: Value| check_limit(&v).as_secs();
        assert_eq!(secs(json!({})), 900);
        assert_eq!(secs(json!({ "timeout_secs": 1 })), 10);
        assert_eq!(secs(json!({ "timeout_secs": 999_999 })), 3600);
    }

    #[test]
    fn the_quality_tools_for_docs_specs_and_scanners() {
        let dir = tempfile::tempdir().unwrap();
        let o = open(dir.path(), all());
        // The app answers `docs_stale` and `qa_run_scanner` (here a stub).
        let got = call(&o, "docs_stale", &json!({})).unwrap();
        assert_eq!(got["content"][0]["text"], "ran docs_stale");
        assert!(call(&o, "qa_run_scanner", &json!({ "name": "rm" })).is_err());
        assert!(call(&o, "qa_run_scanner", &json!({ "name": "secrets" })).is_ok());
        let bad = call(&o, "spec_validate", &json!({ "id": "../x" })).unwrap();
        assert!(
            bad["content"][0]["text"]
                .as_str()
                .unwrap()
                .contains("invalid change id")
        );
        // A read-only project refuses the scanner, not the two reads.
        let mut ro = open(dir.path(), all());
        ro.read_only = true;
        assert!(call(&ro, "qa_run_scanner", &json!({ "name": "secrets" })).is_err());
        assert!(call(&ro, "docs_stale", &json!({})).is_ok());
        assert!(READ_ONLY.contains(&"spec_validate") && !READ_ONLY.contains(&"qa_run_scanner"));
    }
}
