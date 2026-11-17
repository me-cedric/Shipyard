//! The feature of Flow and its stage (spec `app-redesign`, REQ-010 and REQ-012, `adr:0023`
//! points 4 and 5). No I/O: the app reads the parts, this module joins them.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::delivery::Ci;
use crate::pickup::PrState;
use crate::run::{Cause, Run, RunState};

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

/// The one main action of a stopped run (REQ-014, `adr:0023`): the card of Flow, Today and the
/// Ask bar name it with no run log.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Stop {
    /// The run waits for an answer.
    Reply,
    /// Blocked.
    Unblock,
    /// Paused because a budget was reached.
    AddBudget,
    /// Failed.
    TryAgain,
    /// Paused by a person, or for another cause.
    Resume,
    /// Nothing to deliver, or the pull request closed or merged on the code host.
    CloseDone,
}

/// The main action of a run in `state`. `cause` is the cause of the last escalation, `pr` the
/// state of its pull request on the code host. `CloseDone` on a pull request that merged or
/// closed gives the run the event of the code host (`Factory::close_outside`).
/// `None`: the run does not wait for a person. In `Merged` the engine saw the merge and closes
/// the run itself.
pub fn stop_of(state: RunState, cause: Option<Cause>, pr: Option<PrState>) -> Option<Stop> {
    use RunState as S;
    let outside = matches!(pr, Some(PrState::Merged | PrState::Closed));
    match state {
        _ if outside && !state.is_final() && state != S::Merged => Some(Stop::CloseDone),
        S::WaitingForAnswer => Some(Stop::Reply),
        S::Blocked if cause == Some(Cause::NothingToDeliver) => Some(Stop::CloseDone),
        S::Blocked => Some(Stop::Unblock),
        S::Paused if cause == Some(Cause::Budget) => Some(Stop::AddBudget),
        S::Paused => Some(Stop::Resume),
        S::Failed => Some(Stop::TryAgain),
        _ => None,
    }
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
    pub assignee: Option<String>,
}

/// A spec change.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangePart {
    pub id: String,
    pub title: String,
    /// The key of the ticket that the change belongs to: the mirror link or the `wi:` ref of the
    /// proposal.
    pub ticket: Option<String>,
    /// The change has a file under its `specs/`. A change with only its proposal is an idea.
    pub has_spec: bool,
}

/// A run of the factory. `key` is its ticket.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunPart {
    pub id: String,
    pub key: String,
    pub title: String,
    pub run: Run,
    pub pr: Option<u64>,
    /// The step of the run whose agent works now. `None`: no agent works.
    pub step: Option<String>,
    /// The approvals and the open questions that wait for a person.
    pub approvals: u32,
    pub questions: u32,
    /// The main action of the stop (`stop_of`).
    pub stop: Option<Stop>,
}

/// A pull request of the mirror.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrPart {
    /// `pr:<code-host>:<number>`.
    pub reference: String,
    pub number: u64,
    pub title: String,
    pub state: PrState,
    /// `None` when the mirror does not hold it.
    pub author: Option<String>,
    /// `None`: the code host has no checks for it.
    pub checks: Option<Ci>,
}

