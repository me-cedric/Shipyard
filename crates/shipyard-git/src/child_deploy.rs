//! Deploy to a child project in a local clone (spec `extensions`, REQ-015 to REQ-018): a new
//! branch and one commit. Nothing here pushes (Q-051 option 1): the person pushes and opens the
//! pull request in Code. The clone itself is `project::clone_repo`, and the caller runs it only
//! after a click.

use std::path::Path;

use git2::{IndexAddOption, Repository, StatusOptions};

fn msg(e: git2::Error) -> String {
    e.message().to_string()
}

/// Create `branch` at HEAD and switch to it. It refuses a clone with changes (the commit would
/// take them), a branch that exists and a bad name.
pub fn branch_new(clone: &Path, branch: &str) -> Result<(), String> {
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
    let head = repo.head().map_err(msg)?.peel_to_commit().map_err(msg)?;
    repo.branch(branch, &head, false).map_err(msg)?;
    // The new branch holds the commit of the working tree: no checkout is needed.
    repo.set_head(&format!("refs/heads/{branch}")).map_err(msg)
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
