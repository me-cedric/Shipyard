//! Settings / Health: run the checks and apply a fix after one confirm click.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use shipyard_core::health::{
    BrokenRef, CompassResult, FileState, Finding, Fix, HealthInput, evaluate,
};
use shipyard_core::project::{PROJECT_FILE, ProjectFile};
use shipyard_git::project::git_runs;
use shipyard_store::project::{FileRead, read_project_file, render_project_file, write_atomic};
use specta::Type;
use tauri::AppHandle;

use super::projects::derive_key;
use super::{AppState, Res, blocking, err, refs};

/// Compass Node helpers that run on the working copy, by repository path and arguments.
const COMPASS_HELPERS: [(&str, &[&str]); 1] = [("docs/agent-compass/bin/ac.mjs", &["check"])];

fn node_runs() -> bool {
    Command::new("node")
        .arg("--version")
        .output()
        .is_ok_and(|o| o.status.success())
}

// shortcut: no time limit on a helper. Add one if a helper hangs.
fn run_compass(root: &Path) -> Option<CompassResult> {
    let (script, args) = COMPASS_HELPERS
        .iter()
        .find(|(p, _)| root.join(p).is_file())?;
    let out = Command::new("node")
        .arg(script)
        .args(*args)
        .current_dir(root)
        .output()
        .ok()?;
    Some(CompassResult {
        ok: out.status.success(),
        output: String::from_utf8_lossy(&out.stdout).into_owned()
            + &String::from_utf8_lossy(&out.stderr),
    })
}

pub fn run(s: &AppState) -> Res<Vec<Finding>> {
    let Some(e) = s.registry()?.active().cloned() else {
        return Ok(Vec::new());
    };
    let root = PathBuf::from(&e.path);
    let name = root
        .file_name()
        .map_or_else(|| "project".into(), |n| n.to_string_lossy().into_owned());
    let project_file = if !root.is_dir() {
        FileState::FolderMissing
    } else {
        match read_project_file(&root).map_err(err)? {
            FileRead::Missing => FileState::Missing,
            FileRead::Valid(_) => FileState::Valid,
            FileRead::Invalid(issues) => FileState::Invalid(issues),
        }
    };
    let git = git_runs();
    let node = node_runs();
    let input = HealthInput {
        project_file,
        new_project_file: render_project_file(&ProjectFile::new(&name, &derive_key(&name)))
            .map_err(err)?,
        gitignore: std::fs::read_to_string(root.join(".gitignore")).ok(),
        tools: vec![("git".into(), git), ("node".into(), node)],
        // Without Node no helper runs. The tool check names the gap.
        compass: if node { run_compass(&root) } else { None },
        broken_refs: refs::broken(s)?
            .into_iter()
            .map(|b| BrokenRef {
                target: b.target,
                source: b.source,
            })
            .collect(),
    };
    Ok(evaluate(&input))
}

#[derive(Debug, Serialize, Type)]
pub struct FixResult {
    pub path: String,
    pub content: String,
    pub written: bool,
}

/// A path that stays inside the project: not empty, no root, no `..`.
fn relative(path: &str) -> bool {
    !path.is_empty()
        && std::path::Path::new(path)
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
}

