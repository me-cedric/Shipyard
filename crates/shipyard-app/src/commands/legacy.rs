//! Legacy import. A stub until W9 (spec `projects`, REQ-014, REQ-015, Q-003).

use serde::Serialize;
use specta::Type;

#[derive(Debug, Serialize, Type)]
pub struct ImportItem {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Type)]
pub struct ImportReport {
    pub copied: Vec<String>,
    pub skipped: Vec<ImportItem>,
    pub conflicts: Vec<String>,
}

pub fn report(source: &str) -> ImportReport {
    ImportReport {
        copied: Vec::new(),
        skipped: vec![ImportItem {
            path: source.into(),
            reason: "not-implemented".into(),
        }],
        conflicts: Vec::new(),
    }
}

/// Reads nothing and writes nothing. W9 adds the codecs.
#[tauri::command]
#[specta::specta]
pub async fn project_import(source: String) -> ImportReport {
    report(&source)
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_stub_skips_the_source_and_changes_nothing() {
        let r = super::report("/legacy");
        assert!(r.copied.is_empty() && r.conflicts.is_empty());
        assert_eq!(r.skipped[0].reason, "not-implemented");
    }
}
