//! Delivery: the adapters that give the factory its ports over the real crates, the approvals
//! and the pull request rows (spec `delivery` T018, `factory` REQ-025, REQ-026).
//!
//! - [`Folders`] is `Workspaces` and `Git`: one linked worktree for each run (the run folder, on
//!   a branch with a tool prefix that delivery renames before the first push) and one for each
//!   child of a `worktree` step. They sit under `<app data>/worktrees/<project>/<run>/`, never in
//!   the working copy of the person.
//! - [`ForgePulls`] is `Pulls` and [`ProjectWriter`] is `Writer`: they build the connection
//!   adapter for each call, like the sync adapters, so a new secret applies at once.
//!
//! An error is a message that a person can read. A write that the factory sends here already
//! passed its switch or a click: these adapters never ask again.

use std::collections::BTreeSet;
use std::fmt::Display;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use shipyard_core::delivery::{GateCheck, Lane, lane};
use shipyard_core::pickup::PrState;
use shipyard_core::run::RunState;
use shipyard_core::workflow::Workspace;
use shipyard_engine::approvals::Write;
use shipyard_engine::ports::{
    Branches, Changes, FailedCheck, Git, Merge, PortResult, Pulls, ReviewInput, Thread, Workspaces,
    Writer,
};
use shipyard_forges::{CheckState, NewPull};
use shipyard_git::code::{BranchKind, PullOutcome};
use shipyard_git::delivery::PushMode;
use shipyard_git::worktree::{child_branch, child_name, child_path};
use shipyard_git::{GitError, Repo};
use shipyard_store::pr::{PrRow, Review, rows, runs_of};
use specta::Type;

use crate::commands::sync::{active, forge_source};
use tauri::AppHandle;

use crate::commands::{AppState, Res, blocking, err};
use crate::connections::Connections;

/// The child id of the run folder. A step child is `<step>-<n>` or the step id.
const RUN_CHILD: &str = "run";
/// The longest diff that a reviewer gets, in bytes.
const MAX_DIFF: usize = 200_000;
/// The spec files that a reviewer gets, and the size of each.
const MAX_SPECS: usize = 40;
const MAX_SPEC_BYTES: usize = 20_000;
/// A gate command that runs longer than this is a red gate.
const GATE_LIMIT: Duration = Duration::from_secs(15 * 60);
/// How much of the end of a gate output the counts keep.
const GATE_TAIL: usize = 200;
/// The names of the tool branches that a run starts on are `<runner>/<run>`.
const NO_FORGE: &str = "the project names no forge connection";

fn e(x: impl Display) -> String {
    x.to_string()
}

// ---------------------------------------------------------------- folders: Workspaces and Git

/// The folders of the runs of one project.
pub struct Folders {
    /// The working copy of the project. The worktrees hang off its repository.
    pub root: PathBuf,
    /// The app data folder.
    pub data: PathBuf,
    pub project: String,
    /// The runner of the factory. Its id is the prefix of the run branch.
    pub runner: String,
    /// The base branch that `project.yaml` declares.
    pub declared_base: Option<String>,
    /// The folder of the spec files, from the paths of `project.yaml`.
    pub specs: String,
    /// The secret values that a digest prompt must not carry.
    pub secrets: Vec<String>,
}

impl Folders {
    fn main(&self) -> PortResult<Repo> {
        Repo::open(&self.root).map_err(e)
    }

    /// The run folder. Its name holds the run id, so no two runs share one.
    pub fn run_path(&self, run: &str) -> PortResult<PathBuf> {
        child_path(&self.data, &self.project, run, RUN_CHILD).map_err(e)
    }

    fn run_repo(&self, run: &str) -> PortResult<Repo> {
        Repo::open(&self.run_path(run)?).map_err(e)
    }

    /// The files that the run changed against its base, one diff for each (`factory` REQ-028).
    /// shortcut: the base is where the run started (`start_rev`), not a base that a pull request
    /// later fixed. Fix when a run can change its base.
    pub fn run_diff(
        &self,
        run: &str,
        max_bytes: usize,
    ) -> PortResult<Vec<shipyard_git::code::FileDiff>> {
        let repo = self.run_repo(run)?;
        let rev = self.start_rev(&repo);
        repo.file_diffs_since(&rev, max_bytes).map_err(e)
    }

