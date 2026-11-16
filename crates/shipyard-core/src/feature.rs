//! The feature of Flow and its stage (spec `app-redesign`, REQ-010 and REQ-012, `adr:0023`
//! points 4 and 5). No I/O: the app reads the parts, this module joins them.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::pickup::PrState;
use crate::run::{Run, RunState};

/// The five stages of Flow, in order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Idea,
    Spec,
    Build,
    Review,
    Ready,
}

/// Why a feature waits. `NeedsYou` and `Blocked` ask a person to act; `Stopped` means that no
/// agent works on it (REQ-014).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Mark {
    NeedsYou,
    Blocked,
    Stopped,
}

/// The stage and the mark of a run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct StageMark {
    pub stage: Stage,
    pub mark: Option<Mark>,
}

/// The stage of a state on the main path, `None` for a side state, and the mark of the state.
/// No wildcard arm: a new state does not compile until it has its entry.
fn split(state: RunState) -> (Option<Stage>, Option<Mark>) {
    use RunState as S;
    match state {
        S::Queued | S::Claimed | S::Planning => (Some(Stage::Spec), None),
        S::PlanReview => (Some(Stage::Spec), Some(Mark::NeedsYou)),
        S::Working | S::SelfReview => (Some(Stage::Build), None),
        S::PROpen | S::ChangesRequested => (Some(Stage::Review), None),
        S::Merged | S::Done => (Some(Stage::Ready), None),
        // A final stop keeps no return state: the work stopped while it was built.
        S::Failed | S::Cancelled => (Some(Stage::Build), Some(Mark::Stopped)),
        S::WaitingForAnswer => (None, Some(Mark::NeedsYou)),
        S::Blocked => (None, Some(Mark::Blocked)),
        // A retry starts again with no person.
        S::RetryQueued => (None, None),
        S::Paused => (None, Some(Mark::Stopped)),
    }
}

/// A side state takes the stage of its return state. A side state with no return state, from a
/// damaged log, shows in Build.
pub fn stage_of(run: Run) -> StageMark {
    let (stage, mark) = split(run.state);
    StageMark {
        stage: stage
            .or_else(|| run.return_to.and_then(|r| split(r).0))
            .unwrap_or(Stage::Build),
        mark,
    }
}

/// A ticket of the mirror.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TicketPart {
    pub key: String,
    pub title: String,
    /// The issue tracker puts the ticket in a done category.
    pub done: bool,
}

/// A spec change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangePart {
    pub id: String,
    pub title: String,
    /// The key of the ticket that the change belongs to: the mirror link or the `wi:` ref of the
    /// proposal.
    pub ticket: Option<String>,
}

/// A run of the factory. `key` is its ticket.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunPart {
    pub id: String,
    pub key: String,
    pub title: String,
    pub run: Run,
    pub pr: Option<u64>,
}

/// A pull request of the mirror.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrPart {
    /// `pr:<code-host>:<number>`.
    pub reference: String,
    pub number: u64,
    pub title: String,
    pub state: PrState,
}

/// One feature: its title, its place in Flow and the refs of its parts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FlowFeature {
    pub title: String,
    pub stage: Stage,
    pub mark: Option<Mark>,
    /// `wi:<key>`.
    pub ticket: Option<String>,
    /// `change:<id>`.
    pub change: Option<String>,
    /// `run:<id>`.
    pub run: Option<String>,
    /// `pr:<code-host>:<number>`.
    pub pr: Option<String>,
}

