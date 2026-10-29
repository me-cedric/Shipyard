//! The contract of `shipyard_engine::ports::Git::merge_child` and `remove_child`, with an adapter
//! on temporary repositories (spec `factory` REQ-013, `delivery` REQ-025). The app writes the real
//! adapter the same way: `merge_child` commits what the child left in its worktree, then calls
//! `squash_child`. Only those two methods and `branch` are part of the contract here.

use std::fs;
use std::path::{Path, PathBuf};

use git2::{Repository, RepositoryInitOptions};
use shipyard_core::delivery::GateCheck;
use shipyard_engine::ports::{Changes, Git, Merge, PortResult, ReviewInput};
use shipyard_git::worktree::{child_branch, child_path};
use shipyard_git::{GitError, Repo};

const PROJECT: &str = "ship";
const RUN: &str = "01JRUN";

struct TempGit {
    run_dir: PathBuf,
    data: PathBuf,
}

fn e(x: GitError) -> String {
    x.to_string()
}

impl TempGit {
    fn child(&self, child: &str) -> PathBuf {
        child_path(&self.data, PROJECT, RUN, child).unwrap()
    }
}

impl Git for TempGit {
    fn merge_child(&self, run: &str, child: &str, message: &str) -> PortResult<Merge> {
        let wt = Repo::open(&self.child(child)).map_err(e)?;
        let st = wt.status().map_err(e)?;
        if !st.is_clean() {
            let paths: Vec<String> = [&st.unstaged, &st.untracked, &st.staged]
                .into_iter()
                .flatten()
                .map(|f| f.path.clone())
                .collect();
            wt.stage(&paths).map_err(e)?;
            let (summary, rest) = message.split_once('\n').unwrap_or((message, ""));
            wt.commit(summary, rest).map_err(e)?;
        }
        let branch = child_branch(run, child).map_err(e)?;
        match shipyard_git::delivery::squash_child(&self.run_dir, &branch, message) {
            Ok(_) => Ok(Merge::Clean),
            Err(GitError::Conflicts(files)) => Ok(Merge::Conflicts(files)),
            Err(err) => Err(err.to_string()),
        }
    }

    fn remove_child(&self, run: &str, child: &str) -> PortResult<()> {
        let repo = Repo::open(&self.run_dir).map_err(e)?;
        repo.child_worktree_remove(&self.data, PROJECT, run, child, false)
            .map_err(e)?;
        // A squash is not an ancestor of the run branch: the branch goes with `force`.
        repo.delete_branch(&child_branch(run, child).map_err(e)?, true)
            .map_err(e)
    }

    fn branch(&self, _run: &str) -> PortResult<String> {
        let st = Repo::open(&self.run_dir).map_err(e)?.status().map_err(e)?;
        st.branch.ok_or_else(|| "detached".into())
    }

    fn changes(&self, _: &str, _: &str) -> PortResult<Changes> {
        Err("outside this contract".into())
    }
    fn review_input(&self, _: &str, _: &str) -> PortResult<ReviewInput> {
        Err("outside this contract".into())
    }
    fn line(&self, _: &str, _: &str, _: u32) -> PortResult<Option<String>> {
        Err("outside this contract".into())
    }
    fn rename_branch(&self, _: &str, _: &str) -> PortResult<()> {
        Err("outside this contract".into())
    }
    fn commit(&self, _: &str, _: &[String], _: &str, _: &str) -> PortResult<String> {
        Err("outside this contract".into())
    }
    fn rebase(&self, _: &str, _: &str) -> PortResult<Merge> {
        Err("outside this contract".into())
    }
    fn gate(&self, _: &str, _: &[String]) -> PortResult<Vec<GateCheck>> {
        Err("outside this contract".into())
    }
    fn remove_worktrees(&self, _: &str) -> PortResult<()> {
        Err("outside this contract".into())
    }
}

