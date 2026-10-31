//! The RAID file codec and the id allocation (spec `questions-loop`, REQ-003, REQ-007; spec
//! `specs`, REQ-009, REQ-010).

use shipyard_core::question::Question;
use shipyard_store::raid::{
    Item, Kind, QUESTIONS_DIR, RegisterFile, Status, answer, can_transition, create, format_item,
    from_question, item_path, list_register, mark_folded, new_item, next_id, parse_item, read,
    save,
};

fn full() -> Item {
    Item {
        path: "docs/delivery/questions/Q-014.md".into(),
        id: "Q-014".into(),
        kind: Some(Kind::Question),
        status: Some(Status::Answered),
        raised_at: "2026-09-03".into(),
        raised_by: "cedric".into(),
        owner: "po".into(),
        spec_ref: "docs/openspec/specs/billing/spec.md#facturation".into(),
        task_ref: "T-7".into(),
        ticket: "PAAG-412".into(),
        question: "Is the prorata computed by day or by month?".into(),
        answer: "By day.".into(),
        consequence: "Folded into the spec.".into(),
        ..Item::default()
    }
}

fn file(path: &str, text: &str) -> RegisterFile {
    RegisterFile {
        path: path.into(),
        text: text.into(),
    }
}

#[test]
fn a_full_item_round_trips() {
    let it = full();
    assert_eq!(parse_item(&it.path, &format_item(&it)), it);
}

#[test]
fn nine_keys_in_a_fixed_order_even_when_every_value_is_empty() {
    let mut it = new_item("", "");
    it.kind = None;
    it.status = None;
    let text = format_item(&it);
    let fm: Vec<&str> = text
        .lines()
        .skip(1)
        .take_while(|l| *l != "---")
        .map(|l| l.split(':').next().unwrap())
        .collect();
    assert_eq!(
        fm,
        [
            "id", "kind", "status", "raisedAt", "raisedBy", "owner", "specRef", "taskRef", "ticket"
        ]
    );
    assert!(text.contains("\ntaskRef:\n"));
}

#[test]
fn bare_values_stay_bare_and_the_rest_is_quoted() {
    let mut it = full();
    it.owner = "a: b".into();
    let text = format_item(&it);
    assert!(text.contains("id: Q-014\n"));
    assert!(text.contains("raisedAt: 2026-09-03\n"));
    assert!(text.contains("specRef: docs/openspec/specs/billing/spec.md#facturation\n"));
    assert!(text.contains("owner: \"a: b\"\n"));
    assert_eq!(parse_item(&it.path, &text).owner, "a: b");
    for v in ["po ", "Cédric Meyer", "x #y", "", "say \"hi\""] {
        it.owner = v.into();
        assert_eq!(parse_item(&it.path, &format_item(&it)).owner, v, "{v:?}");
    }
}

#[test]
fn a_multi_line_answer_an_unknown_section_and_an_unknown_key_survive() {
    let mut it = full();
    it.answer = "Line 1\n\nLine 2".into();
    it.consequence = String::new();
    it.extra = "## Notes\n\nTo review with the PO.".into();
    it.extra_fm = "severity: high\nprobability: 0.6".into();
    let text = format_item(&it);
    assert!(text.contains("severity: high"));
    assert_eq!(parse_item(&it.path, &text), it);
}

#[test]
fn a_hand_mangled_file_parses_and_degrades_to_none() {
    let text = "\u{feff}---\r\nkind: banana\r\nstatus: nope\r\nraisedBy: cedric\r\n---\r\n\
                ## Question\r\n\r\nBy month?\r\n\r\n## Conséquence\r\n\r\nNothing.\r\n";
    let it = parse_item("docs/delivery/questions/Q-021.md", text);
    // The id falls back to the file stem. The vocabulary never degrades to a plausible value.
    assert_eq!(it.id, "Q-021");
    assert_eq!((it.kind, it.status), (None, None));
    assert_eq!(it.raised_by, "cedric");
    assert_eq!(it.question, "By month?");
    assert_eq!(it.answer, "");
    assert_eq!(it.consequence, "Nothing.");
    assert!(it.flagged());
}

#[test]
fn a_missing_key_is_flagged_and_the_file_is_kept() {
    let it = parse_item(
        "q/Q-003.md",
        "---\nid: Q-003\nkind: question\nstatus: open\n---\n",
    );
    assert_eq!(
        it.missing,
        [
            "raisedAt", "raisedBy", "owner", "specRef", "taskRef", "ticket"
        ]
    );
    assert!(it.flagged());
    // A key with an empty value is present.
    let it = parse_item("q/Q-003.md", &format_item(&new_item("Q-003", "2026-10-29")));
    assert!(it.missing.is_empty() && !it.flagged());
}

#[test]
fn text_before_the_first_heading_is_kept_and_a_key_with_a_space_is_ignored() {
    let it = parse_item(
        "q.md",
        "---\nid: Q-002\n---\nDraft.\n\n## Question\n\nWhat?\n",
    );
    assert_eq!(it.extra, "Draft.");
    assert_eq!(
        parse_item("q/draft.md", "---\nid : Q-014\n---\n").id,
        "draft"
    );
}

