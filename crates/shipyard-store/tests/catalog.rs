//! The catalog and the deploy (spec `extensions`, REQ-009, REQ-010, REQ-017).

use std::fs;
use std::path::Path;

use shipyard_core::extensions::SyncState;
use shipyard_store::catalog::{GUIDANCE, Group, deploy, list, preview, write_new};

fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn project() -> tempfile::TempDir {
    let d = tempfile::tempdir().unwrap();
    let r = d.path();
    let t = "docs/agent-compass";
    put(r, &format!("{t}/bin/ac.mjs"), "");
    put(r, &format!("{t}/package.json"), r#"{"version":"1.0.2"}"#);
    put(
        r,
        &format!("{t}/catalog/devcontainers/node/.devcontainer/devcontainer.json"),
        "{}",
    );
    put(r, &format!("{t}/catalog/devops-security/scan/ci.yml"), "ci");
    d
}

#[test]
fn lists_the_three_groups_with_a_state_each() {
    let d = project();
    let all = list(d.path()).unwrap();
    let group = |g: Group| all.iter().filter(|c| c.group == g).count();
    assert_eq!(
        (
            group(Group::Devcontainers),
            group(Group::Agents),
            group(Group::DevopsSecurity)
        ),
        (1, 1, 1)
    );
    let node = all.iter().find(|c| c.id == "devcontainers/node").unwrap();
    assert_eq!(node.files, [".devcontainer/devcontainer.json"]);
    assert!(all.iter().all(|c| c.state == SyncState::Absent));
}

#[test]
fn preview_writes_nothing_and_deploy_writes_only_the_listed_files() {
    let d = project();
    let r = d.path();
    let p = preview(r, "devcontainers/node").unwrap();
    assert_eq!(p.written, [".devcontainer/devcontainer.json"]);
    assert!(!r.join(".devcontainer").exists());
    let done = deploy(r, "devcontainers/node").unwrap();
    assert_eq!(done, p);
    assert_eq!(
        fs::read_to_string(r.join(".devcontainer/devcontainer.json")).unwrap(),
        "{}"
    );
    let node = list(r)
        .unwrap()
        .into_iter()
        .find(|c| c.id == "devcontainers/node")
        .unwrap();
    assert_eq!(node.state, SyncState::Current);
}

#[test]
fn a_new_compass_version_makes_a_deployed_component_stale() {
    let d = project();
    deploy(d.path(), "devcontainers/node").unwrap();
    put(
        d.path(),
        "docs/agent-compass/package.json",
        r#"{"version":"1.1.0"}"#,
    );
    let node = list(d.path())
        .unwrap()
        .into_iter()
        .find(|c| c.id == "devcontainers/node")
        .unwrap();
    assert_eq!(node.state, SyncState::Stale);
}

#[test]
fn an_existing_file_is_kept_and_named() {
    let d = project();
    put(d.path(), "AGENTS.md", "mine");
    let r = deploy(d.path(), GUIDANCE).unwrap();
    assert_eq!(r.kept, ["AGENTS.md"]);
    assert_eq!(
        fs::read_to_string(d.path().join("AGENTS.md")).unwrap(),
        "mine"
    );
    assert!(d.path().join("docs/openspec/specs/.gitkeep").exists());
}

#[test]
fn an_unknown_component_and_a_bad_path_are_refused() {
    let d = project();
    assert!(deploy(d.path(), "devcontainers/../x").is_err());
    assert!(deploy(d.path(), "other/x").is_err());
    let e = write_new(d.path(), &[("../out.txt".into(), vec![1])]).unwrap_err();
    assert!(e.to_string().contains("../out.txt"));
    assert!(!d.path().parent().unwrap().join("out.txt").exists());
}

#[cfg(unix)]
#[test]
fn a_link_that_leaves_the_root_is_refused() {
    let d = project();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), d.path().join("link")).unwrap();
    assert!(write_new(d.path(), &[("link/x.txt".into(), vec![1])]).is_err());
    assert!(!outside.path().join("x.txt").exists());
}

#[cfg(unix)]
#[test]
fn a_linked_folder_gets_no_new_folder_outside_the_root() {
    let d = project();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), d.path().join("link")).unwrap();
    assert!(write_new(d.path(), &[("link/sub/x.txt".into(), vec![1])]).is_err());
    assert!(!outside.path().join("sub").exists());
}
