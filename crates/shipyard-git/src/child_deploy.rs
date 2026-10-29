//! Deploy to a child project in a local clone (spec `extensions`, REQ-015 to REQ-018): a new
//! branch and one commit. Nothing here pushes (Q-051 option 1): the person pushes and opens the
//! pull request in Code. The clone itself is `project::clone_repo`, and the caller runs it only
//! after a click.

use std::path::Path;

use git2::{BranchType, IndexAddOption, Oid, Repository, StatusOptions, build::CheckoutBuilder};

fn msg(e: git2::Error) -> String {
    e.message().to_string()
}

/// Create `branch` at HEAD and switch to it. It refuses a clone with changes (the commit would
/// take them), a branch that exists and a bad name. It returns the old HEAD for `branch_drop`.
pub fn branch_new(clone: &Path, branch: &str) -> Result<String, String> {
    if !git2::Reference::is_valid_name(&format!("refs/heads/{branch}")) || branch.starts_with('-') {
        return Err(format!("invalid branch name: {branch}"));
    }
    let repo = Repository::open(clone).map_err(msg)?;
    let dirty = !repo
        .statuses(Some(StatusOptions::new().include_untracked(true)))
        .map_err(msg)?
        .is_empty();
    if dirty {
        return Err("the clone has changes".into());
    }
    let old = repo.head().map_err(msg)?;
    let before = match old.is_branch() {
        true => old.name().unwrap_or_default().to_string(),
        false => old.peel_to_commit().map_err(msg)?.id().to_string(),
    };
    let head = old.peel_to_commit().map_err(msg)?;
    repo.branch(branch, &head, false).map_err(msg)?;
    // The new branch holds the commit of the working tree: no checkout is needed.
    repo.set_head(&format!("refs/heads/{branch}"))
        .map_err(msg)?;
    Ok(before)
}

/// Undo `branch_new` after a failed deploy: go back to `before`, remove the files that the
/// deploy wrote and delete `branch`. Nothing was committed, so the clone is as it was.
pub fn branch_drop(clone: &Path, before: &str, branch: &str) -> Result<(), String> {
    let repo = Repository::open(clone).map_err(msg)?;
    match before.starts_with("refs/") {
        true => repo.set_head(before),
        false => repo.set_head_detached(Oid::from_str(before).map_err(msg)?),
    }
    .map_err(msg)?;
    repo.checkout_head(Some(CheckoutBuilder::new().force().remove_untracked(true)))
        .map_err(msg)?;
    repo.find_branch(branch, BranchType::Local)
        .and_then(|mut b| b.delete())
        .map_err(msg)
}

/// Commit every change of the working tree. Returns the commit id, or `None` when nothing changed.
pub fn commit_all(clone: &Path, message: &str) -> Result<Option<String>, String> {
    let repo = Repository::open(clone).map_err(msg)?;
    let mut index = repo.index().map_err(msg)?;
    index
        .add_all(["*"], IndexAddOption::DEFAULT, None)
        .map_err(msg)?;
    index.write().map_err(msg)?;
    let tree = repo
        .find_tree(index.write_tree().map_err(msg)?)
        .map_err(msg)?;
    let parent = repo.head().map_err(msg)?.peel_to_commit().map_err(msg)?;
    if parent.tree_id() == tree.id() {
        return Ok(None);
    }
    let who = repo
        .signature()
        .map_err(|_| "set user.name and user.email in git".to_string())?;
    let id = repo
        .commit(Some("HEAD"), &who, &who, message, &tree, &[&parent])
        .map_err(msg)?;
    Ok(Some(id.to_string()))
}
