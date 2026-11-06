//! The OS permissions that Shipyard uses: their state, the ask after a click, and the matching
//! pane of System Settings (spec `onboarding`, REQ-006 to REQ-008).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use shipyard_store::prefs::Prefs;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PermissionKind {
    Notifications,
    /// The protected folders of macOS: Documents, Desktop and Downloads.
    Files,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum PermissionState {
    On,
    Off,
    NotAsked,
    NotNeeded,
    /// The system gives no state, such as an unbundled dev build or Linux.
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OsPermission {
    pub kind: PermissionKind,
    pub state: PermissionState,
    /// System Settings has a pane for it on this computer.
    pub settings: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Os {
    Mac,
    Windows,
    Linux,
}

const OS: Os = if cfg!(target_os = "macos") {
    Os::Mac
} else if cfg!(windows) {
    Os::Windows
} else {
    Os::Linux
};

/// The fixed address of the pane. The view sends a kind, never an address.
fn settings_url(os: Os, kind: PermissionKind) -> Option<&'static str> {
    match (os, kind) {
        (Os::Mac, PermissionKind::Notifications) => {
            Some("x-apple.systempreferences:com.apple.preference.notifications")
        }
        (Os::Mac, PermissionKind::Files) => {
            Some("x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders")
        }
        (Os::Windows, PermissionKind::Notifications) => Some("ms-settings:notifications"),
        _ => None,
    }
}

/// The raw `UNAuthorizationStatus` of macOS; `None` when the system gives none.
fn notification_state(status: Option<isize>) -> PermissionState {
    match status {
        None => PermissionState::Unknown,
        Some(0) => PermissionState::NotAsked,
        Some(1) => PermissionState::Off,
        Some(_) => PermissionState::On,
    }
}

/// The folders state. Before the first ask, no folder is read: a read is what shows the prompt.
fn files_state(os: Os, asked: bool, read: impl FnOnce() -> Vec<bool>) -> PermissionState {
    match os {
        Os::Mac if !asked => PermissionState::NotAsked,
        Os::Mac if read().iter().all(|ok| *ok) => PermissionState::On,
        Os::Mac => PermissionState::Off,
        _ => PermissionState::NotNeeded,
    }
}

const FILES: &str = "files";

/// The protected folders that exist. A list of one of them asks macOS once, then answers silently.
fn read_folders() -> Vec<bool> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    ["Documents", "Desktop", "Downloads"]
        .iter()
        .map(|d| home.join(d))
        .filter(|p| p.is_dir())
        .map(|p| std::fs::read_dir(p).is_ok())
        .collect()
}

fn one(s: &AppState, kind: PermissionKind) -> OsPermission {
    let state = match kind {
        PermissionKind::Notifications => notification_state(mac::notifications()),
        PermissionKind::Files => {
            let asked = Prefs::load(&s.dir)
                .permissions_asked
                .iter()
                .any(|k| k == FILES);
            files_state(OS, asked, read_folders)
        }
    };
    OsPermission {
        kind,
        state,
        settings: settings_url(OS, kind).is_some(),
    }
}

pub fn list(s: &AppState) -> Vec<OsPermission> {
    [PermissionKind::Notifications, PermissionKind::Files]
        .into_iter()
        .map(|k| one(s, k))
        .collect()
}

/// Shows the system prompt of the permission, then gives its new state.
pub fn request(s: &AppState, kind: PermissionKind) -> Res<OsPermission> {
    match (OS, kind) {
        (Os::Mac, PermissionKind::Notifications) => mac::ask_notifications()?,
        (Os::Mac, PermissionKind::Files) => {
            read_folders();
            let _g = s.guard();
            let mut p = Prefs::load(&s.dir);
            if !p.permissions_asked.iter().any(|k| k == FILES) {
                p.permissions_asked.push(FILES.into());
                p.save(&s.dir).map_err(err)?;
            }
        }
        _ => {}
    }
    Ok(one(s, kind))
}

pub fn open_settings(kind: PermissionKind) -> Res<()> {
    let url = settings_url(OS, kind).ok_or("no settings pane for this permission")?;
    let program = if OS == Os::Windows {
        "explorer"
    } else {
        "open"
    };
    crate::openers::launch(program, &[url.as_ref()])
}

#[tauri::command]
#[specta::specta]
pub async fn permissions_list(app: AppHandle) -> Api<Vec<OsPermission>> {
    blocking(app, |s| Ok(list(s))).await
}

#[tauri::command]
#[specta::specta]
pub async fn permissions_request(app: AppHandle, kind: PermissionKind) -> Api<OsPermission> {
    blocking(app, move |s| request(s, kind)).await
}

