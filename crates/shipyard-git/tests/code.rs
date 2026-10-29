//! git2 operations on temporary repositories. No network: remotes are local bare folders.

use std::fs;
use std::path::Path;

use git2::{Repository, RepositoryInitOptions};
use shipyard_git::code::{
    BranchKind, Choice, DiffSide, FileState, PullOutcome, RefKind, Segment, Side,
};
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
fn stage_and_unstage_match_paths_literally() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "keep.txt", "1\n", "chore: keep");
    write(&r, "a.txt", "a\n");
    write(&r, "b.txt", "b\n");
    write(&r, "c[1].txt", "c\n");
    r.stage(&[s("*.txt")]).unwrap();
    assert!(r.status().unwrap().staged.is_empty());
    r.stage(&[s("c[1].txt")]).unwrap();
    assert_eq!(r.status().unwrap().staged.len(), 1);
    r.stage(&[s("a.txt"), s("b.txt")]).unwrap();
    r.unstage(&[s("*.txt")]).unwrap();
    assert_eq!(r.status().unwrap().staged.len(), 3);
    r.unstage(&[s("c[1].txt")]).unwrap();
    let st = r.status().unwrap();
    assert_eq!(st.staged.len(), 2);
    assert_eq!(st.untracked.len(), 1);
    // A staged edit of a committed file goes back to the committed content.
    write(&r, "keep.txt", "2\n");
    r.stage(&[s("keep.txt")]).unwrap();
    r.unstage(&[s("keep.txt")]).unwrap();
    let st = r.status().unwrap();
    assert_eq!(st.unstaged.len(), 1);
    assert_eq!(st.unstaged[0].path, "keep.txt");
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
fn fetch_brings_no_tags() {
    let (tmp, a, url) = with_remote();
    let b = clone(&url, &tmp.path().join("b"));
    let tip = commit(&a, "t.txt", "t\n", "feat: tagged");
    a.push("origin", &Auth::none()).unwrap();
    let bare = Repository::open(&url).unwrap();
    let obj = bare
        .find_object(git2::Oid::from_str(&tip).unwrap(), None)
        .unwrap();
    bare.tag_lightweight("v1", &obj, false).unwrap();
    b.fetch("origin", &Auth::none()).unwrap();
    let g = Repository::open(b.workdir()).unwrap();
    assert!(g.tag_names(None).unwrap().is_empty());
    assert_eq!(b.status().unwrap().behind, 1);
}

