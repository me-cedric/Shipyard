//! An outside agent calls the project tools through the server, with a token that survives a restart.

use serde_json::{Value, json};
use shipyard_mcp::outside::{NAMES, Outside, Switches};
use shipyard_mcp::server::Server;
use shipyard_mcp::session::Binding;
use shipyard_mcp::tools::agent::{AgentEvent, AgentEvents};
use std::sync::{Arc, Mutex};

struct NoRun;
impl AgentEvents for NoRun {
    fn emit(&self, _: &Binding, _: AgentEvent) -> Result<Value, String> {
        Err("no run".into())
    }
}

const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn ask(server: &Server, method: &str, params: Value) -> Value {
    server
        .handle(
            TOKEN,
            &json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }),
        )
        .unwrap()
}

#[test]
fn the_switches_decide_which_tools_list_and_run_and_a_change_acts_at_once() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.txt"), "hi").unwrap();
    let switches = Arc::new(Mutex::new(Switches::default()));
    let (root, seen) = (dir.path().to_path_buf(), switches.clone());
    let server = Server::new(Arc::new(NoRun)).with_outside(move || {
        Some(Outside {
            root: root.clone(),
            switches: *seen.lock().unwrap(),
            only: Vec::new(),
            rights: None,
            tickets: None,
            refs: None,
            hidden: Vec::new(),
        })
    });
    let binding = Binding {
        run: "outside".into(),
        step: "outside".into(),
        tools: NAMES.iter().map(|n| n.to_string()).collect(),
        attempt: String::new(),
    };
    server.sessions().open_known(TOKEN, binding).unwrap();
    assert!(
        server
            .sessions()
            .open_known(
                "short",
                Binding {
                    run: "x".into(),
                    step: "x".into(),
                    tools: vec![],
                    attempt: String::new(),
                }
            )
            .is_err()
    );

    let names = |v: &Value| -> Vec<String> {
        v["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect()
    };
    assert!(names(&ask(&server, "tools/list", json!({}))).is_empty());
    let off = ask(
        &server,
        "tools/call",
        json!({ "name": "project_read_file", "arguments": { "path": "a.txt" } }),
    );
    assert_eq!(off["result"]["isError"], true);

    switches.lock().unwrap().reads = true;
    assert_eq!(
        names(&ask(&server, "tools/list", json!({}))),
        ["project_list_files", "project_read_file", "ref_read"]
    );
    let ok = ask(
        &server,
        "tools/call",
        json!({ "name": "project_read_file", "arguments": { "path": "a.txt" } }),
    );
    assert_eq!(ok["result"]["content"][0]["text"], "hi");
}

#[test]
fn an_outside_token_gets_the_project_instructions_and_no_ref_template_without_read_ref() {
    let server = Server::new(Arc::new(NoRun)).with_outside(|| None);
    let binding = Binding {
        run: "outside".into(),
        step: "outside".into(),
        tools: vec!["project_read_file".into()],
        attempt: String::new(),
    };
    server.sessions().open_known(TOKEN, binding).unwrap();
    let init = ask(&server, "initialize", json!({}));
    assert!(
        init["result"]["instructions"]
            .as_str()
            .unwrap()
            .starts_with("Shipyard project tools")
    );
    let list = ask(&server, "resources/templates/list", json!({}));
    assert!(!list.to_string().contains("shipyard://ref/"));
}

#[test]
fn ref_read_and_the_ref_resource_give_one_answer_and_refuse_a_hidden_area() {
    use shipyard_core::rights::Area;
    use shipyard_mcp::outside::RefPort;
    use shipyard_store::ref_index::{Entity, RefIndex};
    let dir = tempfile::tempdir().unwrap();
    let mut index = RefIndex::open_memory().unwrap();
    let adr = Entity::new("adr:0011", "Use SQLite", Some("accepted"), None);
    index.set_source("file:a", "1", &[adr], &[]).unwrap();
    let index = Arc::new(Mutex::new(index));
    let hidden = Arc::new(Mutex::new(Vec::new()));
    let (root, seen) = (dir.path().to_path_buf(), hidden.clone());
    let server = Server::new(Arc::new(NoRun)).with_outside(move || {
        let index = index.clone();
        Some(Outside {
            root: root.clone(),
            switches: Switches {
                reads: true,
                ..Switches::default()
            },
            only: Vec::new(),
            rights: None,
            tickets: None,
            refs: Some(RefPort(Arc::new(move |text| {
                shipyard_mcp::tools::read_ref::read_ref(&index.lock().unwrap(), text)
            }))),
            hidden: seen.lock().unwrap().clone(),
        })
    });
    let binding = Binding {
        run: "outside".into(),
        step: "outside".into(),
        tools: NAMES.iter().map(|n| n.to_string()).collect(),
        attempt: String::new(),
    };
    server.sessions().open_known(TOKEN, binding).unwrap();
    let list = ask(&server, "resources/templates/list", json!({}));
    assert!(list.to_string().contains("shipyard://ref/"));
    let call = || {
        ask(
            &server,
            "tools/call",
            json!({ "name": "ref_read", "arguments": { "ref": "adr:0011" } }),
        )
    };
    let tool = call();
    let text = tool["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("Use SQLite"), "{tool}");
    let read = ask(
        &server,
        "resources/read",
        json!({ "uri": "shipyard://ref/adr%3A0011" }),
    );
    assert_eq!(read["result"]["contents"][0]["text"], text);
    *hidden.lock().unwrap() = vec![Area::Design];
    let refused = call();
    assert_eq!(refused["result"]["isError"], true);
    assert!(refused.to_string().contains("the area design is hidden"));
}

#[test]
fn the_ref_resource_of_an_outside_agent_gives_the_next_step() {
    let dir = tempfile::tempdir().unwrap();
    let open = Arc::new(Mutex::new(false));
    let (root, seen) = (dir.path().to_path_buf(), open.clone());
    let server = Server::new(Arc::new(NoRun)).with_outside(move || {
        seen.lock().unwrap().then(|| Outside {
            root: root.clone(),
            switches: Switches::default(),
            only: Vec::new(),
            rights: None,
            tickets: None,
            refs: None,
            hidden: Vec::new(),
        })
    });
    let binding = Binding {
        run: "outside".into(),
        step: "outside".into(),
        tools: NAMES.iter().map(|n| n.to_string()).collect(),
        attempt: String::new(),
    };
    server.sessions().open_known(TOKEN, binding).unwrap();
    let read = || {
        ask(
            &server,
            "resources/read",
            json!({ "uri": "shipyard://ref/adr%3A0011" }),
        )
        .to_string()
    };
    assert!(read().contains("No project is open. Open a project in Shipyard and call again."));
    *open.lock().unwrap() = true;
    assert!(read().contains(
        "ref_read is off. A person turns on Read files in Setup / This computer / Share."
    ));
}
