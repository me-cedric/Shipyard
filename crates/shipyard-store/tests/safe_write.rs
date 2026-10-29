//! Safe write tests (spec `design` REQ-005, REQ-023; spec `specs` REQ-023).

use std::fs;

use shipyard_store::safe_write::{Saved, create, stamp, write};

#[test]
fn write_replaces_when_the_stamp_matches() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("a.md");
    fs::write(&p, "old").unwrap();
    let s = stamp(&p).unwrap().unwrap();
    let Saved::Done(next) = write(&p, "new", Some(&s)).unwrap() else {
        panic!("conflict")
    };
    assert_eq!(fs::read_to_string(&p).unwrap(), "new");
    assert_eq!(stamp(&p).unwrap().as_deref(), Some(next.as_str()));
}

#[test]
fn write_warns_when_the_file_changed_on_disk() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("a.md");
    fs::write(&p, "old").unwrap();
    let s = stamp(&p).unwrap().unwrap();
    fs::write(&p, "changed by another tool").unwrap();
    assert_eq!(write(&p, "mine", Some(&s)).unwrap(), Saved::Conflict);
    assert_eq!(fs::read_to_string(&p).unwrap(), "changed by another tool");
    // Keep the version of the person: write with no stamp.
    assert!(matches!(write(&p, "mine", None).unwrap(), Saved::Done(_)));
    assert_eq!(fs::read_to_string(&p).unwrap(), "mine");
}

#[test]
fn a_failed_write_keeps_the_old_file() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("a.md");
    fs::write(&p, "old").unwrap();
    // The parent of the target is a file, so the temp file cannot be made.
    let bad = p.join("child.md");
    assert!(write(&bad, "new", None).is_err());
    assert_eq!(fs::read_to_string(&p).unwrap(), "old");
    let names: Vec<_> = fs::read_dir(dir.path()).unwrap().flatten().collect();
    assert_eq!(names.len(), 1, "no temp file stays");
}

#[test]
fn create_refuses_an_existing_file_and_makes_the_folder() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("new/dir/a.md");
    create(&p, "one").unwrap();
    assert_eq!(fs::read_to_string(&p).unwrap(), "one");
    assert!(create(&p, "two").is_err());
    assert_eq!(fs::read_to_string(&p).unwrap(), "one");
}

#[test]
fn stamp_of_a_missing_file_is_none() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(stamp(&dir.path().join("none")).unwrap(), None);
}
