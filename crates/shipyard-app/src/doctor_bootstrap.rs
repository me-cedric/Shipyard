//! Doctor bootstrap form: set up the tools and the files of a new project in one guided step.
//! The answers go in `agent-compass.answers.json`, with a spec-first `BOOTSTRAP_PROMPT.md`. The
//! files are built in Rust. The preview shows each file and says if it is new. The write
//! follows one click, never replaces a file, and a read-only project takes none.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use shipyard_core::project::{PROJECT_FILE, ProjectFile, validate};
use shipyard_store::project::render_project_file;
use specta::Type;

use crate::commands::{Res, blocking, err};
use crate::doctor::{ToolCheck, tools};

const PROMPT: &str = "BOOTSTRAP_PROMPT.md";
const ANSWERS: &str = "agent-compass.answers.json";
const STACKS: [&str; 4] = ["rust", "node", "python", "other"];
const AGENTS: [&str; 2] = ["claude", "codex"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapAnswers {
    pub name: String,
    pub key: String,
    pub summary: String,
    /// `rust`, `node`, `python` or `other`.
    pub stack: String,
    /// `claude` or `codex`.
    pub agent: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlannedFile {
    pub path: String,
    /// `new`, or `exists` (it stays as it is).
    pub state: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPlan {
    pub files: Vec<PlannedFile>,
    /// The tools that this stack and this agent need, with their state.
    pub tools: Vec<ToolCheck>,
}

fn gates(stack: &str) -> Vec<String> {
    match stack {
        "rust" => vec!["cargo test".into(), "cargo clippy".into()],
        "node" => vec!["pnpm test".into(), "pnpm lint".into()],
        "python" => vec!["pytest".into()],
        _ => Vec::new(),
    }
}

fn needed(stack: &str, agent: &str) -> Vec<&'static str> {
    let mut ids = vec!["git"];
    match stack {
        "rust" => ids.push("rust"),
        "node" => ids.extend(["node", "pnpm"]),
        _ => {}
    }
    ids.push(if agent == "codex" { "codex" } else { "claude" });
    ids
}

fn check(a: &BootstrapAnswers) -> Res<ProjectFile> {
    if a.summary.len() > 2000 || a.summary.contains('\0') {
        return Err("the summary is too long".into());
    }
    if !STACKS.contains(&a.stack.as_str()) || !AGENTS.contains(&a.agent.as_str()) {
        return Err("unknown stack or agent".into());
    }
    let mut f = ProjectFile::new(a.name.trim(), a.key.trim());
    f.gates = gates(&a.stack);
    match validate(&f).first() {
        Some(i) => Err(format!("{} is not valid", i.field)),
        None => Ok(f),
    }
}

/// The files for the answers, and the state of each against `root`. Nothing is written.
pub fn plan(root: &Path, a: &BootstrapAnswers) -> Res<BootstrapPlan> {
    let f = check(a)?;
    let summary = a.summary.trim();
    let prompt = format!(
        "# Build {name}\n\n{summary}\n\nStack: {stack}. Agent: {agent}.\n\n\
         Work spec first: write `docs/openspec/changes/000-project/` and stop for approval \
         before you scaffold any code. Then build in small steps, and run these checks after \
         each one: {checks}.\n",
        name = f.name,
        stack = a.stack,
        agent = a.agent,
        checks = if f.gates.is_empty() {
            "the checks of the stack".into()
        } else {
            f.gates.join(", ")
        },
    );
    let agents = format!(
        "# {name}\n\n{summary}\n\n- Start from `{PROMPT}`.\n- Run the checks before each commit.\n",
        name = f.name
    );
    let answers = serde_json::to_string_pretty(a).map_err(err)? + "\n";
    let files = [
        (PROJECT_FILE, render_project_file(&f).map_err(err)?),
        ("AGENTS.md", agents),
        (PROMPT, prompt),
        (ANSWERS, answers),
    ]
    .into_iter()
    .map(|(path, content)| PlannedFile {
        state: if root.join(path).exists() {
            "exists"
        } else {
            "new"
        }
        .into(),
        path: path.into(),
        content,
    })
    .collect();
    let wanted = needed(&a.stack, &a.agent);
    Ok(BootstrapPlan {
        files,
        tools: tools()
            .into_iter()
            .filter(|t| wanted.contains(&t.id.as_str()))
            .collect(),
    })
}

/// Write the new files. A file that exists stays. Returns the paths that were written.
pub fn apply(root: &Path, a: &BootstrapAnswers) -> Res<Vec<String>> {
    use std::io::Write;
    let mut done = Vec::new();
    for f in plan(root, a)?
        .files
        .into_iter()
        .filter(|f| f.state == "new")
    {
        let full: PathBuf = root.join(&f.path);
        if let Some(dir) = full.parent() {
            std::fs::create_dir_all(dir).map_err(err)?;
        }
        // `create_new` fails when a file appeared since the preview: it is never replaced.
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&full)
        {
            Ok(mut file) => file.write_all(f.content.as_bytes()).map_err(err)?,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(err(e)),
        }
        done.push(f.path);
    }
    Ok(done)
}

fn root(s: &crate::commands::AppState) -> Res<PathBuf> {
    Ok(crate::design::project(s)?.root)
}

#[tauri::command]
#[specta::specta]
pub async fn doctor_bootstrap_plan(
    app: tauri::AppHandle,
    answers: BootstrapAnswers,
) -> Res<BootstrapPlan> {
    blocking(app, move |s| plan(&root(s)?, &answers)).await
}

#[tauri::command]
#[specta::specta]
pub async fn doctor_bootstrap_apply(
    app: tauri::AppHandle,
    answers: BootstrapAnswers,
    click: bool,
) -> Res<Vec<String>> {
    blocking(app, move |s| {
        crate::work::need_click(s, click)?;
        apply(&root(s)?, &answers)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn answers() -> BootstrapAnswers {
        BootstrapAnswers {
            name: "Demo".into(),
            key: "DEMO".into(),
            summary: "A demo.".into(),
            stack: "rust".into(),
            agent: "claude".into(),
        }
    }

    #[test]
    fn the_plan_marks_new_files_and_apply_never_replaces_one() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("AGENTS.md"), "mine").unwrap();
        let p = plan(dir.path(), &answers()).unwrap();
        let state = |n: &str| p.files.iter().find(|f| f.path == n).unwrap().state.clone();
        assert_eq!(
            (state("AGENTS.md").as_str(), state(PROMPT).as_str()),
            ("exists", "new")
        );
        assert!(p.tools.iter().any(|t| t.id == "git") && p.tools.iter().any(|t| t.id == "rust"));
        let done = apply(dir.path(), &answers()).unwrap();
        assert!(!done.contains(&"AGENTS.md".to_string()) && done.contains(&PROMPT.to_string()));
        assert_eq!(
            std::fs::read_to_string(dir.path().join("AGENTS.md")).unwrap(),
            "mine"
        );
        assert!(dir.path().join(PROJECT_FILE).is_file());
        assert!(apply(dir.path(), &answers()).unwrap().is_empty());
    }

    #[test]
    fn a_bad_answer_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        for bad in [
            BootstrapAnswers {
                name: " ".into(),
                ..answers()
            },
            BootstrapAnswers {
                key: "x y".into(),
                ..answers()
            },
            BootstrapAnswers {
                stack: "cobol".into(),
                ..answers()
            },
            BootstrapAnswers {
                agent: "rm".into(),
                ..answers()
            },
        ] {
            assert!(plan(dir.path(), &bad).is_err());
        }
    }
}
