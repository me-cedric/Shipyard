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

/// Set the declared size of every entry to 0 in the local and the central headers.
fn lie_about_size(mut z: Vec<u8>) -> Vec<u8> {
    for (sig, at) in [([0x50, 0x4b, 3, 4], 22), ([0x50, 0x4b, 1, 2], 24)] {
        for i in 0..z.len().saturating_sub(at + 4) {
            if z[i..i + 4] == sig {
                z[i + at..i + at + 4].fill(0);
            }
        }
    }
    z
}

#[test]
fn an_archive_that_declares_size_zero_is_still_limited() {
    let big = "a".repeat(6 * 1024 * 1024);
    let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let o = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    w.start_file("manifest.json", o).unwrap();
    w.write_all(br#"{"name":"x","version":"1"}"#).unwrap();
    w.start_file("files/a", o).unwrap();
    w.write_all(big.as_bytes()).unwrap();
    w.start_file("files/b", o).unwrap();
    w.write_all(big.as_bytes()).unwrap();
    let z = lie_about_size(w.finish().unwrap().into_inner());
    let e = read(&z).err().unwrap();
    assert!(e.to_string().contains("too large"), "{e}");
}

#[test]
fn a_manifest_that_copies_one_source_many_times_is_limited() {
    let one = "a".repeat(1024 * 1024);
    let files: Vec<String> = (0..11)
        .map(|i| format!(r#"{{"source":"files/a","target":"t{i}"}}"#))
        .collect();
    let m = format!(
        r#"{{"name":"x","version":"1","files":[{}]}}"#,
        files.join(",")
    );
    let e = read(&zip(&[("manifest.json", &m), ("files/a", &one)]))
        .err()
        .unwrap();
    assert!(e.to_string().contains("too large"), "{e}");
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
