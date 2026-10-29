//! MCP catalogue, custom servers, start, stop and dependencies (spec `connections`,
//! REQ-006 to REQ-008). Fake `sh` programs, no network. The fake servers need `sh`: unix only.
#![cfg(unix)]

use serde_json::json;
use shipyard_agents::AgentError;
use shipyard_agents::fake::{mcp_server, program};
use shipyard_agents::mcp_control::{
    CustomInput, McpConfig, McpControl, Os, State, Waits, catalogue, install_plan, install_with,
};
use shipyard_agents::which::which;
use shipyard_secrets::{MemoryStore, Secret, SecretStore};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;

struct Lab {
    dir: TempDir,
    store: Arc<MemoryStore>,
}

impl Lab {
    fn new() -> Self {
        Self {
            dir: tempfile::tempdir().unwrap(),
            store: Arc::new(MemoryStore::default()),
        }
    }

    fn dirs(&self) -> Vec<PathBuf> {
        vec![
            self.dir.path().to_path_buf(),
            "/usr/bin".into(),
            "/bin".into(),
        ]
    }

    fn pid_file(&self) -> PathBuf {
        self.dir.path().join("pids")
    }

    fn pids(&self) -> Vec<String> {
        std::fs::read_to_string(self.pid_file())
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .collect()
    }

    fn control_with(&self, config: McpConfig) -> McpControl {
        McpControl::new(self.store.clone(), config)
            .with_dirs(self.dirs())
            .with_waits(Waits {
                start: Duration::from_secs(5),
                call: Duration::from_millis(800),
            })
    }

    fn control(&self) -> McpControl {
        self.control_with(McpConfig::default())
    }

    /// A control with the fake server added as a custom server.
    fn with_fake(&self) -> (McpControl, String) {
        mcp_server(self.dir.path(), "fake-mcp", &self.pid_file());
        let control = self.control();
        let def = control.add_custom(custom("Fake", "fake-mcp")).unwrap();
        (control, def.id)
    }
}

fn custom(name: &str, command: &str) -> CustomInput {
    CustomInput {
        name: name.into(),
        command: command.into(),
        ..CustomInput::default()
    }
}

fn gone(pid: &str) -> bool {
    !std::process::Command::new("kill")
        .args(["-0", pid])
        .stderr(std::process::Stdio::null())
        .status()
        .unwrap()
        .success()
}

#[test]
fn the_catalogue_lists_the_servers_and_each_secret_names_a_field() {
    let all = catalogue();
    assert!(
        ["jira", "figma", "context7", "playwright"]
            .iter()
            .all(|id| all.iter().any(|d| d.id == *id))
    );
    let mut ids: Vec<_> = all.iter().map(|d| d.id.as_str()).collect();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), all.len(), "ids are unique");
    for d in &all {
        for (_, field) in &d.env {
            assert!(
                d.fields.iter().any(|f| &f.key == field),
                "{}: {field}",
                d.id
            );
        }
        assert!(!d.custom && !d.id.contains("__"), "{}", d.id);
    }
}

#[test]
fn a_catalogue_server_is_enabled_from_the_list_and_stays_in_the_config() {
    let lab = Lab::new();
    let control = lab.control();
    assert!(control.list().iter().all(|r| !r.enabled));
    control.set_enabled("context7", true).unwrap();
    let row = control
        .list()
        .into_iter()
        .find(|r| r.id == "context7")
        .unwrap();
    assert!(row.enabled && !row.custom);
    assert_eq!(control.config().enabled, ["context7"]);
    assert!(matches!(
        control.set_enabled("nope", true),
        Err(AgentError::UnknownServer(_))
    ));
    // A new control from the saved config sees the same state.
    let again = lab.control_with(control.config());
    assert!(again.is_enabled("context7"));
}

#[test]
fn a_custom_server_appears_in_the_list_and_its_secret_goes_to_the_keychain_only() {
    let lab = Lab::new();
    let control = lab.control();
    let mut input = custom("My Tool!", "my-tool");
    input.args = vec!["--stdio".into()];
    input.env = vec![("API_TOKEN".into(), Secret::new("tok-123"))];
    let def = control.add_custom(input).unwrap();
    assert_eq!(def.id, "custom-my-tool");
    let row = control.list().into_iter().find(|r| r.id == def.id).unwrap();
    assert!(row.custom && row.filled == ["API_TOKEN"]);
    let stored = lab
        .store
        .get("conn:custom-my-tool/API_TOKEN")
        .unwrap()
        .unwrap();
    assert_eq!(stored.expose(), "tok-123");
    let saved = serde_json::to_string(&control.config()).unwrap();
    assert!(
        !saved.contains("tok-123"),
        "the settings hold no secret: {saved}"
    );
}

