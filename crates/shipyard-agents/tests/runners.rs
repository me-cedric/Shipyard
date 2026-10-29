//! Runner detection and the HTTP provider client (spec `connections`, REQ-009, REQ-010).
//! No network: fake programs in a temp folder, `FakeHttp` for the provider.

use serde_json::json;
use shipyard_agents::AgentError;
use shipyard_agents::runners::{ModelProvider, RunnerState, detect_in};
use shipyard_http::fake::FakeHttp;
use shipyard_http::{Auth, Http, TestOutcome};
use shipyard_secrets::{MemoryStore, Secret, SecretStore, conn_account};
use std::time::Duration;

#[cfg(unix)]
mod runners {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use std::path::Path;

    fn program(dir: &Path, name: &str, body: &str, mode: u32) {
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode)).unwrap();
    }

    const WAIT: Duration = Duration::from_secs(2);

    #[test]
    fn an_installed_runner_shows_as_detected_with_its_version() {
        let dir = tempfile::tempdir().unwrap();
        program(dir.path(), "codex", "echo 'codex-cli 0.147.0'", 0o755);
        program(dir.path(), "claude", "echo '2.1.0 (Claude Code)'", 0o755);
        program(
            dir.path(),
            "copilot",
            "echo 'GitHub Copilot CLI 0.0.400.'",
            0o755,
        );
        let runners = detect_in(&[dir.path().to_path_buf()], WAIT);
        let found: Vec<_> = runners
            .iter()
            .map(|r| (r.id, r.state, r.version.as_deref()))
            .collect();
        assert_eq!(
            found,
            vec![
                ("claude", RunnerState::Detected, Some("2.1.0")),
                ("codex", RunnerState::Detected, Some("0.147.0")),
                ("copilot", RunnerState::Detected, Some("0.0.400")),
                ("gemini", RunnerState::Missing, None),
                ("opencode", RunnerState::Missing, None),
            ]
        );
    }

    #[test]
    fn a_missing_runner_has_no_path_and_names_how_to_install_it() {
        let dir = tempfile::tempdir().unwrap();
        let runners = detect_in(&[dir.path().to_path_buf()], WAIT);
        let gemini = runners.iter().find(|r| r.id == "gemini").unwrap();
        assert_eq!(gemini.state, RunnerState::Missing);
        assert!(gemini.path.is_none());
        assert!(gemini.install.contains("gemini"));
        assert_eq!(runners.len(), 5);
    }

    #[test]
    fn a_file_without_the_execute_bit_is_not_a_runner() {
        let dir = tempfile::tempdir().unwrap();
        program(dir.path(), "gemini", "echo 0.9.1", 0o644);
        let runners = detect_in(&[dir.path().to_path_buf()], WAIT);
        let gemini = runners.iter().find(|r| r.id == "gemini").unwrap();
        assert_eq!(gemini.state, RunnerState::Missing);
    }

    #[test]
    fn a_runner_that_hangs_on_version_is_detected_without_a_version() {
        let dir = tempfile::tempdir().unwrap();
        program(dir.path(), "opencode", "sleep 5", 0o755);
        let started = std::time::Instant::now();
        let runners = detect_in(&[dir.path().to_path_buf()], Duration::from_millis(300));
        let opencode = runners.iter().find(|r| r.id == "opencode").unwrap();
        assert_eq!(
            (opencode.state, opencode.version.as_deref()),
            (RunnerState::Detected, None)
        );
        assert!(started.elapsed() < Duration::from_secs(3));
    }
}

fn provider() -> ModelProvider {
    ModelProvider::new("local", "LM Studio", "http://localhost:1234/v1/", "qwen").unwrap()
}

fn store_with_key(key: &str) -> MemoryStore {
    let store = MemoryStore::default();
    store
        .set(&conn_account("local"), &Secret::new(key))
        .unwrap();
    store
}

