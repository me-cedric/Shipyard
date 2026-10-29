//! The two transports serve the same tools, and HTTP serves only this machine (REQ-037).

use serde_json::{Value, json};
use shipyard_mcp::server::Server;
use shipyard_mcp::session::Binding;
use shipyard_mcp::tools::agent::{AgentEvent, AgentEvents, NAMES};
use shipyard_mcp::transport::{Http, serve_stdio};
use std::io::{Cursor, Read, Write};
use std::net::TcpStream;
use std::sync::Arc;

struct Echo;

impl AgentEvents for Echo {
    fn emit(&self, who: &Binding, event: AgentEvent) -> Result<Value, String> {
        Ok(json!({ "run": who.run, "tool": event.tool() }))
    }
}

fn setup() -> (Arc<Server>, String) {
    let server = Arc::new(Server::new(Arc::new(Echo)));
    let tools = NAMES.iter().map(|n| n.to_string()).collect();
    let binding = Binding {
        run: "run-1".into(),
        step: "build".into(),
        tools,
    };
    let token = server.sessions().open(binding).unwrap().0;
    (server, token)
}

struct Reply {
    status: u16,
    head: String,
    body: String,
}

/// One raw HTTP request. `host` is set by the caller so a test can lie about it.
fn http(port: u16, method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> Reply {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    let mut req = format!("{method} {path} HTTP/1.1\r\n");
    for (k, v) in headers {
        req.push_str(&format!("{k}: {v}\r\n"));
    }
    req.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    ));
    stream.write_all(req.as_bytes()).unwrap();
    let mut raw = String::new();
    stream.read_to_string(&mut raw).unwrap();
    let (head, body) = raw.split_once("\r\n\r\n").unwrap_or((&raw, ""));
    let status = head.split_whitespace().nth(1).unwrap().parse().unwrap();
    Reply {
        status,
        head: head.to_string(),
        body: body.to_string(),
    }
}

fn post(http_server: &Http, token: &str, body: &Value) -> Reply {
    let host = format!("127.0.0.1:{}", http_server.port());
    let auth = format!("Bearer {token}");
    http(
        http_server.port(),
        "POST",
        "/mcp",
        &[("Host", &host), ("Authorization", &auth)],
        &body.to_string(),
    )
}

fn list_names(answer: &Value) -> Vec<String> {
    answer["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap().to_string())
        .collect()
}

#[test]
fn stdio_answers_each_request_skips_noise_and_stays_silent_on_a_notification() {
    let (server, token) = setup();
    let input = [
        "not json".to_string(),
        String::new(),
        json!({"jsonrpc": "2.0", "method": "notifications/initialized"}).to_string(),
        json!({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).to_string(),
        json!({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "post_progress", "arguments": {"text": "hi"}}}).to_string(),
    ]
    .join("\n");
    let mut out = Vec::new();
    serve_stdio(&server, &token, Cursor::new(input), &mut out).unwrap();
    let lines: Vec<Value> = String::from_utf8(out)
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 2);
    assert_eq!(list_names(&lines[0]), NAMES);
    assert_eq!(
        lines[1]["result"]["structuredContent"],
        json!({"run": "run-1", "tool": "post_progress"})
    );
}

