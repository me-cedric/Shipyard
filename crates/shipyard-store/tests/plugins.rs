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
    let e = read(&z).err().unwrap().to_string();
    // `zip` 9 refuses a lying size itself; our byte count is the second guard.
    assert!(
        e.contains("too large") || e.contains("declared uncompressed size"),
        "{e}"
    );
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

#[test]
fn a_typed_setting_is_read_checked_and_kept_after_an_update() {
    use shipyard_store::plugin_config::{SettingKind, settings, settings_save};
    let typed = r#"{"name":"x","version":"1","settings":{"region":{"type":"choice","default":"eu","choices":["eu","us"]},"size":{"type":"number","default":2}}}"#;
    let p = read(&zip(&[("manifest.json", typed), ("files/a", "a")])).unwrap();
    assert_eq!(p.fields["region"].kind, SettingKind::Choice);
    assert_eq!(p.settings["size"], "2");
    let bad = r#"{"name":"x","version":"1","settings":{"region":{"type":"choice","default":"mars","choices":["eu"]}}}"#;
    assert!(read(&zip(&[("manifest.json", bad), ("files/a", "a")])).is_err());

    let d = tempfile::tempdir().unwrap();
    let all = ["setting:region".to_string(), "setting:size".to_string()];
    apply(d.path(), &p, &all).unwrap();
    let values = std::collections::BTreeMap::from([("region".to_string(), "us".to_string())]);
    settings_save(d.path(), "x", &values).unwrap();
    // A second apply of the plugin keeps the value that the person saved.
    apply(d.path(), &p, &all).unwrap();
    let rows = settings(d.path(), "x").unwrap();
    assert_eq!(rows.iter().find(|r| r.key == "region").unwrap().value, "us");
}

fn plain(
    manifest: &str,
    files: &[(&str, &str)],
) -> Result<shipyard_store::plugins::Plugin, String> {
    let mut all = vec![("manifest.json", manifest)];
    all.extend_from_slice(files);
    read(&zip(&all)).map_err(|e| e.to_string())
}

const TEAM: &str = r#""settings":{"team":{"type":"choice","choices":["core","web"],"default":"core"},"n":{"type":"number","default":3},"note":"a {{config.n}} b"}"#;

