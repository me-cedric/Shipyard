//! Design / Screens: the tokens of the open project. They come from its design doc (the CSS in the
//! fenced blocks) and from the token files that the project holds: `tokens.css`, `*.tokens.json`,
//! `tokens.json` and a CSS file with a Tailwind `@theme` block. The view never shows the tokens of
//! Shipyard itself.
//!
//! shortcut: a `tailwind.config.js` theme is not read (it is code), only the CSS `@theme` of Tailwind 4.

use std::path::Path;

use serde::Serialize;
use serde_json::Value;
use specta::Type;

use crate::commands::{Api, AppState, Res, blocking};

const MAX_FILES: usize = 20;
const MAX_TOKENS: usize = 500;
const MAX_BYTES: u64 = 512 * 1024;
const MAX_DEPTH: usize = 4;
const SKIP: [&str; 8] = [
    "node_modules",
    "target",
    "dist",
    "build",
    ".git",
    ".next",
    "vendor",
    ".shipyard",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Token {
    pub name: String,
    pub value: String,
}

/// The tokens of one file of the project.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TokenFile {
    pub path: String,
    pub tokens: Vec<Token>,
}

/// The custom properties (`--name: value;`) of a CSS text.
pub fn css_tokens(text: &str) -> Vec<Token> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find("--") {
        let after = &rest[i + 2..];
        let name_len = after
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'))
            .unwrap_or(after.len());
        let (name, tail) = after.split_at(name_len);
        let standalone = rest[..i]
            .chars()
            .next_back()
            .is_none_or(|c| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        let tail_trim = tail.trim_start();
        if standalone
            && name.starts_with(|c: char| c.is_ascii_alphabetic())
            && let Some(value) = tail_trim.strip_prefix(':')
        {
            let end = value.find([';', '}']).unwrap_or(value.len());
            let v = value[..end].trim();
            if !v.is_empty() {
                out.push(Token {
                    name: format!("--{name}"),
                    value: v.to_string(),
                });
            }
            rest = &value[end..];
        } else {
            rest = after;
        }
    }
    out
}

/// The tokens of a JSON file in the design-token shape: a leaf holds `$value` or `value`.
pub fn json_tokens(text: &str) -> Vec<Token> {
    fn walk(path: &str, v: &Value, out: &mut Vec<Token>) {
        let Some(map) = v.as_object() else { return };
        if let Some(leaf) = map.get("$value").or_else(|| map.get("value")) {
            let value = leaf.as_str().map_or_else(|| leaf.to_string(), String::from);
            out.push(Token {
                name: path.to_string(),
                value,
            });
            return;
        }
        for (k, child) in map.iter().filter(|(k, _)| !k.starts_with('$')) {
            let name = if path.is_empty() {
                k.clone()
            } else {
                format!("{path}.{k}")
            };
            walk(&name, child, out);
        }
    }
    let mut out = Vec::new();
    if let Ok(v) = serde_json::from_str::<Value>(text) {
        walk("", &v, &mut out);
    }
    out
}

/// The text inside the fenced blocks of a Markdown text.
fn fenced(text: &str) -> String {
    let mut inside = false;
    let mut out = String::new();
    for line in text.lines() {
        if line.trim_start().starts_with("```") {
            inside = !inside;
        } else if inside {
            out.push_str(line);
            out.push('\n');
        }
    }
    out
}

fn is_token_file(name: &str, text: impl FnOnce() -> String) -> bool {
    name == "tokens.css"
        || name == "tokens.json"
        || name.ends_with(".tokens.json")
        || (name.ends_with(".css") && text().contains("@theme"))
}

