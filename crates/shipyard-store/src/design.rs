//! The Design space on disk: artifact list, flow file, screens and the path guard (spec `design`).

use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_yaml::Value;
use shipyard_core::flows::FlowRow;
use shipyard_core::project::ProjectFile;
use shipyard_core::refs;
use specta::Type;

pub const MAX_BYTES: u64 = 5 * 1024 * 1024;

/// The folders that `resolve` opens.
const FOLDERS: [&str; 7] = [
    "diagrams",
    "models",
    "api",
    "data",
    "flows",
    "designs",
    "decisions",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    /// `diagram:x`.
    pub reference: String,
    pub kind: String,
    pub slug: String,
    /// Relative to the repository.
    pub path: String,
    pub title: String,
    pub format: Option<String>,
    pub version: Option<String>,
    /// Why the file is not readable.
    pub issue: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Screen {
    pub slug: String,
    pub title: String,
    #[serde(default)]
    pub artifacts: Vec<String>,
    /// An https URL or a repository path of a `.fig` file.
    #[serde(default)]
    pub figma: Option<String>,
    /// A local `figma` path that does not exist.
    #[serde(default)]
    pub broken: bool,
}

/// File name without its extension, then `a-z0-9` runs joined with `-`.
pub fn slug(stem: &str) -> String {
    let mut out = String::new();
    for c in stem.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_matches('-').to_string()
}

/// Splits a file name into the stem and the lower case extension.
fn split_name(name: &str) -> (&str, String) {
    let lower = name.to_lowercase();
    let cut = if lower.ends_with(".drawio.svg") {
        name.len() - ".drawio.svg".len()
    } else {
        name.rfind('.').unwrap_or(name.len())
    };
    (&name[..cut], lower[cut..].trim_start_matches('.').into())
}

fn files(root: &Path, dir: &str) -> Vec<String> {
    fn rec(root: &Path, rel: &str, out: &mut Vec<String>) {
        let Ok(rd) = fs::read_dir(root.join(rel)) else {
            return;
        };
        for e in rd.flatten() {
            let Ok(t) = e.file_type() else { continue };
            let child = format!("{rel}/{}", e.file_name().to_string_lossy());
            if t.is_dir() {
                rec(root, &child, out);
            } else if t.is_file() && e.metadata().is_ok_and(|m| m.len() <= MAX_BYTES) {
                out.push(child);
            }
        }
    }
    let mut out = Vec::new();
    rec(root, dir, &mut out);
    out.sort();
    out
}

fn diagram_format(ext: &str) -> Option<&'static str> {
    match ext {
        "excalidraw" => Some("excalidraw"),
        "drawio" | "drawio.svg" => Some("drawio"),
        "mmd" | "mermaid" => Some("mermaid"),
        "bpmn" => Some("bpmn"),
        _ => None,
    }
}

