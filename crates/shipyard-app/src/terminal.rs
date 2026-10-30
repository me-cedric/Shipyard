//! The terminal of Code (spec `code`, REQ-034, REQ-035): a login shell on a PTY, streamed to the
//! webview as Tauri events. Adapted from Legacy `infrastructure/pty.rs` (ADR 0012).
//!
//! The app never writes a secret to the shell: a variable of the environment that holds a value
//! of a connection or a provider is removed before the shell starts. Closing the panel ends the
//! shell and its process group (`close`). The app exit ends every shell (`close_all`).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, OnceLock};

use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter};

use crate::commands::{AppState, Res, blocking, err};

/// One event name for every shell. The payload holds the id: a panel reads only its own.
pub const OUTPUT_EVENT: &str = "terminal-output";
pub const EXIT_EVENT: &str = "terminal-exit";

/// The payload of the event `terminal-output`. The event `terminal-exit` has the shell id as its
/// payload (a string). A panel reads only the events with its own id.
#[derive(Debug, Clone, Serialize, Type)]
pub struct TerminalOutput {
    pub id: String,
    pub data: String,
}

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

fn sessions() -> MutexGuard<'static, HashMap<String, Session>> {
    static S: OnceLock<Mutex<HashMap<String, Session>>> = OnceLock::new();
    S.get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.max(2),
        rows: rows.max(2),
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// The shell of the preferences when that file exists, else `$SHELL`.
fn shell_program(chosen: &str) -> String {
    if !chosen.is_empty() && Path::new(chosen).is_file() {
        return chosen.into();
    }
    if cfg!(windows) {
        return "powershell.exe".into();
    }
    std::env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "/bin/sh".into())
}

/// The shell command: a login shell at `cwd`, with no secret in its environment (REQ-035).
fn shell_command(program: &str, cwd: &Path, secrets: &[String]) -> CommandBuilder {
    let mut cmd = CommandBuilder::new(program);
    #[cfg(not(windows))]
    cmd.arg("-l");
    cmd.cwd(cwd);
    if let Ok(path) = std::env::join_paths(shipyard_agents::which::search_dirs()) {
        cmd.env("PATH", path);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    let leaked: Vec<std::ffi::OsString> = cmd
        .iter_full_env_as_str()
        .filter(|(_, v)| {
            secrets
                .iter()
                .any(|s| s.len() >= 4 && v.contains(s.as_str()))
        })
        .map(|(k, _)| k.into())
        .collect();
    for k in leaked {
        cmd.env_remove(k);
    }
    cmd
}

/// A multi-byte character split across two reads is held until its end arrives.
#[derive(Default)]
struct Decoder(Vec<u8>);

impl Decoder {
    fn push(&mut self, bytes: &[u8]) -> String {
        self.0.extend_from_slice(bytes);
        let mut out = String::new();
        loop {
            match std::str::from_utf8(&self.0) {
                Ok(t) => {
                    out.push_str(t);
                    self.0.clear();
                    return out;
                }
                Err(e) => {
                    let good = e.valid_up_to();
                    out.push_str(&String::from_utf8_lossy(&self.0[..good]));
                    match e.error_len() {
                        None => {
                            self.0.drain(..good);
                            return out;
                        }
                        Some(n) => {
                            out.push(char::REPLACEMENT_CHARACTER);
                            self.0.drain(..good + n);
                        }
                    }
                }
            }
        }
    }
}

fn kill(mut s: Session) {
    if let Some(pid) = s.child.process_id() {
        shipyard_agents::runner::kill_group(pid);
    }
    let _ = s.child.kill();
    let _ = s.child.wait();
}

/// Starts a shell under `id` in `cwd` and streams its output as events.
pub fn open(
    app: AppHandle,
    id: &str,
    cwd: &Path,
    secrets: &[String],
    shell: &str,
    cols: u16,
    rows: u16,
) -> Res<()> {
    if sessions().contains_key(id) {
        return Err("that terminal is already open".into());
    }
    let pair = NativePtySystem::default()
        .openpty(size(cols, rows))
        .map_err(|e| format!("failed to open a terminal: {e}"))?;
    let program = shell_program(shell);
    let child = pair
        .slave
        .spawn_command(shell_command(&program, cwd, secrets))
        .map_err(|e| format!("failed to start {program}: {e}"))?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(err)?;
    let writer = pair.master.take_writer().map_err(err)?;
    sessions().insert(
        id.to_string(),
        Session {
            writer,
            master: pair.master,
            child,
        },
    );
    let id = id.to_string();
    std::thread::spawn(move || {
        let (mut buf, mut dec) = ([0u8; 8192], Decoder::default());
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            let data = dec.push(&buf[..n]);
            if !data.is_empty()
                && app
                    .emit(
                        OUTPUT_EVENT,
                        TerminalOutput {
                            id: id.clone(),
                            data,
                        },
                    )
                    .is_err()
            {
                break;
            }
        }
        if let Some(s) = sessions().remove(&id) {
            kill(s);
        }
        let _ = app.emit(EXIT_EVENT, id);
    });
    Ok(())
}

