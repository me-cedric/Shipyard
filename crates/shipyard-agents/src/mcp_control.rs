//! MCP servers: the catalogue, custom servers, start, stop, state and dependencies
//! (REQ-006, REQ-007, REQ-008).
//!
//! [`McpControl`] owns the child processes. It starts a server on demand, keeps it open between
//! calls, starts it again when it died, and stops it on request and at quit. `shipyard-mcp`
//! (proxy, relay) sends requests through it. Persisting [`McpConfig`] is the job of the settings
//! store (REQ-013): this type holds the config in memory and hands it back.
//!
//! Secrets: each field of a server is one keychain entry, `conn:<server>/<field>`. A secret
//! reaches the child process in its environment and nowhere else: not in an argument, not in
//! [`McpConfig`], not in a log (REQ-011). A catalogue server that needs a secret takes it by
//! variable name (`-e VAR` for Docker), never by value.
//!
//! shortcut: a stop closes the child's input, waits 300 ms, then kills the child. A launcher that
//! starts a grandchild (`npx`) and does not forward the close can leave the grandchild running.
//! Put the child in its own process group and kill the group if that shows.

use crate::AgentError;
use crate::which::{quiet, search_dirs, which};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_http::base_url;
use shipyard_secrets::{Secret, SecretStore, conn_account};
use std::collections::{BTreeMap, HashMap};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard, TryLockError};
use std::time::{Duration, Instant};

/* ---------- Definitions ---------- */

/// One input of a server. Each value is a keychain entry, secret or not.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Field {
    pub key: String,
    pub label: String,
    /// The view masks a secret field.
    pub secret: bool,
}

/// A header `Basic base64(user:secret)` that goes to the process in one variable
/// (Atlassian API tokens).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BasicAuth {
    pub user_field: String,
    pub secret_field: String,
    pub env_var: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServerDef {
    /// A catalogue id, or `custom-<slug>`. Never holds `__` (the proxy joins names with it).
    pub id: String,
    pub category: String,
    pub label: String,
    pub description: String,
    pub command: String,
    pub args: Vec<String>,
    /// `(environment variable, field key)`.
    pub env: Vec<(String, String)>,
    pub basic_auth: Option<BasicAuth>,
    pub fields: Vec<Field>,
    pub custom: bool,
}

/// What the settings store keeps (REQ-013): the custom servers and the enabled ids. No secret.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpConfig {
    #[serde(default)]
    pub custom: Vec<ServerDef>,
    #[serde(default)]
    pub enabled: Vec<String>,
}

fn def(
    id: &str,
    category: &str,
    label: &str,
    description: &str,
    launch: &[&str],
    env: &[(&str, &str)],
    fields: &[(&str, &str, bool)],
) -> ServerDef {
    ServerDef {
        id: id.into(),
        category: category.into(),
        label: label.into(),
        description: description.into(),
        command: launch[0].into(),
        args: launch[1..].iter().map(|a| a.to_string()).collect(),
        env: env
            .iter()
            .map(|(v, f)| (v.to_string(), f.to_string()))
            .collect(),
        basic_auth: None,
        fields: fields
            .iter()
            .map(|(key, label, secret)| Field {
                key: key.to_string(),
                label: label.to_string(),
                secret: *secret,
            })
            .collect(),
        custom: false,
    }
}

