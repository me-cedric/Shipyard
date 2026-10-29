//! Headless runs against fake CLIs (spec `factory`, REQ-015). Each fake is a small `sh` script in
//! a temp folder: it records its arguments, input and environment, then prints the stream that
//! the real CLI prints. No network, no real CLI. Unix only (the fakes are `sh`).
#![cfg(unix)]

use shipyard_agents::fake::program;
use shipyard_agents::runner::*;
use shipyard_agents::runners::ModelProvider;
use shipyard_http::fake::FakeHttp;
use shipyard_secrets::{MemoryStore, Secret, SecretStore, conn_account};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;

const KEY: &str = "sk-secret-123";
const MCP_KEY: &str = "mcp-secret-456";

struct Fixture {
    _tmp: TempDir,
    root: PathBuf,
    rec: PathBuf,
    spec: RunSpec,
}

/// A workspace, a recording folder and a fake program whose body is `script`. The script gets
/// `$REC` (the recording folder) and starts with the common recording lines.
fn fixture(script: &str) -> Fixture {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().to_path_buf();
    let work = root.join("work");
    let rec = root.join("rec");
    std::fs::create_dir_all(&work).unwrap();
    std::fs::create_dir_all(&rec).unwrap();
    let body = format!(
        "REC='{}'\nprintf '%s\\n' \"$@\" > \"$REC/argv\"\npwd > \"$REC/pwd\"\nprintenv FAKE_KEY > \"$REC/key\"\n{script}",
        rec.display()
    );
    let bin = program(&root, "fake-cli", &body);
    let mut spec = RunSpec::new("Fix the login.", &work, root.join("scratch-run1"));
    spec.program = Some(bin);
    spec.codex_home = Some(root.join("codex-home"));
    Fixture {
        _tmp: tmp,
        root,
        rec,
        spec,
    }
}

/// Every event until `Exit`. A silent run fails the test instead of hanging it.
fn drain(run: &Run) -> Vec<Event> {
    let mut out = Vec::new();
    loop {
        match run.recv_timeout(Duration::from_secs(30)) {
            Recv::Event(e) => out.push(e),
            Recv::Idle => panic!("the run was silent for 30 s: {out:?}"),
            Recv::Done => return out,
        }
    }
}

/// The next event, or a failure after 30 s: a slow machine must not hang the suite.
fn next(run: &Run) -> Option<Event> {
    match run.recv_timeout(Duration::from_secs(30)) {
        Recv::Event(e) => Some(e),
        Recv::Idle => panic!("no event for 30 s"),
        Recv::Done => None,
    }
}

fn go(id: &str, spec: RunSpec) -> Vec<Event> {
    let run = start(&*runner(id).unwrap(), spec).unwrap();
    drain(&run)
}

fn read(rec: &Path, name: &str) -> String {
    std::fs::read_to_string(rec.join(name)).unwrap_or_default()
}

fn argv(rec: &Path) -> Vec<String> {
    read(rec, "argv").lines().map(String::from).collect()
}

fn text(t: &str) -> Event {
    Event::Text { text: t.into() }
}

fn exit(code: i32) -> Event {
    Event::Exit {
        code: Some(code),
        cancelled: false,
    }
}

fn mcp() -> McpEntry {
    McpEntry {
        name: "shipyard".into(),
        command: "/bin/shipyard".into(),
        args: vec!["--mcp-run".into(), "run1".into()],
        vars: vec![("SHIPYARD_TOKEN".into(), Secret::new(MCP_KEY))],
        http: None,
    }
}

/// No argument and no event holds a secret.
fn assert_no_secret(args: &[String], events: &[Event]) {
    for secret in [KEY, MCP_KEY] {
        assert!(args.iter().all(|a| !a.contains(secret)), "{args:?}");
        let log = serde_json::to_string(events).unwrap();
        assert!(!log.contains(secret), "{log}");
    }
}

fn pid_alive(pid: &str) -> bool {
    std::process::Command::new("kill")
        .args(["-0", pid.trim()])
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn wait_for(path: &Path) -> String {
    for _ in 0..1200 {
        if let Ok(t) = std::fs::read_to_string(path)
            && !t.trim().is_empty()
        {
            return t;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("{} never appeared", path.display());
}

// ---- Claude Code

const CLAUDE_STREAM: &str = r#"
cat > "$REC/stdin"
f=$(sed -n '/^--mcp-config$/{n;p;}' "$REC/argv")
if [ -n "$f" ]; then cp "$f" "$REC/mcp.json"; ls -l "$f" | cut -c1-10 > "$REC/mode"; echo "$f" > "$REC/mcp-path"; fi
echo 'noise that is not json'
echo '{"type":"system","subtype":"init","session_id":"sess-1"}'
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"hello sk-secret-123"},{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"src/a.rs"}}]}}'
echo '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"file text","is_error":false}]}}'
echo '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","content":[{"type":"text","text":"bad"}],"is_error":true}]}}'
echo '{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"sess-1","total_cost_usd":0.5,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":5,"cache_creation_input_tokens":1}}'
"#;

