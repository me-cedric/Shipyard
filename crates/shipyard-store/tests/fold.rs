//! Fold tests (spec `specs`, REQ-015).

use shipyard_store::fold::fold;

const SPEC: &str = "# Spec: x\n\n## Purpose\n\nStatus: Draft\n\n### Goal\n\nGoal text.\n\n### Requirements\n\n- REQ-011: Lists plans. [NEEDS CLARIFICATION: Q-037 Where do files live?] Done.\n- REQ-019: Keeps links. [NEEDS CLARIFICATION: Q-035 What on a re-apply?]\n\n## ADDED Requirements\n\n### Requirement: REQ-011 Plans\n\nText.\n";

fn headings(t: &str) -> Vec<&str> {
    t.lines().filter(|l| l.starts_with("## ")).collect()
}

#[test]
fn replaces_the_marker_and_creates_the_heading() {
    let out = fold(SPEC, "Q-037", "Where do files live?", "one file per plan").unwrap();
    assert!(out.contains("- REQ-011: Lists plans. one file per plan Done."));
    assert!(
        out.contains("Q-035 What on a re-apply?"),
        "other marker stays"
    );
    let want = "- REQ-019: Keeps links. [NEEDS CLARIFICATION: Q-035 What on a re-apply?]\n\n### Clarifications\n\n- Q-037 Where do files live?: one file per plan\n\n## ADDED Requirements";
    assert!(out.contains(want), "{out}");
    assert_eq!(headings(&out), headings(SPEC));
}

#[test]
fn appends_under_an_existing_heading() {
    let a = fold(SPEC, "Q-037", "Q one?", "A one").unwrap();
    let b = fold(&a, "Q-035", "Q two?", "A two").unwrap();
    assert_eq!(b.matches("### Clarifications").count(), 1);
    let want = "### Clarifications\n\n- Q-037 Q one?: A one\n- Q-035 Q two?: A two\n\n## ADDED";
    assert!(b.contains(want), "{b}");
    assert_eq!(headings(&b), headings(SPEC));
    assert!(!b.contains("NEEDS CLARIFICATION"));
}

#[test]
fn replaces_each_marker_that_cites_the_id() {
    let spec = "## Purpose\n\n[NEEDS CLARIFICATION: Q-001 a] and [NEEDS CLARIFICATION: Q-001 b]\n";
    let out = fold(spec, "Q-001", "q?", "yes").unwrap();
    assert!(out.starts_with("## Purpose\n\nyes and yes\n"));
}

#[test]
fn id_must_match_whole() {
    let spec = "## Purpose\n\n[NEEDS CLARIFICATION: Q-0350 a]\n";
    assert!(fold(spec, "Q-035", "q?", "a").is_err());
}

#[test]
fn errors() {
    assert!(fold(SPEC, "Q-099", "q?", "a").is_err());
    assert!(fold(SPEC, "Q-037", "q?", "two\n## lines").is_err());
    assert!(fold("[NEEDS CLARIFICATION: Q-037 x]\n", "Q-037", "q?", "a").is_err());
}

#[test]
fn keeps_a_missing_final_newline() {
    let out = fold(
        "## Purpose\n\n[NEEDS CLARIFICATION: Q-001 a]",
        "Q-001",
        "q?",
        "yes",
    )
    .unwrap();
    assert!(!out.ends_with('\n'));
}
