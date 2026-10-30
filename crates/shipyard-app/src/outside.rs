//! The Shipyard MCP server for agents that Shipyard did not start (Settings / Connections / MCP).
//! Source: Legacy `application/mcp/mcpwiring.rs` and the `set_legacy_mcp_*` commands. The tools are
//! `shipyard_mcp::outside`; this module keeps the switches in `mcp-outside.json`, runs the loopback
//! server, writes the entry of an agent's `.mcp.json`, and lists the servers that other tools use.
//!
//! The token is 64 hex characters in `mcp-outside.token` (mode `0600`), made once. The `.mcp.json`
//! entry reads it from `${SHIPYARD_MCP_TOKEN}`: no secret goes in a file of the project.
//!
//! shortcut: the tools work on the open project at the time of the call. One server for the app.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_mcp::outside::{self, Outside, Switches};
use shipyard_mcp::server::Server;
use shipyard_mcp::session::Binding;
use shipyard_mcp::tools::agent::{AgentEvent, AgentEvents};
use shipyard_mcp::transport::Http;
use shipyard_store::project::write_atomic;
use specta::Type;

use crate::agents::{McpCustom, McpEnv};
use crate::commands::{AppState, Res, blocking, err};

const FILE: &str = "mcp-outside.json";
const TOKEN_FILE: &str = "mcp-outside.token";
const DEFAULT_PORT: u16 = 47821;

/// The switches of the outside server. Each group is off until the person turns it on.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct McpGates {
    pub enabled: bool,
    pub reads: bool,
    pub writes: bool,
    pub git: bool,
    pub forge: bool,
    pub exec: bool,
    pub delivery: bool,
    pub port: u16,
    /// When it is not empty, only these tools run.
    pub allowed_tools: Vec<String>,
}

impl Default for McpGates {
    fn default() -> Self {
        Self {
            enabled: false,
            reads: false,
            writes: false,
            git: false,
            forge: false,
            exec: false,
            delivery: false,
            port: DEFAULT_PORT,
            allowed_tools: Vec::new(),
        }
    }
}

impl McpGates {
    fn switches(&self) -> Switches {
        Switches {
            reads: self.reads,
            writes: self.writes,
            git: self.git,
            forge: self.forge,
            exec: self.exec,
            delivery: self.delivery,
        }
    }
}

/// What Settings shows.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct McpOutside {
    pub gates: McpGates,
    pub running: bool,
    pub url: String,
    /// Why the server does not run, when it is turned on.
    pub error: String,
    /// Every tool name, and the ones that are on.
    pub tools: Vec<String>,
    pub active: Vec<String>,
}

struct Live {
    // Dropping it stops the listener.
    http: Http,
}

static LIVE: Mutex<Option<Live>> = Mutex::new(None);
static ERROR: Mutex<String> = Mutex::new(String::new());

struct NoRun;
impl AgentEvents for NoRun {
    fn emit(&self, _: &Binding, _: AgentEvent) -> Result<Value, String> {
        Err("no run".into())
    }
}

