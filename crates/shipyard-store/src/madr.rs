//! ADR files in the decisions folder (spec `design`, REQ-001 and REQ-008 to REQ-010).

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use shipyard_core::project::ProjectFile;
use specta::Type;

use crate::design::slug;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Adr {
    /// `0004`.
    pub number: String,
    /// The first `# ` line.
    pub title: String,
    pub status: String,
    pub date: String,
    /// Relative to the repository.
    pub path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Decision {
    Accept,
    Reject,
}

/// The front matter lines and the body. A BOM is dropped. An open fence gives no front matter.
fn split(text: &str) -> (Vec<&str>, &str) {
    let t = text.trim_start_matches('\u{feff}');
    let mut lines = t.split_inclusive('\n');
    let mut used = lines.next().map_or(0, str::len);
    if t[..used].trim_end() != "---" {
        return (Vec::new(), t);
    }
    let mut fm = Vec::new();
    for l in lines {
        used += l.len();
        if l.trim_end() == "---" {
            return (fm, &t[used..]);
        }
        fm.push(l);
    }
    (Vec::new(), t)
}

/// The value of a top-level key, without quotes.
fn key<'a>(lines: &[&'a str], k: &str) -> &'a str {
    lines
        .iter()
        .find_map(|l| l.strip_prefix(k)?.strip_prefix(':'))
        .map_or("", |v| v.trim().trim_matches(['"', '\'']))
}

/// `## Status` then a value line, or a `Status: x` line, in an ADR with no front matter.
fn legacy_status(body: &str) -> Option<String> {
    let mut lines = body.lines().map(str::trim);
    while let Some(l) = lines.next() {
        let item = l.trim_start_matches(['*', '-', ' ']);
        let inline = item
            .strip_prefix("Status:")
            .or_else(|| item.strip_prefix("status:"));
        let v = if l.eq_ignore_ascii_case("## status") {
            lines.find(|n| !n.is_empty())
        } else {
            inline.map(str::trim)
        };
        if let Some(v) = v.filter(|v| !v.is_empty()) {
            return Some(v.to_lowercase());
        }
    }
    None
}

pub fn list(root: &Path, p: &ProjectFile) -> Vec<Adr> {
    let dir = p.path("decisions");
    let Ok(rd) = fs::read_dir(root.join(dir)) else {
        return Vec::new();
    };
    let mut out: Vec<Adr> = rd
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let number = name
                .get(..4)
                .filter(|n| n.bytes().all(|b| b.is_ascii_digit()))?;
            if name.as_bytes().get(4) != Some(&b'-') || !name.ends_with(".md") {
                return None;
            }
            let text = fs::read_to_string(e.path()).ok()?;
            let (fm, body) = split(&text);
            let heading = body.lines().find_map(|l| l.trim().strip_prefix("# "));
            let title = Some(key(&fm, "title"))
                .filter(|t| !t.is_empty())
                .or(heading.map(str::trim))
                .unwrap_or(&name[..name.len() - 3]);
            let status = Some(key(&fm, "status").to_string())
                .filter(|s| !s.is_empty())
                .or_else(|| legacy_status(body))
                .unwrap_or_else(|| "unknown".into());
            Some(Adr {
                number: number.into(),
                title: title.into(),
                status,
                date: key(&fm, "date").into(),
                path: format!("{dir}/{name}"),
            })
        })
        .collect();
    out.sort_by(|a, b| a.number.cmp(&b.number));
    out
}

/// Max number plus one, four digits.
pub fn next_number(adrs: &[Adr]) -> String {
    let max = adrs
        .iter()
        .filter_map(|a| a.number.parse::<u32>().ok())
        .max()
        .unwrap_or(0);
    format!("{:04}", max + 1)
}

/// The file name and the text of a new proposed ADR.
pub fn new_adr(number: &str, title: &str, date: &str) -> (String, String) {
    let mut kebab = slug(title);
    if kebab.is_empty() {
        kebab = "untitled".into();
    }
    let text = format!(
        "---\nstatus: proposed\ndate: {date}\ndecision-makers: []\n---\n# {title}\n\
         ## Context and problem statement\n\n## Decision drivers\n\n## Considered options\n\n\
         ## Decision outcome\n\n### Consequences\n"
    );
    (format!("{number}-{kebab}.md"), text)
}

/// Sets status, date and comment of a proposed ADR. Every other byte stays.
pub fn decide(text: &str, d: Decision, comment: &str, date: &str) -> Result<String, String> {
    let comment = comment.trim();
    if comment.is_empty() {
        return Err("a comment is required".into());
    }
    let lines: Vec<&str> = text.split_inclusive('\n').collect();
    let fenced = |l: &&str| l.trim_start_matches('\u{feff}').trim_end() == "---";
    if !lines.first().is_some_and(fenced) {
        return Err("no front matter".into());
    }
    let end = lines[1..]
        .iter()
        .position(fenced)
        .ok_or("front matter not closed")?
        + 1;
    if key(&lines[1..end], "status") != "proposed" {
        return Err("only a proposed ADR can be decided".into());
    }
    let status = if d == Decision::Accept {
        "accepted"
    } else {
        "rejected"
    };
    let quoted = serde_json::to_string(comment).map_err(|e| e.to_string())?;
    let mut set = [
        ("status", Some(status.to_string())),
        ("date", Some(date.to_string())),
        ("comment", Some(quoted)),
    ];
    let eol = |l: &str| if l.ends_with("\r\n") { "\r\n" } else { "\n" };
    let mut out = lines[0].to_string();
    for l in &lines[1..end] {
        let hit = set
            .iter_mut()
            .find(|(k, v)| v.is_some() && l.starts_with(&format!("{k}:")));
        match hit {
            Some((k, v)) => out += &format!("{k}: {}{}", v.take().unwrap_or_default(), eol(l)),
            None => out += l,
        }
    }
    for (k, v) in set {
        if let Some(v) = v {
            out += &format!("{k}: {v}{}", eol(lines[0]));
        }
    }
    out += &lines[end..].concat();
    Ok(out)
}
