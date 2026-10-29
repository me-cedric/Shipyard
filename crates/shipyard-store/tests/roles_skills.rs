//! The roles and skills list (spec `extensions`, REQ-008).

use std::fs;

use shipyard_store::roles_skills::{RowKind, list};

#[test]
fn lists_roles_with_their_workflows_and_skills_with_their_loaders() {
    let d = tempfile::tempdir().unwrap();
    let r = d.path();
    shipyard_store::factory_files::seed(r).unwrap();
    fs::create_dir_all(r.join(".agents/skills/review")).unwrap();
    fs::create_dir_all(r.join(".claude/skills/review")).unwrap();
    fs::write(r.join(".agents/skills/review/SKILL.md"), "x").unwrap();
    fs::write(r.join(".claude/skills/review/SKILL.md"), "x").unwrap();
    fs::remove_file(r.join(".shipyard/roles/worker.md")).unwrap();
    fs::write(
        r.join(".shipyard/roles/reviewer.md"),
        "---\ndescription: d\n---\nbody",
    )
    .unwrap();
    let rows = list(r).unwrap();
    let reviewer = rows.iter().find(|x| x.name == "reviewer").unwrap();
    assert_eq!(reviewer.kind, RowKind::Role);
    assert_eq!(
        reviewer.path.as_deref(),
        Some(".shipyard/roles/reviewer.md")
    );
    assert!(reviewer.used_by.contains(&"review-only".to_string()));
    let worker = rows.iter().find(|x| x.name == "worker").unwrap();
    assert_eq!(worker.path, None);
    let skills: Vec<_> = rows.iter().filter(|x| x.kind == RowKind::Skill).collect();
    assert_eq!(skills.len(), 1, "the same skill in two folders shows once");
    assert_eq!(skills[0].loaders, ["factory", "assistant"]);
}