#[test]
fn push_goes_to_the_upstream_merge_ref() {
    let (tmp, a, url) = with_remote();
    let b = clone(&url, &tmp.path().join("b"));
    {
        let g = Repository::open(b.workdir()).unwrap();
        let mut c = g.config().unwrap();
        c.set_str("branch.main.merge", "refs/heads/trunk").unwrap();
    }
    let tip = commit(&b, "b.txt", "b\n", "feat: b");
    b.push("origin", &Auth::none()).unwrap();
    let bare = Repository::open(&url).unwrap();
    assert_eq!(
        bare.find_reference("refs/heads/trunk")
            .unwrap()
            .target()
            .unwrap()
            .to_string(),
        tip
    );
    // main on the remote did not move.
    assert_ne!(
        bare.find_reference("refs/heads/main")
            .unwrap()
            .target()
            .unwrap()
            .to_string(),
        tip
    );
    drop(a);
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
fn a_worktree_that_cannot_be_checked_is_refused_unless_forced() {
    let tmp = TempDir::new().unwrap();
    let r = init(&tmp.path().join("main"));
    commit(&r, "a.txt", "1\n", "chore: a");
    let wt_path = tmp.path().join("runs").join("run-1");
    r.worktree_add("run-1", &wt_path, "feat/core/run-1", None)
        .unwrap();
    // Break the link of the worktree: it cannot be opened, so it cannot be checked.
    fs::remove_dir_all(&wt_path).unwrap();
    let res = r.worktree_remove("run-1", false);
    assert!(matches!(res, Err(GitError::WorktreeDirty(_))), "{res:?}");
    r.worktree_remove("run-1", true).unwrap();
    assert!(r.worktrees().unwrap().is_empty());
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

#[test]
fn discard_restores_tracked_files_and_deletes_untracked_only_when_asked() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    commit(&r, "d/b.txt", "1\n", "chore: b");
    commit(&r, "d/c.txt", "1\n", "chore: c");
    write(&r, "a.txt", "2\n");
    write(&r, "d/b.txt", "2\n");
    fs::remove_file(r.workdir().join("d/c.txt")).unwrap();
    write(&r, "d/new.txt", "n\n");
    write(&r, "keep.txt", "k\n");

    // A folder, no untracked flag: tracked files return, untracked files stay.
    r.discard(&[s("d")], false).unwrap();
    let read = |p: &str| fs::read_to_string(r.workdir().join(p)).unwrap();
    assert_eq!(read("d/b.txt"), "1\n");
    assert_eq!(read("d/c.txt"), "1\n");
    assert_eq!(read("a.txt"), "2\n");
    assert!(r.workdir().join("d/new.txt").exists());

    // Untracked flag: the untracked file under the path goes, others stay.
    r.discard(&[s("d")], true).unwrap();
    assert!(!r.workdir().join("d/new.txt").exists());
    assert!(r.workdir().join("keep.txt").exists());
    r.discard(&[s("a.txt")], true).unwrap();
    assert_eq!(read("a.txt"), "1\n");

    // A staged edit stays staged: discard takes unstaged changes only.
    write(&r, "a.txt", "staged\n");
    r.stage(&[s("a.txt")]).unwrap();
    write(&r, "a.txt", "later\n");
    r.discard(&[s("a.txt")], false).unwrap();
    assert_eq!(read("a.txt"), "staged\n");
    assert_eq!(r.status().unwrap().staged.len(), 1);
}

#[test]
fn discard_refuses_outside_paths_and_leaves_ignored_files_and_link_targets() {
    let tmp = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    fs::write(outside.path().join("x.txt"), "x").unwrap();
    let r = init(&tmp.path().join("repo"));
    commit(&r, ".gitignore", "ign.txt\n", "chore: ignore");
    write(&r, "ign.txt", "i\n");
    for bad in ["../x.txt", "/etc/hosts", ""] {
        assert!(matches!(
            r.discard(&[s(bad)], true),
            Err(GitError::BadPath(_))
        ));
    }
    r.discard(&[s("ign.txt")], true).unwrap();
    assert!(r.workdir().join("ign.txt").exists());
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(outside.path(), r.workdir().join("link")).unwrap();
        r.discard(&[s("link/x.txt")], true).unwrap();
        assert!(outside.path().join("x.txt").exists());
    }
}

#[test]
fn stash_push_list_apply_drop_with_untracked_files() {
    let tmp = TempDir::new().unwrap();
    let mut r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    assert!(r.stash_push(None).is_err()); // nothing to stash
    write(&r, "a.txt", "2\n");
    write(&r, "new.txt", "n\n");
    r.stash_push(Some("my work")).unwrap();
    assert!(r.status().unwrap().is_clean());
    write(&r, "b.txt", "b\n");
    r.stash_push(None).unwrap();

    let list = r.stash_list().unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].index, 0);
    assert!(list[0].message.starts_with("WIP on main"));
    assert!(list[1].message.contains("my work"));

    r.stash_apply(1).unwrap();
    let st = r.status().unwrap();
    assert_eq!(st.unstaged.len(), 1);
    assert_eq!(st.untracked.len(), 1);
    assert_eq!(r.stash_list().unwrap().len(), 2); // apply keeps the stash
    // Drop by id: a new stash moves the positions, the id still finds its stash.
    let first = list[1].id.clone();
    write(&r, "c.txt", "c\n");
    r.stash_push(None).unwrap();
    r.stash_drop(&first).unwrap();
    let left = r.stash_list().unwrap();
    assert_eq!(left.len(), 2);
    assert!(left.iter().all(|s| s.id != first));
    assert!(r.stash_drop(&first).is_err());
    assert_eq!(r.stash_list().unwrap().len(), 2);
    for s in left {
        r.stash_drop(&s.id).unwrap();
    }
    assert!(r.stash_list().unwrap().is_empty());
}

