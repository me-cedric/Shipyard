//! Headless agent runs (spec `factory`, REQ-015): one [`Runner`] per coding CLI, one driver.
//!
//! A runner knows two things about its CLI: how to start it ([`Runner::launch`]) and how to read
//! its streamed JSON ([`Parser`]). The driver ([`start`]) spawns the process in its own process
//! group, feeds it, turns each output line into [`Event`]s and ends with one [`Event::Exit`].
//! [`CancelHandle::cancel`] kills the whole group, so a launcher such as `npx` leaves no worker.
//!
//! Rules that hold for every runner:
//!
//! - No secret in an argument. A secret reaches the child in its environment ([`RunSpec::vars`])
//!   or in an owner-only file (MCP configuration, mode `0600`). Every event and every error text
//!   passes through [`Secret::scrub`] first, so a CLI that echoes a key writes `***` to the log.
//! - A line that is not JSON is dropped. A field that moved is skipped: a missing field costs a
//!   detail of an event, never the run (the parsers read by name, as Legacy's do).
//! - The caller owns the limits. [`Run::recv_timeout`] returns [`Recv::Idle`] when the stall
//!   timeout passes, [`Event::Turn`] counts turns, [`Run::elapsed`] gives the wall clock, and
//!   [`CancelHandle`] is the kill switch. Nothing here stops a run by itself.
//!
//! Adapted from Legacy: `application/cli/{run,stream,acp}.rs` (arguments, stream parsing, process
//! group kill) and `application/mcpcli.rs` (per-CLI MCP injection into owner-only files).

mod acp;
mod claude;
mod codex;
mod gemini;
mod opencode;
mod provider;
mod shipyard;

pub use provider::run_provider;
pub use shipyard::{BRIDGE_FLAG, TOKEN_ENV, URL_ENV};

use crate::AgentError;
use crate::which::{quiet, search_dirs, which};
use serde::Serialize;
use serde_json::Value;
use shipyard_secrets::Secret;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Longest text that a tool call or a tool result carries in an event.
const MAX_TEXT: usize = 4000;
/// How much of stderr an exit error keeps.
const STDERR_TAIL: usize = 2000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    /// Read and propose. The CLI refuses to write (a permission mode or an OS sandbox).
    Plan,
    /// Read, write and run ordinary commands in the workspace. Never a blanket bypass.
    Auto,
}

/// One MCP server for the run, normally the Shipyard server (`add-factory` REQ-037). The runner
/// writes it to the file or the profile that its CLI reads. Never to an argument.
#[derive(Debug, Clone)]
pub struct McpEntry {
    /// The name that the tools carry: Claude Code sees `mcp__<name>__<tool>`.
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub vars: Vec<(String, Secret)>,
    /// An HTTP entry: the CLI calls this endpoint itself and starts no process. `command` stays
    /// empty. Only a runner with [`Runner::http_mcp`] takes one.
    pub http: Option<HttpEntry>,
}

/// An MCP server that the CLI reaches over HTTP (`type: http`). The header values are secrets.
#[derive(Debug, Clone)]
pub struct HttpEntry {
    pub url: String,
    pub headers: Vec<(String, Secret)>,
}

#[derive(Debug, Clone)]
pub struct RunSpec {
    /// The brief. It reaches the CLI on stdin when the CLI reads it there, else as the last
    /// argument. It is not a secret: do not put one in it.
    pub prompt: String,
    pub model: Option<String>,
    /// A reasoning level in the words of the CLI. A CLI with no such setting ignores it.
    pub effort: Option<String>,
    pub mode: Mode,
    /// Tool names in the words of the CLI (`Read`, `Bash(git diff:*)`, `mcp__shipyard__report`).
    /// Used by Claude Code and Gemini CLI, to pre-approve. The others ignore the list.
    ///
    /// What stops a write in [`Mode::Plan`]: Claude Code gets `--tools` with the read tools only.
    /// Codex runs with `--sandbox read-only` (the operating system refuses the write). OpenCode
    /// runs its `plan` agent. Gemini and Copilot rely on their permission answers.
    pub allowed_tools: Vec<String>,
    /// The working directory: the worktree of the run.
    pub dir: PathBuf,
    /// A folder for the generated MCP files and the brief: absolute, outside `dir`, and its own
    /// to this unit (its last name tags the files). The app keeps it under the app data. Never
    /// in the worktree: a commit would take the token with it.
    pub scratch: PathBuf,
    pub mcp: Vec<McpEntry>,
    /// A session id that the CLI gave in an earlier run ([`Event::Session`]).
    pub resume: Option<String>,
    /// Environment variables of the child: provider keys, tokens. Scrubbed from every event.
    pub vars: Vec<(String, Secret)>,
    /// Use this program and skip the search on `PATH`. Tests use it.
    pub program: Option<PathBuf>,
    /// Where Codex keeps its configuration. `CODEX_HOME`, else `~/.codex`.
    pub codex_home: Option<PathBuf>,
}

