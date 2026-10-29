//! The one HTTP setup for every adapter: types, a real client and a fake for tests.
//!
//! The client has these controls, and no caller can change them:
//!
//! 1. No redirects. A redirect re-sends custom auth headers (`PRIVATE-TOKEN`) to the new host.
//! 2. A response size cap ([`MAX_BODY_BYTES`]).
//! 3. Connect and read timeouts.
//! 4. A credential goes only over `https`, or to a loopback host.
//! 5. Proxy from `ALL_PROXY`, `HTTPS_PROXY` and `HTTP_PROXY`, with `NO_PROXY`.
//! 6. The OS trust store, plus the bundle in `SHIPYARD_CA_BUNDLE` or `SSL_CERT_FILE`.
//!
//! An adapter reads from a service, so it sends `GET`, or `POST` for a read-only query
//! (GraphQL, WIQL). The adapters never send a write.

mod client;
pub mod fake;

use serde::Serialize;
use serde_json::Value;
use shipyard_secrets::Secret;
use specta::Type;

pub use client::{Client, bypasses_proxy};

/// Largest response body the client reads.
pub const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
}

/// How a request proves who sends it. Each secret stays in a `Secret` until the wire.
#[derive(Debug, Clone)]
pub enum Auth {
    None,
    Bearer(Secret),
    /// `Authorization: Basic base64(user:secret)`.
    Basic(String, Secret),
    /// `<name>: <secret>`, for example `PRIVATE-TOKEN`.
    Header(&'static str, Secret),
}

impl Auth {
    pub fn secret(&self) -> Option<&Secret> {
        match self {
            Auth::None => None,
            Auth::Bearer(s) | Auth::Basic(_, s) | Auth::Header(_, s) => Some(s),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Request {
    pub method: Method,
    pub url: String,
    pub auth: Auth,
    pub headers: Vec<(&'static str, String)>,
    pub body: Option<Value>,
}

impl Request {
    pub fn get(url: impl Into<String>, auth: Auth) -> Self {
        Self {
            method: Method::Get,
            url: url.into(),
            auth,
            headers: Vec::new(),
            body: None,
        }
    }

    /// A read-only query sent as `POST` with a JSON body.
    pub fn post_json(url: impl Into<String>, auth: Auth, body: Value) -> Self {
        Self {
            method: Method::Post,
            url: url.into(),
            auth,
            headers: Vec::new(),
            body: Some(body),
        }
    }

    pub fn header(mut self, name: &'static str, value: impl Into<String>) -> Self {
        self.headers.push((name, value.into()));
        self
    }
}

#[derive(Debug, Clone)]
pub struct Response {
    pub status: u16,
    /// Lowercase names.
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Response {
    pub fn header(&self, name: &str) -> Option<&str> {
        let name = name.to_ascii_lowercase();
        self.headers
            .iter()
            .find(|(k, _)| *k == name)
            .map(|(_, v)| v.as_str())
    }

    /// The body when the status is 2xx; an [`Error::Status`] otherwise.
    pub fn ok(self) -> Result<Self, Error> {
        if (200..300).contains(&self.status) {
            return Ok(self);
        }
        let text = String::from_utf8_lossy(&self.body);
        let detail: String = text
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(200)
            .collect();
        Err(Error::Status {
            status: self.status,
            detail,
            scope: self.scope_hint(),
        })
    }

    pub fn json(&self) -> Result<Value, Error> {
        serde_json::from_slice(&self.body).map_err(|_| {
            let text = String::from_utf8_lossy(&self.body);
            if text.trim_start().starts_with('<') {
                Error::Parse("the host answered with a web page, not API data: check the address and the token".into())
            } else {
                Error::Parse("the host answered with data that is not JSON".into())
            }
        })
    }

    /// The scope or permission that a forge or tracker names in a refusal header.
    fn scope_hint(&self) -> Option<String> {
        for name in ["x-accepted-github-permissions", "x-accepted-oauth-scopes"] {
            if let Some(v) = self.header(name).filter(|v| !v.trim().is_empty()) {
                return Some(v.trim().to_string());
            }
        }
        // GitLab: `WWW-Authenticate: Bearer error="insufficient_scope" scope="read_api"`.
        let challenge = self.header("www-authenticate")?;
        let rest = challenge.split("scope=\"").nth(1)?;
        Some(rest.split('"').next()?.to_string())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("bad address: {0}")]
    BadUrl(String),
    #[error("a credential goes only over https, not {0}")]
    Insecure(String),
    #[error("network error: {0}")]
    Transport(String),
    #[error("the response is larger than {MAX_BODY_BYTES} bytes")]
    TooLarge,
    #[error("HTTP {status}: {detail}")]
    Status {
        status: u16,
        detail: String,
        scope: Option<String>,
    },
    #[error("{0}")]
    Parse(String),
}

pub trait Http: Send + Sync {
    fn send(&self, request: &Request) -> Result<Response, Error>;

    /// `send`, then 2xx or an error, then JSON.
    fn json(&self, request: &Request) -> Result<Value, Error> {
        self.send(request)?.ok()?.json()
    }
}

/// The result of a connection test. A failure names the missing scope or permission,
/// or the reason when it is not a scope (REQ-012).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum TestOutcome {
    Passed { account: String },
    MissingScope { scope: String },
    Failed { reason: String },
}

impl TestOutcome {
    /// Map a failed call. `needed` names the scope that the call needs, in the words of the service.
    pub fn from_error(error: &Error, needed: &str) -> Self {
        match error {
            Error::Status {
                status: 403, scope, ..
            } => Self::MissingScope {
                scope: scope.clone().unwrap_or_else(|| needed.to_string()),
            },
            Error::Status { status: 401, .. } => Self::Failed {
                reason: "the token was rejected: wrong, expired or revoked".into(),
            },
            other => Self::Failed {
                reason: other.to_string(),
            },
        }
    }
}

/// A validated `https` base address without a trailing slash.
/// The host check stops a typo from sending a token to another host.
pub fn base_url(raw: &str) -> Result<String, Error> {
    let url = url::Url::parse(raw.trim()).map_err(|e| Error::BadUrl(e.to_string()))?;
    let host = url
        .host_str()
        .filter(|h| !h.is_empty())
        .ok_or_else(|| Error::BadUrl("no host".into()))?;
    if url.scheme() != "https" && !client::is_loopback(host) {
        return Err(Error::BadUrl("use an https address".into()));
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(Error::BadUrl(
            "the address holds no credential, query or fragment".into(),
        ));
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

/// `base` + `path` + an encoded query. `path` starts with `/`.
pub fn build_url(base: &str, path: &str, query: &[(&str, &str)]) -> String {
    let mut out = format!("{base}{path}");
    for (i, (k, v)) in query.iter().enumerate() {
        out.push(if i == 0 { '?' } else { '&' });
        out.push_str(&encode(k));
        out.push('=');
        out.push_str(&encode(v));
    }
    out
}

/// Percent-encode one URL component, `/` included.
pub fn encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
}

/// A string at a JSON pointer, or empty.
pub fn text(value: &Value, pointer: &str) -> String {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// A non-negative integer at a JSON pointer.
pub fn num(value: &Value, pointer: &str) -> Option<u64> {
    value.pointer(pointer).and_then(Value::as_u64)
}

/// An array at a JSON pointer, or empty.
pub fn items<'a>(value: &'a Value, pointer: &str) -> &'a [Value] {
    value
        .pointer(pointer)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}