/// Joins the parts into features: each ticket and each change shows in one feature.
/// `runs` is newest first: the newest run of a ticket gives the stage. An older run of the
/// same ticket and its pull request do not show.
pub fn features(
    tickets: &[TicketPart],
    changes: &[ChangePart],
    runs: &[RunPart],
    prs: &[PrPart],
) -> Vec<FlowFeature> {
    let change_of = |key: &str| changes.iter().find(|c| c.ticket.as_deref() == Some(key));
    let pr_of = |n: Option<u64>| n.and_then(|n| prs.iter().find(|p| p.number == n));
    // Each ticket key once: the tickets, then the keys that only a change or a run names.
    let mut keys: Vec<&str> = Vec::new();
    for k in tickets
        .iter()
        .map(|t| t.key.as_str())
        .chain(changes.iter().filter_map(|c| c.ticket.as_deref()))
        .chain(runs.iter().map(|r| r.key.as_str()))
    {
        if !keys.contains(&k) {
            keys.push(k);
        }
    }
    let mut out: Vec<FlowFeature> = keys
        .into_iter()
        .map(|k| {
            let run = runs.iter().find(|r| r.key == k);
            let mut f = feature(
                tickets.iter().find(|t| t.key == k),
                change_of(k),
                run,
                pr_of(run.and_then(|r| r.pr)),
            );
            f.ticket = Some(format!("wi:{k}"));
            f
        })
        .collect();
    // A change with no ticket, or a second change of one ticket, is a feature of its own.
    out.extend(
        changes
            .iter()
            .filter(|c| {
                c.ticket
                    .as_deref()
                    .and_then(change_of)
                    .is_none_or(|first| first.id != c.id)
            })
            .map(|c| feature(None, Some(c), None, None)),
    );
    // A pull request that no run opened, such as one of a person.
    out.extend(
        prs.iter()
            .filter(|p| !runs.iter().any(|r| r.pr == Some(p.number)))
            .map(|p| feature(None, None, None, Some(p))),
    );
    out
}

fn feature(
    ticket: Option<&TicketPart>,
    change: Option<&ChangePart>,
    run: Option<&RunPart>,
    pr: Option<&PrPart>,
) -> FlowFeature {
    let at_stage = match (run, pr) {
        (Some(r), _) => stage_of(r.run),
        (None, Some(p)) => match p.state {
            PrState::Open => at(Stage::Review, None),
            PrState::Merged => at(Stage::Ready, None),
            PrState::Closed => at(Stage::Review, Some(Mark::Stopped)),
        },
        _ if ticket.is_some_and(|t| t.done) => at(Stage::Ready, None),
        _ if change.is_some() => at(Stage::Spec, None),
        _ => at(Stage::Idea, None),
    };
    let title = ticket
        .map(|t| &t.title)
        .or(change.map(|c| &c.title))
        .or(run.map(|r| &r.title))
        .or(pr.map(|p| &p.title))
        .cloned()
        .unwrap_or_default();
    FlowFeature {
        title,
        stage: at_stage.stage,
        mark: at_stage.mark,
        ticket: ticket.map(|t| format!("wi:{}", t.key)),
        change: change.map(|c| format!("change:{}", c.id)),
        run: run.map(|r| format!("run:{}", r.id)),
        pr: pr.map(|p| p.reference.clone()),
    }
}

fn at(stage: Stage, mark: Option<Mark>) -> StageMark {
    StageMark { stage, mark }
}

#[cfg(test)]
mod tests {
    use super::*;
    use Mark::*;
    use RunState as S;
    use Stage::*;

    fn main(state: RunState) -> StageMark {
        stage_of(Run {
            state,
            return_to: None,
        })
    }

    fn side(state: RunState, back: RunState) -> StageMark {
        stage_of(Run {
            state,
            return_to: Some(back),
        })
    }

    #[test]
    fn each_main_state_has_its_stage_and_mark() {
        let cases = [
            (S::Queued, at(Spec, None)),
            (S::Claimed, at(Spec, None)),
            (S::Planning, at(Spec, None)),
            (S::PlanReview, at(Spec, Some(NeedsYou))),
            (S::Working, at(Build, None)),
            (S::SelfReview, at(Build, None)),
            (S::PROpen, at(Review, None)),
            (S::ChangesRequested, at(Review, None)),
            (S::Merged, at(Ready, None)),
            (S::Done, at(Ready, None)),
            (S::Failed, at(Build, Some(Stopped))),
            (S::Cancelled, at(Build, Some(Stopped))),
        ];
        for (state, want) in cases {
            assert_eq!(main(state), want, "{state:?}");
        }
    }

    #[test]
    fn a_side_state_takes_the_stage_of_its_return_state() {
        // The fixed scenario of REQ-010: a run in Blocked shows in Build, with the mark blocked.
        assert_eq!(side(S::Blocked, S::Working), at(Build, Some(Blocked)));
        assert_eq!(side(S::Blocked, S::Planning), at(Spec, Some(Blocked)));
        assert_eq!(
            side(S::WaitingForAnswer, S::PROpen),
            at(Review, Some(NeedsYou))
        );
        assert_eq!(side(S::RetryQueued, S::SelfReview), at(Build, None));
        assert_eq!(side(S::Paused, S::Working), at(Build, Some(Stopped)));
        // No return state: Build.
        assert_eq!(main(S::Paused), at(Build, Some(Stopped)));
    }

