//! Provider rows of Settings / Agents and rules (spec `provider-sign-in`, REQ-007 to REQ-009):
//! a pasted key that is tested before it is stored, and a local runtime that becomes a provider
//! with no key. A key goes to the keychain only, through `Agents::provider_set_secret`.

use shipyard_agents::local_runtimes::{self, LocalRuntime};
use shipyard_agents::runners::ModelProvider;
use shipyard_http::{Http, TestOutcome, base_url};
use shipyard_secrets::{MemoryStore, Secret, SecretStore, conn_account};
use tauri::AppHandle;

use crate::agents::{Agents, Provider, ProviderDraft};
use crate::commands::{Api, Res, blocking};

const MAX_KEY: usize = 4096;

/// `(id, name, address, model)`. Azure has an address for each resource: the person gives it.
/// The model is the first one that the provider answers for: a person changes it in Connections.
const KEYED: [(&str, &str, &str, &str); 5] = [
    (
        "openai",
        "OpenAI",
        "https://api.openai.com/v1",
        "gpt-4o-mini",
    ),
    (
        "anthropic",
        "Anthropic",
        "https://api.anthropic.com/v1",
        "claude-sonnet-4-5",
    ),
    (
        "mistral",
        "Mistral",
        "https://api.mistral.ai/v1",
        "mistral-small-latest",
    ),
    (
        "google",
        "Google AI Studio",
        "https://generativelanguage.googleapis.com/v1beta/openai",
        "gemini-2.5-flash",
    ),
    ("azure", "Azure OpenAI", "", "gpt-4o"),
];

/// The provider at `url`, made if it is new, with `key` in the keychain when there is one. A
/// provider that this call made leaves again when the keychain refuses the key.
pub(crate) fn store(
    agents: &Agents,
    name: &str,
    url: &str,
    model: &str,
    key: Option<Secret>,
) -> Res<Provider> {
    let url = base_url(url).map_err(|e| e.to_string())?;
    let found = agents.providers()?.into_iter().find(|p| p.url == url);
    let created = found.is_none();
    let provider = match found {
        Some(p) => p,
        None => agents.provider_add(ProviderDraft {
            name: name.into(),
            url,
            model: model.into(),
        })?,
    };
    let Some(key) = key else { return Ok(provider) };
    agents
        .provider_set_secret(&provider.id, key)
        .inspect_err(|_| {
            if created {
                let _ = agents.provider_remove(&provider.id);
            }
        })
}

/// Tests the pasted key with a `models` call, then stores it. A failed test stores nothing, and
/// the error names the reason and the action.
pub fn save_key(
    agents: &Agents,
    http: &dyn Http,
    kind: &str,
    key: &str,
    url: Option<&str>,
) -> Res<Provider> {
    let (_, name, fixed, model) = *KEYED
        .iter()
        .find(|k| k.0 == kind)
        .ok_or_else(|| format!("unknown provider: {kind}"))?;
    let url = if fixed.is_empty() {
        url.filter(|u| !u.trim().is_empty())
            .ok_or("Azure needs the address of your resource: paste it, then save again")?
    } else {
        fixed
    };
    let key = Secret::new(key.trim());
    if key.is_empty() || key.expose().len() > MAX_KEY {
        return Err(format!("paste a key of 1 to {MAX_KEY} characters"));
    }
    // The key sits in memory for the test only.
    let probe = ModelProvider::new("provider-test", name, url, model).map_err(|e| e.to_string())?;
    let memory = MemoryStore::default();
    memory
        .set(&conn_account("provider-test"), &key)
        .map_err(|e| e.to_string())?;
    match probe.test(http, &memory) {
        TestOutcome::Passed { .. } => {}
        TestOutcome::MissingScope { scope } => {
            return Err(key.scrub(&format!(
                "{name} refused the key: it lacks the right `{scope}`. Create a key with this right, then save again"
            )));
        }
        TestOutcome::Failed { reason } => {
            return Err(key.scrub(&format!(
                "{name} did not accept the key: {reason}. Check the key, then save again"
            )));
        }
    }
    store(agents, name, url, model, Some(key))
}

/// A local runtime that answers becomes a provider with no key.
pub fn add_local(agents: &Agents, http: &dyn Http, id: &str) -> Res<Provider> {
    let found = local_runtimes::probe(http)
        .into_iter()
        .find(|r| r.id == id)
        .ok_or("that runtime does not answer any more: start it, then try again")?;
    store(agents, &found.name, &found.url, &found.model, None)
}