#[test]
fn stdio_with_a_wrong_token_answers_unauthorized() {
    let (server, _) = setup();
    let input = json!({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).to_string();
    let mut out = Vec::new();
    serve_stdio(&server, "wrong", Cursor::new(input), &mut out).unwrap();
    let answer: Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(answer["error"]["code"], -32001);
}

#[test]
fn http_and_stdio_list_the_same_eight_tools() {
    let (server, token) = setup();
    let http_server = Http::start(server.clone(), 0).unwrap();
    assert!(http_server.url().starts_with("http://127.0.0.1:"));
    let over_http: Value = serde_json::from_str(
        &post(
            &http_server,
            &token,
            &json!({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
        )
        .body,
    )
    .unwrap();
    let mut out = Vec::new();
    let line = json!({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).to_string();
    serve_stdio(&server, &token, Cursor::new(line), &mut out).unwrap();
    let over_stdio: Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(over_http, over_stdio);
    assert_eq!(list_names(&over_http).len(), 8);
}

#[test]
fn http_calls_a_tool_with_the_bearer_token() {
    let (server, token) = setup();
    let http_server = Http::start(server, 0).unwrap();
    let call = json!({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "read_ref", "arguments": {"ref": "adr:5"}}});
    let reply = post(&http_server, &token, &call);
    assert_eq!(reply.status, 200);
    let answer: Value = serde_json::from_str(&reply.body).unwrap();
    assert_eq!(
        answer["result"]["structuredContent"],
        json!({"run": "run-1", "tool": "read_ref"})
    );
    let note = post(
        &http_server,
        &token,
        &json!({"jsonrpc": "2.0", "method": "notifications/initialized"}),
    );
    assert_eq!((note.status, note.body.as_str()), (202, ""));
}

#[test]
fn http_refuses_a_missing_wrong_or_revoked_token() {
    let (server, token) = setup();
    let http_server = Http::start(server.clone(), 0).unwrap();
    let body = json!({"jsonrpc": "2.0", "id": 1, "method": "ping"});
    let host = format!("127.0.0.1:{}", http_server.port());
    let none = http(
        http_server.port(),
        "POST",
        "/mcp",
        &[("Host", &host)],
        &body.to_string(),
    );
    assert_eq!(none.status, 401);
    assert!(none.head.contains("WWW-Authenticate: Bearer"));
    assert_eq!(post(&http_server, "wrong", &body).status, 401);
    let basic = http(
        http_server.port(),
        "POST",
        "/mcp",
        &[
            ("Host", &host),
            ("Authorization", &format!("Basic {token}")),
        ],
        &body.to_string(),
    );
    assert_eq!(basic.status, 401);
    assert_eq!(post(&http_server, &token, &body).status, 200);
    server.sessions().revoke_run("run-1");
    assert_eq!(post(&http_server, &token, &body).status, 401);
}

#[test]
fn http_refuses_a_caller_that_is_not_this_machine() {
    let (server, token) = setup();
    let http_server = Http::start(server, 0).unwrap();
    let port = http_server.port();
    let body = json!({"jsonrpc": "2.0", "id": 1, "method": "ping"}).to_string();
    let auth = format!("Bearer {token}");
    let host = format!("127.0.0.1:{port}");
    let ask = |headers: &[(&str, &str)]| http(port, "POST", "/mcp", headers, &body).status;
    // A name that resolves to the loopback address (DNS rebinding), a wrong port, no Host.
    assert_eq!(
        ask(&[
            ("Host", &format!("evil.example:{port}")),
            ("Authorization", &auth)
        ]),
        403
    );
    assert_eq!(
        ask(&[("Host", "127.0.0.1:1"), ("Authorization", &auth)]),
        403
    );
    assert_eq!(ask(&[("Authorization", &auth)]), 403);
    // A web page of another site, and a local page, which still needs the token.
    assert_eq!(
        ask(&[
            ("Host", &host),
            ("Origin", "https://evil.example"),
            ("Authorization", &auth)
        ]),
        403
    );
    assert_eq!(
        ask(&[("Host", &host), ("Origin", "http://localhost:3000")]),
        401
    );
    assert_eq!(
        ask(&[
            ("Host", &host),
            ("Origin", "http://localhost:3000"),
            ("Authorization", &auth)
        ]),
        200
    );
    assert_eq!(
        ask(&[
            ("Host", &format!("localhost:{port}")),
            ("Authorization", &auth)
        ]),
        200
    );
}

#[test]
fn http_checks_path_method_and_body_size() {
    let (server, token) = setup();
    let http_server = Http::start(server, 0).unwrap();
    let port = http_server.port();
    let host = format!("127.0.0.1:{port}");
    let auth = format!("Bearer {token}");
    let h = [("Host", host.as_str()), ("Authorization", auth.as_str())];
    assert_eq!(http(port, "POST", "/other", &h, "{}").status, 404);
    assert_eq!(http(port, "GET", "/mcp", &h, "").status, 405);
    assert_eq!(http(port, "DELETE", "/mcp", &h, "").status, 200);
    assert_eq!(http(port, "POST", "/mcp", &h, "").status, 413);
    assert_eq!(
        http(port, "POST", "/mcp", &h, &"x".repeat(1024 * 1024 + 1)).status,
        413
    );
    assert_eq!(http(port, "POST", "/mcp", &h, "{nope").status, 400);
}

#[test]
fn the_listener_is_on_the_loopback_address_and_stops_on_drop() {
    let (server, _) = setup();
    let http_server = Http::start(server, 0).unwrap();
    let port = http_server.port();
    assert!(TcpStream::connect(("127.0.0.1", port)).is_ok());
    drop(http_server);
    assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
}

#[test]
fn http_refuses_a_request_line_with_no_end() {
    let (server, _) = setup();
    let http_server = Http::start(server, 0).unwrap();
    let mut stream = TcpStream::connect(("127.0.0.1", http_server.port())).unwrap();
    // 64 KiB with no newline: the server must stop reading at the header limit.
    let _ = stream.write_all("A".repeat(64 * 1024).as_bytes());
    let mut raw = String::new();
    let _ = stream.read_to_string(&mut raw);
    assert!(raw.starts_with("HTTP/1.1 431"), "{raw:?}");
}
