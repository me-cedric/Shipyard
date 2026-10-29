//! Excel import and export of an estimate sheet (spec `work`, REQ-012, REQ-013).
//!
//! The layout follows the CGI costing tool. Worksheet `Estimate`, one header row, columns found by
//! the header text and not by the position: `Type` (Cluster, Feature, Task), `Scope`, `Title`,
//! `Description`, `Profile`, `Hypotheses`, `Charge Mode` (`Days` or `Other (Ratio)`),
//! `Effort (Days)`, `Effort (Ratio)` (a fraction in a percentage cell), `Comments`, `Kind`,
//! `Shipyard ID` and `Ticket`. A `Settings` worksheet holds the name, the currency and the margin
//! rate. The export adds a `Summary` worksheet with the totals as values.
//!
//! A workbook is untrusted input. `preview` reads it, refuses each row that it cannot trust with
//! its row number and reason, and writes nothing. `replace_sheet` writes after a confirmation only.

use crate::seal::SealError;
use crate::work::{WorkError, write_sheet};
use calamine::{Data, Range, Reader, Xlsx};
use rust_xlsxwriter::{Format, Workbook};
use serde::Serialize;
use shipyard_core::work::{Feature, Sheet, Task, totals};
use specta::Type;
use std::collections::{BTreeMap, BTreeSet};
use std::io::Cursor;
use std::path::Path;

/// The largest workbook that `preview` reads, in bytes.
pub const MAX_BYTES: usize = 10 * 1024 * 1024;
const MAX_ROWS: usize = 20_000;
const ESTIMATE: &str = "Estimate";
const RATIO_MODE: &str = "Other (Ratio)";

