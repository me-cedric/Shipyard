//! Document exports (spec `knowledge`, REQ-013 to REQ-016, ADR 0013).
//!
//! An export is a projection. The system builds it on demand from the sources that it reads at
//! that time, and never reads it back. A source that cannot be read gives a named gap and does
//! not fail the export. A day rate is never an input, so no export can hold one.
//!

use std::io::Cursor;

use docx_rs::{
    BreakType, Docx, Header, Paragraph, Pic, Run, Style, StyleType, Table, TableCell, TableRow,
};
use rust_xlsxwriter::{Format, Workbook};
use shipyard_core::work::Sheet;

use crate::Result;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Block {
    Heading(u8, String),
    Para(String),
    Code(String),
    Bullets(Vec<String>),
    Table {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    Image {
        png: Vec<u8>,
        caption: String,
    },
    /// A source that could not be read.
    Gap(String),
    PageBreak,
}

/// The cover data and the fixed words. The caller gives them in the language of the person.
#[derive(Debug, Clone)]
pub struct Meta {
    pub title: String,
    pub project: String,
    /// `YYYY-MM-DD`. The caller gives it, so the build stays pure.
    pub generated_on: String,
    /// The line of a section with no content.
    pub empty: String,
    /// The prefix of a gap line.
    pub gap: String,
    /// The prefix of the date line on the cover.
    pub generated: String,
}

pub enum Content {
    Markdown(String),
    Table {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    Image(Vec<u8>),
}

/// One source in a section. `Err` holds why the source could not be read.
pub struct Item {
    pub name: String,
    pub source: std::result::Result<Content, String>,
}

pub struct Section {
    pub title: String,
    pub items: Vec<Item>,
}

fn cover(m: &Meta) -> Vec<Block> {
    vec![
        Block::Heading(1, m.title.clone()),
        Block::Para(m.project.clone()),
        Block::Para(format!("{}: {}", m.generated, m.generated_on)),
    ]
}

/// The cover, then each section on a new page (REQ-015). A section with no item says so. An item
/// that cannot be read becomes a gap with its name and its reason.
pub fn assemble(m: &Meta, sections: &[Section]) -> Vec<Block> {
    let mut out = cover(m);
    for s in sections {
        out.push(Block::PageBreak);
        out.push(Block::Heading(1, s.title.clone()));
        if s.items.is_empty() {
            out.push(Block::Para(m.empty.clone()));
        }
        for i in &s.items {
            out.push(Block::Heading(2, i.name.clone()));
            match &i.source {
                Ok(Content::Markdown(md)) => out.extend(markdown_blocks(md, 3)),
                Ok(Content::Table { headers, rows }) => out.push(Block::Table {
                    headers: headers.clone(),
                    rows: rows.clone(),
                }),
                Ok(Content::Image(png)) if png_size(png).is_some() => out.push(Block::Image {
                    png: png.clone(),
                    caption: i.name.clone(),
                }),
                Ok(Content::Image(_)) => out.push(Block::Gap(format!(
                    "{}: {} (not a PNG image)",
                    m.gap, i.name
                ))),
                Err(why) => out.push(Block::Gap(format!("{}: {} ({why})", m.gap, i.name))),
            }
        }
    }
    out
}

/// The width and height of a PNG, or `None` when the bytes are not a PNG with a header.
fn png_size(png: &[u8]) -> Option<(u32, u32)> {
    let head = png.get(..24)?;
    let dim = |at: usize| u32::from_be_bytes(head[at..at + 4].try_into().expect("4 bytes"));
    (head[..8] == [137, 80, 78, 71, 13, 10, 26, 10]
        && &head[12..16] == b"IHDR"
        && dim(16) > 0
        && dim(20) > 0)
        .then(|| (dim(16), dim(20)))
}

/// An image source from the base64 text that the view sends. Bad text is a gap, not an error.
pub fn image_item(name: &str, base64_png: &str) -> Item {
    use base64::Engine as _;
    Item {
        name: name.into(),
        source: base64::engine::general_purpose::STANDARD
            .decode(base64_png.trim())
            .map(Content::Image)
            .map_err(|_| "not base64 text".into()),
    }
}

/// The tasks of an estimate sheet for the annex: task, role and days. The sheet holds no day
/// rate and this table adds none (REQ-014). A sheet that cannot be read, such as a sealed sheet
/// with no passphrase, gives a gap.
pub fn annex_item(name: &str, sheet: std::result::Result<&Sheet, String>) -> Item {
    Item {
        name: name.into(),
        source: sheet.map(|s| Content::Table {
            headers: ["Task", "Role", "Days"].map(String::from).to_vec(),
            rows: s
                .tasks()
                .map(|(_, t)| {
                    vec![
                        t.name.clone(),
                        t.role.clone(),
                        t.days.map_or(String::new(), |d| d.to_string()),
                    ]
                })
                .collect(),
        }),
    }
}

/// The operations of an OpenAPI file as rows: method, path, summary.
pub fn api_rows(text: &str) -> std::result::Result<Vec<Vec<String>>, String> {
    let doc: serde_norway::Value = serde_norway::from_str(text).map_err(|e| e.to_string())?;
    let mut rows = Vec::new();
    for (path, ops) in doc
        .get("paths")
        .and_then(|p| p.as_mapping())
        .into_iter()
        .flatten()
    {
        for (method, op) in ops.as_mapping().into_iter().flatten() {
            let m = method.as_str().unwrap_or_default();
            if ["get", "put", "post", "delete", "patch", "head", "options"].contains(&m) {
                let sum = op
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default();
                rows.push(vec![
                    m.to_uppercase(),
                    path.as_str().unwrap_or_default().into(),
                    sum.into(),
                ]);
            }
        }
    }
    Ok(rows)
}

/// The tables of a DBML file: a name and the rows column, type and attributes. A `Note`, an
/// `indexes` block and any block that is not a `Table` are left out.
pub fn dbml_tables(text: &str) -> Vec<(String, Vec<Vec<String>>)> {
    let mut out: Vec<(String, Vec<Vec<String>>)> = Vec::new();
    let (mut depth, mut in_table) = (0i32, false);
    for raw in text.lines() {
        let l = raw.trim();
        if l.starts_with("//") {
            continue;
        }
        let delta = l.matches('{').count() as i32 - l.matches('}').count() as i32;
        if depth == 0 {
            in_table = l.starts_with("Table ") || l.starts_with("table ");
            if in_table {
                let name = l[6..].split(['{', ' ']).next().unwrap_or("");
                out.push((name.trim_matches('"').to_string(), Vec::new()));
            }
        } else if in_table && depth == 1 && delta == 0 && !l.is_empty() && !l.starts_with("Note") {
            let (name, rest) = l.split_once(char::is_whitespace).unwrap_or((l, ""));
            let (ty, attrs) = rest.split_once('[').unwrap_or((rest, ""));
            if let Some((_, rows)) = out.last_mut() {
                rows.push(vec![
                    name.trim_matches('"').into(),
                    ty.trim().into(),
                    attrs.trim_end().trim_end_matches(']').into(),
                ]);
            }
        }
        depth = (depth + delta).max(0);
    }
    out
}

// ---------------------------------------------------------------- Markdown

fn cells(line: &str) -> Vec<String> {
    line.trim()
        .trim_matches('|')
        .split('|')
        .map(|c| c.trim().to_string())
        .collect()
}

fn is_row(l: &str) -> bool {
    let l = l.trim();
    l.len() > 1 && l.starts_with('|') && l.ends_with('|')
}

fn is_rule(l: &str) -> bool {
    is_row(l) && l.chars().all(|c| matches!(c, '|' | '-' | ':' | ' '))
}

/// A small Markdown reader: headings, bullets, fenced code, pipe tables and paragraphs. `base` is
/// the level of a `#` heading, so a file sits under the section that holds it.
pub fn markdown_blocks(md: &str, base: u8) -> Vec<Block> {
    let md = md
        .strip_prefix("---\n")
        .and_then(|r| r.split_once("\n---"))
        .map_or(md, |(_, body)| body.trim_start_matches(['\r', '\n']));
    let lines: Vec<&str> = md.lines().collect();
    let (mut out, mut para, mut bullets): (Vec<Block>, Vec<&str>, Vec<String>) =
        (Vec::new(), Vec::new(), Vec::new());
    let mut code: Option<Vec<&str>> = None;
    fn flush(out: &mut Vec<Block>, para: &mut Vec<&str>, bullets: &mut Vec<String>) {
        if !para.is_empty() {
            out.push(Block::Para(para.join(" ")));
            para.clear();
        }
        if !bullets.is_empty() {
            out.push(Block::Bullets(std::mem::take(bullets)));
        }
    }
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        i += 1;
        if line.trim_start().starts_with("```") {
            match code.take() {
                Some(c) => out.push(Block::Code(c.join("\n").trim_end().to_string())),
                None => {
                    flush(&mut out, &mut para, &mut bullets);
                    code = Some(Vec::new());
                }
            }
            continue;
        }
        if let Some(c) = code.as_mut() {
            c.push(line);
            continue;
        }
        let hashes = line.bytes().take_while(|&b| b == b'#').count();
        if (1..=6).contains(&hashes) && line[hashes..].starts_with(' ') {
            flush(&mut out, &mut para, &mut bullets);
            let level = (base + hashes as u8 - 1).clamp(1, 4);
            out.push(Block::Heading(level, line[hashes..].trim().into()));
            continue;
        }
        let t = line.trim_start();
        let item = t
            .strip_prefix(['-', '*', '+'])
            .or_else(|| {
                let d = t.trim_start_matches(|c: char| c.is_ascii_digit());
                (d.len() < t.len())
                    .then(|| d.strip_prefix(['.', ')']))
                    .flatten()
            })
            .filter(|r| r.starts_with(' '));
        if let Some(item) = item {
            if !para.is_empty() {
                flush(&mut out, &mut para, &mut bullets);
            }
            bullets.push(item.trim().into());
            continue;
        }
        if is_row(line) {
            flush(&mut out, &mut para, &mut bullets);
            let headers = cells(line);
            if lines.get(i).is_some_and(|l| is_rule(l)) {
                i += 1;
            }
            let mut rows = Vec::new();
            while i < lines.len() && is_row(lines[i]) && !is_rule(lines[i]) {
                rows.push(cells(lines[i]));
                i += 1;
            }
            out.push(Block::Table { headers, rows });
            continue;
        }
        if line.trim().is_empty() {
            flush(&mut out, &mut para, &mut bullets);
        } else {
            if !bullets.is_empty() {
                flush(&mut out, &mut para, &mut bullets);
            }
            para.push(line.trim());
        }
    }
    if let Some(c) = code {
        out.push(Block::Code(c.join("\n").trim_end().to_string()));
    }
    flush(&mut out, &mut para, &mut bullets);
    out
}

// ---------------------------------------------------------------- docx

/// XML 1.0 forbids these code points, and Word rejects a file that holds one.
fn safe(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(*c, '\0'..='\u{8}' | '\u{B}' | '\u{C}' | '\u{E}'..='\u{1F}'))
        .collect()
}

