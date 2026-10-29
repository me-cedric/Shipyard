//! The pull request step (spec `delivery`, REQ-007 to REQ-017). A fake git, a fake forge and a
//! fake writer drive it. No process, no network.

mod fx;

use fx::{Fx, writes};
use shipyard_core::pickup::Writes;
use shipyard_core::run::RunState;
use shipyard_engine::approvals::Write;
use shipyard_engine::run_engine::Config;

const FILES: [&str; 2] = [
    "crates/shipyard-engine/src/a.rs",
    "crates/shipyard-engine/src/b.rs",
];

/// A bug run, built, joined and reviewed with no finding: the pull request step is next.
fn to_pr(fx: &Fx) -> String {
    fx.git.set_changes(&FILES, &FILES);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    fx.done(&run, "review");
    run
}

fn open_pr(fx: &Fx) -> Option<Write> {
    fx.writer
        .sent()
        .into_iter()
        .find(|w| matches!(w, Write::OpenPr { .. }))
}

fn pushes(fx: &Fx) -> Vec<Write> {
    fx.writer
        .sent()
        .into_iter()
        .filter(|w| matches!(w, Write::Push { .. }))
        .collect()
}

fn git(fx: &Fx, prefix: &str) -> Vec<String> {
    fx.git
        .calls()
        .into_iter()
        .filter(|c| c.starts_with(prefix))
        .collect()
}

#[test]
fn a_tool_branch_is_renamed_committed_rebased_pushed_and_opened_as_a_draft() {
    let fx = Fx::new(writes(true), &[]);
    fx.pulls
        .set_labels(&["feat", "crates", "breaking-change", "billing"]);
    let run = to_pr(&fx);
    assert_eq!(fx.state(&run), RunState::PROpen);

    // The branch follows `<type>/<area>/<kebab>` before the push (REQ-007).
    let branch = "feat/shipyard-engine/title-ship-1";
    assert_eq!(git(&fx, "rename"), [format!("rename {branch}")]);
    // One commit with the files of the change and a conventional message (REQ-008).
    assert_eq!(
        git(&fx, "commit"),
        [format!(
            "commit {} | feat(shipyard-engine): title SHIP-1 | Ticket: SHIP-1",
            FILES.join(",")
        )]
    );
    // Rename, commit, rebase onto the base, then the push: in this order.
    let calls = fx.git.calls();
    let at = |p: &str| calls.iter().position(|c| c.starts_with(p)).unwrap();
    assert!(at("rename") < at("commit") && at("commit") < at("rebase develop"));

    let Write::Push {
        branch: pushed,
        base,
        force_with_lease,
        ..
    } = &pushes(&fx)[0]
    else {
        unreachable!()
    };
    assert_eq!(
        (pushed.as_str(), base.as_str(), *force_with_lease),
        (branch, "develop", false)
    );

    let Some(Write::OpenPr {
        title,
        body,
        labels,
        reviewers,
        draft,
        base,
        branch: source,
        ..
    }) = open_pr(&fx)
    else {
        panic!("no pull request was opened")
    };
    assert_eq!(source, branch);
    assert_eq!(base, "develop");
    assert!(draft, "a run opens a draft (REQ-013)");
    assert_eq!(title, "feat(shipyard-engine): title SHIP-1");
    assert_eq!(reviewers, ["alice"]);
    // Existing labels only: the type label and the area label that exist. `billing` and
    // `breaking-change` are never added, and nothing is created (REQ-011).
    assert_eq!(labels, ["feat", "crates"]);
    // Opening paragraph, gate, one item for each ticket, and the link to the run (REQ-010, REQ-017).
    assert!(
        body.starts_with(&format!("Delivers SHIP-1: title SHIP-1. Run: run:{run}")),
        "{body}"
    );
    assert!(body.contains("## Gate") && body.contains("## Tickets"));
    assert!(body.contains("[SHIP-1](https://tracker.test/SHIP-1) title SHIP-1"));
    assert!(!body.contains("## Impacts"), "no digest, no empty section");
    for text in [&title, &body] {
        let low = text.to_lowercase();
        assert!(!low.contains("co-authored-by") && !low.contains("generated with"));
    }

    // The run records `pr:<forge>:<number>` (REQ-017).
    assert_eq!(fx.f.run_info(&run).unwrap().pr, Some(7));
    assert!(
        fx.logged(&run, "pr")
            .iter()
            .any(|p| p["ref"] == "pr:github:7")
    );
}

#[test]
fn a_branch_that_follows_the_pattern_keeps_its_name() {
    let fx = Fx::new(writes(true), &[]);
    fx.git.set_branch("fix/engine/login");
    to_pr(&fx);
    assert!(git(&fx, "rename").is_empty());
    let Some(Write::OpenPr { branch, .. }) = open_pr(&fx) else {
        panic!("no pull request")
    };
    assert_eq!(branch, "fix/engine/login");
}

