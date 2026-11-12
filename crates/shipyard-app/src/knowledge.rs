//! Knowledge IPC (spec `knowledge`): the graph of refs, the code graph, the Explain context, the
//! handbook, documents and decks, the theme, dashboards, the learning path and the exports.
//!
//! The code graph comes from the codebase-memory MCP server through the Shipyard proxy (Q-045
//! option 1). Every path from the view goes through `design::resolve_in`. A file that a newer
//! version wrote is never overwritten (REQ-022). An export is built at the click from the
//! sources of that moment (REQ-015).

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_core::knowledge::{Stamp, Term, glossary, marks, path_order};
use shipyard_mcp::proxy::{Proxy, SEP};
use shipyard_store::design::{self, resolve_in};
use shipyard_store::export::{
    self, Content, Item, Meta, Section, SheetOut, annex_item, assemble, docx_bytes, image_item,
};
use shipyard_store::knowledge::{
    self as kn, Dashboard, DeckTheme, GraphEdge, GraphNode, Loaded, PageEntry,
};
use shipyard_store::madr;
use shipyard_store::project::write_atomic;
use specta::Type;
use tauri::AppHandle;

use crate::commands::refs::{resolve, with_index};
use crate::commands::{Api, AppState, Res, blocking, err};
use crate::design::{Text, Written, project, put, read_text};

// ---------------------------------------------------------------- reference graph

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct KNode {
    #[serde(rename = "ref")]
    pub target: String,
    pub kind: String,
    pub title: String,
    pub status: Option<String>,
    pub location: Option<String>,
    pub orphan: bool,
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct KGraph {
    pub nodes: Vec<KNode>,
    pub edges: Vec<GraphEdge>,
}

/// The time of the last change of each file: the last commit that touched it, or the time of
/// the file when it has no commit or has uncommitted changes (REQ-007). Two `git` calls.
fn changed_times(root: &Path, paths: &[&str]) -> HashMap<String, i64> {
    let git = |args: &[&str]| {
        Command::new("git")
            .arg("-C")
            .arg(root)
            .args(args)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default()
    };
    // shortcut: the 5000 latest commits. A file that none of them touched uses its file time.
    let log = git(&[
        "log",
        "-n",
        "5000",
        "--no-renames",
        "--name-only",
        "--format=@%ct",
    ]);
    let mut committed: HashMap<&str, i64> = HashMap::new();
    let mut at = 0;
    for line in log.lines() {
        match line.strip_prefix('@') {
            Some(t) => at = t.parse().unwrap_or(0),
            None if !line.is_empty() => {
                committed.entry(line).or_insert(at);
            }
            None => {}
        }
    }
    let status = git(&["status", "--porcelain", "-z", "--untracked-files=all"]);
    let dirty: Vec<&str> = status.split('\0').filter_map(|e| e.get(3..)).collect();
    paths
        .iter()
        .map(|p| {
            let file_time = || {
                std::fs::metadata(root.join(p))
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_secs() as i64)
            };
            let time = match committed.get(p) {
                Some(&t) if !dirty.contains(p) => t,
                _ => file_time(),
            };
            ((*p).to_string(), time)
        })
        .collect()
}

/// The reference graph with the orphan and stale marks (REQ-001, REQ-004, REQ-007).
pub fn graph(s: &AppState) -> Res<KGraph> {
    let p = project(s)?;
    let (nodes, edges) = with_index(s, |i| i.graph())?;
    let paths: Vec<&str> = nodes.iter().filter_map(|n| n.location.as_deref()).collect();
    let times = changed_times(&p.root, &paths);
    let stamps: Vec<Stamp> = nodes
        .iter()
        .map(|n| Stamp {
            reference: n.target.clone(),
            changed: n
                .location
                .as_ref()
                .and_then(|l| times.get(l))
                .copied()
                .unwrap_or(0),
        })
        .collect();
    let pairs: Vec<(String, String)> = edges
        .iter()
        .map(|e| (e.source.clone(), e.target.clone()))
        .collect();
    let m = marks(&stamps, &pairs);
    Ok(KGraph {
        nodes: nodes
            .into_iter()
            .map(|n| {
                let mk = m.get(&n.target).copied().unwrap_or_default();
                KNode {
                    target: n.target,
                    kind: n.kind,
                    title: n.title,
                    status: n.status,
                    location: n.location,
                    orphan: mk.orphan,
                    stale: mk.stale,
                }
            })
            .collect(),
        edges,
    })
}

// ---------------------------------------------------------------- code graph

/// The id of the codebase-memory server among the active MCP servers (a catalogue id or
/// `custom-<slug>`).
pub const CODE_SERVER: &str = "codebase-memory";

/// What the code graph needs from the codebase-memory server: one tool call, and the result.
pub trait CodeSource {
    fn call(&self, tool: &str, args: Value) -> Result<Value, String>;
}

