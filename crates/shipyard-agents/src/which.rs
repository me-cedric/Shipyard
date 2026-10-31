//! Find a program without a shell, and start a child without a console window.

use std::ffi::{OsStr, OsString};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// `PATH`, plus the folders where a desktop app often finds no `PATH` entry: a person's tool
/// folders, Homebrew and npm. An app started from the Dock or the Start menu has a short `PATH`.
pub fn search_dirs() -> Vec<PathBuf> {
    let mut dirs = path_dirs(std::env::var_os("PATH").as_deref());
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    if let Some(home) = home {
        for rel in [
            ".local/bin",
            ".npm-global/bin",
            ".bun/bin",
            ".cargo/bin",
            ".opencode/bin",
            ".volta/bin",
            "Library/pnpm",
            ".local/share/pnpm",
        ] {
            dirs.push(home.join(rel));
        }
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    dedupe(dirs)
}

fn dedupe(mut dirs: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = Vec::new();
    dirs.retain(|d| {
        let new = !seen.contains(d);
        seen.push(d.clone());
        new
    });
    dirs
}

/// The folders of the login shell `PATH` first, then the fallback folders. A missing login `PATH`
/// leaves the fallback as it is.
pub fn merged_dirs(login: Option<&OsStr>, fallback: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut dirs = path_dirs(login);
    dirs.extend(fallback);
    dedupe(dirs)
}

const MARK: &str = "__SHIPYARD_PATH__";

/// The text between the two markers of `out`. A profile or a banner may print around them.
fn marked(out: &str) -> Option<&str> {
    let (_, rest) = out.split_once(MARK)?;
    let (path, _) = rest.split_once(MARK)?;
    let path = path.trim();
    (!path.is_empty()).then_some(path)
}

/// The `PATH` of the login shell `shell`. `None` when the shell does not start, fails or does not
/// answer within `wait`. An interactive shell (`-i`) reads the files that a terminal reads
/// (`.zshrc`, `.bashrc`), where tool managers put their folders. Fish takes its own syntax.
pub fn login_path(shell: &str, wait: Duration) -> Option<OsString> {
    let mut cmd = Command::new(shell);
    if Path::new(shell).file_name().is_some_and(|n| n == "fish") {
        cmd.args([
            "-l",
            "-c",
            &format!("printf %s%s%s {MARK} (string join : $PATH) {MARK}"),
        ]);
    } else {
        cmd.args([
            "-l",
            "-i",
            "-c",
            &format!("printf %s%s%s {MARK} \"$PATH\" {MARK}"),
        ]);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = quiet(&mut cmd).spawn().ok()?;
    // Read the output while the shell runs: a profile that writes more than the pipe holds
    // does not block, and a background process that keeps the pipe open cannot hold the read.
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut out = String::new();
        let _ = stdout.read_to_string(&mut out);
        let _ = tx.send(out);
    });
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(None) if start.elapsed() < wait => std::thread::sleep(Duration::from_millis(20)),
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(Some(_)) => return None,
        }
    }
    let out = rx
        .recv_timeout(
            wait.saturating_sub(start.elapsed())
                .max(Duration::from_millis(100)),
        )
        .ok()?;
    marked(&out).map(Into::into)
}

/// Once, at start: the `PATH` of every child that the app starts (checks, gates, agents, hooks)
/// becomes the login shell `PATH` plus `search_dirs()`. An app started from the Dock gets a short
/// `PATH` without `pnpm`, `node` or `brew`. Call it before any thread starts. A slow shell start
/// delays the app by 1 s at most, then the fallback folders apply.
pub fn fix_path() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        let login = if cfg!(windows) {
            None
        } else {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
            login_path(&shell, Duration::from_secs(1))
        };
        if let Ok(path) = std::env::join_paths(merged_dirs(login.as_deref(), search_dirs())) {
            // SAFETY: the app calls this first in `run`, before it starts a thread. The only other
            // thread is the pipe reader of `login_path`: it never reads the environment.
            unsafe { std::env::set_var("PATH", path) };
        }
    });
}

/// The absolute folders of a `PATH` value. A relative entry, and an empty one that means the
/// current folder, would run a program of whatever folder the app sits in: they are dropped.
fn path_dirs(path: Option<&std::ffi::OsStr>) -> Vec<PathBuf> {
    path.map(|p| {
        std::env::split_paths(p)
            .filter(|d| d.is_absolute())
            .collect()
    })
    .unwrap_or_default()
}