#[test]
fn a_setting_is_filled_into_the_files_and_the_review_shows_it() {
    let m = format!(r#"{{"name":"x","version":"1",{TEAM}}}"#);
    let t = "team={{config.team}} n={{config.n}} note={{config.note}} open={{config.team";
    let p = plain(&m, &[("files/a.md", t)]).unwrap();
    let d = tempfile::tempdir().unwrap();
    let r = review(d.path(), &p);
    let item = r.items.iter().find(|i| i.id == "file:a.md").unwrap();
    // One pass: `{{` in a value stays text; an open tag stays text.
    assert_eq!(
        item.preview.as_deref(),
        Some("team=core n=3 note=a {{config.n}} b open={{config.team")
    );
    apply(d.path(), &p, &["file:a.md".into()]).unwrap();
    assert!(
        fs::read_to_string(d.path().join("a.md"))
            .unwrap()
            .starts_with("team=core n=3")
    );
}

#[test]
fn a_missing_key_and_a_wrong_type_are_refused() {
    let m = format!(r#"{{"name":"x","version":"1",{TEAM}}}"#);
    let e = plain(&m, &[("files/a.md", "{{config.nope}}")]).unwrap_err();
    assert!(e.contains("a.md") && e.contains("nope"), "{e}");
    let bad = r#"{"name":"x","version":"1",
  "settings":{"n":{"type":"number","default":"four"}}}"#;
    let e = plain(bad, &[("files/a", "a")]).unwrap_err();
    assert!(e.starts_with("manifest.json:2:") && e.contains("n"), "{e}");
    // A saved value that no longer fits its field stops the apply before a write.
    let p = plain(&m, &[("files/a.md", "{{config.n}}")]).unwrap();
    let d = tempfile::tempdir().unwrap();
    apply(d.path(), &p, &["setting:n".into()]).unwrap();
    let rec = d.path().join(".shipyard/plugins.json");
    let t = fs::read_to_string(&rec)
        .unwrap()
        .replace("\"3\"", "\"abc\"");
    fs::write(&rec, t).unwrap();
    assert!(apply(d.path(), &p, &["file:a.md".into()]).is_err());
    assert!(!d.path().join("a.md").exists());
}

#[test]
fn a_saved_setting_changes_the_files_through_the_same_review() {
    use shipyard_store::plugin_config::settings_save;
    let m = format!(r#"{{"name":"x","version":"1",{TEAM}}}"#);
    let p = plain(&m, &[("files/a.md", "team={{config.team}}")]).unwrap();
    let d = tempfile::tempdir().unwrap();
    let all = ["file:a.md".to_string(), "setting:team".to_string()];
    apply(d.path(), &p, &all).unwrap();
    let values = std::collections::BTreeMap::from([("team".to_string(), "web".to_string())]);
    settings_save(d.path(), "x", &values).unwrap();
    let r = review(d.path(), &p);
    let item = r.items.iter().find(|i| i.id == "file:a.md").unwrap();
    assert_eq!(item.change, Change::Changed);
    assert_eq!(item.preview.as_deref(), Some("team=web"));
    // The file is unedited, so the apply updates it.
    let a = apply(d.path(), &p, &["file:a.md".into()]).unwrap();
    assert_eq!(a.report.written, ["a.md"]);
    assert_eq!(
        fs::read_to_string(d.path().join("a.md")).unwrap(),
        "team=web"
    );
    // An edited file is kept.
    values_edit(d.path());
    settings_save(
        d.path(),
        "x",
        &std::collections::BTreeMap::from([("team".into(), "core".into())]),
    )
    .unwrap();
    let a = apply(d.path(), &p, &["file:a.md".into()]).unwrap();
    assert_eq!(a.report.kept, ["a.md"]);
    assert_eq!(fs::read_to_string(d.path().join("a.md")).unwrap(), "mine");
}

fn values_edit(root: &std::path::Path) {
    fs::write(root.join("a.md"), "mine").unwrap();
}

#[test]
fn skills_and_rules_go_to_the_agent_folders() {
    let m = r#"{"name":"x","version":"1","skills":["s"],"rules":["r"]}"#;
    let p = plain(
        m,
        &[
            ("files/skills/s/SKILL.md", "skill"),
            ("files/skills/s/ref/a.md", "ref"),
            ("files/rules/r.md", "rule"),
            ("files/extra.md", "extra"),
        ],
    )
    .unwrap();
    let mut t: Vec<_> = p.files.iter().map(|f| f.0.as_str()).collect();
    t.sort();
    assert_eq!(
        t,
        [
            ".agents/rules/r.md",
            ".agents/skills/s/SKILL.md",
            ".agents/skills/s/ref/a.md",
            ".claude/rules/r.md",
            ".claude/skills/s/SKILL.md",
            ".claude/skills/s/ref/a.md",
            "extra.md",
        ]
    );
    let e = plain(
        r#"{"name":"x","version":"1","skills":["gone"]}"#,
        &[("files/a", "a")],
    )
    .unwrap_err();
    assert!(
        e.starts_with("manifest.json:1:") && e.contains("gone"),
        "{e}"
    );
    let e = plain(
        r#"{"name":"x","version":"1","rules":["../r"]}"#,
        &[("files/a", "a")],
    )
    .unwrap_err();
    assert!(e.contains("plain name"), "{e}");
}

#[test]
fn an_unknown_field_is_named_with_its_line() {
    let m = "{\n  \"name\": \"x\",\n  \"version\": \"1\",\n  \"colour\": 1\n}";
    let e = plain(m, &[("files/a", "a")]).unwrap_err();
    assert!(e.starts_with("manifest.json:4:"), "{e}");
}

#[test]
fn the_sample_plugin_packs_reads_and_reviews() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/plugin-sample");
    let bytes = shipyard_store::plugins::pack(&dir).unwrap();
    let p = read(&bytes).unwrap();
    assert_eq!(p.name, "acme-sample");
    assert!(p.refused.is_empty() && p.mcp["acme-docs"].headers["Authorization"] == "${ACME_TOKEN}");
    let r = review(tempfile::tempdir().unwrap().path(), &p);
    let skill = r
        .items
        .iter()
        .find(|i| i.id == "file:.claude/skills/sample-skill/SKILL.md");
    assert!(
        skill
            .unwrap()
            .preview
            .as_deref()
            .unwrap()
            .contains("serves: core.")
    );
    assert!(
        r.items
            .iter()
            .any(|i| i.id == "file:.claude/rules/sample-rule.md")
    );
    assert!(r.items.iter().any(|i| i.id == "theme:acme-dusk"));
    // The schema is not part of the zip, and a theme is not a project file.
    assert!(p.files.iter().all(|f| !f.0.contains("themes/")));
    assert!(p.files.iter().all(|f| !f.0.contains("schema")));
}

#[test]
fn pack_refuses_a_folder_without_a_manifest_and_a_link() {
    let d = tempfile::tempdir().unwrap();
    assert!(shipyard_store::plugins::pack(d.path()).is_err());
    fs::create_dir_all(d.path().join("files")).unwrap();
    fs::write(
        d.path().join("manifest.json"),
        r#"{"name":"x","version":"1"}"#,
    )
    .unwrap();
    fs::write(d.path().join("files/a"), "a").unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink("/etc/hosts", d.path().join("files/l")).unwrap();
        let e = shipyard_store::plugins::pack(d.path()).unwrap_err();
        assert!(e.to_string().contains("link"), "{e}");
        fs::remove_file(d.path().join("files/l")).unwrap();
    }
    assert!(read(&shipyard_store::plugins::pack(d.path()).unwrap()).is_ok());
}

