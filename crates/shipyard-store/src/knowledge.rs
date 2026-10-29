//! Knowledge on disk (spec `knowledge`): the graph of the ref index, handbook pages, decks, the
//! deck theme and dashboards. A file that a newer version wrote opens read-only and is never
//! overwritten (REQ-022).

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::Result;
use crate::ref_index::RefIndex;
use crate::repo_scan::{file_stem, title_of, walk};

// ---------------------------------------------------------------- graph

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    #[serde(rename = "ref")]
    pub target: String,
    pub kind: String,
    pub title: String,
    pub status: Option<String>,
    /// Repository path of the file of the entity.
    pub location: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
}

impl RefIndex {
    /// Every entity that shows in search and each citation between two of them (REQ-001). A
    /// citation of an unknown target is not an edge. A `doc:` twin of a better entity is left out.
    pub fn graph(&self) -> Result<(Vec<GraphNode>, Vec<GraphEdge>)> {
        let mut st = self.conn.prepare(
            "SELECT ref, kind, title, status, location FROM entities WHERE hidden = 0
             GROUP BY ref ORDER BY ref",
        )?;
        let nodes: Vec<GraphNode> = st
            .query_map([], |r| {
                Ok(GraphNode {
                    target: r.get(0)?,
                    kind: r.get(1)?,
                    title: r.get(2)?,
                    status: r.get(3)?,
                    location: r.get(4)?,
                })
            })?
            .collect::<std::result::Result<_, _>>()?;
        let mut st = self.conn.prepare(
            "SELECT DISTINCT source, target FROM citations
             WHERE source != target
               AND source IN (SELECT ref FROM entities WHERE hidden = 0)
               AND target IN (SELECT ref FROM entities WHERE hidden = 0)
             ORDER BY source, target",
        )?;
        let edges = st
            .query_map([], |r| {
                Ok(GraphEdge {
                    source: r.get(0)?,
                    target: r.get(1)?,
                })
            })?
            .collect::<std::result::Result<_, _>>()?;
        Ok((nodes, edges))
    }
}

/// The most rows that a tile shows. A longer answer is cut and says so.
pub const TILE_ROWS: usize = 50;

/// The rows of a tile and whether the answer was cut.
pub type TileRows = (Vec<(String, u32)>, bool);

impl RefIndex {
    /// The rows of a tile: a label and a count (REQ-023). The data is what the index already
    /// holds. `None` when the source of the kind is not available. The flag is set when the
    /// answer was cut at `TILE_ROWS`.
    pub fn tile_rows(&self, kind: &str) -> Result<Option<TileRows>> {
        let (label, filter) = match kind {
            "work" => ("COALESCE(status, '-')", "kind = 'wi'"),
            "runs" => (
                "COALESCE(status, '-')",
                "kind = 'run' AND ref NOT LIKE '%/%'",
            ),
            "questions" => ("COALESCE(status, '-')", "kind = 'q'"),
            "specs" => (
                "COALESCE(status, '-')",
                "kind = 'spec' AND ref NOT LIKE '%#%'",
            ),
            "estimates" => (
                "substr(ref, 1, instr(ref, '#') - 1)",
                "kind = 'est' AND ref LIKE '%#%'",
            ),
            _ => return Ok(None),
        };
        let mut st = self.conn.prepare(&format!(
            "SELECT {label} AS l, COUNT(DISTINCT ref) FROM entities WHERE {filter}
             GROUP BY l ORDER BY COUNT(DISTINCT ref) DESC, l LIMIT {}",
            TILE_ROWS + 1
        ))?;
        let mut rows: Vec<(String, u32)> = st
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<_, _>>()?;
        let cut = rows.len() > TILE_ROWS;
        rows.truncate(TILE_ROWS);
        Ok(Some((rows, cut)))
    }
}

// ---------------------------------------------------------------- pages

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct PageEntry {
    /// Repository path. The ref is `doc:<path>`.
    pub path: String,
    pub title: String,
}

/// The Markdown files below `dir`, sorted by path (REQ-010). The tree is the path.
pub fn pages(root: &Path, dir: &str) -> Vec<PageEntry> {
    walk(root, &[dir.to_string()])
        .into_iter()
        .filter(|f| f.rel.ends_with(".md"))
        .map(|f| {
            let title = std::fs::read_to_string(root.join(&f.rel))
                .ok()
                .and_then(|t| title_of(&t))
                .unwrap_or_else(|| file_stem(&f.rel).into());
            PageEntry { path: f.rel, title }
        })
        .collect()
}

// ---------------------------------------------------------------- decks

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Deck {
    pub title: String,
    pub slides: Vec<String>,
}

