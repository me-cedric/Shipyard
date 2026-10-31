//! File actions of the file drawer: new file, new folder, rename and delete. Every action needs the
//! click of a person and a project that is not read only. A delete moves the path to the system
//! trash: nothing is removed for good. Shipyard keeps its path
//! checks, refuses `.git`, and moves to the trash instead of a hard delete.

use std::path::{Component, Path, PathBuf};

use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::work::{FROZEN, need_click};

/// The project root and the full path of `rel`, which must stay under the root and outside `.git`.
/// The parent folder is resolved, so a symlink that leaves the project is refused.
fn resolve(s: &AppState, rel: &str) -> Res<(PathBuf, PathBuf)> {
    let root = s.registry()?.active().cloned().ok_or("no active project")?;
    let root = Path::new(&root.path).canonicalize().map_err(err)?;
    let path = Path::new(rel.trim());
    let parts: Vec<_> = path.components().collect();
    if parts.is_empty()
        || !parts.iter().all(|c| matches!(c, Component::Normal(_)))
        || parts
            .iter()
            .any(|c| c.as_os_str().eq_ignore_ascii_case(".git"))
        || rel.contains('\0')
    {
        return Err(format!("{rel} is not a path of the project"));
    }
    let full = root.join(path);
    let mut up = full.parent();
    while let Some(p) = up {
        if p.exists() {
            if !p.canonicalize().map_err(err)?.starts_with(&root) {
                return Err(format!("{rel} is not a path of the project"));
            }
            break;
        }
        up = p.parent();
    }
    Ok((root, full))
}

/// Refuses a path that is, or holds, a frozen costing sheet (`<slug>.yaml` or `<slug>.json`): a
/// frozen sheet stays where it is. The paths are canonical, so a different case on a case
/// insensitive disk or a symlink does not skip the check.
fn keep_frozen(s: &AppState, root: &Path, path: &Path) -> Res<()> {
    let (Ok(costing), Ok(path)) = (
        root.join("docs/costing").canonicalize(),
        path.canonicalize(),
    ) else {
        return Ok(());
    };
    let Ok(entries) = std::fs::read_dir(&costing) else {
        return Ok(());
    };
    for file in entries.flatten().map(|e| e.path()) {
        let slug = file.file_stem().and_then(|n| n.to_str());
        if file.starts_with(&path)
            && file.extension().is_some_and(|e| e == "yaml" || e == "json")
            && slug.is_some_and(|n| crate::work::sheet_get(s, n).is_ok_and(|v| v.sheet.frozen))
        {
            return Err(FROZEN.into());
        }
    }
    Ok(())
}

/// An empty file. An existing path is refused, so the action never empties a file.
pub fn create_file(s: &AppState, rel: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let (_, full) = resolve(s, rel)?;
    if full.exists() {
        return Err(format!("{rel} already exists"));
    }
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::write(&full, "").map_err(err)
}

pub fn create_folder(s: &AppState, rel: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let (_, full) = resolve(s, rel)?;
    if full.exists() {
        return Err(format!("{rel} already exists"));
    }
    std::fs::create_dir_all(&full).map_err(err)
}

/// Renames or moves a file or a folder. The target must not exist, and a folder does not go into
/// itself.
pub fn rename(s: &AppState, from: &str, to: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let (root, src) = resolve(s, from)?;
    let (_, dst) = resolve(s, to)?;
    if !src.exists() {
        return Err(format!("{from} does not exist"));
    }
    keep_frozen(s, &root, &src)?;
    if dst.exists() {
        return Err(format!("{to} already exists"));
    }
    if dst.starts_with(&src) {
        return Err("a folder does not move into itself".into());
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::rename(&src, &dst).map_err(err)
}

/// Moves a file or a folder to the system trash. A failure leaves the path where it is.
pub fn delete(s: &AppState, rel: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let (root, full) = resolve(s, rel)?;
    if !full.exists() {
        return Err(format!("{rel} does not exist"));
    }
    keep_frozen(s, &root, &full)?;
    to_trash(&full)
}

#[cfg(windows)]
fn to_trash(path: &Path) -> Res<()> {
    // Quotes in the path are doubled for the PowerShell single-quoted string.
    let p = path.to_string_lossy().replace('\'', "''");
    let call = if path.is_dir() {
        "DeleteDirectory"
    } else {
        "DeleteFile"
    };
    let script = format!(
        "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::{call}('{p}','OnlyErrorDialogs','SendToRecycleBin')"
    );
    let out = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(err)?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(not(windows))]
fn to_trash(path: &Path) -> Res<()> {
    let home = PathBuf::from(std::env::var_os("HOME").ok_or("no home folder for the trash")?);
    if cfg!(target_os = "macos") {
        return trash_into(path, &home.join(".Trash"), None);
    }
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| home.join(".local/share"));
    let trash = data.join("Trash");
    let info = trash.join("info");
    std::fs::create_dir_all(&info).map_err(err)?;
    trash_into(path, &trash.join("files"), Some(&info))
}

