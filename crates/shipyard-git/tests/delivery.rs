//! Git delivery operations (spec `delivery`, REQ-007, REQ-008, REQ-015, REQ-025). Temporary
//! repositories; the remote is a local bare folder. No network.

use std::fs;
use std::path::Path;

use git2::{Repository, RepositoryInitOptions};
use shipyard_git::code::{FileState, PullOutcome};
use shipyard_git::delivery::{PushMode, is_tool_branch};
use shipyard_git::{Auth, GitError, Repo};
use tempfile::TempDir;

fn s(x: &str) -> String {
    x.to_string()
}

fn ident(r: &Repository) {
    let mut c = r.config().unwrap();
    c.set_str("user.name", "Test User").unwrap();
    c.set_str("user.email", "test@example.com").unwrap();
}

fn init(dir: &Path) -> Repo {
    let mut o = RepositoryInitOptions::new();
    o.initial_head("main");
    ident(&Repository::init_opts(dir, &o).unwrap());
    Repo::open(dir).unwrap()
}

fn write(r: &Repo, rel: &str, text: &str) {
    let p = r.workdir().join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn commit(r: &Repo, rel: &str, text: &str, msg: &str) -> String {
    write(r, rel, text);
    r.stage(&[s(rel)]).unwrap();
    r.commit(msg, "").unwrap()
}

fn checkout_new(r: &Repo, name: &str) {
    r.create_branch(name).unwrap();
    r.switch_branch(name).unwrap();
}

fn head_branch(r: &Repo) -> String {
    r.status().unwrap().branch.unwrap()
}

fn tip(r: &Repo, branch: &str) -> String {
    Repository::open(r.workdir())
        .unwrap()
        .revparse_single(branch)
        .unwrap()
        .id()
        .to_string()
}

/// A bare remote and a working copy on `main` that pushed it.
fn with_remote() -> (TempDir, Repo, String) {
    let tmp = TempDir::new().unwrap();
    let url = tmp.path().join("remote.git");
    let mut o = RepositoryInitOptions::new();
    o.bare(true).initial_head("main");
    Repository::init_opts(&url, &o).unwrap();
    let a = init(&tmp.path().join("a"));
    commit(&a, "base.txt", "base\n", "chore: base");
    Repository::open(a.workdir())
        .unwrap()
        .remote("origin", url.to_str().unwrap())
        .unwrap();
    a.push("origin", &Auth::none()).unwrap();
    (tmp, a, url.to_str().unwrap().to_string())
}

fn remote_tip(url: &str, branch: &str) -> Option<String> {
    Repository::open(url)
        .unwrap()
        .find_reference(&format!("refs/heads/{branch}"))
        .ok()
        .and_then(|r| r.target())
        .map(|o| o.to_string())
}

// REQ-007: tool branch rename

#[test]
fn tool_branches_are_found_by_prefix() {
    for name in [
        "claude/fix-login",
        "codex/x",
        "copilot/x",
        "cursor/x",
        "gemini/x",
        "opencode/x",
    ] {
        assert!(is_tool_branch(name), "{name}");
    }
    for name in ["fix/auth/login", "main", "claudette/x", "feat/claude/x"] {
        assert!(!is_tool_branch(name), "{name}");
    }
}

#[test]
fn the_working_branch_is_renamed_before_the_first_push() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "a\n", "chore: a");
    checkout_new(&r, "claude/fix-login");
    commit(&r, "b.txt", "b\n", "fix(auth): login");

    let old = r.rename_branch("fix/auth/login").unwrap();

    assert_eq!(old, "claude/fix-login");
    assert_eq!(head_branch(&r), "fix/auth/login");
    let names: Vec<_> = r.branches().unwrap().into_iter().map(|b| b.name).collect();
    assert!(!names.contains(&s("claude/fix-login")));
    assert!(names.contains(&s("fix/auth/login")));
}