#[test]
fn a_provider_needs_a_valid_id_an_https_or_local_address_and_a_model() {
    assert_eq!(provider().base_url, "http://localhost:1234/v1");
    let new = |id: &str, url: &str, model: &str| ModelProvider::new(id, "", url, model);
    assert!(new("bad id", "https://api.example.com/v1", "m").is_err());
    assert!(
        new("a", "http://api.example.com/v1", "m").is_err(),
        "remote http"
    );
    assert!(
        new("a", "https://u:p@api.example.com/v1", "m").is_err(),
        "credential in the URL"
    );
    assert!(
        new("a", "https://api.example.com/v1?key=1", "m").is_err(),
        "secret in the query"
    );
    assert!(
        new("a", "https://api.example.com/v1", " ").is_err(),
        "no model"
    );
    assert_eq!(
        new("a", "https://api.example.com/v1", "m").unwrap().label,
        "a"
    );
}

#[test]
fn the_models_call_sends_the_key_as_a_bearer_and_never_in_the_url() {
    let http = FakeHttp::new();
    http.get(
        "/v1/models",
        200,
        r#"{"data":[{"id":"b"},{"id":"a"},{"id":"b"}]}"#,
    );
    let models = provider()
        .models(&http, &store_with_key("sk-live"))
        .unwrap();
    assert_eq!(models, ["a", "b"]);
    let sent = &http.requests()[0];
    assert_eq!(sent.url, "http://localhost:1234/v1/models");
    assert!(matches!(&sent.auth, Auth::Bearer(s) if s.expose() == "sk-live"));
}

#[test]
fn a_provider_without_a_key_sends_no_credential() {
    let http = FakeHttp::new();
    http.get("/models", 200, r#"{"data":[{"id":"m"}]}"#);
    provider().models(&http, &MemoryStore::default()).unwrap();
    assert!(matches!(http.requests()[0].auth, Auth::None));
}

#[test]
fn chat_posts_the_model_and_the_prompt_and_returns_the_text() {
    let http = FakeHttp::new();
    http.post(
        "/chat/completions",
        "qwen",
        200,
        &json!({"choices":[{"message":{"content":"  hello\n"}}]}).to_string(),
    );
    let text = provider()
        .chat(&http, &MemoryStore::default(), "hi")
        .unwrap();
    assert_eq!(text, "hello");
    let body = http.requests()[0].body.clone().unwrap();
    assert_eq!(body["model"], "qwen");
    assert_eq!(body["stream"], false);
    assert_eq!(body["messages"][0], json!({"role":"user","content":"hi"}));
}

#[test]
fn chat_reports_an_error_object_and_an_empty_answer_and_scrubs_the_key() {
    let store = store_with_key("sk-live");
    let http = FakeHttp::new();
    http.post(
        "/chat/completions",
        "",
        200,
        r#"{"error":{"message":"bad key sk-live"}}"#,
    );
    let err = provider().chat(&http, &store, "hi").unwrap_err();
    assert!(matches!(err, AgentError::Provider(_)));
    assert!(!err.to_string().contains("sk-live"), "{err}");
    assert!(err.to_string().contains("bad key ***"), "{err}");

    let empty = FakeHttp::new();
    empty.post(
        "/chat/completions",
        "",
        200,
        r#"{"choices":[{"message":{"content":""}}]}"#,
    );
    assert!(provider().chat(&empty, &store, "hi").is_err());
    assert!(
        provider().chat(&empty, &store, "  ").is_err(),
        "empty prompt"
    );
}

#[test]
fn chat_passes_an_http_failure_through() {
    let http = FakeHttp::new();
    http.post("/chat/completions", "", 500, "boom");
    let err = provider()
        .chat(&http, &MemoryStore::default(), "hi")
        .unwrap_err();
    assert!(
        matches!(
            err,
            AgentError::Http(shipyard_http::Error::Status { status: 500, .. })
        ),
        "{err}"
    );
}

#[test]
fn the_connection_test_names_the_reason() {
    let ok = FakeHttp::new();
    ok.get("/models", 200, r#"{"data":[{"id":"m"}]}"#);
    assert!(matches!(
        provider().test(&ok, &MemoryStore::default()),
        TestOutcome::Passed { .. }
    ));

    let denied = FakeHttp::new();
    denied.get("/models", 401, "no");
    assert!(matches!(
        provider().test(&denied, &MemoryStore::default()),
        TestOutcome::Failed { .. }
    ));

    let scope = FakeHttp::new();
    scope.get("/models", 403, "no");
    assert!(matches!(
        provider().test(&scope, &MemoryStore::default()),
        TestOutcome::MissingScope { .. }
    ));
    let _: &dyn Http = &scope;
}
