//! Stash: push, list, apply, drop (REQ-006). Untracked files are included.
//!
//! libgit2 needs `&mut Repository` for stashes, so these methods take `&mut self`.

use git2::{StashApplyOptions, StashFlags};
use serde::Serialize;
use specta::Type;

use super::Repo;
use super::conflict::conflict_paths;
use crate::error::{GitError, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Stash {
    /// Position in the list: 0 is the newest. A drop moves the ones after it.
    pub index: u32,
    pub message: String,
    pub id: String,
}

impl Repo {
    /// Save the working copy and the untracked files, then clean the working copy. Refuses
    /// when there is nothing to save. Returns the stash id.
    pub fn stash_push(&mut self, message: Option<&str>) -> Result<String> {
        let sig = self.repo.signature().map_err(|_| GitError::NoIdentity)?;
        let message = message.map(str::trim).filter(|m| !m.is_empty());
        let id = self
            .repo
            .stash_save2(&sig, message, Some(StashFlags::INCLUDE_UNTRACKED))?;
        Ok(id.to_string())
    }

    /// The stashes, newest first.
    pub fn stash_list(&mut self) -> Result<Vec<Stash>> {
        let mut out = Vec::new();
        self.repo.stash_foreach(|index, message, id| {
            out.push(Stash {
                index: index as u32,
                message: message.to_string(),
                id: id.to_string(),
            });
            true
        })?;
        Ok(out)
    }

    /// Apply a stash. The stash stays in the list: drop it after a good apply. A conflict gives
    /// [`GitError::Conflicts`]; the files then show in [`Repo::conflicts`].
    pub fn stash_apply(&mut self, index: usize) -> Result<()> {
        let mut o = StashApplyOptions::new();
        let applied = self.repo.stash_apply(index, Some(&mut o));
        let files = conflict_paths(&self.fresh_index()?)?;
        if !files.is_empty() {
            return Err(GitError::Conflicts(files));
        }
        Ok(applied?)
    }

    /// Drop the stash with commit id `id`. The list can move between a person's click and this
    /// call (another stash, another tool), so a position would drop the wrong one.
    pub fn stash_drop(&mut self, id: &str) -> Result<()> {
        let index = self
            .stash_list()?
            .iter()
            .position(|s| s.id == id)
            .ok_or_else(|| GitError::Git(format!("stash not found: {id}")))?;
        self.repo.stash_drop(index)?;
        Ok(())
    }
}
