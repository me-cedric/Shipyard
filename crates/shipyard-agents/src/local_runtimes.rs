//! Local model runtimes (spec `provider-sign-in`, REQ-008). The probe asks `127.0.0.1` only, on
//! the usual port of each runtime. A runtime that answers can become a provider with no key.

use std::time::Duration;

use serde::Serialize;
use shipyard_http::{Http, Request, items, text};

/// A probe to a port on this machine ends fast: a closed port refuses at once.
const WAIT: Duration = Duration::from_millis(500);

/// `(id, name, port, probe path)`. Ollama lists its models at `/api/tags`. The others answer the
/// OpenAI-style `/v1/models`. The ports of vLLM and LiteLLM are the defaults (Q-134 follow-up).
const RUNTIMES: [(&str, &str, u16, &str); 4] = [
    ("ollama", "Ollama", 11434, "/api/tags"),
    ("lm-studio", "LM Studio", 1234, "/v1/models"),
    ("vllm", "vLLM", 8000, "/v1/models"),
    ("litellm", "LiteLLM", 4000, "/v1/models"),
];

/// A runtime that answered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct LocalRuntime {
    pub id: String,
    pub name: String,
    /// The provider address, up to and including `/v1`.
    pub url: String,
    /// The first model that the runtime lists, or `default` when it lists none.
    pub model: String,
}

/// The runtimes that answer on this machine.
pub fn probe(http: &dyn Http) -> Vec<LocalRuntime> {
    probe_host(http, "127.0.0.1")
}

/// `probe` on `host`. A host that is not local gets no request and no result.
pub fn probe_host(http: &dyn Http, host: &str) -> Vec<LocalRuntime> {
    if !matches!(host, "127.0.0.1" | "localhost" | "[::1]") {
        return Vec::new();
    }
    RUNTIMES
        .iter()
        .filter_map(|&(id, name, port, path)| {
            let base = format!("http://{host}:{port}");
            let reply = http
                .json(
                    &Request::get(format!("{base}{path}"), shipyard_http::Auth::None).timeout(WAIT),
                )
                .ok()?;
            let first = if id == "ollama" {
                text(items(&reply, "/models").first()?, "/name")
            } else {
                text(items(&reply, "/data").first()?, "/id")
            };
            Some(LocalRuntime {
                id: id.into(),
                name: name.into(),
                url: format!("{base}/v1"),
                model: if first.is_empty() {
                    "default".into()
                } else {
                    first
                },
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use shipyard_http::fake::FakeHttp;

    use super::*;

    #[test]
    fn a_runtime_that_answers_is_listed_with_its_first_model() {
        let http = FakeHttp::new();
        http.get(
            "127.0.0.1:11434/api/tags",
            200,
            r#"{"models":[{"name":"llama3:8b"}]}"#,
        )
        .get(
            "127.0.0.1:1234/v1/models",
            200,
            r#"{"data":[{"id":"qwen"}]}"#,
        );
        let found = probe(&http);
        let ids: Vec<_> = found.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, ["ollama", "lm-studio"]);
        assert_eq!(found[0].url, "http://127.0.0.1:11434/v1");
        assert_eq!(found[0].model, "llama3:8b");
        assert_eq!(found[1].model, "qwen");
    }

    #[test]
    fn nothing_listed_when_nothing_runs() {
        assert!(probe(&FakeHttp::new()).is_empty());
    }

    #[test]
    fn a_probe_has_a_short_timeout_and_sends_no_key() {
        let http = FakeHttp::new();
        probe(&http);
        let sent = http.requests();
        assert_eq!(sent.len(), 4);
        assert!(sent.iter().all(|r| r.timeout == Some(WAIT)));
        assert!(
            sent.iter()
                .all(|r| matches!(r.auth, shipyard_http::Auth::None))
        );
    }

    #[test]
    fn a_non_local_address_gets_no_request() {
        let http = FakeHttp::new();
        for host in [
            "192.168.1.5",
            "example.com",
            "0.0.0.0",
            "127.0.0.1.evil.com",
        ] {
            assert!(probe_host(&http, host).is_empty());
        }
        assert!(http.requests().is_empty());
    }
}