    /// The branch names of the repository, with the remote prefix cut, no duplicate.
    fn names(repo: &Repo) -> PortResult<BTreeSet<String>> {
        Ok(repo
            .branches()
            .map_err(e)?
            .into_iter()
            .map(|b| match b.kind {
                BranchKind::Local => b.name,
                BranchKind::Remote => b
                    .name
                    .split_once('/')
                    .map_or(b.name.clone(), |(_, n)| n.into()),
            })
            .collect())
    }

    /// The revision of a base name: the remote tracking branch when it exists (it is the one that
    /// a fetch keeps fresh), else the local branch.
    fn rev(repo: &Repo, base: &str) -> PortResult<String> {
        let all: BTreeSet<String> = repo
            .branches()
            .map_err(e)?
            .into_iter()
            .map(|b| b.name)
            .collect();
        let remote = format!("origin/{base}");
        if all.contains(&remote) {
            Ok(remote)
        } else if all.contains(base) {
            Ok(base.into())
        } else {
            Err(format!(
                "the base branch `{base}` does not exist in the repository"
            ))
        }
    }

    /// Where a new run branch starts: the declared base, else `develop`, `main` or `master`, else
    /// HEAD. shortcut: a repository with another default branch starts from HEAD.
    fn start_rev(&self, repo: &Repo) -> String {
        let declared = self.declared_base.iter().map(String::as_str);
        declared
            .chain(["develop", "main", "master"])
            .find_map(|b| Self::rev(repo, b).ok())
            .unwrap_or_else(|| "HEAD".into())
    }

    /// The run folder, made at the first use. A second call returns the same folder (a restart).
    fn run_folder(&self, run: &str) -> PortResult<PathBuf> {
        let path = self.run_path(run)?;
        if path.exists() {
            return Ok(path);
        }
        let repo = self.main()?;
        let branch = format!("{}/{run}", self.runner);
        let name = child_name(run, RUN_CHILD).map_err(e)?;
        let start = self.start_rev(&repo);
        repo.worktree_add(&name, &path, &branch, Some(&start))
            .map_err(e)?;
        Ok(path)
    }

    /// Commit what a child left in its worktree, as one commit with `message`.
    fn commit_child(&self, run: &str, child: &str, message: &str) -> PortResult<()> {
        let path = child_path(&self.data, &self.project, run, child).map_err(e)?;
        let wt = Repo::open(&path).map_err(e)?;
        let st = wt.status().map_err(e)?;
        if st.is_clean() {
            return Ok(());
        }
        let paths: Vec<String> = [&st.unstaged, &st.untracked, &st.staged]
            .into_iter()
            .flatten()
            .map(|f| f.path.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        wt.stage(&paths).map_err(e)?;
        let (summary, rest) = message.split_once('\n').unwrap_or((message, ""));
        wt.commit(summary, rest).map_err(e)?;
        Ok(())
    }
}

impl Workspaces for Folders {
    fn dir(&self, run: &str, workspace: Workspace, child: Option<&str>) -> PortResult<PathBuf> {
        match (workspace, child) {
            (Workspace::None, _) => {
                let path = child_path(&self.data, &self.project, run, "none").map_err(e)?;
                std::fs::create_dir_all(&path).map_err(e)?;
                Ok(path)
            }
            (Workspace::Worktree, Some(child)) => {
                // A child starts from the run branch, so the join is a squash onto it.
                let base = self.run_repo_branch(run)?;
                let repo = self.main()?;
                repo.child_worktree_add(&self.data, &self.project, run, child, Some(&base))
                    .map(|w| PathBuf::from(w.path))
                    .map_err(e)
            }
            _ => self.run_folder(run),
        }
    }
}

impl Folders {
    /// The branch of the run folder, made when it is missing.
    fn run_repo_branch(&self, run: &str) -> PortResult<String> {
        self.run_folder(run)?;
        Git::branch(self, run)
    }
}

impl Git for Folders {
    fn merge_child(&self, run: &str, child: &str, message: &str) -> PortResult<Merge> {
        self.commit_child(run, child, message)?;
        let branch = child_branch(run, child).map_err(e)?;
        match shipyard_git::delivery::squash_child(&self.run_path(run)?, &branch, message) {
            Ok(_) => Ok(Merge::Clean),
            Err(GitError::Conflicts(files)) => Ok(Merge::Conflicts(files)),
            Err(x) => Err(e(x)),
        }
    }

