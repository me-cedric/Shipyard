//! Exports: five sections, cover, empty section, unreadable source, no day rate and `.xlsx` (spec
//! `knowledge`, REQ-013 to REQ-016). The `.docx` and the `.xlsx` are read back by the test only.

use std::io::Cursor;

use base64::Engine as _;
use calamine::{Reader, Xlsx};
use shipyard_core::work::{Feature, Sheet, Task};
use shipyard_store::export::{
    Block, Content, Item, Meta, Section, SheetOut, annex_item, assemble, docx_bytes,
    markdown_blocks, xlsx_bytes,
};
use shipyard_store::seal;
use shipyard_store::work::{read_sheet, write_sheet};

const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

fn meta() -> Meta {
    Meta {
        title: "Architecture dossier".into(),
        project: "Shipyard".into(),
        generated_on: "2026-10-29".into(),
        empty: "Nothing to show.".into(),
        gap: "Not readable".into(),
        generated: "Generated".into(),
    }
}

fn md(name: &str, text: &str) -> Item {
    Item {
        name: name.into(),
        source: Ok(Content::Markdown(text.into())),
    }
}

fn section(title: &str, items: Vec<Item>) -> Section {
    Section {
        title: title.into(),
        items,
    }
}

fn five(models: Vec<Item>) -> Vec<Section> {
    vec![
        section(
            "Views",
            vec![Item {
                name: "Context".into(),
                source: Ok(Content::Image(
                    base64::engine::general_purpose::STANDARD
                        .decode(PNG)
                        .unwrap(),
                )),
            }],
        ),
        section(
            "Decisions",
            vec![md("0004 Polling", "# Polling\nWe poll.\n- one\n- two\n")],
        ),
        section("Data models", models),
        section("Flows", vec![]),
        section(
            "API contracts",
            vec![md(
                "work",
                "| Method | Path |\n|---|---|\n| GET | /work |\n",
            )],
        ),
    ]
}

/// The whole document as one JSON text, read back from the bytes.
fn read_back(bytes: &[u8]) -> String {
    docx_rs::read_docx(bytes).expect("a valid .docx").json()
}

fn headings(blocks: &[Block]) -> Vec<&str> {
    blocks
        .iter()
        .filter_map(|b| match b {
            Block::Heading(1, t) => Some(t.as_str()),
            _ => None,
        })
        .collect()
}

#[test]
fn the_dossier_has_a_cover_then_five_sections_each_on_a_new_page() {
    let blocks = assemble(&meta(), &five(vec![md("core", "# Core\ntable a\n")]));
    assert_eq!(
        headings(&blocks),
        [
            "Architecture dossier",
            "Views",
            "Decisions",
            "Data models",
            "Flows",
            "API contracts"
        ]
    );
    assert_eq!(blocks.iter().filter(|b| **b == Block::PageBreak).count(), 5);
    assert!(blocks.contains(&Block::Para("Generated: 2026-10-29".into())));
    let json = read_back(&docx_bytes(&meta(), &blocks).unwrap());
    for t in [
        "Architecture dossier",
        "Shipyard",
        "We poll.",
        "GET",
        "/work",
    ] {
        assert!(json.contains(t), "missing {t}");
    }
}

#[test]
fn a_section_with_no_item_says_so() {
    let blocks = assemble(&meta(), &five(vec![]));
    let empty = Block::Para("Nothing to show.".into());
    assert_eq!(
        blocks.iter().filter(|b| **b == empty).count(),
        2,
        "models and flows"
    );
}

#[test]
fn an_unreadable_source_is_a_named_gap_and_the_export_succeeds() {
    let broken = Item {
        name: "billing.dbml".into(),
        source: Err("not UTF-8 text".into()),
    };
    let blocks = assemble(&meta(), &five(vec![broken, md("core", "ok\n")]));
    assert!(blocks.contains(&Block::Gap(
        "Not readable: billing.dbml (not UTF-8 text)".into()
    )));
    let json = read_back(&docx_bytes(&meta(), &blocks).unwrap());
    assert!(json.contains("billing.dbml") && json.contains("ok"));
}

