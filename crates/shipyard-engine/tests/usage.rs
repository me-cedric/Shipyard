//! Sessions, usage and the budgets of a day and of a member (spec `factory`, REQ-022, REQ-031,
//! REQ-032). A fake runner and a fake clock drive the factory.

mod fx;

use fx::{Fx, writes};
use shipyard_core::pickup::Budgets;
use shipyard_core::run::RunState;
use shipyard_core::work_item::Person;
use shipyard_core::workflow::StepState;
use shipyard_engine::fake::todo;
use shipyard_engine::ports::AgentEvent;
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

fn fx(budgets: Budgets) -> Fx {
    Fx::build(writes(true), &[BIG], Config::default(), |p| {
        p.automation.budgets = budgets;
    })
}

/// The run of a ticket. `Fx::start` takes the last run id, which is not the newest one.
fn run_of(fx: &Fx, key: &str) -> String {
    fx.f.runs().into_iter().find(|r| r.key == key).unwrap().id
}

fn day_budget(usd: f64) -> Budgets {
    Budgets {
        day: [("*".to_string(), usd)].into(),
        ..Budgets::default()
    }
}

#[test]
fn no_budget_never_pauses() {
    let fx = fx(Budgets::default());
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", usage(50.0));
    assert_eq!(fx.state(&run), RunState::Working);
}

#[test]
fn a_day_budget_alerts_once_at_80_percent_and_pauses_at_100() {
    let fx = fx(day_budget(2.0));
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", usage(1.5));
    assert!(fx.logged(&run, "alert").is_empty());
    fx.event("work", usage(0.2));
    fx.event("work", usage(0.1));
    assert_eq!(fx.logged(&run, "alert").len(), 1);
    assert_eq!(fx.state(&run), RunState::Working);
    fx.event("work", usage(0.2));
    assert_eq!(fx.state(&run), RunState::Paused);
}

#[test]
fn the_day_total_counts_every_run_and_starts_again_the_next_utc_day() {
    let fx = fx(day_budget(2.0));
    fx.start("SHIP-1", &[]);
    let a = run_of(&fx, "SHIP-1");
    fx.event("work", usage(1.9));
    fx.start("SHIP-2", &[]);
    let b = run_of(&fx, "SHIP-2");
    fx.event("work", usage(0.2));
    assert_eq!(fx.state(&a), RunState::Working);
    assert_eq!(fx.state(&b), RunState::Paused, "the day is spent");
    // Next UTC day (the clock starts at 10:00): resume works, the day total is new.
    fx.advance(86_400);
    assert_eq!(fx.f.resume(&b, 0.0), Ok(RunState::Working));
}

#[test]
fn a_member_budget_follows_the_assignee_of_the_ticket() {
    let budgets = Budgets {
        member: [("Alice".to_string(), 1.0)].into(),
        ..Budgets::default()
    };
    let fx = fx(budgets);
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
    let alice = run_of(&fx, "SHIP-1");
    fx.event("work", usage(0.9));
    fx.event("work", usage(0.2));
    fx.start("SHIP-2", &[]);
    let nobody = run_of(&fx, "SHIP-2");
    fx.event("work", usage(5.0));
    assert_eq!(fx.state(&alice), RunState::Paused);
    assert_eq!(
        fx.state(&nobody),
        RunState::Working,
        "no budget for no member"
    );
}

#[test]
fn usage_sums_by_day_and_member_with_budgets_and_sessions_show_the_steps() {
    let budgets = Budgets {
        day: [("2026-10-29".to_string(), 10.0)].into(),
        member: [("Alice".to_string(), 5.0)].into(),
    };
    let fx = fx(budgets);
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
    let alice = run_of(&fx, "SHIP-1");
    fx.event("work", usage(1.0));
    fx.advance(86_400);
    fx.event("work", usage(0.5));
    let (days, members) = fx.f.usage("ship");
    let rows: Vec<_> = days
        .iter()
        .map(|d| (d.key.as_str(), d.tokens, d.usd, d.budget))
        .collect();
    assert_eq!(
        rows,
        [
            ("2026-10-30", 150, 0.5, None),
            ("2026-10-29", 150, 1.0, Some(10.0))
        ]
    );
    assert_eq!(members.len(), 1);
    assert_eq!(
        (
            members[0].key.as_str(),
            members[0].tokens,
            members[0].usd,
            members[0].budget
        ),
        ("Alice", 300, 1.5, Some(5.0))
    );
    assert!(fx.f.usage("other").0.is_empty());

    let s = fx.f.sessions();
    assert_eq!(s.len(), 1);
    assert_eq!(
        (s[0].run.as_str(), s[0].step.as_str(), s[0].runner.as_str()),
        (alice.as_str(), "work", "claude")
    );
    assert_eq!(
        (s[0].model.as_deref(), s[0].state, s[0].tokens),
        (Some("sonnet"), StepState::Running, 300)
    );
    assert_eq!(s[0].cost_usd, 1.5);
}

#[test]
fn sessions_keep_a_live_one_older_than_the_newest_ended_ones() {
    let fx = fx(Budgets::default());
    fx.start("SHIP-0", &[]);
    let live = run_of(&fx, "SHIP-0");
    for i in 1..=52 {
        fx.advance(1);
        let key = format!("SHIP-{i}");
        fx.start(&key, &[]);
        fx.done(&run_of(&fx, &key), "work");
    }
    let s = fx.f.sessions();
    assert_eq!(s.len(), 51, "the live one and the newest 50 ended");
    assert!(
        s.iter()
            .any(|x| x.run == live && x.state == StepState::Running)
    );
}

#[test]
fn a_day_budget_alerts_once_for_all_the_runs_of_the_day() {
    let fx = fx(day_budget(2.0));
    fx.start("SHIP-1", &[]);
    fx.event("work", usage(1.7));
    fx.start("SHIP-2", &[]);
    fx.event("work", usage(0.1));
    let alerts: usize =
        fx.f.runs()
            .iter()
            .map(|r| fx.logged(&r.id, "alert").len())
            .sum();
    assert_eq!(alerts, 1);
}

const SMALL: &str = "
id: one
steps:
  - { id: work, role: worker, model: mid, tools: [report] }
limits: { max_turns: 50, budget_usd: 1, stall_s: 10000000 }
";

#[test]
fn a_day_budget_alerts_after_the_run_budget_alerted() {
    let fx = Fx::build(writes(true), &[SMALL], Config::default(), |p| {
        p.automation.budgets = day_budget(1.05);
    });
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", usage(0.82));
    assert_eq!(fx.logged(&run, "alert").len(), 1, "the run budget");
    fx.event("work", usage(0.03));
    let keys: Vec<_> = fx
        .logged(&run, "alert")
        .iter()
        .map(|a| a["key"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(keys, [format!("run:{run}"), "day:2026-10-29".to_string()]);
}

#[test]
fn the_totals_after_a_restart_equal_the_totals_before() {
    let mut fx = fx(day_budget(50.0));
    fx.start("SHIP-1", &[]);
    fx.event("work", usage(1.0));
    fx.start("SHIP-2", &[]);
    fx.event("work", usage(0.5));
    let before = fx.f.usage("ship");
    assert_eq!(before.0[0].usd, 1.5);
    fx.restart_with(|p| p.automation.budgets = day_budget(50.0));
    assert_eq!(fx.f.usage("ship"), before);
}
