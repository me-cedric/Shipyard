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

use std::path::Path;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shipyard_git::auth::https_host;
use shipyard_http::{Auth, Error, Http, Request, Response, text};
use shipyard_secrets::{Secret, SecretStore, conn_account};
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::connections::{ConnectionKind, local_secs};
use crate::work::need_click;

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
        (!t.is_empty())
            .then_some(t)
            .ok_or_else(|| format!("{host} gave no {k}: {}", text(&v, "/error_description")))
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
}
