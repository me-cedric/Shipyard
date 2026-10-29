//! The factory files of a repository: workflows in `.shipyard/workflows/<id>.yaml`, roles in
//! `.shipyard/roles/<role>.md`, the defaults that seed them, and the reload that keeps the last
//! valid version of a file (spec `factory`, REQ-010, REQ-011, REQ-014). The models live in
//! `shipyard_core::workflow`. The schema file and the serde model say the same: an unknown field
//! is a refusal. `Workflow::check` adds the rules that a schema cannot say.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use shipyard_core::workflow::{DEFAULT_ROLES, Effort, Workflow, WorkflowIssue};
use specta::Type;

use crate::Result;
use crate::project::{line_of, write_atomic};

pub const WORKFLOWS_DIR: &str = ".shipyard/workflows";
pub const ROLES_DIR: &str = ".shipyard/roles";

macro_rules! templates {
    ($dir:literal: $($name:literal $ext:literal),+) => {
        &[$(($name, include_str!(concat!("../templates/factory/", $dir, "/", $name, ".", $ext)))),+]
    };
}

const WORKFLOWS: &[(&str, &str)] = templates!("workflows": "feature" "yaml", "bug" "yaml", "spike" "yaml", "spec-split" "yaml", "review-only" "yaml");
const ROLES: &[(&str, &str)] = templates!("roles": "scout" "md", "worker" "md", "reviewer" "md", "planner" "md", "tester" "md", "docs" "md", "triager" "md");

/// `(id, yaml)` of the five workflows that ship.
pub fn default_workflows() -> &'static [(&'static str, &'static str)] {
    WORKFLOWS
}

/// `(name, markdown)` of the seven roles that ship.
pub fn default_roles() -> &'static [(&'static str, &'static str)] {
    ROLES
}

/// Write the defaults into a directory that does not exist yet, one directory at a time. A
/// directory that exists is a person's: a file that they deleted stays deleted, a file that they
/// edited stays as it is. Returns the repository paths that it wrote.
pub fn seed(root: &Path) -> Result<Vec<String>> {
    let mut out = Vec::new();
    for (dir, ext, files) in [(WORKFLOWS_DIR, "yaml", WORKFLOWS), (ROLES_DIR, "md", ROLES)] {
        if root.join(dir).exists() {
            continue;
        }
        for (name, text) in files {
            let rel = format!("{dir}/{name}.{ext}");
            write_atomic(&root.join(&rel), text.as_bytes())?;
            out.push(rel);
        }
    }
    Ok(out)
}

/// A role profile. `model` is a tier (`top`, `mid`, `small`) that the runner config maps to a
/// model. A step may name its own model and effort: they win over the profile.
// `prefs::Role` has the name `Role` in the bindings: this rename is the type name there only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "AgentRole")]
pub struct Role {
    pub id: String,
    pub description: String,
    pub model: Option<String>,
    pub effort: Option<Effort>,
    /// The text after the frontmatter: the system prompt of the role.
    pub prompt: String,
}

/// Other keys, such as the runner keys of an agent-compass profile, are ignored.
#[derive(Deserialize)]
struct Front {
    name: Option<String>,
    #[serde(default)]
    description: String,
    model: Option<String>,
    effort: Option<Effort>,
}

/// A role file. The frontmatter is optional. `name`, when set, must be the file name.
pub fn parse_role(id: &str, text: &str) -> std::result::Result<Role, (Option<usize>, String)> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let (front, prompt) = match text.strip_prefix("---\n") {
        Some(rest) => {
            let end = rest
                .split_inclusive('\n')
                .scan(0, |at, l| {
                    let s = *at;
                    *at += l.len();
                    Some((s, l))
                })
                .find(|(_, l)| l.trim_end() == "---");
            let Some((at, line)) = end else {
                return Err((Some(1), "the frontmatter has no closing `---`".into()));
            };
            let yaml = &rest[..at];
            let front: Front = serde_yaml::from_str(yaml)
                // The frontmatter starts on line 2 of the file.
                .map_err(|e| (e.location().map(|l| l.line() + 1), e.to_string()))?;
            (Some(front), &rest[at + line.len()..])
        }
        None => (None, text),
    };
    if let Some(name) = front.as_ref().and_then(|f| f.name.as_deref())
        && name != id
    {
        return Err((
            Some(2),
            format!("name `{name}` differs from the file name `{id}`"),
        ));
    }
    Ok(Role {
        id: id.into(),
        description: front
            .as_ref()
            .map(|f| f.description.clone())
            .unwrap_or_default(),
        model: front.as_ref().and_then(|f| f.model.clone()),
        effort: front.as_ref().and_then(|f| f.effort),
        prompt: prompt.trim_start_matches('\n').to_string(),
    })
}

/// One reason to refuse a file. `file` is repository-relative. The view shows the line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FileIssue {
    pub file: String,
    pub line: Option<usize>,
    pub message: String,
}

/// The live set of workflows and roles. `issues` holds the refusals of the last load.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Loaded {
    /// By id. Only valid files, or the last valid version of a file that is now invalid.
    pub workflows: BTreeMap<String, Workflow>,
    /// By name: the files of `.shipyard/roles/`.
    pub roles: BTreeMap<String, Role>,
    pub issues: Vec<FileIssue>,
}