/// `l1..l12`: ours edits l2 and l11, theirs edits the same lines. The merge leaves two blocks.
fn two_block_merge() -> (TempDir, Repo) {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    let body = |a: &str, b: &str| {
        (1..=12)
            .map(|i| match i {
                2 => format!("{a}\n"),
                11 => format!("{b}\n"),
                _ => format!("l{i}\n"),
            })
            .collect::<String>()
    };
    commit(&r, "f.txt", &body("l2", "l11"), "chore: base");
    r.create_branch("other").unwrap();
    commit(&r, "f.txt", &body("t2", "t11"), "fix: other");
    r.switch_branch("main").unwrap();
    commit(&r, "f.txt", &body("o2", "o11"), "fix: main");
    merge_other(&r);
    (tmp, r)
}

fn merge_other(r: &Repo) {
    let g = Repository::open(r.workdir()).unwrap();
    let other = g.find_branch("other", git2::BranchType::Local).unwrap();
    let ac = g.reference_to_annotated_commit(other.get()).unwrap();
    g.merge(&[&ac], None, None).unwrap();
}

#[test]
fn conflicts_list_blocks_with_base_and_resolve_by_choice() {
    let (_t, r) = two_block_merge();
    let list = r.conflicts().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].path, "f.txt");
    assert!(list[0].text);
    let blocks: Vec<_> = list[0]
        .segments
        .iter()
        .filter_map(|g| match g {
            Segment::Block { ours, base, theirs } => Some((ours, base, theirs)),
            Segment::Text { .. } => None,
        })
        .collect();
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0], (&s("o2\n"), &s("l2\n"), &s("t2\n")));

    // Wrong number of choices: refused, the file stays conflicted.
    assert!(r.resolve_blocks("f.txt", &[Choice::Ours]).is_err());
    assert_eq!(r.status().unwrap().conflicted.len(), 1);

    r.resolve_blocks("f.txt", &[Choice::Theirs, Choice::Ours])
        .unwrap();
    let text = fs::read_to_string(r.workdir().join("f.txt")).unwrap();
    assert!(text.contains("t2\n") && text.contains("o11\n"));
    assert!(!text.contains("<<<<<<<") && !text.contains("o2\n") && !text.contains("t11\n"));
    let st = r.status().unwrap();
    assert!(st.conflicted.is_empty());
    assert_eq!(st.staged.len(), 1);
}

#[test]
fn a_merge_with_no_conflict_left_commits_with_both_parents_and_clears_the_state() {
    let (_t, r) = two_block_merge();
    // Conflicts left: the commit refuses.
    assert!(matches!(
        r.commit("fix: merge", ""),
        Err(GitError::Conflicts(_))
    ));
    r.resolve_blocks("f.txt", &[Choice::Theirs, Choice::Ours])
        .unwrap();
    let id = r.commit("fix: merge other", "").unwrap();
    let info = r.commit_info(&id).unwrap();
    assert_eq!(info.parents.len(), 2);
    assert_eq!(info.summary, "fix: merge other");
    let g = Repository::open(r.workdir()).unwrap();
    assert_eq!(g.state(), git2::RepositoryState::Clean);
    assert!(!g.path().join("MERGE_HEAD").exists());
    // The next commit is a plain one again.
    assert!(matches!(
        r.commit("fix: again", ""),
        Err(GitError::NothingStaged)
    ));
}

#[test]
fn conflict_choices_both_and_neither_whole_side_and_marker_guard() {
    let (_t, r) = two_block_merge();
    r.resolve_blocks("f.txt", &[Choice::Both, Choice::Neither])
        .unwrap();
    let text = fs::read_to_string(r.workdir().join("f.txt")).unwrap();
    assert!(text.contains("o2\nt2\n"));
    assert!(!text.contains("o11") && !text.contains("t11") && !text.contains("l11"));

    let (_t, r) = two_block_merge();
    r.resolve_side("f.txt", Side::Theirs).unwrap();
    let text = fs::read_to_string(r.workdir().join("f.txt")).unwrap();
    assert!(text.contains("t2\n") && text.contains("t11\n") && !text.contains("o2"));
    assert!(r.status().unwrap().conflicted.is_empty());

    // Marker left: mark resolved refuses and names the file.
    let (_t, r) = two_block_merge();
    match r.mark_resolved("f.txt") {
        Err(GitError::ConflictMarkers(p)) => assert_eq!(p, "f.txt"),
        other => panic!("{other:?}"),
    }
    assert_eq!(r.status().unwrap().conflicted.len(), 1);
    // A hand edit without markers is accepted.
    write(&r, "f.txt", "hand\n");
    r.mark_resolved("f.txt").unwrap();
    assert!(r.status().unwrap().conflicted.is_empty());
    assert!(r.mark_resolved("../f.txt").is_err());
}

