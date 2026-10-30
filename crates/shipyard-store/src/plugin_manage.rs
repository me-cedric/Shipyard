//! The plugins that a project holds (spec `extensions`): list, enable, disable and remove.
//! Copied in intent from Legacy `list_plugins` and `delete_plugin` (`commands/plugins.rs`). The
//! record of `plugins.rs` says what each plugin wrote, with the SHA-256 of each file. The
//! disabled names live in `.shipyard/plugins-off.json`. A removal deletes only the files that
//! still have the recorded hash: a file that a person changed stays.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::Serialize;
use specta::Type;

use crate::Result;
use crate::plugins::{Applied, RECORD, sha};
use crate::project::write_atomic;

const OFF: &str = ".shipyard/plugins-off.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename = "PluginInstalled")]
pub struct Installed {
    pub name: String,
    pub version: String,
    pub files: Vec<String>,
    pub settings: Vec<String>,
    /// The names of the MCP servers that the plugin added.
    pub mcp: Vec<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename = "PluginRemoved")]
pub struct Removed {
    pub removed: Vec<String>,
    pub kept: Vec<String>,
    pub mcp: Vec<String>,
}

fn records(root: &Path) -> BTreeMap<String, Applied> {
    fs::read_to_string(root.join(RECORD))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn off(root: &Path) -> Vec<String> {
    fs::read_to_string(root.join(OFF))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_off(root: &Path, list: &[String]) -> Result<()> {
    write_atomic(
        &root.join(OFF),
        serde_json::to_string_pretty(list)?.as_bytes(),
    )
}

pub fn list(root: &Path) -> Vec<Installed> {
    let off = off(root);
    records(root)
        .into_iter()
        .map(|(name, a)| Installed {
            enabled: !off.contains(&name),
            version: a.version,
            files: a.files.into_keys().collect(),
            settings: a.settings.into_keys().collect(),
            mcp: a.mcp,
            name,
        })
        .collect()
}

/// Returns the MCP server names of the plugin, so the caller can start or stop them.
pub fn set_enabled(root: &Path, name: &str, on: bool) -> Result<Vec<String>> {
    let rec = records(root)
        .remove(name)
        .ok_or_else(|| format!("unknown plugin: {name}"))?;
    let mut list = off(root);
    list.retain(|n| n != name);
    if !on {
        list.push(name.into());
    }
    save_off(root, &list)?;
    Ok(rec.mcp)
}

pub fn remove(root: &Path, name: &str) -> Result<Removed> {
    let mut all = records(root);
    let rec = all
        .remove(name)
        .ok_or_else(|| format!("unknown plugin: {name}"))?;
    let mut out = Removed {
        mcp: rec.mcp,
        ..Default::default()
    };
    for (rel, hash) in rec.files {
        if !shipyard_core::extensions::safe_rel(&rel) {
            continue;
        }
        let path = root.join(&rel);
        // A linked folder can lead out of the project: its files are never ours to delete.
        let inside = path
            .parent()
            .and_then(|p| p.canonicalize().ok())
            .zip(root.canonicalize().ok())
            .is_some_and(|(p, r)| p.starts_with(r));
        match path.symlink_metadata() {
            Ok(m) if inside && m.is_file() && fs::read(&path).is_ok_and(|b| sha(&b) == hash) => {
                fs::remove_file(&path)?;
                out.removed.push(rel);
            }
            Ok(_) => out.kept.push(rel),
            Err(_) => {}
        }
    }
    write_atomic(
        &root.join(RECORD),
        serde_json::to_string_pretty(&all)?.as_bytes(),
    )?;
    let mut list = off(root);
    list.retain(|n| n != name);
    save_off(root, &list)?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed(root: &Path) {
        let mut rec = Applied {
            version: "1.0.0".into(),
            mcp: vec!["docs".into()],
            ..Default::default()
        };
        rec.files.insert("a.txt".into(), sha(b"one"));
        rec.files.insert("b.txt".into(), sha(b"two"));
        let all = BTreeMap::from([("tools".to_string(), rec)]);
        write_atomic(
            &root.join(RECORD),
            serde_json::to_string(&all).unwrap().as_bytes(),
        )
        .unwrap();
        fs::write(root.join("a.txt"), "one").unwrap();
        fs::write(root.join("b.txt"), "edited").unwrap();
    }

    #[test]
    fn a_plugin_lists_toggles_and_is_removed_without_losing_an_edit() {
        let dir = tempfile::tempdir().unwrap();
        seed(dir.path());
        assert!(list(dir.path())[0].enabled);
        assert_eq!(set_enabled(dir.path(), "tools", false).unwrap(), ["docs"]);
        assert!(!list(dir.path())[0].enabled);
        assert!(set_enabled(dir.path(), "nope", true).is_err());
        let out = remove(dir.path(), "tools").unwrap();
        assert_eq!(
            (out.removed, out.kept),
            (vec!["a.txt".into()], vec!["b.txt".into()])
        );
        assert!(list(dir.path()).is_empty());
        assert!(dir.path().join("b.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_file_behind_a_linked_folder_is_kept() {
        let (dir, out) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        fs::write(out.path().join("x.txt"), "one").unwrap();
        std::os::unix::fs::symlink(out.path(), dir.path().join("linked")).unwrap();
        let mut rec = Applied::default();
        rec.files.insert("linked/x.txt".into(), sha(b"one"));
        let all = BTreeMap::from([("tools".to_string(), rec)]);
        write_atomic(
            &dir.path().join(RECORD),
            serde_json::to_string(&all).unwrap().as_bytes(),
        )
        .unwrap();
        let done = remove(dir.path(), "tools").unwrap();
        assert_eq!(
            (done.removed.len(), done.kept),
            (0, vec!["linked/x.txt".to_string()])
        );
        assert!(out.path().join("x.txt").exists());
    }
}