#[test]
fn claude_streams_events_in_order_and_keeps_secrets_out() {
    let mut f = fixture(CLAUDE_STREAM);
    f.spec.model = Some("opus".into());
    f.spec.effort = Some("high".into());
    f.spec.mode = Mode::Auto;
    f.spec.allowed_tools = vec!["Read".into(), "Bash(git diff:*)".into()];
    f.spec.resume = Some("sess-0".into());
    f.spec.vars = vec![("FAKE_KEY".into(), Secret::new(KEY))];
    f.spec.mcp = vec![mcp()];

    let events = go("claude", f.spec.clone());

    assert_eq!(
        events,
        vec![
            Event::Session {
                id: "sess-1".into()
            },
            Event::Turn,
            text("hello ***"),
            Event::ToolCall {
                id: "t1".into(),
                name: "Read".into(),
                input: "src/a.rs".into()
            },
            Event::ToolResult {
                id: "t1".into(),
                ok: true,
                output: "file text".into()
            },
            Event::ToolResult {
                id: "t2".into(),
                ok: false,
                output: "bad".into()
            },
            Event::Usage {
                input_tokens: 10,
                output_tokens: 20,
                cached_tokens: 6,
                cost_usd: Some(0.5)
            },
            exit(0),
        ]
    );
    let args = argv(&f.rec);
    for want in [
        "-p",
        "stream-json",
        "--verbose",
        "auto",
        "opus",
        "high",
        "Read,Bash(git diff:*)",
        "sess-0",
    ] {
        assert!(args.contains(&want.to_string()), "{want} in {args:?}");
    }
    let at = |flag: &str| args.iter().position(|a| a == flag).unwrap();
    assert_eq!(args[at("--permission-mode") + 1], "auto");
    assert_eq!(args[at("--resume") + 1], "sess-0");
    assert_no_secret(&args, &events);
    // The brief is the input, not an argument. The child runs in the workspace.
    assert_eq!(read(&f.rec, "stdin"), "Fix the login.");
    assert!(!args.iter().any(|a| a.contains("Fix the login")));
    assert_eq!(
        Path::new(read(&f.rec, "pwd").trim())
            .canonicalize()
            .unwrap(),
        f.spec.dir.canonicalize().unwrap()
    );
    // The provider key is in the environment of the child, and only there.
    assert_eq!(read(&f.rec, "key").trim(), KEY);
}

#[test]
fn the_claude_mcp_file_is_private_holds_the_secret_and_goes_away() {
    let mut f = fixture(CLAUDE_STREAM);
    f.spec.mcp = vec![mcp()];
    f.spec.vars = vec![("FAKE_KEY".into(), Secret::new(KEY))];
    let events = go("claude", f.spec.clone());
    assert_eq!(read(&f.rec, "mode").trim(), "-rw-------");
    let file: serde_json::Value = serde_json::from_str(&read(&f.rec, "mcp.json")).unwrap();
    let server = &file["mcpServers"]["shipyard"];
    assert_eq!(server["command"], "/bin/shipyard");
    assert_eq!(server["args"][0], "--mcp-run");
    assert_eq!(server["env"]["SHIPYARD_TOKEN"], MCP_KEY);
    assert!(!Path::new(read(&f.rec, "mcp-path").trim()).exists());
    assert_no_secret(&argv(&f.rec), &events);
}

#[test]
fn claude_plan_mode_is_read_only_and_a_fresh_run_has_no_resume() {
    let f = fixture(CLAUDE_STREAM);
    go("claude", f.spec.clone());
    let args = argv(&f.rec);
    let at = args.iter().position(|a| a == "--permission-mode").unwrap();
    assert_eq!(args[at + 1], "plan");
    // The built-in set is cut to the read tools: no `Edit`, no `Write`, no `Bash`.
    let tools = args.iter().position(|a| a == "--tools").unwrap();
    assert_eq!(args[tools + 1], "Read,Grep,Glob");
    for absent in [
        "--resume",
        "--model",
        "--effort",
        "--allowedTools",
        "--mcp-config",
    ] {
        assert!(!args.contains(&absent.to_string()), "{absent}");
    }
}

#[test]
fn claude_plan_mode_keeps_bash_only_when_the_step_lists_a_bash_rule() {
    let mut f = fixture(CLAUDE_STREAM);
    f.spec.allowed_tools = vec!["Read".into(), "Bash(git diff:*)".into()];
    go("claude", f.spec.clone());
    let args = argv(&f.rec);
    let tools = args.iter().position(|a| a == "--tools").unwrap();
    assert_eq!(args[tools + 1], "Read,Grep,Glob,Bash");
}

#[test]
fn claude_auto_mode_leaves_the_built_in_set_alone() {
    let mut f = fixture(CLAUDE_STREAM);
    f.spec.mode = Mode::Auto;
    go("claude", f.spec.clone());
    assert!(!argv(&f.rec).contains(&"--tools".to_string()));
}

