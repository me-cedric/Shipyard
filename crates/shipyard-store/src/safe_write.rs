//! Writes a repository file in full or not at all, and warns when the file changed on disk after
//! the person opened it (spec `design` REQ-023, spec `specs` REQ-023).

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::Result;

/// The outcome of a write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Saved {
    /// The file holds the text. Holds the new stamp.
    Done(String),
    /// The file changed on disk after it was opened. Nothing was written.
    Conflict,
}

/// The modified time and the size of a file, or `None` when it does not exist.
pub fn stamp(path: &Path) -> Result<Option<String>> {
    match fs::metadata(path) {
        Ok(m) => {
            let nanos = m
                .modified()?
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| d.as_nanos());
            Ok(Some(format!("{nanos}-{}", m.len())))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn temp_path(path: &Path) -> Result<PathBuf> {
    let name = path.file_name().ok_or("the path has no file name")?;
    let mut tmp = name.to_os_string();
    tmp.push(format!(".{}.tmp", std::process::id()));
    Ok(path.with_file_name(tmp))
}

/// Write the text to a temp file next to the target, then rename it over the target.
fn replace(path: &Path, text: &str) -> Result<String> {
    let tmp = temp_path(path)?;
    let res = (|| -> Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
        fs::rename(&tmp, path)?;
        Ok(())
    })();
    if res.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    res?;
    stamp(path)?.ok_or_else(|| "the file is gone after the write".into())
}

/// Replace a file. With `expected`, the write happens only when the stamp on disk is the same.
/// With `None`, the write replaces the file in all cases (the person keeps their version).
pub fn write(path: &Path, text: &str, expected: Option<&str>) -> Result<Saved> {
    if let Some(want) = expected
        && stamp(path)?.as_deref() != Some(want)
    {
        return Ok(Saved::Conflict);
    }
    Ok(Saved::Done(replace(path, text)?))
}

/// Make a new file and its folders. Refuses a path that exists.
pub fn create(path: &Path, text: &str) -> Result<String> {
    if path.exists() {
        return Err(format!("{} exists", path.display()).into());
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    replace(path, text)
}
