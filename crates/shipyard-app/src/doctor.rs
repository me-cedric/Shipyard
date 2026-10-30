//! Doctor beyond the project checks: the tools that Shipyard works with, an install after a click,
//! and a ledger of the findings over time. Each install is a fixed command with no shell and no input
//! from the view, tried through the first package manager that exists.
//!
//! The ledger is `doctor-ledger/<project id>.json` in the app data folder: one entry each time the
//! set of findings changes, the last 100 kept.
//!
//! shortcut: no download of a release and no `sudo`. A machine with no package manager gets the
//! error text, and the person installs the tool by hand.

use std::path::Path;
use std::process::Command;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use shipyard_agents::machine::timestamp;
use shipyard_agents::which::{quiet, search_dirs, which};
use shipyard_store::project::write_atomic;
use specta::Type;

use crate::commands::{AppState, Res, blocking, err, health};

const KEEP: usize = 100;

/// `(id, program, group)`. The id is what the view sends back to install.
const TOOLS: [(&str, &str, &str); 14] = [
    ("git", "git", "base"),
    ("node", "node", "base"),
    ("pnpm", "pnpm", "base"),
    ("rust", "cargo", "base"),
    ("gh", "gh", "forge"),
    ("glab", "glab", "forge"),
    ("claude", "claude", "agent"),
    ("codex", "codex", "agent"),
    ("copilot", "copilot", "agent"),
    ("gemini", "gemini", "agent"),
    ("opencode", "opencode", "agent"),
    ("osv-scanner", "osv-scanner", "scanner"),
    ("semgrep", "semgrep", "scanner"),
    ("skillspector", "skillspector", "scanner"),
];

/// The install commands of a tool, tried in order: the first whose program exists runs.
fn installers(id: &str) -> &'static [&'static [&'static str]] {
    match id {
        "git" => &[
            &["brew", "install", "git"],
            &["winget", "install", "--id", "Git.Git", "-e"],
        ],
        "node" => &[
            &["brew", "install", "node"],
            &["winget", "install", "--id", "OpenJS.NodeJS.LTS", "-e"],
        ],
        "pnpm" => &[
            &["npm", "install", "-g", "pnpm"],
            &["brew", "install", "pnpm"],
        ],
        "rust" => &[
            &["brew", "install", "rust"],
            &["winget", "install", "--id", "Rustlang.Rustup", "-e"],
        ],
        "gh" => &[
            &["brew", "install", "gh"],
            &["winget", "install", "--id", "GitHub.cli", "-e"],
        ],
        "glab" => &[
            &["brew", "install", "glab"],
            &["winget", "install", "--id", "GLab.GLab", "-e"],
        ],
        "claude" => &[&["npm", "install", "-g", "@anthropic-ai/claude-code"]],
        "codex" => &[&["npm", "install", "-g", "@openai/codex"]],
        "copilot" => &[&["npm", "install", "-g", "@github/copilot"]],
        "gemini" => &[&["npm", "install", "-g", "@google/gemini-cli"]],
        "opencode" => &[&["npm", "install", "-g", "opencode-ai"]],
        _ => &[],
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ToolCheck {
    pub id: String,
    /// `base`, `forge`, `agent` or `scanner`.
    pub group: String,
    pub installed: bool,
    /// The first line of `--version`, or `""`.
    pub version: String,
    /// A package manager is here to install it.
    pub can_install: bool,
}

fn version_of(bin: &Path) -> String {
    quiet(Command::new(bin).arg("--version"))
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string()
        })
        .unwrap_or_default()
}

pub fn tools() -> Vec<ToolCheck> {
    let dirs = search_dirs();
    TOOLS
        .iter()
        .map(|(id, program, group)| {
            let bin = which(program, &dirs);
            let scanner = *group == "scanner";
            ToolCheck {
                id: id.to_string(),
                group: group.to_string(),
                installed: bin.is_some(),
                version: bin.as_deref().map(version_of).unwrap_or_default(),
                can_install: scanner || installers(id).iter().any(|c| which(c[0], &dirs).is_some()),
            }
        })
        .collect()
}

/// Install a tool that is missing, then check the tools again.
pub fn install(id: &str) -> Res<Vec<ToolCheck>> {
    let (_, program, group) = TOOLS
        .iter()
        .find(|t| t.0 == id)
        .ok_or_else(|| format!("unknown tool: {id}"))?;
    if which(program, &search_dirs()).is_some() {
        return Ok(tools());
    }
    if *group == "scanner" {
        let name = crate::scanners::EXTERNAL
            .iter()
            .find(|(_, p)| p == program)
            .map(|(n, _)| *n);
        crate::scanners::install(name.ok_or("not a scanner")?)?;
        return Ok(tools());
    }
    let dirs = search_dirs();
    let cmd = installers(id)
        .iter()
        .find(|c| which(c[0], &dirs).is_some())
        .ok_or_else(|| format!("no package manager found to install `{id}`"))?;
    let bin = which(cmd[0], &dirs).ok_or("manager vanished")?;
    let out = quiet(Command::new(bin).args(&cmd[1..]))
        .output()
        .map_err(err)?;
    if !out.status.success() {
        let tail: Vec<_> = String::from_utf8_lossy(&out.stderr)
            .lines()
            .rev()
            .take(3)
            .map(String::from)
            .collect();
        return Err(format!("`{}` failed: {}", cmd.join(" "), tail.join(" ")));
    }
    Ok(tools())
}

