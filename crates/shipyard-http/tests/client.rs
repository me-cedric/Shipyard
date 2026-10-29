//! The client controls, tested against a local socket. No outside network.

use shipyard_http::{
    Auth, Client, Error, Http, MAX_BODY_BYTES, Method, Request, TestOutcome, base_url, build_url,
    bypasses_proxy,
};
use shipyard_secrets::Secret;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

/// Serve one canned answer; send back the raw request text.
fn serve(answer: Vec<u8>) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf).unwrap();
        let _ = tx.send(String::from_utf8_lossy(&buf[..n]).to_string());
        let _ = stream.write_all(&answer);
    });
    (url, rx)
}

fn http(status: &str, headers: &str, body: &[u8]) -> Vec<u8> {
    let mut out = format!(
        "HTTP/1.1 {status}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    out.extend_from_slice(body);
    out
}

#[test]
fn sends_the_credential_in_the_header_and_reads_the_body() {
    let (url, rx) = serve(http(
        "200 OK",
        "Content-Type: application/json\r\n",
        br#"{"a":1}"#,
    ));
    let req = Request::get(
        format!("{url}/x"),
        Auth::Header("PRIVATE-TOKEN", Secret::new("tok-1")),
    );
    let value = Client.json(&req).unwrap();
    assert_eq!(value["a"], 1);
    let raw = rx.recv().unwrap().to_ascii_lowercase();
    assert!(raw.starts_with("get /x "), "{raw}");
    assert!(raw.contains("private-token: tok-1"));
    assert!(
        !format!("{req:?}").contains("tok-1"),
        "Debug leaked the token"
    );
}

#[test]
fn does_not_follow_a_redirect() {
    let (url, _rx) = serve(http(
        "302 Found",
        "Location: http://127.0.0.1:1/other\r\n",
        b"",
    ));
    let res = Client
        .send(&Request::get(
            format!("{url}/x"),
            Auth::Bearer(Secret::new("tok")),
        ))
        .unwrap();
    assert_eq!(res.status, 302);
}

#[test]
fn returns_a_4xx_as_an_answer_and_names_the_scope() {
    let (url, _rx) = serve(http(
        "403 Forbidden",
        "X-Accepted-OAuth-Scopes: repo\r\n",
        b"nope",
    ));
    let res = Client
        .send(&Request::get(format!("{url}/x"), Auth::None))
        .unwrap();
    assert_eq!(res.status, 403);
    let err = res.ok().unwrap_err();
    assert_eq!(
        TestOutcome::from_error(&err, "other"),
        TestOutcome::MissingScope {
            scope: "repo".into()
        }
    );
}

#[test]
fn caps_the_body() {
    let (url, _rx) = serve(http("200 OK", "", &vec![b'a'; MAX_BODY_BYTES + 1]));
    let err = Client
        .send(&Request::get(format!("{url}/x"), Auth::None))
        .unwrap_err();
    assert!(matches!(err, Error::TooLarge), "{err:?}");
}

#[test]
fn scrubs_the_token_from_an_error_body() {
    let (url, _rx) = serve(http("400 Bad Request", "", b"bad token tok-secret-9 here"));
    let req = Request::get(
        format!("{url}/x"),
        Auth::Bearer(Secret::new("tok-secret-9")),
    );
    let err = Client.send(&req).unwrap().ok().unwrap_err();
    assert!(!err.to_string().contains("tok-secret-9"), "{err}");
}

#[test]
fn refuses_a_credential_over_plain_http_to_another_host() {
    let req = Request::get(
        "http://jira.example.invalid/x",
        Auth::Bearer(Secret::new("tok")),
    );
    assert!(matches!(Client.send(&req), Err(Error::Insecure(_))));
}

#[test]
fn proxy_exemption_follows_no_proxy() {
    assert!(bypasses_proxy("git.corp.example", ".corp.example"));
    assert!(bypasses_proxy("corp.example", "corp.example:8080"));
    assert!(bypasses_proxy("anything.io", "*"));
    assert!(!bypasses_proxy("api.github.com", "corp.example, localhost"));
}

#[test]
fn urls_are_validated_and_encoded() {
    assert_eq!(
        base_url("https://acme.atlassian.net/").unwrap(),
        "https://acme.atlassian.net"
    );
    assert!(base_url("http://acme.example").is_err());
    assert!(base_url("https://user:pw@acme.example").is_err());
    assert!(base_url("https://acme.example/?token=x").is_err());
    assert_eq!(
        build_url("https://h", "/s", &[("q", "a b&c"), ("n", "1")]),
        "https://h/s?q=a%20b%26c&n=1"
    );
}

/// Accept one call, wait `delay`, then answer `{"a":1}`.
fn slow(delay: Duration) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 4096];
        let _ = stream.read(&mut buf);
        thread::sleep(delay);
        let _ = stream.write_all(&http("200 OK", "", br#"{"a":1}"#));
    });
    url
}

#[test]
fn a_per_request_read_timeout_cuts_a_slow_answer_or_lets_it_finish() {
    let short = Request::get(
        format!("{}/x", slow(Duration::from_millis(1500))),
        Auth::None,
    )
    .timeout(Duration::from_millis(200));
    assert!(matches!(Client.send(&short), Err(Error::Transport(_))));

    let long = Request::get(
        format!("{}/x", slow(Duration::from_millis(500))),
        Auth::None,
    )
    .timeout(Duration::from_secs(5));
    assert_eq!(Client.json(&long).unwrap()["a"], 1);

    // The default stays 30 s.
    assert!(
        Request::get("http://localhost/", Auth::None)
            .timeout
            .is_none()
    );
    assert_eq!(shipyard_http::DEFAULT_READ_TIMEOUT, Duration::from_secs(30));
}

#[test]
fn a_write_keeps_its_own_content_type_and_a_delete_sends_no_body() {
    let (url, rx) = serve(http("200 OK", "", b"{}"));
    let patch = Request::write(
        Method::Patch,
        format!("{url}/x"),
        Auth::None,
        serde_json::json!([{ "op": "add", "path": "/fields/System.State", "value": "Done" }]),
    )
    .header("Content-Type", "application/json-patch+json");
    Client.send(&patch).unwrap();
    let raw = rx.recv().unwrap().to_ascii_lowercase();
    assert!(raw.starts_with("patch /x "), "{raw}");
    assert!(
        raw.contains("content-type: application/json-patch+json"),
        "{raw}"
    );
    assert!(!raw.contains("content-type: application/json\r"), "{raw}");

    let (url, rx) = serve(http("204 No Content", "", b""));
    let res = Client
        .send(&Request::delete(format!("{url}/x/1"), Auth::None))
        .unwrap();
    assert_eq!(res.status, 204);
    let raw = rx.recv().unwrap().to_ascii_lowercase();
    assert!(raw.starts_with("delete /x/1 "), "{raw}");
}
