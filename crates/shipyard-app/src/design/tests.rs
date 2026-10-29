//! Design commands over a temp repository and a fake HTTP client (spec `design`). No test uses
//! the network or opens an application.

use shipyard_core::flows::Action;

use super::*;
use crate::work::tests::{Fx, fx};

fn put_file(f: &Fx, rel: &str, text: &str) {
    let p = f.repo.path().join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, text).unwrap();
}

fn file(f: &Fx, rel: &str) -> String {
    std::fs::read_to_string(f.repo.path().join(rel)).unwrap_or_default()
}

const CONTRACT: &str = "openapi: 3.0.0\ninfo:\n  title: Pets\n  version: '1'\nservers:\n  - url: https://api.example.com/v1/\n  - url: https://{env}.example.com\n    variables:\n      env:\n        default: staging\n  - url: /relative\n";

fn req(method: &str, server: &str, route: &str) -> TryRequest {
    TryRequest {
        path: "docs/api/pets.yaml".into(),
        server: server.into(),
        method: method.into(),
        route: route.into(),
        body: None,
    }
}

#[test]
fn the_list_gives_artifacts_adrs_screens_and_the_design_doc_path() {
    let f = fx();
    put_file(&f, "docs/diagrams/ctx.mmd", "graph TD\n");
    put_file(
        &f,
        "docs/decisions/0001-x.md",
        "---\nstatus: accepted\n---\n# X\n",
    );
    put_file(
        &f,
        "docs/designs/screens.json",
        r#"{"screens":[{"slug":"home","title":"Home"}]}"#,
    );
    let l = list(&f.s).unwrap();
    assert_eq!(
        l.artifacts
            .iter()
            .map(|a| a.reference.as_str())
            .collect::<Vec<_>>(),
        ["diagram:ctx", "screen:home"]
    );
    assert_eq!(l.adrs[0].number, "0001");
    assert_eq!((l.screens.len(), l.screens_error), (1, None));
    assert_eq!(l.doc, "docs/designs/design.md");

    put_file(&f, "docs/designs/screens.json", "{ not json");
    let l = list(&f.s).unwrap();
    assert!(l.screens.is_empty() && l.screens_error.is_some());
}

#[test]
fn a_read_refuses_a_path_outside_the_design_folders_a_file_that_is_not_utf8_or_too_big() {
    let f = fx();
    put_file(&f, "docs/diagrams/ok.mmd", "graph TD\n");
    assert_eq!(
        read(&f.s, "docs/diagrams/ok.mmd").unwrap().text,
        "graph TD\n"
    );
    for bad in [
        "../x",
        "/etc/passwd",
        "README.md",
        "docs/diagrams/../../README.md",
    ] {
        assert!(read(&f.s, bad).is_err(), "{bad}");
    }
    let p = f.repo.path().join("docs/diagrams/bin.mmd");
    std::fs::write(&p, [0xff, 0xfe, 0x00]).unwrap();
    assert!(
        read(&f.s, "docs/diagrams/bin.mmd")
            .unwrap_err()
            .contains("UTF-8")
    );
    assert_eq!(std::fs::read(&p).unwrap(), [0xff, 0xfe, 0x00], "unchanged");
    let big = f.repo.path().join("docs/diagrams/big.mmd");
    std::fs::write(&big, vec![b'a'; MAX_BYTES as usize + 1]).unwrap();
    assert!(read(&f.s, "docs/diagrams/big.mmd").is_err());
}

#[test]
fn a_write_warns_when_the_file_changed_and_a_create_refuses_an_existing_file() {
    let f = fx();
    let made = write(&f.s, "docs/diagrams/a.mmd", "one", None, true).unwrap();
    assert!(!made.conflict);
    assert!(write(&f.s, "docs/diagrams/a.mmd", "two", None, true).is_err());
    assert_eq!(file(&f, "docs/diagrams/a.mmd"), "one");

    let stamp = read(&f.s, "docs/diagrams/a.mmd").unwrap().stamp;
    put_file(&f, "docs/diagrams/a.mmd", "changed outside");
    let c = write(&f.s, "docs/diagrams/a.mmd", "mine", Some(&stamp), false).unwrap();
    assert!(c.conflict);
    assert_eq!(file(&f, "docs/diagrams/a.mmd"), "changed outside");
    // The person keeps their version: no stamp, the write replaces.
    assert!(
        !write(&f.s, "docs/diagrams/a.mmd", "mine", None, false)
            .unwrap()
            .conflict
    );
    assert_eq!(file(&f, "docs/diagrams/a.mmd"), "mine");
}

#[test]
fn a_new_adr_takes_the_next_number_and_a_decision_needs_a_comment_and_a_fresh_stamp() {
    let f = fx();
    put_file(
        &f,
        "docs/decisions/0004-old.md",
        "---\nstatus: accepted\n---\n# Old\n",
    );
    let a = adr_create(&f.s, " Use SQLite ").unwrap();
    assert_eq!((a.number.as_str(), a.status.as_str()), ("0005", "proposed"));
    assert!(adr_create(&f.s, "two\nlines").is_err());
    assert!(file(&f, &a.path).contains("status: proposed"));

    let stamp = read(&f.s, &a.path).unwrap().stamp;
    assert!(adr_decide(&f.s, &a.path, Decision::Accept, " ", &stamp).is_err());
    assert!(adr_decide(&f.s, "docs/diagrams/x.mmd", Decision::Accept, "ok", &stamp).is_err());
    let ok = adr_decide(&f.s, &a.path, Decision::Accept, "fits", &stamp).unwrap();
    assert!(!ok.conflict);
    let text = file(&f, &a.path);
    assert!(
        text.contains("status: accepted") && text.contains("comment: \"fits\""),
        "{text}"
    );

    // A stale stamp writes nothing.
    let again = adr_decide(&f.s, &a.path, Decision::Reject, "no", &stamp);
    assert!(again.is_err() || again.unwrap().conflict);
    assert!(file(&f, &a.path).contains("status: accepted"));
}