/// A server that is on goes through the proxy. A server that is off (its saved setting stays off)
/// runs for this one call and stops after it, also on an error, unless it was running already. The
/// same allow list applies in both cases.
impl CodeSource for Proxy {
    fn call(&self, tool: &str, args: Value) -> Result<Value, String> {
        let control = self.control();
        let id = control
            .list()
            .into_iter()
            .find(|r| r.id.contains(CODE_SERVER))
            .ok_or("the codebase-memory server is not active")?
            .id;
        if control.is_enabled(&id) {
            return Proxy::call(self, &format!("{id}{SEP}{tool}"), &args).map_err(err);
        }
        let was_running = matches!(
            control.state(&id),
            shipyard_agents::mcp_control::State::Running
        );
        let answer = if self.allowed(&id, tool) {
            control.request(
                &id,
                "tools/call",
                json!({ "name": tool, "arguments": args }),
            )
        } else {
            Err(shipyard_agents::AgentError::Invalid(format!(
                "the tool {tool} of {id} is not on its allow list"
            )))
        };
        if !was_running {
            control.stop(&id);
        }
        let answer = answer.map_err(err)?;
        match answer.get("error") {
            Some(e) => Err(e
                .get("message")
                .and_then(Value::as_str)
                .map_or_else(|| e.to_string(), str::to_string)),
            None => Ok(answer.get("result").cloned().unwrap_or(Value::Null)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum CodeState {
    /// The graph is there.
    Ready,
    /// The server answers but the project has no index. The view shows the Index action.
    Unindexed,
    /// The server is not active or does not answer.
    Off,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct CodeGraph {
    pub state: CodeState,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<CodeEdge>,
}

/// The name of the graph of a folder in codebase-memory: its real path (a link such as `/tmp` or
/// `/var` is resolved, as the tool does) with `-` for each `/` and each space.
fn graph_project(root: &Path) -> String {
    let real = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    real.to_string_lossy()
        .trim_matches('/')
        .replace(['/', ' '], "-")
}

/// The data of a tool result: the JSON in its first text block, or the result itself.
fn payload(result: &Value) -> Value {
    result
        .pointer("/content/0/text")
        .and_then(Value::as_str)
        .and_then(|t| serde_json::from_str(t).ok())
        .or_else(|| result.get("structuredContent").cloned())
        .unwrap_or_else(|| result.clone())
}

const CODE_ROWS: usize = 300;

/// The rows of a `query_graph` result, each cell as text. The server answers with JSON
/// (`{"rows": [[...]]}`) or, in newer versions, with a text table: a `rows: N (cols: ...)` line,
/// one line per row with the cells split by spaces (a cell with spaces is a JSON string), and a
/// `total: N` line.
fn graph_rows(result: &Value) -> Vec<Vec<String>> {
    let cell = |v: &Value| v.as_str().map_or_else(|| v.to_string(), str::to_string);
    if let Some(rows) = payload(result).get("rows").and_then(Value::as_array) {
        return rows
            .iter()
            .filter_map(Value::as_array)
            .map(|r| r.iter().map(cell).collect())
            .collect();
    }
    let text = result
        .pointer("/content/0/text")
        .and_then(Value::as_str)
        .unwrap_or_default();
    text.lines()
        .filter(|l| {
            let t = l.trim_start();
            !t.is_empty() && !t.starts_with("rows:") && !t.starts_with("total:")
        })
        .map(table_cells)
        .collect()
}

/// The cells of one line of the text table: a JSON string, or a run of characters up to a space.
fn table_cells(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = line.trim_start();
    while !rest.is_empty() {
        if rest.starts_with('"') {
            let mut it = serde_json::Deserializer::from_str(rest).into_iter::<String>();
            if let Some(Ok(v)) = it.next() {
                out.push(v);
                rest = rest[it.byte_offset()..].trim_start();
                continue;
            }
        }
        let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        out.push(rest[..end].to_string());
        rest = rest[end..].trim_start();
    }
    out
}

/// The most file pairs that the overview reads, the most called first.
const OVERVIEW_PAIRS: usize = 3000;

/// A call weight between two files. The overview draws a thicker line for a bigger weight.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct CodeEdge {
    pub source: String,
    pub target: String,
    pub weight: u32,
}

fn empty(state: CodeState) -> CodeGraph {
    CodeGraph {
        state,
        nodes: vec![],
        edges: vec![],
    }
}

fn file_node(path: &str) -> GraphNode {
    GraphNode {
        target: path.to_string(),
        kind: "file".into(),
        title: path.to_string(),
        status: None,
        location: Some(path.to_string()),
    }
}

/// The overview of the code (REQ-002): the files, and the calls between two files counted, the
/// most called pairs first. The symbols come with `code_focus`. shortcut: the first 3000 pairs.
pub fn code_graph(src: &dyn CodeSource, root: &Path) -> CodeGraph {
    let query = format!(
        "MATCH (a)-[:CALLS]->(b) RETURN a.file_path, b.file_path, count(*) AS n ORDER BY n DESC LIMIT {OVERVIEW_PAIRS}"
    );
    let args = json!({ "project": graph_project(root), "query": query });
    let Ok(result) = src.call("query_graph", args) else {
        return empty(CodeState::Off);
    };
    let mut seen: std::collections::HashSet<String> = Default::default();
    let mut nodes: Vec<GraphNode> = Vec::new();
    let mut edges: Vec<CodeEdge> = Vec::new();
    for row in graph_rows(&result) {
        let [a, b, n] = match <[String; 3]>::try_from(row) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if a.is_empty() || b.is_empty() {
            continue;
        }
        for f in [&a, &b] {
            if seen.insert(f.clone()) {
                nodes.push(file_node(f));
            }
        }
        // A call inside one file is no line between two files.
        if a != b {
            edges.push(CodeEdge {
                source: a,
                target: b,
                weight: n.parse().unwrap_or(1),
            });
        }
    }
    let state = if nodes.is_empty() {
        CodeState::Unindexed
    } else {
        CodeState::Ready
    };
    CodeGraph {
        state,
        nodes,
        edges,
    }
}

/// The calls of one file, symbol by symbol: its symbols, and each symbol that calls them or that
/// they call, each under its file. shortcut: the first 300 calls.
pub fn code_focus(src: &dyn CodeSource, root: &Path, file: &str) -> Res<CodeGraph> {
    if file.is_empty() || file.contains(['"', '\\', '\n', '\r']) {
        return Err("this file name cannot be read".into());
    }
    let query = format!(
        "MATCH (a)-[:CALLS]->(b) WHERE a.file_path = \"{file}\" OR b.file_path = \"{file}\" RETURN a.name, a.file_path, b.name, b.file_path LIMIT {CODE_ROWS}"
    );
    let args = json!({ "project": graph_project(root), "query": query });
    let Ok(result) = src.call("query_graph", args) else {
        return Ok(empty(CodeState::Off));
    };
    let mut seen: std::collections::HashSet<String> = Default::default();
    let mut nodes: Vec<GraphNode> = Vec::new();
    let mut edges: Vec<CodeEdge> = Vec::new();
    for row in graph_rows(&result) {
        let [an, af, bn, bf] = match <[String; 4]>::try_from(row) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let (an, bn) = (
            an.trim_matches('"').to_string(),
            bn.trim_matches('"').to_string(),
        );
        let (a, b) = (format!("{af}::{an}"), format!("{bf}::{bn}"));
        for (id, name, f) in [(&a, an, &af), (&b, bn, &bf)] {
            if seen.insert(f.clone()) {
                nodes.push(file_node(f));
            }
            if seen.insert(id.clone()) {
                nodes.push(GraphNode {
                    target: id.clone(),
                    kind: "symbol".into(),
                    title: name,
                    status: None,
                    location: Some(f.clone()),
                });
            }
            edges.push(CodeEdge {
                source: f.clone(),
                target: id.clone(),
                weight: 1,
            });
        }
        edges.push(CodeEdge {
            source: a,
            target: b,
            weight: 1,
        });
    }
    edges.sort_by(|x, y| (&x.source, &x.target).cmp(&(&y.source, &y.target)));
    edges.dedup();
    let state = if nodes.is_empty() {
        CodeState::Unindexed
    } else {
        CodeState::Ready
    };
    Ok(CodeGraph {
        state,
        nodes,
        edges,
    })
}

/// The Index action: ask the server to index the folder.
pub fn code_index(src: &dyn CodeSource, root: &Path) -> Res<()> {
    src.call(
        "index_repository",
        json!({ "repo_path": root.to_string_lossy() }),
    )
    .map(|_| ())
}

/// The program of the codebase-memory server when the person never added it.
const CODE_COMMAND: &str = "codebase-memory-mcp";

/// The Index action for the app. A server that is missing from the list is added (off). A server
/// that is off (its saved setting stays off) runs for this one call and stops after it, also on
/// an error. A server that runs is used and left running. The app stops it on quit too
/// (`stop_all`). The program must be installed.
pub fn code_index_run(proxy: &Proxy, root: &Path) -> Res<()> {
    let control = proxy.control();
    let find = || {
        control
            .list()
            .into_iter()
            .find(|r| r.id.contains(CODE_SERVER))
    };
    let row = match find() {
        Some(r) => r,
        None => {
            let input = shipyard_agents::mcp_control::CustomInput {
                name: CODE_SERVER.into(),
                command: CODE_COMMAND.into(),
                ..Default::default()
            };
            control.add_custom(input).map_err(err)?;
            find().ok_or("the codebase-memory server is not active")?
        }
    };
    if let Some(m) = row.missing.first() {
        return Err(format!("{} is not installed", m.command));
    }
    code_index(proxy, root)
}

// ---------------------------------------------------------------- Explain context

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExplainContext {
    pub entity: String,
    /// False when the entity is not known: the answer then says that it found no source (REQ-009).
    pub found: bool,
    /// The refs of the entity and of its neighbours at one hop, with title and status.
    pub refs: Vec<shipyard_store::ref_query::Resolved>,
}

/// The entity and the entities that cite it or that it cites (REQ-008). The assistant gets only
/// these refs, so an answer cites nothing outside the graph.
pub fn explain_context(s: &AppState, entity: &str) -> Res<ExplainContext> {
    let entity = entity.trim().trim_start_matches('@');
    let known = resolve(s, entity)?;
    let found = known
        .as_ref()
        .is_some_and(|r| r.state == shipyard_store::ref_query::State::Resolved);
    let mut refs: Vec<shipyard_store::ref_query::Resolved> = known.into_iter().collect();
    if found {
        let (_, edges) = with_index(s, |i| i.graph())?;
        let mut near: Vec<&str> = edges
            .iter()
            .filter_map(|e| match (e.source == entity, e.target == entity) {
                (true, _) => Some(e.target.as_str()),
                (_, true) => Some(e.source.as_str()),
                _ => None,
            })
            .collect();
        near.sort_unstable();
        near.dedup();
        for r in near {
            refs.extend(resolve(s, r)?);
        }
    }
    Ok(ExplainContext {
        entity: entity.into(),
        found,
        refs,
    })
}

// ---------------------------------------------------------------- handbook, documents, decks

const FOLDERS: [&str; 3] = ["handbook", "documents", "slides"];

#[derive(Debug, Clone, Serialize, Type)]
pub struct DocList {
    pub handbook: Vec<PageEntry>,
    pub documents: Vec<PageEntry>,
    pub slides: Vec<PageEntry>,
}

pub fn doc_list(s: &AppState) -> Res<DocList> {
    let p = project(s)?;
    let list = |k: &str| kn::pages(&p.root, p.file.path(k));
    Ok(DocList {
        handbook: list("handbook"),
        documents: list("documents"),
        slides: list("slides"),
    })
}

pub fn doc_read(s: &AppState, rel: &str) -> Res<Text> {
    let p = project(s)?;
    read_text(&resolve_in(&p.root, &p.file, rel, &FOLDERS)?, rel)
}

/// Save a page, a document or a deck. `stamp` is the stamp of the read: a file that changed on
/// disk since then is not replaced (REQ-011). `create` makes a new file (REQ-010).
pub fn doc_write(
    s: &AppState,
    rel: &str,
    text: &str,
    stamp: Option<&str>,
    create: bool,
) -> Res<Written> {
    let p = project(s)?;
    // An HTML deck (ADR 0016) is the one `.html` file that a person writes, in the slides folder.
    let folders: &[&str] = match rel {
        r if r.ends_with(".md") => &FOLDERS,
        r if r.ends_with(".html") => &["slides"],
        _ => return Err("a page is a .md file".into()),
    };
    put(
        s,
        &resolve_in(&p.root, &p.file, rel, folders)?,
        text,
        stamp,
        create,
        crate::rights::Right::KnowledgeEdit,
    )
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct ThemeView {
    #[serde(flatten)]
    pub loaded: Loaded<DeckTheme>,
    pub stamp: Option<String>,
}

fn theme_path(p: &crate::design::Proj) -> String {
    format!("{}/theme.yaml", p.file.path("slides"))
}

/// The one theme of the project. A project with no theme file gets the default theme.
pub fn theme_get(s: &AppState) -> Res<ThemeView> {
    let p = project(s)?;
    let rel = theme_path(&p);
    match read_text(&resolve_in(&p.root, &p.file, &rel, &FOLDERS)?, &rel) {
        Ok(t) => Ok(ThemeView {
            loaded: kn::parse_theme(&t.text).map_err(err)?,
            stamp: Some(t.stamp),
        }),
        Err(_) if !p.root.join(&rel).exists() => Ok(ThemeView {
            loaded: Loaded {
                value: DeckTheme::default(),
                read_only: false,
            },
            stamp: None,
        }),
        Err(e) => Err(e),
    }
}

pub fn theme_set(s: &AppState, theme: &DeckTheme, stamp: Option<&str>) -> Res<Written> {
    let p = project(s)?;
    let rel = theme_path(&p);
    let full = resolve_in(&p.root, &p.file, &rel, &FOLDERS)?;
    kn::check_writable(std::fs::read_to_string(&full).ok().as_deref()).map_err(err)?;
    let text = kn::theme_text(theme).map_err(err)?;
    put(
        s,
        &full,
        &text,
        stamp,
        !full.exists(),
        crate::rights::Right::KnowledgeEdit,
    )
}

pub fn deck_parse(text: &str) -> kn::Deck {
    kn::parse_deck(text, "deck")
}

// ---------------------------------------------------------------- dashboards

fn dash_path(p: &crate::design::Proj, slug: &str) -> Res<String> {
    if slug.is_empty() || design::slug(slug) != slug {
        return Err(format!("not a dashboard name: {slug}"));
    }
    Ok(format!("{}/{slug}.yaml", p.file.path("dashboards")))
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DashEntry {
    pub slug: String,
    pub title: String,
    pub read_only: bool,
}

pub fn dashboard_list(s: &AppState) -> Res<Vec<DashEntry>> {
    let p = project(s)?;
    let dir = p.file.path("dashboards").to_string();
    let mut out: Vec<DashEntry> = std::fs::read_dir(p.root.join(&dir))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let slug = name.strip_suffix(".yaml")?.to_string();
            let l = kn::parse_dashboard(&std::fs::read_to_string(e.path()).ok()?).ok()?;
            Some(DashEntry {
                title: if l.value.title.is_empty() {
                    slug.clone()
                } else {
                    l.value.title
                },
                slug,
                read_only: l.read_only,
            })
        })
        .collect();
    out.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(out)
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct DashView {
    #[serde(flatten)]
    pub loaded: Loaded<Dashboard>,
    pub stamp: String,
}

pub fn dashboard_get(s: &AppState, slug: &str) -> Res<DashView> {
    let p = project(s)?;
    let rel = dash_path(&p, slug)?;
    let t = read_text(&resolve_in(&p.root, &p.file, &rel, &["dashboards"])?, &rel)?;
    Ok(DashView {
        loaded: kn::parse_dashboard(&t.text).map_err(err)?,
        stamp: t.stamp,
    })
}

/// Save a dashboard to its file and make no commit (REQ-022). A file of a newer version is
/// refused. `stamp` is `None` for a new dashboard.
pub fn dashboard_save(
    s: &AppState,
    slug: &str,
    dash: &Dashboard,
    stamp: Option<&str>,
) -> Res<Written> {
    let p = project(s)?;
    let rel = dash_path(&p, slug)?;
    let full = resolve_in(&p.root, &p.file, &rel, &["dashboards"])?;
    kn::check_writable(std::fs::read_to_string(&full).ok().as_deref()).map_err(err)?;
    put(
        s,
        &full,
        &kn::dashboard_text(dash).map_err(err)?,
        stamp,
        !full.exists(),
        crate::rights::Right::KnowledgeEdit,
    )
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct TileData {
    pub kind: String,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    /// The answer holds more rows than shown.
    pub cut: bool,
    /// The source is not available. Holds its name. The tile shows greyed (REQ-023).
    pub off: Option<String>,
}

/// The numbers behind a tile, as a table: the chart and Show as table read the same rows.
pub fn tile_data(s: &AppState, kind: &str) -> Res<TileData> {
    if !kn::TILES.contains(&kind) {
        return Err(format!("unknown tile: {kind}"));
    }
    let found = with_index(s, |i| i.tile_rows(kind))?;
    let label = if kind == "estimates" {
        "sheet"
    } else {
        "status"
    };
    Ok(match found {
        Some((rows, cut)) => TileData {
            kind: kind.into(),
            columns: vec![label.into(), "count".into()],
            rows: rows
                .into_iter()
                .map(|(l, n)| vec![l, n.to_string()])
                .collect(),
            cut,
            off: None,
        },
        None => TileData {
            kind: kind.into(),
            columns: vec![],
            rows: vec![],
            cut: false,
            off: Some(kind.into()),
        },
    })
}

// ---------------------------------------------------------------- learn

#[derive(Debug, Clone, Serialize, Type)]
pub struct LearnStep {
    #[serde(rename = "ref")]
    pub target: String,
    pub kind: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct Learn {
    pub path: Vec<LearnStep>,
    pub glossary: Vec<Term>,
}

/// The learning path and the glossary (REQ-020, REQ-021).
pub fn learn(s: &AppState) -> Res<Learn> {
    let p = project(s)?;
    let (nodes, _) = with_index(s, |i| i.graph())?;
    let refs: Vec<String> = nodes.iter().map(|n| n.target.clone()).collect();
    let path = path_order(&refs)
        .into_iter()
        .filter_map(|r| nodes.iter().find(|n| n.target == r))
        .map(|n| LearnStep {
            target: n.target.clone(),
            kind: n.kind.clone(),
            title: n.title.clone(),
        })
        .collect();
    let specs: Vec<(String, String)> = nodes
        .iter()
        .filter(|n| n.kind == "spec" && !n.target.contains('#'))
        .filter_map(|n| {
            let text = std::fs::read_to_string(p.root.join(n.location.as_ref()?)).ok()?;
            Some((n.target.clone(), text))
        })
        .collect();
    Ok(Learn {
        path,
        glossary: glossary(&specs),
    })
}

// ---------------------------------------------------------------- exports

/// The words of a document, in the language of the person. `sections` holds one title for each
/// section: five for the dossier, four for the functional documentation.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportText {
    pub title: String,
    pub empty: String,
    pub gap: String,
    pub generated: String,
    /// The title of the contents list.
    pub contents: String,
    pub sections: Vec<String>,
}

/// One architecture view that the view rendered at the click.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct ViewImage {
    pub title: String,
    /// Base64 text of a PNG file. Empty when the diagram did not render.
    pub png: String,
    /// The diagram text. The dossier keeps it as a code block when `png` is empty.
    pub source: String,
}

/// A Mermaid diagram of the project that the view renders for the dossier.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct DiagramSource {
    pub title: String,
    pub source: String,
}

/// The Mermaid diagrams of the project: each `.mmd` file of the diagrams folder, then each fenced
/// `mermaid` block of a handbook page, a document or a decision.
pub fn diagram_sources(s: &AppState) -> Res<Vec<DiagramSource>> {
    let p = project(s)?;
    let mut out = Vec::new();
    for a in design::list(&p.root, &p.file)
        .iter()
        .filter(|a| a.kind == "diagram" && a.format.as_deref() == Some("mermaid"))
    {
        if let Ok(source) = std::fs::read_to_string(p.root.join(&a.path)) {
            out.push(DiagramSource {
                title: a.title.clone(),
                source,
            });
        }
    }
    let pages = ["handbook", "documents"]
        .into_iter()
        .flat_map(|k| kn::pages(&p.root, p.file.path(k)))
        .map(|e| (e.title, e.path))
        .chain(
            madr::list(&p.root, &p.file)
                .into_iter()
                .map(|a| (format!("{} {}", a.number, a.title), a.path)),
        );
    for (title, path) in pages {
        let Ok(text) = std::fs::read_to_string(p.root.join(&path)) else {
            continue;
        };
        let mut open: Option<Vec<&str>> = None;
        let mut found = 0;
        for line in text.lines() {
            let fence = line.trim_start().strip_prefix("```");
            match (&mut open, fence) {
                (None, Some(lang)) if lang.trim() == "mermaid" => open = Some(Vec::new()),
                (Some(_), Some(_)) => {
                    found += 1;
                    out.push(DiagramSource {
                        title: if found == 1 {
                            title.clone()
                        } else {
                            format!("{title} ({found})")
                        },
                        source: open.take().unwrap_or_default().join("\n"),
                    });
                }
                (Some(lines), None) => lines.push(line),
                _ => {}
            }
        }
    }
    Ok(out)
}

fn view_item(v: &ViewImage) -> Item {
    if v.png.is_empty() {
        Item {
            name: v.title.clone(),
            source: Ok(Content::Code(v.source.clone())),
        }
    } else {
        image_item(&v.title, &v.png)
    }
}

pub(crate) fn meta(s: &AppState, p: &crate::design::Proj, t: &ExportText) -> Meta {
    Meta {
        title: t.title.clone(),
        project: p.file.name.clone(),
        generated_on: crate::work::today(s),
        empty: t.empty.clone(),
        gap: t.gap.clone(),
        generated: t.generated.clone(),
        contents: t.contents.clone(),
    }
}

fn read_item(
    p: &crate::design::Proj,
    name: &str,
    rel: &str,
    wrap: impl FnOnce(String) -> Content,
) -> Item {
    let text = std::fs::read_to_string(p.root.join(rel)).map_err(|e| format!("{rel}: {e}"));
    Item {
        name: name.into(),
        source: text.map(wrap),
    }
}

fn named(sections: &[String], n: usize) -> Res<Vec<&str>> {
    if sections.len() != n {
        return Err(format!("expected {n} section titles"));
    }
    Ok(sections.iter().map(String::as_str).collect())
}

/// The architecture dossier: the views, the decisions, the data models, the flows and the API
/// contracts (REQ-013). Each source is read now. A source that fails is a gap.
pub fn export_dossier(s: &AppState, t: &ExportText, views: &[ViewImage], path: &str) -> Res<()> {
    let titles = named(&t.sections, 5)?;
    let p = project(s)?;
    let sections = dossier_sections(&p, &titles, views.iter().map(view_item).collect());
    write_export(
        s,
        path,
        "docx",
        &docx_bytes(&meta(s, &p, t), &assemble(&meta(s, &p, t), &sections)).map_err(err)?,
    )
}

/// The five sections of the dossier. `views` are the rendered architecture views.
fn dossier_sections(p: &crate::design::Proj, titles: &[&str], views: Vec<Item>) -> Vec<Section> {
    let arts = design::list(&p.root, &p.file);
    let of = |kind: &str| arts.iter().filter(|a| a.kind == kind).collect::<Vec<_>>();
    let mut views = views;
    views.extend(other_views(p, &arts));
    vec![
        Section {
            title: titles[0].into(),
            items: views,
        },
        Section {
            title: titles[1].into(),
            items: madr::list(&p.root, &p.file)
                .iter()
                .map(|a| {
                    read_item(
                        p,
                        &format!("{} {}", a.number, a.title),
                        &a.path,
                        Content::Markdown,
                    )
                })
                .collect(),
        },
        Section {
            title: titles[2].into(),
            items: of("data")
                .into_iter()
                .map(|a| {
                    read_item(p, &a.title, &a.path, |x| {
                        Content::Markdown(dbml_markdown(&x))
                    })
                })
                .collect(),
        },
        Section {
            title: titles[3].into(),
            items: of("flow")
                .into_iter()
                .map(|a| Item {
                    name: a.title.clone(),
                    source: std::fs::read_to_string(p.root.join(&a.path))
                        .map_err(|e| format!("{}: {e}", a.path))
                        .and_then(|x| design::read_flows(&x))
                        .map(|rows| Content::Table {
                            headers: [
                                "Source",
                                "Destination",
                                "Network",
                                "Protocol",
                                "Port",
                                "Action",
                            ]
                            .map(String::from)
                            .to_vec(),
                            rows: rows
                                .iter()
                                .map(|r| {
                                    vec![
                                        r.source.clone(),
                                        r.destination.clone(),
                                        r.network.clone(),
                                        r.protocol.clone(),
                                        r.port.clone().unwrap_or_default(),
                                        format!("{:?}", r.action),
                                    ]
                                })
                                .collect(),
                        }),
                })
                .collect(),
        },
        Section {
            title: titles[4].into(),
            items: of("api")
                .into_iter()
                .map(|a| Item {
                    name: a.title.clone(),
                    source: std::fs::read_to_string(p.root.join(&a.path))
                        .map_err(|e| format!("{}: {e}", a.path))
                        .and_then(|x| export::api_rows(&x))
                        .map(|rows| Content::Table {
                            headers: ["Method", "Path", "Summary"].map(String::from).to_vec(),
                            rows,
                        }),
                })
                .collect(),
        },
    ]
}

/// The LikeC4 models and the draw.io boards. A PNG file of the same name next to the file is the
/// exported image and goes in. Without one, the item is a line with the path of the file.
fn other_views(p: &crate::design::Proj, arts: &[design::Artifact]) -> Vec<Item> {
    arts.iter()
        .filter(|a| a.kind == "model" || a.format.as_deref() == Some("drawio"))
        .map(|a| Item {
            name: a.title.clone(),
            source: Ok(
                std::fs::read(p.root.join(&a.path).with_extension("png")).map_or_else(
                    |_| Content::Markdown(format!("`{}`", a.path)),
                    Content::Image,
                ),
            ),
        })
        .collect()
}

/// The tables of a DBML file as a Markdown text, one heading and one table for each. A file with no
/// table keeps its text as a code block, so no source is lost.
fn dbml_markdown(text: &str) -> String {
    let tables = export::dbml_tables(text);
    if tables.is_empty() {
        return format!("```\n{text}\n```");
    }
    let cell = |s: &str| s.replace('|', "/");
    tables
        .iter()
        .map(|(name, rows)| {
            let mut md =
                format!("### {name}\n\n| Column | Type | Attributes |\n| --- | --- | --- |\n");
            for r in rows {
                md.push_str(&format!(
                    "| {} | {} | {} |\n",
                    cell(&r[0]),
                    cell(&r[1]),
                    cell(&r[2])
                ));
            }
            md
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The whole dossier from the project, with no help from the view (REQ-013, REQ-014). Seven
/// section titles: views, decisions, data models, flows, API contracts, personas and the
/// estimate annex. A person has a name and a role there and never a day rate. The annex holds
/// tasks and days. `views` are the architecture views that the view rendered as PNG when it could
/// (the C4 layout runs in the webview). With no view, the section lists the source of each C4
/// model instead, so the section is never empty while the project has a model.
pub fn export_dossier_complete(
    s: &AppState,
    t: &ExportText,
    views: &[ViewImage],
    path: &str,
    click: bool,
) -> Res<()> {
    let titles = named(&t.sections, 7)?;
    crate::reports::need_export_click(s, path, click)?;
    let p = project(s)?;
    let sections = dossier_complete_sections(s, &p, &titles, views)?;
    write_export(
        s,
        path,
        "docx",
        &docx_bytes(&meta(s, &p, t), &assemble(&meta(s, &p, t), &sections)).map_err(err)?,
    )
}

fn dossier_complete_sections(
    s: &AppState,
    p: &crate::design::Proj,
    titles: &[&str],
    views: &[ViewImage],
) -> Res<Vec<Section>> {
    let images = views.iter().map(view_item).collect();
    let mut sections = dossier_sections(p, &titles[..5], images);
    let people: Vec<Vec<String>> = shipyard_store::delivery_docs::personas(&p.root)
        .into_iter()
        .filter(|x| x.active)
        .map(|x| vec![x.name, x.description])
        .collect();
    sections.push(Section {
        title: titles[5].into(),
        items: if people.is_empty() {
            vec![]
        } else {
            vec![Item {
                name: titles[5].into(),
                source: Ok(Content::Table {
                    headers: ["Name", "Description"].map(String::from).to_vec(),
                    rows: people,
                }),
            }]
        },
    });
    sections.push(Section {
        title: titles[6].into(),
        items: crate::work::sheets_for_export(s)?
            .iter()
            .map(|(slug, sheet)| annex_item(slug, sheet.as_ref().map_err(Clone::clone)))
            .collect(),
    });
    Ok(sections)
}

/// The functional documentation: the specs, the design document, the screens and the estimate
/// annex (REQ-014). The annex holds tasks and days and no day rate.
pub fn export_functional(s: &AppState, t: &ExportText, path: &str) -> Res<()> {
    let titles = named(&t.sections, 4)?;
    let p = project(s)?;
    let (nodes, _) = with_index(s, |i| i.graph())?;
    let specs = nodes
        .iter()
        .filter(|n| n.kind == "spec" && !n.target.contains('#'))
        .filter_map(|n| {
            Some(read_item(
                &p,
                &n.title,
                n.location.as_ref()?,
                Content::Markdown,
            ))
        })
        .collect();
    let doc = design::design_doc_path(&p.file);
    let screens = match design::read_screens(&p.root, &p.file) {
        Ok(v) if v.is_empty() => vec![],
        Ok(v) => vec![Item {
            name: titles[2].into(),
            source: Ok(Content::Table {
                headers: ["Screen", "Slug"].map(String::from).to_vec(),
                rows: v.into_iter().map(|x| vec![x.title, x.slug]).collect(),
            }),
        }],
        Err(e) => vec![Item {
            name: titles[2].into(),
            source: Err(e),
        }],
    };
    let annex = crate::work::sheets_for_export(s)?
        .iter()
        .map(|(slug, sheet)| annex_item(slug, sheet.as_ref().map_err(Clone::clone)))
        .collect();
    let sections = vec![
        Section {
            title: titles[0].into(),
            items: specs,
        },
        Section {
            title: titles[1].into(),
            items: if p.root.join(&doc).exists() {
                vec![read_item(&p, &doc, &doc, Content::Markdown)]
            } else {
                vec![]
            },
        },
        Section {
            title: titles[2].into(),
            items: screens,
        },
        Section {
            title: titles[3].into(),
            items: annex,
        },
    ];
    write_export(
        s,
        path,
        "docx",
        &docx_bytes(&meta(s, &p, t), &assemble(&meta(s, &p, t), &sections)).map_err(err)?,
    )
}

#[derive(Debug, Clone, Deserialize, Type)]
pub struct SheetIn {
    pub name: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

/// A client deliverable as `.xlsx`: a cover and one worksheet for each part (REQ-016, Q-044
/// option 2: a security report has one worksheet for each scan).
pub fn export_sheet(s: &AppState, t: &ExportText, sheets: Vec<SheetIn>, path: &str) -> Res<()> {
    let p = project(s)?;
    let parts: Vec<SheetOut> = sheets
        .into_iter()
        .map(|x| SheetOut {
            name: x.name,
            headers: x.headers,
            rows: x.rows,
        })
        .collect();
    write_export(
        s,
        path,
        "xlsx",
        &export::xlsx_bytes(&meta(s, &p, t), &parts).map_err(err)?,
    )
}

/// An absolute path with the right extension, in a folder that exists. The write is atomic.
/// The path joins the exports (the person may reveal it) only after the write worked.
pub(crate) fn write_export(s: &AppState, path: &str, ext: &str, bytes: &[u8]) -> Res<()> {
    let p = std::path::PathBuf::from(path);
    if !p.is_absolute() || p.is_dir() {
        return Err("the path is not an absolute file path".into());
    }
    if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case(ext)) {
        return Err(format!("the file is not a .{ext} file"));
    }
    if !p.parent().is_some_and(Path::is_dir) {
        return Err("the folder of the path does not exist".into());
    }
    write_atomic(&p, bytes).map_err(err)?;
    s.exports().insert(path.into());
    Ok(())
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn export_diagrams_get(app: AppHandle) -> Api<Vec<DiagramSource>> {
    blocking(app, diagram_sources).await
}

#[tauri::command]
#[specta::specta]
pub async fn graph_get(app: AppHandle) -> Api<KGraph> {
    blocking(app, graph).await
}

#[tauri::command]
#[specta::specta]
pub async fn graph_code(app: AppHandle) -> Api<CodeGraph> {
    blocking(app, |s| {
        Ok(code_graph(s.agents.proxy.as_ref(), &project(s)?.root))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn graph_code_focus(app: AppHandle, file: String) -> Api<CodeGraph> {
    blocking(app, move |s| {
        code_focus(s.agents.proxy.as_ref(), &project(s)?.root, &file)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn graph_code_index(app: AppHandle) -> Api<()> {
    blocking(app, |s| {
        let out = code_index_run(s.agents.proxy.as_ref(), &project(s)?.root);
        // The server that the Index action added stays in the settings, also after an error.
        s.agents.mcp_save()?;
        out
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn explain_context_get(app: AppHandle, entity: String) -> Api<ExplainContext> {
    blocking(app, move |s| explain_context(s, &entity)).await
}

#[tauri::command]
#[specta::specta]
pub async fn doc_list_get(app: AppHandle) -> Api<DocList> {
    blocking(app, doc_list).await
}

#[tauri::command]
#[specta::specta]
pub async fn doc_read_one(app: AppHandle, path: String) -> Api<Text> {
    blocking(app, move |s| doc_read(s, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn doc_write_one(
    app: AppHandle,
    path: String,
    text: String,
    stamp: Option<String>,
    create: bool,
) -> Api<Written> {
    blocking(app, move |s| {
        doc_write(s, &path, &text, stamp.as_deref(), create)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn slide_theme_get(app: AppHandle) -> Api<ThemeView> {
    blocking(app, theme_get).await
}

#[tauri::command]
#[specta::specta]
pub async fn slide_theme_set(
    app: AppHandle,
    theme: DeckTheme,
    stamp: Option<String>,
) -> Api<Written> {
    blocking(app, move |s| theme_set(s, &theme, stamp.as_deref())).await
}

#[tauri::command]
#[specta::specta]
pub async fn slide_parse(text: String) -> kn::Deck {
    deck_parse(&text)
}

#[tauri::command]
#[specta::specta]
pub async fn dashboard_list_get(app: AppHandle) -> Api<Vec<DashEntry>> {
    blocking(app, dashboard_list).await
}

#[tauri::command]
#[specta::specta]
pub async fn dashboard_get_one(app: AppHandle, slug: String) -> Api<DashView> {
    blocking(app, move |s| dashboard_get(s, &slug)).await
}

#[tauri::command]
#[specta::specta]
pub async fn dashboard_save_one(
    app: AppHandle,
    slug: String,
    dashboard: Dashboard,
    stamp: Option<String>,
) -> Api<Written> {
    blocking(app, move |s| {
        dashboard_save(s, &slug, &dashboard, stamp.as_deref())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn dashboard_tile(app: AppHandle, kind: String) -> Api<TileData> {
    blocking(app, move |s| tile_data(s, &kind)).await
}

#[tauri::command]
#[specta::specta]
pub async fn learn_get(app: AppHandle) -> Api<Learn> {
    blocking(app, learn).await
}

#[tauri::command]
#[specta::specta]
pub async fn export_dossier_file(
    app: AppHandle,
    text: ExportText,
    views: Vec<ViewImage>,
    path: String,
) -> Api<()> {
    blocking(app, move |s| export_dossier(s, &text, &views, &path)).await
}

/// The dossier with every section gathered by the app. Seven titles in `text.sections`. It needs
/// the click of a person. `views` may be empty.
#[tauri::command]
#[specta::specta]
pub async fn export_dossier_complete_file(
    app: AppHandle,
    text: ExportText,
    views: Vec<ViewImage>,
    path: String,
    click: bool,
) -> Api<()> {
    blocking(app, move |s| {
        export_dossier_complete(s, &text, &views, &path, click)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn export_functional_file(app: AppHandle, text: ExportText, path: String) -> Api<()> {
    blocking(app, move |s| export_functional(s, &text, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn export_sheet_file(
    app: AppHandle,
    text: ExportText,
    sheets: Vec<SheetIn>,
    path: String,
) -> Api<()> {
    blocking(app, move |s| export_sheet(s, &text, sheets, &path)).await
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, SystemTime};

    use super::*;

    #[test]
    fn the_graph_name_follows_the_real_path_with_dashes_for_slashes_and_spaces() {
        assert_eq!(
            graph_project(Path::new("/no/such/My Projects/app")),
            "no-such-My-Projects-app"
        );
        let dir = tempfile::tempdir().unwrap();
        let link = dir.path().join("link");
        std::os::unix::fs::symlink(dir.path(), &link).unwrap();
        let real = dir.path().canonicalize().unwrap();
        assert_eq!(
            graph_project(&link),
            real.to_string_lossy().trim_matches('/').replace('/', "-")
        );
    }

    #[test]
    fn the_graph_rows_read_json_and_the_text_table() {
        let json_rows = json!({"rows": [["a", "x.rs", "b", "y.rs"]]});
        assert_eq!(graph_rows(&json_rows), [["a", "x.rs", "b", "y.rs"]]);
        let table = "rows: 2  (cols: a.name a.file_path b.name b.file_path)\n  \"\\\"copy-path\\\"\" src/a.tsx copyText src/lib/menus/index.ts\n  run \"src/my file.rs\" go src/b.rs\ntotal: 2\n";
        let result = json!({"content": [{"type": "text", "text": table}]});
        assert_eq!(
            graph_rows(&result),
            [
                [
                    "\"copy-path\"",
                    "src/a.tsx",
                    "copyText",
                    "src/lib/menus/index.ts"
                ],
                ["run", "src/my file.rs", "go", "src/b.rs"],
            ]
        );
    }
    use crate::commands::projects;

    fn write(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    fn setup() -> (tempfile::TempDir, tempfile::TempDir, AppState) {
        let repo = tempfile::tempdir().unwrap();
        shipyard_git::project::init(repo.path()).unwrap();
        write(
            repo.path(),
            "docs/decisions/0004-poll.md",
            "---\nstatus: accepted\n---\n# Polling\nbody\n",
        );
        write(
            repo.path(),
            "docs/openspec/specs/work/spec.md",
            "# Spec: work\nStatus: Draft\nCites adr:0004.\n### Glossary\n- run: one agent job\n",
        );
        write(repo.path(), "docs/models/core.c4", "model {}\n");
        let data = tempfile::tempdir().unwrap();
        let s = AppState::new(data.path().into());
        projects::open(&s, repo.path().to_str().unwrap()).unwrap();
        (repo, data, s)
    }

    fn old(root: &Path, rel: &str, secs: u64) {
        let f = std::fs::File::options()
            .write(true)
            .open(root.join(rel))
            .unwrap();
        f.set_modified(SystemTime::now() - Duration::from_secs(secs))
            .unwrap();
    }

    #[test]
    fn the_graph_marks_orphans_and_a_spec_older_than_its_adr() {
        let (repo, _d, s) = setup();
        old(repo.path(), "docs/openspec/specs/work/spec.md", 500);
        let g = graph(&s).unwrap();
        let node = |r: &str| g.nodes.iter().find(|n| n.target == r).unwrap();
        assert!(node("spec:work").stale && node("spec:work").orphan);
        assert!(!node("adr:0004").orphan && !node("adr:0004").stale);
        assert_eq!(g.edges.len(), 1);
    }

    #[test]
    fn explain_context_holds_the_entity_and_one_hop_and_flags_an_unknown_entity() {
        let (_r, _d, s) = setup();
        let c = explain_context(&s, "@adr:0004").unwrap();
        let refs: Vec<&str> = c.refs.iter().map(|r| r.target.as_str()).collect();
        assert!(c.found);
        assert_eq!(refs, ["adr:0004", "spec:work"]);
        let none = explain_context(&s, "adr:9999").unwrap();
        assert!(
            !none.found && none.refs.len() == 1,
            "no neighbour for an unknown entity"
        );
    }

    #[test]
    fn learn_orders_the_path_and_reads_the_glossary() {
        let (_r, _d, s) = setup();
        let l = learn(&s).unwrap();
        let steps: Vec<&str> = l.path.iter().map(|x| x.target.as_str()).collect();
        assert_eq!(steps, ["model:core", "adr:0004", "spec:work"]);
        assert_eq!(l.glossary[0].term, "run");
        assert_eq!(l.glossary[0].spec, "spec:work");
    }

    #[test]
    fn a_page_saves_after_a_changed_file_warning_and_only_below_the_handbook_folders() {
        let (repo, _d, s) = setup();
        let w = doc_write(&s, "docs/handbook/start.md", "# Start\n", None, true).unwrap();
        let stamp = w.stamp.unwrap();
        assert_eq!(doc_list(&s).unwrap().handbook[0].title, "Start");
        std::fs::write(
            repo.path().join("docs/handbook/start.md"),
            "# Edited on disk, longer\n",
        )
        .unwrap();
        let c = doc_write(
            &s,
            "docs/handbook/start.md",
            "# Mine\n",
            Some(&stamp),
            false,
        )
        .unwrap();
        assert!(c.conflict, "a changed file is not replaced");
        assert!(doc_write(&s, "docs/decisions/0004-poll.md", "x", None, false).is_err());
        assert!(doc_write(&s, "docs/handbook/x.html", "x", None, true).is_err());
        assert!(doc_write(&s, "docs/slides/x.html", "x", None, true).is_ok());
        assert!(doc_write(&s, "docs/handbook/../../x.md", "x", None, true).is_err());
    }

    fn dash(title: &str) -> Dashboard {
        Dashboard {
            title: title.into(),
            ..Dashboard::default()
        }
    }

    #[test]
    fn a_dashboard_saves_to_its_file_and_a_newer_file_is_not_replaced() {
        let (repo, _d, s) = setup();
        dashboard_save(&s, "team", &dash("Team"), None).unwrap();
        assert_eq!(dashboard_list(&s).unwrap()[0].title, "Team");
        let v = dashboard_get(&s, "team").unwrap();
        dashboard_save(&s, "team", &dash("Team 2"), Some(&v.stamp)).unwrap();
        write(
            repo.path(),
            "docs/dashboards/future.yaml",
            "version: 9\ntitle: Future\ntiles: []\n",
        );
        assert!(dashboard_get(&s, "future").unwrap().loaded.read_only);
        assert!(dashboard_save(&s, "future", &dash("Mine"), None).is_err());
        assert!(dashboard_save(&s, "../x", &dash("x"), None).is_err());
        let log = Command::new("git")
            .arg("-C")
            .arg(repo.path())
            .args(["log", "--oneline"])
            .output()
            .unwrap();
        assert!(
            String::from_utf8_lossy(&log.stdout).trim().is_empty(),
            "no commit"
        );
    }

    #[test]
    fn a_tile_shows_its_numbers_and_an_unavailable_source_is_named() {
        let (_r, _d, s) = setup();
        let t = tile_data(&s, "specs").unwrap();
        assert_eq!(t.rows, [["Draft", "1"]]);
        assert_eq!(
            tile_data(&s, "quality").unwrap().off.as_deref(),
            Some("quality")
        );
        assert!(tile_data(&s, "nope").is_err());
    }

    #[test]
    fn the_diagrams_of_the_project_are_its_mermaid_files_and_fenced_blocks() {
        let (repo, _out, s) = setup();
        write(
            repo.path(),
            "docs/diagrams/flow.mmd",
            "graph TD\n  A --> B\n",
        );
        write(repo.path(), "docs/diagrams/board.drawio", "<mxfile/>");
        write(
            repo.path(),
            "docs/handbook/start.md",
            "# Start\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n\n```rust\nfn x() {}\n```\n\n```mermaid\ngraph LR\n```\n",
        );
        let got = diagram_sources(&s).unwrap();
        let titles: Vec<_> = got.iter().map(|d| d.title.as_str()).collect();
        assert_eq!(titles, ["flow", "Start", "Start (2)"]);
        assert_eq!(got[0].source, "graph TD\n  A --> B\n");
        assert_eq!(got[1].source, "sequenceDiagram\n  A->>B: hi");
    }

    #[test]
    fn the_complete_dossier_gathers_every_section_and_holds_no_day_rate() {
        let (repo, out, s) = setup();
        write(
            repo.path(),
            "docs/data-models/shop.dbml",
            "Table orders {\n  id int [pk]\n  total int\n}\n",
        );
        write(
            repo.path(),
            "docs/personas/personas.json",
            r#"{"personas":[{"id":"p1","name":"Developer","description":"Builds","tjm":777,"cjm":555}]}"#,
        );
        let p = project(&s).unwrap();
        let titles = ["V", "D", "M", "F", "A", "P", "X"];
        let sections = dossier_complete_sections(&s, &p, &titles, &[]).unwrap();
        assert_eq!(sections.len(), 7);
        let md = |sec: usize| match &sections[sec].items[0].source {
            Ok(Content::Markdown(m)) => m.clone(),
            _ => panic!("section {sec} holds no Markdown"),
        };
        assert!(
            md(0).contains("docs/models/"),
            "no view: the model file is a one-line reference"
        );
        assert!(md(2).contains("### orders") && md(2).contains("| id | int | pk |"));
        let Ok(Content::Table { headers, rows }) = &sections[5].items[0].source else {
            panic!("no personas table")
        };
        assert_eq!(
            (headers.len(), rows[0].as_slice()),
            (
                2,
                ["Developer".to_string(), "Builds".to_string()].as_slice()
            )
        );
        assert!(!format!("{rows:?}").contains("777") && !format!("{rows:?}").contains("555"));
        let view = ViewImage {
            title: "Context".into(),
            png: String::new(),
            source: "graph TD".into(),
        };
        let with = dossier_complete_sections(&s, &p, &titles, &[view]).unwrap();
        assert_eq!(with[0].items.len(), 2, "the view, then the model line");
        assert_eq!(with[0].items[0].name, "Context");
        assert!(matches!(&with[0].items[0].source, Ok(Content::Code(c)) if c == "graph TD"));

        let file = out.path().join("full.docx");
        let t = ExportText {
            title: "Dossier".into(),
            empty: "Nothing".into(),
            gap: "Gap".into(),
            generated: "Generated".into(),
            contents: "Contents".into(),
            sections: titles.map(String::from).to_vec(),
        };
        let go = |click| export_dossier_complete(&s, &t, &[], file.to_str().unwrap(), click);
        assert!(go(false).unwrap_err().contains("click"));
        assert!(!file.exists());
        go(true).unwrap();
        assert!(std::fs::read(&file).unwrap().starts_with(b"PK"));
        let five = ExportText {
            sections: t.sections[..5].to_vec(),
            ..t.clone()
        };
        assert!(
            export_dossier_complete(&s, &five, &[], file.to_str().unwrap(), true).is_err(),
            "seven titles"
        );
    }

    #[test]
    fn exports_write_a_file_of_the_right_kind_and_refuse_a_bad_path() {
        let (_r, out, s) = setup();
        let t = ExportText {
            title: "Dossier".into(),
            empty: "Nothing".into(),
            gap: "Gap".into(),
            generated: "Generated".into(),
            contents: "Contents".into(),
            sections: ["A", "B", "C", "D", "E"].map(String::from).to_vec(),
        };
        let file = out.path().join("dossier.docx");
        export_dossier(&s, &t, &[], file.to_str().unwrap()).unwrap();
        assert!(std::fs::read(&file).unwrap().starts_with(b"PK"));
        assert!(
            export_dossier(&s, &t, &[], "dossier.docx").is_err(),
            "relative path"
        );
        assert!(export_dossier(&s, &t, &[], out.path().join("x.pdf").to_str().unwrap()).is_err());
        let four = ExportText {
            sections: t.sections[..4].to_vec(),
            ..t.clone()
        };
        assert!(
            export_dossier(&s, &four, &[], file.to_str().unwrap()).is_err(),
            "five titles"
        );
        let doc = out.path().join("functional.docx");
        export_functional(&s, &four, doc.to_str().unwrap()).unwrap();
        assert!(doc.exists());
        let book = out.path().join("deliverable.xlsx");
        let sheet = SheetIn {
            name: "Scan".into(),
            headers: vec!["A".into()],
            rows: vec![vec!["1".into()]],
        };
        export_sheet(&s, &t, vec![sheet], book.to_str().unwrap()).unwrap();
        assert!(book.exists());
    }

    #[test]
    fn index_on_a_server_that_is_off_follows_the_allow_list() {
        use shipyard_agents::mcp_control::{CustomInput, McpConfig, McpControl, ToolFilter};
        let dir = tempfile::tempdir().unwrap();
        let pids = dir.path().join("pids");
        shipyard_agents::fake::mcp_server(dir.path(), "fake-mcp", &pids);
        let control = McpControl::new(
            std::sync::Arc::new(shipyard_secrets::MemoryStore::default()),
            McpConfig::default(),
        )
        .with_dirs(vec![dir.path().into(), "/usr/bin".into(), "/bin".into()]);
        let input = CustomInput {
            name: format!("{CODE_SERVER} fake"),
            command: "fake-mcp".into(),
            ..Default::default()
        };
        let id = control.add_custom(input).unwrap().id;
        let proxy = Proxy::new(std::sync::Arc::new(control));
        let only = |t: &str| ToolFilter::Only {
            tools: vec![t.into()],
        };
        proxy.control().set_tool_filter(&id, only("other")).unwrap();
        let e = code_index_run(&proxy, dir.path()).unwrap_err();
        assert!(e.contains("allow list"), "{e}");
        proxy
            .control()
            .set_tool_filter(&id, ToolFilter::All)
            .unwrap();
        code_index_run(&proxy, dir.path()).unwrap();
    }

    #[test]
    fn the_graph_reads_through_a_server_that_is_off_and_stops_it_after() {
        use shipyard_agents::mcp_control::{CustomInput, McpConfig, McpControl, State};
        let dir = tempfile::tempdir().unwrap();
        let pids = dir.path().join("pids");
        shipyard_agents::fake::mcp_server(dir.path(), "fake-mcp", &pids);
        let control = McpControl::new(
            std::sync::Arc::new(shipyard_secrets::MemoryStore::default()),
            McpConfig::default(),
        )
        .with_dirs(vec![dir.path().into(), "/usr/bin".into(), "/bin".into()]);
        let input = CustomInput {
            name: format!("{CODE_SERVER} fake"),
            command: "fake-mcp".into(),
            ..Default::default()
        };
        let id = control.add_custom(input).unwrap().id;
        let proxy = Proxy::new(std::sync::Arc::new(control));
        assert!(!proxy.control().is_enabled(&id));
        // The server answers, so the state is not Off, and it is stopped again.
        let g = code_graph(&proxy, dir.path());
        assert_ne!(g.state, CodeState::Off);
        assert!(!matches!(proxy.control().state(&id), State::Running));
    }

    #[test]
    fn index_error_names_the_program_the_code_and_the_stderr_line() {
        use shipyard_agents::mcp_control::{CustomInput, McpConfig, McpControl};
        let dir = tempfile::tempdir().unwrap();
        shipyard_agents::fake::program(dir.path(), "fake-mcp", "echo 'no daemon' >&2\nexit 3");
        let control = McpControl::new(
            std::sync::Arc::new(shipyard_secrets::MemoryStore::default()),
            McpConfig::default(),
        )
        .with_dirs(vec![dir.path().into(), "/usr/bin".into(), "/bin".into()]);
        let input = CustomInput {
            name: format!("{CODE_SERVER} fake"),
            command: "fake-mcp".into(),
            ..Default::default()
        };
        control.add_custom(input).unwrap();
        let proxy = Proxy::new(std::sync::Arc::new(control));
        let e = code_index_run(&proxy, dir.path()).unwrap_err();
        assert!(
            e.contains("`fake-mcp` failed: exited with code 3: no daemon"),
            "{e}"
        );
        let app = crate::errors::AppError::from(e.as_str());
        assert_eq!(app.code, crate::errors::ErrorCode::ToolFailed);
    }

    #[test]
    fn index_adds_a_server_that_is_missing_and_names_a_missing_program() {
        use shipyard_agents::mcp_control::{McpConfig, McpControl};
        let dir = tempfile::tempdir().unwrap();
        let control = McpControl::new(
            std::sync::Arc::new(shipyard_secrets::MemoryStore::default()),
            McpConfig::default(),
        )
        .with_dirs(vec![dir.path().into()]);
        let proxy = Proxy::new(std::sync::Arc::new(control));
        let e = code_index_run(&proxy, dir.path()).unwrap_err();
        assert!(e.contains("codebase-memory-mcp is not installed"), "{e}");
        let rows = proxy.control().list();
        assert!(
            rows.iter()
                .any(|r| r.id.contains(CODE_SERVER) && !r.enabled)
        );
    }
}
