//! RAID question files: one `Q-NNN.md` for each question, with nine frontmatter keys in a fixed
//! order (spec `specs`, REQ-008 to REQ-010). Ported from the Legacy register codec: the key rule,
//! the quoting, the id from the file name and the next id.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{Result, safe_write};

pub const KINDS: [&str; 6] = [
    "risk",
    "assumption",
    "issue",
    "dependency",
    "question",
    "decision",
];
pub const STATUSES: [&str; 3] = ["open", "answered", "withdrawn"];

const KEYS: [&str; 9] = [
    "id", "kind", "status", "raisedAt", "raisedBy", "owner", "specRef", "taskRef", "ticket",
];

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub raised_at: String,
    pub raised_by: String,
    pub owner: String,
    pub spec_ref: String,
    pub task_ref: String,
    pub ticket: String,
    pub title: String,
    /// The text after the title line, kept as it is.
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub question: Question,
    pub issues: Vec<String>,
}

fn unquote(raw: &str) -> String {
    let v = raw.trim();
    if v.starts_with('"') {
        return serde_json::from_str(v)
            .unwrap_or_else(|_| v[1..].trim_end_matches('"').to_string());
    }
    match v.strip_prefix('\'').and_then(|r| r.strip_suffix('\'')) {
        Some(inner) => inner.to_string(),
        None => v.to_string(),
    }
}

/// A value that a read gives back unchanged without quotes.
fn scalar(v: &str) -> String {
    let bare = v == v.trim()
        && !v.starts_with(['"', '\''])
        && !v.contains(['\n', '\r'])
        && !v.contains(" #");
    if bare {
        v.to_string()
    } else {
        serde_json::to_string(v).unwrap_or_default()
    }
}

/// `key:value`, with a key that starts with a letter and no space before the colon.
fn key_value(line: &str) -> Option<(&str, &str)> {
    let (k, v) = line.split_once(':')?;
    let mut c = k.chars();
    (c.next()?.is_ascii_alphabetic() && c.all(|c| c.is_ascii_alphanumeric() || "_-".contains(c)))
        .then_some((k, v))
}

/// The frontmatter and the text after it.
fn split(t: &str) -> Option<(&str, &str)> {
    let first = t.find('\n')?;
    if t[..first].trim() != "---" {
        return None;
    }
    let mut off = first + 1;
    for l in t[off..].split_inclusive('\n') {
        if l.trim() == "---" {
            return Some((&t[first + 1..off], &t[off + l.len()..]));
        }
        off += l.len();
    }
    None
}

/// Reads a file. A missing key or an unknown value is an issue; the file is never dropped.
pub fn read(text: &str) -> (Question, Vec<String>) {
    let clean = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let mut issues = Vec::new();
    let (yaml, body) = split(&clean).unwrap_or_else(|| {
        issues.push("no frontmatter".to_string());
        ("", &clean)
    });
    let pairs: Vec<_> = yaml.lines().filter_map(key_value).collect();
    let mut v: [String; 9] = Default::default();
    for (i, key) in KEYS.iter().enumerate() {
        match pairs.iter().find(|(k, _)| k == key) {
            Some((_, raw)) => v[i] = unquote(raw),
            None => issues.push(format!("missing key: {key}")),
        }
    }
    for (i, list) in [(1, &KINDS[..]), (2, &STATUSES[..])] {
        let folded = v[i].trim().to_lowercase();
        if list.contains(&folded.as_str()) {
            v[i] = folded;
        } else if pairs.iter().any(|(k, _)| *k == KEYS[i]) {
            issues.push(format!("unknown {}: {}", KEYS[i], v[i]));
        }
    }
    let (title, body) = match body.strip_prefix("# ") {
        Some(r) => r.split_once('\n').unwrap_or((r, "")),
        None => ("", body),
    };
    let [
        id,
        kind,
        status,
        raised_at,
        raised_by,
        owner,
        spec_ref,
        task_ref,
        ticket,
    ] = v;
    let q = Question {
        id,
        kind,
        status,
        raised_at,
        raised_by,
        owner,
        spec_ref,
        task_ref,
        ticket,
        title: title.to_string(),
        body: body.to_string(),
    };
    (q, issues)
}

fn parse_id(s: &str) -> Option<u32> {
    let s = s.trim();
    s.strip_prefix("Q-")
        .or_else(|| s.strip_prefix("q-"))?
        .parse()
        .ok()
}

fn valid_id(id: &str) -> bool {
    id.strip_prefix("Q-")
        .is_some_and(|n| n.len() >= 3 && n.bytes().all(|c| c.is_ascii_digit()))
}

/// The file text: nine keys in order, then the title and the body.
pub fn write(q: &Question) -> std::result::Result<String, String> {
    if !valid_id(&q.id) {
        return Err(format!("invalid id: {}", q.id));
    }
    if !KINDS.contains(&q.kind.as_str()) {
        return Err(format!("unknown kind: {}", q.kind));
    }
    if !STATUSES.contains(&q.status.as_str()) {
        return Err(format!("unknown status: {}", q.status));
    }
    let vals = [
        &q.id,
        &q.kind,
        &q.status,
        &q.raised_at,
        &q.raised_by,
        &q.owner,
        &q.spec_ref,
        &q.task_ref,
        &q.ticket,
    ];
    let mut out = String::from("---\n");
    for (k, v) in KEYS.iter().zip(vals) {
        out.push_str(&format!("{k}: {}\n", scalar(v)));
    }
    out.push_str("---\n");
    if !q.title.is_empty() {
        out.push_str(&format!("# {}\n", q.title));
    }
    out.push_str(&q.body);
    Ok(out)
}

/// The number of an entry: the higher of the file name and the `id` key, so a renamed file
/// does not make a clash.
fn id_num(e: &Entry) -> Option<u32> {
    let stem = Path::new(&e.path).file_stem()?.to_str()?;
    parse_id(stem).max(parse_id(&e.question.id))
}

/// Each `.md` file of the folder, in id order. A file without a number sorts last.
/// A missing folder gives an empty list.
pub fn list(dir: &Path) -> Vec<Entry> {
    let Ok(rd) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<Entry> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "md"))
        .map(|p| {
            let (mut question, issues) = match fs::read_to_string(&p) {
                Ok(t) => read(&t),
                Err(e) => (Question::default(), vec![format!("cannot read: {e}")]),
            };
            if question.id.is_empty() {
                question.id = p
                    .file_stem()
                    .map_or_else(String::new, |s| s.to_string_lossy().into());
            }
            Entry {
                path: p.to_string_lossy().into(),
                question,
                issues,
            }
        })
        .collect();
    out.sort_by_cached_key(|e| {
        let n = id_num(e);
        (n.is_none(), n.unwrap_or(0), e.path.clone())
    });
    out
}

/// The next free id: one above the highest. An empty list gives `Q-001`.
pub fn next_id(entries: &[Entry]) -> String {
    let max = entries.iter().filter_map(id_num).max().unwrap_or(0);
    format!("Q-{:03}", max.saturating_add(1))
}

/// Writes a new file `<dir>/<id>.md`. Rejects a duplicate id.
pub fn create(dir: &Path, q: &Question) -> Result<PathBuf> {
    let text = write(q)?;
    let want = parse_id(&q.id);
    if list(dir).iter().any(|e| id_num(e) == want) {
        return Err(format!("duplicate id {}", q.id).into());
    }
    let path = dir.join(format!("{}.md", q.id));
    safe_write::create(&path, &text)?;
    Ok(path)
}
