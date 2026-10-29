//! Health rules (spec `projects`, REQ-011, REQ-012, REQ-013, REQ-018).

use shipyard_core::health::{
    BrokenRef, CompassResult, FileState, Fix, Group, HealthInput, Severity, evaluate, worst,
};

fn healthy() -> HealthInput {
    HealthInput {
        project_file: FileState::Valid,
        new_project_file: "name: X\n".into(),
        gitignore: Some(shipyard_core::project::ignore_block("").unwrap()),
        tools: vec![("git".into(), true), ("node".into(), true)],
        compass: Some(CompassResult {
            ok: true,
            output: String::new(),
        }),
        broken_refs: vec![],
    }
}

#[test]
fn a_healthy_project_has_no_finding() {
    let f = evaluate(&healthy());
    assert!(f.is_empty());
    assert_eq!(worst(&f), None);
}

#[test]
fn a_missing_folder_is_the_only_finding() {
    let mut i = healthy();
    i.project_file = FileState::FolderMissing;
    i.gitignore = None;
    let f = evaluate(&i);
    assert_eq!(f.len(), 1);
    assert_eq!(
        (f[0].code.as_str(), f[0].severity, &f[0].fix),
        ("folder-missing", Severity::Error, &Fix::Recheck)
    );
}

#[test]
fn a_missing_project_file_offers_a_write_fix() {
    let mut i = healthy();
    i.project_file = FileState::Missing;
    let f = evaluate(&i);
    assert_eq!(f.len(), 1);
    assert_eq!(f[0].group, Group::Compliance);
    assert_eq!(f[0].code, "project-file-missing");
    assert_eq!(
        f[0].fix,
        Fix::Write {
            path: ".shipyard/project.yaml".into(),
            content: "name: X\n".into()
        }
    );
}

#[test]
fn an_invalid_project_file_shows_the_line_and_the_value() {
    let mut i = healthy();
    i.project_file = FileState::Invalid(vec![(Some(3), "key: ship".into())]);
    let f = evaluate(&i);
    assert_eq!(f[0].severity, Severity::Error);
    assert_eq!(f[0].detail.as_deref(), Some("3: key: ship"));
}

#[test]
fn a_missing_ignore_rule_offers_the_new_content() {
    let mut i = healthy();
    i.gitignore = None;
    let f = evaluate(&i);
    assert_eq!(f[0].code, "ignore-missing");
    assert_eq!(f[0].severity, Severity::Info);
    let Fix::Write { path, content } = &f[0].fix else {
        panic!("write fix")
    };
    assert_eq!(path, ".gitignore");
    assert!(content.contains(".DS_Store"));
}

#[test]
fn tool_checks_name_the_missing_tool_and_skip_the_helper() {
    let mut i = healthy();
    i.tools = vec![("git".into(), true), ("node".into(), false)];
    i.compass = None;
    let f = evaluate(&i);
    assert_eq!(f.len(), 1);
    assert_eq!(
        (f[0].group, f[0].code.as_str(), f[0].detail.as_deref()),
        (Group::Tools, "tool-missing", Some("node"))
    );
    assert_eq!(f[0].fix, Fix::Recheck);
}

#[test]
fn a_failing_compass_helper_is_a_tool_finding() {
    let mut i = healthy();
    i.compass = Some(CompassResult {
        ok: false,
        output: "drift in AGENTS.md\n".into(),
    });
    let f = evaluate(&i);
    assert_eq!((f[0].group, f[0].code.as_str()), (Group::Tools, "compass"));
    assert_eq!(f[0].detail.as_deref(), Some("drift in AGENTS.md"));
}

#[test]
fn a_broken_ref_opens_its_source() {
    let mut i = healthy();
    i.broken_refs = vec![BrokenRef {
        target: "adr:0004".into(),
        source: "spec:auth".into(),
    }];
    let f = evaluate(&i);
    assert_eq!(
        (f[0].group, f[0].detail.as_deref(), f[0].source.as_deref()),
        (Group::Refs, Some("adr:0004"), Some("spec:auth"))
    );
    assert_eq!(
        f[0].fix,
        Fix::Open {
            target: "spec:auth".into()
        }
    );
}

#[test]
fn the_worst_finding_wins_and_ids_are_unique() {
    let mut i = healthy();
    i.project_file = FileState::Missing;
    i.tools = vec![("git".into(), false), ("node".into(), true)];
    i.broken_refs = vec![
        BrokenRef {
            target: "adr:0004".into(),
            source: "spec:a".into(),
        },
        BrokenRef {
            target: "adr:0004".into(),
            source: "spec:b".into(),
        },
    ];
    let f = evaluate(&i);
    assert_eq!(worst(&f), Some(Severity::Error));
    let mut ids: Vec<_> = f.iter().map(|x| x.id.clone()).collect();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), f.len());
}
