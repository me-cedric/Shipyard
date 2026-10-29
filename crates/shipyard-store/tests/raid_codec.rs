//! RAID file codec tests (spec `specs`, REQ-008 to REQ-010).

use shipyard_store::raid::{Question, create, list, next_id, read, write};

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
    let (q, issues) = read(Q002);
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
    let (back, issues) = read(&write(&q).unwrap());
    assert!(issues.is_empty());
    assert_eq!(back, q);
}

#[test]
fn missing_key_is_an_issue_not_a_drop() {
    let (q, issues) = read("---\nid: Q-007\nkind: Risk\nstatus: open\n---\n# T\nb\n");
    assert_eq!(q.id, "Q-007");
    assert_eq!(q.kind, "risk");
    assert_eq!(q.title, "T");
    assert!(issues.iter().any(|i| i.contains("owner")), "{issues:?}");
    let (_, issues) = read("---\nid: Q-007\nkind: wish\n---\n");
    assert!(issues.iter().any(|i| i.contains("unknown kind")));
}

#[test]
fn reads_crlf_and_bom() {
    let (q, _) = read(&format!("\u{feff}{}", Q002.replace('\n', "\r\n")));
    assert_eq!(q.id, "Q-002");
    assert_eq!(q.status, "open");
}

#[test]
fn text_without_frontmatter_is_one_issue() {
    let (_, issues) = read("# just text\n");
    assert!(issues.iter().any(|i| i.contains("frontmatter")));
}

#[test]
fn list_create_and_next_id() {
    let dir = tempfile::tempdir().unwrap();
    assert!(list(dir.path()).is_empty());
    assert_eq!(next_id(&[]), "Q-001");
    create(dir.path(), &question("Q-002")).unwrap();
    create(dir.path(), &question("Q-010")).unwrap();
    std::fs::write(dir.path().join("Q-003.md"), "no frontmatter\n").unwrap();
    std::fs::write(dir.path().join("notes.txt"), "x").unwrap();
    let all = list(dir.path());
    let ids: Vec<_> = all.iter().map(|e| e.question.id.as_str()).collect();
    assert_eq!(ids, ["Q-002", "Q-003", "Q-010"]);
    assert!(!all[1].issues.is_empty());
    assert!(all[0].issues.is_empty());
    assert_eq!(next_id(&all), "Q-011");
}

#[test]
fn next_id_reads_the_frontmatter_id_too() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("renamed.md"), "---\nid: Q-042\n---\n").unwrap();
    assert_eq!(next_id(&list(dir.path())), "Q-043");
}

#[test]
fn create_rejects_a_duplicate_id() {
    let dir = tempfile::tempdir().unwrap();
    create(dir.path(), &question("Q-005")).unwrap();
    let e = create(dir.path(), &question("Q-005")).unwrap_err();
    assert!(e.to_string().contains("duplicate"), "{e}");
    std::fs::write(dir.path().join("odd.md"), "---\nid: Q-006\n---\n").unwrap();
    assert!(create(dir.path(), &question("Q-006")).is_err());
}
