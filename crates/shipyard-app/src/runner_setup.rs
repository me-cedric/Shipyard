//! Install an agent CLI from the assistant. The install text
//! of a runner comes from `shipyard_agents::runners`. Only an `npm install -g <package>` line
//! runs, with no shell, so no text of the UI reaches a command line but the runner id.

use std::path::PathBuf;

use shipyard_agents::runners::detect;
use shipyard_agents::which::{quiet, search_dirs, which};
use tauri::AppHandle;

use crate::commands::{Api, Res, blocking};
use crate::work::need_click;

/// The arguments of `npm` for an install line, or why it is refused.
fn npm_args(line: &str) -> Result<Vec<&str>, String> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    match parts.as_slice() {
        ["npm", "install", "-g", pkg] if !pkg.starts_with('-') => Ok(parts[1..].to_vec()),
        _ => Err(format!("this install line is not run by the app: {line}")),
    }
}

/// The `npm` program. A runner needs it: install Node the way Settings / Health does, then look
/// again. Node without npm is a broken install: a second Node install changes nothing, so stop.
fn npm(dirs: &[PathBuf]) -> Result<PathBuf, String> {
    if let Some(npm) = which("npm", dirs) {
        return Ok(npm);
    }
    if which("node", dirs).is_some() {
        return Err("no package manager found: Node is here but npm is not".into());
    }
    crate::doctor::install("node")?;
    which("npm", &search_dirs()).ok_or_else(|| "npm is not installed: install Node first".into())
}

pub fn install(id: &str) -> Res<()> {
    let runner = detect()
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("`{id}` is not a runner"))?;
    let args = npm_args(runner.install)?;
    let npm = npm(&search_dirs())?;
    let out = quiet(std::process::Command::new(npm).args(&args))
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    let tail: Vec<_> = String::from_utf8_lossy(&out.stderr)
        .lines()
        .rev()
        .take(3)
        .map(str::to_string)
        .collect();
    Err(format!(
        "`npm {}` failed: {}",
        args.join(" "),
        tail.join(" ")
    ))
}

#[tauri::command]
#[specta::specta]
pub async fn runner_install(app: AppHandle, id: String, click: bool) -> Api<()> {
    blocking(app, move |s| {
        need_click(s, click)?;
        install(&id)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_plain_global_npm_install_runs() {
        assert!(npm_args("npm install -g @openai/codex").is_ok());
        assert!(npm_args("npm install -g --foo").is_err());
        assert!(npm_args("curl x | sh").is_err());
        assert!(npm_args("npm install -g a; evil").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn node_without_npm_is_an_error_and_never_an_install() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let node = dir.path().join("node");
        std::fs::write(&node, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&node, std::fs::Permissions::from_mode(0o755)).unwrap();
        let e = npm(&[dir.path().to_path_buf()]).unwrap_err();
        let e = crate::errors::AppError::from(e);
        assert_eq!(e.code, crate::errors::ErrorCode::NoPackageManager);
    }

    #[test]
    fn each_runner_has_an_install_line_that_the_app_may_run() {
        for r in detect() {
            assert!(npm_args(r.install).is_ok(), "{}", r.id);
        }
    }
}