    fn remove_child(&self, run: &str, child: &str) -> PortResult<()> {
        let repo = self.main()?;
        repo.child_worktree_remove(&self.data, &self.project, run, child, false)
            .map_err(e)?;
        // A squash is not an ancestor of the run branch: the branch goes with `force`.
        repo.delete_branch(&child_branch(run, child).map_err(e)?, true)
            .map_err(e)
    }

    fn changes(&self, run: &str, base: &str) -> PortResult<Changes> {
        let repo = self.run_repo(run)?;
        let st = repo.status().map_err(e)?;
        let uncommitted = [&st.staged, &st.unstaged, &st.untracked]
            .into_iter()
            .flatten()
            .map(|f| f.path.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let rev = Self::rev(&repo, base)?;
        let mut files = repo.changed_since(&rev).map_err(e)?;
        files.sort();
        files.dedup();
        Ok(Changes { uncommitted, files })
    }

    fn review_input(&self, run: &str, base: &str) -> PortResult<ReviewInput> {
        let repo = self.run_repo(run)?;
        let rev = Self::rev(&repo, base)?;
        Ok(ReviewInput {
            head: repo.head_sha().map_err(e)?,
            diff: repo.diff_since(&rev, MAX_DIFF).map_err(e)?,
            specs: repo
                .files_at(&rev, &self.specs, MAX_SPECS, MAX_SPEC_BYTES)
                .map_err(e)?,
        })
    }

    /// One agent turn for each run (Q-079). A run with no change has no digest.
    fn digest(&self, run: &str, base: &str) -> PortResult<Option<String>> {
        let repo = self.run_repo(run)?;
        let rev = Self::rev(&repo, base)?;
        if repo.changed_since(&rev).map_err(e)?.is_empty() {
            return Ok(None);
        }
        let scratch = self.data.join("scratch").join(format!("digest-{run}"));
        let out = crate::code::digest_of(
            &self.runner,
            scratch,
            &self.run_path(run)?,
            &rev,
            &self.secrets,
        );
        out.map(Some)
    }

    fn line(&self, run: &str, path: &str, line: u32) -> PortResult<Option<String>> {
        self.run_repo(run)?.line(path, line).map_err(e)
    }

    fn branch(&self, run: &str) -> PortResult<String> {
        self.run_repo(run)?
            .status()
            .map_err(e)?
            .branch
            .ok_or_else(|| "the run folder is on a detached HEAD".into())
    }

    fn rename_branch(&self, run: &str, new: &str) -> PortResult<()> {
        self.run_repo(run)?
            .rename_branch(new)
            .map(|_| ())
            .map_err(e)
    }

    fn commit(
        &self,
        run: &str,
        paths: &[String],
        summary: &str,
        description: &str,
    ) -> PortResult<String> {
        self.run_repo(run)?
            .commit_scope(paths, summary, description)
            .map_err(e)
    }

    fn rebase(&self, run: &str, base: &str) -> PortResult<Merge> {
        let repo = self.run_repo(run)?;
        let rev = Self::rev(&repo, base)?;
        match repo.rebase_onto(&rev) {
            Ok(PullOutcome::UpToDate | PullOutcome::FastForwarded) => Ok(Merge::Clean),
            Ok(PullOutcome::Rebased) => Ok(Merge::Rewrote),
            Err(GitError::Conflicts(files)) => Ok(Merge::Conflicts(files)),
            Err(x) => Err(e(x)),
        }
    }

    fn gate(&self, run: &str, commands: &[String]) -> PortResult<Vec<GateCheck>> {
        let dir = self.run_path(run)?;
        let log = self.data.join("gates");
        std::fs::create_dir_all(&log).map_err(e)?;
        Ok(commands
            .iter()
            .enumerate()
            .map(|(n, c)| run_gate(&dir, &log.join(format!("{run}-{n}.log")), c, GATE_LIMIT))
            .collect())
    }

    fn remove_worktrees(&self, run: &str) -> PortResult<()> {
        let none = child_path(&self.data, &self.project, run, "none").map_err(e)?;
        let _ = std::fs::remove_dir_all(none);
        self.main()?
            .run_worktrees_remove(&self.data, &self.project, run, false)
            .map_err(e)
    }
}

/// The process ids of the gate commands that run now: the shutdown of the app kills them.
static LIVE_GATES: Mutex<BTreeSet<u32>> = Mutex::new(BTreeSet::new());

fn live_gates() -> std::sync::MutexGuard<'static, BTreeSet<u32>> {
    LIVE_GATES.lock().unwrap_or_else(|e| e.into_inner())
}

/// Kill every gate command that runs, with its children (the app quits).
pub fn kill_gates() {
    for pid in std::mem::take(&mut *live_gates()) {
        shipyard_agents::runner::kill_group(pid);
    }
}

/// One gate command, in the run folder. The output goes to a file, so a chatty command cannot
/// fill a pipe and hang. The counts are the last line of the output. The shell leads its own
/// process group: a timeout or a shutdown kills the command and its children (`kill_group`).
pub(crate) fn run_gate(dir: &Path, log: &Path, command: &str, limit: Duration) -> GateCheck {
    let fail = |counts: String| GateCheck {
        command: command.into(),
        passed: false,
        counts,
    };
    let Ok(out) = std::fs::File::create(log) else {
        return fail("the gate could not write its output".into());
    };
    let Ok(err_out) = out.try_clone() else {
        return fail("the gate could not write its output".into());
    };
    let (sh, flag) = if cfg!(windows) {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };
    let mut cmd = Command::new(sh);
    cmd.arg(flag)
        .arg(command)
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(out)
        .stderr(err_out);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(x) => return fail(format!("the gate did not start: {x}")),
    };
    let pid = child.id();
    live_gates().insert(pid);
    let start = Instant::now();
    let passed = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) if start.elapsed() >= limit => {
                live_gates().remove(&pid);
                shipyard_agents::runner::kill_group(pid);
                let _ = child.kill();
                let _ = child.wait();
                let _ = std::fs::remove_file(log);
                return fail(format!("timeout after {} s", limit.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(x) => {
                live_gates().remove(&pid);
                return fail(format!("the gate failed: {x}"));
            }
        }
    };
    // The shell ended. Its group may hold a child that it left: kill it too.
    if live_gates().remove(&pid) {
        shipyard_agents::runner::kill_group(pid);
    }
    let text = std::fs::read_to_string(log).unwrap_or_default();
    let _ = std::fs::remove_file(log);
    let last = text
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("");
    let mut counts: String = last
        .trim()
        .chars()
        .rev()
        .take(GATE_TAIL)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    if counts.is_empty() {
        counts = if passed {
            "no output"
        } else {
            "failed, no output"
        }
        .into();
    }
    GateCheck {
        command: command.into(),
        passed,
        counts,
    }
}

