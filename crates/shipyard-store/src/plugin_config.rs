//! The typed settings of an applied plugin and its deploy to a child clone (spec `extensions`).
//!
//! A manifest setting is a text default (`"region": "eu"`) or a typed field
//! (`"region": { "type": "choice", "default": "eu", "choices": ["eu", "us"], "required": true }`).
//! The record `.shipyard/plugins.json` keeps the field and the value. A value is checked against
//! its field, and a secret value is refused: a setting holds a `${VAR}` reference instead.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use shipyard_core::extensions::WriteReport;
use specta::Type;

use crate::Result;
use crate::catalog::write_new;
use crate::plugins::{Applied, RECORD, is_secret, sha};
use crate::project::write_atomic;

const MAX_VALUE: usize = 4096;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
#[serde(rename = "PluginSettingKind")]
pub enum SettingKind {
    #[default]
    Text,
    Number,
    Boolean,
    Choice,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "PluginSettingField")]
pub struct SettingField {
    #[serde(rename = "type", default)]
    pub kind: SettingKind,
    #[serde(default)]
    pub choices: Vec<String>,
    #[serde(default)]
    pub required: bool,
}

/// A setting in `manifest.json`: a text default, or a typed field.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub(crate) enum SettingSpec {
    Plain(String),
    Typed(TypedSpec),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TypedSpec {
    #[serde(rename = "type")]
    kind: SettingKind,
    #[serde(default)]
    default: Value,
    #[serde(default)]
    choices: Vec<String>,
    #[serde(default)]
    required: bool,
}

impl SettingSpec {
    /// The default value as text and the field.
    pub(crate) fn split(self) -> (String, SettingField) {
        match self {
            Self::Plain(v) => (v, SettingField::default()),
            Self::Typed(t) => {
                let v = match t.default {
                    Value::Null => String::new(),
                    Value::String(s) => s,
                    other => other.to_string(),
                };
                let field = SettingField {
                    kind: t.kind,
                    choices: t.choices,
                    required: t.required,
                };
                (v, field)
            }
        }
    }
}

/// The value as the field wants it. An empty value is valid unless the field is required.
pub fn check(key: &str, field: &SettingField, value: &str) -> Result<String> {
    let v = value.trim();
    if is_secret(key, v) {
        return Err(format!("the plugin holds a secret value: {key}").into());
    }
    if v.len() > MAX_VALUE {
        return Err(format!("the setting {key} is too long").into());
    }
    if v.is_empty() {
        return if field.required {
            Err(format!("the setting {key} is required").into())
        } else {
            Ok(String::new())
        };
    }
    let ok = match field.kind {
        SettingKind::Text => true,
        SettingKind::Number => v.parse::<f64>().is_ok_and(f64::is_finite),
        SettingKind::Boolean => v == "true" || v == "false",
        SettingKind::Choice => field.choices.iter().any(|c| c == v),
    };
    if !ok {
        return Err(format!("the setting {key} is not a valid {:?} value", field.kind).into());
    }
    Ok(v.to_string())
}

fn records(root: &Path) -> BTreeMap<String, Applied> {
    std::fs::read_to_string(root.join(RECORD))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save(root: &Path, all: &BTreeMap<String, Applied>) -> Result<()> {
    write_atomic(
        &root.join(RECORD),
        serde_json::to_string_pretty(all)?.as_bytes(),
    )
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename = "PluginSetting")]
pub struct SettingRow {
    pub key: String,
    pub field: SettingField,
    pub value: String,
}

fn rows(a: &Applied) -> Vec<SettingRow> {
    a.settings
        .iter()
        .map(|(k, v)| SettingRow {
            key: k.clone(),
            field: a.fields.get(k).cloned().unwrap_or_default(),
            value: v.clone(),
        })
        .collect()
}

/// The settings that the plugin applied, with their fields.
pub fn settings(root: &Path, name: &str) -> Result<Vec<SettingRow>> {
    let all = records(root);
    let a = all
        .get(name)
        .ok_or_else(|| format!("unknown plugin: {name}"))?;
    Ok(rows(a))
}

/// Saves the given values. Each key must be a setting of the plugin. Nothing is written when one
/// value is not valid.
pub fn settings_save(
    root: &Path,
    name: &str,
    values: &BTreeMap<String, String>,
) -> Result<Vec<SettingRow>> {
    let mut all = records(root);
    let a = all
        .get_mut(name)
        .ok_or_else(|| format!("unknown plugin: {name}"))?;
    let mut next = a.settings.clone();
    for (k, v) in values {
        if !a.settings.contains_key(k) {
            return Err(format!("unknown setting: {k}").into());
        }
        let field = a.fields.get(k).cloned().unwrap_or_default();
        next.insert(k.clone(), check(k, &field, v)?);
    }
    a.settings = next;
    let out = rows(a);
    save(root, &all)?;
    Ok(out)
}