#[test]
fn markdown_reads_headings_bullets_code_and_tables() {
    let b = markdown_blocks(
        "---\nstatus: x\n---\n# Title\nline one\nline two\n1. a\n2) b\n```\nlet x;\n```\n| h |\n|---|\n| v |\n",
        2,
    );
    assert_eq!(b[0], Block::Heading(2, "Title".into()));
    assert_eq!(b[1], Block::Para("line one line two".into()));
    assert_eq!(b[2], Block::Bullets(vec!["a".into(), "b".into()]));
    assert_eq!(b[3], Block::Code("let x;".into()));
    assert_eq!(
        b[4],
        Block::Table {
            headers: vec!["h".into()],
            rows: vec![vec!["v".into()]]
        }
    );
}

fn sheet() -> Sheet {
    Sheet {
        name: "Lot 1".into(),
        currency: "EUR".into(),
        margin_rate: 0.1,
        features: vec![Feature {
            id: "f1".into(),
            name: "Login".into(),
            description: String::new(),
            tasks: vec![Task {
                id: "t1".into(),
                name: "Build the form".into(),
                role: "dev".into(),
                days: Some(3.0),
                ..Default::default()
            }],
        }],
    }
}

#[test]
fn the_annex_lists_tasks_and_a_sealed_sheet_gives_a_gap_with_no_rate() {
    let open = sheet();
    let sealed = write_sheet(&open, Some("pass")).unwrap();
    assert!(seal::is_sealed(&sealed));
    let locked = read_sheet(&sealed, None).map_err(|e| e.to_string());
    let sections = vec![section(
        "Estimate annex",
        vec![
            annex_item("Lot 1", Ok(&open)),
            annex_item("Lot 2", locked.as_ref().map_err(Clone::clone)),
        ],
    )];
    let blocks = assemble(&meta(), &sections);
    let json = read_back(&docx_bytes(&meta(), &blocks).unwrap());
    assert!(json.contains("Build the form") && json.contains("Not readable: Lot 2"));
    assert!(
        !json.contains("SHIPYARD-SEALED")
            && !json.to_lowercase().contains("day rate")
            && !json.contains("dayRate")
    );
    let Block::Table { headers, .. } = blocks
        .iter()
        .find(|b| matches!(b, Block::Table { .. }))
        .unwrap()
    else {
        unreachable!()
    };
    assert_eq!(headers, &["Task", "Role", "Days"]);
}

#[test]
fn a_deliverable_exports_as_xlsx_with_a_cover_and_one_sheet_for_each_part() {
    let part = |name: &str| SheetOut {
        name: name.into(),
        headers: vec!["Finding".into(), "Severity".into()],
        rows: vec![vec!["SQL injection".into(), "high".into()]],
    };
    let bytes = xlsx_bytes(&meta(), &[part("Scan: web/1"), part("Scan 2")]).unwrap();
    let mut wb: Xlsx<_> = calamine::open_workbook_from_rs(Cursor::new(bytes)).unwrap();
    assert_eq!(wb.sheet_names(), ["Cover", "Scan web1", "Scan 2"]);
    let cover = wb.worksheet_range("Cover").unwrap();
    assert_eq!(
        cover.get((0, 0)).unwrap().to_string(),
        "Architecture dossier"
    );
    assert!(
        cover
            .get((2, 0))
            .unwrap()
            .to_string()
            .contains("2026-10-29")
    );
    let scan = wb.worksheet_range("Scan 2").unwrap();
    assert_eq!(scan.get((1, 0)).unwrap().to_string(), "SQL injection");
}

#[test]
fn an_image_that_is_not_a_png_is_a_gap() {
    use shipyard_store::export::image_item;
    let sections = vec![section(
        "Views",
        vec![image_item("Bad", "aGVsbG8="), image_item("Worse", "***")],
    )];
    let blocks = assemble(&meta(), &sections);
    assert!(blocks.contains(&Block::Gap("Not readable: Bad (not a PNG image)".into())));
    assert!(blocks.contains(&Block::Gap("Not readable: Worse (not base64 text)".into())));
    docx_bytes(&meta(), &blocks).unwrap();
}
