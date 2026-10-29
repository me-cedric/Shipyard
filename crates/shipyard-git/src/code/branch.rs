//! Branches: list, create, switch, delete (REQ-011, REQ-012, REQ-013).
//!
//! The name rule `<type>/<area>/<kebab>` belongs to `shipyard-core`. This module only refuses
//! a name that git refuses.

use git2::{BranchType, ErrorCode, RepositoryState, build::CheckoutBuilder};
use serde::Serialize;
use specta::Type;

use super::Repo;
use crate::error::{GitError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum BranchKind {
    Local,
    Remote,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Branch {
    /// `main` for a local branch, `origin/main` for a remote one.
    pub name: String,
    pub kind: BranchKind,
    /// The working branch.
    pub is_head: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    /// Full id of the tip.
    pub tip: String,
}

impl Repo {
    /// Local branches first, then remote ones. `origin/HEAD` is left out.
    pub fn branches(&self) -> Result<Vec<Branch>> {
        let mut out = Vec::new();
        for (ty, kind) in [
            (BranchType::Local, BranchKind::Local),
            (BranchType::Remote, BranchKind::Remote),
        ] {
            for b in self.repo.branches(Some(ty))? {
                let (b, _) = b?;
                let Some(name) = b.name()?.map(str::to_string) else {
                    continue;
                };
                let Some(tip) = b.get().target() else {
                    continue; // a symbolic ref such as origin/HEAD
                };
                let up = b.upstream().ok();
                let (ahead, behind) = match up.as_ref().and_then(|u| u.get().target()) {
                    Some(r) => self.repo.graph_ahead_behind(tip, r)?,
                    None => (0, 0),
                };
                out.push(Branch {
                    name,
                    kind,
                    is_head: b.is_head(),
                    upstream: up.and_then(|u| u.name().ok().flatten().map(str::to_string)),
                    ahead: ahead as u32,
                    behind: behind as u32,
                    tip: tip.to_string(),
                });
            }
        }
        Ok(out)
    }

    /// Create a branch at HEAD and make it the working branch. The files do not change.
    pub fn create_branch(&self, name: &str) -> Result<()> {
        if !git2::Branch::name_is_valid(name)? {
            return Err(GitError::BadBranchName(name.to_string()));
        }
        if self.repo.find_branch(name, BranchType::Local).is_ok() {
            return Err(GitError::BranchExists(name.to_string()));
        }
        let head = match self.repo.head() {
            Ok(h) => h.peel_to_commit()?,
            Err(e) if e.code() == ErrorCode::UnbornBranch => {
                return Err(GitError::Git(
                    "commit once before you create a branch".into(),
                ));
            }
            Err(e) => return Err(e.into()),
        };
        self.repo.branch(name, &head, false)?;
        self.repo.set_head(&format!("refs/heads/{name}"))?;
        Ok(())
    }

    /// Switch to a local branch, or to a remote one (`origin/feat`): the remote case first
    /// creates a local branch that tracks it. Refuses with [`GitError::DirtyTree`], which names
    /// the files, when the switch would overwrite an uncommitted change.
    pub fn switch_branch(&self, name: &str) -> Result<()> {
        if self.repo.state() != RepositoryState::Clean {
            return Err(GitError::Busy(
                format!("{:?}", self.repo.state()).to_lowercase(),
            ));
        }
        let (local, remote) = match self.repo.find_branch(name, BranchType::Local) {
            Ok(_) => (name.to_string(), None),
            Err(_) => {
                self.repo
                    .find_branch(name, BranchType::Remote)
                    .map_err(|_| GitError::NoBranch(name.to_string()))?;
                let short = name.split_once('/').map_or(name, |(_, b)| b);
                if self.repo.find_branch(short, BranchType::Local).is_ok() {
                    return Err(GitError::BranchExists(short.to_string()));
                }
                (short.to_string(), Some(name))
            }
        };
        let target = match remote {
            Some(r) => self.repo.find_branch(r, BranchType::Remote)?,
            None => self.repo.find_branch(&local, BranchType::Local)?,
        };
        let commit = target.get().peel_to_commit()?;

        let mut conflicts: Vec<String> = Vec::new();
        let mut cb = CheckoutBuilder::new();
        cb.safe()
            .notify_on(git2::CheckoutNotificationType::CONFLICT)
            .notify(|_, path, _, _, _| {
                conflicts.extend(path.map(|p| p.to_string_lossy().into_owned()));
                true
            });
        let result = self.repo.checkout_tree(commit.as_object(), Some(&mut cb));
        drop(cb);
        match result {
            Ok(()) => {}
            Err(e) if e.code() == ErrorCode::Conflict => {
                return Err(GitError::DirtyTree(conflicts));
            }
            Err(e) => return Err(e.into()),
        }
        if let Some(r) = remote {
            self.repo
                .branch(&local, &commit, false)?
                .set_upstream(Some(r))?;
        }
        self.repo.set_head(&format!("refs/heads/{local}"))?;
        Ok(())
    }

    /// Delete a local branch. Refuses the working branch. Without `force` it also refuses a
    /// branch that HEAD does not contain, so no commit is lost. A forge-only branch is the
    /// forge adapter's job.
    pub fn delete_branch(&self, name: &str, force: bool) -> Result<()> {
        let mut b = self
            .repo
            .find_branch(name, BranchType::Local)
            .map_err(|_| GitError::NoBranch(name.to_string()))?;
        if b.is_head() {
            return Err(GitError::IsWorkingBranch(name.to_string()));
        }
        if !force {
            let tip = b.get().peel_to_commit()?.id();
            let head = self.repo.head()?.peel_to_commit()?.id();
            if tip != head && !self.repo.graph_descendant_of(head, tip)? {
                return Err(GitError::BranchNotMerged(name.to_string()));
            }
        }
        b.delete()?;
        Ok(())
    }
}
