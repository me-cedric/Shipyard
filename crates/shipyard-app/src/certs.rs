//! Settings / Connections: add a PEM bundle of certificates that `shipyard-http` trusts next to the OS roots.
//! The bundle is a copy in `ca/custom.pem` of the app data folder. A bad file is refused before the copy.

use std::path::{Path, PathBuf};

use serde::Serialize;
use shipyard_http::{count_pem_certs, set_extra_ca};
use shipyard_store::project::write_atomic;
use specta::Type;

use crate::commands::{Api, AppState, Res, blocking, err};

const MAX_BYTES: u64 = 1_000_000;

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CertStatus {
    pub added: bool,
    pub count: u32,
}

fn bundle(s: &AppState) -> PathBuf {
    s.dir.join("ca").join("custom.pem")
}

pub fn status(s: &AppState) -> CertStatus {
    let count = std::fs::read(bundle(s)).map_or(0, |b| count_pem_certs(&b).unwrap_or(0));
    CertStatus {
        added: count > 0,
        count: u32::try_from(count).unwrap_or(u32::MAX),
    }
}

/// Trust the saved bundle for the next request. Called at start and after a change.
pub fn apply(s: &AppState) {
    set_extra_ca(status(s).added.then(|| bundle(s)));
}

/// Copy a PEM file in. The file must hold one certificate or more and stay under 1 MB.
pub fn import(s: &AppState, source: &Path, click: bool) -> Res<CertStatus> {
    if !click {
        return Err("this change needs the click of a person".into());
    }
    let meta = std::fs::metadata(source).map_err(err)?;
    if !meta.is_file() || meta.len() > MAX_BYTES {
        return Err("the certificate file is not a file under 1 MB".into());
    }
    let bytes = std::fs::read(source).map_err(err)?;
    if count_pem_certs(&bytes).map_err(|e| format!("a PEM block is not valid: {e}"))? == 0 {
        return Err("the file holds no PEM certificate".into());
    }
    write_atomic(&bundle(s), &bytes).map_err(err)?;
    apply(s);
    Ok(status(s))
}

pub fn remove(s: &AppState, click: bool) -> Res<CertStatus> {
    if !click {
        return Err("this change needs the click of a person".into());
    }
    match std::fs::remove_file(bundle(s)) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(err(e)),
    }
    apply(s);
    Ok(status(s))
}

#[tauri::command]
#[specta::specta]
pub async fn certs_status(app: tauri::AppHandle) -> Api<CertStatus> {
    blocking(app, |s| Ok(status(s))).await
}

#[tauri::command]
#[specta::specta]
pub async fn certs_import(app: tauri::AppHandle, path: String, click: bool) -> Api<CertStatus> {
    blocking(app, move |s| import(s, Path::new(&path), click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn certs_remove(app: tauri::AppHandle, click: bool) -> Api<CertStatus> {
    blocking(app, move |s| remove(s, click)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_without_a_certificate_is_refused_and_nothing_is_copied() {
        let tmp = tempfile::tempdir().unwrap();
        let s = AppState::new(tmp.path().join("data"));
        let file = tmp.path().join("x.pem");
        std::fs::write(&file, "hello").unwrap();
        assert!(import(&s, &file, true).is_err());
        assert!(!status(&s).added);
    }

    #[test]
    fn a_bundle_with_a_truncated_block_is_refused_and_nothing_is_copied() {
        let tmp = tempfile::tempdir().unwrap();
        let s = AppState::new(tmp.path().join("data"));
        let file = tmp.path().join("x.pem");
        std::fs::write(&file, "-----BEGIN CERTIFICATE-----\nMIIB\n").unwrap();
        assert!(import(&s, &file, true).unwrap_err().contains("not valid"));
        assert!(!bundle(&s).exists());
    }

    #[test]
    fn an_import_and_a_remove_need_the_click() {
        let tmp = tempfile::tempdir().unwrap();
        let s = AppState::new(tmp.path().join("data"));
        assert!(import(&s, &tmp.path().join("x.pem"), false).is_err());
        assert!(remove(&s, false).is_err());
        assert!(remove(&s, true).is_ok());
    }
}