/// The built-in servers. Each one is a stdio server that its vendor publishes.
/// A server that only answers over HTTP is a custom server with an address.
pub fn catalogue() -> Vec<ServerDef> {
    let mut jira = def(
        "jira",
        "work",
        "Jira and Confluence",
        "Atlassian Remote MCP server, through mcp-remote, with an Atlassian API token.",
        &[
            "npx",
            "-y",
            "mcp-remote@latest",
            "https://mcp.atlassian.com/v1/mcp",
            "--header",
            "Authorization:${ATLASSIAN_AUTH}",
        ],
        &[],
        &[
            ("email", "Atlassian account email", false),
            ("token", "API token", true),
        ],
    );
    jira.basic_auth = Some(BasicAuth {
        user_field: "email".into(),
        secret_field: "token".into(),
        env_var: "ATLASSIAN_AUTH".into(),
    });
    vec![
        def(
            "figma",
            "design",
            "Figma",
            "Reads Figma file layout, components and styles.",
            &["npx", "-y", "figma-developer-mcp", "--stdio"],
            &[("FIGMA_API_KEY", "token")],
            &[("token", "Figma API token", true)],
        ),
        jira,
        def(
            "azure",
            "cloud",
            "Azure",
            "Microsoft Azure MCP server. Sign in with `az login` first.",
            &["npx", "-y", "@azure/mcp@latest", "server", "start"],
            &[],
            &[],
        ),
        def(
            "aws",
            "cloud",
            "AWS",
            "AWS API MCP server. Sign in with `aws sso login` first.",
            &["uvx", "awslabs.aws-api-mcp-server@latest"],
            &[],
            &[],
        ),
        def(
            "gcp",
            "cloud",
            "Google Cloud",
            "gcloud MCP server. Sign in with `gcloud auth login` first.",
            &["npx", "-y", "@google-cloud/gcloud-mcp"],
            &[],
            &[],
        ),
        def(
            "terraform",
            "cloud",
            "Terraform",
            "HashiCorp Terraform MCP server: the public registry.",
            &["terraform-mcp-server", "stdio"],
            &[],
            &[],
        ),
        def(
            "likec4",
            "design",
            "LikeC4",
            "Reads the LikeC4 models of the project folder.",
            &["npx", "-y", "@likec4/mcp"],
            &[],
            &[],
        ),
        def(
            "context7",
            "data",
            "Context7",
            "Current documentation for the libraries an agent uses.",
            &["npx", "-y", "@upstash/context7-mcp"],
            &[],
            &[],
        ),
        def(
            "chrome-devtools",
            "browser",
            "Chrome DevTools",
            "Drives Chrome: console, network, screenshots. Starts with an empty profile.",
            &["npx", "-y", "chrome-devtools-mcp@latest", "--isolated"],
            &[],
            &[],
        ),
        def(
            "playwright",
            "browser",
            "Playwright",
            "Drives a browser through the page structure. Starts with an empty profile.",
            &["npx", "-y", "@playwright/mcp@latest", "--isolated"],
            &[],
            &[],
        ),
        def(
            "semgrep",
            "quality",
            "Semgrep",
            "Scans code for security issues on this machine.",
            &["uvx", "semgrep", "mcp"],
            &[],
            &[],
        ),
        def(
            "sonarqube",
            "quality",
            "SonarQube",
            "Issues, quality gates and metrics. Use a user token.",
            &[
                "docker",
                "run",
                "-i",
                "--rm",
                "--init",
                "--pull=always",
                "-e",
                "SONARQUBE_TOKEN",
                "-e",
                "SONARQUBE_URL",
                "mcp/sonarqube",
            ],
            &[("SONARQUBE_TOKEN", "token"), ("SONARQUBE_URL", "url")],
            &[
                ("url", "SonarQube URL", false),
                ("token", "SonarQube user token", true),
            ],
        ),
        def(
            "elasticsearch",
            "data",
            "Elasticsearch",
            "Lists indices, reads mappings and runs searches.",
            &[
                "docker",
                "run",
                "-i",
                "--rm",
                "-e",
                "ES_URL",
                "-e",
                "ES_API_KEY",
                "docker.elastic.co/mcp/elasticsearch",
                "stdio",
            ],
            &[("ES_URL", "url"), ("ES_API_KEY", "api_key")],
            &[
                ("url", "Elasticsearch URL", false),
                ("api_key", "Elasticsearch API key", true),
            ],
        ),
    ]
}

/* ---------- Custom servers ---------- */

