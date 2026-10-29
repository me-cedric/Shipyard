//! ADR tests (spec `design` REQ-001, REQ-008 to REQ-010).

use std::fs;

use shipyard_core::project::ProjectFile;
use shipyard_store::madr::{Adr, Decision, decide, list, new_adr, next_number};

fn adr(n: &str) -> Adr {
    Adr {
        number: n.into(),
        title: "t".into(),
        status: "proposed".into(),
        date: "2026-10-29".into(),
        path: format!("docs/decisions/{n}-t.md"),
    }
}

const PROPOSED: &str = "---\nstatus: proposed\ndate: 2026-10-29\ndecision-makers: [Cédric Meyer]\n---\n# Seven spaces\r\n## Context and problem statement\nText with `code`.\n";

#[test]
fn list_reads_number_title_status_and_date_sorted() {
    let dir = tempfile::tempdir().unwrap();
    let d = dir.path().join("docs/decisions");
    fs::create_dir_all(&d).unwrap();
    fs::write(
        d.join("0002-b.md"),
        "---\nstatus: accepted\ndate: 2026-01-02\n---\n# Second\n",
    )
    .unwrap();
    fs::write(
        d.join("0001-a.md"),
        "---\nstatus: proposed\ndate: 2026-01-01\n---\n\n# First\n## Context\n# Not me\n",
    )
    .unwrap();
    fs::write(d.join("README.md"), "# Index\n").unwrap();
    fs::write(d.join("0003-c.md"), "no front matter\n").unwrap();
    let rows = list(dir.path(), &ProjectFile::new("Demo", "DEMO"));
    let got: Vec<_> = rows
        .iter()
        .map(|a| {
            (
                a.number.as_str(),
                a.title.as_str(),
                a.status.as_str(),
                a.date.as_str(),
            )
        })
        .collect();
    assert_eq!(
        got,
        vec![
            ("0001", "First", "proposed", "2026-01-01"),
            ("0002", "Second", "accepted", "2026-01-02"),
            ("0003", "0003-c", "unknown", ""),
        ]
    );
    assert_eq!(rows[0].path, "docs/decisions/0001-a.md");
}

#[test]
fn list_of_a_missing_folder_is_empty() {
    let dir = tempfile::tempdir().unwrap();
    assert!(list(dir.path(), &ProjectFile::new("Demo", "DEMO")).is_empty());
}

#[test]
fn next_number_is_max_plus_one() {
    assert_eq!(next_number(&[]), "0001");
    let ten: Vec<_> = (1..=10).map(|n| adr(&format!("{n:04}"))).collect();
    assert_eq!(next_number(&ten), "0011");
    assert_eq!(next_number(&[adr("0007"), adr("0002")]), "0008");
}

#[test]
fn new_adr_has_the_madr_sections_and_status_proposed() {
    let (name, text) = new_adr("0011", "Use Rust & Tauri!", "2026-10-30");
    assert_eq!(name, "0011-use-rust-tauri.md");
    assert!(text.starts_with(
        "---\nstatus: proposed\ndate: 2026-10-30\ndecision-makers: []\n---\n# Use Rust & Tauri!\n"
    ));
    for h in [
        "## Context and problem statement",
        "## Decision drivers",
        "## Considered options",
        "## Decision outcome",
        "### Consequences",
    ] {
        assert!(text.contains(h), "{h}");
    }
}

#[test]
fn accept_sets_status_date_and_comment_and_keeps_the_rest() {
    let out = decide(
        PROPOSED,
        Decision::Accept,
        "Fits \"the\" plan",
        "2026-11-01",
    )
    .unwrap();
    assert_eq!(
        out,
        PROPOSED
            .replace("status: proposed", "status: accepted")
            .replace("date: 2026-10-29", "date: 2026-11-01")
            .replace(
                "decision-makers: [Cédric Meyer]\n",
                "decision-makers: [Cédric Meyer]\ncomment: \"Fits \\\"the\\\" plan\"\n"
            )
    );
}

#[test]
fn reject_sets_status_rejected() {
    let out = decide(PROPOSED, Decision::Reject, "Too costly", "2026-11-01").unwrap();
    assert!(out.contains("status: rejected\n"));
    assert!(out.contains("comment: \"Too costly\"\n"));
}

#[test]
fn empty_comment_is_an_error() {
    assert!(decide(PROPOSED, Decision::Reject, "  ", "2026-11-01").is_err());
}

#[test]
fn only_a_proposed_adr_can_be_decided() {
    let done = decide(PROPOSED, Decision::Accept, "ok", "2026-11-01").unwrap();
    assert!(decide(&done, Decision::Reject, "again", "2026-11-02").is_err());
    assert!(decide("# No front matter\n", Decision::Accept, "ok", "2026-11-01").is_err());
}

#[test]
fn a_title_edit_keeps_the_number() {
    let (name, _) = new_adr("0004", "Old title", "2026-10-30");
    assert!(name.starts_with("0004-"));
    let dir = tempfile::tempdir().unwrap();
    let d = dir.path().join("docs/decisions");
    fs::create_dir_all(&d).unwrap();
    fs::write(d.join(&name), "---\nstatus: proposed\n---\n# Old title\n").unwrap();
    fs::write(d.join(&name), "---\nstatus: proposed\n---\n# New title\n").unwrap();
    let rows = list(dir.path(), &ProjectFile::new("Demo", "DEMO"));
    assert_eq!(
        (rows[0].number.as_str(), rows[0].title.as_str()),
        ("0004", "New title")
    );
}

#[test]
fn list_ignores_comments_in_the_front_matter() {
    let dir = tempfile::tempdir().unwrap();
    let d = dir.path().join("docs/decisions");
    fs::create_dir_all(&d).unwrap();
    let text = "\u{feff}---\n# optional metadata\nstatus: \"proposed\"\ndate: 2026-01-01\n---\n\n# Real title\n";
    fs::write(d.join("0001-a.md"), text).unwrap();
    fs::write(d.join("0002-b.md"), "---\nstatus: accepted\ntitle: 'Named'\n---\n# Other\n").unwrap();
    let rows = list(dir.path(), &ProjectFile::new("Demo", "DEMO"));
    assert_eq!((rows[0].title.as_str(), rows[0].status.as_str()), ("Real title", "proposed"));
    assert_eq!(rows[1].title, "Named");
}

#[test]
fn list_reads_the_status_of_a_legacy_adr() {
    let dir = tempfile::tempdir().unwrap();
    let d = dir.path().join("docs/decisions");
    fs::create_dir_all(&d).unwrap();
    fs::write(d.join("0001-a.md"), "# A\n\n## Status\n\nAccepted\n").unwrap();
    fs::write(d.join("0002-b.md"), "# B\n\n* Status: Rejected\n").unwrap();
    let rows = list(dir.path(), &ProjectFile::new("Demo", "DEMO"));
    assert_eq!(rows[0].status, "accepted");
    assert_eq!(rows[1].status, "rejected");
}

#[test]
fn decide_accepts_a_quoted_status_and_a_bom() {
    let text = "\u{feff}---\nstatus: \"proposed\"\ndate: 2026-10-29\n---\n# T\n";
    let out = decide(text, Decision::Accept, "ok", "2026-11-01").unwrap();
    assert_eq!(
        out,
        "\u{feff}---\nstatus: accepted\ndate: 2026-11-01\ncomment: \"ok\"\n---\n# T\n"
    );
}