/// Moves `path` into `dir` under a free name. With `info`, writes the freedesktop `.trashinfo`.
/// A move across volumes fails: the path stays, and nothing is removed for good.
fn trash_into(path: &Path, dir: &Path, info: Option<&Path>) -> Res<()> {
    std::fs::create_dir_all(dir).map_err(err)?;
    let name = path
        .file_name()
        .ok_or("no name")?
        .to_string_lossy()
        .to_string();
    let mut target = dir.join(&name);
    let mut n = 1;
    while target.exists() {
        target = dir.join(format!("{name} {n}"));
        n += 1;
    }
    if let Some(info) = info {
        let file = target
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let text = format!(
            "[Trash Info]\nPath={}\nDeletionDate={}\n",
            path.display(),
            iso_now()
        );
        std::fs::write(info.join(format!("{file}.trashinfo")), text).map_err(err)?;
    }
    std::fs::rename(path, &target)
        .map_err(|e| format!("cannot move {} to the trash: {e}", path.display()))
}

/// `YYYY-MM-DDThh:mm:ss`, UTC, from the clock (civil date from days since 1970).
fn iso_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    let (days, rest) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

#[tauri::command]
#[specta::specta]
pub async fn files_create_file(app: AppHandle, path: String, click: bool) -> Api<()> {
    blocking(app, move |s| create_file(s, &path, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn files_create_folder(app: AppHandle, path: String, click: bool) -> Api<()> {
    blocking(app, move |s| create_folder(s, &path, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn files_rename(app: AppHandle, from: String, to: String, click: bool) -> Api<()> {
    blocking(app, move |s| rename(s, &from, &to, click)).await
}

/// Moves a path to the system trash.
#[tauri::command]
#[specta::specta]
pub async fn files_delete(app: AppHandle, path: String, click: bool) -> Api<()> {
    blocking(app, move |s| delete(s, &path, click)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fx() -> (tempfile::TempDir, AppState, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("proj");
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::process::Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["init", "-q"])
            .status()
            .unwrap();
        let s = AppState::new(tmp.path().join("data"));
        crate::commands::projects::open(&s, root.to_str().unwrap()).unwrap();
        (tmp, s, root)
    }

    #[test]
    fn a_new_file_and_a_new_folder_need_a_click_and_never_replace_a_path() {
        let (_t, s, root) = fx();
        assert!(create_file(&s, "src/a.txt", false).is_err());
        create_file(&s, "src/a.txt", true).unwrap();
        create_folder(&s, "docs/deep", true).unwrap();
        assert!(root.join("src/a.txt").is_file() && root.join("docs/deep").is_dir());
        std::fs::write(root.join("src/a.txt"), "keep").unwrap();
        assert!(create_file(&s, "src/a.txt", true).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("src/a.txt")).unwrap(),
            "keep"
        );
    }

    #[test]
    fn a_frozen_sheet_is_neither_renamed_nor_deleted_alone_or_in_its_folder() {
        use shipyard_core::work::Sheet;
        let (_t, s, root) = fx();
        let sheet = |frozen| Sheet {
            name: "Lot".into(),
            currency: "EUR".into(),
            frozen,
            ..Sheet::default()
        };
        crate::work::sheet_save(&s, "lot", sheet(true)).unwrap();
        let file = root.join("docs/costing/lot.yaml");
        for from in ["docs/costing/lot.yaml", "docs/costing", "docs"] {
            assert_eq!(
                rename(&s, from, "moved", true).unwrap_err(),
                FROZEN,
                "{from}"
            );
            assert_eq!(delete(&s, from, true).unwrap_err(), FROZEN, "{from}");
        }
        assert!(file.is_file() && !root.join("moved").exists());
        // Another file next to it is free, and so is the sheet once it is unfrozen.
        create_file(&s, "docs/costing/note.txt", true).unwrap();
        rename(&s, "docs/costing/note.txt", "docs/costing/n2.txt", true).unwrap();
        // The JSON file of the same sheet, a folder alias and another case are refused too.
        std::fs::write(root.join("docs/costing/lot.json"), "{}").unwrap();
        assert_eq!(
            delete(&s, "docs/costing/lot.json", true).unwrap_err(),
            FROZEN
        );
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.join("docs/costing"), root.join("alias")).unwrap();
            for from in ["alias", "alias/lot.yaml"] {
                assert_eq!(delete(&s, from, true).unwrap_err(), FROZEN, "{from}");
            }
        }
        if root.join("DOCS").exists() {
            for from in ["Docs/costing/lot.yaml", "docs/costing/LOT.yaml", "DOCS"] {
                assert_eq!(delete(&s, from, true).unwrap_err(), FROZEN, "{from}");
            }
        }
        std::fs::remove_file(root.join("docs/costing/lot.json")).unwrap();
        crate::work::sheet_save(&s, "lot", sheet(false)).unwrap();
        rename(&s, "docs/costing/lot.yaml", "docs/costing/lot2.yaml", true).unwrap();
        assert!(root.join("docs/costing/lot2.yaml").is_file());
    }

    #[test]
    fn a_path_outside_the_project_or_in_git_is_refused() {
        let (_t, s, _root) = fx();
        for bad in ["../x", "/etc/x", ".git/config", "src/.GIT/x", ""] {
            assert!(create_file(&s, bad, true).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_rename_keeps_the_target_and_refuses_a_move_into_itself() {
        let (_t, s, root) = fx();
        std::fs::write(root.join("src/a.txt"), "a").unwrap();
        std::fs::write(root.join("src/b.txt"), "b").unwrap();
        assert!(rename(&s, "src/a.txt", "src/b.txt", true).is_err());
        assert!(rename(&s, "src", "src/inner", true).is_err());
        assert!(rename(&s, "src/a.txt", "src/c.txt", false).is_err());
        rename(&s, "src/a.txt", "src/c.txt", true).unwrap();
        assert!(root.join("src/c.txt").is_file() && !root.join("src/a.txt").exists());
    }

    #[test]
    fn a_trash_move_keeps_the_file_under_a_free_name() {
        let tmp = tempfile::tempdir().unwrap();
        let (files, info) = (
            tmp.path().join("Trash/files"),
            tmp.path().join("Trash/info"),
        );
        std::fs::create_dir_all(&info).unwrap();
        for _ in 0..2 {
            let f = tmp.path().join("x.txt");
            std::fs::write(&f, "data").unwrap();
            trash_into(&f, &files, Some(&info)).unwrap();
            assert!(!f.exists());
        }
        assert_eq!(
            std::fs::read_to_string(files.join("x.txt 1")).unwrap(),
            "data"
        );
        let note = std::fs::read_to_string(info.join("x.txt.trashinfo")).unwrap();
        assert!(note.starts_with("[Trash Info]\nPath=") && note.contains("DeletionDate=20"));
    }

    #[test]
    fn a_read_only_project_takes_no_file_action() {
        let (_t, s, root) = fx();
        std::fs::write(root.join("src/a.txt"), "a").unwrap();
        let on = shipyard_store::project::Overrides {
            read_only: Some(true),
            ..Default::default()
        };
        crate::commands::projects::save_overrides(&s, on).unwrap();
        assert!(
            create_file(&s, "n.txt", true)
                .unwrap_err()
                .contains("read only")
        );
        assert!(create_folder(&s, "n", true).is_err());
        assert!(rename(&s, "src/a.txt", "src/b.txt", true).is_err());
        assert!(delete(&s, "src/a.txt", true).is_err());
        assert!(root.join("src/a.txt").is_file());
    }
}
