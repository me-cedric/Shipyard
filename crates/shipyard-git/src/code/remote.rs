//! Fetch, pull --rebase and push (REQ-014, REQ-015, REQ-016). Credentials and proxy come from
//! `crate::auth` only.

use std::cell::RefCell;
use std::rc::Rc;

use git2::{BranchType, ErrorCode, PushOptions, RepositoryState, build::CheckoutBuilder};
use serde::Serialize;
use specta::Type;

use super::Repo;
use crate::auth::{Auth, proxy_options};
use crate::error::{GitError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum PullOutcome {
    UpToDate,
    FastForwarded,
    Rebased,
}

/// One remote tracking branch and its tip.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct RemoteHead {
    /// `origin/main`.
    pub name: String,
    pub tip: String,
}

/// A remote branch whose tip moved between two fetches (REQ-017).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct HeadChange {
    pub name: String,
    /// `None` for a new branch.
    pub old: Option<String>,
    pub new: String,
    /// New commits. For a new branch, commits that no other remote branch holds.
    pub count: u32,
    /// Author of the new tip.
    pub author: String,
    /// Subject of the new tip.
    pub subject: String,
}

impl Repo {
    /// The remote tracking branches of `remote`, sorted by name. `origin/HEAD` is left out.
    /// Call it before and after [`Repo::fetch`], then pass both lists to [`Repo::head_changes`].
    pub fn remote_heads(&self, remote: &str) -> Result<Vec<RemoteHead>> {
        let prefix = format!("refs/remotes/{remote}/");
        let mut out = Vec::new();
        for r in self.repo.references()? {
            let r = r?;
            let (Ok(name), Some(tip)) = (r.name(), r.target()) else {
                continue; // a symbolic ref such as origin/HEAD
            };
            if let Some(short) = name
                .strip_prefix("refs/remotes/")
                .filter(|_| name.starts_with(&prefix))
            {
                out.push(RemoteHead {
                    name: short.to_string(),
                    tip: tip.to_string(),
                });
            }
        }
        out.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(out)
    }

    /// The branches of `after` whose tip differs from `before`. Empty when nothing moved, so
    /// being behind with no new push gives no notice. A branch that vanished is not listed.
    pub fn head_changes(
        &self,
        before: &[RemoteHead],
        after: &[RemoteHead],
    ) -> Result<Vec<HeadChange>> {
        let mut out = Vec::new();
        for a in after {
            let old = before.iter().find(|b| b.name == a.name);
            if old.is_some_and(|o| o.tip == a.tip) {
                continue;
            }
            let new = git2::Oid::from_str(&a.tip)?;
            let mut walk = self.repo.revwalk()?;
            walk.push(new)?;
            let hide: Vec<&str> = match old {
                Some(o) => vec![&o.tip],
                None => after
                    .iter()
                    .filter(|h| h.name != a.name)
                    .map(|h| h.tip.as_str())
                    .collect(),
            };
            for h in hide {
                // A pruned old tip cannot be hidden: the count then runs high, which is safe.
                let _ = git2::Oid::from_str(h).map(|id| walk.hide(id));
            }
            let tip = self.repo.find_commit(new)?;
            out.push(HeadChange {
                name: a.name.clone(),
                old: old.map(|o| o.tip.clone()),
                new: a.tip.clone(),
                count: walk.count() as u32,
                author: tip.author().name().unwrap_or_default().to_string(),
                subject: tip.summary().ok().flatten().unwrap_or_default().to_string(),
            });
        }
        Ok(out)
    }

    /// Fetch the heads of `remote`. It moves only the remote tracking refs: the working copy,
    /// the index and the local branches stay as they are (REQ-016).
    pub fn fetch(&self, remote: &str, auth: &Auth) -> Result<()> {
        let mut r = self.repo.find_remote(remote)?;
        let mut fo = auth.fetch_options(self.repo.config()?);
        r.fetch(&[] as &[&str], Some(&mut fo), None)
            .map_err(|e| auth.scrub(e))
    }

