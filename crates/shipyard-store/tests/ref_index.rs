//! Index tests with fixture files, mirror rows and run log rows (spec `refs`, REQ-003, REQ-004, REQ-006).

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

/// A small repository with one file of each artifact kind.
fn fixture() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let r = dir.path();
    write(
        r,
        "docs/decisions/0004-polling-sync.md",
        "---\nstatus: accepted\n---\n# Polling sync with local mirror\nSee `adr:0009` and q:Q-001.\n",
    );
    write(
        r,
        "docs/delivery/questions/Q-001.md",
        "---\nstatus: open\n---\n# Which tracker first?\n",
    );
    write(
        r,
        "docs/openspec/changes/add-auth/proposal.md",
        "# add-auth\nCites adr:0004.\n",
    );
    write(
        r,
        "docs/openspec/changes/add-auth/specs/auth/spec.md",
        "# Spec: auth\nStatus: Draft\nSee adr:0004, wi:SHIP-1, adr:0099 and diagram:context.\n### Requirement: REQ-003 Login\nbody\n",
    );
    write(r, ".shipyard/project.yaml", "name: Shipyard\nkey: SHIP\n");
    write(
        r,
        ".shipyard/workflows/deliver.yaml",
        "name: Deliver\nsteps: []\n# cites spec:auth#REQ-003\n",
    );
    write(
        r,
        "docs/openspec/notes.md",
        "No title here, wf:deliver and doc:docs/openspec/notes.md.\n",
    );
    dir
}

fn synced(dir: &Path) -> RefIndex {
    let mut idx = RefIndex::open_memory().unwrap();
    idx.sync_repo(dir, &ProjectFile::new("Shipyard", "SHIP"))
        .unwrap();
    idx
}

#[test]
fn indexes_each_artifact_kind() {
    let dir = fixture();
    let idx = synced(dir.path());
    let adr = idx.resolve("adr:0004").unwrap().unwrap();
    assert_eq!(
        (adr.state, adr.title.as_deref(), adr.status.as_deref()),
        (
            State::Resolved,
            Some("Polling sync with local mirror"),
            Some("accepted")
        )
    );
    assert_eq!(
        adr.location.as_deref(),
        Some("docs/decisions/0004-polling-sync.md")
    );
    assert_eq!(
        idx.resolve("q:Q-001").unwrap().unwrap().title.as_deref(),
        Some("Which tracker first?")
    );
    assert_eq!(
        idx.resolve("change:add-auth").unwrap().unwrap().state,
        State::Resolved
    );
    assert_eq!(
        idx.resolve("spec:auth").unwrap().unwrap().status.as_deref(),
        Some("Draft")
    );
    assert_eq!(
        idx.resolve("spec:auth#REQ-003")
            .unwrap()
            .unwrap()
            .title
            .as_deref(),
        Some("Login")
    );
    assert_eq!(
        idx.resolve("project:ship")
            .unwrap()
            .unwrap()
            .title
            .as_deref(),
        Some("Shipyard")
    );
    assert_eq!(
        idx.resolve("wf:deliver").unwrap().unwrap().title.as_deref(),
        Some("Deliver")
    );
    assert_eq!(
        idx.resolve("doc:docs/openspec/notes.md")
            .unwrap()
            .unwrap()
            .state,
        State::Resolved
    );
}

#[test]
fn an_invalid_ref_is_not_a_ref() {
    let idx = RefIndex::open_memory().unwrap();
    assert!(idx.resolve("foo:bar").unwrap().is_none());
}

#[test]
fn indexes_three_sources() {
    let dir = fixture();
    let mut idx = synced(dir.path());
    let cite = |s: &str, t: &str| Citation {
        source: s.into(),
        target: t.into(),
    };
    idx.set_source(
        "mirror:SHIP",
        "1",
        &[Entity::new(
            "wi:SHIP-42",
            "Add login",
            Some("In progress"),
            None,
        )],
        &[cite("wi:SHIP-42", "spec:auth")],
    )
    .unwrap();
    idx.set_source(
        "runlog:r1",
        "1",
        &[],
        &[cite("run:01JD0000000000000000000000", "wi:SHIP-42")],
    )
    .unwrap();
    let wi = idx.resolve("wi:SHIP-42").unwrap().unwrap();
    assert_eq!(
        (wi.state, wi.status.as_deref()),
        (State::Resolved, Some("In progress"))
    );
    let groups = idx.backlinks("wi:SHIP-42").unwrap();
    assert_eq!(groups[0].kind, "run");
    // The repository, the mirror and the run log all feed the same index.
    assert_eq!(
        idx.backlinks("spec:auth")
            .unwrap()
            .iter()
            .map(|g| g.kind.as_str())
            .collect::<Vec<_>>(),
        ["wi"]
    );
    assert_eq!(
        idx.backlinks("adr:0004")
            .unwrap()
            .iter()
            .map(|g| (g.kind.as_str(), g.count))
            .collect::<Vec<_>>(),
        [("change", 1), ("spec", 1)]
    );
}

#[test]
fn a_change_updates_the_index_without_a_manual_action() {
    let dir = fixture();
    let mut idx = synced(dir.path());
    let file = ProjectFile::new("Shipyard", "SHIP");
    write(
        dir.path(),
        "docs/openspec/changes/add-auth/specs/auth/spec.md",
        "# Spec: auth\nSee diagram:context only.\n",
    );
    let stats = idx.sync_repo(dir.path(), &file).unwrap();
    assert_eq!(stats.changed, 1);
    let kinds = |idx: &RefIndex, r: &str| {
        idx.backlinks(r)
            .unwrap()
            .iter()
            .map(|g| g.kind.clone())
            .collect::<Vec<_>>()
    };
    assert_eq!(kinds(&idx, "diagram:context"), ["spec"]);
    assert!(
        !kinds(&idx, "adr:0004").contains(&"spec".to_string()),
        "citation removed"
    );
    assert!(
        idx.resolve("spec:auth#REQ-003").unwrap().unwrap().state != State::Resolved,
        "requirement removed"
    );
    assert_eq!(
        idx.sync_repo(dir.path(), &file).unwrap().changed,
        0,
        "nothing changed, nothing indexed"
    );
}

#[test]
fn a_deleted_file_leaves_the_index() {
    let dir = fixture();
    let mut idx = synced(dir.path());
    fs::remove_file(dir.path().join("docs/decisions/0004-polling-sync.md")).unwrap();
    idx.sync_repo(dir.path(), &ProjectFile::new("Shipyard", "SHIP"))
        .unwrap();
    assert_ne!(
        idx.resolve("adr:0004").unwrap().unwrap().state,
        State::Resolved
    );
}

#[test]
fn the_index_file_survives_a_reopen() {
    let dir = fixture();
    let db = tempfile::tempdir().unwrap();
    let path = db.path().join("refs/ship.sqlite");
    RefIndex::open(&path)
        .unwrap()
        .sync_repo(dir.path(), &ProjectFile::new("Shipyard", "SHIP"))
        .unwrap();
    let idx = RefIndex::open(&path).unwrap();
    assert_eq!(
        idx.resolve("adr:0004").unwrap().unwrap().state,
        State::Resolved
    );
}
