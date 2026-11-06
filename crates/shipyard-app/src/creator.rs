//! The project creator (spec `project-creator`): the files of a new project from the answers of the
//! person, a preview, the creation with the remote, and the bootstrap run. The files are built in
//! Rust and the preview writes nothing. Each write to a code host follows the click on Create.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use shipyard_core::delivery::kebab;
use shipyard_core::project::{
    LANGUAGES, PROJECT_FILE, ProjectConnections, ProjectFile, ProjectLanguages, language_name,
    validate,
};
use shipyard_core::work::{Member, Row, RowKind, Team};
use shipyard_git::Repo;
use shipyard_git::project::{global_user_name, init};
use shipyard_store::project::render_project_file;
use specta::Type;

use crate::commands::projects::{OpenStatus, ProjectOutcome, activate, outcome, seed_automation};
use crate::commands::{Api, AppState, Res, blocking, err};
use crate::doctor_bootstrap::PlannedFile;

/// The workflow that the bootstrap run uses (REQ-013).
pub const BOOTSTRAP: &str = "bootstrap";
/// The roles of `team-rights` REQ-005.
pub const ROLES: [&str; 9] = [
    "po",
    "pm",
    "architect",
    "techlead",
    "ba",
    "developer",
    "qa",
    "designer",
    "viewer",
];
const MAX_TEXT: usize = 10_000;
const MAX_ISSUES: usize = 30;

/// A stack preset: its gates and the ignore rules of its build output (REQ-002).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StackPreset {
    pub id: String,
    pub gates: Vec<String>,
}

const STACKS: [(&str, &[&str], &[&str]); 6] = [
    (
        "node",
        &["pnpm test", "pnpm lint"],
        &["node_modules/", "dist/", "coverage/"],
    ),
    ("rust", &["cargo test", "cargo clippy"], &["target/"]),
    ("python", &["pytest"], &["__pycache__/", ".venv/", "*.pyc"]),
    ("java", &["mvn verify"], &["target/", "build/", ".gradle/"]),
    ("go", &["go test ./...", "go vet ./..."], &["bin/"]),
    ("other", &[], &[]),
];

fn stack(id: &str) -> Option<(&'static [&'static str], &'static [&'static str])> {
    STACKS
        .iter()
        .find(|(s, ..)| *s == id)
        .map(|(_, g, i)| (*g, *i))
}

/// The vision, the users and the scope of a new project (REQ-003).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Brief {
    pub vision: String,
    pub users: String,
    /// One line for each item of the scope: each line gives one starter issue.
    pub scope: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NewMember {
    pub name: String,
    /// One of [`ROLES`].
    pub role: String,
}

/// Where the project lives besides this machine (REQ-008).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NewRemote {
    Local,
    /// An existing address. `forge`: the code host connection that serves it, if any.
    Existing {
        url: String,
        forge: Option<String>,
    },
    /// A new private repository `owner/name` on the code host connection `forge`.
    Create {
        forge: String,
        slug: String,
    },
}

/// The answers of the creator.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NewProject {
    pub name: String,
    pub key: String,
    /// The absolute path of the new project folder.
    pub folder: String,
    /// The id of a [`StackPreset`].
    pub stack: String,
    pub brief: Brief,
    pub docs_lang: String,
    pub pulls_lang: String,
    /// The first member is the person.
    pub members: Vec<NewMember>,
    pub remote: NewRemote,
    pub tracker: Option<String>,
    pub tracker_scope: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreatorOptions {
    pub stacks: Vec<StackPreset>,
    pub languages: Vec<String>,
    pub roles: Vec<String>,
    /// The name of the global git identity: the first member.
    pub me: Option<String>,
}

/// What Create writes, and what can start the work (REQ-009, REQ-011, REQ-012).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreatorPreview {
    pub files: Vec<PlannedFile>,
    /// One starter issue for each line of the scope. The ref is the label of the issue.
    pub issues: Vec<Row>,
    /// `run`, `issues` and `later`, in the order of the default; only the ones that can run.
    pub starts: Vec<String>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreatorResult {
    pub outcome: ProjectOutcome,
    /// The address of `origin`, when the project has one.
    pub remote: Option<String>,
    /// Why the first commit or the remote failed. The local project stays open (REQ-010).
    pub warning: Option<String>,
}