pub fn gates(dir: &Path) -> McpGates {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn token(dir: &Path) -> Option<String> {
    std::fs::read_to_string(dir.join(TOKEN_FILE))
        .ok()
        .map(|t| t.trim().to_string())
        .filter(|t| t.len() >= 64)
}

fn write_token(path: &Path, token: &str) -> std::io::Result<()> {
    use std::io::Write;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    // `mode` applies at creation only: a stale temp file would keep its mode.
    let _ = std::fs::remove_file(&tmp);
    let mut o = std::fs::OpenOptions::new();
    o.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut o, 0o600);
    o.open(&tmp)?.write_all(token.as_bytes())?;
    std::fs::rename(tmp, path)
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Start or stop the server so that it matches `g`. Called at app start and after a change.
pub fn apply(dir: &Path, g: &McpGates) {
    *lock(&LIVE) = None;
    lock(&ERROR).clear();
    if !g.enabled {
        return;
    }
    if let Err(why) = start(dir, g) {
        *lock(&ERROR) = why;
    }
}

fn start(dir: &Path, g: &McpGates) -> Result<(), String> {
    let (switches, only, dir_of) = (g.switches(), g.allowed_tools.clone(), dir.to_path_buf());
    let server = Server::new(Arc::new(NoRun)).with_outside(move || {
        let reg = shipyard_store::project::Registry::load(&dir_of).ok()?;
        let e = reg.active()?;
        Some(Outside {
            root: PathBuf::from(&e.path),
            switches,
            only: only.clone(),
            read_only: e.overrides.read_only == Some(true),
        })
    });
    let binding = Binding {
        run: "outside".into(),
        step: "outside".into(),
        tools: outside::NAMES.iter().map(|n| n.to_string()).collect(),
    };
    match token(dir) {
        Some(t) => {
            server.sessions().open_known(&t, binding)?;
        }
        None => {
            let (t, _) = server.sessions().open(binding).map_err(err)?;
            write_token(&dir.join(TOKEN_FILE), &t).map_err(err)?;
        }
    }
    let http =
        Http::start(Arc::new(server), g.port).map_err(|e| format!("port {}: {e}", g.port))?;
    *lock(&LIVE) = Some(Live { http });
    Ok(())
}

/// Start the server at app start when the person turned it on.
pub fn start_saved(s: &AppState) {
    apply(&s.dir, &gates(&s.dir));
}

pub fn status(s: &AppState) -> McpOutside {
    let g = gates(&s.dir);
    let live = lock(&LIVE);
    let o = Outside {
        root: PathBuf::new(),
        switches: g.switches(),
        only: g.allowed_tools.clone(),
        read_only: false,
    };
    McpOutside {
        running: live.is_some(),
        url: live.as_ref().map(|l| l.http.url()).unwrap_or_default(),
        error: lock(&ERROR).clone(),
        tools: outside::NAMES.iter().map(|n| n.to_string()).collect(),
        active: outside::enabled(&o).into_iter().map(String::from).collect(),
        gates: g,
    }
}

pub fn gates_set(s: &AppState, g: McpGates) -> Res<McpOutside> {
    if g.port < 1024 {
        return Err("the port must be 1024 or more".into());
    }
    if let Some(bad) = g
        .allowed_tools
        .iter()
        .find(|t| !outside::NAMES.contains(&t.as_str()))
    {
        return Err(format!("unknown tool: {bad}"));
    }
    {
        let _g = s.guard();
        let text = serde_json::to_vec_pretty(&g).map_err(err)?;
        write_atomic(&s.dir.join(FILE), &text).map_err(err)?;
    }
    apply(&s.dir, &g);
    Ok(status(s))
}

/// Add the Shipyard entry to `<root>/.mcp.json`, and keep every other entry. Returns the path.
fn wire_into(root: &Path, url: &str) -> Res<String> {
    let path = root.join(".mcp.json");
    let mut doc: Value = match std::fs::read_to_string(&path) {
        Ok(t) => {
            serde_json::from_str(&t).map_err(|e| format!(".mcp.json is not valid JSON: {e}"))?
        }
        Err(_) => json!({}),
    };
    let servers = doc
        .as_object_mut()
        .ok_or(".mcp.json is not an object")?
        .entry("mcpServers")
        .or_insert_with(|| json!({}));
    servers.as_object_mut().ok_or("mcpServers is not an object")?.insert(
        "shipyard".into(),
        json!({ "type": "http", "url": url, "headers": { "Authorization": "Bearer ${SHIPYARD_MCP_TOKEN}" } }),
    );
    let text = serde_json::to_vec_pretty(&doc).map_err(err)?;
    write_atomic(&path, &text).map_err(err)?;
    Ok(path.to_string_lossy().into_owned())
}

pub fn wire(s: &AppState) -> Res<String> {
    let url = lock(&LIVE)
        .as_ref()
        .ok_or("turn the server on first")?
        .http
        .url();
    let root = PathBuf::from(&s.registry()?.active().ok_or("no active project")?.path);
    wire_into(&root, &url)
}

/// A server that another tool runs.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Elsewhere {
    pub source: String,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    /// The names of the variables only: a value never reaches the view.
    pub env_keys: Vec<String>,
}

fn parse(source: &str, text: &str) -> Vec<(Elsewhere, Vec<(String, String)>)> {
    let Ok(doc) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(map) = doc.get("mcpServers").and_then(Value::as_object) else {
        return Vec::new();
    };
    map.iter()
        .filter(|(name, _)| name.as_str() != "shipyard")
        .filter_map(|(name, v)| {
            let command = v["command"].as_str().or(v["url"].as_str())?.to_string();
            let args = v["args"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let env: Vec<(String, String)> = v["env"]
                .as_object()
                .map(|o| {
                    o.iter()
                        .filter_map(|(k, x)| Some((k.clone(), x.as_str()?.to_string())))
                        .collect()
                })
                .unwrap_or_default();
            let e = Elsewhere {
                source: source.into(),
                name: name.clone(),
                command,
                args,
                env_keys: env.iter().map(|(k, _)| k.clone()).collect(),
            };
            Some((e, env))
        })
        .collect()
}

fn config_files(s: &AppState) -> Vec<(String, PathBuf)> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_default();
    let mut files = vec![
        ("Claude Code".to_string(), home.join(".claude.json")),
        (
            "Claude Desktop".to_string(),
            home.join("Library/Application Support/Claude/claude_desktop_config.json"),
        ),
        (
            "Claude Desktop".to_string(),
            home.join(".config/Claude/claude_desktop_config.json"),
        ),
    ];
    if let Ok(reg) = s.registry()
        && let Some(e) = reg.active()
    {
        files.push((
            ".mcp.json".to_string(),
            PathBuf::from(&e.path).join(".mcp.json"),
        ));
    }
    files
}

