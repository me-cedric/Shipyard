//! The eight agent tools against a fake `AgentEvents` (factory REQ-016 to REQ-020, REQ-037).

use serde_json::{Value, json};
use shipyard_mcp::server::{Limits, Server};
use shipyard_mcp::session::Binding;
use shipyard_mcp::tools::agent::{AgentEvent, AgentEvents, NAMES, Outcome, QuestionKind};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct Fake {
    seen: Mutex<Vec<(String, String, AgentEvent)>>,
    answer: Mutex<Option<Result<Value, String>>>,
}

impl AgentEvents for Fake {
    fn emit(&self, who: &Binding, event: AgentEvent) -> Result<Value, String> {
        let tool = event.tool();
        self.seen
            .lock()
            .unwrap()
            .push((who.run.clone(), who.step.clone(), event));
        let canned = self.answer.lock().unwrap().clone();
        canned.unwrap_or_else(|| Ok(json!({ "ok": true, "tool": tool })))
    }
}

struct Lab {
    fake: Arc<Fake>,
    server: Server,
    clock: Arc<AtomicU64>,
}

fn all() -> Vec<String> {
    NAMES.iter().map(|n| n.to_string()).collect()
}

impl Lab {
    fn new() -> Self {
        Self::with(Limits::default())
    }

    fn with(limits: Limits) -> Self {
        let fake = Arc::new(Fake::default());
        let clock = Arc::new(AtomicU64::new(0));
        let c = clock.clone();
        let server = Server::new(fake.clone())
            .with_limits(limits)
            .with_clock(move || c.load(Ordering::Relaxed));
        Self {
            fake,
            server,
            clock,
        }
    }

    fn token(&self, run: &str, step: &str, tools: Vec<String>) -> String {
        let binding = Binding {
            run: run.into(),
            step: step.into(),
            tools,
        };
        self.server.sessions().open(binding).unwrap().0
    }

    fn rpc(&self, token: &str, method: &str, params: Value) -> Value {
        let req = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
        self.server.handle(token, &req).expect("an answer")
    }

    fn call(&self, token: &str, name: &str, args: Value) -> Value {
        self.rpc(
            token,
            "tools/call",
            json!({ "name": name, "arguments": args }),
        )["result"]
            .clone()
    }

    fn events(&self) -> usize {
        self.fake.seen.lock().unwrap().len()
    }
}

fn is_error(result: &Value) -> bool {
    result["isError"] == true
}

fn message(result: &Value) -> String {
    result["content"][0]["text"].as_str().unwrap().to_string()
}

#[test]
fn a_session_lists_the_eight_tools_with_strict_schemas_and_descriptions() {
    let lab = Lab::new();
    let token = lab.token("r1", "build", all());
    let list = lab.rpc(&token, "tools/list", json!({}));
    let tools = list["result"]["tools"].as_array().unwrap();
    let names: Vec<_> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert_eq!(names, NAMES);
    for tool in tools {
        assert_eq!(tool["inputSchema"]["additionalProperties"], false, "{tool}");
        assert!(tool["description"].as_str().unwrap().len() > 20);
        assert!(tool["inputSchema"]["required"].as_array().is_some());
    }
}