#[test]
fn a_claude_error_result_is_an_error_event_and_the_exit_code_stays() {
    let f = fixture(
        r#"cat > /dev/null
echo '{"type":"result","subtype":"error_max_turns","is_error":true,"result":"boom","usage":{}}'
echo 'ignored stderr' >&2
exit 1"#,
    );
    let events = go("claude", f.spec.clone());
    assert!(events.contains(&Event::Error {
        message: "boom".into()
    }));
    // One error: the stderr tail is not added when the stream already named the failure.
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, Event::Error { .. }))
            .count(),
        1
    );
    assert_eq!(events.last(), Some(&exit(1)));
}

#[test]
fn a_crash_gives_the_stderr_tail_in_one_error() {
    let f = fixture("cat > /dev/null\necho 'cannot reach the API' >&2\nexit 3");
    let events = go("claude", f.spec.clone());
    assert_eq!(
        events,
        vec![
            Event::Error {
                message: "cannot reach the API".into()
            },
            exit(3)
        ]
    );
}

#[test]
fn a_crash_message_does_not_leak_a_secret_from_stderr() {
    let mut f = fixture(&format!(
        "cat > /dev/null\necho 'bad key {KEY}' >&2\nexit 2"
    ));
    f.spec.vars = vec![("FAKE_KEY".into(), Secret::new(KEY))];
    let events = go("claude", f.spec.clone());
    assert_eq!(
        events[0],
        Event::Error {
            message: "bad key ***".into()
        }
    );
}

// ---- The Shipyard MCP entry

const MCP_URL: &str = "http://127.0.0.1:4567/mcp";

fn shipyard_entry(runner_id: &str) -> McpEntry {
    McpEntry::shipyard(
        &*runner(runner_id).unwrap(),
        Path::new("/bin/shipyard"),
        MCP_URL,
        &Secret::new(MCP_KEY),
    )
    .unwrap()
}

#[test]
fn claude_gets_an_http_entry_in_a_private_file_and_no_token_in_argv() {
    let mut f = fixture(CLAUDE_STREAM);
    f.spec.mcp = vec![shipyard_entry("claude")];
    f.spec.vars = vec![("FAKE_KEY".into(), Secret::new(KEY))];
    let events = go("claude", f.spec.clone());
    assert_eq!(read(&f.rec, "mode").trim(), "-rw-------");
    let file: serde_json::Value = serde_json::from_str(&read(&f.rec, "mcp.json")).unwrap();
    let server = &file["mcpServers"]["shipyard"];
    assert_eq!(server["type"], "http");
    assert_eq!(server["url"], MCP_URL);
    assert_eq!(
        server["headers"]["Authorization"],
        format!("Bearer {MCP_KEY}")
    );
    assert!(server.get("command").is_none());
    assert!(!Path::new(read(&f.rec, "mcp-path").trim()).exists());
    assert_no_secret(&argv(&f.rec), &events);
}

#[test]
fn the_bearer_token_is_scrubbed_from_events() {
    let script = format!(
        "{CLAUDE_STREAM}\necho '{{\"type\":\"assistant\",\"message\":{{\"content\":[{{\"type\":\"text\",\"text\":\"saw {MCP_KEY} and Bearer {MCP_KEY}\"}}]}}}}'"
    );
    let mut f = fixture(&script);
    f.spec.mcp = vec![shipyard_entry("claude")];
    let events = go("claude", f.spec.clone());
    let log = serde_json::to_string(&events).unwrap();
    assert!(!log.contains(MCP_KEY), "{log}");
}

#[test]
fn a_cli_without_http_entries_gets_the_bridge_with_the_vars_in_its_file() {
    let entry = shipyard_entry("codex");
    assert_eq!(entry.command, "/bin/shipyard");
    assert_eq!(entry.args, vec!["--mcp-bridge"]);
    assert!(entry.http.is_none());
    let vars: Vec<(&str, &str)> = entry
        .vars
        .iter()
        .map(|(k, v)| (k.as_str(), v.expose()))
        .collect();
    assert_eq!(
        vars,
        vec![
            ("SHIPYARD_MCP_URL", MCP_URL),
            ("SHIPYARD_MCP_TOKEN", MCP_KEY)
        ]
    );
    assert_eq!(
        (URL_ENV, TOKEN_ENV, BRIDGE_FLAG),
        ("SHIPYARD_MCP_URL", "SHIPYARD_MCP_TOKEN", "--mcp-bridge")
    );

    let mut f = fixture(
        r#"p=$(printenv GEMINI_CLI_SYSTEM_SETTINGS_PATH)
cp "$p" "$REC/settings.json"; ls -l "$p" | cut -c1-10 > "$REC/mode"
echo '{"type":"init","session_id":"g-1"}'
echo '{"type":"result","status":"success","stats":{}}'"#,
    );
    f.spec.mcp = vec![shipyard_entry("gemini")];
    let events = go("gemini", f.spec.clone());
    assert_eq!(read(&f.rec, "mode").trim(), "-rw-------");
    let settings: serde_json::Value = serde_json::from_str(&read(&f.rec, "settings.json")).unwrap();
    let server = &settings["mcpServers"]["shipyard"];
    assert_eq!(server["args"][0], "--mcp-bridge");
    assert_eq!(server["env"]["SHIPYARD_MCP_TOKEN"], MCP_KEY);
    assert_no_secret(&argv(&f.rec), &events);
}

