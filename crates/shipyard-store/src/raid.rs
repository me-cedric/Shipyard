//! The RAID register: one markdown file per question, risk, assumption, issue or dependency in
//! `docs/delivery/questions/` (spec `questions-loop` REQ-003, REQ-007; spec `specs` REQ-008 to
//! REQ-010). Reader, writer and id allocation in one place.
//!
//! Two views of the same files share the nine keys and the id rules. `Item` (sections `## Question`,
//! `## Answer`, `## Consequence`) is the view of the engine. `Question` and `Entry` (a `# Title` line
//! and a free body, the layout of the files in this repository) are the view of the Specs space.
//!
//! Ported from Legacy `src/lib/raid.ts` (the codec and the lifecycle) and
//! `src-tauri/src/infrastructure/raid.rs` (id allocation). A file is never deleted: nothing here
//! removes one. An answered question stays as `folded`.

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use shipyard_core::question::Question as Asked;
use specta::Type;

use crate::project::write_atomic;
use crate::{Result, safe_write};

pub const QUESTIONS_DIR: &str = "docs/delivery/questions";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Question,
    Risk,
    Assumption,
    Issue,
    Dependency,
    Decision,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Question => "question",
            Self::Risk => "risk",
            Self::Assumption => "assumption",
            Self::Issue => "issue",
            Self::Dependency => "dependency",
            Self::Decision => "decision",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        [
            Self::Question,
            Self::Risk,
            Self::Assumption,
            Self::Issue,
            Self::Dependency,
            Self::Decision,
        ]
        .into_iter()
        .find(|k| k.as_str() == fold(s))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Open,
    Assigned,
    Answered,
    Folded,
    /// Closed with no answer (questions-loop REQ-018, REQ-020).
    Withdrawn,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Assigned => "assigned",
            Self::Answered => "answered",
            Self::Folded => "folded",
            Self::Withdrawn => "withdrawn",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        [
            Self::Open,
            Self::Assigned,
            Self::Answered,
            Self::Folded,
            Self::Withdrawn,
        ]
        .into_iter()
        .find(|k| k.as_str() == fold(s))
    }
}

/// The lifecycle. `from` itself is always allowed, so a save with no change never fails. `None`
/// (a hand edit left a value outside the vocabulary) may only go to `open`.
pub fn can_transition(from: Option<Status>, to: Status) -> bool {
    use Status::*;
    match from {
        None => to == Open,
        Some(f) if f == to => true,
        Some(Open) => matches!(to, Assigned | Answered | Withdrawn),
        Some(Assigned) => matches!(to, Answered | Open | Withdrawn),
        Some(Answered) => matches!(to, Folded | Assigned),
        Some(Folded) | Some(Withdrawn) => to == Open,
    }
}

/// One register entry. `None` in `kind` or `status` means that a hand edit left a value outside
/// the vocabulary: it is reported, never guessed back into a plausible value.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Item {
    /// Repository-relative path. Empty for an item that is not on disk yet.
    pub path: String,
    pub id: String,
    pub kind: Option<Kind>,
    pub status: Option<Status>,
    pub raised_at: String,
    pub raised_by: String,
    pub owner: String,
    pub spec_ref: String,
    pub task_ref: String,
    pub ticket: String,
    pub question: String,
    pub answer: String,
    pub consequence: String,
    /// Body text that the register does not own, verbatim: unknown headings, text before the first
    /// heading. A save writes it back.
    pub extra: String,
    /// Frontmatter lines that the register does not own, verbatim.
    pub extra_fm: String,
    /// The nine keys that the file lacks (REQ-009: flag the file, do not drop it).
    pub missing: Vec<&'static str>,
}

impl Item {
    /// The file needs a look: a value outside the vocabulary or a missing key.
    pub fn flagged(&self) -> bool {
        self.kind.is_none() || self.status.is_none() || !self.missing.is_empty()
    }
}

/// A blank open question.
pub fn new_item(id: &str, raised_at: &str) -> Item {
    Item {
        id: id.into(),
        kind: Some(Kind::Question),
        status: Some(Status::Open),
        raised_at: raised_at.into(),
        ..Item::default()
    }
}

/// `docs/delivery/questions/Q-014.md`. The name carries the id and no slug, so a reworded
/// question never forces a rename.
pub fn item_path(id: &str) -> String {
    format!("{QUESTIONS_DIR}/{id}.md")
}