impl RunSpec {
    pub fn new(
        prompt: impl Into<String>,
        dir: impl Into<PathBuf>,
        scratch: impl Into<PathBuf>,
    ) -> Self {
        let dir = dir.into();
        Self {
            prompt: prompt.into(),
            model: None,
            effort: None,
            mode: Mode::Plan,
            allowed_tools: Vec::new(),
            scratch: scratch.into(),
            dir,
            mcp: Vec::new(),
            resume: None,
            vars: Vec::new(),
            program: None,
            codex_home: None,
        }
    }
}

/// What a run reports, in order. Numbers in [`Event::Usage`] are to be summed.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    /// The id of the CLI session. Keep it to resume. Sent once.
    Session {
        id: String,
    },
    /// The agent began a turn (one model call). Count these for the max turns limit.
    Turn,
    Text {
        text: String,
    },
    ToolCall {
        id: String,
        name: String,
        /// What the call points at (a path, a command), capped.
        input: String,
    },
    ToolResult {
        id: String,
        ok: bool,
        output: String,
    },
    Usage {
        input_tokens: u64,
        output_tokens: u64,
        cached_tokens: u64,
        /// `None` when the CLI reports no price.
        cost_usd: Option<f64>,
    },
    /// The CLI or the provider reported a failure. [`Event::Exit`] follows.
    Error {
        message: String,
    },
    /// Always the last event.
    Exit {
        code: Option<i32>,
        cancelled: bool,
    },
}

/// How a runner starts its CLI.
pub struct Launch {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub vars: Vec<(String, Secret)>,
    pub stdin: Stdin,
    /// Files that hold secrets. The driver removes them when the run ends.
    pub cleanup: Vec<PathBuf>,
}

pub enum Stdin {
    /// No input.
    Closed,
    /// Write this text, then close.
    Text(String),
    /// Stay open: the parser writes the next lines (a JSON-RPC session).
    Open,
}

/// The reaction to one output line.
#[derive(Debug, Default)]
pub struct Step {
    pub events: Vec<Event>,
    /// Lines to write to the CLI.
    pub send: Vec<String>,
    /// The run is over though the process is not (a server that waits for more input).
    pub done: bool,
}

impl Step {
    fn events(events: Vec<Event>) -> Self {
        Self {
            events,
            ..Self::default()
        }
    }
}

pub trait Parser: Send {
    /// Lines to write at once, before any output. Only for [`Stdin::Open`].
    fn start(&mut self) -> Vec<String> {
        Vec::new()
    }

    /// One line of stdout that starts with `{`, without its newline.
    fn line(&mut self, line: &str) -> Step;
}

pub trait Runner: Send + Sync {
    /// The id of `runners::detect`: `claude`, `codex`, `copilot`, `gemini`, `opencode`.
    fn id(&self) -> &'static str;
    fn bin(&self) -> &'static str;
    fn launch(&self, spec: &RunSpec, program: PathBuf) -> Result<Launch, AgentError>;
    fn parser(&self, spec: &RunSpec) -> Box<dyn Parser>;
    /// The CLI reads an HTTP entry (`type: http` with headers) in its MCP config.
    fn http_mcp(&self) -> bool {
        false
    }
}

/// The runner for a detected runner id.
pub fn runner(id: &str) -> Option<Box<dyn Runner>> {
    Some(match id {
        "claude" => Box::new(claude::Claude),
        "codex" => Box::new(codex::Codex),
        "copilot" => Box::new(acp::Copilot),
        "gemini" => Box::new(gemini::Gemini),
        "opencode" => Box::new(opencode::OpenCode),
        _ => return None,
    })
}

/// The kill switch of one run. Cheap to clone and to send to another thread.
#[derive(Clone)]
pub struct CancelHandle {
    /// `None` for a provider call: there is no process to kill.
    pid: Option<u32>,
    flag: Arc<AtomicBool>,
    /// False once the driver reaped the process. A cancel after that kills nothing: the id may
    /// belong to another process by then.
    alive: Arc<Mutex<bool>>,
}

