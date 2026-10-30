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
            read_only: false,
        })
    });
    let binding = Binding {
        run: "outside".into(),
        step: "outside".into(),
        tools: NAMES.iter().map(|n| n.to_string()).collect(),
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
                    tools: vec![]
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
        ["project_list_files", "project_read_file"]
    );
    let ok = ask(
        &server,
        "tools/call",
        json!({ "name": "project_read_file", "arguments": { "path": "a.txt" } }),
    );
    assert_eq!(ok["result"]["content"][0]["text"], "hi");
}