/// The path of an executable called `program`. A name with a folder part is checked as it is.
pub fn which(program: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    let direct = Path::new(program);
    if direct.components().count() > 1 {
        return is_executable(direct).then(|| direct.to_path_buf());
    }
    let suffixes: &[&str] = if cfg!(windows) {
        &["", ".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    dirs.iter()
        .flat_map(|d| {
            suffixes
                .iter()
                .map(move |s| d.join(format!("{program}{s}")))
        })
        .find(|c| is_executable(c))
}

fn is_executable(path: &Path) -> bool {
    let Ok(meta) = path.metadata() else {
        return false;
    };
    meta.is_file() && has_exec_bit(&meta)
}

#[cfg(unix)]
fn has_exec_bit(meta: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    meta.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn has_exec_bit(_: &std::fs::Metadata) -> bool {
    true
}

/// No console window on Windows. Nothing on other systems.
pub fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_absolute_path_entries_stay() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let abs = if cfg!(windows) { r"C:\bin" } else { "/usr/bin" };
        let raw = format!("{sep}bin{sep}.{sep}{abs}{sep}../x");
        let dirs = path_dirs(Some(std::ffi::OsStr::new(&raw)));
        assert_eq!(dirs, [PathBuf::from(abs)]);
        assert!(path_dirs(None).is_empty());
    }

    #[test]
    fn login_folders_come_first_and_a_missing_login_path_keeps_the_fallback() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let (a, b, c) = if cfg!(windows) {
            (r"C:\a", r"C:\b", r"C:\c")
        } else {
            ("/a", "/b", "/c")
        };
        let login = format!("{a}{sep}{b}{sep}rel");
        let fallback = vec![PathBuf::from(b), PathBuf::from(c)];
        let merged = merged_dirs(Some(OsStr::new(&login)), fallback.clone());
        assert_eq!(merged, [a, b, c].map(PathBuf::from));
        assert_eq!(merged_dirs(None, fallback.clone()), fallback);
    }

    #[test]
    fn the_path_is_the_text_between_the_markers_and_noise_is_ignored() {
        let m = MARK;
        assert_eq!(marked(&format!("{m}/a:/b{m}")), Some("/a:/b"));
        assert_eq!(
            marked(&format!(
                "motd\nwarning: no job control\n{m}/a:/b{m}\nbye\n"
            )),
            Some("/a:/b")
        );
        assert_eq!(marked("/a:/b"), None);
        assert_eq!(marked(&format!("{m}/a:/b")), None);
        assert_eq!(marked(&format!("{m}  {m}")), None);
    }

    #[cfg(unix)]
    fn fake_shell(dir: &Path, body: &str) -> String {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join("shell");
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path.to_string_lossy().into_owned()
    }

    #[cfg(unix)]
    #[test]
    fn the_login_shell_answers_or_the_read_gives_nothing() {
        let wait = Duration::from_secs(5);
        let dir = tempfile::tempdir().unwrap();
        let ok = fake_shell(
            dir.path(),
            "echo banner; printf '%s' __SHIPYARD_PATH__/p/bin:/usr/bin__SHIPYARD_PATH__; echo bye",
        );
        assert_eq!(login_path(&ok, wait), Some("/p/bin:/usr/bin".into()));
        assert_eq!(login_path("/no/such/shell", wait), None);
        let bad = fake_shell(dir.path(), "exit 3");
        assert_eq!(login_path(&bad, wait), None);
        let slow = fake_shell(dir.path(), "exec sleep 5");
        let start = Instant::now();
        assert_eq!(login_path(&slow, Duration::from_millis(100)), None);
        assert!(start.elapsed() < Duration::from_secs(3));
    }

    #[cfg(unix)]
    #[test]
    fn a_noisy_profile_or_a_background_process_cannot_hold_the_read() {
        let dir = tempfile::tempdir().unwrap();
        // More than the 64 KB of a pipe before the answer.
        let noisy = fake_shell(
            dir.path(),
            "head -c 300000 /dev/zero | tr '\\0' x; echo; printf %s __SHIPYARD_PATH__/p/bin__SHIPYARD_PATH__",
        );
        assert_eq!(
            login_path(&noisy, Duration::from_secs(5)),
            Some("/p/bin".into())
        );
        // A child of the profile keeps the pipe open after the shell exits.
        let held = fake_shell(
            dir.path(),
            "sleep 5 &\nprintf %s __SHIPYARD_PATH__/p/bin__SHIPYARD_PATH__",
        );
        let start = Instant::now();
        assert_eq!(login_path(&held, Duration::from_millis(500)), None);
        assert!(start.elapsed() < Duration::from_secs(3));
    }
}
