//! Find a program without a shell, and start a child without a console window.

use std::path::{Path, PathBuf};
use std::process::Command;

/// `PATH`, plus the folders where a desktop app often finds no `PATH` entry: a person's tool
/// folders, Homebrew and npm. An app started from the Dock or the Start menu has a short `PATH`.
pub fn search_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
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
        ] {
            dirs.push(home.join(rel));
        }
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    let mut seen = Vec::new();
    dirs.retain(|d| {
        let new = !seen.contains(d);
        seen.push(d.clone());
        new
    });
    dirs
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
