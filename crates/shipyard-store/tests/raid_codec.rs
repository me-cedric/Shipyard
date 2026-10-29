//! RAID file codec tests (spec `specs`, REQ-008 to REQ-010).

use shipyard_store::raid::{
    KINDS, Kind, Question, STATUSES, Status, create_in, list, next_entry_id, read_text, write,
    write_over,
};

const Q002: &str = include_str!("../../../docs/delivery/questions/Q-002.md");

fn question(id: &str) -> Question {
    Question {
        id: id.into(),
        kind: "risk".into(),
        status: "open".into(),
        raised_at: "2026-10-29".into(),
        raised_by: "claude".into(),
        owner: "Cédric Meyer".into(),
        spec_ref: "docs/openspec/changes/add-specs/specs/specs/spec.md#REQ-019".into(),
        task_ref: String::new(),
        ticket: String::new(),
        title: "A title?".into(),
        body: "Body line.\n".into(),
    }
}

#[test]
fn real_file_round_trips_byte_for_byte() {
    let (q, issues) = read_text(Q002);
    assert!(issues.is_empty(), "{issues:?}");
    assert_eq!(q.id, "Q-002");
    assert_eq!(q.kind, "question");
    assert_eq!(q.owner, "Cédric Meyer");
    assert_eq!(q.title, "What is the default for automation writes?");
    assert_eq!(write(&q).unwrap(), Q002);
}

#[test]
fn writes_nine_keys_in_order() {
    let text = write(&question("Q-010")).unwrap();
    let keys: Vec<_> = text
        .lines()
        .skip(1)
        .take(9)
        .map(|l| l.split(':').next().unwrap())
        .collect();
    assert_eq!(
        keys,
        [
            "id", "kind", "status", "raisedAt", "raisedBy", "owner", "specRef", "taskRef", "ticket"
        ]
    );
    assert_eq!(text.lines().nth(11), Some("# A title?"));
}

#[test]
fn rejects_unknown_kind_status_and_id() {
    let mut q = question("Q-010");
    q.kind = "wish".into();
    assert!(write(&q).unwrap_err().contains("kind"));
    let mut q = question("Q-010");
    q.status = "done".into();
    assert!(write(&q).unwrap_err().contains("status"));
    assert!(write(&question("../x")).is_err());
}

#[test]
fn awkward_values_survive_a_round_trip() {
    let mut q = question("Q-010");
    q.owner = "a: b # c".into();
    q.ticket = " padded ".into();
    q.raised_by = "line\nbreak".into();
    let (back, issues) = read_text(&write(&q).unwrap());
    assert!(issues.is_empty());
    assert_eq!(back, q);
}

#[test]
fn missing_key_is_an_issue_not_a_drop() {
    let (q, issues) = read_text("---\nid: Q-007\nkind: Risk\nstatus: open\n---\n# T\nb\n");
    assert_eq!(q.id, "Q-007");
    assert_eq!(q.kind, "risk");
    assert_eq!(q.title, "T");
    assert!(issues.iter().any(|i| i.contains("owner")), "{issues:?}");
    let (_, issues) = read_text("---\nid: Q-007\nkind: wish\n---\n");
    assert!(issues.iter().any(|i| i.contains("unknown kind")));
}

#[test]
fn reads_crlf_and_bom() {
    let (q, _) = read_text(&format!("\u{feff}{}", Q002.replace('\n', "\r\n")));
    assert_eq!(q.id, "Q-002");
    assert_eq!(q.status, "open");
}

#[test]
fn text_without_frontmatter_is_one_issue() {
    let (_, issues) = read_text("# just text\n");
    assert!(issues.iter().any(|i| i.contains("frontmatter")));
}

#[test]
fn list_create_and_next_id() {
    let dir = tempfile::tempdir().unwrap();
    assert!(list(dir.path()).is_empty());
    assert_eq!(next_entry_id(&[]), "Q-001");
    create_in(dir.path(), &question("Q-002")).unwrap();
    create_in(dir.path(), &question("Q-010")).unwrap();
    std::fs::write(dir.path().join("Q-003.md"), "no frontmatter\n").unwrap();
    std::fs::write(dir.path().join("notes.txt"), "x").unwrap();
    let all = list(dir.path());
    let ids: Vec<_> = all.iter().map(|e| e.question.id.as_str()).collect();
    assert_eq!(ids, ["Q-002", "Q-003", "Q-010"]);
    assert!(!all[1].issues.is_empty());
    assert!(all[0].issues.is_empty());
    assert_eq!(next_entry_id(&all), "Q-011");
}

#[test]
fn next_id_reads_the_frontmatter_id_too() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("renamed.md"), "---\nid: Q-042\n---\n").unwrap();
    assert_eq!(next_entry_id(&list(dir.path())), "Q-043");
}

#[test]
fn create_rejects_a_duplicate_id() {
    let dir = tempfile::tempdir().unwrap();
    create_in(dir.path(), &question("Q-005")).unwrap();
    let e = create_in(dir.path(), &question("Q-005")).unwrap_err();
    assert!(e.to_string().contains("duplicate"), "{e}");
    std::fs::write(dir.path().join("odd.md"), "---\nid: Q-006\n---\n").unwrap();
    assert!(create_in(dir.path(), &question("Q-006")).is_err());
}

#[test]
fn an_extra_frontmatter_line_survives_a_save() {
    let old = write(&question("Q-010")).unwrap().replacen(
        "ticket: \n---",
        "ticket: \nanswerAt: 2026-11-01\n# keep\n---",
        1,
    );
    assert!(old.contains("answerAt"), "{old}");
    let (q, _) = read_text(&old);
    assert_eq!(write_over(&q, &old).unwrap(), old);
    assert!(!write(&q).unwrap().contains("answerAt"));
}

#[test]
fn the_vocabulary_of_the_view_is_the_vocabulary_of_the_codec() {
    assert!(
        KINDS
            .iter()
            .all(|k| Kind::parse(k).is_some_and(|v| v.as_str() == *k))
    );
    assert!(
        STATUSES
            .iter()
            .all(|s| Status::parse(s).is_some_and(|v| v.as_str() == *s))
    );
    let mut q = question("Q-010");
    for (kind, status) in [("decision", "withdrawn"), ("question", "folded")] {
        q.kind = kind.into();
        q.status = status.into();
        assert!(write(&q).is_ok());
    }
}
