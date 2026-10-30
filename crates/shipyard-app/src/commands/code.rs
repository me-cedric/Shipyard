//! Code (spec `code`): the working copy, history, branches, stash, conflicts and the remote.
//!
//! Each command works on the active project. The git calls block, so a command runs them on a
//! blocking thread. The logic is in plain functions over `&AppState`, so a test needs no runtime.

use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use shipyard_core::code::{check_branch_name, check_summary};
use shipyard_git::Repo;
use shipyard_git::code::{
    BlameLine, Branch, Changes, Choice, CommitInfo, ConflictFile, DiffSide, FileChange, FileDiff,
    FileView, HeadChange, LogPage, MergeOutcome, PullOutcome, RebaseOutcome, Side, Stash,
};
use shipyard_store::code::{set_watch_minutes, watch_minutes};
use specta::Type;
use tauri::{AppHandle, Emitter};

use super::{AppState, Res, blocking, err};

/// A diff above this size is cut. The view says so.
const MAX_DIFF: usize = 256 * 1024;
const MAX_PAGE: u32 = 200;
/// A file in the viewer is cut at this size. The view says so.
const MAX_FILE: usize = 512 * 1024;
/// The event that the watch emits. The status bar listens to it.
pub const NOTICE_EVENT: &str = "code-notice";

/// The repository of the active project.
fn repo(s: &AppState) -> Res<Repo> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Repo::open(Path::new(&e.path)).map_err(err)
}

pub fn status(s: &AppState) -> Res<Changes> {
    repo(s)?.status().map_err(err)
}

pub fn diff(s: &AppState, path: &str, side: DiffSide) -> Res<FileDiff> {
    repo(s)?.diff_file(path, side, MAX_DIFF).map_err(err)
}

pub fn stage(s: &AppState, paths: &[String]) -> Res<()> {
    repo(s)?.stage(paths).map_err(err)
}

pub fn unstage(s: &AppState, paths: &[String]) -> Res<()> {
    repo(s)?.unstage(paths).map_err(err)
}

/// The caller asks for the confirmation (REQ-004). `untracked` deletes the untracked files.
pub fn discard(s: &AppState, paths: &[String], untracked: bool) -> Res<()> {
    repo(s)?.discard(paths, untracked).map_err(err)
}

/// Commits the staged files. The summary follows `<type>(<scope>): <subject>` (REQ-008).
pub fn commit(s: &AppState, summary: &str, description: &str) -> Res<String> {
    check_summary(summary).map_err(|e| e.message())?;
    let sha = repo(s)?.commit(summary, description).map_err(err)?;
    // The commit exists. A failure of the link index must not hide it: History links it later.
    let _ = crate::code::index_new_commit(s, &sha);
    Ok(sha)
}

pub fn log(s: &AppState, skip: u32, limit: u32) -> Res<LogPage> {
    repo(s)?.log(skip, limit.clamp(1, MAX_PAGE)).map_err(err)
}

#[derive(Debug, Serialize, Type)]
pub struct CommitDetail {
    pub info: CommitInfo,
    pub files: Vec<FileChange>,
}

pub fn commit_detail(s: &AppState, sha: &str) -> Res<CommitDetail> {
    let r = repo(s)?;
    Ok(CommitDetail {
        info: r.commit_info(sha).map_err(err)?,
        files: r.commit_files(sha).map_err(err)?,
    })
}

pub fn commit_diff(s: &AppState, sha: &str, path: &str) -> Res<FileDiff> {
    repo(s)?.commit_diff(sha, path, MAX_DIFF).map_err(err)
}

pub fn branches(s: &AppState) -> Res<Vec<Branch>> {
    repo(s)?.branches().map_err(err)
}

/// Creates a branch from the current head and switches to it (REQ-012).
pub fn branch_create(s: &AppState, name: &str) -> Res<()> {
    check_branch_name(name).map_err(|e| e.message())?;
    repo(s)?.create_branch(name).map_err(err)
}

pub fn branch_switch(s: &AppState, name: &str) -> Res<()> {
    repo(s)?.switch_branch(name).map_err(err)
}

/// Merges a branch into the working branch. Conflicts leave the merge in progress.
pub fn branch_merge(s: &AppState, name: &str) -> Res<MergeOutcome> {
    repo(s)?.merge_branch(name).map_err(err)
}

