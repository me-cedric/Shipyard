//! Model providers, MCP servers and their persistence (spec `connections`, REQ-006 to REQ-010,
//! REQ-013). A memory keychain, a fake HTTP client and fake `sh` servers stand in for the world.

use std::sync::Arc;
use std::time::Duration;

use shipyard_agents::mcp_control::{State, Waits};
use shipyard_app::agents::{Agents, McpCustom, McpEnv, ProviderDraft};
use shipyard_app::connections::ConnectionState;
use shipyard_http::TestOutcome;
use shipyard_http::fake::FakeHttp;
use shipyard_secrets::{MemoryStore, Secret, SecretStore};

const KEY: &str = "sk-provider-secret-777";
const FIELD: &str = "tok-mcp-secret-888";

struct Fixture {
    dir: tempfile::TempDir,
    keys: Arc<MemoryStore>,
    http: Arc<FakeHttp>,
}

impl Fixture {
    fn new() -> Self {
        Self {
            dir: tempfile::tempdir().unwrap(),
            keys: Arc::new(MemoryStore::default()),
            http: Arc::new(FakeHttp::new()),
        }
    }

    /// A fresh `Agents` over the same folder and keychain: a restart.
    fn agents(&self) -> Agents {
        let tools = self.dir.path().to_path_buf();
        Agents::new(
            self.dir.path(),
            self.keys.clone(),
            self.http.clone(),
            move |c| {
                c.with_dirs(vec![tools, "/usr/bin".into(), "/bin".into()])
                    .with_waits(Waits {
                        start: Duration::from_secs(5),
                        call: Duration::from_secs(5),
                    })
            },
        )
    }

    fn file(&self) -> String {
        std::fs::read_to_string(self.dir.path().join("agents.json")).unwrap_or_default()
    }
}

fn draft(name: &str) -> ProviderDraft {
    ProviderDraft {
        name: name.into(),
        url: "http://localhost:1234/v1".into(),
        model: "qwen".into(),
    }
}

#[test]
fn a_provider_keeps_its_key_in_the_keychain_and_shows_only_that_one_exists() {
    let f = Fixture::new();
    let a = f.agents();
    let p = a.provider_add(draft("Local LM")).unwrap();
    assert_eq!(p.id, "provider-local-lm");
    assert!(!p.secret);
    let p = a.provider_set_secret(&p.id, Secret::new(KEY)).unwrap();
    assert!(p.secret);
    assert_eq!(
        f.keys
            .get("conn:provider-local-lm")
            .unwrap()
            .unwrap()
            .expose(),
        KEY
    );
    let shown = format!("{:?}", a.providers().unwrap());
    assert!(!shown.contains(KEY) && !f.file().contains(KEY));
    // The list survives a restart.
    assert_eq!(f.agents().providers().unwrap()[0].name, "Local LM");
}

#[test]
fn a_provider_address_is_checked_and_two_names_get_two_ids() {
    let a = Fixture::new().agents();
    let bad = ProviderDraft {
        url: "http://example.com/v1".into(),
        ..draft("Remote")
    };
    assert!(a.provider_add(bad).is_err(), "http only on a local host");
    assert_eq!(a.provider_add(draft("Same")).unwrap().id, "provider-same");
    assert_eq!(a.provider_add(draft("Same")).unwrap().id, "provider-same-2");
}

#[test]
fn a_provider_test_lists_the_models_and_saves_the_state() {
    let f = Fixture::new();
    f.http.get(
        "/models",
        200,
        r#"{"data":[{"id":"b"},{"id":"a"},{"id":"a"}]}"#,
    );
    let a = f.agents();
    let id = a.provider_add(draft("Local")).unwrap().id;
    assert_eq!(a.provider_models(&id).unwrap(), ["a", "b"]);
    assert!(matches!(
        a.provider_test(&id).unwrap(),
        TestOutcome::Passed { .. }
    ));
    assert_eq!(a.providers().unwrap()[0].state, ConnectionState::Passed);
    // The test only reads.
    assert!(f.http.requests().iter().all(|r| r.url.ends_with("/models")));
}

#[test]
fn a_failed_provider_test_says_why() {
    let f = Fixture::new();
    f.http.get("/models", 401, "{}");
    let a = f.agents();
    let id = a.provider_add(draft("Local")).unwrap().id;
    assert!(matches!(
        a.provider_test(&id).unwrap(),
        TestOutcome::Failed { .. }
    ));
    assert_eq!(a.providers().unwrap()[0].state, ConnectionState::Failed);
}

#[test]
fn removing_a_provider_deletes_its_key() {
    let f = Fixture::new();
    let a = f.agents();
    let id = a.provider_add(draft("Local")).unwrap().id;
    a.provider_set_secret(&id, Secret::new(KEY)).unwrap();
    a.provider_remove(&id).unwrap();
    assert!(a.providers().unwrap().is_empty());
    assert!(f.keys.get(&format!("conn:{id}")).unwrap().is_none());
    assert!(a.provider_remove(&id).is_err());
}

