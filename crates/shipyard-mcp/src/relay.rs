//! The relay for a stdio MCP server (REQ-018).
//!
//! An agent turn starts a new CLI, and the CLI starts its stdio servers again: seconds lost per
//! turn. So the agent starts `shipyard --mcp-relay <server-id>` ([`FLAG`]) in place of the server.
//! [`serve`] speaks stdio to the agent and forwards each request, over a local socket, to the app,
//! which keeps the real server open ([`Relay`], [`Proxy::forward`]). When the app is closed, the
//! relay starts the server itself through a fallback [`Proxy`], so a headless run still works.
//!
//! The socket sits in a folder that only its owner can use, and the socket file is `0600`.
//!
//! shortcut: the socket is unix only. On Windows `serve` always uses the fallback: each turn starts
//! the server, as before the relay. Add a named pipe (`interprocess`) if that cost shows.

use crate::proxy::Proxy;
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use std::path::Path;

/// The command-line flag that selects the relay. The server id follows it.
pub const FLAG: &str = "--mcp-relay";

/// How long a relay waits for the app. Longer than a server start.
#[cfg(unix)]
const WAIT: std::time::Duration = std::time::Duration::from_secs(120);

/// Largest line that the app reads from a relay.
#[cfg(unix)]
const MAX_LINE: u64 = 8 * 1024 * 1024;

/// The app side: answers the relays until it is dropped.
#[cfg(unix)]
pub struct Relay {
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    path: std::path::PathBuf,
}

#[cfg(unix)]
impl Relay {
    /// Listen on `path`. The folder of `path` is created private (`0700`). An existing folder that
    /// others can use is refused. A socket file that a crashed app left is replaced.
    pub fn listen(proxy: std::sync::Arc<Proxy>, path: &Path) -> io::Result<Self> {
        use std::os::unix::fs::{FileTypeExt, PermissionsExt};
        use std::sync::Arc;
        use std::sync::atomic::{AtomicBool, Ordering};

        let denied = |why: &str| io::Error::new(io::ErrorKind::PermissionDenied, why.to_string());
        let dir = path
            .parent()
            .ok_or_else(|| denied("the socket has no folder"))?;
        if dir.exists() {
            if std::fs::metadata(dir)?.permissions().mode() & 0o077 != 0 {
                return Err(denied(
                    "the folder of the relay socket must be private (0700)",
                ));
            }
        } else {
            std::fs::create_dir_all(dir)?;
            std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
        }
        if std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_socket()) {
            std::fs::remove_file(path)?;
        }
        let listener = std::os::unix::net::UnixListener::bind(path)?;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        listener.set_nonblocking(true)?;

        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let thread = std::thread::spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((conn, _)) => {
                        let proxy = proxy.clone();
                        std::thread::spawn(move || answer(conn, &proxy));
                    }
                    Err(_) => std::thread::sleep(std::time::Duration::from_millis(25)),
                }
            }
        });
        Ok(Self {
            stop,
            thread: Some(thread),
            path: path.to_path_buf(),
        })
    }
}

#[cfg(unix)]
impl Drop for Relay {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        let _ = std::fs::remove_file(&self.path);
    }
}

/// One relayed request: a line in, a line out.
#[cfg(unix)]
fn answer(conn: std::os::unix::net::UnixStream, proxy: &Proxy) {
    use std::io::Read;
    let _ = conn.set_nonblocking(false);
    let mut line = String::new();
    if io::BufReader::new((&conn).take(MAX_LINE))
        .read_line(&mut line)
        .unwrap_or(0)
        == 0
    {
        return;
    }
    let Ok(request) = serde_json::from_str::<Value>(&line) else {
        return;
    };
    let server = request["server"].as_str().unwrap_or_default();
    let method = request["method"].as_str().unwrap_or_default();
    let response = proxy.forward(server, method, request["params"].clone());
    let _ = writeln!(&conn, "{}", json!({ "response": response }));
}

/// Ask the app. `Err` when it cannot be reached. `Ok(None)` when it answered and the server did not.
#[cfg(unix)]
fn ask(socket: &Path, server: &str, method: &str, params: &Value) -> Result<Option<Value>, ()> {
    let conn = std::os::unix::net::UnixStream::connect(socket).map_err(|_| ())?;
    conn.set_read_timeout(Some(WAIT)).map_err(|_| ())?;
    let request = json!({ "server": server, "method": method, "params": params });
    writeln!(&conn, "{request}").map_err(|_| ())?;
    let mut line = String::new();
    io::BufReader::new(&conn)
        .read_line(&mut line)
        .map_err(|_| ())?;
    let reply: Value = serde_json::from_str(&line).map_err(|_| ())?;
    Ok(Some(reply["response"].clone()).filter(|r| !r.is_null()))
}

#[cfg(not(unix))]
fn ask(_: &Path, _: &str, _: &str, _: &Value) -> Result<Option<Value>, ()> {
    Err(())
}

/// Serve one server on `input` and `output` until the input closes. `socket` is the address of
/// the app. `fallback` runs the server in this process when the app cannot be reached.
/// A notification (no `id`) gets no answer. A request that the server leaves unanswered gets a
/// JSON-RPC error, not silence.
pub fn serve(
    server: &str,
    socket: &Path,
    fallback: &Proxy,
    input: impl BufRead,
    mut output: impl Write,
) -> io::Result<()> {
    for line in input.lines() {
        let line = line?;
        let Ok(request) = serde_json::from_str::<Value>(line.trim()) else {
            continue;
        };
        let Some(id) = request.get("id").cloned() else {
            continue;
        };
        let method = request["method"].as_str().unwrap_or_default();
        let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
        let response = match ask(socket, server, method, &params) {
            Ok(response) => response,
            Err(()) => fallback.forward(server, method, params),
        };
        let mut response = response.unwrap_or_else(|| {
            json!({
                "jsonrpc": "2.0",
                "error": { "code": -32603, "message": format!("MCP server '{server}' did not answer") },
            })
        });
        response["id"] = id;
        writeln!(output, "{response}")?;
        output.flush()?;
    }
    Ok(())
}
