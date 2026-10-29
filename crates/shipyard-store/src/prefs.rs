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

/// The side of the window that the assistant panel sits on (spec `assistant`, REQ-025).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum PanelSide {
    Left,
    Right,
}

/// A source of events that can notify the person (spec `shell`, REQ-008). One list feeds the
/// notification centre and the system notifications.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum EventSource {
    /// A factory question.
    Question,
    Approval,
    /// A run that waits for a person.
    Run,
    SyncFailure,
    Update,
    /// The remote head moved.
    RemoteHead,
}

pub const PANEL_WIDTH: std::ops::RangeInclusive<u32> = 280..=900;

fn default_panel_width() -> u32 {
    400
}

fn default_panel_side() -> PanelSide {
    PanelSide::Right
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
    /// Where the update check reads the latest release (spec `shell`, REQ-014). It only informs.
    #[serde(default = "default_release_url")]
    pub release_url: String,
    /// Width of the assistant panel, in pixels.
    #[serde(default = "default_panel_width")]
    pub assistant_width: u32,
    #[serde(default = "default_panel_side")]
    pub assistant_side: PanelSide,
    /// The sources that do not notify. Empty means all are on, so a new source starts on.
    #[serde(default)]
    pub notify_off: Vec<EventSource>,
    /// The version whose changelog the person has seen. `None` until the first check records it.
    #[serde(default)]
    pub seen_version: Option<String>,
}

/// The latest release of the Shipyard repository, in the GitHub API form.
pub const DEFAULT_RELEASE_URL: &str =
    "https://api.github.com/repos/me-cedric/Shipyard/releases/latest";

fn default_release_url() -> String {
    DEFAULT_RELEASE_URL.into()
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
            release_url: default_release_url(),
            assistant_width: default_panel_width(),
            assistant_side: default_panel_side(),
            notify_off: Vec::new(),
            seen_version: None,
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
    pub release_url: Option<String>,
    pub assistant_width: Option<u32>,
    pub assistant_side: Option<PanelSide>,
    pub notify_off: Option<Vec<EventSource>>,
    pub seen_version: Option<String>,
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
        if let Some(w) = p.assistant_width {
            self.assistant_width = w.clamp(*PANEL_WIDTH.start(), *PANEL_WIDTH.end());
        }
        self.assistant_side = p.assistant_side.unwrap_or(self.assistant_side);
        if let Some(off) = p.notify_off {
            self.notify_off.clear();
            for source in off {
                if !self.notify_off.contains(&source) {
                    self.notify_off.push(source);
                }
            }
        }
        self.seen_version = p.seen_version.or(self.seen_version.take());
        if let Some(url) = p.release_url {
            // An empty value goes back to the default.
            self.release_url = if url.trim().is_empty() {
                default_release_url()
            } else {
                url.trim().to_string()
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_from_before_the_release_address_keeps_its_values() {
        let dir = tempfile::tempdir().unwrap();
        let old = r#"{"theme":"dark","density":"default","contrast":"default","role":"none","sidebarOpen":true,"lang":"fr"}"#;
        std::fs::write(dir.path().join(FILE), old).unwrap();
        let p = Prefs::load(dir.path());
        assert_eq!((p.theme, p.lang), (Theme::Dark, Some(Lang::Fr)));
        assert_eq!(p.release_url, DEFAULT_RELEASE_URL);
    }

    #[test]
    fn the_panel_width_and_side_persist_and_the_width_stays_in_range() {
        let dir = tempfile::tempdir().unwrap();
        let mut p = Prefs::default();
        assert_eq!(
            (p.assistant_width, p.assistant_side),
            (400, PanelSide::Right)
        );
        p.apply(PrefsPatch {
            assistant_width: Some(5000),
            assistant_side: Some(PanelSide::Left),
            ..Default::default()
        });
        assert_eq!(
            (p.assistant_width, p.assistant_side),
            (900, PanelSide::Left)
        );
        p.save(dir.path()).unwrap();
        let q = Prefs::load(dir.path());
        assert_eq!(
            (q.assistant_width, q.assistant_side),
            (900, PanelSide::Left)
        );
    }

    #[test]
    fn every_source_notifies_until_the_person_turns_one_off() {
        let mut p = Prefs::default();
        assert!(p.notify_off.is_empty());
        p.apply(PrefsPatch {
            notify_off: Some(vec![
                EventSource::Update,
                EventSource::Update,
                EventSource::Run,
            ]),
            ..Default::default()
        });
        assert_eq!(p.notify_off, [EventSource::Update, EventSource::Run]);
        p.apply(PrefsPatch::default());
        assert_eq!(p.notify_off.len(), 2, "an empty patch keeps the choice");
        p.apply(PrefsPatch {
            notify_off: Some(vec![]),
            seen_version: Some("0.2.0".into()),
            ..Default::default()
        });
        assert!(p.notify_off.is_empty());
        assert_eq!(p.seen_version.as_deref(), Some("0.2.0"));
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(FILE), r#"{"theme":"dark","density":"default","contrast":"default","role":"none","sidebarOpen":true,"lang":null}"#).unwrap();
        assert!(
            Prefs::load(dir.path()).notify_off.is_empty(),
            "an old file: all on"
        );
    }

    #[test]
    fn the_release_address_changes_and_an_empty_one_restores_the_default() {
        let mut p = Prefs::default();
        let set = |p: &mut Prefs, url: &str| {
            p.apply(PrefsPatch {
                release_url: Some(url.into()),
                ..Default::default()
            })
        };
        set(&mut p, " https://example.com/latest ");
        assert_eq!(p.release_url, "https://example.com/latest");
        set(&mut p, " ");
        assert_eq!(p.release_url, DEFAULT_RELEASE_URL);
    }
}
