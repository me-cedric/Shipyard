//! Design artifact list, flow file, screens and path guard (spec `design` REQ-001, REQ-003, REQ-005,
//! REQ-011, REQ-016, REQ-019, REQ-021).

use std::fs;
use std::path::Path;

use shipyard_core::flows::{Action, FlowRow};
use shipyard_core::project::ProjectFile;
use shipyard_core::refs::parse;
use shipyard_store::design::{
    Artifact, design_doc_path, list, read_flows, read_screens, resolve, write_flows,
};

fn project() -> ProjectFile {
    ProjectFile::new("Demo", "DEMO")
}

fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn refs(a: &[Artifact]) -> Vec<&str> {
    a.iter().map(|a| a.reference.as_str()).collect()
}

#[test]
fn missing_folders_give_no_rows() {
    let dir = tempfile::tempdir().unwrap();
    assert!(list(dir.path(), &project()).is_empty());
}

#[test]
fn diagrams_list_four_formats() {
    let dir = tempfile::tempdir().unwrap();
    for f in [
        "a.excalidraw",
        "b.drawio",
        "c.drawio.svg",
        "d.mmd",
        "e.mermaid",
        "f.bpmn",
        "g.svg",
    ] {
        put(dir.path(), &format!("docs/diagrams/{f}"), "x");
    }
    let rows = list(dir.path(), &project());
    let got: Vec<_> = rows
        .iter()
        .map(|a| (a.reference.as_str(), a.format.as_deref().unwrap()))
        .collect();
    assert_eq!(
        got,
        vec![
            ("diagram:a", "excalidraw"),
            ("diagram:b", "drawio"),
            ("diagram:c", "drawio"),
            ("diagram:d", "mermaid"),
            ("diagram:e", "mermaid"),
            ("diagram:f", "bpmn"),
        ]
    );
    assert_eq!(rows[2].path, "docs/diagrams/c.drawio.svg");
    assert_eq!(rows[2].title, "c");
    assert_eq!(rows[2].kind, "diagram");
}

#[test]
fn drawio_svg_without_a_board_gets_an_issue() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/diagrams/plain.drawio.svg", "<svg xmlns=\"x\"/>");
    put(
        dir.path(),
        "docs/diagrams/board.drawio.svg",
        "<svg content=\"&lt;mxfile&gt;&lt;/mxfile&gt;\"/>",
    );
    let rows = list(dir.path(), &project());
    assert_eq!(refs(&rows), vec!["diagram:board", "diagram:plain"]);
    assert!(rows[0].issue.is_none());
    assert!(rows[1].issue.is_some());
}

#[test]
fn flow_file_reads_capitalized_actions() {
    let rows = read_flows(
        "rows:\n- id: 1\n  source: a\n  destination: b\n  network: VLAN1\n  protocol: TCP\n  action: Allow\n",
    )
    .unwrap();
    assert_eq!(rows[0].action, Action::Allow);
}

#[test]
fn slug_is_lower_case_and_parses_as_a_ref() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/diagrams/My  Diagram_v2.drawio.svg", "x");
    put(dir.path(), "docs/diagrams/-- Été --.mmd", "x");
    put(dir.path(), "docs/diagrams/___.mmd", "x");
    let rows = list(dir.path(), &project());
    assert_eq!(refs(&rows), vec!["diagram:t", "diagram:my-diagram-v2"]);
    assert!(rows.iter().all(|a| parse(&a.reference).is_some()));
}

#[test]
fn slug_clash_marks_the_later_path_with_its_format() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/diagrams/net.drawio", "x");
    put(dir.path(), "docs/diagrams/net.mmd", "x");
    put(dir.path(), "docs/models/net.c4", "x");
    let rows = list(dir.path(), &project());
    assert_eq!(
        refs(&rows),
        vec!["diagram:net", "diagram:net-mermaid", "model:net"]
    );
}

#[test]
fn models_and_data_and_flows_list_by_extension() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/models/a.c4", "x");
    put(dir.path(), "docs/models/b.likec4", "x");
    put(dir.path(), "docs/data-models/shop.dbml", "x");
    put(dir.path(), "docs/flows/lan.yaml", "rows: []");
    put(dir.path(), "docs/flows/notes.md", "x");
    let rows = list(dir.path(), &project());
    assert_eq!(
        refs(&rows),
        vec!["data:shop", "flow:lan", "model:a", "model:b"]
    );
    assert_eq!(rows[0].title, "shop");
}

#[test]
fn api_rows_carry_title_and_version() {
    let dir = tempfile::tempdir().unwrap();
    put(
        dir.path(),
        "docs/api/pets.yaml",
        "openapi: 3.0.0\ninfo:\n  title: Pets\n  version: 1.2.0\n",
    );
    put(
        dir.path(),
        "docs/api/old.json",
        r#"{"swagger":"2.0","info":{"title":"Old","version":"2"}}"#,
    );
    put(dir.path(), "docs/api/values.yml", "replicas: 2\n");
    let rows = list(dir.path(), &project());
    assert_eq!(refs(&rows), vec!["api:old", "api:pets"]);
    assert_eq!(rows[0].version.as_deref(), Some("2"));
    assert_eq!(rows[1].title, "Pets");
    assert_eq!(rows[1].version.as_deref(), Some("1.2.0"));
    assert!(rows[1].issue.is_none());
}