#[test]
fn a_custom_server_is_checked_and_an_address_becomes_a_bridge() {
    let lab = Lab::new();
    let control = lab.control();
    assert!(control.add_custom(custom(" ", "x")).is_err(), "no name");
    assert!(control.add_custom(custom("a", " ")).is_err(), "no command");
    let mut bad_env = custom("a", "x");
    bad_env.env = vec![("1BAD".into(), Secret::new("v"))];
    assert!(control.add_custom(bad_env).is_err());
    assert!(
        control
            .add_custom(custom("a", "https://u:p@mcp.example.com/x"))
            .is_err(),
        "credential"
    );
    assert!(
        control
            .add_custom(custom("a", "https://mcp.example.com/x?token=1"))
            .is_err(),
        "query"
    );
    assert!(
        control
            .add_custom(custom("a", "http://mcp.example.com/x"))
            .is_err(),
        "remote http"
    );

    let def = control
        .add_custom(custom("Remote", "https://mcp.example.com/v1/mcp"))
        .unwrap();
    assert_eq!(def.command, "npx");
    assert_eq!(
        def.args,
        ["-y", "mcp-remote@latest", "https://mcp.example.com/v1/mcp"]
    );
}

#[test]
fn editing_a_custom_server_keeps_a_secret_left_blank_and_drops_a_removed_one() {
    let lab = Lab::new();
    let control = lab.control();
    let mut first = custom("Tool", "tool");
    first.env = vec![
        ("A".into(), Secret::new("one")),
        ("B".into(), Secret::new("two")),
    ];
    let id = control.add_custom(first).unwrap().id;
    let mut edit = custom("Tool", "tool");
    edit.id = Some(id.clone());
    edit.env = vec![("A".into(), Secret::new(""))];
    control.add_custom(edit).unwrap();
    assert_eq!(
        lab.store
            .get("conn:custom-tool/A")
            .unwrap()
            .unwrap()
            .expose(),
        "one"
    );
    assert!(lab.store.get("conn:custom-tool/B").unwrap().is_none());
    assert_eq!(control.list().iter().filter(|r| r.custom).count(), 1);
}

#[test]
fn a_server_starts_shows_running_and_stops() {
    let lab = Lab::new();
    let (control, id) = lab.with_fake();
    assert_eq!(control.state(&id), State::Stopped);
    control.start(&id).unwrap();
    assert_eq!(control.state(&id), State::Running);
    let pid = lab.pids().pop().unwrap();
    control.stop(&id);
    assert_eq!(control.state(&id), State::Stopped);
    assert!(gone(&pid), "the process ends with stop");
}

#[test]
fn starting_a_running_server_does_not_start_a_second_process() {
    let lab = Lab::new();
    let (control, id) = lab.with_fake();
    control.start(&id).unwrap();
    control.start(&id).unwrap();
    assert_eq!(lab.pids().len(), 1);
}

#[test]
fn quitting_stops_every_server_that_the_app_started() {
    let lab = Lab::new();
    let (control, id) = lab.with_fake();
    control.start(&id).unwrap();
    let pid = lab.pids().pop().unwrap();
    control.stop_all();
    assert_eq!(control.state(&id), State::Stopped);
    assert!(gone(&pid));
}

#[test]
fn disabling_a_server_stops_it() {
    let lab = Lab::new();
    let (control, id) = lab.with_fake();
    control.set_enabled(&id, true).unwrap();
    control.start(&id).unwrap();
    control.set_enabled(&id, false).unwrap();
    assert_eq!(control.state(&id), State::Stopped);
}

#[test]
fn a_missing_dependency_blocks_the_start_and_is_named() {
    let lab = Lab::new(); // no `npx` here
    let control = lab.control();
    let err = control.start("figma").unwrap_err();
    let AgentError::MissingDependencies(deps) = &err else {
        panic!("{err:?}");
    };
    assert_eq!(
        (deps[0].command.as_str(), deps[0].label.as_str()),
        ("npx", "Node.js")
    );
    assert!(err.to_string().contains("Node.js"));
    assert!(lab.pids().is_empty(), "nothing started");
    assert!(matches!(control.state("figma"), State::Failed { .. }));
    let row = control
        .list()
        .into_iter()
        .find(|r| r.id == "figma")
        .unwrap();
    assert_eq!(row.missing[0].label, "Node.js");
    assert!(!row.missing[0].url.is_empty());
}

