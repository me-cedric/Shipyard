//! `write_atomic` never follows a link at its temporary name.

use std::fs;

use shipyard_store::project::write_atomic;

#[cfg(unix)]
#[test]
fn a_link_named_like_the_old_temporary_file_is_not_followed() {
    let dir = tempfile::tempdir().unwrap();
    let victim = dir.path().join("victim.txt");
    fs::write(&victim, "keep").unwrap();
    let p = dir.path().join("a.json");
    std::os::unix::fs::symlink(&victim, p.with_extension("tmp")).unwrap();
    write_atomic(&p, b"new").unwrap();
    assert_eq!(fs::read_to_string(&victim).unwrap(), "keep");
    assert_eq!(fs::read_to_string(&p).unwrap(), "new");
}

#[test]
fn it_writes_replaces_and_leaves_no_temporary_file() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("sub/a.json");
    write_atomic(&p, b"one").unwrap();
    write_atomic(&p, b"two").unwrap();
    assert_eq!(fs::read_to_string(&p).unwrap(), "two");
    assert_eq!(fs::read_dir(p.parent().unwrap()).unwrap().count(), 1);
}
