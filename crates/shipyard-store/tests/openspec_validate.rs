//! Validation mapper tests on captured CLI output (spec `specs`, REQ-004).

use std::path::Path;

use shipyard_store::openspec_validate::{map, run};

const VALID: &str = include_str!("fixtures/openspec/valid.json");
const BAD: &str = include_str!("fixtures/openspec/bad.json");
const UNKNOWN: &str = include_str!("fixtures/openspec/unknown.json");
const BAD_SPEC: &str = include_str!("fixtures/openspec/bad/specs/demo/spec.md");
const BAD_PROPOSAL: &str = include_str!("fixtures/openspec/bad/proposal.md");

fn files() -> Vec<(String, String)> {
    vec![
        ("proposal.md".into(), BAD_PROPOSAL.into()),
        ("specs/demo/spec.md".into(), BAD_SPEC.into()),
    ]
}

#[test]
fn valid_change_has_no_finding() {
    assert!(map(VALID, &files()).is_empty());
}

#[test]
fn finding_lands_on_the_spec_with_its_line() {
    let f = map(BAD, &files());
    assert_eq!(f.len(), 1);
    let f = &f[0];
    assert_eq!(f.artifact, "spec");
    assert_eq!(f.capability.as_deref(), Some("demo"));
    assert_eq!(f.path, "specs/demo/spec.md");
    assert_eq!(f.level, "error");
    assert!(f.message.contains("REQ-002 Second"));
    let want = BAD_SPEC
        .lines()
        .position(|l| l.starts_with("### Requirement: REQ-002"))
        .unwrap() as u32
        + 1;
    assert_eq!(f.line, Some(want));
}

#[test]
fn no_line_when_the_text_is_not_found() {
    let f = map(BAD, &[("specs/demo/spec.md".into(), "nothing".into())]);
    assert_eq!(f[0].line, None);
}

#[test]
fn root_files_map_to_their_artifact() {
    let json = r#"{"items":[{"issues":[{"level":"WARNING","path":"proposal.md","message":"x"}]}]}"#;
    let f = map(json, &files());
    assert_eq!(
        (f[0].artifact.as_str(), f[0].capability.clone()),
        ("proposal", None)
    );
    assert_eq!(f[0].level, "warning");
}

#[test]
fn cli_error_becomes_a_finding() {
    let f = map(UNKNOWN, &files());
    assert_eq!(f.len(), 1);
    assert!(f[0].message.contains("Unknown item"));
}

#[test]
fn unreadable_output_is_validator_missing() {
    let f = map("not json", &[]);
    assert_eq!(f.len(), 1);
    assert_eq!(f[0].message, "validator missing");
}

#[test]
fn failed_run_is_validator_missing() {
    let f = run(Path::new("/nonexistent/openspec"), "demo-bad");
    assert_eq!(f.len(), 1);
    assert_eq!(f[0].message, "validator missing");
    assert_eq!(
        run(Path::new("/x/openspec"), "Bad Id")[0].message,
        "invalid change id"
    );
}
