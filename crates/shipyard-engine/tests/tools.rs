//! The agent tools that need the run (spec `factory` REQ-019, REQ-020): `handoff`, `message`,
//! `spawn_subtask` and `read_ref`. The server checks the shape; the factory decides the rest.

mod fx;

use std::sync::{Arc, Mutex};

use fx::{Fx, ONE, writes};
use serde_json::json;
use shipyard_core::run::RunState;
use shipyard_core::workflow::StepState;
use shipyard_engine::ports::AgentEvent;
use shipyard_mcp::session::Binding;
use shipyard_mcp::tools::agent::{
    AgentEvent as Tool, AgentEvents, Handoff, Message, ReadRef, SpawnSubtask,
};
use shipyard_store::ref_index::{Citation, Entity, RefIndex};

fn who(run: &str, step: &str) -> Binding {
    Binding {
        run: run.into(),
        step: step.into(),
        tools: Vec::new(),
    }
}

fn handoff(role: &str, summary: &str, step: Option<&str>) -> Tool {
    Tool::Handoff(Handoff {
        role: role.into(),
        summary: summary.into(),
        step: step.map(Into::into),
    })
}

fn message(to: &str, text: &str) -> Tool {
    Tool::Message(Message {
        to: to.into(),
        text: text.into(),
    })
}

fn spawn(title: &str, brief: &str, role: &str) -> Tool {
    Tool::SpawnSubtask(SpawnSubtask {
        title: title.into(),
        brief: brief.into(),
        role: role.into(),
    })
}

/// A `feature` run in `Working` with `n` tasks: build-1 and build-2 run, each on its session.
fn building(fx: &Fx, n: usize) -> String {
    let run = fx.start("SHIP-1", &[]);
    fx.done(&run, "grill");
    let tasks: Vec<String> = (1..=n).map(|i| format!("task {i}")).collect();
    fx.report(
        &run,
        "plan",
        shipyard_mcp::tools::agent::Outcome::Done,
        json!({"tasks": tasks}),
    );
    fx.f.approve_plan(&run).unwrap();
    assert_eq!(fx.state(&run), RunState::Working);
    for (i, id) in fx.agents.running().iter().enumerate() {
        fx.event(
            id,
            AgentEvent::Session {
                id: format!("s-{}", i + 1),
            },
        );
    }
    run
}

fn err(fx: &Fx, run: &str, step: &str, t: Tool) -> String {
    fx.f.emit(&who(run, step), t).unwrap_err()
}

// ---- message

#[test]
fn a_message_to_the_person_is_an_inbox_item_and_a_log_event() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    let out =
        fx.f.emit(
            &who(&run, "work"),
            message("person", "the spec is silent on retries"),
        )
        .unwrap();
    assert_eq!(out["ok"], true);
    let items = fx.f.messages();
    assert_eq!(items.len(), 1);
    let (r, m) = &items[0];
    assert_eq!(
        (r.as_str(), m.from.as_str(), m.text.as_str()),
        (run.as_str(), "work", "the spec is silent on retries")
    );
    assert!(!m.read);
    let logged = fx.logged(&run, "message");
    assert_eq!(logged.len(), 1);
    assert_eq!(logged[0]["to"], "person");
    // The run goes on: a message is not a question.
    assert_eq!(fx.state(&run), RunState::Working);
    // The person reads it.
    fx.f.read_message(&run, 0).unwrap();
    assert!(fx.f.messages()[0].1.read);
    assert!(fx.f.read_message(&run, 5).is_err());
}

#[test]
fn a_message_to_a_step_that_has_not_started_waits_in_its_brief() {
    let fx = Fx::new(writes(true), &[]);
    let run = building(&fx, 1);
    fx.f.emit(
        &who(&run, "build-1"),
        message("review", "check the retry path"),
    )
    .unwrap();
    fx.done(&run, "build-1");
    assert_eq!(fx.agents.running(), ["review"]);
    let brief = fx.agents.briefs().pop().unwrap();
    assert!(
        brief
            .prompt
            .contains("Message from `build-1`: check the retry path"),
        "{}",
        brief.prompt
    );
}

