//! Refs: parse, resolve, backlinks, search and check on the ref index of the active project.

use std::path::PathBuf;

use serde::Serialize;
use shipyard_core::project::ProjectFile;
use shipyard_core::refs::{Ref, SlugKind, parse};
use shipyard_git::project::state;
use shipyard_store::project::{Entry, FileRead, read_project_file};
use shipyard_store::ref_index::RefIndex;
use shipyard_store::ref_query::{BacklinkGroup, BrokenCitation, Resolved, SearchHit, State};
use specta::Type;
use tauri::AppHandle;

use super::{Api, AppState, Res, blocking, err};
use crate::connections::Connection;

#[derive(Debug, Serialize, Type)]
pub struct ParsedRef {
    #[serde(rename = "ref")]
    pub target: String,
    pub kind: String,
}

pub fn parse_text(text: &str) -> Option<ParsedRef> {
    parse(text).map(|r| ParsedRef {
        target: r.to_string(),
        kind: r.kind().into(),
    })
}

/// Opens the index of the active project and brings it up to date.
/// The check walks and stats the files, so no manual refresh and no file watcher are needed.
/// Without an active project the result is the default of `T`.
pub fn with_index<T: Default>(
    s: &AppState,
    f: impl FnOnce(&RefIndex) -> shipyard_store::Result<T>,
) -> Res<T> {
    let Some(entry) = s.registry()?.active().cloned() else {
        return Ok(T::default());
    };
    let root = PathBuf::from(&entry.path);
    let file = match read_project_file(&root) {
        Ok(FileRead::Valid(f)) => f,
        _ => ProjectFile::new(&entry.name, &entry.key),
    };
    // A query holds the index lock, so the factory (`read_ref`) and the views take turns.
    let shared = s.index_of(&entry.id)?;
    let mut index = shared.lock().unwrap_or_else(|e| e.into_inner());
    index.sync_repo(&root, &file).map_err(err)?;
    // A broken mirror must not break every ref query: the next query reads it again.
    let _ = super::sync::index_mirror(s, &root, &mut index);
    f(&index).map_err(err)
}

/// Brings the index of any project up to date from its repository, active or not. The mirror
/// entries (`wi:`, `pr:`) follow only for the active project (`with_index`).
pub fn reindex_repo(s: &AppState, entry: &Entry) -> Res<()> {
    let root = PathBuf::from(&entry.path);
    let file = match read_project_file(&root) {
        Ok(FileRead::Valid(f)) => f,
        _ => ProjectFile::new(&entry.name, &entry.key),
    };
    let shared = s.index_of(&entry.id)?;
    let mut index = shared.lock().unwrap_or_else(|e| e.into_inner());
    index.sync_repo(&root, &file).map(|_| ()).map_err(err)
}

/// A registered project resolves from the registry (`projects` REQ-017).
fn resolve_project(id: &str, e: &Entry) -> Resolved {
    Resolved {
        target: format!("project:{id}"),
        kind: "project".into(),
        state: State::Resolved,
        title: Some(e.name.clone()),
        status: Some(state(std::path::Path::new(&e.path)).as_str().into()),
        location: Some(e.path.clone()),
    }
}

/// A connection resolves from the connection store, with its name, kind and state (`connections` REQ-015).
fn resolve_connection(id: &str, c: &Connection) -> Resolved {
    Resolved {
        target: format!("conn:{id}"),
        kind: "conn".into(),
        state: State::Resolved,
        title: Some(c.name.clone()),
        status: Some(format!("{}: {}", c.kind.as_str(), c.state.as_str())),
        location: None,
    }
}

pub fn resolve(s: &AppState, text: &str) -> Res<Option<Resolved>> {
    if let Some(Ref::Slug(SlugKind::Project, id)) = parse(text)
        && let Some(e) = s.registry()?.get(&id)
    {
        return Ok(Some(resolve_project(&id, e)));
    }
    if let Some(Ref::Slug(SlugKind::Connection, id)) = parse(text)
        && let Some(c) = s.connections.get(&id)?
    {
        return Ok(Some(resolve_connection(&id, &c)));
    }
    if let Some(r) = crate::factory::resolve_run(s, text) {
        return Ok(Some(r));
    }
    if let Some(r) = super::sync::resolve_mirror(s, text)? {
        return Ok(Some(r));
    }
    let found = with_index(s, |i| i.resolve(text))?;
    Ok(match (found, parse(text)) {
        (Some(r), _) => Some(r),
        // No active project: a valid ref is unresolved.
        (None, Some(r)) => Some(Resolved {
            target: text.into(),
            kind: r.kind().into(),
            state: State::Unresolved,
            title: None,
            status: None,
            location: None,
        }),
        (None, None) => None,
    })
}

pub fn broken(s: &AppState) -> Res<Vec<BrokenCitation>> {
    with_index(s, |i| i.check())
}

#[tauri::command]
#[specta::specta]
pub async fn refs_parse(text: String) -> Option<ParsedRef> {
    parse_text(&text)
}

