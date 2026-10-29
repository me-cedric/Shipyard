//! Ask and plan change no file, agent mode works in a worktree (spec `assistant`, REQ-007 to
//! REQ-009). The fake CLI writes a file in its working folder, as a runner that edits would.
#![cfg(unix)]

use shipyard_agents::assistant::*;
use shipyard_agents::assistant_modes::{diff, discard, run_spec, workdir};
use shipyard_agents::fake::program;
use shipyard_agents::runner::Mode as RunMode;
use shipyard_core::assistant::*;
use std::path::{Path, PathBuf};
use std::process::Command;

fn git(dir: &Path, args: &[&str]) {
    let ok = Command::new("git")
        .args(["-c", "user.name=t", "-c", "user.email=t@t.test"])
        .args(args)
        .current_dir(dir)
        .status()
        .unwrap()
        .success();
    assert!(ok, "git {args:?}");
}

struct Fx {
    tmp: tempfile::TempDir,
    root: PathBuf,
    data: PathBuf,
    bin: PathBuf,
}

fn fx() -> Fx {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("repo");
    std::fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "-q", "-b", "main"]);
    std::fs::write(root.join("a.txt"), "one\n").unwrap();
    git(&root, &["add", "."]);
    git(&root, &["commit", "-q", "-m", "init"]);
    let bin = program(
        tmp.path(),
        "fake-cli",
        r#"cat > /dev/null
echo edited > changed.txt
echo '{"type":"result","subtype":"success","is_error":false,"session_id":"s","usage":{}}'"#,
    );
    Fx {
        data: tmp.path().join("data"),
        tmp,
        root,
        bin,
    }
}

fn thread(mode: AssistantMode) -> Thread {
    let mut settings = ThreadSettings::new("claude");
    settings.mode = mode;
    Thread {
        id: "th-1".into(),
        project: "ship".into(),
        title: String::new(),
        settings,
        context: Context::default(),
        draft: String::new(),
        session: None,
        granted: vec![],
        messages: vec![],
        usage: Usage::default(),
        worktree: None,
        created: 0,
        updated: 0,
    }
}

fn turn(f: &Fx, t: &mut Thread) -> TurnOutput {
    let dir = workdir(&f.data, &f.root, t).unwrap();
    let ctx = Context::default();
    run_turn(TurnInput {
        kind: TurnKind::Send,
        settings: &t.settings,
        context: &ctx,
        quotes: &[],
        text: "edit a file",
        rules: "",
        dir: &dir,
        scratch: &f.tmp.path().join("scratch"),
        session: None,
        granted: &t.granted,
        secrets: &[],
        program: Some(f.bin.clone()),
    })
}

#[test]
fn ask_and_plan_run_read_only_in_the_project_folder() {
    for mode in [AssistantMode::Ask, AssistantMode::Plan] {
        let mut s = ThreadSettings::new("claude");
        s.mode = mode;
        s.permission = Permission::Full;
        let spec = run_spec(
            &s,
            &["Edit".into()],
            "p".into(),
            Path::new("/x"),
            Path::new("/y"),
            None,
        );
        assert_eq!(spec.mode, RunMode::Plan, "{mode:?}");
        assert_eq!(
            spec.allowed_tools,
            ["Read", "Grep", "Glob"],
            "no write tool, a grant does not count"
        );
        let f = fx();
        let mut t = thread(mode);
        assert_eq!(workdir(&f.data, &f.root, &mut t).unwrap(), f.root);
        assert!(t.worktree.is_none());
    }
}

#[test]
fn agent_mode_edits_in_its_own_worktree_and_the_main_checkout_stays_clean() {
    let f = fx();
    let mut t = thread(AssistantMode::Agent);
    t.settings.permission = Permission::Edit;
    let o = turn(&f, &mut t);
    assert_eq!(o.message.state, MessageState::Done);
    let w = t.worktree.clone().expect("a worktree");
    assert!(
        Path::new(&w.path)
            .canonicalize()
            .unwrap()
            .starts_with(f.data.canonicalize().unwrap()),
        "the worktree is in the app data"
    );
    assert!(Path::new(&w.path).join("changed.txt").exists());
    assert!(
        !f.root.join("changed.txt").exists(),
        "the main checkout is unchanged"
    );
    let files = diff(&w).unwrap();
    assert_eq!(
        files.iter().map(|d| d.path.as_str()).collect::<Vec<_>>(),
        ["changed.txt"]
    );
    // Q-047: the next turn finds the same worktree.
    assert_eq!(
        workdir(&f.data, &f.root, &mut t).unwrap(),
        PathBuf::from(&w.path)
    );
    // The change is not lost on a discard without force; the person acts first.
    assert!(discard(&f.data, &f.root, &mut t, false).is_err());
    assert!(t.worktree.is_some());
    discard(&f.data, &f.root, &mut t, true).unwrap();
    assert!(t.worktree.is_none() && !Path::new(&w.path).exists());
}

#[test]
fn the_permission_level_maps_to_the_allowed_tools_of_agent_mode() {
    let mut s = ThreadSettings::new("claude");
    s.mode = AssistantMode::Agent;
    let base = s.clone();
    let tools = |p| {
        let s = ThreadSettings {
            permission: p,
            ..base.clone()
        };
        run_spec(&s, &[], "p".into(), Path::new("/x"), Path::new("/y"), None).allowed_tools
    };
    assert_eq!(tools(Permission::ReadOnly), ["Read", "Grep", "Glob"]);
    assert!(tools(Permission::Edit).contains(&"Write".into()));
    assert!(tools(Permission::Full).contains(&"Bash".into()));
    let spec = run_spec(
        &s,
        &["Bash(git diff:*)".into()],
        "p".into(),
        Path::new("/x"),
        Path::new("/y"),
        Some("sess"),
    );
    assert_eq!(
        (spec.mode, spec.resume.as_deref()),
        (RunMode::Auto, Some("sess"))
    );
    assert!(spec.allowed_tools.contains(&"Bash(git diff:*)".into()));
}
