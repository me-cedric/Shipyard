//! Settings / Connections, MCP servers: test one server or all, and the recommended set.
//!
//! A test starts the server if it is not running, asks for its tools and stops it again when the
//! test started it. The recommended set comes from the project: its stacks, its files and its
//! connections. Context7 is in every set.

use std::path::Path;
use std::time::Instant;

use serde::Serialize;
use serde_json::{Value, json};
use shipyard_agents::mcp_control::State;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking};
use crate::connections::ConnectionKind;
use crate::errors::AppError;
use crate::work::need_click;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct McpTest {
    pub id: String,
    pub ok: bool,
    /// The tool names that the server lists.
    pub tools: Vec<String>,
    pub error: Option<AppError>,
    pub elapsed_ms: u32,
}

/// The result of a `tools/list` answer.
pub fn outcome(id: &str, answer: Result<Value, String>, started: Instant) -> McpTest {
    let elapsed_ms = started.elapsed().as_millis().min(u128::from(u32::MAX)) as u32;
    match answer {
        Ok(v) => McpTest {
            id: id.into(),
            ok: true,
            tools: v["tools"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|t| t["name"].as_str().map(str::to_string))
                .collect(),
            error: None,
            elapsed_ms,
        },
        Err(e) => McpTest {
            id: id.into(),
            ok: false,
            tools: Vec::new(),
            error: Some(AppError::from(e)),
            elapsed_ms,
        },
    }
}

fn test_one(s: &AppState, id: &str) -> McpTest {
    let was_running = s.agents.mcp_state(id) == State::Running;
    let started = Instant::now();
    let answer = s
        .agents
        .mcp
        .request(id, "tools/list", json!({}))
        .map_err(|e| e.to_string());
    if !was_running {
        s.agents.mcp_stop(id);
    }
    outcome(id, answer, started)
}

/// What the project shows about itself.
#[derive(Debug, Default)]
pub struct Signals {
    pub stacks: Vec<String>,
    /// File names and extensions (`.tf`) found near the root.
    pub files: Vec<String>,
    pub trackers: Vec<ConnectionKind>,
}

/// The catalogue ids that suit the project, in a fixed order.
pub fn recommended(s: &Signals) -> Vec<String> {
    let has = |f: &str| s.files.iter().any(|x| x == f);
    let web = s
        .stacks
        .iter()
        .any(|x| x == "react-web" || x == "angular-web");
    let jira = s.trackers.iter().any(|k| {
        matches!(
            k,
            ConnectionKind::JiraCloud | ConnectionKind::JiraDataCenter
        )
    });
    [
        ("context7", true),
        ("playwright", web),
        ("chrome-devtools", web),
        ("jira", jira),
        ("terraform", has(".tf")),
        ("likec4", has(".c4") || has(".likec4")),
        ("figma", has(".fig")),
        ("sonarqube", has("sonar-project.properties")),
        ("semgrep", has(".semgrep.yml")),
    ]
    .iter()
    .filter(|(_, on)| *on)
    .map(|(id, _)| id.to_string())
    .collect()
}

/// The names and extensions of the files, three folders deep. Hidden folders, `node_modules` and
/// `target` are skipped.
fn files_near(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![(root.to_path_buf(), 0)];
    while let Some((dir, depth)) = stack.pop() {
        for e in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let Ok(t) = e.file_type() else { continue };
            if t.is_dir() {
                let skip = name.starts_with('.') || name == "node_modules" || name == "target";
                if depth < 3 && !skip {
                    stack.push((e.path(), depth + 1));
                }
            } else if t.is_file() {
                if let Some(ext) = name.rfind('.').map(|i| name[i..].to_string()) {
                    out.push(ext);
                }
                out.push(name);
            }
            // shortcut: a large tree stops here; enough for the root markers.
            if out.len() > 20_000 {
                return out;
            }
        }
    }
    out
}

