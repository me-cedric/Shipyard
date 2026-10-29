//! git2 operations on temporary repositories. No network: remotes are local bare folders.

use std::fs;
use std::path::Path;

use git2::{Repository, RepositoryInitOptions};
use shipyard_git::code::{BranchKind, DiffSide, FileState, PullOutcome, RefKind};
use shipyard_git::{Auth, GitError, Repo};
use tempfile::TempDir;

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
    r.stage(&[rel.to_string()]).unwrap();
    r.commit(msg, "").unwrap()
}

fn s(x: &str) -> String {
    x.to_string()
}

/// A bare remote and a working copy `a` that pushed `main` to it.
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

fn clone(url: &str, to: &Path) -> Repo {
    let r = Repository::clone(url, to).unwrap();
    ident(&r);
    Repo::open(to).unwrap()
}

#[test]
fn status_groups_staged_unstaged_untracked() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    assert!(r.status().unwrap().is_clean());
    assert_eq!(r.status().unwrap().branch.as_deref(), Some("main"));
    commit(&r, "a.txt", "1\n", "chore: a");
    commit(&r, "b.txt", "1\n", "chore: b");
    commit(&r, "dir/c.txt", "1\n", "chore: c");

    write(&r, "a.txt", "2\n");
    r.stage(&[s("a.txt")]).unwrap();
    write(&r, "a.txt", "3\n");
    fs::remove_file(r.workdir().join("b.txt")).unwrap();
    write(&r, "new.txt", "n\n");
    write(&r, "dir/deep/d.txt", "d\n");
    write(&r, "staged.txt", "s\n");
    r.stage(&[s("staged.txt")]).unwrap();

    let st = r.status().unwrap();
    let names =
        |v: &[shipyard_git::code::FileChange]| v.iter().map(|f| f.path.clone()).collect::<Vec<_>>();
    assert_eq!(names(&st.staged), ["a.txt", "staged.txt"]);
    assert_eq!(st.staged[1].state, FileState::Added);
    assert_eq!(names(&st.unstaged), ["a.txt", "b.txt"]);
    assert_eq!(st.unstaged[1].state, FileState::Deleted);
    assert_eq!(names(&st.untracked), ["dir/deep/d.txt", "new.txt"]);
    assert!(st.conflicted.is_empty() && !st.is_clean());
}

#[test]
fn stage_and_unstage_files_folders_deletions() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "gone.txt", "1\n", "chore: gone");
    commit(&r, "dir/x.txt", "1\n", "chore: x");
    write(&r, "dir/x.txt", "2\n");
    write(&r, "dir/y.txt", "y\n");
    fs::remove_file(r.workdir().join("gone.txt")).unwrap();

    r.stage(&[s("dir"), s("gone.txt")]).unwrap();
    let st = r.status().unwrap();
    assert_eq!(st.staged.len(), 3);
    assert!(st.unstaged.is_empty() && st.untracked.is_empty());

    r.unstage(&[s("dir")]).unwrap();
    let st = r.status().unwrap();
    assert_eq!(st.staged.len(), 1);
    assert_eq!(st.staged[0].state, FileState::Deleted);
    assert_eq!(st.unstaged.len(), 1);
    assert_eq!(st.untracked.len(), 1);
    assert_eq!(
        fs::read_to_string(r.workdir().join("dir/x.txt")).unwrap(),
        "2\n"
    );

    r.stage(&[s(".")]).unwrap();
    assert!(r.status().unwrap().unstaged.is_empty());
}

#[test]
fn stage_and_unstage_before_the_first_commit() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    write(&r, "a.txt", "a\n");
    r.stage(&[s("a.txt")]).unwrap();
    assert_eq!(r.status().unwrap().staged.len(), 1);
    r.unstage(&[s("a.txt")]).unwrap();
    let st = r.status().unwrap();
    assert!(st.staged.is_empty());
    assert_eq!(st.untracked.len(), 1);
}