impl Loaded {
    /// The profile of a role: the project file, else the bundled default (REQ-014).
    pub fn role(&self, id: &str) -> Option<Role> {
        self.roles.get(id).cloned().or_else(|| {
            let (_, text) = ROLES.iter().find(|(n, _)| *n == id)?;
            parse_role(id, text).ok()
        })
    }
}

/// Files of a directory with an extension, sorted by name. A missing directory is empty.
fn files(root: &Path, dir: &str, ext: &str) -> Result<Vec<(String, std::path::PathBuf)>> {
    let mut out = Vec::new();
    match std::fs::read_dir(root.join(dir)) {
        Ok(rd) => {
            for e in rd {
                let p = e?.path();
                if p.extension().is_some_and(|x| x == ext)
                    && let Some(stem) = p.file_stem().and_then(|s| s.to_str())
                {
                    out.push((stem.to_string(), p));
                }
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    out.sort();
    Ok(out)
}

/// Read every workflow and role file. A file that is invalid keeps the version in `last` and adds
/// an issue (REQ-010). A file that is gone leaves the set. The caller seeds first (`seed`).
pub fn load(root: &Path, last: &Loaded) -> Result<Loaded> {
    let mut out = Loaded::default();
    let issue = |file: String, line, message: String| FileIssue {
        file,
        line,
        message,
    };

    let role_files = files(root, ROLES_DIR, "md")?;
    for (name, path) in &role_files {
        let rel = format!("{ROLES_DIR}/{name}.md");
        match parse_role(name, &std::fs::read_to_string(path)?) {
            Ok(r) => {
                out.roles.insert(name.clone(), r);
            }
            Err((line, msg)) => {
                if let Some(old) = last.roles.get(name) {
                    out.roles.insert(name.clone(), old.clone());
                }
                out.issues.push(issue(rel, line, msg));
            }
        }
    }
    let mut known: Vec<String> = DEFAULT_ROLES.iter().map(|r| r.to_string()).collect();
    known.extend(role_files.into_iter().map(|(n, _)| n));

    for (id, path) in files(root, WORKFLOWS_DIR, "yaml")? {
        let rel = format!("{WORKFLOWS_DIR}/{id}.yaml");
        let text = std::fs::read_to_string(path)?;
        match parse_workflow(&id, &text, &known) {
            Ok(wf) => {
                out.workflows.insert(id, wf);
            }
            Err((line, msg)) => {
                if let Some(old) = last.workflows.get(&id) {
                    out.workflows.insert(id, old.clone());
                }
                out.issues.push(issue(rel, line, msg));
            }
        }
    }
    Ok(out)
}

/// A workflow file: the model, the file name rule and `Workflow::check`. The first issue only:
/// the view shows one error at a time, and each fix may clear the next.
pub fn parse_workflow(
    id: &str,
    text: &str,
    roles: &[String],
) -> std::result::Result<Workflow, (Option<usize>, String)> {
    let wf: Workflow =
        serde_yaml::from_str(text).map_err(|e| (e.location().map(|l| l.line()), e.to_string()))?;
    if wf.id != id {
        return Err((
            line_of(text, "id", &wf.id),
            format!("id `{}` differs from the file name `{id}`", wf.id),
        ));
    }
    match wf.check(roles).into_iter().next() {
        Some(i) => Err(describe(text, &i)),
        None => Ok(wf),
    }
}

/// The first line that names a step: `- id: build` or `- { id: build, ... }`.
fn step_line(text: &str, step: &str) -> Option<usize> {
    let key = format!("id: {step}");
    text.lines()
        .position(|l| {
            l.find(&key).is_some_and(|i| {
                l[i + key.len()..]
                    .chars()
                    .next()
                    .is_none_or(|c| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'))
            })
        })
        .map(|i| i + 1)
}

fn describe(text: &str, issue: &WorkflowIssue) -> (Option<usize>, String) {
    use WorkflowIssue as I;
    match issue {
        I::NoSteps => (
            line_of(text, "steps", ""),
            "the workflow has no step".into(),
        ),
        I::BadId { field } => (
            line_of(text, field.rsplit('.').next().unwrap_or("id"), ""),
            format!("bad id in `{field}`: use a-z, 0-9, - and _"),
        ),
        I::DuplicateStep { step } => (step_line(text, step), format!("duplicate step `{step}`")),
        I::UnknownNeed { step, need } => (
            step_line(text, step),
            format!("step `{step}` needs `{need}`, which is not a step"),
        ),
        I::Cycle { steps } => (
            steps.first().and_then(|s| step_line(text, s)),
            format!("needs cycle: {}", steps.join(" -> ")),
        ),
        I::UnknownRole { step, role } => (
            line_of(text, "role", role).or_else(|| step_line(text, step)),
            format!(
                "step `{step}` names the role `{role}`, which has no file in {ROLES_DIR} and is not a default role"
            ),
        ),
        I::RoleOrAction { step } => (
            step_line(text, step),
            format!("step `{step}` needs one role or one action, not both and not none"),
        ),
        I::BadForEach { step } => (
            step_line(text, step),
            format!(
                "step `{step}`: `for_each` must be `<need>.<field>` and the step must be in `needs`"
            ),
        ),
        I::BadValue { field } => {
            let mut parts = field.split('.');
            let line = match (parts.next(), parts.next()) {
                (Some("steps"), Some(step)) => step_line(text, step),
                (_, Some(name)) => line_of(text, name, ""),
                _ => None,
            };
            (line, format!("bad value in `{field}`"))
        }
    }
}
