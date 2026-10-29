//! Split model tests (spec `specs`, REQ-016, REQ-017, REQ-019).

use shipyard_core::refs::parse;
use shipyard_core::split::{Draft, Item, Kind, check, description, draft, remove, row_ref};

const SPEC: &str =
    "### Requirement: REQ-001 Changes list\n\nx\n### Requirement: REQ-002 Artifact status\n";

fn known() -> Vec<String> {
    vec!["spec:specs#REQ-001".into(), "spec:specs#REQ-002".into()]
}

fn sample() -> Draft {
    draft("add-specs", &[("specs".into(), SPEC.into())])
}

#[test]
fn row_ref_parses() {
    let r = row_ref("add-specs", "specs-req-001");
    assert_eq!(r, "est:add-specs#specs-req-001");
    assert!(parse(&r).is_some());
}

#[test]
fn draft_has_one_epic_and_one_story_per_requirement() {
    let d = sample();
    assert_eq!(d.change, "add-specs");
    assert_eq!(d.items.len(), 3);
    let e = &d.items[0];
    assert_eq!(
        (e.row_id.as_str(), e.kind, e.parent.as_deref()),
        ("specs", Kind::Epic, None)
    );
    assert_eq!(e.reqs, known());
    let s = &d.items[1];
    assert_eq!(s.row_id, "specs-req-001");
    assert_eq!(s.kind, Kind::Story);
    assert_eq!(s.title, "Changes list");
    assert_eq!(s.reqs, vec!["spec:specs#REQ-001"]);
    assert_eq!(s.parent.as_deref(), Some("specs"));
    assert!(check(&d, &known()).is_empty());
}

#[test]
fn check_flags_each_defect() {
    let mut d = sample();
    d.items[1].row_id = "specs".into();
    d.items[2].parent = Some("nope".into());
    let m = check(&d, &known()).join("\n");
    assert!(m.contains("duplicate"), "{m}");
    assert!(m.contains("parent"), "{m}");

    let mut d = sample();
    d.items[1].parent = Some("specs-req-002".into());
    assert!(check(&d, &known()).join("\n").contains("epic"));

    let mut d = sample();
    d.items[1].reqs.clear();
    assert!(check(&d, &known()).join("\n").contains("cites no"));

    let mut d = sample();
    d.items[1].reqs = vec!["spec:specs#REQ-099".into()];
    assert!(check(&d, &known()).join("\n").contains("REQ-099"));

    let mut d = sample();
    d.items[1].row_id = "Bad Id".into();
    assert!(check(&d, &known()).join("\n").contains("row id"));
}

#[test]
fn story_without_parent_is_flagged() {
    let mut d = sample();
    d.items[1].parent = None;
    assert!(!check(&d, &known()).is_empty());
}

#[test]
fn remove_drops_an_epic_with_its_stories() {
    let mut d = sample();
    remove(&mut d, "specs");
    assert!(d.items.is_empty());
    let mut d = sample();
    remove(&mut d, "specs-req-001");
    assert_eq!(d.items.len(), 2);
}

#[test]
fn description_cites_the_refs() {
    let it = Item {
        row_id: "a".into(),
        kind: Kind::Story,
        title: "t".into(),
        description: "Text.".into(),
        reqs: vec!["spec:specs#REQ-001".into(), "spec:specs#REQ-002".into()],
        parent: None,
    };
    assert_eq!(
        description(&it),
        "Text.\n\nRequirements: spec:specs#REQ-001, spec:specs#REQ-002"
    );
    let bare = Item {
        description: String::new(),
        ..it
    };
    assert_eq!(
        description(&bare),
        "Requirements: spec:specs#REQ-001, spec:specs#REQ-002"
    );
}
