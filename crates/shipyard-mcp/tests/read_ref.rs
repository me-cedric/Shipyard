//! `read_ref` against a fake index (spec `refs`, REQ-014).

use shipyard_mcp::tools::read_ref::read_ref;
use shipyard_store::ref_index::{Citation, Entity, RefIndex};
use shipyard_store::ref_query::State;

fn index() -> RefIndex {
    let mut idx = RefIndex::open_memory().unwrap();
    let spec = Entity::new(
        "spec:auth#REQ-003",
        "Login",
        Some("Draft"),
        Some("docs/spec.md"),
    );
    let cite = Citation {
        source: "wi:SHIP-1".into(),
        target: "spec:auth#REQ-003".into(),
    };
    idx.set_source("fake:1", "1", &[spec], &[cite]).unwrap();
    idx
}

#[test]
fn an_agent_gets_the_title_the_state_and_the_citing_entities() {
    let r = read_ref(&index(), "spec:auth#REQ-003").unwrap();
    assert_eq!(
        (
            r.resolved.state,
            r.resolved.title.as_deref(),
            r.resolved.status.as_deref()
        ),
        (State::Resolved, Some("Login"), Some("Draft"))
    );
    assert_eq!(r.backlinks[0].kind, "wi");
    let json = serde_json::to_value(&r).unwrap();
    assert_eq!(json["ref"], "spec:auth#REQ-003");
    assert_eq!(json["backlinks"][0]["count"], 1);
}

#[test]
fn an_unknown_ref_is_unresolved_and_text_that_is_not_a_ref_is_an_error() {
    let r = read_ref(&index(), "wi:SHIP-99").unwrap();
    assert_eq!(r.resolved.state, State::Unresolved);
    assert!(r.backlinks.is_empty());
    assert!(read_ref(&index(), "nope").is_err());
}