#[test]
fn paths_outside_the_working_copy_are_refused() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    for bad in ["../x", "/etc/passwd", "a/../../x", ""] {
        assert!(
            matches!(r.stage(&[s(bad)]), Err(GitError::BadPath(_))),
            "{bad}"
        );
        assert!(
            matches!(r.unstage(&[s(bad)]), Err(GitError::BadPath(_))),
            "{bad}"
        );
        assert!(
            matches!(
                r.diff_file(bad, DiffSide::Unstaged, 100),
                Err(GitError::BadPath(_))
            ),
            "{bad}"
        );
    }
}

#[test]
fn two_separate_diffs_for_one_file() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "one\n", "chore: a");
    write(&r, "a.txt", "two\n");
    r.stage(&[s("a.txt")]).unwrap();
    write(&r, "a.txt", "three\n");

    let staged = r.diff_file("a.txt", DiffSide::Staged, 10_000).unwrap();
    assert!(staged.text.contains("-one") && staged.text.contains("+two"));
    assert!(!staged.text.contains("three"));
    let unstaged = r.diff_file("a.txt", DiffSide::Unstaged, 10_000).unwrap();
    assert!(unstaged.text.contains("-two") && unstaged.text.contains("+three"));
    assert!(!staged.binary && !staged.truncated);
}

#[test]
fn diff_of_untracked_file_shows_all_added_and_a_glob_name_is_literal() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    write(&r, "new.txt", "hello\n");
    let d = r.diff_file("new.txt", DiffSide::Unstaged, 10_000).unwrap();
    assert!(d.text.contains("+hello"));
    let none = r.diff_file("*.txt", DiffSide::Unstaged, 10_000).unwrap();
    assert!(none.text.is_empty());
}

#[test]
fn diff_is_capped_and_binary_has_no_text() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    write(&r, "a.txt", &"é line\n".repeat(500));
    let d = r.diff_file("a.txt", DiffSide::Unstaged, 101).unwrap();
    assert!(d.truncated);
    assert!(d.text.len() <= 101);

    fs::write(r.workdir().join("bin.dat"), [0u8, 159, 146, 150, 0, 1, 2]).unwrap();
    let b = r.diff_file("bin.dat", DiffSide::Unstaged, 10_000).unwrap();
    assert!(b.binary && b.text.is_empty());
}

#[test]
fn commit_takes_staged_files_only_with_the_configured_author() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    write(&r, "one.txt", "1\n");
    write(&r, "two.txt", "2\n");
    write(&r, "a.txt", "changed\n");
    r.stage(&[s("one.txt"), s("two.txt")]).unwrap();

    let sha = r.commit("feat(x): add two files", "  body line  ").unwrap();
    let info = r.commit_info(&sha).unwrap();
    assert_eq!(info.summary, "feat(x): add two files");
    assert_eq!(info.description, "body line");
    assert_eq!(info.author_name, "Test User");
    assert_eq!(info.author_email, "test@example.com");
    let mut files: Vec<_> = r
        .commit_files(&sha)
        .unwrap()
        .into_iter()
        .map(|f| f.path)
        .collect();
    files.sort();
    assert_eq!(files, ["one.txt", "two.txt"]);
    let st = r.status().unwrap();
    assert!(st.staged.is_empty());
    assert_eq!(st.unstaged[0].path, "a.txt");
}

#[test]
fn commit_refuses_empty_summary_nothing_staged_and_conflicts() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    assert!(matches!(
        r.commit("feat: x", ""),
        Err(GitError::NothingStaged)
    ));
    commit(&r, "a.txt", "1\n", "chore: a");
    assert!(matches!(
        r.commit("feat: x", ""),
        Err(GitError::NothingStaged)
    ));
    write(&r, "a.txt", "2\n");
    r.stage(&[s("a.txt")]).unwrap();
    assert!(matches!(r.commit("  ", ""), Err(GitError::EmptySummary)));

    // A conflict: two branches edit the same line, then merge.
    r.commit("fix: two", "").unwrap();
    r.create_branch("other").unwrap();
    commit(&r, "a.txt", "other\n", "fix: other");
    r.switch_branch("main").unwrap();
    commit(&r, "a.txt", "main\n", "fix: main");
    let g = Repository::open(r.workdir()).unwrap();
    let other = g.find_branch("other", git2::BranchType::Local).unwrap();
    let ac = g.reference_to_annotated_commit(other.get()).unwrap();
    g.merge(&[&ac], None, None).unwrap();

    let st = r.status().unwrap();
    assert_eq!(st.conflicted.len(), 1);
    assert_eq!(st.conflicted[0].path, "a.txt");
    match r.commit("fix: merge", "") {
        Err(GitError::Conflicts(files)) => assert_eq!(files, ["a.txt"]),
        other => panic!("{other:?}"),
    }
}

