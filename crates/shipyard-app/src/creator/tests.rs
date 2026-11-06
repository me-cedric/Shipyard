use super::*;

fn answers(folder: &Path) -> NewProject {
    NewProject {
        name: "Demo App".into(),
        key: "DEMO".into(),
        folder: folder.to_string_lossy().into_owned(),
        stack: "rust".into(),
        brief: draft("Demo App", "rust", "fr"),
        docs_lang: "fr".into(),
        pulls_lang: "en".into(),
        members: vec![
            NewMember {
                name: "Ada Lovelace".into(),
                role: "architect".into(),
            },
            NewMember {
                name: "Bo".into(),
                role: "developer".into(),
            },
        ],
        remote: NewRemote::Local,
        tracker: None,
        tracker_scope: None,
    }
}

fn file<'a>(p: &'a CreatorPreview, path: &str) -> &'a str {
    &p.files.iter().find(|f| f.path == path).unwrap().content
}

#[test]
fn the_preview_holds_the_files_of_the_answers_and_writes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let a = answers(&dir.path().join("demo"));
    let p = preview(&a).unwrap();
    let project = file(&p, PROJECT_FILE);
    assert!(
        project.contains("cargo test") && project.contains("cargo clippy"),
        "{project}"
    );
    assert!(
        project.contains("languages:\n  docs: fr\n  pulls: en"),
        "{project}"
    );
    assert!(file(&p, ".gitignore").contains("target/"));
    assert!(file(&p, ".gitignore").contains(".DS_Store"));
    let brief = file(&p, "docs/brief.md");
    assert!(brief.contains("## Périmètre") && brief.contains("- Mettre en place le projet Rust"));
    let agents = file(&p, "AGENTS.md");
    assert!(agents.contains("docs in French") && agents.contains("comments in English"));
    assert!(agents.contains("`cargo test`, `cargo clippy`"));
    let team = file(&p, ".shipyard/team.yaml");
    assert!(
        team.contains("handle: ada-lovelace") && team.contains("role: developer"),
        "{team}"
    );
    assert_eq!(p.issues.len(), 4);
    assert_eq!(p.issues[0].reference, "est:starter-demo#s1");
    assert!(shipyard_core::refs::parse(&p.issues[0].reference).is_some());
    assert_eq!(p.starts, ["later"]);
    assert!(
        !dir.path().join("demo").exists(),
        "the preview writes nothing"
    );
}

#[test]
fn the_starts_follow_the_connections() {
    let dir = tempfile::tempdir().unwrap();
    let mut a = answers(dir.path());
    a.tracker = Some("jira".into());
    assert_eq!(preview(&a).unwrap().starts, ["issues", "later"]);
    a.remote = NewRemote::Create {
        forge: "gh".into(),
        slug: "acme/demo".into(),
    };
    let p = preview(&a).unwrap();
    assert_eq!(p.starts, ["run", "issues", "later"]);
    assert!(file(&p, PROJECT_FILE).contains("forge: gh"));
}

#[test]
fn bad_answers_are_refused() {
    let dir = tempfile::tempdir().unwrap();
    let ok = answers(&dir.path().join("demo"));
    type Change = Box<dyn Fn(&mut NewProject)>;
    let bad: Vec<Change> = vec![
        Box::new(|a| a.stack = "cobol".into()),
        Box::new(|a| a.key = "x y".into()),
        Box::new(|a| a.folder = "relative/demo".into()),
        Box::new(|a| a.docs_lang = "klingon".into()),
        Box::new(|a| a.members[1].role = "boss".into()),
        Box::new(|a| a.brief.scope = "x".repeat(MAX_TEXT + 1)),
        Box::new(|a| a.folder = "/no/such/parent/demo".into()),
        Box::new(|a| a.folder = format!("{}/../demo", a.folder)),
        Box::new(|a| {
            a.remote = NewRemote::Create {
                forge: "gh".into(),
                slug: "acme/..".into(),
            }
        }),
        Box::new(|a| {
            a.remote = NewRemote::Create {
                forge: "gh".into(),
                slug: "demo".into(),
            }
        }),
        Box::new(|a| {
            a.remote = NewRemote::Existing {
                url: "--upload-pack=x".into(),
                forge: None,
            }
        }),
    ];
    for (i, change) in bad.iter().enumerate() {
        let mut a = ok.clone();
        change(&mut a);
        assert!(preview(&a).is_err(), "case {i}");
    }
}

