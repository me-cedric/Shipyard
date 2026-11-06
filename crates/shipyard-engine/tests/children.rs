//! The join of the child worktrees at fan-in (spec `factory` REQ-013, `delivery` REQ-025). A fake
//! git, a fake runner and a fake clock drive it.

mod fx;

use fx::{Fx, writes};
use serde_json::json;
use shipyard_core::run::RunState;
use shipyard_mcp::tools::agent::Outcome;

/// A feature run with three children, all done except the last one.
fn two_of_three(fx: &Fx) -> String {
    let run = fx.start("SHIP-1", &[]);
    fx.done(&run, "grill");
    fx.report(
        &run,
        "plan",
        Outcome::Done,
        json!({"tasks": ["a", "b", "c"]}),
    );
    fx.f.approve_plan(&run).unwrap();
    fx.done(&run, "build-1");
    fx.done(&run, "build-2");
    run
}

#[test]
fn fan_in_joins_each_child_in_order_then_removes_the_worktrees() {
    let fx = Fx::new(writes(true), &[]);
    let run = two_of_three(&fx);
    assert_eq!(
        fx.git.count("merge_child"),
        0,
        "no join before the last child"
    );
    fx.done(&run, "build-3");

    let calls: Vec<String> = fx
        .git
        .calls()
        .into_iter()
        .filter(|c| c.contains("child"))
        .collect();
    assert_eq!(
        calls,
        [
            "merge_child build-1",
            "merge_child build-2",
            "merge_child build-3",
            "remove_child build-1",
            "remove_child build-2",
            "remove_child build-3",
        ]
    );
    // The review follows the join.
    assert_eq!(fx.state(&run), RunState::SelfReview);
    assert_eq!(fx.agents.running(), ["review"]);
}

#[test]
fn a_single_worktree_step_is_joined_too() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    assert_eq!(fx.git.count("merge_child fix"), 1);
    assert_eq!(fx.git.count("remove_child fix"), 1);
    assert_eq!(fx.state(&run), RunState::SelfReview);
}

/// The texts of the `blocked` notes of the run.
fn blocked(fx: &Fx, run: &str) -> Vec<String> {
    fx.logged(run, "note")
        .into_iter()
        .filter_map(|n| n["blocked"].as_str().map(str::to_string))
        .collect()
}

#[test]
fn a_first_conflict_runs_the_child_again_from_the_run_branch() {
    let fx = Fx::new(writes(true), &[]);
    let run = two_of_three(&fx);
    fx.git.conflict("build-2", &[".gitleaksignore"]);
    fx.done(&run, "build-3");

    // No block: the siblings join, the child that conflicted runs again in a fresh worktree.
    assert_eq!(fx.state(&run), RunState::Working);
    assert!(blocked(&fx, &run).is_empty());
    assert_eq!(fx.git.count("merge_child build-1"), 1);
    assert_eq!(fx.git.count("merge_child build-3"), 1);
    assert_eq!(fx.git.count("remove_child"), 1);
    assert_eq!(fx.git.count("remove_child build-2"), 1);
    assert!(
        fx.logged(&run, "note")
            .iter()
            .any(|n| *n == json!({"redo": "build-2", "files": [".gitleaksignore"], "by": "solo"}))
    );
    assert_eq!(fx.agents.running(), ["build-2"]);
    let brief = fx.agents.briefs().pop().unwrap();
    assert_eq!(brief.step, "build-2");
    assert!(brief.resume.is_none(), "a redo starts a new session");
    assert!(
        brief
            .prompt
            .contains("conflicted with another task on .gitleaksignore"),
        "{}",
        brief.prompt
    );
    let dirs = fx.ws.calls();
    let made = dirs.iter().filter(|(_, c)| c.as_deref() == Some("build-2"));
    assert_eq!(made.count(), 2, "a new worktree for the redo");

    // The redo joins on top of the siblings.
    fx.git.conflict("build-2", &[]);
    fx.done(&run, "build-2");
    assert_eq!(fx.git.count("merge_child build-1"), 1);
    assert_eq!(fx.git.count("merge_child build-2"), 2);
    assert_eq!(fx.git.count("merge_child build-3"), 1);
    assert_eq!(fx.git.count("remove_child"), 4);
    assert_eq!(fx.state(&run), RunState::SelfReview);
    assert_eq!(fx.agents.running(), ["review"]);
}

