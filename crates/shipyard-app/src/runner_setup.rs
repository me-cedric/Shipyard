//! Install an agent CLI from the assistant. The install text
//! of a runner comes from `shipyard_agents::runners`. Only an `npm install -g <package>` line
//! runs, with no shell, so no text of the UI reaches a command line but the runner id.

use shipyard_agents::runners::detect;
use shipyard_agents::which::{quiet, search_dirs, which};
use tauri::AppHandle;

use crate::commands::{Res, blocking};
use crate::work::need_click;

/// The arguments of `npm` for an install line, or why it is refused.
fn npm_args(line: &str) -> Result<Vec<&str>, String> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    match parts.as_slice() {
        ["npm", "install", "-g", pkg] if !pkg.starts_with('-') => Ok(parts[1..].to_vec()),
        _ => Err(format!("this install line is not run by the app: {line}")),
    }
}

pub fn install(id: &str) -> Res<()> {
    let runner = detect()
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("`{id}` is not a runner"))?;
    let args = npm_args(runner.install)?;
    let npm = which("npm", &search_dirs()).ok_or("npm is not installed: install Node first")?;
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
pub async fn runner_install(app: AppHandle, id: String, click: bool) -> Res<()> {
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

    #[test]
    fn each_runner_has_an_install_line_that_the_app_may_run() {
        for r in detect() {
            assert!(npm_args(r.install).is_ok(), "{}", r.id);
        }
    }
}
