//! Pause, budget choices, feature limits and stage limits (spec `runs-recipes`, REQ-001,
//! REQ-005, REQ-006, REQ-007). A fake runner and a fake clock drive the factory.

mod fx;

use fx::{Fx, writes};
use shipyard_core::pickup::{Budgets, StageLimits, Then, Thens};
use shipyard_core::run::{Cause, RunState};
use shipyard_core::work_item::Person;
use shipyard_engine::approvals::Write;
use shipyard_engine::fake::todo;
use shipyard_engine::ports::{AgentEvent, Dispatch};
use shipyard_engine::run_engine::Config;

/// A run budget and a stall time that never decide.
const BIG: &str = "
id: one
steps:
  - { id: work, role: worker, model: mid, tools: [report] }
limits: { max_turns: 50, budget_usd: 100, stall_s: 10000000 }
";

fn usage(cost: f64) -> AgentEvent {
    AgentEvent::Usage {
        input_tokens: 100,
        output_tokens: 50,
        cached_tokens: 0,
        cost_usd: Some(cost),
    }
}

fn fx_with(tweak: impl FnOnce(&mut shipyard_engine::run_engine::Project)) -> Fx {
    Fx::build(writes(true), &[BIG], Config::default(), tweak)
}

fn run_of(fx: &Fx, key: &str) -> String {
    fx.f.runs().into_iter().find(|r| r.key == key).unwrap().id
}

fn comments(fx: &Fx) -> usize {
    fx.writer
        .sent()
        .iter()
        .filter(|w| matches!(w, Write::Comment { .. }))
        .count()
}

// ---- REQ-001 Pause

#[test]
fn pause_waits_for_the_end_of_the_turn_then_resume_continues_the_session() {
    let fx = fx_with(|_| {});
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", AgentEvent::Session { id: "s-1".into() });
    fx.f.pause(&run).unwrap();
    // The turn is in progress: the agent still works and no work is lost.
    assert_eq!(fx.state(&run), RunState::Working);
    assert_eq!(fx.agents.running().len(), 1);
    fx.event("work", AgentEvent::Turn);
    assert_eq!(fx.state(&run), RunState::Paused);
    assert!(fx.agents.running().is_empty());
    let info = fx.f.run_info(&run).unwrap();
    assert_eq!(info.escalation.unwrap().cause, Cause::Person);
    assert_eq!(info.run.return_to, Some(RunState::Working));
    // A person pause posts no stop report: the person did it.
    assert_eq!(comments(&fx), 0);
    assert_eq!(fx.f.resume(&run, 0.0), Ok(RunState::Working));
    fx.f.pump();
    let again = fx.agents.briefs().pop().unwrap();
    assert_eq!(again.resume.as_deref(), Some("s-1"));
    assert!(fx.f.run_info(&run).unwrap().escalation.is_none());
}

#[test]
fn pause_is_refused_when_no_agent_works_and_the_request_ends_with_the_state() {
    let fx = fx_with(|_| {});
    let run = fx.start("SHIP-1", &[]);
    fx.f.cancel(&run).unwrap();
    assert!(fx.f.pause(&run).unwrap_err().contains("refused Pause"));
    assert!(fx.f.pause("missing").is_err());
    // A second run: the request is asked, then a budget stop moves it before the turn ends.
    let fx = fx_with(|_| {});
    let run = fx.start("SHIP-1", &[]);
    fx.f.pause(&run).unwrap();
    fx.f.cancel(&run).unwrap();
    assert_eq!(fx.state(&run), RunState::Cancelled);
}

#[test]
fn a_paused_run_keeps_its_slot_in_the_run_limits_and_the_stage() {
    let fx = fx_with(|p| {
        p.automation.concurrency.per_stage = StageLimits {
            build: Some(1),
            ..StageLimits::default()
        };
    });
    let a = fx.start("SHIP-1", &[]);
    fx.f.pause(&a).unwrap();
    fx.event("work", AgentEvent::Turn);
    assert_eq!(fx.state(&a), RunState::Paused);
    // The paused run is still an active run: the global and project limits count it.
    assert!(fx.f.active_runs().iter().any(|r| r.run_id == a));
    // It holds the one Build slot: the next run waits.
    fx.start("SHIP-2", &[]);
    fx.f.pump();
    assert_eq!(fx.state(&run_of(&fx, "SHIP-2")), RunState::Planning);
}

// ---- REQ-006 Warn at and Then

fn day(usd: f64) -> Budgets {
    Budgets {
        day: [("*".to_string(), usd)].into(),
        ..Budgets::default()
    }
}