// ---------------------------------------------------------------- forge reads: Pulls

/// The forge reads of one project.
pub struct ForgePulls {
    pub conns: Arc<Connections>,
    /// The connection id and the repository slug. `None`: the project has no forge.
    pub forge: Option<(String, String)>,
    pub root: PathBuf,
}

impl ForgePulls {
    fn api(&self) -> PortResult<(Box<dyn shipyard_forges::PullApi>, &str)> {
        let (id, repo) = self.forge.as_ref().ok_or(NO_FORGE)?;
        Ok((self.conns.pull_api(id)?, repo))
    }
}

impl Pulls for ForgePulls {
    fn branches(&self) -> PortResult<Branches> {
        let (api, repo) = self.api()?;
        let default = api.repository(repo).map_err(e)?.default_branch;
        let mut names = Folders::names(&Repo::open(&self.root).map_err(e)?)?;
        names.insert(default.clone());
        Ok(Branches {
            names: names.into_iter().collect(),
            default,
        })
    }

    fn labels(&self) -> PortResult<Vec<String>> {
        let (api, repo) = self.api()?;
        api.labels(repo).map_err(e)
    }

    fn find(&self, branch: &str) -> PortResult<Option<u64>> {
        let (api, repo) = self.api()?;
        Ok(api.find_pull(repo, branch).map_err(e)?.map(|p| p.number))
    }

