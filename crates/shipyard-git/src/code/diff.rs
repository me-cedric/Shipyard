//! Text diffs with a size cap (REQ-002, REQ-010).

use git2::{Diff, DiffOptions, Patch};
use serde::{Deserialize, Serialize};
use specta::Type;

use super::Repo;
use super::status::{FileChange, FileState};
use crate::error::{GitError, Result};

/// Files above this size count as binary, so a huge file never loads into memory as a diff.
const MAX_FILE_BYTES: i64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum DiffSide {
    /// HEAD against the index.
    Staged,
    /// The index against the working copy. An untracked file shows as all added.
    Unstaged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct FileDiff {
    pub path: String,
    /// Unified diff text. Empty for a binary file.
    pub text: String,
    pub binary: bool,
    /// The text was cut at `max_bytes`.
    pub truncated: bool,
}

/// A file for the read-only viewer (REQ-036). A binary file has a size and no text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct FileView {
    pub path: String,
    pub size: u32,
    pub binary: bool,
    /// The text was cut at `max_bytes`.
    pub truncated: bool,
    pub text: String,
}

fn render(diff: &Diff<'_>, path: &str, max_bytes: usize) -> Result<FileDiff> {
    let mut out = FileDiff {
        path: path.to_string(),
        text: String::new(),
        binary: false,
        truncated: false,
    };
    for i in 0..diff.deltas().len() {
        let Some(mut patch) = Patch::from_diff(diff, i)? else {
            continue;
        };
        if patch.delta().flags().is_binary() {
            out.binary = true;
            continue;
        }
        out.text
            .push_str(&String::from_utf8_lossy(&patch.to_buf()?));
    }
    if out.text.len() > max_bytes {
        let mut cut = max_bytes;
        while !out.text.is_char_boundary(cut) {
            cut -= 1;
        }
        out.text.truncate(cut);
        out.truncated = true;
    }
    Ok(out)
}

fn options(path: &str) -> DiffOptions {
    let mut o = DiffOptions::new();
    // A literal path, so `*` in a file name is not a glob.
    o.pathspec(path)
        .disable_pathspec_match(true)
        .max_size(MAX_FILE_BYTES);
    o
}

impl Repo {
    /// The diff of one file. `max_bytes` caps the text.
    pub fn diff_file(&self, path: &str, side: DiffSide, max_bytes: usize) -> Result<FileDiff> {
        super::check_paths(&[path.to_string()])?;
        let mut o = options(path);
        let diff = match side {
            DiffSide::Staged => {
                let tree = self.repo.head().ok().and_then(|h| h.peel_to_tree().ok());
                self.repo
                    .diff_tree_to_index(tree.as_ref(), None, Some(&mut o))?
            }
            DiffSide::Unstaged => {
                o.include_untracked(true).show_untracked_content(true);
                self.repo.diff_index_to_workdir(None, Some(&mut o))?
            }
        };
        render(&diff, path, max_bytes)
    }

    fn commit_tree_diff(&self, sha: &str, o: Option<&mut DiffOptions>) -> Result<Diff<'_>> {
        let commit = self.repo.find_commit(
            git2::Oid::from_str(sha).map_err(|_| GitError::Git(format!("bad commit id: {sha}")))?,
        )?;
        let parent = commit.parent(0).ok().map(|p| p.tree()).transpose()?;
        Ok(self
            .repo
            .diff_tree_to_tree(parent.as_ref(), Some(&commit.tree()?), o)?)
    }

    /// The files that a commit changed. A merge commit shows its changes against the first parent.
    pub fn commit_files(&self, sha: &str) -> Result<Vec<FileChange>> {
        let mut diff = self.commit_tree_diff(sha, None)?;
        diff.find_similar(None)?;
        Ok(diff
            .deltas()
            .filter_map(|d| {
                let new = d.new_file().path()?.to_string_lossy().replace('\\', "/");
                let (state, old_path) = match d.status() {
                    git2::Delta::Added => (FileState::Added, None),
                    git2::Delta::Deleted => (FileState::Deleted, None),
                    git2::Delta::Renamed => (
                        FileState::Renamed,
                        d.old_file()
                            .path()
                            .map(|p| p.to_string_lossy().replace('\\', "/")),
                    ),
                    git2::Delta::Typechange => (FileState::Typechange, None),
                    _ => (FileState::Modified, None),
                };
                Some(FileChange {
                    path: new,
                    old_path,
                    state,
                })
            })
            .collect())
    }

    /// The diff of one file of a commit, against the first parent.
    pub fn commit_diff(&self, sha: &str, path: &str, max_bytes: usize) -> Result<FileDiff> {
        super::check_paths(&[path.to_string()])?;
        let mut o = options(path);
        let diff = self.commit_tree_diff(sha, Some(&mut o))?;
        render(&diff, path, max_bytes)
    }
}
