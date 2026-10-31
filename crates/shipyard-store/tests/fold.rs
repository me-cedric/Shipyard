//! Fold tests (spec `specs` REQ-015; spec `questions-loop` REQ-015). `fold` is the write path and
//! `fold_preview` the preview of the same text. Nothing here writes a file.

use shipyard_store::fold::{Edit, FoldError, fold, fold_preview};
use shipyard_store::raid::{Item, Kind, Status, new_item};

const SPEC_FILE: &str = "# Spec: x\n\n## Purpose\n\nStatus: Draft\n\n### Goal\n\nGoal text.\n\n### Requirements\n\n- REQ-011: Lists plans. [NEEDS CLARIFICATION: Q-037 Where do files live?] Done.\n- REQ-019: Keeps links. [NEEDS CLARIFICATION: Q-035 What on a re-apply?]\n\n## ADDED Requirements\n\n### Requirement: REQ-011 Plans\n\nText.\n";

fn headings(t: &str) -> Vec<&str> {
    t.lines().filter(|l| l.starts_with("## ")).collect()
}

#[test]
fn replaces_the_marker_and_creates_the_heading() {
    let out = fold(
        SPEC_FILE,
        "Q-037",
        "Where do files live?",
        "one file per plan",
    )
    .unwrap();
    assert!(out.contains("- REQ-011: Lists plans. one file per plan Done."));
    assert!(
        out.contains("Q-035 What on a re-apply?"),
        "other marker stays"
    );
    let want = "- REQ-019: Keeps links. [NEEDS CLARIFICATION: Q-035 What on a re-apply?]\n\n### Clarifications\n\n- Q-037 Where do files live?: one file per plan\n\n## ADDED Requirements";
    assert!(out.contains(want), "{out}");
    assert_eq!(headings(&out), headings(SPEC_FILE));
}