#[test]
fn a_stash_that_stops_on_a_conflict_is_listed_and_the_stash_is_kept() {
    let tmp = TempDir::new().unwrap();
    let mut r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    write(&r, "a.txt", "stash\n");
    r.stash_push(None).unwrap();
    commit(&r, "a.txt", "head\n", "fix: head");
    match r.stash_apply(0) {
        Err(GitError::Conflicts(files)) => assert_eq!(files, ["a.txt"]),
        other => panic!("{other:?}"),
    }
    assert_eq!(r.stash_list().unwrap().len(), 1);
    let list = r.conflicts().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].path, "a.txt");
    r.resolve_side("a.txt", Side::Ours).unwrap();
    assert_eq!(
        fs::read_to_string(r.workdir().join("a.txt")).unwrap(),
        "head\n"
    );
}

#[test]
fn a_conflict_without_a_text_side_takes_a_whole_side_only() {
    // modify / delete: ours deletes, theirs edits.
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "f.txt", "1\n", "chore: f");
    r.create_branch("other").unwrap();
    commit(&r, "f.txt", "2\n", "fix: edit");
    r.switch_branch("main").unwrap();
    fs::remove_file(r.workdir().join("f.txt")).unwrap();
    r.stage(&[s("f.txt")]).unwrap();
    r.commit("fix: delete", "").unwrap();
    merge_other(&r);

    let list = r.conflicts().unwrap();
    assert!(!list[0].text && list[0].segments.is_empty());
    assert!(r.resolve_blocks("f.txt", &[]).is_err());
    r.resolve_side("f.txt", Side::Ours).unwrap(); // our side is a deletion
    assert!(!r.workdir().join("f.txt").exists());
    assert!(r.status().unwrap().conflicted.is_empty());
}

#[cfg(unix)]
#[test]
fn taking_a_side_replaces_a_link_and_keeps_the_index_mode() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    // A link in the working copy is replaced, its target stays as it is.
    let (_t, r) = two_block_merge();
    let outside = TempDir::new().unwrap();
    let target = outside.path().join("t.txt");
    fs::write(&target, "outside").unwrap();
    let f = r.workdir().join("f.txt");
    fs::remove_file(&f).unwrap();
    symlink(&target, &f).unwrap();
    r.resolve_side("f.txt", Side::Theirs).unwrap();
    assert_eq!(fs::read_to_string(&target).unwrap(), "outside");
    assert!(!fs::symlink_metadata(&f).unwrap().file_type().is_symlink());
    assert!(fs::read_to_string(&f).unwrap().contains("t2\n"));

    // A link in a parent folder is refused.
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "sub/g.txt", "1\n", "chore: g");
    r.create_branch("other").unwrap();
    commit(&r, "sub/g.txt", "2\n", "fix: other");
    r.switch_branch("main").unwrap();
    commit(&r, "sub/g.txt", "3\n", "fix: main");
    merge_other(&r);
    let dir = TempDir::new().unwrap();
    fs::remove_dir_all(r.workdir().join("sub")).unwrap();
    symlink(dir.path(), r.workdir().join("sub")).unwrap();
    assert!(r.resolve_side("sub/g.txt", Side::Ours).is_err());
    assert!(fs::read_dir(dir.path()).unwrap().next().is_none());

    // The executable bit comes back from the index, also when the file is gone.
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    let exec = |t: &str, m: &str| {
        write(&r, "run.sh", t);
        fs::set_permissions(
            r.workdir().join("run.sh"),
            fs::Permissions::from_mode(0o755),
        )
        .unwrap();
        r.stage(&[s("run.sh")]).unwrap();
        r.commit(m, "").unwrap();
    };
    exec("1\n", "chore: run");
    r.create_branch("other").unwrap();
    exec("2\n", "fix: other");
    r.switch_branch("main").unwrap();
    exec("3\n", "fix: main");
    merge_other(&r);
    fs::remove_file(r.workdir().join("run.sh")).unwrap();
    r.resolve_side("run.sh", Side::Theirs).unwrap();
    let mode = fs::metadata(r.workdir().join("run.sh"))
        .unwrap()
        .permissions()
        .mode();
    assert_eq!(mode & 0o111, 0o111);
}