#[test]
fn the_endpoint_must_be_on_this_machine() {
    let claude = runner("claude").unwrap();
    for url in [
        "https://127.0.0.1:1/mcp",
        "http://example.com/mcp",
        "http://127.0.0.1.evil.com:1/mcp",
        "http://127.0.0.1:1@evil.com/mcp",
    ] {
        let r = McpEntry::shipyard(
            &*claude,
            Path::new("/bin/shipyard"),
            url,
            &Secret::new(MCP_KEY),
        );
        let err = r
            .err()
            .unwrap_or_else(|| panic!("{url} was accepted"))
            .to_string();
        assert!(err.contains("loopback") && !err.contains(MCP_KEY), "{err}");
    }
}

#[test]
fn a_runner_without_http_entries_refuses_one_and_starts_nothing() {
    let f = fixture("echo started > \"$REC/started\"");
    let mut spec = f.spec.clone();
    spec.mcp = vec![shipyard_entry("claude")];
    let err = start(&*runner("codex").unwrap(), spec)
        .err()
        .unwrap()
        .to_string();
    assert!(err.contains("HTTP MCP"), "{err}");
    assert!(!f.rec.join("started").exists());
}

// ---- Codex

const CODEX_STREAM: &str = r#"
cat > "$REC/stdin"
f=$(sed -n '/^--profile$/{n;p;}' "$REC/argv")
if [ -n "$f" ]; then
  p="$CODEX_HOME_FOR_TEST/$f.config.toml"
  cp "$p" "$REC/profile.toml"; ls -l "$p" | cut -c1-10 > "$REC/mode"; echo "$p" > "$REC/profile-path"
fi
echo '{"type":"thread.started","thread_id":"th-1"}'
echo '{"type":"turn.started"}'
echo '{"type":"item.started","item":{"id":"i1","type":"command_execution","command":"ls -la","status":"in_progress"}}'
echo '{"type":"item.completed","item":{"id":"i1","type":"command_execution","command":"ls -la","aggregated_output":"a","exit_code":0,"status":"completed"}}'
echo '{"type":"item.completed","item":{"id":"i2","type":"file_change","changes":[{"path":"a.txt","kind":"update"}],"status":"completed"}}'
echo '{"type":"item.started","item":{"id":"i3","type":"command_execution","command":"false"}}'
echo '{"type":"item.completed","item":{"id":"i3","type":"command_execution","command":"false","aggregated_output":"","exit_code":1,"status":"failed"}}'
echo '{"type":"item.completed","item":{"id":"i4","type":"reasoning","text":"thinking"}}'
echo '{"type":"item.completed","item":{"id":"i5","type":"agent_message","text":"done"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":7}}'
"#;

#[test]
fn codex_exec_maps_items_to_calls_results_text_and_usage() {
    let mut f = fixture(CODEX_STREAM);
    f.spec.model = Some("gpt-5".into());
    f.spec.effort = Some("high".into());
    let events = go("codex", f.spec.clone());
    assert_eq!(
        events,
        vec![
            Event::Session { id: "th-1".into() },
            Event::Turn,
            Event::ToolCall {
                id: "i1".into(),
                name: "command_execution".into(),
                input: "ls -la".into()
            },
            Event::ToolResult {
                id: "i1".into(),
                ok: true,
                output: "a".into()
            },
            // A file change arrives only as `completed`: the call comes first.
            Event::ToolCall {
                id: "i2".into(),
                name: "file_change".into(),
                input: "a.txt".into()
            },
            Event::ToolResult {
                id: "i2".into(),
                ok: true,
                output: String::new()
            },
            Event::ToolCall {
                id: "i3".into(),
                name: "command_execution".into(),
                input: "false".into()
            },
            Event::ToolResult {
                id: "i3".into(),
                ok: false,
                output: String::new()
            },
            text("done"),
            Event::Usage {
                input_tokens: 100,
                output_tokens: 7,
                cached_tokens: 40,
                cost_usd: None
            },
            exit(0),
        ]
    );
    let args = argv(&f.rec);
    assert_eq!(
        args,
        [
            "exec",
            "--json",
            "--sandbox",
            "read-only",
            "--model",
            "gpt-5",
            "-c",
            "model_reasoning_effort=\"high\"",
            "-"
        ]
    );
    assert_eq!(read(&f.rec, "stdin"), "Fix the login.");
}

