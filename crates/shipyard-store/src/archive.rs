//! Archive a change: settle its capability specs, then move the change folder (spec `specs`,
//! REQ-020, REQ-023). The copy comes first and the rename last, so a failure keeps the old files.
//! The folder listing follows the Legacy OpenSpec reader: sorted names, empty on error.

use std::fs;
use std::path::{Path, PathBuf};

use shipyard_core::specs::valid_change_id;

use crate::safe_write;

/// The sorted names of the folders in `p`. Empty on error.
pub fn dir_names(p: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(p)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

fn valid_date(d: &str) -> bool {
    let b = d.as_bytes();
    b.len() == 10
        && b.iter().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                *c == b'-'
            } else {
                c.is_ascii_digit()
            }
        })
}

/// Moves the capability specs into `specs/<cap>/` and the change into
/// `changes/archive/<date>-<id>`. Open items need `confirmed`. Returns the capabilities moved.
pub fn archive(
    openspec_dir: &Path,
    change_id: &str,
    date: &str,
    open_items: &[String],
    confirmed: bool,
) -> Result<Vec<String>, String> {
    if !valid_change_id(change_id) || change_id == "archive" {
        return Err(format!("invalid change id: {change_id}"));
    }
    if !valid_date(date) {
        return Err(format!("invalid date: {date}"));
    }
    let change = openspec_dir.join("changes").join(change_id);
    if !change.is_dir() {
        return Err(format!("no change {change_id}"));
    }
    if !open_items.is_empty() && !confirmed {
        return Err(format!("open items: {}", open_items.join("; ")));
    }
    let dest = openspec_dir
        .join("changes/archive")
        .join(format!("{date}-{change_id}"));
    if dest.exists() {
        return Err(format!("{} exists", dest.display()));
    }
    let caps = dir_names(&change.join("specs"));
    let mut files: Vec<(PathBuf, String)> = Vec::new();
    for cap in &caps {
        let entries = fs::read_dir(change.join("specs").join(cap)).map_err(|e| e.to_string())?;
        for e in entries.flatten().filter(|e| e.path().is_file()) {
            let text = fs::read_to_string(e.path()).map_err(|e| e.to_string())?;
            files.push((
                openspec_dir.join("specs").join(cap).join(e.file_name()),
                text,
            ));
        }
    }
    for (target, text) in &files {
        if let Some(dir) = target.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        safe_write::write(target, text, None).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(openspec_dir.join("changes/archive")).map_err(|e| e.to_string())?;
    fs::rename(&change, &dest).map_err(|e| e.to_string())?;
    Ok(caps)
}
