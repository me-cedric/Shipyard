//! The roles and the skills that the factory and the assistant load, and who loads each (spec
//! `extensions`, REQ-008). A role file or a skill is read at the start of a run or a turn, so an
//! edit applies to the next one and a run in progress keeps its version.

use std::collections::BTreeSet;
use std::path::Path;

use serde::{Deserialize, Serialize};
use shipyard_core::workflow::DEFAULT_ROLES;
use specta::Type;

use crate::Result;
use crate::factory_files::{Loaded, ROLES_DIR, load};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
#[serde(rename = "RoleSkillKind")]
pub enum RowKind {
    Role,
    Skill,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "RoleSkillRow", rename_all = "camelCase")]
pub struct Row {
    pub kind: RowKind,
    pub name: String,
    /// `factory`, `assistant`.
    pub loaders: Vec<String>,
    /// The workflows that name a role.
    pub used_by: Vec<String>,
    /// The file, relative to the project root. `None` for a bundled role with no project file.
    pub path: Option<String>,
}

const SKILL_DIRS: [&str; 2] = [".claude/skills", ".agents/skills"];

pub fn list(root: &Path) -> Result<Vec<Row>> {
    let loaded = load(root, &Loaded::default())?;
    let mut roles: BTreeSet<String> = DEFAULT_ROLES.iter().map(|r| r.to_string()).collect();
    roles.extend(loaded.roles.keys().cloned());
    let mut rows: Vec<Row> = roles
        .into_iter()
        .map(|name| Row {
            kind: RowKind::Role,
            used_by: loaded
                .workflows
                .iter()
                .filter(|(_, w)| w.steps.iter().any(|s| s.role.as_deref() == Some(&name)))
                .map(|(id, _)| id.clone())
                .collect(),
            path: loaded
                .roles
                .contains_key(&name)
                .then(|| format!("{ROLES_DIR}/{name}.md")),
            loaders: vec!["factory".into()],
            name,
        })
        .collect();
    let mut seen = BTreeSet::new();
    for dir in SKILL_DIRS {
        let mut found: Vec<String> = std::fs::read_dir(root.join(dir))
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| e.path().join("SKILL.md").is_file())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        found.sort();
        for name in found {
            if seen.insert(name.clone()) {
                rows.push(Row {
                    kind: RowKind::Skill,
                    path: Some(format!("{dir}/{name}/SKILL.md")),
                    loaders: vec!["factory".into(), "assistant".into()],
                    used_by: Vec::new(),
                    name,
                });
            }
        }
    }
    Ok(rows)
}