#[test]
fn codex_resume_puts_the_subcommand_first_and_the_mode_in_config_keys() {
    let mut f = fixture(CODEX_STREAM);
    f.spec.resume = Some("th-0".into());
    f.spec.mode = Mode::Auto;
    go("codex", f.spec.clone());
    let args = argv(&f.rec);
    assert_eq!(&args[..4], ["exec", "resume", "th-0", "--json"]);
    // `codex exec resume` refuses `--sandbox`: the tier is config.
    assert!(!args.contains(&"--sandbox".to_string()));
    assert!(args.contains(&"sandbox_mode=\"workspace-write\"".to_string()));
    assert!(args.contains(&"approval_policy=\"never\"".to_string()));
}

#[test]
fn the_codex_profile_is_private_holds_the_secret_and_goes_away() {
    let mut f = fixture(CODEX_STREAM);
    f.spec.mcp = vec![mcp()];
    let home = f.spec.codex_home.clone().unwrap();
    // The fake reads the profile through this variable: it cannot know the temp folder.
    f.spec.vars = vec![(
        "CODEX_HOME_FOR_TEST".into(),
        Secret::new(home.to_string_lossy()),
    )];
    let events = go("codex", f.spec.clone());
    let args = argv(&f.rec);
    assert_eq!(read(&f.rec, "mode").trim(), "-rw-------");
    let profile = read(&f.rec, "profile.toml");
    assert!(profile.contains("[mcp_servers.shipyard]"), "{profile}");
    assert!(profile.contains("command = \"/bin/shipyard\""), "{profile}");
    assert!(
        profile.contains(&format!("SHIPYARD_TOKEN = \"{MCP_KEY}\"")),
        "{profile}"
    );
    let at = args.iter().position(|a| a == "--profile").unwrap();
    assert!(
        args[at + 1].starts_with("shipyard-scratch-run1"),
        "{args:?}"
    );
    assert!(!Path::new(read(&f.rec, "profile-path").trim()).exists());
    assert_no_secret(&args, &events);
}

#[test]
fn a_codex_failure_line_is_an_error_event() {
    let f = fixture(
        r#"cat > /dev/null
echo '{"type":"thread.started","thread_id":"th-1"}'
echo '{"type":"turn.failed","error":{"message":"usage limit"}}'
exit 1"#,
    );
    let events = go("codex", f.spec.clone());
    assert_eq!(
        events,
        vec![
            Event::Session { id: "th-1".into() },
            Event::Error {
                message: "usage limit".into()
            },
            exit(1)
        ]
    );
}

// ---- Gemini CLI

#[test]
fn gemini_streams_events_and_reads_mcp_from_a_private_settings_file() {
    let mut f = fixture(
        r#"p=$(printenv GEMINI_CLI_SYSTEM_SETTINGS_PATH)
cp "$p" "$REC/settings.json"; ls -l "$p" | cut -c1-10 > "$REC/mode"; echo "$p" > "$REC/settings-path"
echo '{"type":"init","session_id":"g-1","model":"gemini-x"}'
echo '{"type":"message","role":"user","content":"Fix the login."}'
echo '{"type":"message","role":"assistant","content":"working","delta":true}'
echo '{"type":"tool_use","tool_name":"read_file","tool_id":"c1","parameters":{"path":"a.rs"}}'
echo '{"type":"tool_result","tool_id":"c1","status":"success","output":"text"}'
echo '{"type":"tool_use","tool_name":"shell","tool_id":"c2","parameters":{"command":"false"}}'
echo '{"type":"tool_result","tool_id":"c2","status":"error","output":"no"}'
echo '{"type":"result","status":"success","stats":{"total_tokens":15,"input_tokens":10,"output_tokens":5,"cached":3}}'"#,
    );
    f.spec.model = Some("gemini-x".into());
    f.spec.mode = Mode::Auto;
    f.spec.allowed_tools = vec!["read_file".into(), "shell".into()];
    f.spec.resume = Some("g-0".into());
    f.spec.mcp = vec![mcp()];
    let events = go("gemini", f.spec.clone());
    assert_eq!(
        events,
        vec![
            Event::Session { id: "g-1".into() },
            text("working"),
            Event::Turn,
            Event::ToolCall {
                id: "c1".into(),
                name: "read_file".into(),
                input: "a.rs".into()
            },
            Event::ToolResult {
                id: "c1".into(),
                ok: true,
                output: "text".into()
            },
            Event::Turn,
            Event::ToolCall {
                id: "c2".into(),
                name: "shell".into(),
                input: "false".into()
            },
            Event::ToolResult {
                id: "c2".into(),
                ok: false,
                output: "no".into()
            },
            Event::Usage {
                input_tokens: 10,
                output_tokens: 5,
                cached_tokens: 3,
                cost_usd: None
            },
            exit(0),
        ]
    );
    let args = argv(&f.rec);
    for want in [
        "--output-format",
        "stream-json",
        "auto_edit",
        "gemini-x",
        "read_file,shell",
        "g-0",
        "--prompt=Fix the login.",
    ] {
        assert!(args.contains(&want.to_string()), "{want} in {args:?}");
    }
    assert_eq!(read(&f.rec, "mode").trim(), "-rw-------");
    let settings: serde_json::Value = serde_json::from_str(&read(&f.rec, "settings.json")).unwrap();
    assert_eq!(
        settings["mcpServers"]["shipyard"]["env"]["SHIPYARD_TOKEN"],
        MCP_KEY
    );
    assert!(!Path::new(read(&f.rec, "settings-path").trim()).exists());
    for a in &args {
        assert!(!a.contains(MCP_KEY));
    }
}

