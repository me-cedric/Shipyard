//! The Feedback action: open a prefilled issue of the Shipyard repository in the browser.
//! Nothing
//! is sent by the app: the person reads the form in the browser and submits it there. It runs
//! after a click, and a text that holds a secret is refused.

use specta::Type;

use std::path::{Path, PathBuf};

use crate::commands::{Api, AppState, Res, blocking, err};

const REPO: &str = "https://github.com/me-cedric/Shipyard";
const MAX: usize = 4000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum FeedbackKind {
    Bug,
    Idea,
}

fn encode(text: &str) -> String {
    text.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

/// The address of the new-issue form, with the title, the label and a body that names the build.
pub fn issue_url(kind: FeedbackKind, title: &str, details: &str) -> Res<String> {
    let title = title.trim();
    if title.is_empty() || title.contains(['\n', '\r']) || title.len() > 120 {
        return Err("the title must be one line of 120 characters or fewer".into());
    }
    if details.len() > MAX {
        return Err(format!("the details are longer than {MAX} characters"));
    }
    if !crate::code::scan_text("feedback", &format!("{title}\n{details}")).is_empty() {
        return Err("the text holds what looks like a secret".into());
    }
    let label = if kind == FeedbackKind::Bug {
        "bug"
    } else {
        "enhancement"
    };
    let body = format!(
        "{}\n\n---\nShipyard {} on {} {}",
        details.trim(),
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    Ok(format!(
        "{REPO}/issues/new?labels={label}&title={}&body={}",
        encode(title),
        encode(&body)
    ))
}

pub(crate) fn open(url: &str) -> Res<()> {
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut cmd = std::process::Command::new("xdg-open");
    cmd.arg(url)
        .spawn()
        .map_err(|e| format!("cannot open: {e}"))?;
    Ok(())
}

/// The most that an attached file may weigh.
const MAX_ATTACH: u64 = 25 * 1024 * 1024;

/// Attach a file to the feedback (`shell-setup-rights` REQ-009). The app sends nothing: it copies
/// the file that the person picked into the `feedback` folder of the app data, and the view shows
/// that copy in the file manager, beside the text of the feedback. The person drags it into the
/// form in the browser. The copy never holds more than 25 MB, and the name keeps plain characters.
pub fn attach(s: &AppState, path: &str, click: bool) -> Res<PathBuf> {
    crate::rights::need_click_local(s, click)?;
    let from = Path::new(path);
    if !from.is_absolute() {
        return Err("the file needs a full path".into());
    }
    let meta = std::fs::metadata(from).map_err(err)?;
    if !meta.is_file() {
        return Err("this is not a file".into());
    }
    if meta.len() > MAX_ATTACH {
        return Err("the file is over 25 MB".into());
    }
    let name: String = from
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let name = name.trim_matches('.').trim();
    if name.is_empty() {
        return Err("the file has no name".into());
    }
    let dir = s.dir.join("feedback");
    std::fs::create_dir_all(&dir).map_err(err)?;
    // A second file with the same name keeps its own copy.
    let mut to = dir.join(name);
    for n in 1.. {
        if !to.exists() {
            break;
        }
        to = dir.join(format!("{n}-{name}"));
    }
    std::fs::copy(from, &to).map_err(err)?;
    Ok(to)
}

/// Copy a file for the feedback and give the copy to show.
#[tauri::command]
#[specta::specta]
pub async fn feedback_attach(app: tauri::AppHandle, path: String, click: bool) -> Api<String> {
    blocking(app, move |s| {
        Ok(attach(s, &path, click)?.display().to_string())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn feedback_open(
    app: tauri::AppHandle,
    kind: FeedbackKind,
    title: String,
    details: String,
    click: bool,
) -> Api<String> {
    blocking(app, move |_| {
        if !click {
            return Err("this action needs the click of a person".into());
        }
        let url = issue_url(kind, &title, &details)?;
        open(&url)?;
        Ok(url)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_address_holds_the_label_the_encoded_text_and_the_build() {
        let u = issue_url(FeedbackKind::Bug, "A & B", "it breaks\nsoon").unwrap();
        assert!(u.starts_with("https://github.com/me-cedric/Shipyard/issues/new?labels=bug&title=A%20%26%20B&body=it%20breaks%0Asoon"));
        assert!(u.contains("Shipyard%20"));
        assert!(
            issue_url(FeedbackKind::Idea, "x", "")
                .unwrap()
                .contains("labels=enhancement")
        );
    }

    #[test]
    fn an_attached_file_is_copied_into_the_data_folder_and_nothing_leaves() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let shot = dir.path().join("shot 1.png");
        std::fs::write(&shot, "png").unwrap();
        let a = attach(&s, shot.to_str().unwrap(), true).unwrap();
        assert!(a.starts_with(dir.path().join("data/feedback")));
        assert_eq!(std::fs::read_to_string(&a).unwrap(), "png");
        assert!(shot.exists(), "the file of the person stays");
        // The same name keeps a second copy, and a strange name gets plain characters.
        let b = attach(&s, shot.to_str().unwrap(), true).unwrap();
        assert_ne!(a, b);
        let odd = dir.path().join("a;b$c.txt");
        std::fs::write(&odd, "x").unwrap();
        let c = attach(&s, odd.to_str().unwrap(), true).unwrap();
        assert_eq!(c.file_name().unwrap(), "a_b_c.txt");
    }

    #[test]
    fn an_attach_needs_a_click_a_full_path_and_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let f = dir.path().join("a.txt");
        std::fs::write(&f, "x").unwrap();
        assert!(attach(&s, f.to_str().unwrap(), false).is_err());
        assert!(attach(&s, "a.txt", true).is_err());
        assert!(attach(&s, dir.path().to_str().unwrap(), true).is_err());
        assert!(attach(&s, dir.path().join("none").to_str().unwrap(), true).is_err());
        assert!(!dir.path().join("data/feedback").exists());
    }

    #[test]
    fn a_bad_title_a_long_text_and_a_secret_are_refused() {
        assert!(issue_url(FeedbackKind::Bug, " ", "").is_err());
        assert!(issue_url(FeedbackKind::Bug, "a\nb", "").is_err());
        assert!(issue_url(FeedbackKind::Bug, "t", &"x".repeat(MAX + 1)).is_err());
        assert!(
            issue_url(
                FeedbackKind::Bug,
                "t",
                "ghp_abcdefghijklmnopqrstuvwxyz0123456789" // gitleaks:allow
            )
            .is_err()
        );
    }
}
