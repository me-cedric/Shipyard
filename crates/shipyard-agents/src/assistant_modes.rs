//! What each assistant mode may do (spec `assistant`, REQ-007 to REQ-009). Ask and plan run the
//! runner read only, in the project folder. Agent mode runs in a worktree of its own: one for each
//! thread, kept until the person acts on it (Q-047). The person picks the permission level
//! (Q-049): it maps to the allowed tools.

use std::path::{Path, PathBuf};

use shipyard_core::assistant::{Thread, ThreadSettings, Worktree};
use shipyard_git::code::{FileDiff, Repo};

use crate::AgentError;
use crate::runner::{Mode, RunSpec};

/// The cap of the diff text that a turn shows.
pub const MAX_DIFF: usize = 512 * 1024;

fn git(e: impl std::fmt::Display) -> AgentError {
    AgentError::Run(e.to_string())
}

/// The run spec of a turn. Ask and plan: plan mode of the runner and the read tools, whatever
/// was granted. Agent: auto mode with the tools of the permission level plus the grants.
pub fn run_spec(
    settings: &ThreadSettings,
    granted: &[String],
    prompt: String,
    dir: &Path,
    scratch: &Path,
    session: Option<&str>,
) -> RunSpec {
    let mut spec = RunSpec::new(prompt, dir, scratch);
    spec.model = settings.model.clone();
    spec.effort = settings.effort.clone();
    spec.resume = session.map(String::from);
    spec.mode = if settings.writes() {
        Mode::Auto
    } else {
        Mode::Plan
    };
    spec.allowed_tools = settings.mode.tools(settings.permission);
    if settings.writes() {
        for g in granted {
            if !spec.allowed_tools.contains(g) {
                spec.allowed_tools.push(g.clone());
            }
        }
    }
    spec
}

/// The folder that the runner works in. Ask and plan: the project folder. Agent: the worktree of
/// the thread, made once on the first agent turn and found again after (`thread.worktree`).
pub fn workdir(data: &Path, root: &Path, thread: &mut Thread) -> Result<PathBuf, AgentError> {
    if !thread.settings.writes() {
        return Ok(root.to_path_buf());
    }
    if let Some(w) = &thread.worktree
        && Path::new(&w.path).is_dir()
    {
        return Ok(w.path.clone().into());
    }
    let repo = Repo::open(root).map_err(git)?;
    let base = repo.head_sha().map_err(git)?;
    let info = repo
        .child_worktree_add(data, &thread.project, &thread.id, "assistant", None)
        .map_err(git)?;
    thread.worktree = Some(Worktree {
        path: info.path.clone(),
        branch: info.branch.unwrap_or_default(),
        base,
    });
    Ok(info.path.into())
}

/// The files that the thread changed in its worktree, with their diffs (REQ-009).
pub fn diff(w: &Worktree) -> Result<Vec<FileDiff>, AgentError> {
    Repo::open(Path::new(&w.path))
        .and_then(|r| r.file_diffs_since(&w.base, MAX_DIFF))
        .map_err(git)
}

/// Remove the worktree of a thread. Refuses one that holds changes unless `force`: the person
/// acts on the result first.
pub fn discard(
    data: &Path,
    root: &Path,
    thread: &mut Thread,
    force: bool,
) -> Result<(), AgentError> {
    if thread.worktree.is_none() {
        return Ok(());
    }
    Repo::open(root)
        .and_then(|r| {
            r.child_worktree_remove(data, &thread.project, &thread.id, "assistant", force)
        })
        .map_err(git)?;
    thread.worktree = None;
    Ok(())
}
