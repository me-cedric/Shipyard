//! Credentials and proxy for every libgit2 transfer: the ONE place.
//!
//! Legacy built the callbacks and the proxy in three files. Here `fetch`, `pull` and `push`
//! (and later a clone) take their options from this module only.
//!
//! A secret stays in a [`Secret`]. It never goes in a URL, an argument, a file or a log
//! (constitution 6.3), and [`Auth::scrub`] masks it in each error text that leaves the crate.

use git2::{Config, Cred, CredentialType, FetchOptions, ProxyOptions, RemoteCallbacks};
use shipyard_secrets::{Secret, SecretStore, conn_account};

use crate::error::{GitError, Result};

/// A username and a secret (a token or a password) for one connection.
#[derive(Clone, Debug)]
pub struct Credential {
    /// May be empty: forges ignore the name next to a token, so `git` is used.
    pub username: String,
    pub secret: Secret,
}

/// The credentials that a transfer may try, in order. Then the git credential helper and,
/// for SSH, the agent. Each source is tried once, so a wrong token cannot loop.
#[derive(Clone, Debug, Default)]
pub struct Auth {
    credentials: Vec<Credential>,
    /// The host the stored credentials belong to ([`https_host`]). A stored credential goes out
    /// only to an `https` address with this host, also after a redirect. `None` sends none.
    host: Option<String>,
}

impl Auth {
    /// No stored credential: the git credential helper, the SSH agent and public remotes.
    pub fn none() -> Self {
        Self::default()
    }

    pub fn with(mut self, credential: Credential) -> Self {
        self.credentials.push(credential);
        self
    }

    /// Bind the stored credentials to the host of `url`. A non-`https` address binds none.
    pub fn for_url(mut self, url: &str) -> Self {
        self.host = https_host(url);
        self
    }

    /// The secret of connection `conn:<id>` from the store, bound to the host of `url`. No
    /// secret gives [`Auth::none`].
    pub fn from_store(
        store: &dyn SecretStore,
        conn_id: &str,
        username: &str,
        url: &str,
    ) -> Result<Self> {
        Ok(match store.get(&conn_account(conn_id))? {
            Some(secret) => Self::none()
                .with(Credential {
                    username: username.to_string(),
                    secret,
                })
                .for_url(url),
            None => Self::none(),
        })
    }

    /// An error with every secret of this value masked.
    pub(crate) fn scrub(&self, e: git2::Error) -> GitError {
        let mut message = e.message().to_string();
        for c in &self.credentials {
            message = c.secret.scrub(&message);
        }
        GitError::Git(message)
    }

    pub(crate) fn callbacks(&self, config: Config) -> RemoteCallbacks<'static> {
        let mut picker = Picker::new(self.credentials.clone(), self.host.clone(), Some(config));
        let mut cb = RemoteCallbacks::new();
        cb.credentials(move |url, user, allowed| picker.pick(url, user, allowed));
        cb
    }

    pub(crate) fn fetch_options(&self, config: Config) -> FetchOptions<'static> {
        let mut fo = FetchOptions::new();
        fo.remote_callbacks(self.callbacks(config));
        fo.proxy_options(proxy_options());
        // Drop the remote tracking refs of branches that the remote deleted. No other ref moves.
        fo.prune(git2::FetchPrune::On);
        fo
    }
}

/// The lower-case host (with the port) of an `https` address. Anything else gives `None`.
pub fn https_host(url: &str) -> Option<String> {
    let rest = url.trim().strip_prefix("https://")?;
    let auth = rest.split(['/', '?', '#']).next()?;
    let host = auth.rsplit('@').next()?.to_ascii_lowercase();
    (!host.is_empty()).then_some(host)
}

/// `auto` reads `http.proxy` from the git configuration, so a company proxy that the command
/// line `git` already uses applies here too. libgit2 uses no proxy unless it is told to.
pub(crate) fn proxy_options() -> ProxyOptions<'static> {
    let mut px = ProxyOptions::new();
    px.auto();
    px
}

struct Picker {
    credentials: Vec<Credential>,
    host: Option<String>,
    /// The git config for the helper. `None` turns the helper off.
    config: Option<Config>,
    stored: usize,
    helper_done: bool,
    agent_done: bool,
    default_done: bool,
}

impl Picker {
    fn new(credentials: Vec<Credential>, host: Option<String>, config: Option<Config>) -> Self {
        Self {
            credentials,
            host,
            config,
            stored: 0,
            helper_done: false,
            agent_done: false,
            default_done: false,
        }
    }

