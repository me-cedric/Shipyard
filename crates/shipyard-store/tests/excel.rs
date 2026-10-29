//! Excel tests (spec `work`, REQ-012, REQ-013): preview with a bad row, no replace before the
//! person confirms, round trip.

use calamine::{Data, DataType, Reader, Xlsx, open_workbook_from_rs};
use rust_xlsxwriter::Workbook;
use shipyard_core::work::*;
use shipyard_store::excel::{self, ExcelError};
use shipyard_store::work::{read_sheet, write_sheet};
use std::collections::BTreeMap;
use std::io::Cursor;

const HEAD: [&str; 8] = [
    "Type",
    "Scope",
    "Title",
    "Profile",
    "Charge Mode",
    "Effort (Days)",
    "Effort (Ratio)",
    "Kind",
];

enum C {
    S(&'static str),
    N(f64),
    E,
}

/// A workbook with the header at row 1 and the given rows below it.
fn book(rows: &[[C; 8]]) -> Vec<u8> {
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet().set_name("Estimate").unwrap();
    for (c, h) in HEAD.iter().enumerate() {
        ws.write(0, c as u16, *h).unwrap();
    }
    for (r, row) in rows.iter().enumerate() {
        for (c, cell) in row.iter().enumerate() {
            match cell {
                C::S(s) => ws.write(r as u32 + 1, c as u16, *s).unwrap(),
                C::N(n) => ws.write(r as u32 + 1, c as u16, *n).unwrap(),
                C::E => ws,
            };
        }
    }
    wb.save_to_buffer().unwrap()
}

fn feature(title: &'static str) -> [C; 8] {
    [
        C::S("Feature"),
        C::S("Lot 1"),
        C::S(title),
        C::E,
        C::E,
        C::E,
        C::E,
        C::E,
    ]
}

fn task(title: &'static str, role: &'static str, mode: &'static str, days: C, ratio: C) -> [C; 8] {
    [
        C::S("Task"),
        C::S("Lot 1"),
        C::S(title),
        C::S(role),
        C::S(mode),
        days,
        ratio,
        C::E,
    ]
}

fn sample() -> Sheet {
    read_sheet(
        "\
name: Lot 1
currency: EUR
marginRate: 0.15
features:
  - id: login
    name: Login
    description: Sign in and out
    tasks:
      - { id: build-login, name: Build, description: Form and session, role: dev, days: 5, note: Check SSO }
      - { id: licence, name: Licence, role: dev, days: 2, other: true }
      - { id: test-login, name: Test, role: qa, percent: 20, ticket: PROJ-12 }
  - id: logout
    name: Logout
    tasks:
      - { id: build-logout, name: Build, role: dev, days: 1.5 }
",
        None,
    )
    .unwrap()
}

fn rates() -> BTreeMap<String, f64> {
    BTreeMap::from([("dev".into(), 600.0), ("qa".into(), 450.0)])
}

// ---- export and round trip (REQ-013)

#[test]
fn an_export_imports_back_to_the_same_sheet() {
    let s = sample();
    let bytes = excel::export(&s, &rates()).unwrap();
    let p = excel::preview(&bytes, None).unwrap();
    assert!(p.refused.is_empty(), "{:?}", p.refused);
    assert_eq!(p.sheet, s);
    assert_eq!(p.scopes, ["Lot 1"]);
}

#[test]
fn the_export_holds_the_totals_of_the_summary() {
    let s = sample();
    let want = totals(&s, &rates());
    let mut wb: Xlsx<_> =
        open_workbook_from_rs(Cursor::new(excel::export(&s, &rates()).unwrap())).unwrap();
    let range = wb.worksheet_range("Summary").unwrap();
    let get = |label: &str| {
        range
            .rows()
            .find(|r| r[0] == Data::String(label.into()))
            .and_then(|r| r[1].as_f64())
            .unwrap_or_else(|| panic!("no {label}"))
    };
    assert_eq!(get("Days"), want.days);
    assert_eq!(get("Cost"), want.cost);
    assert_eq!(get("Price"), want.price);
    assert_eq!(get("Margin"), want.margin);
}

// ---- import preview (REQ-012)

#[test]
fn a_bad_row_is_refused_with_its_row_and_reason_and_the_good_rows_stay() {
    let bytes = book(&[
        feature("Login"),
        task("Build", "dev", "Days", C::N(3.0), C::E),
        task("Broken", "dev", "Days", C::S("abc"), C::E),
        task("Negative", "dev", "Days", C::N(-1.0), C::E),
        [
            C::S("Banana"),
            C::E,
            C::S("x"),
            C::E,
            C::E,
            C::E,
            C::E,
            C::E,
        ],
        [C::E, C::E, C::E, C::E, C::E, C::E, C::E, C::E],
        [
            C::S("Cluster"),
            C::E,
            C::S("Group"),
            C::E,
            C::E,
            C::E,
            C::E,
            C::E,
        ],
        task("Share", "qa", "Other (Ratio)", C::E, C::N(0.2)),
    ]);
    let p = excel::preview(&bytes, None).unwrap();
    let rows: Vec<u32> = p.refused.iter().map(|r| r.row).collect();
    assert_eq!(rows, [4, 5, 6], "{:?}", p.refused);
    assert!(
        p.refused[0].reason.contains("effort"),
        "{}",
        p.refused[0].reason
    );
    assert!(p.refused[1].reason.contains("negative") || p.refused[1].reason.contains("effort"));
    assert!(
        p.refused[2].reason.contains("Banana"),
        "{}",
        p.refused[2].reason
    );
    let tasks: Vec<&Task> = p.sheet.tasks().map(|(_, t)| t).collect();
    assert_eq!(tasks.len(), 2);
    assert_eq!(
        (tasks[0].name.as_str(), tasks[0].days),
        ("Build", Some(3.0))
    );
    assert_eq!(
        (tasks[1].role.as_str(), tasks[1].percent),
        ("qa", Some(20.0))
    );
    p.sheet.check().unwrap();
}

#[test]
fn a_task_before_any_feature_and_a_missing_column_are_named() {
    let p = excel::preview(
        &book(&[task("Orphan", "dev", "Days", C::N(1.0), C::E)]),
        None,
    )
    .unwrap();
    assert_eq!(p.refused.len(), 1);
    assert!(p.refused[0].reason.contains("feature"));

    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    ws.write(0, 0, "Type").unwrap();
    ws.write(0, 1, "Name").unwrap();
    let err = excel::preview(&wb.save_to_buffer().unwrap(), None).unwrap_err();
    assert!(
        matches!(&err, ExcelError::Layout(m) if m.contains("Title")),
        "{err}"
    );
}

#[test]
fn a_file_that_is_not_a_workbook_is_refused() {
    assert!(matches!(
        excel::preview(b"not a zip", None),
        Err(ExcelError::Read(_))
    ));
}

#[test]
fn a_workbook_with_several_lots_lists_them_and_reads_one() {
    let mut other = task("Other lot", "dev", "Days", C::N(1.0), C::E);
    other[1] = C::S("Lot 2");
    let bytes = book(&[
        feature("F"),
        task("A", "dev", "Days", C::N(1.0), C::E),
        other,
    ]);
    let p = excel::preview(&bytes, None).unwrap();
    assert_eq!(p.scopes, ["Lot 1", "Lot 2"]);
    assert_eq!(p.scope.as_deref(), Some("Lot 1"));
    assert_eq!(p.sheet.tasks().count(), 1);
    let p2 = excel::preview(&bytes, Some("Lot 2")).unwrap();
    assert_eq!(p2.sheet.name, "Lot 2");
}

#[test]
fn ids_are_made_unique_and_valid_when_the_file_has_none() {
    let bytes = book(&[
        feature("Écran d'accueil"),
        task("Build", "dev", "Days", C::N(1.0), C::E),
        task("Build", "dev", "Days", C::N(1.0), C::E),
    ]);
    let p = excel::preview(&bytes, None).unwrap();
    p.sheet.check().unwrap();
    let ids: Vec<&str> = p.sheet.tasks().map(|(_, t)| t.id.as_str()).collect();
    assert_eq!(ids, ["build", "build-2"]);
}

// ---- no replace before confirm (REQ-012)

#[test]
fn a_preview_changes_nothing_and_the_file_is_replaced_only_after_the_confirmation() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("lot-1.yaml");
    let old = write_sheet(&sample(), None).unwrap();
    std::fs::write(&path, &old).unwrap();

