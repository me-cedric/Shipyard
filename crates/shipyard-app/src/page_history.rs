//! Earlier versions of a page or of the project rules (`spec:library-functions#REQ-002`): the
//! commits that changed one file, the text at a commit, and a restore. A restore writes the old
//! text into the file and commits nothing: the person reviews it in Code, then commits.

use std::path::Path;

use shipyard_git::Repo;
use shipyard_git::code::CommitInfo;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::work::need_click;

/// The most earlier versions that a page lists.
const MAX_VERSIONS: usize = 30;

fn repo(s: &AppState) -> Res<Repo> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Repo::open(Path::new(&e.path)).map_err(err)
}

/// The Markdown file of the project that `rel` names, as a path with forward slashes.
fn page(s: &AppState, rel: &str) -> Res<String> {
    crate::files::resolve(s, rel)?;
    let rel = rel.trim().replace('\\', "/");
    if !rel.ends_with(".md") {
        return Err(format!("{rel} is not a page"));
    }
    Ok(rel)
}

/// The commits that changed a page, newest first.
pub fn history(s: &AppState, path: &str) -> Res<Vec<CommitInfo>> {
    repo(s)?
        .file_history(&page(s, path)?, MAX_VERSIONS)
        .map_err(err)
}

/// The text of a page at a commit.
pub fn version(s: &AppState, path: &str, sha: &str) -> Res<String> {
    let path = page(s, path)?;
    repo(s)?
        .file_at(&path, sha)
        .map_err(err)?
        .ok_or_else(|| format!("{path} is not in that version"))
}

/// Writes the text of a commit into the page. Nothing is staged or committed.
pub fn restore(s: &AppState, path: &str, sha: &str, click: bool) -> Res<()> {
    let path = page(s, path)?;
    let (root, full) = crate::files::resolve(s, &path)?;
    let right = crate::rights::path_right(&root, &full);
    need_click(s, click, right, "page_restore", &path)?;
    if !full.is_file() {
        return Err(format!("{path} does not exist"));
    }
    let text = version(s, &path, sha)?;
    std::fs::write(&full, text).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub async fn page_history(app: AppHandle, path: String) -> Api<Vec<CommitInfo>> {
    blocking(app, move |s| history(s, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn page_version(app: AppHandle, path: String, sha: String) -> Api<String> {
    blocking(app, move |s| version(s, &path, &sha)).await
}

/// Writes an earlier version into the page, after the click of a person. It does not commit.
#[tauri::command]
#[specta::specta]
pub async fn page_restore(app: AppHandle, path: String, sha: String, click: bool) -> Api<()> {
    blocking(app, move |s| restore(s, &path, &sha, click)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work::tests::fx;

    #[test]
    fn a_restore_writes_the_old_text_and_commits_nothing() {
        let f = fx();
        let r = repo(&f.s).unwrap();
        let file = f.repo.path().join("docs/handbook/a.md");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        for (text, msg) in [("one\n", "docs: one"), ("two\n", "docs: two")] {
            std::fs::write(&file, text).unwrap();
            r.stage(&["docs/handbook/a.md".to_string()]).unwrap();
            r.commit(msg, "").unwrap();
        }
        let path = "docs/handbook/a.md";
        let log = history(&f.s, path).unwrap();
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].summary, "docs: two");
        assert!(!log[0].author_name.is_empty());
        let old = &log[1].sha;
        assert_eq!(version(&f.s, path, old).unwrap(), "one\n");

        let before = r.log(0, 10).unwrap().commits.len();
        assert!(restore(&f.s, path, old, false).is_err());
        restore(&f.s, path, old, true).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "one\n");
        assert_eq!(r.log(0, 10).unwrap().commits.len(), before);
        assert!(r.status().unwrap().unstaged.len() == 1);
    }

    #[test]
    fn a_path_that_is_not_a_page_of_the_project_is_refused() {
        let f = fx();
        assert!(history(&f.s, "../x.md").is_err());
        assert!(history(&f.s, "src/main.rs").is_err());
        assert!(version(&f.s, "docs/none.md", "HEAD").is_err());
    }
}