/// Ends a merge in progress. The working copy goes back to HEAD.
pub fn merge_abort(s: &AppState) -> Res<()> {
    repo(s)?.merge_abort().map_err(err)
}

/// Rebases the working branch onto a branch. Conflicts leave the rebase in progress.
pub fn branch_rebase(s: &AppState, onto: &str) -> Res<RebaseOutcome> {
    repo(s)?.rebase_branch(onto).map_err(err)
}

/// Commits the step that a person resolved and runs the next steps.
pub fn rebase_continue(s: &AppState) -> Res<RebaseOutcome> {
    repo(s)?.rebase_continue().map_err(err)
}

/// Ends a rebase in progress. The branch goes back as it was.
pub fn rebase_abort(s: &AppState) -> Res<()> {
    repo(s)?.rebase_abort().map_err(err)
}

/// The commit and the author of each line of a file.
pub fn blame(s: &AppState, path: &str) -> Res<Vec<BlameLine>> {
    repo(s)?.blame(path).map_err(err)
}

/// The caller asks for the confirmation that names the branch (REQ-013).
pub fn branch_delete(s: &AppState, name: &str, force: bool) -> Res<()> {
    repo(s)?.delete_branch(name, force).map_err(err)
}

pub fn stash_push(s: &AppState, message: Option<&str>) -> Res<String> {
    repo(s)?
        .stash_push(message.map(str::trim).filter(|m| !m.is_empty()))
        .map_err(err)
}

pub fn stash_list(s: &AppState) -> Res<Vec<Stash>> {
    repo(s)?.stash_list().map_err(err)
}

pub fn stash_apply(s: &AppState, index: u32) -> Res<()> {
    repo(s)?.stash_apply(index as usize).map_err(err)
}

pub fn stash_drop(s: &AppState, id: &str) -> Res<()> {
    repo(s)?.stash_drop(id).map_err(err)
}

pub fn conflicts(s: &AppState) -> Res<Vec<ConflictFile>> {
    repo(s)?.conflicts().map_err(err)
}

/// How a person resolves one conflicted file (REQ-005).
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Resolution {
    /// One choice for each block, in order.
    Blocks { choices: Vec<Choice> },
    /// Take a whole side. The only way for a binary file or a deleted side.
    Whole { side: Side },
    /// The file was edited by hand. It must hold no conflict marker.
    Marked,
}

pub fn resolve(s: &AppState, path: &str, how: &Resolution) -> Res<()> {
    let r = repo(s)?;
    match how {
        Resolution::Blocks { choices } => r.resolve_blocks(path, choices),
        Resolution::Whole { side } => r.resolve_side(path, *side),
        Resolution::Marked => r.mark_resolved(path),
    }
    .map_err(err)
}

/// The remote of the repository and the credentials of its connection. Both are `None`-free:
/// a repository with no remote is an error that the view shows.
fn remote(r: &Repo, s: &AppState) -> Res<(String, shipyard_git::Auth)> {
    let (name, url) = r
        .remote()
        .map_err(err)?
        .ok_or("the project has no remote")?;
    Ok((name, s.connections.git_auth(&url)?))
}

pub fn fetch(s: &AppState) -> Res<()> {
    let r = repo(s)?;
    let (name, auth) = remote(&r, s)?;
    r.fetch(&name, &auth).map_err(err)
}

/// The sync action (REQ-014): fetch, then bring the working branch up to date. A working copy
/// with uncommitted changes keeps them: the fetch runs and the error names the files.
pub fn pull(s: &AppState) -> Res<PullOutcome> {
    let r = repo(s)?;
    let (name, auth) = remote(&r, s)?;
    let st = r.status().map_err(err)?;
    let dirty: Vec<String> = [&st.staged, &st.unstaged, &st.conflicted]
        .into_iter()
        .flatten()
        .map(|f| f.path.clone())
        .collect();
    if !dirty.is_empty() {
        r.fetch(&name, &auth).map_err(err)?;
        return Err(shipyard_git::GitError::DirtyTree(dirty).to_string());
    }
    let out = r.pull_rebase(&auth).map_err(err)?;
    if let Some(id) = s.registry()?.active().map(|e| e.id.clone()) {
        s.notices().remove(&id);
    }
    Ok(out)
}

