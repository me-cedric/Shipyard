//! Codec, registry and preferences tests (spec `projects`, REQ-007 to REQ-010, REQ-019).

use shipyard_core::project::ProjectFile;
use shipyard_store::prefs::{Prefs, PrefsPatch, Theme};
use shipyard_store::project::{
    Accent, FileRead, Overrides, Registry, parse_project_file, read_project_file,
    write_project_file,
};

#[test]
fn the_project_file_round_trips_without_a_machine_path() {
    let dir = tempfile::tempdir().unwrap();
    let mut f = ProjectFile::new("Shipyard", "SHIP");
    f.gates = vec!["cargo test".into()];
    write_project_file(dir.path(), &f).unwrap();
    let text = std::fs::read_to_string(dir.path().join(".shipyard/project.yaml")).unwrap();
    assert!(
        !text.contains(dir.path().to_str().unwrap()),
        "no machine path"
    );
    assert!(!text.contains("null") && !text.contains("accent"));
    let FileRead::Valid(back) = read_project_file(dir.path()).unwrap() else {
        panic!("valid")
    };
    assert_eq!(back, f);
}

#[test]
fn a_missing_file_is_missing_and_a_bad_value_shows_its_line() {
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(
        read_project_file(dir.path()).unwrap(),
        FileRead::Missing
    ));
    let issues = parse_project_file("name: X\nkey: ship\n").unwrap_err();
    assert_eq!(issues, [(Some(2), "ship".to_string())]);
    let issues = parse_project_file("name: X\nkey: SHIP\ntheme: dark\n").unwrap_err();
    assert_eq!(
        issues[0].0,
        Some(3),
        "a personal preference is not allowed in the file"
    );
    let issues = parse_project_file("name: [\n").unwrap_err();
    assert!(issues[0].0.is_some());
}

#[test]
fn write_refuses_an_invalid_file() {
    let dir = tempfile::tempdir().unwrap();
    assert!(write_project_file(dir.path(), &ProjectFile::new("X", "bad")).is_err());
    assert!(!dir.path().join(".shipyard").exists());
}

#[test]
fn the_registry_keeps_path_last_use_view_and_overrides() {
    let data = tempfile::tempdir().unwrap();
    let mut reg = Registry::load(data.path()).unwrap();
    assert!(reg.projects().is_empty() && reg.active().is_none());
    let a = reg
        .register("/work/a", &ProjectFile::new("Alpha", "ALPHA"))
        .id
        .clone();
    let b = reg
        .register("/work/b", &ProjectFile::new("Beta", "BETA"))
        .id
        .clone();
    assert_eq!((a.as_str(), b.as_str()), ("alpha", "beta"));
    assert!(reg.activate("beta"));
    reg.set_view("beta", "/work/board");
    reg.set_overrides(
        "beta",
        Overrides {
            theme: Some(Theme::Dark),
            accent: Some(Accent::Violet),
            ..Default::default()
        },
    );
    reg.save().unwrap();

    let reg = Registry::load(data.path()).unwrap();
    let beta = reg.active().unwrap();
    assert_eq!(
        (
            beta.id.as_str(),
            beta.path.as_str(),
            beta.last_view.as_deref()
        ),
        ("beta", "/work/b", Some("/work/board"))
    );
    assert_eq!(beta.overrides.accent, Some(Accent::Violet));
    assert!(beta.last_used > 0);
}

#[test]
fn registering_a_known_path_updates_it_and_a_taken_id_gets_a_suffix() {
    let data = tempfile::tempdir().unwrap();
    let mut reg = Registry::load(data.path()).unwrap();
    reg.register("/work/a", &ProjectFile::new("Alpha", "ALPHA"));
    reg.register("/work/a", &ProjectFile::new("Alpha 2", "ALPHA"));
    assert_eq!(reg.projects().len(), 1);
    assert_eq!(reg.projects()[0].name, "Alpha 2");
    assert_eq!(
        reg.register("/work/other", &ProjectFile::new("Alpha", "ALPHA"))
            .id,
        "alpha-2"
    );
}

#[test]
fn a_corrupt_registry_is_an_error_and_stays_on_disk() {
    let data = tempfile::tempdir().unwrap();
    std::fs::write(data.path().join("registry.json"), "{ nope").unwrap();
    assert!(Registry::load(data.path()).is_err());
    assert_eq!(
        std::fs::read_to_string(data.path().join("registry.json")).unwrap(),
        "{ nope"
    );
}

#[test]
fn preferences_merge_a_patch_and_survive_a_corrupt_file() {
    let data = tempfile::tempdir().unwrap();
    let mut p = Prefs::load(data.path());
    assert_eq!(p, Prefs::default());
    p.apply(PrefsPatch {
        theme: Some(Theme::Dark),
        sidebar_open: Some(false),
        ..Default::default()
    });
    p.save(data.path()).unwrap();
    let back = Prefs::load(data.path());
    assert_eq!((back.theme, back.sidebar_open), (Theme::Dark, false));
    std::fs::write(data.path().join("prefs.json"), "garbage").unwrap();
    assert_eq!(Prefs::load(data.path()), Prefs::default());
}

#[test]
fn the_connection_ids_round_trip_and_unset_ones_stay_out_of_the_file() {
    use shipyard_core::project::ProjectConnections;
    let dir = tempfile::tempdir().unwrap();
    let mut f = ProjectFile::new("Acme", "ACME");
    f.connections = Some(ProjectConnections {
        tracker: Some("acme-linear".into()),
        forge: None,
    });
    write_project_file(dir.path(), &f).unwrap();
    let text = std::fs::read_to_string(dir.path().join(".shipyard/project.yaml")).unwrap();
    assert!(text.contains("connections:") && text.contains("tracker: acme-linear"));
    assert!(!text.contains("forge"), "{text}");
    let FileRead::Valid(back) = read_project_file(dir.path()).unwrap() else {
        panic!("valid")
    };
    assert_eq!(back, f);
    // A file without the key still reads.
    let plain = ProjectFile::new("Acme", "ACME");
    write_project_file(dir.path(), &plain).unwrap();
    let text = std::fs::read_to_string(dir.path().join(".shipyard/project.yaml")).unwrap();
    assert!(!text.contains("connections"));
}