#[test]
fn a_heading_in_a_body_or_a_fence_never_splits_a_section() {
    let mut it = full();
    it.question = "Need a fallback?\n\n## Answer\n\nYes".into();
    it.answer = "The real one.".into();
    assert_eq!(parse_item(&it.path, &format_item(&it)), it);

    let mut it = full();
    it.answer = "Model:\n\n```md\n## Consequence\nNone.\n```".into();
    let text = format_item(&it);
    assert!(text.contains("\n## Consequence\nNone.\n```"));
    assert_eq!(parse_item(&it.path, &text), it);
}

#[test]
fn a_french_heading_lands_in_its_section() {
    let it = parse_item("Q-1.md", "---\nid: Q-001\n---\n## Réponse\n\nOui.\n");
    assert_eq!(it.answer, "Oui.");
}

#[test]
fn the_lifecycle_table() {
    use Status::*;
    for (a, b, ok) in [
        (Open, Assigned, true),
        (Open, Answered, true),
        (Open, Folded, false),
        (Assigned, Open, true),
        (Answered, Folded, true),
        (Answered, Open, false),
        (Folded, Open, true),
        (Folded, Answered, false),
        (Open, Open, true),
        (Open, Withdrawn, true),
        (Assigned, Withdrawn, true),
        (Answered, Withdrawn, false),
        (Withdrawn, Open, true),
        (Withdrawn, Answered, false),
    ] {
        assert_eq!(can_transition(Some(a), b), ok, "{a:?} -> {b:?}");
    }
    // A mangled file gets back into the machine through `open` only.
    assert!(can_transition(None, Open));
    assert!(!can_transition(None, Answered));
}

#[test]
fn the_next_id_is_one_above_the_highest() {
    assert_eq!(next_id(&[], &[]), "Q-001");
    let files = [
        file("d/Q-001.md", "---\nid: Q-001\n---\n"),
        file("d/Q-012.md", "---\nid: Q-012\n---\n"),
    ];
    assert_eq!(next_id(&files, &[]), "Q-013");
    // A hole is never reused.
    let files = [file("d/Q-001.md", ""), file("d/Q-003.md", "")];
    assert_eq!(next_id(&files, &[]), "Q-004");
    // A file renamed by hand counts by the higher of its stem and its `id`.
    let files = [file("d/Q-005.md", "---\nid: Q-009\n---\n")];
    assert_eq!(next_id(&files, &[]), "Q-010");
    let files = [file("d/Q-020.md", "---\nid: Q-002\n---\n")];
    assert_eq!(next_id(&files, &[]), "Q-021");
    // An id from the ticket comments counts too (Q-026, option 1).
    assert_eq!(next_id(&files, &["Q-030".into(), "junk".into()]), "Q-031");
    // Lower case and padding beyond 3 digits.
    assert_eq!(next_id(&[file("d/q-999.md", "")], &[]), "Q-1000");
}

#[test]
fn the_register_lists_by_number_and_a_missing_folder_is_empty() {
    let dir = tempfile::tempdir().unwrap();
    assert!(list_register(dir.path()).unwrap().is_empty());
    let d = dir.path().join(QUESTIONS_DIR);
    std::fs::create_dir_all(&d).unwrap();
    for n in ["Q-010.md", "Q-002.md", "notes.md", "skip.txt"] {
        std::fs::write(d.join(n), "---\n---\n").unwrap();
    }
    let paths: Vec<_> = list_register(dir.path())
        .unwrap()
        .into_iter()
        .map(|f| f.path)
        .collect();
    assert_eq!(
        paths,
        [
            "docs/delivery/questions/Q-002.md",
            "docs/delivery/questions/Q-010.md",
            "docs/delivery/questions/notes.md"
        ]
    );
}

#[test]
fn create_allocates_writes_and_never_overwrites() {
    let dir = tempfile::tempdir().unwrap();
    let a = create(dir.path(), new_item("", "2026-10-29"), &[]).unwrap();
    assert_eq!(
        (a.id.as_str(), a.path.as_str()),
        ("Q-001", "docs/delivery/questions/Q-001.md")
    );
    let before = std::fs::read(dir.path().join(&a.path)).unwrap();
    let b = create(dir.path(), new_item("", "2026-10-29"), &["Q-007".into()]).unwrap();
    assert_eq!(b.id, "Q-008");
    assert_eq!(std::fs::read(dir.path().join(&a.path)).unwrap(), before);
    assert_eq!(read(dir.path(), "Q-001").unwrap().unwrap().id, "Q-001");
    assert!(read(dir.path(), "Q-404").unwrap().is_none());
    // A hand file that is not valid UTF-8 still counts by its name.
    std::fs::write(dir.path().join(item_path("Q-050")), [0xff, 0xfe, 0x00]).unwrap();
    assert_eq!(
        create(dir.path(), new_item("", ""), &[]).unwrap().id,
        "Q-051"
    );
    // A value outside the vocabulary is refused.
    let mut bad = new_item("", "");
    bad.status = None;
    assert!(create(dir.path(), bad, &[]).is_err());
}

