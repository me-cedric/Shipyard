//! The client exports over a temporary project with a git history. Each export is built from files
//! of the project and written to a folder of the test.

use std::path::{Path, PathBuf};

use shipyard_core::work::{Feature, Sheet, Task};
use shipyard_git::{RangeCommit, RangeFile};
use shipyard_store::work::write_sheet;

use super::*;
use crate::commands::projects;

fn text() -> ExportText {
    ExportText {
        title: "Report".into(),
        empty: "Nothing".into(),
        gap: "Gap".into(),
        generated: "Generated".into(),
        sections: vec![],
    }
}

fn git(root: &Path, args: &[&str]) {
    let ok = std::process::Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .status()
        .unwrap()
        .success();
    assert!(ok, "git {args:?}");
}

fn commit(root: &Path, files: &[(&str, &str)], msg: &str) -> String {
    for (rel, body) in files {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, body).unwrap();
    }
    let r = Repo::open(root).unwrap();
    r.stage(&files.iter().map(|f| f.0.to_string()).collect::<Vec<_>>())
        .unwrap();
    r.commit(msg, "").unwrap()
}

fn sheet(days: &[(&str, f64)]) -> String {
    write_sheet(
        &Sheet {
            name: "Lot".into(),
            features: vec![Feature {
                id: "f".into(),
                name: "Feature".into(),
                tasks: days
                    .iter()
                    .map(|(id, d)| Task {
                        id: (*id).into(),
                        name: format!("Task {id}"),
                        role: "dev".into(),
                        days: Some(*d),
                        ..Task::default()
                    })
                    .collect(),
                ..Feature::default()
            }],
            ..Sheet::default()
        },
        None,
    )
    .unwrap()
}

struct Fx {
    _t: tempfile::TempDir,
    s: AppState,
    root: PathBuf,
    out: PathBuf,
    base: String,
    head: String,
}

fn fx() -> Fx {
    let t = tempfile::tempdir().unwrap();
    let root = t.path().join("proj");
    std::fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "-q", "-b", "main"]);
    git(&root, &["config", "user.name", "Ada"]);
    git(&root, &["config", "user.email", "ada@example.com"]);
    let base = commit(
        &root,
        &[
            ("docs/costing/lot.yaml", &sheet(&[("a", 2.0), ("b", 1.0)])),
            ("src/lib.rs", "one\n"),
        ],
        "chore: start",
    );
    let (adr, adr_text) = madr::new_adr("0001", "Use polling", "2026-10-01");
    let head = commit(
        &root,
        &[
            (
                "docs/costing/lot.yaml",
                &sheet(&[("a", 2.0), ("b", 4.0), ("c", 1.0)]),
            ),
            ("src/lib.rs", "one\ntwo\n"),
            (&format!("docs/decisions/{adr}"), &adr_text),
            ("docs/delivery/impacts/n.md", "# Sync impact\n"),
            (
                "docs/delivery/questions/Q-001.md",
                "---\nid: Q-001\nkind: risk\nstatus: open\n---\n\n## Question\n\nWhat if\nthe API fails?\n",
            ),
        ],
        "feat: PAY-7 polling",
    );
    let out = t.path().join("out");
    std::fs::create_dir_all(&out).unwrap();
    let s = AppState::new(t.path().join("data"));
    projects::open(&s, root.to_str().unwrap()).unwrap();
    Fx {
        _t: t,
        s,
        root,
        out,
        base,
        head,
    }
}

fn is_zip(p: &Path) -> bool {
    std::fs::read(p).unwrap().starts_with(b"PK")
}

fn rc(author: &str, msg: &str, files: &[(&str, char, u32, u32)]) -> RangeCommit {
    RangeCommit {
        id: "abcdef0123".into(),
        author: author.into(),
        time: 86_400 * 20_000,
        message: msg.into(),
        files: files
            .iter()
            .map(|f| RangeFile {
                path: f.0.into(),
                status: f.1,
                added: f.2,
                removed: f.3,
            })
            .collect(),
    }
}

