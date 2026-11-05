//! Sign in to an agent tool with its own login (ADR 0017, Q-133). The app gives the integrated
//! terminal the login command of the tool. It never reads a token file or a keychain entry.
//! A Codex API key goes to `codex login --with-api-key` on stdin, never in an argument.

use std::io::Write;
use std::path::Path;
use std::process::Stdio;

use shipyard_agents::runners::{RunnerState, detect};
use shipyard_agents::which::quiet;
use shipyard_secrets::Secret;
use tauri::AppHandle;

use crate::commands::{Api, Res, blocking};
use crate::work::need_click;

/// The login command that the terminal runs. `device` is the Codex code flow (Q-135). The
/// Gemini row runs `agy` when that is the program found: its first run asks for the sign-in.
fn login_command(id: &str, program: &str, device: bool) -> Option<&'static str> {
    Some(match (id, device) {
        ("claude", _) => "claude auth login",
        ("codex", false) => "codex login",
        ("codex", true) => "codex login --device-auth",
        ("copilot", _) => "copilot login",
        ("opencode", _) => "opencode auth login",
        ("gemini", _) if program == "agy" => "agy",
        ("gemini", _) => "gemini",
        _ => return None,
    })
}

fn sign_in_command(id: &str, device: bool) -> Res<String> {
    let runner = detect()
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("`{id}` is not a runner"))?;
    if runner.state != RunnerState::Detected {
        return Err(format!("{} is not installed", runner.label));
    }
    let program = runner
        .path
        .as_deref()
        .and_then(|p| Path::new(p).file_stem())
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    login_command(id, program, device)
        .map(str::to_string)
        .ok_or_else(|| format!("{} has no sign-in command", runner.label))
}

/// The command line for the terminal tab of the sign-in of `id`.
#[tauri::command]
#[specta::specta]
pub async fn runner_sign_in(app: AppHandle, id: String, device: bool, click: bool) -> Api<String> {
    blocking(app, move |s| {
        need_click(s, click)?;
        shipyard_agents::runner::clear_signed_out(&id);
        sign_in_command(&id, device)
    })
    .await
}

const API_KEY_LIMIT: std::time::Duration = std::time::Duration::from_secs(60);

/// Run `program login --with-api-key` with the key on stdin.
/// The child is killed when it runs longer than `limit`.
fn with_api_key(program: &Path, key: &Secret, limit: std::time::Duration) -> Res<()> {
    let mut child = quiet(
        std::process::Command::new(program)
            .args(["login", "--with-api-key"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped()),
    )
    .spawn()
    .map_err(|e| e.to_string())?;
    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    // A tool that exits early closes the pipe: the exit code tells the result.
    let _ = writeln!(stdin, "{}", key.expose());
    drop(stdin);
    // A thread reads the error text, so a full pipe cannot block the tool while we poll.
    let mut stderr = child.stderr.take().ok_or("no stderr")?;
    let reader = std::thread::spawn(move || {
        let mut text = String::new();
        let _ = std::io::Read::read_to_string(&mut stderr, &mut text);
        text
    });
    let end = std::time::Instant::now() + limit;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if std::time::Instant::now() >= end {
            let _ = child.kill();
            let _ = child.wait();
            return Err("`codex login --with-api-key` did not end in time: try again".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    };
    if status.success() {
        return Ok(());
    }
    let said = key.scrub(reader.join().unwrap_or_default().trim());
    Err(format!("`codex login --with-api-key` failed: {said}"))
}

/// Sign Codex in with an API key. Write-only: nothing returns the key.
#[tauri::command]
#[specta::specta]
pub async fn runner_codex_api_key(app: AppHandle, key: String, click: bool) -> Api<()> {
    blocking(app, move |s| {
        need_click(s, click)?;
        let key = Secret::new(key.trim());
        if key.expose().is_empty() {
            return Err("paste a key first".into());
        }
        let program =
            shipyard_agents::which::which("codex", &shipyard_agents::which::search_dirs())
                .ok_or("Codex is not installed")?;
        with_api_key(&program, &key, API_KEY_LIMIT)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_tool_has_its_own_login_command() {
        let cmd = |id, program, device| login_command(id, program, device);
        assert_eq!(cmd("claude", "claude", false), Some("claude auth login"));
        assert_eq!(cmd("codex", "codex", false), Some("codex login"));
        assert_eq!(
            cmd("codex", "codex", true),
            Some("codex login --device-auth")
        );
        assert_eq!(cmd("copilot", "copilot", false), Some("copilot login"));
        assert_eq!(
            cmd("opencode", "opencode", false),
            Some("opencode auth login")
        );
        assert_eq!(cmd("gemini", "agy", false), Some("agy"));
        assert_eq!(cmd("gemini", "gemini", false), Some("gemini"));
        assert_eq!(cmd("vim", "vim", false), None);
    }

    #[cfg(unix)]
    #[test]
    fn the_api_key_goes_on_stdin_and_not_in_the_arguments() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let (args, input) = (dir.path().join("args"), dir.path().join("input"));
        let prog = dir.path().join("codex");
        std::fs::write(
            &prog,
            format!(
                "#!/bin/sh\necho \"$@\" > {}\ncat > {}\n",
                args.display(),
                input.display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&prog, std::fs::Permissions::from_mode(0o755)).unwrap();
        with_api_key(&prog, &Secret::new("sk-live"), API_KEY_LIMIT).unwrap();
        assert_eq!(
            std::fs::read_to_string(args).unwrap().trim(),
            "login --with-api-key"
        );
        assert_eq!(std::fs::read_to_string(input).unwrap().trim(), "sk-live");
    }

    #[cfg(unix)]
    #[test]
    fn a_refused_key_is_an_error_without_the_key() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let prog = dir.path().join("codex");
        std::fs::write(
            &prog,
            "#!/bin/sh\ncat >/dev/null\necho 'bad key sk-live' >&2\nexit 1\n",
        )
        .unwrap();
        std::fs::set_permissions(&prog, std::fs::Permissions::from_mode(0o755)).unwrap();
        let e = with_api_key(&prog, &Secret::new("sk-live"), API_KEY_LIMIT).unwrap_err();
        assert!(e.contains("bad key") && !e.contains("sk-live"), "{e}");
    }

    #[cfg(unix)]
    #[test]
    fn a_tool_that_does_not_end_is_killed_at_the_limit() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let prog = dir.path().join("codex");
        std::fs::write(&prog, "#!/bin/sh\nexec sleep 30\n").unwrap();
        std::fs::set_permissions(&prog, std::fs::Permissions::from_mode(0o755)).unwrap();
        let t = std::time::Instant::now();
        let e = with_api_key(
            &prog,
            &Secret::new("sk-live"),
            std::time::Duration::from_millis(200),
        )
        .unwrap_err();
        assert!(
            e.contains("did not end in time") && !e.contains("sk-live"),
            "{e}"
        );
        assert!(t.elapsed() < std::time::Duration::from_secs(10));
    }
}