// ---------------------------------------------------------------- text

/// The headings and the starter text in the docs language. English for a language with no
/// translation: the agents translate the rest.
struct Words {
    vision: &'static str,
    users: &'static str,
    scope: &'static str,
}

fn words(lang: &str) -> Words {
    match lang {
        "fr" => Words {
            vision: "Vision",
            users: "Utilisateurs",
            scope: "Périmètre",
        },
        _ => Words {
            vision: "Vision",
            users: "Users",
            scope: "Scope",
        },
    }
}

/// The pre-filled brief of a name and a stack in the docs language (REQ-003).
pub fn draft(name: &str, stack_id: &str, lang: &str) -> Brief {
    let name = name.trim();
    let tech = match stack_id {
        "node" => "Node.js",
        "rust" => "Rust",
        "python" => "Python",
        "java" => "Java",
        "go" => "Go",
        _ => "",
    };
    if lang == "fr" {
        let setup = if tech.is_empty() {
            "Mettre en place le projet et ses vérifications".to_string()
        } else {
            format!("Mettre en place le projet {tech} et ses vérifications")
        };
        return Brief {
            vision: format!("{name} aide ses utilisateurs à atteindre leur objectif plus vite."),
            users: "- Responsable produit : priorise le travail.\n- Utilisateur final : utilise le produit au quotidien.".into(),
            scope: format!("{setup}\nÉcrire la première spécification de la fonction principale\nAjouter l'intégration continue\nÉcrire le guide de démarrage"),
        };
    }
    let setup = if tech.is_empty() {
        "Set up the project and its checks".to_string()
    } else {
        format!("Set up the {tech} project and its checks")
    };
    Brief {
        vision: format!("{name} helps its users reach their goal faster."),
        users: "- Product owner: sets the priorities.\n- End user: uses the product each day."
            .into(),
        scope: format!(
            "{setup}\nWrite the first spec of the main feature\nAdd continuous integration\nWrite the getting started guide"
        ),
    }
}

/// The lines of the scope, with no list mark and no empty line.
fn scope_lines(scope: &str) -> Vec<String> {
    scope
        .lines()
        .map(|l| l.trim().trim_start_matches(['-', '*']).trim())
        .filter(|l| !l.is_empty())
        .map(|l| l.chars().take(200).collect())
        .take(MAX_ISSUES)
        .collect()
}

fn brief_md(p: &NewProject) -> String {
    let w = words(&p.docs_lang);
    let scope: String = scope_lines(&p.brief.scope)
        .iter()
        .map(|l| format!("- {l}\n"))
        .collect();
    format!(
        "# {name}\n\n## {}\n\n{}\n\n## {}\n\n{}\n\n## {}\n\n{scope}",
        w.vision,
        p.brief.vision.trim(),
        w.users,
        p.brief.users.trim(),
        w.scope,
        name = p.name.trim(),
    )
}

fn agents_md(p: &NewProject, gates: &[String]) -> String {
    let lang = |c: &str| language_name(c).unwrap_or("English");
    let mut out = format!(
        "# {}\n\nStart from `docs/brief.md`.\n\n## Rules\n\n\
         - Write specs, diagrams, documents and other docs in {}.\n\
         - Write pull request titles, descriptions and review comments in {}.\n\
         - Keep code, identifiers, code comments and commit messages in English.\n",
        p.name.trim(),
        lang(&p.docs_lang),
        lang(&p.pulls_lang),
    );
    if !gates.is_empty() {
        let list: Vec<_> = gates.iter().map(|g| format!("`{g}`")).collect();
        out += &format!(
            "- Run these checks before each commit: {}.\n",
            list.join(", ")
        );
    }
    out
}

