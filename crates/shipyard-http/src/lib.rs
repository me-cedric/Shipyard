//! The one HTTP setup for every adapter: types, a real client and a fake for tests.
//!
//! The client has these controls, and no caller can change them:
//!
//! 1. No redirects. A redirect re-sends custom auth headers (`PRIVATE-TOKEN`) to the new host.
//! 2. A response size cap ([`MAX_BODY_BYTES`]).
//! 3. Connect and read timeouts. The read timeout is [`DEFAULT_READ_TIMEOUT`]; a request can ask for
//!    a longer one with [`Request::timeout`] (a slow local model).
//! 4. A credential goes only over `https`, or to a loopback host.
//! 5. Proxy from `ALL_PROXY`, `HTTPS_PROXY` and `HTTP_PROXY`, with `NO_PROXY`.
//! 6. The OS trust store, plus the bundle in `SHIPYARD_CA_BUNDLE` or `SSL_CERT_FILE`.
//!
//! An adapter reads from a service, so it sends `GET`, or `POST` for a read-only query
//! (GraphQL, WIQL). A tracker write (`shipyard-trackers`, `work`) sends `POST`, `PUT` or `PATCH`
//! with [`Request::write`], or `DELETE` with [`Request::delete`]. A request that sets its own
//! `Content-Type` header keeps it (Azure DevOps needs `application/json-patch+json`).

mod client;
pub mod fake;

use serde::Serialize;
use serde_json::Value;
use shipyard_secrets::Secret;
use specta::Type;
use std::time::Duration;

pub use client::{Client, bypasses_proxy};

/// Largest response body the client reads.
pub const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;

/// How long the client waits for each read, unless the request sets its own.
pub const DEFAULT_READ_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
    Put,
    Patch,
    Delete,
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
    /// Read timeout. `None` is [`DEFAULT_READ_TIMEOUT`].
    pub timeout: Option<Duration>,
}

impl Request {
    pub fn get(url: impl Into<String>, auth: Auth) -> Self {
        Self {
            method: Method::Get,
            url: url.into(),
            auth,
            headers: Vec::new(),
            body: None,
            timeout: None,
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
            timeout: None,
        }
    }

    /// A write with a JSON body: `POST`, `PUT` or `PATCH`.
    pub fn write(method: Method, url: impl Into<String>, auth: Auth, body: Value) -> Self {
        Self {
            method,
            ..Self::post_json(url, auth, body)
        }
    }

    /// A `DELETE` with no body.
    pub fn delete(url: impl Into<String>, auth: Auth) -> Self {
        Self {
            method: Method::Delete,
            ..Self::get(url, auth)
        }
    }

    /// Wait up to `timeout` for each read, in place of the default.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
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

    /// The `Date` header as Unix seconds: the clock of the server. `None` when it is missing or not
    /// the form `Sun, 06 Nov 1994 08:49:37 GMT`.
    pub fn date(&self) -> Option<u64> {
        let mut it = self.header("date")?.split_whitespace();
        let (_, day, mon, year, time, zone) = (
            it.next()?,
            it.next()?.parse::<i64>().ok()?,
            it.next()?,
            it.next()?.parse::<i64>().ok()?,
            it.next()?,
            it.next()?,
        );
        let month = 1 + [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ]
        .iter()
        .position(|m| *m == mon)? as i64;
        let mut t = time.split(':').map(|n| n.parse::<i64>().ok());
        let (h, mi, s) = (t.next()??, t.next()??, t.next()??);
        if zone != "GMT" || !(1..=31).contains(&day) || h > 23 || mi > 59 || s > 60 {
            return None;
        }
        // Days since the epoch from a civil date (Howard Hinnant's algorithm).
        let y = year - i64::from(month <= 2);
        let (era, yoe) = (y.div_euclid(400), y.rem_euclid(400));
        let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
        let days = era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468;
        u64::try_from(days * 86_400 + h * 3600 + mi * 60 + s).ok()
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

#[cfg(test)]
mod tests {
    use super::*;

    fn at(date: &str) -> Option<u64> {
        Response {
            status: 200,
            headers: vec![("date".into(), date.into())],
            body: Vec::new(),
        }
        .date()
    }

    #[test]
    fn the_date_header_gives_the_server_clock_in_unix_seconds() {
        assert_eq!(at("Thu, 29 Oct 2026 10:00:00 GMT"), Some(1_793_268_000));
        assert_eq!(at("Thu, 01 Jan 1970 00:00:00 GMT"), Some(0));
        for bad in [
            "",
            "yesterday",
            "Thu, 29 Oct 2026 10:00:00 CET",
            "Thu, 29 Foo 2026 10:00:00 GMT",
        ] {
            assert_eq!(at(bad), None, "{bad}");
        }
        let none = Response {
            status: 200,
            headers: vec![],
            body: vec![],
        };
        assert_eq!(none.date(), None);
    }
}
