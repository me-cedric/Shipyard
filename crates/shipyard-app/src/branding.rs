//! The faces of the app: the logo of the project (a repository file), the picture of the person
//! (the app data folder) and the feedback e-mail. A picture is a PNG or a JPEG file of 1 MB or less.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::work::need_click;

const MAX_IMAGE: usize = 1_048_576;
/// The logo in the repository, without the extension.
const LOGO: &str = ".shipyard/logo";
const AVATAR: &str = "avatar";
const KINDS: [(&str, &str); 2] = [("png", "image/png"), ("jpg", "image/jpeg")];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Picture {
    /// The logo of the active project.
    Logo,
    /// The picture of the person.
    Avatar,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Image {
    pub mime: String,
    pub bytes: Vec<u8>,
}

/// The extension of the bytes: `png` or `jpg`. Other bytes are refused.
fn kind_of(bytes: &[u8]) -> Res<&'static str> {
    if bytes.len() > MAX_IMAGE {
        return Err("the picture is larger than 1 MB".into());
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Ok("jpg")
    } else {
        Err("the picture is not a PNG or a JPEG file".into())
    }
}

/// The file of a picture, without the extension.
fn base(s: &AppState, which: Picture) -> Res<PathBuf> {
    Ok(match which {
        Picture::Avatar => s.dir.join(AVATAR),
        Picture::Logo => {
            let reg = s.registry()?;
            let e = reg.active().ok_or("no active project")?;
            Path::new(&e.path).join(LOGO)
        }
    })
}

pub fn get(s: &AppState, which: Picture) -> Res<Option<Image>> {
    let base = base(s, which)?;
    for (ext, _) in KINDS {
        let f = base.with_extension(ext);
        // A cloned repository can hold a link to a private file, or a huge file: read neither.
        let plain =
            std::fs::symlink_metadata(&f).is_ok_and(|m| m.is_file() && m.len() <= MAX_IMAGE as u64);
        if !plain {
            continue;
        }
        if let Ok(bytes) = std::fs::read(&f)
            && let Ok(kind) = kind_of(&bytes)
        {
            let mime = KINDS
                .iter()
                .find(|(e, _)| *e == kind)
                .map_or("", |(_, m)| m);
            return Ok(Some(Image {
                mime: mime.into(),
                bytes,
            }));
        }
    }
    Ok(None)
}

/// Copy the picture at `path` (a file that a dialog gave) in place of the old one. `None` removes it.
pub fn set(s: &AppState, which: Picture, path: Option<&str>, click: bool) -> Res<()> {
    need_click(s, click)?;
    let base = base(s, which)?;
    let new = match path {
        Some(p) => {
            let p = Path::new(p);
            if !p.is_absolute() {
                return Err("the path is not absolute".into());
            }
            if std::fs::metadata(p).map_err(err)?.len() > MAX_IMAGE as u64 {
                return Err("the picture is larger than 1 MB".into());
            }
            let bytes = std::fs::read(p).map_err(err)?;
            Some((kind_of(&bytes)?, bytes))
        }
        None => None,
    };
    let _g = s.guard();
    for (ext, _) in KINDS {
        let f = base.with_extension(ext);
        if f.is_file() {
            std::fs::remove_file(f).map_err(err)?;
        }
    }
    if let Some((ext, bytes)) = new {
        shipyard_store::project::write_atomic(&base.with_extension(ext), &bytes).map_err(err)?;
    }
    Ok(())
}

/// The `mailto:` address of a feedback e-mail. The mail app of the person opens with it: the
/// person picks the recipient and sends. A text that holds a secret is refused.
pub fn mail_url(title: &str, details: &str) -> Res<String> {
    let url = crate::feedback::issue_url(crate::feedback::FeedbackKind::Bug, title, details)?;
    let query = url.split_once("&title=").map_or("", |(_, q)| q);
    let (subject, body) = query.split_once("&body=").unwrap_or((query, ""));
    Ok(format!("mailto:?subject={subject}&body={body}"))
}

#[tauri::command]
#[specta::specta]
pub async fn picture_get(app: AppHandle, which: Picture) -> Api<Option<Image>> {
    blocking(app, move |s| get(s, which)).await
}

