//! Git operations of the delivery flow (spec `delivery`, REQ-007, REQ-008, REQ-015, REQ-025).
//!
//! They run on the worktree of a run: rename the branch that a tool named, rebase onto the
//! base, commit only the files of the run, push the run's own branch. Worktree removal after
//! the merge is `Repo::child_worktree_remove` (it refuses a dirty tree).

use std::path::Path;

use git2::build::CheckoutBuilder;
use git2::{BranchType, Direction, Index, IndexEntry, IndexTime};
use shipyard_core::code::{check_branch_name, check_summary};

pub use shipyard_core::delivery::is_tool_branch;

use crate::auth::{Auth, proxy_options};
use crate::code::{PullOutcome, Repo, check_paths};
use crate::error::{GitError, Result};

/// Branches that a run never pushes to, whatever the base is.
const PROTECTED: [&str; 4] = ["main", "master", "develop", "trunk"];

fn is_protected(branch: &str, base: &str) -> bool {
    // `base` can be a remote tracking name: `origin/develop`.
    branch == base
        || base.ends_with(&format!("/{branch}"))
        || PROTECTED.contains(&branch)
        || branch.starts_with("release/")
}

/// The summary follows `<type>(<scope>): <subject>`. No line of the message is an AI
/// attribution (REQ-008).
fn check_message(summary: &str, description: &str) -> Result<()> {
    check_summary(summary).map_err(|e| GitError::BadSummary(e.message()))?;
    let attribution = format!("{summary}\n{description}").lines().any(|l| {
        let l = l.trim().to_lowercase();
        l.starts_with("co-authored-by:") || l.contains("generated with") || l.contains('\u{1F916}')
    });
    if attribution {
        return Err(GitError::BadSummary(
            "the message holds an AI attribution line".into(),
        ));
    }
    Ok(())
}