/// Publishes the working branch. It never forces (REQ-014).
pub fn push(s: &AppState) -> Res<()> {
    let r = repo(s)?;
    let (name, auth) = remote(&r, s)?;
    r.push(&name, &auth).map_err(err)
}

/// Replaces the remote branch with the working branch while the remote still holds the commit of
/// the last fetch. The caller asks for the confirmation.
pub fn push_force(s: &AppState) -> Res<()> {
    let r = repo(s)?;
    let (name, auth) = remote(&r, s)?;
    r.push_force_with_lease(&name, &auth).map_err(err)
}

/// What the remote watch found: remote branches that moved between two fetches (REQ-017).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct WatchNotice {
    pub project: String,
    pub changes: Vec<HeadChange>,
}

/// Fetches the remote heads of every project that has a remote and returns a notice for each
/// project whose heads moved (REQ-015, REQ-017). It moves the remote tracking refs only
/// (REQ-016). A project that fails, for example offline, is skipped.
pub fn watch_tick(s: &AppState) -> Res<Vec<WatchNotice>> {
    watch_due(s, &mut |_| true)
}

/// A project is due when it was never fetched or its own interval has passed (REQ-015, Q-042).
pub(crate) fn is_due(last: Option<Instant>, every: Duration, now: Instant) -> bool {
    last.is_none_or(|l| now.saturating_duration_since(l) >= every)
}

/// The tick for the projects that `due` accepts. It gets the project id.
pub(crate) fn watch_due(s: &AppState, due: &mut dyn FnMut(&str) -> bool) -> Res<Vec<WatchNotice>> {
    let mut out = Vec::new();
    for e in s.registry()?.projects() {
        if !due(&e.id) {
            continue;
        }
        let Ok(r) = Repo::open(Path::new(&e.path)) else {
            continue;
        };
        let Ok((name, auth)) = remote(&r, s) else {
            continue;
        };
        let Ok(before) = r.remote_heads(&name) else {
            continue;
        };
        if r.fetch(&name, &auth).is_err() {
            continue;
        }
        let Ok(after) = r.remote_heads(&name) else {
            continue;
        };
        match r.head_changes(&before, &after) {
            Ok(changes) if !changes.is_empty() => {
                let notice = WatchNotice {
                    project: e.id.clone(),
                    changes,
                };
                s.notices().insert(e.id.clone(), notice.clone());
                out.push(notice);
            }
            _ => {}
        }
    }
    Ok(out)
}

/// The notice of the active project, or `None` when it is quiet.
pub fn watch_notice(s: &AppState) -> Res<Option<WatchNotice>> {
    let Some(id) = s.registry()?.active().map(|e| e.id.clone()) else {
        return Ok(None);
    };
    Ok(s.notices().get(&id).cloned())
}

/// How often the watch checks which project is due.
const POLL: Duration = Duration::from_secs(60);

/// Starts the background watch. Each project is fetched at its own interval. A notice goes out as
/// an event.
pub fn spawn_watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: HashMap<String, Instant> = HashMap::new();
        loop {
            std::thread::sleep(POLL);
            let state = tauri::Manager::state::<AppState>(&app);
            let now = Instant::now();
            let found = watch_due(&state, &mut |id| {
                let every = Duration::from_secs(u64::from(watch_minutes(&state.dir, id)) * 60);
                let due = is_due(last.get(id).copied(), every, now);
                if due {
                    last.insert(id.to_string(), now);
                }
                due
            });
            for n in found.unwrap_or_default() {
                let _ = app.emit(NOTICE_EVENT, n);
            }
        }
    });
}

/// The minutes between two fetches of the active project.
/// The address of the remote of the active project, with no user name or password in it. `None`
/// when the project has no remote.
pub fn remote_url(s: &AppState) -> Res<Option<String>> {
    Ok(repo(s)?
        .remote()
        .map_err(err)?
        .map(|(_, url)| without_userinfo(&url)))
}

