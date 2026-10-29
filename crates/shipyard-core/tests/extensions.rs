//! Entry states, the no-overwrite plan and the child progress (spec `extensions`, REQ-003,
//! REQ-004, REQ-010, REQ-015).

use shipyard_core::extensions::{
    Entry, Kind, SyncState, current_keys, plan_write, progress, proposed, safe_rel, sync_state,
};

fn entry(id: &str, state: SyncState) -> Entry {
    Entry {
        kind: Kind::Skill,
        id: id.into(),
        title: id.into(),
        risk: None,
        writes: false,
        suits: false,
        state,
        pinned: None,
        expected: "1.0.2".into(),
    }
}

#[test]
fn state_is_absent_stale_or_current() {
    assert_eq!(sync_state(false, Some("1.0.2"), "1.0.2"), SyncState::Absent);
    assert_eq!(sync_state(true, Some("1.0.1"), "1.0.2"), SyncState::Stale);
    assert_eq!(sync_state(true, None, "1.0.2"), SyncState::Stale);
    assert_eq!(sync_state(true, Some("1.0.2"), "1.0.2"), SyncState::Current);
}

#[test]
fn an_existing_file_is_kept_and_a_new_one_is_written() {
    let r = plan_write(["a.md", "b.md", "a.md"], |p| p == "b.md").unwrap();
    assert_eq!(r.written, ["a.md"]);
    assert_eq!(r.kept, ["b.md"]);
}

#[test]
fn a_path_outside_the_root_refuses_the_whole_write() {
    for bad in ["../x", "/x", "a/../../x", "a\\b", "C:/x", "", "a//b"] {
        assert!(!safe_rel(bad), "{bad}");
        let e = plan_write(["ok.md", bad], |_| false).unwrap_err();
        assert!(e.contains(bad), "{e}");
    }
}

#[test]
fn a_child_shows_n_of_m_and_gets_only_current_parent_entries() {
    let parent = current_keys(&[
        entry("a", SyncState::Current),
        entry("b", SyncState::Current),
        entry("c", SyncState::Stale),
    ]);
    let has = ["skill:a".to_string(), "skill:c".to_string()];
    assert_eq!(progress(&parent, &has), (1, 2));
    assert_eq!(proposed(&parent, &has), ["skill:b"]);
}
