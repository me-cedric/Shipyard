//! The codec of `.shipyard/automation.yaml`: pickup filter, concurrency, status mapping and the
//! write switches (spec `sync`, REQ-002, REQ-004, REQ-006, REQ-007). The model lives in
//! `shipyard_core::pickup`. A missing file means the defaults, so the caller decides that.

use std::path::Path;

use shipyard_core::pickup::{AUTOMATION_FILE, Automation};

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