    fn failed_checks(&self, number: u64) -> PortResult<Vec<FailedCheck>> {
        let (api, repo) = self.api()?;
        Ok(api
            .ci_status(repo, number)
            .map_err(e)?
            .checks
            .into_iter()
            .filter(|c| c.state == CheckState::Failing)
            // shortcut: the forge adapter gives no log tail.
            .map(|c| FailedCheck {
                name: c.name,
                url: c.url,
                tail: None,
            })
            .collect())
    }

    fn threads(&self, number: u64) -> PortResult<Vec<Thread>> {
        let (api, repo) = self.api()?;
        Ok(api
            .threads(repo, number)
            .map_err(e)?
            .into_iter()
            .filter(|t| !t.resolved)
            .map(|t| Thread {
                id: t.id,
                path: t.path,
                line: t.line,
                text: t
                    .comments
                    .iter()
                    .map(|c| format!("{}: {}", c.author, c.body))
                    .collect::<Vec<_>>()
                    .join("\n"),
            })
            .collect())
    }
}

// ---------------------------------------------------------------- writes: Writer

/// The writes of one project: the tracker, the push and the pull request.
pub struct ProjectWriter {
    pub conns: Arc<Connections>,
    pub tracker: String,
    pub forge: Option<(String, String)>,
    pub folders: Arc<Folders>,
}

impl ProjectWriter {
    fn api(&self) -> PortResult<(Box<dyn shipyard_forges::PullApi>, &str)> {
        let (id, repo) = self.forge.as_ref().ok_or(NO_FORGE)?;
        Ok((self.conns.pull_api(id)?, repo))
    }
}

impl Writer for ProjectWriter {
    fn can_comment(&self) -> bool {
        self.conns
            .tracker_write(&self.tracker)
            .is_ok_and(|t| t.capabilities().comments)
    }