#[test]
fn delete_branch_refuses_the_working_branch_and_an_unmerged_one() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    r.create_branch("merged").unwrap();
    r.switch_branch("main").unwrap();
    r.create_branch("work").unwrap();
    commit(&r, "b.txt", "1\n", "feat: b");
    r.switch_branch("main").unwrap();

    assert!(matches!(
        r.delete_branch("main", true),
        Err(GitError::IsWorkingBranch(_))
    ));
    assert!(matches!(
        r.delete_branch("nope", false),
        Err(GitError::NoBranch(_))
    ));
    match r.delete_branch("work", false) {
        Err(GitError::BranchNotMerged(n)) => assert_eq!(n, "work"),
        other => panic!("{other:?}"),
    }
    r.delete_branch("merged", false).unwrap();
    r.delete_branch("work", true).unwrap();
    let names: Vec<_> = r.branches().unwrap().into_iter().map(|b| b.name).collect();
    assert_eq!(names, ["main"]);
}

#[test]
fn remote_heads_compare_before_and_after_a_fetch() {
    let (tmp, a, url) = with_remote();
    let b = clone(&url, &tmp.path().join("b"));
    let before = b.remote_heads("origin").unwrap();
    assert_eq!(before.len(), 1);
    assert_eq!(before[0].name, "origin/main");

    // No push: a fetch changes nothing.
    b.fetch("origin", &Auth::none()).unwrap();
    let same = b.remote_heads("origin").unwrap();
    assert!(b.head_changes(&before, &same).unwrap().is_empty());

    commit(&a, "n1.txt", "1\n", "feat: one");
    commit(&a, "n2.txt", "2\n", "feat: two");
    a.push("origin", &Auth::none()).unwrap();
    a.create_branch("feat/x").unwrap();
    commit(&a, "x.txt", "x\n", "feat: x");
    a.push("origin", &Auth::none()).unwrap();

    b.fetch("origin", &Auth::none()).unwrap();
    let after = b.remote_heads("origin").unwrap();
    let mut ch = b.head_changes(&before, &after).unwrap();
    ch.sort_by(|x, y| x.name.cmp(&y.name));
    assert_eq!(ch.len(), 2);
    assert_eq!(ch[0].name, "origin/feat/x");
    assert!(ch[0].old.is_none());
    assert_eq!((ch[0].count, ch[0].subject.as_str()), (1, "feat: x"));
    assert_eq!(ch[1].name, "origin/main");
    assert_eq!((ch[1].count, ch[1].subject.as_str()), (2, "feat: two"));
    assert_eq!(ch[1].author, "Test User");
    // The same list twice is quiet: the notice leaves.
    assert!(b.head_changes(&after, &after).unwrap().is_empty());
}

#[test]
fn the_remote_is_the_upstream_remote_else_origin_else_none() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    assert_eq!(r.remote().unwrap(), None);
    let (_t, a, url) = with_remote();
    assert_eq!(a.remote().unwrap(), Some((s("origin"), url)));
}

#[test]
fn tags_list_by_name_and_compare_with_uncommitted_work() {
    let tmp = TempDir::new().unwrap();
    let r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "feat: a");
    let raw = Repository::open(tmp.path()).unwrap();
    let head = raw.head().unwrap().peel_to_commit().unwrap();
    raw.tag_lightweight("v1.0", head.as_object(), false)
        .unwrap();
    raw.tag_lightweight("v0.9", head.as_object(), false)
        .unwrap();
    assert_eq!(r.tags().unwrap(), ["v0.9", "v1.0"]);
    write(&r, "b.txt", "new\n");
    write(&r, "a.txt", "2\n");
    let mut files = r.changed_since("v1.0").unwrap();
    files.sort();
    assert_eq!(files, ["a.txt", "b.txt"]);
}
