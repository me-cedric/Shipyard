//! One worktree per child run (spec `factory`, REQ-013). Temporary repositories, no network.

use std::fs;
use std::path::Path;

use git2::{Repository, RepositoryInitOptions};
use shipyard_git::worktree::{child_branch, child_name, child_path};
use shipyard_git::{GitError, Repo};
use tempfile::TempDir;

fn init(dir: &Path) -> Repo {
    let mut o = RepositoryInitOptions::new();
    o.initial_head("main");
    let r = Repository::init_opts(dir, &o).unwrap();
    let mut c = r.config().unwrap();
    c.set_str("user.name", "Test User").unwrap();
    c.set_str("user.email", "test@example.com").unwrap();
    let repo = Repo::open(dir).unwrap();
    fs::write(dir.join("a.txt"), "a\n").unwrap();
    repo.stage(&["a.txt".to_string()]).unwrap();
    repo.commit("chore: base", "").unwrap();
    repo
}

#[test]
fn path_and_names_are_deterministic() {
    let data = Path::new("/data");
    assert_eq!(
        child_path(data, "web", "01RUN", "build-1").unwrap(),
        Path::new("/data/worktrees/web/01RUN/build-1")
    );
    assert_eq!(child_name("01RUN", "build-1").unwrap(), "01RUN.build-1");
    assert_eq!(
        child_branch("01RUN", "build-1").unwrap(),
        "shipyard/01RUN/build-1"
    );
}

#[test]
fn an_id_that_leaves_its_folder_is_refused() {
    let data = Path::new("/data");
    for bad in ["", "..", "a/b", "../x", ".hidden", "a b", "-x"] {
        assert!(child_path(data, "web", "01RUN", bad).is_err(), "{bad}");
        assert!(child_path(data, bad, "01RUN", "c").is_err(), "{bad}");
    }
    // The run id is the prefix of a worktree name: a dot would blur the split.
    assert!(child_name("01.RUN", "c").is_err());
}

#[test]
fn a_child_gets_its_own_folder_and_branch() {
    let tmp = TempDir::new().unwrap();
    let repo = init(&tmp.path().join("repo"));
    let data = tmp.path().join("data");

    let one = repo
        .child_worktree_add(&data, "web", "RUN1", "one", None)
        .unwrap();
    let two = repo
        .child_worktree_add(&data, "web", "RUN1", "two", None)
        .unwrap();

    assert_ne!(one.path, two.path);
    assert!(Path::new(&one.path).join("a.txt").exists());
    assert_eq!(one.branch.as_deref(), Some("shipyard/RUN1/one"));
    assert_eq!(two.branch.as_deref(), Some("shipyard/RUN1/two"));
    assert_eq!(repo.worktrees().unwrap().len(), 2);
}

#[test]
fn a_child_starts_at_the_given_base() {
    let tmp = TempDir::new().unwrap();
    let repo = init(&tmp.path().join("repo"));
    let first = repo.log(0, 1).unwrap().commits[0].sha.clone();
    fs::write(repo.workdir().join("b.txt"), "b\n").unwrap();
    repo.stage(&["b.txt".to_string()]).unwrap();
    repo.commit("chore: second", "").unwrap();

    let wt = repo
        .child_worktree_add(&tmp.path().join("data"), "web", "RUN1", "old", Some(&first))
        .unwrap();
    assert!(!Path::new(&wt.path).join("b.txt").exists());
}

#[test]
fn adding_the_same_child_again_returns_the_first_worktree() {
    let tmp = TempDir::new().unwrap();
    let repo = init(&tmp.path().join("repo"));
    let data = tmp.path().join("data");
    let first = repo
        .child_worktree_add(&data, "web", "RUN1", "one", None)
        .unwrap();
    // A retry after a crash finds the worktree and the work in it.
    fs::write(Path::new(&first.path).join("work.txt"), "w\n").unwrap();
    let again = repo
        .child_worktree_add(&data, "web", "RUN1", "one", None)
        .unwrap();
    assert_eq!(first, again);
    assert!(Path::new(&again.path).join("work.txt").exists());
    assert_eq!(repo.worktrees().unwrap().len(), 1);
}

#[test]
fn a_folder_that_is_not_a_worktree_blocks_the_add() {
    let tmp = TempDir::new().unwrap();
    let repo = init(&tmp.path().join("repo"));
    let data = tmp.path().join("data");
    let path = child_path(&data, "web", "RUN1", "one").unwrap();
    fs::create_dir_all(&path).unwrap();
    assert!(
        repo.child_worktree_add(&data, "web", "RUN1", "one", None)
            .is_err()
    );
}

#[test]
fn a_clean_child_is_removed_with_its_folder_and_keeps_its_branch() {
    let tmp = TempDir::new().unwrap();
    let repo = init(&tmp.path().join("repo"));
    let data = tmp.path().join("data");
    let wt = repo
        .child_worktree_add(&data, "web", "RUN1", "one", None)
        .unwrap();

    repo.child_worktree_remove(&data, "web", "RUN1", "one", false)
        .unwrap();

    assert!(!Path::new(&wt.path).exists());
    assert!(repo.worktrees().unwrap().is_empty());
    let branches = repo.branches().unwrap();
    assert!(branches.iter().any(|b| b.name == "shipyard/RUN1/one"));
    // The empty run folder goes too.
    assert!(!data.join("worktrees/web/RUN1").exists());
}

#[test]
fn a_dirty_child_stays_unless_forced() {
    let tmp = TempDir::new().unwrap();
    let repo = init(&tmp.path().join("repo"));
    let data = tmp.path().join("data");
    let wt = repo
        .child_worktree_add(&data, "web", "RUN1", "one", None)
        .unwrap();
    fs::write(Path::new(&wt.path).join("wip.txt"), "wip\n").unwrap();

    let err = repo
        .child_worktree_remove(&data, "web", "RUN1", "one", false)
        .unwrap_err();
    assert!(matches!(err, GitError::WorktreeDirty(ref f) if f.contains("wip.txt")));
    assert!(Path::new(&wt.path).join("wip.txt").exists());

    repo.child_worktree_remove(&data, "web", "RUN1", "one", true)
        .unwrap();
    assert!(!Path::new(&wt.path).exists());
}

#[test]
fn removing_a_run_removes_clean_children_and_names_the_dirty_ones() {
    let tmp = TempDir::new().unwrap();
    let repo = init(&tmp.path().join("repo"));
    let data = tmp.path().join("data");
    repo.child_worktree_add(&data, "web", "RUN1", "clean", None)
        .unwrap();
    let dirty = repo
        .child_worktree_add(&data, "web", "RUN1", "dirty", None)
        .unwrap();
    repo.child_worktree_add(&data, "web", "RUN2", "other", None)
        .unwrap();
    fs::write(Path::new(&dirty.path).join("wip.txt"), "wip\n").unwrap();

    let err = repo
        .run_worktrees_remove(&data, "web", "RUN1", false)
        .unwrap_err();
    assert!(matches!(err, GitError::WorktreeDirty(ref f) if f.contains("RUN1.dirty")));

    let left: Vec<_> = repo
        .worktrees()
        .unwrap()
        .into_iter()
        .map(|w| w.name)
        .collect();
    assert_eq!(left.len(), 2);
    assert!(left.contains(&"RUN1.dirty".to_string()));
    assert!(left.contains(&"RUN2.other".to_string()));

    repo.run_worktrees_remove(&data, "web", "RUN1", true)
        .unwrap();
    assert_eq!(repo.worktrees().unwrap().len(), 1);
}
