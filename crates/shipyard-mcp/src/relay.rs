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
//! On Windows the channel is a named pipe. Its name comes from the socket path, so one data folder
//! has one pipe. Only the owner of the pipe can open it, and remote clients are refused.
//!
//! shortcut: on Windows a relay waits for the answer with no time limit, and a client that stays
//! silent holds one thread of the app. Add timeouts if a hung server shows.

use crate::proxy::Proxy;
use serde_json::{Value, json};
use shipyard_agents::mcp_control::{McpConfig, McpControl};
use shipyard_secrets::SecretStore;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// The command-line flag that selects the relay. The server id follows it.
pub const FLAG: &str = "--mcp-relay";

/// The app data folder file that holds the MCP config. The app writes it, the relay reads it.
pub const CONFIG_FILE: &str = "agents.json";

/// The identifier of the app (`tauri.conf.json`): the name of its data folder.
const APP_ID: &str = "dev.shipyard.app";

/// The socket of the app. Its folder is private (`0700`, see [`Relay::listen`]).
pub fn socket_path(data_dir: &Path) -> PathBuf {
    data_dir.join("relay").join("mcp.sock")
}

/// The app data folder, where Tauri puts it. `SHIPYARD_DATA_DIR` replaces it (tests, portable use).
pub fn data_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("SHIPYARD_DATA_DIR") {
        return Some(dir.into());
    }
    let home = || std::env::var_os("HOME").map(PathBuf::from);
    if cfg!(target_os = "macos") {
        Some(home()?.join("Library/Application Support").join(APP_ID))
    } else if cfg!(windows) {
        Some(PathBuf::from(std::env::var_os("APPDATA")?).join(APP_ID))
    } else {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| Some(home()?.join(".local/share")))?;
        Some(base.join(APP_ID))
    }
}

/// The MCP config that the app saved. A missing or unreadable file gives no server: the relay
/// then answers each request with an error, as for any server that is not enabled.
fn read_config(data_dir: &Path) -> McpConfig {
    #[derive(serde::Deserialize, Default)]
    struct File {
        #[serde(default)]
        mcp: McpConfig,
    }
    std::fs::read(data_dir.join(CONFIG_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<File>(&bytes).ok())
        .unwrap_or_default()
        .mcp
}

/// The entry of `shipyard --mcp-relay <server>`: stdio to the agent, the app socket in
/// `data_dir`, and a process of our own when the app is closed. The secrets come from `store`.
pub fn run_in(
    data_dir: &Path,
    server: &str,
    store: Arc<dyn SecretStore>,
    input: impl BufRead,
    output: impl Write,
) -> io::Result<()> {
    let control = Arc::new(McpControl::new(store, read_config(data_dir)));
    let fallback = Proxy::new(control.clone());
    let done = serve(server, &socket_path(data_dir), &fallback, input, output);
    control.stop_all();
    done
}

/// [`run_in`] on the real stdio, the real data folder and the OS keychain.
pub fn run(server: &str) -> io::Result<()> {
    let dir = data_dir().ok_or_else(|| io::Error::other("no app data folder"))?;
    run_in(
        &dir,
        server,
        Arc::new(shipyard_secrets::Keychain),
        io::stdin().lock(),
        io::stdout().lock(),
    )
}

/// How long a relay waits for the app. Longer than a server start.
#[cfg(unix)]
const WAIT: std::time::Duration = std::time::Duration::from_secs(120);

/// How long the app waits for a relay to send its line, and to take the answer. A relay that
/// connects and stays silent must not hold a thread for ever.
#[cfg(unix)]
const IO_WAIT: std::time::Duration = std::time::Duration::from_secs(10);

/// Largest line that the app reads from a relay.
#[cfg(any(unix, windows))]
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
    let _ = conn.set_read_timeout(Some(IO_WAIT));
    let _ = conn.set_write_timeout(Some(IO_WAIT));
    let mut line = String::new();
    if io::BufReader::new((&conn).take(MAX_LINE))
        .read_line(&mut line)
        .unwrap_or(0)
        == 0
    {
        return;
    }
    if let Some(out) = respond(&line, proxy) {
        let _ = writeln!(&conn, "{out}");
    }
}

/// The answer line for one request line. `None` when the line is not a request.
#[cfg(any(unix, windows))]
fn respond(line: &str, proxy: &Proxy) -> Option<String> {
    let request = serde_json::from_str::<Value>(line).ok()?;
    let server = request["server"].as_str().unwrap_or_default();
    let method = request["method"].as_str().unwrap_or_default();
    let response = proxy.forward(server, method, request["params"].clone());
    Some(json!({ "response": response }).to_string())
}

/// Ask the app. `Err` only when the app cannot be connected to: the one case where the caller
/// may run the server itself. After the request is sent, the server may have run it, so any
/// failure is `Ok(None)` (no answer), never a second run. `Ok(None)` also when the server did
/// not answer.
#[cfg(unix)]
fn ask(socket: &Path, server: &str, method: &str, params: &Value) -> Result<Option<Value>, ()> {
    let conn = std::os::unix::net::UnixStream::connect(socket).map_err(|_| ())?;
    let request = json!({ "server": server, "method": method, "params": params });
    let reply = (|| -> Option<Value> {
        conn.set_read_timeout(Some(WAIT)).ok()?;
        writeln!(&conn, "{request}").ok()?;
        let mut line = String::new();
        io::BufReader::new(&conn).read_line(&mut line).ok()?;
        serde_json::from_str::<Value>(&line).ok()
    })();
    Ok(reply
        .map(|r| r["response"].clone())
        .filter(|r| !r.is_null()))
}

