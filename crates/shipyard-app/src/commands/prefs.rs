//! Personal preferences and the theme library in the app data folder.

use std::path::Path;

use shipyard_core::theme::ThemeFile;
use shipyard_store::prefs::{Prefs, PrefsPatch};
use shipyard_store::themes;
use tauri::AppHandle;

use super::{Api, AppState, Res, blocking, err};

pub fn get(s: &AppState) -> Res<Prefs> {
    Ok(Prefs::load(&s.dir))
}

pub fn set(s: &AppState, patch: PrefsPatch) -> Res<Prefs> {
    let _g = s.guard();
    let mut p = Prefs::load(&s.dir);
    p.apply(patch);
    p.save(&s.dir).map_err(err)?;
    Ok(p)
}

#[tauri::command]
#[specta::specta]
pub async fn prefs_get(app: AppHandle) -> Api<Prefs> {
    blocking(app, get).await
}

#[tauri::command]
#[specta::specta]
pub async fn prefs_set(app: AppHandle, patch: PrefsPatch) -> Api<Prefs> {
    let tray = patch.tray.is_some();
    let handle = app.clone();
    let prefs = blocking(app, move |s| set(s, patch)).await;
    // The menu bar item follows its setting at once.
    if let (true, Ok(p)) = (tray, &prefs) {
        crate::tray::apply(&handle, p.tray);
    }
    prefs
}

/// The themes of the library (spec `themes`).
#[tauri::command]
#[specta::specta]
pub async fn theme_list(app: AppHandle) -> Api<Vec<ThemeFile>> {
    blocking(app, |s| Ok(themes::list(&s.dir))).await
}

/// Read and check a theme file for the preview. Nothing is saved (REQ-005, REQ-006).
#[tauri::command]
#[specta::specta]
pub async fn theme_read(app: AppHandle, path: String) -> Api<ThemeFile> {
    blocking(app, move |_| {
        themes::read_file(Path::new(&path)).map_err(err)
    })
    .await
}

/// Add a theme to the library after the preview. A theme with the same id is replaced.
#[tauri::command]
#[specta::specta]
pub async fn theme_add(app: AppHandle, theme: ThemeFile) -> Api<Vec<ThemeFile>> {
    blocking(app, move |s| {
        themes::save(&s.dir, &theme).map_err(err)?;
        Ok(themes::list(&s.dir))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn theme_remove(app: AppHandle, id: String) -> Api<Vec<ThemeFile>> {
    blocking(app, move |s| {
        themes::remove(&s.dir, &id).map_err(err)?;
        Ok(themes::list(&s.dir))
    })
    .await
}

/// Write a theme file at the path of the save dialog (REQ-007).
#[tauri::command]
#[specta::specta]
pub async fn theme_export(app: AppHandle, path: String, theme: ThemeFile) -> Api<()> {
    blocking(app, move |_| {
        themes::export(Path::new(&path), &theme).map_err(err)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_store::prefs::Theme;

    #[test]
    fn a_patch_persists_in_the_app_data_folder() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().into());
        assert_eq!(get(&s).unwrap(), Prefs::default());
        let p = set(
            &s,
            PrefsPatch {
                theme: Some(Theme::Dark),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(p.theme, Theme::Dark);
        assert_eq!(
            get(&AppState::new(dir.path().into())).unwrap().theme,
            Theme::Dark
        );
    }
}