/// `https://user:token@host/x` gives `https://host/x`. An address with no `://` stays as it is.
fn without_userinfo(url: &str) -> String {
    let Some((scheme, rest)) = url.split_once("://") else {
        return url.to_string();
    };
    let end = rest.find('/').unwrap_or(rest.len());
    let host = rest[..end]
        .rsplit_once('@')
        .map_or(&rest[..end], |(_, h)| h);
    format!("{scheme}://{host}{}", &rest[end..])
}

pub fn watch_interval(s: &AppState) -> Res<u32> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Ok(watch_minutes(&s.dir, &e.id))
}

pub fn watch_interval_set(s: &AppState, minutes: u32) -> Res<u32> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    set_watch_minutes(&s.dir, &e.id, minutes).map_err(err)?;
    Ok(minutes)
}

/// A file of the working copy, or at `rev`, for the read-only viewer (REQ-036).
pub fn file_read(s: &AppState, path: &str, rev: Option<&str>) -> Res<FileView> {
    repo(s)?
        .read_file(path, rev.filter(|r| !r.is_empty()), MAX_FILE)
        .map_err(err)
}

#[tauri::command]
#[specta::specta]
pub async fn code_status(app: AppHandle) -> Res<Changes> {
    blocking(app, status).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_diff(app: AppHandle, path: String, side: DiffSide) -> Res<FileDiff> {
    blocking(app, move |s| diff(s, &path, side)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_stage(app: AppHandle, paths: Vec<String>) -> Res<()> {
    blocking(app, move |s| stage(s, &paths)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_unstage(app: AppHandle, paths: Vec<String>) -> Res<()> {
    blocking(app, move |s| unstage(s, &paths)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_discard(app: AppHandle, paths: Vec<String>, untracked: bool) -> Res<()> {
    blocking(app, move |s| discard(s, &paths, untracked)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_commit(app: AppHandle, summary: String, description: String) -> Res<String> {
    blocking(app, move |s| commit(s, &summary, &description)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_log(app: AppHandle, skip: u32, limit: u32) -> Res<LogPage> {
    blocking(app, move |s| log(s, skip, limit)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_commit_detail(app: AppHandle, sha: String) -> Res<CommitDetail> {
    blocking(app, move |s| commit_detail(s, &sha)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_commit_diff(app: AppHandle, sha: String, path: String) -> Res<FileDiff> {
    blocking(app, move |s| commit_diff(s, &sha, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_branches(app: AppHandle) -> Res<Vec<Branch>> {
    blocking(app, branches).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_branch_create(app: AppHandle, name: String) -> Res<()> {
    blocking(app, move |s| branch_create(s, &name)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_branch_switch(app: AppHandle, name: String) -> Res<()> {
    blocking(app, move |s| branch_switch(s, &name)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_branch_merge(app: AppHandle, name: String) -> Res<MergeOutcome> {
    blocking(app, move |s| branch_merge(s, &name)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_branch_rebase(app: AppHandle, onto: String) -> Res<RebaseOutcome> {
    blocking(app, move |s| branch_rebase(s, &onto)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_rebase_continue(app: AppHandle) -> Res<RebaseOutcome> {
    blocking(app, rebase_continue).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_rebase_abort(app: AppHandle) -> Res<()> {
    blocking(app, rebase_abort).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_blame(app: AppHandle, path: String) -> Res<Vec<BlameLine>> {
    blocking(app, move |s| blame(s, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_push_force(app: AppHandle) -> Res<()> {
    blocking(app, push_force).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_merge_abort(app: AppHandle) -> Res<()> {
    blocking(app, merge_abort).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_branch_delete(app: AppHandle, name: String, force: bool) -> Res<()> {
    blocking(app, move |s| branch_delete(s, &name, force)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_stash_push(app: AppHandle, message: Option<String>) -> Res<String> {
    blocking(app, move |s| stash_push(s, message.as_deref())).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_stash_list(app: AppHandle) -> Res<Vec<Stash>> {
    blocking(app, stash_list).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_stash_apply(app: AppHandle, index: u32) -> Res<()> {
    blocking(app, move |s| stash_apply(s, index)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_stash_drop(app: AppHandle, id: String) -> Res<()> {
    blocking(app, move |s| stash_drop(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_conflicts(app: AppHandle) -> Res<Vec<ConflictFile>> {
    blocking(app, conflicts).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_resolve(app: AppHandle, path: String, how: Resolution) -> Res<()> {
    blocking(app, move |s| resolve(s, &path, &how)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_remote_url(app: AppHandle) -> Res<Option<String>> {
    blocking(app, remote_url).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_fetch(app: AppHandle) -> Res<()> {
    blocking(app, fetch).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull(app: AppHandle) -> Res<PullOutcome> {
    blocking(app, pull).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_push(app: AppHandle) -> Res<()> {
    blocking(app, push).await
}

/// Runs one watch tick now and emits the notices. The background watch runs the same tick.
#[tauri::command]
#[specta::specta]
pub async fn code_watch_tick(app: AppHandle) -> Res<Vec<WatchNotice>> {
    let emitter = app.clone();
    let found = blocking(app, watch_tick).await?;
    for n in &found {
        let _ = emitter.emit(NOTICE_EVENT, n);
    }
    Ok(found)
}

/// The minutes between two fetches of the active project (default 15).
#[tauri::command]
#[specta::specta]
pub async fn code_watch_interval(app: AppHandle) -> Res<u32> {
    blocking(app, watch_interval).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_watch_interval_set(app: AppHandle, minutes: u32) -> Res<u32> {
    blocking(app, move |s| watch_interval_set(s, minutes)).await
}

/// A file for the viewer: the working copy when `rev` is empty, else the file at that revision.
#[tauri::command]
#[specta::specta]
pub async fn code_file_read(app: AppHandle, path: String, rev: Option<String>) -> Res<FileView> {
    blocking(app, move |s| file_read(s, &path, rev.as_deref())).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_watch_notice(app: AppHandle) -> Res<Option<WatchNotice>> {
    blocking(app, watch_notice).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::projects;
    use std::path::PathBuf;
    use std::process::Command;

    fn git(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .unwrap();
        assert!(out.status.success(), "git {args:?}: {out:?}");
    }

    fn write(dir: &Path, rel: &str, text: &str) {
        std::fs::write(dir.join(rel), text).unwrap();
    }

    /// An app state whose active project is a repository with one commit on `main`.
    fn project(dir: &Path, name: &str) -> (AppState, PathBuf) {
        let s = AppState::new(dir.join("data"));
        let root = dir.join(name);
        git_init(&root);
        projects::open(&s, root.to_str().unwrap()).unwrap();
        (s, std::fs::canonicalize(&root).unwrap())
    }

    fn git_init(root: &Path) {
        std::fs::create_dir_all(root).unwrap();
        git(root, &["init", "-q", "-b", "main"]);
        git(root, &["config", "user.name", "Test User"]);
        git(root, &["config", "user.email", "test@example.com"]);
        write(root, "a.txt", "one\n");
        git(root, &["add", "-A"]);
        git(root, &["commit", "-q", "-m", "chore: base"]);
    }

    fn paths(x: &[&str]) -> Vec<String> {
        x.iter().map(|p| p.to_string()).collect()
    }

    #[test]
    fn a_merge_shows_its_conflict_blocks_and_one_abort_ends_it() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path(), "p");
        git(&root, &["switch", "-q", "-c", "feat/x/side"]);
        write(&root, "a.txt", "theirs\n");
        git(&root, &["commit", "-q", "-am", "feat: theirs"]);
        git(&root, &["switch", "-q", "main"]);
        write(&root, "a.txt", "ours\n");
        git(&root, &["commit", "-q", "-am", "feat: ours"]);
        assert!(branch_merge(&s, "nope").is_err());
        let out = branch_merge(&s, "feat/x/side").unwrap();
        assert_eq!(out, MergeOutcome::Conflicts(paths(&["a.txt"])));
        assert!(status(&s).unwrap().merging);
        assert_eq!(conflicts(&s).unwrap().len(), 1);
        merge_abort(&s).unwrap();
        assert!(!status(&s).unwrap().merging);
        assert!(merge_abort(&s).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("a.txt")).unwrap(),
            "ours\n"
        );
    }

    #[test]
    fn the_remote_address_never_holds_a_user_name_or_a_password() {
        assert_eq!(
            without_userinfo("https://ana:tok-secret@github.com/acme/x.git"),
            "https://github.com/acme/x.git"
        );
        assert_eq!(
            without_userinfo("https://github.com/a@b/x"),
            "https://github.com/a@b/x"
        );
        assert_eq!(
            without_userinfo("git@github.com:acme/x.git"),
            "git@github.com:acme/x.git"
        );
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path(), "p");
        assert_eq!(remote_url(&s).unwrap(), None);
        git(
            &root,
            &["remote", "add", "origin", "https://u:p@example.com/x.git"],
        );
        assert_eq!(
            remote_url(&s).unwrap().as_deref(),
            Some("https://example.com/x.git")
        );
    }

    #[test]
    fn a_rebase_conflict_stays_in_progress_until_abort_and_blame_reads_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path(), "p");
        git(&root, &["switch", "-q", "-c", "feat/x/side"]);
        write(&root, "a.txt", "theirs\n");
        git(&root, &["commit", "-q", "-am", "feat: theirs"]);
        git(&root, &["switch", "-q", "main"]);
        write(&root, "a.txt", "ours\n");
        git(&root, &["commit", "-q", "-am", "feat: ours"]);
        git(&root, &["switch", "-q", "feat/x/side"]);
        assert!(branch_rebase(&s, "nope").is_err());
        let out = branch_rebase(&s, "main").unwrap();
        assert_eq!(out, RebaseOutcome::Conflicts(paths(&["a.txt"])));
        assert!(status(&s).unwrap().rebasing);
        rebase_abort(&s).unwrap();
        assert!(!status(&s).unwrap().rebasing);
        assert!(rebase_continue(&s).is_err());
        assert_eq!(blame(&s, "a.txt").unwrap().len(), 1);
    }

    #[test]
    fn stage_commit_only_the_staged_files_and_read_the_log() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path(), "p");
        write(&root, "a.txt", "two\n");
        write(&root, "b.txt", "new\n");
        assert!(commit(&s, "fix: x", "").is_err(), "nothing staged");
        stage(&s, &paths(&["a.txt"])).unwrap();
        let st = status(&s).unwrap();
        assert_eq!(st.staged.len(), 1);
        assert!(!diff(&s, "a.txt", DiffSide::Staged).unwrap().text.is_empty());

        let long = format!("feat(code): {}", "a".repeat(70));
        let sha = commit(&s, &long, "body").unwrap();
        let page = log(&s, 0, 10).unwrap();
        assert_eq!(page.commits[0].sha, sha);
        assert_eq!(page.commits[0].description, "body");
        assert_eq!(page.commits.len(), 2);
        let d = commit_detail(&s, &sha).unwrap();
        assert_eq!(d.files.len(), 1);
        assert!(
            commit_diff(&s, &sha, "a.txt")
                .unwrap()
                .text
                .contains("+two")
        );
        // The untracked file stayed out of the commit.
        assert!(
            status(&s)
                .unwrap()
                .untracked
                .iter()
                .any(|f| f.path == "b.txt")
        );
    }

    #[test]
    fn a_wrong_summary_is_refused_before_git_and_names_the_types() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path(), "p");
        write(&root, "a.txt", "two\n");
        stage(&s, &paths(&["a.txt"])).unwrap();
        let e = commit(&s, "wip: x", "").unwrap_err();
        assert!(e.contains("feat") && e.contains("refactor"), "{e}");
        assert_eq!(log(&s, 0, 10).unwrap().commits.len(), 1);
        assert_eq!(status(&s).unwrap().staged.len(), 1);
    }

    #[test]
    fn branches_follow_the_name_rule_and_the_working_branch_stays() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path(), "p");
        assert!(
            branch_create(&s, "patch-3")
                .unwrap_err()
                .contains("<type>/<area>/<kebab>")
        );
        branch_create(&s, "fix/auth/login-timeout").unwrap();
        let list = branches(&s).unwrap();
        assert!(
            list.iter()
                .any(|b| b.name == "fix/auth/login-timeout" && b.is_head)
        );
        assert!(branch_delete(&s, "fix/auth/login-timeout", false).is_err());

        // A switch that would overwrite an uncommitted change names the file.
        write(&root, "a.txt", "branch\n");
        git(&root, &["commit", "-q", "-am", "fix: a"]);
        branch_switch(&s, "main").unwrap();
        write(&root, "a.txt", "dirty\n");
        let e = branch_switch(&s, "fix/auth/login-timeout").unwrap_err();
        assert!(e.contains("a.txt"), "{e}");
        discard(&s, &paths(&["a.txt"]), false).unwrap();
        branch_switch(&s, "fix/auth/login-timeout").unwrap();
        branch_switch(&s, "main").unwrap();
        branch_delete(&s, "fix/auth/login-timeout", true).unwrap();
    }

    #[test]
    fn discard_and_stash_keep_untracked_files_safe_and_restore_them() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path(), "p");
        write(&root, "a.txt", "two\n");
        write(&root, "n.txt", "new\n");
        stash_push(&s, Some("  wip  ")).unwrap();
        assert!(status(&s).unwrap().staged.is_empty());
        assert!(!root.join("n.txt").exists());
        let list = stash_list(&s).unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].message.contains("wip"));
        stash_apply(&s, 0).unwrap();
        assert!(root.join("n.txt").exists());
        assert!(stash_drop(&s, "no-such-id").is_err());
        stash_drop(&s, &list[0].id).unwrap();
        assert!(stash_list(&s).unwrap().is_empty());
        discard(&s, &paths(&["a.txt"]), false).unwrap();
        assert!(root.join("n.txt").exists(), "untracked stays unless asked");
        discard(&s, &paths(&["n.txt"]), true).unwrap();
        assert!(!root.join("n.txt").exists());
    }

    #[test]
    fn a_merge_resolved_by_blocks_ends_with_a_two_parent_commit() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path(), "p");
        git(&root, &["checkout", "-q", "-b", "other"]);
        write(&root, "a.txt", "theirs\n");
        git(&root, &["commit", "-q", "-am", "fix: theirs"]);
        git(&root, &["checkout", "-q", "main"]);
        write(&root, "a.txt", "ours\n");
        git(&root, &["commit", "-q", "-am", "fix: ours"]);
        let merge = Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["merge", "other"])
            .output()
            .unwrap();
        assert!(!merge.status.success());

        let list = conflicts(&s).unwrap();
        assert_eq!(list.len(), 1);
        assert!(
            commit(&s, "fix: merge", "")
                .unwrap_err()
                .contains("conflicts")
        );
        resolve(
            &s,
            "a.txt",
            &Resolution::Blocks {
                choices: vec![Choice::Theirs],
            },
        )
        .unwrap();
        let sha = commit(&s, "fix: merge other", "").unwrap();
        assert_eq!(commit_detail(&s, &sha).unwrap().info.parents.len(), 2);
        assert!(conflicts(&s).unwrap().is_empty());
    }

    /// A bare remote, the active project `a` that pushed to it, and a second clone `b`.
    fn with_remote(dir: &Path) -> (AppState, PathBuf, PathBuf) {
        let bare = dir.join("remote.git");
        git(
            dir,
            &["init", "-q", "--bare", "-b", "main", bare.to_str().unwrap()],
        );
        let (s, a) = project(dir, "a");
        git(&a, &["remote", "add", "origin", bare.to_str().unwrap()]);
        push(&s).unwrap();
        let b = dir.join("b");
        git(
            dir,
            &["clone", "-q", bare.to_str().unwrap(), b.to_str().unwrap()],
        );
        git(&b, &["config", "user.name", "Ada"]);
        git(&b, &["config", "user.email", "ada@example.com"]);
        (s, a, b)
    }

    fn colleague_pushes(b: &Path, name: &str) {
        write(b, name, "x\n");
        git(b, &["add", "-A"]);
        git(b, &["commit", "-q", "-m", "feat(api): colleague change"]);
        git(b, &["push", "-q", "origin", "main"]);
    }

    #[test]
    fn the_watch_notifies_once_per_push_and_never_writes_the_working_copy() {
        let dir = tempfile::tempdir().unwrap();
        let (s, a, b) = with_remote(dir.path());
        // Nothing moved: no notice.
        assert!(watch_tick(&s).unwrap().is_empty());
        assert!(watch_notice(&s).unwrap().is_none());

        colleague_pushes(&b, "c1.txt");
        colleague_pushes(&b, "c2.txt");
        let files = |s: &AppState| {
            let st = status(s).unwrap();
            (
                st.staged,
                st.unstaged,
                st.untracked,
                std::fs::read_dir(&a).unwrap().count(),
            )
        };
        let before = files(&s);
        let found = watch_tick(&s).unwrap();
        assert_eq!(found.len(), 1);
        let c = &found[0].changes[0];
        assert_eq!(
            (
                c.name.as_str(),
                c.count,
                c.author.as_str(),
                c.subject.as_str()
            ),
            ("origin/main", 2, "Ada", "feat(api): colleague change")
        );
        assert_eq!(watch_notice(&s).unwrap().as_ref(), found.first());
        let after = files(&s);
        assert_eq!(before, after, "the watch writes no file");
        assert!(!a.join("c1.txt").exists());

        // Still behind, no new push: no new notice (the first one stays until a sync).
        assert!(watch_tick(&s).unwrap().is_empty());
        assert!(watch_notice(&s).unwrap().is_some());

        // Sync brings the branch up to date and the notice leaves.
        assert_eq!(pull(&s).unwrap(), PullOutcome::FastForwarded);
        assert!(a.join("c2.txt").exists());
        assert!(watch_notice(&s).unwrap().is_none());
    }

    #[test]
    fn a_dirty_sync_fetches_keeps_the_files_and_names_them() {
        let dir = tempfile::tempdir().unwrap();
        let (s, a, b) = with_remote(dir.path());
        colleague_pushes(&b, "c1.txt");
        write(&a, "a.txt", "mine\n");
        let e = pull(&s).unwrap_err();
        assert!(e.contains("a.txt"), "{e}");
        assert_eq!(std::fs::read_to_string(a.join("a.txt")).unwrap(), "mine\n");
        let heads = Repo::open(&a).unwrap().remote_heads("origin").unwrap();
        let tip = Repo::open(&b).unwrap().log(0, 1).unwrap().commits[0]
            .sha
            .clone();
        assert_eq!(heads[0].tip, tip, "the fetch ran");
        assert!(!a.join("c1.txt").exists());
    }

    #[test]
    fn push_and_fetch_need_a_remote_and_a_project() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        assert_eq!(status(&s).unwrap_err(), "no active project");
        let (s, _root) = project(dir.path(), "p");
        assert_eq!(push(&s).unwrap_err(), "the project has no remote");
        assert_eq!(fetch(&s).unwrap_err(), "the project has no remote");
        assert!(watch_tick(&s).unwrap().is_empty());
    }

    #[test]
    fn the_watch_fetches_a_project_only_when_its_interval_has_passed() {
        let (t0, every) = (Instant::now(), Duration::from_secs(15 * 60));
        assert!(is_due(None, every, t0), "never fetched");
        assert!(!is_due(Some(t0), every, t0 + Duration::from_secs(899)));
        assert!(is_due(Some(t0), every, t0 + every));

        let dir = tempfile::tempdir().unwrap();
        let (s, _a, b) = with_remote(dir.path());
        assert_eq!(watch_interval(&s).unwrap(), 15, "the default");
        colleague_pushes(&b, "c1.txt");
        assert!(
            watch_due(&s, &mut |_| false).unwrap().is_empty(),
            "not due: no fetch"
        );
        assert_eq!(watch_due(&s, &mut |_| true).unwrap().len(), 1);

        assert_eq!(watch_interval_set(&s, 5).unwrap(), 5);
        assert_eq!(watch_interval(&s).unwrap(), 5);
        assert!(watch_interval_set(&s, 0).is_err());
        assert_eq!(watch_interval(&s).unwrap(), 5);
    }

    #[test]
    fn the_viewer_reads_a_file_at_a_revision_and_refuses_a_path_out_of_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path(), "p");
        write(&root, "a.txt", "two\n");
        let now = file_read(&s, "a.txt", None).unwrap();
        assert_eq!(now.text, "two\n");
        assert_eq!(file_read(&s, "a.txt", Some("HEAD")).unwrap().text, "one\n");
        assert!(file_read(&s, "../a.txt", None).is_err());
        assert!(file_read(&s, "/etc/passwd", None).is_err());
    }
}
