//! The plugin reader and the review model (spec `extensions`, REQ-011 to REQ-014). A plugin is a
//! `.zip` with `manifest.json` and a `files/` payload. It is read as data: no code runs and no
//! file is written before the person accepts items. The archive is bounded.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;

use ring::digest::{SHA256, digest};
use serde::{Deserialize, Serialize};
use shipyard_core::extensions::{WriteReport, safe_rel};
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
    name: String,
    version: String,
    #[serde(default)]
    files: Vec<FileEntry>,
    #[serde(default)]
    settings: BTreeMap<String, SettingSpec>,
    #[serde(default)]
    mcp_servers: BTreeMap<String, McpServer>,
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
#[serde(rename = "PluginItemKind")]
pub enum ItemKind {
    File,
    Setting,
    Mcp,
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
    /// `file:<target>`, `setting:<key>`, `mcp:<name>`.
    pub id: String,
    pub kind: ItemKind,
    pub label: String,
    /// A file that exists is kept at apply, and the report names it.
    pub exists: bool,
    pub change: Change,
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
    let m: Manifest =
        serde_json::from_slice(&manifest).map_err(|e| format!("manifest.json: {e}"))?;
    if m.name.is_empty() || m.name.contains(['/', '\\']) || m.name.starts_with('.') {
        return Err(format!("manifest.json: bad name {}", m.name).into());
    }
    // No `files` list: the whole payload goes to the root.
    let entries = if m.files.is_empty() {
        payload
            .keys()
            .map(|k| FileEntry {
                source: k.clone(),
                target: k["files/".len()..].into(),
            })
            .collect()
    } else {
        m.files
    };
    let mut files = Vec::new();
    for e in entries {
        if !safe_rel(&e.target) {
            return Err(format!("path not allowed: {}", e.target).into());
        }
        let bytes = payload.get(&e.source).ok_or_else(|| {
            format!(
                "manifest.json names {}, which the archive does not hold",
                e.source
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
            check(&k, &field, &v)?;
        }
        settings.insert(k.clone(), v);
        fields.insert(k, field);
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
    })
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
    for (t, b) in &p.files {
        items.push(Item {
            id: format!("file:{t}"),
            kind: ItemKind::File,
            label: t.clone(),
            exists: root.join(t).symlink_metadata().is_ok(),
            change: change(held.files.get(t).map(|h| *h == sha(b))),
        });
    }
    for (k, v) in &p.settings {
        items.push(Item {
            id: format!("setting:{k}"),
            kind: ItemKind::Setting,
            label: k.clone(),
            exists: false,
            change: change(held.settings.get(k).map(|h| h == v)),
        });
    }
    for n in p.mcp.keys() {
        items.push(Item {
            id: format!("mcp:{n}"),
            kind: ItemKind::Mcp,
            label: n.clone(),
            exists: false,
            change: change(held.mcp.contains(n).then_some(true)),
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
        );
    for (id, kind, label) in gone {
        items.push(Item {
            id,
            kind,
            label: label.clone(),
            exists: false,
            change: Change::Removed,
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

/// What an apply did. The caller hands `mcp` to connections.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "PluginApplying")]
pub struct Applying {
    pub report: WriteReport,
    pub mcp: Vec<(String, McpServer)>,
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
    let files: Vec<_> = p
        .files
        .iter()
        .filter(|(t, _)| take(format!("file:{t}")))
        .cloned()
        .collect();
    let report = write_new(root, &files)?;
    let mut all = records(root);
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
    write_atomic(
        &root.join(RECORD),
        serde_json::to_string_pretty(&all)?.as_bytes(),
    )?;
    Ok(Applying { report, mcp })
}
