//! Code reports and the commit link index (spec `code`, REQ-009, REQ-024, REQ-028, REQ-033).

use shipyard_store::code::*;
use shipyard_store::ref_index::RefIndex;

fn report(tail: &str) -> QualityReport {
    QualityReport {
        kind: ReportKind::Scanner,
        name: "Secrets".into(),
        at: "2026-10-29T10:00:00Z".into(),
        passed: false,
        duration_ms: 1200,
        tail: tail.into(),
        findings: vec![ScanFinding {
            severity: ScanSeverity::High,
            path: "src/lib.rs".into(),
            line: Some(40),
            message: "a key sits here".into(),
        }],
    }
}

#[test]
fn a_report_round_trips_and_holds_no_secret() {
    let r = report("key=tok-secret-value ok");
    let text = encode_quality(&r, &["tok-secret-value"]).unwrap();
    assert!(!text.contains("tok-secret-value"), "{text}");
    let back = decode_quality(&text).unwrap();
    assert_eq!(back.tail, "key=[redacted] ok");
    assert_eq!(back.findings, r.findings);
}

#[test]
fn the_last_report_replaces_the_older_one() {
    let dir = tempfile::tempdir().unwrap();
    let mut r = report("one");
    save_quality(dir.path(), &r, &[]).unwrap();
    r.tail = "two".into();
    save_quality(dir.path(), &r, &[]).unwrap();
    let all = list_quality(dir.path());
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].tail, "two");
    assert!(list_quality(&dir.path().join("none")).is_empty());
}

#[test]
fn an_impact_is_two_dated_files_and_never_overwrites() {
    let dir = tempfile::tempdir().unwrap();
    let a = save_impact(
        dir.path(),
        "2026-10-29",
        "Compare v1.0",
        "plan A",
        "digest A",
    )
    .unwrap();
    let b = save_impact(
        dir.path(),
        "2026-10-29",
        "Compare v1.0",
        "plan B",
        "digest B",
    )
    .unwrap();
    assert_ne!(a.plan, b.plan);
    assert_ne!(a.plan, a.digest);
    assert_eq!(
        std::fs::read_to_string(dir.path().join(&a.plan)).unwrap(),
        "plan A"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join(&b.digest)).unwrap(),
        "digest B"
    );
    save_impact(dir.path(), "2026-10-30", "Other", "p", "d").unwrap();
    let list = list_impacts(dir.path());
    assert_eq!(list.len(), 3);
    assert_eq!(list[0].date, "2026-10-30");
    assert!(save_impact(dir.path(), "29/10/2026", "x", "p", "d").is_err());
}

#[test]
fn a_commit_links_to_work_items_and_runs() {
    let mut idx = RefIndex::open_memory().unwrap();
    let link = |sha: &str, refs: &[&str]| CommitLink {
        sha: sha.into(),
        summary: "feat(auth): login".into(),
        refs: refs.iter().map(|r| r.to_string()).collect(),
    };
    index_commit(&mut idx, &link("abc1234", &["wi:SHIP-42", "run:r-1"])).unwrap();
    index_commit(&mut idx, &link("def5678", &["wi:SHIP-42"])).unwrap();
    let groups = idx.backlinks("wi:SHIP-42").unwrap();
    assert_eq!(groups[0].kind, "commit");
    assert_eq!(groups[0].items.len(), 2);
    assert_eq!(
        idx.backlinks("run:r-1").unwrap()[0].items[0].source,
        "commit:abc1234"
    );
    // The same commit again replaces its own links only.
    index_commit(&mut idx, &link("abc1234", &[])).unwrap();
    assert_eq!(idx.backlinks("wi:SHIP-42").unwrap()[0].items.len(), 1);
    assert!(idx.backlinks("run:r-1").unwrap().is_empty());
}

#[test]
fn the_watch_interval_is_per_project_personal_and_bounded() {
    let d = tempfile::tempdir().unwrap();
    assert_eq!(watch_minutes(d.path(), "a"), DEFAULT_WATCH_MINUTES);
    set_watch_minutes(d.path(), "a", 5).unwrap();
    assert_eq!(watch_minutes(d.path(), "a"), 5);
    assert_eq!(watch_minutes(d.path(), "b"), DEFAULT_WATCH_MINUTES);
    assert!(set_watch_minutes(d.path(), "a", 0).is_err());
    assert!(set_watch_minutes(d.path(), "../x", 5).is_err());
    assert_eq!(
        watch_minutes(d.path(), "a"),
        5,
        "a refused value changes nothing"
    );
}
