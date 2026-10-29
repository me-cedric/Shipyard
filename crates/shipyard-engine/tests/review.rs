//! The review step and the finding check (spec `delivery`, REQ-001 to REQ-006). A fake reviewer
//! (the fake runner), a fake git, a fake forge and a fake clock drive it. No process.

mod fx;

use fx::{Fx, writes};
use serde_json::{Value, json};
use shipyard_core::run::RunState;
use shipyard_engine::approvals::Write;
use shipyard_engine::ports::ReviewInput;
use shipyard_engine::run_engine::Config;
use shipyard_mcp::tools::agent::Outcome;

/// A bug run, built and joined: the reviewer runs next.
fn built(fx: &Fx) -> String {
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    // The builder's output: the reviewer must never see it.
    fx.report(
        &run,
        "fix",
        Outcome::Done,
        json!({"note": "BUILDER-REASONING I chose a cache because it is fast"}),
    );
    assert_eq!(fx.state(&run), RunState::SelfReview);
    run
}

fn finding(severity: &str, path: &str, line: u32, text: &str) -> Value {
    json!({"severity": severity, "path": path, "line": line, "text": text})
}

fn review(fx: &Fx, run: &str, findings: Vec<Value>) {
    review_as(fx, run, Outcome::Partial, findings);
}

fn review_as(fx: &Fx, run: &str, outcome: Outcome, findings: Vec<Value>) {
    fx.report(
        run,
        "review",
        outcome,
        json!({"findings": findings, "criteria": [{"id": "REQ-1", "verdict": "OK"}]}),
    );
}

fn reviews(fx: &Fx, run: &str) -> Vec<Value> {
    fx.logged(run, "review")
}

#[test]
fn the_reviewer_starts_fresh_with_the_diff_the_base_the_criteria_and_the_checklist() {
    let fx = Fx::new(writes(true), &[]);
    fx.git.set_input(ReviewInput {
        head: "abc123".into(),
        diff: "diff --git a/src/a.rs b/src/a.rs\n+let x = 1;".into(),
        specs: vec![("docs/spec.md".into(), "REQ-9 The system SHALL x.".into())],
    });
    built(&fx);

    let brief = fx.agents.briefs().pop().unwrap();
    assert_eq!(brief.step, "review");
    // A fresh context: no CLI session to resume.
    assert_eq!(brief.resume, None);
    // What it gets (REQ-001, REQ-002).
    for needle in [
        "Base: develop",
        "Head: abc123",
        "SHIP-1",
        "docs/spec.md",
        "REQ-9 The system SHALL x.",
        "+let x = 1;",
        "Checklist (compass `review`)",
        "AGENTS.md",
        "P0|P1|P2",
    ] {
        assert!(
            brief.prompt.contains(needle),
            "missing {needle}: {}",
            brief.prompt
        );
    }
    // What it never gets: the output of the builder.
    assert!(
        !brief.prompt.contains("BUILDER-REASONING"),
        "{}",
        brief.prompt
    );
    assert!(!brief.prompt.contains("Output of"), "{}", brief.prompt);
    // The git side read the diff against the base that the run chose.
    assert_eq!(fx.git.count("review_input develop"), 1);
}

#[test]
fn a_finding_that_cites_a_missing_line_is_dropped_and_logged() {
    let fx = Fx::new(writes(true), &[]);
    let run = built(&fx);
    review_as(
        &fx,
        &run,
        Outcome::Done,
        vec![
            finding("P1", "src/a.rs", 99, "line 99 does not exist"),
            finding("P1", "src/gone.rs", 1, "no such file"),
            finding("P0", "../secret", 1, "outside the working copy"),
            json!({"severity": "P2", "text": "no citation"}),
        ],
    );
    // Nothing is left to block and the reviewer is done: the run goes on to the pull request.
    assert_eq!(fx.state(&run), RunState::PROpen);
    let round = &reviews(&fx, &run)[0];
    assert_eq!(round["findings"], json!([]));
    let reasons: Vec<&str> = round["dropped"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["reason"].as_str().unwrap())
        .collect();
    assert_eq!(reasons.len(), 4);
    assert!(reasons[0].contains("does not exist"));
    assert!(reasons[2].contains("not a path in the working copy"));
    assert!(reasons[3].contains("no path and line"));
    // The cited line was opened before the finding counted.
    assert_eq!(fx.git.count("line src/a.rs:99"), 1);
}

