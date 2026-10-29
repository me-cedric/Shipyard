//! The append-only run log (spec `factory`, REQ-021, REQ-034).

use serde_json::json;
use shipyard_store::run_log::{RunLog, kind};

#[test]
fn events_come_back_in_order_with_every_field() {
    let log = RunLog::open_memory().unwrap();
    let a = log
        .append(
            "r1",
            None,
            kind::STATE,
            &json!({"from": "Queued", "to": "Claimed"}),
            10,
        )
        .unwrap();
    let b = log
        .append(
            "r1",
            Some("build"),
            kind::TOOL,
            &json!({"tool": "report"}),
            11,
        )
        .unwrap();
    log.append("r2", None, kind::STATE, &json!({}), 12).unwrap();
    assert!(b > a);
    let ev = log.run("r1").unwrap();
    assert_eq!(ev.len(), 2);
    assert_eq!(
        (
            ev[0].id,
            ev[0].run.as_str(),
            ev[0].step.as_deref(),
            ev[0].kind.as_str(),
            ev[0].ts
        ),
        (a, "r1", None, "state", 10)
    );
    assert_eq!(ev[0].payload["to"], "Claimed");
    assert_eq!(ev[1].step.as_deref(), Some("build"));
    assert_eq!(log.run("nobody").unwrap(), []);
}

#[test]
fn the_tail_reads_after_an_id() {
    let log = RunLog::open_memory().unwrap();
    let ids: Vec<i64> = (0..5)
        .map(|i| {
            log.append("r", None, kind::RUNNER, &json!({"i": i}), i)
                .unwrap()
        })
        .collect();
    let tail = log.since(ids[1], 2).unwrap();
    assert_eq!(tail.iter().map(|e| e.id).collect::<Vec<_>>(), ids[2..4]);
    assert_eq!(log.since(ids[4], 10).unwrap(), []);
    assert_eq!(log.since(0, 100).unwrap().len(), 5);
}

#[test]
fn a_page_of_one_run_follows_the_last_id() {
    let log = RunLog::open_memory().unwrap();
    for n in 0..5 {
        log.append("A", None, kind::NOTE, &json!({ "n": n }), 1)
            .unwrap();
        log.append("B", None, kind::NOTE, &json!({ "n": n }), 1)
            .unwrap();
    }
    let first = log.page("A", 0, 2).unwrap();
    assert_eq!(
        first
            .iter()
            .map(|e| e.payload["n"].as_i64().unwrap())
            .collect::<Vec<_>>(),
        [0, 1]
    );
    let next = log.page("A", first[1].id, 10).unwrap();
    assert_eq!(next.len(), 3);
    assert!(next.iter().all(|e| e.run == "A"));
    assert!(log.page("A", next[2].id, 10).unwrap().is_empty());
}

#[test]
fn the_last_event_of_a_kind_gives_the_current_state() {
    let log = RunLog::open_memory().unwrap();
    log.append("r", None, kind::STATE, &json!({"to": "Claimed"}), 1)
        .unwrap();
    log.append("r", None, kind::TOOL, &json!({}), 2).unwrap();
    log.append("r", None, kind::STATE, &json!({"to": "Planning"}), 3)
        .unwrap();
    assert_eq!(
        log.last("r", kind::STATE).unwrap().unwrap().payload["to"],
        "Planning"
    );
    assert!(log.last("r", kind::WRITE).unwrap().is_none());
    assert!(log.last("x", kind::STATE).unwrap().is_none());
}

#[test]
fn runs_list_in_order_of_first_event() {
    let log = RunLog::open_memory().unwrap();
    for (run, ts) in [("b", 1), ("a", 2), ("b", 3)] {
        log.append(run, None, kind::STATE, &json!({}), ts).unwrap();
    }
    assert_eq!(log.runs().unwrap(), ["b", "a"]);
}