#[test]
fn a_custom_command_that_is_not_installed_is_named_too() {
    let lab = Lab::new();
    let control = lab.control();
    let id = control
        .add_custom(custom("Ghost", "ghost-tool"))
        .unwrap()
        .id;
    let AgentError::MissingDependencies(deps) = control.start(&id).unwrap_err() else {
        panic!("expected a missing dependency");
    };
    assert_eq!(deps[0].label, "ghost-tool");
}

#[test]
fn a_server_without_its_settings_does_not_start() {
    let lab = Lab::new();
    mcp_server(lab.dir.path(), "npx", &lab.pid_file());
    let control = lab.control();
    let err = control.start("figma").unwrap_err();
    assert!(
        matches!(&err, AgentError::NotConfigured(f) if f == &["Figma API token"]),
        "{err:?}"
    );
    assert!(lab.pids().is_empty());
}

#[test]
fn secrets_reach_the_process_in_its_environment() {
    let lab = Lab::new();
    mcp_server(lab.dir.path(), "fake-env", &lab.pid_file());
    let control = lab.control();
    let mut input = custom("Env", "fake-env");
    input.env = vec![("FAKE_TOKEN".into(), Secret::new("tok-9"))];
    let id = control.add_custom(input).unwrap().id;
    let reply = control.request(&id, "env", json!({})).unwrap();
    assert_eq!(reply["result"]["token"], "tok-9");
}

#[test]
fn a_catalogue_field_is_stored_by_key_and_checked() {
    let lab = Lab::new();
    let control = lab.control();
    control
        .set_field("figma", "token", Secret::new("figd_secret"))
        .unwrap();
    assert_eq!(
        control
            .list()
            .iter()
            .find(|r| r.id == "figma")
            .unwrap()
            .filled,
        ["token"]
    );
    assert_eq!(
        lab.store.get("conn:figma/token").unwrap().unwrap().expose(),
        "figd_secret"
    );
    assert!(
        control
            .set_field("figma", "nope", Secret::new("x"))
            .is_err()
    );
    assert!(
        control
            .set_field("nope", "token", Secret::new("x"))
            .is_err()
    );
}

#[test]
fn jira_builds_its_basic_header_from_the_email_and_the_token() {
    let lab = Lab::new();
    // `npx` answers `initialize` with the variable, then keeps reading until the input closes.
    program(
        lab.dir.path(),
        "npx",
        r#"read -r line
printf '{"jsonrpc":"2.0","id":1,"result":{"auth":"%s"}}\n' "$ATLASSIAN_AUTH"
while read -r line; do :; done"#,
    );
    let control = lab.control();
    control
        .set_field("jira", "email", Secret::new("me@acme.test"))
        .unwrap();
    assert!(
        matches!(control.start("jira"), Err(AgentError::NotConfigured(f)) if f == ["API token"])
    );
    control
        .set_field("jira", "token", Secret::new("tkn"))
        .unwrap();
    control.start("jira").unwrap();
    let init = control.request("jira", "initialize", json!({})).unwrap();
    // base64("me@acme.test:tkn")
    assert_eq!(init["result"]["auth"], "Basic bWVAYWNtZS50ZXN0OnRrbg==");
}

#[test]
fn a_server_that_dies_before_it_answers_fails() {
    let lab = Lab::new();
    program(lab.dir.path(), "dies", "exit 1");
    let control = lab.control();
    let id = control.add_custom(custom("Dies", "dies")).unwrap().id;
    assert!(matches!(control.start(&id), Err(AgentError::Server(_))));
    assert!(matches!(control.state(&id), State::Failed { .. }));
}

#[test]
fn a_dead_server_starts_again_on_the_next_request() {
    let lab = Lab::new();
    let (control, id) = lab.with_fake();
    control.start(&id).unwrap();
    assert!(control.request(&id, "crash", json!({})).is_err());
    assert!(matches!(control.state(&id), State::Failed { .. }));
    let reply = control.request(&id, "tools/list", json!({})).unwrap();
    assert_eq!(reply["result"]["tools"][0]["name"], "ping");
    assert_eq!(control.state(&id), State::Running);
    assert_eq!(lab.pids().len(), 2);
}

