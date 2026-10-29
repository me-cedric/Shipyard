//! Connections: list, add, edit, remove, the secret, the test and the repository list.
//! The logic is in `crate::connections`. A command only runs it on a blocking thread.

use shipyard_http::TestOutcome;
use shipyard_secrets::Secret;
use tauri::AppHandle;

use super::{Res, blocking};
use crate::connections::{Connection, ConnectionDraft, RepoPage};

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