fn signals(s: &AppState) -> Signals {
    let root = crate::design::project(s).ok().map(|p| p.root);
    Signals {
        stacks: root
            .as_deref()
            .map(shipyard_store::compass::detect_stacks)
            .unwrap_or_default(),
        files: root.as_deref().map(files_near).unwrap_or_default(),
        trackers: s
            .connections
            .list()
            .unwrap_or_default()
            .into_iter()
            .map(|c| c.kind)
            .collect(),
    }
}

fn recommended_ids(s: &AppState) -> Vec<String> {
    let known: Vec<String> = s.agents.mcp_list().into_iter().map(|r| r.id).collect();
    recommended(&signals(s))
        .into_iter()
        .filter(|id| known.contains(id))
        .collect()
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_test(app: AppHandle, id: String) -> Api<McpTest> {
    blocking(app, move |s| Ok(test_one(s, &id))).await
}

/// Tests each enabled server at the same time. One result for each server.
#[tauri::command]
#[specta::specta]
pub async fn mcp_test_all(app: AppHandle) -> Api<Vec<McpTest>> {
    blocking(app, |s| {
        let ids: Vec<String> = s
            .agents
            .mcp_list()
            .into_iter()
            .filter(|r| r.enabled)
            .map(|r| r.id)
            .collect();
        Ok(std::thread::scope(|scope| {
            let jobs: Vec<_> = ids
                .iter()
                .map(|id| scope.spawn(move || test_one(s, id)))
                .collect();
            jobs.into_iter()
                .zip(&ids)
                .map(|(j, id)| {
                    j.join().unwrap_or_else(|_| {
                        outcome(id, Err("the test stopped".into()), Instant::now())
                    })
                })
                .collect()
        }))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_recommended(app: AppHandle) -> Api<Vec<String>> {
    blocking(app, |s| Ok(recommended_ids(s))).await
}

/// Switches on each recommended server that is off. Returns the ids that it switched on.
#[tauri::command]
#[specta::specta]
pub async fn mcp_recommended_enable(app: AppHandle, click: bool) -> Api<Vec<String>> {
    blocking(app, move |s| -> Res<Vec<String>> {
        need_click(s, click)?;
        let rows = s.agents.mcp_list();
        let mut done = Vec::new();
        for id in recommended_ids(s) {
            if rows.iter().any(|r| r.id == id && !r.enabled) {
                s.agents.mcp_enable(&id, true)?;
                done.push(id);
            }
        }
        Ok(done)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_test_lists_the_tools_or_gives_a_coded_error() {
        let ok = outcome(
            "ctx",
            Ok(json!({ "tools": [{ "name": "resolve" }, { "name": "docs" }] })),
            Instant::now(),
        );
        assert!(ok.ok);
        assert_eq!(ok.tools, vec!["resolve", "docs"]);
        let bad = outcome("ctx", Err("network error: refused".into()), Instant::now());
        assert!(!bad.ok);
        assert_eq!(
            bad.error.unwrap().code,
            crate::errors::ErrorCode::ForgeUnreachable
        );
    }

    #[test]
    fn the_recommended_set_follows_the_project() {
        assert_eq!(recommended(&Signals::default()), vec!["context7"]);
        let s = Signals {
            stacks: vec!["react-web".into()],
            files: vec![".tf".into(), "sonar-project.properties".into()],
            trackers: vec![ConnectionKind::JiraCloud],
        };
        assert_eq!(
            recommended(&s),
            vec![
                "context7",
                "playwright",
                "chrome-devtools",
                "jira",
                "terraform",
                "sonarqube"
            ]
        );
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("infra")).unwrap();
        std::fs::write(dir.path().join("infra/main.tf"), "").unwrap();
        std::fs::create_dir_all(dir.path().join("node_modules/x")).unwrap();
        std::fs::write(dir.path().join("node_modules/x/a.fig"), "").unwrap();
        let files = files_near(dir.path());
        assert!(files.contains(&".tf".to_string()));
        assert!(!files.contains(&".fig".to_string()));
    }
}
