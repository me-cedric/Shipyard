//! Runners, model providers and MCP servers. The logic is in `crate::agents`. A command only runs
//! it on a blocking thread: a start, an install and a test wait for a process or the network.

use shipyard_agents::mcp_control::{ServerRow, State};
use shipyard_agents::runners::Runner;
use shipyard_http::TestOutcome;
use shipyard_secrets::Secret;
use tauri::AppHandle;

use super::{Res, blocking};
use crate::agents::{McpCustom, Provider, ProviderDraft};

#[tauri::command]
#[specta::specta]
pub async fn runners_list(app: AppHandle) -> Res<Vec<Runner>> {
    blocking(app, |s| Ok(s.agents.runners())).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_list(app: AppHandle) -> Res<Vec<Provider>> {
    blocking(app, |s| s.agents.providers()).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_add(app: AppHandle, draft: ProviderDraft) -> Res<Provider> {
    blocking(app, move |s| s.agents.provider_add(draft)).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_edit(app: AppHandle, id: String, draft: ProviderDraft) -> Res<Provider> {
    blocking(app, move |s| s.agents.provider_edit(&id, draft)).await
}

/// Write-only: the key goes to the keychain and no command returns it.
#[tauri::command]
#[specta::specta]
pub async fn providers_set_secret(app: AppHandle, id: String, secret: String) -> Res<Provider> {
    blocking(app, move |s| {
        s.agents.provider_set_secret(&id, Secret::new(secret))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_remove(app: AppHandle, id: String) -> Res<()> {
    blocking(app, move |s| s.agents.provider_remove(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_test(app: AppHandle, id: String) -> Res<TestOutcome> {
    blocking(app, move |s| s.agents.provider_test(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_models(app: AppHandle, id: String) -> Res<Vec<String>> {
    blocking(app, move |s| s.agents.provider_models(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_list(app: AppHandle) -> Res<Vec<ServerRow>> {
    blocking(app, |s| Ok(s.agents.mcp_list())).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_enable(app: AppHandle, id: String, on: bool) -> Res<()> {
    blocking(app, move |s| s.agents.mcp_enable(&id, on)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_add_custom(app: AppHandle, draft: McpCustom) -> Res<String> {
    blocking(app, move |s| s.agents.mcp_add_custom(draft)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_remove(app: AppHandle, id: String) -> Res<()> {
    blocking(app, move |s| s.agents.mcp_remove(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_forget(app: AppHandle, id: String) -> Res<()> {
    blocking(app, move |s| s.agents.mcp_forget(&id)).await
}

/// Write-only: a secret field goes to the keychain and no command returns it.
#[tauri::command]
#[specta::specta]
pub async fn mcp_set_field(app: AppHandle, id: String, key: String, value: String) -> Res<()> {
    blocking(app, move |s| {
        s.agents.mcp_set_field(&id, &key, Secret::new(value))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_start(app: AppHandle, id: String) -> Res<()> {
    blocking(app, move |s| s.agents.mcp_start(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_stop(app: AppHandle, id: String) -> Res<()> {
    blocking(app, move |s| {
        s.agents.mcp_stop(&id);
        Ok(())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_state(app: AppHandle, id: String) -> Res<State> {
    blocking(app, move |s| Ok(s.agents.mcp_state(&id))).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_install(app: AppHandle, command: String) -> Res<String> {
    blocking(app, move |s| s.agents.mcp_install(&command)).await
}