    /// libgit2 calls this again after each refusal, and for ever if it keeps getting the same
    /// credential. Each source answers once; then an error ends the transfer.
    fn pick(
        &mut self,
        url: &str,
        user: Option<&str>,
        allowed: CredentialType,
    ) -> std::result::Result<Cred, git2::Error> {
        if allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
            let here = https_host(url);
            let trusted = here.is_some() && here == self.host;
            if let Some(c) = self.credentials.get(self.stored).filter(|_| trusted) {
                self.stored += 1;
                let name = [c.username.as_str(), user.unwrap_or(""), "git"]
                    .into_iter()
                    .find(|n| !n.is_empty())
                    .unwrap_or("git");
                return Cred::userpass_plaintext(name, c.secret.expose());
            }
            if !self.helper_done {
                self.helper_done = true;
                if let Some(config) = &self.config
                    && let Ok(cred) = Cred::credential_helper(config, url, user)
                {
                    return Ok(cred);
                }
            }
        }
        if allowed.contains(CredentialType::USERNAME) {
            return Cred::username(user.unwrap_or("git"));
        }
        if allowed.contains(CredentialType::SSH_KEY) && !self.agent_done {
            self.agent_done = true;
            return Cred::ssh_key_from_agent(user.unwrap_or("git"));
        }
        if allowed.contains(CredentialType::DEFAULT) && !self.default_done {
            self.default_done = true;
            return Cred::default();
        }
        Err(git2::Error::from_str(
            "no usable credential: sign in to the connection or configure a git credential helper",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_secrets::MemoryStore;

    fn plain() -> CredentialType {
        CredentialType::USER_PASS_PLAINTEXT
    }

    #[test]
    fn each_source_answers_once_then_the_transfer_ends() {
        let mut p = Picker::new(
            vec![
                Credential {
                    username: "a".into(),
                    secret: Secret::new("one"),
                },
                Credential {
                    username: String::new(),
                    secret: Secret::new("two"),
                },
            ],
            Some("h".into()),
            None,
        );
        assert!(p.pick("https://h/x", None, plain()).is_ok());
        assert!(p.pick("https://h/x", None, plain()).is_ok());
        assert!(p.pick("https://h/x", None, plain()).is_err());
        assert!(p.pick("https://h/x", None, plain()).is_err());
    }

    #[test]
    fn a_stored_credential_goes_only_to_its_https_host() {
        let cred = || {
            vec![Credential {
                username: "a".into(),
                secret: Secret::new("one"),
            }]
        };
        let mut p = Picker::new(cred(), Some("github.com".into()), None);
        // A redirect to another host, to clear text or to ssh gets nothing.
        assert!(p.pick("https://evil.test/x", None, plain()).is_err());
        assert!(p.pick("http://github.com/x", None, plain()).is_err());
        assert!(p.pick("ssh://github.com/x", None, plain()).is_err());
        assert!(p.pick("https://GitHub.com/x", None, plain()).is_ok());
        // No bound host: no credential at all.
        let mut p = Picker::new(cred(), None, None);
        assert!(p.pick("https://github.com/x", None, plain()).is_err());
    }

    #[test]
    fn ssh_agent_and_default_are_tried_once() {
        let mut p = Picker::new(vec![], None, None);
        assert!(
            p.pick("ssh://h/x", Some("git"), CredentialType::USERNAME)
                .is_ok()
        );
        let _ = p.pick("ssh://h/x", Some("git"), CredentialType::SSH_KEY);
        assert!(
            p.pick("ssh://h/x", Some("git"), CredentialType::SSH_KEY)
                .is_err()
        );
        assert!(p.pick("https://h/x", None, CredentialType::DEFAULT).is_ok());
        assert!(
            p.pick("https://h/x", None, CredentialType::DEFAULT)
                .is_err()
        );
    }

    #[test]
    fn store_secret_never_prints_or_survives_scrub() {
        let store = MemoryStore::default();
        store
            .set(&conn_account("c1"), &Secret::new("tok-123"))
            .unwrap();
        let auth = Auth::from_store(&store, "c1", "me", "https://h/x").unwrap();
        assert!(!format!("{auth:?}").contains("tok-123"));
        let e = git2::Error::from_str("auth failed for tok-123 on host");
        assert_eq!(
            auth.scrub(e).to_string(),
            "git: auth failed for *** on host"
        );
        assert!(
            Auth::from_store(&store, "missing", "me", "https://h/x")
                .unwrap()
                .credentials
                .is_empty()
        );
    }
}
