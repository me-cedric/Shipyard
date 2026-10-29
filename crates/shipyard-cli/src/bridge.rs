//! `shipyard --mcp-bridge`: a stdio MCP server for a CLI that cannot call HTTP MCP entries
//! (`add-factory` REQ-037). It reads one JSON-RPC message per line and posts each to the loopback
//! endpoint of the app, then writes the answer as one line. The endpoint and the token come from
//! the environment ([`URL_ENV`], [`TOKEN_ENV`]), never from arguments.
//!
//! When the app does not answer, a request with an id gets a JSON-RPC error, so the agent reads
//! the reason. A notification gets nothing.
//!
//! shortcut: one connection for each message (`Connection: close`), as the server answers.
//! Keep-alive is not worth it for a few calls per minute.

use serde_json::{Value, json};
use std::io::{self, BufRead, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// The flag that selects the bridge.
pub const FLAG: &str = "--mcp-bridge";
pub const URL_ENV: &str = "SHIPYARD_MCP_URL";
pub const TOKEN_ENV: &str = "SHIPYARD_MCP_TOKEN";

const CONNECT_WAIT: Duration = Duration::from_secs(5);
/// A tool call can take time in the app (a question waits for no one, but a read may be slow).
const IO_WAIT: Duration = Duration::from_secs(120);
const MAX_RESPONSE: u64 = 8 * 1024 * 1024;

/// Where to post: `host:port` for the connection and the Host header, and the path.
#[derive(Debug, PartialEq)]
pub struct Endpoint {
    pub host_port: String,
    pub path: String,
}

/// Accept `http://127.0.0.1[:port]/path` and `http://localhost[:port]/path` only: the token must
/// stay on this machine.
pub fn parse_endpoint(url: &str) -> Result<Endpoint, String> {
    let rest = url
        .strip_prefix("http://")
        .ok_or("the MCP URL must start with http://")?;
    let (host_port, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let (host, port) = host_port.split_once(':').unwrap_or((host_port, "80"));
    if !["127.0.0.1", "localhost"].contains(&host) || port.parse::<u16>().is_err() {
        return Err("the MCP URL must be on the loopback address (127.0.0.1 or localhost)".into());
    }
    Ok(Endpoint {
        host_port: format!("{host}:{port}"),
        path: path.to_string(),
    })
}

/// One POST. `Ok(None)` for `202` (a notification). `Err` has a message with no secret.
fn post(ep: &Endpoint, token: &str, body: &str) -> Result<Option<String>, String> {
    let addr = ep
        .host_port
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .next()
        .ok_or("no address")?;
    let mut stream = TcpStream::connect_timeout(&addr, CONNECT_WAIT).map_err(|_| {
        format!(
            "Shipyard is not running (nothing listens on {})",
            ep.host_port
        )
    })?;
    let _ = stream.set_read_timeout(Some(IO_WAIT));
    let _ = stream.set_write_timeout(Some(IO_WAIT));
    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nAccept: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        ep.path,
        ep.host_port,
        body.len()
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("cannot reach Shipyard: {e}"))?;
    let mut raw = Vec::new();
    stream
        .take(MAX_RESPONSE)
        .read_to_end(&mut raw)
        .map_err(|e| format!("Shipyard did not answer: {e}"))?;
    let text = String::from_utf8_lossy(&raw);
    let (head, payload) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
    let status: u16 = head
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .ok_or("Shipyard sent no HTTP status")?;
    match status {
        200 => Ok(Some(payload.trim().to_string())),
        202 => Ok(None),
        401 => Err("Shipyard refused the token: the step has ended".into()),
        s => Err(format!("Shipyard answered HTTP {s}")),
    }
}

/// Forward each line of `input` until it closes. `url` and `token` are the values of the
/// environment; a bad URL is an error before any line is read.
pub fn run_with(
    url: &str,
    token: &str,
    input: impl BufRead,
    mut output: impl Write,
) -> io::Result<()> {
    let ep = parse_endpoint(url).map_err(io::Error::other)?;
    for line in input.lines() {
        let line = line?;
        let line = line.trim();
        let Ok(request) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let answer = match post(&ep, token, line) {
            Ok(Some(body)) if serde_json::from_str::<Value>(&body).is_ok() => body,
            Ok(Some(_)) => error(&request, "Shipyard sent a body that is not JSON"),
            Ok(None) => continue,
            Err(why) => error(&request, &why),
        };
        if answer.is_empty() {
            continue;
        }
        writeln!(output, "{answer}")?;
        output.flush()?;
    }
    Ok(())
}

/// A JSON-RPC error for a request with an id. A notification has no id: answer nothing.
fn error(request: &Value, why: &str) -> String {
    match request.get("id") {
        Some(id) if !id.is_null() => json!({
            "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": why }
        })
        .to_string(),
        _ => String::new(),
    }
}

