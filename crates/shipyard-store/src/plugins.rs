//! The plugin reader and the review model (spec `extensions`, REQ-011 to REQ-014). A plugin is a
//! `.zip` with `manifest.json` and a `files/` payload. It is read as data: no code runs and no
//! file is written before the person accepts items. The archive is bounded.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;

use ring::digest::{SHA256, digest};
use serde::{Deserialize, Serialize};
use shipyard_core::extensions::{WriteReport, safe_rel};
use shipyard_core::theme::ThemeFile;
use specta::Type;

use crate::Result;
use crate::catalog::write_new;
use crate::plugin_config::{SettingField, SettingSpec, check};
use crate::project::write_atomic;

pub const RECORD: &str = ".shipyard/plugins.json";
const MAX_ENTRIES: usize = 500;
const MAX_BYTES: u64 = 10 * 1024 * 1024;
const MAX_MANIFEST: u64 = 64 * 1024;
const SECRET_WORDS: [&str; 5] = ["token", "secret", "password", "apikey", "api_key"];
/// The agent folders that a skill or a rule goes to.
const AGENT_DIRS: [&str; 2] = [".claude", ".agents"];
/// The longest preview of a file in a review, in characters.
const PREVIEW: usize = 2000;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct FileEntry {
    source: String,
    target: String,
}

/// An MCP server of a plugin. Only a remote `url` is valid: `command`, `args` and `env` exist so
/// that a local command is named and refused (REQ-013).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
#[serde(rename = "PluginMcpServer")]
pub struct McpServer {
    pub url: Option<String>,
    /// Header values are `${VAR}` references. A plugin holds no secret.
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    /// The schema of the manifest, for an editor. It has no effect.
    #[serde(rename = "$schema", default)]
    _schema: Option<String>,
    name: String,
    version: String,
    #[serde(default)]
    files: Vec<FileEntry>,
    /// Names. `files/skills/<name>/` goes to `<agent>/skills/<name>/`.
    #[serde(default)]
    skills: Vec<String>,
    /// Names. `files/rules/<name>.md` goes to `<agent>/rules/<name>.md`.
    #[serde(default)]
    rules: Vec<String>,
    #[serde(default)]
    settings: BTreeMap<String, SettingSpec>,
    #[serde(default)]
    mcp_servers: BTreeMap<String, McpServer>,
    /// Theme ids. `files/themes/<id>.json` goes to the theme library, not to the project.
    #[serde(default)]
    themes: Vec<String>,
}

/// A plugin that was read. Nothing of it is on disk.
#[derive(Debug)]
pub struct Plugin {
    pub name: String,
    pub version: String,
    /// `(target, bytes)`.
    pub files: Vec<(String, Vec<u8>)>,
    /// The default value of each setting.
    pub settings: BTreeMap<String, String>,
    /// The type of each setting. A text default has a text field.
    pub fields: BTreeMap<String, SettingField>,
    pub mcp: BTreeMap<String, McpServer>,
    /// `(item id, reason)` of each server that was refused.
    pub refused: Vec<(String, String)>,
    pub themes: Vec<ThemeFile>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
#[serde(rename = "PluginItemKind")]
pub enum ItemKind {
    File,
    Setting,
    Mcp,
    Theme,
}

/// What an item does against the applied version of the plugin (REQ-014).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
#[serde(rename = "PluginChange")]
pub enum Change {
    New,
    Same,
    Changed,
    /// In the applied version, not in this one. Informational: it is never written.
    Removed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "PluginItem")]
pub struct Item {
    /// `file:<target>`, `setting:<key>`, `mcp:<name>`, `theme:<id>`.
    pub id: String,
    pub kind: ItemKind,
    pub label: String,
    /// A file that exists is kept at apply, and the report names it.
    pub exists: bool,
    pub change: Change,
    /// The start of a text file with its `{{config.<key>}}` values filled in.
    pub preview: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "PluginReview")]
pub struct Review {
    pub name: String,
    pub version: String,
    /// The version in the project, when the plugin is applied.
    pub applied: Option<String>,
    pub items: Vec<Item>,
    /// `<id>: <reason>`. A refused server is never an item.
    pub refused: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Applied {
    pub version: String,
    /// Target and the SHA-256 of the written content.
    pub files: BTreeMap<String, String>,
    pub settings: BTreeMap<String, String>,
    #[serde(default)]
    pub fields: BTreeMap<String, SettingField>,
    pub mcp: Vec<String>,
    #[serde(default)]
    pub themes: Vec<String>,
}

pub(crate) fn sha(b: &[u8]) -> String {
    digest(&SHA256, b)
        .as_ref()
        .iter()
        .map(|x| format!("{x:02x}"))
        .collect()
}

fn read_limited(f: impl Read, limit: u64) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    f.take(limit + 1).read_to_end(&mut out)?;
    if out.len() as u64 > limit {
        return Err("the archive is too large".into());
    }
    Ok(out)
}