/// The team file: the person first, then the members. A handle comes from the name and stays unique.
fn team_of(members: &[NewMember]) -> Team {
    let mut out: Vec<Member> = Vec::new();
    for (i, m) in members.iter().enumerate() {
        let base = Some(kebab(&m.name))
            .filter(|h| h.starts_with(|c: char| c.is_ascii_lowercase()))
            .unwrap_or_else(|| format!("member-{}", i + 1));
        let mut handle = base.clone();
        let mut n = 2;
        while out.iter().any(|o| o.handle == handle) {
            handle = format!("{base}-{n}");
            n += 1;
        }
        out.push(Member {
            name: m.name.trim().into(),
            handle,
            role: m.role.clone(),
            capacity: 5.0,
            ..Default::default()
        });
    }
    Team {
        members: out,
        locked: false,
    }
}

fn ignore_text(extra: &[&str]) -> String {
    let mut out = shipyard_core::project::ignore_block("").unwrap_or_default();
    if !extra.is_empty() {
        out += "\n# Build output\n";
        for r in extra {
            out += r;
            out.push('\n');
        }
    }
    out
}

// ---------------------------------------------------------------- plan

fn bad_text(t: &str) -> bool {
    t.len() > MAX_TEXT || t.contains('\0')
}

/// The project file of the answers, or the first problem.
fn check(p: &NewProject) -> Res<ProjectFile> {
    let (gates, _) = stack(&p.stack).ok_or("unknown stack")?;
    if [&p.brief.vision, &p.brief.users, &p.brief.scope]
        .iter()
        .any(|t| bad_text(t))
    {
        return Err("the brief is too long".into());
    }
    let folder = Path::new(&p.folder);
    let plain = folder
        .components()
        .all(|c| !matches!(c, std::path::Component::ParentDir));
    if !folder.is_absolute() || !plain || !folder.parent().is_some_and(Path::is_dir) {
        return Err(format!(
            "{} is not a full path in an existing folder",
            p.folder
        ));
    }
    if p.members.len() > 50
        || p.members.iter().any(|m| {
            m.name.trim().is_empty() || m.name.len() > 80 || !ROLES.contains(&m.role.as_str())
        })
    {
        return Err("each member needs a name and a role".into());
    }
    let forge = match &p.remote {
        NewRemote::Local => None,
        NewRemote::Existing { url, forge } => {
            let u = url.trim();
            if u.is_empty() || u.starts_with('-') || u.contains(char::is_whitespace) {
                return Err("the remote address is not valid".into());
            }
            forge.clone()
        }
        NewRemote::Create { forge, slug } => {
            let parts: Vec<_> = slug.split('/').collect();
            let ok = |s: &str| {
                !s.is_empty()
                    && s != "."
                    && s != ".."
                    && s.chars()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            };
            if parts.len() < 2 || !parts.iter().all(|s| ok(s)) {
                return Err(format!("`{slug}` is not owner/name"));
            }
            Some(forge.clone())
        }
    };
    let mut f = ProjectFile::new(p.name.trim(), p.key.trim());
    f.gates = gates.iter().map(|g| (*g).into()).collect();
    f.languages = Some(ProjectLanguages {
        docs: Some(p.docs_lang.clone()),
        pulls: Some(p.pulls_lang.clone()),
    });
    let conns = ProjectConnections {
        tracker: p.tracker.clone().filter(|t| !t.is_empty()),
        forge: forge.filter(|f| !f.is_empty()),
        tracker_scope: p
            .tracker_scope
            .clone()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
    };
    if conns != ProjectConnections::default() {
        f.connections = Some(conns);
    }
    match validate(&f).first() {
        Some(i) => Err(format!("{}: `{}` is not valid", i.field, i.value)),
        None => Ok(f),
    }
}