#[test]
fn history_pages_and_labels() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    assert!(r.log(0, 10).unwrap().commits.is_empty());
    for i in 0..5 {
        commit(&r, "a.txt", &format!("{i}\n"), &format!("chore: c{i}"));
    }
    let g = Repository::open(r.workdir()).unwrap();
    let head = g.head().unwrap().peel_to_commit().unwrap();
    g.tag_lightweight("v1", head.as_object(), false).unwrap();

    let p1 = r.log(0, 2).unwrap();
    assert_eq!(p1.commits.len(), 2);
    assert!(p1.has_more);
    assert_eq!(p1.commits[0].summary, "chore: c4");
    let labels = &p1.commits[0].labels;
    assert!(
        labels
            .iter()
            .any(|l| l.name == "main" && l.kind == RefKind::Branch)
    );
    assert!(
        labels
            .iter()
            .any(|l| l.name == "v1" && l.kind == RefKind::Tag)
    );
    assert!(p1.commits[1].labels.is_empty());

    let p3 = r.log(4, 2).unwrap();
    assert_eq!(p3.commits.len(), 1);
    assert!(!p3.has_more);
    assert_eq!(p3.commits[0].summary, "chore: c0");
    assert!(p3.commits[0].parents.is_empty());

    // The root commit lists its file against an empty tree.
    let root = &p3.commits[0].sha;
    assert_eq!(r.commit_files(root).unwrap()[0].state, FileState::Added);
    assert!(
        r.commit_diff(root, "a.txt", 1000)
            .unwrap()
            .text
            .contains("+0")
    );
}

#[test]
fn branches_create_switch_and_refuse_a_dirty_overwrite() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "main\n", "chore: a");

    r.create_branch("fix/auth/login-timeout").unwrap();
    assert_eq!(
        r.status().unwrap().branch.as_deref(),
        Some("fix/auth/login-timeout")
    );
    assert!(matches!(
        r.create_branch("fix/auth/login-timeout"),
        Err(GitError::BranchExists(_))
    ));
    assert!(matches!(
        r.create_branch("bad name"),
        Err(GitError::BadBranchName(_))
    ));
    commit(&r, "a.txt", "feature\n", "fix: a");

    r.switch_branch("main").unwrap();
    assert_eq!(
        fs::read_to_string(r.workdir().join("a.txt")).unwrap(),
        "main\n"
    );
    let list = r.branches().unwrap();
    assert_eq!(list.len(), 2);
    assert!(
        list.iter()
            .any(|b| b.name == "main" && b.is_head && b.kind == BranchKind::Local)
    );

    // An uncommitted edit that the switch would overwrite.
    write(&r, "a.txt", "dirty\n");
    match r.switch_branch("fix/auth/login-timeout") {
        Err(GitError::DirtyTree(files)) => assert_eq!(files, ["a.txt"]),
        other => panic!("{other:?}"),
    }
    assert_eq!(
        fs::read_to_string(r.workdir().join("a.txt")).unwrap(),
        "dirty\n"
    );
    assert_eq!(r.status().unwrap().branch.as_deref(), Some("main"));

    // An edit to a file that both branches share stays untouched, so the switch is allowed.
    write(&r, "a.txt", "main\n");
    write(&r, "other.txt", "o\n");
    r.switch_branch("fix/auth/login-timeout").unwrap();
    assert!(matches!(
        r.switch_branch("nope"),
        Err(GitError::NoBranch(_))
    ));
}

