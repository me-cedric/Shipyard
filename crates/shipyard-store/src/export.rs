//! Document exports (spec `knowledge`, REQ-013 to REQ-016, ADR 0013).
//!
//! An export is a projection. The system builds it on demand from the sources that it reads at
//! that time, and never reads it back. A source that cannot be read gives a named gap and does
//! not fail the export. A day rate is never an input, so no export can hold one.
//!

use std::io::Cursor;

use docx_rs::{
    AbstractNumbering, AlignmentType, BreakType, Docx, Footer, Header, Hyperlink, HyperlinkType,
    IndentLevel, Level, LevelJc, LevelText, LineSpacing, LineSpacingType, NumberFormat, Numbering,
    NumberingId, PageNum, Paragraph, Pic, Run, RunFonts, Shading, SpecialIndentType, Start, Style,
    StyleType, Table, TableCell, TableOfContents, TableRow,
};
use rust_xlsxwriter::{Color, ExcelDateTime, Format, FormatAlign, FormatBorder, Workbook};
use shipyard_core::work::Sheet;

use crate::Result;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Block {
    /// The title on the cover. It is not a heading, so the contents list skips it.
    Title(String),
    /// A line under the title on the cover.
    Subtitle(String),
    /// The contents list, a field that Word fills when the file opens. The text is its title.
    Toc(String),
    Heading(u8, String),
    Para(String),
    Code(String),
    Bullets(Vec<String>),
    Table {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    /// A picture. The heading of its item is its title.
    Image {
        png: Vec<u8>,
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
    /// The title of the contents list.
    pub contents: String,
}

pub enum Content {
    Markdown(String),
    /// A source text kept as a code block.
    Code(String),
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
        Block::Title(m.title.clone()),
        Block::Subtitle(m.project.clone()),
        Block::Subtitle(format!("{}: {}", m.generated, m.generated_on)),
        Block::PageBreak,
        Block::Toc(m.contents.clone()),
    ]
}

/// The letters and digits of a text in lower case, to compare two titles.
fn plain(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// The cover and the contents list, then each section on a new page (REQ-015). A section with no item says so. An item
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
                Ok(Content::Markdown(md)) => {
                    let mut blocks = markdown_blocks(md, 3);
                    // The item name is already a heading: do not show the same title twice.
                    if let Some(Block::Heading(_, h)) = blocks.first() {
                        let (h, n) = (plain(h), plain(&i.name));
                        if !h.is_empty() && (n.contains(&h) || h.contains(&n)) {
                            blocks.remove(0);
                        }
                    }
                    out.extend(blocks);
                }
                Ok(Content::Code(text)) => out.push(Block::Code(text.clone())),
                Ok(Content::Table { headers, rows }) => out.push(Block::Table {
                    headers: headers.clone(),
                    rows: rows.clone(),
                }),
                Ok(Content::Image(png)) if png_size(png).is_some() => {
                    out.push(Block::Image { png: png.clone() })
                }
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

const BODY_FONT: &str = "Calibri";
const MONO_FONT: &str = "Consolas";

fn font(name: &str) -> RunFonts {
    RunFonts::new()
        .ascii(name)
        .hi_ansi(name)
        .east_asia(name)
        .cs(name)
}

/// The text of `s` as bold runs (`**bold**`) and hyperlinks (`[text](https://…)`) in `p`. Only
/// `http`, `https` and `mailto` links become links; other text stays text. One level: no bold in a link.
fn rich(mut p: Paragraph, s: &str, size: Option<usize>) -> Paragraph {
    let run = |t: &str| {
        let r = Run::new().add_text(t);
        size.map_or(r.clone(), |n| r.size(n))
    };
    let mut rest = s;
    let mut plain = String::new();
    while !rest.is_empty() {
        if let Some(r) = rest.strip_prefix("**")
            && let Some(end) = r.find("**").filter(|e| *e > 0)
        {
            if !plain.is_empty() {
                p = p.add_run(run(&std::mem::take(&mut plain)));
            }
            p = p.add_run(run(&r[..end]).bold());
            rest = &r[end + 2..];
        } else if let Some(r) = rest.strip_prefix('[')
            && let Some((label, tail)) = r.split_once("](")
            && let Some((url, after)) = tail.split_once(')')
            && !label.is_empty()
            && ["http://", "https://", "mailto:"]
                .iter()
                .any(|k| url.starts_with(k))
        {
            if !plain.is_empty() {
                p = p.add_run(run(&std::mem::take(&mut plain)));
            }
            let text = run(label).color("0563C1").underline("single");
            p = p.add_hyperlink(Hyperlink::new(url, HyperlinkType::External).add_run(text));
            rest = after;
        } else {
            let c = rest.chars().next().unwrap_or_default();
            plain.push(c);
            rest = &rest[c.len_utf8()..];
        }
    }
    if !plain.is_empty() {
        p = p.add_run(run(&plain));
    }
    p
}

/// The paragraph of a text. A span between backticks has the monospace font; the rest takes
/// bold and links (`rich`).
fn inline(s: &str, size: Option<usize>) -> Paragraph {
    let s = safe(s);
    // An odd count of backticks means no pairs: keep the text as it is.
    if s.matches('`').count() % 2 == 1 {
        return rich(Paragraph::new(), &s, size);
    }
    s.split('`')
        .enumerate()
        .filter(|(_, part)| !part.is_empty())
        .fold(Paragraph::new(), |p, (i, part)| {
            if i % 2 == 1 {
                let r = Run::new().add_text(part).fonts(font(MONO_FONT));
                p.add_run(size.map_or(r.clone(), |n| r.size(n)))
            } else {
                rich(p, part, size)
            }
        })
}

fn text(s: &str) -> Paragraph {
    inline(s, None)
}

fn cell(s: &str, head: bool) -> TableCell {
    let p = inline(s, Some(18));
    let c = TableCell::new().add_paragraph(if head { p.bold() } else { p });
    if head {
        c.shading(Shading::new().fill("E5E7EB"))
    } else {
        c
    }
}

/// A paragraph style. Sizes are in half points, spacing in twentieths of a point.
fn style(id: &str, name: &str, size: usize, color: &str, before: u32, after: u32) -> Style {
    Style::new(id, StyleType::Paragraph)
        .name(name)
        .based_on("Normal")
        .next("Normal")
        .size(size)
        .color(color)
        .line_spacing(LineSpacing::new().before(before).after(after))
}

/// The `.docx` bytes of the blocks.
pub fn docx_bytes(m: &Meta, blocks: &[Block]) -> Result<Vec<u8>> {
    let footer = Footer::new().add_paragraph(
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_page_num(PageNum::new()),
    );
    let bullet = Level::new(
        0,
        Start::new(1),
        NumberFormat::new("bullet"),
        LevelText::new("\u{2022}"),
        LevelJc::new("left"),
    )
    .indent(Some(720), Some(SpecialIndentType::Hanging(360)), None, None);
    let mut doc = Docx::new()
        .default_fonts(font(BODY_FONT))
        .default_size(22)
        .default_line_spacing(
            LineSpacing::new()
                .line_rule(LineSpacingType::Auto)
                .line(288)
                .after(120),
        )
        .header(Header::new().add_paragraph(text(&m.title)))
        .footer(footer)
        .title_pg()
        .add_abstract_numbering(AbstractNumbering::new(1).add_level(bullet))
        .add_numbering(Numbering::new(1, 1))
        .add_style(style("Title", "Title", 60, "1F3864", 2400, 240).bold())
        .add_style(style("Subtitle", "Subtitle", 28, "4B5563", 0, 120))
        .add_style(style("TocTitle", "TOC Heading", 32, "1F3864", 0, 240).bold())
        .add_style(
            Style::new("Code", StyleType::Paragraph)
                .name("Code")
                .based_on("Normal")
                .fonts(font(MONO_FONT))
                .size(18)
                .line_spacing(LineSpacing::new().after(0)),
        );
    for (level, size, before) in [(1, 36, 360), (2, 30, 280), (3, 26, 200), (4, 24, 160)] {
        doc = doc.add_style(
            style(
                &format!("Heading{level}"),
                &format!("heading {level}"),
                size,
                "1F3864",
                before,
                120,
            )
            .bold()
            .outline_lvl(level - 1),
        );
    }
    for b in blocks {
        doc = match b {
            Block::Title(t) => doc.add_paragraph(text(t).style("Title")),
            Block::Subtitle(t) => doc.add_paragraph(text(t).style("Subtitle")),
            Block::Toc(t) => doc
                .add_paragraph(text(t).style("TocTitle"))
                .add_table_of_contents(
                    TableOfContents::new()
                        .heading_styles_range(1, 3)
                        .hyperlink()
                        .dirty(),
                ),
            Block::Heading(l, t) => {
                doc.add_paragraph(text(t).style(&format!("Heading{}", (*l).clamp(1, 4))))
            }
            Block::Para(t) => doc.add_paragraph(text(t)),
            Block::Code(t) => t.lines().fold(doc, |d, l| {
                let run = Run::new().add_text(safe(l));
                d.add_paragraph(Paragraph::new().add_run(run).style("Code"))
            }),
            Block::Bullets(items) => items.iter().fold(doc, |d, i| {
                d.add_paragraph(text(i).numbering(NumberingId::new(1), IndentLevel::new(0)))
            }),
            Block::Table { headers, rows } => {
                let width = rows
                    .iter()
                    .map(Vec::len)
                    .fold(headers.len(), usize::max)
                    .max(1);
                let row = |r: &[String], head| {
                    TableRow::new(
                        (0..width)
                            .map(|c| cell(r.get(c).map_or("", String::as_str), head))
                            .collect(),
                    )
                };
                let mut all = vec![row(headers, true)];
                all.extend(rows.iter().map(|r| row(r, false)));
                doc.add_table(Table::new(all))
            }
            Block::Image { png } => {
                let (w, h) = png_size(png).unwrap_or((1, 1));
                let scale = (5_400_000.0 / (f64::from(w) * 9525.0)).min(1.0);
                let pic = Pic::new_with_dimensions(png.clone(), w, h).size(
                    (f64::from(w) * 9525.0 * scale) as u32,
                    (f64::from(h) * 9525.0 * scale) as u32,
                );
                doc.add_paragraph(Paragraph::new().add_run(Run::new().add_image(pic)))
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

fn x<T>(r: std::result::Result<T, rust_xlsxwriter::XlsxError>) -> Result<()> {
    r.map(|_| ()).map_err(|e| e.to_string().into())
}

pub struct SheetOut {
    pub name: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

/// A plain number: digits with one optional point, no leading zero, so an id or a code stays text.
fn number(v: &str) -> Option<f64> {
    let d = v.strip_prefix('-').unwrap_or(v);
    let (int, frac) = d.split_once('.').map_or((d, None), |(i, f)| (i, Some(f)));
    let digits = |t: &str| !t.is_empty() && t.bytes().all(|b| b.is_ascii_digit());
    (digits(int)
        && int.len() <= 15
        && (int == "0" || !int.starts_with('0'))
        && frac.is_none_or(digits))
    .then(|| v.parse().ok())
    .flatten()
}

/// A `YYYY-MM-DD` date.
fn date(v: &str) -> Option<ExcelDateTime> {
    let b = v.as_bytes();
    (b.len() == 10 && b[4] == b'-' && b[7] == b'-')
        .then(|| ExcelDateTime::parse_from_str(v).ok())
        .flatten()
}

/// A client deliverable as `.xlsx` (REQ-016, Q-044 option 2): a `Cover` worksheet, then one
/// worksheet for each part, such as one for each security scan. A header row is bold on a dark
/// fill and stays on screen. A number and a `YYYY-MM-DD` date are real cells with a format.
pub fn xlsx_bytes(m: &Meta, sheets: &[SheetOut]) -> Result<Vec<u8>> {
    let title = Format::new().set_bold().set_font_size(16);
    let head = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x1F3864))
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Top)
        .set_text_wrap();
    let wrap = Format::new().set_align(FormatAlign::Top).set_text_wrap();
    let whole = Format::new().set_num_format("0");
    let decimal = Format::new().set_num_format("#,##0.00");
    let day = Format::new()
        .set_num_format("yyyy-mm-dd")
        .set_align(FormatAlign::Left);
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    x(ws.set_name("Cover"))?;
    x(ws.write_with_format(0, 0, safe(&m.title), &title))?;
    x(ws.write(1, 0, safe(&m.project)))?;
    x(ws.write(2, 0, format!("{}: {}", m.generated, m.generated_on)))?;
    x(ws.set_column_width(0, 48))?;
    for s in sheets {
        let ws = wb.add_worksheet();
        let name: String = s
            .name
            .chars()
            .filter(|c| !"[]:*?/\\".contains(*c))
            .take(31)
            .collect();
        x(ws.set_name(if name.is_empty() { "Sheet" } else { &name }))?;
        for (c, h) in s.headers.iter().enumerate() {
            x(ws.write_with_format(0, c as u16, safe(h), &head))?;
        }
        for (r, row) in s.rows.iter().enumerate() {
            for (c, v) in row.iter().enumerate() {
                let (r, c) = (r as u32 + 1, c as u16);
                if let Some(n) = number(v) {
                    x(ws.write_number_with_format(
                        r,
                        c,
                        n,
                        if v.contains('.') { &decimal } else { &whole },
                    ))?;
                } else if let Some(d) = date(v) {
                    x(ws.write_datetime_with_format(r, c, &d, &day))?;
                } else {
                    x(ws.write_string_with_format(r, c, safe(v), &wrap))?;
                }
            }
        }
        // Width of the longest cell, from 10 to 60 characters.
        let cols = s
            .rows
            .iter()
            .map(Vec::len)
            .fold(s.headers.len(), usize::max);
        for c in 0..cols {
            let longest = std::iter::once(s.headers.get(c))
                .chain(s.rows.iter().map(|r| r.get(c)))
                .flatten()
                .map(|v| v.chars().count())
                .max()
                .unwrap_or(0);
            x(ws.set_column_width(c as u16, (longest as f64 + 2.0).clamp(10.0, 60.0)))?;
        }
        x(ws.set_freeze_panes(1, 0))?;
        if cols > 0 {
            x(ws.autofilter(0, 0, s.rows.len() as u32, cols as u16 - 1))?;
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
