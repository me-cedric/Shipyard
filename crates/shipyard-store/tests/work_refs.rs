//! The ref index reads the work files: members, estimate sheets and their rows, and the members
//! that the plan decisions name (spec `work`, REQ-027). A sealed sheet stays opaque.

use std::fs;
use std::path::Path;

use shipyard_core::project::ProjectFile;
use shipyard_store::ref_index::RefIndex;
use shipyard_store::ref_query::State;
use shipyard_store::seal::seal;

fn write(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

const TEAM: &str = "members:
  - name: Ana Lopez
    handle: ana
    trackers: [U1]
    role: dev
    capacity: 5
    dayRate: 500
  - name: Bob Ray
    handle: bob
    role: qa
    capacity: 3
";

const SHEET: &str = "name: Lot one
currency: EUR
marginRate: 0.1
features:
  - id: login
    name: Login
    tasks:
      - id: form
        name: Login form
        role: dev
        days: 3
        ticket: SHIP-1
";

const PLAN: &str = "order: []
tasks:
  est:mvp-1#form:
    member: ana
";

fn index(root: &Path) -> RefIndex {
    let mut idx = RefIndex::open_memory().unwrap();
    idx.sync_repo(root, &ProjectFile::new("Shipyard", "SHIP"))
        .unwrap();
    idx
}

#[test]
fn members_sheets_and_rows_are_entities() {
    let dir = tempfile::tempdir().unwrap();
    let r = dir.path();
    write(r, ".shipyard/team.yaml", TEAM);
    write(r, "docs/costing/mvp-1.yaml", SHEET);
    let idx = index(r);

    let m = idx.resolve("member:ana").unwrap().unwrap();
    assert_eq!(m.state, State::Resolved);
    assert_eq!(m.title.as_deref(), Some("Ana Lopez"));
    assert_eq!(m.status.as_deref(), Some("dev"));
    assert_eq!(
        idx.resolve("member:bob").unwrap().unwrap().title.as_deref(),
        Some("Bob Ray")
    );
    assert_eq!(
        idx.resolve("member:zed").unwrap().unwrap().state,
        State::Unresolved
    );

    let s = idx.resolve("est:mvp-1").unwrap().unwrap();
    assert_eq!(s.title.as_deref(), Some("Lot one"));
    assert_eq!(s.location.as_deref(), Some("docs/costing/mvp-1.yaml"));
    assert_eq!(
        idx.resolve("est:mvp-1#login")
            .unwrap()
            .unwrap()
            .title
            .as_deref(),
        Some("Login")
    );
    assert_eq!(
        idx.resolve("est:mvp-1#form")
            .unwrap()
            .unwrap()
            .title
            .as_deref(),
        Some("Login form")
    );
    let hits = idx.search("login", 10).unwrap();
    assert!(hits.iter().any(|h| h.target == "est:mvp-1#form"));
}

#[test]
fn a_task_ticket_and_a_plan_member_give_backlinks() {
    let dir = tempfile::tempdir().unwrap();
    let r = dir.path();
    write(r, ".shipyard/team.yaml", TEAM);
    write(r, "docs/costing/mvp-1.yaml", SHEET);
    write(r, "docs/planning/plan.yaml", PLAN);
    let idx = index(r);

    let sources = |target: &str| -> Vec<String> {
        idx.backlinks(target)
            .unwrap()
            .into_iter()
            .flat_map(|g| g.items.into_iter().map(|b| b.source))
            .collect()
    };
    assert_eq!(sources("wi:SHIP-1"), ["est:mvp-1"]);
    assert_eq!(sources("member:ana"), ["est:mvp-1"]);
    assert!(sources("member:bob").is_empty());
}

#[test]
fn a_sealed_sheet_is_an_opaque_entity_and_a_sealed_rate_does_not_hide_the_member() {
    let dir = tempfile::tempdir().unwrap();
    let r = dir.path();
    let sealed = seal("pass", SHEET).unwrap();
    write(r, "docs/costing/secret.yaml", &sealed);
    let team = TEAM.replace(
        "dayRate: 500",
        &format!("dayRate: {}", seal("pass", "500").unwrap()),
    );
    write(r, ".shipyard/team.yaml", &team);
    let idx = index(r);

    let s = idx.resolve("est:secret").unwrap().unwrap();
    assert_eq!(s.state, State::Resolved);
    assert_eq!(s.title.as_deref(), Some("secret"));
    assert_eq!(s.status.as_deref(), Some("sealed"));
    assert_eq!(
        idx.resolve("est:secret#login").unwrap().unwrap().state,
        State::Unresolved,
        "no row of a sealed sheet is read"
    );
    assert_eq!(
        idx.resolve("member:ana").unwrap().unwrap().title.as_deref(),
        Some("Ana Lopez")
    );
    // The seal text itself is never an entity title.
    assert!(idx.search("SHIPYARD-SEALED", 10).unwrap().is_empty());
}

#[test]
fn a_file_that_does_not_parse_still_gives_the_sheet_entity() {
    let dir = tempfile::tempdir().unwrap();
    write(dir.path(), "docs/costing/broken.yaml", "features: [[[\n");
    let idx = index(dir.path());
    assert_eq!(
        idx.resolve("est:broken").unwrap().unwrap().state,
        State::Resolved
    );
}
