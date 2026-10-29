//! The project file codec and the project registry (spec `projects`, REQ-007 to REQ-010, REQ-019).
//! The registry lives in the app data folder. It holds machine paths and personal overrides.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_yaml::Value;
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

fn line_of(text: &str, field: &str, value: &str) -> Option<usize> {
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
    let file: ProjectFile = serde_yaml::from_str(text).map_err(|e| {
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
    let mut v = serde_yaml::to_value(f)?;
    if let Value::Mapping(m) = &mut v {
        m.retain(|_, x| !x.is_null() && !matches!(x, Value::Sequence(s) if s.is_empty()));
    }
    Ok(serde_yaml::to_string(&v)?)
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
pub struct Overrides {
    pub theme: Option<Theme>,
    pub density: Option<Density>,
    pub contrast: Option<Contrast>,
    pub accent: Option<Accent>,
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
