//! Commit and history (REQ-007, REQ-009, REQ-010).

use std::collections::HashMap;

use git2::{BranchType, ErrorCode, Oid, RepositoryState, Sort};
use serde::Serialize;
use specta::Type;

use super::{Repo, short};
use crate::error::{GitError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum RefKind {
    Branch,
    Remote,
    Tag,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct RefLabel {
    pub name: String,
    pub kind: RefKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct CommitInfo {
    /// The full id. It is the `commit:<sha>` ref.
    pub sha: String,
    pub short: String,
    pub summary: String,
    /// The message after the summary line. Empty when there is none.
    pub description: String,
    pub author_name: String,
    pub author_email: String,
    /// Seconds since the Unix epoch.
    pub time: u32,
    pub parents: Vec<String>,
    pub labels: Vec<RefLabel>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct LogPage {
    pub commits: Vec<CommitInfo>,
    /// Older commits exist after this page. The view says that the log is cut when it is false.
    pub has_more: bool,
}

impl Repo {
    /// Commit the staged files only. The author and the committer come from the git config.
    /// Returns the full id. The summary type rules (`feat(scope): subject`) belong to the caller.
    pub fn commit(&self, summary: &str, description: &str) -> Result<String> {
        let summary = summary.trim();
        if summary.is_empty() {
            return Err(GitError::EmptySummary);
        }
        let mut index = self.repo.index()?;
        // Another process (the `git` command) may have changed the index file.
        index.read(true)?;
        if index.has_conflicts() {
            let files = index
                .conflicts()?
                .filter_map(|c| c.ok())
                .filter_map(|c| c.our.or(c.their).or(c.ancestor))
                .map(|e| String::from_utf8_lossy(&e.path).into_owned())
                .collect();
            return Err(GitError::Conflicts(files));
        }
        // A merge in progress with no conflict left ends here: the commit gets both parents.
        let merging = match self.repo.state() {
            RepositoryState::Clean => false,
            RepositoryState::Merge => true,
            s => return Err(GitError::Busy(format!("{s:?}").to_lowercase())),
        };
        let tree = self.repo.find_tree(index.write_tree()?)?;
        let parent = match self.repo.head() {
            Ok(h) => Some(h.peel_to_commit()?),
            Err(e) if e.code() == ErrorCode::UnbornBranch => None,
            Err(e) => return Err(e.into()),
        };
        if !merging && parent.as_ref().map(|p| p.tree_id()) == Some(tree.id()) {
            return Err(GitError::NothingStaged);
        }
        if parent.is_none() && tree.is_empty() {
            return Err(GitError::NothingStaged);
        }
        let sig = self.repo.signature().map_err(|_| GitError::NoIdentity)?;
        let description = description.trim();
        let message = if description.is_empty() {
            summary.to_string()
        } else {
            format!("{summary}\n\n{description}")
        };
        // `mergehead_foreach` needs `&mut`: read MERGE_HEAD, one id per line.
        let mut merge_commits = Vec::new();
        if merging {
            let text = std::fs::read_to_string(self.repo.path().join("MERGE_HEAD"))?;
            for line in text.lines().filter(|l| !l.trim().is_empty()) {
                merge_commits.push(self.repo.find_commit(Oid::from_str(line.trim())?)?);
            }
        }
        let parents: Vec<_> = parent.iter().chain(merge_commits.iter()).collect();
        let id = self
            .repo
            .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)?;
        if merging {
            self.repo.cleanup_state()?;
        }
        Ok(id.to_string())
    }

    /// The commits of the current branch, newest first. `skip` and `limit` page through the log.
    /// An unborn branch gives an empty page.
    pub fn log(&self, skip: u32, limit: u32) -> Result<LogPage> {
        let empty = LogPage {
            commits: vec![],
            has_more: false,
        };
        let Ok(head) = self.repo.head() else {
            return Ok(empty);
        };
        let Some(head) = head.target() else {
            return Ok(empty);
        };
        let labels = self.labels()?;
        let mut walk = self.repo.revwalk()?;
        walk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL)?;
        walk.push(head)?;
        let mut ids: Vec<Oid> = Vec::new();
        for id in walk.skip(skip as usize).take(limit as usize + 1) {
            ids.push(id?);
        }
        let has_more = ids.len() > limit as usize;
        ids.truncate(limit as usize);
        let commits = ids
            .into_iter()
            .map(|id| self.info(id, &labels))
            .collect::<Result<_>>()?;
        Ok(LogPage { commits, has_more })
    }

    /// One commit by full or abbreviated id, with its labels.
    pub fn commit_info(&self, sha: &str) -> Result<CommitInfo> {
        let id = self.repo.revparse_single(sha)?.peel_to_commit()?.id();
        self.info(id, &self.labels()?)
    }

    fn info(&self, id: Oid, labels: &HashMap<Oid, Vec<RefLabel>>) -> Result<CommitInfo> {
        let c = self.repo.find_commit(id)?;
        let message = c.message().unwrap_or_default();
        let (summary, description) = message.split_once("\n\n").unwrap_or((message, ""));
        let author = c.author();
        Ok(CommitInfo {
            sha: id.to_string(),
            short: short(id),
            summary: summary.trim().to_string(),
            description: description.trim().to_string(),
            author_name: author.name().unwrap_or_default().to_string(),
            author_email: author.email().unwrap_or_default().to_string(),
            time: c.time().seconds().max(0) as u32,
            parents: c.parent_ids().map(|p| p.to_string()).collect(),
            labels: labels.get(&id).cloned().unwrap_or_default(),
        })
    }

    /// Branch, remote branch and tag labels by commit id.
    fn labels(&self) -> Result<HashMap<Oid, Vec<RefLabel>>> {
        let mut map: HashMap<Oid, Vec<RefLabel>> = HashMap::new();
        let mut add = |id: Option<Oid>, name: Option<&str>, kind| {
            if let (Some(id), Some(name)) = (id, name) {
                map.entry(id).or_default().push(RefLabel {
                    name: name.to_string(),
                    kind,
                });
            }
        };
        for (ty, kind) in [
            (BranchType::Local, RefKind::Branch),
            (BranchType::Remote, RefKind::Remote),
        ] {
            for b in self.repo.branches(Some(ty))? {
                let (b, _) = b?;
                let name = b.name()?.map(str::to_string);
                if name.as_deref().is_some_and(|n| n.ends_with("/HEAD")) {
                    continue;
                }
                add(b.get().target(), name.as_deref(), kind);
            }
        }
        let mut tags: Vec<(Oid, String)> = Vec::new();
        self.repo.tag_foreach(|id, name| {
            let name = String::from_utf8_lossy(name);
            tags.push((id, name.trim_start_matches("refs/tags/").to_string()));
            true
        })?;
        for (id, name) in tags {
            // An annotated tag points at a tag object: label the commit it points at.
            let commit = self
                .repo
                .find_object(id, None)?
                .peel_to_commit()
                .map(|c| c.id());
            add(commit.ok(), Some(&name), RefKind::Tag);
        }
        Ok(map)
    }
}
