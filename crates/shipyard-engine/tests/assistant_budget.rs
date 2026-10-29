//! Assistant turns book into the counters of the factory (spec `assistant`, REQ-012).

mod fx;

use fx::{Fx, writes};
use shipyard_core::pickup::Budgets;
use shipyard_core::run::BudgetLevel;
use shipyard_engine::run_engine::Config;

fn fx(budgets: Budgets) -> Fx {
    Fx::build(writes(true), &[], Config::default(), |p| {
        p.automation.budgets = budgets;
    })
}

#[test]
fn a_booked_turn_shows_in_factory_usage_for_the_day_and_the_member() {
    let fx = fx(Budgets::default());
    fx.f.book_assistant("ship", "Alice", 100, 50, 0.25).unwrap();
    fx.f.book_assistant("ship", "Alice", 10, 5, 0.05).unwrap();
    fx.f.book_assistant("other", "Alice", 1, 1, 9.0).unwrap();
    let (days, members) = fx.f.usage("ship");
    assert_eq!(days.len(), 1);
    assert_eq!((days[0].key.as_str(), days[0].tokens), ("2026-10-29", 165));
    assert!((days[0].usd - 0.30).abs() < 1e-9);
    assert_eq!((members[0].key.as_str(), members[0].tokens), ("Alice", 165));
}

#[test]
fn no_budget_never_alerts_or_refuses() {
    let fx = fx(Budgets::default());
    fx.f.book_assistant("ship", "Alice", 1, 1, 500.0).unwrap();
    let g = fx.f.assistant_gate("ship", "Alice");
    assert_eq!((g.level, g.budget), (BudgetLevel::Under, None));
}

#[test]
fn the_day_budget_alerts_at_80_percent_and_refuses_at_100_naming_the_budget() {
    let fx = fx(Budgets {
        day: [("*".to_string(), 2.0)].into(),
        ..Budgets::default()
    });
    fx.f.book_assistant("ship", "", 1, 1, 1.5).unwrap();
    assert_eq!(fx.f.assistant_gate("ship", "").level, BudgetLevel::Under);
    fx.f.book_assistant("ship", "", 1, 1, 0.2).unwrap();
    let g = fx.f.assistant_gate("ship", "");
    assert_eq!(
        (g.level, g.budget.as_deref()),
        (BudgetLevel::Alert, Some("day 2026-10-29"))
    );
    fx.f.book_assistant("ship", "", 1, 1, 0.3).unwrap();
    assert_eq!(fx.f.assistant_gate("ship", "").level, BudgetLevel::Spent);
    // The next UTC day starts again.
    fx.advance(86_400);
    assert_eq!(fx.f.assistant_gate("ship", "").level, BudgetLevel::Under);
}

#[test]
fn a_member_budget_counts_the_turns_of_that_member_and_a_restart_keeps_them() {
    let mut fx = fx(Budgets {
        member: [("Alice".to_string(), 1.0)].into(),
        ..Budgets::default()
    });
    fx.f.book_assistant("ship", "Alice", 1, 1, 1.0).unwrap();
    fx.restart_with(|p| {
        p.automation.budgets = Budgets {
            member: [("Alice".to_string(), 1.0)].into(),
            ..Budgets::default()
        }
    });
    let g = fx.f.assistant_gate("ship", "Alice");
    assert_eq!(
        (g.level, g.budget.as_deref()),
        (BudgetLevel::Spent, Some("member Alice"))
    );
    assert_eq!(fx.f.assistant_gate("ship", "Bob").level, BudgetLevel::Under);
    assert!(fx.f.take_errors().is_empty(), "a booking is no orphan run");
}
