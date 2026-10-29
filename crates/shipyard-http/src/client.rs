//! The real client on `ureq`. One agent per request, because the proxy choice is per host.

use crate::{Auth, DEFAULT_READ_TIMEOUT, Error, Http, MAX_BODY_BYTES, Method, Request, Response};
use base64::Engine;
use std::io::Read;
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Default, Clone, Copy)]
pub struct Client;

pub(crate) fn is_loopback(host: &str) -> bool {
    host == "localhost" || host == "127.0.0.1" || host == "[::1]" || host == "::1"
}

/// True when `no_proxy` (the value of `NO_PROXY`) lists this host or a parent domain.
/// `ureq` 2 ignores `NO_PROXY`, and an on-premise host must not go through the internet proxy.
pub fn bypasses_proxy(host: &str, no_proxy: &str) -> bool {
    let host = host.to_ascii_lowercase();
    no_proxy.split(',').any(|entry| {
        let entry = entry
            .trim()
            .split(':')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        if entry.is_empty() {
            return false;
        }
        if entry == "*" {
            return true;
        }
        let bare = entry.trim_start_matches('.');
        host == bare || host.ends_with(&format!(".{bare}"))
    })
}

/// The OS trust store plus the PEM bundle that a variable names. `None` without a variable.
/// A named file that cannot be read is an error: a silent fallback hides the real fault.
fn tls_config() -> Result<Option<Arc<rustls::ClientConfig>>, Error> {
    let Some((var, path)) = ["SHIPYARD_CA_BUNDLE", "SSL_CERT_FILE"]
        .iter()
        .find_map(|var| {
            let value = std::env::var(var).ok()?;
            let value = value.trim().to_string();
            (!value.is_empty()).then_some((*var, value))
        })
    else {
        return Ok(None);
    };
    let fail = |why: String| Error::Transport(format!("{var} names {path}: {why}"));
    let mut roots = rustls::RootCertStore::empty();
    // The bundle adds roots. It never replaces the OS store.
    for cert in rustls_native_certs::load_native_certs().unwrap_or_default() {
        let _ = roots.add(cert);
    }
    let file = std::fs::File::open(&path).map_err(|e| fail(e.to_string()))?;
    let mut added = 0;
    for cert in rustls_pemfile::certs(&mut std::io::BufReader::new(file)) {
        let cert = cert.map_err(|e| fail(e.to_string()))?;
        if roots.add(cert).is_ok() {
            added += 1;
        }
    }
    if added == 0 {
        return Err(fail("no certificate in the file".into()));
    }
    // The provider is named: `ureq` enables `ring`, and two providers make the default builder panic.
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|e| fail(e.to_string()))?
    .with_root_certificates(roots)
    .with_no_client_auth();
    Ok(Some(Arc::new(config)))
}

impl Http for Client {
    fn send(&self, req: &Request) -> Result<Response, Error> {
        let url = url::Url::parse(&req.url).map_err(|e| Error::BadUrl(e.to_string()))?;
        let host = url
            .host_str()
            .ok_or_else(|| Error::BadUrl("no host".into()))?
            .to_string();
        if !matches!(req.auth, Auth::None) && url.scheme() != "https" && !is_loopback(&host) {
            return Err(Error::Insecure(url.scheme().to_string()));
        }
        let no_proxy = std::env::var("NO_PROXY")
            .or_else(|_| std::env::var("no_proxy"))
            .unwrap_or_default();
        let mut builder = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(10))
            .timeout_read(req.timeout.unwrap_or(DEFAULT_READ_TIMEOUT))
            .redirects(0)
            .try_proxy_from_env(!is_loopback(&host) && !bypasses_proxy(&host, &no_proxy));
        if let Some(config) = tls_config()? {
            builder = builder.tls_config(config);
        }
        let mut call = builder
            .build()
            .request(
                if req.method == Method::Get {
                    "GET"
                } else {
                    "POST"
                },
                url.as_str(),
            )
            .set("User-Agent", "shipyard")
            .set("Accept", "application/json");
        for (name, value) in &req.headers {
            call = call.set(name, value);
        }
        match &req.auth {
            Auth::None => {}
            Auth::Bearer(s) => call = call.set("Authorization", &format!("Bearer {}", s.expose())),
            Auth::Basic(user, s) => {
                let raw = base64::engine::general_purpose::STANDARD
                    .encode(format!("{user}:{}", s.expose()));
                call = call.set("Authorization", &format!("Basic {raw}"));
            }
            Auth::Header(name, s) => call = call.set(name, s.expose()),
        }
        let secret = req.auth.secret();
        let scrub = |text: String| secret.map_or(text.clone(), |s| s.scrub(&text));
        let sent = match &req.body {
            Some(body) => call
                .set("Content-Type", "application/json")
                .send_bytes(body.to_string().as_bytes()),
            None => call.call(),
        };
        // A 4xx or 5xx is an answer the adapter maps; only a transport fault is an error here.
        let response = match sent {
            Ok(r) | Err(ureq::Error::Status(_, r)) => r,
            Err(ureq::Error::Transport(t)) => return Err(Error::Transport(scrub(t.to_string()))),
        };
        let status = response.status();
        let headers = response
            .headers_names()
            .into_iter()
            .filter_map(|n| {
                response
                    .header(&n)
                    .map(|v| (n.to_ascii_lowercase(), v.to_string()))
            })
            .collect();
        let mut body = Vec::new();
        response
            .into_reader()
            .take(MAX_BODY_BYTES as u64 + 1)
            .read_to_end(&mut body)
            .map_err(|e| Error::Transport(scrub(e.to_string())))?;
        if body.len() > MAX_BODY_BYTES {
            return Err(Error::TooLarge);
        }
        if status >= 400
            && let Some(s) = secret
        {
            body = s.scrub(&String::from_utf8_lossy(&body)).into_bytes();
        }
        Ok(Response {
            status,
            headers,
            body,
        })
    }
}
