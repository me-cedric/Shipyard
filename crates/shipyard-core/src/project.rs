//! The project file `.shipyard/project.yaml` and its rules (spec `projects`, REQ-005, REQ-007).
//! The YAML codec lives in `shipyard-store`. This module holds no I/O.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

/// The artifact kinds with a path, and the default path of each.
pub const DEFAULT_PATHS: [(&str, &str); 3] = [
    ("decisions", "docs/decisions"),
    ("questions", "docs/delivery/questions"),
    ("specs", "docs/openspec"),
];

/// Ignore rules for the files that an OS writes.
pub const OS_IGNORE: [&str; 4] = [".DS_Store", "._*", "Thumbs.db", "Desktop.ini"];

/// Repository path of the project file.
pub const PROJECT_FILE: &str = ".shipyard/project.yaml";

/// The connection that the project uses for each purpose, as the id of `conn:<id>` (Q-018, working
/// assumption). The settings and the secret of a connection stay on the machine of the person.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectConnections {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracker: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub forge: Option<String>,
    /// The container of the tracker: the Jira project key, `owner/repo` on GitHub or GitLab, the
    /// Azure DevOps project or the Linear team. Unset: GitHub and GitLab use the origin repository
    /// and the other trackers list the whole account.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracker_scope: Option<String>,
}

/// The file holds no machine path, no secret and no personal preference.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectFile {
    pub name: String,
    pub key: String,
    #[serde(default)]
    pub paths: BTreeMap<String, String>,
    #[serde(default)]
    pub default_workflow: Option<String>,
    /// Checks that a run must pass before a pull request (`q:Q-030`).
    #[serde(default)]
    pub gates: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connections: Option<ProjectConnections>,
}

/// One invalid value. `field` names it, `value` shows it.
#[derive(Debug, Clone, PartialEq)]
pub struct Issue {
    pub field: String,
    pub value: String,
}

impl ProjectFile {
    pub fn new(name: &str, key: &str) -> Self {
        Self {
            name: name.into(),
            key: key.into(),
            paths: DEFAULT_PATHS
                .iter()
                .map(|(k, v)| ((*k).into(), (*v).into()))
                .collect(),
            default_workflow: None,
            gates: Vec::new(),
            connections: None,
        }
    }

    /// The path of an artifact kind. Falls back to the default.
    pub fn path(&self, kind: &str) -> &str {
        self.paths
            .get(kind)
            .map(String::as_str)
            .or_else(|| {
                DEFAULT_PATHS
                    .iter()
                    .find(|(k, _)| *k == kind)
                    .map(|(_, v)| *v)
            })
            .unwrap_or("")
    }

    /// The id of `project:<id>`: the key in lower case (Q-014, working assumption).
    pub fn id(&self) -> String {
        self.key.to_lowercase()
    }
}

fn valid_key(k: &str) -> bool {
    let mut b = k.bytes();
    k.len() <= 10
        && matches!(b.next(), Some(c) if c.is_ascii_uppercase())
        && b.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}

/// A repository path: relative, forward slashes, no `..`, no drive letter.
fn valid_path(p: &str) -> bool {
    !p.is_empty()
        && !p.starts_with('/')
        && !p.contains('\\')
        && !p.contains(':')
        && p.split('/').all(|s| s != ".." && !s.is_empty())
}

/// A `conn:` id: lower case letters, digits and `-`, up to 64 characters.
fn valid_conn_id(id: &str) -> bool {
    let mut b = id.bytes();
    id.len() <= 64
        && matches!(b.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && b.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

fn valid_workflow(w: &str) -> bool {
    let mut b = w.bytes();
    matches!(b.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && b.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

fn c_scope(f: &ProjectFile) -> Option<&str> {
    f.connections.as_ref()?.tracker_scope.as_deref()
}

/// Text that a tracker query can carry: no edge space, no control character, 200 characters at most.
fn valid_scope(s: &str) -> bool {
    !s.is_empty() && s.len() <= 200 && s.trim() == s && !s.chars().any(char::is_control)
}

pub fn validate(f: &ProjectFile) -> Vec<Issue> {
    let mut out = Vec::new();
    let mut bad = |field: String, value: &str| {
        out.push(Issue {
            field,
            value: value.into(),
        })
    };
    if f.name.trim().is_empty() || f.name.len() > 80 {
        bad("name".into(), &f.name);
    }
    if !valid_key(&f.key) {
        bad("key".into(), &f.key);
    }
    for (k, v) in &f.paths {
        if !valid_path(v) {
            bad(format!("paths.{k}"), v);
        }
    }
    if let Some(w) = f.default_workflow.as_deref().filter(|w| !valid_workflow(w)) {
        bad("defaultWorkflow".into(), w);
    }
    if let Some(c) = &f.connections {
        for (field, id) in [("tracker", &c.tracker), ("forge", &c.forge)] {
            if let Some(id) = id.as_deref().filter(|id| !valid_conn_id(id)) {
                bad(format!("connections.{field}"), id);
            }
        }
    }
    if let Some(sc) = c_scope(f).filter(|sc| !valid_scope(sc)) {
        bad("connections.trackerScope".into(), sc);
    }
    for (i, g) in f.gates.iter().enumerate() {
        if g.trim().is_empty() {
            bad(format!("gates[{i}]"), g);
        }
    }
    out
}

/// The new content of an ignore file, or `None` when it holds every OS rule.
pub fn ignore_block(existing: &str) -> Option<String> {
    let missing: Vec<&str> = OS_IGNORE
        .into_iter()
        .filter(|r| !existing.lines().any(|l| l.trim() == *r))
        .collect();
    if missing.is_empty() {
        return None;
    }
    let mut out = existing.to_string();
    if !out.is_empty() {
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push('\n');
    }
    out.push_str("# OS files\n");
    for r in missing {
        out.push_str(r);
        out.push('\n');
    }
    Some(out)
}
