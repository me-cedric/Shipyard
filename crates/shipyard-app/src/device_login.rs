//! Browser sign-in for a GitHub or GitLab connection (the OAuth device flow, RFC 8628). A forge
//! connection and a tracker connection of these two products both use it.
//!
//! Two steps, so the view can show the code while the person acts in the browser: [`start`] asks
//! the host for a code and a page, and [`poll`] trades the device code for a token once the person
//! agreed. The token goes to the keychain like a pasted one (`Connections::set_secret`): it never
//! reaches a view, a log or an error text.
//!
//! A host needs a registered OAuth app. Its client id (not a secret) comes from `oauth.env`:
//! the file that ships with the app, then the file of the same name in the app data folder, which
//! wins. A host with no client id gets the error `browser sign-in is not set up for <host>`.

use std::path::Path;

use serde::Serialize;
use serde_json::{Value, json};
use shipyard_git::auth::https_host;
use shipyard_http::{Auth, Request, text};
use shipyard_secrets::Secret;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::connections::ConnectionKind;
use crate::work::need_click;

const EMBEDDED: &str = include_str!("../resources/oauth.env");
const FILE: &str = "oauth.env";
const GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";

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
            "api",
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
    let v = ask(s, device, json!({ "client_id": client, "scope": scope }))?;
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
        s.connections.set_secret(id, Secret::new(token))?;
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
        let (s, id) = state(dir.path(), FakeHttp::new(), "https://github.com");
        let e = start(&s, &id, true).unwrap_err();
        assert!(
            e.contains("browser sign-in is not set up for github.com"),
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
}
