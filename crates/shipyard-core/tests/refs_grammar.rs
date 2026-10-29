//! Grammar tests for every ref kind (spec `refs`, REQ-001, REQ-002).

use shipyard_core::refs::{Ref, parse};

const ULID: &str = "01JD0000000000000000000000";

/// One valid and one rejected form for each of the 21 kinds.
#[test]
fn each_kind_has_a_valid_and_a_rejected_form() {
    let ulid_bad = "81JD0000000000000000000000";
    let cases: [(&str, String, String); 21] = [
        ("project", "project:shipyard".into(), "project:Ship".into()),
        ("member", "member:ada-1".into(), "member:-ada".into()),
        ("diagram", "diagram:context".into(), "diagram:a_b".into()),
        ("model", "model:domain".into(), "model:".into()),
        ("adr", "adr:0004".into(), "adr:12".into()),
        ("api", "api:ipc".into(), "api:IPC".into()),
        ("data", "data:run-log".into(), "data:run log".into()),
        ("flow", "flow:onboarding".into(), "flow:-x".into()),
        ("screen", "screen:home".into(), "screen:Home".into()),
        ("change", "change:add-refs".into(), "change:add_refs".into()),
        ("spec", "spec:auth#REQ-003".into(), "spec:auth#REQ-3".into()),
        ("test", "test:smoke".into(), "test:".into()),
        ("q", "q:Q-012".into(), "q:Q-12".into()),
        ("wi", "wi:SHIP-42".into(), "wi:ship-42".into()),
        ("est", "est:v1".into(), "est:V1".into()),
        ("wf", "wf:deliver".into(), "wf:de liver".into()),
        ("run", format!("run:{ULID}/plan"), format!("run:{ulid_bad}")),
        ("pr", "pr:github:42".into(), "pr:github:0".into()),
        ("commit", "commit:abc1234".into(), "commit:abc123".into()),
        ("doc", "doc:docs/plan.md".into(), "doc:../x".into()),
        ("conn", "conn:github-1".into(), "conn:a:b".into()),
    ];
    for (kind, ok, bad) in cases {
        assert!(parse(&ok).is_some(), "{kind}: {ok} must parse");
        assert!(parse(&bad).is_none(), "{kind}: {bad} must not parse");
    }
}

#[test]
fn spec_scenarios() {
    for ok in [
        "adr:0004",
        "q:Q-012",
        "wi:SHIP-42",
        "pr:github:42",
        "spec:auth#REQ-003",
        "run:01JD0000000000000000000000/plan",
    ] {
        assert!(parse(ok).is_some(), "{ok}");
    }
    assert!(parse("foo:bar").is_none());
    assert!(parse("adr:12").is_none());
}

#[test]
fn edge_forms() {
    assert!(parse("spec:auth").is_some());
    assert!(parse("spec:auth#REQ-0003").is_some());
    assert!(parse("spec:auth#REQ-").is_none());
    assert!(parse("spec:auth#X-003").is_none());
    assert!(parse("run:01JD0000000000000000000000").is_some());
    assert!(parse("run:01JD0000000000000000000000/").is_none());
    assert!(parse("run:01JD000000000000000000000U").is_none());
    assert!(parse("wi:SHIP-0").is_none());
    assert!(parse("wi:S1-9").is_some());
    assert!(parse("commit:ABC1234").is_none());
    assert!(parse(&format!("commit:{}", "a".repeat(41))).is_none());
    assert!(parse("doc:/etc/passwd").is_none());
    assert!(parse("doc:a\\b").is_none());
    assert!(parse("doc:a/../b").is_none());
    assert!(parse("doc:a/b..c").is_some());
    assert!(parse("pr:github:1x").is_none());
    assert!(parse("").is_none());
    assert!(parse("adr").is_none());
    assert_eq!(
        parse("est:auth#r3"),
        Some(Ref::Estimate {
            sheet: "auth".into(),
            row: Some("r3".into())
        })
    );
    assert!(parse("est:auth#").is_none());
    assert!(parse("est:auth#R3").is_none());
}

#[test]
fn display_round_trips() {
    for s in [
        "project:shipyard",
        "est:v1",
        "est:auth#r3",
        "wf:deliver",
        "conn:gh",
        "adr:0004",
        "spec:auth",
        "spec:auth#REQ-003",
        "q:Q-012",
        "wi:SHIP-42",
        "run:01JD0000000000000000000000",
        "run:01JD0000000000000000000000/plan",
        "pr:github:42",
        "commit:abc1234",
        "doc:docs/plan.md",
    ] {
        assert_eq!(parse(s).unwrap().to_string(), s);
    }
}
