//! Design preview IPC: the bytes of a design file, for the inline image preview of Design / Screens.
//! The path goes through `shipyard_store::design::resolve`. The file stays unchanged.

use shipyard_store::design::{self, MAX_BYTES};
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking};
use crate::design::project;

/// The bytes of a design file that is not bigger than `MAX_BYTES`.
pub fn bytes(s: &AppState, rel: &str) -> Res<Vec<u8>> {
    let p = project(s)?;
    let full = design::resolve(&p.root, &p.file, rel)?;
    let meta = std::fs::metadata(&full).map_err(|e| format!("{rel}: {e}"))?;
    if !meta.is_file() || meta.len() > MAX_BYTES {
        return Err(format!("{rel}: not a file or too big"));
    }
    std::fs::read(&full).map_err(|e| format!("{rel}: {e}"))
}

#[tauri::command]
#[specta::specta]
pub async fn design_bytes(app: AppHandle, path: String) -> Api<Vec<u8>> {
    blocking(app, move |s| bytes(s, &path)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work::tests::fx;

    #[test]
    fn a_design_image_gives_its_bytes_and_a_path_outside_is_refused() {
        let f = fx();
        let p = f.repo.path().join("docs/designs/home.png");
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, [0x89, b'P', b'N', b'G', 0]).unwrap();
        assert_eq!(
            bytes(&f.s, "docs/designs/home.png").unwrap(),
            vec![0x89, b'P', b'N', b'G', 0]
        );
        assert!(bytes(&f.s, "Cargo.toml").is_err());
        assert!(bytes(&f.s, "docs/designs/missing.png").is_err());
    }
}