/// `--mcp-bridge` on the real stdio. Missing variables are a clear error.
pub fn run() -> io::Result<()> {
    let get = |name: &str| {
        std::env::var(name)
            .ok()
            .filter(|v| !v.is_empty())
            .ok_or_else(|| io::Error::other(format!("{name} is not set")))
    };
    run_with(
        &get(URL_ENV)?,
        &get(TOKEN_ENV)?,
        io::stdin().lock(),
        io::stdout().lock(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::sync::mpsc;

    /// A fake endpoint: answers each connection with `reply(request text)` and sends the request
    /// text to the channel.
    fn fake(reply: fn(&str) -> String) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!(
            "http://127.0.0.1:{}/mcp",
            listener.local_addr().unwrap().port()
        );
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for conn in listener.incoming() {
                let mut conn = conn.unwrap();
                let mut buf = vec![0u8; 65536];
                let mut got = 0;
                // Read the head, then the announced body.
                loop {
                    let n = conn.read(&mut buf[got..]).unwrap();
                    got += n;
                    let text = String::from_utf8_lossy(&buf[..got]).into_owned();
                    if let Some((head, body)) = text.split_once("\r\n\r\n") {
                        let len = head
                            .lines()
                            .find_map(|l| l.strip_prefix("Content-Length: "))
                            .and_then(|v| v.parse::<usize>().ok())
                            .unwrap_or(0);
                        if body.len() >= len || n == 0 {
                            break;
                        }
                    } else if n == 0 {
                        break;
                    }
                }
                let text = String::from_utf8_lossy(&buf[..got]).into_owned();
                let answer = reply(&text);
                tx.send(text).unwrap();
                let _ = conn.write_all(answer.as_bytes());
            }
        });
        (url, rx)
    }

    fn http(status: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    fn bridge(url: &str, input: &str) -> String {
        let mut out = Vec::new();
        run_with(url, "tok-123", input.as_bytes(), &mut out).unwrap();
        String::from_utf8(out).unwrap()
    }

    #[test]
    fn forwards_a_line_with_the_bearer_token_and_returns_the_answer() {
        let (url, seen) =
            fake(|_| http("200 OK", r#"{"jsonrpc":"2.0","id":1,"result":{"ok":true}}"#));
        let out = bridge(&url, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\n");
        assert_eq!(
            out,
            "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"ok\":true}}\n"
        );
        let request = seen.recv().unwrap();
        assert!(request.starts_with("POST /mcp HTTP/1.1\r\n"), "{request}");
        assert!(request.contains("Authorization: Bearer tok-123\r\n"));
        assert!(request.contains(&format!("Host: {}\r\n", &url[7..url.len() - 4])));
        assert!(request.ends_with(r#""method":"ping"}"#));
    }

    #[test]
    fn a_notification_gets_no_output() {
        let (url, _seen) = fake(|_| http("202 Accepted", ""));
        let out = bridge(
            &url,
            "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n",
        );
        assert_eq!(out, "");
    }

    #[test]
    fn a_closed_app_is_a_clean_json_rpc_error() {
        let port = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let url = format!("http://127.0.0.1:{port}/mcp");
        let out = bridge(&url, "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"ping\"}\n");
        let v: Value = serde_json::from_str(out.trim()).unwrap();
        assert_eq!(v["id"], 7);
        assert!(
            v["error"]["message"]
                .as_str()
                .unwrap()
                .contains("not running"),
            "{out}"
        );
        assert!(!out.contains("tok-123"));
    }

    #[test]
    fn a_refused_token_is_an_error_without_the_token() {
        let (url, _seen) = fake(|_| http("401 Unauthorized", ""));
        let out = bridge(&url, "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"ping\"}\n");
        assert!(out.contains("refused the token"), "{out}");
        assert!(!out.contains("tok-123"));
    }

    #[test]
    fn a_line_that_is_not_json_is_skipped() {
        let (url, _seen) = fake(|_| http("200 OK", r#"{"id":1,"result":{}}"#));
        let out = bridge(&url, "garbage\n{\"id\":1,\"method\":\"ping\"}\n");
        assert_eq!(out.lines().count(), 1);
    }

    #[test]
    fn only_a_loopback_http_url_is_accepted() {
        assert!(parse_endpoint("http://127.0.0.1:8080/mcp").is_ok());
        assert_eq!(
            parse_endpoint("http://localhost:9/x").unwrap(),
            Endpoint {
                host_port: "localhost:9".into(),
                path: "/x".into()
            }
        );
        for bad in [
            "https://127.0.0.1:1/mcp",
            "http://example.com:1/mcp",
            "http://127.0.0.1.evil.com:1/mcp",
            "http://127.0.0.1@evil.com:1/mcp",
            "http://0.0.0.0:1/mcp",
            "http://127.0.0.1:x/mcp",
            "ftp://127.0.0.1/",
        ] {
            assert!(parse_endpoint(bad).is_err(), "{bad}");
        }
        let mut out = Vec::new();
        assert!(run_with("http://example.com/mcp", "t", &b""[..], &mut out).is_err());
    }
}
