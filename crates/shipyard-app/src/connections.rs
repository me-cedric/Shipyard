//! Connections: the settings store and the `conn:<id>` entity (spec `connections`, REQ-013 to REQ-015).
//!
//! The non-secret settings live in `connections.json` in the app data folder (Q-018). Each secret
//! lives in the OS keychain under `conn:<id>` (REQ-011). No call returns a secret value: a
//! connection only says that one is saved. The adapters are sync, so a caller runs `test`,
//! `repos`, `tracker` and `forge` in `spawn_blocking`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use shipyard_core::work_item::{Capabilities, TrackerKind};
use shipyard_forges::{Forge, ForgeConfig, ForgeKind, Repository};
use shipyard_git::{Auth, auth::https_host};
use shipyard_http::{Client, Http, TestOutcome};
use shipyard_secrets::{Keychain, Secret, SecretStore, conn_account};
use shipyard_store::project::write_atomic;
use shipyard_trackers::{Tracker, TrackerConfig};
use specta::Type;

pub type Res<T> = Result<T, String>;

const FILE: &str = "connections.json";
const MAX_NAME: usize = 60;
const MAX_SECRET: usize = 4096;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ConnectionGroup {
    Tracker,
    Forge,
}

/// The product behind a connection. A group picks the use: `github` is a tracker or a forge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ConnectionKind {
    JiraCloud,
    JiraDataCenter,
    #[serde(rename = "github")]
    GitHub,
    #[serde(rename = "gitlab")]
    GitLab,
    AzureDevOps,
    Linear,
}

impl ConnectionKind {
    pub fn tracker(self) -> TrackerKind {
        match self {
            Self::JiraCloud => TrackerKind::JiraCloud,
            Self::JiraDataCenter => TrackerKind::JiraDataCenter,
            Self::GitHub => TrackerKind::GitHubIssues,
            Self::GitLab => TrackerKind::GitLabIssues,
            Self::AzureDevOps => TrackerKind::AzureDevOps,
            Self::Linear => TrackerKind::Linear,
        }
    }

    pub fn forge(self) -> Option<ForgeKind> {
        match self {
            Self::GitHub => Some(ForgeKind::GitHub),
            Self::GitLab => Some(ForgeKind::GitLab),
            Self::AzureDevOps => Some(ForgeKind::AzureDevOps),
            _ => None,
        }
    }

    /// The id of the kind in text, the same as its JSON name.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::JiraCloud => "jira-cloud",
            Self::JiraDataCenter => "jira-data-center",
            Self::GitHub => "github",
            Self::GitLab => "gitlab",
            Self::AzureDevOps => "azure-dev-ops",
            Self::Linear => "linear",
        }
    }
}

/// What the last test said. A person sees it as the state of the connection.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ConnectionState {
    #[default]
    Untested,
    Passed,
    Failed,
}

impl ConnectionState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Untested => "untested",
            Self::Passed => "passed",
            Self::Failed => "failed",
        }
    }
}

/// What a person types. A secret is never part of it: `set_secret` takes it.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDraft {
    pub name: String,
    pub group: ConnectionGroup,
    pub kind: ConnectionKind,
    /// Linear has no address. The other kinds need one.
    pub url: String,
    /// The account email. Jira Cloud needs it.
    pub user: Option<String>,
}

/// One line of `connections.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    id: String,
    name: String,
    group: ConnectionGroup,
    kind: ConnectionKind,
    url: String,
    #[serde(default)]
    user: Option<String>,
    /// A secret is in the keychain. Set after a write that worked.
    /// shortcut: the flag can drift if a person clears the keychain by hand. Test then names it.
    #[serde(default)]
    secret: bool,
    #[serde(default)]
    state: ConnectionState,
}

#[derive(Serialize, Deserialize, Default)]
struct File {
    connections: Vec<Record>,
}

/// A connection as the views see it. It never holds a secret value.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub group: ConnectionGroup,
    pub kind: ConnectionKind,
    pub url: String,
    pub user: Option<String>,
    /// True when the keychain holds a secret. The value never leaves the keychain.
    pub secret: bool,
    pub state: ConnectionState,
    /// The flags of a tracker (REQ-003). `None` for the other groups.
    pub capabilities: Option<Capabilities>,
}

