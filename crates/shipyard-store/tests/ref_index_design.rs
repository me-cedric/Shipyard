//! The ref index reads the design folders and the test plan folder (spec `design` REQ-001,
//! REQ-002, spec `specs` REQ-006 and REQ-013).

use std::fs;
use std::path::Path;

use shipyard_core::project::ProjectFile;
use shipyard_store::ref_index::RefIndex;
use shipyard_store::ref_query::State;

fn write(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn fixture() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let r = dir.path();
    write(r, "docs/diagrams/Context Map.mmd", "graph TD\n A-->B\n");
    write(
        r,
        "docs/diagrams/board.drawio.svg",
        "<svg content=\"&lt;mx/&gt;\"/>",
    );
    write(r, "docs/models/system.c4", "model { }\n");
    write(
        r,
        "docs/api/pets.yaml",
        "openapi: 3.0.0\ninfo:\n  title: Pet store\n  version: '1'\n",
    );
    write(r, "docs/api/notes.yaml", "just: notes\n");
    write(r, "docs/data-models/shop.dbml", "Table a { id int }\n");
    write(r, "docs/flows/edge.yaml", "rows: []\n");
    write(
        r,
        "docs/designs/screens.json",
        r#"{"screens":[{"slug":"login","title":"Login","artifacts":["diagram:context-map","adr:0004"]}]}"#,
    );
    write(
        r,
        "docs/delivery/test-plans/Login Flow.feature",
        "# comment\nFeature: Login flow\n  # spec:auth#REQ-001\n  Scenario: ok\n    Given a user\n",
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
fn each_design_file_gets_the_ref_of_its_kind_and_slug() {
    let idx = synced(fixture().path());
    for (target, title) in [
        ("diagram:context-map", "Context Map"),
        ("diagram:board", "board"),
        ("model:system", "system"),
        ("api:pets", "Pet store"),
        ("data:shop", "shop"),
        ("flow:edge", "edge"),
        ("screen:login", "Login"),
        ("test:login-flow", "Login flow"),
    ] {
        let r = idx.resolve(target).unwrap().unwrap();
        assert_eq!(
            (r.state, r.title.as_deref()),
            (State::Resolved, Some(title)),
            "{target}"
        );
    }
}

#[test]
fn a_yaml_file_that_is_not_a_contract_gets_no_api_ref() {
    let idx = synced(fixture().path());
    assert_ne!(
        idx.resolve("api:notes").unwrap().unwrap().state,
        State::Resolved
    );
}

#[test]
fn a_screen_cites_its_artifacts_and_a_test_plan_cites_its_requirements() {
    let idx = synced(fixture().path());
    let kinds = |t: &str| {
        idx.backlinks(t)
            .unwrap()
            .iter()
            .map(|g| g.kind.clone())
            .collect::<Vec<_>>()
    };
    // The file itself (`doc`) cites the text too. The screen is the extra source.
    assert!(kinds("diagram:context-map").contains(&"screen".into()));
    assert!(kinds("adr:0004").contains(&"screen".into()));
    assert!(kinds("spec:auth#REQ-001").contains(&"test".into()));
}
