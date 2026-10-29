//! Network flow table: rows, filters and pure edits (spec `design`, REQ-016 to REQ-018).

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    #[serde(alias = "Allow")]
    Allow,
    #[serde(alias = "Deny")]
    Deny,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FlowRow {
    pub id: u32,
    pub source: String,
    pub destination: String,
    /// A VLAN or a VNET.
    pub network: String,
    pub protocol: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<String>,
    pub action: Action,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Every field is optional. A set field must match. An empty text field counts as not set.
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
    pub network: Option<String>,
    pub protocol: Option<String>,
    pub action: Option<Action>,
    pub text: Option<String>,
}

/// One octet, 0 to 255, no leading zero.
fn octet(s: &str) -> bool {
    s.len() <= 3
        && s.bytes().all(|b| b.is_ascii_digit())
        && (s == "0" || !s.starts_with('0'))
        && s.parse::<u8>().is_ok()
}

fn is_ipv4(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    parts.len() == 4 && parts.iter().all(|p| octet(p))
}

fn is_cidr(s: &str) -> bool {
    s.split_once('/').is_some_and(|(ip, m)| {
        is_ipv4(ip)
            && m.len() <= 2
            && !m.is_empty()
            && m.bytes().all(|b| b.is_ascii_digit())
            && m.parse::<u8>().is_ok_and(|n| n <= 32)
    })
}

/// A bare IPv4 address gets `/32`. A name stays as typed.
fn with_mask(v: &str) -> String {
    let v = v.trim();
    if is_ipv4(v) {
        format!("{v}/32")
    } else {
        v.to_string()
    }
}

/// The first required field that is empty, then the first address that is malformed.
/// A value of digits, dots and slashes must be a CIDR. Any other value is a name.
pub fn check(r: &FlowRow) -> Result<(), String> {
    let fields = [
        ("source", &r.source),
        ("destination", &r.destination),
        ("network", &r.network),
        ("protocol", &r.protocol),
    ];
    match fields.iter().find(|(_, v)| v.trim().is_empty()) {
        Some((name, _)) => Err(format!("missing field: {name}")),
        None => [("source", &r.source), ("destination", &r.destination)]
            .iter()
            .find(|(_, v)| {
                let v = v.trim();
                v.bytes()
                    .all(|b| b.is_ascii_digit() || b == b'.' || b == b'/')
                    && !is_cidr(&with_mask(v))
            })
            .map_or(Ok(()), |(name, v)| Err(format!("invalid {name}: {v}"))),
    }
}

fn masked(mut r: FlowRow) -> FlowRow {
    r.source = with_mask(&r.source);
    r.destination = with_mask(&r.destination);
    r
}

fn set(f: &Option<String>) -> Option<String> {
    f.as_deref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
}

fn hit(r: &FlowRow, f: &Filter) -> bool {
    let same = |want: Option<String>, got: &str| want.is_none_or(|w| got.to_lowercase() == w);
    let text = set(&f.text).is_none_or(|t| {
        let port = r.port.as_deref().unwrap_or("");
        let note = r.note.as_deref().unwrap_or("");
        [
            &r.source,
            &r.destination,
            &r.network,
            &r.protocol,
            port,
            note,
        ]
        .iter()
        .any(|v| v.to_lowercase().contains(&t))
    });
    same(set(&f.network), &r.network)
        && same(set(&f.protocol), &r.protocol)
        && f.action.is_none_or(|a| a == r.action)
        && text
}

pub fn filter(rows: &[FlowRow], f: &Filter) -> Vec<FlowRow> {
    rows.iter().filter(|r| hit(r, f)).cloned().collect()
}

/// Appends the row with the next free id.
pub fn add(rows: &[FlowRow], row: FlowRow) -> Result<Vec<FlowRow>, String> {
    let mut row = masked(row);
    check(&row)?;
    row.id = rows.iter().map(|r| r.id).max().unwrap_or(0) + 1;
    let mut out = rows.to_vec();
    out.push(row);
    Ok(out)
}

pub fn update(rows: &[FlowRow], row: FlowRow) -> Result<Vec<FlowRow>, String> {
    let row = masked(row);
    check(&row)?;
    let mut out = rows.to_vec();
    let slot = out
        .iter_mut()
        .find(|r| r.id == row.id)
        .ok_or_else(|| format!("no row {}", row.id))?;
    *slot = row;
    Ok(out)
}

pub fn remove(rows: &[FlowRow], id: u32) -> Result<Vec<FlowRow>, String> {
    if !rows.iter().any(|r| r.id == id) {
        return Err(format!("no row {id}"));
    }
    Ok(rows.iter().filter(|r| r.id != id).cloned().collect())
}