#[test]
fn the_source_path_stays_in_the_app_data_and_never_in_the_repository_record() {
    use shipyard_store::plugin_manage::{set_source, sources};
    let (repo, data) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let p = read(&good("1.0.0", "", "a")).unwrap();
    apply(repo.path(), &p, &["file:c.md".into()]).unwrap();
    set_source(
        data.path(),
        "p1",
        &p.name,
        Some("/Users/me/plugins/demo.zip"),
    )
    .unwrap();
    let record = fs::read_to_string(repo.path().join(".shipyard/plugins.json")).unwrap();
    assert!(
        !record.contains("/Users/me") && !record.contains("source"),
        "{record}"
    );
    assert_eq!(
        sources(data.path(), "p1")[&p.name],
        "/Users/me/plugins/demo.zip"
    );
    set_source(data.path(), "p1", &p.name, None).unwrap();
    assert!(sources(data.path(), "p1").is_empty());
    assert!(set_source(data.path(), "../x", "n", None).is_err());
}

#[test]
fn a_theme_is_an_item_for_the_library_and_a_bad_theme_is_refused() {
    let theme =
        r##"{"shipyardTheme":1,"id":"night","name":"Night","base":"dark","accent":"#3bb9fd"}"##;
    let m = r#"{"name":"x","version":"1","themes":["night"]}"#;
    let p = plain(m, &[("files/themes/night.json", theme)]).unwrap();
    assert!(p.files.is_empty());
    let d = tempfile::tempdir().unwrap();
    let r = review(d.path(), &p);
    let item = r.items.iter().find(|i| i.id == "theme:night").unwrap();
    assert_eq!(item.label, "Night");
    let a = apply(d.path(), &p, &[]).unwrap();
    assert!(a.themes.is_empty());
    let a = apply(d.path(), &p, &["theme:night".into()]).unwrap();
    assert_eq!(a.themes.len(), 1);
    assert_eq!(a.report.written.len(), 0);
    assert_eq!(review(d.path(), &p).items[0].change, Change::Same);

    let bad = r#"{"shipyardTheme":1,"id":"night","name":"Night","base":"dark","font":"https://x.test/font.woff2"}"#;
    let e = plain(m, &[("files/themes/night.json", bad)]).unwrap_err();
    assert!(
        e.contains("files/themes/night.json") && e.contains("font:"),
        "{e}"
    );
    let e = plain(m, &[("files/a", "a")]).unwrap_err();
    assert!(
        e.starts_with("manifest.json:1:") && e.contains("night"),
        "{e}"
    );
}
