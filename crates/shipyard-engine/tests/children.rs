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

#[test]
fn a_conflict_blocks_the_run_keeps_the_worktrees_and_a_click_joins_the_rest() {
    let fx = Fx::new(writes(true), &[]);
    let run = two_of_three(&fx);
    fx.git.conflict("build-2", &["src/a.rs", "src/b.rs"]);
    fx.done(&run, "build-3");

    assert_eq!(fx.state(&run), RunState::Blocked);
    let blocked: Vec<_> = fx
        .logged(&run, "note")
        .into_iter()
        .filter_map(|n| n["blocked"].as_str().map(str::to_string))
        .collect();
    assert_eq!(
        blocked,
        ["merge conflict: child build-2: src/a.rs, src/b.rs"]
    );
    // The join stopped at the conflict: build-3 waits, no worktree is gone, no reviewer runs.
    assert_eq!(fx.git.count("merge_child build-3"), 0);
    assert_eq!(fx.git.count("remove_child"), 0);
    assert!(fx.agents.running().is_empty());

    // A person fixes the conflict and clicks.
    fx.git.conflict("build-2", &[]);
    fx.f.unblock(&run).unwrap();
    fx.f.pump();
    assert_eq!(
        fx.git.count("merge_child build-1"),
        1,
        "a joined child is not joined again"
    );
    assert_eq!(fx.git.count("merge_child build-2"), 2);
    assert_eq!(fx.git.count("merge_child build-3"), 1);
    assert_eq!(fx.git.count("remove_child"), 3);
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
