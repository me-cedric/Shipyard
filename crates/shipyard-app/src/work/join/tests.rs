//! Ask to join (`team-rights` REQ-011) over a fake code host and a local bare remote.

use std::path::Path;
use std::process::Command;
use std::sync::Arc;

use shipyard_http::fake::FakeHttp;
use shipyard_secrets::{MemoryStore, Secret};

use shipyard_core::project::ProjectConnections;
use shipyard_store::project::{FileRead, read_project_file, write_project_file};

use super::*;
use crate::commands::projects;
use crate::connections::{ConnectionDraft, ConnectionGroup, ConnectionKind, Connections};

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

struct Fx {
    dir: tempfile::TempDir,
    s: AppState,
    root: PathBuf,
    http: Arc<FakeHttp>,
}

/// A project whose team file names `ana` only, a GitLab code host connection and, with `remote`,
/// an `origin` in a local bare folder.
fn fx(remote: bool) -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("p");
    shipyard_git::project::init(&root).unwrap();
    git(&root, &["config", "user.email", "zed@example.com"]);
    git(&root, &["config", "user.name", "Zed"]);
    let ana = Member {
        name: "Ana".into(),
        handle: "ana".into(),
        emails: vec!["ana@example.com".into()],
        role: "techlead".into(),
        admin: true,
        capacity: 5.0,
        ..Member::default()
    };
    std::fs::create_dir_all(root.join(".shipyard")).unwrap();
    let team = Team {
        members: vec![ana],
        locked: false,
    };
    std::fs::write(root.join(TEAM_PATH), write_team(&team, None).unwrap()).unwrap();
    git(&root, &["add", TEAM_PATH]);
    git(&root, &["commit", "-q", "-m", "team"]);
    if remote {
        // A `file://` origin: the push goes to a bare folder, and its path is a GitLab slug.
        let bare = dir.path().join("acme/web.git");
        git(
            dir.path(),
            &["init", "-q", "--bare", bare.to_str().unwrap()],
        );
        let url = format!("file://{}", bare.to_str().unwrap());
        git(&root, &["remote", "add", "origin", &url]);
        git(&root, &["push", "-q", "origin", "HEAD:refs/heads/main"]);
        git(&root, &["fetch", "-q", "origin"]);
    }
    let http = Arc::new(FakeHttp::new());
    let conns = Arc::new(Connections::new(
        dir.path(),
        Arc::new(MemoryStore::default()),
        http.clone(),
    ));
    let c = conns
        .add(ConnectionDraft {
            name: "Code".into(),
            group: ConnectionGroup::Forge,
            kind: ConnectionKind::GitLab,
            url: "https://gitlab.com".into(),
            user: None,
        })
        .unwrap();
    conns
        .set_secret(&c.id, Secret::new("tok-join-fake")) // shipyard:allow-secret
        .unwrap();
    let s = AppState::with_connections(dir.path().join("data"), conns);
    projects::open(&s, root.to_str().unwrap()).unwrap();
    let FileRead::Valid(mut file) = read_project_file(&root).unwrap() else {
        panic!("a valid file")
    };
    file.connections = Some(ProjectConnections {
        tracker: None,
        forge: Some(c.id.clone()),
        tracker_scope: None,
    });
    write_project_file(&root, &file).unwrap();
    Fx { dir, s, root, http }
}

fn ask(role: &str) -> JoinAsk {
    JoinAsk {
        name: "Zed Nobody".into(),
        emails: vec![" Zed@Example.com ".into()],
        accounts: Vec::new(),
        role: role.into(),
    }
}

fn head(root: &Path) -> String {
    let out = Command::new("git")
        .current_dir(root)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout).trim().into()
}

#[test]
fn a_join_request_pushes_a_viewer_entry_and_opens_a_pull_request_that_names_the_asked_role() {
    let f = fx(true);
    f.http.post(
        "/merge_requests",
        "shipyard/join-zed",
        201,
        include_str!("../../../../shipyard-forges/tests/fixtures/gitlab/mr.json"),
    );
    let before = head(&f.root);
    let sent = team_join(&f.s, ask("qa"), true).unwrap();
    assert_eq!(sent.branch, "shipyard/join-zed");
    assert_eq!(
        sent.url.as_deref(),
        Some("https://gitlab.com/acme/web/-/merge_requests/7")
    );
    assert!(sent.push.is_none());
    // The working copy stays on its branch.
    assert_eq!(head(&f.root), before);
    let out = Command::new("git")
        .current_dir(f.dir.path().join("acme/web.git"))
        .args(["show", &format!("shipyard/join-zed:{TEAM_PATH}")])
        .output()
        .unwrap();
    let text = String::from_utf8(out.stdout).unwrap();
    let team = read_team(&text, None).unwrap();
    let zed = team.resolve("zed").unwrap();
    assert_eq!((zed.role.as_str(), zed.admin), ("viewer", false));
    assert_eq!(zed.emails, ["zed@example.com"]);
    assert!(team.resolve("ana").is_some());
    let post = f
        .http
        .requests()
        .into_iter()
        .find(|r| r.url.ends_with("/merge_requests"))
        .unwrap();
    let body = post.body.unwrap();
    assert!(
        body["description"]
            .as_str()
            .unwrap()
            .contains("Asked role: `qa`")
    );
    assert_eq!(body["target_branch"], "main");
    let lines = crate::rights::audit_lines(&f.s).unwrap();
    assert!(
        lines
            .iter()
            .any(|l| l.what == "team_join" && l.result == "requested")
    );
}

#[test]
fn without_a_remote_the_branch_stays_local_and_the_entry_is_returned() {
    let f = fx(false);
    let sent = team_join(&f.s, ask("developer"), true).unwrap();
    assert!(sent.url.is_none() && sent.push.is_none());
    assert!(sent.entry.contains("role: viewer"), "{}", sent.entry);
    let repo = Repo::open(&f.root).unwrap();
    let text = repo.text_at(&sent.branch, TEAM_PATH).unwrap().unwrap();
    assert!(read_team(&text, None).unwrap().resolve("zed").is_some());
    assert!(f.http.requests().is_empty());
}

#[test]
fn a_join_request_needs_a_click_a_known_role_and_a_person_out_of_the_team() {
    let f = fx(false);
    assert!(team_join(&f.s, ask("qa"), false).is_err());
    assert!(
        team_join(&f.s, ask("boss"), true)
            .unwrap_err()
            .contains("boss")
    );
    let mut bad = ask("qa");
    bad.emails = vec!["nobody".into()];
    assert!(team_join(&f.s, bad, true).is_err());
    let mut ana = ask("qa");
    ana.emails = vec!["ana@example.com".into()];
    git(&f.root, &["config", "user.email", "ana@example.com"]);
    assert!(team_join(&f.s, ana, true).unwrap_err().contains("already"));
}
