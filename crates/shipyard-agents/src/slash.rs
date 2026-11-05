//! The slash commands of a runner, for the composer of the assistant: the files that the CLI
//! itself reads. A command never runs here. The panel puts `/name ` in the message and the CLI
//! gets the text as typed.

use std::fs;
use std::path::Path;

use serde::Serialize;
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum SlashSource {
    BuiltIn,
    Project,
    Personal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SlashCommand {
    /// The name without the `/`.
    pub name: String,
    /// The `description` of the front matter.
    pub description: Option<String>,
    pub source: SlashSource,
}

/// The built-ins of Claude Code that work in a headless run (`claude -p`). shortcut: a fixed
/// list, replace it when the CLI reports its commands in the init event.
const CLAUDE_BUILT_IN: [&str; 6] = [
    "compact",
    "context",
    "cost",
    "init",
    "review",
    "security-review",
];

/// The `description` of a front matter block. shortcut: one line, or the first line after `>`
/// or `|`; no other YAML.
fn description(text: &str) -> Option<String> {
    let mut lines = text.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let body: Vec<&str> = lines.take_while(|l| l.trim() != "---").collect();
    let at = body.iter().position(|l| l.starts_with("description:"))?;
    let value = body[at]["description:".len()..].trim();
    let value = if matches!(value, "" | ">" | "|" | ">-" | "|-") {
        body.get(at + 1)?.trim()
    } else {
        value
    };
    let value = value.trim_matches(|c| c == '"' || c == '\'');
    (!value.is_empty()).then(|| value.to_string())
}

/// The scan stops at this depth and at this many files. A link is never followed.
const MAX_DEPTH: usize = 4;
const MAX_FILES: usize = 500;

/// `*.md` files under `dir`, in sub folders too: the file name without the extension, and the
/// description. A link is skipped, so the scan stays in the folder.
fn markdown(dir: &Path, depth: usize, out: &mut Vec<(String, Option<String>)>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for e in read.flatten() {
        if out.len() >= MAX_FILES {
            return;
        }
        let (path, Ok(kind)) = (e.path(), e.file_type()) else {
            continue;
        };
        if kind.is_dir() {
            if depth < MAX_DEPTH {
                markdown(&path, depth + 1, out);
            }
        } else if kind.is_file()
            && path.extension().is_some_and(|x| x == "md")
            && let Some(stem) = path.file_stem().and_then(|s| s.to_str())
        {
            let text = fs::read_to_string(&path).unwrap_or_default();
            out.push((stem.to_string(), description(&text)));
        }
    }
}

/// `<dir>/*/SKILL.md`: the folder name, and the description. A linked folder or file is skipped.
fn skills(dir: &Path, out: &mut Vec<(String, Option<String>)>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for e in read.flatten().take(MAX_FILES) {
        let file = e.path().join("SKILL.md");
        let plain = e.file_type().is_ok_and(|k| k.is_dir())
            && fs::symlink_metadata(&file).is_ok_and(|m| m.is_file());
        if plain
            && let Ok(text) = fs::read_to_string(&file)
            && let Some(name) = e.file_name().to_str()
        {
            out.push((name.to_string(), description(&text)));
        }
    }
}

/// The commands of a runner, sorted by name. A project command hides a personal one of the same
/// name. A runner with no command files gets an empty list.
pub fn list(runner: &str, root: &Path, home: &Path) -> Vec<SlashCommand> {
    let mut found: Vec<SlashCommand> = Vec::new();
    let mut add = |items: Vec<(String, Option<String>)>, prefix: &str, source| {
        for (name, description) in items {
            let name = format!("{prefix}{name}");
            if !found.iter().any(|c| c.name == name) {
                found.push(SlashCommand {
                    name,
                    description,
                    source,
                });
            }
        }
    };
    match runner {
        "claude" => {
            for (base, source) in [
                (root.join(".claude"), SlashSource::Project),
                (home.join(".claude"), SlashSource::Personal),
            ] {
                let (mut cmds, mut sk) = (Vec::new(), Vec::new());
                markdown(&base.join("commands"), 0, &mut cmds);
                skills(&base.join("skills"), &mut sk);
                add(cmds, "", source);
                add(sk, "", source);
            }
            add(
                CLAUDE_BUILT_IN
                    .iter()
                    .map(|n| (n.to_string(), None))
                    .collect(),
                "",
                SlashSource::BuiltIn,
            );
        }
        "codex" => {
            let mut prompts = Vec::new();
            markdown(&home.join(".codex/prompts"), 0, &mut prompts);
            add(prompts, "prompts:", SlashSource::Personal);
        }
        _ => {}
    }
    found.sort_by(|a, b| a.name.cmp(&b.name));
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn claude_lists_commands_skills_and_built_ins_and_a_project_name_wins() {
        let t = tempfile::tempdir().unwrap();
        let (root, home) = (t.path().join("p"), t.path().join("h"));
        write(
            &root.join(".claude/commands/ui/fix.md"),
            "---\ndescription: \"Fix the UI\"\n---\nbody",
        );
        write(&root.join(".claude/commands/plain.md"), "no front matter");
        write(
            &home.join(".claude/commands/fix.md"),
            "---\ndescription: Personal\n---\n",
        );
        write(
            &home.join(".claude/skills/tidy/SKILL.md"),
            "---\nname: tidy\ndescription: >\n  Tidy the code\n---\n",
        );
        let list = list("claude", &root, &home);
        let get = |n: &str| list.iter().find(|c| c.name == n).unwrap();
        assert_eq!(get("fix").description.as_deref(), Some("Fix the UI"));
        assert_eq!(get("fix").source, SlashSource::Project);
        assert_eq!(get("plain").description, None);
        assert_eq!(get("tidy").description.as_deref(), Some("Tidy the code"));
        assert_eq!(get("tidy").source, SlashSource::Personal);
        assert_eq!(get("compact").source, SlashSource::BuiltIn);
        assert_eq!(list.iter().filter(|c| c.name == "fix").count(), 1);
        let names: Vec<_> = list.iter().map(|c| &c.name).collect();
        assert!(names.windows(2).all(|w| w[0] <= w[1]), "sorted");
    }

    #[test]
    fn codex_lists_the_personal_prompts_and_other_runners_none() {
        let t = tempfile::tempdir().unwrap();
        write(
            &t.path().join(".codex/prompts/review.md"),
            "---\ndescription: Review it\n---\n",
        );
        let list = list("codex", t.path(), t.path());
        assert_eq!(
            list,
            [SlashCommand {
                name: "prompts:review".into(),
                description: Some("Review it".into()),
                source: SlashSource::Personal
            }]
        );
        assert!(super::list("gemini", t.path(), t.path()).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn links_are_not_followed_and_the_scan_has_a_depth_and_a_file_cap() {
        let t = tempfile::tempdir().unwrap();
        let (root, home) = (t.path().join("p"), t.path().join("h"));
        let out = t.path().join("out");
        write(&out.join("secret.md"), "---\ndescription: leak\n---\n");
        write(&out.join("sk/SKILL.md"), "---\ndescription: leak\n---\n");
        let cmds = root.join(".claude/commands");
        write(&cmds.join("ok.md"), "x");
        fs::create_dir_all(root.join(".claude/skills")).unwrap();
        std::os::unix::fs::symlink(&out, cmds.join("linked")).unwrap();
        std::os::unix::fs::symlink(out.join("secret.md"), cmds.join("file.md")).unwrap();
        std::os::unix::fs::symlink(out.join("sk"), root.join(".claude/skills/sk")).unwrap();
        write(&cmds.join("a/b/c/d/e/deep.md"), "x");
        for i in 0..MAX_FILES + 20 {
            write(&cmds.join(format!("many/{i}.md")), "x");
        }
        let names: Vec<String> = list("claude", &root, &home)
            .into_iter()
            .map(|c| c.name)
            .collect();
        for gone in ["secret", "file", "sk", "deep"] {
            assert!(!names.contains(&gone.to_string()), "{gone}");
        }
        // The cap holds the commands; the built-ins come on top.
        assert!(names.len() <= MAX_FILES + CLAUDE_BUILT_IN.len());
    }
}
