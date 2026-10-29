//! The MCP proxy and the relay (spec `connections`, REQ-017, REQ-018).
//! Fake `sh` servers, a unix socket in a temp folder, no network. Unix only.
#![cfg(unix)]

use serde_json::{Value, json};
use shipyard_agents::AgentError;
use shipyard_agents::fake::mcp_server;
use shipyard_agents::mcp_control::{CustomInput, McpConfig, McpControl, State, Waits};
use shipyard_mcp::proxy::{Proxy, split};
use shipyard_mcp::relay::{Relay, serve};
use shipyard_secrets::MemoryStore;
use std::io::Cursor;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;

struct Lab {
    dir: TempDir,
}

impl Lab {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        mcp_server(dir.path(), "fake-mcp", &dir.path().join("pids"));
        Self { dir }
    }

    fn pids(&self) -> usize {
        std::fs::read_to_string(self.dir.path().join("pids"))
            .unwrap_or_default()
            .lines()
            .count()
    }

    /// A control that knows one custom server, `custom-fake`, enabled.
    fn control(&self, enable: bool) -> Arc<McpControl> {
        let control = McpControl::new(Arc::new(MemoryStore::default()), McpConfig::default())
            .with_dirs(vec![
                self.dir.path().into(),
                "/usr/bin".into(),
                "/bin".into(),
            ])
            .with_waits(Waits {
                start: Duration::from_secs(5),
                call: Duration::from_secs(5),
            });
        for (name, command) in [("Fake", "fake-mcp"), ("Ghost", "ghost-tool")] {
            let input = CustomInput {
                name: name.into(),
                command: command.into(),
                ..Default::default()
            };
            let id = control.add_custom(input).unwrap().id;
            if enable {
                control.set_enabled(&id, true).unwrap();
            }
        }
        Arc::new(control)
    }

    fn socket(&self) -> PathBuf {
        self.dir.path().join("run").join("relay.sock")
    }
}

#[test]
fn a_proxied_name_is_the_server_id_two_underscores_and_the_tool() {
    assert_eq!(
        split("jira__search_issues"),
        Some(("jira", "search_issues"))
    );
    assert_eq!(
        split("jira__a__b"),
        Some(("jira", "a__b")),
        "the first separator splits"
    );
    for own in ["read_ref", "__x", "x__", "ask_question"] {
        assert_eq!(split(own), None, "{own}");
    }
}

#[test]
fn the_endpoint_lists_the_tools_of_each_active_server_under_its_prefix() {
    let lab = Lab::new();
    let proxy = Proxy::new(lab.control(true));
    // `custom-ghost` is active but its command is missing: it adds no tool and breaks nothing.
    let tools = proxy.tools();
    let names: Vec<_> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["custom-fake__ping"]);
}

#[test]
fn a_server_that_is_not_active_is_not_listed_and_not_callable() {
    let lab = Lab::new();
    let proxy = Proxy::new(lab.control(false));
    assert!(proxy.tools().is_empty());
    assert!(matches!(
        proxy.call("custom-fake__ping", &json!({})),
        Err(AgentError::UnknownServer(_))
    ));
    assert!(matches!(
        proxy.call("read_ref", &json!({})),
        Err(AgentError::UnknownServer(_))
    ));
    assert_eq!(lab.pids(), 0, "nothing started");
    assert_eq!(proxy.forward("custom-fake", "tools/list", json!({})), None);
}

#[test]
fn a_call_goes_to_the_server_that_owns_the_tool() {
    let lab = Lab::new();
    let proxy = Proxy::new(lab.control(true));
    let result = proxy.call("custom-fake__ping", &json!({"a": 1})).unwrap();
    assert_eq!(result["content"][0]["text"], "pong");
}

