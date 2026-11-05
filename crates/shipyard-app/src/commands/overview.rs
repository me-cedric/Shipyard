//! The Projects page, the push-target check and the docs-chain gate (W10, Q-111 to Q-113).

use std::path::Path;

use serde::{Deserialize, Serialize};
use shipyard_core::project::ProjectFile;
use shipyard_git::Repo;
use shipyard_store::project::{FileRead, read_project_file};
use specta::Type;
use tauri::AppHandle;

use super::{Api, AppState, Res, blocking, err};

/// `https://user@host/a/b.git` and `git@host:a/b.git` both give `("host", "a/b")`.
pub fn host_slug(url: &str) -> Option<(String, String)> {
    let (host, path) = if let Some((_, rest)) = url.split_once("://") {
        rest.split_once('/')?
    } else {
        url.split_once('@')?.1.split_once(':')?
    };
    let host = host.rsplit_once('@').map_or(host, |(_, h)| h);
    let slug = path.trim_matches('/').trim_end_matches(".git");
    (!host.is_empty() && !slug.is_empty()).then(|| (host.to_lowercase(), slug.to_string()))
}

/// The web page of a remote address. Always `https`.
pub fn web_url(url: &str) -> Option<String> {
    host_slug(url).map(|(h, s)| format!("https://{h}/{s}"))
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCard {
    pub id: String,
    pub name: String,
    pub path: String,
    /// The host of the remote, or `None` for a local project.
    pub host: Option<String>,
    pub web_url: Option<String>,
    pub branch: Option<String>,
    pub last_commit: Option<String>,
    /// Seconds since the Unix epoch.
    pub last_commit_time: Option<u32>,
    pub ahead: u32,
    pub behind: u32,
    pub changes: u32,
}

fn card(id: &str, name: &str, path: &str) -> ProjectCard {
    let mut c = ProjectCard {
        id: id.into(),
        name: name.into(),
        path: path.into(),
        host: None,
        web_url: None,
        branch: None,
        last_commit: None,
        last_commit_time: None,
        ahead: 0,
        behind: 0,
        changes: 0,
    };
    // A project whose folder is gone or is no repository stays on the page with no figures.
    let Ok(r) = Repo::open(Path::new(path)) else {
        return c;
    };
    if let Ok(st) = r.status() {
        c.branch = st.branch.clone();
        (c.ahead, c.behind) = (st.ahead, st.behind);
        c.changes = [&st.staged, &st.unstaged, &st.untracked, &st.conflicted]
            .iter()
            .map(|l| l.len() as u32)
            .sum();
    }
    if let Ok(page) = r.log(0, 1)
        && let Some(last) = page.commits.first()
    {
        c.last_commit = Some(last.summary.clone());
        c.last_commit_time = Some(last.time);
    }
    if let Ok(Some((_, url))) = r.remote() {
        c.host = host_slug(&url).map(|(h, _)| h);
        c.web_url = web_url(&url);
    }
    c
}

/// One card for each registered project, in registry order. The page groups them by host.
pub fn overview(s: &AppState) -> Res<Vec<ProjectCard>> {
    Ok(s.registry()?
        .projects()
        .iter()
        .map(|e| card(&e.id, &e.name, &e.path))
        .collect())
}

/// Opens the web page of the remote of project `id` in the browser. A project with no remote is an error.
pub fn open_remote(s: &AppState, id: &str) -> Res<()> {
    let reg = s.registry()?;
    let e = reg.get(id).ok_or("unknown project")?;
    let (_, url) = Repo::open(Path::new(&e.path))
        .map_err(err)?
        .remote()
        .map_err(err)?
        .ok_or("the project has no remote")?;
    let page = web_url(&url).ok_or("the remote address is not a web address")?;
    open_page(&page)
}

/// A web address that is safe to hand to the system: `http` or `https`, a host, and only the
/// characters of a plain address. `&`, `|`, `^`, a quote or a space never pass.
fn checked_url(page: &str) -> Res<&str> {
    let rest = page
        .strip_prefix("https://")
        .or_else(|| page.strip_prefix("http://"));
    let host = rest
        .and_then(|r| r.split(['/', '?', '#']).next())
        .unwrap_or("");
    let plain = |c: char| c.is_ascii_alphanumeric() || "-._~:/?#@%=+".contains(c);
    if host.is_empty() || !page.chars().all(plain) {
        return Err("bad address: use an https address".into());
    }
    Ok(page)
}

/// Opens a web page in the browser of the system. No shell reads the address.
pub(crate) fn open_page(page: &str) -> Res<()> {
    let page = checked_url(page)?;
    let (program, args): (&str, Vec<&str>) = if cfg!(target_os = "macos") {
        ("open", vec![page])
    } else if cfg!(windows) {
        ("rundll32", vec!["url.dll,FileProtocolHandler", page])
    } else {
        ("xdg-open", vec![page])
    };
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(err)
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PushTarget {
    pub remote: String,
    pub branch: Option<String>,
    /// `Some(false)`: the account cannot push to this repository. `None`: the forge does not say,
    /// or no connection matches the host.
    pub can_push: Option<bool>,
    /// The working branch is the default branch of the repository.
    pub on_default: bool,
}

/// Looks up the repository of the remote on the forge connection of its host. It reads, it never
/// writes.
pub fn push_target(s: &AppState) -> Res<PushTarget> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let r = Repo::open(Path::new(&e.path)).map_err(err)?;
    let (remote, url) = r
        .remote()
        .map_err(err)?
        .ok_or("the project has no remote")?;
    let branch = r.status().map_err(err)?.branch;
    let mut out = PushTarget {
        remote,
        branch,
        can_push: None,
        on_default: false,
    };
    let Some((host, slug)) = host_slug(&url) else {
        return Ok(out);
    };
    let forge = s.connections.list()?.into_iter().find(|c| {
        c.group == crate::connections::ConnectionGroup::Forge
            && host_slug(&format!("{}/x", c.url.trim_end_matches('/')))
                .is_some_and(|(h, _)| h == host)
    });
    let Some(forge) = forge else { return Ok(out) };
    let mut cursor = None;
    // shortcut: five pages of 100 repositories, upgrade when an account holds more.
    for _ in 0..5 {
        let page = s.connections.repos(&forge.id, cursor.as_deref(), 100)?;
        if let Some(repo) = page
            .items
            .iter()
            .find(|p| p.slug.eq_ignore_ascii_case(&slug))
        {
            out.can_push = repo.can_push;
            out.on_default = out.branch.as_deref() == Some(repo.default_branch.as_str());
            break;
        }
        cursor = page.next;
        if cursor.is_none() {
            break;
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ChainWarning {
    /// The name of the rule, or its first pattern. For the fixed chain: the path kind that changed.
    pub from: String,
    /// The doc target that did not follow: a path kind or a repository path.
    pub to: String,
    pub changed: Vec<String>,
    /// The reason that a person gave to leave the link as it is, while it covers the changed files.
    pub ack: Option<super::chain_acks::ChainAck>,
}

/// The stale docs of the project rules, as chain warnings (`docs-freshness` REQ-003). A project
/// with no `docs` list gets the fixed chain from the specs.
pub fn stale(file: &ProjectFile, changed: &[String]) -> Vec<ChainWarning> {
    shipyard_core::docs_fresh::stale(file, changed)
        .into_iter()
        .map(|d| ChainWarning {
            from: d.rule,
            to: d.doc,
            changed: d.changed,
            ack: None,
        })
        .collect()
}

/// The default workflow that updates one stale doc (`docs-freshness` REQ-008).
pub const DOCS_UPDATE: &str = "docs-update";

/// A changed doc that the reader of its folder refuses (REQ-009).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DocProblem {
    pub path: String,
    pub error: String,
}

/// Starts one `docs-update` run for the stale doc `doc`, after a click. `range` is the place that
/// showed the warning. The run has no issue tracker ticket: the engine takes a ticket made here.
/// It starts from the branch that the person is on and its pull request targets that branch.
/// shortcut: the worktree holds commits only, so a change that is not committed is refused. Fix
/// when a run can start from a stash. Returns the run id.
pub fn docs_update_start(s: &AppState, doc: &str, range: DocsRange, click: bool) -> Res<String> {
    crate::work::need_click(s, click)?;
    let a = super::sync::active(s)?.ok_or("no project is open")?;
    let root = Path::new(&a.entry.path);
    let FileRead::Valid(file) = read_project_file(root).map_err(err)? else {
        return Err("the project file is not valid".into());
    };
    let repo = Repo::open(root).map_err(err)?;
    let changed = range_files(&repo, range, None)?;
    let w = stale(&file, &changed)
        .into_iter()
        .find(|w| w.to == doc)
        .ok_or("this doc is not stale")?;
    let st = repo.status().map_err(err)?;
    let branch = st
        .branch
        .clone()
        .ok_or("switch to a branch first: the run starts from your branch")?;
    if !st.staged.is_empty() || !st.unstaged.is_empty() || !st.conflicted.is_empty() {
        return Err("commit or stash your changes first".into());
    }
    sweep_guards(s);
    let at = shipyard_core::docs_fresh::target_path(&file, doc);
    let item = shipyard_core::work_item::WorkItem {
        key: format!("docs:{doc}"),
        title: format!("Update the docs: {doc}"),
        description: format!(
            "Update the doc `{at}` so that it matches these code changes: {}.\nChange only files under `{at}`.",
            w.changed.join(", ")
        ),
        kind: shipyard_core::work_item::WorkKind::Task,
        status: shipyard_core::work_item::Status {
            name: "To Do".into(),
            category: shipyard_core::work_item::StatusCategory::Todo,
        },
        assignee: None,
        labels: vec![
            format!("wf:{DOCS_UPDATE}"),
            format!("{}{branch}", shipyard_engine::run_engine::BASE_LABEL),
        ],
        parent: None,
        url: String::new(),
        updated: crate::code::now_iso(),
        time: None,
    };
    let run = crate::factory::start_ticket(s, &a, shipyard_core::pickup::Ticket::new(item))?;
    // The engine told the workspace the base before any step (`Workspaces::set_base`). Here the
    // guard gets its target. A run with no guard or another base must not go on.
    let set = guard_load(&s.dir, &run)
        .filter(|g| g.base == branch)
        .map(|g| Guard {
            target: at.into(),
            ..g
        })
        .ok_or_else(|| "the run has no guard".to_string())
        .and_then(|g| save_guard(&s.dir, &run, &g));
    if let Err(e) = set {
        let _ = crate::factory::cancel(s, &run);
        return Err(e);
    }
    Ok(run)
}

/// What a `docs-update` run may change, and what the read-back threw away. It lives in the app
/// data folder, one file for each run. An empty `target` means the run just started.
#[derive(Debug, Default, Serialize, Deserialize)]
struct Guard {
    target: String,
    /// The local branch that the run started from.
    base: String,
    problems: Vec<DocProblem>,
}

fn guard_path(data: &Path, run: &str) -> std::path::PathBuf {
    data.join("docs-update").join(format!("{run}.json"))
}

fn guard_load(data: &Path, run: &str) -> Option<Guard> {
    serde_json::from_str(&std::fs::read_to_string(guard_path(data, run)).ok()?).ok()
}

fn save_guard(data: &Path, run: &str, g: &Guard) -> Res<()> {
    let path = guard_path(data, run);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(err)?;
    }
    std::fs::write(path, serde_json::to_string(g).map_err(err)?).map_err(err)
}

/// The workspace calls this when a ticketless run starts: the guard exists before any step.
pub(crate) fn guard_open(data: &Path, run: &str, base: &str) -> Res<()> {
    let g = Guard {
        base: base.into(),
        ..Guard::default()
    };
    save_guard(data, run, &g)
}

/// The branch that a docs run starts from, or `None` for any other run.
pub(crate) fn guard_base(data: &Path, run: &str) -> Option<String> {
    guard_load(data, run).map(|g| g.base)
}

/// Deletes the guard of each run that ended with no problem to show, and of each run that this
/// machine does not know. A guard with problems stays: the view reads them after the run.
fn sweep_guards(s: &AppState) {
    let Ok(dir) = std::fs::read_dir(s.dir.join("docs-update")) else {
        return;
    };
    for f in dir.flatten() {
        let run = f
            .file_name()
            .to_string_lossy()
            .trim_end_matches(".json")
            .to_string();
        let ended = s
            .factory
            .factory
            .run_info(&run)
            .is_none_or(|r| r.run.state.is_final());
        if ended && guard_load(&s.dir, &run).is_none_or(|g| g.problems.is_empty()) {
            let _ = std::fs::remove_file(f.path());
        }
    }
}

/// For a docs run: puts back every file of the run folder `dir` that is outside the doc target
/// (REQ-008) or that its reader refuses (REQ-009), committed or not, so the commit and the pull
/// request never hold it. A committed file comes back as an uncommitted revert, which the commit
/// of the delivery step then holds. Returns every problem found so far. A run with no guard file
/// is not a docs run: nothing happens. A guard with no target yet is an error: the run waits.
pub fn docs_guard(data: &Path, root: &Path, run: &str, dir: &Path) -> Res<Vec<DocProblem>> {
    let Some(mut g) = guard_load(data, run) else {
        return Ok(Vec::new());
    };
    if g.target.is_empty() {
        return Err("the docs run is not ready: try again".into());
    }
    let FileRead::Valid(file) = read_project_file(root).map_err(err)? else {
        return Err("the project file is not valid".into());
    };
    let repo = Repo::open(dir).map_err(err)?;
    // Committed, staged, unstaged and untracked files, against where the run started.
    let changed = repo.changed_since(&g.base).map_err(err)?;
    let (own, outside): (Vec<String>, Vec<String>) = changed.into_iter().partition(|p| {
        p == &g.target
            || p.strip_prefix(&g.target)
                .is_some_and(|r| r.starts_with('/'))
    });
    let mut found: Vec<DocProblem> = outside
        .into_iter()
        .map(|path| DocProblem {
            path,
            error: "outside the doc target".into(),
        })
        .collect();
    found.extend(readback(dir, &file, &own));
    if !found.is_empty() {
        let paths: Vec<String> = found.iter().map(|b| b.path.clone()).collect();
        repo.unstage(&paths).map_err(err)?;
        repo.restore_from(&g.base, &paths).map_err(err)?;
        for b in found {
            if !g.problems.contains(&b) {
                g.problems.push(b);
            }
        }
        save_guard(data, run, &g)?;
    }
    Ok(g.problems)
}

/// The changed files of `changed` that a reader refuses: a `.feature` file of the test plans that
/// does not parse, and a file of the design folders that the design list marks unreadable.
/// shortcut: model and data files have no parser, only a format check.
pub fn readback(root: &Path, file: &ProjectFile, changed: &[String]) -> Vec<DocProblem> {
    let arts = shipyard_store::design::list(root, file);
    let plans = format!("{}/", file.path("test-plans").trim_matches('/'));
    changed
        .iter()
        .filter_map(|p| {
            let error = if p.starts_with(&plans) && p.ends_with(".feature") {
                let text = std::fs::read_to_string(root.join(p)).ok()?;
                let e = shipyard_core::gherkin::parse(&text).err()?;
                format!("line {}: {}", e[0].line, e[0].message)
            } else {
                arts.iter().find(|a| a.path == *p)?.issue.clone()?
            };
            Some(DocProblem {
                path: p.clone(),
                error,
            })
        })
        .collect()
}

/// The docs that a `docs-update` run lost: read again now, then the full list. The same guard
/// runs before the commit, so the answer is the same before and after.
pub fn docs_update_check(s: &AppState, run: &str) -> Res<Vec<DocProblem>> {
    let folders = crate::factory::run_folders(s, run)?;
    let dir = folders.run_path(run)?;
    docs_guard(&s.dir, &folders.root, run, &dir)
}

/// The three places that the docs chain counts changed files in (`docs-freshness` REQ-004).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum DocsRange {
    /// The staged files, before a commit.
    Staged,
    /// The files that the upstream does not hold, before a push.
    Unpushed,
    /// The whole branch against its base, in Code / Changes.
    Branch,
}

/// The revision that the branch is counted from: `base`, else the first of `develop`, `main` and
/// `master`, as a remote branch when there is one.
fn base_rev(r: &Repo, base: Option<&str>) -> Res<String> {
    let all: std::collections::BTreeSet<String> = r
        .branches()
        .map_err(err)?
        .into_iter()
        .map(|b| b.name)
        .collect();
    let pick = |b: &str| {
        let remote = format!("origin/{b}");
        [remote, b.to_string()]
            .into_iter()
            .find(|n| all.contains(n))
    };
    match base.filter(|b| !b.is_empty()) {
        Some(b) => pick(b).ok_or(format!("the base branch `{b}` does not exist")),
        None => ["develop", "main", "master"]
            .into_iter()
            .find_map(pick)
            .ok_or("no base branch: develop, main or master".into()),
    }
}

fn range_files(r: &Repo, range: DocsRange, base: Option<&str>) -> Res<Vec<String>> {
    let st = r.status().map_err(err)?;
    Ok(match (range, st.upstream) {
        (DocsRange::Staged, _) => st.staged.iter().map(|f| f.path.clone()).collect(),
        (DocsRange::Unpushed, Some(up)) => r.changed_since(&up).map_err(err)?,
        (DocsRange::Unpushed, None) => Vec::new(),
        (DocsRange::Branch, _) => r.changed_since(&base_rev(r, base)?).map_err(err)?,
    })
}

/// The warnings before a commit (`push` false: the staged files) or a push (the files that the
/// upstream does not hold). A project with no valid project file has none.
pub fn chain_gate(s: &AppState, push: bool) -> Res<Vec<ChainWarning>> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let root = Path::new(&e.path);
    let FileRead::Valid(file) = read_project_file(root).map_err(err)? else {
        return Ok(Vec::new());
    };
    let r = Repo::open(root).map_err(err)?;
    let range = if push {
        DocsRange::Unpushed
    } else {
        DocsRange::Staged
    };
    let changed = range_files(&r, range, None)?;
    Ok(super::chain_acks::with_acks(root, stale(&file, &changed))
        .into_iter()
        .filter(|w| w.ack.is_none())
        .collect())
}

