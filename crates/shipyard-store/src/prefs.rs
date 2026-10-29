//! Personal preferences in the app data folder (spec `shell` REQ-015: not in the browser storage).

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::Result;
use crate::project::write_atomic;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Default,
    Compact,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Contrast {
    Default,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    None,
    Pm,
    Architect,
    Developer,
    Qa,
    Ba,
    Lead,
    Junior,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    En,
    Fr,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub theme: Theme,
    pub density: Density,
    pub contrast: Contrast,
    pub role: Role,
    pub sidebar_open: bool,
    /// `None` until the person picks one. The UI then follows the system language.
    pub lang: Option<Lang>,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            density: Density::Default,
            contrast: Contrast::Default,
            role: Role::None,
            sidebar_open: true,
            lang: None,
        }
    }
}

#[derive(Debug, Default, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PrefsPatch {
    pub theme: Option<Theme>,
    pub density: Option<Density>,
    pub contrast: Option<Contrast>,
    pub role: Option<Role>,
    pub sidebar_open: Option<bool>,
    pub lang: Option<Lang>,
}

const FILE: &str = "prefs.json";

impl Prefs {
    /// A missing or unreadable file gives the defaults. Preferences are not worth a failure.
    pub fn load(dir: &Path) -> Self {
        std::fs::read(dir.join(FILE))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> Result<()> {
        write_atomic(&dir.join(FILE), &serde_json::to_vec_pretty(self)?)
    }

    pub fn apply(&mut self, p: PrefsPatch) {
        self.theme = p.theme.unwrap_or(self.theme);
        self.density = p.density.unwrap_or(self.density);
        self.contrast = p.contrast.unwrap_or(self.contrast);
        self.role = p.role.unwrap_or(self.role);
        self.sidebar_open = p.sidebar_open.unwrap_or(self.sidebar_open);
        self.lang = p.lang.or(self.lang);
    }
}