pub(crate) fn is_secret(key: &str, value: &str) -> bool {
    let k = key.to_lowercase();
    SECRET_WORDS.iter().any(|w| k.contains(w)) && !value.is_empty() && !value.starts_with("${")
}

/// Read a `.zip` as data. It refuses a bad archive, a file path outside the project and a secret
/// value (REQ-011, REQ-013). A local MCP server is refused alone, with its reason.
pub fn read(bytes: &[u8]) -> Result<Plugin> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|e| format!("not a valid zip archive: {e}"))?;
    if zip.len() > MAX_ENTRIES {
        return Err(format!("the archive holds more than {MAX_ENTRIES} files").into());
    }
    let mut payload: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    let mut manifest = None;
    let mut total = 0u64;
    for i in 0..zip.len() {
        let f = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = f
            .name()
            .map_err(|e| e.to_string())?
            .trim_end_matches('/')
            .to_string();
        if !safe_rel(&name) {
            return Err(format!("path not allowed: {name}").into());
        }
        if f.is_dir() {
            continue;
        }
        if f.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
            return Err(format!("a link is not allowed: {name}").into());
        }
        // The declared size can lie: count the bytes that the inflate really made.
        let left = MAX_BYTES - total;
        if name == "manifest.json" {
            let b = read_limited(f, MAX_MANIFEST.min(left))?;
            total += b.len() as u64;
            manifest = Some(b);
        } else if name.starts_with("files/") {
            let b = read_limited(f, left)?;
            total += b.len() as u64;
            payload.insert(name, b);
        }
    }
    let manifest = manifest.ok_or("the archive has no manifest.json")?;
    if payload.is_empty() {
        return Err("the archive has no payload file under files/".into());
    }
    let text = String::from_utf8_lossy(&manifest);
    let m: Manifest = serde_json::from_slice(&manifest).map_err(|e| {
        let msg = e.to_string();
        // serde names an unknown field but reports the end of the object: find the field.
        match msg
            .strip_prefix("unknown field `")
            .and_then(|r| r.split('`').next())
        {
            Some(k) => bad(&text, k, &msg),
            None => format!("manifest.json:{}: {msg}", e.line()),
        }
    })?;
    if m.name.is_empty() || m.name.contains(['/', '\\']) || m.name.starts_with('.') {
        return Err(bad(&text, "name", format!("bad name {}", m.name)).into());
    }
    // A skill or a rule owns its payload files. No `files` list: the rest goes to the root.
    let listed = !m.files.is_empty();
    let mut entries = m.files;
    let mut owned = Vec::new();
    for (kind, names) in [("skills", &m.skills), ("rules", &m.rules)] {
        for n in names {
            let plain = !n.is_empty()
                && n.chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_".contains(c));
            let pre = format!("files/{kind}/{n}/");
            let one = format!("files/{kind}/{n}.md");
            let from: Vec<(&String, String)> = payload
                .keys()
                .filter_map(|k| {
                    let rest = if kind == "skills" {
                        k.strip_prefix(&pre)?
                    } else {
                        (*k == one).then_some("")?
                    };
                    Some((k, rest.to_string()))
                })
                .collect();
            if !plain || from.is_empty() {
                let why =
                    format!("{kind} {n}: a plain name and a file under files/{kind}/ are needed");
                return Err(bad(&text, n, why).into());
            }
            for (k, rest) in from {
                for a in AGENT_DIRS {
                    let target = if kind == "skills" {
                        format!("{a}/skills/{n}/{rest}")
                    } else {
                        format!("{a}/rules/{n}.md")
                    };
                    entries.push(FileEntry {
                        source: k.clone(),
                        target,
                    });
                }
                owned.push(k.clone());
            }
        }
    }
    // A theme is data for the library: it passes the check of a theme file (spec `themes`, REQ-009).
    let mut themes = Vec::new();
    for n in &m.themes {
        let src = format!("files/themes/{n}.json");
        let Some(b) = payload.get(&src) else {
            let why = format!("themes {n}: the archive does not hold {src}");
            return Err(bad(&text, n, why).into());
        };
        let t = crate::themes::parse(&String::from_utf8_lossy(b))
            .map_err(|e| format!("{src}: {}", e.replace('\n', "; ")))?;
        if t.id != *n {
            return Err(format!("{src}: id: use {n}, the name in the manifest").into());
        }
        owned.push(src);
        themes.push(t);
    }
    if !listed {
        entries.extend(
            payload
                .keys()
                .filter(|k| !owned.contains(k))
                .map(|k| FileEntry {
                    source: k.clone(),
                    target: k["files/".len()..].into(),
                }),
        );
    }
    let mut files = Vec::new();
    for e in entries {
        if !safe_rel(&e.target) {
            return Err(format!("path not allowed: {}", e.target).into());
        }
        let bytes = payload.get(&e.source).ok_or_else(|| {
            bad(
                &text,
                &e.source,
                format!("names {}, which the archive does not hold", e.source),
            )
        })?;
        // A manifest can name one source for many targets: each copy counts.
        total += bytes.len() as u64;
        if total > MAX_BYTES {
            return Err("the archive is too large".into());
        }
        files.push((e.target, bytes.clone()));
    }
    let (mut settings, mut fields) = (BTreeMap::new(), BTreeMap::new());
    for (k, spec) in m.settings {
        let (v, field) = spec.split();
        // A default must fit its field; an empty default of a required field waits for the person.
        if !v.is_empty() {
            check(&k, &field, &v).map_err(|e| bad(&text, &k, e))?;
        }
        settings.insert(k.clone(), v);
        fields.insert(k, field);
    }
    // Each `{{config.<key>}}` must name a setting, so a fill cannot fail later.
    for (t, b) in &files {
        if let Some(Err(k)) = std::str::from_utf8(b)
            .ok()
            .map(|x| fill(x, |k| settings.get(k).map(String::as_str)))
        {
            return Err(format!("{t}: no setting named {k}").into());
        }
    }
    let (mut mcp, mut refused) = (BTreeMap::new(), Vec::new());
    for (name, s) in m.mcp_servers {
        let id = format!("mcp:{name}");
        if s.command.is_some() || s.args.is_some() || s.env.is_some() {
            refused.push((id, "a local command".into()));
        } else if s.url.as_deref().is_none_or(|u| !u.starts_with("https://")) {
            refused.push((id, "no https address".into()));
        } else if let Some((h, _)) = s
            .headers
            .iter()
            .find(|(h, v)| is_secret(h, v) || !v.starts_with("${"))
        {
            refused.push((id, format!("a secret value in the header {h}")));
        } else {
            mcp.insert(name, s);
        }
    }
    Ok(Plugin {
        name: m.name,
        version: m.version,
        files,
        settings,
        fields,
        mcp,
        refused,
        themes,
    })
}

