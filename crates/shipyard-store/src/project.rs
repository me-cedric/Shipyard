//! The project file codec and the project registry (spec `projects`, REQ-007 to REQ-010, REQ-019).
//! The registry lives in the app data folder. It holds machine paths and personal overrides.

use std::collections::BTreeMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_norway::Value;
use shipyard_core::project::{PROJECT_FILE, ProjectFile, validate};
use specta::Type;

use crate::Result;
use crate::prefs::{Contrast, Density, Theme};

/// Each issue: the line, when known, and the offending value.
pub type Issues = Vec<(Option<usize>, String)>;

pub enum FileRead {
    Missing,
    Valid(ProjectFile),
    Invalid(Issues),
}

pub(crate) fn line_of(text: &str, field: &str, value: &str) -> Option<usize> {
    let name = field
        .rsplit('.')
        .next()
        .unwrap_or(field)
        .split('[')
        .next()
        .unwrap_or(field);
    let find = |p: &dyn Fn(&str) -> bool| text.lines().position(p).map(|i| i + 1);
    find(&|l| l.trim_start().starts_with(&format!("{name}:")) && l.contains(value))
        .or_else(|| find(&|l| l.trim_start().starts_with(&format!("{name}:"))))
        .or_else(|| find(&|l| !value.is_empty() && l.contains(value)))
}

pub fn parse_project_file(text: &str) -> std::result::Result<ProjectFile, Issues> {
    let file: ProjectFile = serde_norway::from_str(text).map_err(|e| {
        let msg = e.to_string();
        // An unknown field names itself: "unknown field `theme`, expected ...".
        let line = e.location().map(|l| l.line());
        vec![(line, msg)]
    })?;
    let issues: Issues = validate(&file)
        .into_iter()
        .map(|i| (line_of(text, &i.field, &i.value), i.value))
        .collect();
    if issues.is_empty() {
        Ok(file)
    } else {
        Err(issues)
    }
}

pub fn read_project_file(root: &Path) -> Result<FileRead> {
    match std::fs::read_to_string(root.join(PROJECT_FILE)) {
        Ok(text) => Ok(match parse_project_file(&text) {
            Ok(f) => FileRead::Valid(f),
            Err(i) => FileRead::Invalid(i),
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(FileRead::Missing),
        Err(e) => Err(e.into()),
    }
}

/// YAML text of a project file. Unset values stay out.
pub fn render_project_file(f: &ProjectFile) -> Result<String> {
    let mut v = serde_norway::to_value(f)?;
    if let Value::Mapping(m) = &mut v {
        m.retain(|_, x| !x.is_null() && !matches!(x, Value::Sequence(s) if s.is_empty()));
    }
    Ok(serde_norway::to_string(&v)?)
}

/// Writes the file after validation. An invalid file is never written.
pub fn write_project_file(root: &Path, f: &ProjectFile) -> Result<()> {
    if let Some(i) = validate(f).first() {
        return Err(format!("invalid project file: {} = {}", i.field, i.value).into());
    }
    write_atomic(&root.join(PROJECT_FILE), render_project_file(f)?.as_bytes())
}

/// Write to a temporary file, then rename. A crash never leaves half a file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    Ok(std::fs::rename(tmp, path)?)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Accent {
    Blue,
    Violet,
    Green,
    Orange,
    Rose,
}

/// A project value that takes the place of a personal preference while the project is active.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Overrides {
    pub theme: Option<Theme>,
    pub density: Option<Density>,
    pub contrast: Option<Contrast>,
    pub accent: Option<Accent>,
    /// `Some(false)` stops the remote watch for this project.
    pub remote_watch: Option<bool>,
    /// `Some(false)` mutes the notices of this project.
    pub notifications: Option<bool>,
    /// The profile of this machine in this project: the role, the tabs that stay visible (empty
    /// means all) and read only.
    pub profile_role: Option<String>,
    pub profile_tabs: Option<Vec<String>>,
    /// The tabs that this project hides, as `space/tab` (the screens toggle). Settings keeps its tabs.
    pub hidden_tabs: Option<Vec<String>>,
    pub read_only: Option<bool>,
    /// What each profile (a role) does with a page: `page` is `space/tab`, the mode `hidden` or
    /// `read-only`. A page with no entry is editable.
    pub page_modes: Option<BTreeMap<String, BTreeMap<String, String>>>,
    /// The profile of each person: e-mail (lower case) to role. It beats `profile_role`.
    pub assignments: Option<BTreeMap<String, String>>,
}

pub const PROFILE_ROLES: [&str; 7] = ["pm", "architect", "developer", "qa", "ba", "lead", "junior"];