#[test]
fn a_rename_refuses_a_bad_name_an_existing_name_and_a_published_branch() {
    let (_tmp, r, _url) = with_remote();
    checkout_new(&r, "claude/x");
    assert!(matches!(
        r.rename_branch("Claude Fix").unwrap_err(),
        GitError::BadBranchName(_)
    ));
    // A published branch keeps its name: the remote branch would be left behind.
    r.switch_branch("main").unwrap();
    assert!(matches!(
        r.rename_branch("fix/auth/main").unwrap_err(),
        GitError::BranchPublished(_)
    ));
}

#[test]
fn a_rename_onto_another_existing_branch_is_refused() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "a\n", "chore: a");
    r.create_branch("fix/auth/login").unwrap();
    checkout_new(&r, "codex/x");
    assert!(matches!(
        r.rename_branch("fix/auth/login").unwrap_err(),
        GitError::BranchExists(_)
    ));
    assert_eq!(head_branch(&r), "codex/x");
}

// REQ-007: rebase onto the base

#[test]
fn a_moved_base_is_rebased_onto() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "a\n", "chore: a");
    checkout_new(&r, "fix/auth/login");
    commit(&r, "feature.txt", "f\n", "fix(auth): login");
    r.switch_branch("main").unwrap();
    commit(&r, "base2.txt", "b\n", "chore: base moved");
    r.switch_branch("fix/auth/login").unwrap();
    let before = tip(&r, "fix/auth/login");

    assert_eq!(r.rebase_onto("main").unwrap(), PullOutcome::Rebased);

    assert_ne!(tip(&r, "fix/auth/login"), before);
    assert!(r.workdir().join("base2.txt").exists());
    assert!(r.workdir().join("feature.txt").exists());
    let log = r.log(0, 10).unwrap().commits;
    assert_eq!(log[0].summary, "fix(auth): login");
    assert_eq!(log[1].summary, "chore: base moved");
}

#[test]
fn a_branch_that_already_holds_the_base_is_left_alone() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "a\n", "chore: a");
    checkout_new(&r, "fix/auth/login");
    commit(&r, "feature.txt", "f\n", "fix(auth): login");
    let before = tip(&r, "fix/auth/login");
    assert_eq!(r.rebase_onto("main").unwrap(), PullOutcome::UpToDate);
    assert_eq!(tip(&r, "fix/auth/login"), before);
}

#[test]
fn a_rebase_conflict_aborts_and_keeps_the_branch() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "a\n", "chore: a");
    checkout_new(&r, "fix/auth/login");
    commit(&r, "a.txt", "mine\n", "fix(auth): mine");
    r.switch_branch("main").unwrap();
    commit(&r, "a.txt", "theirs\n", "chore: theirs");
    r.switch_branch("fix/auth/login").unwrap();
    let before = tip(&r, "fix/auth/login");

    let err = r.rebase_onto("main").unwrap_err();

    assert!(matches!(err, GitError::Conflicts(ref f) if f == &[s("a.txt")]));
    assert_eq!(tip(&r, "fix/auth/login"), before);
    assert_eq!(
        fs::read_to_string(r.workdir().join("a.txt")).unwrap(),
        "mine\n"
    );
    assert!(r.status().unwrap().is_clean());
}

#[test]
fn a_rebase_refuses_a_dirty_tracked_file() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "a\n", "chore: a");
    checkout_new(&r, "fix/auth/login");
    write(&r, "a.txt", "edited\n");
    assert!(matches!(
        r.rebase_onto("main").unwrap_err(),
        GitError::DirtyTree(_)
    ));
}

// REQ-008: commit only the files of the change