#[test]
fn the_flow_table_saves_only_rows_that_pass_the_check() {
    let f = fx();
    let row = |id, source: &str| FlowRow {
        id,
        source: source.into(),
        destination: "db".into(),
        network: "vlan10".into(),
        protocol: "tcp".into(),
        port: Some("5432".into()),
        action: Action::Allow,
        note: None,
    };
    assert!(
        flows_save(
            &f.s,
            "docs/flows/edge.yaml",
            &[row(1, "web"), row(2, "")],
            None
        )
        .is_err()
    );
    assert!(!f.repo.path().join("docs/flows/edge.yaml").exists());
    let w = flows_save(&f.s, "docs/flows/edge.yaml", &[row(1, "web")], None).unwrap();
    assert!(!w.conflict && file(&f, "docs/flows/edge.yaml").contains("source: web"));
    assert!(flows_save(&f.s, "docs/diagrams/edge.yaml", &[row(1, "web")], None).is_err());
}

#[test]
fn a_try_request_goes_only_to_a_listed_server_and_a_write_method_needs_the_click() {
    let f = fx();
    put_file(&f, "docs/api/pets.yaml", CONTRACT);
    f.http
        .get("https://api.example.com/v1/pets", 200, r#"{"pets":[]}"#)
        .get("https://staging.example.com/health", 503, "down")
        .post("/pets", "", 201, "made");
    let ok = try_request(
        &f.s,
        &req("get", "https://api.example.com/v1/", "/pets?limit=2"),
        false,
    )
    .unwrap();
    assert_eq!(
        (ok.status, ok.body.as_str(), ok.truncated),
        (200, r#"{"pets":[]}"#, false)
    );
    // The variable has its default. A non-2xx answer is a response, not an error.
    let down = try_request(
        &f.s,
        &req("GET", "https://{env}.example.com", "/health"),
        false,
    )
    .unwrap();
    assert_eq!(down.status, 503);
    let sent = f.http.requests();
    assert!(
        sent.iter()
            .all(|r| matches!(r.auth, Auth::None) && r.headers.is_empty())
    );
    assert_eq!(sent[0].url, "https://api.example.com/v1/pets?limit=2");

    let before = f.http.requests().len();
    for (r, why) in [
        (
            req("GET", "https://evil.example.com", "/pets"),
            "unlisted server",
        ),
        (req("GET", "/relative", "/pets"), "relative server"),
        (
            req("GET", "https://api.example.com/v1/", "//evil.com"),
            "route with two slashes",
        ),
        (
            req("GET", "https://api.example.com/v1/", "pets"),
            "route without slash",
        ),
        (
            req("TRACE", "https://api.example.com/v1/", "/pets"),
            "method",
        ),
    ] {
        assert!(try_request(&f.s, &r, true).is_err(), "{why}");
    }
    assert!(
        try_request(
            &f.s,
            &req("POST", "https://api.example.com/v1/", "/pets"),
            false
        )
        .is_err()
    );
    assert_eq!(f.http.requests().len(), before, "nothing left the machine");
    let mut post = req("POST", "https://api.example.com/v1/", "/pets");
    post.body = Some(r#"{"name":"rex"}"#.into());
    assert_eq!(try_request(&f.s, &post, true).unwrap().status, 201);
    post.body = Some("not json".into());
    assert!(try_request(&f.s, &post, true).is_err());
}

#[test]
fn a_big_body_is_cut_and_a_network_failure_is_an_error_without_the_address() {
    let f = fx();
    put_file(&f, "docs/api/pets.yaml", CONTRACT);
    f.http.get("/big", 200, &"x".repeat(TRY_BODY_MAX + 10));
    let r = try_request(
        &f.s,
        &req("GET", "https://api.example.com/v1/", "/big"),
        false,
    )
    .unwrap();
    assert_eq!((r.body.len(), r.truncated), (TRY_BODY_MAX, true));
    let e = try_request(
        &f.s,
        &req("GET", "https://api.example.com/v1/", "/gone?token=abc"),
        false,
    )
    .unwrap_err();
    assert_eq!(e, "the server did not answer");
}

#[test]
fn the_open_action_takes_an_https_address_or_a_fig_file_of_the_project() {
    let f = fx();
    put_file(&f, "design/home.fig", "x");
    put_file(&f, "design/home.png", "x");
    let root = f.repo.path();
    assert!(outside_target(root, "https://www.figma.com/file/abc?node-id=1&t=2").is_ok());
    assert!(outside_target(root, "https://x.com/a b").is_err());
    assert!(outside_target(root, "http://x.com").is_err());
    assert!(outside_target(root, "file:///etc/passwd").is_err());
    assert!(
        outside_target(root, "design/home.fig")
            .unwrap()
            .ends_with("design/home.fig")
    );
    for bad in [
        "design/home.png",
        "../home.fig",
        "/design/home.fig",
        "design/none.fig",
    ] {
        assert!(outside_target(root, bad).is_err(), "{bad}");
    }
}
