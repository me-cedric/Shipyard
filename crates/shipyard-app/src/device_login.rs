//! Browser sign-in for a GitHub or GitLab connection (the OAuth device flow, RFC 8628). A forge
//! connection and a tracker connection of these two products both use it.
//!
//! Two steps, so the view can show the code while the person acts in the browser: [`start`] asks
//! the host for a code and a page, and [`poll`] trades the device code for a token once the person
//! agreed. The token goes to the keychain like a pasted one (`Connections::set_secret`): it never
//! reaches a view, a log or an error text.
//!
//! A GitLab token from this flow is an OAuth token. It goes out as `Authorization: Bearer`, not as
//! `PRIVATE-TOKEN`, and it expires after 2 hours. The keychain entry `conn:<id>:oauth` marks it and
//! holds the refresh token ([`Oauth`]). [`Bearer`] wraps the HTTP client of such a connection: it
//! sends the Bearer header, refreshes the token when it is expired or the API answers 401, and
//! retries once. A pasted personal access token has no such entry and works as before.
//!
//! A host needs a registered OAuth app. Its client id (not a secret) comes from `oauth.env`:
//! the file that ships with the app, then the file of the same name in the app data folder, which
//! wins. A host with no client id gets the error `browser sign-in is not set up for <host>`.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_git::auth::https_host;
use shipyard_http::{Auth, Error, Http, Request, Response, text};
use shipyard_secrets::{Secret, SecretStore, conn_account};
use specta::Type;
use tauri::AppHandle;

use crate::agents::{Agents, Provider};
use crate::commands::{Api, AppState, Res, blocking, err};
use crate::connections::{ConnectionKind, local_secs};
use crate::work::need_click;
use crate::{pkce, provider_keys};

const EMBEDDED: &str = include_str!("../resources/oauth.env");
const FILE: &str = "oauth.env";
const GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";

/// The keychain account that marks a browser sign-in token and holds its [`Oauth`] state.
pub(crate) fn oauth_account(id: &str) -> String {
    format!("{}:oauth", conn_account(id))
}

/// The state of a browser sign-in token. It holds the refresh token, so it stays in the keychain.
#[derive(Serialize, Deserialize)]
pub(crate) struct Oauth {
    pub refresh: String,
    /// When the access token ends, in Unix seconds. `0` when the host did not say.
    pub expires: i64,
    /// The client id (not a secret) for the refresh request.
    pub client: String,
    /// The scopes that the host granted, split by a space. Empty for a state of an older version.
    #[serde(default)]
    pub scope: String,
}

impl Oauth {
    pub fn to_secret(&self) -> Res<Secret> {
        serde_json::to_string(self)
            .map(Secret::new)
            .map_err(|e| e.to_string())
    }

    pub fn of(secrets: &dyn SecretStore, id: &str) -> Option<Self> {
        let s = secrets.get(&oauth_account(id)).ok()??;
        serde_json::from_str(s.expose()).ok()
    }
}

/// One refresh at a time: GitLab drops a refresh token when it is used once.
static REFRESH: Mutex<()> = Mutex::new(());

/// The `Http` of a GitLab connection that signed in with the browser (see the module text).
pub(crate) struct Bearer {
    inner: Arc<dyn Http>,
    secrets: Arc<dyn SecretStore>,
    /// The lock of the connections store: an edit, a new secret and a remove take it too.
    lock: Arc<Mutex<()>>,
    id: String,
    token_url: String,
}

/// The token ends within a minute, so it must not go out on a request.
fn ending(o: &Oauth) -> bool {
    o.expires > 0 && local_secs() + 60 >= o.expires
}

impl Bearer {
    pub fn new(
        inner: Arc<dyn Http>,
        secrets: Arc<dyn SecretStore>,
        lock: Arc<Mutex<()>>,
        id: &str,
        host: &str,
    ) -> Self {
        Self {
            inner,
            secrets,
            lock,
            id: id.into(),
            token_url: format!("https://{host}/oauth/token"),
        }
    }

    fn access(&self) -> Option<Secret> {
        self.secrets.get(&conn_account(&self.id)).ok()?
    }

    /// For a caller that has no request to retry (git): refreshes a token that ends soon.
    pub fn refresh_if_expired(&self) {
        if let (Some(o), Some(access)) = (Oauth::of(&*self.secrets, &self.id), self.access())
            && ending(&o)
        {
            self.refresh(&access);
        }
    }

