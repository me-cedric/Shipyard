//! The factory: start, steps, fan-out, retries, clocks, budgets, kill switches (spec `factory`,
//! REQ-006, REQ-007, REQ-009, REQ-013, REQ-022, REQ-023, REQ-024, REQ-035, REQ-036). A fake
//! runner, a fake writer and a fake clock drive it. No process, no sleep.

mod fx;

use fx::{Fx, ONE, writes};
use serde_json::json;
use shipyard_core::pickup::{PrEvent, PrEventKind, SyncEvent};
use shipyard_core::run::{RunEvent, RunState};
use shipyard_core::workflow::{Effort, Mode, StepState};
use shipyard_engine::approvals::Write;
use shipyard_engine::ports::{AgentEvent, Dispatch};
use shipyard_engine::run_engine::Config;
use shipyard_mcp::tools::agent::Outcome;

fn usage(cost: f64) -> AgentEvent {
    AgentEvent::Usage {
        input_tokens: 100,
        output_tokens: 50,
        cached_tokens: 0,
        cost_usd: Some(cost),
    }
}

fn exit(code: i32) -> AgentEvent {
    AgentEvent::Exit {
        code: Some(code),
        cancelled: false,
    }
}

#[test]
fn feature_runs_the_whole_path() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &[]);
    assert_eq!(fx.state(&run), RunState::Planning);

    // Per step: role tier to the runner model, effort, mode, tools (REQ-012).
    let grill = &fx.agents.briefs()[0];
    assert_eq!(grill.step, "grill");
    assert_eq!(grill.model.as_deref(), Some("opus"));
    assert_eq!(grill.effort, Some(Effort::High));
    assert_eq!(grill.mode, Mode::Plan);
    assert!(grill.tools.contains(&"ask_question".to_string()));
    assert!(grill.prompt.contains("grill-me") && grill.prompt.contains("SHIP-1"));

    fx.done(&run, "grill");
    assert_eq!(fx.agents.running(), ["plan"]);
    fx.report(
        &run,
        "plan",
        Outcome::Done,
        json!({"tasks": ["a", "b", "c"]}),
    );
    // The plan gate (REQ-003).
    assert_eq!(fx.state(&run), RunState::PlanReview);
    assert!(fx.agents.running().is_empty());

    fx.f.approve_plan(&run).unwrap();
    assert_eq!(fx.state(&run), RunState::Working);
    // Fan-out: one child for each task, two at a time, each in its own worktree (REQ-013).
    assert_eq!(fx.agents.running(), ["build-1", "build-2"]);
    let b1 = fx
        .agents
        .briefs()
        .into_iter()
        .find(|b| b.step == "build-1")
        .unwrap();
    assert_eq!(b1.model.as_deref(), Some("sonnet"));
    assert_eq!(
        b1.dir,
        std::path::PathBuf::from(format!("/wt/{run}/build-1"))
    );
    assert!(b1.prompt.contains("\"a\""));
    fx.done(&run, "build-1");
    assert_eq!(fx.agents.running(), ["build-2", "build-3"]);
    fx.done(&run, "build-2");
    fx.done(&run, "build-3");

    // Fan-in, then the self-review (REQ-036).
    assert_eq!(fx.state(&run), RunState::SelfReview);
    assert_eq!(fx.agents.running(), ["review"]);
    let info = fx.f.run_info(&run).unwrap();
    assert_eq!(info.steps[2].state, StepState::Done);
    fx.done(&run, "review");

    // The pull request action, switch on: open at once.
    assert_eq!(fx.state(&run), RunState::PROpen);
    assert_eq!(fx.f.run_info(&run).unwrap().pr, Some(7));
    assert!(
        fx.writer
            .sent()
            .contains(&Write::OpenPr { run: run.clone() })
    );

    // Merge, then `delivery` closes the run.
    fx.f.event(&SyncEvent::Pr(PrEvent {
        number: 7,
        kind: PrEventKind::Merged,
        title: String::new(),
        head_sha: String::new(),
        url: String::new(),
    }))
    .unwrap();
    assert_eq!(fx.state(&run), RunState::Merged);
    // A merged run is never cancelled.
    assert!(fx.f.stop(&run, "ticket terminal").is_err());
    assert_eq!(fx.f.apply(&run, RunEvent::Closed), Ok(RunState::Done));
    assert_eq!(
        fx.f.take_ended(),
        [("ship".to_string(), "SHIP-1".to_string())]
    );
    assert!(fx.f.active_runs().is_empty());

    // Every state change is in the run log, through `Run::apply`.
    let states = fx.logged(&run, "state");
    assert_eq!(states.first().unwrap()["to"], "Claimed");
    assert_eq!(states.last().unwrap()["to"], "Done");
}