// ---- OpenCode

#[test]
fn opencode_streams_events_and_reads_mcp_from_a_private_config() {
    let mut f = fixture(
        r#"p=$(printenv OPENCODE_CONFIG)
cp "$p" "$REC/config.json"; ls -l "$p" | cut -c1-10 > "$REC/mode"; echo "$p" > "$REC/config-path"
echo '{"type":"step_start","sessionID":"ses_1","part":{"type":"step-start"}}'
echo '{"type":"text","sessionID":"ses_1","part":{"type":"text","text":"working"}}'
echo '{"type":"tool_use","sessionID":"ses_1","part":{"type":"tool","callID":"c1","tool":"bash","state":{"status":"completed","input":{"command":"ls"},"output":"a"}}}'
echo '{"type":"tool_use","sessionID":"ses_1","part":{"type":"tool","callID":"c2","tool":"read","state":{"status":"error","input":{"path":"x"},"output":"missing"}}}'
echo '{"type":"step_finish","sessionID":"ses_1","part":{"type":"step-finish","cost":0.25,"tokens":{"input":30,"output":9,"reasoning":0,"cache":{"read":12,"write":0}}}}'"#,
    );
    f.spec.model = Some("anthropic/claude-x".into());
    f.spec.mode = Mode::Auto;
    f.spec.resume = Some("ses_0".into());
    f.spec.mcp = vec![mcp()];
    let events = go("opencode", f.spec.clone());
    assert_eq!(
        events,
        vec![
            Event::Session { id: "ses_1".into() },
            Event::Turn,
            text("working"),
            Event::ToolCall {
                id: "c1".into(),
                name: "bash".into(),
                input: "ls".into()
            },
            Event::ToolResult {
                id: "c1".into(),
                ok: true,
                output: "a".into()
            },
            Event::ToolCall {
                id: "c2".into(),
                name: "read".into(),
                input: "x".into()
            },
            Event::ToolResult {
                id: "c2".into(),
                ok: false,
                output: "missing".into()
            },
            Event::Usage {
                input_tokens: 30,
                output_tokens: 9,
                cached_tokens: 12,
                cost_usd: Some(0.25)
            },
            exit(0),
        ]
    );
    let args = argv(&f.rec);
    assert_eq!(
        args,
        [
            "run",
            "--format",
            "json",
            "--agent",
            "build",
            "--model",
            "anthropic/claude-x",
            "--session",
            "ses_0",
            "--",
            "Fix the login."
        ]
    );
    assert_eq!(read(&f.rec, "mode").trim(), "-rw-------");
    let config: serde_json::Value = serde_json::from_str(&read(&f.rec, "config.json")).unwrap();
    let server = &config["mcp"]["shipyard"];
    assert_eq!(server["command"][0], "/bin/shipyard");
    assert_eq!(server["environment"]["SHIPYARD_TOKEN"], MCP_KEY);
    assert!(!Path::new(read(&f.rec, "config-path").trim()).exists());
}

#[test]
fn opencode_plan_mode_uses_the_plan_agent() {
    let f = fixture("echo '{\"type\":\"step_finish\",\"part\":{}}'");
    go("opencode", f.spec.clone());
    assert!(argv(&f.rec).windows(2).any(|w| w == ["--agent", "plan"]));
}

// ---- GitHub Copilot over ACP

/// A fake `copilot --acp`: it answers the handshake in order, streams an answer, asks for two
/// permissions, and then stays alive, as the real server does.
const ACP_SERVER: &str = r#"
read l; echo "$l" >> "$REC/in"
echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}'
read l; echo "$l" >> "$REC/in"
echo '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"acp-1"}}'
read l; echo "$l" >> "$REC/in"
read l; echo "$l" >> "$REC/in"
echo '{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"hel"}}}}'
echo '{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"lo"}}}}'
echo '{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"tool_call","toolCallId":"c1","title":"Read file","kind":"read","locations":[{"path":"/work/a.rs"}]}}}'
echo '{"jsonrpc":"2.0","id":77,"method":"session/request_permission","params":{"toolCall":{"kind":"read","locations":[{"path":"/work/a.rs"}]},"options":[{"optionId":"yes","kind":"allow_once"},{"optionId":"no","kind":"reject_once"}]}}'
read l; echo "$l" >> "$REC/in"
echo '{"jsonrpc":"2.0","id":78,"method":"session/request_permission","params":{"toolCall":{"kind":"execute","locations":[]},"options":[{"optionId":"yes","kind":"allow_once"},{"optionId":"no","kind":"reject_once"}]}}'
read l; echo "$l" >> "$REC/in"
echo '{"jsonrpc":"2.0","id":79,"method":"fs/read_text_file","params":{}}'
read l; echo "$l" >> "$REC/in"
echo '{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"tool_call_update","toolCallId":"c1","status":"completed","content":[{"type":"content","content":{"type":"text","text":"file text"}}]}}}'
echo '{"jsonrpc":"2.0","id":100,"result":{"stopReason":"end_turn","usage":{"inputTokens":50,"outputTokens":8,"cachedReadTokens":20}}}'
sleep 120
"#;

