//! The language pack (spec `languages`, REQ-004, REQ-005; ADR 0021). A pack is data: a flat map
//! of message keys to plain text. No I/O: the store reads and writes the files. The view checks
//! each key against the English base, which only the view knows.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

/// The format version that this build reads and writes.
pub const FORMAT: u32 = 1;
/// The languages that ship with the app. A pack cannot replace one of them.
pub const BUILT_IN: [&str; 4] = ["en", "fr", "de", "es"];
/// The most messages in a pack.
pub const MAX_MESSAGES: usize = 20_000;
const MAX_KEY: usize = 200;
const MAX_TEXT: usize = 2_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LanguagePack {
    /// The format version: [`FORMAT`].
    pub shipyard_language: u32,
    /// A language tag such as `pt` or `pt-BR`. The file name in the library.
    pub code: String,
    /// The name of the language in that language, such as `Português`.
    pub name: String,
    /// A message key such as `common.close` to its text. A key that is not here shows in English.
    pub messages: BTreeMap<String, String>,
}

/// Names that Windows keeps for devices: a file `con.json` cannot exist there.
const RESERVED: [&str; 4] = ["con", "aux", "nul", "prn"];

/// A language tag: 2 or 3 lower case letters, then parts of 2 to 8 letters or digits after `-`.
pub fn is_code(code: &str) -> bool {
    let mut parts = code.split('-');
    let lang = parts.next().unwrap_or_default();
    code.len() <= 20
        && !RESERVED.contains(&lang)
        && (2..=3).contains(&lang.len())
        && lang.chars().all(|c| c.is_ascii_lowercase())
        && parts.all(|p| (2..=8).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphanumeric()))
}

fn is_key(k: &str) -> bool {
    (1..=MAX_KEY).contains(&k.len())
        && k.chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}

/// Every fault of a pack, as `<field>: <reason>`. Empty when the pack is valid.
pub fn faults(p: &LanguagePack) -> Vec<String> {
    let mut out = Vec::new();
    if p.shipyard_language != FORMAT {
        out.push(format!(
            "shipyardLanguage: version {} is not known, use {FORMAT}",
            p.shipyard_language
        ));
    }
    if !is_code(&p.code) {
        out.push("code: use a language tag such as pt or pt-BR".into());
    } else if BUILT_IN.contains(&p.code.as_str()) {
        out.push(format!("code: {} ships with the app", p.code));
    }
    let name = p.name.trim();
    if name.is_empty() || name.chars().count() > 60 || name.chars().any(char::is_control) {
        out.push("name: use 1 to 60 characters".into());
    }
    if p.messages.len() > MAX_MESSAGES {
        out.push(format!("messages: use {MAX_MESSAGES} messages or fewer"));
    }
    for (k, v) in &p.messages {
        if !is_key(k) {
            out.push(format!("messages.{k}: not a message key"));
        } else if v.trim().is_empty() || v.chars().count() > MAX_TEXT {
            out.push(format!("messages.{k}: use 1 to {MAX_TEXT} characters"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pack() -> LanguagePack {
        LanguagePack {
            shipyard_language: 1,
            code: "pt-BR".into(),
            name: "Português (Brasil)".into(),
            messages: BTreeMap::from([("common.close".into(), "Fechar".into())]),
        }
    }

    #[test]
    fn a_valid_pack_has_no_fault() {
        assert_eq!(faults(&pack()), Vec::<String>::new());
    }

    #[test]
    fn codes_are_language_tags() {
        for ok in ["pt", "pt-BR", "zh-Hans", "es-419", "ast"] {
            assert!(is_code(ok), "{ok}");
        }
        for bad in [
            "", "p", "PT", "pt_BR", "../x", "pt-", "pt-B", "abcd", "con", "nul-x",
        ] {
            assert!(!is_code(bad), "{bad}");
        }
    }

    #[test]
    fn each_fault_names_its_field() {
        let mut p = pack();
        p.shipyard_language = 2;
        p.code = "fr".into();
        p.name = String::new();
        p.messages.insert("a b".into(), "x".into());
        p.messages.insert("common.open".into(), " ".into());
        let f = faults(&p);
        for field in [
            "shipyardLanguage:",
            "code:",
            "name:",
            "messages.a b:",
            "messages.common.open:",
        ] {
            assert!(f.iter().any(|x| x.starts_with(field)), "{field} in {f:?}");
        }
    }
}
