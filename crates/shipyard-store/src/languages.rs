//! The language library in the app data folder and the language pack codec (spec `languages`,
//! REQ-005 to REQ-008; ADR 0021). A pack is personal: it never goes to a repository.

use std::path::Path;

use shipyard_core::language::{LanguagePack, faults};

use crate::Result;
use crate::project::write_atomic;

/// The library folder in the app data folder: one `<code>.json` for each pack.
pub const DIR: &str = "languages";
const MAX_FILE: u64 = 2 * 1024 * 1024;

/// Read a pack from its text. The error lists each fault, one per line: the JSON fault with its
/// line, else each field fault.
pub fn parse(text: &str) -> std::result::Result<LanguagePack, String> {
    let p: LanguagePack = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let f = faults(&p);
    if f.is_empty() {
        Ok(p)
    } else {
        Err(f.join("\n"))
    }
}

/// The text of a pack file. It ends with a new line.
pub fn text(p: &LanguagePack) -> Result<String> {
    Ok(serde_json::to_string_pretty(p)? + "\n")
}

/// Read a pack file. The size is bounded before the read.
pub fn read_file(path: &Path) -> Result<LanguagePack> {
    let meta = std::fs::metadata(path)?;
    if !meta.is_file() || meta.len() > MAX_FILE {
        return Err("the language file is not a file or is larger than 2 MB".into());
    }
    Ok(parse(&std::fs::read_to_string(path)?)?)
}

/// The file of a code. Lower case, so `pt-BR` and `pt-br` are one file on every file system.
fn file(dir: &Path, code: &str) -> std::path::PathBuf {
    dir.join(DIR).join(format!("{}.json", code.to_lowercase()))
}

fn checked(p: &LanguagePack) -> Result<()> {
    let f = faults(p);
    if f.is_empty() {
        Ok(())
    } else {
        Err(f.join("\n").into())
    }
}

/// Write a pack file at a path that the person chose.
pub fn export(path: &Path, p: &LanguagePack) -> Result<()> {
    checked(p)?;
    write_atomic(path, text(p)?.as_bytes())
}

/// The packs of the library, by name. A file that does not pass the check is skipped.
pub fn list(dir: &Path) -> Vec<LanguagePack> {
    let mut out: Vec<LanguagePack> = std::fs::read_dir(dir.join(DIR))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| read_file(&e.path()).ok())
        .collect();
    out.sort_by_key(|p| p.name.to_lowercase());
    out
}

/// Add a pack to the library. A pack with the same code is replaced.
pub fn save(dir: &Path, p: &LanguagePack) -> Result<()> {
    checked(p)?;
    write_atomic(&file(dir, &p.code), text(p)?.as_bytes())
}

/// Add a pack from a plugin. A different pack with the same code is kept (the no-overwrite rule):
/// the result is false and nothing is written.
pub fn save_new(dir: &Path, p: &LanguagePack) -> Result<bool> {
    let path = file(dir, &p.code);
    if path.exists() && read_file(&path).ok().as_ref() != Some(p) {
        return Ok(false);
    }
    save(dir, p)?;
    Ok(true)
}

/// Remove a pack from the library. A pack that is not there is not an error.
pub fn remove(dir: &Path, code: &str) -> Result<()> {
    if !shipyard_core::language::is_code(code) {
        return Err(format!("not a language code: {code}").into());
    }
    match std::fs::remove_file(file(dir, code)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"shipyardLanguage":1,"code":"pt","name":"Português","messages":{"common.close":"Fechar"}}"#;

    #[test]
    fn a_pack_reads_and_an_export_reads_again_the_same() {
        let p = parse(SAMPLE).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.json");
        export(&path, &p).unwrap();
        assert_eq!(read_file(&path).unwrap(), p);
    }

    #[test]
    fn a_json_fault_names_its_line_and_a_script_or_a_tree_fails() {
        let e = parse("{\n\t\"shipyardLanguage\": 1,\n\t\"code\": \"pt\"\n\t\"name\": \"P\"\n}")
            .unwrap_err();
        assert!(e.contains("line 4"), "{e}");
        let e =
            parse(r#"{"shipyardLanguage":1,"code":"pt","name":"P","messages":{},"script":"x"}"#)
                .unwrap_err();
        assert!(e.contains("unknown field `script`"), "{e}");
        // A message is text: a nested object or a number is not.
        assert!(
            parse(r#"{"shipyardLanguage":1,"code":"pt","name":"P","messages":{"a":{"b":"c"}}}"#)
                .is_err()
        );
    }

    #[test]
    fn the_library_adds_replaces_and_removes() {
        let dir = tempfile::tempdir().unwrap();
        let mut p = parse(SAMPLE).unwrap();
        save(dir.path(), &p).unwrap();
        p.name = "Português (Portugal)".into();
        save(dir.path(), &p).unwrap();
        assert_eq!(list(dir.path()), vec![p.clone()]);
        remove(dir.path(), &p.code).unwrap();
        remove(dir.path(), &p.code).unwrap();
        assert!(list(dir.path()).is_empty());
        assert!(remove(dir.path(), "../prefs").is_err());
        // Two spellings of one code are one file.
        p.code = "pt-BR".into();
        save(dir.path(), &p).unwrap();
        p.code = "pt-br".into();
        save(dir.path(), &p).unwrap();
        assert_eq!(list(dir.path()), vec![p.clone()]);
        remove(dir.path(), "pt-BR").unwrap();
        assert!(list(dir.path()).is_empty());
    }

    #[test]
    fn a_plugin_pack_keeps_a_different_pack_with_the_same_code() {
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
