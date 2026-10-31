//! The delivery adapters on temporary repositories, and the approval text. No network.

use std::fs;
use std::path::Path;
use std::sync::Arc;

use shipyard_engine::approvals::Write;
use shipyard_engine::ports::{Git, Merge, Workspaces, Writer};
use shipyard_git::worktree::child_branch;
use shipyard_http::fake::FakeHttp;
use shipyard_secrets::MemoryStore;

use super::*;

const RUN: &str = "01JTESTRUN00000000000000A";

fn write(dir: &Path, rel: &str, text: &str) {
    let p = dir.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .expect("run git");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A repository on `main` with a spec and a source file, and the folders over it.
fn fixture() -> (tempfile::TempDir, Folders) {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("repo");
    fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "-q", "-b", "main"]);
    git(&root, &["config", "user.name", "Test User"]);
    git(&root, &["config", "user.email", "test@example.com"]);
    let repo = Repo::open(&root).unwrap();
    for (f, t) in [
        ("docs/openspec/a/spec.md", "# A\n"),
        ("src/lib.rs", "one\ntwo\n"),
    ] {
        write(&root, f, t);
        repo.stage(&[f.to_string()]).unwrap();
        repo.commit(&format!("chore: add {f}"), "").unwrap();
    }
    let folders = Folders {
        root,
        data: tmp.path().join("data"),
        project: "ship".into(),
        runner: "claude".into(),
        declared_base: None,
        specs: "docs/openspec".into(),
        secrets: Vec::new(),
    };
    (tmp, folders)
}

#[test]
fn a_run_gets_its_own_worktree_on_a_tool_branch_and_never_touches_the_working_copy() {
    let (_t, f) = fixture();
    let dir = f.dir(RUN, Workspace::Shared, None).unwrap();
    assert!(dir.starts_with(f.data.join("worktrees")), "{dir:?}");
    assert_eq!(f.branch(RUN).unwrap(), format!("claude/{RUN}"));
    assert!(shipyard_core::delivery::is_tool_branch(
        &f.branch(RUN).unwrap()
    ));
    // The same call gives the same folder (a restart).
    assert_eq!(f.dir(RUN, Workspace::Shared, None).unwrap(), dir);
    // Work in the run folder: the working copy of the person stays clean on `main`.
    write(&dir, "src/new.rs", "fn new() {}\n");
    write(&dir, "src/lib.rs", "one\nTWO\n");
    let main = Repo::open(&f.root).unwrap().status().unwrap();
    assert!(main.is_clean() && main.branch.as_deref() == Some("main"));
    // A step with no workspace gets an empty folder that is not in the repository.
    let none = f.dir(RUN, Workspace::None, None).unwrap();
    assert!(none.is_dir() && !none.join("src").exists());
}

#[test]
fn changes_review_input_line_commit_and_rename_work_in_the_run_folder() {
    let (_t, f) = fixture();
    let dir = f.dir(RUN, Workspace::Shared, None).unwrap();
    write(&dir, "src/new.rs", "fn new() {}\n");
    write(&dir, "src/lib.rs", "one\nTWO\n");

    let ch = f.changes(RUN, "main").unwrap();
    assert_eq!(ch.uncommitted, ["src/lib.rs", "src/new.rs"]);
    assert_eq!(ch.files, ["src/lib.rs", "src/new.rs"]);
    assert!(
        f.changes(RUN, "nope")
            .unwrap_err()
            .contains("does not exist")
    );

    let input = f.review_input(RUN, "main").unwrap();
    assert_eq!(input.head.len(), 40);
    assert!(input.diff.contains("+TWO") && input.diff.contains("+fn new() {}"));
    assert_eq!(
        input.specs,
        [("docs/openspec/a/spec.md".to_string(), "# A\n".to_string())]
    );
    assert_eq!(
        f.line(RUN, "src/lib.rs", 2).unwrap().as_deref(),
        Some("TWO")
    );
    assert_eq!(f.line(RUN, "src/lib.rs", 3).unwrap(), None);

    let sha = f
        .commit(RUN, &ch.uncommitted, "feat(src): add new", "Ticket: SHIP-1")
        .unwrap();
    assert_eq!(sha.len(), 40);
    assert!(f.changes(RUN, "main").unwrap().uncommitted.is_empty());
    assert_eq!(f.changes(RUN, "main").unwrap().files.len(), 2);

    // Rename before the first push, in a linked worktree.
    f.rename_branch(RUN, "feat/src/add-new").unwrap();
    assert_eq!(f.branch(RUN).unwrap(), "feat/src/add-new");
    // The rebase onto an unmoved base changes nothing.
    assert_eq!(f.rebase(RUN, "main").unwrap(), Merge::Clean);
}