#[derive(Debug, Clone, Default)]
pub struct CustomInput {
    /// Set to edit a custom server. It starts with `custom-`.
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    /// A command, or an `https` address (an `http` address on a local host also works).
    pub command: String,
    pub args: Vec<String>,
    /// `(variable, value)`. An empty value keeps the stored one.
    pub env: Vec<(String, Secret)>,
}

fn valid_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some('_' | 'A'..='Z' | 'a'..='z'))
        && chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
}

fn custom_id(name: &str) -> String {
    let slug: Vec<String> = name
        .to_ascii_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect();
    format!(
        "custom-{}",
        if slug.is_empty() {
            "server".into()
        } else {
            slug.join("-")
        }
    )
}

fn invalid(why: &str) -> AgentError {
    AgentError::Invalid(why.into())
}

fn normalize(input: CustomInput) -> Result<(ServerDef, BTreeMap<String, Secret>), AgentError> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(invalid("the MCP server name holds 1 to 80 characters"));
    }
    let command = input.command.trim();
    if command.is_empty() || command.len() > 4096 || command.contains('\0') {
        return Err(invalid("the MCP command is invalid"));
    }
    let (command, args) = if command.starts_with("http://") || command.starts_with("https://") {
        // The address holds no credential or query: a secret never goes in a URL.
        let mut args = vec![
            "-y".to_string(),
            "mcp-remote@latest".to_string(),
            base_url(command)?,
        ];
        args.extend(input.args);
        ("npx".to_string(), args)
    } else {
        (command.to_string(), input.args)
    };
    if args.len() > 64 || args.iter().any(|a| a.len() > 8192 || a.contains('\0')) {
        return Err(invalid("the MCP arguments are invalid"));
    }
    if input.env.len() > 64 || input.env.iter().any(|(key, _)| !valid_env_key(key)) {
        return Err(invalid("an MCP environment variable name is invalid"));
    }
    let id = match input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        None => custom_id(name),
        Some(id)
            if id.starts_with("custom-")
                && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') =>
        {
            id.to_string()
        }
        Some(_) => return Err(invalid("the custom MCP server id is invalid")),
    };
    let values: BTreeMap<String, Secret> = input.env.into_iter().collect();
    let keys: Vec<&String> = values.keys().collect();
    let mut server = def(
        &id,
        "custom",
        name,
        input.description.trim(),
        &[&command],
        &[],
        &[],
    );
    server.args = args;
    server.env = keys.iter().map(|k| ((*k).clone(), (*k).clone())).collect();
    server.fields = keys
        .iter()
        .map(|k| Field {
            key: (*k).clone(),
            label: (*k).clone(),
            secret: true,
        })
        .collect();
    server.custom = true;
    Ok((server, values))
}

/* ---------- Dependencies ---------- */

struct Known {
    command: &'static str,
    /// What to call it to a person: nobody installs "npx".
    label: &'static str,
    /// Homebrew arguments. Empty: Homebrew does not carry it.
    brew: &'static [&'static str],
    winget: &'static str,
    url: &'static str,
}

const KNOWN: &[Known] = &[
    Known {
        command: "npx",
        label: "Node.js",
        brew: &["install", "node"],
        winget: "OpenJS.NodeJS.LTS",
        url: "https://nodejs.org/en/download",
    },
    Known {
        command: "uvx",
        label: "uv",
        brew: &["install", "uv"],
        winget: "astral-sh.uv",
        url: "https://docs.astral.sh/uv/getting-started/installation/",
    },
    Known {
        command: "docker",
        label: "Docker",
        brew: &["install", "--cask", "docker"],
        winget: "Docker.DockerDesktop",
        url: "https://docs.docker.com/get-docker/",
    },
    Known {
        command: "terraform-mcp-server",
        label: "Terraform MCP server",
        brew: &[],
        winget: "",
        url: "https://releases.hashicorp.com/terraform-mcp-server/",
    },
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Mac,
    Windows,
    Other,
}

impl Os {
    pub fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::Mac
        } else if cfg!(windows) {
            Self::Windows
        } else {
            Self::Other
        }
    }
}

