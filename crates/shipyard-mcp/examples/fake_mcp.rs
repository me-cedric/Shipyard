//! A fake stdio MCP server for the relay tests that run on each system (Windows has no `sh`).
//! Argument 1 is a file: each start appends one line to it, so a test counts the starts.
//! It answers `initialize`, `tools/list` (one tool, `ping`) and `tools/call` (`pong`).

use serde_json::{Value, json};
use std::io::{BufRead, Write};

fn main() {
    // nosemgrep: rust.lang.security.args.args - a test program reads the path of its own file
    let starts = std::env::args().nth(1).expect("the file of the starts");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(starts)
        .expect("open the file of the starts");
    writeln!(file, "{}", std::process::id()).expect("write the start");
    drop(file);
    let mut out = std::io::stdout();
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let Ok(request) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        // A notification has no id and gets no answer.
        let Some(id) = request.get("id").cloned() else {
            continue;
        };
        let result = match request["method"].as_str() {
            Some("initialize") => {
                json!({"protocolVersion": "2024-11-05", "serverInfo": {"name": "fake"}})
            }
            Some("tools/list") => json!({"tools": [{"name": "ping"}]}),
            Some("tools/call") => json!({"content": [{"type": "text", "text": "pong"}]}),
            _ => continue,
        };
        let answer = json!({"jsonrpc": "2.0", "id": id, "result": result});
        if writeln!(out, "{answer}")
            .and_then(|()| out.flush())
            .is_err()
        {
            break;
        }
    }
}