/// Squash-merge `child_branch` into the branch of the worktree `run_worktree`: one new commit
/// with `message` and one parent, that holds the whole change of the child. Returns its id, or
/// `None` when the child brings nothing. See [`Repo::squash_child`].
pub fn squash_child(
    run_worktree: &Path,
    child_branch: &str,
    message: &str,
) -> Result<Option<String>> {
    Repo::open(run_worktree)?.squash_child(child_branch, message)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PushMode {
    /// Never forces: a rewritten branch is rejected.
    Plain,
    /// Force, but only when the remote branch is still the one this side last saw
    /// (`--force-with-lease`). Never a plain force.
    ForceWithLease,
}

impl Repo {
    /// Rename the working branch to `new` and return the old name. `new` follows
    /// `<type>/<area>/<kebab>`. A branch that has an upstream stays as it is: the remote branch
    /// would stay behind under the old name (REQ-007: rename before the first push).
    pub fn rename_branch(&self, new: &str) -> Result<String> {
        check_branch_name(new).map_err(|_| GitError::BadBranchName(new.to_string()))?;
        let head = self.repo.head().map_err(|_| GitError::Detached)?;
        if !head.is_branch() {
            return Err(GitError::Detached);
        }
        let old = head.shorthand()?.to_string();
        if old == new {
            return Ok(old);
        }
        if self.repo.find_branch(new, BranchType::Local).is_ok() {
            return Err(GitError::BranchExists(new.to_string()));
        }
        let mut branch = git2::Branch::wrap(head);
        if branch.upstream().is_ok() {
            return Err(GitError::BranchPublished(old));
        }
        // libgit2 moves HEAD with the branch it renames.
        branch.rename(new, false)?;
        Ok(old)
    }

    /// Rebase the working branch onto `base` (a local branch, a remote tracking branch or any
    /// revision). A branch that holds the base already is left alone. A conflict aborts the
    /// rebase and leaves the branch as it was. A tracked file with a change refuses it.
    pub fn rebase_onto(&self, base: &str) -> Result<PullOutcome> {
        self.check_state()?;
        let head = self.repo.head().map_err(|_| GitError::Detached)?;
        if !head.is_branch() {
            return Err(GitError::Detached);
        }
        let refname = head.name()?.to_string();
        self.check_tracked_clean()?;
        let target = self
            .repo
            .revparse_single(base)
            .map_err(|_| GitError::NoBranch(base.to_string()))?
            .peel_to_commit()?;
        let up = self.repo.find_annotated_commit(target.id())?;
        self.integrate(&refname, &up)
    }

    /// Squash-merge the local branch `child_branch` into the working branch (`factory` REQ-013:
    /// the join of the child worktrees). The commit has the working branch tip as its only parent,
    /// so the history keeps one commit for each child. `message` is the whole commit message: its
    /// first line follows `<type>(<scope>): <subject>` and no line is an AI attribution.
    ///
    /// `None`: the child adds nothing (already merged, or an empty change). A conflict is
    /// `GitError::Conflicts` with the files; the branch, the index and the folder stay as they
    /// were. A tracked file with a change refuses the merge (`DirtyTree`).
    pub fn squash_child(&self, child_branch: &str, message: &str) -> Result<Option<String>> {
        let (summary, description) = message.split_once('\n').unwrap_or((message, ""));
        check_message(summary, description)?;
        self.check_state()?;
        let head = self.repo.head().map_err(|_| GitError::Detached)?;
        if !head.is_branch() {
            return Err(GitError::Detached);
        }
        self.check_tracked_clean()?;
        let ours = head.peel_to_commit()?;
        let theirs = self
            .repo
            .find_branch(child_branch, BranchType::Local)
            .map_err(|_| GitError::NoBranch(child_branch.to_string()))?
            .get()
            .peel_to_commit()?;
        if ours.id() == theirs.id() || self.repo.graph_descendant_of(ours.id(), theirs.id())? {
            return Ok(None);
        }
        // In memory: a conflict touches nothing.
        let mut merged = self.repo.merge_commits(&ours, &theirs, None)?;
        if merged.has_conflicts() {
            let files = merged
                .conflicts()?
                .filter_map(|c| c.ok())
                .filter_map(|c| c.our.or(c.their).or(c.ancestor))
                .map(|e| String::from_utf8_lossy(&e.path).into_owned())
                .collect();
            return Err(GitError::Conflicts(files));
        }
        let tree = self.repo.find_tree(merged.write_tree_to(&self.repo)?)?;
        if tree.id() == ours.tree_id() {
            return Ok(None);
        }
        let sig = self.repo.signature().map_err(|_| GitError::NoIdentity)?;
        // The folder and the index take the new tree, then the branch moves: a refusal of the
        // checkout (an untracked file in the way) leaves the branch where it was.
        self.repo
            .checkout_tree(tree.as_object(), Some(CheckoutBuilder::new().safe()))?;
        let id = self
            .repo
            .commit(Some("HEAD"), &sig, &sig, message.trim(), &tree, &[&ours])?;
        Ok(Some(id.to_string()))
    }

    /// Commit the given files, and only them (REQ-008). Another staged file, a change in
    /// another file and an untracked file stay as they are. A path that no longer exists is a
    /// deletion. The commit is built from HEAD plus the working copy content of `paths`, so the
    /// index of the person or the tool does not matter.
    pub fn commit_scope(
        &self,
        paths: &[String],
        summary: &str,
        description: &str,
    ) -> Result<String> {
        check_paths(paths)?;
        if paths.is_empty() {
            return Err(GitError::NothingStaged);
        }
        check_message(summary, description)?;
        self.check_state()?;
        let parent = self.repo.head()?.peel_to_commit()?;
        let parent_tree = parent.tree()?;
        let mut scoped = Index::new()?;
        scoped.read_tree(&parent_tree)?;
        for p in paths {
            let full = self.workdir().join(p);
            match std::fs::symlink_metadata(&full) {
                Ok(meta) if meta.is_dir() => return Err(GitError::BadPath(p.clone())),
                Ok(meta) => {
                    let (mode, data) = file_content(&full, &meta)?;
                    let entry = IndexEntry {
                        ctime: IndexTime::new(0, 0),
                        mtime: IndexTime::new(0, 0),
                        dev: 0,
                        ino: 0,
                        mode,
                        uid: 0,
                        gid: 0,
                        file_size: data.len() as u32,
                        id: self.repo.blob(&data)?,
                        flags: 0,
                        flags_extended: 0,
                        path: p.clone().into_bytes(),
                    };
                    scoped.add(&entry)?;
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    // Not in HEAD either: nothing to remove.
                    let _ = scoped.remove(Path::new(p), 0);
                }
                Err(e) => return Err(e.into()),
            }
        }
        let tree_id = scoped.write_tree_to(&self.repo)?;
        if tree_id == parent_tree.id() {
            return Err(GitError::NothingStaged);
        }
        let tree = self.repo.find_tree(tree_id)?;
        let sig = self.repo.signature().map_err(|_| GitError::NoIdentity)?;
        let description = description.trim();
        let message = if description.is_empty() {
            summary.trim().to_string()
        } else {
            format!("{}\n\n{description}", summary.trim())
        };
        let id = self
            .repo
            .commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])?;
        // The real index follows for these paths only, so they do not show as changed.
        let mut index = self.repo.index()?;
        index.read(true)?;
        for p in paths {
            if self.workdir().join(p).symlink_metadata().is_ok() {
                index.add_path(Path::new(p))?;
            } else {
                let _ = index.remove_path(Path::new(p));
            }
        }
        index.write()?;
        Ok(id.to_string())
    }

    /// Push the working branch to the same name on `remote` (REQ-015). It never goes to `base`,
    /// to a default branch name or to `release/*`, and never to another name.
    ///
    /// `ForceWithLease` is `git push --force-with-lease`: the remote tip must equal the remote
    /// tracking ref (or the branch must be absent on both sides). Then it forces. The caller
    /// asks for the approval first (REQ-015 asks for one even when `push` is on).
    ///
    /// shortcut: the lease is a read of the advertised refs, then the push, on two connections.
    /// Git's own flag does the same check on the client. Move to a server side `--force-if-includes`
    /// style check only if a forge adds one.
    pub fn push_run_branch(
        &self,
        remote: &str,
        base: &str,
        mode: PushMode,
        auth: &Auth,
    ) -> Result<()> {
        let head = self.repo.head().map_err(|_| GitError::Detached)?;
        if !head.is_branch() {
            return Err(GitError::Detached);
        }
        let branch = head.shorthand()?.to_string();
        if is_protected(&branch, base) {
            return Err(GitError::ProtectedBranch(branch));
        }
        let name = format!("refs/heads/{branch}");
        let refspec = match mode {
            PushMode::Plain => format!("{name}:{name}"),
            PushMode::ForceWithLease => {
                self.check_lease(remote, &branch, auth)?;
                format!("+{name}:{name}")
            }
        };
        self.push_refspec(remote, &refspec, auth)?;
        self.ensure_upstream(remote, &branch)
    }

    fn check_lease(&self, remote: &str, branch: &str, auth: &Auth) -> Result<()> {
        let name = format!("refs/heads/{branch}");
        let expected = self
            .repo
            .find_reference(&format!("refs/remotes/{remote}/{branch}"))
            .ok()
            .and_then(|r| r.target());
        let mut r = self.repo.find_remote(remote)?;
        let conn = r
            .connect_auth(
                Direction::Push,
                Some(auth.callbacks(self.repo.config()?)),
                Some(proxy_options()),
            )
            .map_err(|e| auth.scrub(e))?;
        let advertised = conn
            .list()?
            .iter()
            .find(|h| h.name() == name)
            .map(|h| h.oid());
        if advertised == expected {
            Ok(())
        } else {
            Err(GitError::PushRejected(
                "lease: the remote branch moved since the last fetch".into(),
            ))
        }
    }
}

/// The index mode and the bytes of a file or a symlink.
fn file_content(path: &Path, meta: &std::fs::Metadata) -> Result<(u32, Vec<u8>)> {
    if meta.file_type().is_symlink() {
        let target = std::fs::read_link(path)?;
        return Ok((0o120000, target.to_string_lossy().into_owned().into_bytes()));
    }
    #[cfg(unix)]
    let exec = {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    };
    #[cfg(not(unix))]
    let exec = false;
    Ok((if exec { 0o100755 } else { 0o100644 }, std::fs::read(path)?))
}
