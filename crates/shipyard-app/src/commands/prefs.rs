//! Personal preferences in the app data folder.

use shipyard_store::prefs::{Prefs, PrefsPatch};
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