/// The question as a file: the text and its numbered options, the recommended one marked
/// (REQ-007). The id and the spec ref come from the question.
pub fn from_question(q: &Asked, raised_at: &str, raised_by: &str, ticket: &str) -> Item {
    let options: Vec<String> = q
        .options
        .iter()
        .enumerate()
        .map(|(i, o)| {
            let mark = if q.recommended as usize == i + 1 {
                " (recommended)"
            } else {
                ""
            };
            format!("{}. {o}{mark}", i + 1)
        })
        .collect();
    Item {
        path: item_path(&q.id),
        raised_by: raised_by.into(),
        spec_ref: q.spec.clone().unwrap_or_default(),
        ticket: ticket.into(),
        question: format!("{}\n\nOptions:\n{}", q.question, options.join("\n")),
        ..new_item(&q.id, raised_at)
    }
}

// ---------------------------------------------------------------- the codec

/// The frontmatter keys, in the order that they are written.
const FIELDS: [&str; 9] = [
    "id", "kind", "status", "raisedAt", "raisedBy", "owner", "specRef", "taskRef", "ticket",
];

#[derive(Clone, Copy, PartialEq)]
enum Section {
    Question,
    Answer,
    Consequence,
}

/// Lower case, with the accents of the headings that a French register uses removed.
fn fold(s: &str) -> String {
    s.trim()
        .chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'à' | 'â' | 'ä' => 'a',
            'î' | 'ï' => 'i',
            'ô' | 'ö' => 'o',
            'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            c => c,
        })
        .collect()
}

fn section(title: &str) -> Option<Section> {
    match fold(title).as_str() {
        "question" | "questions" => Some(Section::Question),
        "answer" | "reponse" | "reponses" => Some(Section::Answer),
        "consequence" | "consequences" => Some(Section::Consequence),
        _ => None,
    }
}

/// Lines with a flag that is true inside a fenced code block: a heading in a fence is content.
fn tagged(text: &str) -> Vec<(&str, bool)> {
    let mut fenced = false;
    text.split('\n')
        .map(|l| {
            let tag = (l, fenced);
            let t = l.trim_start_matches(' ');
            if l.len() - t.len() <= 3 && (t.starts_with("```") || t.starts_with("~~~")) {
                fenced = !fenced;
            }
            tag
        })
        .collect()
}

/// `#` to `######` and then white space: the start of a heading, after the escapes.
fn heading_tail(s: &str) -> Option<&str> {
    let n = s.bytes().take_while(|&b| b == b'#').count();
    (1..=6)
        .contains(&n)
        .then(|| &s[n..])
        .filter(|r| r.starts_with(char::is_whitespace))
}