#[test]
fn a_scoped_commit_holds_only_the_given_files() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "mine.txt", "1\n", "chore: mine");
    commit(&r, "other.txt", "1\n", "chore: other");
    commit(&r, "staged.txt", "1\n", "chore: staged");
    commit(&r, "gone.txt", "1\n", "chore: gone");

    write(&r, "mine.txt", "2\n");
    write(&r, "new/dir/file.txt", "n\n");
    fs::remove_file(r.workdir().join("gone.txt")).unwrap();
    write(&r, "other.txt", "2\n");
    write(&r, "stray.txt", "s\n");
    write(&r, "staged.txt", "2\n");
    r.stage(&[s("staged.txt")]).unwrap();

    let id = r
        .commit_scope(
            &[s("mine.txt"), s("new/dir/file.txt"), s("gone.txt")],
            "feat(core): change",
            "why",
        )
        .unwrap();

    let info = r.commit_info(&id).unwrap();
    assert_eq!(info.summary, "feat(core): change");
    assert_eq!(info.description, "why");
    let mut files: Vec<_> = r
        .commit_files(&id)
        .unwrap()
        .into_iter()
        .map(|f| f.path)
        .collect();
    files.sort();
    assert_eq!(files, [s("gone.txt"), s("mine.txt"), s("new/dir/file.txt")]);

    // The other changes stay where they were.
    let st = r.status().unwrap();
    assert!(st.untracked.iter().any(|f| f.path == "stray.txt"));
    assert!(
        st.unstaged
            .iter()
            .any(|f| f.path == "other.txt" && f.state == FileState::Modified)
    );
    assert!(st.staged.iter().any(|f| f.path == "staged.txt"));
    assert!(!st.staged.iter().any(|f| f.path == "mine.txt"));
    assert!(!st.unstaged.iter().any(|f| f.path == "mine.txt"));
}

#[test]
fn a_scoped_commit_checks_paths_message_and_change() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    write(&r, "a.txt", "2\n");

    assert!(matches!(
        r.commit_scope(&[], "feat: x", "").unwrap_err(),
        GitError::NothingStaged
    ));
    for bad in ["../x", "/etc/passwd", "a/../../x"] {
        assert!(matches!(
            r.commit_scope(&[s(bad)], "feat: x", "").unwrap_err(),
            GitError::BadPath(_)
        ));
    }
    assert!(matches!(
        r.commit_scope(&[s("a.txt")], "not conventional", "")
            .unwrap_err(),
        GitError::BadSummary(_)
    ));
    // Nothing changed in the given file.
    commit(&r, "b.txt", "1\n", "chore: b");
    assert!(matches!(
        r.commit_scope(&[s("b.txt")], "feat: x", "").unwrap_err(),
        GitError::NothingStaged
    ));
}

#[test]
fn a_scoped_commit_refuses_an_ai_attribution_line() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    write(&r, "a.txt", "2\n");
    for text in [
        "body\n\nCo-Authored-By: Someone <a@b.c>",
        "co-authored-by: x",
        "Generated with a tool",
        "\u{1F916} Generated by a tool",
    ] {
        assert!(
            matches!(
                r.commit_scope(&[s("a.txt")], "feat: x", text).unwrap_err(),
                GitError::BadSummary(_)
            ),
            "{text}"
        );
    }
    assert!(
        r.commit_scope(&[s("a.txt")], "feat: x", "Fixes the login.")
            .is_ok()
    );
}

// REQ-015: push with lease, never to the base

#[test]
fn a_new_branch_is_pushed_plain_and_never_to_the_base() {
    let (_tmp, r, url) = with_remote();
    checkout_new(&r, "fix/auth/login");
    commit(&r, "f.txt", "f\n", "fix(auth): login");

    r.push_run_branch("origin", "main", PushMode::Plain, &Auth::none())
        .unwrap();
    assert_eq!(
        remote_tip(&url, "fix/auth/login"),
        Some(tip(&r, "fix/auth/login"))
    );

    r.switch_branch("main").unwrap();
    for mode in [PushMode::Plain, PushMode::ForceWithLease] {
        let before = remote_tip(&url, "main");
        assert!(matches!(
            r.push_run_branch("origin", "main", mode, &Auth::none())
                .unwrap_err(),
            GitError::ProtectedBranch(_)
        ));
        assert_eq!(remote_tip(&url, "main"), before);
    }
}