impl From<&Record> for Connection {
    fn from(r: &Record) -> Self {
        Self {
            id: r.id.clone(),
            name: r.name.clone(),
            group: r.group,
            kind: r.kind,
            url: r.url.clone(),
            user: r.user.clone(),
            secret: r.secret,
            state: r.state,
            capabilities: (r.group == ConnectionGroup::Tracker)
                .then(|| r.kind.tracker().capabilities()),
        }
    }
}

/// One page of repositories (REQ-019).
#[derive(Debug, Clone, Serialize, Type)]
pub struct RepoPage {
    pub items: Vec<Repository>,
    pub next: Option<String>,
}

pub struct Connections {
    path: PathBuf,
    secrets: Arc<dyn SecretStore>,
    http: Arc<dyn Http>,
    lock: Mutex<()>,
}

/// A slug of the name: `[a-z0-9][a-z0-9-]*`, up to 40 characters. Empty when the name has no letter.
pub(crate) fn slug_text(name: &str) -> String {
    let mut out = String::new();
    for c in name.to_ascii_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let out: String = out.trim_end_matches('-').chars().take(40).collect();
    out.trim_end_matches('-').to_string()
}

/// A valid `conn:` id from the name. Falls back to the kind.
fn slug(name: &str, kind: ConnectionKind) -> String {
    let out = slug_text(name);
    if out.is_empty() {
        kind.as_str().into()
    } else {
        out
    }
}

/// The adapter config of a record. It checks the address and the user without a request.
fn tracker_config(r: &Record) -> TrackerConfig {
    TrackerConfig {
        kind: r.kind.tracker(),
        url: r.url.clone(),
        user: r.user.clone(),
    }
}

fn forge_config(r: &Record) -> Res<ForgeConfig> {
    Ok(ForgeConfig {
        kind: r.kind.forge().ok_or("this product is not a forge")?,
        url: r.url.clone(),
    })
}

impl Connections {
    pub fn new(dir: &Path, secrets: Arc<dyn SecretStore>, http: Arc<dyn Http>) -> Self {
        Self {
            path: dir.join(FILE),
            secrets,
            http,
            lock: Mutex::new(()),
        }
    }

    /// The OS keychain and the real HTTP client.
    pub fn system(dir: &Path) -> Self {
        Self::new(dir, Arc::new(Keychain), Arc::new(Client))
    }

