//! Legacy import tests (spec `projects`, REQ-014, REQ-015). The fixtures follow the Legacy types
//! `TeamDoc`, `CostingDoc`, `TicketsConfig` and `PersonasDoc`.

use shipyard_core::project::ProjectConnections;
use shipyard_store::project_import::import;
use shipyard_store::project::{FileRead, read_project_file};
use shipyard_store::work::{read_sheet, read_team};
use std::fs;
use std::path::Path;

fn fixture() -> &'static Path {
    Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/legacy"
    ))
}

fn tree(root: &Path) -> Vec<(String, Vec<u8>)> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<(String, Vec<u8>)>) {
        for e in fs::read_dir(dir).unwrap().flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(base, &p, out);
            } else {
                let rel = p.strip_prefix(base).unwrap().to_string_lossy().into_owned();
                out.push((rel, fs::read(&p).unwrap()));
            }
        }
    }
    let mut out = Vec::new();
    walk(root, root, &mut out);
    out.sort();
    out
}

#[test]
fn it_writes_the_shipyard_files_and_leaves_the_source_intact() {
    let before = tree(fixture());
    let root = tempfile::tempdir().unwrap();
    let r = import(fixture(), root.path());

    for p in [
        ".shipyard/project.yaml",
        ".shipyard/team.yaml",
        "docs/costing/mvp.yaml",
        "docs/delivery/questions/Q-001.md",
        "docs/decisions/0001-postgres.md",
        "docs/openspec/changes/demo/proposal.md",
    ] {
        assert!(r.copied.contains(&p.to_string()), "{p} not copied: {r:?}");
    }
    assert!(r.conflicts.is_empty());
    assert_eq!(
        fs::read(root.path().join("docs/decisions/0001-postgres.md")).unwrap(),
        fs::read(fixture().join("docs/decisions/0001-postgres.md")).unwrap()
    );
    assert_eq!(tree(fixture()), before);
}

#[test]
fn the_project_file_takes_the_name_and_the_jira_key() {
    let root = tempfile::tempdir().unwrap();
    import(fixture(), root.path());
    let FileRead::Valid(f) = read_project_file(root.path()).unwrap() else {
        panic!("the project file is not valid");
    };
    assert_eq!((f.name.as_str(), f.key.as_str()), ("legacy", "DEMO"));
    assert_eq!(
        f.connections,
        Some(ProjectConnections {
            tracker_scope: Some("DEMO".into()),
            ..Default::default()
        })
    );
}

#[test]
fn the_team_maps_roles_windows_and_unique_handles() {
    let root = tempfile::tempdir().unwrap();
    import(fixture(), root.path());
    let team = read_team(
        &fs::read_to_string(root.path().join(".shipyard/team.yaml")).unwrap(),
        None,
    )
    .unwrap();
    let (a, b) = (&team.members[0], &team.members[1]);
    assert_eq!(
        (a.handle.as_str(), b.handle.as_str()),
        ("ana-diaz", "ana-diaz-2")
    );
    assert_eq!(a.role, "dev");
    assert_eq!(a.trackers, ["ana@example.com"]);
    assert_eq!(a.capacity, 4.0);
    assert_eq!(a.availability.from.as_deref(), Some("2026-10-01"));
    assert_eq!(a.availability.until.as_deref(), Some("2027-03-31"));
    assert_eq!(a.availability.absences.len(), 1);
    assert_eq!((a.day_rate, b.day_rate), (None, Some(550.0)));
    assert_eq!(b.role, "p-gone");
}

#[test]
fn a_sheet_maps_days_and_ratio_and_a_broken_sheet_is_skipped() {
    let root = tempfile::tempdir().unwrap();
    let r = import(fixture(), root.path());
    let sheet = read_sheet(
        &fs::read_to_string(root.path().join("docs/costing/mvp.yaml")).unwrap(),
        None,
    )
    .unwrap();
    assert_eq!(
        (
            sheet.name.as_str(),
            sheet.currency.as_str(),
            sheet.margin_rate
        ),
        ("MVP 1", "CHF", 0.15)
    );
    let tasks = &sheet.features[0].tasks;
    assert_eq!((tasks[0].days, tasks[0].role.as_str()), (Some(4.0), "dev"));
    assert_eq!((tasks[1].percent, tasks[1].other), (Some(10.0), true));
    assert!(
        r.skipped
            .iter()
            .any(|(p, _)| p == "docs/costing/broken.json")
    );
    assert!(!root.path().join("docs/costing/broken.yaml").exists());
}

#[test]
fn an_existing_file_is_a_conflict_and_stays_unchanged() {
    let root = tempfile::tempdir().unwrap();
    let q = root.path().join("docs/delivery/questions/Q-001.md");
    fs::create_dir_all(q.parent().unwrap()).unwrap();
    fs::write(&q, "mine").unwrap();
    let r = import(fixture(), root.path());
    assert_eq!(r.conflicts, ["docs/delivery/questions/Q-001.md"]);
    assert_eq!(fs::read_to_string(&q).unwrap(), "mine");
    // A second run copies nothing new.
    let again = import(fixture(), root.path());
    assert!(again.copied.is_empty());
    assert!(again.conflicts.len() > 1);
}

#[test]
fn a_folder_with_no_legacy_file_gives_an_empty_report() {
    let src = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let r = import(src.path(), root.path());
    assert!(r.copied.is_empty() && r.skipped.is_empty() && r.conflicts.is_empty());
    assert!(tree(root.path()).is_empty());
}

#[cfg(unix)]
#[test]
fn a_symlink_in_the_source_is_skipped_not_followed() {
    let src = tempfile::tempdir().unwrap();
    fs::create_dir_all(src.path().join("docs/decisions")).unwrap();
    std::os::unix::fs::symlink("/etc/hosts", src.path().join("docs/decisions/0001-x.md")).unwrap();
    let root = tempfile::tempdir().unwrap();
    let r = import(src.path(), root.path());
    assert_eq!(
        r.skipped,
        [(
            "docs/decisions/0001-x.md".to_string(),
            "not a regular file".to_string()
        )]
    );
    assert!(!root.path().join("docs/decisions/0001-x.md").exists());
}