#[tauri::command]
#[specta::specta]
pub async fn providers_key_save(
    app: AppHandle,
    kind: String,
    key: String,
    url: Option<String>,
    click: bool,
) -> Api<Provider> {
    blocking(app, move |s| {
        crate::rights::need_click_local(s, click)?;
        save_key(
            &s.agents,
            &*s.connections.http(),
            &kind,
            &key,
            url.as_deref(),
        )
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn local_runtimes_list(app: AppHandle) -> Api<Vec<LocalRuntime>> {
    blocking(app, |s| Ok(local_runtimes::probe(&*s.connections.http()))).await
}

#[tauri::command]
#[specta::specta]
pub async fn local_runtimes_add(app: AppHandle, id: String, click: bool) -> Api<Provider> {
    blocking(app, move |s| {
        crate::rights::need_click_local(s, click)?;
        add_local(&s.agents, &*s.connections.http(), &id)
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use shipyard_http::fake::FakeHttp;

    use super::*;

    fn agents(dir: &std::path::Path) -> (Agents, Arc<MemoryStore>) {
        let store = Arc::new(MemoryStore::default());
        let a = Agents::new(dir, store.clone(), Arc::new(FakeHttp::new()), |c| c);
        (a, store)
    }

    fn stored(store: &MemoryStore, a: &Agents) -> Vec<String> {
        a.providers()
            .unwrap()
            .iter()
            .filter_map(|p| store.get(&conn_account(&p.id)).unwrap())
            .map(|k| k.expose().to_string())
            .collect()
    }

    #[test]
    fn a_good_key_is_tested_with_the_models_call_then_stored_in_the_keychain() {
        let dir = tempfile::tempdir().unwrap();
        let (a, store) = agents(dir.path());
        let http = FakeHttp::new();
        http.get(
            "api.openai.com/v1/models",
            200,
            r#"{"data":[{"id":"gpt-4o"}]}"#,
        );
        let p = save_key(&a, &http, "openai", "  sk-good  ", None).unwrap();
        assert_eq!((p.name.as_str(), p.secret), ("OpenAI", true));
        assert_eq!(stored(&store, &a), ["sk-good"]);
        let sent = http.requests();
        assert!(matches!(&sent[0].auth, shipyard_http::Auth::Bearer(k) if k.expose() == "sk-good"));
        // The key and the settings file: no key in the file.
        let file =
            std::fs::read_to_string(dir.path().join(shipyard_mcp::relay::CONFIG_FILE)).unwrap();
        assert!(!file.contains("sk-good"));
    }

    #[test]
    fn anthropic_gets_its_own_headers_and_openai_keeps_the_bearer() {
        let dir = tempfile::tempdir().unwrap();
        let (a, _) = agents(dir.path());
        let http = FakeHttp::new();
        http.get(
            "api.anthropic.com/v1/models",
            200,
            r#"{"data":[{"id":"c"}]}"#,
        );
        save_key(&a, &http, "anthropic", "sk-ant-1", None).unwrap();
        let sent = http.requests();
        assert!(
            matches!(&sent[0].auth, shipyard_http::Auth::Header("x-api-key", k) if k.expose() == "sk-ant-1")
        );
        assert!(
            sent[0]
                .headers
                .contains(&("anthropic-version", "2023-06-01".to_string()))
        );
    }

    #[test]
    fn a_wrong_key_stores_nothing_and_the_error_names_the_action() {
        let dir = tempfile::tempdir().unwrap();
        let (a, store) = agents(dir.path());
        let http = FakeHttp::new();
        http.get("/models", 401, r#"{"error":"bad key sk-bad"}"#);
        let e = save_key(&a, &http, "mistral", "sk-bad", None).unwrap_err();
        assert!(e.contains("Check the key"), "{e}");
        assert!(!e.contains("sk-bad"), "{e}");
        assert!(a.providers().unwrap().is_empty());
        assert!(stored(&store, &a).is_empty());
    }

    #[test]
    fn a_new_key_for_a_known_provider_replaces_the_key_and_adds_no_row() {
        let dir = tempfile::tempdir().unwrap();
        let (a, store) = agents(dir.path());
        let http = FakeHttp::new();
        http.get("/models", 200, r#"{"data":[{"id":"m"}]}"#);
        save_key(&a, &http, "anthropic", "k1", None).unwrap();
        save_key(&a, &http, "anthropic", "k2", None).unwrap();
        assert_eq!(a.providers().unwrap().len(), 1);
        assert_eq!(stored(&store, &a), ["k2"]);
    }

    #[test]
    fn azure_needs_an_address_and_an_unknown_provider_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let (a, _) = agents(dir.path());
        let http = FakeHttp::new();
        assert!(
            save_key(&a, &http, "azure", "k", None)
                .unwrap_err()
                .contains("address")
        );
        assert!(save_key(&a, &http, "nope", "k", None).is_err());
        assert!(save_key(&a, &http, "openai", "  ", None).is_err());
        assert!(http.requests().is_empty());
        http.get(
            "my.openai.azure.com/openai/v1/models",
            200,
            r#"{"data":[{"id":"d"}]}"#,
        );
        let p = save_key(
            &a,
            &http,
            "azure",
            "k",
            Some("https://my.openai.azure.com/openai/v1"),
        )
        .unwrap();
        assert_eq!(p.url, "https://my.openai.azure.com/openai/v1");
    }

    #[test]
    fn a_local_runtime_is_added_with_no_key() {
        let dir = tempfile::tempdir().unwrap();
        let (a, store) = agents(dir.path());
        let http = FakeHttp::new();
        http.get(
            "127.0.0.1:11434/api/tags",
            200,
            r#"{"models":[{"name":"llama3"}]}"#,
        );
        let p = add_local(&a, &http, "ollama").unwrap();
        assert_eq!(
            (p.url.as_str(), p.model.as_str(), p.secret),
            ("http://127.0.0.1:11434/v1", "llama3", false)
        );
        assert!(stored(&store, &a).is_empty());
        assert!(add_local(&a, &http, "vllm").is_err());
    }
}