#[test]
fn a_p2_finding_does_not_block_and_the_log_keeps_it() {
    let fx = Fx::new(writes(true), &[]);
    let run = built(&fx);
    review(&fx, &run, vec![finding("P2", "src/a.rs", 3, "rename x")]);
    assert_eq!(fx.state(&run), RunState::PROpen);
    let round = &reviews(&fx, &run)[0];
    assert_eq!(round["blocking"], false);
    assert_eq!(round["findings"][0]["severity"], "P2");
    assert_eq!(round["findings"][0]["path"], "src/a.rs");
    assert_eq!(round["criteria"][0]["verdict"], "OK");
    assert!(fx.f.run_info(&run).unwrap().findings.is_empty());
}

#[test]
fn two_fix_rounds_then_the_run_blocks_with_the_findings_for_the_inbox() {
    let fx = Fx::new(writes(true), &[]);
    let run = built(&fx);
    for round in 1..=2 {
        review(
            &fx,
            &run,
            vec![finding("P1", "src/a.rs", 3, "missing guard")],
        );
        // The run goes back to Working, in the same worktree, with the finding.
        assert_eq!(fx.state(&run), RunState::Working);
        let fix = fx.agents.briefs().pop().unwrap();
        assert_eq!(fix.step, "fix");
        assert_eq!(fix.dir, std::path::PathBuf::from(format!("/wt/{run}/fix")));
        assert!(
            fix.prompt
                .contains(&format!("Fix round {round}: [P1] src/a.rs:3 missing guard")),
            "{}",
            fix.prompt
        );
        fx.done(&run, "fix");
        assert_eq!(fx.state(&run), RunState::SelfReview);
    }
    let fixers = fx
        .agents
        .briefs()
        .iter()
        .filter(|b| b.step == "fix")
        .count();
    assert_eq!(fixers, 3, "triage-free: one first build and two fixes");

    review(&fx, &run, vec![finding("P0", "src/a.rs", 4, "still wrong")]);
    // A third fix round never starts.
    assert_eq!(fx.state(&run), RunState::Blocked);
    assert_eq!(
        fx.agents
            .briefs()
            .iter()
            .filter(|b| b.step == "fix")
            .count(),
        3
    );
    let card = fx.f.run_info(&run).unwrap().findings;
    assert_eq!(card.len(), 1);
    assert_eq!(card[0].text, "still wrong");
    assert_eq!(reviews(&fx, &run).len(), 3);
}

#[test]
fn a_review_posts_nothing_to_the_forge_or_the_ticket() {
    let fx = Fx::new(writes(true), &[]);
    let run = built(&fx);
    let before = fx.writer.sent().len();
    review(&fx, &run, vec![finding("P1", "src/a.rs", 3, "x")]);
    fx.done(&run, "fix");
    review(&fx, &run, vec![finding("P2", "src/a.rs", 3, "x")]);
    // Between the build and the end of the review, only state moves of the ticket went out
    // (the state map). No comment, no push, no pull request before the review ended.
    let sent = &fx.writer.sent()[before..];
    assert!(
        !sent.iter().any(|w| matches!(w, Write::Comment { .. })),
        "{sent:?}"
    );
    let first_push = sent
        .iter()
        .position(|w| matches!(w, Write::Push { .. }))
        .unwrap();
    assert!(
        sent[..first_push]
            .iter()
            .all(|w| matches!(w, Write::Transition { .. } | Write::Labels { .. }))
    );
}

