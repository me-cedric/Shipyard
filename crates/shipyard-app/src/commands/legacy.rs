//! The Legacy import command (spec `projects`, REQ-014, REQ-015). The codecs live in
//! `shipyard_store::project_import`.

use std::path::Path;

use serde::Serialize;
use shipyard_store::project_import;
use specta::Type;
use tauri::AppHandle;

use super::{AppState, Res, blocking};

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
    fn the_import_needs_an_active_project() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        assert!(report(&s, "/legacy").is_err());
    }
}
