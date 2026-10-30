//! The project import command (spec `projects`, REQ-014, REQ-015) and the delivery files (Q-103).
//! The codecs live in `shipyard_store::project_import` and `shipyard_store::delivery_docs`.

use std::path::Path;

use serde::Serialize;
use shipyard_store::delivery_docs::{
    self, Assignments, DeliveryNote, Persona, TicketLink, TicketsConfig,
};
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

/// Imports the repository `source` into the active project.
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

/// Reads the folder `source` and writes the matching files into the active project. It replaces no file.
#[tauri::command]
#[specta::specta]
pub async fn project_import(app: AppHandle, source: String) -> Res<ImportReport> {
    blocking(app, move |s| report(s, &source)).await
}

fn root(s: &AppState) -> Res<std::path::PathBuf> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Ok(e.path.into())
}

/// The personas of the active project (`docs/personas/personas.json`).
pub fn personas(s: &AppState) -> Res<Vec<Persona>> {
    Ok(delivery_docs::personas(&root(s)?))
}

/// Saves the personas. It keeps the keys of the file that Shipyard does not own.
pub fn personas_set(s: &AppState, list: &[Persona]) -> Res<()> {
    crate::work::refuse_read_only(s)?;
    let root = root(s)?;
    let _g = s.guard();
    delivery_docs::save_personas(&root, list).map_err(|e| e.to_string())
}

/// The work split by profile (`docs/delivery/assignments.json`), with days, cost and brief.
pub fn assignments(s: &AppState) -> Res<Assignments> {
    Ok(delivery_docs::assignments(&root(s)?))
}

pub fn tickets_config(s: &AppState) -> Res<TicketsConfig> {
    Ok(delivery_docs::tickets_config(&root(s)?))
}

pub fn tickets_config_set(s: &AppState, config: &TicketsConfig) -> Res<()> {
    crate::work::refuse_read_only(s)?;
    let root = root(s)?;
    let _g = s.guard();
    delivery_docs::save_tickets_config(&root, config).map_err(|e| e.to_string())
}

/// The ticket links of the active project (`docs/delivery/tickets.json`).
pub fn tickets_links_of(s: &AppState) -> Res<Vec<TicketLink>> {
    Ok(delivery_docs::ticket_links(&root(s)?))
}

/// The delivery notes of the active project (`docs/delivery/impacts`).
pub fn delivery_notes_of(s: &AppState) -> Res<Vec<DeliveryNote>> {
    Ok(delivery_docs::delivery_notes(&root(s)?))
}

#[tauri::command]
#[specta::specta]
pub async fn tickets_links(app: AppHandle) -> Res<Vec<TicketLink>> {
    blocking(app, tickets_links_of).await
}

#[tauri::command]
#[specta::specta]
pub async fn delivery_notes(app: AppHandle) -> Res<Vec<DeliveryNote>> {
    blocking(app, delivery_notes_of).await
}

#[tauri::command]
#[specta::specta]
pub async fn personas_list(app: AppHandle) -> Res<Vec<Persona>> {
    blocking(app, personas).await
}

#[tauri::command]
#[specta::specta]
pub async fn personas_save(app: AppHandle, personas: Vec<Persona>) -> Res<()> {
    blocking(app, move |s| personas_set(s, &personas)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assignments_read(app: AppHandle) -> Res<Assignments> {
    blocking(app, assignments).await
}

#[tauri::command]
#[specta::specta]
pub async fn tickets_config_get(app: AppHandle) -> Res<TicketsConfig> {
    blocking(app, tickets_config).await
}

#[tauri::command]
#[specta::specta]
pub async fn tickets_config_save(app: AppHandle, config: TicketsConfig) -> Res<()> {
    blocking(app, move |s| tickets_config_set(s, &config)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_delivery_files_need_an_active_project_and_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        assert!(personas(&s).is_err() && assignments(&s).is_err() && tickets_config(&s).is_err());
        assert!(tickets_links_of(&s).is_err() && delivery_notes_of(&s).is_err());
        let repo = dir.path().join("p");
        shipyard_git::project::init(&repo).unwrap();
        crate::projects::open(&s, repo.to_str().unwrap()).unwrap();
        assert!(personas(&s).unwrap().is_empty());
        let mut c = tickets_config(&s).unwrap();
        c.story = "Récit".into();
        tickets_config_set(&s, &c).unwrap();
        assert_eq!(tickets_config(&s).unwrap().story, "Récit");
        c.hours_per_day = 99.0;
        assert!(tickets_config_set(&s, &c).is_err());
        assert!(assignments(&s).unwrap().assignments.is_empty());
        assert!(
            tickets_links_of(&s).unwrap().is_empty() && delivery_notes_of(&s).unwrap().is_empty()
        );
    }

    #[test]
    fn the_import_needs_an_active_project() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        assert!(report(&s, "/none").is_err());
    }
}
