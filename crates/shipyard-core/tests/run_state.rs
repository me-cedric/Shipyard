//! Run state machine, clocks, budget and backoff (spec `factory`, REQ-001 to REQ-007, REQ-022,
//! REQ-036).

use std::collections::BTreeMap;
use std::time::Duration;

use shipyard_core::pickup::StateMapping;
use shipyard_core::run::*;

fn walk(events: &[RunEvent]) -> Run {
    events.iter().fold(Run::new(), |run, ev| {
        run.apply(*ev).expect("listed transition")
    })
}

const TO_WORKING: [RunEvent; 4] = [
    RunEvent::Claim,
    RunEvent::Start,
    RunEvent::PlanReady { gate: true },
    RunEvent::PlanApproved,
];

#[test]
fn main_path_reaches_done() {
    let run = walk(&[
        RunEvent::Claim,
        RunEvent::Start,
        RunEvent::PlanReady { gate: true },
        RunEvent::PlanApproved,
        RunEvent::BuildDone,
        RunEvent::PrOpened,
        RunEvent::PrMerged,
        RunEvent::Closed,
    ]);
    assert_eq!(run.state, RunState::Done);
    assert!(run.state.is_final());
}

#[test]
fn refused_transition_keeps_the_state() {
    let run = walk(&TO_WORKING);
    let err = run.apply(RunEvent::PrMerged).unwrap_err();
    assert_eq!(err.from, RunState::Working);
    assert_eq!(err.event, RunEvent::PrMerged);
    assert_eq!(run.state, RunState::Working);
    assert!(err.to_string().contains("Working"));
}

#[test]
fn plan_gate_on_waits_and_off_skips() {
    let on = walk(&[
        RunEvent::Claim,
        RunEvent::Start,
        RunEvent::PlanReady { gate: true },
    ]);
    assert_eq!(on.state, RunState::PlanReview);
    let off = walk(&[
        RunEvent::Claim,
        RunEvent::Start,
        RunEvent::PlanReady { gate: false },
    ]);
    assert_eq!(off.state, RunState::Working);
}

#[test]
fn plan_rejected_returns_to_planning() {
    let run = walk(&[
        RunEvent::Claim,
        RunEvent::Start,
        RunEvent::PlanReady { gate: true },
        RunEvent::PlanRejected,
    ]);
    assert_eq!(run.state, RunState::Planning);
}

#[test]
fn ci_failure_goes_back_to_working() {
    let mut events = TO_WORKING.to_vec();
    events.extend([
        RunEvent::BuildDone,
        RunEvent::PrOpened,
        RunEvent::ChangesRequested,
    ]);
    let run = walk(&events);
    assert_eq!(run.state, RunState::ChangesRequested);
    assert_eq!(
        run.apply(RunEvent::FixStarted).unwrap().state,
        RunState::Working
    );
}

#[test]
fn self_review_fix_round_and_finish_without_pr() {
    let mut events = TO_WORKING.to_vec();
    events.push(RunEvent::BuildDone);
    let review = walk(&events);
    assert_eq!(
        review.apply(RunEvent::FixRound).unwrap().state,
        RunState::Working
    );
    // A spike or review-only workflow has no pull request step.
    assert_eq!(
        review.apply(RunEvent::Finished).unwrap().state,
        RunState::Done
    );
    assert!(walk(&TO_WORKING).apply(RunEvent::Finished).is_ok());
    assert!(walk(&[RunEvent::Claim]).apply(RunEvent::Finished).is_err());
}

#[test]
fn every_active_state_enters_every_side_state() {
    for state in RunState::ALL.into_iter().filter(|s| s.is_active()) {
        let run = Run {
            state,
            return_to: None,
        };
        for (ev, side) in [
            (RunEvent::Ask, RunState::WaitingForAnswer),
            (RunEvent::Block, RunState::Blocked),
            (RunEvent::Retry, RunState::RetryQueued),
            (RunEvent::BudgetStop, RunState::Paused),
            (RunEvent::Fail, RunState::Failed),
            (RunEvent::Cancel, RunState::Cancelled),
        ] {
            let next = run.apply(ev).unwrap();
            assert_eq!(next.state, side, "{state:?} + {ev:?}");
        }
    }
}

#[test]
fn side_states_store_and_restore_the_return_state() {
    let working = walk(&TO_WORKING);
    for (enter, leave) in [
        (RunEvent::Ask, RunEvent::Answered),
        (RunEvent::Block, RunEvent::Unblock),
        (RunEvent::Retry, RunEvent::RetryDue),
        (RunEvent::BudgetStop, RunEvent::Resume { budget_left: true }),
    ] {
        let side = working.apply(enter).unwrap();
        assert_eq!(side.return_to, Some(RunState::Working));
        let back = side.apply(leave).unwrap();
        assert_eq!(back.state, RunState::Working);
        assert_eq!(back.return_to, None);
    }
}

#[test]
fn resume_without_budget_stays_paused() {
    let paused = walk(&TO_WORKING).apply(RunEvent::BudgetStop).unwrap();
    let still = paused
        .apply(RunEvent::Resume { budget_left: false })
        .unwrap();
    assert_eq!(still, paused);
}

