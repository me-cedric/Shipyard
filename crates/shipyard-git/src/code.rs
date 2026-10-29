//! Working copy operations with `git2` (spec `code`, REQ-001 to REQ-016).
//!
//! Each call opens or reuses one [`Repo`]. A `Repo` is not `Sync`: open one per call or per task.

use std::path::{Component, Path};

use git2::Repository;

use crate::error::{GitError, Result};

mod branch;
mod commit;
mod diff;
mod remote;
mod status;

pub use branch::{Branch, BranchKind};
pub use commit::{CommitInfo, LogPage, RefKind, RefLabel};
pub use diff::{DiffSide, FileDiff};
pub use remote::PullOutcome;
pub use status::{Changes, FileChange, FileState};

pub struct Repo {
    pub(crate) repo: Repository,
}

impl Repo {
    /// Open the working copy whose root is `path`.
    pub fn open(path: &Path) -> Result<Self> {
        Self::wrap(Repository::open(path), path)
    }

    /// Open the working copy that holds `path`, searching the parent folders.
    pub fn discover(path: &Path) -> Result<Self> {
        Self::wrap(Repository::discover(path), path)
    }

    fn wrap(r: std::result::Result<Repository, git2::Error>, path: &Path) -> Result<Self> {
        let repo = r.map_err(|_| GitError::NotARepo(path.display().to_string()))?;
        if repo.is_bare() {
            return Err(GitError::NotARepo(format!("{} is bare", path.display())));
        }
        Ok(Self { repo })
    }

    pub fn workdir(&self) -> &Path {
        self.repo.workdir().expect("bare repositories are refused")
    }
}

/// Paths that stay inside the working copy: relative, with no `..`.
pub(crate) fn check_paths(paths: &[String]) -> Result<()> {
    for p in paths {
        let bad = p.is_empty()
            || Path::new(p)
                .components()
                .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir));
        if bad {
            return Err(GitError::BadPath(p.clone()));
        }
    }
    Ok(())
}

/// The first 7 characters of a commit id.
pub(crate) fn short(id: git2::Oid) -> String {
    id.to_string().chars().take(7).collect()
}
