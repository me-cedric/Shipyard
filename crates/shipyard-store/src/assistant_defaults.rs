//! The default runner, model, effort and mode of new assistant threads, for each project (spec
//! `assistant`, REQ-019). Like the project overrides, they are personal and live in the app data
//! folder, never in the repository: `<data>/assistant/<project>/defaults.json`. A separate file,
//! because `Registry::set_overrides` replaces the whole override and would erase them.

use std::path::Path;

use serde::{Deserialize, Serialize};
use shipyard_core::assistant::{AssistantMode, Permission, ThreadSettings};
use specta::Type;

use crate::Result;
use crate::project::write_atomic;

/// The runner of a new thread when the project sets none (Q-024 option 1).
pub const DEFAULT_RUNNER: &str = "claude";

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssistantDefaults {
    pub runner: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub mode: Option<AssistantMode>,
    pub permission: Option<Permission>,
}

impl AssistantDefaults {
    /// The settings of a new thread. A set value wins, an unset one takes the plain default.
    pub fn settings(&self) -> ThreadSettings {
        let runner = self.runner.as_deref().unwrap_or(DEFAULT_RUNNER);
        let mut s = ThreadSettings::new(runner);
        s.model = self.model.clone();
        s.effort = self.effort.clone();
        s.mode = self.mode.unwrap_or_default();
        s.permission = self.permission.unwrap_or_default();
        s
    }
}

fn file(data: &Path, project: &str) -> Result<std::path::PathBuf> {
    let plain = !project.is_empty()
        && !project.starts_with(['-', '.'])
        && project
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if !plain {
        return Err(format!("not a plain project id: {project}").into());
    }
    Ok(data.join("assistant").join(project).join("defaults.json"))
}

/// A missing or unreadable file gives the plain defaults.
pub fn load(data: &Path, project: &str) -> AssistantDefaults {
    file(data, project)
        .ok()
        .and_then(|f| std::fs::read(f).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

pub fn save(data: &Path, project: &str, d: &AssistantDefaults) -> Result<()> {
    write_atomic(&file(data, project)?, &serde_json::to_vec_pretty(d)?)
}