#[test]
fn a_second_question_keeps_the_first_return_state() {
    let waiting = walk(&TO_WORKING).apply(RunEvent::Ask).unwrap();
    let again = waiting.apply(RunEvent::Ask).unwrap();
    assert_eq!(again.state, RunState::WaitingForAnswer);
    assert_eq!(again.return_to, Some(RunState::Working));
}

#[test]
fn side_states_can_be_cancelled_but_not_crossed() {
    let blocked = walk(&TO_WORKING).apply(RunEvent::Block).unwrap();
    assert_eq!(
        blocked.apply(RunEvent::Cancel).unwrap().state,
        RunState::Cancelled
    );
    assert!(blocked.apply(RunEvent::Answered).is_err());
    assert!(blocked.apply(RunEvent::Retry).is_err());
}

#[test]
fn final_states_refuse_everything() {
    for state in [RunState::Failed, RunState::Cancelled, RunState::Done] {
        let run = Run {
            state,
            return_to: None,
        };
        assert!(state.is_final());
        for ev in [RunEvent::Cancel, RunEvent::Claim, RunEvent::Answered] {
            assert!(run.apply(ev).is_err(), "{state:?} + {ev:?}");
        }
    }
}

#[test]
fn backoff_doubles_and_caps_at_five_minutes() {
    let secs: Vec<u64> = (1..=8).map(|n| retry_delay(n).as_secs()).collect();
    assert_eq!(secs, [10, 20, 40, 80, 160, 300, 300, 300]);
    assert_eq!(retry_delay(0), Duration::from_secs(10));
    assert_eq!(retry_delay(u32::MAX), Duration::from_secs(300));
}

#[test]
fn retries_spent_fail_the_run() {
    assert_eq!(after_failure(1, 2), RunEvent::Retry);
    assert_eq!(after_failure(2, 2), RunEvent::Retry);
    assert_eq!(after_failure(3, 2), RunEvent::Fail);
    assert_eq!(after_failure(1, 0), RunEvent::Fail);
}

#[test]
fn review_rounds() {
    assert_eq!(after_review(false, 0, MAX_ROUNDS), None);
    assert_eq!(after_review(true, 0, 2), Some(RunEvent::FixRound));
    assert_eq!(after_review(true, 1, 2), Some(RunEvent::FixRound));
    assert_eq!(after_review(true, 2, 2), Some(RunEvent::Block));
    // A workflow value above the cap still stops at two rounds.
    assert_eq!(after_review(true, 2, 9), Some(RunEvent::Block));
}

#[test]
fn clocks_stop_while_waiting_for_an_answer() {
    assert!(RunState::Working.clocks_run());
    for s in [
        RunState::WaitingForAnswer,
        RunState::PlanReview,
        RunState::Paused,
        RunState::PROpen,
    ] {
        assert!(!s.clocks_run(), "{s:?}");
    }
    // REQ-006 scenario: stall 300 s, one hour of waiting.
    let mut stall = Stopwatch::started(0);
    stall.follow(RunState::WaitingForAnswer, 100);
    stall.follow(RunState::WaitingForAnswer, 2000);
    assert_eq!(stall.read(3700), 100);
    stall.follow(RunState::Working, 3700);
    assert_eq!(stall.read(3750), 150);
    assert!(stall.read(3950) >= 300);
    stall.reset(3950);
    assert_eq!(stall.read(3960), 10);
}

#[test]
fn budget_levels() {
    assert_eq!(budget_level(3.99, 5.0), BudgetLevel::Under);
    assert_eq!(budget_level(4.0, 5.0), BudgetLevel::Alert);
    assert_eq!(budget_level(5.0, 5.0), BudgetLevel::Spent);
    assert_eq!(budget_level(1.0, 0.0), BudgetLevel::Spent);
}

#[test]
fn staged_labels_swap_mapped_labels_and_keep_the_rest() {
    let map: BTreeMap<String, StateMapping> = [
        ("Working", vec!["shipyard:running"]),
        ("WaitingForAnswer", vec!["shipyard:needs-you"]),
        ("Done", vec![]),
    ]
    .into_iter()
    .map(|(k, l)| {
        (
            k.to_string(),
            StateMapping {
                status: None,
                labels: l.into_iter().map(String::from).collect(),
            },
        )
    })
    .collect();
    let now = ["bug".to_string(), "shipyard:running".to_string()];
    assert_eq!(
        staged_labels(&now, &map, RunState::WaitingForAnswer),
        ["bug", "shipyard:needs-you"]
    );
    assert_eq!(staged_labels(&now, &map, RunState::Done), ["bug"]);
    // No duplicate when the label is already there.
    assert_eq!(staged_labels(&now, &map, RunState::Working), now);
}

#[test]
fn run_serializes_with_state_names() {
    let run = walk(&TO_WORKING).apply(RunEvent::Ask).unwrap();
    let json = serde_json::to_string(&run).unwrap();
    assert_eq!(
        json,
        r#"{"state":"WaitingForAnswer","return_to":"Working"}"#
    );
    assert_eq!(serde_json::from_str::<Run>(&json).unwrap(), run);
}
