//! The compass reader: tree, lock, patterns and the stack mark (spec `extensions`, REQ-001,
//! REQ-002, REQ-004).

use std::fs;
use std::path::Path;

use shipyard_core::extensions::{Kind, SyncState};
use shipyard_store::compass::{detect_stacks, preview, read, tree_of};

fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

/// A project with a pinned tree of version 1.0.2 and a lock at `pinned`.
fn project(pinned: &str) -> tempfile::TempDir {
    let d = tempfile::tempdir().unwrap();
    let r = d.path();
    let t = "docs/agent-compass";
    put(r, &format!("{t}/bin/ac.mjs"), "");
    put(r, &format!("{t}/package.json"), r#"{"version":"1.0.2"}"#);
    put(
        r,
        &format!("{t}/skills/review/SKILL.md"),
        "---\nname: review\nrisk_level: medium\nwrites_files: false\n---\ntext",
    );
    put(
        r,
        &format!("{t}/skills/ui-conformance/SKILL.md"),
        "---\nrisk_level: low\nwrites_files: true\n---\n",
    );
    put(
        r,
        &format!("{t}/skills/debug/SKILL.md"),
        "---\nrisk_level: low\n---\n",
    );
    put(r, &format!("{t}/packs/e2e/skills/x/SKILL.md"), "x");
    put(r, &format!("{t}/docs/guide/ui.md"), "guide");
    put(r, &format!("{t}/core/blocks/AGENTS.md"), "block");
    put(r, ".agents/compass.json", r#"{"packs":["e2e"]}"#);
    put(r, ".agents/instincts/small-steps.md", "i");
    put(
        r,
        ".agents/compass.lock.json",
        &format!(
            r#"{{"version":"{pinned}","skills":["review","ui-conformance"],"blocks":{{"AGENTS.md":"x"}}}}"#
        ),
    );
    put(r, "package.json", r#"{"dependencies":{"react":"19"}}"#);
    d
}

#[test]
fn reads_five_kinds_with_risk_write_and_state() {
    let d = project("1.0.2");
    let c = read(d.path()).unwrap().unwrap();
    assert_eq!(
        (c.version.as_str(), c.pinned.as_deref()),
        ("1.0.2", Some("1.0.2"))
    );
    let find = |k: Kind, id: &str| {
        c.entries
            .iter()
            .find(|e| e.kind == k && e.id == id)
            .unwrap()
    };
    let review = find(Kind::Skill, "review");
    assert_eq!(
        (review.risk.as_deref(), review.writes, review.state),
        (Some("medium"), false, SyncState::Current)
    );
    assert!(find(Kind::Skill, "ui-conformance").writes);
    assert_eq!(find(Kind::Skill, "debug").state, SyncState::Absent);
    assert_eq!(find(Kind::Pack, "e2e").state, SyncState::Current);
    assert_eq!(find(Kind::Guide, "ui").state, SyncState::Current);
    assert_eq!(find(Kind::Pattern, "small-steps").state, SyncState::Current);
    assert_eq!(find(Kind::Contract, "contract").state, SyncState::Current);
}

#[test]
fn a_lock_from_an_older_version_is_stale_with_both_versions() {
    let d = project("1.0.1");
    let c = read(d.path()).unwrap().unwrap();
    let e = c.entries.iter().find(|e| e.id == "review").unwrap();
    assert_eq!(
        (e.state, e.pinned.as_deref(), e.expected.as_str()),
        (SyncState::Stale, Some("1.0.1"), "1.0.2")
    );
}

#[test]
fn the_state_is_the_same_after_a_clone() {
    // The state reads only files that git holds: a copy of the tree gives the same entries.
    let d = project("1.0.2");
    let copy = tempfile::tempdir().unwrap();
    let mut stack = vec![d.path().to_path_buf()];
    while let Some(dir) = stack.pop() {
        for e in fs::read_dir(&dir).unwrap().flatten() {
            let rel = e.path().strip_prefix(d.path()).unwrap().to_path_buf();
            if e.path().is_dir() {
                stack.push(e.path());
            } else {
                put(
                    copy.path(),
                    &rel.to_string_lossy(),
                    &fs::read_to_string(e.path()).unwrap(),
                );
            }
        }
    }
    assert_eq!(
        read(d.path()).unwrap().unwrap().entries,
        read(copy.path()).unwrap().unwrap().entries
    );
}

#[test]
fn the_stack_marks_the_suited_skills() {
    let d = project("1.0.2");
    assert_eq!(detect_stacks(d.path()), ["react-web"]);
    let c = read(d.path()).unwrap().unwrap();
    let suits: Vec<_> = c
        .entries
        .iter()
        .filter(|e| e.suits)
        .map(|e| e.id.as_str())
        .collect();
    assert_eq!(suits, ["ui-conformance"]);
}

#[test]
fn no_pin_gives_none_and_a_submodule_path_is_found() {
    let d = tempfile::tempdir().unwrap();
    assert!(read(d.path()).unwrap().is_none());
    put(d.path(), "vendor/ac/bin/ac.mjs", "");
    put(
        d.path(),
        ".gitmodules",
        "[submodule \"x\"]\n\tpath = vendor/ac\n\turl = https://github.com/me-cedric/agent-compass.git\n",
    );
    assert_eq!(tree_of(d.path()).as_deref(), Some("vendor/ac"));
}

#[test]
fn preview_returns_text_and_refuses_a_bad_id() {
    let d = project("1.0.2");
    assert!(
        preview(d.path(), Kind::Skill, "review")
            .unwrap()
            .contains("text")
    );
    assert!(
        preview(d.path(), Kind::Pack, "e2e")
            .unwrap()
            .contains("skills/x/SKILL.md")
    );
    assert!(preview(d.path(), Kind::Skill, "../x").is_err());
}
