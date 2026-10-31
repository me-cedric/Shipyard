//! More git for the active project: pop a stash, read the changes of a stash, fast-forward a
//! branch, and the state of a linked project at a glance. A write needs the click of a person.

use std::path::Path;

use shipyard_git::Repo;
use shipyard_git::code::{FileDiff, Forward, Inspect};
use tauri::AppHandle;

use super::{Api, AppState, Res, blocking, err};
use crate::work::need_click;

const MAX_DIFF: usize = 256 * 1024;

fn repo(s: &AppState) -> Res<Repo> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Repo::open(Path::new(&e.path)).map_err(err)
}

pub fn stash_pop(s: &AppState, id: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    repo(s)?.stash_pop(id).map_err(err)
}

pub fn stash_diff(s: &AppState, id: &str) -> Res<Vec<FileDiff>> {
    repo(s)?.stash_diff(id, MAX_DIFF).map_err(err)
}

pub fn fast_forward(s: &AppState, branch: &str, click: bool) -> Res<Forward> {
    need_click(s, click)?;
    repo(s)?.fast_forward(branch).map_err(err)
}

/// The state of the clone of a linked project. Only a child of the active project is read.
pub fn linked_inspect(s: &AppState, child: &str) -> Res<Inspect> {
    if !crate::extensions::recs(s)?.iter().any(|c| c.id == child) {
        return Err(format!("no linked project `{child}`"));
    }
    let dir = crate::extensions::clone_dir(s, child)?;
    Repo::open(&dir)
        .map_err(|_| "the linked project is not cloned yet".to_string())?
        .inspect()
        .map_err(err)
}

/// Applies a stash, then drops it, after the click of a person.
#[tauri::command]
#[specta::specta]
pub async fn git_stash_pop(app: AppHandle, id: String, click: bool) -> Api<()> {
    blocking(app, move |s| stash_pop(s, &id, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn git_stash_diff(app: AppHandle, id: String) -> Api<Vec<FileDiff>> {
    blocking(app, move |s| stash_diff(s, &id)).await
}

/// Moves a branch to its upstream when it only lags behind, after the click of a person.
#[tauri::command]
#[specta::specta]
pub async fn git_branch_fast_forward(app: AppHandle, branch: String, click: bool) -> Api<Forward> {
    blocking(app, move |s| fast_forward(s, &branch, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn git_linked_inspect(app: AppHandle, child: String) -> Api<Inspect> {
    blocking(app, move |s| linked_inspect(s, &child)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work::tests::fx;

    #[test]
    fn a_pop_needs_a_click_and_an_unknown_child_is_refused() {
        let f = fx();
        let root = f.repo.path();
        std::fs::write(root.join("a.txt"), "1\n").unwrap();
        let r = repo(&f.s).unwrap();
        r.stage(&["a.txt".to_string()]).unwrap();
        r.commit("chore: a", "").unwrap();
        std::fs::write(root.join("a.txt"), "2\n").unwrap();
        let mut r = repo(&f.s).unwrap();
        r.stash_push(None).unwrap();
        let id = r.stash_list().unwrap()[0].id.clone();
        assert!(stash_pop(&f.s, &id, false).is_err());
        assert_eq!(stash_diff(&f.s, &id).unwrap().len(), 1);
        stash_pop(&f.s, &id, true).unwrap();
        assert!(repo(&f.s).unwrap().stash_list().unwrap().is_empty());
        assert!(fast_forward(&f.s, "main", false).is_err());
        assert!(linked_inspect(&f.s, "../../etc").is_err());
    }
}
