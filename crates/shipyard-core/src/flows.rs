//! Network flow table: rows, filters and pure edits (spec `design`, REQ-016 to REQ-018).

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use specta::Type;

/// Named `FlowAction` in the bindings: `work::Action` has the name `Action`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "FlowAction", rename_all = "lowercase")]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The subnet of the flow, next to its VLAN.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subnet: Option<String>,
    /// The bricks of `bricks.json` that the flow leaves from and goes to, by name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub destination_name: Option<String>,
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

/// What the check against the code found for one flow (`spec:library-functions#REQ-011`).
/// `in_code` is `None` when the destination is not a host that a URL can name: a network or a brick.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FlowCheck {
    pub id: u32,
    pub in_code: Option<bool>,
}

/// The hosts that the URLs of a text name, in lowercase: `https://api.example.com:443/x` gives
/// `api.example.com`. A host with a placeholder (`${HOST}`) or an IPv6 literal stays out.
pub fn hosts_in(text: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for (at, _) in text.match_indices("://") {
        let scheme = text[..at]
            .chars()
            .rev()
            .take_while(char::is_ascii_alphabetic)
            .count();
        if scheme < 2 {
            continue;
        }
        let rest = &text[at + 3..];
        let end = rest
            .find(|c: char| !(c.is_ascii_alphanumeric() || "-._~%!$&'()*+,;=:@".contains(c)))
            .unwrap_or(rest.len());
        let auth = &rest[..end];
        let host = auth.rsplit('@').next().unwrap_or("");
        let host = host.split(':').next().unwrap_or("").trim_end_matches('.');
        let valid = host
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
            && (host.contains('.') || host == "localhost");
        if valid && !host.starts_with(['.', '-']) {
            out.insert(host.to_lowercase());
        }
    }
    out
}

/// The host that a flow goes to, when its destination names one: a host name or an address, with
/// no mask (but `/32`) and no port. A network, or a name with a space (a brick), has none.
fn host_of(destination: &str) -> Option<String> {
    let d = destination.trim().trim_end_matches("/32");
    let d = d.split(':').next().unwrap_or("").to_lowercase();
    let host = !d.is_empty()
        && d.contains('.')
        && d.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-');
    host.then_some(d)
}

/// One result for each flow. The code calls the host of a flow when a code host is that host or
/// one of its subdomains.
pub fn check_against_code(rows: &[FlowRow], hosts: &BTreeSet<String>) -> Vec<FlowCheck> {
    rows.iter()
        .map(|r| FlowCheck {
            id: r.id,
            in_code: host_of(&r.destination).map(|d| {
                hosts
                    .iter()
                    .any(|h| *h == d || h.ends_with(&format!(".{d}")))
            }),
        })
        .collect()
}

#[cfg(test)]
mod code_check_tests {
    use super::*;

    fn row(id: u32, destination: &str, action: Action) -> FlowRow {
        FlowRow {
            id,
            source: "app".into(),
            destination: destination.into(),
            network: "Internet".into(),
            protocol: "tcp".into(),
            port: None,
            action,
            note: None,
            name: None,
            subnet: None,
            source_name: None,
            destination_name: None,
        }
    }

    #[test]
    fn hosts_come_from_urls_only() {
        let text = "get(\"https://API.Example.com:443/v1?x=1\"); ws://10.0.0.5:8080 \
            https://user:pw@git.example.org/r https://${HOST}/x http://[::1]/ a://b.c x ://d.e \
            https://localhost/ see https://docs.example.com.";
        assert_eq!(
            hosts_in(text).into_iter().collect::<Vec<_>>(),
            [
                "10.0.0.5",
                "api.example.com",
                "docs.example.com",
                "git.example.org",
                "localhost"
            ]
        );
    }

    #[test]
    fn a_flow_is_in_the_code_when_a_code_host_is_its_host_or_a_subdomain() {
        let hosts = hosts_in("https://api.example.com/x http://10.0.0.5/ https://other.test/");
        let rows = [
            row(1, "example.com", Action::Allow),
            row(2, "10.0.0.5/32", Action::Deny),
            row(3, "nowhere.test", Action::Allow),
            row(4, "10.0.0.0/24", Action::Allow),
            row(5, "Code host", Action::Allow),
            row(6, "other.test:443", Action::Allow),
        ];
        let found: Vec<_> = check_against_code(&rows, &hosts)
            .into_iter()
            .map(|c| c.in_code)
            .collect();
        assert_eq!(
            found,
            [Some(true), Some(true), Some(false), None, None, Some(true)]
        );
    }
}
