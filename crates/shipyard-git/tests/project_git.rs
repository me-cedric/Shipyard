//! Clone, init and state tests with a local bare remote (spec `projects`, REQ-002 to REQ-006).

use std::path::Path;
use std::process::Command;

use shipyard_git::project::{WorkState, clone_repo, git_runs, init, is_repo, state};

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args([
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn commit(dir: &Path, file: &str) {
    std::fs::write(dir.join(file), file).unwrap();
    git(dir, &["add", "-A"]);
    git(dir, &["commit", "-q", "-m", file]);
}

/// A bare remote that holds one commit on `main`.
fn remote(root: &Path) -> std::path::PathBuf {
    let bare = root.join("remote.git");
    std::fs::create_dir_all(&bare).unwrap();
    git(&bare, &["init", "-q", "--bare", "-b", "main"]);
    let seed = root.join("seed");
    init(&seed).unwrap();
    git(&seed, &["checkout", "-q", "-B", "main"]);
    commit(&seed, "a");
    git(&seed, &["push", "-q", bare.to_str().unwrap(), "main"]);
    bare
}

#[test]
fn git_runs_here() {
    assert!(git_runs());
}

#[test]
fn init_makes_a_repository_with_the_os_ignore_rules() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("new");
    init(&target).unwrap();
    assert!(is_repo(&target));
    let ignore = std::fs::read_to_string(target.join(".gitignore")).unwrap();
    assert!(ignore.contains(".DS_Store") && ignore.contains("Thumbs.db"));
}

#[test]
fn state_follows_the_working_copy() {
    let dir = tempfile::tempdir().unwrap();
    let bare = remote(dir.path());
    let work = dir.path().join("work");
    clone_repo(bare.to_str().unwrap(), &work).unwrap();
    assert_eq!(state(&work), WorkState::Clean);
    std::fs::write(work.join("new.txt"), "x").unwrap();
    assert_eq!(state(&work), WorkState::Changed);
    git(&work, &["add", "-A"]);
    git(&work, &["commit", "-q", "-m", "x"]);
    assert_eq!(state(&work), WorkState::Ahead);
    // Another clone pushes. The first one fetches and falls behind.
    let other = dir.path().join("other");
    clone_repo(bare.to_str().unwrap(), &other).unwrap();
    commit(&other, "b");
    git(&other, &["push", "-q", "origin", "HEAD:main"]);
    git(&work, &["reset", "-q", "--hard", "origin/main"]);
    git(&work, &["fetch", "-q"]);
    assert_eq!(state(&work), WorkState::Behind);
}

#[test]
fn a_missing_folder_or_a_folder_without_a_repository_is_missing() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(state(&dir.path().join("gone")), WorkState::Missing);
    assert_eq!(state(dir.path()), WorkState::Missing);
    assert!(!is_repo(dir.path()));
}

#[test]
fn a_failed_clone_removes_the_partial_folder_and_names_the_error() {
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("dest");
    let err = clone_repo("/nonexistent/none.git", &dest).unwrap_err();
    assert!(!err.is_empty());
    assert!(!dest.exists());
}

#[test]
fn a_clone_refuses_an_option_as_an_address_and_a_folder_with_files() {
    let dir = tempfile::tempdir().unwrap();
    assert!(clone_repo("--upload-pack=x", &dir.path().join("a")).is_err());
    std::fs::write(dir.path().join("f"), "x").unwrap();
    assert!(clone_repo("/x.git", dir.path()).is_err());
    assert!(dir.path().join("f").exists(), "the folder keeps its files");
}
