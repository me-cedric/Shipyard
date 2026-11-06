//! The theme library in the app data folder and the theme file codec (spec `themes`, REQ-005 to
//! REQ-008; ADR 0018). A theme is personal: it never goes to a repository.

use std::path::Path;

use shipyard_core::theme::{ThemeFile, faults};

use crate::Result;
use crate::project::write_atomic;

/// The library folder in the app data folder: one `<id>.json` for each theme.
pub const DIR: &str = "themes";
const MAX_FILE: u64 = 64 * 1024;

/// Read a theme from its text. The error lists each fault, one per line: the JSON fault with its
/// line, else each field fault.
pub fn parse(text: &str) -> std::result::Result<ThemeFile, String> {
    let t: ThemeFile = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let f = faults(&t);
    if f.is_empty() {
        Ok(t)
    } else {
        Err(f.join("\n"))
    }
}

/// The text of a theme file. It ends with a new line.
pub fn text(t: &ThemeFile) -> Result<String> {
    Ok(serde_json::to_string_pretty(t)? + "\n")
}

/// Read a theme file. The size is bounded before the read.
pub fn read_file(path: &Path) -> Result<ThemeFile> {
    let meta = std::fs::metadata(path)?;
    if !meta.is_file() || meta.len() > MAX_FILE {
        return Err("the theme is not a file or is larger than 64 KB".into());
    }
    Ok(parse(&std::fs::read_to_string(path)?)?)
}

fn checked(t: &ThemeFile) -> Result<()> {
    let f = faults(t);
    if f.is_empty() {
        Ok(())
    } else {
        Err(f.join("\n").into())
    }
}

/// Write a theme file at a path that the person chose.
pub fn export(path: &Path, t: &ThemeFile) -> Result<()> {
    checked(t)?;
    write_atomic(path, text(t)?.as_bytes())
}

/// The themes of the library, by name. A file that does not pass the check is skipped.
pub fn list(dir: &Path) -> Vec<ThemeFile> {
    let mut out: Vec<ThemeFile> = std::fs::read_dir(dir.join(DIR))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| read_file(&e.path()).ok())
        .collect();
    out.sort_by_key(|t| t.name.to_lowercase());
    out
}

/// Add a theme to the library. A theme with the same id is replaced.
pub fn save(dir: &Path, t: &ThemeFile) -> Result<()> {
    checked(t)?;
    write_atomic(
        &dir.join(DIR).join(format!("{}.json", t.id)),
        text(t)?.as_bytes(),
    )
}

/// Add a theme from a plugin. A different theme with the same id is kept (the no-overwrite rule):
/// the result is false and nothing is written.
pub fn save_new(dir: &Path, t: &ThemeFile) -> Result<bool> {
    let path = dir.join(DIR).join(format!("{}.json", t.id));
    if path.exists() && read_file(&path).ok().as_ref() != Some(t) {
        return Ok(false);
    }
    save(dir, t)?;
    Ok(true)
}

/// Remove a theme from the library. A theme that is not there is not an error.
pub fn remove(dir: &Path, id: &str) -> Result<()> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("not a theme id: {id}").into());
    }
    match std::fs::remove_file(dir.join(DIR).join(format!("{id}.json"))) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_core::theme::TOKENS;

    const SAMPLE: &str = include_str!("../../../examples/theme-sample/harbor-night.json");

    #[test]
    fn the_token_list_of_the_view_is_the_list_of_the_check() {
        let view: Vec<String> =
            serde_json::from_str(include_str!("../../../src/lib/themes/tokens.json")).unwrap();
        assert_eq!(view, TOKENS);
    }

    #[test]
    fn the_sample_reads_and_an_export_reads_again_the_same() {
        let t = parse(SAMPLE).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.json");
        export(&path, &t).unwrap();
        assert_eq!(read_file(&path).unwrap(), t);
    }

    #[test]
    fn a_json_fault_names_its_line() {
        let e =
            parse("{\n\t\"shipyardTheme\": 1,\n\t\"id\": \"x\"\n\t\"name\": \"X\"\n}").unwrap_err();
        assert!(e.contains("line 4"), "{e}");
        let e = parse(r#"{"shipyardTheme":1,"id":"x","name":"X","base":"dark","script":"x"}"#)
            .unwrap_err();
        assert!(e.contains("unknown field `script`"), "{e}");
    }

    #[test]
    fn two_faults_give_two_lines_and_nothing_is_saved() {
        let e = parse(
            r##"{"shipyardTheme":1,"id":"x","name":"X","base":"dark","radius":40,"tokens":{"n-99":"#000"}}"##,
        )
        .unwrap_err();
        assert_eq!(e.lines().count(), 2, "{e}");
        let dir = tempfile::tempdir().unwrap();
        let mut t = parse(SAMPLE).unwrap();
        t.accent = Some("url(https://x.test/a.png)".into());
        assert!(save(dir.path(), &t).is_err());
        assert!(list(dir.path()).is_empty());
    }

    #[test]
    fn the_library_adds_replaces_and_removes() {
        let dir = tempfile::tempdir().unwrap();
        let mut t = parse(SAMPLE).unwrap();
        save(dir.path(), &t).unwrap();
        t.name = "Harbor".into();
        save(dir.path(), &t).unwrap();
        assert_eq!(list(dir.path()), vec![t.clone()]);
        remove(dir.path(), &t.id).unwrap();
        remove(dir.path(), &t.id).unwrap();
        assert!(list(dir.path()).is_empty());
        assert!(remove(dir.path(), "../prefs").is_err());
    }

    #[test]
    fn a_plugin_theme_keeps_a_different_theme_with_the_same_id() {
        let dir = tempfile::tempdir().unwrap();
        let mine = parse(SAMPLE).unwrap();
        save(dir.path(), &mine).unwrap();
        assert!(save_new(dir.path(), &mine).unwrap());
        let mut other = mine.clone();
        other.name = "Other".into();
        assert!(!save_new(dir.path(), &other).unwrap());
        assert_eq!(list(dir.path()), vec![mine]);
    }
}