/// `manifest.json:<line>: <reason>`. The line is where `key` stands in the file, or line 1.
fn bad(text: &str, key: &str, why: impl std::fmt::Display) -> String {
    let at = format!("\"{key}\"");
    let line = text
        .lines()
        .position(|l| l.contains(&at))
        .map_or(1, |i| i + 1);
    format!("manifest.json:{line}: {why}")
}

/// The text with each `{{config.<key>}}` replaced by its value in one pass: a value is never read
/// again, so `{{` in a value stays text. An unknown key is the error.
fn fill<'a>(
    text: &str,
    value: impl Fn(&str) -> Option<&'a str>,
) -> std::result::Result<String, String> {
    let (mut out, mut rest) = (String::new(), text);
    while let Some(i) = rest.find("{{config.") {
        out.push_str(&rest[..i]);
        let tail = &rest[i + "{{config.".len()..];
        // Without a closing `}}` the rest stays text.
        let Some(end) = tail.find("}}") else {
            out.push_str(&rest[i..]);
            return Ok(out);
        };
        out.push_str(value(&tail[..end]).ok_or_else(|| tail[..end].to_string())?);
        rest = &tail[end + 2..];
    }
    out.push_str(rest);
    Ok(out)
}

/// The files with their settings filled in: the saved value, else the default.
fn rendered(p: &Plugin, saved: &BTreeMap<String, String>) -> Vec<(String, Vec<u8>)> {
    let value = |k: &str| {
        saved
            .get(k)
            .or_else(|| p.settings.get(k))
            .map(String::as_str)
    };
    p.files
        .iter()
        .map(|(t, b)| {
            let text = std::str::from_utf8(b)
                .ok()
                .and_then(|x| fill(x, value).ok());
            (
                t.clone(),
                text.map_or_else(|| b.clone(), String::into_bytes),
            )
        })
        .collect()
}

