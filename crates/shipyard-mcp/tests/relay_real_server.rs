//! The relay with a real server process, on each system (spec `windows-relay`, REQ-001, REQ-002;
//! spec `connections`, REQ-018). The server is the example `fake_mcp`: `cargo test` builds it.
//! On Windows the channel is the named pipe, so the Windows job proves the pipe with these tests.

use serde_json::{Value, json};
use shipyard_agents::mcp_control::{CustomInput, McpConfig, McpControl, State, Waits};
use shipyard_mcp::proxy::Proxy;
use shipyard_mcp::relay::{Relay, serve};
use shipyard_secrets::MemoryStore;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

struct Lab {
    dir: tempfile::TempDir,
}

impl Lab {
    fn new() -> Self {
        Self {
            dir: tempfile::tempdir().unwrap(),
        }
    }

    fn starts(&self) -> usize {
        std::fs::read_to_string(self.dir.path().join("starts"))
            .unwrap_or_default()
            .lines()
            .count()
    }

    /// A control that knows one custom server, `custom-fake`, enabled.
    fn control(&self) -> Arc<McpControl> {
        // The examples are in a folder above the test binary: the first ancestor that holds it.
        let exe = if cfg!(windows) {
            "fake_mcp.exe"
        } else {
            "fake_mcp"
        };
        let binary = std::env::current_exe().unwrap();
        let examples = binary
            .ancestors()
            .map(|a| a.join("examples"))
            .find(|e| e.join(exe).is_file())
            .expect("the example `fake_mcp` is built by `cargo test`");
        let control = McpControl::new(Arc::new(MemoryStore::default()), McpConfig::default())
            .with_dirs(vec![examples])
            .with_waits(Waits {
                start: Duration::from_secs(30),
                call: Duration::from_secs(30),
            });
        let input = CustomInput {
            name: "Fake".into(),
            command: "fake_mcp".into(),
            args: vec![
                self.dir
                    .path()
                    .join("starts")
                    .to_string_lossy()
                    .into_owned(),
            ],
            ..Default::default()
        };
        let id = control.add_custom(input).unwrap().id;
        control.set_enabled(&id, true).unwrap();
        Arc::new(control)
    }

    /// A short path: a unix socket path has a length limit.
    fn socket(&self) -> PathBuf {
        self.dir.path().join("run").join("relay.sock")
    }
}

/// One turn of an agent: the relay reads `lines` and writes the answers.
fn turn(lab: &Lab, fallback: &Proxy, lines: &[Value]) -> Vec<Value> {
    let input: String = lines.iter().map(|l| format!("{l}\n")).collect();
    let mut out = Vec::new();
    serve(
        "custom-fake",
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
    let window = Arc::new(Proxy::new(lab.control()));
    let _relay = Relay::listen(window.clone(), &lab.socket()).unwrap();
    // The relay process has its own control. It must not start the server while the app runs.
    let fallback = Proxy::new(lab.control());
    for _ in 0..2 {
        let answers = turn(&lab, &fallback, &handshake());
        assert_eq!(answers.len(), 2, "a notification gets no answer");
        assert_eq!(answers[0]["id"], 7);
        assert_eq!(answers[0]["result"]["serverInfo"]["name"], "fake");
        assert_eq!(answers[1]["id"], 8);
        assert_eq!(answers[1]["result"]["content"][0]["text"], "pong");
    }
    assert_eq!(lab.starts(), 1, "one process for two turns");
    assert_eq!(fallback.control().state("custom-fake"), State::Stopped);
}

#[test]
fn when_the_app_is_closed_the_relay_starts_the_server_itself() {
    let lab = Lab::new(); // no listener
    let fallback = Proxy::new(lab.control());
    let answers = turn(&lab, &fallback, &handshake());
    assert_eq!(
        answers[1]["result"]["content"][0]["text"], "pong",
        "{answers:?}"
    );
    assert_eq!(lab.starts(), 1);
    assert_eq!(fallback.control().state("custom-fake"), State::Running);
}