#[test]
fn a_server_that_stays_silent_times_out_and_fails() {
    let lab = Lab::new();
    let (control, id) = lab.with_fake();
    let started = std::time::Instant::now();
    assert!(matches!(
        control.request(&id, "hang", json!({})),
        Err(AgentError::Server(_))
    ));
    assert!(started.elapsed() < Duration::from_secs(4));
    assert!(matches!(control.state(&id), State::Failed { .. }));
}

#[test]
fn removing_a_custom_server_stops_it_and_deletes_its_secrets() {
    let lab = Lab::new();
    mcp_server(lab.dir.path(), "fake-mcp", &lab.pid_file());
    let control = lab.control();
    let mut input = custom("Fake", "fake-mcp");
    input.env = vec![("FAKE_TOKEN".into(), Secret::new("tok"))];
    let id = control.add_custom(input).unwrap().id;
    control.start(&id).unwrap();
    control.remove_custom(&id).unwrap();
    assert!(control.list().iter().all(|r| r.id != id));
    assert_eq!(control.state(&id), State::Stopped);
    assert!(
        lab.store
            .get(&format!("conn:{id}/FAKE_TOKEN"))
            .unwrap()
            .is_none()
    );
}

#[test]
fn forgetting_a_catalogue_server_deletes_its_secrets_and_disables_it() {
    let lab = Lab::new();
    let control = lab.control();
    control
        .set_field("figma", "token", Secret::new("x"))
        .unwrap();
    control.set_enabled("figma", true).unwrap();
    control.forget("figma").unwrap();
    assert!(lab.store.get("conn:figma/token").unwrap().is_none());
    assert!(!control.is_enabled("figma"));
}

#[test]
fn the_install_plan_follows_the_system_and_never_asks_for_a_password() {
    let lab = Lab::new();
    program(lab.dir.path(), "brew", "exit 0");
    program(lab.dir.path(), "winget", "exit 0");
    let dirs = lab.dirs();
    let mac = install_plan("npx", &dirs, Os::Mac).unwrap();
    assert_eq!(
        (mac.program.as_str(), mac.args.as_slice()),
        ("brew", &["install".to_string(), "node".to_string()][..])
    );
    let win = install_plan("npx", &dirs, Os::Windows).unwrap();
    assert_eq!(win.program, "winget");
    assert!(win.args.contains(&"OpenJS.NodeJS.LTS".to_string()));
    assert!(
        install_plan("npx", &dirs, Os::Other).is_none(),
        "no sudo manager"
    );
    assert!(
        install_plan("ghost-tool", &dirs, Os::Mac).is_none(),
        "unknown command"
    );
    let bare = Lab::new();
    assert!(
        install_plan("npx", &bare.dirs(), Os::Mac).is_none(),
        "no brew"
    );
}

#[test]
fn an_install_runs_the_manager_and_checks_that_the_command_exists_after() {
    let lab = Lab::new();
    let target = lab.dir.path().join("npx");
    program(
        lab.dir.path(),
        "brew",
        &format!(
            "printf '#!/bin/sh\\n' > '{0}'; chmod +x '{0}'; echo installed node",
            target.display()
        ),
    );
    let dirs = lab.dirs();
    assert!(which("npx", &dirs).is_none());
    let out = install_with("npx", &dirs, Os::Mac).unwrap();
    assert!(out.contains("installed node"));
    assert!(which("npx", &dirs).is_some());

    // A manager that fails gives its own words.
    let lab = Lab::new();
    program(lab.dir.path(), "brew", "echo 'Error: no formula'; exit 1");
    let err = install_with("npx", &lab.dirs(), Os::Mac)
        .unwrap_err()
        .to_string();
    assert!(err.contains("no formula"), "{err}");

    // A manager that succeeds and leaves nothing on the path is an error.
    let lab = Lab::new();
    program(lab.dir.path(), "brew", "exit 0");
    let err = install_with("npx", &lab.dirs(), Os::Mac)
        .unwrap_err()
        .to_string();
    assert!(err.contains("still not"), "{err}");

    // With no manager, the person gets the link.
    let lab = Lab::new();
    let err = install_with("npx", &lab.dirs(), Os::Other)
        .unwrap_err()
        .to_string();
    assert!(err.contains("nodejs.org"), "{err}");
}
