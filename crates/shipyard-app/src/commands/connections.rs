//! Connections: list, add, edit, remove, the secret, the test and the repository list.
//! The logic is in `crate::connections`. A command only runs it on a blocking thread.

use serde::Serialize;
use shipyard_forges::Repository;
use shipyard_http::TestOutcome;
use shipyard_secrets::Secret;
use shipyard_store::project::{FileRead, read_project_file};
use specta::Type;
use tauri::AppHandle;

use super::{Api, AppState, Res, blocking};
use crate::connections::{Connection, ConnectionDraft, ConnectionState, RepoPage};

/// A registered project whose `.shipyard/project.yaml` names a connection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ConnectionUser {
    pub id: String,
    pub name: String,
    pub key: String,
}

/// The projects of the registry, not only the active one, that pick the connection `id` as their
/// tracker or forge. A folder that is gone or has no valid file names nothing.
pub fn users(s: &AppState, id: &str) -> Res<Vec<ConnectionUser>> {
    let roots: Vec<_> = s
        .registry()?
        .projects()
        .iter()
        .map(|e| (e.id.clone(), e.path.clone()))
        .collect();
    Ok(roots
        .into_iter()
        .filter_map(
            |(project, path)| match read_project_file(std::path::Path::new(&path)) {
                Ok(FileRead::Valid(f))
                    if f.connections.as_ref().is_some_and(|c| {
                        c.tracker.as_deref() == Some(id) || c.forge.as_deref() == Some(id)
                    }) =>
                {
                    Some(ConnectionUser {
                        id: project,
                        name: f.name,
                        key: f.key,
                    })
                }
                _ => None,
            },
        )
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn connections_users(app: AppHandle, id: String) -> Api<Vec<ConnectionUser>> {
    blocking(app, move |s| users(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_list(app: AppHandle) -> Api<Vec<Connection>> {
    blocking(app, |s| s.connections.list()).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_add(app: AppHandle, draft: ConnectionDraft) -> Api<Connection> {
    blocking(app, move |s| {
        let added = s.connections.add(draft)?;
        // The connection exists: a link that fails (a read only profile) must not hide it.
        let _ = super::setup::auto_link(s);
        Ok(added)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_edit(
    app: AppHandle,
    id: String,
    draft: ConnectionDraft,
) -> Api<Connection> {
    blocking(app, move |s| s.connections.edit(&id, draft)).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_remove(app: AppHandle, id: String) -> Api<()> {
    blocking(app, move |s| {
        s.connections.remove(&id)?;
        // The GitLab tools of this connection go with it. A connection with none is no error.
        let _ = s.agents.mcp_remove(&crate::mcp_tools::gitlab_mcp_id(&id));
        Ok(())
    })
    .await
}

/// Write-only: the secret goes to the keychain and no command returns it.
#[tauri::command]
#[specta::specta]
pub async fn connections_set_secret(app: AppHandle, id: String, secret: String) -> Api<Connection> {
    blocking(app, move |s| {
        let saved = s.connections.set_secret(&id, Secret::new(secret))?;
        let _ = super::sync::recover(s, &[id.as_str()]);
        Ok(saved)
    })
    .await
}

/// A test passed. After a new secret (`fresh`: the connection did not pass before), the other role
/// of the same host gets the secret and its own test. A later test of a connection that passed
/// does not bring back a twin that a person removed. The active project links its connections, and
/// the sync forgets the failures of the old secret.
pub(crate) fn passed(s: &AppState, id: &str, fresh: bool) -> Option<std::thread::JoinHandle<()>> {
    let twin = fresh
        .then(|| s.connections.serve_twin(id).ok().flatten())
        .flatten();
    if let Some(t) = &twin {
        let _ = s.connections.test(&t.id);
    }
    let _ = super::setup::auto_link(s);
    super::sync::recover(s, &[id, twin.as_ref().map_or(id, |t| t.id.as_str())])
}

#[tauri::command]
#[specta::specta]
pub async fn connections_test(app: AppHandle, id: String) -> Api<TestOutcome> {
    blocking(app, move |s| {
        let before = s.connections.get(&id)?.map(|c| c.state);
        let out = s.connections.test(&id)?;
        if matches!(out, TestOutcome::Passed { .. }) {
            let _ = passed(s, &id, before != Some(ConnectionState::Passed));
        }
        Ok(out)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_repos(
    app: AppHandle,
    id: String,
    cursor: Option<String>,
) -> Api<RepoPage> {
    blocking(app, move |s| {
        s.connections.repos(&id, cursor.as_deref(), 100)
    })
    .await
}

/// Creates a private repository on a forge connection. It is a write: it needs the click of a person.
#[tauri::command]
#[specta::specta]
pub async fn connections_create_repo(
    app: AppHandle,
    id: String,
    slug: String,
    click: bool,
) -> Api<Repository> {
    blocking(app, move |s| create_repo(s, &id, &slug, click)).await
}

pub fn create_repo(s: &AppState, id: &str, slug: &str, click: bool) -> Res<Repository> {
    crate::work::need_click(s, click)?;
    s.connections
        .pull_api(id)?
        .create_repo(slug)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::commands::projects::create;
    use shipyard_core::project::ProjectConnections;
    use shipyard_store::project::write_project_file;

    #[test]
    fn creating_a_repository_needs_a_click_before_anything_else() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let err = create_repo(&s, "gh", "acme/new", false).unwrap_err();
        assert!(err.contains("click"), "{err}");
        let err = create_repo(&s, "gh", "acme/new", true).unwrap_err();
        assert!(!err.contains("click"), "a click passes the gate: {err}");
    }

    #[test]
    fn a_new_pass_gives_the_other_role_the_secret_and_links_both_to_the_project() {
        use crate::connections::{ConnectionGroup, ConnectionKind, Connections};
        use shipyard_http::fake::FakeHttp;
        use shipyard_secrets::MemoryStore;
        let dir = tempfile::tempdir().unwrap();
        let http = Arc::new(FakeHttp::new());
        http.get("api.github.com/user", 200, r#"{"login":"ada"}"#);
        let conns = Arc::new(Connections::new(
            dir.path(),
            Arc::new(MemoryStore::default()),
            http,
        ));
        let s = AppState::with_connections(dir.path().join("data"), conns);
        let root = dir.path().join("p");
        create(&s, root.to_str().unwrap(), "P", "PRJ").unwrap();
        assert!(
            std::process::Command::new("git")
                .args(["remote", "add", "origin", "https://github.com/acme/web.git"])
                .current_dir(&root)
                .status()
                .unwrap()
                .success()
        );
        let tracker = s
            .connections
            .add(ConnectionDraft {
                name: "GitHub".into(),
                group: ConnectionGroup::Tracker,
                kind: ConnectionKind::GitHub,
                url: "https://github.com".into(),
                user: None,
            })
            .unwrap();
        s.connections
            .set_secret(&tracker.id, Secret::new("tok-1"))
            .unwrap();
        if let Some(h) = passed(&s, &tracker.id, true) {
            h.join().unwrap();
        }
        let forge = s
            .connections
            .list()
            .unwrap()
            .into_iter()
            .find(|c| c.group == ConnectionGroup::Forge)
            .expect("the code host twin");
        assert!(forge.secret);
        assert_eq!(forge.state, ConnectionState::Passed);
        let FileRead::Valid(file) = read_project_file(&root).unwrap() else {
            panic!("a valid file")
        };
        let linked = file.connections.unwrap();
        assert_eq!(linked.tracker.as_deref(), Some(tracker.id.as_str()));
        assert_eq!(linked.forge.as_deref(), Some(forge.id.as_str()));
        // A later test of a connection that passed does not bring back a twin that was removed.
        s.connections.remove(&forge.id).unwrap();
        let _ = passed(&s, &tracker.id, false);
        assert_eq!(s.connections.list().unwrap().len(), 1);
    }

    #[test]
    fn the_users_of_a_connection_come_from_every_registered_project() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let mut roots = Vec::new();
        for (name, key) in [("One", "ONE"), ("Two", "TWO"), ("Three", "THR")] {
            let root = dir.path().join(name);
            create(&s, root.to_str().unwrap(), name, key).unwrap();
            roots.push(root);
        }
        let pick = |root: &std::path::Path, tracker: Option<&str>, forge: Option<&str>| {
            let FileRead::Valid(mut f) = read_project_file(root).unwrap() else {
                panic!("a valid file")
            };
            f.connections = Some(ProjectConnections {
                tracker: tracker.map(String::from),
                forge: forge.map(String::from),
                tracker_scope: None,
            });
            write_project_file(root, &f).unwrap();
        };
        pick(&roots[0], Some("acme"), None);
        pick(&roots[1], None, Some("acme"));
        pick(&roots[2], Some("other"), None);
        // The last created project is the active one; the scan still finds the others.
        let keys: Vec<_> = users(&s, "acme")
            .unwrap()
            .into_iter()
            .map(|u| u.key)
            .collect();
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"ONE".to_string()) && keys.contains(&"TWO".to_string()));
        assert!(users(&s, "none").unwrap().is_empty());
    }
}