    fn send(&self, write: &Write) -> PortResult<String> {
        match write {
            Write::Transition { key, status } => {
                self.conns
                    .tracker_write(&self.tracker)?
                    .transition(key, status)
                    .map_err(e)?;
                Ok(String::new())
            }
            Write::Labels { key, labels } => {
                // shortcut: the tracker adapters can add a label and cannot remove one, so a label
                // of an earlier state stays on the ticket. Add each label that is not there yet.
                let t = self.conns.tracker_write(&self.tracker)?;
                let have = t.get(key).map_err(e)?.labels;
                for l in labels.iter().filter(|l| !have.contains(l)) {
                    t.add_label(key, l).map_err(e)?;
                }
                Ok(String::new())
            }
            Write::Comment { key, body } => self
                .conns
                .tracker_write(&self.tracker)?
                .add_comment(key, body)
                .map_err(e),
            Write::Push {
                run,
                branch,
                base,
                force_with_lease,
            } => {
                let repo = self.folders.run_repo(run)?;
                // The approval names this branch: push it and nothing else.
                let head = repo.status().map_err(e)?.branch;
                if head.as_deref() != Some(branch.as_str()) {
                    return Err(format!(
                        "the run folder is on `{}`, not on `{branch}`: nothing was pushed",
                        head.unwrap_or_default()
                    ));
                }
                let (remote, url) = repo
                    .remote()
                    .map_err(e)?
                    .ok_or("the repository has no remote")?;
                let auth = self.conns.git_auth(&url)?;
                let mode = if *force_with_lease {
                    PushMode::ForceWithLease
                } else {
                    PushMode::Plain
                };
                repo.push_run_branch(&remote, base, mode, &auth)
                    .map_err(e)?;
                Ok(String::new())
            }
            Write::OpenPr {
                run,
                branch,
                base,
                title,
                body,
                labels,
                reviewers,
                draft,
            } => {
                // The approval names this branch: open a pull request for it and nothing else,
                // and never from the base itself.
                let head = self.folders.run_repo(run)?.status().map_err(e)?.branch;
                if head.as_deref() != Some(branch.as_str()) {
                    return Err(format!(
                        "the run folder is on `{}`, not on `{branch}`: no pull request was opened",
                        head.unwrap_or_default()
                    ));
                }
                if branch == base {
                    return Err(format!(
                        "the branch `{branch}` is the base: no pull request was opened"
                    ));
                }
                let (api, repo) = self.api()?;
                let pull = api
                    .create_pull(
                        repo,
                        &NewPull {
                            title: title.clone(),
                            body: body.clone(),
                            source: branch.clone(),
                            target: base.clone(),
                            draft: *draft,
                        },
                    )
                    .map_err(e)?;
                // A missing label is no reason to lose the pull request.
                if !labels.is_empty() {
                    let _ = api.add_labels(repo, pull.number, labels);
                }
                // A retry finds the pull request by its branch and goes on, so say it all here.
                if !reviewers.is_empty() {
                    api.add_reviewers(repo, pull.number, reviewers)
                        .map_err(|x| {
                            format!(
                                "pull request #{} is open, but its reviewers failed: {x}",
                                pull.number
                            )
                        })?;
                }
                Ok(pull.number.to_string())
            }
            Write::ResolveThreads {
                run,
                threads,
                reply,
            } => {
                let (api, repo) = self.api()?;
                let branch = Git::branch(&*self.folders, run)?;
                let number = api
                    .find_pull(repo, &branch)
                    .map_err(e)?
                    .ok_or("the pull request of the run is not open")?
                    .number;
                for t in threads {
                    api.reply_thread(repo, number, t, reply).map_err(e)?;
                    api.resolve_thread(repo, number, t).map_err(e)?;
                }
                Ok(String::new())
            }
        }
    }
}

// ---------------------------------------------------------------- approvals

/// A write that waits for a person (Home / Inbox), named exactly (`factory` REQ-026).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalView {
    pub id: u32,
    pub run: String,
    /// The ticket of the run, `""` when the run is gone.
    pub key: String,
    pub title: String,
    /// `transition`, `labels`, `comment`, `push`, `open_pr` or `resolve_threads`.
    pub kind: String,
    /// One line that names the write.
    pub summary: String,
    /// The text that goes out: the comment, the pull request body, the reply.
    pub detail: String,
    /// A push that rewrites history.
    pub force: bool,
}

fn describe(w: &Write) -> (&'static str, String, String, bool) {
    match w {
        Write::Transition { key, status } => (
            "transition",
            format!("Move {key} to {status}"),
            String::new(),
            false,
        ),
        Write::Labels { key, labels } => (
            "labels",
            format!("Set the labels of {key}"),
            labels.join(", "),
            false,
        ),
        Write::Comment { key, body } => {
            ("comment", format!("Comment on {key}"), body.clone(), false)
        }
        Write::Push {
            branch,
            base,
            force_with_lease,
            ..
        } => (
            "push",
            if *force_with_lease {
                format!("Force push {branch} with lease")
            } else {
                format!("Push {branch}")
            },
            format!("Base: {base}"),
            *force_with_lease,
        ),
        Write::OpenPr {
            branch,
            base,
            title,
            body,
            reviewers,
            ..
        } => (
            "open_pr",
            format!("Open a draft pull request {branch} into {base}: {title}"),
            format!("Reviewers: {}\n\n{body}", reviewers.join(", ")),
            false,
        ),
        Write::ResolveThreads { threads, reply, .. } => (
            "resolve_threads",
            format!("Reply on and resolve {} thread(s)", threads.len()),
            reply.clone(),
            false,
        ),
    }
}