#[test]
fn the_commit_holds_only_the_files_that_the_git_side_reports() {
    let fx = Fx::new(writes(true), &[]);
    fx.git
        .set_changes(&["src/a.rs"], &["src/a.rs", "src/old.rs"]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    fx.done(&run, "review");
    assert_eq!(git(&fx, "commit").len(), 1);
    assert!(git(&fx, "commit")[0].starts_with("commit src/a.rs | "));
}

#[test]
fn the_base_is_the_declared_one_else_develop_else_the_default_branch() {
    let fx = Fx::new(writes(true), &[]);
    to_pr(&fx);
    let Some(Write::OpenPr { base, .. }) = open_pr(&fx) else {
        panic!()
    };
    assert_eq!(base, "develop");

    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.base = Some("main".into());
    });
    to_pr(&fx);
    let Some(Write::OpenPr { base, .. }) = open_pr(&fx) else {
        panic!()
    };
    assert_eq!(base, "main");

    let fx = Fx::new(writes(true), &[]);
    fx.pulls.set_branches(&["main", "next"], "main");
    to_pr(&fx);
    let Some(Write::OpenPr { base, .. }) = open_pr(&fx) else {
        panic!()
    };
    assert_eq!(base, "main");
}

#[test]
fn with_the_switches_off_each_write_is_one_approval_and_one_click_sends_it() {
    let fx = Fx::new(Writes::default(), &[]);
    let run = to_pr(&fx);
    // The ticket moves wait too, so read only the delivery writes.
    let waiting = |fx: &Fx| {
        fx.f.approvals()
            .into_iter()
            .filter(|a| matches!(a.write, Write::Push { .. } | Write::OpenPr { .. }))
            .collect::<Vec<_>>()
    };
    assert_eq!(fx.state(&run), RunState::SelfReview);
    let first = waiting(&fx);
    assert_eq!(first.len(), 1, "{first:?}");
    assert!(matches!(
        &first[0].write,
        Write::Push {
            force_with_lease: false,
            ..
        }
    ));
    assert!(pushes(&fx).is_empty(), "nothing is pushed before the click");

    fx.f.approve(first[0].id).unwrap();
    assert_eq!(pushes(&fx).len(), 1);
    let second = waiting(&fx);
    assert_eq!(second.len(), 1);
    assert!(matches!(
        &second[0].write,
        Write::OpenPr { draft: true, .. }
    ));
    assert!(open_pr(&fx).is_none());

    fx.f.approve(second[0].id).unwrap();
    assert!(open_pr(&fx).is_some());
    assert_eq!(fx.state(&run), RunState::PROpen);
    assert_eq!(fx.f.run_info(&run).unwrap().pr, Some(7));
}

#[test]
fn each_switch_alone_sends_only_its_own_write() {
    let w = Writes {
        push: true,
        ..Writes::default()
    };
    let fx = Fx::new(w, &[]);
    let run = to_pr(&fx);
    assert_eq!(pushes(&fx).len(), 1);
    assert!(open_pr(&fx).is_none());
    assert_eq!(fx.state(&run), RunState::SelfReview);
    let waiting: Vec<_> =
        fx.f.approvals()
            .into_iter()
            .filter(|a| matches!(a.write, Write::OpenPr { .. }))
            .collect();
    assert_eq!(waiting.len(), 1);
}

#[test]
fn a_rejection_drops_the_write_blocks_the_run_and_a_click_asks_again() {
    let fx = Fx::new(Writes::default(), &[]);
    let run = to_pr(&fx);
    let push =
        fx.f.approvals()
            .into_iter()
            .find(|a| matches!(a.write, Write::Push { .. }))
            .unwrap();
    fx.f.reject(push.id).unwrap();
    assert_eq!(fx.state(&run), RunState::Blocked);
    assert!(pushes(&fx).is_empty());
    assert!(
        fx.f.approvals()
            .iter()
            .all(|a| !matches!(a.write, Write::Push { .. }))
    );

    fx.f.unblock(&run).unwrap();
    fx.f.pump();
    let again =
        fx.f.approvals()
            .into_iter()
            .filter(|a| matches!(a.write, Write::Push { .. }))
            .count();
    assert_eq!(again, 1, "the step asks again, once");
    // Many pumps do not pile up approvals.
    fx.f.pump();
    fx.f.pump();
    let still =
        fx.f.approvals()
            .into_iter()
            .filter(|a| matches!(a.write, Write::Push { .. }))
            .count();
    assert_eq!(still, 1);
}

