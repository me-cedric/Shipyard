//! The join of the child worktrees at fan-in (spec `factory` REQ-013, `delivery` REQ-025). A fake
//! git, a fake runner and a fake clock drive it.

mod fx;

use fx::{Fx, writes};
use serde_json::json;
use shipyard_core::run::{Cause, RunState};
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
fn a_second_conflict_starts_a_fixer_in_the_run_worktree() {
    let fx = Fx::new(writes(true), &[]);
    let run = two_of_three(&fx);
    fx.git.conflict("build-2", &[".gitleaksignore"]);
    fx.done(&run, "build-3");
    fx.done(&run, "build-2");

    // No block: the child does its task again in the run worktree, with no click (REQ-057).
    assert_eq!(fx.state(&run), RunState::Working);
    assert!(blocked(&fx, &run).is_empty());
    assert!(
        fx.logged(&run, "note")
            .iter()
            .any(|n| n["fixer"] == "merge conflict: child build-2: .gitleaksignore")
    );
    assert_eq!(fx.agents.running(), ["build-2"]);
    let brief = fx.agents.briefs().pop().unwrap();
    assert!(brief.resume.is_none());
    assert!(
        brief.prompt.contains("conflicted twice"),
        "{}",
        brief.prompt
    );
    assert!(brief.prompt.contains(".gitleaksignore"), "{}", brief.prompt);
    let (_, child) = fx.ws.calls().pop().unwrap();
    assert_eq!(child, None, "the fixer works in the run worktree");

    // The fixer's change is on the run branch: the join does not merge it again.
    fx.done(&run, "build-2");
    assert_eq!(fx.git.count("merge_child build-2"), 2);
    assert_eq!(fx.git.count("remove_child build-2"), 2);
    assert_eq!(fx.state(&run), RunState::SelfReview);
    assert_eq!(fx.agents.running(), ["review"]);
}

#[test]
fn a_fixer_with_no_fix_round_left_escalates_and_a_person_who_fixes_it_unblocks() {
    let fx = Fx::build(writes(true), &[], Default::default(), |p| {
        let wf = p.files.workflows.get_mut("feature").unwrap();
        wf.limits.fix_rounds = Some(0);
    });
    let run = two_of_three(&fx);
    fx.git.conflict("build-2", &["src/a.rs", "src/b.rs"]);
    fx.done(&run, "build-3");
    fx.done(&run, "build-2");
    assert_eq!(fx.state(&run), RunState::Blocked);
    let e = fx.f.run_info(&run).unwrap().escalation.unwrap();
    assert_eq!(e.cause, Cause::FixRounds);
    assert_eq!(
        e.lines,
        ["merge conflict: child build-2: src/a.rs, src/b.rs"]
    );
    assert!(fx.agents.running().is_empty());

    fx.git.conflict("build-2", &[]);
    fx.f.unblock(&run).unwrap();
    fx.f.pump();
    assert_eq!(fx.git.count("merge_child build-2"), 3);
    assert_eq!(fx.git.count("remove_child"), 4);
    assert_eq!(fx.state(&run), RunState::SelfReview);
    assert_eq!(fx.agents.running(), ["review"]);
}

#[test]
fn a_git_error_waits_with_the_backoff_then_escalates_after_30_min() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.git.fail("merge_child", Some("the worktree is locked"));
    fx.done(&run, "fix");
    // A failed guard: no retry is used (REQ-056).
    assert_eq!(fx.state(&run), RunState::RetryQueued);
    assert!(blocked(&fx, &run).is_empty());
    for _ in 0..12 {
        fx.advance(300);
    }
    assert_eq!(fx.state(&run), RunState::Blocked);
    let e = fx.f.run_info(&run).unwrap().escalation.unwrap();
    assert_eq!(e.cause, Cause::Guard);
    assert_eq!(
        blocked(&fx, &run),
        ["merge of child fix: the worktree is locked"]
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