    #[test]
    fn the_tests_name_all_sixteen_states() {
        let named = [
            S::Queued,
            S::Claimed,
            S::Planning,
            S::PlanReview,
            S::Working,
            S::SelfReview,
            S::PROpen,
            S::ChangesRequested,
            S::Merged,
            S::Done,
            S::WaitingForAnswer,
            S::Blocked,
            S::RetryQueued,
            S::Paused,
            S::Failed,
            S::Cancelled,
        ];
        assert_eq!(named, RunState::ALL);
        for s in RunState::ALL {
            assert_eq!(split(s).0.is_none(), s.is_side(), "{s:?}");
        }
    }

    fn ticket(key: &str, done: bool) -> TicketPart {
        TicketPart {
            key: key.into(),
            title: format!("ticket {key}"),
            done,
        }
    }

    fn change(id: &str, ticket: Option<&str>) -> ChangePart {
        ChangePart {
            id: id.into(),
            title: format!("change {id}"),
            ticket: ticket.map(str::to_string),
        }
    }

    fn run(id: &str, key: &str, state: RunState, pr: Option<u64>) -> RunPart {
        RunPart {
            id: id.into(),
            key: key.into(),
            title: format!("run {id}"),
            run: Run {
                state,
                return_to: (state == S::Blocked).then_some(S::Working),
            },
            pr,
        }
    }

    fn pr(number: u64, state: PrState) -> PrPart {
        PrPart {
            reference: format!("pr:gh:{number}"),
            number,
            title: format!("pull {number}"),
            state,
        }
    }

    #[test]
    fn a_feature_with_no_run_takes_its_stage_from_its_parts() {
        let got = features(
            &[
                ticket("A-1", false),
                ticket("A-2", false),
                ticket("A-3", true),
            ],
            &[change("add-x", Some("A-2")), change("lone", None)],
            &[],
            &[
                pr(7, PrState::Open),
                pr(8, PrState::Merged),
                pr(6, PrState::Closed),
            ],
        );
        let stages: Vec<(&str, Stage, Option<Mark>)> = got
            .iter()
            .map(|f| (f.title.as_str(), f.stage, f.mark))
            .collect();
        assert_eq!(
            stages,
            [
                ("ticket A-1", Idea, None),
                ("ticket A-2", Spec, None),
                ("ticket A-3", Ready, None),
                ("change lone", Spec, None),
                ("pull 7", Review, None),
                ("pull 8", Ready, None),
                ("pull 6", Review, Some(Stopped)),
            ]
        );
        assert_eq!(got[1].change.as_deref(), Some("change:add-x"));
        assert_eq!(got[1].ticket.as_deref(), Some("wi:A-2"));
        assert_eq!(got[4].pr.as_deref(), Some("pr:gh:7"));
    }

    #[test]
    fn a_feature_joins_its_ticket_change_newest_run_and_pull_request_once() {
        let got = features(
            &[ticket("A-1", false)],
            &[change("add-x", Some("A-1"))],
            &[
                run("R2", "A-1", S::Blocked, Some(9)),
                run("R1", "A-1", S::Cancelled, Some(8)),
                run("R3", "B-1", S::Working, None),
            ],
            &[pr(8, PrState::Closed), pr(9, PrState::Open)],
        );
        assert_eq!(
            got,
            [
                FlowFeature {
                    title: "ticket A-1".into(),
                    stage: Build,
                    mark: Some(Blocked),
                    ticket: Some("wi:A-1".into()),
                    change: Some("change:add-x".into()),
                    run: Some("run:R2".into()),
                    pr: Some("pr:gh:9".into()),
                },
                FlowFeature {
                    title: "run R3".into(),
                    stage: Build,
                    mark: None,
                    ticket: Some("wi:B-1".into()),
                    change: None,
                    run: Some("run:R3".into()),
                    pr: None,
                },
            ]
        );
    }
}