    fn guard(&self) -> MutexGuard<'_, ()> {
        self.lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn load(&self) -> Res<File> {
        match std::fs::read_to_string(&self.path) {
            Ok(text) => serde_json::from_str(&text).map_err(|e| format!("{FILE}: {e}")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(File::default()),
            Err(e) => Err(format!("{FILE}: {e}")),
        }
    }

    fn save(&self, file: &File) -> Res<()> {
        let text = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
        write_atomic(&self.path, text.as_bytes()).map_err(|e| e.to_string())
    }

    /// Loads the file, runs `f` and saves it.
    fn with_file<T>(&self, f: impl FnOnce(&mut File) -> Res<T>) -> Res<T> {
        let _g = self.guard();
        let mut file = self.load()?;
        let out = f(&mut file)?;
        self.save(&file)?;
        Ok(out)
    }

    fn record(&self, id: &str) -> Res<Record> {
        self.load()?
            .connections
            .into_iter()
            .find(|r| r.id == id)
            .ok_or_else(|| format!("unknown connection: {id}"))
    }

    pub fn list(&self) -> Res<Vec<Connection>> {
        Ok(self
            .load()?
            .connections
            .iter()
            .map(Connection::from)
            .collect())
    }

    /// The connection of a `conn:<id>` ref, or `None` (REQ-015).
    pub fn get(&self, id: &str) -> Res<Option<Connection>> {
        Ok(self
            .load()?
            .connections
            .iter()
            .find(|r| r.id == id)
            .map(Connection::from))
    }

    /// Checks a draft with the adapter rules: name, address and user. No request goes out.
    fn check(draft: &ConnectionDraft, id: &str) -> Res<Record> {
        let name = draft.name.trim();
        if name.is_empty() || name.chars().count() > MAX_NAME {
            return Err(format!("the name needs 1 to {MAX_NAME} characters"));
        }
        let user = draft
            .user
            .as_deref()
            .map(str::trim)
            .filter(|u| !u.is_empty())
            .map(String::from);
        let record = Record {
            id: id.into(),
            name: name.into(),
            group: draft.group,
            kind: draft.kind,
            // Linear has no address.
            url: if draft.kind == ConnectionKind::Linear && draft.group == ConnectionGroup::Tracker
            {
                String::new()
            } else {
                draft.url.trim().to_string()
            },
            user,
            secret: false,
            state: ConnectionState::Untested,
        };
        match record.group {
            ConnectionGroup::Tracker => {
                let config = tracker_config(&record);
                shipyard_trackers::connect(&config, Secret::new(""), Arc::new(Client))
                    .map(drop)
                    .map_err(|e| e.to_string())?;
            }
            ConnectionGroup::Forge => {
                let config = forge_config(&record)?;
                shipyard_forges::connect(&config, Secret::new(""), Arc::new(Client))
                    .map(drop)
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(record)
    }

    pub fn add(&self, draft: ConnectionDraft) -> Res<Connection> {
        self.with_file(|file| {
            let base = slug(&draft.name, draft.kind);
            let mut id = base.clone();
            for n in 2.. {
                if !file.connections.iter().any(|r| r.id == id) {
                    break;
                }
                id = format!("{base}-{n}");
            }
            let record = Self::check(&draft, &id)?;
            let view = Connection::from(&record);
            file.connections.push(record);
            Ok(view)
        })
    }

    /// Changes the name, the address and the user. The group and the kind stay. A new address
    /// resets the state, because the last test was for the old one.
    pub fn edit(&self, id: &str, draft: ConnectionDraft) -> Res<Connection> {
        self.with_file(|file| {
            let old = file
                .connections
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or_else(|| format!("unknown connection: {id}"))?;
            if (old.group, old.kind) != (draft.group, draft.kind) {
                return Err("the kind of a connection does not change".into());
            }
            let mut new = Self::check(&draft, id)?;
            new.secret = old.secret;
            new.state = if (&new.url, &new.user) == (&old.url, &old.user) {
                old.state
            } else {
                ConnectionState::Untested
            };
            *old = new;
            Ok(Connection::from(&*old))
        })
    }

    /// Saves the secret in the keychain. The value is not stored anywhere else.
    pub fn set_secret(&self, id: &str, secret: Secret) -> Res<Connection> {
        let value = Secret::new(secret.expose().trim());
        if value.is_empty() || value.expose().len() > MAX_SECRET {
            return Err(format!("the secret needs 1 to {MAX_SECRET} characters"));
        }
        self.with_file(|file| {
            let r = file
                .connections
                .iter_mut()
                .find(|r| r.id == id)
                .ok_or_else(|| format!("unknown connection: {id}"))?;
            self.secrets
                .set(&conn_account(id), &value)
                .map_err(|e| e.to_string())?;
            r.secret = true;
            // A new secret needs a new test.
            r.state = ConnectionState::Untested;
            Ok(Connection::from(&*r))
        })
    }

    /// Removes the connection and its keychain entry (REQ-014). The secret goes first: when the
    /// keychain refuses, the connection stays and no orphan secret remains.
    pub fn remove(&self, id: &str) -> Res<()> {
        self.with_file(|file| {
            let at = file
                .connections
                .iter()
                .position(|r| r.id == id)
                .ok_or_else(|| format!("unknown connection: {id}"))?;
            self.secrets
                .delete(&conn_account(id))
                .map_err(|e| e.to_string())?;
            file.connections.remove(at);
            Ok(())
        })
    }

    /// Git credentials for a remote address: the saved secret of the forge connection that has
    /// the same host. Only `https` gets one, so a token never goes out in clear text. No match
    /// gives [`Auth::none`]: the git credential helper and the SSH agent apply then.
    pub fn git_auth(&self, url: &str) -> Res<Auth> {
        let Some(host) = https_host(url) else {
            return Ok(Auth::none());
        };
        let hit = self.load()?.connections.into_iter().find(|r| {
            r.group == ConnectionGroup::Forge
                && r.secret
                && https_host(&r.url).as_deref() == Some(host.as_str())
        });
        match hit {
            Some(r) => {
                Auth::from_store(&*self.secrets, &r.id, r.user.as_deref().unwrap_or(""), url)
                    .map_err(|e| e.to_string())
            }
            None => Ok(Auth::none()),
        }
    }

    fn secret(&self, r: &Record) -> Res<Secret> {
        self.secrets
            .get(&conn_account(&r.id))
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no secret saved".into())
    }

    /// The tracker adapter of a connection, for the capabilities that consume it (REQ-015).
    pub fn tracker(&self, id: &str) -> Res<Box<dyn Tracker>> {
        let r = self.record(id)?;
        if r.group != ConnectionGroup::Tracker {
            return Err(format!("{id} is not a tracker"));
        }
        shipyard_trackers::connect(&tracker_config(&r), self.secret(&r)?, self.http.clone())
            .map_err(|e| e.to_string())
    }

    /// The forge adapter of a connection.
    pub fn forge(&self, id: &str) -> Res<Box<dyn Forge>> {
        let r = self.record(id)?;
        if r.group != ConnectionGroup::Forge {
            return Err(format!("{id} is not a forge"));
        }
        shipyard_forges::connect(&forge_config(&r)?, self.secret(&r)?, self.http.clone())
            .map_err(|e| e.to_string())
    }

    /// A read-only test (REQ-012). It saves the result as the state of the connection.
    /// Blocks on the network: call it in `spawn_blocking`.
    pub fn test(&self, id: &str) -> Res<TestOutcome> {
        let r = self.record(id)?;
        // The keychain is the truth: the `secret` flag can drift.
        let outcome = if self
            .secrets
            .get(&conn_account(id))
            .map_err(|e| e.to_string())?
            .is_none()
        {
            TestOutcome::Failed {
                reason: "no secret saved".into(),
            }
        } else if r.group == ConnectionGroup::Tracker {
            self.tracker(id)?.test()
        } else {
            self.forge(id)?.test(None)
        };
        let state = match outcome {
            TestOutcome::Passed { .. } => ConnectionState::Passed,
            _ => ConnectionState::Failed,
        };
        self.with_file(|file| {
            // The connection can leave while the test runs.
            if let Some(r) = file.connections.iter_mut().find(|r| r.id == id) {
                r.state = state;
            }
            Ok(())
        })?;
        Ok(outcome)
    }

    /// One page of the repositories of a forge connection, each with its push marker (REQ-019).
    /// Blocks on the network: call it in `spawn_blocking`.
    pub fn repos(&self, id: &str, cursor: Option<&str>, limit: usize) -> Res<RepoPage> {
        let page = self
            .forge(id)?
            .list_repos(cursor, limit)
            .map_err(|e| e.to_string())?;
        Ok(RepoPage {
            items: page.items,
            next: page.next,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_slug_is_a_valid_id() {
        assert_eq!(
            slug("Acme Jira (EU)", ConnectionKind::JiraCloud),
            "acme-jira-eu"
        );
        assert_eq!(slug("  --  ", ConnectionKind::Linear), "linear");
        assert_eq!(slug("Été", ConnectionKind::GitHub), "t");
        assert!(slug(&"a".repeat(80), ConnectionKind::GitHub).len() <= 40);
    }

    #[test]
    fn only_an_https_host_gets_a_stored_credential() {
        assert_eq!(
            https_host("https://me@GitHub.com/a/b.git").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            https_host("https://git.example.com:8443").as_deref(),
            Some("git.example.com:8443")
        );
        assert_eq!(https_host("http://github.com/a/b"), None);
        assert_eq!(https_host("git@github.com:a/b.git"), None);
        assert_eq!(https_host("/local/path"), None);
    }

    #[test]
    fn git_auth_matches_the_forge_host_and_keeps_the_secret_out_of_debug() {
        use shipyard_http::fake::FakeHttp;
        use shipyard_secrets::MemoryStore;
        let dir = tempfile::tempdir().unwrap();
        let c = Connections::new(
            dir.path(),
            Arc::new(MemoryStore::default()),
            Arc::new(FakeHttp::new()),
        );
        let forge = c
            .add(ConnectionDraft {
                name: "Code".into(),
                group: ConnectionGroup::Forge,
                kind: ConnectionKind::GitHub,
                url: "https://github.com".into(),
                user: None,
            })
            .unwrap();
        // No secret yet: no credential.
        let none = c.git_auth("https://github.com/a/b.git").unwrap();
        c.set_secret(&forge.id, Secret::new("tok-9")).unwrap();
        let hit = c.git_auth("https://github.com/a/b.git").unwrap();
        assert_ne!(format!("{none:?}"), format!("{hit:?}"));
        assert!(!format!("{hit:?}").contains("tok-9"));
        let other = c.git_auth("https://gitlab.com/a/b.git").unwrap();
        assert_eq!(format!("{none:?}"), format!("{other:?}"));
        let plain = c.git_auth("http://github.com/a/b.git").unwrap();
        assert_eq!(format!("{none:?}"), format!("{plain:?}"));
    }
}
