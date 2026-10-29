//! The close of a merged run (spec `delivery`, REQ-022 to REQ-025). A fake forge, a fake tracker
//! mirror, a fake git and a fake clock drive it.

mod fx;

use fx::{Fx, SOURCE, writes};
use shipyard_core::pickup::{PrEvent, PrEventKind, SyncEvent, Writes};
use shipyard_core::run::RunState;
use shipyard_core::work_item::StatusCategory;
use shipyard_engine::approvals::Write;
use shipyard_engine::fake::ticket;
use shipyard_engine::ports::Dispatch;
use shipyard_engine::run_engine::Config;

/// A bug run with an open pull request (number 7).
fn open(fx: &Fx) -> String {
    let run = review_done(fx);
    assert_eq!(fx.state(&run), RunState::PROpen);
    run
}

fn review_done(fx: &Fx) -> String {
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    fx.done(&run, "review");
    run
}

fn merged(fx: &Fx) {
    fx.f.event(&SyncEvent::Pr(PrEvent {
        number: 7,
        kind: PrEventKind::Merged,
        title: String::new(),
        head_sha: String::new(),
        url: String::new(),
    }))
    .unwrap();
}

fn states(fx: &Fx, run: &str) -> Vec<String> {
    fx.logged(run, "state")
        .iter()
        .map(|s| s["to"].as_str().unwrap().to_string())
        .collect()
}

fn comments(fx: &Fx) -> Vec<String> {
    fx.writer
        .sent()
        .into_iter()
        .filter_map(|w| match w {
            Write::Comment { body, .. } => Some(body),
            _ => None,
        })
        .collect()
}

fn moves(fx: &Fx) -> Vec<String> {
    fx.writer
        .sent()
        .into_iter()
        .filter_map(|w| match w {
            Write::Transition { status, .. } => Some(status),
            _ => None,
        })
        .collect()
}

#[test]
fn a_merge_moves_the_run_to_merged_then_done_and_never_to_cancelled() {
    let fx = Fx::new(writes(true), &[]);
    let run = open(&fx);
    merged(&fx);
    assert_eq!(fx.state(&run), RunState::Done);
    let s = states(&fx, &run);
    assert_eq!(s[s.len() - 2..], ["Merged", "Done"]);
    assert!(!s.contains(&"Cancelled".to_string()));
    // The claim goes: the factory reports the ended run for `tick::Engine::release`.
    assert_eq!(
        fx.f.take_ended(),
        [("ship".to_string(), "SHIP-1".to_string())]
    );
    assert!(fx.f.active_runs().is_empty());
    // The run log stays after the close.
    assert!(!fx.logged(&run, "state").is_empty());
    // A second merge event, or a stop for the terminal ticket, changes nothing.
    merged(&fx);
    fx.f.stop(&run, "ticket terminal").unwrap();
    assert_eq!(fx.state(&run), RunState::Done);
}

#[test]
fn the_close_moves_the_ticket_posts_one_summary_and_removes_the_worktrees() {
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.gates = vec!["cargo test".into()];
    });
    let run = open(&fx);
    fx.git.fail_gate("nothing");
    merged(&fx);

    // The ticket goes to the terminal status of the map (REQ-023), once.
    assert_eq!(moves(&fx).last().map(String::as_str), Some("Done"));
    assert_eq!(moves(&fx).iter().filter(|m| *m == "Done").count(), 1);
    // One summary with the five facts (REQ-024).
    let c = comments(&fx);
    assert_eq!(c.len(), 1, "{c:?}");
    for needle in [
        &format!("run:{run}: merged"),
        "Pull request: pr:github:7",
        "Gate: `cargo test` passed, 12 passed",
        "Review fix rounds: 0",
        "Cost: $0.00",
    ] {
        assert!(c[0].contains(needle), "{needle}: {}", c[0]);
    }
    let low = c[0].to_lowercase();
    assert!(!low.contains("co-authored-by") && !low.contains("generated with"));
    // The worktrees go, after the summary (REQ-025).
    assert_eq!(fx.git.count("remove_worktrees"), 1);
    assert!(fx.f.run_info(&run).unwrap().worktree_kept.is_none());
}

#[test]
fn with_the_switches_off_the_ticket_move_and_the_summary_are_approvals() {
    let fx = Fx::new(Writes::default(), &[]);
    let run = review_done(&fx);
    // The pull request writes wait too: click through them.
    while let Some(a) =
        fx.f.approvals()
            .into_iter()
            .find(|a| matches!(a.write, Write::Push { .. } | Write::OpenPr { .. }))
    {
        fx.f.approve(a.id).unwrap();
    }
    assert_eq!(fx.state(&run), RunState::PROpen);
    merged(&fx);

    let waiting = fx.f.approvals();
    let comment = waiting
        .iter()
        .find(|a| matches!(a.write, Write::Comment { .. }))
        .expect("the summary waits");
    let Write::Comment { key, body } = &comment.write else {
        unreachable!()
    };
    assert_eq!(key, "SHIP-1");
    assert!(body.contains("Pull request: pr:github:7"));
    let transition = waiting
        .iter()
        .find(|a| matches!(&a.write, Write::Transition { status, .. } if status == "Done"))
        .expect("the ticket move waits");
    assert!(comments(&fx).is_empty() && moves(&fx).is_empty());
    // One click sends each one.
    fx.f.approve(comment.id).unwrap();
    fx.f.approve(transition.id).unwrap();
    assert_eq!(comments(&fx).len(), 1);
    assert_eq!(moves(&fx), ["Done"]);
}

#[test]
fn a_ticket_that_the_forge_closed_gets_no_second_move() {
    let fx = Fx::new(writes(true), &[]);
    let run = open(&fx);
    // The poll saw the ticket closed at the merge.
    fx.mirror
        .lock()
        .unwrap()
        .put_tickets(SOURCE, &[ticket("SHIP-1", "Closed", StatusCategory::Done)])
        .unwrap();
    let before = moves(&fx).len();
    merged(&fx);
    assert_eq!(fx.state(&run), RunState::Done);
    assert_eq!(moves(&fx).len(), before, "no move after the merge");
    assert!(fx.f.approvals().is_empty());
    // The summary still goes out.
    assert_eq!(comments(&fx).len(), 1);
}

#[test]
fn a_dirty_worktree_stays_and_the_card_names_its_files() {
    let fx = Fx::new(writes(true), &[]);
    let run = open(&fx);
    fx.git.set_dirty(Some("src/a.rs, notes.txt"));
    merged(&fx);
    assert_eq!(fx.state(&run), RunState::Done);
    let kept = fx.f.run_info(&run).unwrap().worktree_kept.unwrap();
    assert!(kept.contains("src/a.rs, notes.txt"), "{kept}");
    assert!(fx.logged(&run, "note").iter().any(|n| {
        n["worktree_kept"]
            .as_str()
            .is_some_and(|k| k.contains("notes.txt"))
    }));
}

#[test]
fn a_tracker_without_comments_gets_no_summary() {
    let fx = Fx::new(writes(true), &[]);
    open(&fx);
    fx.writer.set_can_comment(false);
    merged(&fx);
    assert!(comments(&fx).is_empty());
}

#[test]
fn a_merge_of_a_pull_request_that_no_run_holds_changes_nothing() {
    let fx = Fx::new(writes(true), &[]);
    let run = open(&fx);
    fx.f.event(&SyncEvent::Pr(PrEvent {
        number: 99,
        kind: PrEventKind::Merged,
        title: String::new(),
        head_sha: String::new(),
        url: String::new(),
    }))
    .unwrap();
    assert_eq!(fx.state(&run), RunState::PROpen);
}