#[test]
fn the_rows_of_the_work_done_join_authors_commits_lines_and_work_items() {
    let commits = [
        rc(
            "bob",
            "feat: PAY-1",
            &[("a.rs", 'A', 3, 0), ("b.rs", 'A', 1, 0)],
        ),
        rc(
            "alice",
            "fix: PAY-2 and PAY-1",
            &[("a.rs", 'M', 1, 1), ("b.rs", 'D', 0, 1)],
        ),
    ];
    let rows = work_done_rows(&commits);
    let a = &rows[0];
    assert_eq!(
        (a.path.as_str(), a.status, a.authors.as_str()),
        ("a.rs", "added", "alice; bob")
    );
    assert_eq!((a.commits, a.added, a.removed), (2, 4, 1));
    assert_eq!(a.items, ["PAY-1", "PAY-2"]);
    assert_eq!(rows[1].status, "deleted");

    let titles = HashMap::from([(
        "PAY-1".to_string(),
        ("Pay by card".to_string(), "Done".to_string()),
    )]);
    let sheets = work_done_sheets(&commits, &titles);
    assert_eq!(sheets[0].rows[0][2], "alice; bob");
    assert_eq!(
        sheets[1].rows[0],
        ["PAY-1", "Pay by card", "Done", "2", "2"]
    );
    assert_eq!(
        sheets[1].rows[1][1], "",
        "no title when the mirror has none"
    );
    assert_eq!(sheets[2].rows[1][1], day(86_400 * 20_000));
    assert_eq!(sheets[2].rows[0][0], "abcdef01");
}