/// Who works on a feature (REQ-011): an agent step of the run, or a person.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Who {
    pub name: String,
    pub agent: bool,
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
    /// The agent step that works now, else the assignee of the ticket, else the author of the pull
    /// request (REQ-011).
    pub who: Option<Who>,
    /// The facts of the state line: the state of the run, what waits for a person, the checks of
    /// the pull request.
    pub run_state: Option<RunState>,
    pub approvals: u32,
    pub questions: u32,
    pub checks: Option<Ci>,
    /// The main action of a stopped run (`stop_of`). `None`: nothing waits on a stop.
    pub stop: Option<Stop>,
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
        _ if change.is_some_and(|c| c.has_spec) => at(Stage::Spec, None),
        _ => at(Stage::Idea, None),
    };
    let title = ticket
        .map(|t| &t.title)
        .or(change.map(|c| &c.title))
        .or(run.map(|r| &r.title))
        .or(pr.map(|p| &p.title))
        .cloned()
        .unwrap_or_default();
    let person = |name: &Option<String>| name.clone().map(|name| Who { name, agent: false });
    let who = run
        .and_then(|r| r.step.clone())
        .map(|name| Who { name, agent: true })
        .or_else(|| ticket.and_then(|t| person(&t.assignee)))
        .or_else(|| pr.and_then(|p| person(&p.author)));
    FlowFeature {
        title,
        stage: at_stage.stage,
        mark: at_stage.mark,
        ticket: ticket.map(|t| format!("wi:{}", t.key)),
        change: change.map(|c| format!("change:{}", c.id)),
        run: run.map(|r| format!("run:{}", r.id)),
        pr: pr.map(|p| p.reference.clone()),
        who,
        run_state: run.map(|r| r.run.state),
        approvals: run.map_or(0, |r| r.approvals),
        questions: run.map_or(0, |r| r.questions),
        checks: pr.and_then(|p| p.checks),
        stop: run.and_then(|r| r.stop),
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
    fn each_stop_state_has_its_one_action() {
        use Stop::*;
        let at = |state| stop_of(state, None, None);
        assert_eq!(at(S::WaitingForAnswer), Some(Reply));
        assert_eq!(at(S::Blocked), Some(Unblock));
        assert_eq!(at(S::Failed), Some(TryAgain));
        // A person paused it, or max turns: Resume. A budget: Add budget.
        assert_eq!(at(S::Paused), Some(Resume));
        assert_eq!(
            stop_of(S::Paused, Some(Cause::MaxTurns), None),
            Some(Resume)
        );
        assert_eq!(
            stop_of(S::Paused, Some(Cause::Budget), None),
            Some(AddBudget)
        );
        assert_eq!(
            stop_of(S::Blocked, Some(Cause::ReviewRounds), None),
            Some(Unblock)
        );
        assert_eq!(
            stop_of(S::Blocked, Some(Cause::NothingToDeliver), None),
            Some(CloseDone)
        );
        // Each other state waits on no stop.
        for s in RunState::ALL {
            if !matches!(s, S::WaitingForAnswer | S::Blocked | S::Failed | S::Paused) {
                assert_eq!(at(s), None, "{s:?}");
            }
        }
    }

    #[test]
    fn a_pull_request_that_ended_on_the_code_host_closes_a_run_that_is_not_final() {
        use Stop::*;
        for pr in [PrState::Merged, PrState::Closed] {
            assert_eq!(stop_of(S::PROpen, None, Some(pr)), Some(CloseDone));
            assert_eq!(stop_of(S::Blocked, None, Some(pr)), Some(CloseDone));
            assert_eq!(
                stop_of(S::Paused, Some(Cause::Budget), Some(pr)),
                Some(CloseDone)
            );
            // A final run, or a run that saw the merge, has nothing to close.
            assert_eq!(stop_of(S::Done, None, Some(pr)), None);
            assert_eq!(stop_of(S::Cancelled, None, Some(pr)), None);
            assert_eq!(stop_of(S::Failed, None, Some(pr)), Some(TryAgain));
            assert_eq!(stop_of(S::Merged, None, Some(pr)), None);
        }
        assert_eq!(stop_of(S::PROpen, None, Some(PrState::Open)), None);
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
            assignee: None,
        }
    }

    fn change(id: &str, ticket: Option<&str>) -> ChangePart {
        ChangePart {
            id: id.into(),
            title: format!("change {id}"),
            ticket: ticket.map(str::to_string),
            has_spec: true,
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
            step: None,
            approvals: 0,
            questions: 0,
            stop: stop_of(state, None, None),
        }
    }

    fn pr(number: u64, state: PrState) -> PrPart {
        PrPart {
            reference: format!("pr:gh:{number}"),
            number,
            title: format!("pull {number}"),
            state,
            author: None,
            checks: None,
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
            &[
                change("add-x", Some("A-2")),
                ChangePart {
                    has_spec: false,
                    ..change("lone", None)
                },
            ],
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
                ("change lone", Idea, None),
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
    fn a_feature_takes_the_stop_of_its_run() {
        let got = features(
            &[],
            &[],
            &[
                run("r1", "A-1", S::Blocked, None),
                run("r2", "A-2", S::Working, None),
            ],
            &[pr(9, PrState::Closed)],
        );
        let stops: Vec<_> = got.iter().map(|f| f.stop).collect();
        assert_eq!(stops, [Some(Stop::Unblock), None, None]);
    }

    #[test]
    fn a_change_with_only_its_proposal_is_an_idea_until_it_has_a_spec() {
        let bare = ChangePart {
            has_spec: false,
            ..change("add-x", Some("A-1"))
        };
        let stage = |c: &ChangePart, r: &[RunPart], p: &[PrPart]| {
            features(&[ticket("A-1", false)], std::slice::from_ref(c), r, p)[0].stage
        };
        assert_eq!(stage(&bare, &[], &[]), Idea);
        assert_eq!(stage(&change("add-x", Some("A-1")), &[], &[]), Spec);
        // A run or a pull request gives the stage, spec or not.
        assert_eq!(
            stage(&bare, &[run("R1", "A-1", S::Working, None)], &[]),
            Build
        );
        let opened = run("R1", "A-1", S::PROpen, Some(9));
        assert_eq!(stage(&bare, &[opened], &[pr(9, PrState::Open)]), Review);
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
                    who: None,
                    run_state: Some(S::Blocked),
                    approvals: 0,
                    questions: 0,
                    checks: None,
                    stop: Some(Stop::Unblock),
                },
                FlowFeature {
                    title: "run R3".into(),
                    stage: Build,
                    mark: None,
                    ticket: Some("wi:B-1".into()),
                    change: None,
                    run: Some("run:R3".into()),
                    pr: None,
                    who: None,
                    run_state: Some(S::Working),
                    approvals: 0,
                    questions: 0,
                    checks: None,
                    stop: None,
                },
            ]
        );
    }

    #[test]
    fn who_is_the_working_agent_else_the_assignee_else_the_author() {
        // The scenario "A working feature" of REQ-011: the card names the agent.
        let agent = |name: &str| {
            Some(Who {
                name: name.into(),
                agent: true,
            })
        };
        let person = |name: &str| {
            Some(Who {
                name: name.into(),
                agent: false,
            })
        };
        let mut t = ticket("A-1", false);
        t.assignee = Some("Ada".into());
        let mut r = run("R1", "A-1", S::Working, Some(9));
        r.step = Some("build".into());
        let mut p = pr(9, PrState::Open);
        p.author = Some("Grace".into());
        let mut lone = pr(10, PrState::Open);
        lone.author = Some("Linus".into());
        let who = |t: &[TicketPart], r: &[RunPart], p: &[PrPart]| {
            features(t, &[], r, p)
                .into_iter()
                .map(|f| f.who)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            who(&[t.clone()], &[r.clone()], &[p.clone()]),
            [agent("build")]
        );
        r.step = None;
        assert_eq!(
            who(&[t.clone()], &[r.clone()], &[p.clone()]),
            [person("Ada")]
        );
        t.assignee = None;
        assert_eq!(
            who(&[t.clone()], &[r.clone()], &[p.clone()]),
            [person("Grace")]
        );
        assert_eq!(who(&[t], &[], &[lone]), [None, person("Linus")]);
    }

    #[test]
    fn the_state_facts_come_from_the_run_and_the_pull_request() {
        let mut r = run("R1", "A-1", S::WaitingForAnswer, Some(9));
        (r.approvals, r.questions) = (2, 1);
        let mut p = pr(9, PrState::Open);
        p.checks = Some(Ci::Failing);
        let f = &features(&[ticket("A-1", false)], &[], &[r], &[p])[0];
        assert_eq!(
            (f.run_state, f.approvals, f.questions, f.checks),
            (Some(S::WaitingForAnswer), 2, 1, Some(Ci::Failing))
        );
        let idea = &features(&[ticket("A-2", false)], &[], &[], &[])[0];
        assert_eq!(
            (idea.run_state, idea.approvals, idea.questions, idea.checks),
            (None, 0, 0, None)
        );
    }
}