#[test]
fn a_second_conflict_blocks_and_an_unblock_with_a_note_runs_the_child_again() {
    let fx = Fx::new(writes(true), &[]);
    let run = two_of_three(&fx);
    fx.git.conflict("build-2", &[".gitleaksignore"]);
    fx.done(&run, "build-3");
    fx.done(&run, "build-2");

    assert_eq!(fx.state(&run), RunState::Blocked);
    assert_eq!(
        blocked(&fx, &run),
        ["merge conflict: child build-2: .gitleaksignore"]
    );
    // The siblings stay joined, the worktree of the child stays for a person.
    assert_eq!(fx.git.count("merge_child build-1"), 1);
    assert_eq!(fx.git.count("merge_child build-3"), 1);
    assert_eq!(fx.git.count("remove_child"), 1);
    assert!(fx.agents.running().is_empty());

    // The person tells the agent what to do: the join tries again, then the child runs again.
    fx.f.unblock_with(&run, Some("Keep the lines of both tasks."))
        .unwrap();
    fx.f.pump();
    assert!(
        fx.logged(&run, "note")
            .iter()
            .any(|n| *n == json!({"note": "Keep the lines of both tasks.", "by": "person"}))
    );
    assert_eq!(fx.git.count("merge_child build-2"), 3);
    assert_eq!(fx.state(&run), RunState::Working);
    assert_eq!(fx.agents.running(), ["build-2"]);
    let brief = fx.agents.briefs().pop().unwrap();
    assert!(brief.prompt.contains("Keep the lines of both tasks."));

    fx.git.conflict("build-2", &[]);
    fx.done(&run, "build-2");
    assert_eq!(fx.git.count("merge_child build-1"), 1);
    assert_eq!(fx.git.count("merge_child build-3"), 1);
    assert_eq!(fx.state(&run), RunState::SelfReview);
}

#[test]
fn a_person_who_fixes_the_conflict_unblocks_and_the_join_goes_on() {
    let fx = Fx::new(writes(true), &[]);
    let run = two_of_three(&fx);
    fx.git.conflict("build-2", &["src/a.rs", "src/b.rs"]);
    fx.done(&run, "build-3");
    fx.done(&run, "build-2");
    assert_eq!(fx.state(&run), RunState::Blocked);

    fx.git.conflict("build-2", &[]);
    fx.f.unblock(&run).unwrap();
    fx.f.pump();
    assert_eq!(fx.git.count("merge_child build-2"), 3);
    assert_eq!(fx.git.count("remove_child"), 4);
    assert_eq!(fx.state(&run), RunState::SelfReview);
    assert_eq!(fx.agents.running(), ["review"]);
}

#[test]
fn a_git_error_blocks_the_run_with_the_message() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.git.fail("merge_child", Some("the worktree is locked"));
    fx.done(&run, "fix");
    assert_eq!(fx.state(&run), RunState::Blocked);
    assert!(
        fx.logged(&run, "note")
            .iter()
            .any(|n| { n["blocked"] == "merge of child fix: the worktree is locked" })
    );
}

#[test]
fn a_worktree_that_stays_is_logged_and_does_not_stop_the_run() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.git.fail("remove_child", Some("busy"));
    fx.done(&run, "fix");
    assert_eq!(fx.state(&run), RunState::SelfReview);
    assert!(
        fx.logged(&run, "note")
            .iter()
            .any(|n| n["note"] == "worktree of fix stays: busy")
    );
}

#[test]
fn each_child_joins_as_one_conventional_commit() {
    let fx = Fx::new(writes(true), &[]);
    let run = two_of_three(&fx);
    fx.done(&run, "build-3");
    let messages = fx.git.merge_messages();
    assert_eq!(messages.len(), 3);
    // `SHIP-1` is a task in the fake tracker: the type comes from its kind, the scope from the step.
    for (i, m) in messages.iter().enumerate() {
        assert!(shipyard_core::code::check_summary(m).is_ok(), "{m}");
        assert!(m.starts_with("feat(build): "), "{m}");
        assert!(m.ends_with(&format!("(build-{})", i + 1)), "{m}");
    }
}
