//! The own rules of a project (spec `extensions`): import a rules file as an instinct, remove an
//! instinct, and apply a guardrail policy pack. The policy packs and their gates are copied from
//! Legacy `resources/compass/templates/policies/*.json` (`apply_policy` in `compass/contract.rs`).
//! A policy is replaced on a second apply, so a switch of pack takes effect.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::Result;
use crate::project::write_atomic;

const INSTINCTS: &str = ".agents/instincts";
const POLICY: &str = ".agents/policy.json";
const POLICY_TEXT: &str = ".agents/policy.md";
const MAX_RULES: u64 = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "CompassPolicy")]
pub struct Policy {
    pub id: String,
    pub description: String,
    pub gates: Vec<String>,
    pub constraints: Vec<String>,
}

fn pack(id: &str, description: &str, gates: &[&str], constraints: &[&str]) -> Policy {
    let own = |l: &[&str]| l.iter().map(|s| (*s).to_string()).collect();
    Policy {
        id: id.into(),
        description: description.into(),
        gates: own(gates),
        constraints: own(constraints),
    }
}

/// The packs that a project may apply.
pub fn policies() -> Vec<Policy> {
    vec![
        pack(
            "solo-dev",
            "Personal setup with strong defaults and little ceremony.",
            &["provider-verify", "recommend", "dashboard"],
            &[],
        ),
        pack(
            "safe-local-work",
            "Local-only work: inspect, edit, validate and report, with no outward or destructive action.",
            &[
                "provider-verify",
                "recommend",
                "quality-gates",
                "redact",
                "dashboard",
            ],
            &[
                "no commit unless explicitly requested",
                "no push unless explicitly requested",
                "no PR unless explicitly requested",
                "no deploy unless explicitly requested",
                "no production write unless explicitly requested",
                "no secrets, tokens, passwords, private keys or raw env values in output",
            ],
        ),
        pack(
            "strict-enterprise",
            "High-control setup for multi-team or regulated repositories.",
            &[
                "provider-verify --strict",
                "quality-gates --strict",
                "spec-validation-map --strict",
                "mcp-probe --strict",
                "redact",
                "agent-conformance --strict",
            ],
            &[],
        ),
    ]
}

/// The id of the policy that the project holds, or `None`.
pub fn policy_applied(root: &Path) -> Option<String> {
    let v: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(root.join(POLICY)).ok()?).ok()?;
    v.get("id")?.as_str().map(str::to_string)
}

/// Write `.agents/policy.json` and a readable `.agents/policy.md`. Returns the two paths.
pub fn policy_apply(root: &Path, id: &str) -> Result<Vec<String>> {
    let p = policies()
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("unknown policy pack: {id}"))?;
    let mut md = format!(
        "# Agent policy: {}\n\n{}\n\n## Required gates\n\n",
        p.id, p.description
    );
    for g in &p.gates {
        md.push_str(&format!("- `{g}`\n"));
    }
    if !p.constraints.is_empty() {
        md.push_str("\n## Constraints\n\n");
        for c in &p.constraints {
            md.push_str(&format!("- {c}\n"));
        }
    }
    write_atomic(
        &root.join(POLICY),
        serde_json::to_string_pretty(&p)?.as_bytes(),
    )?;
    write_atomic(&root.join(POLICY_TEXT), md.as_bytes())?;
    Ok(vec![POLICY.into(), POLICY_TEXT.into()])
}

/// The id of an instinct: letters, digits, `-`, `_`.
fn slug(stem: &str) -> String {
    stem.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// Copy a rules file (`.md`, text, at most 256 KB) to `.agents/instincts/<id>.md`. It never
/// replaces an instinct that exists. Returns the id.
pub fn import_rules(root: &Path, source: &Path) -> Result<String> {
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default();
    if !["md", "markdown", "txt"].contains(&ext.to_lowercase().as_str()) {
        return Err("a rules file is a .md or .txt file".into());
    }
    let meta = fs::metadata(source)?;
    if !meta.is_file() || meta.len() > MAX_RULES {
        return Err("the rules file is not a file or is too large".into());
    }
    let text = fs::read_to_string(source).map_err(|_| "the rules file is not text")?;
    let id = slug(
        source
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default(),
    );
    if id.is_empty() {
        return Err("the rules file has no usable name".into());
    }
    let target = root.join(INSTINCTS).join(format!("{id}.md"));
    if target.exists() {
        return Err(format!("{id} exists").into());
    }
    write_atomic(&target, text.as_bytes())?;
    Ok(id)
}

/// Delete the instinct of the project. The compass tree is not touched.
pub fn remove_pattern(root: &Path, id: &str) -> Result<()> {
    if id.is_empty() || id.contains(['/', '\\']) || id.starts_with('.') {
        return Err(format!("path not allowed: {id}").into());
    }
    let file = root.join(INSTINCTS).join(format!("{id}.md"));
    if !file.is_file() {
        return Err(format!("no instinct in the project: {id}").into());
    }
    Ok(fs::remove_file(file)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rules_file_becomes_an_instinct_once_and_can_be_removed() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("My Rules.md");
        fs::write(&src, "# Rules\nBe kind.\n").unwrap();
        let id = import_rules(dir.path(), &src).unwrap();
        assert_eq!(id, "my-rules");
        assert!(
            import_rules(dir.path(), &src)
                .unwrap_err()
                .to_string()
                .contains("exists")
        );
        remove_pattern(dir.path(), &id).unwrap();
        assert!(remove_pattern(dir.path(), &id).is_err());
        assert!(remove_pattern(dir.path(), "../x").is_err());
    }

    #[test]
    fn a_binary_or_odd_file_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("a.exe");
        fs::write(&exe, "x").unwrap();
        assert!(import_rules(dir.path(), &exe).is_err());
        let bin = dir.path().join("b.md");
        fs::write(&bin, [0xff, 0xfe, 0x00]).unwrap();
        assert!(import_rules(dir.path(), &bin).is_err());
    }

    #[test]
    fn a_second_policy_replaces_the_first() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(policy_applied(dir.path()), None);
        policy_apply(dir.path(), "solo-dev").unwrap();
        assert_eq!(policy_applied(dir.path()).as_deref(), Some("solo-dev"));
        policy_apply(dir.path(), "strict-enterprise").unwrap();
        assert_eq!(
            policy_applied(dir.path()).as_deref(),
            Some("strict-enterprise")
        );
        let md = fs::read_to_string(dir.path().join(POLICY_TEXT)).unwrap();
        assert!(md.contains("agent-conformance --strict"));
        assert!(policy_apply(dir.path(), "nope").is_err());
    }
}
