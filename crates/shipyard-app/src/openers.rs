//! Open something outside the app: a web link, and a project file in the code editor that the
//! machine has (VS Code, Cursor, Zed, a JetBrains IDE, Sublime Text). The program and its
//! arguments are fixed here. No shell reads them, and the path from the view is checked first.

use std::path::{Component, Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use shipyard_agents::which::{quiet, search_dirs, which};
use specta::Type;
use tauri::AppHandle;

use crate::commands::overview::open_page;
use crate::commands::{Api, AppState, Res, blocking, err};

/// `(id, name, programs)`. The first program that exists wins.
const EDITORS: &[(&str, &str, &[&str])] = &[
    ("vscode", "Visual Studio Code", &["code"]),
    ("cursor", "Cursor", &["cursor"]),
    ("zed", "Zed", &["zed"]),
    (
        "jetbrains",
        "JetBrains",
        &[
            "rustrover",
            "idea",
            "webstorm",
            "pycharm",
            "goland",
            "clion",
            "phpstorm",
            "rider",
        ],
    ),
    ("sublime", "Sublime Text", &["subl"]),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Editor {
    pub id: String,
    pub name: String,
}

/// The folders of a desktop install, where an app puts its command but not on the `PATH`.
fn app_dirs() -> Vec<PathBuf> {
    let mut dirs = search_dirs();
    if cfg!(target_os = "macos") {
        for d in [
            "/Applications/Visual Studio Code.app/Contents/Resources/app/bin",
            "/Applications/Cursor.app/Contents/Resources/app/bin",
            "/Applications/Sublime Text.app/Contents/SharedSupport/bin",
            "/Applications/Zed.app/Contents/MacOS",
        ] {
            dirs.push(d.into());
        }
        if let Some(home) = std::env::var_os("HOME") {
            dirs.push(
                Path::new(&home).join("Library/Application Support/JetBrains/Toolbox/scripts"),
            );
        }
    }
    dirs
}

/// The editors that the machine has, in the fixed order, with their program.
pub fn detect_in(dirs: &[PathBuf]) -> Vec<(Editor, PathBuf)> {
    EDITORS
        .iter()
        .filter_map(|(id, name, programs)| {
            let bin = programs.iter().find_map(|p| which(p, dirs))?;
            let editor = Editor {
                id: (*id).into(),
                name: (*name).into(),
            };
            Some((editor, bin))
        })
        .collect()
}

/// The arguments for a file and a line. Fixed per editor: the path is data, never an option.
pub fn argv(id: &str, path: &str, line: u32) -> Option<Vec<String>> {
    let at = format!("{path}:{line}");
    Some(match id {
        "vscode" | "cursor" => vec!["-g".into(), at],
        "zed" | "sublime" => vec![at],
        "jetbrains" => vec!["--line".into(), line.to_string(), path.into()],
        _ => return None,
    })
}

/// A file inside the project: a relative path with no `..`, no leading `-`, and no link that
/// leaves the folder.
pub fn project_file(root: &Path, rel: &str) -> Res<PathBuf> {
    let bad = || format!("path not allowed: {rel}");
    let p = Path::new(rel);
    let plain = p.components().all(|c| matches!(c, Component::Normal(_)));
    if rel.is_empty() || rel.starts_with('-') || !plain {
        return Err(bad());
    }
    let base = root.canonicalize().map_err(err)?;
    let full = root.join(p).canonicalize().map_err(|_| bad())?;
    if !full.starts_with(&base) || !full.is_file() {
        return Err(bad());
    }
    Ok(full)
}

pub fn open_in_editor_with(
    root: &Path,
    dirs: &[PathBuf],
    editor: Option<&str>,
    rel: &str,
    line: Option<u32>,
) -> Res<()> {
    project_file(root, rel)?;
    let found = detect_in(dirs);
    let (e, bin) = match editor {
        Some(id) => found.into_iter().find(|(e, _)| e.id == id),
        None => found.into_iter().next(),
    }
    .ok_or("no code editor was found")?;
    let args = argv(&e.id, rel, line.unwrap_or(1).max(1)).ok_or("no code editor was found")?;
    let mut cmd = Command::new(bin);
    let mut child = quiet(&mut cmd)
        .args(args)
        .current_dir(root)
        .spawn()
        .map_err(err)?;
    // Reap the launcher so no zombie stays.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

pub fn open_in_editor(s: &AppState, editor: Option<&str>, rel: &str, line: Option<u32>) -> Res<()> {
    let root = PathBuf::from(&s.registry()?.active().ok_or("no active project")?.path);
    open_in_editor_with(&root, &app_dirs(), editor, rel, line)
}

#[tauri::command]
#[specta::specta]
pub async fn editors_list(app: AppHandle) -> Api<Vec<Editor>> {
    blocking(app, |_| {
        Ok(detect_in(&app_dirs()).into_iter().map(|(e, _)| e).collect())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn editor_open(
    app: AppHandle,
    editor: Option<String>,
    path: String,
    line: Option<u32>,
) -> Api<()> {
    blocking(app, move |s| {
        open_in_editor(s, editor.as_deref(), &path, line)
    })
    .await
}

/// Opens a web link of a Markdown text in the browser of the system. `http` and `https` only.
#[tauri::command]
#[specta::specta]
pub async fn open_link(app: AppHandle, url: String) -> Api<()> {
    blocking(app, move |_| open_page(&url)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_editor_gets_its_fixed_arguments() {
        assert_eq!(argv("vscode", "src/a.rs", 7).unwrap(), ["-g", "src/a.rs:7"]);
        assert_eq!(argv("zed", "a.rs", 1).unwrap(), ["a.rs:1"]);
        assert_eq!(
            argv("jetbrains", "a.rs", 3).unwrap(),
            ["--line", "3", "a.rs"]
        );
        assert!(argv("notepad", "a.rs", 1).is_none());
    }

    #[test]
    fn only_a_file_inside_the_project_opens() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("p");
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/a.rs"), "x").unwrap();
        std::fs::write(dir.path().join("out.txt"), "x").unwrap();
        assert!(project_file(&root, "src/a.rs").is_ok());
        for bad in ["../out.txt", "/etc/passwd", "-x", "", "src", "src/none.rs"] {
            assert!(project_file(&root, bad).is_err(), "{bad}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn the_detected_editor_runs_with_the_fixed_argv() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("p");
        let bin = dir.path().join("bin");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(root.join("a.rs"), "x").unwrap();
        let out = dir.path().join("argv.txt");
        let script = bin.join("code");
        std::fs::write(
            &script,
            format!("#!/bin/sh\nprintf '%s\\n' \"$@\" > '{}'\n", out.display()),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let dirs = [bin];
        assert_eq!(detect_in(&dirs)[0].0.id, "vscode");
        open_in_editor_with(&root, &dirs, None, "a.rs", Some(4)).unwrap();
        for _ in 0..50 {
            if out.exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        assert_eq!(std::fs::read_to_string(&out).unwrap(), "-g\na.rs:4\n");
        let none = open_in_editor_with(&root, &[], None, "a.rs", None).unwrap_err();
        assert!(none.contains("no code editor was found"));
    }
}
