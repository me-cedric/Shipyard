//! Project file validation (spec `projects`, REQ-007, REQ-010).

use shipyard_core::project::{ProjectConnections, ProjectFile, ignore_block, validate};

fn ok() -> ProjectFile {
    ProjectFile::new("Shipyard", "SHIP")
}

fn fields(f: &ProjectFile) -> Vec<String> {
    validate(f).into_iter().map(|i| i.field).collect()
}

#[test]
fn a_new_file_is_valid_and_has_the_default_paths() {
    let f = ok();
    assert!(validate(&f).is_empty());
    assert_eq!(f.path("decisions"), "docs/decisions");
    assert_eq!(f.path("questions"), "docs/delivery/questions");
    assert_eq!(f.path("specs"), "docs/openspec");
    assert_eq!(f.id(), "ship");
}

#[test]
fn rejects_a_bad_name_or_key() {
    let mut f = ok();
    f.name = "  ".into();
    f.key = "ship".into();
    assert_eq!(fields(&f), ["name", "key"]);
    f.key = "SHIPYARD-X".into();
    assert_eq!(fields(&f), ["name", "key"]);
}

#[test]
fn rejects_a_machine_path() {
    for bad in [
        "/Users/me/docs",
        "C:\\docs",
        "c:/docs",
        "../docs",
        "docs/../x",
        "",
        "a\\b",
    ] {
        let mut f = ok();
        f.paths.insert("decisions".into(), bad.into());
        assert_eq!(fields(&f), ["paths.decisions"], "{bad}");
    }
}

#[test]
fn rejects_a_bad_workflow_and_an_empty_gate() {
    let mut f = ok();
    f.default_workflow = Some("Deliver Now".into());
    f.gates = vec!["cargo test".into(), " ".into()];
    assert_eq!(fields(&f), ["defaultWorkflow", "gates[1]"]);
}

#[test]
fn ignore_block_adds_only_the_missing_rules() {
    let all = ignore_block("").unwrap();
    assert!(all.contains(".DS_Store") && all.contains("Thumbs.db"));
    assert!(ignore_block(&all).is_none());
    let more = ignore_block("target/\n.DS_Store\n").unwrap();
    assert!(more.starts_with("target/\n.DS_Store\n"));
    assert!(more.contains("Thumbs.db"));
    assert_eq!(more.matches(".DS_Store").count(), 1);
}

#[test]
fn a_connection_id_is_a_conn_slug() {
    let mut f = ok();
    f.connections = Some(ProjectConnections {
        tracker: Some("acme-linear".into()),
        forge: None,
        tracker_scope: None,
    });
    assert!(validate(&f).is_empty());
    for bad in ["", "Acme", "a b", "-a", "https://x.test", "a/b"] {
        f.connections = Some(ProjectConnections {
            tracker: None,
            forge: Some(bad.into()),
            tracker_scope: None,
        });
        assert_eq!(fields(&f), ["connections.forge"], "{bad:?}");
    }
}

#[test]
fn a_tracker_scope_is_text_that_a_query_can_carry() {
    let mut f = ok();
    for good in ["ACME", "acme/web", "My Project", "team-x"] {
        f.connections = Some(ProjectConnections {
            tracker_scope: Some(good.into()),
            ..Default::default()
        });
        assert!(validate(&f).is_empty(), "{good:?}");
    }
    for bad in ["", " ACME", "ACME ", "A\nB", &"x".repeat(201)] {
        f.connections = Some(ProjectConnections {
            tracker_scope: Some(bad.into()),
            ..Default::default()
        });
        assert_eq!(fields(&f), ["connections.trackerScope"], "{bad:?}");
    }
}
