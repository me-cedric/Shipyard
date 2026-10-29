//! Agent runner detection and the HTTP model provider client (REQ-009, REQ-010).
//!
//! A runner is a coding CLI that Shipyard starts. Detection looks for its program and asks it for
//! its version. A provider is an OpenAI-style HTTP endpoint (`GET /models`,
//! `POST /chat/completions`): LM Studio, Ollama, vLLM, LiteLLM, OpenRouter or a vendor API.
//! A provider has no tools: it answers text and never edits a repository.

use crate::AgentError;
use crate::which::{quiet, search_dirs, which};
use serde::{Deserialize, Serialize};
use serde_json::json;
use shipyard_http::{Auth, Http, Request, TestOutcome, base_url, items, text};
use shipyard_secrets::{SecretStore, conn_account};
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// How long a runner has to print its version.
/// A local model can need a while to load or to answer: the 30 s default is too short.
const CHAT_TIMEOUT: Duration = Duration::from_secs(120);

const VERSION_WAIT: Duration = Duration::from_secs(5);

struct RunnerDef {
    id: &'static str,
    label: &'static str,
    bin: &'static str,
    install: &'static str,
}

/// Claude Code, Codex, GitHub Copilot (ACP), Gemini CLI and OpenCode.
const RUNNERS: &[RunnerDef] = &[
    RunnerDef {
        id: "claude",
        label: "Claude Code",
        bin: "claude",
        install: "npm install -g @anthropic-ai/claude-code",
    },
    RunnerDef {
        id: "codex",
        label: "Codex",
        bin: "codex",
        install: "npm install -g @openai/codex",
    },
    RunnerDef {
        id: "copilot",
        label: "GitHub Copilot",
        bin: "copilot",
        install: "npm install -g @github/copilot",
    },
    RunnerDef {
        id: "gemini",
        label: "Gemini CLI",
        bin: "gemini",
        install: "npm install -g @google/gemini-cli",
    },
    RunnerDef {
        id: "opencode",
        label: "OpenCode",
        bin: "opencode",
        install: "npm install -g opencode-ai",
    },
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunnerState {
    Detected,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Runner {
    pub id: &'static str,
    pub label: &'static str,
    pub state: RunnerState,
    /// The program that was found. `None` when missing.
    pub path: Option<String>,
    /// `None` when missing, or when the runner printed no version in time.
    pub version: Option<String>,
    /// How to install it. Shown beside a missing runner.
    pub install: &'static str,
}

/// Detect every runner on the usual search folders.
pub fn detect() -> Vec<Runner> {
    detect_in(&search_dirs(), VERSION_WAIT)
}

/// Detect every runner in `dirs`. Each version check runs in its own thread, so one slow
/// runner does not delay the others.
pub fn detect_in(dirs: &[PathBuf], wait: Duration) -> Vec<Runner> {
    std::thread::scope(|scope| {
        let jobs: Vec<_> = RUNNERS
            .iter()
            .map(|def| scope.spawn(move || detect_one(def, dirs, wait)))
            .collect();
        jobs.into_iter()
            .map(|job| job.join().expect("detect thread"))
            .collect()
    })
}

fn detect_one(def: &RunnerDef, dirs: &[PathBuf], wait: Duration) -> Runner {
    let found = which(def.bin, dirs);
    Runner {
        id: def.id,
        label: def.label,
        state: if found.is_some() {
            RunnerState::Detected
        } else {
            RunnerState::Missing
        },
        version: found.as_ref().and_then(|p| version_of(p, wait)),
        path: found.map(|p| p.to_string_lossy().into_owned()),
        install: def.install,
    }
}

fn version_of(program: &std::path::Path, wait: Duration) -> Option<String> {
    let mut cmd = Command::new(program);
    cmd.arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = quiet(&mut cmd).spawn().ok()?;
    let deadline = Instant::now() + wait;
    while child.try_wait().ok()?.is_none() {
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    parse_version(&out)
}

/// The first word that looks like a version: `codex-cli 0.147.0` gives `0.147.0`.
fn parse_version(text: &str) -> Option<String> {
    text.split_whitespace().find_map(|word| {
        let word = word.trim_matches(|c: char| !c.is_ascii_alphanumeric());
        let word = word.strip_prefix('v').unwrap_or(word);
        (word.starts_with(|c: char| c.is_ascii_digit()) && word.contains('.'))
            .then(|| word.to_string())
    })
}

/// An OpenAI-style HTTP provider. The key is not here: it is in the keychain under
/// `conn_account(id)` (REQ-011). A local runtime needs no key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelProvider {
    pub id: String,
    pub label: String,
    /// Up to and including the version segment: `http://localhost:1234/v1`.
    pub base_url: String,
    pub model: String,
}

impl ModelProvider {
    /// Check the fields. The address is `https`, or `http` on a local host: the client sends a
    /// key only over those, and an address holds no credential or query.
    pub fn new(id: &str, label: &str, base_url_raw: &str, model: &str) -> Result<Self, AgentError> {
        let id = id.trim();
        let valid_id = !id.is_empty()
            && id.len() <= 48
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if !valid_id {
            return Err(AgentError::Invalid(
                "a provider id holds only letters, digits, `-` and `_`".into(),
            ));
        }
        let model = model.trim();
        if model.is_empty() {
            return Err(AgentError::Invalid("a provider needs a model name".into()));
        }
        let label = label.trim();
        Ok(Self {
            id: id.to_string(),
            label: if label.is_empty() { id } else { label }.to_string(),
            base_url: base_url(base_url_raw)?,
            model: model.to_string(),
        })
    }

    /// Validated again at each call: a value read back from a settings file is not trusted.
    fn url(&self, path: &str) -> Result<String, AgentError> {
        Ok(format!("{}{path}", base_url(&self.base_url)?))
    }

    fn auth(&self, store: &dyn SecretStore) -> Result<Auth, AgentError> {
        Ok(match store.get(&conn_account(&self.id))? {
            Some(key) if !key.is_empty() => Auth::Bearer(key),
            _ => Auth::None,
        })
    }

    /// The model ids that `GET /models` lists, sorted, without duplicates.
    pub fn models(
        &self,
        http: &dyn Http,
        store: &dyn SecretStore,
    ) -> Result<Vec<String>, AgentError> {
        let reply = http.json(&Request::get(self.url("/models")?, self.auth(store)?))?;
        let mut ids: Vec<String> = items(&reply, "/data")
            .iter()
            .map(|row| text(row, "/id"))
            .filter(|id| !id.is_empty())
            .collect();
        ids.sort();
        ids.dedup();
        if ids.is_empty() {
            return Err(AgentError::Provider(format!(
                "{} answered, but listed no model",
                self.label
            )));
        }
        Ok(ids)
    }

    /// A read-only check: list the models (REQ-012).
    pub fn test(&self, http: &dyn Http, store: &dyn SecretStore) -> TestOutcome {
        match self.models(http, store) {
            Ok(_) => TestOutcome::Passed {
                account: self.label.clone(),
            },
            Err(AgentError::Http(e)) => TestOutcome::from_error(&e, "access to the models"),
            Err(e) => TestOutcome::Failed {
                reason: e.to_string(),
            },
        }
    }

    /// One question, one answer. No streaming.
    pub fn chat(
        &self,
        http: &dyn Http,
        store: &dyn SecretStore,
        prompt: &str,
    ) -> Result<String, AgentError> {
        if prompt.trim().is_empty() {
            return Err(AgentError::Invalid("the prompt is empty".into()));
        }
        let auth = self.auth(store)?;
        let body = json!({
            "model": self.model,
            "messages": [{ "role": "user", "content": prompt }],
            "stream": false,
        });
        let reply = http.json(
            &Request::post_json(self.url("/chat/completions")?, auth.clone(), body)
                .timeout(CHAT_TIMEOUT),
        )?;
        let answer = text(&reply, "/choices/0/message/content");
        let answer = answer.trim();
        if !answer.is_empty() {
            return Ok(answer.to_string());
        }
        // Some servers answer an error with HTTP 200 and an `error` object.
        let said = text(&reply, "/error/message");
        let said = auth.secret().map_or(said.clone(), |key| key.scrub(&said));
        Err(AgentError::Provider(if said.is_empty() {
            format!("{} answered with no text", self.label)
        } else {
            format!("{} refused: {said}", self.label)
        }))
    }
}