/* ---------- Ledger ---------- */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct LedgerItem {
    pub id: String,
    pub code: String,
    pub severity: String,
}

/// One snapshot of the findings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    /// RFC 3339, UTC.
    pub at: String,
    pub items: Vec<LedgerItem>,
    /// Findings that are new since the entry before, and findings that left.
    pub added: u32,
    pub resolved: u32,
}

fn ledger_path(s: &AppState, project: &str) -> std::path::PathBuf {
    s.dir.join("doctor-ledger").join(format!("{project}.json"))
}

fn read_ledger(path: &Path) -> Vec<LedgerEntry> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// Append a snapshot when the findings differ from the last one. Newest first.
pub fn record(path: &Path, items: Vec<LedgerItem>, at: String) -> Res<Vec<LedgerEntry>> {
    let mut all = read_ledger(path);
    let before: Vec<&str> = all
        .first()
        .map(|e| e.items.iter().map(|i| i.id.as_str()).collect())
        .unwrap_or_default();
    let added = items
        .iter()
        .filter(|i| !before.contains(&i.id.as_str()))
        .count() as u32;
    let resolved = before
        .iter()
        .filter(|id| !items.iter().any(|i| i.id == **id))
        .count() as u32;
    if all.is_empty() || added + resolved > 0 {
        all.insert(
            0,
            LedgerEntry {
                at,
                items,
                added,
                resolved,
            },
        );
        all.truncate(KEEP);
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(err)?;
        }
        write_atomic(path, &serde_json::to_vec_pretty(&all).map_err(err)?).map_err(err)?;
    }
    Ok(all)
}

/// Run the project checks, add a snapshot when they changed, and return the ledger.
pub fn ledger_record(s: &AppState) -> Res<Vec<LedgerEntry>> {
    let id = s
        .registry()?
        .active()
        .ok_or("no active project")?
        .id
        .clone();
    let items = health::run(s)?
        .into_iter()
        .map(|f| LedgerItem {
            id: f.id,
            code: f.code,
            severity: serde_json::to_value(f.severity)
                .ok()
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_default(),
        })
        .collect();
    let _g = s.guard();
    record(&ledger_path(s, &id), items, timestamp(SystemTime::now()))
}

#[tauri::command]
#[specta::specta]
pub async fn doctor_tools(app: tauri::AppHandle) -> Res<Vec<ToolCheck>> {
    blocking(app, |_| Ok(tools())).await
}

#[tauri::command]
#[specta::specta]
pub async fn doctor_tool_install(
    app: tauri::AppHandle,
    id: String,
    click: bool,
) -> Res<Vec<ToolCheck>> {
    blocking(app, move |s| {
        crate::work::need_click(s, click)?;
        install(&id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn doctor_ledger(app: tauri::AppHandle) -> Res<Vec<LedgerEntry>> {
    blocking(app, ledger_record).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str) -> LedgerItem {
        LedgerItem {
            id: id.into(),
            code: id.into(),
            severity: "warning".into(),
        }
    }

    #[test]
    fn the_ledger_adds_an_entry_only_when_the_findings_change() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("l/p.json");
        let a = record(&path, vec![item("x")], "t1".into()).unwrap();
        assert_eq!((a[0].added, a[0].resolved), (1, 0));
        assert_eq!(
            record(&path, vec![item("x")], "t2".into()).unwrap().len(),
            1
        );
        let c = record(&path, vec![item("y")], "t3".into()).unwrap();
        assert_eq!(
            (c.len(), c[0].added, c[0].resolved, c[0].at.as_str()),
            (2, 1, 1, "t3")
        );
        let d = record(&path, vec![], "t4".into()).unwrap();
        assert_eq!((d[0].added, d[0].resolved), (0, 1));
    }

    #[test]
    fn every_tool_has_an_id_the_installer_knows_or_is_a_scanner() {
        let list = tools();
        assert_eq!(list.len(), TOOLS.len());
        for (id, _, group) in TOOLS {
            assert!(group == "scanner" || !installers(id).is_empty(), "{id}");
        }
        assert!(install("rm -rf").is_err());
    }
}