#[test]
fn a_message_to_a_running_step_reaches_it_at_its_next_turn_on_its_session() {
    let fx = Fx::new(writes(true), &[]);
    let run = building(&fx, 2);
    assert_eq!(fx.agents.running(), ["build-1", "build-2"]);
    fx.f.emit(
        &who(&run, "build-1"),
        message("build-2", "use the shared helper"),
    )
    .unwrap();

    // The target stops after its turn and starts again on its session with the text.
    assert_eq!(fx.agents.running(), ["build-1", "build-2"]);
    let again = fx.agents.briefs().pop().unwrap();
    assert_eq!(again.step, "build-2");
    assert_eq!(again.resume.as_deref(), Some("s-2"));
    assert!(
        again
            .prompt
            .contains("Message from `build-1`: use the shared helper"),
        "{}",
        again.prompt
    );
    // The sender was not touched and nothing counts as a failure.
    assert_eq!(
        fx.agents
            .briefs()
            .iter()
            .filter(|b| b.step == "build-1")
            .count(),
        1
    );
    let info = fx.f.run_info(&run).unwrap();
    assert_eq!(info.run.state, RunState::Working);
    assert!(
        fx.logged(&run, "note")
            .iter()
            .all(|n| n.get("step_failed").is_none())
    );
}

#[test]
fn a_message_to_nowhere_is_an_error_for_the_agent() {
    let fx = Fx::new(writes(true), &[]);
    let run = building(&fx, 2);
    assert!(err(&fx, &run, "build-1", message("ghost", "hi")).contains("no step `ghost`"));
    assert!(err(&fx, &run, "build-1", message("build-1", "hi")).contains("itself"));
    assert!(err(&fx, &run, "build-1", message("grill", "hi")).contains("ended"));
    // The caller must be a running step of the run.
    assert!(err(&fx, &run, "review", message("person", "hi")).contains("not running"));
    assert!(fx.f.messages().is_empty());
}

// ---- handoff

#[test]
fn a_handoff_ends_the_step_and_gives_the_summary_to_the_role_in_the_same_run() {
    let fx = Fx::new(writes(true), &[]);
    let run = building(&fx, 1);
    let out =
        fx.f.emit(
            &who(&run, "build-1"),
            handoff("reviewer", "tests are missing for retries", None),
        )
        .unwrap();
    assert_eq!(out["step"], "review");
    // The builder is done with the summary as its output; its agent is stopped.
    let info = fx.f.run_info(&run).unwrap();
    assert_eq!(
        info.steps[2].units,
        [("build-1".to_string(), StepState::Done)]
    );
    assert!(fx.agents.running().iter().all(|s| s == "review"));
    // The reviewer of the same run starts with the note.
    assert_eq!(fx.agents.running(), ["review"]);
    let brief = fx.agents.briefs().pop().unwrap();
    assert!(
        brief
            .prompt
            .contains("Handoff from `build-1` (reviewer): tests are missing for retries"),
        "{}",
        brief.prompt
    );
    assert_eq!(fx.state(&run), RunState::SelfReview);
    assert_eq!(
        fx.logged(&run, "tool")
            .iter()
            .filter(|t| t["tool"] == "handoff")
            .count(),
        1
    );
}

#[test]
fn a_handoff_can_name_the_step() {
    let fx = Fx::new(writes(true), &[]);
    let run = building(&fx, 1);
    let out =
        fx.f.emit(
            &who(&run, "build-1"),
            handoff("reviewer", "look", Some("review")),
        )
        .unwrap();
    assert_eq!(out["step"], "review");
}

#[test]
fn a_handoff_that_has_no_taker_is_an_error_and_the_step_goes_on() {
    let fx = Fx::new(writes(true), &[]);
    let run = building(&fx, 1);
    // No step has this role.
    assert!(
        err(&fx, &run, "build-1", handoff("tester", "x", None))
            .contains("no step with role `tester`")
    );
    // The named step does not exist, has another role, is the caller, or has ended.
    assert!(
        err(
            &fx,
            &run,
            "build-1",
            handoff("reviewer", "x", Some("ghost"))
        )
        .contains("no step `ghost`")
    );
    assert!(err(&fx, &run, "build-1", handoff("reviewer", "x", Some("pr"))).contains("role"));
    assert!(err(&fx, &run, "build-1", handoff("worker", "x", Some("build"))).contains("itself"));
    assert!(err(&fx, &run, "build-1", handoff("planner", "x", Some("plan"))).contains("ended"));
    let info = fx.f.run_info(&run).unwrap();
    assert_eq!(
        info.steps[2].units,
        [("build-1".to_string(), StepState::Running)]
    );
    assert_eq!(fx.agents.running(), ["build-1"]);
}

