//! The Legacy import command (spec `projects`, REQ-014, REQ-015) and the Legacy project list
//! (Q-103). The codecs live in `shipyard_store::project_import` and `shipyard_store::legacy`.

use std::path::Path;

use serde::Serialize;
use shipyard_store::legacy::{self, registry_file};
use shipyard_store::project_import;
use specta::Type;
use tauri::AppHandle;

use super::projects::{ProjectOutcome, open_with};
use super::{AppState, Res, blocking};

#[derive(Debug, Serialize, Type)]
pub struct LegacyProject {
    pub id: String,
    pub name: String,
    pub path: String,
}

fn same(a: &str, b: &str) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// The projects of the Legacy registry `file` that are not in the Shipyard list yet and whose
/// folder exists.
pub fn projects(s: &AppState, file: &Path) -> Res<Vec<LegacyProject>> {
    let known: Vec<String> = s
        .registry()?
        .projects()
        .iter()
        .map(|e| e.path.clone())
        .collect();
    Ok(legacy::read_registry(file)
        .into_iter()
        .filter(|p| Path::new(&p.path).is_dir() && !known.iter().any(|k| same(k, &p.path)))
        .map(|p| LegacyProject {
            id: p.id,
            name: p.name,
            path: p.path,
        })
        .collect())
}

/// Opens a Legacy project with the artifact paths of its registry entry. A project file in the
/// folder wins over them.
pub fn open_project(s: &AppState, file: &Path, id: &str) -> Res<ProjectOutcome> {
    let p = legacy::read_registry(file)
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("unknown Legacy project: {id}"))?;
    open_with(s, &p.path, &p.paths)
}

#[tauri::command]
#[specta::specta]
pub async fn legacy_projects(app: AppHandle) -> Res<Vec<LegacyProject>> {
    blocking(app, |s| match registry_file() {
        Some(f) => projects(s, &f),
        None => Ok(Vec::new()),
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn legacy_project_open(app: AppHandle, id: String) -> Res<ProjectOutcome> {
    blocking(app, move |s| {
        open_project(s, &registry_file().ok_or("no Legacy folder")?, &id)
    })
    .await
}

#[derive(Debug, Serialize, Type)]
pub struct ImportItem {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Type)]
pub struct ImportReport {
    pub copied: Vec<String>,
    pub skipped: Vec<ImportItem>,
    pub conflicts: Vec<String>,
}

/// Imports the Legacy repository `source` into the active project.
pub fn report(s: &AppState, source: &str) -> Res<ImportReport> {
    let root = s
        .registry()?
        .active()
        .map(|e| e.path.clone())
        .ok_or("no active project")?;
    let r = project_import::import(Path::new(source), Path::new(&root));
    Ok(ImportReport {
        copied: r.copied,
        skipped: r
            .skipped
            .into_iter()
            .map(|(path, reason)| ImportItem { path, reason })
            .collect(),
        conflicts: r.conflicts,
    })
}

/// Reads the Legacy folder and writes the matching files into the active project. It replaces no file.
#[tauri::command]
#[specta::specta]
pub async fn project_import(app: AppHandle, source: String) -> Res<ImportReport> {
    blocking(app, move |s| report(s, &source)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_legacy_project_opens_with_its_paths_and_leaves_the_list_once_added() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let repo = dir.path().join("kvy");
        shipyard_git::project::init(&repo).unwrap();
        let reg = dir.path().join("projects.json");
        std::fs::write(
            &reg,
            serde_json::json!({"projects": [
                {"id": "k1", "name": "Kvy", "path": repo, "url": "secret",
                 "paths": {"adr": "adr", "drawings": "d/x", "diagrams": "c4"}},
                {"id": "k2", "name": "Gone", "path": dir.path().join("gone")},
            ]})
            .to_string(),
        )
        .unwrap();
        assert_eq!(projects(&s, &reg).unwrap().len(), 1);
        assert!(open_project(&s, &reg, "nope").is_err());
        let o = open_project(&s, &reg, "k1").unwrap();
        assert_eq!(o.project.unwrap().name, "kvy");
        let text = std::fs::read_to_string(repo.join(".shipyard/project.yaml")).unwrap();
        assert!(text.contains("decisions: adr") && text.contains("diagrams: d/x"));
        assert!(text.contains("models: c4") && !text.contains("secret"));
        assert!(projects(&s, &reg).unwrap().is_empty());
    }

    #[test]
    fn the_import_needs_an_active_project() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        assert!(report(&s, "/legacy").is_err());
    }
}