impl CancelHandle {
    /// End the run: mark it cancelled, then kill the process group. The run still ends with
    /// [`Event::Exit`] with `cancelled: true`. Safe to call again and after the run ended.
    pub fn cancel(&self) {
        self.flag.store(true, Ordering::SeqCst);
        if let Some(pid) = self.pid
            && *self.alive.lock().expect("alive lock")
        {
            kill_group(pid);
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }
}

pub enum Recv {
    Event(Event),
    /// Nothing came within the time: the caller decides whether the step stalled.
    Idle,
    /// The run ended and the last event was read.
    Done,
}

/// A run in progress. Dropping it cancels the run.
pub struct Run {
    rx: Receiver<Event>,
    cancel: CancelHandle,
    started: Instant,
}

impl Run {
    pub fn cancel_handle(&self) -> CancelHandle {
        self.cancel.clone()
    }

    pub fn cancel(&self) {
        self.cancel.cancel();
    }

    pub fn elapsed(&self) -> Duration {
        self.started.elapsed()
    }

    /// The next event, blocking. `None` after [`Event::Exit`].
    pub fn recv(&self) -> Option<Event> {
        self.rx.recv().ok()
    }

    /// The next event, or [`Recv::Idle`] after `wait`: the hook for the stall timeout.
    pub fn recv_timeout(&self, wait: Duration) -> Recv {
        match self.rx.recv_timeout(wait) {
            Ok(e) => Recv::Event(e),
            Err(RecvTimeoutError::Timeout) => Recv::Idle,
            Err(RecvTimeoutError::Disconnected) => Recv::Done,
        }
    }

    /// Read to the end. Use it in a test or after a cancel.
    pub fn finish(&self) -> Vec<Event> {
        std::iter::from_fn(|| self.recv()).collect()
    }
}

impl Drop for Run {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}

/// A run with no process: a thread that sends events. Used by the HTTP provider.
pub(crate) fn thread_run(
    work: impl FnOnce(&CancelHandle, &mpsc::Sender<Event>) + Send + 'static,
) -> Run {
    let (tx, rx) = mpsc::channel();
    let cancel = CancelHandle {
        pid: None,
        flag: Arc::new(AtomicBool::new(false)),
        alive: Arc::new(Mutex::new(false)),
    };
    let handle = cancel.clone();
    std::thread::spawn(move || work(&handle, &tx));
    Run {
        rx,
        cancel,
        started: Instant::now(),
    }
}

/// Start a run. The checks come first, and none starts a process when it fails.
pub fn start(runner: &dyn Runner, spec: RunSpec) -> Result<Run, AgentError> {
    check_spec(&spec)?;
    if !runner.http_mcp() && spec.mcp.iter().any(|m| m.http.is_some()) {
        return Err(AgentError::Invalid(format!(
            "{} takes no HTTP MCP entry",
            runner.id()
        )));
    }
    let program = match &spec.program {
        Some(p) => p.clone(),
        None => which(runner.bin(), &search_dirs())
            .ok_or_else(|| AgentError::Run(format!("{} is not installed", runner.bin())))?,
    };
    let launch = runner.launch(&spec, program)?;
    let parser = runner.parser(&spec);
    spawn(launch, parser, &spec)
}

fn spawn(launch: Launch, mut parser: Box<dyn Parser>, spec: &RunSpec) -> Result<Run, AgentError> {
    let secrets: Vec<Secret> = launch
        .vars
        .iter()
        .chain(&spec.vars)
        .chain(spec.mcp.iter().flat_map(|m| m.vars.iter()))
        .chain(
            spec.mcp
                .iter()
                .filter_map(|m| m.http.as_ref())
                .flat_map(|h| h.headers.iter()),
        )
        .map(|(_, s)| s.clone())
        .filter(|s| !s.is_empty())
        .collect();
    // A header holds `Bearer <token>`: scrub the bare token too.
    let secrets: Vec<Secret> = secrets
        .iter()
        .cloned()
        .chain(
            secrets
                .iter()
                .filter_map(|s| s.expose().strip_prefix("Bearer ").map(Secret::new)),
        )
        .collect();

    // The brief is read from a file, not from a pipe. A pipe ends only when every copy of its
    // write end is closed, and a process that another thread forks at the same moment can hold
    // a copy for a long time: the CLI would wait for an end of input that never comes.
    let mut cleanup = launch.cleanup;
    let stdin = match &launch.stdin {
        Stdin::Closed => Stdio::null(),
        Stdin::Open => Stdio::piped(),
        Stdin::Text(text) => {
            let path = spec.scratch.join(format!("prompt-{}.txt", run_tag(spec)));
            write_private(&path, text)?;
            let file = std::fs::File::open(&path)
                .map_err(|e| AgentError::Run(format!("cannot read the brief: {e}")))?;
            cleanup.push(path);
            Stdio::from(file)
        }
    };
    let mut cmd = Command::new(&launch.program);
    cmd.args(&launch.args)
        .current_dir(&spec.dir)
        .stdin(stdin)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (k, v) in spec.vars.iter().chain(&launch.vars) {
        cmd.env(k, v.expose());
    }
    // A launcher (`npx`, a node wrapper) starts the real worker. Own group: cancel kills both.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    quiet(&mut cmd);
    let mut child = {
        // On macOS the standard library makes a pipe, then marks it close-on-exec in a second
        // call. A child that another thread starts in between keeps the pipe open for as long as
        // it lives, so the reader of this run would never see an end of output. One start at a
        // time closes that gap for every run that this module starts.
        static SPAWN: Mutex<()> = Mutex::new(());
        let _one_at_a_time = SPAWN.lock().unwrap_or_else(|e| e.into_inner());
        cmd.spawn().map_err(|e| {
            AgentError::Run(format!("cannot start {}: {e}", launch.program.display()))
        })?
    };
    let pid = child.id();
    let cancel = CancelHandle {
        pid: Some(pid),
        flag: Arc::new(AtomicBool::new(false)),
        alive: Arc::new(Mutex::new(true)),
    };
    let (tx, rx) = mpsc::channel();
    let started = Instant::now();

    let stdout = child.stdout.take().expect("stdout is piped");
    let stderr = child.stderr.take().expect("stderr is piped");
    let mut stdin = child.stdin.take();
    let open = matches!(launch.stdin, Stdin::Open);
    let watcher = cancel.clone();

    std::thread::spawn(move || {
        let tail = Arc::new(Mutex::new(Vec::<u8>::new()));
        let err_tail = tail.clone();
        let err_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            let mut stderr = stderr;
            while let Ok(n) = stderr.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let mut t = err_tail.lock().expect("stderr tail");
                t.extend_from_slice(&buf[..n]);
                let over = t.len().saturating_sub(STDERR_TAIL * 2);
                t.drain(..over);
            }
        });