// ---- spawn_subtask

#[test]
fn a_subtask_is_a_new_child_of_the_step_with_its_own_worktree() {
    let fx = Fx::new(writes(true), &[]);
    let run = building(&fx, 1);
    let out =
        fx.f.emit(
            &who(&run, "build-1"),
            spawn("Add the retry test", "Cover the 3 retry cases.", "tester"),
        )
        .unwrap();
    assert_eq!(out["child"], "build-2");
    assert_eq!(fx.agents.running(), ["build-1", "build-2"]);
    let b = fx.agents.briefs().pop().unwrap();
    assert_eq!(b.step, "build-2");
    assert_eq!(
        b.dir,
        std::path::PathBuf::from(format!("/wt/{run}/build-2"))
    );
    assert!(
        b.prompt.contains("Add the retry test") && b.prompt.contains("Cover the 3 retry cases."),
        "{}",
        b.prompt
    );
    // The role of the subtask picks the profile: the tester, not the worker.
    assert!(b.prompt.contains("You are the tester."), "{}", b.prompt);
    assert_eq!(
        fx.logged(&run, "tool")
            .iter()
            .filter(|t| t["tool"] == "spawn_subtask")
            .count(),
        1
    );

    // The step waits for the subtask: the parent ends first, the join comes after both.
    fx.done(&run, "build-1");
    assert_eq!(
        fx.f.run_info(&run).unwrap().steps[2].state,
        StepState::Running
    );
    assert_eq!(fx.git.count("merge_child"), 0);
    fx.done(&run, "build-2");
    assert_eq!(
        fx.git
            .calls()
            .iter()
            .filter(|c| c.starts_with("merge_child"))
            .collect::<Vec<_>>(),
        ["merge_child build-1", "merge_child build-2"]
    );
    assert_eq!(fx.state(&run), RunState::SelfReview);
}

#[test]
fn a_subtask_waits_for_a_free_slot_under_max_parallel() {
    let fx = Fx::new(writes(true), &[]);
    // `build` runs two children at a time; a third task waits.
    let run = building(&fx, 3);
    let e = err(&fx, &run, "build-1", spawn("t", "b", "worker"));
    assert!(e.contains("2 of 2"), "{e}");
    // A child ends and the third task takes the slot: still full.
    fx.done(&run, "build-2");
    assert_eq!(fx.agents.running(), ["build-1", "build-3"]);
    assert!(err(&fx, &run, "build-1", spawn("t", "b", "worker")).contains("2 of 2"));
    // Now one slot is free: the subtask starts at once.
    fx.done(&run, "build-3");
    let out =
        fx.f.emit(&who(&run, "build-1"), spawn("t", "b", "worker"))
            .unwrap();
    assert_eq!(out["child"], "build-4");
    assert_eq!(fx.agents.running(), ["build-1", "build-4"]);
}

#[test]
fn a_step_with_no_for_each_or_no_worktree_cannot_spawn() {
    const FAN: &str = "
id: fan
steps:
  - id: plan
    role: planner
    mode: plan
    tools: [report]
  - id: build
    role: worker
    needs: [plan]
    for_each: plan.tasks
    tools: [report, spawn_subtask]
limits: { max_turns: 40, budget_usd: 5, stall_s: 300 }
";
    let fx = Fx::new(writes(true), &[FAN]);
    let run = fx.start("SHIP-1", &["wf:fan"]);
    let e = err(&fx, &run, "plan", spawn("t", "b", "worker"));
    assert!(e.contains("no `for_each`"), "{e}");
    fx.report(
        &run,
        "plan",
        shipyard_mcp::tools::agent::Outcome::Done,
        json!({"tasks": ["a"]}),
    );
    let e = err(&fx, &run, "build-1", spawn("t", "b", "worker"));
    assert!(e.contains("worktree"), "{e}");
}

