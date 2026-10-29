//! Connections: list, add, edit, remove, the secret, the test and the repository list.
//! The logic is in `crate::connections`. A command only runs it on a blocking thread.

use serde::Serialize;
use shipyard_http::TestOutcome;
use shipyard_secrets::Secret;
use shipyard_store::project::{FileRead, read_project_file};
use specta::Type;
use tauri::AppHandle;

use super::{AppState, Res, blocking};
use crate::connections::{Connection, ConnectionDraft, RepoPage};

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
pub async fn connections_users(app: AppHandle, id: String) -> Res<Vec<ConnectionUser>> {
    blocking(app, move |s| users(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_list(app: AppHandle) -> Res<Vec<Connection>> {
    blocking(app, |s| s.connections.list()).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_add(app: AppHandle, draft: ConnectionDraft) -> Res<Connection> {
    blocking(app, move |s| s.connections.add(draft)).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_edit(
    app: AppHandle,
    id: String,
    draft: ConnectionDraft,
) -> Res<Connection> {
    blocking(app, move |s| s.connections.edit(&id, draft)).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_remove(app: AppHandle, id: String) -> Res<()> {
    blocking(app, move |s| s.connections.remove(&id)).await
}

/// Write-only: the secret goes to the keychain and no command returns it.
#[tauri::command]
#[specta::specta]
pub async fn connections_set_secret(app: AppHandle, id: String, secret: String) -> Res<Connection> {
    blocking(app, move |s| {
        s.connections.set_secret(&id, Secret::new(secret))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_test(app: AppHandle, id: String) -> Res<TestOutcome> {
    blocking(app, move |s| s.connections.test(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_repos(
    app: AppHandle,
    id: String,
    cursor: Option<String>,
) -> Res<RepoPage> {
    blocking(app, move |s| {
        s.connections.repos(&id, cursor.as_deref(), 100)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::projects::create;
    use shipyard_core::project::ProjectConnections;
    use shipyard_store::project::write_project_file;

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