impl Overrides {
    /// Drops what is not valid: an unknown role, a mode or a page that is not a `space/tab` word
    /// pair, an e-mail with no `@`. Empty maps become `None`.
    pub fn clean(mut self) -> Self {
        let page = |p: &str| {
            let mut it = p.split('/');
            let word = |w: Option<&str>| {
                w.is_some_and(|w| {
                    !w.is_empty() && w.chars().all(|c| c.is_ascii_lowercase() || c == '-')
                })
            };
            word(it.next()) && word(it.next()) && it.next().is_none()
        };
        self.page_modes = self.page_modes.and_then(|m| {
            let m: BTreeMap<_, _> = m
                .into_iter()
                .filter(|(r, _)| PROFILE_ROLES.contains(&r.as_str()))
                .map(|(r, pages)| {
                    let pages: BTreeMap<_, _> = pages
                        .into_iter()
                        .filter(|(p, m)| page(p) && matches!(m.as_str(), "hidden" | "read-only"))
                        .collect();
                    (r, pages)
                })
                .filter(|(_, pages)| !pages.is_empty())
                .collect();
            (!m.is_empty()).then_some(m)
        });
        self.assignments = self.assignments.and_then(|m| {
            let m: BTreeMap<_, _> = m
                .into_iter()
                .map(|(e, r)| (e.trim().to_lowercase(), r))
                .filter(|(e, r)| {
                    e.len() <= 120
                        && e.contains('@')
                        && !e.contains(char::is_whitespace)
                        && PROFILE_ROLES.contains(&r.as_str())
                })
                .collect();
            (!m.is_empty()).then_some(m)
        });
        self
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub key: String,
    pub path: String,
    pub last_used: u64,
    #[serde(default)]
    pub last_view: Option<String>,
    #[serde(default)]
    pub overrides: Overrides,
}

#[derive(Default, Serialize, Deserialize)]
struct Data {
    active: Option<String>,
    projects: Vec<Entry>,
}

pub struct Registry {
    file: std::path::PathBuf,
    data: Data,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

impl Registry {
    /// A missing file is an empty registry. A corrupt file is an error, and stays on disk.
    pub fn load(dir: &Path) -> Result<Self> {
        let file = dir.join("registry.json");
        let data = match std::fs::read(&file) {
            Ok(b) => serde_json::from_slice(&b)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Data::default(),
            Err(e) => return Err(e.into()),
        };
        Ok(Self { file, data })
    }

    pub fn save(&self) -> Result<()> {
        write_atomic(&self.file, &serde_json::to_vec_pretty(&self.data)?)
    }

    pub fn projects(&self) -> &[Entry] {
        &self.data.projects
    }

    pub fn get(&self, id: &str) -> Option<&Entry> {
        self.data.projects.iter().find(|p| p.id == id)
    }

    pub fn active(&self) -> Option<&Entry> {
        self.data.active.as_deref().and_then(|id| self.get(id))
    }

    /// Adds the project, or updates the entry of the same path. The id comes from the key.
    pub fn register(&mut self, path: &str, f: &ProjectFile) -> &Entry {
        let i = match self.data.projects.iter().position(|p| p.path == path) {
            Some(i) => i,
            None => {
                let base = f.id();
                let mut id = base.clone();
                let mut n = 2;
                while self.get(&id).is_some() {
                    id = format!("{base}-{n}");
                    n += 1;
                }
                self.data.projects.push(Entry {
                    id,
                    name: String::new(),
                    key: String::new(),
                    path: path.into(),
                    last_used: 0,
                    last_view: None,
                    overrides: Overrides::default(),
                });
                self.data.projects.len() - 1
            }
        };
        let e = &mut self.data.projects[i];
        e.name = f.name.clone();
        e.key = f.key.clone();
        e.last_used = now();
        &self.data.projects[i]
    }

    /// Makes the project active and records its use.
    pub fn activate(&mut self, id: &str) -> bool {
        let Some(e) = self.data.projects.iter_mut().find(|p| p.id == id) else {
            return false;
        };
        e.last_used = now();
        self.data.active = Some(id.into());
        true
    }

    /// No project is active. The registry keeps every entry.
    pub fn close(&mut self) {
        self.data.active = None;
    }

    /// Drops the entry from the registry. It never touches a file of the project.
    pub fn remove(&mut self, id: &str) -> bool {
        let n = self.data.projects.len();
        self.data.projects.retain(|p| p.id != id);
        if self.data.active.as_deref() == Some(id) {
            self.data.active = None;
        }
        self.data.projects.len() != n
    }

    pub fn set_view(&mut self, id: &str, view: &str) {
        if let Some(e) = self.data.projects.iter_mut().find(|p| p.id == id) {
            e.last_view = Some(view.into());
        }
    }

    pub fn set_overrides(&mut self, id: &str, o: Overrides) {
        if let Some(e) = self.data.projects.iter_mut().find(|p| p.id == id) {
            e.overrides = o;
        }
    }
}

#[cfg(test)]
mod profile_tests {
    use super::*;

    #[test]
    fn clean_keeps_valid_page_modes_and_assignments_only() {
        let o = Overrides {
            page_modes: Some(BTreeMap::from([
                (
                    "qa".to_string(),
                    BTreeMap::from([
                        ("code/changes".to_string(), "read-only".to_string()),
                        ("code/changes/x".to_string(), "hidden".to_string()),
                        ("work/board".to_string(), "editable".to_string()),
                    ]),
                ),
                (
                    "boss".to_string(),
                    BTreeMap::from([("code/changes".to_string(), "hidden".to_string())]),
                ),
            ])),
            assignments: Some(BTreeMap::from([
                (" Ada@Example.com ".to_string(), "qa".to_string()),
                ("nobody".to_string(), "qa".to_string()),
                ("bob@example.com".to_string(), "boss".to_string()),
            ])),
            ..Default::default()
        }
        .clean();
        let modes = o.page_modes.unwrap();
        assert_eq!(modes.len(), 1);
        assert_eq!(modes["qa"].len(), 1);
        assert_eq!(modes["qa"]["code/changes"], "read-only");
        let a = o.assignments.unwrap();
        assert_eq!(a.len(), 1);
        assert_eq!(a["ada@example.com"], "qa");
        assert!(Overrides::default().clean().assignments.is_none());
    }
}
