//! The `pr:` rows (spec `delivery`, REQ-017, REQ-028): read from the mirror of `sync`, linked to
//! runs through the run log.

use serde_json::json;
use shipyard_core::delivery::{Lane, lane};
use shipyard_core::pickup::{Ci, PrState, PullSnapshot};
use shipyard_core::run::RunState;
use shipyard_store::mirror::{Mirror, Poll};
use shipyard_store::pr::{Review, pr_of_run, record, row, rows, runs_of};
use shipyard_store::run_log::RunLog;

fn pull(number: u64, state: PrState, ci: Ci, changes: bool) -> PullSnapshot {
    PullSnapshot {
        number,
        title: format!("pr {number}"),
        state,
        draft: false,
        head_sha: "abc".into(),
        url: format!("https://f/pull/{number}"),
        ci,
        changes_requested: changes,
        updated: "2026-10-29T10:00:00Z".into(),
    }
}

fn mirror(source: &str, pulls: &[PullSnapshot]) -> Mirror {
    let m = Mirror::open_memory().unwrap();
    commit(&m, source, pulls);
    m
}

fn commit(m: &Mirror, source: &str, pulls: &[PullSnapshot]) {
    m.commit(
        source,
        &Poll {
            tickets: &[],
            pulls,
            seen: &[],
            events: &[],
            at: Some(1),
        },
    )
    .unwrap();
}

#[test]
fn a_row_shows_state_ci_and_review_under_its_ref() {
    let m = mirror(
        "code@acme/app",
        &[
            pull(9, PrState::Merged, Ci::Passing, false),
            pull(7, PrState::Open, Ci::Failing, true),
        ],
    );
    let r = rows(&m, "code", "code@acme/app").unwrap();
    assert_eq!(
        r.iter().map(|r| r.reference.as_str()).collect::<Vec<_>>(),
        ["pr:code:7", "pr:code:9"]
    );
    assert_eq!(
        (r[0].number, r[0].state, r[0].ci, r[0].review),
        (7, PrState::Open, Ci::Failing, Review::ChangesRequested)
    );
    assert_eq!((r[1].state, r[1].review), (PrState::Merged, Review::Clear));
    assert_eq!(r[0].url, "https://f/pull/7");
    assert_eq!(r[0].forge, "code");
    // The rows of another source are not here.
    assert!(rows(&m, "code", "other").unwrap().is_empty());
}

#[test]
fn one_row_by_number() {
    let m = mirror("code", &[pull(7, PrState::Open, Ci::Pending, false)]);
    assert_eq!(row(&m, "code", "code", 7).unwrap().unwrap().title, "pr 7");
    assert!(row(&m, "code", "code", 8).unwrap().is_none());
}

#[test]
fn the_mirror_stays_the_source_a_new_poll_changes_the_row() {
    let m = mirror("code", &[pull(7, PrState::Open, Ci::Pending, false)]);
    commit(&m, "code", &[pull(7, PrState::Open, Ci::Passing, false)]);
    assert_eq!(row(&m, "code", "code", 7).unwrap().unwrap().ci, Ci::Passing);
}

#[test]
fn the_signal_feeds_the_lane_of_the_run() {
    let m = mirror(
        "code",
        &[
            pull(1, PrState::Open, Ci::Passing, false),
            pull(2, PrState::Open, Ci::Passing, true),
            pull(3, PrState::Open, Ci::Pending, false),
        ],
    );
    let lanes: Vec<Lane> = rows(&m, "code", "code")
        .unwrap()
        .iter()
        .map(|r| lane(RunState::PROpen, Some(&r.signal())))
        .collect();
    assert_eq!(lanes, [Lane::ReadyToMerge, Lane::InReview, Lane::InReview]);
}

#[test]
fn a_run_records_its_pull_request_and_the_pull_request_finds_its_runs() {
    let log = RunLog::open_memory().unwrap();
    record(&log, "run1", Some("pr"), "code", 7, 10).unwrap();
    record(&log, "run2", Some("pr"), "code", 70, 11).unwrap();
    // A run that reopens a pull request: the last one is the run's.
    record(&log, "run1", Some("pr"), "code", 8, 12).unwrap();
    assert_eq!(
        pr_of_run(&log, "run1").unwrap().as_deref(),
        Some("pr:code:8")
    );
    assert_eq!(
        pr_of_run(&log, "run2").unwrap().as_deref(),
        Some("pr:code:70")
    );
    assert_eq!(pr_of_run(&log, "run3").unwrap(), None);
    assert_eq!(runs_of(&log, "code", 7).unwrap(), ["run1"]);
    assert_eq!(runs_of(&log, "code", 70).unwrap(), ["run2"]);
    assert!(runs_of(&log, "code", 9).unwrap().is_empty());
    // The event is an ordinary log event.
    let e = log.last("run1", "pr").unwrap().unwrap();
    assert_eq!(
        (e.step.as_deref(), e.payload),
        (Some("pr"), json!({"ref": "pr:code:8"}))
    );
}

#[test]
fn a_forge_name_that_is_no_ref_is_refused() {
    let log = RunLog::open_memory().unwrap();
    assert!(record(&log, "run1", None, "Code Forge", 7, 1).is_err());
    assert!(log.run("run1").unwrap().is_empty());
}