fn scan(root: &Path, dir: &Path, depth: usize, out: &mut Vec<TokenFile>) {
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = read.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        if out.len() >= MAX_FILES {
            return;
        }
        let name = e.file_name().to_string_lossy().into_owned();
        let Ok(kind) = e.file_type() else { continue };
        let path = e.path();
        // `file_type` does not follow a link: a link is neither a file nor a folder here.
        if kind.is_dir() {
            if depth < MAX_DEPTH && !SKIP.contains(&name.as_str()) && !name.starts_with('.') {
                scan(root, &path, depth + 1, out);
            }
        } else if kind.is_file()
            // The name comes first: no other file is read.
            && (name.ends_with(".css") || name.ends_with(".json"))
            && e.metadata().is_ok_and(|m| m.len() <= MAX_BYTES)
            && let Ok(text) = std::fs::read_to_string(&path)
            && is_token_file(&name, || text.clone())
        {
            let mut tokens = if name.ends_with(".json") {
                json_tokens(&text)
            } else {
                css_tokens(&text)
            };
            tokens.truncate(MAX_TOKENS);
            if !tokens.is_empty() {
                let rel = path.strip_prefix(root).unwrap_or(&path);
                out.push(TokenFile {
                    path: rel.to_string_lossy().replace('\\', "/"),
                    tokens,
                });
            }
        }
    }
}

/// The tokens of the project: the design doc first, then the token files. Empty when it has none.
pub fn list(root: &Path, doc: &str) -> Vec<TokenFile> {
    let mut out = Vec::new();
    if let Ok(text) = std::fs::read_to_string(root.join(doc)) {
        let tokens = css_tokens(&fenced(&text));
        if !tokens.is_empty() {
            out.push(TokenFile {
                path: doc.to_string(),
                tokens,
            });
        }
    }
    scan(root, root, 0, &mut out);
    out
}

pub fn project_tokens(s: &AppState) -> Res<Vec<TokenFile>> {
    let p = crate::design::project(s)?;
    Ok(list(
        &p.root,
        &shipyard_store::design::design_doc_path(&p.file),
    ))
}

#[tauri::command]
#[specta::specta]
pub async fn design_tokens(app: tauri::AppHandle) -> Api<Vec<TokenFile>> {
    blocking(app, project_tokens).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    #[test]
    fn css_custom_properties_are_read_and_other_text_is_not() {
        let got =
            css_tokens(":root{--brand: #123456; --gap:4px}\n.a { color: var(--brand); }\nx--y: 1;");
        let names: Vec<_> = got
            .iter()
            .map(|t| (t.name.as_str(), t.value.as_str()))
            .collect();
        assert_eq!(names, [("--brand", "#123456"), ("--gap", "4px")]);
    }

    #[test]
    fn json_tokens_use_the_leaf_value_and_a_dotted_name() {
        let got = json_tokens(
            r##"{"color":{"primary":{"$value":"#fff","$type":"color"}},"size":{"m":{"value":8}}}"##,
        );
        let names: Vec<_> = got
            .iter()
            .map(|t| (t.name.as_str(), t.value.as_str()))
            .collect();
        assert_eq!(names, [("color.primary", "#fff"), ("size.m", "8")]);
        assert!(json_tokens("nope").is_empty());
    }

    #[test]
    fn the_project_gives_its_doc_and_files_and_never_a_skipped_folder() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        assert!(list(r, "docs/designs/design.md").is_empty());
        write(
            r,
            "docs/designs/design.md",
            "--not-a-token: 1;\n```css\n:root { --doc: red; }\n```\n",
        );
        write(r, "src/tokens.css", ":root { --a: 1px; }");
        write(r, "src/app.css", "@theme { --color-x: blue; }");
        write(r, "src/plain.css", ":root { --b: 2px; }");
        write(r, "brand.tokens.json", r##"{"c":{"$value":"#000"}}"##);
        write(r, "node_modules/x/tokens.css", ":root { --n: 1; }");
        let got = list(r, "docs/designs/design.md");
        let paths: Vec<_> = got.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            paths,
            [
                "docs/designs/design.md",
                "brand.tokens.json",
                "src/app.css",
                "src/tokens.css"
            ]
        );
        assert_eq!(
            got[0].tokens,
            [Token {
                name: "--doc".into(),
                value: "red".into()
            }]
        );
    }
}
