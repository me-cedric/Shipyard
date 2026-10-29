//! Fake programs for tests of this crate and of `shipyard-mcp`: small `sh` scripts in a folder
//! that the test owns. No network.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

/// Write an executable `sh` script called `name` into `dir`.
pub fn program(dir: &Path, name: &str, body: &str) -> PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).expect("write the fake program");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
        .expect("make the fake program executable");
    path
}

/// A fake stdio MCP server. Each start appends its process id to `pid_file`.
///
/// It answers `initialize`, `tools/list` (one tool, `ping`) and `tools/call` (`pong`). Method
/// `env` returns the variables `FAKE_TOKEN` and `FAKE_AUTH`. Method `crash` makes it exit without
/// an answer. Method `hang` makes it stay silent for a minute, after it writes the id of the request
/// to `<pid file>.hang`: a test that waits for that file knows that the request is in flight.
pub fn mcp_server(dir: &Path, name: &str, pid_file: &Path) -> PathBuf {
    let body = format!(
        r#"echo $$ >> '{pid}'
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p')
  method=$(printf '%s' "$line" | sed -n 's/.*"method":"\([^"]*\)".*/\1/p')
  [ -z "$id" ] && continue
  case "$method" in
    initialize) printf '{{"jsonrpc":"2.0","id":%s,"result":{{"protocolVersion":"2024-11-05","serverInfo":{{"name":"fake"}}}}}}\n' "$id" ;;
    tools/list) printf '{{"jsonrpc":"2.0","id":%s,"result":{{"tools":[{{"name":"ping"}}]}}}}\n' "$id" ;;
    tools/call) printf '{{"jsonrpc":"2.0","id":%s,"result":{{"content":[{{"type":"text","text":"pong"}}]}}}}\n' "$id" ;;
    env) printf '{{"jsonrpc":"2.0","id":%s,"result":{{"token":"%s","auth":"%s"}}}}\n' "$id" "$FAKE_TOKEN" "$FAKE_AUTH" ;;
    crash) exit 0 ;;
    hang) echo "$id" >> '{pid}.hang'; sleep 60 ;;
  esac
done"#,
        pid = pid_file.display()
    );
    program(dir, name, &body)
}