#[test]
fn plan_rejection_runs_the_plan_again_with_the_note() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &[]);
    fx.done(&run, "grill");
    fx.report(&run, "plan", Outcome::Done, json!({"tasks": []}));
    fx.f.reject_plan(&run, "split task b").unwrap();
    assert_eq!(fx.state(&run), RunState::Planning);
    fx.f.pump();
    let again = fx.agents.briefs().pop().unwrap();
    assert_eq!(again.step, "plan");
    assert!(again.prompt.contains("split task b"));
}

#[test]
fn workflow_from_label_and_no_pr_ends_done() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-2", &["wf:spike"]);
    assert_eq!(fx.f.run_info(&run).unwrap().workflow, "spike");
    for step in ["grill", "investigate", "report"] {
        assert_eq!(fx.agents.running(), [step]);
        fx.done(&run, step);
    }
    assert_eq!(fx.state(&run), RunState::Done);
    assert_eq!(fx.f.take_ended().len(), 1);
}

#[test]
fn unknown_workflow_refuses_the_start() {
    let fx = Fx::new(writes(true), &[]);
    let mut ticket = shipyard_engine::fake::todo("SHIP-3");
    ticket.item.labels.push("wf:nope".into());
    let req = shipyard_engine::ports::StartRequest {
        project: "ship".into(),
        ticket,
        status: "To Do".into(),
        machine: "m1".into(),
        stamped: false,
    };
    assert!(fx.f.start(&req).unwrap_err().contains("nope"));
    assert!(fx.f.active_runs().is_empty());
}

#[test]
fn retry_waits_for_the_backoff_then_fails() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", exit(1));
    assert_eq!(fx.state(&run), RunState::RetryQueued);
    // Retry 1: 10 s (REQ-007).
    fx.advance(9);
    assert_eq!(fx.state(&run), RunState::RetryQueued);
    fx.advance(1);
    assert_eq!(fx.state(&run), RunState::Working);
    assert_eq!(fx.agents.running(), ["work"]);
    // `retry: 1` is spent.
    fx.event("work", exit(1));
    assert_eq!(fx.state(&run), RunState::Failed);
}

#[test]
fn a_silent_step_stalls() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.advance(299);
    fx.event("work", AgentEvent::Text { text: "hi".into() });
    fx.advance(299);
    assert_eq!(fx.agents.running(), ["work"]);
    fx.advance(1);
    // A stalled step is a failed step (REQ-023).
    assert_eq!(fx.state(&run), RunState::RetryQueued);
    assert!(fx.agents.running().is_empty());
}

#[test]
fn step_timeout_is_the_wall_clock() {
    let wf = "
id: one
steps:
  - { id: work, role: worker, timeout: 60 }
limits: { max_turns: 3, budget_usd: 1, stall_s: 300 }
";
    let fx = Fx::new(writes(true), &[wf]);
    let run = fx.start("SHIP-1", &[]);
    fx.advance(30);
    fx.event(
        "work",
        AgentEvent::Text {
            text: "busy".into(),
        },
    );
    fx.advance(30);
    assert_eq!(fx.state(&run), RunState::Failed);
}

#[test]
fn max_turns_fails_the_run() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    for _ in 0..3 {
        fx.event("work", AgentEvent::Turn);
    }
    assert_eq!(fx.state(&run), RunState::Working);
    fx.event("work", AgentEvent::Turn);
    assert_eq!(fx.state(&run), RunState::Failed);
    assert!(fx.agents.running().is_empty());
}

#[test]
fn budget_alerts_once_then_pauses_and_resumes() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", AgentEvent::Session { id: "s-1".into() });
    fx.event("work", usage(0.8));
    fx.event("work", usage(0.1));
    assert_eq!(fx.logged(&run, "alert").len(), 1);
    assert_eq!(fx.state(&run), RunState::Working);
    fx.event("work", usage(0.1));
    // 100 %: hard stop (REQ-022).
    assert_eq!(fx.state(&run), RunState::Paused);
    assert!(fx.agents.running().is_empty());
    // No budget left: stays paused (`q:Q-053`).
    assert_eq!(fx.f.resume(&run, 0.0), Ok(RunState::Paused));
    assert_eq!(fx.f.resume(&run, 1.0), Ok(RunState::Working));
    fx.f.pump();
    let again = fx.agents.briefs().pop().unwrap();
    assert_eq!(again.resume.as_deref(), Some("s-1"));
    assert_eq!(fx.f.run_info(&run).unwrap().budget_usd, 2.0);
}