pub fn write(id: &str, data: &str) -> Res<()> {
    let mut map = sessions();
    let s = map.get_mut(id).ok_or("that terminal is closed")?;
    s.writer.write_all(data.as_bytes()).map_err(err)?;
    s.writer.flush().map_err(err)
}

pub fn resize(id: &str, cols: u16, rows: u16) -> Res<()> {
    let map = sessions();
    let s = map.get(id).ok_or("that terminal is closed")?;
    s.master.resize(size(cols, rows)).map_err(err)
}

/// Ends the shell: the panel closed (REQ-035).
pub fn close(id: &str) {
    let found = sessions().remove(id);
    if let Some(s) = found {
        kill(s);
    }
}

/// Ends every shell: the app quits.
pub fn close_all() {
    let all: Vec<Session> = sessions().drain().map(|(_, s)| s).collect();
    all.into_iter().for_each(kill);
}

/// The folder of the shell: the project root, or a folder under it (REQ-034). A path that leaves
/// the root, or is no folder, is refused.
pub fn start_dir(s: &AppState, folder: Option<&str>) -> Res<std::path::PathBuf> {
    let root = s.registry()?.active().cloned().ok_or("no active project")?;
    let root = Path::new(&root.path).canonicalize().map_err(err)?;
    let Some(rel) = folder.filter(|f| !f.is_empty()) else {
        return Ok(root);
    };
    let dir = root.join(rel).canonicalize().map_err(err)?;
    if dir.starts_with(&root) && dir.is_dir() {
        Ok(dir)
    } else {
        Err(format!("{rel} is not a folder of the project"))
    }
}

fn secrets(s: &AppState) -> Vec<String> {
    let mut all = s.agents.secret_values();
    all.extend(s.connections.secret_values());
    all
}

/// Opens a terminal. `folder` is relative to the project root. Returns the id of the shell.
#[tauri::command]
#[specta::specta]
pub async fn terminal_open(
    app: AppHandle,
    id: String,
    folder: Option<String>,
    cols: u16,
    rows: u16,
) -> Res<String> {
    let handle = app.clone();
    blocking(app, move |s| {
        let dir = start_dir(s, folder.as_deref())?;
        let shell = shipyard_store::prefs::Prefs::load(&s.dir).terminal_shell;
        open(handle, &id, &dir, &secrets(s), &shell, cols, rows)?;
        Ok(id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_write(id: String, data: String) -> Res<()> {
    write(&id, &data)
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_resize(id: String, cols: u16, rows: u16) -> Res<()> {
    resize(&id, cols, rows)
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_close(id: String) -> Res<()> {
    close(&id);
    Ok(())
}

/// Ends the shells of an earlier page load: the page starts, and no shell of it is open.
#[tauri::command]
#[specta::specta]
pub async fn terminal_close_all() -> Res<()> {
    close_all();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_shell_environment_holds_no_secret_value() {
        // SAFETY: the variable name is unique to this test.
        unsafe { std::env::set_var("SHIPYARD_TEST_LEAK", "tok-connection-secret") };
        let cmd = shell_command("/bin/sh", Path::new("/"), &["tok-connection-secret".into()]);
        let vars: Vec<(String, String)> = cmd
            .iter_full_env_as_str()
            .map(|(k, v)| (k.into(), v.into()))
            .collect();
        assert!(
            vars.iter()
                .all(|(_, v)| !v.contains("tok-connection-secret"))
        );
        assert!(
            vars.iter()
                .any(|(k, v)| k == "TERM" && v == "xterm-256color")
        );
        let kept = shell_command("/bin/sh", Path::new("/"), &[]);
        assert!(
            kept.iter_full_env_as_str()
                .any(|(k, _)| k == "SHIPYARD_TEST_LEAK")
        );
    }

    #[test]
    fn a_missing_chosen_shell_falls_back_to_the_default() {
        assert_eq!(shell_program("/bin/sh"), "/bin/sh");
        assert_ne!(shell_program("/no/such/shell"), "/no/such/shell");
    }

    #[test]
    fn a_split_character_is_repaired() {
        let mut d = Decoder::default();
        let bytes = "❯".as_bytes();
        assert_eq!(d.push(&bytes[..1]), "");
        assert_eq!(d.push(&bytes[1..]), "❯");
    }

    #[test]
    fn the_start_folder_stays_in_the_project() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("proj");
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::process::Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["init", "-q"])
            .status()
            .unwrap();
        let s = AppState::new(tmp.path().join("data"));
        crate::commands::projects::open(&s, root.to_str().unwrap()).unwrap();
        assert!(start_dir(&s, Some("src")).unwrap().ends_with("src"));
        assert!(start_dir(&s, Some("..")).is_err());
        assert!(start_dir(&s, Some("missing")).is_err());
    }
}