#[derive(Debug, thiserror::Error)]
pub enum ExcelError {
    #[error("not a readable workbook: {0}")]
    Read(String),
    /// The workbook lacks a column that the layout needs.
    #[error("{0}")]
    Layout(String),
    #[error("the workbook holds no feature and no task")]
    Empty,
    #[error("the import needs the confirmation of a person")]
    NotConfirmed,
    #[error("{0}")]
    Write(String),
    #[error(transparent)]
    Sheet(#[from] WorkError),
}

impl From<SealError> for ExcelError {
    fn from(e: SealError) -> Self {
        WorkError::from(e).into()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RefusedRow {
    /// The row number in Excel, from 1.
    pub row: u32,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub sheet: Sheet,
    /// The lots that the workbook holds, in order of first use.
    pub scopes: Vec<String>,
    /// The lot that `sheet` reads. Other lots are left out, not refused.
    pub scope: Option<String>,
    pub refused: Vec<RefusedRow>,
}

// ---------------------------------------------------------------- read

fn text(cell: Option<&Data>) -> String {
    match cell {
        Some(Data::String(s)) => s.trim().to_string(),
        Some(Data::Float(f)) if f.fract() == 0.0 && f.abs() < 1e15 => format!("{}", *f as i64),
        Some(Data::Float(f)) => f.to_string(),
        Some(Data::Int(i)) => i.to_string(),
        Some(Data::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

/// A number, or `None` for an empty cell. `Err` for text that is not a number.
fn number(cell: Option<&Data>) -> Result<Option<f64>, ()> {
    match cell {
        Some(Data::Float(f)) => Ok(Some(*f)),
        Some(Data::Int(i)) => Ok(Some(*i as f64)),
        Some(Data::String(s)) if !s.trim().is_empty() => {
            s.trim().replace(',', ".").parse().map(Some).map_err(|_| ())
        }
        Some(Data::String(_) | Data::Empty) | None => Ok(None),
        Some(_) => Err(()),
    }
}

/// The id of a row: lower case letters, digits and `-`. A title with no usable character gives `row`.
fn slug(title: &str) -> String {
    let mut out = String::new();
    for c in title.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() { "row".into() } else { out }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && !id.starts_with('-')
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

fn unique(base: &str, used: &mut BTreeSet<String>) -> String {
    let mut id = base.to_string();
    let mut n = 2;
    while used.contains(&id) {
        id = format!("{base}-{n}");
        n += 1;
    }
    used.insert(id.clone());
    id
}

struct Columns(BTreeMap<String, usize>);

impl Columns {
    fn get<'a>(&self, row: &'a [Data], name: &str) -> Option<&'a Data> {
        row.get(*self.0.get(name)?)
    }

    fn text(&self, row: &[Data], name: &str) -> String {
        text(self.get(row, name))
    }
}

/// The header row: the first of the first ten rows that has a `Type` and a `Title` cell.
fn header(range: &Range<Data>) -> Result<(usize, Columns), ExcelError> {
    for (i, row) in range.rows().take(10).enumerate() {
        let cols: BTreeMap<String, usize> = row
            .iter()
            .enumerate()
            .map(|(c, d)| (text(Some(d)).to_lowercase(), c))
            .filter(|(h, _)| !h.is_empty())
            .collect();
        if cols.contains_key("type") && cols.contains_key("title") {
            if !cols.contains_key("effort (days)") && !cols.contains_key("effort (ratio)") {
                return Err(ExcelError::Layout(
                    "the workbook has no column `Effort (Days)`".into(),
                ));
            }
            return Ok((i, Columns(cols)));
        }
    }
    let first = range.rows().next().unwrap_or_default();
    let missing = if first
        .iter()
        .any(|d| text(Some(d)).eq_ignore_ascii_case("type"))
    {
        "Title"
    } else {
        "Type"
    };
    Err(ExcelError::Layout(format!(
        "the workbook has no column `{missing}`"
    )))
}

/// Read a workbook into a sheet and list the rows that it refuses. It writes nothing (REQ-012).
/// `scope` picks the lot when the workbook holds several; `None` takes the first.
pub fn preview(bytes: &[u8], scope: Option<&str>) -> Result<Preview, ExcelError> {
    if bytes.len() > MAX_BYTES {
        return Err(ExcelError::Read(format!(
            "the file is larger than {MAX_BYTES} bytes"
        )));
    }
    let mut wb = Xlsx::new(Cursor::new(bytes)).map_err(|e| ExcelError::Read(e.to_string()))?;
    let names = wb.sheet_names();
    let name = names
        .iter()
        .find(|n| n.eq_ignore_ascii_case(ESTIMATE))
        .or_else(|| names.first())
        .cloned()
        .ok_or_else(|| ExcelError::Read("the workbook has no worksheet".into()))?;
    let range = wb
        .worksheet_range(&name)
        .map_err(|e| ExcelError::Read(e.to_string()))?;
    if range.height() > MAX_ROWS {
        return Err(ExcelError::Read(format!(
            "the worksheet has more than {MAX_ROWS} rows"
        )));
    }
    let (head, cols) = header(&range)?;
    let settings = settings(&mut wb);

    let first_row = range.start().map_or(0, |s| s.0 as usize);
    let mut scopes: Vec<String> = Vec::new();
    let mut chosen: Option<String> = scope.map(String::from);
    let mut refused = Vec::new();
    let mut used = BTreeSet::new();
    let mut features: Vec<Feature> = Vec::new();
    for (i, row) in range.rows().enumerate().skip(head + 1) {
        let number_in_file = (first_row + i + 1) as u32;
        let kind = cols.text(row, "type").to_lowercase();
        if kind.is_empty() || kind == "cluster" {
            continue;
        }
        let refuse = |reason: String| RefusedRow {
            row: number_in_file,
            reason,
        };
        if kind != "feature" && kind != "task" {
            refused.push(refuse(format!("unknown type `{}`", cols.text(row, "type"))));
            continue;
        }
        let lot = cols.text(row, "scope");
        if !lot.is_empty() && !scopes.contains(&lot) {
            scopes.push(lot.clone());
        }
        if !lot.is_empty() && *chosen.get_or_insert_with(|| lot.clone()) != lot {
            continue;
        }
        let title = cols.text(row, "title");
        if title.is_empty() {
            refused.push(refuse("the title is empty".into()));
            continue;
        }
        let given = cols.text(row, "shipyard id");
        let id = if valid_id(&given) && !used.contains(&given) {
            used.insert(given.clone());
            given
        } else {
            unique(&slug(&title), &mut used)
        };
        if kind == "feature" {
            features.push(Feature {
                id,
                name: title,
                description: cols.text(row, "description"),
                tasks: vec![],
            });
            continue;
        }
        let Some(feature) = features.last_mut() else {
            used.remove(&id);
            refused.push(refuse("a task comes before any feature".into()));
            continue;
        };
        match task(&cols, row, id.clone(), title) {
            Ok(t) => feature.tasks.push(t),
            Err(reason) => {
                used.remove(&id);
                refused.push(refuse(reason));
            }
        }
    }
    let sheet_name = settings
        .get("name")
        .filter(|n| !n.is_empty())
        .cloned()
        .or_else(|| chosen.clone())
        .unwrap_or_default();
    let sheet = Sheet {
        name: sheet_name,
        currency: settings
            .get("currency")
            .cloned()
            .filter(|c| !c.is_empty())
            .unwrap_or_else(|| "EUR".into()),
        margin_rate: settings
            .get("margin rate")
            .and_then(|m| m.parse().ok())
            .unwrap_or(0.0),
        features,
    };
    Ok(Preview {
        sheet,
        scopes,
        scope: chosen,
        refused,
    })
}

fn task(cols: &Columns, row: &[Data], id: String, title: String) -> Result<Task, String> {
    let mode = cols.text(row, "charge mode").to_lowercase();
    let days = number(cols.get(row, "effort (days)"))
        .map_err(|()| "the effort is not a number".to_string())?;
    let ratio = number(cols.get(row, "effort (ratio)"))
        .map_err(|()| "the effort is not a number".to_string())?;
    let (days, percent) =
        if mode.contains("ratio") || (mode.is_empty() && days.is_none() && ratio.is_some()) {
            (
                None,
                Some(ratio.ok_or("the effort is not a number")? * 100.0),
            )
        } else {
            (Some(days.ok_or("the effort is not a number")?), None)
        };
    let bad = |n: Option<f64>| n.is_some_and(|n| n < 0.0 || !n.is_finite() || n > 100_000.0);
    if bad(days) || bad(percent) {
        return Err("the effort is negative or too large".into());
    }
    let note = [cols.text(row, "hypotheses"), cols.text(row, "comments")]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let ticket = Some(cols.text(row, "ticket")).filter(|t| !t.is_empty());
    Ok(Task {
        id,
        name: title,
        description: cols.text(row, "description"),
        role: cols.text(row, "profile"),
        days,
        // A percentage lands on a tidy number: 0.2 is 20, not 20.000000000000004.
        percent: percent.map(|p| (p * 1e6).round() / 1e6),
        other: cols.text(row, "kind").eq_ignore_ascii_case("other"),
        ticket,
        note,
    })
}

/// The `Settings` worksheet as label to value, labels in lower case.
fn settings(wb: &mut Xlsx<Cursor<&[u8]>>) -> BTreeMap<String, String> {
    let Some(name) = wb
        .sheet_names()
        .into_iter()
        .find(|n| n.eq_ignore_ascii_case("settings"))
    else {
        return BTreeMap::new();
    };
    let Ok(range) = wb.worksheet_range(&name) else {
        return BTreeMap::new();
    };
    range
        .rows()
        .map(|r| (text(r.first()).to_lowercase(), text(r.get(1))))
        .filter(|(k, _)| !k.is_empty())
        .collect()
}

// ---------------------------------------------------------------- write

fn xlsx<T>(r: Result<T, rust_xlsxwriter::XlsxError>) -> Result<T, ExcelError> {
    r.map_err(|e| ExcelError::Write(e.to_string()))
}

/// The workbook of a sheet. The `Summary` worksheet holds the totals of `totals` as values, so
/// the file shows the same numbers as the summary view (REQ-013).
pub fn export(sheet: &Sheet, rates: &BTreeMap<String, f64>) -> Result<Vec<u8>, ExcelError> {
    let headers = [
        "Type",
        "Scope",
        "Title",
        "Description",
        "Profile",
        "Hypotheses",
        "Charge Mode",
        "Effort (Days)",
        "Effort (Ratio)",
        "Comments",
        "Kind",
        "Shipyard ID",
        "Ticket",
    ];
    let percent = Format::new().set_num_format("0.##%");
    let bold = Format::new().set_bold();
    let mut wb = Workbook::new();

    let ws = wb.add_worksheet();
    xlsx(ws.set_name(ESTIMATE))?;
    for (c, h) in headers.iter().enumerate() {
        xlsx(ws.write_with_format(0, c as u16, *h, &bold))?;
    }
    let mut r = 1u32;
    for f in &sheet.features {
        xlsx(ws.write(r, 0, "Feature"))?;
        xlsx(ws.write(r, 1, sheet.name.as_str()))?;
        xlsx(ws.write(r, 2, f.name.as_str()))?;
        xlsx(ws.write(r, 3, f.description.as_str()))?;
        xlsx(ws.write(r, 11, f.id.as_str()))?;
        r += 1;
        for t in &f.tasks {
            xlsx(ws.write(r, 0, "Task"))?;
            xlsx(ws.write(r, 1, sheet.name.as_str()))?;
            xlsx(ws.write(r, 2, t.name.as_str()))?;
            xlsx(ws.write(r, 3, t.description.as_str()))?;
            xlsx(ws.write(r, 4, t.role.as_str()))?;
            match (t.days, t.percent) {
                (Some(d), _) => {
                    xlsx(ws.write(r, 6, "Days"))?;
                    xlsx(ws.write(r, 7, d))?;
                }
                (None, p) => {
                    xlsx(ws.write(r, 6, RATIO_MODE))?;
                    // A fraction under a percentage format, as the CGI tool writes it.
                    xlsx(ws.write_with_format(r, 8, p.unwrap_or(0.0) / 100.0, &percent))?;
                }
            }
            xlsx(ws.write(r, 9, t.note.as_str()))?;
            xlsx(ws.write(r, 10, if t.other { "other" } else { "build" }))?;
            xlsx(ws.write(r, 11, t.id.as_str()))?;
            xlsx(ws.write(r, 12, t.ticket.as_deref().unwrap_or_default()))?;
            r += 1;
        }
    }

    let ws = wb.add_worksheet();
    xlsx(ws.set_name("Settings"))?;
    xlsx(ws.write(0, 0, "Name"))?;
    xlsx(ws.write(0, 1, sheet.name.as_str()))?;
    xlsx(ws.write(1, 0, "Currency"))?;
    xlsx(ws.write(1, 1, sheet.currency.as_str()))?;
    xlsx(ws.write(2, 0, "Margin rate"))?;
    xlsx(ws.write(2, 1, sheet.margin_rate))?;

    let t = totals(sheet, rates);
    let ws = wb.add_worksheet();
    xlsx(ws.set_name("Summary"))?;
    for (i, (label, value)) in [
        ("Days", t.days),
        ("Cost", t.cost),
        ("Price", t.price),
        ("Margin", t.margin),
    ]
    .into_iter()
    .enumerate()
    {
        xlsx(ws.write(i as u32, 0, label))?;
        xlsx(ws.write(i as u32, 1, value))?;
    }
    xlsx(wb.save_to_buffer())
}

/// Write the previewed sheet to `path`, after the confirmation of a person (REQ-012). Without
/// `confirmed` the file stays as it was. The write goes to a temporary file first, so a failure
/// leaves the old sheet. `passphrase` seals the file when the project seal is on.
pub fn replace_sheet(
    path: &Path,
    preview: &Preview,
    confirmed: bool,
    passphrase: Option<&str>,
) -> Result<(), ExcelError> {
    if !confirmed {
        return Err(ExcelError::NotConfirmed);
    }
    if preview.sheet.features.is_empty() {
        return Err(ExcelError::Empty);
    }
    let text = write_sheet(&preview.sheet, passphrase)?;
    let tmp = path.with_extension("yaml.tmp");
    std::fs::write(&tmp, text).map_err(|e| ExcelError::Write(e.to_string()))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        ExcelError::Write(e.to_string())
    })
}
