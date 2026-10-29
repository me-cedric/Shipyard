//! The compass rules and the skills of a project, for each assistant turn (spec `assistant`,
//! REQ-013; `extensions` REQ-008). The turn calls [`load`] once, before the runner starts, so a
//! changed file applies from the next turn and never in a turn that runs.
//!
//! Rules: the text between `<!-- compass:begin -->` and `<!-- compass:end -->` in `AGENTS.md` and
//! `CLAUDE.md`. Skills: `.claude/skills/*/SKILL.md` and `.agents/skills/*/SKILL.md`, by name and
//! description. The runner reads a skill file itself when it needs it.

use std::path::Path;

const BEGIN: &str = "<!-- compass:begin -->";
const END: &str = "<!-- compass:end -->";
const SKILL_DIRS: [&str; 2] = [".claude/skills", ".agents/skills"];
/// The prompt stays small: more skills than this are left out of the list.
const MAX_SKILLS: usize = 40;
const MAX_DESCRIPTION: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skill {
    pub name: String,
    pub description: String,
    /// Relative to the project root, with `/`.
    pub path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Rules {
    pub compass: String,
    pub skills: Vec<Skill>,
}

fn between(text: &str) -> Option<&str> {
    let from = text.find(BEGIN)? + BEGIN.len();
    let len = text[from..].find(END)?;
    Some(text[from..from + len].trim())
}

fn front(text: &str, key: &str) -> Option<String> {
    let body = text.strip_prefix("---")?;
    let head = &body[..body.find("\n---")?];
    head.lines()
        .find_map(|l| l.strip_prefix(&format!("{key}:")))
        .map(|v| v.trim().trim_matches(['"', '\'']).to_string())
}

pub fn load(root: &Path) -> Rules {
    let mut compass = String::new();
    for file in ["AGENTS.md", "CLAUDE.md"] {
        let Ok(text) = std::fs::read_to_string(root.join(file)) else {
            continue;
        };
        // The two files often hold the same block: it goes in once.
        if let Some(block) = between(&text).filter(|b| !b.is_empty() && !compass.contains(b)) {
            compass.push_str(block);
            compass.push_str("\n\n");
        }
    }
    let mut skills: Vec<Skill> = Vec::new();
    for dir in SKILL_DIRS {
        let Ok(rd) = std::fs::read_dir(root.join(dir)) else {
            continue;
        };
        let mut found: Vec<_> = rd.filter_map(|e| e.ok()).collect();
        found.sort_by_key(|e| e.file_name());
        for e in found {
            let file = e.path().join("SKILL.md");
            let Ok(text) = std::fs::read_to_string(&file) else {
                continue;
            };
            let dir_name = e.file_name().to_string_lossy().into_owned();
            let name = front(&text, "name").unwrap_or_else(|| dir_name.clone());
            if skills.iter().any(|s| s.name == name) {
                continue;
            }
            skills.push(Skill {
                description: front(&text, "description")
                    .unwrap_or_default()
                    .chars()
                    .take(MAX_DESCRIPTION)
                    .collect(),
                path: format!("{dir}/{dir_name}/SKILL.md"),
                name,
            });
        }
    }
    skills.truncate(MAX_SKILLS);
    Rules {
        compass: compass.trim().to_string(),
        skills,
    }
}

impl Rules {
    /// The text that opens the prompt of a turn. Empty when the project has neither.
    pub fn render(&self) -> String {
        let mut out = String::new();
        if !self.compass.is_empty() {
            out.push_str("Project rules:\n");
            out.push_str(&self.compass);
            out.push_str("\n\n");
        }
        if !self.skills.is_empty() {
            out.push_str("Project skills (read the file when one applies):\n");
            for s in &self.skills {
                out.push_str(&format!("- {}: {} ({})\n", s.name, s.description, s.path));
            }
        }
        out.trim_end().to_string()
    }
}