#[tauri::command]
#[specta::specta]
pub async fn permissions_open_settings(app: AppHandle, kind: PermissionKind) -> Api<()> {
    blocking(app, move |_| open_settings(kind)).await
}

#[cfg(target_os = "macos")]
mod mac {
    use std::ptr::NonNull;
    use std::sync::mpsc;
    use std::time::Duration;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSBundle, NSError};
    use objc2_user_notifications::{
        UNAuthorizationOptions, UNNotificationSettings, UNUserNotificationCenter,
    };

    /// The notification center raises an exception outside an app bundle, such as a dev build.
    fn bundled() -> bool {
        NSBundle::mainBundle()
            .bundlePath()
            .to_string()
            .ends_with(".app")
    }

    pub fn notifications() -> Option<isize> {
        if !bundled() {
            return None;
        }
        let (tx, rx) = mpsc::channel();
        let done = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
            // SAFETY: the system passes a valid settings object for the time of the call.
            let _ = tx.send(unsafe { settings.as_ref() }.authorizationStatus().0);
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .getNotificationSettingsWithCompletionHandler(&done);
        rx.recv_timeout(Duration::from_secs(5)).ok()
    }

    /// `Err` with the reason of macOS when it refuses the request without a prompt (for example
    /// an app whose bundle is not signed as a whole).
    pub fn ask_notifications() -> Result<(), String> {
        if !bundled() {
            return Ok(());
        }
        let (tx, rx) = mpsc::channel();
        let done = RcBlock::new(move |_: Bool, error: *mut NSError| {
            // SAFETY: the system passes a valid error, or null, for the time of the call.
            let why = unsafe { error.as_ref() }.map(|e| e.localizedDescription().to_string());
            let _ = tx.send(why);
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .requestAuthorizationWithOptions_completionHandler(
                UNAuthorizationOptions::Alert
                    | UNAuthorizationOptions::Sound
                    | UNAuthorizationOptions::Badge,
                &done,
            );
        // The person answers the prompt: wait for the answer, but not forever.
        match rx.recv_timeout(Duration::from_secs(300)) {
            Ok(Some(why)) => Err(why),
            _ => Ok(()),
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod mac {
    pub fn notifications() -> Option<isize> {
        None
    }

    pub fn ask_notifications() -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_folders_are_not_read_before_the_first_ask() {
        let read = || -> Vec<bool> { panic!("a read shows the macOS prompt") };
        assert_eq!(files_state(Os::Mac, false, read), PermissionState::NotAsked);
        assert_eq!(
            files_state(Os::Mac, true, || vec![true, true]),
            PermissionState::On
        );
        assert_eq!(
            files_state(Os::Mac, true, || vec![true, false]),
            PermissionState::Off
        );
        assert_eq!(
            files_state(Os::Windows, false, read),
            PermissionState::NotNeeded
        );
        assert_eq!(
            files_state(Os::Linux, true, read),
            PermissionState::NotNeeded
        );
    }

    #[test]
    fn the_notification_status_maps_to_a_state() {
        assert_eq!(notification_state(None), PermissionState::Unknown);
        assert_eq!(notification_state(Some(0)), PermissionState::NotAsked);
        assert_eq!(notification_state(Some(1)), PermissionState::Off);
        assert_eq!(notification_state(Some(2)), PermissionState::On);
        assert_eq!(notification_state(Some(3)), PermissionState::On);
    }

    #[test]
    fn each_pane_is_a_fixed_system_address() {
        use PermissionKind::*;
        assert!(
            settings_url(Os::Mac, Files)
                .unwrap()
                .ends_with("Privacy_FilesAndFolders")
        );
        assert!(
            settings_url(Os::Mac, Notifications)
                .unwrap()
                .starts_with("x-apple.systempreferences:")
        );
        assert_eq!(
            settings_url(Os::Windows, Notifications),
            Some("ms-settings:notifications")
        );
        assert_eq!(settings_url(Os::Windows, Files), None);
        assert_eq!(settings_url(Os::Linux, Notifications), None);
    }

    #[test]
    fn the_list_has_each_permission_and_files_start_not_asked() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().into());
        let all = list(&s);
        assert_eq!(
            all.iter().map(|p| p.kind).collect::<Vec<_>>(),
            [PermissionKind::Notifications, PermissionKind::Files]
        );
        let files = all[1].state;
        let want = if OS == Os::Mac {
            PermissionState::NotAsked
        } else {
            PermissionState::NotNeeded
        };
        assert_eq!(files, want);
    }
}