    /// Fetch the upstream remote of the working branch, then fast-forward it or rebase it onto
    /// the upstream. A conflict aborts the rebase and leaves the branch as it was. Refuses when
    /// a tracked file has uncommitted changes.
    pub fn pull_rebase(&self, auth: &Auth) -> Result<PullOutcome> {
        if self.repo.state() != RepositoryState::Clean {
            return Err(GitError::Busy(
                format!("{:?}", self.repo.state()).to_lowercase(),
            ));
        }
        let head = self.repo.head().map_err(|_| GitError::Detached)?;
        if !head.is_branch() {
            return Err(GitError::Detached);
        }
        let refname = head.name()?.to_string();
        let up_name = git2::Branch::wrap(head)
            .upstream()
            .map_err(|_| GitError::NoUpstream)?
            .get()
            .name()?
            .to_string();
        let remote = self.repo.branch_upstream_remote(&refname)?;
        let remote = remote.as_str()?;

        let status = self.status()?;
        let dirty: Vec<String> = [&status.staged, &status.unstaged, &status.conflicted]
            .into_iter()
            .flatten()
            .map(|f| f.path.clone())
            .collect();
        if !dirty.is_empty() {
            return Err(GitError::DirtyTree(dirty));
        }

        self.fetch(remote, auth)?;
        let up = self
            .repo
            .reference_to_annotated_commit(&self.repo.find_reference(&up_name)?)?;
        let (analysis, _) = self.repo.merge_analysis(&[&up])?;
        if analysis.is_up_to_date() {
            return Ok(PullOutcome::UpToDate);
        }
        if analysis.is_fast_forward() {
            let target = self.repo.find_object(up.id(), None)?;
            self.repo
                .checkout_tree(&target, Some(CheckoutBuilder::new().safe()))?;
            self.repo
                .find_reference(&refname)?
                .set_target(up.id(), "pull: fast-forward")?;
            return Ok(PullOutcome::FastForwarded);
        }

        let sig = self.repo.signature().map_err(|_| GitError::NoIdentity)?;
        let mut rebase = self.repo.rebase(None, Some(&up), None, None)?;
        while let Some(op) = rebase.next() {
            op?;
            let index = self.repo.index()?;
            if index.has_conflicts() {
                let files = index
                    .conflicts()?
                    .filter_map(|c| c.ok())
                    .filter_map(|c| c.our.or(c.their).or(c.ancestor))
                    .map(|e| String::from_utf8_lossy(&e.path).into_owned())
                    .collect();
                rebase.abort()?;
                return Err(GitError::Conflicts(files));
            }
            match rebase.commit(None, &sig, None) {
                Ok(_) => {}
                // The commit is already upstream: skip it.
                Err(e) if e.code() == ErrorCode::Applied => {}
                Err(e) => {
                    rebase.abort()?;
                    return Err(e.into());
                }
            }
        }
        rebase.finish(None)?;
        Ok(PullOutcome::Rebased)
    }

    /// Publish the working branch to `remote`. The refspec has no `+`: this never forces.
    /// A branch with no upstream gets `remote/<branch>` as its upstream.
    pub fn push(&self, remote: &str, auth: &Auth) -> Result<()> {
        let head = self.repo.head().map_err(|_| GitError::Detached)?;
        if !head.is_branch() {
            return Err(GitError::Detached);
        }
        let branch = head.shorthand()?.to_string();
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");

        let rejected: Rc<RefCell<Option<String>>> = Rc::default();
        let mut cb = auth.callbacks(self.repo.config()?);
        let slot = rejected.clone();
        cb.push_update_reference(move |name, status| {
            if let Some(msg) = status {
                *slot.borrow_mut() = Some(format!("{name}: {msg}"));
            }
            Ok(())
        });
        let mut po = PushOptions::new();
        po.remote_callbacks(cb);
        po.proxy_options(proxy_options());

        let mut r = self.repo.find_remote(remote)?;
        r.push(&[refspec.as_str()], Some(&mut po)).map_err(|e| {
            if e.code() == ErrorCode::NotFastForward {
                GitError::PushRejected("the remote has newer commits: pull first".into())
            } else {
                auth.scrub(e)
            }
        })?;
        if let Some(msg) = rejected.take() {
            return Err(GitError::PushRejected(msg));
        }
        let mut local = self.repo.find_branch(&branch, BranchType::Local)?;
        if local.upstream().is_err() {
            local.set_upstream(Some(&format!("{remote}/{branch}")))?;
        }
        Ok(())
    }
}
