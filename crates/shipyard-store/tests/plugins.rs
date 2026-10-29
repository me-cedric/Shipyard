//! Plugin import, bad paths, review and MCP servers (spec `extensions`, REQ-011 to REQ-014).

use std::fs;
use std::io::Write;

use shipyard_store::plugins::{Change, apply, read, review};
use zip::write::SimpleFileOptions;

/// A `.zip` of `(name, bytes)`.
fn zip(entries: &[(&str, &str)]) -> Vec<u8> {
    let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let o = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (n, b) in entries {
        w.start_file(*n, o).unwrap();
        w.write_all(b.as_bytes()).unwrap();
    }
    w.finish().unwrap().into_inner()
}

fn manifest(version: &str, extra: &str) -> String {
    format!(
        r#"{{"name":"demo","version":"{version}","files":[{{"source":"files/a.md","target":"docs/a.md"}},{{"source":"files/b.md","target":"docs/b.md"}},{{"source":"files/c.md","target":"c.md"}}],"settings":{{"team":"core"}}{extra}}}"#
    )
}

fn good(version: &str, extra: &str, a: &str) -> Vec<u8> {
    zip(&[
        ("manifest.json", &manifest(version, extra)),
        ("files/a.md", a),
        ("files/b.md", "b"),
        ("files/c.md", "c"),
    ])
}

#[test]
fn a_valid_archive_reads_as_data_and_writes_nothing() {
    let d = tempfile::tempdir().unwrap();
    let p = read(&good("1.0.0", "", "a")).unwrap();
    let r = review(d.path(), &p);
    assert_eq!(r.items.len(), 4);
    assert!(r.items.iter().all(|i| i.change == Change::New));
    assert_eq!(fs::read_dir(d.path()).unwrap().count(), 0);
}

#[test]
fn a_bad_archive_is_refused() {
    assert!(read(b"not a zip").is_err());
    let no_manifest = zip(&[("files/a.md", "a")]);
    assert!(
        read(&no_manifest)
            .unwrap_err()
            .to_string()
            .contains("manifest")
    );
    let no_payload = zip(&[("manifest.json", &manifest("1", ""))]);
    assert!(
        read(&no_payload)
            .unwrap_err()
            .to_string()
            .contains("payload")
    );
    let missing = zip(&[("manifest.json", &manifest("1", "")), ("files/a.md", "a")]);
    assert!(
        read(&missing)
            .unwrap_err()
            .to_string()
            .contains("files/b.md")
    );
}

#[test]
fn a_path_outside_the_project_is_refused_and_named() {
    let m = r#"{"name":"x","version":"1","files":[{"source":"files/a","target":"../out"}]}"#;
    let e = read(&zip(&[("manifest.json", m), ("files/a", "a")]))
        .err()
        .unwrap();
    assert!(e.to_string().contains("../out"), "{e}");
    let e = read(&zip(&[("manifest.json", m), ("files/../../a", "a")]))
        .err()
        .unwrap();
    assert!(e.to_string().contains("../"), "{e}");
}

#[test]
fn declining_one_file_writes_the_others_and_cancel_writes_none() {
    let d = tempfile::tempdir().unwrap();
    let p = read(&good("1.0.0", "", "a")).unwrap();
    let ids: Vec<String> = ["file:docs/a.md", "file:c.md", "setting:team"]
        .map(String::from)
        .into();
    let a = apply(d.path(), &p, &ids).unwrap();
    assert_eq!(a.report.written, ["docs/a.md", "c.md"]);
    assert!(!d.path().join("docs/b.md").exists());
    let e = apply(d.path(), &p, &["file:../x".into()]).unwrap_err();
    assert!(e.to_string().contains("unknown item"));
}

#[test]
fn an_existing_file_is_kept() {
    let d = tempfile::tempdir().unwrap();
    fs::write(d.path().join("c.md"), "mine").unwrap();
    let p = read(&good("1.0.0", "", "a")).unwrap();
    let a = apply(d.path(), &p, &["file:c.md".into()]).unwrap();
    assert_eq!(a.report.kept, ["c.md"]);
    assert_eq!(fs::read_to_string(d.path().join("c.md")).unwrap(), "mine");
}

#[test]
fn a_newer_version_shows_what_changes() {
    let d = tempfile::tempdir().unwrap();
    let all: Vec<String> = [
        "file:docs/a.md",
        "file:docs/b.md",
        "file:c.md",
        "setting:team",
    ]
    .map(String::from)
    .into();
    apply(d.path(), &read(&good("1.0.0", "", "a")).unwrap(), &all).unwrap();
    let newer = zip(&[
        (
            "manifest.json",
            &manifest("1.1.0", "")
                .replace(r#"{"source":"files/c.md","target":"c.md"},"#, "")
                .replace(r#",{"source":"files/c.md","target":"c.md"}"#, ""),
        ),
        ("files/a.md", "a2"),
        ("files/b.md", "b"),
    ]);
    let r = review(d.path(), &read(&newer).unwrap());
    assert_eq!(r.applied.as_deref(), Some("1.0.0"));
    let change = |id: &str| r.items.iter().find(|i| i.id == id).unwrap().change;
    assert_eq!(change("file:docs/a.md"), Change::Changed);
    assert_eq!(change("file:docs/b.md"), Change::Same);
    assert_eq!(change("file:c.md"), Change::Removed);
}

#[test]
fn a_remote_mcp_server_is_an_item_and_a_local_command_is_refused() {
    let extra = r#","mcpServers":{"docs":{"url":"https://mcp.example.com/sse","headers":{"Authorization":"${DOCS_TOKEN}"}},"shell":{"command":"sh","args":["-c","x"]}}"#;
    let p = read(&good("1.0.0", extra, "a")).unwrap();
    let r = review(tempfile::tempdir().unwrap().path(), &p);
    assert!(r.items.iter().any(|i| i.id == "mcp:docs"));
    assert!(!r.items.iter().any(|i| i.id == "mcp:shell"));
    assert_eq!(r.refused, ["mcp:shell: a local command"]);
    let d = tempfile::tempdir().unwrap();
    let a = apply(d.path(), &p, &["mcp:docs".into()]).unwrap();
    assert_eq!(a.mcp.len(), 1);
}

#[test]
fn a_secret_value_is_refused() {
    let extra = r#","mcpServers":{"docs":{"url":"https://x.example.com","headers":{"Authorization":"Bearer abc"}}}"#;
    assert_eq!(read(&good("1", extra, "a")).unwrap().refused.len(), 1);
    let m = r#"{"name":"x","version":"1","settings":{"api_token":"abc"}}"#;
    assert!(
        read(&zip(&[("manifest.json", m), ("files/a", "a")]))
            .err()
            .unwrap()
            .to_string()
            .contains("secret")
    );
}
