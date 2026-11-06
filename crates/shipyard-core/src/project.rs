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

/// The paths that a project file can set but that a new file does not write (spec `design`,
/// spec `specs` REQ-011 and Q-037).
pub const MORE_PATHS: [(&str, &str); 11] = [
    ("diagrams", "docs/diagrams"),
    ("models", "docs/models"),
    ("api", "docs/api"),
    ("data", "docs/data-models"),
    ("flows", "docs/flows"),
    ("designs", "docs/designs"),
    ("test-plans", "docs/delivery/test-plans"),
    ("handbook", "docs/handbook"),
    ("documents", "docs/documents"),
    ("slides", "docs/slides"),
    ("dashboards", "docs/dashboards"),
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

/// A docs rule (spec `docs-freshness`, REQ-001): a change in a file that `code` matches puts each
/// `feeds` target out of date until the target changes too. A target is a path kind or a
/// repository path. A pattern uses `*` for text inside one segment and `**` for any segments.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocRule {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub code: Vec<String>,
    pub feeds: Vec<String>,
}

/// The languages that a project can choose for its docs and its pull requests (Q-153), with the
/// English name that an agent brief says.
pub const LANGUAGES: [(&str, &str); 7] = [
    ("en", "English"),
    ("fr", "French"),
    ("de", "German"),
    ("es", "Spanish"),
    ("it", "Italian"),
    ("nl", "Dutch"),
    ("pt", "Portuguese"),
];

/// The language of the docs and of the pull requests of a project (ADR 0020). Unset: no rule.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectLanguages {
    /// Specs, diagrams, documents and other docs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub docs: Option<String>,
    /// Pull request text and review comments.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pulls: Option<String>,
}

/// The English name of a language code of [`LANGUAGES`].
pub fn language_name(code: &str) -> Option<&'static str> {
    LANGUAGES.iter().find(|(c, _)| *c == code).map(|(_, n)| *n)
}

impl ProjectLanguages {
    /// The paragraph that each agent brief gets (`project-creator` REQ-005). Empty when no
    /// language is set.
    pub fn brief_text(&self) -> String {
        let name = |c: &Option<String>| c.as_deref().and_then(language_name);
        let (docs, pulls) = (name(&self.docs), name(&self.pulls));
        if docs.is_none() && pulls.is_none() {
            return String::new();
        }
        let mut p = String::from("Languages of this project:");
        if let Some(d) = docs {
            p += &format!(" write specs, diagrams, documents and other docs in {d}.");
        }
        if let Some(l) = pulls {
            p += &format!(" Write pull request titles, descriptions and review comments in {l}.");
        }
        p + " Keep code, identifiers, code comments and commit messages in English.\n\n"
    }
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
    /// The docs rules. Empty: the fixed chain from the specs (`docs_fresh::rules`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub docs: Vec<DocRule>,
    /// The language of the docs and of the pull requests (ADR 0020).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub languages: Option<ProjectLanguages>,
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
            docs: Vec::new(),
            languages: None,
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
                    .chain(&MORE_PATHS)
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
    if let Some(l) = &f.languages {
        for (field, code) in [("docs", &l.docs), ("pulls", &l.pulls)] {
            if let Some(c) = code.as_deref().filter(|c| language_name(c).is_none()) {
                bad(format!("languages.{field}"), c);
            }
        }
    }
    for (i, g) in f.gates.iter().enumerate() {
        if g.trim().is_empty() {
            bad(format!("gates[{i}]"), g);
        }
    }
    for (i, r) in f.docs.iter().enumerate() {
        for (list, name, wild) in [(&r.code, "code", true), (&r.feeds, "feeds", false)] {
            if list.is_empty() {
                bad(format!("docs[{i}].{name}"), "");
            }
            for (j, p) in list.iter().enumerate() {
                if !valid_path(p) || (!wild && p.contains('*')) {
                    bad(format!("docs[{i}].{name}[{j}]"), p);
                }
            }
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
