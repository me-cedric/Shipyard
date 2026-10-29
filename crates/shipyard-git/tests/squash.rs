//! Squash merge of a child branch into the run branch (spec `factory` REQ-013, `delivery`).
//! Temporary repositories, no network.

use std::fs;
use std::path::Path;

use git2::{Repository, RepositoryInitOptions};
use shipyard_git::delivery::squash_child;
use shipyard_git::{GitError, Repo};

fn s(x: &str) -> String {
    x.to_string()
}

fn init(dir: &Path) -> Repo {
    let mut o = RepositoryInitOptions::new();
    o.initial_head("main");
    let r = Repository::init_opts(dir, &o).unwrap();
    let mut c = r.config().unwrap();
    c.set_str("user.name", "Test User").unwrap();
    c.set_str("user.email", "test@example.com").unwrap();
    Repo::open(dir).unwrap()
}

fn commit(r: &Repo, rel: &str, text: &str, msg: &str) -> String {
    let p = r.workdir().join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
    r.stage(&[s(rel)]).unwrap();
    r.commit(msg, "").unwrap()
}

fn read(r: &Repo, rel: &str) -> String {
    fs::read_to_string(r.workdir().join(rel)).unwrap()
}

/// `main` with `a.txt` and `b.txt`, the branch `child` one step ahead with two commits.
fn fixture() -> (tempfile::TempDir, Repo) {
    let dir = tempfile::tempdir().unwrap();
    let r = init(dir.path());
    commit(&r, "a.txt", "a\n", "chore: a");
    commit(&r, "b.txt", "b\n", "chore: b");
    r.create_branch("child").unwrap();
    r.switch_branch("child").unwrap();
    commit(&r, "a.txt", "a changed\n", "feat: first");
    commit(&r, "c.txt", "c\n", "feat: second");
    r.switch_branch("main").unwrap();
    (dir, r)
}

fn tip(r: &Repo) -> git2::Oid {
    let repo = Repository::open(r.workdir()).unwrap();
    repo.head().unwrap().peel_to_commit().unwrap().id()
}

#[test]
fn a_child_becomes_one_commit_with_one_parent() {
    let (dir, r) = fixture();
    let before = tip(&r);
    let id = squash_child(dir.path(), "child", "feat(build): add c (build-1)")
        .unwrap()
        .expect("a commit");
    let repo = Repository::open(dir.path()).unwrap();
    let c = repo.find_commit(id.parse().unwrap()).unwrap();
    assert_eq!(c.id(), tip(&r));
    assert_eq!(c.parent_count(), 1);
    assert_eq!(c.parent_id(0).unwrap(), before);
    assert_eq!(c.message().unwrap(), "feat(build): add c (build-1)");
    // The folder and the index follow: nothing shows as changed.
    assert_eq!(read(&r, "a.txt"), "a changed\n");
    assert_eq!(read(&r, "c.txt"), "c\n");
    assert!(r.status().unwrap().is_clean());
}

#[test]
fn two_children_join_in_order_and_a_second_join_does_nothing() {
    let (dir, r) = fixture();
    r.create_branch("child2").unwrap();
    r.switch_branch("child2").unwrap();
    commit(&r, "d.txt", "d\n", "feat: d");
    r.switch_branch("main").unwrap();
    let first = squash_child(dir.path(), "child", "feat(build): one (build-1)").unwrap();
    let second = squash_child(dir.path(), "child2", "feat(build): two (build-2)").unwrap();
    assert!(first.is_some() && second.is_some());
    let repo = Repository::open(dir.path()).unwrap();
    let head = repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(head.message().unwrap(), "feat(build): two (build-2)");
    assert_eq!(head.parent(0).unwrap().id().to_string(), first.unwrap());
    assert_eq!(read(&r, "c.txt"), "c\n");
    assert_eq!(read(&r, "d.txt"), "d\n");
    // The same child again brings nothing.
    let once = tip(&r);
    assert_eq!(
        squash_child(dir.path(), "child", "feat(build): one again").unwrap(),
        None
    );
    assert_eq!(tip(&r), once);
}

#[test]
fn a_conflict_is_typed_and_leaves_the_run_as_it_was() {
    let (dir, r) = fixture();
    // The run branch changes the same line as the child.
    let before = commit(&r, "a.txt", "a on main\n", "feat: main side");
    let err = squash_child(dir.path(), "child", "feat(build): x (build-1)").unwrap_err();
    match err {
        GitError::Conflicts(files) => assert_eq!(files, ["a.txt"]),
        e => panic!("{e}"),
    }
    assert_eq!(tip(&r).to_string(), before);
    assert_eq!(read(&r, "a.txt"), "a on main\n");
    assert!(r.status().unwrap().is_clean());
    assert!(!dir.path().join("c.txt").exists());
}

#[test]
fn a_dirty_tracked_file_refuses_and_nothing_moves() {
    let (dir, r) = fixture();
    let before = tip(&r);
    fs::write(dir.path().join("b.txt"), "dirty\n").unwrap();
    let err = squash_child(dir.path(), "child", "feat(build): x (build-1)").unwrap_err();
    assert!(matches!(err, GitError::DirtyTree(f) if f == ["b.txt"]));
    assert_eq!(tip(&r), before);
    assert_eq!(read(&r, "b.txt"), "dirty\n");
}

#[test]
fn a_bad_message_or_branch_is_refused() {
    let (dir, r) = fixture();
    let before = tip(&r);
    for bad in [
        "add c",
        "",
        "feat(build): x\n\nCo-Authored-By: Someone <a@b.c>",
    ] {
        let err = squash_child(dir.path(), "child", bad).unwrap_err();
        assert!(matches!(err, GitError::BadSummary(_)), "{bad:?}: {err}");
    }
    let err = squash_child(dir.path(), "ghost", "feat(build): x").unwrap_err();
    assert!(matches!(err, GitError::NoBranch(b) if b == "ghost"));
    assert_eq!(tip(&r), before);
}