#[test]
fn token_budget_pauses() {
    let cfg = Config {
        max_tokens: Some(200),
        ..Config::default()
    };
    let fx = Fx::with(writes(true), &[ONE], cfg);
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", usage(0.0));
    fx.event("work", usage(0.0));
    assert_eq!(fx.state(&run), RunState::Paused);
}

#[test]
fn run_kill_switch_cancels() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.f.cancel(&run).unwrap();
    assert_eq!(fx.state(&run), RunState::Cancelled);
    assert!(fx.agents.running().is_empty());
    assert_eq!(fx.f.take_ended().len(), 1);
}

#[test]
fn global_kill_switch_cancels_all_and_stops_pickup() {
    let fx = Fx::new(writes(true), &[ONE]);
    let a = fx.start("SHIP-1", &[]);
    let b = fx.start("SHIP-2", &[]);
    fx.f.set_kill_switch(true);
    assert!(fx.f.kill_switch());
    assert_eq!(fx.state(&a), RunState::Cancelled);
    assert_eq!(fx.state(&b), RunState::Cancelled);
    assert!(fx.agents.running().is_empty());
    let req = shipyard_engine::ports::StartRequest {
        project: "ship".into(),
        ticket: shipyard_engine::fake::todo("SHIP-3"),
        status: "To Do".into(),
        machine: "m1".into(),
        stamped: false,
    };
    assert!(fx.f.start(&req).is_err());
    fx.f.set_kill_switch(false);
    assert!(fx.f.start(&req).is_ok());
}

#[test]
fn sync_stop_cancels_the_run() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.f.stop(&run, "ticket terminal").unwrap();
    assert_eq!(fx.state(&run), RunState::Cancelled);
    assert!(
        fx.logged(&run, "note")
            .iter()
            .any(|n| n["stop"] == "ticket terminal")
    );
}

#[test]
fn blocking_review_runs_a_fix_round_then_blocks() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &["wf:bug"]);
    fx.done(&run, "triage");
    fx.done(&run, "fix");
    assert_eq!(fx.state(&run), RunState::SelfReview);
    for round in 1..=2 {
        fx.report(
            &run,
            "review",
            Outcome::Partial,
            json!({"summary": "missing test"}),
        );
        // A fix round goes back to Working, in the same worktree.
        assert_eq!(fx.state(&run), RunState::Working);
        let fix = fx.agents.briefs().pop().unwrap();
        assert_eq!(fix.step, "fix");
        assert_eq!(fix.dir, std::path::PathBuf::from(format!("/wt/{run}/fix")));
        assert!(
            fix.prompt
                .contains(&format!("Fix round {round}: missing test"))
        );
        fx.done(&run, "fix");
    }
    fx.report(&run, "review", Outcome::Partial, json!({}));
    // `max_rounds` is spent.
    assert_eq!(fx.state(&run), RunState::Blocked);
}

#[test]
fn missing_runner_blocks_and_a_click_unblocks() {
    let fx = Fx::new(writes(true), &[ONE]);
    fx.agents.fail_start(Some("claude is not installed"));
    let run = fx.start("SHIP-1", &[]);
    assert_eq!(fx.state(&run), RunState::Blocked);
    fx.agents.fail_start(None);
    fx.f.unblock(&run).unwrap();
    fx.f.pump();
    assert_eq!(fx.agents.running(), ["work"]);
}

#[test]
fn every_runner_event_is_logged() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.event(
        "work",
        AgentEvent::Text {
            text: "hello".into(),
        },
    );
    fx.event("work", exit(0));
    let runner = fx.logged(&run, "runner");
    assert!(
        runner
            .iter()
            .any(|e| e["start"] == "work" && e["model"] == "sonnet")
    );
    assert!(runner.iter().any(|e| e["type"] == "text"));
    // An exit with code 0 and no report ends the step.
    assert_eq!(fx.state(&run), RunState::Done);
}
