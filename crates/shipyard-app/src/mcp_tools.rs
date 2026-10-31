//! Settings / Connections, MCP servers: test one server or all, and the recommended set.
//!
//! A test starts the server if it is not running, asks for its tools and stops it again when the
//! test started it. The recommended set comes from the project: its stacks, its files and its
//! connections. Context7 is in every set.

use std::path::Path;
use std::time::Instant;

use serde::Serialize;
use serde_json::{Value, json};
use shipyard_agents::mcp_control::{ServerDef, State};
use shipyard_secrets::Secret;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking};
use crate::connections::{ConnectionKind, Connections};
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

/* ---------- GitLab MCP server (spec `gitlab-mcp`) ---------- */

const GITLAB_MCP_PREFIX: &str = "custom-gitlab-";
const GITLAB_MCP_VAR: &str = "GITLAB_AUTH";

/// The id of the MCP server entry of a GitLab connection.
pub fn gitlab_mcp_id(connection: &str) -> String {
    format!("{GITLAB_MCP_PREFIX}{connection}")
}

fn gitlab_mcp_url(host: &str) -> String {
    format!("https://{host}/api/v4/mcp")
}

/// The launch variable of a GitLab MCP server: `Bearer <token>`, read from the keychain and
/// refreshed at each start. The token goes to the server process only. A server whose address is
/// not the host of its connection gets no token.
pub fn gitlab_mcp_env(
    conns: &Connections,
    def: &ServerDef,
) -> Option<Result<Vec<(String, Secret)>, String>> {
    let id = def.id.strip_prefix(GITLAB_MCP_PREFIX)?;
    Some(conns.mcp_token(id).and_then(|(token, host)| {
        if !def.args.iter().any(|a| *a == gitlab_mcp_url(&host)) {
            return Err("the GitLab address changed: switch the GitLab tools on again".into());
        }
        Ok(vec![(
            GITLAB_MCP_VAR.to_string(),
            Secret::new(format!("Bearer {}", token.expose())),
        )])
    }))
}

/// Switches the GitLab MCP server of a connection on or off. On adds the entry with the address
/// of the connection host. The entry holds no token: the token is read at launch.
fn gitlab_mcp_set(s: &AppState, connection: &str, on: bool, click: bool) -> Res<()> {
    need_click(s, click)?;
    let id = gitlab_mcp_id(connection);
    if !on {
        return s.agents.mcp_enable(&id, false);
    }
    let c = s
        .connections
        .get(connection)?
        .ok_or_else(|| format!("unknown connection: {connection}"))?;
    if c.kind != ConnectionKind::GitLab {
        return Err("the GitLab tools need a GitLab connection".into());
    }
    let (_, host) = s.connections.mcp_token(connection)?;
    s.agents.mcp_add_custom(crate::agents::McpCustom {
        id: Some(id.clone()),
        name: format!("GitLab {}", c.name),
        description: String::new(),
        command: gitlab_mcp_url(&host),
        args: vec![
            "--header".into(),
            format!("Authorization:${{{GITLAB_MCP_VAR}}}"),
        ],
        env: Vec::new(),
    })?;
    s.agents.mcp_enable(&id, true)
}