/// `plugin:<name>` for each plugin that the record of `root` holds.
pub fn held(root: &Path) -> Vec<String> {
    records(root)
        .into_keys()
        .map(|n| format!("plugin:{n}"))
        .collect()
}

/// Copies the files that a plugin wrote in `parent` to `dir`, and its record with its settings.
/// A file that exists in `dir` is kept. A file that a person deleted in `parent` is skipped.
pub fn deploy_to(parent: &Path, dir: &Path, name: &str) -> Result<WriteReport> {
    let rec = records(parent)
        .remove(name)
        .ok_or_else(|| format!("unknown plugin: {name}"))?;
    let mut files = Vec::new();
    for target in rec.files.keys() {
        let path = parent.join(target);
        // A link is not followed out of the project.
        if path.symlink_metadata().is_ok_and(|m| m.is_file()) {
            files.push((target.clone(), std::fs::read(&path)?));
        }
    }
    let report = write_new(dir, &files)?;
    let mut all = records(dir);
    // The child keeps the hashes of the files that an earlier deploy wrote.
    let mut kept = all.remove(name).map(|a| a.files).unwrap_or_default();
    kept.retain(|t, _| rec.files.contains_key(t));
    let mut copy = rec;
    copy.files = kept;
    for (t, b) in files.iter().filter(|(t, _)| report.written.contains(t)) {
        copy.files.insert(t.clone(), sha(b));
    }
    all.insert(name.into(), copy);
    save(dir, &all)?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(root: &Path) {
        let mut a = Applied {
            version: "1.0.0".into(),
            ..Default::default()
        };
        a.files.insert("docs/kit.md".into(), sha(b"kit"));
        a.settings.insert("region".into(), "eu".into());
        a.settings.insert("note".into(), String::new());
        a.fields.insert(
            "region".into(),
            SettingField {
                kind: SettingKind::Choice,
                choices: vec!["eu".into(), "us".into()],
                required: true,
            },
        );
        save(root, &BTreeMap::from([("kit".to_string(), a)])).unwrap();
        std::fs::create_dir_all(root.join("docs")).unwrap();
        std::fs::write(root.join("docs/kit.md"), "kit").unwrap();
    }

    #[test]
    fn a_value_is_checked_against_its_field() {
        let num = SettingField {
            kind: SettingKind::Number,
            ..Default::default()
        };
        assert_eq!(check("n", &num, " 4.5 ").unwrap(), "4.5");
        assert!(check("n", &num, "four").is_err());
        let yes = SettingField {
            kind: SettingKind::Boolean,
            ..Default::default()
        };
        assert!(check("b", &yes, "true").is_ok() && check("b", &yes, "yes").is_err());
        assert!(check("api_token", &SettingField::default(), "abc").is_err());
        assert!(check("api_token", &SettingField::default(), "${TOKEN}").is_ok());
        let (v, f) = serde_json::from_str::<SettingSpec>(r#"{"type":"number","default":3}"#)
            .unwrap()
            .split();
        assert_eq!((v.as_str(), f.kind), ("3", SettingKind::Number));
    }

    #[test]
    fn settings_save_whole_or_nothing_and_deploy_copies_the_record() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        seed(root);
        let bad = BTreeMap::from([
            ("note".to_string(), "hi".to_string()),
            ("region".to_string(), "mars".to_string()),
        ]);
        assert!(settings_save(root, "kit", &bad).is_err());
        assert_eq!(
            settings(root, "kit").unwrap()[0].value,
            "",
            "nothing was written"
        );
        let good = BTreeMap::from([("region".to_string(), "us".to_string())]);
        let rows = settings_save(root, "kit", &good).unwrap();
        assert_eq!(rows.iter().find(|r| r.key == "region").unwrap().value, "us");
        assert!(settings_save(root, "kit", &BTreeMap::from([("x".into(), "1".into())])).is_err());

        let child = tempfile::tempdir().unwrap();
        let report = deploy_to(root, child.path(), "kit").unwrap();
        assert_eq!(report.written, vec!["docs/kit.md".to_string()]);
        assert_eq!(held(child.path()), vec!["plugin:kit".to_string()]);
        assert_eq!(settings(child.path(), "kit").unwrap(), rows);
        // A second deploy keeps the file that exists.
        let again = deploy_to(root, child.path(), "kit").unwrap();
        assert_eq!(again.kept, vec!["docs/kit.md".to_string()]);
    }
}