#[test]
fn switching_to_a_remote_branch_creates_a_tracking_branch() {
    let (tmp, a, url) = with_remote();
    a.create_branch("feat/x/remote-only").unwrap();
    commit(&a, "f.txt", "f\n", "feat: f");
    a.push("origin", &Auth::none()).unwrap();

    let b = clone(&url, &tmp.path().join("b"));
    assert!(
        !b.branches()
            .unwrap()
            .iter()
            .any(|x| x.name == "feat/x/remote-only")
    );
    b.switch_branch("origin/feat/x/remote-only").unwrap();
    let st = b.status().unwrap();
    assert_eq!(st.branch.as_deref(), Some("feat/x/remote-only"));
    assert_eq!(st.upstream.as_deref(), Some("origin/feat/x/remote-only"));
    assert!(b.workdir().join("f.txt").exists());
}

#[test]
fn fetch_moves_only_remote_tracking_refs() {
    let (tmp, a, url) = with_remote();
    let b = clone(&url, &tmp.path().join("b"));
    let before = b.status().unwrap();
    commit(&a, "new.txt", "n\n", "feat: new");
    a.push("origin", &Auth::none()).unwrap();

    b.fetch("origin", &Auth::none()).unwrap();
    let after = b.status().unwrap();
    assert_eq!(after.head, before.head);
    assert_eq!((after.ahead, after.behind), (0, 1));
    assert!(!b.workdir().join("new.txt").exists());
    assert!(after.is_clean());
}

#[test]
fn pull_fast_forwards_rebases_and_reports_up_to_date() {
    let (tmp, a, url) = with_remote();
    let b = clone(&url, &tmp.path().join("b"));
    assert_eq!(b.pull_rebase(&Auth::none()).unwrap(), PullOutcome::UpToDate);

    commit(&a, "from-a.txt", "a\n", "feat: from a");
    a.push("origin", &Auth::none()).unwrap();
    assert_eq!(
        b.pull_rebase(&Auth::none()).unwrap(),
        PullOutcome::FastForwarded
    );
    assert!(b.workdir().join("from-a.txt").exists());

    commit(&a, "from-a2.txt", "a\n", "feat: from a 2");
    a.push("origin", &Auth::none()).unwrap();
    commit(&b, "from-b.txt", "b\n", "feat: from b");
    assert_eq!(b.pull_rebase(&Auth::none()).unwrap(), PullOutcome::Rebased);
    let log: Vec<_> = b
        .log(0, 10)
        .unwrap()
        .commits
        .into_iter()
        .map(|c| c.summary)
        .collect();
    assert_eq!(&log[..2], ["feat: from b", "feat: from a 2"]);
    assert!(b.workdir().join("from-a2.txt").exists() && b.workdir().join("from-b.txt").exists());
    let st = b.status().unwrap();
    assert_eq!((st.ahead, st.behind), (1, 0));
    assert!(st.is_clean());

    // Local commits only: nothing to pull.
    assert_eq!(b.pull_rebase(&Auth::none()).unwrap(), PullOutcome::UpToDate);
}

#[test]
fn pull_conflict_aborts_the_rebase_and_keeps_the_branch() {
    let (tmp, a, url) = with_remote();
    let b = clone(&url, &tmp.path().join("b"));
    commit(&a, "base.txt", "from a\n", "fix: a");
    a.push("origin", &Auth::none()).unwrap();
    let mine = commit(&b, "base.txt", "from b\n", "fix: b");

    match b.pull_rebase(&Auth::none()) {
        Err(GitError::Conflicts(files)) => assert_eq!(files, ["base.txt"]),
        other => panic!("{other:?}"),
    }
    let st = b.status().unwrap();
    assert_eq!(st.head.as_deref(), Some(mine.as_str()));
    assert!(st.is_clean());
    assert_eq!(
        fs::read_to_string(b.workdir().join("base.txt")).unwrap(),
        "from b\n"
    );
}

#[test]
fn pull_refuses_a_dirty_tracked_file_and_a_missing_upstream() {
    let (tmp, _a, url) = with_remote();
    let b = clone(&url, &tmp.path().join("b"));
    write(&b, "base.txt", "dirty\n");
    match b.pull_rebase(&Auth::none()) {
        Err(GitError::DirtyTree(files)) => assert_eq!(files, ["base.txt"]),
        other => panic!("{other:?}"),
    }
    let lone = init(&tmp.path().join("lone"));
    commit(&lone, "a.txt", "1\n", "chore: a");
    assert!(matches!(
        lone.pull_rebase(&Auth::none()),
        Err(GitError::NoUpstream)
    ));
}