/// The approvals of the active project, oldest first.
pub fn approvals(s: &AppState) -> Res<Vec<ApprovalView>> {
    let Some(a) = active(s)? else {
        return Ok(Vec::new());
    };
    let runs = s.factory.factory.runs();
    Ok(s.factory
        .factory
        .approvals()
        .into_iter()
        .filter_map(|ap| {
            let run = runs.iter().find(|r| r.id == ap.run)?;
            if run.project != a.entry.id {
                return None;
            }
            let (kind, summary, detail, force) = describe(&ap.write);
            Some(ApprovalView {
                id: ap.id as u32,
                run: ap.run,
                key: run.key.clone(),
                title: run.title.clone(),
                kind: kind.into(),
                summary,
                detail,
                force,
            })
        })
        .collect())
}

/// A person's click: send the write. Returns what it made (a comment id, a pull request number).
pub fn approve(s: &AppState, id: u32) -> Res<Option<String>> {
    let out = s.factory.factory.approve(u64::from(id));
    s.factory.publish();
    out
}

/// A person rejects the write: it is dropped and the run blocks.
pub fn reject(s: &AppState, id: u32) -> Res<()> {
    let out = s.factory.factory.reject(u64::from(id));
    s.factory.publish();
    out
}

// ---------------------------------------------------------------- pull request rows

/// A pull request of the forge of the active project, from the mirror (`delivery` REQ-028).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PrRowView {
    /// `pr:<forge>:<number>`.
    pub reference: String,
    pub forge: String,
    pub number: u32,
    pub title: String,
    /// `open`, `closed` or `merged`.
    pub state: String,
    pub draft: bool,
    /// `none`, `pending`, `passing` or `failing`.
    pub ci: String,
    /// `clear` or `changes_requested`.
    pub review: String,
    pub head_sha: String,
    pub url: String,
    pub updated: String,
    pub lane: Lane,
    /// The runs that opened this pull request.
    pub runs: Vec<String>,
}

fn view(row: PrRow, runs: Vec<String>) -> PrRowView {
    use shipyard_core::pickup::Ci;
    let lane = match row.state {
        PrState::Open => lane(RunState::PROpen, Some(&row.signal())),
        PrState::Closed | PrState::Merged => Lane::Done,
    };
    PrRowView {
        reference: row.reference,
        forge: row.forge,
        number: row.number as u32,
        title: row.title,
        state: match row.state {
            PrState::Open => "open",
            PrState::Closed => "closed",
            PrState::Merged => "merged",
        }
        .into(),
        draft: row.draft,
        ci: match row.ci {
            Ci::None => "none",
            Ci::Pending => "pending",
            Ci::Passing => "passing",
            Ci::Failing => "failing",
        }
        .into(),
        review: match row.review {
            Review::Clear => "clear",
            Review::ChangesRequested => "changes_requested",
        }
        .into(),
        head_sha: row.head_sha,
        url: row.url,
        updated: row.updated,
        lane,
        runs,
    }
}

/// The pull request rows of the forge of the active project. No request goes out: the mirror
/// holds them.
pub fn pr_rows(s: &AppState) -> Res<Vec<PrRowView>> {
    let Some(a) = active(s)? else {
        return Ok(Vec::new());
    };
    let (Some(forge), Some(source)) = (a.forge.clone(), forge_source(&a)) else {
        return Ok(Vec::new());
    };
    if !s.sync.mirror_exists() {
        return Ok(Vec::new());
    }
    let mirror = s.sync.mirror().map_err(err)?;
    let log = s.factory.log();
    rows(&mirror, &forge, &source)
        .map_err(err)?
        .into_iter()
        .map(|row| {
            let runs = runs_of(&log, &forge, row.number).map_err(err)?;
            Ok(view(row, runs))
        })
        .collect()
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn approvals_list(app: AppHandle) -> Res<Vec<ApprovalView>> {
    blocking(app, approvals).await
}

#[tauri::command]
#[specta::specta]
pub async fn approval_approve(app: AppHandle, id: u32) -> Res<Option<String>> {
    blocking(app, move |s| approve(s, id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn approval_reject(app: AppHandle, id: u32) -> Res<()> {
    blocking(app, move |s| reject(s, id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn pulls_list(app: AppHandle) -> Res<Vec<PrRowView>> {
    blocking(app, pr_rows).await
}

#[cfg(test)]
mod tests;
