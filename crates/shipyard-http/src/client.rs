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

static EXTRA_CA: std::sync::Mutex<Option<std::path::PathBuf>> = std::sync::Mutex::new(None);

/// The PEM bundle that a person added in Settings. `None` removes it. The env bundle wins when both exist.
pub fn set_extra_ca(path: Option<std::path::PathBuf>) {
    *EXTRA_CA.lock().unwrap_or_else(|e| e.into_inner()) = path;
}

/// How many certificates a PEM text holds. Zero means the file is not a bundle. A block that does
/// not parse is an error: `tls_config` would refuse the same bundle.
pub fn count_pem_certs(pem: &[u8]) -> Result<usize, String> {
    rustls_pemfile::certs(&mut std::io::BufReader::new(pem))
        .try_fold(0, |n, c| c.map(|_| n + 1))
        .map_err(|e| e.to_string())
}

type Native = Result<Vec<rustls::pki_types::CertificateDer<'static>>, String>;

/// The OS trust store, read once: a read takes seconds on macOS.
/// shortcut: a certificate added to the OS store while the app runs needs a restart.
fn native_certs() -> &'static Native {
    static NATIVE: std::sync::OnceLock<Native> = std::sync::OnceLock::new();
    NATIVE.get_or_init(|| rustls_native_certs::load_native_certs().map_err(|e| e.to_string()))
}

/// The roots that the client trusts: the bundled Mozilla roots, and the OS trust store and the PEM
/// bundle that a variable names or that was added in Settings. The client always builds its own
/// config: the default of `ureq` rejects the chain of api.github.com (`UnknownIssuer`) that each of
/// these root sets accepts. The OS store loads with `native`, or with a bundle, since the bundle is
/// then meant to add to it. A named file that cannot be read is an error: a silent fallback hides
/// the real fault.
fn tls_config(native: bool) -> Result<Arc<rustls::ClientConfig>, Error> {
    tls_config_from(native, |var| std::env::var(var).ok())
}

/// `tls_config` with the environment as an argument, so a test does not read the variables of the machine.
fn tls_config_from(
    native: bool,
    env: impl Fn(&str) -> Option<String>,
) -> Result<Arc<rustls::ClientConfig>, Error> {
    let from_env = ["SHIPYARD_CA_BUNDLE", "SSL_CERT_FILE"]
        .iter()
        .find_map(|var| {
            let value = env(var)?;
            let value = value.trim().to_string();
            (!value.is_empty()).then_some((var.to_string(), value))
        });
    let extra = EXTRA_CA.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let bundle = from_env.or_else(|| {
        extra.map(|p| {
            (
                "the added certificate".to_string(),
                p.to_string_lossy().into_owned(),
            )
        })
    });
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    if native || bundle.is_some() {
        match (native_certs(), &bundle) {
            (Ok(certs), _) => {
                for cert in certs {
                    let _ = roots.add(cert.clone());
                }
            }
            (Err(e), Some((var, path))) => {
                return Err(Error::Transport(format!(
                    "{var} names {path}: the system certificates cannot be read: {e}"
                )));
            }
            // The bundled roots still serve the public hosts.
            (Err(_), None) => {}
        }
    }
    if let Some((var, path)) = &bundle {
        let fail = |why: String| Error::Transport(format!("{var} names {path}: {why}"));
        let file = std::fs::File::open(path).map_err(|e| fail(e.to_string()))?;
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
    }
    // The provider is named: `ureq` enables `ring`, and two providers make the default builder panic.
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|e| Error::Transport(e.to_string()))?
    .with_root_certificates(roots)
    .with_no_client_auth();
    Ok(Arc::new(config))
}

impl Http for Client {
    /// The bundled roots first. A chain that they do not know (`UnknownIssuer`), such as the root
    /// of a TLS-inspecting proxy in the OS store, gets one more try with the OS store.
    fn send(&self, req: &Request) -> Result<Response, Error> {
        match self.send_with(req, false) {
            Err(Error::Transport(m)) if m.contains("UnknownIssuer") => self.send_with(req, true),
            other => other,
        }
    }
}

impl Client {
    fn send_with(&self, req: &Request, native: bool) -> Result<Response, Error> {
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
        builder = builder.tls_config(tls_config(native)?);
        let mut call = builder
            .build()
            .request(
                match req.method {
                    Method::Get => "GET",
                    Method::Post => "POST",
                    Method::Put => "PUT",
                    Method::Patch => "PATCH",
                    Method::Delete => "DELETE",
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
            Some(body) => {
                let own = req
                    .headers
                    .iter()
                    .any(|(n, _)| n.eq_ignore_ascii_case("content-type"));
                if !own {
                    call = call.set("Content-Type", "application/json");
                }
                call.send_bytes(body.to_string().as_bytes())
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_without_a_certificate_counts_zero() {
        assert_eq!(count_pem_certs(b"not a certificate"), Ok(0));
    }

    #[test]
    fn a_truncated_block_is_an_error() {
        let pem = b"-----BEGIN CERTIFICATE-----\nMIIB\n";
        assert!(count_pem_certs(pem).is_err());
    }

    #[test]
    fn an_added_bundle_that_cannot_be_read_is_an_error() {
        set_extra_ca(Some("/no/such/bundle.pem".into()));
        // A CI runner sets SSL_CERT_FILE, which would win over the added bundle.
        let result = tls_config_from(false, |_| None);
        set_extra_ca(None);
        let message = result.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(message.contains("the added certificate"), "{message}");
        // With no bundle the client still has its own roots: the default of `ureq` is not used.
        assert!(tls_config_from(false, |_| None).is_ok());
    }
}