/// A deck is Markdown. A line of `---` outside a code fence starts a new slide.
pub fn parse_deck(text: &str, fallback_title: &str) -> Deck {
    let mut slides = vec![String::new()];
    let mut fenced = false;
    for line in text.lines() {
        if line.trim_start().starts_with("```") {
            fenced = !fenced;
        }
        if !fenced && line.trim_end() == "---" {
            slides.push(String::new());
            continue;
        }
        let cur = slides.last_mut().expect("one slide");
        cur.push_str(line);
        cur.push('\n');
    }
    let slides: Vec<String> = slides
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let title = slides
        .iter()
        .find_map(|s| title_of(s))
        .unwrap_or_else(|| fallback_title.into());
    Deck { title, slides }
}

pub fn deck_text(d: &Deck) -> String {
    format!("{}\n", d.slides.join("\n\n---\n\n"))
}

// ---------------------------------------------------------------- versioned files

/// The version that this code writes for the theme and for dashboards.
pub const VERSION: u32 = 1;

/// A file value. `read_only` is set when a newer version wrote the file: show it, never write it.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Loaded<T> {
    pub value: T,
    pub read_only: bool,
}

fn load<T: Default + for<'de> Deserialize<'de>>(text: &str) -> Result<Loaded<T>> {
    let raw: serde_yaml::Value = serde_yaml::from_str(text)?;
    let version = raw
        .get("version")
        .and_then(serde_yaml::Value::as_u64)
        .unwrap_or(1);
    if version > u64::from(VERSION) {
        // Best effort: a shape that this code does not know shows as an empty value.
        let value = serde_yaml::from_value(raw).unwrap_or_default();
        return Ok(Loaded {
            value,
            read_only: true,
        });
    }
    Ok(Loaded {
        value: serde_yaml::from_value(raw)?,
        read_only: false,
    })
}

/// Refuses to replace a file that a newer version wrote.
pub fn check_writable(existing: Option<&str>) -> Result<()> {
    match existing.map(load::<serde_yaml::Value>) {
        Some(Ok(l)) if l.read_only => Err("the file was written by a newer version".into()),
        _ => Ok(()),
    }
}

// ---------------------------------------------------------------- theme

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(default)]
pub struct DeckTheme {
    pub version: u32,
    pub background: String,
    pub text: String,
    pub accent: String,
    /// Repository path of the logo.
    pub logo: Option<String>,
    pub font: String,
}

impl Default for DeckTheme {
    fn default() -> Self {
        Self {
            version: VERSION,
            background: "#ffffff".into(),
            text: "#1a1a1a".into(),
            accent: "#2563eb".into(),
            logo: None,
            font: "system-ui".into(),
        }
    }
}

fn color(s: &str) -> bool {
    s.strip_prefix('#')
        .is_some_and(|h| matches!(h.len(), 3 | 6) && h.bytes().all(|b| b.is_ascii_hexdigit()))
}

pub fn parse_theme(text: &str) -> Result<Loaded<DeckTheme>> {
    let l = load::<DeckTheme>(text)?;
    if !l.read_only {
        for c in [&l.value.background, &l.value.text, &l.value.accent] {
            if !color(c) {
                return Err(format!("not a colour: {c}").into());
            }
        }
    }
    Ok(l)
}

pub fn theme_text(t: &DeckTheme) -> Result<String> {
    Ok(serde_yaml::to_string(&DeckTheme {
        version: VERSION,
        ..t.clone()
    })?)
}

// ---------------------------------------------------------------- dashboards

/// The fixed catalogue of tiles (REQ-023). Each tile reads data that the project holds.
pub const TILES: [&str; 7] = [
    "work",
    "runs",
    "questions",
    "specs",
    "estimates",
    "quality",
    "impact",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Tile {
    pub id: String,
    pub kind: String,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(default)]
pub struct Dashboard {
    pub version: u32,
    pub title: String,
    pub tiles: Vec<Tile>,
}

impl Default for Dashboard {
    fn default() -> Self {
        Self {
            version: VERSION,
            title: String::new(),
            tiles: Vec::new(),
        }
    }
}

pub fn parse_dashboard(text: &str) -> Result<Loaded<Dashboard>> {
    load(text)
}

/// The file text. A tile of an unknown kind or a repeated id is an error.
pub fn dashboard_text(d: &Dashboard) -> Result<String> {
    let mut seen = BTreeMap::new();
    for t in &d.tiles {
        if !TILES.contains(&t.kind.as_str()) {
            return Err(format!("unknown tile: {}", t.kind).into());
        }
        if seen.insert(&t.id, ()).is_some() {
            return Err(format!("tile id used twice: {}", t.id).into());
        }
    }
    Ok(serde_yaml::to_string(&Dashboard {
        version: VERSION,
        ..d.clone()
    })?)
}
