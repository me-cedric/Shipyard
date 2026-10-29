//! The real `shipyard --mcp-bridge` process: the environment holds the endpoint and the token.

use std::io::Write;
use std::process::{Command, ExitStatus, Stdio};

fn bridge(vars: &[(&str, &str)], input: &str) -> (ExitStatus, String, String) {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_shipyard"));
    cmd.arg("--mcp-bridge")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for name in ["SHIPYARD_MCP_URL", "SHIPYARD_MCP_TOKEN"] {
        cmd.env_remove(name);
    }
    cmd.envs(vars.iter().copied());
    let mut child = cmd.spawn().unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    (
        out.status,
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    )
}

#[test]
fn missing_variables_are_a_clear_error() {
    let (status, _, err) = bridge(&[], "");
    assert!(!status.success());
    assert!(err.contains("SHIPYARD_MCP_URL is not set"), "{err}");
    let (status, _, err) = bridge(&[("SHIPYARD_MCP_URL", "http://127.0.0.1:1/mcp")], "");
    assert!(!status.success());
    assert!(err.contains("SHIPYARD_MCP_TOKEN is not set"), "{err}");
}

#[test]
fn a_remote_url_is_refused_before_any_connection() {
    let vars = [
        ("SHIPYARD_MCP_URL", "http://example.com/mcp"),
        ("SHIPYARD_MCP_TOKEN", "tok-secret"),
    ];
    let (status, out, err) = bridge(&vars, "{\"id\":1,\"method\":\"ping\"}\n");
    assert!(!status.success());
    assert!(err.contains("loopback"), "{err}");
    assert!(out.is_empty());
    assert!(!err.contains("tok-secret"));
}

#[test]
fn a_closed_app_answers_each_request_with_an_error() {
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let url = format!("http://127.0.0.1:{port}/mcp");
    let vars = [
        ("SHIPYARD_MCP_URL", url.as_str()),
        ("SHIPYARD_MCP_TOKEN", "tok-secret"),
    ];
    let (status, out, _) = bridge(
        &vars,
        "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"ping\"}\n",
    );
    assert!(status.success());
    assert!(
        out.contains("not running") && out.contains("\"id\":3"),
        "{out}"
    );
    assert!(!out.contains("tok-secret"));
}