/// The docs chain against a base branch: which artifacts are stale against their source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ChainWatch {
    /// The revision that the changes are counted from.
    pub base: String,
    pub warnings: Vec<ChainWarning>,
}

/// Watches the docs chain over the whole branch: every file that changed since `base` (committed or
/// not) puts its downstream folders out of date until they move too. `base` defaults to the first of
/// `develop`, `main` and `master`, as a remote branch when there is one. Nothing is written.
pub fn chain_watch(s: &AppState, base: Option<&str>) -> Res<ChainWatch> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let root = Path::new(&e.path);
    let FileRead::Valid(file) = read_project_file(root).map_err(err)? else {
        return Ok(ChainWatch {
            base: String::new(),
            warnings: Vec::new(),
        });
    };
    let r = Repo::open(root).map_err(err)?;
    let rev = base_rev(&r, base)?;
    let changed = r.changed_since(&rev).map_err(err)?;
    Ok(ChainWatch {
        base: rev,
        warnings: super::chain_acks::with_acks(root, stale(&file, &changed)),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn code_docs_update_start(
    app: AppHandle,
    doc: String,
    range: DocsRange,
    click: bool,
) -> Api<String> {
    blocking(app, move |s| docs_update_start(s, &doc, range, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_docs_update_check(app: AppHandle, run: String) -> Api<Vec<DocProblem>> {
    blocking(app, move |s| docs_update_check(s, &run)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_chain_watch(app: AppHandle, base: Option<String>) -> Api<ChainWatch> {
    blocking(app, move |s| chain_watch(s, base.as_deref())).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_overview(app: AppHandle) -> Api<Vec<ProjectCard>> {
    blocking(app, overview).await
}

#[tauri::command]
#[specta::specta]
pub async fn project_open_remote(app: AppHandle, id: String) -> Api<()> {
    blocking(app, move |s| open_remote(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_push_target(app: AppHandle) -> Api<PushTarget> {
    blocking(app, push_target).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_chain_gate(app: AppHandle, push: bool) -> Api<Vec<ChainWarning>> {
    blocking(app, move |s| chain_gate(s, push)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_remote_address_gives_its_host_and_web_page() {
        assert_eq!(
            host_slug("https://u:t@GitHub.com/acme/web.git"),
            Some(("github.com".into(), "acme/web".into()))
        );
        assert_eq!(
            web_url("git@gitlab.com:g/s/p.git").unwrap(),
            "https://gitlab.com/g/s/p"
        );
        assert_eq!(host_slug("/local/path"), None);
        assert_eq!(host_slug("https://host/"), None);
    }

    #[test]
    fn the_gate_warns_when_a_spec_moves_and_its_test_plan_does_not() {
        let f = ProjectFile::new("A", "A");
        let spec = vec!["docs/openspec/x/spec.md".to_string()];
        let w = stale(&f, &spec);
        assert!(w.iter().any(|w| w.from == "specs" && w.to == "test-plans"));
        let both = vec![spec[0].clone(), "docs/delivery/test-plans/a.md".to_string()];
        assert!(!stale(&f, &both).iter().any(|w| w.to == "test-plans"));
        assert!(stale(&f, &["src/a.rs".to_string()]).is_empty());
    }

    #[test]
    fn the_overview_has_one_card_for_each_project_and_survives_a_missing_folder() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let p = dir.path().join("one");
        shipyard_git::project::init(&p).unwrap();
        super::super::projects::open(&s, p.to_str().unwrap()).unwrap();
        let cards = overview(&s).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].host, None);
        assert!(cards[0].changes > 0, "the project file is new");
        assert!(open_remote(&s, &cards[0].id).is_err());
        assert!(open_remote(&s, "nope").is_err());
        assert!(push_target(&s).is_err());
        assert!(chain_gate(&s, true).unwrap().is_empty());
    }

    #[test]
    fn the_watch_counts_the_branch_against_its_base_and_clears_when_the_downstream_moves() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let p = dir.path().join("one");
        shipyard_git::project::init(&p).unwrap();
        super::super::projects::open(&s, p.to_str().unwrap()).unwrap();
        let git = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .arg("-C")
                .arg(&p)
                .args(["-c", "user.name=t", "-c", "user.email=t@t"])
                .args(args)
                .output()
                .unwrap();
            assert!(out.status.success(), "{args:?}: {out:?}");
        };
        git(&["add", "-A"]);
        git(&["commit", "-qm", "base"]);
        git(&["branch", "-M", "main"]);
        git(&["switch", "-qc", "topic"]);
        assert!(chain_watch(&s, None).unwrap().warnings.is_empty());
        assert!(chain_watch(&s, Some("nope")).is_err());
        std::fs::create_dir_all(p.join("docs/openspec/x")).unwrap();
        std::fs::write(p.join("docs/openspec/x/spec.md"), "# s\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-qm", "spec"]);
        let w = chain_watch(&s, None).unwrap();
        assert_eq!(w.base, "main");
        assert!(
            w.warnings
                .iter()
                .any(|w| w.from == "specs" && w.to == "test-plans")
        );
        std::fs::create_dir_all(p.join("docs/delivery/test-plans")).unwrap();
        std::fs::write(p.join("docs/delivery/test-plans/a.md"), "# t\n").unwrap();
        let w = chain_watch(&s, Some("main")).unwrap();
        assert!(
            !w.warnings.iter().any(|w| w.to == "test-plans"),
            "an untracked file counts"
        );
    }

    #[test]
    fn a_project_rule_warns_in_the_commit_gate_and_the_watch_and_clears_when_the_doc_moves() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let p = dir.path().join("one");
        shipyard_git::project::init(&p).unwrap();
        let mut f = ProjectFile::new("A", "A");
        f.docs = vec![shipyard_core::project::DocRule {
            name: None,
            code: vec!["crates/*/Cargo.toml".into()],
            feeds: vec!["models".into()],
        }];
        shipyard_store::project::write_project_file(&p, &f).unwrap();
        super::super::projects::open(&s, p.to_str().unwrap()).unwrap();
        let git = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .arg("-C")
                .arg(&p)
                .args(["-c", "user.name=t", "-c", "user.email=t@t"])
                .args(args)
                .output()
                .unwrap();
            assert!(out.status.success(), "{args:?}: {out:?}");
        };
        git(&["add", "-A"]);
        git(&["commit", "-qm", "base"]);
        git(&["branch", "-M", "main"]);
        git(&["switch", "-qc", "topic"]);
        std::fs::create_dir_all(p.join("crates/a")).unwrap();
        std::fs::write(p.join("crates/a/Cargo.toml"), "[package]\n").unwrap();
        git(&["add", "-A"]);
        let w = chain_gate(&s, false).unwrap();
        assert_eq!(w.len(), 1);
        assert_eq!(
            (w[0].from.as_str(), w[0].to.as_str()),
            ("crates/*/Cargo.toml", "models")
        );
        git(&["commit", "-qm", "crate"]);
        let w = chain_watch(&s, None).unwrap();
        assert_eq!(w.warnings.len(), 1, "no fixed chain with a rule");
        std::fs::create_dir_all(p.join("docs/models")).unwrap();
        std::fs::write(p.join("docs/models/a.c4"), "model {}\n").unwrap();
        assert!(chain_watch(&s, None).unwrap().warnings.is_empty());
    }

    #[test]
    fn a_docs_update_needs_a_click_and_a_stale_doc() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let err = docs_update_start(&s, "models", DocsRange::Branch, false).unwrap_err();
        assert!(err.contains("click"), "{err}");
        let p = dir.path().join("one");
        shipyard_git::project::init(&p).unwrap();
        super::super::projects::open(&s, p.to_str().unwrap()).unwrap();
        // The click is there, but no base branch or no change: no doc is stale and no run starts.
        assert!(docs_update_start(&s, "models", DocsRange::Branch, true).is_err());
        assert!(crate::factory::runs(&s).unwrap().is_empty());
    }

    #[test]
    fn the_readback_names_a_doc_that_does_not_parse() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let f = ProjectFile::new("A", "A");
        let w = |rel: &str, text: &str| {
            std::fs::create_dir_all(root.join(rel).parent().unwrap()).unwrap();
            std::fs::write(root.join(rel), text).unwrap();
            rel.to_string()
        };
        let good = w(
            "docs/delivery/test-plans/a.feature",
            "Feature: A\n  Scenario: S\n    Given x\n",
        );
        let bad = w("docs/delivery/test-plans/b.feature", "Given x\nnonsense\n");
        let flow = w("docs/flows/n.json", "{not json");
        let fine = w("docs/models/a.c4", "model {}\n");
        let found = readback(
            root,
            &f,
            &[good, bad.clone(), flow.clone(), fine, "gone.md".into()],
        );
        let paths: Vec<&str> = found.iter().map(|d| d.path.as_str()).collect();
        assert_eq!(paths, [bad.as_str(), flow.as_str()]);
        assert!(found.iter().all(|d| !d.error.is_empty()));
    }

    #[test]
    fn the_guard_puts_back_files_outside_the_target_and_docs_that_do_not_parse_also_when_committed()
    {
        let dir = tempfile::tempdir().unwrap();
        let (data, root, wt) = (
            dir.path().join("data"),
            dir.path().join("root"),
            dir.path().join("wt"),
        );
        shipyard_git::project::init(&root).unwrap();
        shipyard_store::project::write_project_file(&root, &ProjectFile::new("A", "A")).unwrap();
        shipyard_git::project::init(&wt).unwrap();
        let git = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .arg("-C")
                .arg(&wt)
                .args(["-c", "user.name=t", "-c", "user.email=t@t"])
                .args(args)
                .output()
                .unwrap();
            assert!(out.status.success(), "{out:?}");
        };
        git(&["add", "-A"]);
        git(&["commit", "-qm", "base"]);
        git(&["branch", "-M", "main"]);
        git(&["switch", "-qc", "run"]);
        let w = |rel: &str, text: &str| {
            std::fs::create_dir_all(wt.join(rel).parent().unwrap()).unwrap();
            std::fs::write(wt.join(rel), text).unwrap();
        };
        // The agent commits by itself: one file outside the target and one doc that is broken.
        w("src/committed.rs", "fn a() {}\n");
        w("docs/diagrams/bad.drawio.svg", "<svg/>");
        git(&["add", "-A"]);
        git(&["commit", "-qm", "agent"]);
        w("src/code.rs", "fn main() {}\n");
        w("docs/diagrams/ok.mmd", "graph TD\n  A --> B\n");
        let guard = |target: &str| Guard {
            target: target.into(),
            base: "main".into(),
            problems: Vec::new(),
        };
        // No guard file: not a docs run, nothing changes.
        assert!(docs_guard(&data, &root, "r1", &wt).unwrap().is_empty());
        assert!(wt.join("src/code.rs").exists());
        // A guard with no target yet: the run waits, nothing changes.
        save_guard(&data, "r1", &guard("")).unwrap();
        assert!(docs_guard(&data, &root, "r1", &wt).is_err());
        save_guard(&data, "r1", &guard("docs/diagrams")).unwrap();
        let found = docs_guard(&data, &root, "r1", &wt).unwrap();
        let mut paths: Vec<&str> = found.iter().map(|d| d.path.as_str()).collect();
        paths.sort();
        assert_eq!(
            paths,
            [
                "docs/diagrams/bad.drawio.svg",
                "src/code.rs",
                "src/committed.rs"
            ]
        );
        for gone in [
            "src/code.rs",
            "src/committed.rs",
            "docs/diagrams/bad.drawio.svg",
        ] {
            assert!(!wt.join(gone).exists(), "{gone}");
        }
        assert!(wt.join("docs/diagrams/ok.mmd").exists());
        // What the pull request holds against the base is the good doc only.
        let repo = Repo::open(&wt).unwrap();
        assert_eq!(
            repo.changed_since("main").unwrap(),
            ["docs/diagrams/ok.mmd"]
        );
        // The problems stay on the run.
        assert_eq!(docs_guard(&data, &root, "r1", &wt).unwrap().len(), 3);
    }
}