#[tauri::command]
#[specta::specta]
pub async fn picture_set(
    app: AppHandle,
    which: Picture,
    path: Option<String>,
    click: bool,
) -> Api<()> {
    blocking(app, move |s| set(s, which, path.as_deref(), click)).await
}

/// Opens the mail app with the feedback, after a click. Nothing is sent by Shipyard.
#[tauri::command]
#[specta::specta]
pub async fn feedback_mail(
    app: AppHandle,
    title: String,
    details: String,
    click: bool,
) -> Api<String> {
    blocking(app, move |_| {
        if !click {
            return Err("this action needs the click of a person".into());
        }
        let url = mail_url(&title, &details)?;
        crate::feedback::open(&url)?;
        Ok(url)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work::tests::fx;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nrest";

    #[test]
    fn a_logo_is_a_png_or_jpeg_file_of_the_repository_after_a_click() {
        let f = fx();
        let dir = tempfile::tempdir().unwrap();
        let png = dir.path().join("logo.png");
        std::fs::write(&png, PNG).unwrap();
        let p = png.to_str().unwrap();
        assert_eq!(get(&f.s, Picture::Logo).unwrap(), None);
        assert!(set(&f.s, Picture::Logo, Some(p), false).is_err());
        assert!(set(&f.s, Picture::Logo, Some("logo.png"), true).is_err());
        set(&f.s, Picture::Logo, Some(p), true).unwrap();
        let img = get(&f.s, Picture::Logo).unwrap().unwrap();
        assert_eq!(
            (img.mime.as_str(), img.bytes.as_slice()),
            ("image/png", PNG)
        );
        assert!(f.repo.path().join(".shipyard/logo.png").is_file());
        let svg = dir.path().join("logo.svg");
        std::fs::write(&svg, "<svg/>").unwrap();
        assert!(set(&f.s, Picture::Logo, svg.to_str(), true).is_err());
        set(&f.s, Picture::Logo, None, true).unwrap();
        assert_eq!(get(&f.s, Picture::Logo).unwrap(), None);
    }

    #[test]
    fn a_logo_that_is_a_link_a_big_file_or_not_a_picture_is_not_read() {
        let f = fx();
        let shipyard = f.repo.path().join(".shipyard");
        std::fs::create_dir_all(&shipyard).unwrap();
        let logo = shipyard.join("logo.png");
        let outside = tempfile::tempdir().unwrap();
        let secret = outside.path().join("secret.png");
        std::fs::write(&secret, PNG).unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&secret, &logo).unwrap();
            assert_eq!(get(&f.s, Picture::Logo).unwrap(), None);
            std::fs::remove_file(&logo).unwrap();
        }
        std::fs::write(&logo, vec![0u8; MAX_IMAGE + 1]).unwrap();
        assert_eq!(get(&f.s, Picture::Logo).unwrap(), None);
        std::fs::write(&logo, "not a picture").unwrap();
        assert_eq!(get(&f.s, Picture::Logo).unwrap(), None);
        // The bytes decide the type, not the extension.
        std::fs::write(&logo, [0xFF, 0xD8, 0xFF, 0xE0, 1]).unwrap();
        assert_eq!(
            get(&f.s, Picture::Logo).unwrap().unwrap().mime,
            "image/jpeg"
        );
    }

    #[test]
    fn the_avatar_lives_in_the_app_data_folder() {
        let f = fx();
        let dir = tempfile::tempdir().unwrap();
        let jpg = dir.path().join("me.jpg");
        std::fs::write(&jpg, [0xFF, 0xD8, 0xFF, 0xE0, 1, 2]).unwrap();
        set(&f.s, Picture::Avatar, jpg.to_str(), true).unwrap();
        assert!(f.s.dir.join("avatar.jpg").is_file());
        assert_eq!(
            get(&f.s, Picture::Avatar).unwrap().unwrap().mime,
            "image/jpeg"
        );
    }

    #[test]
    fn the_feedback_mail_holds_the_subject_and_the_body_and_no_recipient() {
        let u = mail_url("A & B", "it breaks").unwrap();
        assert!(u.starts_with("mailto:?subject=A%20%26%20B&body=it%20breaks"));
        assert!(mail_url(" ", "").is_err());
        assert!(mail_url("t", "ghp_abcdefghijklmnopqrstuvwxyz0123456789").is_err());
    }
}
