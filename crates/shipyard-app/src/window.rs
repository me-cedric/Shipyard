//! The main window and the data folder: the window opens at the size and place where it closed,
//! and a `portable` file next to the app keeps the data folder next to the app.

use std::path::{Path, PathBuf};

use serde::Serialize;
use shipyard_store::prefs::WindowState;
use specta::Type;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Window};

use crate::commands::{Api, Res, blocking, err};

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

/// The pointer file in the system folder. It holds the data folder that the person picked with
/// Change (`shell-setup-rights` REQ-008). The marker of the portable mode wins over it.
const POINTER: &str = "data-folder";

/// The move that waits for the next start: it holds the new data folder. The copy runs at the
/// start, before a store opens, because a live SQLite store and the sync loop keep writing.
const PENDING: &str = "data-folder-move";

/// The folder that the pointer names, when it is a folder.
fn pointed(system: &Path) -> Option<PathBuf> {
    let text = std::fs::read_to_string(system.join(POINTER)).ok()?;
    let dir = PathBuf::from(text.trim());
    (!text.trim().is_empty() && dir.is_dir()).then_some(dir)
}

/// The data folder: next to the app when the marker is there, else the folder that the person
/// picked, else `system`.
pub fn data_dir(exe: Option<&Path>, system: PathBuf) -> PathBuf {
    exe.and_then(app_folder)
        .filter(|f| f.join(MARKER).is_file())
        .map_or_else(
            || pointed(&system).unwrap_or(system),
            |f| f.join(PORTABLE_DIR),
        )
}

/// Copy a folder with its files, one by one. A link is not followed: it is skipped.
fn copy_tree(from: &Path, to: &Path) -> Res<()> {
    std::fs::create_dir_all(to).map_err(err)?;
    for entry in std::fs::read_dir(from).map_err(err)? {
        let entry = entry.map_err(err)?;
        let kind = entry.file_type().map_err(err)?;
        let target = to.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            std::fs::copy(entry.path(), &target).map_err(err)?;
        }
    }
    Ok(())
}

/// A folder to move the data to: it holds nothing yet, and it is not inside the data folder.
fn check_target(from: &Path, to: &Path) -> Res<()> {
    if !to.is_absolute() {
        return Err("the new folder needs a full path".into());
    }
    // A folder that does not exist yet: the nearest folder that exists, plus the rest.
    fn real(p: &Path) -> PathBuf {
        p.canonicalize()
            .unwrap_or_else(|_| match (p.parent(), p.file_name()) {
                (Some(up), Some(name)) => real(up).join(name),
                _ => p.to_path_buf(),
            })
    }
    let (a, b) = (real(from), real(to));
    if b.starts_with(&a) || a.starts_with(&b) {
        return Err("the new folder is the data folder, or is inside it".into());
    }
    let empty = std::fs::read_dir(to).map_or(true, |mut it| it.next().is_none());
    if empty {
        Ok(())
    } else {
        Err("the new folder is not empty".into())
    }
}

/// Ask to move the data to `to`: the move runs at the next start ([`apply_pending`]). The old
/// folder stays as it was (a copy that a person can drop, never a delete). `Err` while the
/// portable marker is on: it wins over the pointer.
///
/// shortcut: the old folder is kept, not removed. Remove it after a restart check when a person asks.
pub fn move_data(from: &Path, to: &Path, system: &Path, exe: Option<&Path>) -> Res<()> {
    if exe
        .and_then(app_folder)
        .is_some_and(|f| f.join(MARKER).is_file())
    {
        return Err("turn off the portable mode first".into());
    }
    check_target(from, to)?;
    std::fs::create_dir_all(system).map_err(err)?;
    std::fs::write(system.join(PENDING), to.display().to_string()).map_err(err)
}

/// The data folder at the start, after a waiting move: copy the data to the new folder and point
/// to it. Call it before a store opens. A failed copy keeps the move for the next start and the
/// old folder in use; the portable marker cancels the move.
pub fn start_dir(exe: Option<&Path>, system: PathBuf) -> PathBuf {
    let from = data_dir(exe, system.clone());
    let Ok(text) = std::fs::read_to_string(system.join(PENDING)) else {
        return from;
    };
    let to = PathBuf::from(text.trim());
    let portable = exe
        .and_then(app_folder)
        .is_some_and(|f| f.join(MARKER).is_file());
    let moved = !portable
        && to.is_absolute()
        && copy_tree(&from, &to).is_ok()
        && std::fs::write(system.join(POINTER), to.display().to_string()).is_ok();
    if moved || portable || !to.is_absolute() {
        let _ = std::fs::remove_file(system.join(PENDING));
    }
    data_dir(exe, system)
}

/// Turn the portable mode on or off: the marker next to the app. Turning it on first copies the
/// data to the folder next to the app when that folder does not exist, so the next start finds it.
pub fn set_portable(exe: &Path, data: &Path, on: bool) -> Res<()> {
    let folder = app_folder(exe).ok_or("no folder holds the app")?;
    let marker = folder.join(MARKER);
    if !on {
        return match std::fs::remove_file(&marker) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(err(e)),
            _ => Ok(()),
        };
    }
    let portable = folder.join(PORTABLE_DIR);
    if !portable.exists() && data != portable {
        copy_tree(data, &portable)?;
    }
    std::fs::write(&marker, "").map_err(err)
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
    /// The app runs on the folder next to it now.
    pub portable: bool,
    /// The `portable` marker is next to the app: the next start runs on the folder next to it.
    pub marker: bool,
}