#[test]
fn a_subtask_needs_a_known_role_and_budget_left() {
    let fx = Fx::new(writes(true), &[]);
    let run = building(&fx, 1);
    assert!(err(&fx, &run, "build-1", spawn("t", "b", "wizard")).contains("role `wizard`"));
    // 80 % of the 5 USD budget is spent: no new subtask.
    fx.event(
        "build-1",
        AgentEvent::Usage {
            input_tokens: 1,
            output_tokens: 1,
            cached_tokens: 0,
            cost_usd: Some(4.2),
        },
    );
    assert_eq!(fx.state(&run), RunState::Working);
    assert!(err(&fx, &run, "build-1", spawn("t", "b", "worker")).contains("budget"));
    assert_eq!(fx.f.run_info(&run).unwrap().steps[2].units.len(), 1);
}

#[test]
fn a_subtask_survives_a_restart_with_its_item_and_role() {
    let mut fx = Fx::new(writes(true), &[]);
    let run = building(&fx, 1);
    fx.f.emit(
        &who(&run, "build-1"),
        spawn("Add the retry test", "Cover it.", "tester"),
    )
    .unwrap();
    fx.restart();
    fx.f.pump();
    let steps = fx.f.run_info(&run).unwrap().steps;
    assert_eq!(steps[2].units.len(), 2);
    assert_eq!(fx.agents.running(), ["build-1", "build-2"]);
    let b = fx.agents.briefs().pop().unwrap();
    assert!(b.prompt.contains("Add the retry test"));
}

// ---- read_ref

fn index() -> Arc<Mutex<RefIndex>> {
    let mut idx = RefIndex::open_memory().unwrap();
    let adr = Entity::new(
        "adr:0003",
        "Use SQLite",
        Some("accepted"),
        Some("docs/decisions/0003.md"),
    );
    let cite = Citation {
        source: "wi:SHIP-1".into(),
        target: "adr:0003".into(),
    };
    idx.set_source("fake:1", "1", &[adr], &[cite]).unwrap();
    Arc::new(Mutex::new(idx))
}

fn read_ref(r: &str) -> Tool {
    Tool::ReadRef(ReadRef {
        reference: r.into(),
    })
}

#[test]
fn read_ref_returns_the_resolved_entity_and_its_backlinks() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.f.set_refs(index());
    let out = fx.f.emit(&who(&run, "work"), read_ref("adr:0003")).unwrap();
    assert_eq!(out["ref"], "adr:0003");
    assert_eq!(out["title"], "Use SQLite");
    assert_eq!(out["state"], "resolved");
    assert_eq!(out["backlinks"][0]["kind"], "wi");
    // A read is a tool event: it keeps the stall timer alive.
    assert!(
        fx.logged(&run, "tool")
            .iter()
            .any(|t| t["tool"] == "read_ref" && t["ref"] == "adr:0003")
    );
}

#[test]
fn a_ref_that_does_not_resolve_is_an_error_not_a_guess() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.f.set_refs(index());
    // Broken (a known kind, no such entity), unresolved (a kind that is not indexed), not a ref.
    for (r, word) in [
        ("adr:0009", "broken"),
        ("wi:SHIP-99", "unresolved"),
        ("nope", "not a ref"),
    ] {
        let e = err(&fx, &run, "work", read_ref(r));
        assert!(e.contains(word), "{r}: {e}");
    }
}

#[test]
fn read_ref_without_an_index_says_so() {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    assert!(err(&fx, &run, "work", read_ref("adr:0003")).contains("index"));
}

#[test]
fn the_factory_ends_the_agent_of_a_step_when_the_step_ends_stops_or_fails() {
    let fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &[]);
    fx.done(&run, "grill");
    assert_eq!(fx.agents.ended(), [(run.clone(), "grill".to_string())]);
    // A stop (the run leaves the clock states) ends the agents that run.
    fx.f.cancel(&run).unwrap();
    let ended = fx.agents.ended();
    assert!(ended.len() > 1, "{ended:?}");
    assert!(ended.iter().all(|(r, _)| *r == run));
}
