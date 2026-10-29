//! The code graph through a fake codebase-memory server (spec `knowledge`, REQ-002, REQ-008).

use std::path::Path;
use std::sync::Mutex;

use serde_json::{Value, json};
use shipyard_app::knowledge::{CodeSource, CodeState, code_graph, code_index};

/// Answers `query_graph` with canned rows and records every call.
struct Fake {
    answer: Result<Value, String>,
    calls: Mutex<Vec<(String, Value)>>,
}

impl Fake {
    fn new(answer: Result<Value, String>) -> Self {
        Self {
            answer,
            calls: Mutex::new(Vec::new()),
        }
    }
}

impl CodeSource for Fake {
    fn call(&self, tool: &str, args: Value) -> Result<Value, String> {
        self.calls.lock().unwrap().push((tool.into(), args));
        self.answer.clone()
    }
}

/// The shape of an MCP tool result: the JSON sits in a text block.
fn text_result(v: Value) -> Value {
    json!({ "content": [{ "type": "text", "text": v.to_string() }] })
}

const ROOT: &str = "/Users/me/Projects/Shipyard";

#[test]
fn calls_become_symbol_and_file_nodes_with_edges() {
    let fake = Fake::new(Ok(text_result(json!({
        "columns": ["a.name", "a.file_path", "b.name", "b.file_path"],
        "rows": [
            ["run", "src/a.rs", "log", "src/b.rs"],
            ["run", "src/a.rs", "log", "src/b.rs"],
            ["log", "src/b.rs", "write", "src/b.rs"],
            ["bad row"]
        ]
    }))));
    let g = code_graph(&fake, Path::new(ROOT));
    assert_eq!(g.state, CodeState::Ready);
    let ids: Vec<&str> = g.nodes.iter().map(|n| n.target.as_str()).collect();
    assert_eq!(
        ids,
        [
            "src/a.rs",
            "src/a.rs::run",
            "src/b.rs",
            "src/b.rs::log",
            "src/b.rs::write"
        ]
    );
    assert_eq!(g.nodes[0].kind, "file");
    assert_eq!(g.nodes[1].kind, "symbol");
    let has = |s: &str, t: &str| g.edges.iter().any(|e| e.source == s && e.target == t);
    assert!(has("src/a.rs::run", "src/b.rs::log"), "a call");
    assert!(has("src/a.rs", "src/a.rs::run"), "a file holds its symbol");
    let mut one = g.edges.clone();
    one.dedup();
    assert_eq!(one.len(), g.edges.len(), "no repeated edge");
    let calls = fake.calls.lock().unwrap();
    assert_eq!(calls[0].0, "query_graph");
    assert_eq!(calls[0].1["project"], "Users-me-Projects-Shipyard");
}

#[test]
fn a_project_with_no_index_gives_the_unindexed_state() {
    let fake = Fake::new(Ok(text_result(json!({ "columns": [], "rows": [] }))));
    let g = code_graph(&fake, Path::new(ROOT));
    assert_eq!(g.state, CodeState::Unindexed);
    assert!(g.nodes.is_empty() && g.edges.is_empty());
}

#[test]
fn a_server_that_is_off_gives_the_off_state() {
    let fake = Fake::new(Err("the codebase-memory server is not active".into()));
    assert_eq!(code_graph(&fake, Path::new(ROOT)).state, CodeState::Off);
}

#[test]
fn the_index_action_asks_the_server_to_index_the_folder() {
    let fake = Fake::new(Ok(json!({})));
    code_index(&fake, Path::new(ROOT)).unwrap();
    let calls = fake.calls.lock().unwrap();
    assert_eq!(calls[0].0, "index_repository");
    assert_eq!(calls[0].1["repo_path"], ROOT);
    let off = Fake::new(Err("down".into()));
    assert_eq!(code_index(&off, Path::new(ROOT)), Err("down".into()));
}
