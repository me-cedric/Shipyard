//! Rules and skills load at the start of each turn (spec `assistant`, REQ-013).

use shipyard_agents::assistant_rules::load;
use std::fs;

fn write(root: &std::path::Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

#[test]
fn the_compass_block_and_the_skills_of_the_project_load() {
    let d = tempfile::tempdir().unwrap();
    let block = "<!-- compass:begin -->\nRule one.\n<!-- compass:end -->";
    write(d.path(), "AGENTS.md", &format!("# Mine\n{block}\nafter"));
    write(d.path(), "CLAUDE.md", &format!("{block}\n"));
    write(
        d.path(),
        ".claude/skills/ponytail/SKILL.md",
        "---\nname: ponytail\ndescription: \"Least code.\"\n---\nbody that stays out",
    );
    write(
        d.path(),
        ".agents/skills/ponytail/SKILL.md",
        "---\nname: ponytail\n---\n",
    );
    write(d.path(), ".agents/skills/adr/SKILL.md", "no front matter");
    let r = load(d.path());
    assert_eq!(r.compass, "Rule one.", "the same block goes in once");
    let names: Vec<_> = r.skills.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(names, ["ponytail", "adr"], "a name goes in once");
    assert_eq!(r.skills[0].description, "Least code.");
    let text = r.render();
    assert!(text.contains("Rule one.") && text.contains(".claude/skills/ponytail/SKILL.md"));
    assert!(!text.contains("body that stays out"));
}

#[test]
fn a_project_with_no_rules_gives_an_empty_text_and_a_changed_rule_shows_at_the_next_load() {
    let d = tempfile::tempdir().unwrap();
    assert_eq!(load(d.path()).render(), "");
    let file = |t: &str| format!("<!-- compass:begin -->\n{t}\n<!-- compass:end -->");
    write(d.path(), "AGENTS.md", &file("old"));
    let turn_one = load(d.path()).render();
    write(d.path(), "AGENTS.md", &file("new"));
    // The first turn holds its text: the file change does not reach it.
    assert!(turn_one.contains("old") && !turn_one.contains("new"));
    assert!(load(d.path()).render().contains("new"));
}
