//! Apply, upgrade and no silent pin change (spec `extensions`, REQ-003, REQ-005, REQ-006). The
//! tree is the compass submodule of this repository, linked into a temp project. `ac sync` runs
//! with Node and needs no network when the config lists no upstream.

use std::fs;
use std::path::Path;

use shipyard_app::extensions::compass::{apply, upgrade};
use shipyard_core::extensions::SyncState;
use shipyard_store::compass::read;

fn project() -> tempfile::TempDir {
    let d = tempfile::tempdir().unwrap();
    let r = d.path();
    let tree = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/agent-compass");
    fs::create_dir_all(r.join("docs")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(tree.canonicalize().unwrap(), r.join("docs/agent-compass")).unwrap();
    fs::create_dir_all(r.join(".agents")).unwrap();
    fs::write(
        r.join(".agents/compass.json"),
        r#"{"version":1,"packs":[],"exclude":[],"upstream":[]}"#,
    )
    .unwrap();
    let git = |args: &[&str]| {
        assert!(
            std::process::Command::new("git")
                .arg("-C")
                .arg(r)
                .args(args)
                .output()
                .unwrap()
                .status
                .success()
        );
    };
    git(&["init", "-q"]);
    d
}

fn state(r: &Path, key: &str) -> SyncState {
    read(r)
        .unwrap()
        .unwrap()
        .entries
        .into_iter()
        .find(|e| e.key() == key)
        .unwrap()
        .state
}

#[test]
fn applying_the_contract_keeps_an_own_agents_file_and_names_it() {
    let d = project();
    fs::write(d.path().join("AGENTS.md"), "# mine\n").unwrap();
    let a = apply(d.path(), &["contract:contract".into()]).unwrap();
    assert!(!a.version.is_empty());
    let text = fs::read_to_string(d.path().join("AGENTS.md")).unwrap();
    assert!(text.starts_with("# mine"), "the own text stays: {text}");
    assert_eq!(state(d.path(), "contract:contract"), SyncState::Current);
}

#[test]
fn applying_a_skill_writes_it_and_the_lock_shows_current() {
    let d = project();
    assert_eq!(state(d.path(), "skill:review"), SyncState::Absent);
    let a = apply(d.path(), &["skill:review".into()]).unwrap();
    assert!(
        a.report
            .written
            .iter()
            .any(|p| p.ends_with("review/SKILL.md")),
        "{:?}",
        a.report
    );
    assert_eq!(state(d.path(), "skill:review"), SyncState::Current);
    // A second apply is safe.
    apply(d.path(), &["skill:review".into()]).unwrap();
}

#[test]
fn an_unknown_entry_is_refused_before_any_write() {
    let d = project();
    assert!(
        apply(d.path(), &["skill:../x".into()])
            .unwrap_err()
            .contains("unknown entry")
    );
    assert!(!d.path().join(".agents/skills").exists());
}

#[test]
fn upgrade_brings_stale_entries_up_to_date_and_never_moves_the_pin() {
    let d = project();
    let before = read(d.path()).unwrap().unwrap().version;
    apply(d.path(), &["skill:review".into()]).unwrap();
    // The lock now pins an older version: the entry is stale.
    let lock = d.path().join(".agents/compass.lock.json");
    let text = fs::read_to_string(&lock).unwrap().replacen(
        &format!("\"version\": \"{before}\""),
        "\"version\": \"0.9.0\"",
        1,
    );
    fs::write(&lock, text).unwrap();
    assert_eq!(state(d.path(), "skill:review"), SyncState::Stale);
    let a = upgrade(d.path(), None).unwrap();
    assert_eq!(a.version, before);
    assert_eq!(state(d.path(), "skill:review"), SyncState::Current);
    assert_eq!(read(d.path()).unwrap().unwrap().version, before);
}

#[test]
fn upgrade_with_nothing_stale_runs_nothing_and_a_current_selection_is_refused() {
    let d = project();
    apply(d.path(), &["skill:review".into()]).unwrap();
    assert!(upgrade(d.path(), None).unwrap().report.written.is_empty());
    assert!(
        upgrade(d.path(), Some(&["skill:review".into()]))
            .unwrap_err()
            .contains("already current")
    );
}

#[test]
fn a_selection_switches_on_only_the_selected_pack() {
    let d = project();
    upgrade(d.path(), Some(&["pack:e2e".into()])).unwrap();
    let held = shipyard_store::compass::held(d.path());
    assert!(held.contains(&"pack:e2e".to_string()));
    assert!(!held.contains(&"pack:env".to_string()));
}