#[test]
fn copilot_acp_runs_the_handshake_answers_permissions_by_mode_and_ends_the_run() {
    let mut f = fixture(ACP_SERVER);
    f.spec.model = Some("gpt-5-mini".into());
    f.spec.mcp = vec![mcp()];
    let started = std::time::Instant::now();
    let events = go("copilot", f.spec.clone());
    // The process waits for 120 s: the run ended because the prompt response ended it.
    assert!(started.elapsed() < Duration::from_secs(30));
    assert_eq!(
        events,
        vec![
            Event::Session { id: "acp-1".into() },
            text("hel"),
            text("lo"),
            Event::Turn,
            Event::ToolCall {
                id: "c1".into(),
                name: "Read file".into(),
                input: "/work/a.rs".into()
            },
            Event::ToolResult {
                id: "c1".into(),
                ok: true,
                output: "file text".into()
            },
            Event::Usage {
                input_tokens: 50,
                output_tokens: 8,
                cached_tokens: 20,
                cost_usd: None
            },
            exit(0),
        ]
    );
    let sent: Vec<serde_json::Value> = read(&f.rec, "in")
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(sent[0]["method"], "initialize");
    assert_eq!(sent[1]["method"], "session/new");
    assert_eq!(sent[1]["params"]["mcpServers"][0]["name"], "shipyard");
    assert_eq!(
        sent[1]["params"]["mcpServers"][0]["env"][0]["value"],
        MCP_KEY
    );
    assert_eq!(sent[2]["method"], "session/set_config_option");
    assert_eq!(sent[2]["params"]["value"], "gpt-5-mini");
    assert_eq!(sent[3]["method"], "session/prompt");
    assert_eq!(sent[3]["params"]["prompt"][0]["text"], "Fix the login.");
    assert_eq!(sent[3]["params"]["sessionId"], "acp-1");
    // Plan mode: a read is allowed, a command is refused, an unknown request gets an error.
    assert_eq!(sent[4]["id"], 77);
    assert_eq!(sent[4]["result"]["outcome"]["optionId"], "yes");
    assert_eq!(sent[5]["result"]["outcome"]["optionId"], "no");
    assert_eq!(sent[6]["error"]["code"], -32601);
    // Not an argument, not an event.
    assert_eq!(argv(&f.rec), ["--acp"]);
    assert_no_secret(&argv(&f.rec), &events);
}

#[test]
fn copilot_resume_loads_the_session() {
    let mut f = fixture(
        r#"read l; echo "$l" >> "$REC/in"
echo '{"jsonrpc":"2.0","id":1,"result":{}}'
read l; echo "$l" >> "$REC/in"
echo '{"jsonrpc":"2.0","id":2,"result":{}}'
read l; echo "$l" >> "$REC/in"
echo '{"jsonrpc":"2.0","id":100,"error":{"message":"no quota"}}'
sleep 120"#,
    );
    f.spec.resume = Some("acp-0".into());
    let events = go("copilot", f.spec.clone());
    assert_eq!(
        events,
        vec![
            Event::Session { id: "acp-0".into() },
            Event::Error {
                message: "no quota".into()
            },
            exit(0)
        ]
    );
    let first: Vec<_> = read(&f.rec, "in").lines().map(String::from).collect();
    assert!(first[1].contains("session/load") && first[1].contains("acp-0"));
}

// ---- Cancel, stall, limits

