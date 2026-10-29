//! The codec of `.shipyard/automation.yaml`: pickup filter, concurrency, status mapping and the
//! write switches (spec `sync`, REQ-002, REQ-004, REQ-006, REQ-007). The model lives in
//! `shipyard_core::pickup`. A missing file means the defaults, so the caller decides that.

use std::collections::BTreeMap;
use std::path::Path;

use shipyard_core::pickup::{AUTOMATION_FILE, Automation, StateMapping};
use shipyard_core::run::RunState;

use crate::Result;
use crate::project::{Issues, line_of, write_atomic};

pub enum AutomationRead {
    Missing,
    Valid(Automation),
    Invalid(Issues),
}

/// Each issue: the line, when known, and the text.
pub fn parse_automation(text: &str) -> std::result::Result<Automation, Issues> {
    // An empty file is a null document. It means the defaults.
    if text.trim().is_empty() {
        return Ok(Automation::default());
    }
    let auto: Automation = serde_yaml::from_str(text)
        .map_err(|e| vec![(e.location().map(|l| l.line()), e.to_string())])?;
    let issues: Issues = auto
        .validate()
        .into_iter()
        .map(|i| {
            (
                line_of(text, &i.field, &i.value),
                format!("{}: {}", i.field, i.value),
            )
        })
        .collect();
    if issues.is_empty() {
        Ok(auto)
    } else {
        Err(issues)
    }
}

pub fn read_automation(root: &Path) -> Result<AutomationRead> {
    match std::fs::read_to_string(root.join(AUTOMATION_FILE)) {
        Ok(text) => Ok(match parse_automation(&text) {
            Ok(a) => AutomationRead::Valid(a),
            Err(i) => AutomationRead::Invalid(i),
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(AutomationRead::Missing),
        Err(e) => Err(e.into()),
    }
}

/// YAML text. Unset optional parts stay out. A null label stays in: absent means the default.
pub fn render_automation(a: &Automation) -> Result<String> {
    Ok(serde_yaml::to_string(&serde_yaml::to_value(a)?)?)
}

/// Write after validation. An invalid value is never written (REQ-002: the old file stays).
pub fn write_automation(root: &Path, a: &Automation) -> Result<()> {
    if let Some(i) = a.validate().first() {
        return Err(format!("invalid automation file: {} = {}", i.field, i.value).into());
    }
    write_atomic(
        &root.join(AUTOMATION_FILE),
        render_automation(a)?.as_bytes(),
    )
}

/// The default row of each of the sixteen states (`factory` plan, REQ-008). `None` is "unchanged".
pub fn default_status_map() -> BTreeMap<String, StateMapping> {
    use RunState as S;
    let row = |status: Option<&str>, labels: &[&str]| StateMapping {
        status: status.map(Into::into),
        labels: labels.iter().map(|l| l.to_string()).collect(),
    };
    RunState::ALL
        .into_iter()
        .map(|s| {
            let m = match s {
                S::Queued => row(None, &["shipyard"]),
                S::Claimed | S::Planning | S::Working | S::SelfReview | S::ChangesRequested => {
                    row(Some("In Progress"), &["shipyard:running"])
                }
                S::PlanReview => row(Some("In Progress"), &["shipyard:needs-you"]),
                S::WaitingForAnswer => row(Some("Needs info"), &["shipyard:needs-you"]),
                S::Blocked => row(None, &["shipyard:blocked"]),
                S::RetryQueued => row(None, &["shipyard:retry"]),
                S::Paused => row(None, &["shipyard:paused"]),
                S::PROpen => row(Some("In Review"), &["shipyard:in-review"]),
                S::Merged | S::Done => row(Some("Done"), &[]),
                S::Failed => row(None, &["shipyard:failed"]),
                S::Cancelled => row(None, &[]),
            };
            (s.as_str().to_string(), m)
        })
        .collect()
}

/// The map that the engine uses: the defaults, with each row of the file in place of its default.
/// A state with no row in the file keeps its default row (REQ-008).
pub fn status_map(a: &Automation) -> BTreeMap<String, StateMapping> {
    let mut m = default_status_map();
    m.extend(a.status_map.clone());
    m
}

pub struct AutomationLoad {
    pub automation: Automation,
    /// Why the file was refused. The automation is then `last`.
    pub issues: Option<Issues>,
}

/// Load the file for a reload. An invalid file keeps `last` and names its issues. A missing file
/// is the defaults (REQ-008: keep the last valid mapping).
pub fn load_automation(root: &Path, last: &Automation) -> Result<AutomationLoad> {
    Ok(match read_automation(root)? {
        AutomationRead::Missing => AutomationLoad {
            automation: Automation::default(),
            issues: None,
        },
        AutomationRead::Valid(automation) => AutomationLoad {
            automation,
            issues: None,
        },
        AutomationRead::Invalid(i) => AutomationLoad {
            automation: last.clone(),
            issues: Some(i),
        },
    })
}
