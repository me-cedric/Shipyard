//! Status: staged, unstaged, untracked and conflicted files (REQ-001, REQ-003).

use std::path::Path;

use git2::{Delta, Status, StatusOptions};
use serde::Serialize;
use specta::Type;

use super::Repo;
use crate::error::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum FileState {
    Added,
    Modified,
    Deleted,
    Renamed,
    Typechange,
    Untracked,
    Conflicted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct FileChange {
    /// Path from the working copy root, with `/` separators.
    pub path: String,
    /// The old path of a rename.
    pub old_path: Option<String>,
    pub state: FileState,
}

/// A file that has a staged and a later unstaged change is in both lists.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
pub struct Changes {
    /// `None` on a detached HEAD.
    pub branch: Option<String>,
    /// Full id of HEAD, `None` before the first commit.
    pub head: Option<String>,
    /// The upstream of the branch, for example `origin/main`.
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<FileChange>,
    pub unstaged: Vec<FileChange>,
    pub untracked: Vec<FileChange>,
    pub conflicted: Vec<FileChange>,
    /// A merge is in progress: the person resolves the conflicts, or aborts it.
    pub merging: bool,
}

impl Changes {
    pub fn is_clean(&self) -> bool {
        self.staged.is_empty()
            && self.unstaged.is_empty()
            && self.untracked.is_empty()
            && self.conflicted.is_empty()
    }
}

fn state_of(d: Delta) -> FileState {
    match d {
        Delta::Added => FileState::Added,
        Delta::Deleted => FileState::Deleted,
        Delta::Renamed | Delta::Copied => FileState::Renamed,
        Delta::Typechange => FileState::Typechange,
        Delta::Conflicted => FileState::Conflicted,
        _ => FileState::Modified,
    }
}

fn path_of(f: git2::DiffFile<'_>) -> Option<String> {
    f.path().map(|p| p.to_string_lossy().replace('\\', "/"))
}

/// Literal match: `p` is one of `paths` or is under one of them. No glob; `.` is the whole tree.
fn under(paths: &[String], p: &str) -> bool {
    paths.iter().any(|d| {
        let d = d.trim_start_matches("./").trim_end_matches('/');
        matches!(d, "" | ".") || p == d || p.strip_prefix(d).is_some_and(|r| r.starts_with('/'))
    })
}

impl Repo {
    pub fn status(&self) -> Result<Changes> {
        let mut out = Changes {
            merging: self.repo.state() == git2::RepositoryState::Merge,
            ..Changes::default()
        };
        let head = self.repo.head().ok();
        // The HEAD link names the branch, also before the first commit.
        out.branch = self
            .repo
            .find_reference("HEAD")?
            .symbolic_target()?
            .and_then(|t| t.strip_prefix("refs/heads/"))
            .map(str::to_string);
        out.head = head
            .as_ref()
            .and_then(|h| h.target())
            .map(|id| id.to_string());
        if let Some(h) = head.filter(|h| h.is_branch())
            && let Ok(up) = git2::Branch::wrap(h).upstream()
        {
            out.upstream = up.name()?.map(str::to_string);
            if let (Some(l), Some(r)) = (out.head.as_deref(), up.get().target()) {
                let l = git2::Oid::from_str(l)?;
                let (a, b) = self.repo.graph_ahead_behind(l, r)?;
                (out.ahead, out.behind) = (a as u32, b as u32);
            }
        }

        let mut opts = StatusOptions::new();
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .renames_head_to_index(true)
            .renames_index_to_workdir(true);
        let statuses = self.repo.statuses(Some(&mut opts))?;
        for e in statuses.iter() {
            let path = String::from_utf8_lossy(e.path_bytes()).replace('\\', "/");
            let s = e.status();
            let change = |state, old_path| FileChange {
                path: path.clone(),
                old_path,
                state,
            };
            if s.contains(Status::CONFLICTED) {
                out.conflicted.push(change(FileState::Conflicted, None));
                continue;
            }
            if let Some(d) = e.head_to_index().filter(|_| {
                s.intersects(
                    Status::INDEX_NEW
                        | Status::INDEX_MODIFIED
                        | Status::INDEX_DELETED
                        | Status::INDEX_RENAMED
                        | Status::INDEX_TYPECHANGE,
                )
            }) {
                let old = (d.status() == Delta::Renamed)
                    .then(|| path_of(d.old_file()))
                    .flatten();
                out.staged.push(change(state_of(d.status()), old));
            }
            if s.contains(Status::WT_NEW) {
                out.untracked.push(change(FileState::Untracked, None));
            } else if let Some(d) = e.index_to_workdir() {
                let old = (d.status() == Delta::Renamed)
                    .then(|| path_of(d.old_file()))
                    .flatten();
                out.unstaged.push(change(state_of(d.status()), old));
            }
        }
        Ok(out)
    }

    /// Stage files or folders: additions, edits and deletions. Staging a conflicted file marks it resolved.
    /// The match is literal: a file, or a folder and what is under it. No glob.
    pub fn stage(&self, paths: &[String]) -> Result<()> {
        super::check_paths(paths)?;
        let st = self.status()?;
        let mut index = self.repo.index()?;
        for f in [&st.unstaged, &st.untracked, &st.conflicted]
            .into_iter()
            .flatten()
            .filter(|f| under(paths, &f.path))
        {
            if let Some(old) = &f.old_path {
                index.remove_path(Path::new(old)).ok();
            }
            let p = Path::new(&f.path);
            if std::fs::symlink_metadata(self.workdir().join(p)).is_ok() {
                index.add_path(p)?;
            } else {
                index.remove_path(p).ok();
                index.conflict_remove(p).ok();
            }
        }
        index.write()?;
        Ok(())
    }

    /// Unstage files or folders. The working copy keeps its edits. Literal match, like `stage`.
    pub fn unstage(&self, paths: &[String]) -> Result<()> {
        super::check_paths(paths)?;
        let tree = self.repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        let mut index = self.repo.index()?;
        for f in self
            .status()?
            .staged
            .iter()
            .filter(|f| under(paths, &f.path))
        {
            // A rename also brings the old path back.
            for p in f.old_path.iter().chain([&f.path]) {
                let p = Path::new(p);
                match tree.as_ref().and_then(|t| t.get_path(p).ok()) {
                    Some(e) => index.add(&git2::IndexEntry {
                        ctime: git2::IndexTime::new(0, 0),
                        mtime: git2::IndexTime::new(0, 0),
                        dev: 0,
                        ino: 0,
                        mode: e.filemode() as u32,
                        uid: 0,
                        gid: 0,
                        file_size: 0,
                        id: e.id(),
                        flags: 0,
                        flags_extended: 0,
                        path: p.to_string_lossy().into_owned().into_bytes(),
                    })?,
                    None => index.remove_path(p)?,
                }
            }
        }
        index.write()?;
        Ok(())
    }

    /// Throw away the unstaged edits of files and folders: tracked files return to their
    /// staged content, also a deleted file. A staged change stays. With `untracked` the
    /// untracked files under the paths are deleted too; ignored files never are. The caller
    /// confirms with a person first (REQ-004).
    pub fn discard(&self, paths: &[String], untracked: bool) -> Result<()> {
        super::check_paths(paths)?;
        let hit = |p: &str| under(paths, p);
        let st = self.status()?;
        let mut restore = Vec::new();
        let mut delete = Vec::new();
        for f in st.unstaged.iter().filter(|f| hit(&f.path)) {
            restore.push(f.path.as_str());
            if let Some(old) = &f.old_path {
                // An unstaged rename: the old path comes back, the new one is untracked.
                restore.push(old);
                delete.push(f.path.as_str());
            }
        }
        if untracked {
            delete.extend(
                st.untracked
                    .iter()
                    .filter(|f| hit(&f.path))
                    .map(|f| f.path.as_str()),
            );
        }
        if !restore.is_empty() {
            let mut cb = git2::build::CheckoutBuilder::new();
            cb.force().disable_pathspec_match(true);
            for p in restore {
                cb.path(p);
            }
            self.repo.checkout_index(None, Some(&mut cb))?;
        }
        if untracked {
            for p in delete {
                std::fs::remove_file(self.workdir().join(p))?;
            }
        }
        Ok(())
    }
}
