//! What each assistant mode may do (spec `assistant`, REQ-007 to REQ-009). Ask and plan run the
//! runner read only, in the project folder. Agent mode runs in a worktree of its own: one for each
//! thread, kept until the person acts on it (Q-047). The person picks the permission level
//! (Q-049): it maps to the allowed tools.

use std::path::{Path, PathBuf};

use shipyard_core::assistant::{Thread, ThreadSettings, Worktree};
use shipyard_git::code::{FileDiff, Repo};

use crate::AgentError;
use shipyard_core::assistant::Permission;

use crate::runner::{Approval, Mode, RunSpec};

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
    if settings.writes() {
        spec.approval = match settings.permission {
            Permission::Auto => Approval::Edits,
            Permission::Bypass => Approval::Bypass,
            _ => Approval::Ask,
        };
    }
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
        kept: Vec::new(),
    });
    Ok(info.path.into())
}

fn all_diffs(w: &Worktree) -> Result<Vec<FileDiff>, AgentError> {
    Repo::open(Path::new(&w.path))
        .and_then(|r| r.file_diffs_since(&w.base, MAX_DIFF))
        .map_err(git)
}

/// A file and its diff as one entry of `Worktree::kept`. FNV-1a: it needs to tell two texts
/// apart, nothing more.
fn kept_entry(d: &FileDiff) -> String {
    let hash = d.text.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
    });
    format!("{}\t{hash:x}", d.path)
}

/// The files that the thread changed in its worktree and that the person has not kept, with their
/// diffs (REQ-009). A kept file whose diff changed since comes back.
pub fn diff(w: &Worktree) -> Result<Vec<FileDiff>, AgentError> {
    Ok(all_diffs(w)?
        .into_iter()
        .filter(|d| !w.kept.contains(&kept_entry(d)))
        .collect())
}

/// Keep the change of one file, or of every file in the review with `None` (REQ-002 of
/// `code-host-tickets`). The file stays changed in the worktree and leaves the review list.
pub fn keep(w: &mut Worktree, path: Option<&str>) -> Result<(), AgentError> {
    let all = all_diffs(w)?;
    let wanted: Vec<&FileDiff> = match path {
        Some(p) => vec![
            all.iter()
                .find(|d| d.path == p)
                .ok_or_else(|| AgentError::Run(format!("{p} has no change to keep")))?,
        ],
        None => all.iter().collect(),
    };
    for d in wanted {
        let entry = kept_entry(d);
        if !w.kept.contains(&entry) {
            w.kept.retain(|k| !k.starts_with(&format!("{}\t", d.path)));
            w.kept.push(entry);
        }
    }
    Ok(())
}

/// Revert one file to its state at the base of the thread: the content that the project had, or
/// no file when the agent made it. The other files stay. The change leaves the kept list.
///
/// shortcut: a renamed file reverts its new path only; its old path stays deleted. Revert both
/// paths if a thread shows renames often.
pub fn undo_file(w: &mut Worktree, path: &str) -> Result<(), AgentError> {
    Repo::open(Path::new(&w.path))
        .and_then(|r| r.restore_path(&w.base, path))
        .map_err(git)?;
    w.kept.retain(|k| !k.starts_with(&format!("{path}\t")));
    Ok(())
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
