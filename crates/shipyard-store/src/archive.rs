//! Archive a change: settle its capability specs, then move the change folder (spec `specs`,
//! REQ-020, REQ-023). The copy comes first and the rename last, so a failure keeps the old files.
//! The folder listing follows the OpenSpec reader: sorted names, empty on error.

use std::fs;
use std::path::Path;

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

/// The text of a spec that strict OpenSpec accepts once the spec is settled: `## Requirements` in
/// place of `## ADDED Requirements`, the list of the Purpose as `### Requirement list` (a second
/// `Requirements` heading is a clash), and the status line `Settled`. Other lines stay as they are.
pub fn settle(spec: &str) -> String {
    let mut seen_status = false;
    spec.split_inclusive('\n')
        .map(|l| {
            let body = l.trim_end_matches(['\r', '\n']);
            let tail = &l[body.len()..];
            match body.trim_end() {
                "## ADDED Requirements" => format!("## Requirements{tail}"),
                "### Requirements" => format!("### Requirement list{tail}"),
                _ if !seen_status && body.starts_with("Status:") => {
                    seen_status = true;
                    format!("Status: Settled{tail}")
                }
                _ => l.to_string(),
            }
        })
        .collect()
}

fn stage(change: &Path, tmp: &Path, caps: &[String]) -> Result<(), String> {
    for cap in caps {
        let to = tmp.join(cap);
        fs::create_dir_all(&to).map_err(|e| e.to_string())?;
        let entries = fs::read_dir(change.join("specs").join(cap)).map_err(|e| e.to_string())?;
        for e in entries.flatten().filter(|e| e.path().is_file()) {
            let mut text = fs::read_to_string(e.path()).map_err(|e| e.to_string())?;
            if e.file_name() == "spec.md" {
                text = settle(&text);
            }
            safe_write::write(&to.join(e.file_name()), &text, None).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Moves the capability specs into `specs/<cap>/` (each `spec.md` passes through [`settle`]) and the change into
/// `changes/archive/<date>-<id>`. A capability that is already settled is refused. Open items need
/// `confirmed`. Returns the capabilities moved.
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
    if let Some(c) = caps
        .iter()
        .find(|c| openspec_dir.join("specs").join(c).exists())
    {
        return Err(format!("the capability {c} is already settled in specs/"));
    }
    // Copy into a temp folder next to `specs/`, then rename each folder into place.
    let tmp = openspec_dir.join(format!(".archive-{change_id}"));
    let _ = fs::remove_dir_all(&tmp);
    let staged = stage(&change, &tmp, &caps);
    if let Err(e) = staged {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }
    fs::create_dir_all(openspec_dir.join("specs")).map_err(|e| e.to_string())?;
    for cap in &caps {
        fs::rename(tmp.join(cap), openspec_dir.join("specs").join(cap))
            .map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(openspec_dir.join("changes/archive")).map_err(|e| e.to_string())?;
    fs::rename(&change, &dest).map_err(|e| e.to_string())?;
    Ok(caps)
}