#[test]
fn the_digest_waits_for_a_change_and_an_unknown_runner_is_an_error_not_a_hang() {
    let (_t, mut f) = fixture();
    let dir = f.dir(RUN, Workspace::Shared, None).unwrap();
    assert_eq!(f.digest(RUN, "main").unwrap(), None, "no change, no digest");
    write(&dir, "src/lib.rs", "one\nTWO\n");
    f.runner = "no-such-runner".into();
    // The engine drops this error: the pull request body has no digest.
    assert!(
        f.digest(RUN, "main")
            .unwrap_err()
            .contains("unknown runner")
    );
}

#[test]
fn children_start_from_the_run_branch_join_as_one_commit_each_and_go() {
    let (_t, f) = fixture();
    let run_dir = f.dir(RUN, Workspace::Shared, None).unwrap();
    let wt = |c: &str| f.dir(RUN, Workspace::Worktree, Some(c)).unwrap();
    let (a, b) = (wt("build-1"), wt("build-2"));
    assert_ne!(a, b);
    write(&a, "a.txt", "a\n");
    write(&b, "b.txt", "b\n");
    // Each child commits what it left, then squashes onto the run branch.
    let m1 = "feat(build): add a (build-1)";
    assert_eq!(f.merge_child(RUN, "build-1", m1).unwrap(), Merge::Clean);
    assert_eq!(
        f.merge_child(RUN, "build-2", "feat(build): add b (build-2)")
            .unwrap(),
        Merge::Clean
    );
    assert!(run_dir.join("a.txt").exists() && run_dir.join("b.txt").exists());
    let log = Repo::open(&run_dir).unwrap().log(0, 5).unwrap();
    assert_eq!(log.commits[0].summary, "feat(build): add b (build-2)");
    assert_eq!(log.commits[1].summary, m1);
    f.remove_child(RUN, "build-1").unwrap();
    assert!(!a.exists());
    let branches = Repo::open(&f.root).unwrap().branches().unwrap();
    assert!(
        !branches
            .iter()
            .any(|x| x.name == child_branch(RUN, "build-1").unwrap())
    );
    // The rest goes at the close. A dirty one stays and the error names its file.
    write(&b, "dirty.txt", "x\n");
    let err = f.remove_worktrees(RUN).unwrap_err();
    assert!(err.contains("worktree"), "{err}");
}

#[test]
fn a_child_conflict_is_a_result_and_leaves_the_run_folder_as_it_was() {
    let (_t, f) = fixture();
    let run_dir = f.dir(RUN, Workspace::Shared, None).unwrap();
    let child = f.dir(RUN, Workspace::Worktree, Some("build-1")).unwrap();
    // The run branch and the child change the same line.
    write(&child, "src/lib.rs", "one\nCHILD\n");
    write(&run_dir, "src/lib.rs", "one\nRUN\n");
    let repo = Repo::open(&run_dir).unwrap();
    repo.stage(&["src/lib.rs".into()]).unwrap();
    repo.commit("feat(src): run edit", "").unwrap();
    let out = f
        .merge_child(RUN, "build-1", "feat(build): child (build-1)")
        .unwrap();
    assert_eq!(out, Merge::Conflicts(vec!["src/lib.rs".into()]));
    assert_eq!(
        fs::read_to_string(run_dir.join("src/lib.rs")).unwrap(),
        "one\nRUN\n"
    );
}

