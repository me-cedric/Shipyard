//! Apply and upgrade compass entries through `ac sync` (spec `extensions`, REQ-003, REQ-005,
//! REQ-006). The tool is the pinned tree's own `bin/ac.mjs`, run with Node: the system `ac` is
//! another tool on some machines. The call never passes `--to`, so the pinned version moves only
//! when a person moves it with git (Q-050 option 1). `ac` keeps each file that a person edited.

use std::path::Path;
use std::process::Command;

use serde::Serialize;
use serde_json::Value;
use shipyard_core::extensions::{Entry, Kind, SyncState, WriteReport};
use shipyard_store::compass::{Compass, read};
use specta::Type;

use crate::commands::Res;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename = "CompassApplied")]
pub struct Applied {
    pub report: WriteReport,
    /// The pinned version after the call. It is the version before.
    pub version: String,
}

fn compass(root: &Path) -> Res<Compass> {
    read(root)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no compass is pinned".into())
}

/// One `ac` call on `target` with the tool of the tree in `parent`. Returns the JSON result.
fn ac(parent: &Path, tree: &str, target: &Path, args: &[&str]) -> Res<Value> {
    let out = Command::new("node")
        .arg(parent.join(tree).join("bin/ac.mjs"))
        .args(args)
        .arg("--json")
        .arg("--root")
        .arg(target)
        .current_dir(target)
        .output()
        .map_err(|e| format!("node did not run: {e}"))?;
    let json: Value = serde_json::from_slice(&out.stdout).map_err(|_| {
        let err = String::from_utf8_lossy(&out.stderr);
        err.lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("ac gave no result")
            .to_string()
    })?;
    if json["ok"].as_bool() == Some(true) && out.status.success() {
        return Ok(json);
    }
    let errors: Vec<&str> = json["errors"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    Err(if errors.is_empty() {
        "ac failed".into()
    } else {
        errors.join("; ")
    })
}

/// `ac assets on` takes `kind:id` for a skill or a pack. The other kinds sync as one.
fn asset(e: &Entry) -> Option<String> {
    matches!(e.kind, Kind::Skill | Kind::Pack).then(|| e.key())
}

/// Apply the chosen entries of `parent` to `target` (the same folder, or a child clone).
pub fn apply_in(parent: &Path, target: &Path, keys: &[String]) -> Res<Applied> {
    let c = compass(parent)?;
    let mut assets = Vec::new();
    for k in keys {
        let e = c
            .entries
            .iter()
            .find(|e| e.key() == *k)
            .ok_or_else(|| format!("unknown entry: {k}"))?;
        assets.extend(asset(e));
    }
    for a in &assets {
        ac(parent, &c.tree, target, &["assets", "on", a])?;
    }
    let done = ac(parent, &c.tree, target, &["sync"])?;
    let mut report = WriteReport::default();
    for ch in done["changes"].as_array().into_iter().flatten() {
        let (Some(action), Some(path)) = (ch["action"].as_str(), ch["path"].as_str()) else {
            continue;
        };
        match action {
            "create" | "update" => report.written.push(path.into()),
            "kept" => report.kept.push(path.into()),
            _ => {}
        }
    }
    let version = compass(parent)?.version;
    if version != c.version {
        return Err("the pinned compass version changed".into());
    }
    Ok(Applied { report, version })
}

pub fn apply(root: &Path, keys: &[String]) -> Res<Applied> {
    apply_in(root, root, keys)
}

/// Bring the stale entries up to date, or the selected entries that are not current. `ac sync`
/// writes the whole project, so a selection chooses which absent entries switch on (Q-074).
pub fn upgrade(root: &Path, selection: Option<&[String]>) -> Res<Applied> {
    let c = compass(root)?;
    let keys: Vec<String> = match selection {
        Some(sel) => sel.to_vec(),
        None => c
            .entries
            .iter()
            .filter(|e| e.state == SyncState::Stale)
            .map(Entry::key)
            .collect(),
    };
    if keys.is_empty() {
        return Ok(Applied {
            report: WriteReport::default(),
            version: c.version,
        });
    }
    if let Some(k) = keys.iter().find(|k| {
        c.entries
            .iter()
            .any(|e| e.key() == **k && e.state == SyncState::Current)
    }) {
        return Err(format!("already current: {k}"));
    }
    apply(root, &keys)
}
