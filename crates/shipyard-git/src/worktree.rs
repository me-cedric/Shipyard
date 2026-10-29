//! Linked worktrees for the factory: one working copy per run (MASTER-PLAN section 6).
//!
//! A child run has one deterministic worktree under the app data folder (`child_*`).
//! The main working copy is not listed. Removing a worktree deletes its folder but keeps its
//! branch, because a pull request may still use the branch.

use std::path::{Path, PathBuf};

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

/// An id becomes a folder and a branch part: plain characters only, never `.`-led or `-`-led.
fn check_id(id: &str) -> Result<()> {
    check_name(id).map_err(|_| GitError::BadPath(id.to_string()))
}

/// `<data>/worktrees/<project>/<run>/<child>`: the same ids always give the same folder, so a
/// retry after a crash finds the work again.
pub fn child_path(data_dir: &Path, project: &str, run: &str, child: &str) -> Result<PathBuf> {
    for id in [project, run, child] {
        check_id(id)?;
    }
    Ok(data_dir
        .join("worktrees")
        .join(project)
        .join(run)
        .join(child))
}

/// The git worktree name `<run>.<child>`. A run id holds no `.`, so the run is the prefix.
pub fn child_name(run: &str, child: &str) -> Result<String> {
    check_id(run)?;
    check_id(child)?;
    if run.contains('.') {
        return Err(GitError::BadPath(run.to_string()));
    }
    Ok(format!("{run}.{child}"))
}

/// The branch of a child: `shipyard/<run>/<child>`. Not the run's pull request branch.
pub fn child_branch(run: &str, child: &str) -> Result<String> {
    check_id(run)?;
    check_id(child)?;
    Ok(format!("shipyard/{run}/{child}"))
}

impl Repo {
    /// The worktree of one child run, created at [`child_path`] on [`child_branch`]. A new branch
    /// starts at `base` (HEAD when `None`). A second call for the same child returns the first
    /// worktree as it is. A folder that is not that worktree is an error.
    pub fn child_worktree_add(
        &self,
        data_dir: &Path,
        project: &str,
        run: &str,
        child: &str,
        base: Option<&str>,
    ) -> Result<WorktreeInfo> {
        let path = child_path(data_dir, project, run, child)?;
        let name = child_name(run, child)?;
        if let Some(found) = self.worktrees()?.into_iter().find(|w| w.name == name) {
            let same = |a: &Path, b: &Path| match (a.canonicalize(), b.canonicalize()) {
                (Ok(a), Ok(b)) => a == b,
                _ => a == b,
            };
            return if same(Path::new(&found.path), &path) {
                Ok(found)
            } else {
                Err(GitError::Git(format!(
                    "worktree {name} is at {}",
                    found.path
                )))
            };
        }
        self.worktree_add(&name, &path, &child_branch(run, child)?, base)
    }

    /// Remove the worktree of one child, then its empty parent folders (up to the project folder).
    /// Refuses a dirty worktree unless `force`. The branch stays.
    pub fn child_worktree_remove(
        &self,
        data_dir: &Path,
        project: &str,
        run: &str,
        child: &str,
        force: bool,
    ) -> Result<()> {
        let path = child_path(data_dir, project, run, child)?;
        self.worktree_remove(&child_name(run, child)?, force)?;
        // `remove_dir` only deletes an empty folder: nothing else is lost.
        let _ = std::fs::remove_dir(&path);
        if let Some(run_dir) = path.parent() {
            let _ = std::fs::remove_dir(run_dir);
        }
        Ok(())
    }

    /// Remove every child worktree of a run. A dirty one stays (unless `force`) and the call
    /// fails after it tried them all, with the names of the ones it kept.
    pub fn run_worktrees_remove(
        &self,
        data_dir: &Path,
        project: &str,
        run: &str,
        force: bool,
    ) -> Result<()> {
        check_id(run)?;
        let prefix = format!("{run}.");
        let mut kept = Vec::new();
        for wt in self.worktrees()? {
            let Some(child) = wt.name.strip_prefix(&prefix) else {
                continue;
            };
            match self.child_worktree_remove(data_dir, project, run, child, force) {
                Ok(()) => {}
                Err(GitError::WorktreeDirty(_)) => kept.push(wt.name.clone()),
                Err(e) => return Err(e),
            }
        }
        if kept.is_empty() {
            Ok(())
        } else {
            Err(GitError::WorktreeDirty(kept.join(", ")))
        }
    }
}
