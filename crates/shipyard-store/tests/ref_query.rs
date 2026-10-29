//! Backlinks, search and check tests (spec `refs`, REQ-007 to REQ-010).

use std::fs;
use std::path::Path;

use shipyard_core::project::ProjectFile;
use shipyard_store::ref_index::{Citation, Entity, RefIndex};
use shipyard_store::ref_query::State;

fn write(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn repo(files: &[(&str, &str)]) -> (tempfile::TempDir, RefIndex) {
    let dir = tempfile::tempdir().unwrap();
    for (p, t) in files {
        write(dir.path(), p, t);
    }
    let mut idx = RefIndex::open_memory().unwrap();
    idx.sync_repo(dir.path(), &ProjectFile::new("Shipyard", "SHIP"))
        .unwrap();
    (dir, idx)
}

const ADR: (&str, &str) = (
    "docs/decisions/0004-polling-sync.md",
    "# Polling sync with local mirror\n",
);

#[test]
fn backlinks_group_by_kind_with_a_count() {
    let (_d, idx) = repo(&[
        ADR,
        (
            "docs/openspec/changes/a/specs/one/spec.md",
            "# One\nadr:0004\n",
        ),
        (
            "docs/openspec/changes/a/specs/two/spec.md",
            "# Two\nadr:0004\n",
        ),
        ("docs/openspec/notes.md", "# Notes\nadr:0004 adr:0004\n"),
    ]);
    let groups = idx.backlinks("adr:0004").unwrap();
    let shown: Vec<_> = groups.iter().map(|g| (g.kind.as_str(), g.count)).collect();
    assert_eq!(shown, [("doc", 1), ("spec", 2)]);
    assert_eq!(groups[1].items[0].source, "spec:one");
    assert!(idx.backlinks("adr:0001").unwrap().is_empty());
}

#[test]
fn search_ranks_a_ref_match_above_a_title_match() {
    let (_d, mut idx) = repo(&[
        ADR,
        ("docs/delivery/questions/Q-012.md", "# Ship it\n"),
        (
            "docs/delivery/questions/Q-013.md",
            "# Revisit Q-012 later\n",
        ),
    ]);
    let hits = idx.search("Q-012", 10).unwrap();
    assert_eq!(hits[0].target, "q:Q-012");
    assert_eq!(hits[1].target, "q:Q-013");
    assert_eq!(idx.search("polling", 10).unwrap()[0].target, "adr:0004");
    assert_eq!(
        idx.search("50%", 10).unwrap().len(),
        0,
        "a wildcard is plain text"
    );
    idx.set_source(
        "mirror:SHIP",
        "1",
        &[Entity::new("wi:SHIP-9", "Polling bug", None, None)],
        &[],
    )
    .unwrap();
    assert_eq!(idx.search("polling", 10).unwrap().len(), 2);
}

#[test]
fn a_removed_target_is_broken_and_names_its_source() {
    let (_d, idx) = repo(&[(
        "docs/openspec/changes/a/specs/auth/spec.md",
        "# Auth\nadr:0004 and diagram:context\n",
    )]);
    let broken = idx.check().unwrap();
    assert_eq!(
        broken.len(),
        1,
        "diagram is not indexed yet, so it stays unresolved"
    );
    assert_eq!(
        (broken[0].target.as_str(), broken[0].source.as_str()),
        ("adr:0004", "spec:auth")
    );
    assert_eq!(
        idx.resolve("adr:0004").unwrap().unwrap().state,
        State::Broken
    );
    assert_eq!(
        idx.resolve("diagram:context").unwrap().unwrap().state,
        State::Unresolved
    );
}

#[test]
fn a_work_item_absent_from_the_mirror_stays_unresolved() {
    let (_d, idx) = repo(&[(
        "docs/openspec/changes/a/specs/auth/spec.md",
        "# Auth\nwi:SHIP-99\n",
    )]);
    assert!(idx.check().unwrap().is_empty());
    assert_eq!(
        idx.resolve("wi:SHIP-99").unwrap().unwrap().state,
        State::Unresolved
    );
}

#[test]
fn a_valid_target_has_no_finding() {
    let (_d, idx) = repo(&[
        ADR,
        (
            "docs/openspec/changes/a/specs/auth/spec.md",
            "# Auth\nadr:0004 doc:docs/decisions/0004-polling-sync.md\n",
        ),
    ]);
    assert!(idx.check().unwrap().is_empty());
}

#[test]
fn a_missing_requirement_of_a_known_spec_is_broken() {
    let (_d, idx) = repo(&[
        (
            "docs/openspec/changes/a/specs/auth/spec.md",
            "# Auth\n### Requirement: REQ-001 Login\n",
        ),
        (
            "docs/openspec/notes.md",
            "# N\nspec:auth#REQ-001 spec:auth#REQ-002 spec:ghost\n",
        ),
    ]);
    let targets: Vec<_> = idx.check().unwrap().into_iter().map(|b| b.target).collect();
    assert_eq!(targets, ["spec:auth#REQ-002", "spec:ghost"]);
}

#[test]
fn a_citation_row_alone_is_enough_for_a_mirror_source() {
    let (_d, mut idx) = repo(&[]);
    idx.set_source(
        "mirror:SHIP",
        "1",
        &[],
        &[Citation {
            source: "wi:SHIP-1".into(),
            target: "adr:0001".into(),
        }],
    )
    .unwrap();
    assert_eq!(idx.check().unwrap()[0].source, "wi:SHIP-1");
}