        // The reader thread turns lines into events. This thread waits for the process, not for
        // the pipe: a worker that a launcher forked at the moment of a kill keeps the pipe
        // open, and a wait on the pipe would never end. When the leader is gone, one more kill
        // of the group ends that worker, and then the reader sees the end of the output.
        let done = Arc::new(AtomicBool::new(false));
        let failed = Arc::new(AtomicBool::new(false));
        let reader_tx = tx.clone();
        let reader_secrets = secrets.clone();
        let (reader_done, reader_failed, reader_cancel) =
            (done.clone(), failed.clone(), watcher.clone());
        let reader = std::thread::spawn(move || {
            let emit = |e: Event| -> bool {
                reader_failed.fetch_or(matches!(e, Event::Error { .. }), Ordering::SeqCst);
                let ok = reader_tx.send(scrub_event(e, &reader_secrets)).is_ok();
                if !ok {
                    // The reader of the run is gone: nobody wants it.
                    reader_cancel.cancel();
                }
                ok
            };
            let write = |stdin: &mut Option<std::process::ChildStdin>, text: &str| {
                if let Some(s) = stdin.as_mut() {
                    let ok = s
                        .write_all(text.as_bytes())
                        .and_then(|()| s.write_all(b"\n"))
                        .and_then(|()| s.flush());
                    if ok.is_err() {
                        *stdin = None;
                    }
                }
            };
            if open {
                for l in parser.start() {
                    write(&mut stdin, &l);
                }
            }
            let mut reader = BufReader::new(stdout);
            let mut raw = Vec::new();
            'read: loop {
                raw.clear();
                // Bytes, not `lines()`: a CLI that prints a bad UTF-8 byte must not end the run.
                match reader.read_until(b'\n', &mut raw) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {}
                }
                let line = String::from_utf8_lossy(&raw);
                let line = line.trim_end_matches(['\n', '\r']);
                if !line.trim_start().starts_with('{') {
                    continue;
                }
                let step = parser.line(line);
                for e in step.events {
                    if !emit(e) {
                        break 'read;
                    }
                }
                for l in &step.send {
                    write(&mut stdin, l);
                }
                if step.done {
                    reader_done.store(true, Ordering::SeqCst);
                    break;
                }
            }
        });

        let mut killed = false;
        let status = loop {
            if !killed && (done.load(Ordering::SeqCst) || watcher.is_cancelled()) {
                kill_group(pid);
                killed = true;
            }
            match child.try_wait() {
                Ok(Some(status)) => break Some(status),
                Ok(None) => std::thread::sleep(Duration::from_millis(10)),
                Err(_) => break None,
            }
        };
        // The leader is gone. Whatever it left in the group dies now, and the pipes close.
        // After this the id is not ours.
        {
            let mut alive = watcher.alive.lock().expect("alive lock");
            kill_group(pid);
            *alive = false;
        }
        let _ = reader.join();
        let _ = err_thread.join();
        for f in &cleanup {
            let _ = std::fs::remove_file(f);
        }

        let cancelled = watcher.is_cancelled();
        let finished = done.load(Ordering::SeqCst);
        let code = if finished && !cancelled {
            Some(0)
        } else {
            status.and_then(|s| s.code())
        };
        let send = |e: Event| {
            let _ = tx.send(scrub_event(e, &secrets));
        };
        if !cancelled && !failed.load(Ordering::SeqCst) && code != Some(0) {
            let bytes = tail.lock().expect("stderr tail").clone();
            let text = String::from_utf8_lossy(&bytes);
            let text = text.trim();
            let message = if text.is_empty() {
                match code {
                    Some(c) => format!("the agent exited with code {c}"),
                    None => "the agent was stopped by a signal".to_string(),
                }
            } else {
                tail_chars(text, STDERR_TAIL)
            };
            send(Event::Error { message });
        }
        send(Event::Exit { code, cancelled });
    });

    Ok(Run {
        rx,
        cancel,
        started,
    })
}

