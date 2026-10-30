//! Child project clone, branch and commit (spec `extensions`, REQ-015 to REQ-018).

use std::path::Path;
use std::process::Command;

use shipyard_git::Auth;
use shipyard_git::child_deploy::{branch_drop, branch_new, commit_all};
use shipyard_git::project::clone_repo;

fn git(dir: &Path, args: &[&str]) -> String {
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
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A bare remote with one commit on `main`, and a clone of it that has an identity.
fn child(root: &Path) -> (std::path::PathBuf, std::path::PathBuf) {
    let seed = root.join("seed");
    std::fs::create_dir_all(&seed).unwrap();
    git(&seed, &["init", "-q", "-b", "main"]);
    std::fs::write(seed.join("README.md"), "x").unwrap();
    git(&seed, &["add", "-A"]);
    git(&seed, &["commit", "-q", "-m", "init"]);
    let bare = root.join("remote.git");
    git(
        root,
        &[
            "clone",
            "-q",
            "--bare",
            seed.to_str().unwrap(),
            bare.to_str().unwrap(),
        ],
    );
    let clone = root.join("clone");
    clone_repo(bare.to_str().unwrap(), &clone, &Auth::none()).unwrap();
    git(&clone, &["config", "user.name", "t"]);
    git(&clone, &["config", "user.email", "t@t"]);
    (bare, clone)
}

#[test]
fn a_deploy_makes_a_branch_with_one_commit_and_does_not_push() {
    let d = tempfile::tempdir().unwrap();
    let (bare, clone) = child(d.path());
    branch_new(&clone, "shipyard/extensions").unwrap();
    std::fs::write(clone.join("AGENTS.md"), "rules").unwrap();
    let id = commit_all(&clone, "chore: deploy").unwrap().unwrap();
    assert_eq!(
        git(&clone, &["rev-parse", "--abbrev-ref", "HEAD"]),
        "shipyard/extensions"
    );
    assert_eq!(git(&clone, &["rev-parse", "HEAD"]), id);
    assert_eq!(git(&clone, &["rev-list", "--count", "main..HEAD"]), "1");
    assert_eq!(
        git(&bare, &["branch", "--list", "shipyard/extensions"]),
        "",
        "nothing was pushed"
    );
}

#[test]
fn nothing_to_commit_gives_none() {
    let d = tempfile::tempdir().unwrap();
    let (_, clone) = child(d.path());
    branch_new(&clone, "b").unwrap();
    assert_eq!(commit_all(&clone, "m").unwrap(), None);
}

#[test]
fn a_dirty_clone_an_existing_branch_and_a_bad_name_are_refused() {
    let d = tempfile::tempdir().unwrap();
    let (_, clone) = child(d.path());
    assert!(branch_new(&clone, "bad name").is_err());
    assert!(branch_new(&clone, "-x").is_err());
    branch_new(&clone, "b").unwrap();
    git(&clone, &["checkout", "-q", "main"]);
    assert!(branch_new(&clone, "b").is_err());
    std::fs::write(clone.join("own.txt"), "mine").unwrap();
    assert!(branch_new(&clone, "c").unwrap_err().contains("changes"));
}

#[test]
fn a_dropped_branch_leaves_the_clone_clean_on_its_old_branch() {
    let d = tempfile::tempdir().unwrap();
    let (_, clone) = child(d.path());
    let before = branch_new(&clone, "b").unwrap();
    std::fs::write(clone.join("AGENTS.md"), "rules").unwrap();
    std::fs::create_dir(clone.join("docs")).unwrap();
    std::fs::write(clone.join("docs/a.md"), "a").unwrap();
    branch_drop(&clone, &before, "b").unwrap();
    assert_eq!(git(&clone, &["rev-parse", "--abbrev-ref", "HEAD"]), "main");
    assert_eq!(git(&clone, &["status", "--porcelain"]), "");
    assert_eq!(git(&clone, &["branch", "--list", "b"]), "");
    // The clone takes a new deploy.
    branch_new(&clone, "b").unwrap();
}

#[test]
fn a_commit_skips_secret_files_and_refuses_a_merge_in_progress() {
    let d = tempfile::tempdir().unwrap();
    let (_, clone) = child(d.path());
    branch_new(&clone, "b").unwrap();
    std::fs::write(clone.join("ok.txt"), "x").unwrap();
    std::fs::write(clone.join(format!(".{}.local", "ENV")), "T=x").unwrap();
    std::fs::write(clone.join("cert.pem"), "x").unwrap();
    std::fs::write(clone.join("id_rsa"), "x").unwrap();
    commit_all(&clone, "chore: save").unwrap().unwrap();
    let files = git(&clone, &["ls-tree", "-r", "--name-only", "HEAD"]);
    assert!(files.contains("ok.txt"), "{files}");
    for secret in ["ENV", "pem", "id_rsa"] {
        assert!(!files.contains(secret), "{files}");
    }
    // MERGE_HEAD makes the state a merge in progress.
    let head = git(&clone, &["rev-parse", "HEAD"]);
    std::fs::write(clone.join(".git/MERGE_HEAD"), format!("{head}\n")).unwrap();
    std::fs::write(clone.join("more.txt"), "y").unwrap();
    assert!(commit_all(&clone, "m").unwrap_err().contains("busy"));
}