#[test]
fn a_dead_server_starts_again_and_answers_the_call() {
    let lab = Lab::new();
    let control = lab.control(true);
    let proxy = Proxy::new(control.clone());
    proxy.call("custom-fake__ping", &json!({})).unwrap();
    assert!(control.request("custom-fake", "crash", json!({})).is_err());
    assert!(matches!(control.state("custom-fake"), State::Failed { .. }));
    let result = proxy.call("custom-fake__ping", &json!({})).unwrap();
    assert_eq!(result["content"][0]["text"], "pong");
    assert_eq!(lab.pids(), 2);
}

/// One relayed turn: the client lines in, the answers out.
fn turn(lab: &Lab, server: &str, fallback: &Proxy, lines: &[Value]) -> Vec<Value> {
    let input: String = lines.iter().map(|l| format!("{l}\n")).collect();
    let mut out = Vec::new();
    serve(
        server,
        &lab.socket(),
        fallback,
        Cursor::new(input),
        &mut out,
    )
    .unwrap();
    String::from_utf8(out)
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect()
}

fn handshake() -> Vec<Value> {
    vec![
        json!({"jsonrpc":"2.0","id":7,"method":"initialize","params":{}}),
        json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
        json!({"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"ping","arguments":{}}}),
    ]
}

#[test]
fn a_second_turn_reuses_the_open_server() {
    let lab = Lab::new();
    let window = Arc::new(Proxy::new(lab.control(true)));
    let _relay = Relay::listen(window.clone(), &lab.socket()).unwrap();
    // The relay process has its own control. It must not start the server while the app runs.
    let fallback = Proxy::new(lab.control(true));
    for _ in 0..2 {
        let answers = turn(&lab, "custom-fake", &fallback, &handshake());
        assert_eq!(answers.len(), 2, "a notification gets no answer");
        assert_eq!(answers[0]["id"], 7);
        assert_eq!(answers[0]["result"]["serverInfo"]["name"], "fake");
        assert_eq!(answers[1]["id"], 8);
        assert_eq!(answers[1]["result"]["content"][0]["text"], "pong");
    }
    assert_eq!(lab.pids(), 1, "one process for two turns");
    assert_eq!(fallback.control().state("custom-fake"), State::Stopped);
}

#[test]
fn when_the_app_is_closed_the_relay_starts_the_server_itself() {
    let lab = Lab::new(); // no listener
    let fallback = Proxy::new(lab.control(true));
    let answers = turn(&lab, "custom-fake", &fallback, &handshake());
    assert_eq!(answers[1]["result"]["content"][0]["text"], "pong");
    assert_eq!(lab.pids(), 1);
    assert_eq!(fallback.control().state("custom-fake"), State::Running);
}

#[test]
fn a_server_that_does_not_answer_gives_the_client_an_error_not_silence() {
    let lab = Lab::new();
    let window = Arc::new(Proxy::new(lab.control(true)));
    let _relay = Relay::listen(window, &lab.socket()).unwrap();
    let fallback = Proxy::new(lab.control(true));
    let answers = turn(
        &lab,
        "custom-ghost",
        &fallback,
        &[json!({"jsonrpc":"2.0","id":1,"method":"tools/list"})],
    );
    assert_eq!(answers[0]["id"], 1);
    assert_eq!(answers[0]["error"]["code"], -32603);
    assert!(
        answers[0]["error"]["message"]
            .as_str()
            .unwrap()
            .contains("custom-ghost")
    );
}

#[test]
fn the_socket_is_private_and_goes_away_with_the_relay() {
    let lab = Lab::new();
    let window = Arc::new(Proxy::new(lab.control(true)));
    let socket = lab.socket();
    let relay = Relay::listen(window.clone(), &socket).unwrap();
    let mode = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(&socket), 0o600);
    assert_eq!(mode(socket.parent().unwrap()), 0o700);
    drop(relay);
    assert!(!socket.exists());

    // A folder that others can read is refused.
    let open = lab.dir.path().join("open");
    std::fs::create_dir(&open).unwrap();
    std::fs::set_permissions(&open, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert!(Relay::listen(window, &open.join("relay.sock")).is_err());
}
