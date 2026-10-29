//! Clone, init and working copy state (spec `projects`, REQ-002 to REQ-006).

use std::path::Path;
use std::process::{Command, Output};

use serde::Serialize;
use shipyard_core::project::ignore_block;
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum WorkState {
    Clean,
    Changed,
    Behind,
    Ahead,
    Missing,
}

fn git(dir: Option<&Path>, args: &[&str]) -> std::io::Result<Output> {
    let mut c = Command::new("git");
    if let Some(d) = dir {
        c.arg("-C").arg(d);
    }
    // No prompt: a clone that needs a password fails with an error instead of a hang.
    c.args(args).envs([("GIT_TERMINAL_PROMPT", "0")]).output()
}

pub fn git_runs() -> bool {
    git(None, &["--version"]).is_ok_and(|o| o.status.success())
}

/// True when the folder is the root of a working copy. A worktree has a `.git` file.
pub fn is_repo(path: &Path) -> bool {
    path.join(".git").exists()
}

pub fn state(path: &Path) -> WorkState {
    if !is_repo(path) {
        return WorkState::Missing;
    }
    let Ok(out) = git(Some(path), &["status", "--porcelain=v2", "--branch"]) else {
        return WorkState::Missing;
    };
    if !out.status.success() {
        return WorkState::Missing;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let (mut ahead, mut behind, mut changed) = (false, false, false);
    for l in text.lines() {
        if let Some(ab) = l.strip_prefix("# branch.ab ") {
            let mut n = ab
                .split_whitespace()
                .map(|x| x.trim_start_matches(['+', '-']) != "0");
            ahead = n.next().unwrap_or(false);
            behind = n.next().unwrap_or(false);
        } else if !l.starts_with('#') {
            changed = true;
        }
    }
    match (changed, behind, ahead) {
        (true, ..) => WorkState::Changed,
        (_, true, _) => WorkState::Behind,
        (_, _, true) => WorkState::Ahead,
        _ => WorkState::Clean,
    }
}

fn stderr(o: &Output) -> String {
    String::from_utf8_lossy(&o.stderr)
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("git failed")
        .trim()
        .to_string()
}

/// Starts a repository in `path` and writes the OS ignore rules.
/// Only for a repository that Shipyard creates (REQ-005).
pub fn init(path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    let out = git(Some(path), &["init", "--quiet"]).map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(stderr(&out));
    }
    let file = path.join(".gitignore");
    let existing = std::fs::read_to_string(&file).unwrap_or_default();
    match ignore_block(&existing) {
        Some(text) => std::fs::write(file, text).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// Clones into `dest`. On a failure it removes the folder that it made.
// shortcut: no connection credentials yet. Git credential helpers apply. Wire the connection token when `connections` lands.
pub fn clone_repo(url: &str, dest: &Path) -> Result<(), String> {
    if url.trim().is_empty() || url.starts_with('-') {
        return Err("invalid address".into());
    }
    let existed = dest.exists();
    if existed
        && std::fs::read_dir(dest)
            .map_err(|e| e.to_string())?
            .next()
            .is_some()
    {
        return Err("the folder is not empty".into());
    }
    let dest_s = dest.to_str().ok_or("invalid folder")?;
    // `ext::` runs a command. Refuse it.
    let args = [
        "-c",
        "protocol.ext.allow=never",
        "clone",
        "--quiet",
        "--",
        url,
        dest_s,
    ];
    let out = git(None, &args).map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    if !existed {
        let _ = std::fs::remove_dir_all(dest);
    }
    Err(stderr(&out))
}