fn scalar(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// A `.drawio.svg` is a board when the root `content` attribute holds the XML source.
/// A plain SVG has none: it is a picture, not a board.
fn has_board(svg: &std::io::Result<String>) -> bool {
    svg.as_ref().is_ok_and(|t| {
        t.split("content=\"")
            .nth(1)
            .is_some_and(|c| c.trim_start().starts_with("&lt;") || c.trim_start().starts_with('<'))
    })
}

/// Title and version.
type Info = (Option<String>, Option<String>);

/// `Ok(None)`: a readable file that is not a contract.
pub(crate) fn api_info(text: &str) -> Result<Option<Info>, String> {
    let v: Value = serde_yaml::from_str(text).map_err(|e| e.to_string())?;
    if v.get("openapi").or_else(|| v.get("swagger")).is_none() {
        return Ok(None);
    }
    let info = v.get("info");
    let get = |k: &str| scalar(info.and_then(|i| i.get(k)));
    Ok(Some((get("title"), get("version"))))
}

/// The `servers` of a contract as `(listed, address)`. The address has each `{variable}` set to
/// its default.
pub fn api_servers(text: &str) -> Result<Vec<(String, String)>, String> {
    let v: Value = serde_yaml::from_str(text).map_err(|e| e.to_string())?;
    Ok(v.get("servers")
        .and_then(Value::as_sequence)
        .into_iter()
        .flatten()
        .filter_map(|sv| {
            let raw = sv.get("url")?.as_str()?.to_string();
            let mut url = raw.clone();
            let vars = sv.get("variables").and_then(Value::as_mapping);
            for (k, d) in vars.into_iter().flatten() {
                let (k, d) = (k.as_str()?, d.get("default")?.as_str()?);
                url = url.replace(&format!("{{{k}}}"), d);
            }
            Some((raw, url))
        })
        .collect())
}

/// The artifacts of the project, sorted by kind then path.
pub fn list(root: &Path, p: &ProjectFile) -> Vec<Artifact> {
    let mut out: Vec<Artifact> = Vec::new();
    for (kind, folder) in [
        ("diagram", "diagrams"),
        ("model", "models"),
        ("api", "api"),
        ("data", "data"),
        ("flow", "flows"),
    ] {
        for path in files(root, p.path(folder)) {
            let name = path.rsplit('/').next().unwrap_or("");
            let (stem, ext) = split_name(name);
            let mut a = Artifact {
                reference: String::new(),
                kind: kind.into(),
                slug: slug(stem),
                path: path.clone(),
                title: stem.into(),
                format: None,
                version: None,
                issue: None,
            };
            let ok = match kind {
                "diagram" => {
                    a.format = diagram_format(&ext).map(Into::into);
                    if ext == "drawio.svg" && !has_board(&fs::read_to_string(root.join(&path))) {
                        a.issue = Some("not a draw.io board".into());
                    }
                    a.format.is_some()
                }
                "model" => matches!(ext.as_str(), "c4" | "likec4"),
                "data" => ext == "dbml",
                "flow" => matches!(ext.as_str(), "yaml" | "yml"),
                _ if matches!(ext.as_str(), "yaml" | "yml" | "json") => {
                    match fs::read_to_string(root.join(&path))
                        .map_err(|e| e.to_string())
                        .and_then(|t| api_info(&t))
                    {
                        Ok(Some((title, version))) => {
                            a.title = title.unwrap_or(a.title);
                            a.version = version;
                            true
                        }
                        Ok(None) => false,
                        Err(e) => {
                            a.issue = Some(e);
                            true
                        }
                    }
                }
                _ => false,
            };
            if !ok {
                continue;
            }
            // A clash gets the format, or the extension, on the later path.
            if out.iter().any(|b| b.kind == kind && b.slug == a.slug) {
                a.slug = format!("{}-{}", a.slug, a.format.as_deref().unwrap_or(&ext));
            }
            a.reference = format!("{kind}:{}", a.slug);
            if refs::parse(&a.reference).is_some() {
                out.push(a);
            }
        }
    }
    if let Ok(screens) = read_screens(root, p) {
        let path = screens_path(p);
        out.extend(screens.into_iter().filter_map(|s| {
            let reference = format!("screen:{}", s.slug);
            refs::parse(&reference)?;
            Some(Artifact {
                reference,
                kind: "screen".into(),
                slug: s.slug,
                path: path.clone(),
                title: s.title,
                format: None,
                version: None,
                issue: None,
            })
        }));
    }
    out.sort_by(|a, b| (&a.kind, &a.path).cmp(&(&b.kind, &b.path)));
    out
}

#[derive(Serialize, Deserialize)]
struct FlowFile {
    rows: Vec<FlowRow>,
}

pub fn read_flows(text: &str) -> Result<Vec<FlowRow>, String> {
    serde_yaml::from_str::<FlowFile>(text)
        .map(|f| f.rows)
        .map_err(|e| e.to_string())
}

/// The file text for the rows. `old` is the text now in the file. A save drops a comment and a
/// key other than `rows`, so a file that holds one is refused.
pub fn write_flows(rows: &[FlowRow], old: &str) -> Result<String, String> {
    let extra = serde_yaml::from_str::<serde_yaml::Mapping>(old)
        .is_ok_and(|m| m.keys().any(|k| k.as_str() != Some("rows")));
    if extra || old.lines().any(|l| l.trim_start().starts_with('#')) {
        return Err("the file holds content that a save would drop".into());
    }
    serde_yaml::to_string(&FlowFile {
        rows: rows.to_vec(),
    })
    .map_err(|e| e.to_string())
}

pub(crate) fn screens_path(p: &ProjectFile) -> String {
    format!("{}/screens.json", p.path("designs"))
}

/// The ref kind and slug of a file by its folder and extension, for the ref index. An `api` file
/// also needs a contract text (`api_info`).
///
/// shortcut: a slug clash gets no suffix here, as `list` gives it. Both files answer to one ref.
pub(crate) fn file_ref(rel: &str, p: &ProjectFile) -> Option<(&'static str, String)> {
    let name = rel.rsplit('/').next()?;
    let (stem, ext) = split_name(name);
    let (kind, ok) = [
        ("diagram", "diagrams"),
        ("model", "models"),
        ("api", "api"),
        ("data", "data"),
        ("flow", "flows"),
        ("test", "test-plans"),
    ]
    .into_iter()
    .find(|(_, folder)| is_under(rel, p.path(folder)))
    .map(|(kind, _)| {
        let ok = match kind {
            "diagram" => diagram_format(&ext).is_some(),
            "model" => matches!(ext.as_str(), "c4" | "likec4"),
            "api" => matches!(ext.as_str(), "yaml" | "yml" | "json"),
            "data" => ext == "dbml",
            "flow" => matches!(ext.as_str(), "yaml" | "yml"),
            _ => ext == "feature",
        };
        (kind, ok)
    })?;
    let slug = slug(stem);
    (ok && !slug.is_empty()).then_some((kind, slug))
}

/// A relative path with no `..` and no root.
pub fn plain(rel: &str) -> bool {
    !rel.is_empty()
        && !rel.contains('\\')
        && Path::new(rel)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}

/// The screens of a `screens.json` text.
pub(crate) fn parse_screens(text: &str) -> Result<Vec<Screen>, String> {
    #[derive(Deserialize)]
    struct File {
        screens: Vec<Screen>,
    }
    serde_json::from_str::<File>(text)
        .map(|f| f.screens)
        .map_err(|e| e.to_string())
}

/// Reads `screens.json`. A missing file gives no screens.
pub fn read_screens(root: &Path, p: &ProjectFile) -> Result<Vec<Screen>, String> {
    let Ok(text) = fs::read_to_string(root.join(screens_path(p))) else {
        return Ok(Vec::new());
    };
    let mut screens = parse_screens(&text)?;
    for s in &mut screens {
        s.broken = s
            .figma
            .as_deref()
            .is_some_and(|f| !f.starts_with("https://") && !(plain(f) && root.join(f).exists()));
    }
    Ok(screens)
}

/// Repository path of the design doc.
pub fn design_doc_path(p: &ProjectFile) -> String {
    format!("{}/design.md", p.path("designs"))
}

/// The absolute path of a design file. Every Design read and write goes through here.
pub fn resolve(root: &Path, p: &ProjectFile, rel: &str) -> Result<PathBuf, String> {
    resolve_in(root, p, rel, &FOLDERS)
}

/// The absolute path of a file below one of the folders (keys of the project paths).
pub fn resolve_in(
    root: &Path,
    p: &ProjectFile,
    rel: &str,
    folders: &[&str],
) -> Result<PathBuf, String> {
    let bad = || format!("path not allowed: {rel}");
    if !plain(rel) || !folders.iter().any(|k| is_under(rel, p.path(k))) {
        return Err(bad());
    }
    // A link must not lead out of the repository.
    let base = root.canonicalize().map_err(|e| e.to_string())?;
    let full = root.join(rel);
    let near = full.ancestors().find_map(|a| a.canonicalize().ok());
    if near.is_none_or(|n| !n.starts_with(&base)) {
        return Err(bad());
    }
    Ok(full)
}

pub fn is_under(rel: &str, folder: &str) -> bool {
    !folder.is_empty() && rel != folder && Path::new(rel).starts_with(folder)
}