/// The files and the starts of the answers. Nothing is written (REQ-009).
pub fn preview(p: &NewProject) -> Res<CreatorPreview> {
    let f = check(p)?;
    let (_, ignore) = stack(&p.stack).ok_or("unknown stack")?;
    let mut files = vec![
        (
            PROJECT_FILE.to_string(),
            render_project_file(&f).map_err(err)?,
        ),
        (".gitignore".into(), ignore_text(ignore)),
        ("AGENTS.md".into(), agents_md(p, &f.gates)),
        (
            "README.md".into(),
            format!("# {}\n\n{}\n", f.name, p.brief.vision.trim()),
        ),
        ("docs/brief.md".into(), brief_md(p)),
    ];
    if !p.members.is_empty() {
        let team = shipyard_store::work::write_team(&team_of(&p.members), None).map_err(err)?;
        files.push((".shipyard/team.yaml".into(), team));
    }
    let issues = scope_lines(&p.brief.scope)
        .into_iter()
        .enumerate()
        .map(|(i, title)| Row {
            // The key keeps the refs of two projects on one issue tracker apart.
            reference: format!("est:starter-{}#s{}", f.id(), i + 1),
            kind: RowKind::Story,
            description: format!("From the scope of `docs/brief.md`: {title}"),
            title,
            days: None,
            parent: None,
        })
        .collect();
    let conns = f.connections.unwrap_or_default();
    let starts = [
        ("run", conns.forge.is_some()),
        ("issues", conns.tracker.is_some()),
        ("later", true),
    ]
    .into_iter()
    .filter(|(_, ok)| *ok)
    .map(|(s, _)| s.to_string())
    .collect();
    Ok(CreatorPreview {
        files: files
            .into_iter()
            .map(|(path, content)| PlannedFile {
                path,
                state: "new".into(),
                content,
            })
            .collect(),
        issues,
        starts,
    })
}

// ---------------------------------------------------------------- create

fn write_files(root: &Path, files: &[PlannedFile]) -> Res<()> {
    for f in files {
        let full: PathBuf = root.join(&f.path);
        if let Some(dir) = full.parent() {
            std::fs::create_dir_all(dir).map_err(err)?;
        }
        std::fs::write(&full, &f.content).map_err(err)?;
    }
    Ok(())
}

/// The first commit with every file of the creator. Returns why it failed.
fn first_commit(root: &Path, files: &[PlannedFile]) -> Option<String> {
    let commit = || -> Res<()> {
        let repo = Repo::open(root).map_err(err)?;
        let mut paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
        paths.push(".shipyard/automation.yaml".into());
        repo.stage(&paths).map_err(err)?;
        repo.commit("chore(shipyard): start the project", "")
            .map_err(err)?;
        Ok(())
    };
    commit().err()
}

/// Makes the new repository when asked, sets `origin` and pushes the first commit.
fn remote(s: &AppState, root: &Path, r: &NewRemote) -> Res<Option<String>> {
    let url = match r {
        NewRemote::Local => return Ok(None),
        NewRemote::Existing { url, .. } => url.trim().to_string(),
        NewRemote::Create { forge, slug } => {
            let made = s
                .connections
                .pull_api(forge)?
                .create_repo(slug)
                .map_err(|e| e.to_string())?;
            format!("{}.git", made.url.trim_end_matches('/'))
        }
    };
    let repo = Repo::open(root).map_err(err)?;
    repo.set_remote("origin", &url).map_err(err)?;
    let auth = s.connections.git_auth(&url)?;
    repo.push("origin", &auth).map_err(err)?;
    Ok(Some(url))
}