/// The pipe of the app, from the socket path: one pipe for each data folder.
#[cfg(windows)]
pub fn pipe_name(socket: &Path) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    socket.hash(&mut hasher);
    format!(r"\\.\pipe\shipyard-relay-{:016x}", hasher.finish())
}

/// Same contract as the unix `ask`: `Err` only when the pipe cannot be opened.
#[cfg(windows)]
fn ask(socket: &Path, server: &str, method: &str, params: &Value) -> Result<Option<Value>, ()> {
    let pipe = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(pipe_name(socket))
        .map_err(|_| ())?;
    let request = json!({ "server": server, "method": method, "params": params });
    let reply = (|| -> Option<Value> {
        writeln!(&pipe, "{request}").ok()?;
        let mut line = String::new();
        io::BufReader::new(&pipe).read_line(&mut line).ok()?;
        serde_json::from_str::<Value>(&line).ok()
    })();
    Ok(reply
        .map(|r| r["response"].clone())
        .filter(|r| !r.is_null()))
}

/// The app side on Windows: a named pipe that only its owner can open.
#[cfg(windows)]
pub struct Relay {
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    name: String,
}

#[cfg(windows)]
impl Relay {
    /// Listen on the pipe of `path` (see [`pipe_name`]). A second listener on the same name is
    /// refused: the first instance is created with `FILE_FLAG_FIRST_PIPE_INSTANCE`.
    pub fn listen(proxy: std::sync::Arc<Proxy>, path: &Path) -> io::Result<Self> {
        use std::os::windows::io::FromRawHandle;
        use std::sync::atomic::{AtomicBool, Ordering};
        use windows_sys::Win32::Foundation::{ERROR_PIPE_CONNECTED, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::Security::Authorization::{
            ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
        };
        use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_DUPLEX,
        };
        use windows_sys::Win32::System::Pipes::{
            ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS,
            PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
        };

        let name = pipe_name(path);
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        // Protected DACL: full access for the owner (`OW`) and nobody else. The default DACL of a
        // pipe lets every user read it. shortcut: an elevated process owns the pipe as the
        // Administrators group. Use the token SID if that matters.
        let sddl: Vec<u16> = "D:P(A;;GA;;;OW)\0".encode_utf16().collect();
        let mut descriptor = std::ptr::null_mut();
        // SAFETY: both pointers are valid for the call. The descriptor is never freed: one per run.
        let ok = unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                SDDL_REVISION_1,
                &mut descriptor,
                std::ptr::null_mut(),
            )
        };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        let descriptor = descriptor as usize;
        let create = move |first: bool| -> io::Result<std::fs::File> {
            let attributes = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: descriptor as *mut _,
                bInheritHandle: 0,
            };
            let open = PIPE_ACCESS_DUPLEX
                | if first {
                    FILE_FLAG_FIRST_PIPE_INSTANCE
                } else {
                    0
                };
            let mode = PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS;
            // SAFETY: `wide` ends with 0 and `attributes` lives until the call returns.
            let handle = unsafe {
                CreateNamedPipeW(
                    wide.as_ptr(),
                    open,
                    mode,
                    PIPE_UNLIMITED_INSTANCES,
                    64 * 1024,
                    64 * 1024,
                    0,
                    &attributes,
                )
            };
            if handle == INVALID_HANDLE_VALUE {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: the handle is new and valid, and nothing else owns it.
            Ok(unsafe { std::fs::File::from_raw_handle(handle) })
        };
        let mut pipe = create(true)?;

        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let thread = std::thread::spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                use std::os::windows::io::AsRawHandle;
                // SAFETY: the handle is a pipe that `pipe` owns. No overlapped I/O: it blocks.
                let linked =
                    unsafe { ConnectNamedPipe(pipe.as_raw_handle(), std::ptr::null_mut()) } != 0
                        || io::Error::last_os_error().raw_os_error()
                            == Some(ERROR_PIPE_CONNECTED as i32);
                // The next instance exists before this client is served: the name is never free.
                let Ok(next) = create(false) else { break };
                let served = std::mem::replace(&mut pipe, next);
                if linked && !flag.load(Ordering::Relaxed) {
                    let proxy = proxy.clone();
                    std::thread::spawn(move || answer(served, &proxy));
                }
            }
        });
        Ok(Self {
            stop,
            thread: Some(thread),
            name,
        })
    }
}

#[cfg(windows)]
impl Drop for Relay {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        // The thread waits in `ConnectNamedPipe`: a client of our own wakes it.
        let _ = std::fs::File::open(&self.name);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// One relayed request: a line in, a line out.
#[cfg(windows)]
fn answer(mut pipe: std::fs::File, proxy: &Proxy) {
    use std::io::Read;
    let mut line = String::new();
    if io::BufReader::new((&pipe).take(MAX_LINE))
        .read_line(&mut line)
        .unwrap_or(0)
        == 0
    {
        return;
    }
    if let Some(out) = respond(&line, proxy) {
        let _ = writeln!(pipe, "{out}");
        // Closing the pipe drops what the client did not read yet: wait until it has read it.
        let _ = pipe.sync_all();
    }
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