#[test]
fn push_never_forces_and_sets_the_upstream() {
    let (tmp, a, url) = with_remote();
    let b = clone(&url, &tmp.path().join("b"));
    commit(&a, "a.txt", "a\n", "feat: a");
    a.push("origin", &Auth::none()).unwrap();
    commit(&b, "b.txt", "b\n", "feat: b");
    let r = b.push("origin", &Auth::none());
    assert!(matches!(r, Err(GitError::PushRejected(_))), "{r:?}");

    // A new branch is published, gets an upstream, and the remote holds it.
    b.create_branch("feat/x/new").unwrap();
    assert!(b.status().unwrap().upstream.is_none());
    b.push("origin", &Auth::none()).unwrap();
    assert_eq!(
        b.status().unwrap().upstream.as_deref(),
        Some("origin/feat/x/new")
    );
    let remote = Repository::open_bare(&url).unwrap();
    assert!(
        remote
            .find_branch("feat/x/new", git2::BranchType::Local)
            .is_ok()
    );
}

#[test]
fn worktrees_add_list_remove_with_a_dirty_guard() {
    let tmp = TempDir::new().unwrap();
    let r = init(&tmp.path().join("main"));
    commit(&r, "a.txt", "1\n", "chore: a");
    let wt_path = tmp.path().join("runs").join("run-1");

    let info = r
        .worktree_add("run-1", &wt_path, "feat/core/run-1", None)
        .unwrap();
    assert_eq!(info.branch.as_deref(), Some("feat/core/run-1"));
    assert!(wt_path.join("a.txt").exists());
    assert_eq!(r.worktrees().unwrap(), vec![info]);
    // The main working copy keeps its branch.
    assert_eq!(r.status().unwrap().branch.as_deref(), Some("main"));
    // The branch is checked out in the worktree, so a second worktree on it fails.
    assert!(
        r.worktree_add(
            "run-2",
            &tmp.path().join("runs/run-2"),
            "feat/core/run-1",
            None
        )
        .is_err()
    );
    assert!(matches!(
        r.worktree_add("../evil", &tmp.path().join("e"), "x", None),
        Err(GitError::BadPath(_))
    ));
    assert!(
        r.worktree_add("run-3", &wt_path, "y", None).is_err(),
        "path exists"
    );

    let inner = Repo::open(&wt_path).unwrap();
    commit(&inner, "w.txt", "w\n", "feat: w");
    write(&inner, "scratch.txt", "x\n");
    assert!(matches!(
        r.worktree_remove("run-1", false),
        Err(GitError::WorktreeDirty(_))
    ));
    assert!(wt_path.exists());

    r.worktree_remove("run-1", true).unwrap();
    assert!(!wt_path.exists());
    assert!(r.worktrees().unwrap().is_empty());
    // The branch and its commit stay.
    assert!(
        r.branches()
            .unwrap()
            .iter()
            .any(|b| b.name == "feat/core/run-1")
    );
    assert!(matches!(
        r.worktree_remove("run-1", false),
        Err(GitError::NoWorktree(_))
    ));

    // A clean worktree on a branch made from a base revision goes without force.
    r.worktree_add(
        "run-4",
        &tmp.path().join("runs/run-4"),
        "feat/core/run-4",
        Some("main"),
    )
    .unwrap();
    r.worktree_remove("run-4", false).unwrap();
}

#[test]
fn open_and_discover() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "d/a.txt", "1\n", "chore: a");
    assert!(Repo::open(&tmp.path().join("d")).is_err());
    assert!(Repo::discover(&tmp.path().join("d")).is_ok());
    let other = TempDir::new().unwrap();
    assert!(matches!(
        Repo::open(other.path()),
        Err(GitError::NotARepo(_))
    ));
    let bare = other.path().join("bare.git");
    Repository::init_bare(&bare).unwrap();
    assert!(matches!(Repo::open(&bare), Err(GitError::NotARepo(_))));
}
