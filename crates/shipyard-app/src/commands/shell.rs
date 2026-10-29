//! The shell: the native menu labels, the system notification and the update check.

use std::collections::HashMap;

use shipyard_http::Client;
use shipyard_store::prefs::Prefs;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use super::{AppState, Res, blocking, err};
use crate::shell::menu;
use crate::shell::update::{UpdateInfo, check};

/// Replaces the native menu with one in the language of the person. `labels` is keyed by item id.
#[tauri::command]
#[specta::specta]
pub async fn shell_menu(app: AppHandle, labels: HashMap<String, String>) -> Res<()> {
    let menu = menu::build(&app, &labels).map_err(err)?;
    app.set_menu(menu).map_err(err)?;
    Ok(())
}

/// A system notification, for an event of the "needs you" class while the window is in the
/// background. The UI decides when: it also shows the event in the notification centre, once.
#[tauri::command]
#[specta::specta]
pub async fn notify_os(app: AppHandle, title: String, body: String) -> Res<()> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(err)
}

pub fn update(s: &AppState) -> Res<UpdateInfo> {
    let prefs = Prefs::load(&s.dir);
    check(
        &Client,
        &prefs.release_url,
        env!("CARGO_PKG_VERSION"),
        prefs.seen_version.as_deref(),
    )
}

/// Reads the release address of the preferences and says whether a newer version exists.
/// It installs nothing.
#[tauri::command]
#[specta::specta]
pub async fn update_check(app: AppHandle) -> Res<UpdateInfo> {
    blocking(app, update).await
}