#[test]
fn a_protected_name_is_refused_whatever_the_base() {
    let (_tmp, r, _url) = with_remote();
    for name in ["develop", "master", "release/1.0"] {
        checkout_new(&r, name);
        assert!(matches!(
            r.push_run_branch("origin", "main", PushMode::ForceWithLease, &Auth::none())
                .unwrap_err(),
            GitError::ProtectedBranch(_)
        ));
        r.switch_branch("main").unwrap();
    }
}

#[test]
fn a_rewritten_branch_needs_the_lease_and_a_plain_push_is_refused() {
    let (_tmp, r, url) = with_remote();
    checkout_new(&r, "fix/auth/login");
    commit(&r, "f.txt", "f\n", "fix(auth): login");
    r.push_run_branch("origin", "main", PushMode::Plain, &Auth::none())
        .unwrap();
    // The base moves, the branch is rebased: its history is rewritten.
    r.switch_branch("main").unwrap();
    commit(&r, "m.txt", "m\n", "chore: moved");
    r.switch_branch("fix/auth/login").unwrap();
    assert_eq!(r.rebase_onto("main").unwrap(), PullOutcome::Rebased);
    let rewritten = tip(&r, "fix/auth/login");
    let old_remote = remote_tip(&url, "fix/auth/login").unwrap();
    assert_ne!(rewritten, old_remote);

    assert!(matches!(
        r.push_run_branch("origin", "main", PushMode::Plain, &Auth::none())
            .unwrap_err(),
        GitError::PushRejected(_)
    ));
    assert_eq!(remote_tip(&url, "fix/auth/login").unwrap(), old_remote);

    r.push_run_branch("origin", "main", PushMode::ForceWithLease, &Auth::none())
        .unwrap();
    assert_eq!(remote_tip(&url, "fix/auth/login").unwrap(), rewritten);
}

#[test]
fn the_lease_fails_when_someone_else_pushed_to_the_branch() {
    let (tmp, r, url) = with_remote();
    checkout_new(&r, "fix/auth/login");
    commit(&r, "f.txt", "f\n", "fix(auth): login");
    r.push_run_branch("origin", "main", PushMode::Plain, &Auth::none())
        .unwrap();
    // A second clone pushes a commit to the same branch.
    let other_dir = tmp.path().join("other");
    let o = Repository::clone(&url, &other_dir).unwrap();
    ident(&o);
    let other = Repo::open(&other_dir).unwrap();
    let raw = Repository::open(&other_dir).unwrap();
    let remote_commit = raw
        .revparse_single("origin/fix/auth/login")
        .unwrap()
        .peel_to_commit()
        .unwrap();
    raw.branch("fix/auth/login", &remote_commit, false).unwrap();
    other.switch_branch("fix/auth/login").unwrap();
    commit(&other, "theirs.txt", "t\n", "fix(auth): theirs");
    other.push("origin", &Auth::none()).unwrap();
    let theirs = remote_tip(&url, "fix/auth/login").unwrap();

    // This side amends its own commit, without having fetched.
    write(&r, "f.txt", "f2\n");
    r.stage(&[s("f.txt")]).unwrap();
    r.commit("fix(auth): login again", "").unwrap();

    let err = r
        .push_run_branch("origin", "main", PushMode::ForceWithLease, &Auth::none())
        .unwrap_err();
    assert!(
        matches!(err, GitError::PushRejected(ref m) if m.contains("lease")),
        "{err}"
    );
    assert_eq!(remote_tip(&url, "fix/auth/login").unwrap(), theirs);
}

#[test]
fn a_lease_on_a_branch_that_never_reached_the_remote_creates_it() {
    let (_tmp, r, url) = with_remote();
    checkout_new(&r, "fix/auth/login");
    commit(&r, "f.txt", "f\n", "fix(auth): login");
    r.push_run_branch("origin", "main", PushMode::ForceWithLease, &Auth::none())
        .unwrap();
    assert!(remote_tip(&url, "fix/auth/login").is_some());
}
