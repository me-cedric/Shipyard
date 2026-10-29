//! The catalog and the deploy writer (spec `extensions`, REQ-009, REQ-010, REQ-017). A component
//! is a folder of files under `<compass tree>/catalog/<group>/<name>/`. The catalog comes from the
//! pinned compass version (ADR 0010). The OpenSpec guidance ships built in. The project records
//! the components that it holds and their versions in `.shipyard/components.json` (Q-073).

use std::collections::BTreeMap;
use std::fs;
use std::io::Write as _;
use std::path::Path;

use serde::{Deserialize, Serialize};
use shipyard_core::extensions::{SyncState, WriteReport, plan_write};
use specta::Type;

use crate::Result;
use crate::compass::{tree_of, walk_files};
use crate::project::write_atomic;

pub const RECORD: &str = ".shipyard/components.json";
pub const GUIDANCE: &str = "agents/openspec-guidance";
const GUIDANCE_FILES: [(&str, &str); 3] = [
    ("docs/openspec/specs/.gitkeep", ""),
    ("docs/openspec/changes/.gitkeep", ""),
    (
        "AGENTS.md",
        "# Agent instructions\n\nRead the specs in `docs/openspec/specs/` before a change. Start a change in `docs/openspec/changes/`.\n",
    ),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
#[serde(rename = "CatalogGroup")]
pub enum Group {
    Devcontainers,
    Agents,
    DevopsSecurity,
}

const GROUPS: [(Group, &str); 3] = [
    (Group::Devcontainers, "devcontainers"),
    (Group::Agents, "agents"),
    (Group::DevopsSecurity, "devops-security"),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Component {
    /// `<group folder>/<name>`.
    pub id: String,
    pub name: String,
    pub group: Group,
    pub files: Vec<String>,
    pub version: String,
    /// Absent: not deployed. Current: deployed at this version. Stale: deployed at another one.
    pub state: SyncState,
}

type Files = Vec<(String, Vec<u8>)>;

fn record(root: &Path) -> BTreeMap<String, String> {
    fs::read_to_string(root.join(RECORD))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn version_of(root: &Path, tree: &str) -> String {
    fs::read_to_string(root.join(tree).join("package.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("version")?.as_str().map(str::to_string))
        .unwrap_or_default()
}

/// The files of a component, read from the catalog or the built-in guidance.
pub fn files_of(root: &Path, id: &str) -> Result<Files> {
    if id == GUIDANCE {
        return Ok(GUIDANCE_FILES
            .iter()
            .map(|(p, t)| ((*p).into(), t.as_bytes().to_vec()))
            .collect());
    }
    let (folder, name) = id.split_once('/').ok_or("unknown component")?;
    if !GROUPS.iter().any(|(_, g)| *g == folder)
        || name.contains(['/', '\\'])
        || name.starts_with('.')
    {
        return Err("unknown component".into());
    }
    let tree = tree_of(root).ok_or("no compass is pinned")?;
    let top = root.join(tree).join("catalog").join(folder).join(name);
    if !top.is_dir() {
        return Err("unknown component".into());
    }
    walk_files(&top)?
        .into_iter()
        .map(|rel| Ok((rel.clone(), fs::read(top.join(&rel))?)))
        .collect()
}

pub fn list(root: &Path) -> Result<Vec<Component>> {
    let tree = tree_of(root);
    let version = tree
        .as_deref()
        .map_or(String::new(), |t| version_of(root, t));
    let held = record(root);
    let mut ids: Vec<(Group, String)> = vec![(Group::Agents, GUIDANCE.into())];
    for (group, folder) in GROUPS {
        let dir = tree
            .as_ref()
            .map(|t| root.join(t).join("catalog").join(folder));
        let mut names: Vec<String> = dir
            .and_then(|d| fs::read_dir(d).ok())
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| e.path().is_dir() && !e.file_name().to_string_lossy().starts_with('.'))
            .map(|e| format!("{folder}/{}", e.file_name().to_string_lossy()))
            .collect();
        names.sort();
        ids.extend(names.into_iter().map(|n| (group, n)));
    }
    ids.into_iter()
        .map(|(group, id)| {
            let state = match held.get(&id) {
                None => SyncState::Absent,
                Some(v) if *v == version => SyncState::Current,
                Some(_) => SyncState::Stale,
            };
            Ok(Component {
                name: id.rsplit('/').next().unwrap_or(&id).into(),
                files: files_of(root, &id)?.into_iter().map(|(p, _)| p).collect(),
                version: version.clone(),
                group,
                state,
                id,
            })
        })
        .collect()
}

/// Write the files that do not exist and keep the others. The check and the create are one step
/// (`create_new`), and a link may not lead out of the root (REQ-003, REQ-010, REQ-012).
pub fn write_new(root: &Path, files: &[(String, Vec<u8>)]) -> Result<WriteReport> {
    let report = plan_write(files.iter().map(|(p, _)| p.as_str()), |p| {
        root.join(p).symlink_metadata().is_ok()
    })?;
    let base = root.canonicalize()?;
    let mut out = WriteReport::default();
    for rel in report.written {
        let path = root.join(&rel);
        let dir = path.parent().ok_or("path not allowed")?;
        // Check the nearest existing folder first: `create_dir_all` would follow a link out.
        let near = dir.ancestors().find(|a| a.exists());
        if !near.is_some_and(|a| a.canonicalize().is_ok_and(|a| a.starts_with(&base))) {
            return Err(format!("path not allowed: {rel}").into());
        }
        fs::create_dir_all(dir)?;
        let bytes = &files.iter().find(|(p, _)| *p == rel).ok_or("file lost")?.1;
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut f) => {
                f.write_all(bytes)?;
                out.written.push(rel);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => out.kept.push(rel),
            Err(e) => return Err(e.into()),
        }
    }
    out.kept.extend(report.kept);
    Ok(out)
}

/// What a deploy would do, with nothing written (REQ-010).
pub fn preview(root: &Path, id: &str) -> Result<WriteReport> {
    let files = files_of(root, id)?;
    Ok(plan_write(files.iter().map(|(p, _)| p.as_str()), |p| {
        root.join(p).symlink_metadata().is_ok()
    })?)
}

/// Write the files of a component of `from` into `to` and record it there with its version. A
/// parent deploys to a child with two roots. The person has seen the files first (REQ-010).
pub fn deploy_to(from: &Path, to: &Path, id: &str) -> Result<WriteReport> {
    let version = tree_of(from).map_or(String::new(), |t| version_of(from, &t));
    let report = write_new(to, &files_of(from, id)?)?;
    let mut held = record(to);
    held.insert(id.into(), version);
    write_atomic(
        &to.join(RECORD),
        serde_json::to_string_pretty(&held)?.as_bytes(),
    )?;
    Ok(report)
}

pub fn deploy(root: &Path, id: &str) -> Result<WriteReport> {
    deploy_to(root, root, id)
}

/// `component:<id>` of each component that the project records (REQ-015).
pub fn held(root: &Path) -> Vec<String> {
    record(root)
        .into_keys()
        .map(|k| format!("component:{k}"))
        .collect()
}