#[test]
fn appends_under_an_existing_heading() {
    let a = fold(SPEC_FILE, "Q-037", "Q one?", "A one").unwrap();
    let b = fold(&a, "Q-035", "Q two?", "A two").unwrap();
    assert_eq!(b.matches("### Clarifications").count(), 1);
    let want = "### Clarifications\n\n- Q-037 Q one?: A one\n- Q-035 Q two?: A two\n\n## ADDED";
    assert!(b.contains(want), "{b}");
    assert_eq!(headings(&b), headings(SPEC_FILE));
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
    assert!(fold(SPEC_FILE, "Q-099", "q?", "a").is_err());
    assert!(fold(SPEC_FILE, "Q-037", "q?", "two\n## lines").is_err());
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

const SPEC: &str = "\
# Spec: projects

## Purpose

Status: Draft

### Goal

One goal.

### Links

- Consumes: none.

## ADDED Requirements

- REQ-003: The id SHALL be unique. [NEEDS CLARIFICATION: Q-026 How do two machines avoid the same Q-NNN?] Working assumption: Q-026 option 1, the next number. Each id SHALL show.
- REQ-004: Another. [NEEDS CLARIFICATION: Q-027 Other?] Working assumption: Q-027 option 1, none.
";

fn answered(id: &str, q: &str, a: &str) -> Item {
    Item {
        question: q.into(),
        answer: a.into(),
        status: Some(Status::Answered),
        kind: Some(Kind::Question),
        ..new_item(id, "2026-10-29")
    }
}

fn q026() -> Item {
    answered(
        "Q-026",
        "How do two machines avoid the same Q-NNN?\n\nOptions:\n1. Next number\n2. Prefix",
        "Take the next number after the highest.",
    )
}

#[test]
fn the_marker_goes_and_the_answer_goes_under_a_new_clarifications_heading() {
    let f = fold_preview(SPEC, &q026()).unwrap();
    let bullet = "- Q-026 How do two machines avoid the same Q-NNN?: Take the next number after the highest.";
    // The marker and its working assumption are replaced by the answer. The text after stays.
    assert!(f.after.contains(
        "- REQ-003: The id SHALL be unique. Take the next number after the highest. Each id SHALL show.\n"
    ));
    assert!(!f.after.contains("Q-026 option 1"));
    // The other marker stays.
    assert!(f.after.contains("[NEEDS CLARIFICATION: Q-027 Other?]"));
    // No heading yet: the heading is added at the end of Purpose. No `## ` section is added.
    assert!(f.after.contains(&format!(
        "- Consumes: none.\n\n### Clarifications\n\n{bullet}\n\n## ADDED Requirements"
    )));
    let h2 = |t: &str| t.lines().filter(|l| l.starts_with("## ")).count();
    assert_eq!(h2(&f.after), h2(SPEC));
    // The preview lists both edits with their old line numbers.
    let lines: Vec<&str> = SPEC.lines().collect();
    assert_eq!(f.edits.len(), 2);
    let marker = f.edits.iter().find(|e| !e.removed.is_empty()).unwrap();
    assert_eq!(marker.removed, [lines[marker.line - 1]]);
    assert_eq!(marker.added.len(), 1);
    let ins: &Edit = f.edits.iter().find(|e| e.removed.is_empty()).unwrap();
    assert_eq!(ins.added, ["", "### Clarifications", "", bullet]);
    assert_eq!(lines[ins.line - 2], "- Consumes: none.");
}

#[test]
fn an_existing_heading_gets_one_more_bullet() {
    let spec = SPEC.replace(
        "## ADDED Requirements",
        "### Clarifications\n\n- Q-001 Old?: Yes.\n\n## ADDED Requirements",
    );
    let f = fold_preview(&spec, &q026()).unwrap();
    assert!(f.after.contains(
        "- Q-001 Old?: Yes.\n- Q-026 How do two machines avoid the same Q-NNN?: Take the next number after the highest.\n\n## ADDED"
    ));
    assert_eq!(f.after.matches("### Clarifications").count(), 1);
}

#[test]
fn the_fold_is_idempotent() {
    let first = fold_preview(SPEC, &q026()).unwrap();
    let second = fold_preview(&first.after, &q026()).unwrap();
    assert!(second.edits.is_empty());
    assert_eq!(second.after, first.after);
}

#[test]
fn only_the_marker_of_its_own_id_matches() {
    let spec = SPEC.replace("Q-026", "Q-0260").replace("Q-027", "Q-02");
    let f = fold_preview(&spec, &q026()).unwrap();
    assert!(f.after.contains("[NEEDS CLARIFICATION: Q-0260"));
    // No marker: the bullet alone.
    assert_eq!(f.edits.len(), 1);
}

#[test]
fn a_marker_without_a_working_assumption_and_a_long_answer() {
    let spec = "## Purpose\n\nText [NEEDS CLARIFICATION: Q-005 Which?] end.\n";
    let it = answered("Q-005", "Which?", "Line one.\n\nLine two.");
    let f = fold_preview(spec, &it).unwrap();
    assert!(
        f.after
            .starts_with("## Purpose\n\nText Line one. Line two. end.\n")
    );
    // The bullet is one line.
    assert!(f.after.contains("- Q-005 Which?: Line one. Line two.\n"));
}

#[test]
fn a_question_that_is_not_answered_does_not_fold() {
    let mut it = q026();
    it.status = Some(Status::Open);
    assert_eq!(fold_preview(SPEC, &it).unwrap_err(), FoldError::NotAnswered);
    let mut it = q026();
    it.answer = "  ".into();
    assert_eq!(fold_preview(SPEC, &it).unwrap_err(), FoldError::NotAnswered);
    assert_eq!(
        fold_preview("# Spec\n\n## ADDED Requirements\n", &q026()).unwrap_err(),
        FoldError::NoPurpose
    );
}

#[test]
fn crlf_stays() {
    let spec = SPEC.replace('\n', "\r\n");
    let f = fold_preview(&spec, &q026()).unwrap();
    assert!(f.after.contains("\r\n### Clarifications\r\n"));
    assert!(!f.after.replace("\r\n", "").contains('\n'));
}

#[test]
fn the_real_spec_of_this_repository_folds_q026() {
    // A frozen copy: the live spec is folded and archived, so it no longer holds the marker.
    let text = include_str!("fixtures/questions-loop-spec.md");
    let f = fold_preview(text, &q026()).unwrap();
    assert!(!f.after.contains("[NEEDS CLARIFICATION: Q-026"));
    assert!(f.after.contains("### Clarifications"));
    assert!(f.after.contains("[NEEDS CLARIFICATION: Q-027"));
    let h2 = |t: &str| t.lines().filter(|l| l.starts_with("## ")).count();
    assert_eq!(h2(&f.after), h2(text));
}

#[test]
fn a_marker_at_the_start_of_a_line_cannot_start_a_section() {
    let spec = "## Purpose\n\n[NEEDS CLARIFICATION: Q-001 a]\n\n## Next\n";
    assert_eq!(
        fold_preview(spec, &answered("Q-001", "q?", "## Evil")).unwrap_err(),
        FoldError::Sections
    );
    assert!(fold(spec, "Q-001", "q?", "## Evil").is_err());
}

#[test]
fn the_write_and_the_preview_give_the_same_text() {
    let a = fold(
        SPEC,
        "Q-026",
        "How do two machines avoid the same Q-NNN?",
        "Take the next.",
    );
    let b = fold_preview(
        SPEC,
        &answered(
            "Q-026",
            "How do two machines avoid the same Q-NNN?",
            "Take the next.",
        ),
    );
    assert_eq!(a.unwrap(), b.unwrap().after);
}
