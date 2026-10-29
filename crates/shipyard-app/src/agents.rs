//! Agent runners, model providers and MCP servers for Settings / Connections
//! (spec `connections`, REQ-006 to REQ-010, REQ-013, REQ-017, REQ-018).
//!
//! The non-secret settings live in `agents.json` in the app data folder: the MCP config and the
//! providers. A provider key is one keychain entry, `conn:<provider id>`. An MCP field is one entry,
//! `conn:<server>/<field>`. No call returns a secret value. `McpControl` owns the server processes
//! and the app saves its config after each change. The calls that block (`mcp_start`,
//! `mcp_install`, `provider_test`, `provider_models`, `runners`) belong in `spawn_blocking`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use shipyard_agents::mcp_control::{CustomInput, McpConfig, McpControl, ServerRow, State};
use shipyard_agents::runners::{self, ModelProvider, Runner};
use shipyard_http::{Client, Http, TestOutcome};
use shipyard_mcp::proxy::Proxy;
use shipyard_mcp::relay::CONFIG_FILE;
use shipyard_secrets::{Keychain, Secret, SecretStore, conn_account};
use shipyard_store::project::write_atomic;
use specta::Type;

use crate::connections::{ConnectionState, slug_text};

pub type Res<T> = Result<T, String>;

const MAX_SECRET: usize = 4096;

/// What the person types to add or edit a provider. The key goes through `set_secret`.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDraft {
    pub name: String,
    /// Up to and including the version segment: `http://localhost:1234/v1`.
    pub url: String,
    pub model: String,
}

/// A provider as the views see it. It never holds the key.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub url: String,
    pub model: String,
    /// True when the keychain holds a key. A local runtime needs none.
    pub secret: bool,
    pub state: ConnectionState,
}

#[derive(Serialize, Deserialize)]
struct Record {
    #[serde(flatten)]
    provider: ModelProvider,
    #[serde(default)]
    secret: bool,
    #[serde(default)]
    state: ConnectionState,
}

impl From<&Record> for Provider {
    fn from(r: &Record) -> Self {
        Self {
            id: r.provider.id.clone(),
            name: r.provider.label.clone(),
            url: r.provider.base_url.clone(),
            model: r.provider.model.clone(),
            secret: r.secret,
            state: r.state,
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
struct File {
    #[serde(default)]
    mcp: McpConfig,
    #[serde(default)]
    providers: Vec<Record>,
    /// The rows that a person saved. A runner with no row uses [`default_tiers`].
    #[serde(default)]
    tiers: Vec<RunnerTiers>,
}

/// The runners that have a tier row, in the order of Settings.
pub const TIER_RUNNERS: [&str; 5] = ["claude", "codex", "copilot", "gemini", "opencode"];

/// The model of each tier (`top`, `mid`, `small`) of one runner (`factory` REQ-012: a step names
/// a tier, never a vendor id). An empty text means that the runner uses its own default model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct RunnerTiers {
    pub runner: String,
    pub top: String,
    pub mid: String,
    pub small: String,
}

/// Claude Code maps to its three aliases. The other runners start with no row: their own default
/// model runs until a person names one.
pub fn default_tiers(runner: &str) -> RunnerTiers {
    let [top, mid, small] = match runner {
        "claude" => ["opus", "sonnet", "haiku"],
        _ => ["", "", ""],
    };
    RunnerTiers {
        runner: runner.into(),
        top: top.into(),
        mid: mid.into(),
        small: small.into(),
    }
}

/// A model id: the characters that the runner CLIs accept (`claude-opus-4-1`, `anthropic/x`,
/// `llama3:8b`). It goes to the CLI as an argument, so no space, no control character and no
/// leading `-` (the CLI would read a flag).
fn model_id(text: &str) -> Res<String> {
    let id = text.trim();
    let plain =
        |c: char| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ':' | '/' | '@' | '+');
    if id.len() > 100 || id.starts_with('-') || !id.chars().all(plain) {
        return Err(format!(
            "`{id}` is not a model id: use letters, digits and . _ - : / @ +"
        ));
    }
    Ok(id.into())
}

/// One environment variable of a custom MCP server. An empty value keeps the stored one.
#[derive(Deserialize, Type)]
pub struct McpEnv {
    pub key: String,
    pub value: String,
}

/// A custom MCP server. `id` is set to edit one.
#[derive(Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct McpCustom {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    /// A command, or an `https` address.
    pub command: String,
    pub args: Vec<String>,
    pub env: Vec<McpEnv>,
}