#[test]
fn eight_writers_get_eight_ids() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let ids: Vec<String> = (0..8)
        .map(|_| {
            let root = root.clone();
            std::thread::spawn(move || create(&root, new_item("", "2026-10-29"), &[]).unwrap().id)
        })
        .collect::<Vec<_>>()
        .into_iter()
        .map(|h| h.join().unwrap())
        .collect();
    let mut sorted = ids.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), 8, "{ids:?}");
    assert_eq!(list_register(&root).unwrap().len(), 8);
}

#[test]
fn save_checks_the_vocabulary_the_lifecycle_and_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let mut q = create(dir.path(), new_item("", "2026-10-29"), &[]).unwrap();
    // The answer goes in.
    let a = answer(dir.path(), &q.id, "Option 2.").unwrap();
    assert_eq!(
        (a.status, a.answer.as_str()),
        (Some(Status::Answered), "Option 2.")
    );
    assert_eq!(read(dir.path(), &q.id).unwrap().unwrap(), a);
    // Answered goes back to open: refused, and the file stays.
    q.status = Some(Status::Open);
    assert!(save(dir.path(), &q).is_err());
    assert_eq!(
        read(dir.path(), &q.id).unwrap().unwrap().status,
        Some(Status::Answered)
    );
    // Unknown vocabulary: refused.
    q.status = None;
    assert!(save(dir.path(), &q).is_err());
    // A file that does not exist is never created by `save`.
    let mut ghost = new_item("Q-099", "");
    ghost.status = Some(Status::Open);
    assert!(save(dir.path(), &ghost).is_err());
    assert!(!dir.path().join(item_path("Q-099")).exists());
    // An id that is no Q-NNN is refused: no path escape.
    ghost.id = "../x".into();
    assert!(save(dir.path(), &ghost).is_err());
    // Folded: a second answer is refused.
    let mut f = read(dir.path(), "Q-001").unwrap().unwrap();
    f.status = Some(Status::Folded);
    save(dir.path(), &f).unwrap();
    assert!(answer(dir.path(), "Q-001", "x").is_err());
}

#[test]
fn a_core_question_becomes_a_file_with_its_options() {
    let q = Question::new(
        "Q-013",
        "Which scope?",
        vec!["Small".into(), "Large".into(), "Both".into()],
        2,
        false,
        Some("spec:projects#REQ-003".into()),
    )
    .unwrap();
    let it = from_question(&q, "2026-10-29", "shipyard", "SHIP-42");
    assert_eq!(
        (it.id.as_str(), it.spec_ref.as_str(), it.ticket.as_str()),
        ("Q-013", "spec:projects#REQ-003", "SHIP-42")
    );
    assert_eq!(
        (it.kind, it.status),
        (Some(Kind::Question), Some(Status::Open))
    );
    assert_eq!(
        it.question,
        "Which scope?\n\nOptions:\n1. Small\n2. Large (recommended)\n3. Both"
    );
    assert_eq!(parse_item(&it.path, &format_item(&it)), it);
}

/// The register of this repository is hand written. Each file must read clean.
#[test]
fn the_real_register_of_this_repository_reads_clean() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let files = list_register(&root).unwrap();
    assert!(files.len() > 40, "{}", files.len());
    for f in &files {
        let it = parse_item(&f.path, &f.text);
        assert!(
            !it.flagged(),
            "{}: {:?} {:?} {:?}",
            f.path,
            it.kind,
            it.status,
            it.missing
        );
        assert!(f.path.ends_with(&format!("{}.md", it.id)), "{}", f.path);
    }
}

fn question_file(dir: &std::path::Path, status: &str) -> std::path::PathBuf {
    let p = dir.join("Q-001.md");
    std::fs::write(
        &p,
        format!(
            "---\nid: Q-001\nkind: question\nstatus: {status}\nraised_at: 2026-10-29\nraised_by: ana\nowner: ana\nspec_ref: \ntask_ref: \nticket: \nx_extra: keep\n---\n# Which provider?\nBody stays.\n"
        ),
    )
    .unwrap();
    p
}

#[test]
fn an_answered_question_becomes_folded_and_keeps_its_other_text() {
    let d = tempfile::tempdir().unwrap();
    let p = question_file(d.path(), "answered");
    mark_folded(&p).unwrap();
    let text = std::fs::read_to_string(&p).unwrap();
    assert!(
        text.contains("status: folded\n") && !text.contains("answered"),
        "{text}"
    );
    assert!(text.contains("x_extra: keep") && text.ends_with("# Which provider?\nBody stays.\n"));
    // A second call changes nothing.
    mark_folded(&p).unwrap();
    assert_eq!(std::fs::read_to_string(&p).unwrap(), text);
}

#[test]
fn only_an_answered_question_moves_to_folded() {
    for status in ["open", "assigned", "withdrawn", "folded"] {
        let d = tempfile::tempdir().unwrap();
        let p = question_file(d.path(), status);
        let before = std::fs::read_to_string(&p).unwrap();
        mark_folded(&p).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), before, "{status}");
    }
    assert!(mark_folded(std::path::Path::new("/no/such/Q-001.md")).is_err());
}
