//! A read-only view of a `.docx` file: its paragraphs as text, with the heading level. The file
//! is a zip archive and the text sits in `word/document.xml`. Tables and lists come out as plain
//! paragraphs, and pictures and styles are left out.
//! shortcut: a scan of the XML text, no XML parser. Upgrade when a file needs more than text.

use std::io::Read as _;

use serde::Serialize;
use specta::Type;

use crate::Result;

/// The bytes that the inflate of `word/document.xml` may make.
const MAX_XML: u64 = 16_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Paragraph {
    /// 1 to 6 for a heading, 0 for a paragraph.
    pub heading: u8,
    pub text: String,
}

fn unescape(t: &str) -> String {
    t.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

/// The value of `w:val="..."` inside a tag text.
fn val(tag: &str) -> Option<&str> {
    let rest = &tag[tag.find("w:val=\"")? + 7..];
    rest.get(..rest.find('"')?)
}

fn heading_level(p: &str) -> u8 {
    let Some(at) = p.find("<w:pStyle") else {
        return 0;
    };
    let tag = &p[at..p[at..].find('>').map_or(p.len(), |e| at + e)];
    let style = val(tag).unwrap_or("").to_lowercase();
    let n = style.strip_prefix("heading").unwrap_or("");
    n.trim()
        .parse::<u8>()
        .ok()
        .filter(|n| (1..=6).contains(n))
        .unwrap_or(0)
}

fn paragraph_text(p: &str) -> String {
    let mut out = String::new();
    let mut rest = p;
    while let Some(at) = rest.find('<') {
        rest = &rest[at..];
        let end = rest.find('>').map_or(rest.len(), |e| e + 1);
        let tag = &rest[..end];
        if tag.starts_with("<w:t>") || tag.starts_with("<w:t ") {
            let body = &rest[end..];
            let close = body.find("</w:t>").unwrap_or(body.len());
            out.push_str(&unescape(&body[..close]));
            rest = &body[close..];
            continue;
        }
        if tag.starts_with("<w:tab") && !tag.starts_with("<w:tabs") {
            out.push('\t');
        } else if tag.starts_with("<w:br") || tag.starts_with("<w:cr") {
            out.push('\n');
        }
        rest = &rest[end..];
    }
    out
}

/// The paragraphs of the file, empty ones left out.
pub fn paragraphs(bytes: &[u8]) -> Result<Vec<Paragraph>> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|e| format!("not a .docx file: {e}"))?;
    let entry = zip
        .by_name("word/document.xml")
        .map_err(|_| "not a .docx file: no word/document.xml".to_string())?;
    let mut xml = String::new();
    entry
        .take(MAX_XML + 1)
        .read_to_string(&mut xml)
        .map_err(|e| format!("not a .docx file: {e}"))?;
    if xml.len() as u64 > MAX_XML {
        return Err("the .docx file is too big to show".to_string().into());
    }
    let mut out = Vec::new();
    let mut rest = xml.as_str();
    while let Some(at) = rest.find("<w:p>").or_else(|| rest.find("<w:p ")) {
        let body = &rest[at..];
        let end = body.find("</w:p>").unwrap_or(body.len());
        let p = &body[..end];
        let text = paragraph_text(p);
        if !text.trim().is_empty() {
            out.push(Paragraph {
                heading: heading_level(p),
                text,
            });
        }
        rest = &body[end..];
        rest = rest.strip_prefix("</w:p>").unwrap_or(rest);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;

    fn docx(xml: &str) -> Vec<u8> {
        let mut out = std::io::Cursor::new(Vec::new());
        let mut z = zip::ZipWriter::new(&mut out);
        z.start_file(
            "word/document.xml",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        z.write_all(xml.as_bytes()).unwrap();
        z.finish().unwrap();
        out.into_inner()
    }

    #[test]
    fn the_text_and_the_heading_level_of_each_paragraph_come_out() {
        let xml = r#"<w:document><w:body>
            <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Scope &amp; goals</w:t></w:r></w:p>
            <w:p><w:r><w:t xml:space="preserve">One </w:t></w:r><w:r><w:tab/><w:t>two</w:t></w:r></w:p>
            <w:p><w:pPr><w:tabs><w:tab w:val="left"/></w:tabs></w:pPr></w:p>
            </w:body></w:document>"#;
        let p = paragraphs(&docx(xml)).unwrap();
        assert_eq!(
            p,
            [
                Paragraph {
                    heading: 2,
                    text: "Scope & goals".into()
                },
                Paragraph {
                    heading: 0,
                    text: "One \ttwo".into()
                },
            ]
        );
        assert!(paragraphs(b"not a zip").is_err());
    }
}
