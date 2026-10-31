//! Stash pop and stash diff, the fast-forward of a branch and the state of a working copy at a
//! glance (the inspect of a linked project).

use git2::BranchType;
use serde::Serialize;
use specta::Type;

use super::Repo;
use super::diff::FileDiff;
use crate::error::{GitError, Result};

/// What a working copy holds now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Inspect {
    /// The working branch. `None` when HEAD is detached or unborn.
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    /// Files with a change: staged, not staged, new or in conflict.
    pub changes: u32,
    pub stashes: u32,
    /// The summary of the last commit.
    pub last: Option<String>,
}

/// The result of [`Repo::fast_forward`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Forward {
    UpToDate,
    Moved,
}

impl Repo {
    /// Apply a stash, then drop it. A conflict keeps the stash in the list.
    pub fn stash_pop(&mut self, id: &str) -> Result<()> {
        let index = self
            .stash_list()?
            .iter()
            .position(|s| s.id == id)
            .ok_or_else(|| GitError::Git(format!("stash not found: {id}")))?;
        self.stash_apply(index)?;
        self.stash_drop(id)
    }

    /// The tracked changes that a stash holds, one diff for each file. Its new files show only
    /// as a name (shortcut: the untracked part of a stash is not diffed; read it when a view needs it).
    pub fn stash_diff(&mut self, id: &str, max_bytes: usize) -> Result<Vec<FileDiff>> {
        if !self.stash_list()?.iter().any(|s| s.id == id) {
            return Err(GitError::Git(format!("stash not found: {id}")));
        }
        self.commit_files(id)?
            .into_iter()
            .map(|f| self.commit_diff(id, &f.path, max_bytes))
            .collect()
    }

    /// Move a local branch to the tip of its upstream when it only lags behind. The working
    /// branch needs a clean working copy. A branch with its own commits is refused.
    pub fn fast_forward(&self, name: &str) -> Result<Forward> {
        let branch = self
            .repo
            .find_branch(name, BranchType::Local)
            .map_err(|_| GitError::NoBranch(name.to_string()))?;
        let up = branch.upstream().map_err(|_| GitError::NoUpstream)?;
        let (tip, target) = match (branch.get().target(), up.get().target()) {
            (Some(a), Some(b)) => (a, b),
            _ => return Err(GitError::NoUpstream),
        };
        let (ahead, behind) = self.repo.graph_ahead_behind(tip, target)?;
        if ahead > 0 {
            return Err(GitError::Git(format!(
                "the branch {name} has its own commits: merge or rebase it instead"
            )));
        }
        if behind == 0 {
            return Ok(Forward::UpToDate);
        }
        if branch.is_head() {
            let up_name = up.name()?.unwrap_or_default().to_string();
            return match self.merge_branch(&up_name)? {
                super::MergeOutcome::UpToDate => Ok(Forward::UpToDate),
                _ => Ok(Forward::Moved),
            };
        }
        branch.into_reference().set_target(target, "fast-forward")?;
        Ok(Forward::Moved)
    }

    pub fn inspect(&mut self) -> Result<Inspect> {
        let st = self.status()?;
        let changes = [&st.staged, &st.unstaged, &st.untracked, &st.conflicted]
            .into_iter()
            .flatten()
            .map(|f| f.path.as_str())
            .collect::<std::collections::BTreeSet<_>>()
            .len() as u32;
        let last = self
            .log(0, 1)?
            .commits
            .into_iter()
            .next()
            .map(|c| c.summary);
        Ok(Inspect {
            ahead: st.ahead,
            behind: st.behind,
            branch: st.branch,
            changes,
            stashes: self.stash_list()?.len() as u32,
            last,
        })
    }
}