#[test]
fn a_red_gate_is_a_p1_finding_and_a_green_gate_with_p2_opens_the_pull_request() {
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.gates = vec!["cargo test".into(), "cargo clippy".into()];
    });
    let run = built(&fx);
    fx.git.fail_gate("cargo test");
    // No finding at all, and a failing test.
    review_as(&fx, &run, Outcome::Done, vec![]);
    assert_eq!(fx.state(&run), RunState::Working);
    let fix = fx.agents.briefs().pop().unwrap();
    assert!(
        fix.prompt
            .contains("the gate `cargo test` failed: 1 failed, 11 passed"),
        "{}",
        fix.prompt
    );
    let round = &reviews(&fx, &run)[0];
    assert_eq!(round["gate"][0]["passed"], false);
    assert_eq!(round["findings"][0]["severity"], "P1");

    // Fixed: a green gate and one P2 finding open the pull request step.
    fx.git.clear_gate();
    fx.done(&run, "fix");
    review(&fx, &run, vec![finding("P2", "src/a.rs", 1, "nit")]);
    assert_eq!(fx.state(&run), RunState::PROpen);
    let body = fx
        .writer
        .sent()
        .into_iter()
        .find_map(|w| match w {
            Write::OpenPr { body, .. } => Some(body),
            _ => None,
        })
        .unwrap();
    // The exact counts of the run go in the body (REQ-006, REQ-010).
    assert!(body.contains("`cargo test`: passed, 12 passed"), "{body}");
    assert!(body.contains("`cargo clippy`: passed, 12 passed"), "{body}");
}

fn report_on(f: &shipyard_engine::run_engine::Factory, run: &str, outcome: Outcome) {
    let report = shipyard_mcp::tools::agent::Report {
        outcome,
        summary: "review report".into(),
        refs: Vec::new(),
        output: json!({"findings": [], "criteria": []}).as_object().cloned(),
    };
    f.report(run, "review", report).unwrap();
}

/// The gate runs with no lock: the views answer while it runs (`factory` REQ-046).
#[test]
fn a_slow_gate_does_not_hold_the_factory() {
    use std::time::{Duration, Instant};
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.gates = vec!["cargo test".into()];
    });
    let run = built(&fx);
    fx.git.set_gate_delay(Duration::from_millis(800));
    std::thread::scope(|s| {
        let f = fx.f.clone();
        let id = run.clone();
        let gate = s.spawn(move || report_on(&f, &id, Outcome::Done));
        // Wait for the gate to start.
        let t = Instant::now();
        while fx.git.count("gate") == 0 && t.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(5));
        }
        let t = Instant::now();
        assert_eq!(fx.f.runs().len(), 1);
        assert_eq!(fx.f.approvals().len(), 0);
        // A second pump leaves the run alone while its gate is out.
        fx.f.pump();
        assert!(
            t.elapsed() < Duration::from_millis(400),
            "{:?}",
            t.elapsed()
        );
        assert!(!gate.is_finished(), "the gate was still out");
        gate.join().unwrap();
    });
    assert_eq!(fx.git.count("gate"), 1);
    assert_eq!(fx.state(&run), RunState::PROpen);
}

/// A click during the gate wins: the verdict of the gate is dropped.
#[test]
fn a_run_that_is_cancelled_during_its_gate_takes_no_verdict() {
    use std::time::{Duration, Instant};
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.gates = vec!["cargo test".into()];
    });
    let run = built(&fx);
    fx.git.set_gate_delay(Duration::from_millis(500));
    std::thread::scope(|s| {
        let f = fx.f.clone();
        let id = run.clone();
        let gate = s.spawn(move || report_on(&f, &id, Outcome::Done));
        let t = Instant::now();
        while fx.git.count("gate") == 0 && t.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(5));
        }
        fx.f.cancel(&run).unwrap();
        gate.join().unwrap();
    });
    assert_eq!(fx.state(&run), RunState::Cancelled);
    assert!(reviews(&fx, &run).is_empty(), "no verdict was logged");
    assert!(
        fx.writer
            .sent()
            .iter()
            .all(|w| !matches!(w, Write::Push { .. } | Write::OpenPr { .. }))
    );
}

/// A run that changed during its gate asks the gate again when it comes back.
#[test]
fn a_run_that_comes_back_after_a_dropped_verdict_runs_the_gate_again() {
    use shipyard_core::run::RunEvent;
    use std::time::{Duration, Instant};
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.gates = vec!["cargo test".into()];
    });
    let run = built(&fx);
    fx.git.set_gate_delay(Duration::from_millis(300));
    std::thread::scope(|s| {
        let f = fx.f.clone();
        let id = run.clone();
        let gate = s.spawn(move || report_on(&f, &id, Outcome::Done));
        let t = Instant::now();
        while fx.git.count("gate") == 0 && t.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(5));
        }
        fx.f.apply(&run, RunEvent::Block).unwrap();
        gate.join().unwrap();
    });
    assert_eq!(fx.state(&run), RunState::Blocked);
    assert!(reviews(&fx, &run).is_empty());
    fx.git.set_gate_delay(Duration::ZERO);
    fx.f.unblock(&run).unwrap();
    fx.f.pump();
    assert_eq!(fx.git.count("gate"), 2);
    assert_eq!(fx.state(&run), RunState::PROpen);
}

