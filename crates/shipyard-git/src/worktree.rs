//! Linked worktrees for the factory: one working copy per run (MASTER-PLAN section 6).
//!
//! The main working copy is not listed. Removing a worktree deletes its folder but keeps its
//! branch, because a pull request may still use the branch.

use std::path::Path;

use git2::{
    BranchType, Repository, Worktree, WorktreeAddOptions, WorktreeLockStatus, WorktreePruneOptions,
};
use serde::Serialize;
use specta::Type;

use crate::code::Repo;
use crate::error::{GitError, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    /// `None` on a detached HEAD.
    pub branch: Option<String>,
    pub locked: bool,
}

fn info(wt: &Worktree) -> WorktreeInfo {
    let branch = Repository::open_from_worktree(wt).ok().and_then(|r| {
        r.head()
            .ok()
            .filter(|h| h.is_branch())
            .and_then(|h| h.shorthand().ok().map(str::to_string))
    });
    WorktreeInfo {
        name: wt.name().ok().flatten().unwrap_or_default().to_string(),
        path: wt.path().display().to_string(),
        branch,
        locked: matches!(wt.is_locked(), Ok(WorktreeLockStatus::Locked(_))),
    }
}

/// The name becomes a folder under `.git/worktrees`: keep it plain.
fn check_name(name: &str) -> Result<()> {
    let ok = !name.is_empty()
        && !name.starts_with(['-', '.'])
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if ok {
        Ok(())
    } else {
        Err(GitError::BadPath(name.to_string()))
    }
}

impl Repo {
    /// Add a worktree at `path` (it must not exist) on `branch`. A missing branch starts at
    /// `base` (any revision; HEAD when `None`). An existing branch is used as it is.
    pub fn worktree_add(
        &self,
        name: &str,
        path: &Path,
        branch: &str,
        base: Option<&str>,
    ) -> Result<WorktreeInfo> {
        check_name(name)?;
        if path.exists() {
            return Err(GitError::Git(format!(
                "worktree path exists: {}",
                path.display()
            )));
        }
        if !git2::Branch::name_is_valid(branch)? {
            return Err(GitError::BadBranchName(branch.to_string()));
        }
        let b = match self.repo.find_branch(branch, BranchType::Local) {
            Ok(b) => b,
            Err(_) => {
                let commit = self
                    .repo
                    .revparse_single(base.unwrap_or("HEAD"))?
                    .peel_to_commit()?;
                self.repo.branch(branch, &commit, false)?
            }
        };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| GitError::Git(e.to_string()))?;
        }
        let reference = b.into_reference();
        let mut opts = WorktreeAddOptions::new();
        opts.reference(Some(&reference));
        let wt = self.repo.worktree(name, path, Some(&opts))?;
        Ok(info(&wt))
    }

    /// The linked worktrees.
    pub fn worktrees(&self) -> Result<Vec<WorktreeInfo>> {
        let mut out = Vec::new();
        for name in self.repo.worktrees()?.iter() {
            if let Some(name) = name? {
                out.push(info(&self.repo.find_worktree(name)?));
            }
        }
        Ok(out)
    }

    /// Delete a worktree folder and its git data. Refuses a worktree with any uncommitted change
    /// or untracked file, unless `force` is true. `force` also removes a locked worktree.
    pub fn worktree_remove(&self, name: &str, force: bool) -> Result<()> {
        let wt = self
            .repo
            .find_worktree(name)
            .map_err(|_| GitError::NoWorktree(name.to_string()))?;
        if !force {
            // A worktree that cannot be opened cannot be checked: refuse, `force` overrides.
            let repo = Repository::open_from_worktree(&wt).map_err(|e| {
                GitError::WorktreeDirty(format!("cannot check {name}: {}", e.message()))
            })?;
            let changes = Repo { repo }.status()?;
            if !changes.is_clean() {
                let files: Vec<_> = [
                    &changes.staged,
                    &changes.unstaged,
                    &changes.untracked,
                    &changes.conflicted,
                ]
                .into_iter()
                .flatten()
                .map(|f| f.path.clone())
                .collect();
                return Err(GitError::WorktreeDirty(files.join(", ")));
            }
        }
        let mut opts = WorktreePruneOptions::new();
        opts.valid(true).working_tree(true).locked(force);
        wt.prune(Some(&mut opts))?;
        Ok(())
    }
}
