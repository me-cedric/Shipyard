//! The relay on a Windows named pipe (spec `windows-relay`, REQ-001, REQ-002). Windows only: this
//! file runs in the `relay (windows-latest)` job of the CI.
#![cfg(windows)]

use serde_json::json;
use shipyard_agents::mcp_control::{McpConfig, McpControl};
use shipyard_mcp::proxy::Proxy;
use shipyard_mcp::relay::{Relay, pipe_name, serve, socket_path};
use shipyard_secrets::MemoryStore;
use std::io::{BufRead, BufReader, Cursor, Write};
use std::sync::Arc;

fn proxy() -> Arc<Proxy> {
    let control = McpControl::new(Arc::new(MemoryStore::default()), McpConfig::default());
    Arc::new(Proxy::new(Arc::new(control)))
}

#[test]
fn a_request_goes_through_the_pipe_and_the_pipe_goes_away_with_the_relay() {
    let dir = tempfile::tempdir().unwrap();
    let socket = socket_path(dir.path());
    let relay = Relay::listen(proxy(), &socket).unwrap();
    // The name is taken: a second listener is refused.
    assert!(Relay::listen(proxy(), &socket).is_err());

    let pipe = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(pipe_name(&socket))
        .unwrap();
    writeln!(
        &pipe,
        r#"{{"server":"none","method":"tools/list","params":{{}}}}"#
    )
    .unwrap();
    let mut line = String::new();
    BufReader::new(&pipe).read_line(&mut line).unwrap();
    assert_eq!(line.trim(), r#"{"response":null}"#);

    drop(pipe);
    drop(relay);
    assert!(std::fs::File::open(pipe_name(&socket)).is_err());
}

#[test]
fn a_relay_without_the_app_answers_with_an_error_and_does_not_hang() {
    let dir = tempfile::tempdir().unwrap();
    let request = format!(
        "{}\n",
        json!({"jsonrpc":"2.0","id":1,"method":"tools/list"})
    );
    let fallback = proxy();
    let mut out = Vec::new();
    serve(
        "custom-none",
        &socket_path(dir.path()),
        &fallback,
        Cursor::new(request),
        &mut out,
    )
    .unwrap();
    let answer: serde_json::Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(answer["id"], 1);
    assert_eq!(answer["error"]["code"], -32603);
}