    /// Trades the refresh token for a new access token and saves both. `failed` is the access
    /// token that the caller used: a token that is already another one was refreshed by a
    /// concurrent call. `None` when the refresh failed or the connection changed meanwhile.
    fn refresh(&self, failed: &Secret) -> Option<Secret> {
        let _one = REFRESH.lock().unwrap_or_else(|e| e.into_inner());
        let current = self.access()?;
        if current != *failed {
            return Some(current);
        }
        let old = Oauth::of(&*self.secrets, &self.id).filter(|o| !o.refresh.is_empty())?;
        let body = json!({
            "client_id": old.client,
            "refresh_token": old.refresh,
            "grant_type": "refresh_token",
        });
        let res = self
            .inner
            .send(&Request::post_json(
                self.token_url.clone(),
                Auth::None,
                body,
            ))
            .ok()?;
        let v = res.ok().ok()?.json().ok()?;
        let token = text(&v, "/access_token");
        if token.is_empty() {
            return None;
        }
        let refresh = text(&v, "/refresh_token");
        let new = Oauth {
            refresh: if refresh.is_empty() {
                old.refresh.clone()
            } else {
                refresh
            },
            expires: shipyard_http::num(&v, "/expires_in")
                .map_or(0, |n| local_secs() + i64::try_from(n).unwrap_or(0)),
            client: old.client,
            scope: old.scope,
        };
        let token = Secret::new(token);
        // Under the lock of the store, and only if nothing changed since the request: an edit to
        // another host, a pasted token or a remove removed the marker, and those win.
        let _store = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let same = Oauth::of(&*self.secrets, &self.id).is_some_and(|o| o.refresh == old.refresh)
            && self.access().as_ref() == Some(failed);
        if !same {
            return None;
        }
        // The refresh token first: the host dropped the old one, so it must not get lost.
        self.secrets
            .set(&oauth_account(&self.id), &new.to_secret().ok()?)
            .ok()?;
        self.secrets.set(&conn_account(&self.id), &token).ok()?;
        Some(token)
    }
}