/// The log of a run cites a ref: `pr:`, `wi:`, `q:`. The refs read it back as a backlink.
#[test]
fn a_ref_in_a_payload_finds_its_runs() {
    let log = RunLog::open_memory().unwrap();
    log.append("r1", None, kind::WRITE, &json!({"pr": "pr:code:7"}), 1)
        .unwrap();
    log.append("r2", None, kind::WRITE, &json!({"pr": "pr:code:70"}), 2)
        .unwrap();
    log.append("r1", None, kind::WRITE, &json!({"again": "pr:code:7"}), 3)
        .unwrap();
    log.append(
        "r3",
        None,
        kind::NOTE,
        &json!({"text": "see pr:code:7 here"}),
        4,
    )
    .unwrap();
    assert_eq!(log.cites("pr:code:7").unwrap(), ["r1"]);
    assert_eq!(log.cites("pr:code:70").unwrap(), ["r2"]);
    assert!(log.cites("pr:code:8").unwrap().is_empty());
    // A `%` or `_` in the ref is no wildcard.
    assert!(log.cites("pr:code:%").unwrap().is_empty());
}

#[test]
fn a_caller_cannot_change_or_delete_an_event() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("runs.sqlite");
    let log = RunLog::open(&path).unwrap();
    for i in 0..10 {
        log.append("r", None, kind::STATE, &json!({"i": i}), i)
            .unwrap();
    }
    // Another connection to the same file: raw SQL is refused by the file itself.
    let raw = rusqlite::Connection::open(&path).unwrap();
    for sql in [
        "UPDATE events SET kind = 'x' WHERE id = 3",
        "UPDATE events SET payload = '{}'",
        "DELETE FROM events WHERE id = 3",
        "DELETE FROM events",
    ] {
        let e = raw.execute(sql, []).unwrap_err().to_string();
        assert!(e.contains("append-only"), "{sql}: {e}");
    }
    let ev = log.run("r").unwrap();
    assert_eq!(ev.len(), 10);
    assert_eq!(ev[2].kind, "state");
    assert_eq!(ev[2].payload["i"], 2);
}

#[test]
fn the_log_survives_a_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sub").join("runs.sqlite");
    {
        let log = RunLog::open(&path).unwrap();
        log.append("r", Some("s"), kind::WRITE, &json!({"a": 1}), 5)
            .unwrap();
    }
    let log = RunLog::open(&path).unwrap();
    assert_eq!(log.run("r").unwrap().len(), 1);
    let next = log.append("r", None, kind::NOTE, &json!({}), 6).unwrap();
    assert_eq!(log.run("r").unwrap().last().unwrap().id, next);
}

#[test]
fn a_run_ref_and_a_step_are_plain_text_in_the_log() {
    // No parsing: the engine owns the ref grammar. An empty run id is refused.
    let log = RunLog::open_memory().unwrap();
    assert!(log.append("", None, kind::STATE, &json!({}), 0).is_err());
}

#[test]
fn a_snapshot_is_replaced_and_never_changes_the_log() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("runs.sqlite");
    let log = RunLog::open(&path).unwrap();
    let a = log.append("r1", None, kind::STATE, &json!({}), 1).unwrap();
    log.save_snapshot("run:r1", a, &json!({"state": "Working"}))
        .unwrap();
    let b = log.append("r1", None, kind::NOTE, &json!({}), 2).unwrap();
    log.save_snapshot("run:r1", b, &json!({"state": "Done"}))
        .unwrap();
    log.save_snapshot("meta", 0, &json!({"seq": 3})).unwrap();
    drop(log);

    // A reopen reads them, by key. The log is as it was.
    let log = RunLog::open(&path).unwrap();
    let all = log.snapshots().unwrap();
    assert_eq!(
        all.iter().map(|s| s.key.as_str()).collect::<Vec<_>>(),
        ["meta", "run:r1"]
    );
    assert_eq!(
        (all[1].event, &all[1].value),
        (b, &json!({"state": "Done"}))
    );
    assert_eq!(log.run("r1").unwrap().len(), 2);
    // The tail after a snapshot.
    let tail = log.after("r1", a).unwrap();
    assert_eq!(tail.len(), 1);
    assert_eq!(tail[0].id, b);
    assert!(log.after("r1", b).unwrap().is_empty());
    assert_eq!(log.last_id("r1").unwrap(), b);
    assert_eq!(log.last_id("none").unwrap(), 0);
}