/// Creates the project after the click on Create (REQ-010).
pub fn create(s: &AppState, p: &NewProject, click: bool) -> Res<CreatorResult> {
    if !click {
        return Err("this change needs the click of a person".into());
    }
    let plan = preview(p)?;
    // `preview` checked the answers: this only builds the file again.
    let file = check(p)?;
    let root = PathBuf::from(&p.folder);
    let fail = |status, message: String| CreatorResult {
        outcome: outcome(status, message),
        remote: None,
        warning: None,
    };
    let taken = root.exists()
        && (!root.is_dir() || std::fs::read_dir(&root).map_err(err)?.next().is_some());
    if taken {
        return Ok(fail(OpenStatus::FolderNotEmpty, p.folder.clone()));
    }
    if let Err(e) = init(&root)
        .and_then(|()| write_files(&root, &plan.files))
        .and_then(|()| seed_automation(&root))
    {
        return Ok(fail(OpenStatus::Failed, e));
    }
    let root = std::fs::canonicalize(&root).map_err(err)?;
    let mut warning = first_commit(&root, &plan.files);
    let mut url = None;
    if warning.is_none() {
        match remote(s, &root, &p.remote) {
            Ok(u) => url = u,
            Err(e) => warning = Some(e),
        }
    }
    let outcome = activate(s, &root, &file)?;
    Ok(CreatorResult {
        outcome,
        remote: url,
        warning,
    })
}

/// Starts the bootstrap run of the active project after a click (REQ-013). The run ends with a
/// pull request, so it needs a code host connection (Q-156). Returns the run id.
pub fn bootstrap(s: &AppState, click: bool) -> Res<String> {
    crate::work::need_click(s, click)?;
    let a = crate::commands::sync::active(s)?.ok_or("no project is open")?;
    if a.forge.is_none() {
        return Err("the project names no code host connection".into());
    }
    let root = Path::new(&a.entry.path);
    let branch = Repo::open(root)
        .map_err(err)?
        .status()
        .map_err(err)?
        .branch
        .ok_or("switch to a branch first: the run starts from your branch")?;
    let item = shipyard_core::work_item::WorkItem {
        key: format!("bootstrap:{}", a.entry.id),
        title: format!("Bootstrap {}", a.entry.name),
        description: "Read `docs/brief.md` and `AGENTS.md`. Plan the first specs for the scope of \
                      the brief and the skeleton of the project with its checks. After the approval \
                      of the plan, write them and keep the checks green."
            .into(),
        kind: shipyard_core::work_item::WorkKind::Task,
        status: shipyard_core::work_item::Status {
            name: "To Do".into(),
            category: shipyard_core::work_item::StatusCategory::Todo,
        },
        assignee: None,
        labels: vec![
            format!("wf:{BOOTSTRAP}"),
            format!("{}{branch}", shipyard_engine::run_engine::BASE_LABEL),
        ],
        parent: None,
        url: String::new(),
        updated: crate::code::now_iso(),
        time: None,
    };
    crate::factory::start_ticket(s, &a, shipyard_core::pickup::Ticket::new(item))
}

pub fn options() -> CreatorOptions {
    CreatorOptions {
        stacks: STACKS
            .iter()
            .map(|(id, gates, _)| StackPreset {
                id: (*id).into(),
                gates: gates.iter().map(|g| (*g).into()).collect(),
            })
            .collect(),
        languages: LANGUAGES.iter().map(|(c, _)| (*c).into()).collect(),
        roles: ROLES.iter().map(|r| (*r).into()).collect(),
        me: global_user_name(),
    }
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn creator_options(app: tauri::AppHandle) -> Api<CreatorOptions> {
    blocking(app, |_| Ok(options())).await
}

#[tauri::command]
#[specta::specta]
pub async fn creator_draft(
    app: tauri::AppHandle,
    name: String,
    stack: String,
    lang: String,
) -> Api<Brief> {
    blocking(app, move |_| Ok(draft(&name, &stack, &lang))).await
}

#[tauri::command]
#[specta::specta]
pub async fn creator_preview(app: tauri::AppHandle, plan: NewProject) -> Api<CreatorPreview> {
    blocking(app, move |_| preview(&plan)).await
}

#[tauri::command]
#[specta::specta]
pub async fn creator_create(
    app: tauri::AppHandle,
    plan: NewProject,
    click: bool,
) -> Api<CreatorResult> {
    blocking(app, move |s| create(s, &plan, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn creator_bootstrap(app: tauri::AppHandle, click: bool) -> Api<String> {
    blocking(app, move |s| bootstrap(s, click)).await
}

#[cfg(test)]
mod tests;