impl Http for Bearer {
    fn send(&self, req: &Request) -> Result<Response, Error> {
        let state = Oauth::of(&*self.secrets, &self.id);
        let (Auth::Header("PRIVATE-TOKEN", _), Some(state), Some(mut access)) =
            (&req.auth, state, self.access())
        else {
            return self.inner.send(req);
        };
        let mut refused = false;
        if ending(&state) {
            match self.refresh(&access) {
                Some(t) => access = t,
                None => refused = true,
            }
        }
        let with = |t: &Secret| Request {
            auth: Auth::Bearer(t.clone()),
            ..req.clone()
        };
        let res = self.inner.send(&with(&access))?;
        // A refresh that just failed is not tried again for the 401.
        if res.status != 401 || refused {
            return Ok(res);
        }
        match self.refresh(&access) {
            Some(t) if t != access => self.inner.send(&with(&t)),
            _ => Ok(res),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStart {
    /// What the person types in the browser.
    pub user_code: String,
    /// The page to open.
    pub verification_uri: String,
    pub device_code: String,
    /// Seconds between two polls.
    pub interval: u32,
    pub expires_in: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum DeviceState {
    Pending,
    /// The host asked for a longer gap between polls: add five seconds.
    SlowDown,
    Authorized,
    Denied,
    Expired,
}

/// The value of `host = value`, ignoring blanks and comments. The host matches without case.
fn lookup(text: &str, host: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .find_map(|l| {
            let (k, v) = l.split_once('=')?;
            (k.trim().eq_ignore_ascii_case(host) && !v.trim().is_empty())
                .then(|| v.trim().to_string())
        })
}

fn client_id(dir: &Path, host: &str) -> Res<String> {
    let own = std::fs::read_to_string(dir.join(FILE)).unwrap_or_default();
    lookup(&own, host)
        .or_else(|| lookup(EMBEDDED, host))
        .ok_or_else(|| format!("browser sign-in is not set up for {host}: add `{host} = <client id>` to {FILE} in the app data folder"))
}

/// What GitLab gets when the application of a host allows no `mcp` scope.
const GITLAB_PLAIN: &str = "api";

/// `(device URL, token URL, scope)` of a product on a host.
fn endpoints(kind: ConnectionKind, host: &str) -> Res<(String, String, &'static str)> {
    match kind {
        ConnectionKind::GitHub => Ok((
            format!("https://{host}/login/device/code"),
            format!("https://{host}/login/oauth/access_token"),
            "repo",
        )),
        ConnectionKind::GitLab => Ok((
            format!("https://{host}/oauth/authorize_device"),
            format!("https://{host}/oauth/token"),
            "api mcp",
        )),
        _ => Err("browser sign-in is not set up for this product".into()),
    }
}

/// The product, the host and the client id of a connection.
fn target(s: &AppState, id: &str) -> Res<(ConnectionKind, String, String)> {
    let c = s
        .connections
        .get(id)?
        .ok_or_else(|| format!("unknown connection: {id}"))?;
    let host = https_host(&c.url).ok_or("bad address: use an https address")?;
    Ok((c.kind, host.clone(), client_id(&s.dir, &host)?))
}

fn ask(s: &AppState, url: String, body: Value) -> Res<Value> {
    let r = s
        .connections
        .http()
        .send(&Request::post_json(url, Auth::None, body))
        .map_err(err)?;
    // GitLab answers a pending poll with 400 and a JSON error: read the body whatever the status.
    r.json().map_err(err)
}

pub fn start(s: &AppState, id: &str, click: bool) -> Res<DeviceStart> {
    need_click(s, click)?;
    let (kind, host, client) = target(s, id)?;
    let (device, _, scope) = endpoints(kind, &host)?;
    let mut v = ask(
        s,
        device.clone(),
        json!({ "client_id": client, "scope": scope }),
    )?;
    // An application that does not allow `mcp` refuses the scope: sign in with `api` alone.
    if kind == ConnectionKind::GitLab && text(&v, "/error") == "invalid_scope" {
        v = ask(
            s,
            device,
            json!({ "client_id": client, "scope": GITLAB_PLAIN }),
        )?;
    }
    let field = |k: &str| {
        let t = text(&v, &format!("/{k}"));
        (!t.is_empty()).then_some(t).ok_or_else(|| {
            format!(
                "device login: {host} gave no {k}: {}",
                text(&v, "/error_description")
            )
        })
    };
    let n = |k: &str, d: u32| {
        u32::try_from(shipyard_http::num(&v, &format!("/{k}")).unwrap_or(d.into())).unwrap_or(d)
    };
    Ok(DeviceStart {
        user_code: field("user_code")?,
        verification_uri: field("verification_uri")?,
        device_code: field("device_code")?,
        interval: n("interval", 5).max(1),
        expires_in: n("expires_in", 900),
    })
}

pub fn poll(s: &AppState, id: &str, device_code: &str) -> Res<DeviceState> {
    let (kind, host, client) = target(s, id)?;
    let (_, token_url, _) = endpoints(kind, &host)?;
    let v = ask(
        s,
        token_url,
        json!({ "client_id": client, "device_code": device_code, "grant_type": GRANT }),
    )?;
    let token = text(&v, "/access_token");
    if !token.is_empty() {
        let oauth = (kind == ConnectionKind::GitLab).then(|| Oauth {
            refresh: text(&v, "/refresh_token"),
            expires: shipyard_http::num(&v, "/expires_in")
                .map_or(0, |n| local_secs() + i64::try_from(n).unwrap_or(0)),
            client,
            scope: Some(text(&v, "/scope"))
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| GITLAB_PLAIN.into()),
        });
        s.connections.store_secret(id, Secret::new(token), oauth)?;
        // A sync tick from before the sign-in failed for want of this token.
        let _ = crate::commands::sync::recover(s, &[id]);
        return Ok(DeviceState::Authorized);
    }
    match text(&v, "/error").as_str() {
        "authorization_pending" => Ok(DeviceState::Pending),
        "slow_down" => Ok(DeviceState::SlowDown),
        "access_denied" => Ok(DeviceState::Denied),
        "expired_token" => Ok(DeviceState::Expired),
        other => Err(format!("{host} refused the sign-in: {other}")),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn device_login_start(app: AppHandle, id: String, click: bool) -> Api<DeviceStart> {
    blocking(app, move |s| start(s, &id, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_login_poll(
    app: AppHandle,
    id: String,
    device_code: String,
) -> Api<DeviceState> {
    blocking(app, move |s| poll(s, &id, &device_code)).await
}

// ---------------------------------------------------------------- OpenRouter (OAuth PKCE)

const OR_AUTH: &str = "https://openrouter.ai/auth";
const OR_KEYS: &str = "https://openrouter.ai/api/v1/auth/keys";
const OR_BASE: &str = "https://openrouter.ai/api/v1";
/// A code lasts 10 minutes: the wait for the callback ends with it.
const SIGN_IN_LIMIT: Duration = Duration::from_secs(600);

/// Set by Cancel: the wait for the callback stops and the listener closes.
static CANCEL: AtomicBool = AtomicBool::new(false);
/// One sign-in at a time.
static BUSY: AtomicBool = AtomicBool::new(false);

/// The `code` of the one callback request, or an error. The request must be
/// `GET /callback/<state>?code=<code>`: the `state` rides in the path because the host appends
/// its own query. Any other request is refused and ends the sign-in (a stray program cannot
/// feed a code).
fn callback_code(target: &str, state: &str) -> Option<String> {
    let (path, query) = target.split_once('?')?;
    if path != format!("/callback/{state}") {
        return None;
    }
    let code = query.split('&').find_map(|kv| kv.strip_prefix("code="))?;
    let plain = |c: char| c.is_ascii_alphanumeric() || "-._~".contains(c);
    (!code.is_empty() && code.len() <= 512 && code.chars().all(plain)).then(|| code.to_string())
}

/// Waits for one request on the listener, until `limit` or Cancel.
fn wait_for_code(
    listener: &TcpListener,
    state: &str,
    cancel: &AtomicBool,
    limit: Duration,
) -> Res<String> {
    let end = Instant::now() + limit;
    loop {
        let mut stream = loop {
            if cancel.load(Ordering::SeqCst) {
                return Err("the sign-in was cancelled".into());
            }
            match listener.accept() {
                Ok((stream, _)) => break stream,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() >= end {
                        return Err(
                            "the sign-in timed out after 10 minutes: click Sign in to start again"
                                .into(),
                        );
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(e) => return Err(format!("the sign-in listener failed: {e}")),
            }
        };
        // An accepted socket can keep the non-blocking mode of the listener.
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let mut buf = [0u8; 4096];
        let mut n = 0;
        while n < buf.len() && !buf[..n].contains(&b'\n') {
            match stream.read(&mut buf[n..]) {
                Ok(0) | Err(_) => break,
                Ok(k) => n += k,
            }
        }
        let head = String::from_utf8_lossy(&buf[..n]);
        let Some(target) = head
            .lines()
            .next()
            .and_then(|l| l.strip_prefix("GET "))
            .and_then(|l| l.split(' ').next())
        else {
            // A spare connection that sends no request (a browser opens them): close it and wait on.
            continue;
        };
        let code = callback_code(target, state);
        let (status, page) = match code {
            Some(_) => (
                "200 OK",
                "Signed in. Close this tab and go back to Shipyard.",
            ),
            None => (
                "400 Bad Request",
                "This answer does not match the sign-in. Go back to Shipyard.",
            ),
        };
        let _ = write!(
            stream,
            "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}",
            page.len()
        );
        return code.ok_or_else(|| {
            "the answer did not match this sign-in: click Sign in to try again".into()
        });
    }
}

/// Trades the code for a key. The key reaches no log and no error text.
fn exchange(http: &dyn Http, code: &str, verifier: &str) -> Res<Secret> {
    let body = json!({
        "code": code,
        "code_verifier": verifier,
        "code_challenge_method": "S256",
    });
    let reply = http
        .json(&Request::post_json(OR_KEYS, Auth::None, body))
        .map_err(|e| {
            format!("OpenRouter gave no key: {e}. The code may have expired (it lasts 10 minutes): click Sign in again")
        })?;
    let key = text(&reply, "/key");
    if key.is_empty() {
        return Err("OpenRouter gave no key: click Sign in again".into());
    }
    Ok(Secret::new(key))
}

/// The whole flow. `open` shows the page in the browser. The listener takes 127.0.0.1 on a random
/// port and one request.
fn openrouter_flow(
    agents: &Agents,
    http: &dyn Http,
    open: impl FnOnce(&str) -> Res<()>,
    cancel: &AtomicBool,
    limit: Duration,
) -> Res<Provider> {
    let verifier = pkce::random_hex()?;
    let state = pkce::random_hex()?;
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(err)?;
    listener.set_nonblocking(true).map_err(err)?;
    let port = listener.local_addr().map_err(err)?.port();
    let callback = format!("http://127.0.0.1:{port}/callback/{state}");
    open(&format!(
        "{OR_AUTH}?callback_url={}&code_challenge={}&code_challenge_method=S256",
        shipyard_http::encode(&callback),
        pkce::challenge(&verifier)
    ))?;
    let code = wait_for_code(&listener, &state, cancel, limit)?;
    drop(listener);
    let key = exchange(http, &code, &verifier)?;
    provider_keys::store(agents, "OpenRouter", OR_BASE, "openrouter/auto", Some(key))
}

#[tauri::command]
#[specta::specta]
pub async fn providers_openrouter_sign_in(app: AppHandle, click: bool) -> Api<Provider> {
    blocking(app, move |s| {
        need_click(s, click)?;
        if BUSY.swap(true, Ordering::SeqCst) {
            return Err("a sign-in is already open: cancel it first".into());
        }
        CANCEL.store(false, Ordering::SeqCst);
        let out = openrouter_flow(
            &s.agents,
            &*s.connections.http(),
            crate::feedback::open,
            &CANCEL,
            SIGN_IN_LIMIT,
        );
        BUSY.store(false, Ordering::SeqCst);
        out
    })
    .await
}

/// Stops the wait for the callback. It does nothing when no sign-in waits.
#[tauri::command]
#[specta::specta]
pub async fn providers_openrouter_cancel() -> Api<()> {
    CANCEL.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use shipyard_http::fake::FakeHttp;
    use shipyard_secrets::MemoryStore;

    use super::*;
    use crate::connections::{ConnectionDraft, ConnectionGroup, Connections};

    fn state(dir: &Path, http: FakeHttp, url: &str) -> (AppState, String) {
        let conns = Arc::new(Connections::new(
            dir,
            Arc::new(MemoryStore::default()),
            Arc::new(http),
        ));
        let s = AppState::with_connections(dir.join("data"), conns);
        let c = s
            .connections
            .add(ConnectionDraft {
                name: "Forge".into(),
                group: ConnectionGroup::Forge,
                kind: ConnectionKind::GitHub,
                url: url.into(),
                user: None,
            })
            .unwrap();
        (s, c.id)
    }

    #[test]
    fn a_client_id_line_is_found_without_case() {
        let text = "# c\n\nGitHub.com = abc\nother = x\n";
        assert_eq!(lookup(text, "github.com").as_deref(), Some("abc"));
        assert_eq!(lookup(text, "gitlab.com"), None);
    }

    #[test]
    fn a_host_with_no_client_id_says_so_before_any_request() {
        let dir = tempfile::tempdir().unwrap();
        let (s, id) = state(dir.path(), FakeHttp::new(), "https://ghe.example.com");
        let e = start(&s, &id, true).unwrap_err();
        assert!(
            e.contains("browser sign-in is not set up for ghe.example.com"),
            "{e}"
        );
        assert!(start(&s, &id, false).unwrap_err().contains("click"));
    }

    #[test]
    fn the_flow_stores_the_token_in_the_keychain_and_shows_no_token() {
        let dir = tempfile::tempdir().unwrap();
        let http = FakeHttp::new();
        http.post(
            "/login/device/code",
            "cid-1",
            200,
            r#"{"device_code":"dev","user_code":"AB-12","verification_uri":"https://github.com/login/device","interval":5,"expires_in":900}"#,
        )
        .post("/login/oauth/access_token", "dev", 200, r#"{"error":"authorization_pending"}"#);
        let (s, id) = state(dir.path(), http, "https://github.com");
        std::fs::create_dir_all(&s.dir).unwrap();
        std::fs::write(s.dir.join(FILE), "github.com = cid-1\n").unwrap();
        let d = start(&s, &id, true).unwrap();
        assert_eq!((d.user_code.as_str(), d.interval), ("AB-12", 5));
        assert_eq!(poll(&s, &id, &d.device_code).unwrap(), DeviceState::Pending);
        assert!(!s.connections.get(&id).unwrap().unwrap().secret);
    }

    #[test]
    fn an_approved_poll_saves_the_secret() {
        let dir = tempfile::tempdir().unwrap();
        let http = FakeHttp::new();
        http.post(
            "/login/oauth/access_token",
            "dev",
            200,
            r#"{"access_token":"gho_x"}"#,
        );
        let (s, id) = state(dir.path(), http, "https://github.com");
        std::fs::create_dir_all(&s.dir).unwrap();
        std::fs::write(s.dir.join(FILE), "github.com = cid-1\n").unwrap();
        assert_eq!(poll(&s, &id, "dev").unwrap(), DeviceState::Authorized);
        assert!(s.connections.get(&id).unwrap().unwrap().secret);
    }

    #[test]
    fn a_github_sign_in_stores_the_access_token_alone_and_it_passes_the_user_call() {
        let dir = tempfile::tempdir().unwrap();
        let http = Arc::new(FakeHttp::new());
        http.post(
            "/login/oauth/access_token",
            "dev",
            200,
            r#"{"access_token":"gho_x","token_type":"bearer","scope":"repo"}"#,
        )
        .get("api.github.com/user", 200, r#"{"login":"ada"}"#)
        .get("/issues", 200, "[]");
        let store = Arc::new(MemoryStore::default());
        let conns = Arc::new(Connections::new(dir.path(), store.clone(), http.clone()));
        let s = AppState::with_connections(dir.path().join("data"), conns);
        let id = s
            .connections
            .add(ConnectionDraft {
                name: "Issues".into(),
                group: ConnectionGroup::Tracker,
                kind: ConnectionKind::GitHub,
                url: "https://github.com".into(),
                user: None,
            })
            .unwrap()
            .id;
        std::fs::create_dir_all(&s.dir).unwrap();
        std::fs::write(s.dir.join(FILE), "github.com = cid-1\n").unwrap();
        assert_eq!(poll(&s, &id, "dev").unwrap(), DeviceState::Authorized);
        // The value is the access token, with no marker: it goes out as the plain Bearer header.
        assert_eq!(
            store.get(&conn_account(&id)).unwrap().unwrap().expose(),
            "gho_x"
        );
        assert!(store.get(&oauth_account(&id)).unwrap().is_none());
        assert!(matches!(
            s.connections.test(&id).unwrap(),
            shipyard_http::TestOutcome::Passed { .. }
        ));
        let sent = http.requests();
        let call = sent.iter().find(|r| r.url.ends_with("/user")).unwrap();
        assert!(matches!(&call.auth, Auth::Bearer(t) if t.expose() == "gho_x"));
    }

    fn gitlab(dir: &Path, http: FakeHttp, store: Arc<MemoryStore>) -> (AppState, String) {
        let conns = Arc::new(Connections::new(dir, store, Arc::new(http)));
        let s = AppState::with_connections(dir.join("data"), conns);
        let c = s
            .connections
            .add(ConnectionDraft {
                name: "Code".into(),
                group: ConnectionGroup::Forge,
                kind: ConnectionKind::GitLab,
                url: "https://gitlab.com".into(),
                user: None,
            })
            .unwrap();
        (s, c.id)
    }

    #[test]
    fn a_gitlab_sign_in_keeps_the_refresh_token_and_a_pasted_token_drops_it() {
        let dir = tempfile::tempdir().unwrap();
        let http = FakeHttp::new();
        http.post(
            "/oauth/token",
            "dev",
            200,
            r#"{"access_token":"at1","refresh_token":"rt1","expires_in":7200}"#,
        );
        let store = Arc::new(MemoryStore::default());
        let (s, id) = gitlab(dir.path(), http, store.clone());
        std::fs::create_dir_all(&s.dir).unwrap();
        std::fs::write(s.dir.join(FILE), "gitlab.com = cid\n").unwrap();
        assert_eq!(poll(&s, &id, "dev").unwrap(), DeviceState::Authorized);
        let access = store.get(&conn_account(&id)).unwrap().unwrap();
        assert_eq!(access.expose(), "at1");
        let o = Oauth::of(&*store, &id).unwrap();
        assert_eq!((o.refresh.as_str(), o.client.as_str()), ("rt1", "cid"));
        assert!(o.expires > local_secs() + 7000);
        s.connections
            .set_secret(&id, Secret::new("glpat-x"))
            .unwrap();
        assert!(Oauth::of(&*store, &id).is_none());
    }

    #[test]
    fn gitlab_asks_for_api_and_mcp_and_stores_what_it_granted() {
        let dir = tempfile::tempdir().unwrap();
        let http = FakeHttp::new();
        http.post(
            "/oauth/authorize_device",
            r#""scope":"api mcp""#,
            200,
            r#"{"device_code":"dev","user_code":"AB-12","verification_uri":"https://gitlab.com/oauth/device"}"#,
        )
        .post(
            "/oauth/token",
            "dev",
            200,
            r#"{"access_token":"at1","refresh_token":"rt1","expires_in":7200,"scope":"api mcp"}"#,
        );
        let (s, id) = gitlab(dir.path(), http, Arc::new(MemoryStore::default()));
        std::fs::create_dir_all(&s.dir).unwrap();
        std::fs::write(s.dir.join(FILE), "gitlab.com = cid\n").unwrap();
        let d = start(&s, &id, true).unwrap();
        assert_eq!(
            poll(&s, &id, &d.device_code).unwrap(),
            DeviceState::Authorized
        );
        assert_eq!(
            s.connections.get(&id).unwrap().unwrap().scopes,
            ["api", "mcp"]
        );
    }

    #[test]
    fn a_host_that_refuses_mcp_signs_in_with_api_alone() {
        let dir = tempfile::tempdir().unwrap();
        let http = FakeHttp::new();
        http.post(
            "/oauth/authorize_device",
            r#""scope":"api mcp""#,
            400,
            r#"{"error":"invalid_scope"}"#,
        )
        .post(
            "/oauth/authorize_device",
            r#""scope":"api""#,
            200,
            r#"{"device_code":"dev","user_code":"CD-34","verification_uri":"https://gitlab.com/oauth/device"}"#,
        )
        .post(
            "/oauth/token",
            "dev",
            200,
            r#"{"access_token":"at1","refresh_token":"rt1"}"#,
        );
        let (s, id) = gitlab(dir.path(), http, Arc::new(MemoryStore::default()));
        std::fs::create_dir_all(&s.dir).unwrap();
        std::fs::write(s.dir.join(FILE), "gitlab.com = cid\n").unwrap();
        let d = start(&s, &id, true).unwrap();
        assert_eq!(d.user_code, "CD-34");
        poll(&s, &id, &d.device_code).unwrap();
        // The host named no scope: the grant is `api`, so no MCP switch shows.
        assert_eq!(s.connections.get(&id).unwrap().unwrap().scopes, ["api"]);
        s.connections
            .set_secret(&id, Secret::new("glpat-x"))
            .unwrap();
        assert!(s.connections.get(&id).unwrap().unwrap().scopes.is_empty());
    }

    fn signed_in(store: &MemoryStore, expires: i64) {
        store.set(&conn_account("c"), &Secret::new("old")).unwrap();
        let o = Oauth {
            refresh: "rt1".into(),
            expires,
            client: "cid".into(),
            scope: "api mcp".into(),
        };
        store
            .set(&oauth_account("c"), &o.to_secret().unwrap())
            .unwrap();
    }

    fn refreshed() -> Arc<FakeHttp> {
        let http = Arc::new(FakeHttp::new());
        http.post(
            "/oauth/token",
            "rt1",
            200,
            r#"{"access_token":"new","refresh_token":"rt2","expires_in":7200}"#,
        )
        .get("/api/v4/user", 200, "{}");
        http
    }

    fn bearer(inner: Arc<dyn Http>, store: &Arc<MemoryStore>) -> Bearer {
        Bearer::new(
            inner,
            store.clone(),
            Arc::new(Mutex::new(())),
            "c",
            "gitlab.com",
        )
    }

    fn call(b: &Bearer) -> Response {
        let auth = Auth::Header("PRIVATE-TOKEN", Secret::new("old"));
        b.send(&Request::get("https://gitlab.com/api/v4/user", auth))
            .unwrap()
    }

    fn token_of(r: &Request) -> Option<String> {
        match &r.auth {
            Auth::Bearer(t) => Some(t.expose().to_string()),
            _ => None,
        }
    }

    /// A GitLab that refuses the token `old`.
    struct Refuses(Arc<FakeHttp>);

    impl Http for Refuses {
        fn send(&self, r: &Request) -> Result<Response, Error> {
            let res = self.0.send(r)?;
            Ok(match token_of(r).as_deref() {
                Some("old") => Response { status: 401, ..res },
                _ => res,
            })
        }
    }

    #[test]
    fn a_browser_token_goes_as_bearer_and_a_pasted_token_stays_a_private_token() {
        let store = Arc::new(MemoryStore::default());
        let http = refreshed();
        // No marker: the request is unchanged.
        store.set(&conn_account("c"), &Secret::new("old")).unwrap();
        assert_eq!(call(&bearer(http.clone(), &store)).status, 200);
        assert!(matches!(http.requests()[0].auth, Auth::Header(..)));
        // A marker, and a token that is still valid: Bearer, no refresh.
        signed_in(&store, local_secs() + 3600);
        assert_eq!(call(&bearer(http.clone(), &store)).status, 200);
        let log = http.requests();
        assert_eq!(log.len(), 2);
        assert_eq!(token_of(&log[1]).as_deref(), Some("old"));
    }

    #[test]
    fn an_expired_token_is_refreshed_before_the_request() {
        let store = Arc::new(MemoryStore::default());
        signed_in(&store, 1);
        let http = refreshed();
        assert_eq!(call(&bearer(http.clone(), &store)).status, 200);
        let log = http.requests();
        assert_eq!(log.len(), 2);
        assert!(log[0].url.ends_with("/oauth/token"));
        assert_eq!(token_of(&log[1]).as_deref(), Some("new"));
        let kept = store.get(&conn_account("c")).unwrap().unwrap();
        assert_eq!(kept.expose(), "new");
        assert_eq!(Oauth::of(&*store, "c").unwrap().refresh, "rt2");
    }

    #[test]
    fn a_401_refreshes_once_and_retries_once() {
        let store = Arc::new(MemoryStore::default());
        signed_in(&store, local_secs() + 3600);
        let http = refreshed();
        let b = bearer(Arc::new(Refuses(http.clone())), &store);
        assert_eq!(call(&b).status, 200);
        let log = http.requests();
        let seen: Vec<_> = log.iter().map(token_of).collect();
        assert_eq!(seen, [Some("old".into()), None, Some("new".into())]);
        // The refresh fails: the 401 comes back after one try, with no retry.
        let store = Arc::new(MemoryStore::default());
        signed_in(&store, local_secs() + 3600);
        let down = Arc::new(FakeHttp::new());
        down.post("/oauth/token", "rt1", 400, r#"{"error":"invalid_grant"}"#)
            .get("/api/v4/user", 200, "{}");
        let b = bearer(Arc::new(Refuses(down.clone())), &store);
        assert_eq!(call(&b).status, 401);
        assert_eq!(down.requests().len(), 2);
    }

    #[test]
    fn a_refresh_that_failed_is_not_tried_again_for_the_401() {
        let store = Arc::new(MemoryStore::default());
        signed_in(&store, 1);
        let down = Arc::new(FakeHttp::new());
        down.post("/oauth/token", "rt1", 400, r#"{"error":"invalid_grant"}"#)
            .get("/api/v4/user", 200, "{}");
        let b = bearer(Arc::new(Refuses(down.clone())), &store);
        assert_eq!(call(&b).status, 401);
        // One call to the token endpoint, one to the API.
        assert_eq!(down.requests().len(), 2);
    }

    /// Runs `before` when the token request goes out: a change that lands during the refresh.
    struct During<F: Fn() + Send + Sync>(Arc<FakeHttp>, F);

    impl<F: Fn() + Send + Sync> Http for During<F> {
        fn send(&self, r: &Request) -> Result<Response, Error> {
            if r.url.ends_with("/oauth/token") {
                (self.1)();
            }
            self.0.send(r)
        }
    }

    #[test]
    fn a_refresh_does_not_overwrite_a_secret_that_changed_meanwhile() {
        let store = Arc::new(MemoryStore::default());
        signed_in(&store, 1);
        let (st, http) = (store.clone(), refreshed());
        // A pasted token lands during the refresh: it drops the marker and replaces the token.
        let pasted = During(http, move || {
            st.delete(&oauth_account("c")).unwrap();
            st.set(&conn_account("c"), &Secret::new("pat")).unwrap();
        });
        call(&bearer(Arc::new(pasted), &store));
        let kept = store.get(&conn_account("c")).unwrap().unwrap();
        assert_eq!(kept.expose(), "pat");
        assert!(Oauth::of(&*store, "c").is_none());
    }

    /// A keychain that refuses to save an access token.
    struct NoAccess(MemoryStore);

    impl SecretStore for NoAccess {
        fn get(&self, a: &str) -> Result<Option<Secret>, shipyard_secrets::SecretError> {
            self.0.get(a)
        }
        fn set(&self, a: &str, s: &Secret) -> Result<(), shipyard_secrets::SecretError> {
            if a.ends_with(":oauth") {
                self.0.set(a, s)
            } else {
                Err(shipyard_secrets::SecretError::new("denied"))
            }
        }
        fn delete(&self, a: &str) -> Result<(), shipyard_secrets::SecretError> {
            self.0.delete(a)
        }
    }

    #[test]
    fn the_new_refresh_token_is_saved_before_the_access_token() {
        let mem = MemoryStore::default();
        signed_in(&mem, 1);
        let store = Arc::new(NoAccess(mem));
        let b = Bearer::new(
            refreshed(),
            store.clone(),
            Arc::new(Mutex::new(())),
            "c",
            "gitlab.com",
        );
        call(&b);
        // The second write failed, and the refresh token that the host gave is not lost.
        assert_eq!(Oauth::of(&*store, "c").unwrap().refresh, "rt2");
    }

    // ------------------------------------------------ OpenRouter (OAuth PKCE)

    use std::net::TcpStream;
    use std::sync::atomic::AtomicBool;
    use std::time::Duration;

    fn agents(dir: &Path) -> (Agents, Arc<MemoryStore>) {
        let store = Arc::new(MemoryStore::default());
        let a = Agents::new(dir, store.clone(), Arc::new(FakeHttp::new()), |c| c);
        (a, store)
    }

    /// A browser that follows the page: it calls the callback of the URL, with `tail` after the
    /// path, and with a wrong `state` when `wrong`. `seen` keeps the page URL.
    fn browser(
        tail: &'static str,
        wrong: bool,
        seen: Arc<Mutex<String>>,
    ) -> impl FnOnce(&str) -> Res<()> {
        move |url| {
            *seen.lock().unwrap() = url.to_string();
            let cb = url.split("callback_url=").nth(1).unwrap();
            let cb = cb
                .split('&')
                .next()
                .unwrap()
                .replace("%3A", ":")
                .replace("%2F", "/");
            let (port, path) = cb
                .strip_prefix("http://127.0.0.1:")
                .unwrap()
                .split_once('/')
                .unwrap();
            let path = if wrong {
                "other".into()
            } else {
                path.to_string()
            };
            let addr = format!("127.0.0.1:{port}");
            let req = format!("GET /{path}{tail} HTTP/1.1\r\nHost: x\r\n\r\n");
            std::thread::spawn(move || {
                let mut c = TcpStream::connect(addr).unwrap();
                c.write_all(req.as_bytes()).unwrap();
                let _ = c.read_to_string(&mut String::new());
            });
            Ok(())
        }
    }

    const LONG: Duration = Duration::from_secs(20);

    #[test]
    fn the_openrouter_sign_in_sends_the_s256_pair_and_stores_the_key_in_the_keychain_only() {
        let dir = tempfile::tempdir().unwrap();
        let (a, store) = agents(dir.path());
        let http = FakeHttp::new();
        http.post(
            "/api/v1/auth/keys",
            "abc123",
            200,
            r#"{"key":"sk-or-v1-secret"}"#,
        );
        let seen = Arc::new(Mutex::new(String::new()));
        let p = openrouter_flow(
            &a,
            &http,
            browser("?code=abc123", false, seen.clone()),
            &AtomicBool::new(false),
            LONG,
        )
        .unwrap();
        assert_eq!(
            (p.name.as_str(), p.url.as_str(), p.secret),
            ("OpenRouter", OR_BASE, true)
        );
        assert_eq!(
            store.get(&conn_account(&p.id)).unwrap().unwrap().expose(),
            "sk-or-v1-secret"
        );
        let file =
            std::fs::read_to_string(dir.path().join(shipyard_mcp::relay::CONFIG_FILE)).unwrap();
        assert!(!file.contains("sk-or-v1-secret"));
        // The page: the host, a loopback callback and the challenge. The verifier is not in it.
        let page = seen.lock().unwrap().clone();
        assert!(
            page.starts_with("https://openrouter.ai/auth?callback_url=http%3A%2F%2F127.0.0.1%3A")
        );
        assert!(page.ends_with("&code_challenge_method=S256"));
        let sent = http.requests();
        let body = sent[0].body.as_ref().unwrap();
        let verifier = text(body, "/code_verifier");
        assert_eq!(text(body, "/code"), "abc123");
        assert_eq!(text(body, "/code_challenge_method"), "S256");
        assert!(page.contains(&format!("code_challenge={}", pkce::challenge(&verifier))));
        assert!(!page.contains(&verifier));
        assert!(matches!(sent[0].auth, Auth::None));
    }

    #[test]
    fn a_spare_connection_that_sends_nothing_does_not_end_the_wait() {
        let dir = tempfile::tempdir().unwrap();
        let (a, _) = agents(dir.path());
        let http = FakeHttp::new();
        http.post(
            "/api/v1/auth/keys",
            "abc123",
            200,
            r#"{"key":"sk-or-v1-x"}"#,
        );
        let real = browser("?code=abc123", false, Arc::new(Mutex::new(String::new())));
        let open = move |url: &str| -> Res<()> {
            let port = url.split("127.0.0.1%3A").nth(1).unwrap();
            let port = port.split("%2F").next().unwrap();
            // The empty connection comes first and closes with no request line.
            drop(TcpStream::connect(format!("127.0.0.1:{port}")).unwrap());
            real(url)
        };
        let p = openrouter_flow(&a, &http, open, &AtomicBool::new(false), LONG).unwrap();
        assert!(p.secret);
    }

    #[test]
    fn a_callback_with_another_state_is_refused_and_nothing_is_sent_or_stored() {
        let dir = tempfile::tempdir().unwrap();
        let (a, store) = agents(dir.path());
        let http = FakeHttp::new();
        let seen = Arc::new(Mutex::new(String::new()));
        let e = openrouter_flow(
            &a,
            &http,
            browser("?code=abc123", true, seen),
            &AtomicBool::new(false),
            LONG,
        )
        .unwrap_err();
        assert!(e.contains("did not match"), "{e}");
        assert!(http.requests().is_empty());
        assert!(a.providers().unwrap().is_empty());
        assert!(
            store
                .get(&conn_account("provider-openrouter"))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn a_callback_with_no_valid_code_is_refused() {
        assert_eq!(
            callback_code("/callback/s?code=ab-1", "s").as_deref(),
            Some("ab-1")
        );
        for bad in [
            "/callback/s",
            "/callback/s?code=",
            "/callback/s?error=denied",
            "/callback/t?code=ab",
            "/callback?code=ab",
            "/callback/s?code=a%20b",
            "/callback/s?code=a<b",
        ] {
            assert_eq!(callback_code(bad, "s"), None, "{bad}");
        }
    }

    #[test]
    fn an_expired_code_gives_a_plain_error_with_the_action_and_stores_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let (a, _) = agents(dir.path());
        let http = FakeHttp::new();
        http.post(
            "/api/v1/auth/keys",
            "abc123",
            400,
            r#"{"error":{"message":"code expired"}}"#,
        );
        let seen = Arc::new(Mutex::new(String::new()));
        let e = openrouter_flow(
            &a,
            &http,
            browser("?code=abc123", false, seen),
            &AtomicBool::new(false),
            LONG,
        )
        .unwrap_err();
        assert!(
            e.contains("expired") && e.contains("click Sign in again"),
            "{e}"
        );
        assert!(a.providers().unwrap().is_empty());
    }

    #[test]
    fn cancel_and_the_time_limit_stop_the_listener() {
        let dir = tempfile::tempdir().unwrap();
        let (a, _) = agents(dir.path());
        let http = FakeHttp::new();
        let cancel = AtomicBool::new(false);
        // No browser answers. Cancel lands while the flow waits.
        let e = std::thread::scope(|t| {
            t.spawn(|| {
                std::thread::sleep(Duration::from_millis(150));
                cancel.store(true, Ordering::SeqCst);
            });
            openrouter_flow(&a, &http, |_| Ok(()), &cancel, LONG).unwrap_err()
        });
        assert!(e.contains("cancelled"), "{e}");
        let e = openrouter_flow(
            &a,
            &http,
            |_| Ok(()),
            &AtomicBool::new(false),
            Duration::ZERO,
        )
        .unwrap_err();
        assert!(e.contains("10 minutes"), "{e}");
        assert!(http.requests().is_empty());
    }
}