#[test]
fn each_tool_emits_one_typed_event_bound_to_the_run_and_the_step_of_the_token() {
    let lab = Lab::new();
    let token = lab.token("run-7", "plan", all());
    let calls = [
        (
            "ask_question",
            json!({"question": "Which db?", "options": ["pg", "sqlite", "none"], "recommended": 2, "free_text": true}),
        ),
        ("post_progress", json!({"text": "step one done"})),
        (
            "handoff",
            json!({"role": "reviewer", "summary": "ready", "step": "review"}),
        ),
        ("message", json!({"to": "person", "text": "fyi"})),
        (
            "spawn_subtask",
            json!({"title": "t", "brief": "b", "role": "worker"}),
        ),
        (
            "report",
            json!({"outcome": "done", "summary": "ok", "refs": ["pr:gh#4"], "output": {"tasks": [{"goal": "a"}]}}),
        ),
        ("read_ticket", json!({"ref": "wi:SHIP-1"})),
        ("read_ref", json!({"ref": "adr:0005"})),
    ];
    for (name, args) in calls {
        let result = lab.call(&token, name, args);
        assert!(!is_error(&result), "{name}: {result}");
        assert_eq!(
            result["structuredContent"],
            json!({"ok": true, "tool": name})
        );
    }
    let seen = lab.fake.seen.lock().unwrap();
    assert_eq!(seen.len(), 8);
    assert!(seen.iter().all(|(r, s, _)| r == "run-7" && s == "plan"));
    let tools: Vec<_> = seen.iter().map(|(_, _, e)| e.tool()).collect();
    assert_eq!(tools, NAMES);
    match &seen[0].2 {
        AgentEvent::AskQuestion(q) => {
            assert_eq!((q.options.len(), q.recommended, q.free_text), (3, 2, true));
            assert_eq!(q.kind, QuestionKind::Ticket);
        }
        other => panic!("{other:?}"),
    }
    match &seen[5].2 {
        AgentEvent::Report(r) => {
            assert_eq!(r.outcome, Outcome::Done);
            assert_eq!(r.output.as_ref().unwrap()["tasks"][0]["goal"], "a");
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn an_invalid_input_gives_an_error_to_the_agent_and_no_event() {
    let lab = Lab::new();
    let token = lab.token("r1", "s", all());
    let ask = |o: Value, rec: Value| json!({"question": "q?", "options": o, "recommended": rec});
    let bad = [
        ("ask_question", ask(json!(["only"]), json!(1))),
        (
            "ask_question",
            ask(json!(["a", "b", "c", "d", "e"]), json!(1)),
        ),
        ("ask_question", ask(json!(["a", "b"]), json!(3))),
        ("ask_question", ask(json!(["a", "b"]), json!(0))),
        ("ask_question", ask(json!(["a", " "]), json!(1))),
        (
            "ask_question",
            json!({"question": "q?", "options": ["a", "b"]}),
        ),
        (
            "ask_question",
            json!({"question": "q?", "options": ["a", "b"], "recommended": 1, "kind": "spec"}),
        ),
        (
            "ask_question",
            json!({"question": "q?", "options": ["a", "b"], "recommended": 1, "spec": "spec:a#REQ-1"}),
        ),
        ("post_progress", json!({})),
        ("post_progress", json!({"text": "x".repeat(281)})),
        ("post_progress", json!({"text": "   "})),
        ("post_progress", json!({"text": 5})),
        // An input cannot name another run.
        ("post_progress", json!({"text": "x", "run": "other"})),
        ("handoff", json!({"role": "reviewer"})),
        ("message", json!({"to": "person"})),
        ("spawn_subtask", json!({"title": "t", "brief": "b"})),
        ("report", json!({"outcome": "great", "summary": "s"})),
        (
            "report",
            json!({"outcome": "done", "summary": "s", "refs": [1]}),
        ),
        ("read_ticket", json!({"ref": "adr:0005"})),
        ("read_ref", json!({})),
        ("read_ref", json!({"ref": ""})),
    ];
    for (name, args) in bad {
        let result = lab.call(&token, name, args.clone());
        assert!(is_error(&result), "{name} {args}");
    }
    assert_eq!(lab.events(), 0);
}

#[test]
fn a_spec_question_needs_a_spec_ref() {
    let lab = Lab::new();
    let token = lab.token("r1", "s", all());
    let args = json!({"question": "q?", "options": ["a", "b"], "recommended": 1, "kind": "spec", "spec": "spec:auth#REQ-003"});
    assert!(!is_error(&lab.call(&token, "ask_question", args)));
    match &lab.fake.seen.lock().unwrap()[0].2 {
        AgentEvent::AskQuestion(q) => assert_eq!(q.kind, QuestionKind::Spec),
        other => panic!("{other:?}"),
    }
}

#[test]
fn the_error_names_the_field() {
    let lab = Lab::new();
    let token = lab.token("r1", "s", all());
    let r = lab.call(
        &token,
        "ask_question",
        json!({"question": "q?", "options": ["a"], "recommended": 1}),
    );
    assert!(message(&r).starts_with("options: "), "{}", message(&r));
}

#[test]
fn a_step_calls_only_the_tools_of_its_tools_field() {
    let lab = Lab::new();
    let token = lab.token("r1", "review", vec!["read_ref".into()]);
    let list = lab.rpc(&token, "tools/list", json!({}));
    assert_eq!(list["result"]["tools"].as_array().unwrap().len(), 1);
    let refused = lab.call(&token, "report", json!({"outcome": "done", "summary": "s"}));
    assert!(is_error(&refused));
    assert!(message(&refused).contains("review"));
    assert_eq!(lab.events(), 0);
    assert!(!is_error(&lab.call(
        &token,
        "read_ref",
        json!({"ref": "adr:1"})
    )));
    // A step with no `tools` calls nothing.
    let none = lab.token("r1", "grill", vec![]);
    assert!(
        lab.rpc(&none, "tools/list", json!({}))["result"]["tools"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn an_unknown_tool_and_an_unknown_method_are_protocol_errors_or_tool_errors() {
    let lab = Lab::new();
    let token = lab.token("r1", "s", all());
    assert!(is_error(&lab.call(&token, "delete_everything", json!({}))));
    let method = lab.rpc(&token, "nope/nope", json!({}));
    assert_eq!(method["error"]["code"], -32601);
}

#[test]
fn a_bad_token_is_refused_and_a_revoked_run_stops_at_once() {
    let lab = Lab::new();
    let token = lab.token("r1", "s", all());
    let req = json!({"jsonrpc": "2.0", "id": 1, "method": "ping"});
    assert_eq!(
        lab.server.handle("wrong", &req).unwrap()["error"]["code"],
        -32001
    );
    assert!(
        lab.server
            .handle(&token, &req)
            .unwrap()
            .get("result")
            .is_some()
    );
    assert_eq!(lab.server.sessions().revoke_run("r1"), 1);
    assert_eq!(
        lab.server.handle(&token, &req).unwrap()["error"]["code"],
        -32001
    );
    // Tokens are distinct and long.
    let (a, b) = (lab.token("r2", "s", all()), lab.token("r2", "s", all()));
    assert_ne!(a, b);
    assert_eq!(a.len(), 64);
}

#[test]
fn a_notification_gets_no_answer() {
    let lab = Lab::new();
    let token = lab.token("r1", "s", all());
    let note = json!({"jsonrpc": "2.0", "method": "notifications/initialized"});
    assert!(lab.server.handle(&token, &note).is_none());
}

#[test]
fn initialize_answers_the_version_of_the_client_when_known() {
    let lab = Lab::new();
    let token = lab.token("r1", "s", all());
    let known = lab.rpc(
        &token,
        "initialize",
        json!({"protocolVersion": "2025-03-26"}),
    );
    assert_eq!(known["result"]["protocolVersion"], "2025-03-26");
    assert_eq!(known["result"]["serverInfo"]["name"], "shipyard");
    let odd = lab.rpc(
        &token,
        "initialize",
        json!({"protocolVersion": "1999-01-01"}),
    );
    assert_eq!(odd["result"]["protocolVersion"], "2025-11-25");
}

#[test]
fn the_engine_can_refuse_a_call_and_the_agent_reads_why() {
    let lab = Lab::new();
    let token = lab.token("r1", "build", all());
    *lab.fake.answer.lock().unwrap() = Some(Err("limit: 2 children run, wait for a slot".into()));
    let r = lab.call(
        &token,
        "spawn_subtask",
        json!({"title": "t", "brief": "b", "role": "worker"}),
    );
    assert!(is_error(&r));
    assert_eq!(message(&r), "limit: 2 children run, wait for a slot");
}

#[test]
fn an_answer_that_is_not_an_object_is_wrapped_and_a_huge_answer_is_refused() {
    let limits = Limits {
        max_answer: 100,
        ..Limits::default()
    };
    let lab = Lab::with(limits);
    let token = lab.token("r1", "s", all());
    *lab.fake.answer.lock().unwrap() = Some(Ok(json!("plain")));
    let r = lab.call(&token, "read_ref", json!({"ref": "adr:1"}));
    assert_eq!(r["structuredContent"], json!({"result": "plain"}));
    *lab.fake.answer.lock().unwrap() = Some(Ok(json!({"body": "x".repeat(200)})));
    let big = lab.call(&token, "read_ref", json!({"ref": "adr:1"}));
    assert!(is_error(&big) && message(&big).starts_with("answer: "));
}

#[test]
fn the_size_limits_stop_a_big_call_and_a_big_report() {
    let limits = Limits {
        max_args: 300,
        max_report: 200,
        ..Limits::default()
    };
    let lab = Lab::with(limits);
    let token = lab.token("r1", "s", all());
    let big = lab.call(
        &token,
        "handoff",
        json!({"role": "r", "summary": "x".repeat(400)}),
    );
    assert!(
        message(&big).starts_with("arguments: "),
        "{}",
        message(&big)
    );
    let report = lab.call(
        &token,
        "report",
        json!({"outcome": "done", "summary": "x".repeat(250)}),
    );
    assert!(
        message(&report).starts_with("report: "),
        "{}",
        message(&report)
    );
    assert_eq!(lab.events(), 0);
    let fine = lab.call(
        &token,
        "report",
        json!({"outcome": "done", "summary": "x".repeat(100)}),
    );
    assert!(!is_error(&fine));
}

#[test]
fn the_rate_limit_counts_calls_in_a_minute_for_each_session() {
    let lab = Lab::with(Limits {
        calls_per_minute: 3,
        ..Limits::default()
    });
    let (a, b) = (lab.token("r1", "s", all()), lab.token("r2", "s", all()));
    let progress = |t: &str| lab.call(t, "post_progress", json!({"text": "x"}));
    for _ in 0..3 {
        assert!(!is_error(&progress(&a)));
    }
    let limited = progress(&a);
    assert!(
        is_error(&limited) && message(&limited).starts_with("rate limit"),
        "{limited}"
    );
    assert!(!is_error(&progress(&b)), "another run is not limited");
    lab.clock.store(30_000, Ordering::Relaxed);
    assert!(is_error(&progress(&a)), "the window is still open");
    lab.clock.store(61_000, Ordering::Relaxed);
    assert!(!is_error(&progress(&a)));
    assert_eq!(lab.events(), 5);
}

#[test]
fn a_ref_is_a_resource_and_reading_it_is_a_read_ref_call() {
    let lab = Lab::new();
    let token = lab.token("r1", "s", all());
    let templates = lab.rpc(&token, "resources/templates/list", json!({}));
    assert_eq!(
        templates["result"]["resourceTemplates"][0]["uriTemplate"],
        "shipyard://ref/{ref}"
    );
    *lab.fake.answer.lock().unwrap() =
        Some(Ok(json!({"ref": "spec:auth#REQ-003", "title": "Login"})));
    let read = lab.rpc(
        &token,
        "resources/read",
        json!({"uri": "shipyard://ref/spec%3Aauth%23REQ-003"}),
    );
    let text = read["result"]["contents"][0]["text"].as_str().unwrap();
    assert!(text.contains("Login"));
    match &lab.fake.seen.lock().unwrap()[0].2 {
        AgentEvent::ReadRef(r) => assert_eq!(r.reference, "spec:auth#REQ-003"),
        other => panic!("{other:?}"),
    }
    for uri in [
        "shipyard://other/x",
        "shipyard://ref/%zz",
        "shipyard://ref/%",
    ] {
        let bad = lab.rpc(&token, "resources/read", json!({"uri": uri}));
        assert_eq!(bad["error"]["code"], -32602, "{uri}");
    }
    let off = lab.token("r1", "s2", vec!["report".into()]);
    let refused = lab.rpc(
        &off,
        "resources/read",
        json!({"uri": "shipyard://ref/adr%3A1"}),
    );
    assert_eq!(refused["error"]["code"], -32602);
}

#[cfg(unix)]
mod merged {
    use super::*;
    use shipyard_agents::fake::mcp_server;
    use shipyard_agents::mcp_control::{CustomInput, McpConfig, McpControl, Waits};
    use shipyard_mcp::proxy::Proxy;
    use shipyard_secrets::MemoryStore;
    use std::time::Duration;

    #[test]
    fn the_list_holds_the_agent_tools_and_the_proxied_tools_and_a_call_goes_to_its_owner() {
        let dir = tempfile::tempdir().unwrap();
        mcp_server(dir.path(), "fake-mcp", &dir.path().join("pids"));
        let control = McpControl::new(Arc::new(MemoryStore::default()), McpConfig::default())
            .with_dirs(vec![dir.path().into(), "/usr/bin".into(), "/bin".into()])
            .with_waits(Waits {
                start: Duration::from_secs(5),
                call: Duration::from_secs(5),
            });
        let id = control
            .add_custom(CustomInput {
                name: "Fake".into(),
                command: "fake-mcp".into(),
                ..Default::default()
            })
            .unwrap()
            .id;
        control.set_enabled(&id, true).unwrap();
        let fake = Arc::new(Fake::default());
        let server = Server::new(fake.clone()).with_proxy(Arc::new(Proxy::new(Arc::new(control))));
        let binding = Binding {
            run: "r".into(),
            step: "s".into(),
            tools: all(),
        };
        let token = server.sessions().open(binding).unwrap().0;
        let rpc = |method: &str, params: Value| {
            server
                .handle(
                    &token,
                    &json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}),
                )
                .unwrap()
        };
        let list = rpc("tools/list", json!({}));
        let names: Vec<_> = list["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(names.len(), 9);
        assert_eq!(names[8], "custom-fake__ping");
        let pong = rpc(
            "tools/call",
            json!({"name": "custom-fake__ping", "arguments": {}}),
        );
        assert_eq!(pong["result"]["content"][0]["text"], "pong");
        assert!(
            fake.seen.lock().unwrap().is_empty(),
            "the proxy is not an agent event"
        );
        let none = rpc("tools/call", json!({"name": "ghost__x", "arguments": {}}));
        assert_eq!(none["result"]["isError"], true);
    }
}
