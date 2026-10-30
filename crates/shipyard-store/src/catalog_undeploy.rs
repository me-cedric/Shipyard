//! Undeploy a catalog component (spec `extensions`). Remove what the deploy wrote, then forget the
//! record. The improvement: a file that a person edited after the deploy stays, and the report
//! names it. The record keeps no file list, so the files come from the catalog and are compared.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::Serialize;
use specta::Type;

use crate::Result;
use crate::catalog::{RECORD, files_of};
use crate::project::write_atomic;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename = "CatalogUndeployed")]
pub struct Undeployed {
    pub removed: Vec<String>,
    /// Files that differ from the catalog: a person changed them, so they stay.
    pub kept: Vec<String>,
}

/// Remove the unchanged files of a deployed component and its record.
pub fn undeploy(root: &Path, id: &str) -> Result<Undeployed> {
    let mut held: BTreeMap<String, String> = fs::read_to_string(root.join(RECORD))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    if !held.contains_key(id) {
        return Err(format!("{id} is not deployed").into());
    }
    let mut out = Undeployed::default();
    for (rel, bytes) in files_of(root, id)? {
        let path = root.join(&rel);
        // A link is not followed: only a plain file with the same bytes goes.
        match path.symlink_metadata() {
            Ok(m) if m.is_file() && fs::read(&path).is_ok_and(|b| b == bytes) => {
                fs::remove_file(&path)?;
                out.removed.push(rel);
            }
            Ok(_) => out.kept.push(rel),
            Err(_) => {}
        }
    }
    held.remove(id);
    write_atomic(
        &root.join(RECORD),
        serde_json::to_string_pretty(&held)?.as_bytes(),
    )?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{GUIDANCE, deploy};

    #[test]
    fn undeploy_removes_unchanged_files_keeps_edited_ones_and_forgets_the_record() {
        let dir = tempfile::tempdir().unwrap();
        deploy(dir.path(), GUIDANCE).unwrap();
        fs::write(dir.path().join("AGENTS.md"), "mine").unwrap();
        let out = undeploy(dir.path(), GUIDANCE).unwrap();
        assert_eq!(out.kept, ["AGENTS.md"]);
        assert_eq!(out.removed.len(), 2);
        assert!(dir.path().join("AGENTS.md").exists());
        assert!(!dir.path().join("docs/openspec/specs/.gitkeep").exists());
        assert!(undeploy(dir.path(), GUIDANCE).is_err(), "no record left");
    }
}