#[test]
fn warn_at_sets_the_share_of_the_alert_for_the_project() {
    let fx = fx_with(|p| {
        p.automation.budgets = Budgets {
            warn_at: Some(70),
            ..day(10.0)
        };
    });
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", usage(6.9));
    assert!(fx.logged(&run, "alert").is_empty());
    fx.event("work", usage(0.2));
    let alerts = fx.logged(&run, "alert");
    assert_eq!(alerts.len(), 1);
    assert_eq!(alerts[0]["budget"], "70 %");
    assert_eq!(fx.state(&run), RunState::Working);
}

#[test]
fn go_on_turns_the_budget_into_a_warning_that_shows_once() {
    let fx = fx_with(|p| {
        p.automation.budgets = Budgets {
            at_limit: Thens {
                day: Then::GoOn,
                ..Thens::default()
            },
            ..day(2.0)
        };
    });
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", usage(1.7));
    fx.event("work", usage(0.6));
    fx.event("work", usage(0.6));
    assert_eq!(fx.state(&run), RunState::Working, "the run goes on");
    assert_eq!(fx.logged(&run, "alert").len(), 1, "the alert shows once");
    // The kill switch stays: Stop all agents still stops the run.
    fx.f.cancel_all("stopped by Stop all agents");
    assert_eq!(fx.state(&run), RunState::Cancelled);
}

#[test]
fn go_on_keeps_the_stall_timeout_and_the_max_turns() {
    let fx = Fx::build(
        writes(true),
        &[
            "id: one\nsteps:\n  - { id: work, role: worker, model: mid, tools: [report] }\nlimits: { max_turns: 2, budget_usd: 1, stall_s: 100 }\n",
        ],
        Config::default(),
        |p| {
            p.automation.budgets.at_limit = Thens {
                feature: Then::GoOn,
                ..Thens::default()
            };
        },
    );
    let run = fx.start("SHIP-1", &[]);
    // The run budget only warns: 5 dollars on a budget of 1 do not stop the run.
    fx.event("work", usage(5.0));
    assert_eq!(fx.state(&run), RunState::Working);
    // The max turns stay.
    for _ in 0..3 {
        fx.event("work", AgentEvent::Turn);
    }
    assert_eq!(fx.state(&run), RunState::Paused);
}

#[test]
fn a_budget_with_no_choice_pauses_the_run_and_posts_the_stop_report() {
    let budgets = Budgets {
        member: [("Alice".to_string(), 1.0)].into(),
        ..Budgets::default()
    };
    let fx = fx_with(|p| p.automation.budgets = budgets);
    let mut ticket = todo("SHIP-1");
    ticket.item.assignee = Some(Person {
        id: "u1".into(),
        name: "Alice".into(),
    });
    fx.mirror
        .lock()
        .unwrap()
        .put_tickets("jira", &[ticket.clone()])
        .unwrap();
    fx.start_ticket(ticket, &[]);
    let run = run_of(&fx, "SHIP-1");
    fx.event("work", usage(1.2));
    assert_eq!(fx.state(&run), RunState::Paused);
    assert_eq!(
        fx.f.run_info(&run).unwrap().escalation.unwrap().cause,
        Cause::Budget
    );
    assert_eq!(comments(&fx), 1);
}

#[test]
fn pause_and_ask_me_stop_the_run_with_no_comment_on_the_issue_tracker() {
    for (then, escalated) in [(Then::Pause, false), (Then::Ask, true)] {
        let fx = fx_with(|p| {
            p.automation.budgets = Budgets {
                at_limit: Thens {
                    feature: then,
                    ..Thens::default()
                },
                feature: [("SHIP-1".to_string(), 1.0)].into(),
                ..Budgets::default()
            };
        });
        let run = fx.start("SHIP-1", &[]);
        fx.event("work", usage(1.2));
        assert_eq!(fx.state(&run), RunState::Paused, "{then:?}");
        assert_eq!(fx.f.run_info(&run).unwrap().escalation.is_some(), escalated);
        assert_eq!(comments(&fx), 0, "{then:?}");
    }
}

// ---- REQ-005 Limit of a feature

