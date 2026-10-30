//! The tools for an agent that Shipyard did not start: a Claude Code or Codex that a person runs in
//! a terminal. They work on the folder of the open project, and each group is a switch that the
//! person turns on in Settings (all off by default).
//!
//! Source: Legacy `application/mcp/mcptools.rs` and `mcpwiring.rs`: the same groups (reads, writes,
//! git, forge, exec, delivery). Legacy has no path guard on its read tool; here a path stays inside
//! the folder, and a secret file (`.env*`, `.git`) is never read or written.
//!
//! The ticket, ADR and QA groups follow the same rule (Legacy `mcptools/dispatch.rs`): off by
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
    fn allows(&self, name: &str) -> bool {
        group(name, &self.switches) && (self.only.is_empty() || self.only.iter().any(|n| n == name))
    }
}

/// The tool names. One group each.
pub const NAMES: [&str; 17] = [
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
];

const MAX_READ: u64 = 256 * 1024;
const MAX_OUT: usize = 128 * 1024;
const CHECK_DEADLINE: Duration = Duration::from_secs(180);

fn group(name: &str, s: &Switches) -> bool {
    match name {
        "project_list_files" | "project_read_file" => s.reads,
        "project_write_file" => s.writes,
        "git_status" | "git_log" | "git_diff" => s.git,
        "forge_remote" => s.forge,
        "run_check" => s.exec,
        "delivery_diff" => s.delivery,
        "ticket_list" | "ticket_read" | "ticket_comment" => s.tickets,
        "adr_list" | "adr_read" | "adr_propose" => s.adrs,
        "qa_run_check" | "qa_read_report" => s.qa,
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
            "Run the tests, the linter or the type check of the open project.",
            json!({ "name": { "type": "string", "enum": ["test", "lint", "typecheck"] } }),
            &["name"],
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
            "Run the tests, the linter or the type check and keep the report.",
            json!({ "name": { "type": "string", "enum": ["test", "lint", "typecheck"] } }),
            &["name"],
        ),
        tool(
            "qa_read_report",
            "Read the last quality reports of the open project.",
            json!({}),
            &[],
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

fn drain(p: Option<impl Read + Send + 'static>) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(p) = p {
            let _ = p.take(MAX_OUT as u64).read_to_string(&mut s);
        }
        s
    })
}

fn run(root: &Path, program: &str, args: &[&str], deadline: Duration) -> Result<String, String> {
    let mut child = Command::new(program)
        .args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{program}: {e}"))?;
    let (o, e) = (drain(child.stdout.take()), drain(child.stderr.take()));
    let start = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        if start.elapsed() > deadline {
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
    let text = if o.is_empty() { e } else { o };
    if status.success() {
        Ok(text)
    } else {
        Err(format!("{program} failed: {}", text.trim()))
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
fn qa_run(root: &Path, name: &str) -> Result<String, String> {
    use shipyard_store::code::{QualityReport, ReportKind};
    let (program, a) = check_command(root, name)?;
    let start = Instant::now();
    let out = run(root, program, &a, CHECK_DEADLINE);
    let (passed, text) = match out {
        Ok(t) => (true, t),
        Err(e) => (false, e),
    };
    let lines: Vec<&str> = text.lines().collect();
    let tail = lines[lines.len().saturating_sub(40)..].join("\n");
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
        name: format!("{program} {}", a.join(" ")),
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
        "project_write_file" | "run_check" | "ticket_comment" | "adr_propose" | "qa_run_check"
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
            let (program, a) = check_command(root, arg(args, "name").ok_or("name is required")?)?;
            run(root, program, &a, CHECK_DEADLINE)?
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
        "qa_run_check" => qa_run(root, arg(args, "name").ok_or("name is required")?)?,
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
}
