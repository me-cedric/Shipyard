//! Rebase the working branch onto another branch, continue after a conflict, abort (Legacy
//! `git_rebase`, `git_rebase_continue`, `git_rebase_abort`). A force push with a lease and the
//! blame of a file live here too: both change or read history.

use std::cell::RefCell;
use std::rc::Rc;

use git2::{BranchType, Direction, ErrorCode, PushOptions, RepositoryState};
use serde::Serialize;
use specta::Type;

use super::Repo;
use crate::auth::{Auth, proxy_options};
use crate::error::{GitError, Result};

/// The result of a rebase step. With `Conflicts` the rebase stays in progress: the files show in
/// [`Repo::conflicts`], and [`Repo::rebase_abort`] ends it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum RebaseOutcome {
    UpToDate,
    Done,
    Conflicts(Vec<String>),
}

/// One line of a file with the commit that last changed it.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct BlameLine {
    pub line: u32,
    /// Full id of the commit.
    pub sha: String,
    pub author: String,
    /// Seconds since the epoch.
    pub time: f64,
}

impl Repo {
    /// Rebase the working branch onto the local or remote branch `onto`. It refuses while another
    /// operation runs and while a tracked file has a change.
    pub fn rebase_branch(&self, onto: &str) -> Result<RebaseOutcome> {
        self.check_state()?;
        self.check_tracked_clean()?;
        let head = self.repo.head().map_err(|_| GitError::Detached)?;
        if !head.is_branch() {
            return Err(GitError::Detached);
        }
        let target = [BranchType::Local, BranchType::Remote]
            .into_iter()
            .find_map(|t| self.repo.find_branch(onto, t).ok())
            .ok_or_else(|| GitError::NoBranch(onto.to_string()))?;
        let up = self.repo.reference_to_annotated_commit(target.get())?;
        let (analysis, _) = self.repo.merge_analysis(&[&up])?;
        if analysis.is_up_to_date() {
            return Ok(RebaseOutcome::UpToDate);
        }
        let mut rebase = self.repo.rebase(None, Some(&up), None, None)?;
        self.rebase_steps(&mut rebase)
    }

    /// Commit the step that a person resolved, then run the next steps.
    pub fn rebase_continue(&self) -> Result<RebaseOutcome> {
        let mut rebase = self.open_rebase()?;
        if self.repo.index()?.has_conflicts() {
            return Err(GitError::Conflicts(self.conflict_list()?));
        }
        let sig = self.repo.signature().map_err(|_| GitError::NoIdentity)?;
        match rebase.commit(None, &sig, None) {
            Ok(_) => {}
            Err(e) if e.code() == ErrorCode::Applied => {}
            Err(e) => return Err(e.into()),
        }
        self.rebase_steps(&mut rebase)
    }

    /// End a rebase in progress: the branch and the working copy go back as they were.
    pub fn rebase_abort(&self) -> Result<()> {
        Ok(self.open_rebase()?.abort()?)
    }

    fn open_rebase(&self) -> Result<git2::Rebase<'_>> {
        if !matches!(
            self.repo.state(),
            RepositoryState::RebaseMerge
                | RepositoryState::Rebase
                | RepositoryState::RebaseInteractive
        ) {
            return Err(GitError::Git("no rebase is in progress".into()));
        }
        Ok(self.repo.open_rebase(None)?)
    }

    fn conflict_list(&self) -> Result<Vec<String>> {
        let index = self.repo.index()?;
        super::conflict::conflict_paths(&index)
    }

    /// Run the steps that remain. A conflict stops here and the rebase stays in progress.
    fn rebase_steps(&self, rebase: &mut git2::Rebase<'_>) -> Result<RebaseOutcome> {
        let sig = self.repo.signature().map_err(|_| GitError::NoIdentity)?;
        while let Some(op) = rebase.next() {
            op?;
            if self.repo.index()?.has_conflicts() {
                return Ok(RebaseOutcome::Conflicts(self.conflict_list()?));
            }
            match rebase.commit(None, &sig, None) {
                Ok(_) => {}
                Err(e) if e.code() == ErrorCode::Applied => {}
                Err(e) => return Err(e.into()),
            }
        }
        rebase.finish(None)?;
        Ok(RebaseOutcome::Done)
    }

    /// Publish the working branch and replace the remote branch, but only when the remote still
    /// holds the commit that this clone last fetched (a lease): a push of a person who came
    /// after the fetch is never lost.
    pub fn push_force_with_lease(&self, remote: &str, auth: &Auth) -> Result<()> {
        let head = self.repo.head().map_err(|_| GitError::Detached)?;
        if !head.is_branch() {
            return Err(GitError::Detached);
        }
        let branch = head.shorthand()?.to_string();
        if crate::delivery::is_protected(&branch, "") {
            return Err(GitError::ProtectedBranch(branch));
        }
        let dest = format!("refs/heads/{branch}");
        let seen = self
            .repo
            .find_reference(&format!("refs/remotes/{remote}/{branch}"))
            .ok()
            .and_then(|r| r.target());
        let mut r = self.repo.find_remote(remote)?;
        let cb = auth.callbacks(self.repo.config()?);
        let live = {
            let mut conn = r
                .connect_auth(Direction::Push, Some(cb), Some(proxy_options()))
                .map_err(|e| auth.scrub(e))?;
            conn.remote()
                .list()?
                .iter()
                .find(|h| h.name() == dest)
                .map(|h| h.oid())
        };
        if live != seen {
            return Err(GitError::PushRejected(
                "the remote changed since the last fetch: fetch first".into(),
            ));
        }
        let rejected: Rc<RefCell<Option<String>>> = Rc::default();
        let slot = rejected.clone();
        let mut cb = auth.callbacks(self.repo.config()?);
        cb.push_update_reference(move |name, status| {
            if let Some(msg) = status {
                *slot.borrow_mut() = Some(format!("{name}: {msg}"));
            }
            Ok(())
        });
        let mut po = PushOptions::new();
        po.remote_callbacks(cb);
        po.proxy_options(proxy_options());
        r.push(&[format!("+{dest}:{dest}").as_str()], Some(&mut po))
            .map_err(|e| auth.scrub(e))?;
        if let Some(msg) = rejected.take() {
            return Err(GitError::PushRejected(msg));
        }
        self.ensure_upstream(remote, &branch)
    }

    /// The commit and the author of each line of `path` at HEAD.
    pub fn blame(&self, path: &str) -> Result<Vec<BlameLine>> {
        let blame = self.repo.blame_file(std::path::Path::new(path), None)?;
        let mut out = Vec::new();
        for h in blame.iter() {
            let sig = h.final_signature();
            let author = sig
                .as_ref()
                .and_then(|g| g.name().ok())
                .unwrap_or_default()
                .to_string();
            let time = sig.as_ref().map_or(0.0, |g| g.when().seconds() as f64);
            for n in 0..h.lines_in_hunk() {
                out.push(BlameLine {
                    line: (h.final_start_line() + n) as u32,
                    sha: h.final_commit_id().to_string(),
                    author: author.clone(),
                    time,
                });
            }
        }
        Ok(out)
    }
}