#[test]
fn a_pull_request_that_exists_is_found_not_opened_again() {
    // The app stopped after the forge made the pull request and before the run state changed.
    let fx = Fx::new(writes(true), &[]);
    fx.git.set_branch("fix/engine/login");
    fx.pulls.put("fix/engine/login", 41);
    let run = to_pr(&fx);
    assert_eq!(fx.state(&run), RunState::PROpen);
    assert_eq!(fx.f.run_info(&run).unwrap().pr, Some(41));
    assert!(open_pr(&fx).is_none(), "no second pull request");
    assert!(pushes(&fx).is_empty(), "it was pushed before the crash");
    // A repeated tick changes nothing.
    let before = fx.writer.sent().len();
    fx.f.pump();
    fx.f.pump();
    assert_eq!(fx.writer.sent().len(), before);
}

#[test]
fn a_run_with_no_reviewer_blocks_before_it_pushes() {
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.reviewers.clear()
    });
    let run = to_pr(&fx);
    assert_eq!(fx.state(&run), RunState::Blocked);
    assert!(pushes(&fx).is_empty());
    assert!(fx.logged(&run, "note").iter().any(|n| {
        n["blocked"]
            .as_str()
            .is_some_and(|b| b.contains("name a reviewer"))
    }));
}

#[test]
fn a_release_base_stops_the_run_for_a_person() {
    let fx = Fx::new(writes(true), &[]);
    fx.git.set_changes(&FILES, &FILES);
    fx.pulls.set_branches(&["main"], "main");
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    fx.pulls.set_branches(&["release/2.0"], "release/2.0");
    // The base is chosen once, at the review, so a change after it does not move the run.
    fx.done(&run, "review");
    assert_eq!(fx.state(&run), RunState::PROpen);

    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.base = Some("release/1.0".into());
    });
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    assert_eq!(fx.state(&run), RunState::Blocked);
    assert!(open_pr(&fx).is_none() && pushes(&fx).is_empty());
}

#[test]
fn git_problems_block_the_run_with_the_reason() {
    let cases: [(&str, &str, &str); 3] = [
        (
            "rename",
            "the branch is already on the remote: claude/work",
            "rename: the branch is already",
        ),
        ("commit", "no git identity", "commit: no git identity"),
        (
            "changes",
            "not a working copy",
            "changes: not a working copy",
        ),
    ];
    for (op, message, expect) in cases {
        let fx = Fx::new(writes(true), &[]);
        fx.git.fail(op, Some(message));
        let run = to_pr(&fx);
        assert_eq!(fx.state(&run), RunState::Blocked, "{op}");
        assert!(pushes(&fx).is_empty(), "{op}");
        assert!(
            fx.logged(&run, "note")
                .iter()
                .any(|n| n["blocked"].as_str().is_some_and(|b| b.starts_with(expect))),
            "{op}"
        );
    }
}

#[test]
fn a_rebase_conflict_blocks_the_run_before_the_push() {
    let fx = Fx::new(writes(true), &[]);
    fx.git
        .set_rebase(shipyard_engine::ports::Merge::Conflicts(vec![
            "src/a.rs".into(),
        ]));
    let run = to_pr(&fx);
    assert_eq!(fx.state(&run), RunState::Blocked);
    assert!(pushes(&fx).is_empty());
    assert!(
        fx.logged(&run, "note")
            .iter()
            .any(|n| { n["blocked"] == "rebase onto develop: conflicts in src/a.rs" })
    );
}

#[test]
fn a_run_that_changed_no_file_blocks() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.git.set_changes(&[], &[]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    fx.done(&run, "review");
    assert_eq!(fx.state(&run), RunState::Blocked);
}

#[test]
fn a_failed_forge_read_fails_the_step_and_pushes_nothing() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    // The reads of the review passed; the lookup of the pull request fails.
    fx.pulls.fail_with(Some("forge down"));
    fx.done(&run, "review");
    assert_eq!(fx.state(&run), RunState::Failed);
    assert!(pushes(&fx).is_empty());
}

#[test]
fn the_reviewers_of_the_automation_file_open_the_pull_request() {
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.reviewers.clear();
        p.automation.reviewers = vec!["bob".into(), "carol".into()];
    });
    let run = to_pr(&fx);
    assert_eq!(fx.state(&run), RunState::PROpen);
    let Some(Write::OpenPr { reviewers, .. }) = open_pr(&fx) else {
        panic!("no pull request")
    };
    assert_eq!(reviewers, ["bob", "carol"]);
}

#[test]
fn the_reviewers_of_the_project_win_over_the_automation_file() {
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.automation.reviewers = vec!["bob".into()];
    });
    let run = to_pr(&fx);
    assert_eq!(fx.state(&run), RunState::PROpen);
    let Some(Write::OpenPr { reviewers, .. }) = open_pr(&fx) else {
        panic!("no pull request")
    };
    assert_eq!(reviewers, ["alice"]);
}