pub struct Agents {
    path: PathBuf,
    secrets: Arc<dyn SecretStore>,
    http: Arc<dyn Http>,
    pub mcp: Arc<McpControl>,
    /// What the Shipyard MCP endpoint and the relay serve.
    pub proxy: Arc<Proxy>,
    lock: Mutex<()>,
}

impl Agents {
    /// `tune` adjusts the MCP control (search folders, waits): tests use it.
    pub fn new(
        dir: &Path,
        secrets: Arc<dyn SecretStore>,
        http: Arc<dyn Http>,
        tune: impl FnOnce(McpControl) -> McpControl,
    ) -> Self {
        let path = dir.join(CONFIG_FILE);
        // A missing or unreadable file gives no server and no provider.
        let file = Self::read(&path).unwrap_or_default();
        let mcp = Arc::new(tune(McpControl::new(secrets.clone(), file.mcp)));
        Self {
            path,
            secrets,
            http,
            proxy: Arc::new(Proxy::new(mcp.clone())),
            mcp,
            lock: Mutex::new(()),
        }
    }

    /// The OS keychain and the real HTTP client.
    pub fn system(dir: &Path) -> Self {
        Self::new(dir, Arc::new(Keychain), Arc::new(Client), |c| c)
    }

    fn read(path: &Path) -> Res<File> {
        match std::fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("{CONFIG_FILE}: {e}")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(File::default()),
            Err(e) => Err(format!("{CONFIG_FILE}: {e}")),
        }
    }

    fn guard(&self) -> MutexGuard<'_, ()> {
        self.lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Loads the file, runs `f` and saves it with the current MCP config (REQ-013).
    fn with_file<T>(&self, f: impl FnOnce(&mut File) -> Res<T>) -> Res<T> {
        let _g = self.guard();
        let mut file = Self::read(&self.path)?;
        let out = f(&mut file)?;
        file.mcp = self.mcp.config();
        let text = serde_json::to_vec_pretty(&file).map_err(|e| e.to_string())?;
        write_atomic(&self.path, &text).map_err(|e| e.to_string())?;
        Ok(out)
    }

    /// Runs an MCP change, then saves the config. A failed change saves nothing.
    fn mcp_change<T>(
        &self,
        f: impl FnOnce(&McpControl) -> Result<T, shipyard_agents::AgentError>,
    ) -> Res<T> {
        let out = f(&self.mcp).map_err(|e| e.to_string())?;
        self.with_file(|_| Ok(()))?;
        Ok(out)
    }

    /* ----- Runners ----- */

    /// Looks for each runner CLI and asks it for its version. Blocks.
    pub fn runners(&self) -> Vec<Runner> {
        runners::detect()
    }

    /* ----- Model tiers ----- */

    /// One row for each runner: the saved row, else the default.
    pub fn tiers(&self) -> Res<Vec<RunnerTiers>> {
        let saved = Self::read(&self.path)?.tiers;
        Ok(TIER_RUNNERS
            .iter()
            .map(|r| {
                saved
                    .iter()
                    .find(|t| t.runner == *r)
                    .cloned()
                    .unwrap_or_else(|| default_tiers(r))
            })
            .collect())
    }

    /// Saves the row of one runner. Empty texts clear the tiers: the runner default applies.
    pub fn tiers_set(&self, row: RunnerTiers) -> Res<Vec<RunnerTiers>> {
        if !TIER_RUNNERS.contains(&row.runner.as_str()) {
            return Err(format!("unknown runner: {}", row.runner));
        }
        let row = RunnerTiers {
            runner: row.runner,
            top: model_id(&row.top)?,
            mid: model_id(&row.mid)?,
            small: model_id(&row.small)?,
        };
        self.with_file(|file| {
            file.tiers.retain(|t| t.runner != row.runner);
            file.tiers.push(row);
            Ok(())
        })?;
        self.tiers()
    }

    /// The map that the engine reads. A tier with no model is left out.
    pub fn tier_map(&self) -> shipyard_engine::run_engine::Tiers {
        let rows = self
            .tiers()
            .unwrap_or_else(|_| TIER_RUNNERS.iter().map(|r| default_tiers(r)).collect());
        shipyard_engine::run_engine::Tiers(
            rows.into_iter()
                .map(|t| {
                    let map = [("top", t.top), ("mid", t.mid), ("small", t.small)]
                        .into_iter()
                        .filter(|(_, m)| !m.is_empty())
                        .map(|(k, m)| (k.to_string(), m))
                        .collect();
                    (t.runner, map)
                })
                .collect(),
        )
    }

    /* ----- Providers ----- */

    pub fn providers(&self) -> Res<Vec<Provider>> {
        Ok(Self::read(&self.path)?
            .providers
            .iter()
            .map(Provider::from)
            .collect())
    }

    /// The provider keys, for the secret filter of the assistant (spec `assistant` REQ-020). No
    /// command returns them.
    pub fn secret_values(&self) -> Vec<String> {
        let providers = Self::read(&self.path)
            .map(|f| f.providers)
            .unwrap_or_default();
        providers
            .iter()
            .filter_map(|r| {
                self.secrets
                    .get(&conn_account(&r.provider.id))
                    .ok()
                    .flatten()
            })
            .map(|s| s.expose().to_string())
            .collect()
    }

    fn record(&self, id: &str) -> Res<Record> {
        Self::read(&self.path)?
            .providers
            .into_iter()
            .find(|r| r.provider.id == id)
            .ok_or_else(|| format!("unknown provider: {id}"))
    }

    pub fn provider_add(&self, draft: ProviderDraft) -> Res<Provider> {
        self.with_file(|file| {
            let name: String = slug_text(&draft.name).chars().take(38).collect();
            let base = format!("provider-{}", if name.is_empty() { "model" } else { &name });
            let mut id = base.clone();
            for n in 2.. {
                if !file.providers.iter().any(|r| r.provider.id == id) {
                    break;
                }
                id = format!("{base}-{n}");
            }
            let provider = ModelProvider::new(&id, &draft.name, &draft.url, &draft.model)
                .map_err(|e| e.to_string())?;
            let record = Record {
                provider,
                secret: false,
                state: ConnectionState::Untested,
            };
            let view = Provider::from(&record);
            file.providers.push(record);
            Ok(view)
        })
    }

    /// Changes the name, the address and the model. A new address resets the state.
    pub fn provider_edit(&self, id: &str, draft: ProviderDraft) -> Res<Provider> {
        self.with_file(|file| {
            let old = file
                .providers
                .iter_mut()
                .find(|r| r.provider.id == id)
                .ok_or_else(|| format!("unknown provider: {id}"))?;
            let provider = ModelProvider::new(id, &draft.name, &draft.url, &draft.model)
                .map_err(|e| e.to_string())?;
            if provider.base_url != old.provider.base_url {
                old.state = ConnectionState::Untested;
            }
            old.provider = provider;
            Ok(Provider::from(&*old))
        })
    }

    /// Saves the key in the keychain. The value is not stored anywhere else.
    pub fn provider_set_secret(&self, id: &str, secret: Secret) -> Res<Provider> {
        let value = Secret::new(secret.expose().trim());
        if value.is_empty() || value.expose().len() > MAX_SECRET {
            return Err(format!("the secret needs 1 to {MAX_SECRET} characters"));
        }
        self.with_file(|file| {
            let r = file
                .providers
                .iter_mut()
                .find(|r| r.provider.id == id)
                .ok_or_else(|| format!("unknown provider: {id}"))?;
            self.secrets
                .set(&conn_account(id), &value)
                .map_err(|e| e.to_string())?;
            r.secret = true;
            r.state = ConnectionState::Untested;
            Ok(Provider::from(&*r))
        })
    }

    /// The key goes first: when the keychain refuses, the provider stays (REQ-014).
    pub fn provider_remove(&self, id: &str) -> Res<()> {
        self.with_file(|file| {
            let at = file
                .providers
                .iter()
                .position(|r| r.provider.id == id)
                .ok_or_else(|| format!("unknown provider: {id}"))?;
            self.secrets
                .delete(&conn_account(id))
                .map_err(|e| e.to_string())?;
            file.providers.remove(at);
            Ok(())
        })
    }

    /// A read-only test that lists the models (REQ-012). It saves the result as the state.
    /// Blocks on the network.
    pub fn provider_test(&self, id: &str) -> Res<TestOutcome> {
        let outcome = self.record(id)?.provider.test(&*self.http, &*self.secrets);
        let state = match outcome {
            TestOutcome::Passed { .. } => ConnectionState::Passed,
            _ => ConnectionState::Failed,
        };
        self.with_file(|file| {
            // The provider can leave while the test runs.
            if let Some(r) = file.providers.iter_mut().find(|r| r.provider.id == id) {
                r.state = state;
            }
            Ok(())
        })?;
        Ok(outcome)
    }

    /// The model ids of the provider. Blocks on the network.
    pub fn provider_models(&self, id: &str) -> Res<Vec<String>> {
        self.record(id)?
            .provider
            .models(&*self.http, &*self.secrets)
            .map_err(|e| e.to_string())
    }

    /* ----- MCP servers ----- */

    pub fn mcp_list(&self) -> Vec<ServerRow> {
        self.mcp.list()
    }

    pub fn mcp_enable(&self, id: &str, on: bool) -> Res<()> {
        self.mcp_change(|c| c.set_enabled(id, on))
    }

    /// Adds a custom server, or edits one. Returns its id.
    pub fn mcp_add_custom(&self, draft: McpCustom) -> Res<String> {
        let input = CustomInput {
            id: draft.id,
            name: draft.name,
            description: draft.description,
            command: draft.command,
            args: draft.args,
            env: draft
                .env
                .into_iter()
                .map(|e| (e.key, Secret::new(e.value)))
                .collect(),
        };
        self.mcp_change(|c| c.add_custom(input)).map(|d| d.id)
    }

    /// Stops a custom server, deletes its secrets and its definition.
    pub fn mcp_remove(&self, id: &str) -> Res<()> {
        self.mcp_change(|c| c.remove_custom(id))
    }

    /// Stops a server, deletes the secrets of its fields and disables it.
    pub fn mcp_forget(&self, id: &str) -> Res<()> {
        self.mcp_change(|c| c.forget(id))
    }

    pub fn mcp_set_field(&self, id: &str, key: &str, value: Secret) -> Res<()> {
        if value.is_empty() {
            return Err("the value is empty".into());
        }
        self.mcp
            .set_field(id, key, value)
            .map_err(|e| e.to_string())
    }

    /// Starts a server and finishes the handshake. Blocks up to 45 s.
    pub fn mcp_start(&self, id: &str) -> Res<()> {
        self.mcp.start(id).map_err(|e| e.to_string())
    }

    pub fn mcp_stop(&self, id: &str) {
        self.mcp.stop(id);
    }

    pub fn mcp_state(&self, id: &str) -> State {
        self.mcp.state(id)
    }

    /// Installs a dependency with the manager of this system. Blocks.
    pub fn mcp_install(&self, command: &str) -> Res<String> {
        self.mcp
            .install_dependency(command)
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_http::fake::FakeHttp;
    use shipyard_secrets::MemoryStore;

    fn agents(dir: &Path) -> Agents {
        Agents::new(
            dir,
            Arc::new(MemoryStore::default()),
            Arc::new(FakeHttp::new()),
            |c| c,
        )
    }

    #[test]
    fn the_tiers_start_with_the_claude_aliases_and_nothing_for_the_others() {
        let dir = tempfile::tempdir().unwrap();
        let rows = agents(dir.path()).tiers().unwrap();
        assert_eq!(rows.len(), 5);
        assert_eq!(
            (
                rows[0].top.as_str(),
                rows[0].mid.as_str(),
                rows[0].small.as_str()
            ),
            ("opus", "sonnet", "haiku")
        );
        assert!(
            rows[1..]
                .iter()
                .all(|r| r.top.is_empty() && r.mid.is_empty() && r.small.is_empty())
        );
    }

    #[test]
    fn an_edit_is_saved_in_agents_json_and_feeds_the_engine_map() {
        let dir = tempfile::tempdir().unwrap();
        let a = agents(dir.path());
        let row = RunnerTiers {
            runner: "codex".into(),
            top: " gpt-5 ".into(),
            mid: "gpt-5-mini".into(),
            small: String::new(),
        };
        a.tiers_set(row).unwrap();
        // A new process reads the same file.
        let again = agents(dir.path());
        let codex = again
            .tiers()
            .unwrap()
            .into_iter()
            .find(|r| r.runner == "codex")
            .unwrap();
        assert_eq!((codex.top.as_str(), codex.small.as_str()), ("gpt-5", ""));
        let map = again.tier_map();
        assert_eq!(map.model("codex", "top").as_deref(), Some("gpt-5"));
        assert_eq!(
            map.model("codex", "small"),
            None,
            "an empty tier is the runner default"
        );
        assert_eq!(map.model("claude", "mid").as_deref(), Some("sonnet"));
        // The MCP config and the providers in the same file are not touched.
        let text = std::fs::read_to_string(dir.path().join(CONFIG_FILE)).unwrap();
        assert!(
            text.contains("\"tiers\"") && text.contains("\"mcp\""),
            "{text}"
        );
    }

    #[test]
    fn a_bad_runner_or_model_is_refused_and_nothing_is_saved() {
        let dir = tempfile::tempdir().unwrap();
        let a = agents(dir.path());
        let row = |runner: &str, top: &str| RunnerTiers {
            runner: runner.into(),
            top: top.into(),
            mid: String::new(),
            small: String::new(),
        };
        assert!(a.tiers_set(row("nope", "x")).is_err());
        for bad in ["a b", "x;rm", "--model", "é", &"m".repeat(101)] {
            assert!(a.tiers_set(row("claude", bad)).is_err(), "{bad}");
        }
        assert_eq!(a.tiers().unwrap()[0].top, "opus");
    }
}
