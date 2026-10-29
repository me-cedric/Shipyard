//! Artifact status, requirement and marker tests (spec `specs`, REQ-002, REQ-003, REQ-007).

use shipyard_core::specs::{
    ArtifactStatus, artifact_path, markers, requirements, status, valid_change_id,
};

#[test]
fn missing_when_the_file_does_not_exist() {
    assert_eq!(status(false, 0), ArtifactStatus::Missing);
    assert_eq!(status(false, 3), ArtifactStatus::Missing);
}

#[test]
fn done_without_findings_draft_with_findings() {
    assert_eq!(status(true, 0), ArtifactStatus::Done);
    assert_eq!(status(true, 1), ArtifactStatus::Draft);
}

#[test]
fn artifact_paths() {
    assert_eq!(artifact_path("proposal", "demo"), "proposal.md");
    assert_eq!(artifact_path("spec", "demo"), "specs/demo/spec.md");
    assert_eq!(artifact_path("tasks", "demo"), "specs/demo/tasks.md");
}

#[test]
fn reads_requirements_with_lines() {
    let text = "# Spec\n\n### Requirement: REQ-001 Changes list\n\nbody\n### Requirement: REQ-004 Validation per artifact\n#### Scenario: x\n### Requirement: nope\n";
    let r = requirements(text);
    assert_eq!(r.len(), 2);
    assert_eq!(
        (r[0].id.as_str(), r[0].title.as_str(), r[0].line),
        ("REQ-001", "Changes list", 3)
    );
    assert_eq!(
        (r[1].id.as_str(), r[1].title.as_str(), r[1].line),
        ("REQ-004", "Validation per artifact", 6)
    );
}

#[test]
fn markers_with_and_without_a_question() {
    let text = "a\n- REQ-011: x [NEEDS CLARIFICATION: Q-037 Where do files live?] y\nplain\n[NEEDS CLARIFICATION: who owns it?] and [NEEDS CLARIFICATION: Q-036 May we?]\n";
    let m = markers(text);
    assert_eq!(m.len(), 3);
    assert_eq!(m[0].line, 2);
    assert_eq!(m[0].question.as_deref(), Some("Q-037"));
    assert_eq!(m[0].text, "Q-037 Where do files live?");
    assert_eq!((m[1].line, m[1].question.as_deref()), (4, None));
    assert_eq!(m[1].text, "who owns it?");
    assert_eq!((m[2].line, m[2].question.as_deref()), (4, Some("Q-036")));
}

#[test]
fn change_id_is_kebab_case() {
    for ok in ["add-specs", "a", "w5-fix", "add-2fa"] {
        assert!(valid_change_id(ok), "{ok}");
    }
    for bad in [
        "",
        "Add-specs",
        "add specs",
        "-a",
        "a-",
        "a--b",
        "a_b",
        "../x",
        "a/b",
    ] {
        assert!(!valid_change_id(bad), "{bad}");
    }
}
