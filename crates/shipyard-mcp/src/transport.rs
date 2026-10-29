//! The two transports of the Shipyard MCP server (REQ-037): line-delimited JSON-RPC on stdio, and
//! HTTP on the loopback address. Both give each message to [`Server::handle`], so both serve the
//! same tools with the same inputs.
//!
//! Source: Legacy `application/mcp/stdio.rs` (`serve`) and `rpc.rs` (`handle_http`, the Host and
//! Origin guard, the close without a reset). Legacy has one server for the machine. Here each call
//! needs the bearer token of a run, so a web page cannot call a tool even from a local origin.
//!
//! shortcut: HTTP answers each request with one JSON body and keeps no stream. `GET` is `405`.

use crate::server::Server;
use serde_json::Value;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

/// The environment variable that holds the token of a stdio server. The MCP config file sets it.
pub const TOKEN_ENV: &str = "SHIPYARD_MCP_TOKEN";

const MAX_BODY: usize = 1024 * 1024;
const MAX_HEADERS: usize = 16 * 1024;
const MAX_IN_FLIGHT: usize = 32;

/// Serve `input` until it closes. A line that is not JSON is skipped: it has no id to answer.
pub fn serve_stdio(
    server: &Server,
    token: &str,
    input: impl BufRead,
    mut output: impl Write,
) -> io::Result<()> {
    for line in input.lines() {
        let line = line?;
        let Ok(request) = serde_json::from_str::<Value>(line.trim()) else {
            continue;
        };
        if let Some(answer) = server.handle(token, &request) {
            writeln!(output, "{answer}")?;
            output.flush()?;
        }
    }
    Ok(())
}

fn local_origin(value: &str) -> bool {
    [
        "http://127.0.0.1",
        "http://localhost",
        "tauri://localhost",
        "https://tauri.localhost",
    ]
    .iter()
    .any(|base| value == *base || value.strip_prefix(base).is_some_and(|r| r.starts_with(':')))
}

/// Write one response, then close without a reset: half-close the write side first.
fn reply(stream: &mut TcpStream, status: &str, body: &str) {
    let challenge = if status.starts_with("401") {
        "WWW-Authenticate: Bearer\r\n"
    } else {
        ""
    };
    let head = format!(
        "HTTP/1.1 {status}\r\n{challenge}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body.as_bytes());
    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Write);
}

/// Answer and read what the client already sent, so the system does not reset the connection.
fn refuse(reader: &mut BufReader<TcpStream>, length: usize, status: &str) {
    let _ = io::copy(
        &mut reader.take(length.min(MAX_BODY) as u64),
        &mut io::sink(),
    );
    reply(reader.get_mut(), status, "");
}

fn handle_http(stream: TcpStream, port: u16, server: &Server) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let mut reader = BufReader::new(stream);
    let mut first = String::new();
    // A bounded read: a request line with no end cannot fill the memory.
    if (&mut reader)
        .take(MAX_HEADERS as u64)
        .read_line(&mut first)
        .is_err()
    {
        return;
    }
    if !first.ends_with('\n') {
        return reply(reader.get_mut(), "431 Request Header Fields Too Large", "");
    }
    let mut parts = first.split_whitespace();
    let (method, path) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let (mut length, mut origin, mut host, mut auth) = (0usize, None, None, None);
    let mut seen = first.len();
    loop {
        let mut line = String::new();
        let room = MAX_HEADERS.saturating_sub(seen) as u64 + 1;
        if (&mut reader).take(room).read_line(&mut line).is_err() {
            return;
        }
        seen += line.len();
        if seen > MAX_HEADERS {
            return reply(reader.get_mut(), "431 Request Header Fields Too Large", "");
        }
        if line == "\r\n" || line == "\n" {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            let value = value.trim().to_string();
            match name.trim().to_ascii_lowercase().as_str() {
                "content-length" => length = value.parse().unwrap_or(MAX_BODY + 1),
                "origin" => origin = Some(value),
                "host" => host = Some(value),
                "authorization" => auth = Some(value),
                _ => {}
            }
        }
    }
    // The Host guard stops a web page that reaches the server through a name that resolves to
    // the loopback address. It follows the port that is really bound.
    let host_ok = host
        .as_deref()
        .is_some_and(|h| h == format!("127.0.0.1:{port}") || h == format!("localhost:{port}"));
    if !host_ok || origin.as_deref().map(local_origin) == Some(false) {
        return refuse(&mut reader, length, "403 Forbidden");
    }
    if path != "/mcp" {
        return refuse(&mut reader, length, "404 Not Found");
    }
    let token = auth
        .as_deref()
        .and_then(|a| a.strip_prefix("Bearer "))
        .unwrap_or("");
    if server.sessions().resolve(token).is_none() {
        return refuse(&mut reader, length, "401 Unauthorized");
    }
    match method {
        "DELETE" => return refuse(&mut reader, length, "200 OK"),
        "POST" => {}
        _ => return refuse(&mut reader, length, "405 Method Not Allowed"),
    }
    if length == 0 || length > MAX_BODY {
        return refuse(&mut reader, length, "413 Content Too Large");
    }
    let mut body = vec![0; length];
    if reader.read_exact(&mut body).is_err() {
        return reply(reader.get_mut(), "400 Bad Request", "");
    }
    let Ok(request) = serde_json::from_slice::<Value>(&body) else {
        let parse =
            r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}"#;
        return reply(reader.get_mut(), "400 Bad Request", parse);
    };
    match server.handle(token, &request) {
        Some(answer) => reply(reader.get_mut(), "200 OK", &answer.to_string()),
        None => reply(reader.get_mut(), "202 Accepted", ""),
    }
}

/// The HTTP transport. It listens on `127.0.0.1` only. Dropping it stops it.
pub struct Http {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    port: u16,
}

impl Http {
    /// Listen on `127.0.0.1:port`. Port 0 picks a free port: read it with [`Http::port`].
    pub fn start(server: Arc<Server>, port: u16) -> io::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", port))?;
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();
        let stop = Arc::new(AtomicBool::new(false));
        let (flag, busy) = (stop.clone(), Arc::new(AtomicUsize::new(0)));
        let thread = thread::spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let _ = stream.set_nonblocking(false);
                        // A client that holds many sockets must not make threads without end.
                        if busy.load(Ordering::Relaxed) >= MAX_IN_FLIGHT {
                            continue;
                        }
                        busy.fetch_add(1, Ordering::Relaxed);
                        let (server, done) = (server.clone(), busy.clone());
                        let spawned =
                            thread::Builder::new()
                                .name("shipyard-mcp".into())
                                .spawn(move || {
                                    handle_http(stream, port, &server);
                                    done.fetch_sub(1, Ordering::Relaxed);
                                });
                        if spawned.is_err() {
                            busy.fetch_sub(1, Ordering::Relaxed);
                        }
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(20));
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            stop,
            thread: Some(thread),
            port,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// The URL for the MCP config file of an agent.
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/mcp", self.port)
    }
}

impl Drop for Http {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}
