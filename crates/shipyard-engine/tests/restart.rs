//! A restart (spec `factory` REQ-021, `questions-loop`, `delivery`): runs, the approval queue and
//! the open questions come back from the run log file, running steps go on, and a write that went
//! out before the crash is not sent again. `Fx::restart` drops the factory and opens a new one on
//! the same file; the fakes stand for the outside world.

mod fx;

use fx::{Fx, ONE, writes};
use serde_json::json;
use shipyard_core::pickup::{PrEvent, PrEventKind, SyncEvent, Writes};
use shipyard_core::question::{Question, QuestionState};
use shipyard_core::run::{RunEvent, RunState};
use shipyard_core::workflow::StepState;
use shipyard_engine::approvals::Write;
use shipyard_engine::fake::comment;
use shipyard_engine::ports::{AgentEvent, Dispatch};
use shipyard_engine::questions::question_comment;
use shipyard_mcp::tools::agent::{AskQuestion, Outcome, QuestionKind};

fn ask() -> AskQuestion {
    AskQuestion {
        question: "Which scope?".into(),
        options: vec!["small".into(), "large".into()],
        recommended: 1,
        free_text: false,
        kind: QuestionKind::Ticket,
        spec: None,
    }
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

#[test]
fn a_running_step_goes_on_with_its_cli_session_and_keeps_its_cost() {
    let mut fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", AgentEvent::Session { id: "s-1".into() });
    fx.event(
        "work",
        AgentEvent::Usage {
            input_tokens: 100,
            output_tokens: 50,
            cached_tokens: 0,
            cost_usd: Some(0.25),
        },
    );
    assert_eq!(fx.agents.running(), ["work"]);

    fx.restart();
    // The old agent is gone with its process; nothing runs until the pump.
    assert!(fx.agents.running().is_empty());
    assert_eq!(fx.state(&run), RunState::Working);
    let info = fx.f.run_info(&run).unwrap();
    assert_eq!((info.cost_usd, info.tokens), (0.25, 150));
    assert_eq!(fx.f.active_runs().len(), 1);

    fx.f.pump();
    assert_eq!(fx.agents.running(), ["work"]);
    let again = fx.agents.briefs().pop().unwrap();
    assert_eq!(again.resume.as_deref(), Some("s-1"));
    assert_eq!(again.dir, std::path::PathBuf::from(format!("/wt/{run}")));
    // The new agent finishes the step and the run ends as before.
    fx.done(&run, "work");
    assert_eq!(fx.state(&run), RunState::Done);
}

#[test]
fn a_step_with_no_session_is_briefed_again() {
    let mut fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.restart();
    fx.f.pump();
    let again = fx.agents.briefs().pop().unwrap();
    assert_eq!(again.resume, None);
    assert!(again.prompt.contains("SHIP-1"), "{}", again.prompt);
    assert_eq!(fx.state(&run), RunState::Working);
}

#[test]
fn a_plan_at_the_gate_and_its_output_survive_and_the_fan_out_goes_on() {
    let mut fx = Fx::new(writes(true), &[]);
    let run = fx.start("SHIP-1", &[]);
    fx.done(&run, "grill");
    fx.report(
        &run,
        "plan",
        Outcome::Done,
        json!({"tasks": ["a", "b", "c"]}),
    );
    assert_eq!(fx.state(&run), RunState::PlanReview);

    fx.restart();
    assert_eq!(fx.state(&run), RunState::PlanReview);
    let steps = fx.f.run_info(&run).unwrap().steps;
    assert_eq!(steps[1].state, StepState::Gate);
    fx.f.approve_plan(&run).unwrap();
    assert_eq!(fx.state(&run), RunState::Working);
    // The list that the plan reported is still there: one child for each task.
    assert_eq!(fx.agents.running(), ["build-1", "build-2"]);
}

#[test]
fn the_approval_queue_and_its_counter_survive() {
    let mut fx = Fx::new(Writes::default(), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    let before = fx.f.approvals();
    assert_eq!(before.len(), 2);

    fx.restart();
    assert_eq!(fx.f.approvals(), before);
    // One click sends the write that waited across the restart.
    fx.f.approve(before[0].id).unwrap();
    assert_eq!(fx.writer.sent(), [before[0].write.clone()]);
    // A new approval does not reuse an id, not even one that was answered.
    fx.f.cancel(&run).unwrap();
    let ids: Vec<u64> = fx.f.approvals().iter().map(|a| a.id).collect();
    assert!(ids.iter().all(|id| *id > before[1].id), "{ids:?}");
}

#[test]
fn an_open_question_survives_and_its_answer_resumes_the_run() {
    let mut fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", AgentEvent::Session { id: "s-1".into() });
    assert_eq!(fx.f.ask(&run, "work", ask()).unwrap(), "Q-001");
    let posted = comments(&fx);

    fx.restart();
    assert_eq!(fx.state(&run), RunState::WaitingForAnswer);
    let qs = fx.f.questions();
    assert_eq!(qs.len(), 1);
    assert_eq!(
        (qs[0].0.as_str(), qs[0].1.state),
        (run.as_str(), QuestionState::Open)
    );
    // The marker comment is still a marker: the reply of a person is an answer.
    let reply = SyncEvent::Comment {
        key: "SHIP-1".into(),
        comment: comment("r1", "2"),
        answers: Some("Q-001".into()),
    };
    fx.f.event(&reply).unwrap();
    assert_eq!(fx.state(&run), RunState::Working);
    let again = fx.agents.briefs().pop().unwrap();
    assert_eq!(again.resume.as_deref(), Some("s-1"));
    assert!(
        again.prompt.contains("Q-001 Which scope?: large"),
        "{}",
        again.prompt
    );
    // Nothing was posted twice, and the next question gets the next id.
    assert_eq!(comments(&fx), posted);
    assert_eq!(fx.f.ask(&run, "work", ask()).unwrap(), "Q-002");
}

#[test]
fn a_write_that_went_out_before_the_crash_is_not_sent_again() {
    let mut fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", AgentEvent::Session { id: "s-1".into() });
    let saved = fx.snapshots();
    fx.f.ask(&run, "work", ask()).unwrap();
    assert_eq!(comments(&fx).len(), 1);
    // The comment went out and the log has it, but the crash came before the save.
    fx.rewind(&saved);

    fx.restart();
    assert_eq!(fx.state(&run), RunState::Working);
    assert!(fx.f.questions().is_empty());
    fx.f.pump();
    // The resumed agent asks again. The run waits again, with the question that it had, and no
    // second comment goes out.
    assert_eq!(fx.f.ask(&run, "work", ask()).unwrap(), "Q-001");
    assert_eq!(fx.state(&run), RunState::WaitingForAnswer);
    assert_eq!(comments(&fx).len(), 1);
    let notes = fx.logged(&run, "write");
    assert!(notes.iter().any(|w| w["state"] == "replayed"), "{notes:?}");
    // The comment id of the first send is kept: the reply of a person still answers.
    let stored = fx
        .mirror
        .lock()
        .unwrap()
        .questions("jira", "SHIP-1")
        .unwrap();
    assert_eq!(stored.len(), 1);
}

#[test]
fn a_comment_with_an_intent_and_no_result_may_have_gone_out_and_is_not_repeated() {
    let mut fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", AgentEvent::Session { id: "s-1".into() });
    // The crash came after the intent of the question comment and before its result.
    let q = Question::new(
        "Q-001",
        "Which scope?",
        vec!["small".into(), "large".into()],
        1,
        false,
        None,
    )
    .unwrap();
    let write = Write::Comment {
        key: "SHIP-1".into(),
        body: question_comment(&q, ""),
    };
    let intent = json!({
        "state": "sending", "key": serde_json::to_string(&write).unwrap(), "write": write,
    });
    fx.log().append(&run, None, "write", &intent, 1).unwrap();

    fx.restart();
    fx.f.pump();
    assert_eq!(fx.f.ask(&run, "work", ask()).unwrap(), "Q-001");
    assert!(comments(&fx).is_empty(), "at most once");
    let notes = fx.logged(&run, "note");
    assert!(
        notes.iter().any(|n| n["note"]
            .as_str()
            .is_some_and(|t| t.contains("may have gone out"))),
        "{notes:?}"
    );
}

#[test]
fn a_run_that_crashed_between_the_merge_and_the_close_ends_in_done() {
    let mut fx = Fx::new(writes(true), &[]);
    fx.git.set_branch("fix/engine/login");
    let run = fx.start("SHIP-1", &["wf:bug"]);
    for step in ["triage", "fix", "review"] {
        fx.done(&run, step);
    }
    assert_eq!(fx.state(&run), RunState::PROpen);
    // The merge event moved the run to `Merged`, then the process ended.
    fx.f.apply(&run, RunEvent::PrMerged).unwrap();
    assert_eq!(fx.state(&run), RunState::Merged);

    fx.restart();
    assert_eq!(fx.state(&run), RunState::Merged);
    fx.f.pump();
    assert_eq!(fx.state(&run), RunState::Done);
    assert_eq!(
        comments(&fx)
            .iter()
            .filter(|c| c.contains("merged"))
            .count(),
        1
    );
}

#[test]
fn ended_runs_come_back_as_ended_and_nothing_starts() {
    let mut fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.done(&run, "work");
    assert_eq!(fx.state(&run), RunState::Done);
    let started = fx.agents.briefs().len();
    fx.restart();
    assert_eq!(fx.state(&run), RunState::Done);
    assert!(fx.f.active_runs().is_empty());
    assert!(fx.f.take_ended().is_empty());
    fx.f.pump();
    assert_eq!(fx.agents.briefs().len(), started);
}

#[test]
fn the_pump_waits_for_the_project_and_never_blocks_a_run_for_it() {
    let mut fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", AgentEvent::Session { id: "s-1".into() });
    fx.restart_without_project();
    fx.f.pump();
    assert_eq!(fx.state(&run), RunState::Working);
    assert!(fx.agents.running().is_empty());
    // The app opens the project later: the step goes on.
    fx.restart();
    fx.f.pump();
    assert_eq!(fx.agents.running(), ["work"]);
}

#[test]
fn a_run_with_no_save_is_named_and_not_guessed() {
    let mut fx = Fx::new(writes(true), &[ONE]);
    fx.log()
        .append("ORPHAN", None, "state", &json!({"to": "Working"}), 1)
        .unwrap();
    fx.log()
        .append("DONE1", None, "state", &json!({"to": "Done"}), 1)
        .unwrap();
    fx.restart();
    let errors = fx.f.take_errors();
    assert_eq!(errors.len(), 1, "{errors:?}");
    assert!(errors[0].contains("ORPHAN"), "{errors:?}");
    assert!(fx.f.runs().is_empty());
}

#[test]
fn a_pr_event_after_a_restart_finds_the_run_by_its_number() {
    let mut fx = Fx::new(writes(true), &[]);
    fx.git.set_branch("fix/engine/login");
    let run = fx.start("SHIP-1", &["wf:bug"]);
    for step in ["triage", "fix", "review"] {
        fx.done(&run, step);
    }
    fx.restart();
    assert_eq!(fx.f.run_info(&run).unwrap().pr, Some(7));
    fx.f.event(&SyncEvent::Pr(PrEvent {
        number: 7,
        kind: PrEventKind::Merged,
        title: String::new(),
        head_sha: String::new(),
        url: String::new(),
    }))
    .unwrap();
    assert_eq!(fx.state(&run), RunState::Done);
}

#[test]
fn the_global_kill_switch_stays_on_after_a_restart() {
    let mut fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.f.set_kill_switch(true);
    assert_eq!(fx.state(&run), RunState::Cancelled);
    fx.restart();
    assert!(fx.f.kill_switch(), "a restart must not start pickup again");
    assert_eq!(fx.state(&run), RunState::Cancelled);
}