#[test]
fn a_write_needs_a_click_and_a_project_file_needs_a_profile_that_is_not_read_only() {
    let f = fx();
    let outside = f.out.join("a.xlsx");
    let inside = f.root.join("docs/a.xlsx");
    let go = |p: &Path, click| need_export_click(&f.s, p.to_str().unwrap(), click);
    assert!(go(&outside, false).unwrap_err().contains("click"));
    go(&outside, true).unwrap();
    go(&inside, true).unwrap();
    projects::save_overrides(
        &f.s,
        shipyard_store::project::Overrides {
            read_only: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(go(&inside, true).unwrap_err().contains("read only"));
    go(&outside, true).unwrap();
    assert!(export_change_request(&f.s, "T", &f.base, &f.head, &[], true).is_err());
    assert!(!f.root.join(CHANGE_REQUESTS).exists());
}

#[test]
fn the_page_exports_write_their_files_and_name_what_is_missing() {
    let f = fx();
    let t = text();
    let p = |n: &str| f.out.join(n).to_str().unwrap().to_string();
    // Nothing is written without a click.
    assert!(export_costing(&f.s, &t, &p("c.xlsx"), false).is_err());
    assert!(!f.out.join("c.xlsx").exists());

    export_costing(&f.s, &t, &p("costing.xlsx"), true).unwrap();
    export_raid(&f.s, &t, &p("raid.xlsx"), true).unwrap();
    export_schedule(&f.s, &t, "lot", &p("plan.xlsx"), true).unwrap();
    export_gantt(&f.s, &t, "lot", &p("plan.svg"), true).unwrap();
    for n in ["costing.xlsx", "raid.xlsx", "plan.xlsx"] {
        assert!(is_zip(&f.out.join(n)), "{n}");
    }
    let svg = std::fs::read_to_string(f.out.join("plan.svg")).unwrap();
    assert!(svg.contains("<svg") && svg.contains("Task b"));
    assert!(export_schedule(&f.s, &t, "nope", &p("x.xlsx"), true).is_err());
    assert!(
        export_gantt(&f.s, &t, "lot", &p("plan.xlsx"), true).is_err(),
        "wrong extension"
    );

    // No flow file and no scan report: a named error and no file.
    assert!(
        export_flows(&f.s, &t, &p("flows.xlsx"), true)
            .unwrap_err()
            .contains("no network flow")
    );
    assert!(
        export_security(&f.s, &t, &p("sec.xlsx"), true)
            .unwrap_err()
            .contains("run a scan")
    );
    std::fs::create_dir_all(f.root.join("docs/flows")).unwrap();
    std::fs::write(
        f.root.join("docs/flows/net.json"),
        r#"{"flows":[{"source":"web","destination":"db","vlan":"10","protocol":"tcp","ports":"5432","action":"Allow"}]}"#,
    )
    .unwrap();
    std::fs::write(f.root.join("docs/flows/broken.json"), "{").unwrap();
    export_flows(&f.s, &t, &p("flows.xlsx"), true).unwrap();
    assert!(is_zip(&f.out.join("flows.xlsx")));
    let report = shipyard_store::code::QualityReport {
        kind: shipyard_store::code::ReportKind::Scanner,
        name: "secrets".into(),
        at: "2026-10-30T10:00:00".into(),
        passed: false,
        duration_ms: 1,
        tail: String::new(),
        findings: vec![],
    };
    shipyard_store::code::save_quality(&f.root, &report, &[]).unwrap();
    export_security(&f.s, &t, &p("sec.xlsx"), true).unwrap();
    assert!(is_zip(&f.out.join("sec.xlsx")));
}

#[test]
fn the_work_done_needs_two_refs_and_a_period() {
    let f = fx();
    let t = text();
    let out = f.out.join("wd.xlsx");
    let run = |base: &str, head: &str, from: &str, to: &str, click| {
        export_work_done(
            &f.s,
            &t,
            base,
            head,
            (from, to),
            out.to_str().unwrap(),
            click,
        )
    };
    assert!(run(&f.base, &f.head, "2026-10-01", "2026-10-31", false).is_err());
    for (from, to) in [
        ("", ""),
        ("2026-10-31", "2026-10-01"),
        ("2026-13-01", "2026-14-01"),
        ("x", "y"),
    ] {
        assert!(
            run(&f.base, &f.head, from, to, true)
                .unwrap_err()
                .contains("period"),
            "{from} {to}"
        );
    }
    for bad in ["", "--all", "no-such-ref"] {
        assert!(
            run(bad, &f.head, "2026-10-01", "2026-10-31", true).is_err(),
            "{bad}"
        );
    }
    assert!(!out.exists());
    run(&f.base, &f.head, "2026-10-01", "2026-10-31", true).unwrap();
    assert!(is_zip(&out));
}

#[test]
fn the_change_request_is_written_twice_and_never_replaces_a_number() {
    let f = fx();
    assert!(export_change_request(&f.s, "T", &f.base, &f.head, &[], false).is_err());
    assert!(export_change_request(&f.s, "  ", &f.base, &f.head, &[], true).is_err());
    assert!(export_change_request(&f.s, "T", "--x", &f.head, &[], true).is_err());
    assert!(
        !f.root.join(CHANGE_REQUESTS).exists(),
        "a refused call writes nothing"
    );

    let a = export_change_request(
        &f.s,
        "Add polling",
        &f.base,
        &f.head,
        &["Ada Lovelace".into(), " ".into()],
        true,
    )
    .unwrap();
    assert_eq!(a.id, "CR-001");
    assert_eq!(a.markdown, "docs/delivery/change-requests/CR-001.md");
    assert!(is_zip(&f.root.join(&a.docx)));
    let md = std::fs::read_to_string(f.root.join(&a.markdown)).unwrap();
    assert!(md.contains("# CR-001 - Add polling"));
    assert!(
        md.contains("| docs/decisions/0001-use-polling.md | A |"),
        "scope"
    );
    assert!(
        md.contains("Sync impact (docs/delivery/impacts/n.md)"),
        "impacts"
    );
    assert!(
        md.contains("| lot | Task b | changed | 1 | 4 |"),
        "estimate delta"
    );
    assert!(md.contains("| lot | Task c | added | 0 | 1 |"));
    assert!(md.contains("Days: 1 to 5 (+4)."));
    assert!(
        md.contains("| 0001 | Use polling | proposed |"),
        "decisions"
    );
    assert!(
        md.contains("| Ada Lovelace |  |  |  |") && !md.contains("|  |  |  |  |"),
        "approvals"
    );

    let b = export_change_request(&f.s, "Again", &f.base, &f.head, &[], true).unwrap();
    assert_eq!(b.id, "CR-002");
    assert!(
        std::fs::read_to_string(f.root.join(&a.markdown))
            .unwrap()
            .contains("Add polling")
    );
}
