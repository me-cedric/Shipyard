//! Compass entries, their sync states and the no-overwrite plan (spec `extensions`, REQ-003,
//! REQ-004, REQ-010, REQ-015). No I/O: the callers read and write the files.

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
#[serde(rename = "EntryKind")]
pub enum Kind {
    Skill,
    Pack,
    Guide,
    Pattern,
    Contract,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Skill => "skill",
            Kind::Pack => "pack",
            Kind::Guide => "guide",
            Kind::Pattern => "pattern",
            Kind::Contract => "contract",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum SyncState {
    Absent,
    Stale,
    Current,
}

/// An entry is absent when the lock does not hold it, stale when the lock pins another compass
/// version than the tree, else current.
pub fn sync_state(in_lock: bool, pinned: Option<&str>, expected: &str) -> SyncState {
    match (in_lock, pinned) {
        (false, _) => SyncState::Absent,
        (true, Some(p)) if p == expected => SyncState::Current,
        (true, _) => SyncState::Stale,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "CompassEntry")]
pub struct Entry {
    pub kind: Kind,
    pub id: String,
    pub title: String,
    /// The `risk_level` of a skill.
    pub risk: Option<String>,
    /// The `writes_files` flag of a skill.
    pub writes: bool,
    /// The skill suits a stack of the project.
    pub suits: bool,
    pub state: SyncState,
    /// The compass version that the lock pins, when it has an entry.
    pub pinned: Option<String>,
    /// The compass version of the tree.
    pub expected: String,
}

impl Entry {
    /// `kind:id`, the key that the apply command and the child records use.
    pub fn key(&self) -> String {
        format!("{}:{}", self.kind.as_str(), self.id)
    }
}

/// A relative path that stays inside the root: no root, no `..`, no `\`, no drive letter.
pub fn safe_rel(p: &str) -> bool {
    !p.is_empty()
        && !p.starts_with('/')
        && !p.contains(['\\', ':', '\0'])
        && p.split('/').all(|s| !s.is_empty() && s != "." && s != "..")
}

/// What a write did: the files that it wrote and the files that it kept.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct WriteReport {
    pub written: Vec<String>,
    pub kept: Vec<String>,
}

/// The no-overwrite rule: split the paths into new ones and existing ones. A path outside the
/// root refuses the whole write and is named in the error (REQ-003, REQ-010, REQ-011).
pub fn plan_write<'a>(
    paths: impl IntoIterator<Item = &'a str>,
    exists: impl Fn(&str) -> bool,
) -> Result<WriteReport, String> {
    let mut out = WriteReport::default();
    for p in paths {
        if !safe_rel(p) {
            return Err(format!("path not allowed: {p}"));
        }
        if exists(p) {
            out.kept.push(p.to_string());
        } else if !out.written.iter().any(|w| w == p) {
            out.written.push(p.to_string());
        }
    }
    Ok(out)
}

/// The keys of the entries that are current: the ones that a child may take.
pub fn current_keys(entries: &[Entry]) -> Vec<String> {
    entries
        .iter()
        .filter(|e| e.state == SyncState::Current)
        .map(Entry::key)
        .collect()
}

/// `(n, m)` of a child: how many of the current parent keys it holds (REQ-015).
pub fn progress(parent: &[String], child_has: &[String]) -> (usize, usize) {
    (
        parent.iter().filter(|k| child_has.contains(k)).count(),
        parent.len(),
    )
}

/// The keys that a deploy proposes: current in the parent and not yet in the child (REQ-015,
/// REQ-016).
pub fn proposed(parent: &[String], child_has: &[String]) -> Vec<String> {
    parent
        .iter()
        .filter(|k| !child_has.contains(k))
        .cloned()
        .collect()
}