#[tauri::command]
#[specta::specta]
pub async fn gitlab_mcp_set_on(
    app: AppHandle,
    connection: String,
    on: bool,
    click: bool,
) -> Api<()> {
    blocking(app, move |s| gitlab_mcp_set(s, &connection, on, click)).await
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

    use std::sync::Arc;

    use shipyard_http::fake::FakeHttp;
    use shipyard_secrets::MemoryStore;

    use crate::connections::{ConnectionDraft, ConnectionGroup};
    use crate::device_login::Oauth;

    /// A GitLab connection that signed in with the browser and holds these scopes.
    fn signed_in(dir: &Path, scope: &str, expires: i64, http: FakeHttp) -> (AppState, String) {
        let conns = Arc::new(Connections::new(
            dir,
            Arc::new(MemoryStore::default()),
            Arc::new(http),
        ));
        let s = AppState::with_connections(dir.join("data"), conns);
        let id = s
            .connections
            .add(ConnectionDraft {
                name: "Code".into(),
                group: ConnectionGroup::Forge,
                kind: ConnectionKind::GitLab,
                url: "https://gitlab.com".into(),
                user: None,
            })
            .unwrap()
            .id;
        let oauth = Oauth {
            refresh: "rt1".into(),
            expires,
            client: "cid".into(),
            scope: scope.into(),
        };
        s.connections
            .store_secret(&id, Secret::new("at1"), Some(oauth))
            .unwrap();
        (s, id)
    }

    fn entry(s: &AppState, id: &str) -> ServerDef {
        s.agents
            .mcp
            .config()
            .custom
            .into_iter()
            .find(|d| d.id == gitlab_mcp_id(id))
            .unwrap()
    }

    #[test]
    fn the_switch_adds_the_server_of_the_host_and_no_file_holds_the_token() {
        let dir = tempfile::tempdir().unwrap();
        let (s, id) = signed_in(dir.path(), "api mcp", i64::MAX, FakeHttp::new());
        assert!(
            gitlab_mcp_set(&s, &id, true, false)
                .unwrap_err()
                .contains("click")
        );
        gitlab_mcp_set(&s, &id, true, true).unwrap();
        let def = entry(&s, &id);
        assert!(
            def.args
                .iter()
                .any(|a| a == "https://gitlab.com/api/v4/mcp")
        );
        assert!(s.agents.mcp.is_enabled(&gitlab_mcp_id(&id)));
        let mut files = String::new();
        for e in std::fs::read_dir(dir.path().join("data"))
            .into_iter()
            .flatten()
            .flatten()
        {
            files += &std::fs::read_to_string(e.path()).unwrap_or_default();
        }
        assert!(!files.contains("at1") && !files.contains("rt1"), "{files}");
        gitlab_mcp_set(&s, &id, false, true).unwrap();
        assert!(!s.agents.mcp.is_enabled(&gitlab_mcp_id(&id)));
    }

    #[test]
    fn a_sign_in_with_api_only_cannot_switch_on() {
        let dir = tempfile::tempdir().unwrap();
        let (s, id) = signed_in(dir.path(), "api", i64::MAX, FakeHttp::new());
        let e = gitlab_mcp_set(&s, &id, true, true).unwrap_err();
        assert_eq!(
            AppError::from(e).code,
            crate::errors::ErrorCode::GitlabNoMcp
        );
        assert!(s.agents.mcp.config().custom.is_empty());
    }

    #[test]
    fn the_token_is_read_at_launch_and_an_expired_one_is_refreshed_first() {
        let dir = tempfile::tempdir().unwrap();
        let http = FakeHttp::new();
        http.post(
            "/oauth/token",
            "rt1",
            200,
            r#"{"access_token":"at2","refresh_token":"rt2","expires_in":7200}"#,
        );
        let (s, id) = signed_in(dir.path(), "api mcp", 1, http);
        gitlab_mcp_set(&s, &id, true, true).unwrap();
        let def = entry(&s, &id);
        let env = gitlab_mcp_env(&s.connections, &def).unwrap().unwrap();
        assert_eq!(env[0].0, "GITLAB_AUTH");
        assert_eq!(env[0].1.expose(), "Bearer at2");
        // Not a GitLab entry: no variable.
        let mut other = def.clone();
        other.id = "context7".into();
        assert!(gitlab_mcp_env(&s.connections, &other).is_none());
        // An entry for another host never gets the token.
        let mut moved = def;
        moved.args = vec!["https://evil.example/api/v4/mcp".into()];
        assert!(gitlab_mcp_env(&s.connections, &moved).unwrap().is_err());
    }

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
