//! Archive tests (spec `specs`, REQ-020, REQ-023).

use std::fs;
use std::path::Path;

use shipyard_store::archive::archive;

fn setup() -> tempfile::TempDir {
    let d = tempfile::tempdir().unwrap();
    let o = d.path();
    for (p, t) in [
        ("changes/add-x/proposal.md", "P"),
        ("changes/add-x/specs/alpha/spec.md", "new alpha"),
        ("changes/add-x/specs/alpha/plan.md", "plan"),
        ("changes/add-x/specs/beta/spec.md", "new beta"),
        ("specs/alpha/spec.md", "old alpha"),
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
    assert_eq!(read(d.path(), "specs/alpha/spec.md"), "old alpha");
    assert!(d.path().join("changes/add-x").exists());
    archive(d.path(), "add-x", "2026-10-29", &open, true).unwrap();
}

#[test]
fn a_taken_archive_name_leaves_the_old_files() {
    let d = setup();
    fs::create_dir_all(d.path().join("changes/archive/2026-10-29-add-x")).unwrap();
    assert!(archive(d.path(), "add-x", "2026-10-29", &[], false).is_err());
    assert_eq!(read(d.path(), "specs/alpha/spec.md"), "old alpha");
    assert!(d.path().join("changes/add-x").exists());
}

#[test]
fn rejects_bad_input() {
    let d = setup();
    assert!(archive(d.path(), "missing", "2026-10-29", &[], false).is_err());
    assert!(archive(d.path(), "../x", "2026-10-29", &[], false).is_err());
    assert!(archive(d.path(), "archive", "2026-10-29", &[], false).is_err());
    assert!(archive(d.path(), "add-x", "today", &[], false).is_err());
}