#[test]
fn a_gate_reports_pass_fail_counts_and_a_timeout() {
    let tmp = tempfile::tempdir().unwrap();
    let log = tmp.path().join("g.log");
    let go = |c: &str, limit| run_gate(tmp.path(), &log, c, limit);
    let ok = go(
        "echo building; echo 'test result: ok. 12 passed'",
        Duration::from_secs(10),
    );
    assert!(
        ok.passed && ok.counts == "test result: ok. 12 passed",
        "{ok:?}"
    );
    let bad = go("echo 'FAILED 3 tests'; exit 1", Duration::from_secs(10));
    assert!(!bad.passed && bad.counts == "FAILED 3 tests", "{bad:?}");
    assert!(!go("exit 1", Duration::from_secs(10)).counts.is_empty());
    let slow = go("sleep 5", Duration::from_millis(300));
    assert!(
        !slow.passed && slow.counts.starts_with("timeout"),
        "{slow:?}"
    );
    assert!(!log.exists(), "the output file goes");
    #[cfg(unix)]
    gate_kills_the_children_of_the_command();
}

/// A timeout and a shutdown kill the children of a gate command too. It runs inside the gate
/// test: `kill_gates` stops every gate of the process, so no other test may run one meanwhile.
#[cfg(unix)]
fn gate_kills_the_children_of_the_command() {
    let tmp = tempfile::tempdir().unwrap();
    let pid_file = tmp.path().join("child.pid");
    // A zombie (killed, not yet reaped) counts as ended: in a container PID 1 may never reap it.
    let alive = |pid: i32| {
        std::process::Command::new("ps")
            .args(["-o", "stat=", "-p", &pid.to_string()])
            .output()
            .is_ok_and(|o| {
                let stat = String::from_utf8_lossy(&o.stdout);
                !stat.trim().is_empty() && !stat.trim().starts_with('Z')
            })
    };
    let read_pid = || {
        for _ in 0..100 {
            if let Ok(t) = fs::read_to_string(&pid_file)
                && let Ok(p) = t.trim().parse::<i32>()
            {
                return p;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        panic!("the child did not start");
    };
    let gone = |pid: i32| {
        (0..100).any(|_| {
            !alive(pid) || {
                std::thread::sleep(Duration::from_millis(20));
                false
            }
        })
    };
    // A timeout: `sleep` is a child of the shell, in the same group.
    let command = format!("sleep 30 & echo $! > {}; wait", pid_file.display());
    let log = tmp.path().join("g.log");
    let slow = run_gate(tmp.path(), &log, &command, Duration::from_millis(600));
    assert!(slow.counts.starts_with("timeout"), "{slow:?}");
    let pid = read_pid();
    assert!(gone(pid), "the child of the gate command is still alive");

    // A shutdown while the gate runs.
    fs::remove_file(&pid_file).unwrap();
    let dir = tmp.path().to_path_buf();
    let run = std::thread::spawn(move || {
        run_gate(&dir, &dir.join("h.log"), &command, Duration::from_secs(60))
    });
    let pid = read_pid();
    kill_gates();
    let done = run.join().unwrap();
    assert!(!done.passed, "{done:?}");
    assert!(gone(pid), "the child of the gate command is still alive");
}

fn writer(folders: Arc<Folders>) -> ProjectWriter {
    let conns = Arc::new(Connections::new(
        &folders.data,
        Arc::new(MemoryStore::default()),
        Arc::new(FakeHttp::new()),
    ));
    ProjectWriter {
        conns,
        tracker: "issues".into(),
        forge: None,
        folders,
    }
}

#[test]
fn a_push_goes_from_the_run_folder_to_the_remote_and_a_protected_base_is_refused() {
    let (t, f) = fixture();
    let remote = t.path().join("remote.git");
    git(
        t.path(),
        &["init", "-q", "--bare", remote.to_str().unwrap()],
    );
    // The remote is set on the repository that the worktrees share.
    git(
        &f.root,
        &["remote", "add", "origin", remote.to_str().unwrap()],
    );
    let dir = f.dir(RUN, Workspace::Shared, None).unwrap();
    write(&dir, "x.txt", "x\n");
    f.commit(RUN, &["x.txt".to_string()], "feat: add x", "")
        .unwrap();
    f.rename_branch(RUN, "feat/src/add-x").unwrap();
    let w = writer(Arc::new(f));
    let push = |base: &str, lease| Write::Push {
        run: RUN.into(),
        branch: "feat/src/add-x".into(),
        base: base.into(),
        force_with_lease: lease,
    };
    w.send(&push("develop", false)).unwrap();
    let tip = git(&remote, &["rev-parse", "feat/src/add-x"]);
    assert_eq!(tip, w.folders.run_repo(RUN).unwrap().head_sha().unwrap());
    // A write that names another branch than the one of the run folder pushes nothing.
    let other = Write::Push {
        run: RUN.into(),
        branch: "feat/src/other".into(),
        base: "develop".into(),
        force_with_lease: false,
    };
    assert!(
        w.send(&other)
            .unwrap_err()
            .contains("not on `feat/src/other`")
    );
    // With lease on a branch that moved nowhere: allowed. Pushing the base itself: refused.
    w.send(&push("develop", true)).unwrap();
    assert!(w.send(&push("feat/src/add-x", false)).is_err());
    // No forge: the pull request writes say so.
    let open = Write::OpenPr {
        run: RUN.into(),
        branch: "feat/src/add-x".into(),
        base: "develop".into(),
        title: "feat: x".into(),
        body: String::new(),
        labels: vec![],
        reviewers: vec![],
        draft: true,
    };
    assert_eq!(w.send(&open).unwrap_err(), NO_FORGE);
    // The branch must be the one of the run folder, and never the base.
    let on = |branch: &str, base: &str| Write::OpenPr {
        run: RUN.into(),
        branch: branch.into(),
        base: base.into(),
        title: "feat: x".into(),
        body: String::new(),
        labels: vec![],
        reviewers: vec![],
        draft: true,
    };
    let wrong = w.send(&on("feat/src/other", "develop")).unwrap_err();
    assert!(wrong.contains("not on `feat/src/other`"), "{wrong}");
    let same = w.send(&on("feat/src/add-x", "feat/src/add-x")).unwrap_err();
    assert!(same.contains("is the base"), "{same}");
}

#[test]
fn an_approval_names_the_exact_write() {
    let w = Write::Push {
        run: RUN.into(),
        branch: "feat/src/add-x".into(),
        base: "develop".into(),
        force_with_lease: true,
    };
    let (kind, summary, detail, force) = describe(&w);
    assert_eq!(kind, "push");
    assert!(summary.contains("Force push feat/src/add-x with lease") && force);
    assert_eq!(detail, "Base: develop");
    let (kind, summary, detail, _) = describe(&Write::Transition {
        key: "SHIP-1".into(),
        status: "In Progress".into(),
    });
    assert_eq!(
        (kind, summary.as_str(), detail.as_str()),
        ("transition", "Move SHIP-1 to In Progress", "")
    );
    let (_, summary, detail, _) = describe(&Write::Comment {
        key: "SHIP-1".into(),
        body: "<!-- shipyard:q Q-001 -->\n**Q-001** Which?".into(),
    });
    assert_eq!(summary, "Comment on SHIP-1");
    assert!(detail.contains("Which?"));
}

#[test]
fn a_write_without_its_switch_is_an_approval_that_a_click_sends_or_drops() {
    use crate::factory::tests::fx;
    use crate::factory::{run_get, unblock};
    let fx = fx(shipyard_core::pickup::Writes::default());
    let run = fx.start("SHIP-1");
    // The ticket move at the start waits: the switch is off.
    let list = approvals(&fx.s).unwrap();
    assert!(!list.is_empty());
    let first = &list[0];
    assert_eq!(
        (first.run.as_str(), first.key.as_str()),
        (run.as_str(), "SHIP-1")
    );
    assert_eq!(first.kind, "transition");
    assert!(
        first.summary.starts_with("Move SHIP-1 to "),
        "{}",
        first.summary
    );
    assert!(fx.writer.sent().is_empty());

    approve(&fx.s, first.id).unwrap();
    assert_eq!(fx.writer.sent().len(), 1, "one click, one write");
    assert!(
        approve(&fx.s, first.id).is_err(),
        "an approval is used once"
    );

    // A rejection drops the write and blocks the run.
    let rest = approvals(&fx.s).unwrap();
    let next = rest.first().expect("a label write waits too");
    reject(&fx.s, next.id).unwrap();
    assert_eq!(
        run_get(&fx.s, &run).unwrap().unwrap().state,
        RunState::Blocked
    );
    unblock(&fx.s, &run).unwrap();
    assert_eq!(
        run_get(&fx.s, &run).unwrap().unwrap().state,
        RunState::Working
    );
}
