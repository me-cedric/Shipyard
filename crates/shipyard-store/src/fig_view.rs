//! A read-only view of a `.fig` file that Figma saved: its name and its preview picture. The file
//! is a zip archive with `meta.json` and `thumbnail.png`. The canvas itself is not read.
//! shortcut: an old `.fig` file (no zip) has no preview here; read the canvas when a view needs it.

use std::io::Read as _;

use serde::Serialize;
use specta::Type;

use crate::Result;

/// The bytes that the inflate of one entry may make.
const MAX_ENTRY: u64 = 16_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct FigView {
    /// The name of the file in Figma. Empty when the file does not name itself.
    pub name: String,
    /// The PNG preview of the first page.
    pub thumbnail: Option<Vec<u8>>,
}

fn entry(zip: &mut zip::ZipArchive<std::io::Cursor<&[u8]>>, name: &str) -> Option<Vec<u8>> {
    let e = zip.by_name(name).ok()?;
    let mut out = Vec::new();
    e.take(MAX_ENTRY + 1).read_to_end(&mut out).ok()?;
    (out.len() as u64 <= MAX_ENTRY).then_some(out)
}

pub fn read(bytes: &[u8]) -> Result<FigView> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|_| "this .fig file holds no preview: open it in Figma".to_string())?;
    let name = entry(&mut zip, "meta.json")
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .and_then(|v| {
            v.get("file_name")
                .and_then(|n| n.as_str())
                .map(String::from)
        })
        .unwrap_or_default();
    let thumbnail = entry(&mut zip, "thumbnail.png").filter(|b| b.starts_with(b"\x89PNG"));
    Ok(FigView { name, thumbnail })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;

    fn fig(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut out = std::io::Cursor::new(Vec::new());
        let mut z = zip::ZipWriter::new(&mut out);
        for (name, body) in files {
            z.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            z.write_all(body).unwrap();
        }
        z.finish().unwrap();
        out.into_inner()
    }

    #[test]
    fn the_name_and_the_preview_come_out_and_an_old_file_is_refused() {
        let png: &[u8] = b"\x89PNG\r\n\x1a\nrest";
        let v = read(&fig(&[
            ("meta.json", br#"{"file_name":"Checkout"}"#),
            ("thumbnail.png", png),
            ("canvas.fig", b"fig-kiwi"),
        ]))
        .unwrap();
        assert_eq!(v.name, "Checkout");
        assert_eq!(v.thumbnail.as_deref(), Some(png));
        let bare = read(&fig(&[("canvas.fig", b"fig-kiwi")])).unwrap();
        assert_eq!((bare.name.as_str(), bare.thumbnail), ("", None));
        assert!(read(b"fig-kiwi\x00\x00").is_err());
    }
}