fn write(dir: &Path, rel: &str, text: &str) {
    let p = dir.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn read(dir: &Path, rel: &str) -> String {
    fs::read_to_string(dir.join(rel)).unwrap()
}

/// The run folder with `a.txt` and `b.txt` committed, and two child worktrees.
fn fixture() -> (tempfile::TempDir, TempGit, Repo) {
    let tmp = tempfile::tempdir().unwrap();
    let run_dir = tmp.path().join("repo");
    fs::create_dir_all(&run_dir).unwrap();
    let mut o = RepositoryInitOptions::new();
    o.initial_head("main");
    let r = Repository::init_opts(&run_dir, &o).unwrap();
    let mut c = r.config().unwrap();
    c.set_str("user.name", "Test User").unwrap();
    c.set_str("user.email", "test@example.com").unwrap();
    let repo = Repo::open(&run_dir).unwrap();
    for (f, t) in [("a.txt", "a\n"), ("b.txt", "b\n")] {
        write(&run_dir, f, t);
        repo.stage(&[f.to_string()]).unwrap();
        repo.commit(&format!("chore: add {f}"), "").unwrap();
    }
    let git = TempGit {
        run_dir,
        data: tmp.path().join("data"),
    };
    for child in ["build-1", "build-2"] {
        repo.child_worktree_add(&git.data, PROJECT, RUN, child, None)
            .unwrap();
    }
    (tmp, git, repo)
}

fn tip(git: &TempGit) -> (String, usize) {
    let r = Repository::open(&git.run_dir).unwrap();
    let c = r.head().unwrap().peel_to_commit().unwrap();
    (c.id().to_string(), c.parent_count())
}

const MSG_1: &str = "feat(build): add the thing (build-1)";
const MSG_2: &str = "feat(build): add the thing (build-2)";

#[test]
fn it_commits_what_the_child_left_then_squashes_one_commit() {
    let (_tmp, git, repo) = fixture();
    let (before, _) = tip(&git);
    // Left in the worktree: one change in a tracked file and one new file, both uncommitted.
    let wt = git.child("build-1");
    write(&wt, "a.txt", "a changed\n");
    write(&wt, "src/new.rs", "fn main() {}\n");

    assert_eq!(git.merge_child(RUN, "build-1", MSG_1), Ok(Merge::Clean));

    let (after, parents) = tip(&git);
    assert_ne!(after, before);
    assert_eq!(parents, 1, "one commit for the child, no merge commit");
    assert_eq!(read(&git.run_dir, "a.txt"), "a changed\n");
    assert_eq!(read(&git.run_dir, "src/new.rs"), "fn main() {}\n");
    assert!(repo.status().unwrap().is_clean(), "the run folder is clean");
    // The leftovers are on the child branch: nothing stays only in the worktree.
    assert!(Repo::open(&wt).unwrap().status().unwrap().is_clean());
    // A second call for the same child changes nothing (a retry after a click).
    assert_eq!(git.merge_child(RUN, "build-1", MSG_1), Ok(Merge::Clean));
    assert_eq!(tip(&git).0, after);
}

#[test]
fn a_conflict_names_the_files_and_leaves_the_run_folder_as_it_was() {
    let (_tmp, git, repo) = fixture();
    write(&git.child("build-1"), "a.txt", "from one\n");
    write(&git.child("build-2"), "a.txt", "from two\n");
    write(&git.child("build-2"), "other.txt", "x\n");

    assert_eq!(git.merge_child(RUN, "build-1", MSG_1), Ok(Merge::Clean));
    let joined = tip(&git);
    assert_eq!(
        git.merge_child(RUN, "build-2", MSG_2),
        Ok(Merge::Conflicts(vec!["a.txt".into()]))
    );
    assert_eq!(tip(&git), joined);
    assert_eq!(read(&git.run_dir, "a.txt"), "from one\n");
    assert!(!git.run_dir.join("other.txt").exists());
    assert!(repo.status().unwrap().is_clean());
    // The child keeps its work for a person to fix.
    assert_eq!(read(&git.child("build-2"), "other.txt"), "x\n");
}

#[test]
fn children_join_in_call_order() {
    let (_tmp, git, _repo) = fixture();
    write(&git.child("build-1"), "one.txt", "1\n");
    write(&git.child("build-2"), "two.txt", "2\n");
    git.merge_child(RUN, "build-1", MSG_1).unwrap();
    git.merge_child(RUN, "build-2", MSG_2).unwrap();
    let r = Repository::open(&git.run_dir).unwrap();
    let head = r.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head.summary().unwrap(), Some(MSG_2));
    assert_eq!(head.parent(0).unwrap().summary().unwrap(), Some(MSG_1));
}

#[test]
fn a_message_that_is_not_conventional_is_an_error_and_changes_nothing() {
    let (_tmp, git, _repo) = fixture();
    write(&git.child("build-1"), "one.txt", "1\n");
    let before = tip(&git);
    let err = git
        .merge_child(RUN, "build-1", "add the thing")
        .unwrap_err();
    assert!(err.contains("type"), "{err}");
    assert_eq!(tip(&git), before);
}

#[test]
fn remove_child_drops_the_worktree_and_the_branch_and_a_new_child_starts_from_the_run() {
    let (_tmp, git, repo) = fixture();
    write(&git.child("build-1"), "one.txt", "1\n");
    git.merge_child(RUN, "build-1", MSG_1).unwrap();
    git.remove_child(RUN, "build-1").unwrap();
    assert!(!git.child("build-1").exists());
    let branch = child_branch(RUN, "build-1").unwrap();
    assert!(
        Repository::open(&git.run_dir)
            .unwrap()
            .find_branch(&branch, git2::BranchType::Local)
            .is_err()
    );
    // A fix round: the same child id starts again from the run branch, with the joined change.
    repo.child_worktree_add(&git.data, PROJECT, RUN, "build-1", None)
        .unwrap();
    assert_eq!(read(&git.child("build-1"), "one.txt"), "1\n");
    // The run folder is the one the engine asks about.
    assert_eq!(git.branch(RUN), Ok("main".into()));
}
