//! The Feedback action: open a prefilled issue of the Shipyard repository in the browser.
//! Nothing
//! is sent by the app: the person reads the form in the browser and submits it there. It runs
//! after a click, and a text that holds a secret is refused.

use specta::Type;

use crate::commands::{Api, Res, blocking};

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
    fn a_bad_title_a_long_text_and_a_secret_are_refused() {
        assert!(issue_url(FeedbackKind::Bug, " ", "").is_err());
        assert!(issue_url(FeedbackKind::Bug, "a\nb", "").is_err());
        assert!(issue_url(FeedbackKind::Bug, "t", &"x".repeat(MAX + 1)).is_err());
        assert!(
            issue_url(
                FeedbackKind::Bug,
                "t",
                "ghp_abcdefghijklmnopqrstuvwxyz0123456789"
            )
            .is_err()
        );
    }
}
