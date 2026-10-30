//! The auto-commit option of a project (Legacy `set_auto_commit`, `commands/connection.rs`).
//! Legacy keeps it in the connection. Shipyard keeps it in the app data folder by project id,
//! so a repository file carries no personal choice. When on, the app commits the pending
//! changes of the project before a sync and when the window closes.

use std::path::{Path, PathBuf};

use shipyard_git::child_deploy::commit_all;
use shipyard_store::project::write_atomic;
use tauri::AppHandle;

use crate::commands::{AppState, Res, blocking, err};

const FILE: &str = "auto-commit.json";

fn ids(dir: &Path) -> Vec<String> {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn active(s: &AppState) -> Res<(String, PathBuf)> {
    let reg = s.registry()?;
    let e = reg.active().ok_or("no active project")?;
    Ok((e.id.clone(), PathBuf::from(&e.path)))
}

pub fn enabled(s: &AppState) -> bool {
    active(s).is_ok_and(|(id, _)| ids(&s.dir).contains(&id))
}

/// Commits every pending change when the option is on. Returns the commit id, or `None`.
pub fn run(s: &AppState, message: &str) -> Res<Option<String>> {
    let (id, root) = active(s)?;
    if !ids(&s.dir).contains(&id) {
        return Ok(None);
    }
    commit_all(&root, message)
}

#[tauri::command]
#[specta::specta]
pub async fn auto_commit_get(app: AppHandle) -> Res<bool> {
    blocking(app, |s| Ok(enabled(s))).await
}

#[tauri::command]
#[specta::specta]
pub async fn auto_commit_set(app: AppHandle, on: bool) -> Res<bool> {
    blocking(app, move |s| {
        let _g = s.guard();
        let (id, _) = active(s)?;
        let mut list = ids(&s.dir);
        list.retain(|x| *x != id);
        if on {
            list.push(id);
        }
        write_atomic(
            &s.dir.join(FILE),
            serde_json::to_string(&list).map_err(err)?.as_bytes(),
        )
        .map_err(err)?;
        Ok(on)
    })
    .await
}

/// The commit of the sync action. It does nothing when the option is off.
#[tauri::command]
#[specta::specta]
pub async fn auto_commit_run(app: AppHandle) -> Res<Option<String>> {
    blocking(app, |s| {
        run(s, "chore: save changes before sync [shipyard]")
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_project_without_a_record_has_the_option_off() {
        let dir = tempfile::tempdir().unwrap();
        assert!(ids(dir.path()).is_empty());
        write_atomic(&dir.path().join(FILE), br#"["p1"]"#).unwrap();
        assert_eq!(ids(dir.path()), ["p1"]);
    }
}
