//! The skills of the project are MCP prompts, its files are MCP resources, and both follow the read switch
//! and the allow list. The allow list also filters the tools.

use serde_json::{Value, json};
use shipyard_mcp::outside::{NAMES, Outside, READ_ONLY, Switches, enabled};
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

fn server(root: &std::path::Path, state: Arc<Mutex<(bool, Vec<String>)>>) -> Server {
    let root = root.to_path_buf();
    let s = Server::new(Arc::new(NoRun)).with_outside(move || {
        let (reads, only) = state.lock().unwrap().clone();
        Some(Outside {
            root: root.clone(),
            switches: Switches {
                reads,
                ..Default::default()
            },
            only,
            read_only: false,
            tickets: None,
        })
    });
    let tools = NAMES.iter().map(|n| n.to_string()).collect();
    s.sessions()
        .open_known(
            TOKEN,
            Binding {
                run: "outside".into(),
                step: "outside".into(),
                tools,
            },
        )
        .unwrap();
    s
}

fn ask(s: &Server, method: &str, params: Value) -> Value {
    s.handle(
        TOKEN,
        &json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }),
    )
    .unwrap()
}

#[test]
fn skills_are_prompts_and_files_are_resources_while_the_read_switch_is_on() {
    let d = tempfile::tempdir().unwrap();
    let r = d.path();
    std::fs::create_dir_all(r.join(".claude/skills/adr")).unwrap();
    std::fs::write(
        r.join(".claude/skills/adr/SKILL.md"),
        "---\nname: adr\ndescription: \"Write an ADR\"\n---\n# ADR\nSteps.\n",
    )
    .unwrap();
    std::fs::create_dir_all(r.join("docs")).unwrap();
    std::fs::write(r.join("docs/a b.md"), "hello").unwrap();
    std::fs::write(r.join("deploy.key"), "k").unwrap();
    let state = Arc::new(Mutex::new((true, Vec::new())));
    let s = server(r, state.clone());

    let init = ask(&s, "initialize", json!({}));
    assert!(init["result"]["capabilities"]["prompts"].is_object());
    let list = ask(&s, "prompts/list", json!({}));
    assert_eq!(
        list["result"]["prompts"],
        json!([{ "name": "adr", "description": "Write an ADR" }])
    );
    let got = ask(&s, "prompts/get", json!({ "name": "adr" }));
    let text = got["result"]["messages"][0]["content"]["text"]
        .as_str()
        .unwrap();
    assert!(text.contains("# ADR") && !text.contains("description:"));
    // A name with a path is not a skill.
    for bad in ["../adr", "a/b", "missing"] {
        assert!(ask(&s, "prompts/get", json!({ "name": bad }))["error"].is_object());
    }

    let res = ask(&s, "resources/list", json!({}));
    let uris: Vec<&str> = res["result"]["resources"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| x["uri"].as_str().unwrap())
        .collect();
    assert_eq!(uris, ["shipyard://file/docs%2Fa%20b.md"]);
    let read = ask(&s, "resources/read", json!({ "uri": uris[0] }));
    assert_eq!(read["result"]["contents"][0]["text"], "hello");
    // A secret file and a path out of the project are refused.
    for uri in ["shipyard://file/deploy.key", "shipyard://file/..%2Fx"] {
        assert!(ask(&s, "resources/read", json!({ "uri": uri }))["error"].is_object());
    }

    // The switch acts at once.
    state.lock().unwrap().0 = false;
    assert_eq!(
        ask(&s, "prompts/list", json!({}))["result"]["prompts"],
        json!([])
    );
    assert_eq!(
        ask(&s, "resources/list", json!({}))["result"]["resources"],
        json!([])
    );
    assert!(ask(&s, "prompts/get", json!({ "name": "adr" }))["error"].is_object());
    assert!(ask(&s, "resources/read", json!({ "uri": uris[0] }))["error"].is_object());
}

#[test]
fn the_allow_list_filters_the_tools_and_the_read_only_preset_has_no_write_tool() {
    let all = Switches {
        reads: true,
        writes: true,
        git: true,
        forge: true,
        exec: true,
        delivery: true,
        tickets: true,
        adrs: true,
        qa: true,
    };
    let on = |only: Vec<String>| {
        enabled(&Outside {
            root: ".".into(),
            switches: all,
            only,
            read_only: false,
            tickets: None,
        })
    };
    assert_eq!(on(Vec::new()).len(), NAMES.len());
    assert_eq!(on(vec!["git_log".into(), "nope".into()]), ["git_log"]);
    let preset = on(READ_ONLY.iter().map(|n| n.to_string()).collect());
    assert_eq!(preset.len(), READ_ONLY.len());
    for write in [
        "project_write_file",
        "run_check",
        "ticket_comment",
        "adr_propose",
        "qa_run_check",
    ] {
        assert!(!preset.contains(&write), "{write}");
    }
}
