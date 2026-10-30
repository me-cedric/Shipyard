//! Runners, model providers and MCP servers. The logic is in `crate::agents`. A command only runs
//! it on a blocking thread: a start, an install and a test wait for a process or the network.

use shipyard_agents::mcp_control::{ServerRow, State};
use shipyard_agents::runners::Runner;
use shipyard_http::TestOutcome;
use shipyard_secrets::Secret;
use tauri::AppHandle;

use super::{Api, blocking};
use crate::agents::{McpCustom, Provider, ProviderDraft, RunnerTiers};

#[tauri::command]
#[specta::specta]
pub async fn runners_list(app: AppHandle) -> Api<Vec<Runner>> {
    blocking(app, |s| Ok(s.agents.runners())).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_list(app: AppHandle) -> Api<Vec<Provider>> {
    blocking(app, |s| s.agents.providers()).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_add(app: AppHandle, draft: ProviderDraft) -> Api<Provider> {
    blocking(app, move |s| s.agents.provider_add(draft)).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_edit(app: AppHandle, id: String, draft: ProviderDraft) -> Api<Provider> {
    blocking(app, move |s| s.agents.provider_edit(&id, draft)).await
}

/// Write-only: the key goes to the keychain and no command returns it.
#[tauri::command]
#[specta::specta]
pub async fn providers_set_secret(app: AppHandle, id: String, secret: String) -> Api<Provider> {
    blocking(app, move |s| {
        s.agents.provider_set_secret(&id, Secret::new(secret))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_remove(app: AppHandle, id: String) -> Api<()> {
    blocking(app, move |s| s.agents.provider_remove(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_test(app: AppHandle, id: String) -> Api<TestOutcome> {
    blocking(app, move |s| s.agents.provider_test(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn providers_models(app: AppHandle, id: String) -> Api<Vec<String>> {
    blocking(app, move |s| s.agents.provider_models(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_list(app: AppHandle) -> Api<Vec<ServerRow>> {
    blocking(app, |s| Ok(s.agents.mcp_list())).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_enable(app: AppHandle, id: String, on: bool) -> Api<()> {
    blocking(app, move |s| s.agents.mcp_enable(&id, on)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_add_custom(app: AppHandle, draft: McpCustom) -> Api<String> {
    blocking(app, move |s| s.agents.mcp_add_custom(draft)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_remove(app: AppHandle, id: String) -> Api<()> {
    blocking(app, move |s| s.agents.mcp_remove(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_forget(app: AppHandle, id: String) -> Api<()> {
    blocking(app, move |s| s.agents.mcp_forget(&id)).await
}

/// Write-only: a secret field goes to the keychain and no command returns it.
#[tauri::command]
#[specta::specta]
pub async fn mcp_set_field(app: AppHandle, id: String, key: String, value: String) -> Api<()> {
    blocking(app, move |s| {
        s.agents.mcp_set_field(&id, &key, Secret::new(value))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_start(app: AppHandle, id: String) -> Api<()> {
    blocking(app, move |s| s.agents.mcp_start(&id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_stop(app: AppHandle, id: String) -> Api<()> {
    blocking(app, move |s| {
        s.agents.mcp_stop(&id);
        Ok(())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_state(app: AppHandle, id: String) -> Api<State> {
    blocking(app, move |s| Ok(s.agents.mcp_state(&id))).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_install(app: AppHandle, command: String) -> Api<String> {
    blocking(app, move |s| s.agents.mcp_install(&command)).await
}

/// The model of each tier for each runner (`factory` REQ-012). Settings / Connections edits it.
#[tauri::command]
#[specta::specta]
pub async fn tiers_get(app: AppHandle) -> Api<Vec<RunnerTiers>> {
    blocking(app, |s| s.agents.tiers()).await
}

/// Saves the row of one runner. A step that starts after the edit uses it.
#[tauri::command]
#[specta::specta]
pub async fn tiers_set(app: AppHandle, row: RunnerTiers) -> Api<Vec<RunnerTiers>> {
    blocking(app, move |s| {
        let rows = s.agents.tiers_set(row)?;
        s.factory.factory.set_tiers(s.agents.tier_map());
        Ok(rows)
    })
    .await
}