/// Zip a plugin folder: `manifest.json` and `files/`. A link is refused. The result is read
/// before it returns, so a bad plugin fails here with the line of the fault.
pub fn pack(dir: &Path) -> Result<Vec<u8>> {
    let mut found = Vec::new();
    let mut todo = vec![(dir.join("manifest.json"), "manifest.json".to_string())];
    todo.push((dir.join("files"), "files".into()));
    while let Some((path, rel)) = todo.pop() {
        let Ok(meta) = path.symlink_metadata() else {
            continue;
        };
        if meta.is_symlink() {
            return Err(format!("a link is not allowed: {rel}").into());
        } else if meta.is_dir() {
            for e in std::fs::read_dir(&path)? {
                let e = e?;
                todo.push((
                    e.path(),
                    format!("{rel}/{}", e.file_name().to_string_lossy()),
                ));
            }
        } else if found.len() >= MAX_ENTRIES {
            return Err(format!("the folder holds more than {MAX_ENTRIES} files").into());
        } else {
            found.push((rel, path, meta.len()));
        }
    }
    found.sort();
    if found.iter().map(|f| f.2).sum::<u64>() > MAX_BYTES {
        return Err("the folder is too large".into());
    }
    let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (rel, path, _) in found {
        w.start_file(rel, zip::write::SimpleFileOptions::default())
            .map_err(|e| e.to_string())?;
        std::io::Write::write_all(&mut w, &std::fs::read(path)?)?;
    }
    let bytes = w.finish().map_err(|e| e.to_string())?.into_inner();
    read(&bytes)?;
    Ok(bytes)
}