#[test]
fn api_file_that_does_not_parse_stays_listed_with_an_issue() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/api/bad.yaml", "openapi: [unclosed\n");
    let rows = list(dir.path(), &project());
    assert_eq!(refs(&rows), vec!["api:bad"]);
    assert!(rows[0].issue.is_some());
    assert_eq!(rows[0].title, "bad");
}

#[test]
fn file_above_five_megabytes_is_skipped() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/diagrams/small.mmd", "x");
    put(dir.path(), "docs/diagrams/big.mmd", "x");
    let f = fs::OpenOptions::new()
        .write(true)
        .open(dir.path().join("docs/diagrams/big.mmd"))
        .unwrap();
    f.set_len(5 * 1024 * 1024 + 1).unwrap();
    assert_eq!(refs(&list(dir.path(), &project())), vec!["diagram:small"]);
}

#[test]
fn project_paths_move_the_folders() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "arch/x.mmd", "x");
    let mut p = project();
    p.paths.insert("diagrams".into(), "arch".into());
    assert_eq!(list(dir.path(), &p)[0].path, "arch/x.mmd");
}

#[test]
fn screens_list_and_flag_a_broken_figma_path() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/designs/ui/home.fig", "x");
    put(
        dir.path(),
        "docs/designs/screens.json",
        r#"{"screens":[
          {"slug":"home","title":"Home","artifacts":["diagram:flow-1"],"figma":"docs/designs/ui/home.fig"},
          {"slug":"gone","title":"Gone","figma":"docs/designs/ui/gone.fig"},
          {"slug":"web","title":"Web","figma":"https://www.figma.com/file/abc"},
          {"slug":"bare","title":"Bare"},
          {"slug":"up","title":"Up","figma":"../secret.fig"}
        ]}"#,
    );
    let screens = read_screens(dir.path(), &project()).unwrap();
    let broken: Vec<_> = screens
        .iter()
        .map(|s| (s.slug.as_str(), s.broken))
        .collect();
    assert_eq!(
        broken,
        vec![
            ("home", false),
            ("gone", true),
            ("web", false),
            ("bare", false),
            ("up", true)
        ]
    );
    assert_eq!(screens[0].artifacts, vec!["diagram:flow-1"]);
    let rows = list(dir.path(), &project());
    assert_eq!(rows.len(), 5);
    assert_eq!(rows[0].reference, "screen:home");
    assert_eq!(rows[0].kind, "screen");
    assert_eq!(rows[0].path, "docs/designs/screens.json");
}

#[test]
fn screens_file_missing_gives_no_screens_and_bad_json_gives_an_error() {
    let dir = tempfile::tempdir().unwrap();
    assert!(read_screens(dir.path(), &project()).unwrap().is_empty());
    put(dir.path(), "docs/designs/screens.json", "{");
    assert!(read_screens(dir.path(), &project()).is_err());
}

#[test]
fn design_doc_lives_in_the_designs_folder() {
    assert_eq!(design_doc_path(&project()), "docs/designs/design.md");
}

#[test]
fn flow_file_round_trips() {
    let rows = vec![
        FlowRow {
            id: 1,
            source: "web".into(),
            destination: "db".into(),
            network: "VLAN10".into(),
            protocol: "TCP".into(),
            port: Some("5432".into()),
            action: Action::Allow,
            note: Some("primary".into()),
        },
        FlowRow {
            id: 2,
            source: "any".into(),
            destination: "db".into(),
            network: "VNET1".into(),
            protocol: "UDP".into(),
            port: None,
            action: Action::Deny,
            note: None,
        },
    ];
    let text = write_flows(&rows);
    assert!(text.starts_with("rows:"), "{text}");
    assert_eq!(read_flows(&text).unwrap(), rows);
    assert_eq!(read_flows(&write_flows(&[])).unwrap(), vec![]);
    assert!(read_flows("rows: 3").is_err());
}

#[test]
fn resolve_accepts_a_path_under_a_design_folder() {
    let dir = tempfile::tempdir().unwrap();
    let p = project();
    for rel in [
        "docs/diagrams/a.mmd",
        "docs/designs/design.md",
        "docs/decisions/0001-x.md",
        "docs/flows/sub/lan.yaml",
    ] {
        assert_eq!(
            resolve(dir.path(), &p, rel).unwrap(),
            dir.path().join(rel),
            "{rel}"
        );
    }
}

#[test]
fn resolve_rejects_unsafe_paths() {
    let dir = tempfile::tempdir().unwrap();
    let p = project();
    for rel in [
        "",
        "/etc/passwd",
        "docs/diagrams/../../secret",
        "../outside.md",
        "docs/diagrams/../api/x.yaml",
        "docs\\diagrams\\a.mmd",
        "src/main.rs",
        ".shipyard/project.yaml",
        "docs/diagramsx/a.mmd",
        "docs",
    ] {
        assert!(resolve(dir.path(), &p, rel).is_err(), "{rel}");
    }
}

#[cfg(unix)]
#[test]
fn resolve_rejects_a_link_that_leaves_the_repository() {
    let dir = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("docs")).unwrap();
    std::os::unix::fs::symlink(out.path(), dir.path().join("docs/diagrams")).unwrap();
    assert!(resolve(dir.path(), &project(), "docs/diagrams/a.mmd").is_err());
}