#[test]
fn editing_a_provider_keeps_its_key_and_a_new_address_resets_the_state() {
    let f = Fixture::new();
    f.http.get("/models", 200, r#"{"data":[{"id":"a"}]}"#);
    let a = f.agents();
    let id = a.provider_add(draft("Local")).unwrap().id;
    a.provider_set_secret(&id, Secret::new(KEY)).unwrap();
    a.provider_test(&id).unwrap();
    let same = a
        .provider_edit(
            &id,
            ProviderDraft {
                model: "llama".into(),
                ..draft("Local")
            },
        )
        .unwrap();
    assert_eq!(
        (same.model.as_str(), same.secret, same.state),
        ("llama", true, ConnectionState::Passed)
    );
    let moved = ProviderDraft {
        url: "http://localhost:9999/v1".into(),
        ..draft("Local")
    };
    assert_eq!(
        a.provider_edit(&id, moved).unwrap().state,
        ConnectionState::Untested
    );
}

fn custom(command: &str) -> McpCustom {
    McpCustom {
        id: None,
        name: "Fake".into(),
        description: String::new(),
        command: command.into(),
        args: vec![],
        env: vec![McpEnv {
            key: "FAKE_TOKEN".into(),
            value: FIELD.into(),
        }],
    }
}

#[test]
fn the_mcp_config_persists_and_holds_no_secret() {
    let f = Fixture::new();
    let a = f.agents();
    let id = a.mcp_add_custom(custom("fake-mcp")).unwrap();
    assert_eq!(id, "custom-fake");
    a.mcp_enable("jira", true).unwrap();
    assert!(
        !f.file().contains(FIELD),
        "a secret is in the keychain only"
    );
    assert!(f.keys.get("conn:custom-fake/FAKE_TOKEN").unwrap().is_some());

    let rows = f.agents().mcp_list();
    let jira = rows.iter().find(|r| r.id == "jira").unwrap();
    assert!(jira.enabled);
    let fake = rows.iter().find(|r| r.id == id).unwrap();
    assert!(fake.custom && !fake.enabled);
    assert_eq!(fake.filled, ["FAKE_TOKEN"]);
    // A failed change saves nothing and says why.
    assert!(a.mcp_enable("nope", true).is_err());
}

#[cfg(unix)]
#[test]
fn a_custom_server_starts_shows_running_stops_and_stops_at_exit() {
    use shipyard_agents::fake::mcp_server;
    let f = Fixture::new();
    mcp_server(f.dir.path(), "fake-mcp", &f.dir.path().join("pids"));
    let a = f.agents();
    let id = a.mcp_add_custom(custom("fake-mcp")).unwrap();
    assert_eq!(a.mcp_state(&id), State::Stopped);
    a.mcp_start(&id).unwrap();
    assert_eq!(a.mcp_state(&id), State::Running);
    a.mcp_stop(&id);
    assert_eq!(a.mcp_state(&id), State::Stopped);

    a.mcp_start(&id).unwrap();
    a.mcp.stop_all(); // what the app does on exit
    assert_eq!(a.mcp_state(&id), State::Stopped);
}

#[test]
fn a_server_with_a_missing_dependency_does_not_start_and_names_it() {
    let f = Fixture::new();
    let a = f.agents();
    let id = a.mcp_add_custom(custom("ghost-tool")).unwrap();
    let row = a.mcp_list().into_iter().find(|r| r.id == id).unwrap();
    assert_eq!(row.missing[0].command, "ghost-tool");
    let err = a.mcp_start(&id).unwrap_err();
    assert!(err.contains("ghost-tool"), "{err}");
    assert!(matches!(a.mcp_state(&id), State::Failed { .. }));
}

#[test]
fn a_field_is_write_only_and_forget_deletes_it() {
    let f = Fixture::new();
    let a = f.agents();
    a.mcp_set_field("figma", "token", Secret::new(FIELD))
        .unwrap();
    let row = a.mcp_list().into_iter().find(|r| r.id == "figma").unwrap();
    assert_eq!(row.filled, ["token"]);
    assert!(!format!("{row:?}").contains(FIELD));
    assert!(a.mcp_set_field("figma", "nope", Secret::new("x")).is_err());
    assert!(a.mcp_set_field("figma", "token", Secret::new("")).is_err());
    a.mcp_enable("figma", true).unwrap();
    a.mcp_forget("figma").unwrap();
    assert!(f.keys.get("conn:figma/token").unwrap().is_none());
    assert!(!a.mcp.config().enabled.contains(&"figma".to_string()));
}

#[test]
fn removing_a_custom_server_deletes_its_secrets_and_its_definition() {
    let f = Fixture::new();
    let a = f.agents();
    let id = a.mcp_add_custom(custom("fake-mcp")).unwrap();
    a.mcp_remove(&id).unwrap();
    assert!(f.keys.get("conn:custom-fake/FAKE_TOKEN").unwrap().is_none());
    assert!(f.agents().mcp_list().iter().all(|r| r.id != id));
    assert!(a.mcp_remove("figma").is_err(), "a catalogue server stays");
}
