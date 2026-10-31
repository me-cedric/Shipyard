//! The main window and the data folder: the window opens at the size and place where it closed,
//! and a `portable` file next to the app keeps the data folder next to the app.

use std::path::{Path, PathBuf};

use serde::Serialize;
use shipyard_store::prefs::WindowState;
use specta::Type;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Window};

use crate::commands::{Api, blocking};

/// The marker file. Next to the app, it turns on the portable mode.
pub const MARKER: &str = "portable";
/// The data folder of the portable mode, next to the marker.
pub const PORTABLE_DIR: &str = "shipyard-data";

/// The folder that holds the app: the folder of the `.app` bundle on macOS, else the folder of
/// the program.
pub fn app_folder(exe: &Path) -> Option<PathBuf> {
    let bin = exe.parent()?;
    if bin.ends_with("Contents/MacOS")
        && let Some(bundle) = bin.parent().and_then(Path::parent)
        && bundle.extension().is_some_and(|e| e == "app")
    {
        return bundle.parent().map(Path::to_path_buf);
    }
    Some(bin.to_path_buf())
}

/// The data folder: next to the app when the marker is there, else `system`.
pub fn data_dir(exe: Option<&Path>, system: PathBuf) -> PathBuf {
    exe.and_then(app_folder)
        .filter(|f| f.join(MARKER).is_file())
        .map_or(system, |f| f.join(PORTABLE_DIR))
}

/// A screen as `(x, y, width, height)` in logical points.
type Screen = (f64, f64, f64, f64);

/// The middle of the title bar of the saved window is on one of the screens.
fn on_screen(state: &WindowState, screens: &[Screen]) -> bool {
    let (x, y) = (state.x + state.width / 2.0, state.y + 10.0);
    screens
        .iter()
        .any(|&(sx, sy, w, h)| x >= sx && x < sx + w && y >= sy && y < sy + h)
}

/// Open the window at the size and the place where it closed. A failure keeps the default size.
pub fn restore(app: &AppHandle, dir: &Path) {
    let (Some(w), Some(state)) = (app.get_webview_window("main"), WindowState::load(dir)) else {
        return;
    };
    let _ = w.set_size(LogicalSize::new(state.width, state.height));
    // A saved place on a screen that is gone is skipped: the system puts the window on a screen.
    let screens: Vec<Screen> = w
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let k = m.scale_factor();
            let at = m.position().to_logical::<f64>(k);
            let size = m.size().to_logical::<f64>(k);
            (at.x, at.y, size.width, size.height)
        })
        .collect();
    if on_screen(&state, &screens) {
        let _ = w.set_position(LogicalPosition::new(state.x, state.y));
    }
    if state.maximized {
        let _ = w.maximize();
    }
}

/// Keep the size and the place of the window for the next start.
pub fn remember(window: &Window, dir: &Path) {
    let read = || -> tauri::Result<WindowState> {
        let scale = window.scale_factor()?;
        let size = window.outer_size()?.to_logical::<f64>(scale);
        let at = window.outer_position()?.to_logical::<f64>(scale);
        Ok(WindowState {
            width: size.width,
            height: size.height,
            x: at.x,
            y: at.y,
            maximized: window.is_maximized()?,
        })
    };
    if let Ok(state) = read() {
        let _ = state.save(dir);
    }
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct DataFolder {
    pub path: String,
    pub portable: bool,
}

/// Where the app keeps its data, and whether the portable mode is on.
#[tauri::command]
#[specta::specta]
pub async fn app_data_folder(app: AppHandle) -> Api<DataFolder> {
    blocking(app, |s| {
        let exe = std::env::current_exe().ok();
        let portable = exe
            .as_deref()
            .and_then(app_folder)
            .is_some_and(|f| s.dir == f.join(PORTABLE_DIR));
        Ok(DataFolder {
            path: s.dir.display().to_string(),
            portable,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_saved_place_on_a_screen_that_is_gone_is_not_used() {
        let at = |x: f64, y: f64| WindowState {
            width: 800.0,
            height: 600.0,
            x,
            y,
            maximized: false,
        };
        let one = [(0.0, 0.0, 1440.0, 900.0)];
        let two = [(0.0, 0.0, 1440.0, 900.0), (1440.0, 0.0, 1920.0, 1080.0)];
        assert!(on_screen(&at(100.0, 50.0), &one));
        assert!(!on_screen(&at(2000.0, 50.0), &one));
        assert!(on_screen(&at(2000.0, 50.0), &two));
        assert!(!on_screen(&at(100.0, 5000.0), &two));
        // No screen is known: the position is not used.
        assert!(!on_screen(&at(0.0, 0.0), &[]));
    }

    #[test]
    fn the_marker_next_to_the_app_keeps_the_data_next_to_the_app() {
        let tmp = tempfile::tempdir().unwrap();
        let system = PathBuf::from("/system/data");
        let exe = tmp.path().join("shipyard");
        assert_eq!(data_dir(Some(&exe), system.clone()), system);
        std::fs::write(tmp.path().join(MARKER), "").unwrap();
        assert_eq!(
            data_dir(Some(&exe), system.clone()),
            tmp.path().join(PORTABLE_DIR)
        );
        assert_eq!(data_dir(None, system.clone()), system);
    }

    #[test]
    fn on_macos_the_app_folder_is_the_folder_of_the_bundle() {
        let exe = Path::new("/Volumes/USB/Shipyard.app/Contents/MacOS/shipyard");
        assert_eq!(app_folder(exe), Some(PathBuf::from("/Volumes/USB")));
        let plain = Path::new("/opt/shipyard/shipyard");
        assert_eq!(app_folder(plain), Some(PathBuf::from("/opt/shipyard")));
    }
}
