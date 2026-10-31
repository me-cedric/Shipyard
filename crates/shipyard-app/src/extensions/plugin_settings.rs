//! The typed settings of an applied plugin (spec `extensions`). A save needs a click and a project
//! that is not read only. The deploy to a child project goes through `child_deploy` with the key
//! `plugin:<name>`.

use std::collections::BTreeMap;

use shipyard_store::plugin_config::{self, SettingRow};
use tauri::AppHandle;

use super::root;
use crate::commands::{Api, blocking, err};
use crate::work::need_click;

#[tauri::command]
#[specta::specta]
pub async fn plugin_settings_get(app: AppHandle, name: String) -> Api<Vec<SettingRow>> {
    blocking(app, move |s| {
        plugin_config::settings(&root(s)?, &name).map_err(err)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_settings_save(
    app: AppHandle,
    name: String,
    values: BTreeMap<String, String>,
    click: bool,
) -> Api<Vec<SettingRow>> {
    blocking(app, move |s| {
        need_click(s, click)?;
        plugin_config::settings_save(&root(s)?, &name, &values).map_err(err)
    })
    .await
}