fn records(root: &Path) -> BTreeMap<String, Applied> {
    std::fs::read_to_string(root.join(RECORD))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// The items of a plugin with their change against the applied version. It writes nothing.
pub fn review(root: &Path, p: &Plugin) -> Review {
    let applied = records(root).remove(&p.name);
    let none = Applied::default();
    let held = applied.as_ref().unwrap_or(&none);
    let change = |same: Option<bool>| match (applied.is_some(), same) {
        (true, Some(true)) => Change::Same,
        (true, Some(false)) => Change::Changed,
        _ => Change::New,
    };
    let mut items = Vec::new();
    let files = rendered(p, &held.settings);
    for (t, b) in &files {
        items.push(Item {
            id: format!("file:{t}"),
            kind: ItemKind::File,
            label: t.clone(),
            exists: root.join(t).symlink_metadata().is_ok(),
            change: change(held.files.get(t).map(|h| *h == sha(b))),
            preview: std::str::from_utf8(b)
                .ok()
                .map(|x| x.chars().take(PREVIEW).collect()),
        });
    }
    for (k, v) in &p.settings {
        items.push(Item {
            id: format!("setting:{k}"),
            kind: ItemKind::Setting,
            label: k.clone(),
            exists: false,
            change: change(held.settings.get(k).map(|h| h == v)),
            preview: None,
        });
    }
    for n in p.mcp.keys() {
        items.push(Item {
            id: format!("mcp:{n}"),
            kind: ItemKind::Mcp,
            label: n.clone(),
            exists: false,
            change: change(held.mcp.contains(n).then_some(true)),
            preview: None,
        });
    }
    for t in &p.themes {
        items.push(Item {
            id: format!("theme:{}", t.id),
            kind: ItemKind::Theme,
            label: t.name.clone(),
            exists: false,
            change: change(held.themes.contains(&t.id).then_some(true)),
            preview: crate::themes::text(t).ok(),
        });
    }
    let gone = held
        .files
        .keys()
        .filter(|t| !p.files.iter().any(|(x, _)| x == *t))
        .map(|t| (format!("file:{t}"), ItemKind::File, t))
        .chain(
            held.settings
                .keys()
                .filter(|k| !p.settings.contains_key(*k))
                .map(|k| (format!("setting:{k}"), ItemKind::Setting, k)),
        )
        .chain(
            held.mcp
                .iter()
                .filter(|n| !p.mcp.contains_key(*n))
                .map(|n| (format!("mcp:{n}"), ItemKind::Mcp, n)),
        )
        .chain(
            held.themes
                .iter()
                .filter(|n| !p.themes.iter().any(|t| t.id == **n))
                .map(|n| (format!("theme:{n}"), ItemKind::Theme, n)),
        );
    for (id, kind, label) in gone {
        items.push(Item {
            id,
            kind,
            label: label.clone(),
            exists: false,
            change: Change::Removed,
            preview: None,
        });
    }
    Review {
        name: p.name.clone(),
        version: p.version.clone(),
        applied: applied.map(|a| a.version),
        items,
        refused: p.refused.iter().map(|(i, r)| format!("{i}: {r}")).collect(),
    }
}

/// What an apply did. The caller hands `mcp` to connections and `themes` to the theme library.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "PluginApplying")]
pub struct Applying {
    pub report: WriteReport,
    pub mcp: Vec<(String, McpServer)>,
    pub themes: Vec<ThemeFile>,
}

/// Write the accepted items only. A file that exists is kept (the no-overwrite rule). The record
/// keeps what the plugin applied, for the next review. An unknown id is an error.
pub fn apply(root: &Path, p: &Plugin, accepted: &[String]) -> Result<Applying> {
    let known = review(root, p);
    if let Some(bad) = accepted.iter().find(|a| {
        !known
            .items
            .iter()
            .any(|i| i.id == **a && i.change != Change::Removed)
    }) {
        return Err(format!("unknown item: {bad}").into());
    }
    let take = |id: String| accepted.contains(&id);
    let mut all = records(root);
    let held = all.get(&p.name).cloned().unwrap_or_default();
    // The types are checked before any write: a saved value can be old or edited by hand.
    for (k, d) in &p.settings {
        let v = held.settings.get(k).unwrap_or(d);
        if !v.is_empty() {
            check(k, &p.fields.get(k).cloned().unwrap_or_default(), v)?;
        }
    }
    let (mut fresh, mut updated) = (Vec::new(), Vec::new());
    for f in rendered(p, &held.settings)
        .into_iter()
        .filter(|(t, _)| take(format!("file:{t}")))
    {
        // A file that the person did not edit follows the plugin: it still has the recorded hash.
        let same = |h: &String| {
            root.join(&f.0)
                .symlink_metadata()
                .is_ok_and(|m| m.is_file())
                && std::fs::read(root.join(&f.0)).is_ok_and(|d| sha(&d) == *h)
        };
        if held
            .files
            .get(&f.0)
            .is_some_and(|h| same(h) && *h != sha(&f.1))
        {
            updated.push(f);
        } else {
            fresh.push(f);
        }
    }
    for (t, b) in &updated {
        write_atomic(&root.join(t), b)?;
    }
    let mut report = write_new(root, &fresh)?;
    report
        .written
        .extend(updated.iter().map(|(t, _)| t.clone()));
    let files: Vec<_> = fresh.into_iter().chain(updated).collect();
    let rec = all.entry(p.name.clone()).or_default();
    rec.version = p.version.clone();
    for (t, b) in files.iter().filter(|(t, _)| report.written.contains(t)) {
        rec.files.insert(t.clone(), sha(b));
    }
    for (k, v) in p
        .settings
        .iter()
        .filter(|(k, _)| take(format!("setting:{k}")))
    {
        // A value that the person saved stays: an update brings only new settings.
        rec.settings.entry(k.clone()).or_insert_with(|| v.clone());
        rec.fields
            .insert(k.clone(), p.fields.get(k).cloned().unwrap_or_default());
    }
    let mcp: Vec<_> = p
        .mcp
        .iter()
        .filter(|(n, _)| take(format!("mcp:{n}")))
        .map(|(n, s)| (n.clone(), s.clone()))
        .collect();
    rec.mcp.extend(mcp.iter().map(|(n, _)| n.clone()));
    rec.mcp.sort();
    rec.mcp.dedup();
    let themes: Vec<_> = p
        .themes
        .iter()
        .filter(|t| take(format!("theme:{}", t.id)))
        .cloned()
        .collect();
    rec.themes.extend(themes.iter().map(|t| t.id.clone()));
    rec.themes.sort();
    rec.themes.dedup();
    write_atomic(
        &root.join(RECORD),
        serde_json::to_string_pretty(&all)?.as_bytes(),
    )?;
    Ok(Applying {
        report,
        mcp,
        themes,
    })
}

#[cfg(test)]
mod schema_tests {
    use super::Manifest;

    /// The schema of the sample and `Manifest` name the same top-level fields.
    #[test]
    fn the_schema_matches_the_manifest() {
        let schema = include_str!("../../../examples/plugin-sample/plugin-manifest.schema.json");
        let schema: serde_json::Value = serde_json::from_str(schema).unwrap();
        let mut keys: Vec<_> = schema["properties"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        keys.sort();
        // serde lists the fields that it expects when it meets an unknown one.
        let e = serde_json::from_str::<Manifest>(r#"{"zzz":1}"#)
            .err()
            .unwrap()
            .to_string();
        let mut rust: Vec<_> = e.split('`').skip(3).step_by(2).map(String::from).collect();
        rust.sort();
        assert_eq!(keys, rust, "{e}");
        let sample = include_str!("../../../examples/plugin-sample/manifest.json");
        assert!(serde_json::from_str::<Manifest>(sample).is_ok());
    }
}