/// Without `expected` the call returns the new content and writes nothing.
/// With `expected` (the content that a person saw) it writes the file, and only when the fix
/// still gives that content: the project may have changed since the preview.
/// Only a `Write` fix changes a file.
pub fn fix(s: &AppState, id: &str, expected: Option<&str>) -> Res<FixResult> {
    let root = PathBuf::from(&s.registry()?.active().ok_or("no active project")?.path);
    let finding = run(s)?
        .into_iter()
        .find(|f| f.id == id)
        .ok_or("the finding is gone")?;
    let Fix::Write { path, content } = finding.fix else {
        return Err("this fix writes no file".into());
    };
    let confirm = expected.is_some();
    if let Some(seen) = expected {
        if seen != content {
            return Err("the file changed since the preview: preview the fix again".into());
        }
        if !relative(&path) {
            return Err(format!("the fix path is not inside the project: {path}"));
        }
        write_atomic(&root.join(&path), content.as_bytes()).map_err(err)?;
        if path == PROJECT_FILE {
            // The registry takes the name and the key of the new file.
            if let Ok(FileRead::Valid(f)) = read_project_file(&root) {
                s.with_registry(|reg| {
                    reg.register(&root.to_string_lossy(), &f);
                    Ok(())
                })?;
            }
        }
    }
    Ok(FixResult {
        path,
        content,
        written: confirm,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn health_run(app: AppHandle) -> Res<Vec<Finding>> {
    blocking(app, run).await
}

#[tauri::command]
#[specta::specta]
pub async fn health_fix(app: AppHandle, id: String, expected: Option<String>) -> Res<FixResult> {
    blocking(app, move |s| fix(s, &id, expected.as_deref())).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::projects::{create, open};
    use shipyard_core::health::Group;

    fn project(with_file: bool) -> (tempfile::TempDir, AppState, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let root = dir.path().join("p");
        if with_file {
            create(&s, root.to_str().unwrap(), "P", "PRJ").unwrap();
        } else {
            shipyard_git::project::init(&root).unwrap();
            open(&s, root.to_str().unwrap(), true).unwrap();
            std::fs::remove_file(root.join(PROJECT_FILE)).unwrap();
        }
        (dir, s, root)
    }

    fn codes(s: &AppState) -> Vec<(Group, String)> {
        run(s)
            .unwrap()
            .into_iter()
            .map(|f| (f.group, f.code))
            .collect()
    }

    #[test]
    fn a_created_project_is_healthy_apart_from_the_tools() {
        let (_d, s, _r) = project(true);
        assert!(
            codes(&s).iter().all(|(g, _)| *g == Group::Tools),
            "{:?}",
            codes(&s)
        );
    }

    #[test]
    fn a_missing_project_file_previews_then_writes_after_the_confirm() {
        let (_d, s, root) = project(false);
        let f = run(&s)
            .unwrap()
            .into_iter()
            .find(|f| f.code == "project-file-missing")
            .unwrap();
        let preview = fix(&s, &f.id, None).unwrap();
        assert!(!preview.written && preview.content.contains("key:"));
        assert!(
            !root.join(PROJECT_FILE).exists(),
            "a preview writes nothing"
        );
        assert!(fix(&s, &f.id, Some(&preview.content)).unwrap().written);
        assert!(root.join(PROJECT_FILE).exists());
        assert!(
            !codes(&s).iter().any(|(_, c)| c == "project-file-missing"),
            "the finding clears"
        );
    }

    #[test]
    fn a_missing_ignore_rule_is_added_to_an_existing_repository_only_by_the_fix() {
        let (_d, s, root) = project(true);
        std::fs::write(root.join(".gitignore"), "target/\n").unwrap();
        let f = run(&s)
            .unwrap()
            .into_iter()
            .find(|f| f.code == "ignore-missing")
            .unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join(".gitignore")).unwrap(),
            "target/\n"
        );
        let preview = fix(&s, &f.id, None).unwrap();
        // The file changed after the preview: the confirm refuses and writes nothing.
        std::fs::write(root.join(".gitignore"), "target/\nnode_modules/\n").unwrap();
        assert!(fix(&s, &f.id, Some(&preview.content)).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join(".gitignore")).unwrap(),
            "target/\nnode_modules/\n"
        );
        std::fs::write(root.join(".gitignore"), "target/\n").unwrap();
        fix(&s, &f.id, Some(&preview.content)).unwrap();
        let text = std::fs::read_to_string(root.join(".gitignore")).unwrap();
        assert!(text.starts_with("target/\n") && text.contains(".DS_Store"));
        assert!(run(&s).unwrap().iter().all(|f| f.code != "ignore-missing"));
    }

    #[test]
    fn an_invalid_file_and_a_broken_ref_are_findings_with_a_non_writing_fix() {
        let (_d, s, root) = project(true);
        std::fs::write(root.join(PROJECT_FILE), "name: P\nkey: bad\n").unwrap();
        std::fs::create_dir_all(root.join("docs/decisions")).unwrap();
        std::fs::write(root.join("docs/decisions/0001-a.md"), "# A\nadr:0002\n").unwrap();
        let found = run(&s).unwrap();
        let invalid = found
            .iter()
            .find(|f| f.code == "project-file-invalid")
            .unwrap();
        assert_eq!(invalid.detail.as_deref(), Some("2: bad"));
        assert!(
            found
                .iter()
                .any(|f| f.code == "ref-broken" && f.source.as_deref() == Some("adr:0001"))
        );
        assert!(fix(&s, &invalid.id, Some("x")).is_err());
    }

    #[test]
    fn a_fix_path_stays_inside_the_project() {
        assert!(relative(".shipyard/project.yaml") && relative(".gitignore"));
        for bad in ["", "/etc/hosts", "../x", "a/../../x", "a/.."] {
            assert!(!relative(bad), "{bad}");
        }
    }

    #[test]
    fn a_missing_folder_is_one_finding() {
        let (_d, s, root) = project(true);
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(
            codes(&s),
            [(Group::Compliance, "folder-missing".to_string())]
        );
    }

    #[test]
    fn no_project_no_finding() {
        let dir = tempfile::tempdir().unwrap();
        assert!(run(&AppState::new(dir.path().into())).unwrap().is_empty());
    }
}
