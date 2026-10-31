//! Archive tests (spec `specs`, REQ-020, REQ-023).

use std::fs;
use std::path::Path;

use shipyard_store::archive::{archive, settle};

fn setup() -> tempfile::TempDir {
    let d = tempfile::tempdir().unwrap();
    let o = d.path();
    for (p, t) in [
        ("changes/add-x/proposal.md", "P"),
        ("changes/add-x/specs/alpha/spec.md", "new alpha"),
        ("changes/add-x/specs/alpha/plan.md", "plan"),
        ("changes/add-x/specs/beta/spec.md", "new beta"),
        ("specs/gamma/spec.md", "old gamma"),
    ] {
        let f = o.join(p);
        fs::create_dir_all(f.parent().unwrap()).unwrap();
        fs::write(f, t).unwrap();
    }
    d
}

fn read(o: &Path, p: &str) -> String {
    fs::read_to_string(o.join(p)).unwrap()
}

#[test]
fn moves_the_capabilities_and_the_change() {
    let d = setup();
    let caps = archive(d.path(), "add-x", "2026-10-29", &[], false).unwrap();
    assert_eq!(caps, ["alpha", "beta"]);
    assert_eq!(read(d.path(), "specs/alpha/spec.md"), "new alpha");
    assert_eq!(read(d.path(), "specs/gamma/spec.md"), "old gamma");
    assert!(!d.path().join(".archive-add-x").exists());
    assert_eq!(read(d.path(), "specs/alpha/plan.md"), "plan");
    assert_eq!(read(d.path(), "specs/beta/spec.md"), "new beta");
    assert!(!d.path().join("changes/add-x").exists());
    assert_eq!(
        read(d.path(), "changes/archive/2026-10-29-add-x/proposal.md"),
        "P"
    );
}

#[test]
fn open_items_need_a_confirmation() {
    let d = setup();
    let open = vec!["WI-1 Login".to_string(), "WI-2 Logout".to_string()];
    let e = archive(d.path(), "add-x", "2026-10-29", &open, false).unwrap_err();
    assert!(e.contains("WI-1 Login") && e.contains("WI-2 Logout"), "{e}");
    assert!(!d.path().join("specs/alpha").exists());
    assert!(d.path().join("changes/add-x").exists());
    archive(d.path(), "add-x", "2026-10-29", &open, true).unwrap();
}

#[test]
fn a_taken_archive_name_leaves_the_old_files() {
    let d = setup();
    fs::create_dir_all(d.path().join("changes/archive/2026-10-29-add-x")).unwrap();
    assert!(archive(d.path(), "add-x", "2026-10-29", &[], false).is_err());
    assert!(!d.path().join("specs/alpha").exists());
    assert!(d.path().join("changes/add-x").exists());
}

#[test]
fn a_settled_capability_is_refused_and_nothing_moves() {
    let d = setup();
    let f = d.path().join("specs/beta/spec.md");
    fs::create_dir_all(f.parent().unwrap()).unwrap();
    fs::write(f, "old beta").unwrap();
    let e = archive(d.path(), "add-x", "2026-10-29", &[], false).unwrap_err();
    assert!(e.contains("beta"), "{e}");
    assert_eq!(read(d.path(), "specs/beta/spec.md"), "old beta");
    assert!(!d.path().join("specs/alpha").exists());
    assert!(d.path().join("changes/add-x/proposal.md").exists());
}

#[test]
fn rejects_bad_input() {
    let d = setup();
    assert!(archive(d.path(), "missing", "2026-10-29", &[], false).is_err());
    assert!(archive(d.path(), "../x", "2026-10-29", &[], false).is_err());
    assert!(archive(d.path(), "archive", "2026-10-29", &[], false).is_err());
    assert!(archive(d.path(), "add-x", "today", &[], false).is_err());
}

const DRAFT: &str = "# Spec: x\n\n## Purpose\n\nStatus: Draft\nChange: `change:add-x`\n\n### Requirements\n\n- REQ-001: A.\n\n## ADDED Requirements\n\n### Requirement: REQ-001 A\n\nText. Status: kept\n";

#[test]
fn a_settled_spec_has_requirements_a_requirement_list_and_the_settled_status() {
    let out = settle(DRAFT);
    assert!(
        out.contains("\n## Requirements\n") && !out.contains("ADDED"),
        "{out}"
    );
    assert!(out.contains("\n### Requirement list\n") && !out.contains("\n### Requirements\n"));
    assert!(out.contains("\nStatus: Settled\n") && !out.contains("Status: Draft"));
    // Every other line stays, also a line that only holds the word in a text.
    assert!(out.contains("Change: `change:add-x`") && out.contains("Text. Status: kept"));
    assert_eq!(out.lines().count(), DRAFT.lines().count());
    assert_eq!(settle(&out), out, "settling twice changes nothing");
}

#[test]
fn settle_keeps_the_line_ends() {
    let crlf = DRAFT.replace('\n', "\r\n");
    let out = settle(&crlf);
    assert!(out.contains("## Requirements\r\n") && out.contains("Status: Settled\r\n"));
    assert_eq!(out.matches('\n').count(), out.matches("\r\n").count());
}

#[test]
fn the_archive_settles_each_spec_and_leaves_other_files_as_they_are() {
    let d = setup();
    fs::write(d.path().join("changes/add-x/specs/alpha/spec.md"), DRAFT).unwrap();
    fs::write(
        d.path().join("changes/add-x/specs/alpha/plan.md"),
        "## ADDED Requirements\n",
    )
    .unwrap();
    archive(d.path(), "add-x", "2026-10-29", &[], false).unwrap();
    assert_eq!(read(d.path(), "specs/alpha/spec.md"), settle(DRAFT));
    assert_eq!(
        read(d.path(), "specs/alpha/plan.md"),
        "## ADDED Requirements\n"
    );
    // The archived copy of the change keeps what the people wrote.
    assert_eq!(
        read(
            d.path(),
            "changes/archive/2026-10-29-add-x/specs/alpha/spec.md"
        ),
        DRAFT
    );
}
