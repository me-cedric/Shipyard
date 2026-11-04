//! Open something outside the app: a web link, and a project file in the code editor that the
//! machine has (VS Code, Cursor, Zed, a JetBrains IDE, Sublime Text). The program and its
//! arguments are fixed here. No shell reads them, and the path from the view is checked first.

use std::collections::HashSet;
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

/// A path that exists and sits inside the project folder or the data folder, or is a path that
/// an export wrote (`exported`). A relative path is relative to the project. A link that leaves
/// these places fails.
pub fn allowed_path(
    project: Option<&Path>,
    data: &Path,
    exported: &HashSet<PathBuf>,
    raw: &str,
) -> Res<PathBuf> {
    let bad = || format!("path not allowed: {raw}");
    if raw.is_empty() || raw.starts_with('-') {
        return Err(bad());
    }
    let p = Path::new(raw);
    let joined = if p.is_absolute() {
        p.to_path_buf()
    } else {
        project.ok_or_else(bad)?.join(p)
    };
    let full = joined.canonicalize().map_err(|_| bad())?;
    let inside = |root: &Path| root.canonicalize().is_ok_and(|r| full.starts_with(r));
    let wrote = exported
        .iter()
        .any(|e| e.canonicalize().is_ok_and(|e| e == full));
    if project.is_some_and(inside) || inside(data) || wrote {
        Ok(full)
    } else {
        Err(bad())
    }
}

/// Starts a program and reaps it, so no zombie stays.
fn launch(program: &str, args: &[&std::ffi::OsStr]) -> Res<()> {
    let mut cmd = Command::new(program);
    let mut child = quiet(&mut cmd).args(args).spawn().map_err(err)?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

fn checked(s: &AppState, raw: &str) -> Res<PathBuf> {
    let project = s.registry()?.active().map(|a| PathBuf::from(&a.path));
    allowed_path(project.as_deref(), &s.dir, &s.exports(), raw)
}

/// The document types that `open_default` opens. Any other file gets "Show in folder" only.
const DOCUMENTS: &[&str] = &[
    "txt", "md", "markdown", "json", "yaml", "yml", "csv", "pdf", "png", "jpg", "jpeg", "gif",
    "webp", "svg", "html", "htm", "xml", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods",
    "odp", "rtf", "log",
];

/// A folder, or a document of a listed type. A Unix file with an execute bit never opens.
fn openable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if p.is_file()
            && p.metadata()
                .is_ok_and(|m| m.permissions().mode() & 0o111 != 0)
        {
            return false;
        }
    }
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase());
    match ext {
        None => p.is_dir(),
        Some(e) => DOCUMENTS.contains(&e.as_str()),
    }
}

/// Shows the file or the folder in the file manager of the system.
#[tauri::command]
#[specta::specta]
pub async fn reveal_path(app: AppHandle, path: String) -> Api<()> {
    blocking(app, move |s| {
        let full = checked(s, &path)?;
        if cfg!(target_os = "macos") {
            launch("open", &["-R".as_ref(), full.as_os_str()])
        } else if cfg!(windows) {
            // Explorer needs the flag and the path as one argument.
            let arg = format!("/select,{}", full.display());
            launch("explorer", &[arg.as_ref()])
        } else {
            let dir = if full.is_dir() {
                &full
            } else {
                full.parent().unwrap_or(&full)
            };
            launch("xdg-open", &[dir.as_os_str()])
        }
    })
    .await
}

/// Opens the file or the folder with the default app of the system.
#[tauri::command]
#[specta::specta]
pub async fn open_default(app: AppHandle, path: String) -> Api<()> {
    blocking(app, move |s| {
        let full = checked(s, &path)?;
        if !openable(&full) {
            return Err(format!(
                "this file does not open here, show it in the folder: {path}"
            ));
        }
        let program = if cfg!(target_os = "macos") {
            "open"
        } else if cfg!(windows) {
            "explorer"
        } else {
            "xdg-open"
        };
        launch(program, &[full.as_os_str()])
    })
    .await
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

    #[test]
    fn only_a_path_in_the_project_or_data_folder_opens() {
        let dir = tempfile::tempdir().unwrap();
        let (project, data) = (dir.path().join("p"), dir.path().join("d"));
        std::fs::create_dir_all(project.join("src")).unwrap();
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(project.join("src/a.rs"), "x").unwrap();
        std::fs::write(data.join("r.xlsx"), "x").unwrap();
        std::fs::write(dir.path().join("out.txt"), "x").unwrap();
        let abs = |p: PathBuf| p.to_string_lossy().into_owned();
        let none = HashSet::new();
        assert!(allowed_path(Some(&project), &data, &none, "src/a.rs").is_ok());
        assert!(allowed_path(Some(&project), &data, &none, "src").is_ok());
        assert!(allowed_path(None, &data, &none, &abs(data.join("r.xlsx"))).is_ok());
        assert!(allowed_path(Some(&project), &data, &none, &abs(project.join("src/a.rs"))).is_ok());
        let outside = abs(dir.path().join("out.txt"));
        for bad in [
            "../out.txt",
            "-x",
            "",
            "src/none.rs",
            "/etc/passwd",
            outside.as_str(),
        ] {
            assert!(
                allowed_path(Some(&project), &data, &none, bad).is_err(),
                "{bad}"
            );
        }
        assert!(allowed_path(None, &data, &none, "src/a.rs").is_err());
        // A file that an export wrote outside both folders opens, and only that file.
        let wrote = HashSet::from([dir.path().join("out.txt")]);
        assert!(allowed_path(Some(&project), &data, &wrote, &outside).is_ok());
        assert!(allowed_path(Some(&project), &data, &wrote, "/etc/passwd").is_err());
    }

    #[test]
    fn only_a_listed_document_or_a_folder_opens_by_default() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["r.xlsx", "A.PDF", "n.md", "i.png", "l.log"] {
            let f = dir.path().join(name);
            std::fs::write(&f, "x").unwrap();
            assert!(openable(&f), "{name}");
        }
        for name in ["a.sh", "B.APP", "c.dmg", "d.exe", "e.py", "f.pkg", "noext"] {
            let f = dir.path().join(name);
            std::fs::write(&f, "x").unwrap();
            assert!(!openable(&f), "{name}");
        }
        assert!(openable(dir.path()));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let doc = dir.path().join("run.txt");
            std::fs::write(&doc, "x").unwrap();
            std::fs::set_permissions(&doc, std::fs::Permissions::from_mode(0o755)).unwrap();
            assert!(!openable(&doc));
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