#[test]
fn cancel_kills_the_whole_process_group_including_a_grandchild() {
    let f = fixture(
        r#"sleep 300 &
echo $! > "$REC/child"
echo '{"type":"system","subtype":"init","session_id":"s"}'
sleep 300"#,
    );
    let run = start(&*runner("claude").unwrap(), f.spec.clone()).unwrap();
    assert_eq!(next(&run), Some(Event::Session { id: "s".into() }));
    let child = wait_for(&f.rec.join("child"));
    assert!(pid_alive(&child));

    run.cancel_handle().cancel();
    let rest = drain(&run);

    assert_eq!(
        rest,
        vec![Event::Exit {
            code: None,
            cancelled: true
        }]
    );
    for _ in 0..200 {
        if !pid_alive(&child) {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("the grandchild {child} survived the cancel");
}

#[test]
fn a_silent_run_shows_idle_and_the_caller_can_stop_it() {
    let f = fixture("sleep 300");
    let run = start(&*runner("claude").unwrap(), f.spec.clone()).unwrap();
    assert!(matches!(
        run.recv_timeout(Duration::from_millis(150)),
        Recv::Idle
    ));
    assert!(run.elapsed() >= Duration::from_millis(150));
    run.cancel();
    assert!(run.cancel_handle().is_cancelled());
    assert_eq!(
        drain(&run),
        vec![Event::Exit {
            code: None,
            cancelled: true
        }]
    );
}

#[test]
fn dropping_a_run_kills_its_process() {
    let f = fixture(
        r#"echo $$ > "$REC/pid"
echo '{"type":"system","session_id":"s"}'
sleep 300"#,
    );
    let run = start(&*runner("claude").unwrap(), f.spec.clone()).unwrap();
    let pid = wait_for(&f.rec.join("pid"));
    drop(run);
    for _ in 0..200 {
        if !pid_alive(&pid) {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("the process {pid} survived the drop");
}

#[test]
fn turns_are_counted_by_events_so_the_caller_can_enforce_max_turns() {
    let f = fixture(
        r#"cat > /dev/null
for i in 1 2 3 4 5 6; do
  echo '{"type":"assistant","message":{"content":[{"type":"text","text":"x"}]}}'
done
sleep 300"#,
    );
    let run = start(&*runner("claude").unwrap(), f.spec.clone()).unwrap();
    let mut turns = 0;
    while let Some(e) = next(&run) {
        if e == Event::Turn {
            turns += 1;
            if turns == 3 {
                run.cancel();
            }
        }
    }
    assert!((3..=6).contains(&turns));
}

// ---- Checks before a start

#[test]
fn a_bad_spec_starts_no_process() {
    let f = fixture("echo started > \"$REC/started\"");
    let claude = runner("claude").unwrap();
    let bad = |edit: &dyn Fn(&mut RunSpec)| {
        let mut spec = f.spec.clone();
        edit(&mut spec);
        match start(&*claude, spec) {
            Err(e) => e.to_string(),
            Ok(_) => panic!("the start was accepted"),
        }
    };
    assert!(bad(&|s| s.prompt = "  ".into()).contains("prompt"));
    assert!(bad(&|s| s.dir = f.root.join("missing")).contains("workspace"));
    // The scratch folder holds the MCP config and the brief: never inside the worktree.
    assert!(bad(&|s| s.scratch = s.dir.join(".scratch")).contains("scratch"));
    assert!(bad(&|s| s.scratch = s.dir.clone()).contains("scratch"));
    assert!(bad(&|s| s.scratch = "relative/scratch".into()).contains("scratch"));
    assert!(bad(&|s| s.model = Some("--dangerously-skip-permissions".into())).contains("model"));
    assert!(bad(&|s| s.effort = Some("high; rm".into())).contains("effort"));
    assert!(bad(&|s| s.resume = Some("-r x".into())).contains("session id"));
    assert!(bad(&|s| s.allowed_tools = vec!["a,b".into()]).contains("tool"));
    assert!(
        bad(&|s| s.mcp = vec![McpEntry {
            name: "a b".into(),
            ..mcp()
        }])
        .contains("MCP")
    );
    assert!(!f.rec.join("started").exists());
    assert!(runner("nope").is_none());
}

#[test]
fn a_program_that_cannot_start_is_an_error_not_a_hang() {
    let mut f = fixture("");
    f.spec.program = Some(f.root.join("no-such-program"));
    let err = start(&*runner("claude").unwrap(), f.spec.clone())
        .err()
        .unwrap();
    assert!(err.to_string().contains("cannot start"), "{err}");
}

// ---- HTTP provider

fn provider() -> ModelProvider {
    ModelProvider::new("local", "Local", "http://localhost:1234/v1", "m").unwrap()
}

fn store() -> Arc<MemoryStore> {
    let store = Arc::new(MemoryStore::default());
    store
        .set(&conn_account("local"), &Secret::new("prov-key-789"))
        .unwrap();
    store
}

#[test]
fn a_provider_run_gives_text_usage_and_exit_and_never_the_key() {
    let http = Arc::new(FakeHttp::new());
    http.post(
        "/chat/completions",
        "Fix the login.",
        200,
        r#"{"choices":[{"message":{"content":"hi prov-key-789"}}],"usage":{"prompt_tokens":3,"completion_tokens":4}}"#,
    );
    let run = run_provider(provider(), http.clone(), store(), "Fix the login.".into());
    let events = drain(&run);
    assert_eq!(
        events,
        vec![
            Event::Turn,
            text("hi ***"),
            Event::Usage {
                input_tokens: 3,
                output_tokens: 4,
                cached_tokens: 0,
                cost_usd: None
            },
            exit(0),
        ]
    );
}

#[test]
fn a_provider_failure_is_an_error_event_and_exit_code_1() {
    let http = Arc::new(FakeHttp::new());
    http.post("/chat/completions", "", 500, "boom");
    let events = drain(&run_provider(provider(), http, store(), "go".into()));
    assert!(matches!(events[1], Event::Error { .. }), "{events:?}");
    assert_eq!(events.last(), Some(&exit(1)));
    let log = serde_json::to_string(&events).unwrap();
    assert!(!log.contains("prov-key-789"));
}