#[test]
fn a_gate_that_cannot_run_is_a_p1_finding() {
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.gates = vec!["cargo test".into()];
    });
    let run = built(&fx);
    fx.git.fail("gate", Some("no such command"));
    review_as(&fx, &run, Outcome::Done, vec![]);
    assert_eq!(fx.state(&run), RunState::Working);
    let round = &reviews(&fx, &run)[0];
    assert_eq!(
        round["findings"][0]["text"],
        "the gate did not run: no such command"
    );
}

#[test]
fn a_blocking_review_does_not_run_the_gate() {
    let fx = Fx::build(writes(true), &[], Config::default(), |p| {
        p.gates = vec!["cargo test".into()];
    });
    let run = built(&fx);
    review(&fx, &run, vec![finding("P1", "src/a.rs", 3, "x")]);
    assert_eq!(fx.git.count("gate"), 0);
}

#[test]
fn a_release_base_blocks_the_run_before_the_review() {
    let fx = Fx::new(writes(true), &[]);
    fx.pulls.set_branches(&["release/1.2"], "release/1.2");
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    assert_eq!(fx.state(&run), RunState::Blocked);
    assert!(fx.logged(&run, "note").iter().any(|n| {
        n["blocked"]
            .as_str()
            .is_some_and(|b| b.contains("`release/1.2` is a release branch"))
    }));
    assert!(fx.agents.running().is_empty());
}

#[test]
fn a_report_with_no_findings_list_keeps_the_outcome_rule() {
    let fx = Fx::new(writes(true), &[]);
    let run = built(&fx);
    fx.report(
        &run,
        "review",
        Outcome::Partial,
        json!({"summary": "missing test"}),
    );
    assert_eq!(fx.state(&run), RunState::Working);
    assert_eq!(
        fx.f.run_info(&run).unwrap().findings[0].text,
        "missing test"
    );
}

#[test]
fn an_uncited_p0_or_p1_finding_still_blocks() {
    let fx = Fx::new(writes(true), &[]);
    let run = built(&fx);
    review_as(
        &fx,
        &run,
        Outcome::Done,
        vec![
            json!({"severity": "P1", "text": "the login skips the check"}),
            json!({"severity": "P0", "path": "src/a.rs", "text": "no line"}),
        ],
    );
    assert_eq!(fx.state(&run), RunState::Working);
    let round = &reviews(&fx, &run)[0];
    assert_eq!(round["blocking"], true);
    assert_eq!(round["findings"].as_array().unwrap().len(), 2);
    assert_eq!(round["findings"][0]["text"], "the login skips the check");
    assert!(round["dropped"].as_array().unwrap().is_empty());
}

#[test]
fn an_unknown_severity_blocks_as_p1() {
    let fx = Fx::new(writes(true), &[]);
    let run = built(&fx);
    review_as(
        &fx,
        &run,
        Outcome::Done,
        vec![json!({"severity": "critical", "text": "data loss"})],
    );
    assert_eq!(fx.state(&run), RunState::Working);
    assert_eq!(reviews(&fx, &run)[0]["findings"][0]["severity"], "P1");
}

#[test]
fn a_review_with_no_usable_finding_and_an_outcome_that_is_not_done_blocks() {
    let fx = Fx::new(writes(true), &[]);
    let run = built(&fx);
    // Every citation is bad, and the reviewer did not finish.
    review_as(
        &fx,
        &run,
        Outcome::Partial,
        vec![finding("P1", "src/a.rs", 99, "line 99 does not exist")],
    );
    assert_eq!(fx.state(&run), RunState::Working);
    assert_eq!(reviews(&fx, &run)[0]["blocking"], true);
}
