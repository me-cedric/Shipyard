//! Knowledge codecs: graph, pages, decks, theme and dashboards (spec `knowledge`, REQ-010, REQ-012,
//! REQ-017, REQ-018, REQ-022, REQ-025).

use std::fs;
use std::path::Path;

use shipyard_core::project::ProjectFile;
use shipyard_store::knowledge::{
    Dashboard, DeckTheme, Tile, check_writable, dashboard_text, deck_text, pages, parse_dashboard,
    parse_deck, parse_theme, theme_text,
};
use shipyard_store::ref_index::RefIndex;
use shipyard_store::ref_query::State;

fn write(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

#[test]
fn the_graph_holds_entities_and_the_citations_between_them() {
    let dir = tempfile::tempdir().unwrap();
    let r = dir.path();
    write(
        r,
        "docs/decisions/0004-x.md",
        "# Polling\nSee q:Q-001 and adr:0099.\n",
    );
    write(
        r,
        "docs/delivery/questions/Q-001.md",
        "---\nstatus: open\n---\n# Which?\n",
    );
    let mut i = RefIndex::open_memory().unwrap();
    i.sync_repo(r, &ProjectFile::new("S", "SHIP")).unwrap();
    let (nodes, edges) = i.graph().unwrap();
    let refs: Vec<&str> = nodes.iter().map(|n| n.target.as_str()).collect();
    assert_eq!(refs, ["adr:0004", "q:Q-001"], "the doc twins stay out");
    assert_eq!(nodes[1].kind, "q");
    assert_eq!(edges.len(), 1, "adr:0099 is not an entity, so no edge");
    assert_eq!(
        (edges[0].source.as_str(), edges[0].target.as_str()),
        ("adr:0004", "q:Q-001")
    );
}

#[test]
fn a_handbook_page_is_a_doc_entity_and_the_tree_lists_the_pages() {
    let dir = tempfile::tempdir().unwrap();
    let r = dir.path();
    write(r, "docs/handbook/start.md", "# Start here\nbody\n");
    write(r, "docs/handbook/ops/deploy.md", "no heading\n");
    write(r, "docs/handbook/logo.png", "x");
    let tree = pages(r, "docs/handbook");
    let got: Vec<_> = tree
        .iter()
        .map(|p| (p.path.as_str(), p.title.as_str()))
        .collect();
    assert_eq!(
        got,
        [
            ("docs/handbook/ops/deploy.md", "deploy"),
            ("docs/handbook/start.md", "Start here")
        ]
    );
    let mut i = RefIndex::open_memory().unwrap();
    i.sync_repo(r, &ProjectFile::new("S", "SHIP")).unwrap();
    let doc = i.resolve("doc:docs/handbook/start.md").unwrap().unwrap();
    assert_eq!(doc.state, State::Resolved);
    assert_eq!(doc.title.as_deref(), Some("Start here"));
}

#[test]
fn a_deck_splits_on_separators_outside_code_and_round_trips() {
    let text = "# Plan\nintro\n\n---\n\n## Two\n```\n---\n```\n\n---\n\n## Three\n";
    let d = parse_deck(text, "deck");
    assert_eq!(d.title, "Plan");
    assert_eq!(d.slides.len(), 3, "a separator in a fence is code");
    assert_eq!(parse_deck(&deck_text(&d), "deck"), d);
    assert_eq!(parse_deck("", "fallback").title, "fallback");
}

#[test]
fn the_theme_round_trips_and_refuses_a_bad_colour() {
    let t = DeckTheme {
        logo: Some("docs/slides/logo.svg".into()),
        ..DeckTheme::default()
    };
    let back = parse_theme(&theme_text(&t).unwrap()).unwrap();
    assert_eq!(back.value, t);
    assert!(!back.read_only);
    assert!(parse_theme("accent: red\n").is_err());
}

#[test]
fn a_dashboard_round_trips_and_checks_its_tiles() {
    let tile = |id: &str, kind: &str| Tile {
        id: id.into(),
        kind: kind.into(),
        x: 0,
        y: 1,
        w: 2,
        h: 3,
        title: String::new(),
    };
    let d = Dashboard {
        title: "Team".into(),
        tiles: vec![tile("a", "work"), tile("b", "runs")],
        ..Dashboard::default()
    };
    let back = parse_dashboard(&dashboard_text(&d).unwrap()).unwrap();
    assert_eq!(back.value, d);
    assert!(
        dashboard_text(&Dashboard {
            tiles: vec![tile("a", "nope")],
            ..d.clone()
        })
        .is_err()
    );
    assert!(
        dashboard_text(&Dashboard {
            tiles: vec![tile("a", "work"), tile("a", "runs")],
            ..d
        })
        .is_err()
    );
}

#[test]
fn a_file_of_a_newer_version_shows_and_stays_read_only() {
    let newer = "version: 9\ntitle: Future\ntiles: []\nlayout: grid\n";
    let l = parse_dashboard(newer).unwrap();
    assert!(l.read_only);
    assert_eq!(l.value.title, "Future");
    assert!(check_writable(Some(newer)).is_err());
    assert!(check_writable(Some("version: 1\ntitle: x\n")).is_ok());
    assert!(check_writable(None).is_ok());
    assert!(
        parse_theme("version: 3\ncolors: {a: b}\n")
            .unwrap()
            .read_only
    );
}

#[test]
fn a_tile_counts_what_the_index_holds_and_a_source_that_is_off_gives_none() {
    let dir = tempfile::tempdir().unwrap();
    let r = dir.path();
    for n in 1..=3 {
        write(
            r,
            &format!("docs/delivery/questions/Q-00{n}.md"),
            &format!(
                "---\nstatus: {}\n---\n# Q\n",
                if n == 1 { "answered" } else { "open" }
            ),
        );
    }
    let mut i = RefIndex::open_memory().unwrap();
    i.sync_repo(r, &ProjectFile::new("S", "SHIP")).unwrap();
    let (rows, cut) = i.tile_rows("questions").unwrap().unwrap();
    assert_eq!(rows, [("open".to_string(), 2), ("answered".to_string(), 1)]);
    assert!(!cut);
    assert!(i.tile_rows("quality").unwrap().is_none());
}