fn elsewhere_all(s: &AppState) -> Vec<(Elsewhere, Vec<(String, String)>)> {
    config_files(s)
        .into_iter()
        .filter_map(|(label, path)| Some(parse(&label, &std::fs::read_to_string(path).ok()?)))
        .flatten()
        .collect()
}

pub fn elsewhere_list(s: &AppState) -> Vec<Elsewhere> {
    elsewhere_all(s).into_iter().map(|(e, _)| e).collect()
}

/// Copy a server of another tool into the custom servers. Its variables go to the keychain.
pub fn elsewhere_import(s: &AppState, source: &str, name: &str) -> Res<String> {
    let (e, env) = elsewhere_all(s)
        .into_iter()
        .find(|(e, _)| e.source == source && e.name == name)
        .ok_or("the server is gone from that file")?;
    s.agents.mcp_add_custom(McpCustom {
        id: None,
        name: e.name,
        description: format!("Imported from {}", e.source),
        command: e.command,
        args: e.args,
        env: env
            .into_iter()
            .map(|(key, value)| McpEnv { key, value })
            .collect(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_outside_get(app: tauri::AppHandle) -> Res<McpOutside> {
    blocking(app, |s| Ok(status(s))).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_outside_set(app: tauri::AppHandle, gates: McpGates) -> Res<McpOutside> {
    blocking(app, move |s| gates_set(s, gates)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_outside_wire(app: tauri::AppHandle) -> Res<String> {
    blocking(app, wire).await
}

/// The token that an agent sends. It is the person's own secret, shown only to copy.
#[tauri::command]
#[specta::specta]
pub async fn mcp_outside_token(app: tauri::AppHandle) -> Res<String> {
    blocking(app, |s| {
        token(&s.dir).ok_or_else(|| "turn the server on first".to_string())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_elsewhere_list(app: tauri::AppHandle) -> Res<Vec<Elsewhere>> {
    blocking(app, |s| Ok(elsewhere_list(s))).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_elsewhere_import(
    app: tauri::AppHandle,
    source: String,
    name: String,
) -> Res<String> {
    blocking(app, move |s| elsewhere_import(s, &source, &name)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn the_token_file_is_private_from_its_creation() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t");
        std::fs::write(path.with_extension("tmp"), "old").unwrap();
        write_token(&path, "secret").unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "secret");
    }

    #[test]
    fn other_configs_list_without_values_and_skip_shipyard_itself() {
        let text = r#"{"mcpServers":{
            "git":{"command":"uvx","args":["mcp-server-git"],"env":{"TOKEN":"s3cret"}},
            "web":{"url":"https://x.dev/mcp"},
            "shipyard":{"url":"http://127.0.0.1:1/mcp"},
            "bad":{"args":[]}}}"#;
        let got = parse("Claude Code", text);
        let names: Vec<_> = got.iter().map(|(e, _)| e.name.as_str()).collect();
        assert_eq!(names, ["git", "web"]);
        assert_eq!(got[0].0.env_keys, ["TOKEN"]);
        assert!(!format!("{:?}", got[0].0).contains("s3cret"));
        assert_eq!(got[1].0.command, "https://x.dev/mcp");
        assert!(parse("x", "not json").is_empty());
    }

    #[test]
    fn wiring_keeps_other_servers_and_never_writes_the_token() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(".mcp.json"),
            r#"{"mcpServers":{"other":{"command":"x"}}}"#,
        )
        .unwrap();
        wire_into(dir.path(), "http://127.0.0.1:1/mcp").unwrap();
        let text = std::fs::read_to_string(dir.path().join(".mcp.json")).unwrap();
        let doc: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(doc["mcpServers"]["other"]["command"], "x");
        assert_eq!(
            doc["mcpServers"]["shipyard"]["url"],
            "http://127.0.0.1:1/mcp"
        );
        assert!(text.contains("${SHIPYARD_MCP_TOKEN}"));
        std::fs::write(dir.path().join(".mcp.json"), "{nope").unwrap();
        assert!(wire_into(dir.path(), "u").is_err());
    }

    #[test]
    fn the_server_starts_on_a_switch_serves_a_token_and_stops() {
        let dir = tempfile::tempdir().unwrap();
        let g = McpGates {
            enabled: true,
            reads: true,
            port: 0,
            ..Default::default()
        };
        // Port 0 picks a free one, so the test never meets a busy port.
        apply(dir.path(), &g);
        assert!(lock(&LIVE).is_some(), "{}", lock(&ERROR));
        assert_eq!(token(dir.path()).unwrap().len(), 64);
        let first = token(dir.path());
        apply(dir.path(), &g);
        assert_eq!(token(dir.path()), first, "the token survives a restart");
        apply(dir.path(), &McpGates::default());
        assert!(lock(&LIVE).is_none());
    }
}