/// SIGKILL to the process group `pid` leads (Unix), or the process tree (Windows).
pub fn kill_group(pid: u32) {
    #[cfg(unix)]
    {
        // SAFETY: `killpg` only sends a signal; it touches no memory. A group id that no longer
        // exists gives ESRCH, which is the answer we want.
        unsafe { libc::killpg(pid as i32, libc::SIGKILL) };
    }
    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let _ = quiet(&mut cmd).status();
    }
}

fn check_spec(spec: &RunSpec) -> Result<(), AgentError> {
    let bad = |m: &str| Err(AgentError::Invalid(m.to_string()));
    if spec.prompt.trim().is_empty() {
        return bad("the prompt is empty");
    }
    if !spec.dir.is_dir() {
        return Err(AgentError::Invalid(format!(
            "the workspace is not a folder: {}",
            spec.dir.display()
        )));
    }
    if !spec.scratch.is_absolute() || spec.scratch.starts_with(&spec.dir) {
        return bad("the scratch folder must be absolute and outside the workspace");
    }
    // These go into arguments: a leading `-` would be read as a flag.
    for (what, v) in [("model", &spec.model), ("effort", &spec.effort)] {
        if let Some(v) = v
            && !plain_word(v, "._:/@+")
        {
            return Err(AgentError::Invalid(format!("not a valid {what}: {v}")));
        }
    }
    if let Some(id) = &spec.resume
        && !plain_word(id, "._")
    {
        return Err(AgentError::Invalid(format!("not a valid session id: {id}")));
    }
    if spec
        .allowed_tools
        .iter()
        .any(|t| t.trim().is_empty() || t.contains(',') || t.chars().any(char::is_control))
    {
        return bad("a tool name is empty, holds a comma or holds a control character");
    }
    for m in &spec.mcp {
        let target = match &m.http {
            Some(h) => {
                h.url.starts_with("http") && h.headers.iter().all(|(k, _)| plain_word(k, ""))
            }
            None => !m.command.trim().is_empty(),
        };
        if !plain_word(&m.name, "_") || !target {
            return Err(AgentError::Invalid(format!(
                "not a valid MCP entry: {}",
                m.name
            )));
        }
    }
    Ok(())
}