/// A body line that starts with `#` would read back as a heading, so the writer escapes it.
fn escape(s: &str) -> String {
    tagged(s)
        .into_iter()
        .map(|(l, fenced)| {
            if !fenced && heading_tail(l.trim_start_matches('\\')).is_some() {
                format!("\\{l}")
            } else {
                l.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn unescape(s: &str) -> String {
    tagged(s)
        .into_iter()
        .map(|(l, fenced)| match l.strip_prefix('\\') {
            Some(r) if !fenced && heading_tail(r.trim_start_matches('\\')).is_some() => r,
            _ => l,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn blank(l: &str) -> bool {
    l.trim_matches([' ', '\t']).is_empty()
}

/// Drop blank lines from both ends. Inner indentation stays.
fn trim_blank(lines: &[&str]) -> String {
    let start = lines.iter().position(|l| !blank(l)).unwrap_or(lines.len());
    let end = lines
        .iter()
        .rposition(|l| !blank(l))
        .map_or(start, |i| i + 1);
    lines[start..end].join("\n")
}

fn unquote(raw: &str) -> String {
    let v = raw.trim();
    if v.starts_with('"') {
        return serde_json::from_str::<String>(v)
            .unwrap_or_else(|_| v[1..].strip_suffix('"').unwrap_or(&v[1..]).to_string());
    }
    if v.len() > 1 && v.starts_with('\'') && v.ends_with('\'') {
        return v[1..v.len() - 1].to_string();
    }
    v.to_string()
}

/// `key:` at the start of a line. The key has no space before its colon.
fn key_of(line: &str) -> Option<(&str, &str)> {
    let (k, v) = line.split_once(':')?;
    let mut c = k.chars();
    (c.next()?.is_ascii_alphabetic()
        && c.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
    .then_some((k, v.trim_start()))
}

fn stem(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    match name.rfind('.') {
        Some(i) if i > 0 => &name[..i],
        _ => name,
    }
}

/// Read one register file. It never fails: a malformed file degrades to visible fields.
pub fn parse_item(path: &str, text: &str) -> Item {
    let clean = text
        .strip_prefix('\u{feff}')
        .unwrap_or(text)
        .replace("\r\n", "\n");
    let lines: Vec<&str> = clean.split('\n').collect();
    let end = (lines[0].trim() == "---")
        .then(|| {
            lines
                .iter()
                .skip(1)
                .position(|l| l.trim() == "---")
                .map(|i| i + 1)
        })
        .flatten();
    let (yaml, body): (&[&str], &[&str]) = match end {
        Some(e) => (&lines[1..e], &lines[e + 1..]),
        None => (&[], &lines[..]),
    };

    let fm = |k: &str| {
        yaml.iter()
            .filter_map(|l| key_of(l))
            .find(|(key, _)| *key == k)
            .map(|(_, v)| unquote(v))
    };
    let get = |k: &str| fm(k).unwrap_or_default();
    let id = get("id");
    let mut item = Item {
        path: path.into(),
        id: if id.is_empty() { stem(path).into() } else { id },
        kind: Kind::parse(&get("kind")),
        status: Status::parse(&get("status")),
        raised_at: get("raisedAt"),
        raised_by: get("raisedBy"),
        owner: get("owner"),
        spec_ref: get("specRef"),
        task_ref: get("taskRef"),
        ticket: get("ticket"),
        missing: FIELDS.iter().copied().filter(|k| fm(k).is_none()).collect(),
        ..Item::default()
    };
    item.extra_fm = yaml
        .iter()
        .filter(|l| !l.trim().is_empty() && key_of(l).is_none_or(|(k, _)| !FIELDS.contains(&k)))
        .copied()
        .collect::<Vec<_>>()
        .join("\n");

    // Blocks: a heading and its lines. The first block has no heading.
    struct Block<'a> {
        key: Option<Section>,
        heading: Option<&'a str>,
        lines: Vec<&'a str>,
    }
    let mut blocks = vec![Block {
        key: None,
        heading: None,
        lines: Vec::new(),
    }];
    let body = body.join("\n");
    for (line, fenced) in tagged(&body) {
        match (!fenced).then(|| heading_tail(line)).flatten() {
            Some(title) => blocks.push(Block {
                key: section(title.trim_start()),
                heading: Some(line),
                lines: Vec::new(),
            }),
            None => blocks.last_mut().expect("one block").lines.push(line),
        }
    }
    let mut extras = Vec::new();
    let mut seen: Vec<Section> = Vec::new();
    for b in blocks {
        if let Some(k) = b.key.filter(|k| !seen.contains(k)) {
            seen.push(k);
            let text = unescape(&trim_blank(&b.lines));
            match k {
                Section::Question => item.question = text,
                Section::Answer => item.answer = text,
                Section::Consequence => item.consequence = text,
            }
            continue;
        }
        let raw = match b.heading {
            None => trim_blank(&b.lines),
            Some(h) => {
                let mut all = vec![h];
                all.extend(&b.lines);
                // Trailing blank lines only: the heading stays first.
                let end = all.iter().rposition(|l| !blank(l)).map_or(0, |i| i + 1);
                all[..end].join("\n")
            }
        };
        if !raw.trim().is_empty() {
            extras.push(raw);
        }
    }
    item.extra = extras.join("\n\n");
    item
}

/// A value that survives being written without quotes: it starts with a letter or a digit, has
/// only ASCII word characters, spaces and `. / # @ + -`, no ` #` (a YAML comment) and no outer
/// space.
fn bare(v: &str) -> bool {
    v == v.trim()
        && v.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && v.chars()
            .all(|c| c.is_ascii_alphanumeric() || " _./#@+-".contains(c))
        && !v.contains(" #")
}

fn scalar(v: &str) -> String {
    if bare(v) {
        v.into()
    } else {
        serde_json::to_string(v).expect("a string always serializes")
    }
}

/// The only serializer. Nine keys, fixed order, empty keys kept bare: a status change is a
/// one-line diff and a person sees the empty slots.
pub fn format_item(item: &Item) -> String {
    let values = [
        item.id.as_str(),
        item.kind.map_or("", Kind::as_str),
        item.status.map_or("", Status::as_str),
        &item.raised_at,
        &item.raised_by,
        &item.owner,
        &item.spec_ref,
        &item.task_ref,
        &item.ticket,
    ];
    let mut out = vec!["---".to_string()];
    for (k, v) in FIELDS.iter().zip(values) {
        out.push(if v.is_empty() {
            format!("{k}:")
        } else {
            format!("{k}: {}", scalar(v))
        });
    }
    if !item.extra_fm.trim().is_empty() {
        out.push(item.extra_fm.clone());
    }
    out.extend(["---".into(), String::new()]);
    for (title, text) in [
        ("Question", &item.question),
        ("Answer", &item.answer),
        ("Consequence", &item.consequence),
    ] {
        out.extend([
            format!("## {title}"),
            String::new(),
            escape(text),
            String::new(),
        ]);
    }
    if !item.extra.trim().is_empty() {
        out.extend([item.extra.clone(), String::new()]);
    }
    format!("{}\n", out.join("\n").trim_end_matches('\n'))
}

// ---------------------------------------------------------------- ids and files

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisterFile {
    pub path: String,
    pub text: String,
}

/// The number of `Q-NNN`. The `Q` is lower case when a person typed it.
fn parse_id(raw: &str) -> Option<u32> {
    let t = raw.trim();
    let digits = t.strip_prefix("Q-").or_else(|| t.strip_prefix("q-"))?;
    // Digits only: `+5` is no id.
    digits
        .bytes()
        .all(|b| b.is_ascii_digit())
        .then(|| digits.parse().ok())?
}

/// The higher of the file name and the `id` key. A file renamed by hand must not cause a clash,
/// so both are read and neither is trusted alone.
fn id_num(f: &RegisterFile) -> Option<u32> {
    let from_name = parse_id(stem(&f.path));
    let from_key = parse_item(&f.path, &f.text);
    from_name.max(parse_id(&from_key.id))
}

/// The next free id: one above the highest in the register and in `taken` (the ids that the
/// ticket comments hold, Q-026 option 1). A hole is never reused. An empty register gives Q-001.
pub fn next_id(files: &[RegisterFile], taken: &[String]) -> String {
    let max = files
        .iter()
        .filter_map(id_num)
        .chain(taken.iter().filter_map(|t| parse_id(t)))
        .max()
        .unwrap_or(0);
    format!("Q-{:03}", max.saturating_add(1))
}

/// Every markdown file of the register, by number, the unnumbered last. A missing folder is an
/// empty register. A file that is not UTF-8 is read lossily: it still counts for the id.
pub fn list_register(root: &Path) -> Result<Vec<RegisterFile>> {
    let mut out = Vec::new();
    match std::fs::read_dir(root.join(QUESTIONS_DIR)) {
        Ok(rd) => {
            for e in rd {
                let p = e?.path();
                let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                if !(name.ends_with(".md") || name.ends_with(".markdown")) {
                    continue;
                }
                out.push(RegisterFile {
                    path: format!("{QUESTIONS_DIR}/{name}"),
                    text: String::from_utf8_lossy(&std::fs::read(&p)?).into_owned(),
                });
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    out.sort_by_cached_key(|f| {
        let n = id_num(f);
        (n.is_none(), n.unwrap_or(0), f.path.clone())
    });
    Ok(out)
}

/// The item of one id, or `None` when no such file exists.
pub fn read(root: &Path, id: &str) -> Result<Option<Item>> {
    let path = item_path(id);
    match std::fs::read(root.join(&path)) {
        Ok(b) => Ok(Some(parse_item(&path, &String::from_utf8_lossy(&b)))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn check(item: &Item) -> Result<(Kind, Status)> {
    match (item.kind, item.status) {
        (Some(k), Some(s)) => Ok((k, s)),
        _ => Err("kind and status must be values of the register".into()),
    }
}

/// Allocate the next id and write the file. The file is created with `create_new`: it never
/// overwrites. When two writers pick the same id, the loser reads the register again and takes the
/// next one. The id and path of `item` are replaced. `taken` holds the ids of the ticket comments.
pub fn create(root: &Path, mut item: Item, taken: &[String]) -> Result<Item> {
    check(&item)?;
    for _ in 0..32 {
        item.id = next_id(&list_register(root)?, taken);
        item.path = item_path(&item.id);
        let full = root.join(&item.path);
        if let Some(dir) = full.parent() {
            std::fs::create_dir_all(dir)?;
        }
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&full)
        {
            Ok(mut f) => {
                f.write_all(format_item(&item).as_bytes())?;
                return Ok(item);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err("could not allocate a question id".into())
}

/// Write an item that is on disk. It refuses a value outside the vocabulary, a status change that
/// the lifecycle does not allow, an id that is not `Q-NNN`, and a file that does not exist: `create`
/// is the only way to make one.
pub fn save(root: &Path, item: &Item) -> Result<()> {
    let (_, to) = check(item)?;
    if parse_id(&item.id).is_none() {
        return Err(format!("`{}` is not a question id", item.id).into());
    }
    let Some(old) = read(root, &item.id)? else {
        return Err(format!("{} does not exist", item.id).into());
    };
    if !can_transition(old.status, to) {
        return Err(format!(
            "{}: status cannot go from {} to {}",
            item.id,
            old.status.map_or("unknown", Status::as_str),
            to.as_str()
        )
        .into());
    }
    write_atomic(
        &root.join(item_path(&item.id)),
        format_item(item).as_bytes(),
    )
}

/// Set the answer of an open or assigned question and mark it answered.
pub fn answer(root: &Path, id: &str, text: &str) -> Result<Item> {
    let mut item = read(root, id)?.ok_or_else(|| format!("{id} does not exist"))?;
    item.answer = text.into();
    item.status = Some(Status::Answered);
    save(root, &item)?;
    Ok(item)
}

// ---------------------------------------------------------------- the Specs view

/// The vocabulary of the Specs view: the names of `Kind` and `Status`.
pub const KINDS: [&str; 6] = [
    "risk",
    "assumption",
    "issue",
    "dependency",
    "question",
    "decision",
];
pub const STATUSES: [&str; 5] = ["open", "assigned", "answered", "folded", "withdrawn"];

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

/// A value that a read gives back unchanged without quotes. Wider than `scalar`: a file written by a
/// person keeps its accents and its empty keys as `key: `, so a save changes no byte.
fn loose(v: &str) -> String {
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
pub fn read_text(text: &str) -> (Question, Vec<String>) {
    let clean = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let mut issues = Vec::new();
    let (yaml, body) = split(&clean).unwrap_or_else(|| {
        issues.push("no frontmatter".to_string());
        ("", &clean)
    });
    let pairs: Vec<_> = yaml.lines().filter_map(key_of).collect();
    let mut v: [String; 9] = Default::default();
    for (i, key) in FIELDS.iter().enumerate() {
        match pairs.iter().find(|(k, _)| k == key) {
            Some((_, raw)) => v[i] = unquote(raw),
            None => issues.push(format!("missing key: {key}")),
        }
    }
    for (i, list) in [(1, &KINDS[..]), (2, &STATUSES[..])] {
        let folded = v[i].trim().to_lowercase();
        if list.contains(&folded.as_str()) {
            v[i] = folded;
        } else if pairs.iter().any(|(k, _)| *k == FIELDS[i]) {
            issues.push(format!("unknown {}: {}", FIELDS[i], v[i]));
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

fn valid_id(id: &str) -> bool {
    id.strip_prefix("Q-")
        .is_some_and(|n| n.len() >= 3 && n.bytes().all(|c| c.is_ascii_digit()))
}

/// The file text: nine keys in order, then the title and the body.
pub fn write(q: &Question) -> std::result::Result<String, String> {
    write_over(q, "")
}

/// `write`, and the front matter lines of `old` that are not one of the nine keys stay after them.
pub fn write_over(q: &Question, old: &str) -> std::result::Result<String, String> {
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
    for (k, v) in FIELDS.iter().zip(vals) {
        out.push_str(&format!("{k}: {}\n", loose(v)));
    }
    let clean = old.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    for l in split(&clean).map_or("", |(y, _)| y).lines() {
        if !key_of(l).is_some_and(|(k, _)| FIELDS.contains(&k)) {
            out.push_str(l);
            out.push('\n');
        }
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
fn entry_num(e: &Entry) -> Option<u32> {
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
                Ok(t) => read_text(&t),
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
        let n = entry_num(e);
        (n.is_none(), n.unwrap_or(0), e.path.clone())
    });
    out
}

/// The next free id: one above the highest. An empty list gives `Q-001`.
pub fn next_entry_id(entries: &[Entry]) -> String {
    let max = entries.iter().filter_map(entry_num).max().unwrap_or(0);
    format!("Q-{:03}", max.saturating_add(1))
}

/// Writes a new file `<dir>/<id>.md`. Rejects a duplicate id.
pub fn create_in(dir: &Path, q: &Question) -> Result<PathBuf> {
    let text = write(q)?;
    let want = parse_id(&q.id);
    if list(dir).iter().any(|e| entry_num(e) == want) {
        return Err(format!("duplicate id {}", q.id).into());
    }
    let path = dir.join(format!("{}.md", q.id));
    safe_write::create(&path, &text)?;
    Ok(path)
}
