//! Files and images that a person adds to an assistant turn. The bytes are saved and the
//! path is given back. A text file goes to the runner as a quote, which is data (REQ-006). An image is kept
//! in the scratch folder of the thread and its path goes in a quote: the CLI reads an image from a
//! path. Too big, a secret file name and a text that holds a secret are refused.
//!
//! shortcut: the scratch folder is outside the project, so a CLI that cannot read outside its
//! folder does not see the image. Move it into the work folder when a runner needs that.

use serde::Serialize;
use shipyard_core::code::is_secret_name;
use specta::Type;

use crate::commands::{Api, AppState, Res, blocking, err};

pub const MAX_TEXT: usize = 200 * 1024;
pub const MAX_IMAGE: usize = 2 * 1024 * 1024;
const IMAGES: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];

/// What the composer holds for one attachment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub name: String,
    /// `text` or `image`.
    pub kind: String,
    /// The text of a text file, or the line that names the image path for the runner.
    pub quote: String,
    pub bytes: u32,
}

fn plain_name(name: &str) -> Res<String> {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("").trim();
    if base.is_empty() || base.starts_with('.') || base.chars().any(char::is_control) {
        return Err("the file name is not valid".into());
    }
    if is_secret_name(base) {
        return Err("a secret file is never attached".into());
    }
    Ok(base.into())
}

/// Check the bytes and give the quote. An image is written under `scratch`.
pub fn attach(scratch: &std::path::Path, name: &str, bytes: &[u8]) -> Res<Attachment> {
    let name = plain_name(name)?;
    let ext = name
        .rsplit_once('.')
        .map_or("", |(_, e)| e)
        .to_ascii_lowercase();
    let size = bytes.len().min(u32::MAX as usize) as u32;
    if IMAGES.contains(&ext.as_str()) {
        if bytes.len() > MAX_IMAGE {
            return Err(format!("{name} is larger than {} KiB", MAX_IMAGE / 1024));
        }
        let dir = scratch.join("attachments");
        std::fs::create_dir_all(&dir).map_err(err)?;
        let path = dir.join(&name);
        std::fs::write(&path, bytes).map_err(err)?;
        return Ok(Attachment {
            kind: "image".into(),
            quote: format!("Image file for this request: {}", path.display()),
            bytes: size,
            name,
        });
    }
    if bytes.len() > MAX_TEXT {
        return Err(format!("{name} is larger than {} KiB", MAX_TEXT / 1024));
    }
    let text = String::from_utf8(bytes.to_vec())
        .map_err(|_| format!("{name} is not a text file or an image"))?;
    if !crate::code::scan_text(&name, &text).is_empty() {
        return Err(format!("{name} holds what looks like a secret"));
    }
    Ok(Attachment {
        kind: "text".into(),
        quote: text,
        bytes: size,
        name,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_attach(
    app: tauri::AppHandle,
    thread: String,
    name: String,
    bytes: Vec<u8>,
) -> Api<Attachment> {
    blocking(app, move |s: &AppState| {
        let e = s
            .registry()?
            .active()
            .cloned()
            .ok_or("no project is open")?;
        // The thread must exist, and its id is a plain name (it becomes a folder).
        shipyard_store::threads::Threads::new(&s.dir)
            .get(&e.id, &thread)
            .map_err(err)?;
        let scratch = s
            .dir
            .join("assistant")
            .join(&e.id)
            .join("scratch")
            .join(&thread);
        attach(&scratch, &name, &bytes)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_goes_inline_an_image_is_kept_and_the_rest_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let t = attach(dir.path(), "notes.md", b"hello").unwrap();
        assert_eq!((t.kind.as_str(), t.quote.as_str()), ("text", "hello"));
        let i = attach(dir.path(), "dir/shot.PNG", &[1, 2, 3]).unwrap();
        assert!(i.quote.contains("shot.PNG") && dir.path().join("attachments/shot.PNG").is_file());
        for (name, bytes) in [
            ("k.pem", b"x".to_vec()),
            ("id_rsa", b"x".to_vec()),
            ("a.bin", vec![0xff, 0xfe]),
            ("big.txt", vec![b'a'; MAX_TEXT + 1]),
            ("big.png", vec![0; MAX_IMAGE + 1]),
            ("t.txt", b"password = \"abcdefgh12345\"".to_vec()),
        ] {
            assert!(attach(dir.path(), name, &bytes).is_err(), "{name}");
        }
        // A dot file, which covers the environment files, is refused too.
        assert!(attach(dir.path(), ".hidden", b"A=1").is_err());
    }
}