/// Letters, digits, `-` inside, and the `extra` characters. Never empty, never `-` first.
fn plain_word(v: &str, extra: &str) -> bool {
    !v.is_empty()
        && v.len() <= 128
        && !v.starts_with('-')
        && v.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || extra.contains(c))
}

/// Write `text` to `path`, readable by the owner only. The mode is set before the secrets go in,
/// so no window opens. A folder that this call creates is `0700`.
pub(crate) fn write_private(path: &Path, text: &str) -> Result<(), AgentError> {
    let io = |e: std::io::Error| AgentError::Run(format!("cannot write {}: {e}", path.display()));
    if let Some(dir) = path.parent()
        && !dir.exists()
    {
        std::fs::create_dir_all(dir).map_err(io)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700)).map_err(io)?;
        }
    }
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts.open(path).map_err(io)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // A file that existed keeps its old mode through `open`.
        file.set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(io)?;
    }
    file.write_all(text.as_bytes()).map_err(io)
}

/// The MCP entries as `{"<name>": {"command", "args", "env"}}`. The env holds the secrets, so
/// the result goes to a private file only.
pub(crate) fn mcp_map(entries: &[McpEntry]) -> Value {
    let mut map = serde_json::Map::new();
    let secret_map = |pairs: &[(String, Secret)]| -> serde_json::Map<String, Value> {
        pairs
            .iter()
            .map(|(k, v)| (k.clone(), Value::String(v.expose().to_string())))
            .collect()
    };
    for e in entries {
        if let Some(h) = &e.http {
            let entry = serde_json::json!({ "type": "http", "url": h.url, "headers": secret_map(&h.headers) });
            map.insert(e.name.clone(), entry);
            continue;
        }
        let vars = secret_map(&e.vars);
        map.insert(
            e.name.clone(),
            serde_json::json!({ "command": e.command, "args": e.args, "env": vars }),
        );
    }
    Value::Object(map)
}

/// A file name part that is safe on every system: the last folder of the scratch path.
pub(crate) fn run_tag(spec: &RunSpec) -> String {
    let tag: String = spec
        .scratch
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(40)
        .collect();
    if tag.is_empty() { "run".into() } else { tag }
}

pub(crate) fn json(line: &str) -> Option<Value> {
    serde_json::from_str(line).ok()
}

pub(crate) fn s(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

pub(crate) fn n(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(Value::as_u64).unwrap_or_default()
}

/// The first number named `key`, anywhere in the value. The CLIs move counters between versions;
/// the name stays (Legacy's `find_i64`).
pub(crate) fn find_u64(v: &Value, key: &str) -> Option<u64> {
    match v {
        Value::Object(map) => map
            .get(key)
            .and_then(Value::as_u64)
            .or_else(|| map.values().find_map(|x| find_u64(x, key))),
        Value::Array(a) => a.iter().find_map(|x| find_u64(x, key)),
        _ => None,
    }
}

/// The text a tool points at: a path first, then a command, a pattern, an address. Capped.
pub(crate) fn tool_target(input: Option<&Value>) -> String {
    const KEYS: [&str; 8] = [
        "file_path",
        "notebook_path",
        "path",
        "command",
        "pattern",
        "url",
        "query",
        "description",
    ];
    let Some(map) = input.and_then(Value::as_object) else {
        return String::new();
    };
    KEYS.iter()
        .find_map(|k| {
            map.get(*k)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|t| !t.is_empty())
        })
        .map(cap)
        .unwrap_or_default()
}

/// Cut to [`MAX_TEXT`] characters.
pub(crate) fn cap(text: &str) -> String {
    if text.chars().count() <= MAX_TEXT {
        return text.to_string();
    }
    let mut out: String = text.chars().take(MAX_TEXT).collect();
    out.push('\u{2026}');
    out
}

fn tail_chars(text: &str, max: usize) -> String {
    let n = text.chars().count();
    text.chars().skip(n.saturating_sub(max)).collect()
}

fn scrub_event(event: Event, secrets: &[Secret]) -> Event {
    let scrub = |t: String| secrets.iter().fold(t, |t, s| s.scrub(&t));
    match event {
        Event::Text { text } => Event::Text { text: scrub(text) },
        Event::ToolCall { id, name, input } => Event::ToolCall {
            id,
            name,
            input: scrub(input),
        },
        Event::ToolResult { id, ok, output } => Event::ToolResult {
            id,
            ok,
            output: scrub(output),
        },
        Event::Error { message } => Event::Error {
            message: scrub(message),
        },
        other => other,
    }
}
