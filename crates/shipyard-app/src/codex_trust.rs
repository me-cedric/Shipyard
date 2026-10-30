//! Trust the open project for Codex (Legacy `codex_repo_trusted`, `codex_trust_repo` in
//! `editor.rs`). Codex keeps trusted folders in `$CODEX_HOME/config.toml` and treats any other
//! folder more strictly. The write only appends a section: the rest of the file stays as it is.
//! It needs a click and obeys the read-only lock.

use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::commands::{AppState, Res, blocking, err};
use crate::work::need_click;

fn config() -> Res<PathBuf> {
    let home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME")
                .or_else(|| std::env::var_os("USERPROFILE"))
                .map(|h| PathBuf::from(h).join(".codex"))
        })
        .ok_or("cannot find the Codex home folder")?;
    Ok(home.join("config.toml"))
}

/// The `[projects."<folder>"]` header in the TOML quoting of Codex.
fn header(dir: &Path) -> String {
    let p = dir
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
    format!("[projects.\"{p}\"]")
}

fn trusted_in(text: &str, dir: &Path) -> bool {
    let h = header(dir);
    let Some(at) = text.find(&h) else {
        return false;
    };
    let section = &text[at + h.len()..];
    let section = section.split("\n[").next().unwrap_or(section);
    section
        .lines()
        .any(|l| l.replace(' ', "") == "trust_level=\"trusted\"")
}

fn trust_in(file: &Path, dir: &Path) -> Res<()> {
    let text = std::fs::read_to_string(file).unwrap_or_default();
    if trusted_in(&text, dir) {
        return Ok(());
    }
    let h = header(dir);
    if text.contains(&h) {
        return Err(format!(
            "{} already has a section for this folder with another trust level: change it there",
            file.display()
        ));
    }
    let mut out = text;
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    out.push_str(&format!(
        "\n# Added by Shipyard.\n{h}\ntrust_level = \"trusted\"\n"
    ));
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::write(file, out).map_err(err)
}

fn root(s: &AppState) -> Res<PathBuf> {
    Ok(s.registry()?
        .active()
        .ok_or("no active project")?
        .path
        .clone()
        .into())
}

#[tauri::command]
#[specta::specta]
pub async fn codex_trust_state(app: AppHandle) -> Res<bool> {
    blocking(app, |s| {
        let text = std::fs::read_to_string(config()?).unwrap_or_default();
        Ok(trusted_in(&text, &root(s)?))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn codex_trust(app: AppHandle, click: bool) -> Res<()> {
    blocking(app, move |s| {
        need_click(s, click)?;
        trust_in(&config()?, &root(s)?)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trust_appends_a_section_and_keeps_the_rest() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("c").join("config.toml");
        let dir = Path::new("/work/a\"b");
        trust_in(&file, dir).unwrap();
        assert!(trusted_in(&std::fs::read_to_string(&file).unwrap(), dir));
        std::fs::write(&file, "model = \"x\"").unwrap();
        trust_in(&file, dir).unwrap();
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(text.starts_with("model = \"x\"\n"));
        assert_eq!(text.matches("trust_level").count(), 1);
        trust_in(&file, dir).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), text);
    }

    #[test]
    fn another_trust_level_is_not_overwritten() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("config.toml");
        let dir = Path::new("/work/a");
        std::fs::write(
            &file,
            "[projects.\"/work/a\"]\ntrust_level = \"untrusted\"\n",
        )
        .unwrap();
        assert!(
            trust_in(&file, dir)
                .unwrap_err()
                .contains("another trust level")
        );
        assert!(!trusted_in(&std::fs::read_to_string(&file).unwrap(), dir));
    }
}