fn text(s: &str) -> Paragraph {
    Paragraph::new().add_run(Run::new().add_text(safe(s)))
}

fn cell(s: &str, bold: bool) -> TableCell {
    let run = Run::new().add_text(safe(s)).size(18);
    TableCell::new().add_paragraph(Paragraph::new().add_run(if bold { run.bold() } else { run }))
}

/// The `.docx` bytes of the blocks.
pub fn docx_bytes(m: &Meta, blocks: &[Block]) -> Result<Vec<u8>> {
    let mut doc = Docx::new().header(Header::new().add_paragraph(text(&m.title)));
    for (level, size) in [(1, 36), (2, 30), (3, 26), (4, 24)] {
        doc = doc.add_style(
            Style::new(format!("Heading{level}"), StyleType::Paragraph)
                .name(format!("heading {level}"))
                .size(size)
                .bold(),
        );
    }
    for b in blocks {
        doc = match b {
            Block::Heading(l, t) => {
                doc.add_paragraph(text(t).style(&format!("Heading{}", (*l).clamp(1, 4))))
            }
            Block::Para(t) => doc.add_paragraph(text(t)),
            Block::Code(t) => t.lines().fold(doc, |d, l| {
                d.add_paragraph(
                    Paragraph::new().add_run(
                        Run::new()
                            .add_text(safe(l))
                            .fonts(docx_rs::RunFonts::new().ascii("Courier New")),
                    ),
                )
            }),
            Block::Bullets(items) => items
                .iter()
                .fold(doc, |d, i| d.add_paragraph(text(&format!("\u{2022} {i}")))),
            Block::Table { headers, rows } => {
                let width = rows
                    .iter()
                    .map(Vec::len)
                    .fold(headers.len(), usize::max)
                    .max(1);
                let row = |r: &[String], bold| {
                    TableRow::new(
                        (0..width)
                            .map(|c| cell(r.get(c).map_or("", String::as_str), bold))
                            .collect(),
                    )
                };
                let mut all = vec![row(headers, true)];
                all.extend(rows.iter().map(|r| row(r, false)));
                doc.add_table(Table::new(all))
            }
            Block::Image { png, caption } => {
                // `assemble` kept only PNGs with a header. Scale to 15 cm wide at most.
                let (w, h) = png_size(png).unwrap_or((1, 1));
                let scale = (5_400_000.0 / (f64::from(w) * 9525.0)).min(1.0);
                let pic = Pic::new_with_dimensions(png.clone(), w, h).size(
                    (f64::from(w) * 9525.0 * scale) as u32,
                    (f64::from(h) * 9525.0 * scale) as u32,
                );
                doc.add_paragraph(Paragraph::new().add_run(Run::new().add_image(pic)))
                    .add_paragraph(text(caption))
            }
            Block::Gap(t) => doc.add_paragraph(
                Paragraph::new().add_run(Run::new().add_text(safe(t)).italic().color("B45309")),
            ),
            Block::PageBreak => {
                doc.add_paragraph(Paragraph::new().add_run(Run::new().add_break(BreakType::Page)))
            }
        };
    }
    let mut buf = Cursor::new(Vec::new());
    doc.build().pack(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf.into_inner())
}