#[test]
fn the_limit_of_a_feature_sums_every_run_of_its_ticket() {
    let fx = fx_with(|p| {
        p.automation.budgets = Budgets {
            feature: [("SHIP-1".to_string(), 3.0)].into(),
            ..Budgets::default()
        };
    });
    let first = fx.start("SHIP-1", &[]);
    fx.event("work", usage(1.5));
    assert_eq!(fx.state(&first), RunState::Working);
    fx.f.cancel(&first).unwrap();
    assert!(fx.f.active_runs().is_empty());
    fx.start("SHIP-1", &[]);
    let second =
        fx.f.runs()
            .into_iter()
            .find(|r| r.key == "SHIP-1" && r.id != first)
            .unwrap()
            .id;
    fx.event("work", usage(1.4));
    assert_eq!(fx.state(&second), RunState::Working, "$2.90 of $3.00");
    fx.event("work", usage(0.1));
    assert_eq!(fx.state(&second), RunState::Paused, "the limit is reached");
    // A ticket with no limit is not touched.
    fx.start("SHIP-2", &[]);
    let other = run_of(&fx, "SHIP-2");
    fx.event("work", usage(9.0));
    assert_eq!(fx.state(&other), RunState::Working);
}

// ---- REQ-007 Stage limits

#[test]
fn a_run_stays_queued_while_its_stage_is_at_its_limit() {
    let fx = fx_with(|p| {
        p.automation.concurrency.global = 9;
        p.automation.concurrency.per_stage = StageLimits {
            build: Some(2),
            ..StageLimits::default()
        };
    });
    for key in ["SHIP-1", "SHIP-2", "SHIP-3"] {
        fx.start(key, &[]);
    }
    let [a, b, c] = ["SHIP-1", "SHIP-2", "SHIP-3"].map(|k| run_of(&fx, k));
    assert_eq!(fx.state(&a), RunState::Working);
    assert_eq!(fx.state(&b), RunState::Working);
    assert_eq!(fx.state(&c), RunState::Planning, "queued: Build is full");
    assert!(
        fx.logged(&c, "note")
            .iter()
            .any(|n| n["queued"] == "build limit")
    );
    fx.f.pump();
    assert_eq!(fx.agents.running().len(), 2);
    // A run leaves Build: the queued run goes on at the next pump.
    fx.done(&a, "work");
    fx.f.pump();
    assert_eq!(fx.state(&c), RunState::Working);
}

// ---- REQ-002 Take it over, REQ-003 Attach

#[test]
fn a_run_ends_as_cancelled_with_the_reason_of_the_person_and_keeps_its_work() {
    let fx = fx_with(|_| {});
    let run = fx.start("SHIP-1", &[]);
    fx.f.cancel_because(&run, "Taken over by Ada").unwrap();
    assert_eq!(fx.state(&run), RunState::Cancelled);
    assert!(
        fx.logged(&run, "note")
            .iter()
            .any(|n| n["stop"] == "Taken over by Ada")
    );
}

#[test]
fn a_file_of_the_person_is_context_for_the_next_turn_as_data() {
    let fx = fx_with(|_| {});
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", AgentEvent::Session { id: "s-1".into() });
    fx.f.add_context(&run, "the file `notes.md`", "Use the new endpoint.")
        .unwrap();
    fx.f.pause(&run).unwrap();
    fx.event("work", AgentEvent::Turn);
    assert_eq!(fx.f.resume(&run, 0.0), Ok(RunState::Working));
    fx.f.pump();
    let next = fx.agents.briefs().pop().unwrap();
    assert!(next.prompt.contains("notes.md"), "{}", next.prompt);
    assert!(
        next.prompt.contains("Use the new endpoint."),
        "{}",
        next.prompt
    );
    fx.f.cancel(&run).unwrap();
    assert!(fx.f.add_context(&run, "the file `a.md`", "x").is_err());
}

// ---- REQ-008 Role of a human step

const GATED: &str = "
id: gated
steps:
  - { id: plan, role: planner, mode: plan, gate: human, approver: techlead, tools: [report] }
limits: { max_turns: 50, budget_usd: 100, stall_s: 10000000 }
";

#[test]
fn the_plan_that_waits_names_the_role_that_approves_it() {
    let fx = Fx::build(writes(true), &[GATED], Config::default(), |p| {
        p.default_workflow = "gated".into();
    });
    let run = fx.start("SHIP-1", &[]);
    assert_eq!(
        fx.f.run_info(&run).unwrap().approver,
        None,
        "no plan waits yet"
    );
    fx.done(&run, "plan");
    assert_eq!(fx.state(&run), RunState::PlanReview);
    assert_eq!(
        fx.f.run_info(&run).unwrap().approver.as_deref(),
        Some("techlead")
    );
    fx.f.approve_plan(&run).unwrap();
    assert_eq!(fx.f.run_info(&run).unwrap().approver, None);
}