    let bytes = book(&[feature("New"), task("Only", "dev", "Days", C::N(9.0), C::E)]);
    let p = excel::preview(&bytes, None).unwrap();
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        old,
        "a preview writes nothing"
    );

    let err = excel::replace_sheet(&path, &p, false, None).unwrap_err();
    assert!(matches!(err, ExcelError::NotConfirmed));
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        old,
        "no confirmation, no replace"
    );

    excel::replace_sheet(&path, &p, true, None).unwrap();
    let now = read_sheet(&std::fs::read_to_string(&path).unwrap(), None).unwrap();
    assert_eq!(now, p.sheet);
    assert_eq!(
        std::fs::read_dir(dir.path()).unwrap().count(),
        1,
        "no temp file stays"
    );
}

#[test]
fn a_confirmed_import_of_a_sealed_project_seals_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("lot-1.yaml");
    let p = excel::preview(
        &book(&[feature("F"), task("A", "dev", "Days", C::N(1.0), C::E)]),
        None,
    )
    .unwrap();
    excel::replace_sheet(&path, &p, true, Some("pw")).unwrap();
    let text = std::fs::read_to_string(&path).unwrap();
    assert!(shipyard_store::seal::is_sealed(&text));
    assert_eq!(read_sheet(&text, Some("pw")).unwrap(), p.sheet);
}

#[test]
fn an_import_with_no_rows_replaces_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("lot-1.yaml");
    std::fs::write(&path, "x").unwrap();
    let p = excel::preview(&book(&[]), None).unwrap();
    assert!(matches!(
        excel::replace_sheet(&path, &p, true, None),
        Err(ExcelError::Empty)
    ));
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "x");
}