/// A program that a command needs on this machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Dependency {
    /// The command. It is the argument of [`McpControl::install_dependency`].
    pub command: String,
    pub label: String,
    pub present: bool,
    /// Shipyard can install it here (Homebrew on macOS, winget on Windows).
    pub installable: bool,
    /// Where a person installs it by hand. Empty for a command Shipyard does not know.
    pub url: String,
}

fn dependency(command: &str, dirs: &[PathBuf], os: Os) -> Dependency {
    let known = KNOWN.iter().find(|k| k.command == command);
    Dependency {
        command: command.to_string(),
        label: known.map_or(command, |k| k.label).to_string(),
        present: which(command, dirs).is_some(),
        installable: install_plan(command, dirs, os).is_some(),
        url: known.map_or("", |k| k.url).to_string(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallPlan {
    pub program: String,
    pub args: Vec<String>,
}

/// How to install a known command here. Only a manager that raises its own elevation prompt:
/// Shipyard never runs `sudo` and never asks for a password. `None` on Linux, for an unknown
/// command, and when the manager is not installed.
pub fn install_plan(command: &str, dirs: &[PathBuf], os: Os) -> Option<InstallPlan> {
    let known = KNOWN.iter().find(|k| k.command == command)?;
    let (program, args): (&str, Vec<String>) = match os {
        Os::Mac if !known.brew.is_empty() => {
            ("brew", known.brew.iter().map(|a| a.to_string()).collect())
        }
        Os::Windows if !known.winget.is_empty() => (
            "winget",
            [
                "install",
                "--id",
                known.winget,
                "-e",
                "--accept-source-agreements",
                "--accept-package-agreements",
            ]
            .map(String::from)
            .to_vec(),
        ),
        _ => return None,
    };
    which(program, dirs)?;
    Some(InstallPlan {
        program: program.to_string(),
        args,
    })
}

/// Run the plan for `command`, then check that the command is on the path. Returns what the
/// manager printed. Blocks: call it off the UI thread.
pub fn install_with(command: &str, dirs: &[PathBuf], os: Os) -> Result<String, AgentError> {
    let known = KNOWN
        .iter()
        .find(|k| k.command == command)
        .ok_or_else(|| AgentError::Install(format!("unknown dependency: {command}")))?;
    let plan = install_plan(command, dirs, os).ok_or_else(|| {
        AgentError::Install(format!(
            "Shipyard cannot install {} on this machine. Install it from {}",
            known.label, known.url
        ))
    })?;
    let program = which(&plan.program, dirs)
        .ok_or_else(|| AgentError::Install(format!("{} is gone", plan.program)))?;
    let mut cmd = Command::new(program);
    cmd.args(&plan.args).stdin(Stdio::null());
    if let Ok(path) = std::env::join_paths(dirs) {
        cmd.env("PATH", path);
    }
    let out = quiet(&mut cmd)
        .output()
        .map_err(|e| AgentError::Install(format!("{} did not run: {e}", plan.program)))?;
    let said = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let said: String = said
        .trim()
        .chars()
        .rev()
        .take(2000)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    if !out.status.success() {
        return Err(AgentError::Install(format!(
            "{} failed: {said}",
            plan.program
        )));
    }
    if which(command, dirs).is_none() {
        return Err(AgentError::Install(format!(
            "{} ran, but {command} is still not on PATH. Open a new terminal, or install it from {}",
            plan.program, known.url
        )));
    }
    Ok(said)
}

/* ---------- State and rows ---------- */

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum State {
    Stopped,
    Starting,
    Running,
    Failed { reason: String },
}

/// One row of the MCP list.
#[derive(Debug, Clone, Serialize)]
pub struct ServerRow {
    pub id: String,
    pub category: String,
    pub label: String,
    pub description: String,
    pub custom: bool,
    pub enabled: bool,
    pub fields: Vec<Field>,
    /// The keys of the fields that have a value. Never the value.
    pub filled: Vec<String>,
    pub state: State,
    /// The dependencies that are not on this machine (REQ-008).
    pub missing: Vec<Dependency>,
}

#[derive(Debug, Clone, Copy)]
pub struct Waits {
    /// For the handshake. Generous: `npx` may download the package.
    pub start: Duration,
    /// For one request, after the handshake.
    pub call: Duration,
}

impl Default for Waits {
    fn default() -> Self {
        Self {
            start: Duration::from_secs(45),
            call: Duration::from_secs(30),
        }
    }
}

/* ---------- Process session ---------- */

struct Session {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: Receiver<String>,
    next_id: u64,
    /// The answer to `initialize`, given again to each relay client.
    init: Value,
}

impl Session {
    fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    fn send(&mut self, message: &Value) -> Result<(), AgentError> {
        let closed = || AgentError::Server("closed its input".into());
        let stdin = self.stdin.as_mut().ok_or_else(closed)?;
        writeln!(stdin, "{message}")
            .and_then(|()| stdin.flush())
            .map_err(|_| closed())
    }

    /// Send one request and wait for the answer with the same id. A line with another id, or a
    /// notification, is not the answer and is dropped.
    fn request(
        &mut self,
        method: &str,
        params: Value,
        wait: Duration,
    ) -> Result<Value, AgentError> {
        self.next_id += 1;
        let id = self.next_id;
        self.send(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))?;
        let deadline = Instant::now() + wait;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.lines.recv_timeout(left) {
                Ok(line) => {
                    let Ok(value) = serde_json::from_str::<Value>(&line) else {
                        continue;
                    };
                    if value.get("id").and_then(Value::as_u64) == Some(id)
                        && value.get("method").is_none()
                    {
                        return Ok(value);
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    return Err(AgentError::Server(format!("did not answer in {wait:?}")));
                }
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(AgentError::Server("exited".into()));
                }
            }
        }
    }
}

impl Drop for Session {
    /// The shutdown the MCP specification asks for: close the input, wait, then kill.
    fn drop(&mut self) {
        self.stdin = None;
        for _ in 0..30 {
            if !matches!(self.child.try_wait(), Ok(None)) {
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn alive(session: &Arc<Mutex<Session>>) -> bool {
    match session.try_lock() {
        Ok(mut s) => s.alive(),
        Err(TryLockError::WouldBlock) => true, // a request holds it: it is in use
        Err(TryLockError::Poisoned(_)) => false,
    }
}

struct Slot {
    state: State,
    session: Option<Arc<Mutex<Session>>>,
    /// One start at a time per server. A second caller waits, then finds it running.
    gate: Arc<Mutex<()>>,
}

fn account(server: &str, field: &str) -> String {
    conn_account(&format!("{server}/{field}"))
}

/* ---------- Control ---------- */

pub struct McpControl {
    store: Arc<dyn SecretStore>,
    dirs: Vec<PathBuf>,
    waits: Waits,
    config: Mutex<McpConfig>,
    slots: Mutex<HashMap<String, Slot>>,
}

impl McpControl {
    pub fn new(store: Arc<dyn SecretStore>, config: McpConfig) -> Self {
        Self {
            store,
            dirs: search_dirs(),
            waits: Waits::default(),
            config: Mutex::new(config),
            slots: Mutex::new(HashMap::new()),
        }
    }

    /// The folders that hold commands, for the dependency check and for the child `PATH`.
    pub fn with_dirs(mut self, dirs: Vec<PathBuf>) -> Self {
        self.dirs = dirs;
        self
    }

    pub fn with_waits(mut self, waits: Waits) -> Self {
        self.waits = waits;
        self
    }

    /// What to save (REQ-013).
    pub fn config(&self) -> McpConfig {
        lock(&self.config).clone()
    }

    fn def(&self, id: &str) -> Result<ServerDef, AgentError> {
        lock(&self.config)
            .custom
            .iter()
            .find(|d| d.id == id)
            .cloned()
            .or_else(|| catalogue().into_iter().find(|d| d.id == id))
            .ok_or_else(|| AgentError::UnknownServer(id.to_string()))
    }

    /// The catalogue and the custom servers, with state and missing dependencies (REQ-006 to REQ-008).
    pub fn list(&self) -> Vec<ServerRow> {
        let config = self.config();
        catalogue()
            .into_iter()
            .chain(config.custom.iter().cloned())
            .map(|d| ServerRow {
                enabled: config.enabled.contains(&d.id),
                filled: d
                    .fields
                    .iter()
                    .filter(|f| matches!(self.value(&d.id, &f.key), Ok(Some(_))))
                    .map(|f| f.key.clone())
                    .collect(),
                state: self.state(&d.id),
                missing: self.missing(&d),
                id: d.id,
                category: d.category,
                label: d.label,
                description: d.description,
                custom: d.custom,
                fields: d.fields,
            })
            .collect()
    }

    pub fn is_enabled(&self, id: &str) -> bool {
        lock(&self.config).enabled.iter().any(|e| e == id)
    }

    /// The ids that the proxy serves.
    pub fn enabled_ids(&self) -> Vec<String> {
        self.config().enabled
    }

    /// Enable or disable a server. A disabled server is stopped.
    pub fn set_enabled(&self, id: &str, on: bool) -> Result<(), AgentError> {
        self.def(id)?;
        {
            let mut config = lock(&self.config);
            config.enabled.retain(|e| e != id);
            if on {
                config.enabled.push(id.to_string());
            }
        }
        if !on {
            self.stop(id);
        }
        Ok(())
    }

    /// Add a custom server, or edit one when `input.id` is set. A value left empty keeps the
    /// stored secret; a variable that the edit drops loses its secret.
    pub fn add_custom(&self, input: CustomInput) -> Result<ServerDef, AgentError> {
        let (server, values) = normalize(input)?;
        let old = lock(&self.config)
            .custom
            .iter()
            .find(|d| d.id == server.id)
            .cloned();
        for gone in old
            .iter()
            .flat_map(|o| &o.fields)
            .filter(|f| !server.fields.iter().any(|n| n.key == f.key))
        {
            self.store.delete(&account(&server.id, &gone.key))?;
        }
        for (key, value) in values.iter().filter(|(_, v)| !v.is_empty()) {
            self.store.set(&account(&server.id, key), value)?;
        }
        self.stop(&server.id); // a running process has the old command
        let mut config = lock(&self.config);
        match config.custom.iter_mut().find(|d| d.id == server.id) {
            Some(slot) => *slot = server.clone(),
            None => config.custom.push(server.clone()),
        }
        Ok(server)
    }

    /// Stop it, delete its secrets and drop its definition (REQ-014).
    pub fn remove_custom(&self, id: &str) -> Result<(), AgentError> {
        if !lock(&self.config).custom.iter().any(|d| d.id == id) {
            return Err(AgentError::UnknownServer(id.to_string()));
        }
        self.forget(id)?;
        lock(&self.config).custom.retain(|d| d.id != id);
        Ok(())
    }

    /// Stop the server, delete the secrets of its fields and disable it (REQ-014).
    pub fn forget(&self, id: &str) -> Result<(), AgentError> {
        let server = self.def(id)?;
        self.set_enabled(id, false)?;
        for field in &server.fields {
            self.store.delete(&account(id, &field.key))?;
        }
        Ok(())
    }

    /// Store one field of a server in the keychain.
    pub fn set_field(&self, id: &str, key: &str, value: Secret) -> Result<(), AgentError> {
        if !self.def(id)?.fields.iter().any(|f| f.key == key) {
            return Err(AgentError::Invalid(format!("{id} has no field {key}")));
        }
        self.store.set(&account(id, key), &value)?;
        Ok(())
    }

    fn value(&self, id: &str, key: &str) -> Result<Option<Secret>, AgentError> {
        Ok(self.store.get(&account(id, key))?.filter(|s| !s.is_empty()))
    }

    /// The dependencies of a server that are not on this machine.
    pub fn missing(&self, server: &ServerDef) -> Vec<Dependency> {
        Some(dependency(&server.command, &self.dirs, Os::current()))
            .filter(|d| !d.present)
            .into_iter()
            .collect()
    }

    /// Install a dependency with the manager of this system (REQ-008). Blocks.
    pub fn install_dependency(&self, command: &str) -> Result<String, AgentError> {
        install_with(command, &self.dirs, Os::current())
    }

    /// The environment of the child: each field that feeds a variable, and the Basic header.
    /// Names each missing field by its label.
    fn env(&self, server: &ServerDef) -> Result<Vec<(String, Secret)>, AgentError> {
        let label = |key: &str| {
            server
                .fields
                .iter()
                .find(|f| f.key == key)
                .map_or(key, |f| f.label.as_str())
                .to_string()
        };
        let mut env = Vec::new();
        let mut missing = Vec::new();
        for (var, key) in &server.env {
            match self.value(&server.id, key)? {
                Some(v) => env.push((var.clone(), v)),
                None => missing.push(label(key)),
            }
        }
        if let Some(basic) = &server.basic_auth {
            match (
                self.value(&server.id, &basic.user_field)?,
                self.value(&server.id, &basic.secret_field)?,
            ) {
                (Some(user), Some(secret)) => {
                    let raw = format!("{}:{}", user.expose().trim(), secret.expose().trim());
                    let encoded = base64::engine::general_purpose::STANDARD.encode(raw);
                    env.push((
                        basic.env_var.clone(),
                        Secret::new(format!("Basic {encoded}")),
                    ));
                }
                (user, secret) => {
                    if user.is_none() {
                        missing.push(label(&basic.user_field));
                    }
                    if secret.is_none() {
                        missing.push(label(&basic.secret_field));
                    }
                }
            }
        }
        if missing.is_empty() {
            Ok(env)
        } else {
            Err(AgentError::NotConfigured(missing))
        }
    }

    /* ----- Processes ----- */

    pub fn state(&self, id: &str) -> State {
        let mut slots = lock(&self.slots);
        let Some(slot) = slots.get_mut(id) else {
            return State::Stopped;
        };
        if slot.state == State::Running && slot.session.as_ref().is_some_and(|s| !alive(s)) {
            slot.state = State::Failed {
                reason: "exited".into(),
            };
            slot.session = None;
        }
        slot.state.clone()
    }

    fn set_state(&self, id: &str, state: State, session: Option<Arc<Mutex<Session>>>) {
        let old = {
            let mut slots = lock(&self.slots);
            let slot = slots.get_mut(id).expect("the slot exists after start");
            slot.state = state;
            std::mem::replace(&mut slot.session, session)
        };
        drop(old); // a session ends outside the lock
    }

    /// The live session of `id`. A session whose process exited is dropped and marked failed.
    fn running(&self, id: &str) -> Option<Arc<Mutex<Session>>> {
        let mut slots = lock(&self.slots);
        let slot = slots.get_mut(id)?;
        let session = slot.session.clone()?;
        if alive(&session) {
            return Some(session);
        }
        slot.state = State::Failed {
            reason: "exited".into(),
        };
        slot.session = None;
        None
    }

    /// Start a server and finish the MCP handshake. A server that runs is left as it is.
    /// Blocks up to `Waits::start`: call it off the UI thread.
    ///
    /// Errors, before any process starts: [`AgentError::UnknownServer`],
    /// [`AgentError::MissingDependencies`] (names each one) and [`AgentError::NotConfigured`].
    pub fn start(&self, id: &str) -> Result<(), AgentError> {
        let server = self.def(id)?;
        let gate = lock(&self.slots)
            .entry(id.to_string())
            .or_insert_with(|| Slot {
                state: State::Stopped,
                session: None,
                gate: Arc::default(),
            })
            .gate
            .clone();
        let _one_start = lock(&gate);
        if self.running(id).is_some() {
            return Ok(());
        }
        self.set_state(id, State::Starting, None);
        match self.open(&server) {
            Ok(session) => {
                self.set_state(id, State::Running, Some(Arc::new(Mutex::new(session))));
                Ok(())
            }
            Err(e) => {
                self.set_state(
                    id,
                    State::Failed {
                        reason: e.to_string(),
                    },
                    None,
                );
                Err(e)
            }
        }
    }

    fn open(&self, server: &ServerDef) -> Result<Session, AgentError> {
        let missing = self.missing(server);
        if !missing.is_empty() {
            return Err(AgentError::MissingDependencies(missing));
        }
        let env = self.env(server)?;
        let program = which(&server.command, &self.dirs)
            .ok_or_else(|| AgentError::Server(format!("{} is not on the path", server.command)))?;
        let mut cmd = Command::new(program);
        cmd.args(&server.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        if let Ok(path) = std::env::join_paths(&self.dirs) {
            cmd.env("PATH", path);
        }
        for (var, value) in &env {
            cmd.env(var, value.expose());
        }
        let mut child = quiet(&mut cmd)
            .spawn()
            .map_err(|e| AgentError::Server(format!("{} did not start: {e}", server.command)))?;
        let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
            let _ = child.kill();
            return Err(AgentError::Server("has no input or output".into()));
        };
        let (tx, lines) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if tx.send(line).is_err() {
                    return;
                }
            }
        });
        let mut session = Session {
            child,
            stdin: Some(stdin),
            lines,
            next_id: 0,
            init: Value::Null,
        };
        let init = session.request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "shipyard", "version": env!("CARGO_PKG_VERSION") },
            }),
            self.waits.start,
        )?;
        if let Some(error) = init.get("error") {
            return Err(AgentError::Server(format!(
                "refused the handshake: {error}"
            )));
        }
        // The server may wait for this and then refuse every call without it.
        session.send(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }))?;
        session.init = init;
        Ok(session)
    }

    /// Stop a server. A server that is not running is not an error.
    pub fn stop(&self, id: &str) {
        let old = lock(&self.slots).get_mut(id).and_then(|slot| {
            slot.state = State::Stopped;
            slot.session.take()
        });
        drop(old);
    }

    /// Stop every server that this control started. Call it when the app quits: a Tauri state
    /// is not dropped at exit.
    pub fn stop_all(&self) {
        let all: Vec<_> = lock(&self.slots)
            .values_mut()
            .filter_map(|slot| {
                slot.state = State::Stopped;
                slot.session.take()
            })
            .collect();
        for session in &all {
            if let Ok(mut s) = session.try_lock() {
                s.stdin = None; // every process gets the close at once
            }
        }
    }

    /// Send one JSON-RPC request and return the whole response. A server that is not running, or
    /// that died, starts first (REQ-017). `initialize` returns the answer from the start. A server
    /// that does not answer in time, or exits, is marked failed and the next request starts it again.
    pub fn request(&self, id: &str, method: &str, params: Value) -> Result<Value, AgentError> {
        let session = match self.running(id) {
            Some(s) => s,
            None => {
                self.start(id)?;
                self.running(id)
                    .ok_or_else(|| AgentError::Server("stopped as it started".into()))?
            }
        };
        let result = {
            let mut s = lock(&session);
            if method == "initialize" {
                Ok(s.init.clone())
            } else {
                s.request(method, params, self.waits.call)
            }
        };
        if let Err(e) = &result {
            let old = {
                let mut slots = lock(&self.slots);
                slots
                    .get_mut(id)
                    .filter(|slot| {
                        slot.session
                            .as_ref()
                            .is_some_and(|s| Arc::ptr_eq(s, &session))
                    })
                    .and_then(|slot| {
                        slot.state = State::Failed {
                            reason: e.to_string(),
                        };
                        slot.session.take()
                    })
            };
            drop(old);
        }
        result
    }
}