#[tauri::command]
#[specta::specta]
pub async fn refs_resolve(app: AppHandle, text: String) -> Api<Option<Resolved>> {
    blocking(app, move |s| resolve(s, &text)).await
}

#[tauri::command]
#[specta::specta]
pub async fn refs_backlinks(app: AppHandle, text: String) -> Api<Vec<BacklinkGroup>> {
    blocking(app, move |s| with_index(s, |i| i.backlinks(&text))).await
}

#[tauri::command]
#[specta::specta]
pub async fn refs_search(app: AppHandle, query: String, limit: u32) -> Api<Vec<SearchHit>> {
    blocking(app, move |s| {
        with_index(s, |i| i.search(&query, limit as usize))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn refs_check(app: AppHandle) -> Api<Vec<BrokenCitation>> {
    blocking(app, broken).await
}

/// Repair: drops the index and rebuilds it. Returns the number of indexed files.
#[tauri::command]
#[specta::specta]
pub async fn refs_reindex(app: AppHandle) -> Api<u32> {
    blocking(app, |s| {
        let shared = match s.registry()?.active() {
            Some(e) => Some(s.index_of(&e.id)?),
            None => None,
        };
        if let Some(index) = shared {
            index
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clear()
                .map_err(err)?;
        }
        let mut n = 0u32;
        with_index(s, |i| {
            n = i.count_sources()? as u32;
            Ok(())
        })?;
        Ok(n)
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::commands::projects;

    fn setup() -> (tempfile::TempDir, tempfile::TempDir, AppState) {
        let repo = tempfile::tempdir().unwrap();
        shipyard_git::project::init(repo.path()).unwrap();
        std::fs::create_dir_all(repo.path().join("docs/decisions")).unwrap();
        std::fs::write(
            repo.path().join("docs/decisions/0004-x.md"),
            "# Polling\nSee adr:0009.\n",
        )
        .unwrap();
        let data = tempfile::tempdir().unwrap();
        let s = AppState::new(data.path().into());
        projects::open(&s, repo.path().to_str().unwrap()).unwrap();
        (repo, data, s)
    }

    #[test]
    fn parse_returns_the_kind_or_nothing() {
        assert_eq!(parse_text("adr:0004").unwrap().kind, "adr");
        assert!(parse_text("adr:12").is_none());
    }

    #[test]
    fn queries_follow_the_active_project_and_pick_up_a_new_file() {
        let (repo, _data, s) = setup();
        assert_eq!(
            resolve(&s, "adr:0004").unwrap().unwrap().title.as_deref(),
            Some("Polling")
        );
        let hits = with_index(&s, |i| i.search("poll", 5)).unwrap();
        assert_eq!(hits[0].target, "adr:0004");
        assert_eq!(broken(&s).unwrap()[0].target, "adr:0009");
        std::fs::write(repo.path().join("docs/decisions/0009-y.md"), "# Other\n").unwrap();
        assert!(broken(&s).unwrap().is_empty(), "no manual refresh");
    }

    #[test]
    fn each_project_has_its_own_index() {
        let data = tempfile::tempdir().unwrap();
        let s = AppState::new(data.path().into());
        let (a, b) = (s.index_of("a").unwrap(), s.index_of("b").unwrap());
        assert!(!Arc::ptr_eq(&a, &b), "one index for two projects");
        assert!(Arc::ptr_eq(&a, &s.index_of("a").unwrap()));
    }

    #[test]
    fn a_project_ref_resolves_from_the_registry() {
        let (_repo, _data, s) = setup();
        let id = s.registry().unwrap().active().unwrap().id.clone();
        let r = resolve(&s, &format!("project:{id}")).unwrap().unwrap();
        assert_eq!(r.state, State::Resolved);
        assert!(r.status.is_some());
    }

    #[test]
    fn a_connection_ref_resolves_to_its_name_kind_and_state() {
        use crate::connections::{ConnectionDraft, ConnectionGroup, ConnectionKind};
        let data = tempfile::tempdir().unwrap();
        let s = AppState::new(data.path().into());
        let c = s
            .connections
            .add(ConnectionDraft {
                name: "Acme Linear".into(),
                group: ConnectionGroup::Tracker,
                kind: ConnectionKind::Linear,
                url: String::new(),
                user: None,
            })
            .unwrap();
        let r = resolve(&s, &format!("conn:{}", c.id)).unwrap().unwrap();
        assert_eq!(r.state, State::Resolved);
        assert_eq!(r.title.as_deref(), Some("Acme Linear"));
        assert_eq!(r.status.as_deref(), Some("linear: untested"));
        assert_eq!(
            resolve(&s, "conn:gone").unwrap().unwrap().state,
            State::Unresolved
        );
    }

    #[test]
    fn without_a_project_a_valid_ref_is_unresolved_and_text_is_not_a_ref() {
        let data = tempfile::tempdir().unwrap();
        let s = AppState::new(data.path().into());
        assert_eq!(
            resolve(&s, "adr:0004").unwrap().unwrap().state,
            State::Unresolved
        );
        assert!(resolve(&s, "nope").unwrap().is_none());
        assert!(with_index(&s, |i| i.search("x", 5)).unwrap().is_empty());
    }
}
