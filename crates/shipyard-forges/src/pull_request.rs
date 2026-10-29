//! Pull request writes and feedback reads for the delivery flow (spec `delivery`, REQ-011 to
//! REQ-013, REQ-016, REQ-019, REQ-021) on GitHub, GitLab and Azure DevOps.
//!
//! The caller checks the write switches and asks for approvals first (`add-factory` REQ-025,
//! REQ-026). A call here sends its write. The calls only add: no label, reviewer or thread is
//! removed, and a label is never created. The shape of the draft title on GitLab, the merge
//! state mapping and the create bodies come from Legacy (`infrastructure/pulls`).

mod azure;
mod github;
mod gitlab;

use crate::{CiState, Forge, ForgeError, PullRequest, PullState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use shipyard_http::Response;

/// The input of [`PullApi::create_pull`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewPull {
    pub title: String,
    pub body: String,
    pub source: String,
    pub target: String,
    /// A run opens a draft (REQ-013). A person marks it ready.
    pub draft: bool,
}

/// What [`PullApi::add_labels`] did.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Labeled {
    /// Added, in the spelling of the forge.
    pub applied: Vec<String>,
    /// Wanted, but the forge has no such label. Nothing created it.
    pub missing: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ThreadComment {
    pub author: String,
    pub body: String,
}

/// A review conversation on a line or a file. A plain comment and a system message are not one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviewThread {
    /// GitHub thread node id, GitLab discussion id, Azure DevOps thread id. Opaque: pass it back.
    pub id: String,
    pub resolved: bool,
    pub path: Option<String>,
    pub line: Option<u32>,
    /// Oldest first. The first one is the review remark.
    pub comments: Vec<ThreadComment>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Mergeable {
    Clean,
    Conflict,
    /// A rule stops the merge: review, checks, draft, behind.
    Blocked,
    /// The forge has not computed it yet.
    Unknown,
}

/// The three facts that place a `PROpen` run (REQ-021), plus the merge state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PullStatus {
    pub state: PullState,
    pub draft: bool,
    /// [`CiState::None`] for a pull request that is not open.
    pub ci: CiState,
    pub changes_requested: bool,
    pub mergeable: Mergeable,
    pub head_sha: String,
}

pub trait PullApi: Forge {
    /// The open pull request of a source branch (REQ-016). `None` when none is open: a merged or
    /// a closed one is not returned.
    fn find_pull(&self, repo: &str, branch: &str) -> Result<Option<PullRequest>, ForgeError>;

    fn create_pull(&self, repo: &str, new: &NewPull) -> Result<PullRequest, ForgeError>;

    fn mark_ready(&self, repo: &str, number: u64) -> Result<(), ForgeError>;

    /// The labels that exist. Azure DevOps has no label list: it gives the labels in use on the
    /// last 100 pull requests of the repository.
    fn labels(&self, repo: &str) -> Result<Vec<String>, ForgeError>;

    /// Add labels that [`PullApi::labels`] listed. The caller uses [`PullApi::add_labels`].
    fn apply_labels(&self, repo: &str, number: u64, labels: &[String]) -> Result<(), ForgeError>;

    /// Add the labels that exist (REQ-011). It creates none and removes none. A name matches
    /// without regard to case.
    fn add_labels(
        &self,
        repo: &str,
        number: u64,
        wanted: &[String],
    ) -> Result<Labeled, ForgeError> {
        let out = split_labels(&self.labels(repo)?, wanted);
        if !out.applied.is_empty() {
            self.apply_labels(repo, number, &out.applied)?;
        }
        Ok(out)
    }

    /// Request reviewers. A reviewer is a login (GitHub), a username (GitLab) or an identity
    /// id (Azure DevOps). It keeps the reviewers that are already there.
    fn add_reviewers(
        &self,
        repo: &str,
        number: u64,
        reviewers: &[String],
    ) -> Result<(), ForgeError>;

    fn threads(&self, repo: &str, number: u64) -> Result<Vec<ReviewThread>, ForgeError>;

    fn reply_thread(
        &self,
        repo: &str,
        number: u64,
        thread: &str,
        body: &str,
    ) -> Result<(), ForgeError>;

    fn resolve_thread(&self, repo: &str, number: u64, thread: &str) -> Result<(), ForgeError>;

    /// Draft, CI, change request and merge state (REQ-021).
    fn status(&self, repo: &str, number: u64) -> Result<PullStatus, ForgeError>;
}

pub(crate) fn check_new(new: &NewPull) -> Result<(), ForgeError> {
    let cfg = |m: &str| Err(ForgeError::Config(m.to_string()));
    if new.title.trim().is_empty() {
        return cfg("a pull request needs a title");
    }
    if new.source.trim().is_empty() || new.target.trim().is_empty() {
        return cfg("a pull request needs a source branch and a target branch");
    }
    if new.source == new.target {
        return cfg("a pull request cannot go into its own branch");
    }
    Ok(())
}

pub(crate) fn check_branch(branch: &str) -> Result<(), ForgeError> {
    if branch.trim().is_empty() {
        return Err(ForgeError::Config("a branch name is empty".into()));
    }
    Ok(())
}

pub(crate) fn check_reply(body: &str) -> Result<(), ForgeError> {
    if body.trim().is_empty() {
        return Err(ForgeError::Config("a reply needs some text".into()));
    }
    Ok(())
}

/// The open pull request of the branch, or `None`. A merged or closed one is no target for a
/// push or a thread reply: the caller opens a new one.
pub(crate) fn prefer_open(found: Vec<PullRequest>) -> Option<PullRequest> {
    found.into_iter().find(|p| p.state == PullState::Open)
}

pub(crate) fn split_labels(existing: &[String], wanted: &[String]) -> Labeled {
    let mut out = Labeled::default();
    for w in wanted {
        let w = w.trim();
        match existing.iter().find(|e| e.eq_ignore_ascii_case(w)) {
            Some(e) if !out.applied.contains(e) => out.applied.push(e.clone()),
            Some(_) => {}
            None if !w.is_empty() && !out.missing.iter().any(|m| m == w) => {
                out.missing.push(w.to_string());
            }
            None => {}
        }
    }
    out
}

/// A write answer: JSON, or `Null` when the forge sends no body (204).
pub(crate) fn json_or_null(res: Response) -> Result<Value, ForgeError> {
    if res.body.iter().all(u8::is_ascii_whitespace) {
        Ok(Value::Null)
    } else {
        Ok(res.json()?)
    }
}

pub(crate) fn line(v: &Value, pointer: &str) -> Option<u32> {
    shipyard_http::num(v, pointer).and_then(|n| u32::try_from(n).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pr(number: u64, state: PullState) -> PullRequest {
        PullRequest {
            number,
            title: String::new(),
            state,
            draft: false,
            author: String::new(),
            source_branch: "b".into(),
            target_branch: "main".into(),
            head_sha: String::new(),
            url: String::new(),
            updated: String::new(),
        }
    }

    #[test]
    fn only_an_open_pull_request_is_found() {
        let closed = pr(3, PullState::Closed);
        let merged = pr(2, PullState::Merged);
        assert!(prefer_open(vec![closed.clone(), merged.clone()]).is_none());
        let found = prefer_open(vec![closed, pr(1, PullState::Open), merged]);
        assert_eq!(found.map(|p| p.number), Some(1));
    }
}