// ---------------------------------------------------------------- xlsx

fn x<T>(r: std::result::Result<T, rust_xlsxwriter::XlsxError>) -> Result<()> {
    r.map(|_| ()).map_err(|e| e.to_string().into())
}

pub struct SheetOut {
    pub name: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

/// A client deliverable as `.xlsx` (REQ-016, Q-044 option 2): a `Cover` worksheet, then one
/// worksheet for each part, such as one for each security scan.
pub fn xlsx_bytes(m: &Meta, sheets: &[SheetOut]) -> Result<Vec<u8>> {
    let bold = Format::new().set_bold();
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    x(ws.set_name("Cover"))?;
    x(ws.write_with_format(0, 0, safe(&m.title), &bold))?;
    x(ws.write(1, 0, safe(&m.project)))?;
    x(ws.write(2, 0, format!("{}: {}", m.generated, m.generated_on)))?;
    for s in sheets {
        let ws = wb.add_worksheet();
        // A worksheet name holds 31 characters at most and none of `[]:*?/\`.
        let name: String = s
            .name
            .chars()
            .filter(|c| !"[]:*?/\\".contains(*c))
            .take(31)
            .collect();
        x(ws.set_name(if name.is_empty() { "Sheet" } else { &name }))?;
        for (c, h) in s.headers.iter().enumerate() {
            x(ws.write_with_format(0, c as u16, safe(h), &bold))?;
        }
        for (r, row) in s.rows.iter().enumerate() {
            for (c, v) in row.iter().enumerate() {
                x(ws.write(r as u32 + 1, c as u16, safe(v)))?;
            }
        }
    }
    wb.save_to_buffer()
        .map_err(|e| crate::Error::from(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::dbml_tables;

    #[test]
    fn dbml_tables_give_columns_and_skip_notes_indexes_and_other_blocks() {
        let t = dbml_tables(
            "Enum kind {\n  a\n}\nTable users as U {\n  id integer [pk, not null]\n  \"name\" varchar\n  Note: 'x'\n  indexes {\n    id\n  }\n}\nTable b {\n  x int\n}\n",
        );
        assert_eq!(t.len(), 2);
        assert_eq!(t[0].0, "users");
        assert_eq!(
            t[0].1,
            [["id", "integer", "pk, not null"], ["name", "varchar", ""]]
        );
        assert_eq!(t[1].1.len(), 1);
    }
}