#[test]
fn the_handles_stay_unique() {
    let t = team_of(&[
        NewMember {
            name: "Bo".into(),
            role: "qa".into(),
        },
        NewMember {
            name: "bo".into(),
            role: "qa".into(),
        },
        NewMember {
            name: "李".into(),
            role: "qa".into(),
        },
    ]);
    let h: Vec<_> = t.members.iter().map(|m| m.handle.as_str()).collect();
    assert_eq!(h, ["bo", "bo-2", "member-3"]);
    assert!(t.check().is_ok());
}

fn git(dir: &Path, args: &[&str]) {
    assert!(
        std::process::Command::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .unwrap()
            .success()
    );
}

#[test]
fn create_needs_a_click_an_empty_folder_and_pushes_to_an_existing_remote() {
    let dir = tempfile::tempdir().unwrap();
    let s = AppState::new(dir.path().join("data"));
    let bare = dir.path().join("remote.git");
    std::fs::create_dir(&bare).unwrap();
    git(&bare, &["init", "--bare", "-q"]);
    let folder = dir.path().join("demo");
    let mut a = answers(&folder);
    a.remote = NewRemote::Existing {
        url: bare.to_string_lossy().into_owned(),
        forge: None,
    };
    assert!(create(&s, &a, false).unwrap_err().contains("click"));
    assert!(!folder.exists());

    let r = create(&s, &a, true).unwrap();
    assert_eq!(
        r.outcome.status,
        OpenStatus::Opened,
        "{:?}",
        r.outcome.message
    );
    assert_eq!(r.warning, None);
    assert!(r.remote.is_some());
    for f in [
        "docs/brief.md",
        "AGENTS.md",
        "README.md",
        ".shipyard/team.yaml",
    ] {
        assert!(folder.join(f).is_file(), "{f}");
    }
    let st = Repo::open(&folder).unwrap().status().unwrap();
    assert!(st.head.is_some() && st.untracked.is_empty(), "{st:?}");
    // The first commit reached the remote.
    let out = std::process::Command::new("git")
        .args(["rev-list", "--all", "--count"])
        .current_dir(&bare)
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "1");

    let again = create(&s, &a, true).unwrap();
    assert_eq!(again.outcome.status, OpenStatus::FolderNotEmpty);
}

#[test]
fn a_failed_push_leaves_the_project_open_with_the_reason() {
    let dir = tempfile::tempdir().unwrap();
    let s = AppState::new(dir.path().join("data"));
    let folder = dir.path().join("demo");
    let mut a = answers(&folder);
    a.remote = NewRemote::Existing {
        url: dir
            .path()
            .join("missing.git")
            .to_string_lossy()
            .into_owned(),
        forge: None,
    };
    let r = create(&s, &a, true).unwrap();
    assert_eq!(r.outcome.status, OpenStatus::Opened);
    assert!(r.warning.is_some());
    assert!(
        Repo::open(&folder)
            .unwrap()
            .status()
            .unwrap()
            .head
            .is_some()
    );
}

#[test]
fn the_bootstrap_run_needs_a_click_and_a_code_host() {
    let dir = tempfile::tempdir().unwrap();
    let s = AppState::new(dir.path().join("data"));
    assert!(bootstrap(&s, false).unwrap_err().contains("click"));
    create(&s, &answers(&dir.path().join("demo")), true).unwrap();
    assert!(bootstrap(&s, true).unwrap_err().contains("code host"));
}

#[test]
fn the_draft_follows_the_docs_language() {
    assert!(
        draft("X", "go", "en")
            .scope
            .starts_with("Set up the Go project")
    );
    assert!(
        draft("X", "other", "de")
            .scope
            .starts_with("Set up the project")
    );
    assert!(draft("X", "node", "fr").vision.starts_with("X aide"));
}