fn state(dir: &Path) -> DataFolder {
    let folder = std::env::current_exe().ok().as_deref().and_then(app_folder);
    DataFolder {
        path: dir.display().to_string(),
        portable: folder.as_ref().is_some_and(|f| dir == f.join(PORTABLE_DIR)),
        marker: folder.is_some_and(|f| f.join(MARKER).is_file()),
    }
}

/// Where the app keeps its data, and whether the portable mode is on.
#[tauri::command]
#[specta::specta]
pub async fn app_data_folder(app: AppHandle) -> Api<DataFolder> {
    blocking(app, |s| Ok(state(&s.dir))).await
}

/// Turn the portable mode on or off. The change shows after the next start.
#[tauri::command]
#[specta::specta]
pub async fn app_portable_set(app: AppHandle, on: bool, click: bool) -> Api<DataFolder> {
    blocking(app, move |s| {
        crate::rights::need_click_local(s, click)?;
        let exe = std::env::current_exe().map_err(err)?;
        set_portable(&exe, &s.dir, on)?;
        Ok(state(&s.dir))
    })
    .await
}

/// Move the data to a new folder after the confirmation of the view, then restart the app.
#[tauri::command]
#[specta::specta]
pub async fn app_data_folder_move(app: AppHandle, to: String, click: bool) -> Api<()> {
    let system = app.path().app_data_dir().map_err(err)?;
    let handle = app.clone();
    blocking(app, move |s| {
        crate::rights::need_click_local(s, click)?;
        let exe = std::env::current_exe().ok();
        move_data(&s.dir, Path::new(&to), &system, exe.as_deref())
    })
    .await?;
    handle.restart()
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

    fn tree(root: &Path) {
        std::fs::create_dir_all(root.join("audit")).unwrap();
        std::fs::write(root.join("prefs.json"), "{}").unwrap();
        std::fs::write(root.join("audit/p.jsonl"), "x").unwrap();
    }

    #[test]
    fn change_waits_and_the_next_start_copies_the_data_and_points_to_the_new_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let (system, to) = (tmp.path().join("system"), tmp.path().join("new"));
        tree(&system);
        let exe = tmp.path().join("app/shipyard");
        move_data(&system, &to, &system, Some(&exe)).unwrap();
        assert!(!to.exists(), "nothing is copied while the app runs");
        assert_eq!(data_dir(Some(&exe), system.clone()), system);
        assert_eq!(start_dir(Some(&exe), system.clone()), to);
        assert!(!system.join(PENDING).exists());
        assert_eq!(
            std::fs::read_to_string(to.join("audit/p.jsonl")).unwrap(),
            "x"
        );
        assert!(system.join("prefs.json").is_file(), "the old folder stays");
        assert_eq!(data_dir(Some(&exe), system.clone()), to);
        // A pointer to a folder that is gone falls back to the system folder.
        std::fs::remove_dir_all(&to).unwrap();
        assert_eq!(data_dir(Some(&exe), system.clone()), system);
    }

    #[test]
    fn change_refuses_a_folder_with_files_a_folder_inside_the_data_and_the_portable_mode() {
        let tmp = tempfile::tempdir().unwrap();
        let system = tmp.path().join("system");
        tree(&system);
        let full = tmp.path().join("full");
        std::fs::create_dir_all(&full).unwrap();
        std::fs::write(full.join("a"), "").unwrap();
        assert!(
            move_data(&system, &full, &system, None)
                .unwrap_err()
                .contains("not empty")
        );
        let inside = system.join("sub");
        assert!(move_data(&system, &inside, &system, None).is_err());
        assert!(move_data(&system, Path::new("relative"), &system, None).is_err());
        assert!(
            !system.join(POINTER).exists() && !system.join(PENDING).exists(),
            "a refused change writes nothing"
        );
        let exe = tmp.path().join("app/shipyard");
        std::fs::create_dir_all(tmp.path().join("app")).unwrap();
        std::fs::write(tmp.path().join("app").join(MARKER), "").unwrap();
        let to = tmp.path().join("new");
        assert!(
            move_data(&system, &to, &system, Some(&exe))
                .unwrap_err()
                .contains("portable")
        );
        assert!(!to.exists());
    }

    #[test]
    fn the_portable_switch_copies_the_data_and_writes_or_removes_the_marker() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("system");
        tree(&data);
        let app = tmp.path().join("app");
        std::fs::create_dir_all(&app).unwrap();
        let exe = app.join("shipyard");
        set_portable(&exe, &data, true).unwrap();
        assert!(app.join(MARKER).is_file());
        assert!(app.join(PORTABLE_DIR).join("prefs.json").is_file());
        assert_eq!(data_dir(Some(&exe), data.clone()), app.join(PORTABLE_DIR));
        set_portable(&exe, &data, false).unwrap();
        assert!(!app.join(MARKER).exists());
        // A second off is no error.
        set_portable(&exe, &data, false).unwrap();
        assert_eq!(data_dir(Some(&exe), data.clone()), data);
    }

    #[test]
    fn on_macos_the_app_folder_is_the_folder_of_the_bundle() {
        let exe = Path::new("/Volumes/USB/Shipyard.app/Contents/MacOS/shipyard");
        assert_eq!(app_folder(exe), Some(PathBuf::from("/Volumes/USB")));
        let plain = Path::new("/opt/shipyard/shipyard");
        assert_eq!(app_folder(plain), Some(PathBuf::from("/opt/shipyard")));
    }
}
