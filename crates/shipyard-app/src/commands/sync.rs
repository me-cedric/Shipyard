//! Sync (spec `sync`): the state of each connection, the sync action, `.shipyard/automation.yaml`,
//! the mirror queries of the Work views, and adopt, link and import.
//!
//! The engine lives in `crate::sync`. A command makes sure that the active project has its engine,
//! then calls it on a blocking thread. A view reads the mirror and never calls a tracker (REQ-005).

use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use shipyard_core::pickup::{AUTOMATION_FILE, Automation, Ticket};
use shipyard_core::refs::{Ref, parse};
use shipyard_core::work_item::StatusCategory;
use shipyard_engine::tick::TickReport;
use shipyard_git::Repo;
use shipyard_store::automation_file::{AutomationRead, read_automation, write_automation};
use shipyard_store::project::{Entry, FileRead, read_project_file};
use shipyard_store::ref_query::{Resolved, State};
use specta::Type;
use tauri::AppHandle;

use super::{AppState, Res, blocking, err};
use crate::connections::ConnectionKind;
use crate::sync::{Plan, Running, repo_slug};

/// The event after each tick and each change of the mirror. The views read their data again.
pub const TICK_EVENT: &str = "sync-tick";

// ---------------------------------------------------------------- the active project

struct Active {
    entry: Entry,
    tracker: Option<String>,
    forge: Option<String>,
}

fn active(s: &AppState) -> Res<Option<Active>> {
    let Some(entry) = s.registry()?.active().cloned() else {
        return Ok(None);
    };
    let conns = match read_project_file(Path::new(&entry.path)) {
        Ok(FileRead::Valid(f)) => f.connections.unwrap_or_default(),
        _ => Default::default(),
    };
    Ok(Some(Active {
        entry,
        tracker: conns.tracker,
        forge: conns.forge,
    }))
}

fn automation_in(root: &Path) -> Res<Automation> {
    match read_automation(root).map_err(err)? {
        AutomationRead::Missing => Ok(Automation::default()),
        AutomationRead::Valid(a) => Ok(a),
        AutomationRead::Invalid(issues) => Err(format!(
            "{AUTOMATION_FILE}: {}",
            issues
                .into_iter()
                .map(|(_, text)| text)
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

/// What the engine of the active project needs, or `None` when the project names no tracker
/// connection that exists.
///
/// shortcut: the tracker scope has no setting. GitHub and GitLab use the origin repository. The
/// other trackers use the key of the project (`.shipyard/project.yaml`), which must then be the
/// Jira project key, the Azure DevOps project or the Linear team. Add a setting when it is not.
fn plan(s: &AppState, a: &Active) -> Res<Option<Plan>> {
    let Some(tracker) = a.tracker.clone() else {
        return Ok(None);
    };
    let Some(conn) = s.connections.get(&tracker)? else {
        return Ok(None);
    };
    let root = Path::new(&a.entry.path);
    let remote = Repo::open(root)
        .ok()
        .and_then(|r| r.remote().ok().flatten())
        .and_then(|(_, url)| repo_slug(&url));
    let scope = match conn.kind {
        ConnectionKind::GitHub | ConnectionKind::GitLab => remote.clone(),
        _ => Some(a.entry.key.clone()),
    };
    let forge = match (&a.forge, remote) {
        (Some(id), Some(repo)) if s.connections.get(id)?.is_some() => Some((id.clone(), repo)),
        _ => None,
    };
    Ok(Some(Plan {
        project: a.entry.id.clone(),
        tracker,
        scope,
        forge,
        automation: automation_in(root)?,
    }))
}

/// Make the engine of the active project match its files. `None` when the project has no tracker.
/// An invalid automation file stops the engine: no pickup runs on rules that nobody can read.
pub fn ensure(s: &AppState) -> Res<Option<Arc<Running>>> {
    let Some(a) = active(s)? else {
        return Ok(None);
    };
    let id = a.entry.id.clone();
    match plan(s, &a) {
        Ok(p) => s.sync.apply(&id, p)?,
        Err(e) => {
            s.sync.apply(&id, None)?;
            return Err(e);
        }
    }
    Ok(s.sync.running(&id))
}

/// For the callers that change the project or its file: start, change or stop the engine. An
/// error shows the next time the person asks for the state.
pub fn refresh(s: &AppState) {
    let _ = ensure(s);
}

fn running(s: &AppState) -> Res<Arc<Running>> {
    ensure(s)?.ok_or_else(|| "the project has no tracker connection".into())
}

// ---------------------------------------------------------------- state and the sync action

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum SyncStatus {
    Idle,
    Running,
    Failed,
}

/// The sync state of one connection (REQ-013, REQ-014).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncConnection {
    pub id: String,
    pub status: SyncStatus,
    /// Seconds since the epoch of the last good poll.
    pub last_ok: Option<u32>,
    pub failures: u32,
    pub error: Option<String>,
}

pub fn state(s: &AppState) -> Res<Vec<SyncConnection>> {
    let Some(a) = active(s)? else {
        return Ok(Vec::new());
    };
    // A broken automation file shows in Settings: the state stays empty.
    if ensure(s).is_err() {
        return Ok(Vec::new());
    }
    Ok(s.sync
        .states(&a.entry.id)?
        .into_iter()
        .map(|(id, st, ticking)| SyncConnection {
            id,
            status: if ticking {
                SyncStatus::Running
            } else if st.failures > 0 {
                SyncStatus::Failed
            } else {
                SyncStatus::Idle
            },
            last_ok: st.last_ok.map(|t| t as u32),
            failures: st.failures,
            error: st.error,
        })
        .collect())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct SyncFailure {
    pub connection: String,
    pub message: String,
}

/// What one tick did.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
pub struct SyncReport {
    pub polled: Vec<String>,
    pub failed: Vec<SyncFailure>,
    pub changed: u32,
    /// Ticket keys that got a run.
    pub started: Vec<String>,
    pub stopped: u32,
    pub errors: Vec<String>,
}

impl From<TickReport> for SyncReport {
    fn from(r: TickReport) -> Self {
        Self {
            polled: r.polled,
            failed: r
                .failed
                .into_iter()
                .map(|(connection, message)| SyncFailure {
                    connection,
                    message,
                })
                .collect(),
            changed: r.changed,
            started: r.started,
            stopped: r.stopped.len() as u32,
            errors: r.errors,
        }
    }
}

/// The sync action: one tick now (REQ-013). A project with no tracker has nothing to tick.
pub fn run_tick(s: &AppState) -> Res<SyncReport> {
    let Some(r) = ensure(s)? else {
        return Ok(SyncReport::default());
    };
    Ok(r.tick(true)?.into())
}

// ---------------------------------------------------------------- automation.yaml

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum AutomationFile {
    /// No file: the view shows the defaults.
    Missing,
    Valid,
    /// The text of each issue is in `issues`. The view shows the defaults.
    Invalid,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct AutomationView {
    pub automation: Automation,
    pub file: AutomationFile,
    pub issues: Vec<String>,
}

fn active_root(s: &AppState) -> Res<std::path::PathBuf> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Ok(e.path.into())
}

pub fn automation_get(s: &AppState) -> Res<AutomationView> {
    let root = active_root(s)?;
    let (automation, file, issues) = match read_automation(&root).map_err(err)? {
        AutomationRead::Missing => (Automation::default(), AutomationFile::Missing, Vec::new()),
        AutomationRead::Valid(a) => (a, AutomationFile::Valid, Vec::new()),
        AutomationRead::Invalid(i) => (
            Automation::default(),
            AutomationFile::Invalid,
            i.into_iter()
                .map(|(line, text)| match line {
                    Some(n) => format!("{n}: {text}"),
                    None => text,
                })
                .collect(),
        ),
    };
    Ok(AutomationView {
        automation,
        file,
        issues,
    })
}

/// Validates, then writes the file. An interval under 30 s leaves the old file (REQ-002). The
/// running engine takes the new rules at once.
pub fn automation_save(s: &AppState, automation: &Automation) -> Res<()> {
    let root = active_root(s)?;
    write_automation(&root, automation).map_err(err)?;
    refresh(s);
    s.sync.changed();
    Ok(())
}

// ---------------------------------------------------------------- the mirror, for the views

/// The filter of the Work views. Every set part must match.
#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemFilter {
    /// A part of the key or the title.
    pub text: Option<String>,
    pub status: Option<String>,
    /// A person id or name.
    pub assignee: Option<String>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkItemView {
    pub key: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    /// `todo`, `in-progress` or `done`.
    pub category: String,
    pub assignee: Option<String>,
    pub labels: Vec<String>,
    pub parent: Option<String>,
    pub url: String,
    pub updated: String,
    /// The local item that the ticket is linked to.
    pub linked: Option<String>,
    /// This machine holds a claim on the ticket.
    pub claimed: bool,
}

fn category(c: StatusCategory) -> &'static str {
    match c {
        StatusCategory::Todo => "todo",
        StatusCategory::InProgress => "in-progress",
        StatusCategory::Done => "done",
    }
}

fn view(t: &Ticket, linked: Option<&str>, claimed: bool) -> WorkItemView {
    let i = &t.item;
    WorkItemView {
        key: i.key.clone(),
        title: i.title.clone(),
        kind: format!("{:?}", i.kind).to_ascii_lowercase(),
        status: i.status.name.clone(),
        category: category(i.status.category).into(),
        assignee: i.assignee.as_ref().map(|p| p.name.clone()),
        labels: i.labels.clone(),
        parent: i.parent.clone(),
        url: i.url.clone(),
        updated: i.updated.clone(),
        linked: linked.map(String::from),
        claimed,
    }
}

fn keep(f: &ItemFilter, t: &Ticket) -> bool {
    let i = &t.item;
    let has = |hay: &str, needle: &str| hay.to_lowercase().contains(&needle.to_lowercase());
    fn set(v: &Option<String>) -> Option<&str> {
        v.as_deref().map(str::trim).filter(|v| !v.is_empty())
    }
    set(&f.text).is_none_or(|x| has(&i.key, x) || has(&i.title, x))
        && set(&f.status).is_none_or(|x| i.status.name.eq_ignore_ascii_case(x))
        && set(&f.assignee).is_none_or(|x| {
            i.assignee
                .as_ref()
                .is_some_and(|p| p.id.eq_ignore_ascii_case(x) || p.name.eq_ignore_ascii_case(x))
        })
        && set(&f.label).is_none_or(|x| i.labels.iter().any(|l| l.eq_ignore_ascii_case(x)))
}

/// At most this many rows. The views filter first.
const MAX_ITEMS: usize = 1000;

/// The mirrored tickets of the tracker of the active project, newest update first. No request
/// leaves the machine.
pub fn items(s: &AppState, f: &ItemFilter) -> Res<Vec<WorkItemView>> {
    let Some(src) = active(s)?.and_then(|a| a.tracker) else {
        return Ok(Vec::new());
    };
    if !s.sync.mirror_exists() {
        return Ok(Vec::new());
    }
    let m = s.sync.mirror().map_err(err)?;
    let links = m.links(&src).map_err(err)?;
    let claims = m.claims(&src).map_err(err)?;
    let mut rows: Vec<WorkItemView> = m
        .tickets(&src)
        .map_err(err)?
        .iter()
        .filter(|t| keep(f, t))
        .map(|t| {
            let key = &t.item.key;
            let linked = links
                .iter()
                .find(|(_, k)| k == key)
                .map(|(l, _)| l.as_str());
            view(t, linked, claims.iter().any(|c| c.key == *key))
        })
        .collect();
    rows.sort_by(|a, b| (&b.updated, &a.key).cmp(&(&a.updated, &b.key)));
    rows.truncate(MAX_ITEMS);
    Ok(rows)
}

/// `wi:` and `pr:` refs resolve from the mirror (REQ-016). A ref that the mirror lacks falls
/// through: it stays unresolved until a tick finds it (`refs` REQ-009).
pub fn resolve_mirror(s: &AppState, text: &str) -> Res<Option<Resolved>> {
    let (source, found) = match parse(text) {
        Some(Ref::WorkItem(key)) => {
            let Some(src) = active(s)?.and_then(|a| a.tracker) else {
                return Ok(None);
            };
            (src, Mirrored::Ticket(key))
        }
        Some(Ref::Pr { forge, number }) => (forge, Mirrored::Pull(number)),
        _ => return Ok(None),
    };
    if !s.sync.mirror_exists() {
        return Ok(None);
    }
    let m = s.sync.mirror().map_err(err)?;
    Ok(match found {
        Mirrored::Ticket(key) => m.ticket(&source, &key).map_err(err)?.map(|t| Resolved {
            target: text.into(),
            kind: "wi".into(),
            state: State::Resolved,
            title: Some(t.item.title),
            status: Some(t.item.status.name),
            location: Some(t.item.url),
        }),
        Mirrored::Pull(n) => m
            .pulls(&source)
            .map_err(err)?
            .into_iter()
            .find(|p| p.number == n)
            .map(|p| Resolved {
                target: text.into(),
                kind: "pr".into(),
                state: State::Resolved,
                title: Some(p.title),
                status: Some(format!("{:?}", p.state).to_ascii_lowercase()),
                location: Some(p.url),
            }),
    })
}

enum Mirrored {
    Ticket(String),
    Pull(u64),
}

// ---------------------------------------------------------------- adopt, link, import

/// Reads the open tickets and keeps them for `import_confirm`. Writes nothing. Returns the count
/// to show before the person confirms (REQ-015).
pub fn import_plan(s: &AppState) -> Res<u32> {
    Ok(running(s)?.plan_import()? as u32)
}

pub fn import_confirm(s: &AppState) -> Res<u32> {
    let n = running(s)?.import()? as u32;
    s.sync.changed();
    Ok(n)
}

pub fn adopt(s: &AppState, key: &str) -> Res<WorkItemView> {
    let key = key.trim();
    if key.is_empty() {
        return Err("the key is empty".into());
    }
    let t = running(s)?.with(|e| e.adopt(key))?;
    s.sync.changed();
    Ok(view(&t, None, false))
}

/// Links a ticket to a local item, a ref such as `change:add-sync`.
pub fn link(s: &AppState, local: &str, key: &str) -> Res<()> {
    let (local, key) = (local.trim(), key.trim());
    if key.is_empty() {
        return Err("the key is empty".into());
    }
    if parse(local).is_none() {
        return Err(format!("not a ref: {local}"));
    }
    running(s)?.with(|e| e.link(local, key))?;
    s.sync.changed();
    Ok(())
}

pub fn unlink(s: &AppState, local: &str) -> Res<bool> {
    let found = running(s)?.with(|e| e.unlink(local.trim()))?;
    s.sync.changed();
    Ok(found)
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn sync_state(app: AppHandle) -> Res<Vec<SyncConnection>> {
    blocking(app, state).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_now(app: AppHandle) -> Res<SyncReport> {
    blocking(app, run_tick).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_automation_get(app: AppHandle) -> Res<AutomationView> {
    blocking(app, automation_get).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_automation_save(app: AppHandle, automation: Automation) -> Res<()> {
    blocking(app, move |s| automation_save(s, &automation)).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_items(app: AppHandle, filter: ItemFilter) -> Res<Vec<WorkItemView>> {
    blocking(app, move |s| items(s, &filter)).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_import_plan(app: AppHandle) -> Res<u32> {
    blocking(app, import_plan).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_import_confirm(app: AppHandle) -> Res<u32> {
    blocking(app, import_confirm).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_adopt(app: AppHandle, key: String) -> Res<WorkItemView> {
    blocking(app, move |s| adopt(s, &key)).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_link(app: AppHandle, local: String, key: String) -> Res<()> {
    blocking(app, move |s| link(s, &local, &key)).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_unlink(app: AppHandle, local: String) -> Res<bool> {
    blocking(app, move |s| unlink(s, &local)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::projects;
    use crate::connections::{ConnectionDraft, ConnectionGroup, Connections};
    use shipyard_core::project::ProjectConnections;
    use shipyard_http::fake::FakeHttp;
    use shipyard_secrets::{MemoryStore, Secret};
    use shipyard_store::project::write_project_file;

    macro_rules! tracker_fx {
        ($f:literal) => {
            include_str!(concat!(
                "../../../shipyard-trackers/tests/fixtures/github/",
                $f
            ))
        };
    }
    macro_rules! forge_fx {
        ($f:literal) => {
            include_str!(concat!(
                "../../../shipyard-forges/tests/fixtures/github/",
                $f
            ))
        };
    }

    struct Fixture {
        _data: tempfile::TempDir,
        repo: tempfile::TempDir,
        s: AppState,
        http: Arc<FakeHttp>,
    }

    fn git(dir: &Path, args: &[&str]) {
        assert!(
            std::process::Command::new("git")
                .args(args)
                .current_dir(dir)
                .status()
                .unwrap()
                .success()
        );
    }

    /// A project with an `origin` on GitHub, a GitHub tracker and a GitHub forge connection.
    fn fixture() -> Fixture {
        let repo = tempfile::tempdir().unwrap();
        shipyard_git::project::init(repo.path()).unwrap();
        git(
            repo.path(),
            &["remote", "add", "origin", "https://github.com/acme/web.git"],
        );
        let data = tempfile::tempdir().unwrap();
        let http = Arc::new(FakeHttp::new());
        http.get(
            "/repos/acme/web/issues/12/comments",
            200,
            tracker_fx!("comments.json"),
        )
        .get("/repos/acme/web/issues/12", 200, tracker_fx!("issue.json"))
        .get("/repos/acme/web/issues?", 200, tracker_fx!("search.json"))
        .get(
            "/commits/abc123/check-runs",
            200,
            forge_fx!("check_runs.json"),
        )
        .get("/commits/abc123/status", 200, forge_fx!("status.json"))
        .get("/repos/acme/web/pulls/7", 200, forge_fx!("pull.json"))
        .get("/repos/acme/web/pulls?", 200, forge_fx!("pulls.json"));
        let conns = Arc::new(Connections::new(
            data.path(),
            Arc::new(MemoryStore::default()),
            http.clone(),
        ));
        for (name, group) in [
            ("Issues", ConnectionGroup::Tracker),
            ("Code", ConnectionGroup::Forge),
        ] {
            let c = conns
                .add(ConnectionDraft {
                    name: name.into(),
                    group,
                    kind: crate::connections::ConnectionKind::GitHub,
                    url: "https://github.com".into(),
                    user: None,
                })
                .unwrap();
            conns
                .set_secret(&c.id, Secret::new("tok-sync-secret"))
                .unwrap();
        }
        let s = AppState::with_connections(data.path().join("data"), conns);
        projects::open(&s, repo.path().to_str().unwrap(), true).unwrap();
        let FileRead::Valid(mut f) = read_project_file(repo.path()).unwrap() else {
            panic!("a valid file")
        };
        f.connections = Some(ProjectConnections {
            tracker: Some("issues".into()),
            forge: Some("code".into()),
        });
        write_project_file(repo.path(), &f).unwrap();
        Fixture {
            _data: data,
            repo,
            s,
            http,
        }
    }

    #[test]
    fn a_project_with_no_tracker_has_nothing_to_sync() {
        let data = tempfile::tempdir().unwrap();
        let s = AppState::with_connections(
            data.path().into(),
            Arc::new(Connections::new(
                data.path(),
                Arc::new(MemoryStore::default()),
                Arc::new(FakeHttp::new()),
            )),
        );
        assert!(state(&s).unwrap().is_empty());
        assert_eq!(run_tick(&s).unwrap(), SyncReport::default());
        assert!(items(&s, &ItemFilter::default()).unwrap().is_empty());
        assert!(import_plan(&s).is_err());
    }

    #[test]
    fn a_tick_fills_the_mirror_and_the_views_read_it_with_no_request() {
        let f = fixture();
        let report = run_tick(&f.s).unwrap();
        assert_eq!(report.polled, ["issues", "code"]);
        assert!(report.failed.is_empty(), "{:?}", report.failed);
        // The labelled ticket is picked up: the placeholder holds the run.
        assert_eq!(report.started, ["acme/web#12"]);
        let notes = f.s.sync.dispatch.notes();
        assert_eq!(notes[0].text, "would start a run on acme/web#12");

        let state = state(&f.s).unwrap();
        assert_eq!(
            state
                .iter()
                .map(|c| (c.id.as_str(), c.status))
                .collect::<Vec<_>>(),
            [("issues", SyncStatus::Idle), ("code", SyncStatus::Idle)]
        );
        assert!(state.iter().all(|c| c.last_ok.is_some()));

        // The pull request of the issue list is not a ticket.
        let calls = f.http.requests().len();
        let all = items(&f.s, &ItemFilter::default()).unwrap();
        assert_eq!(
            all.iter().map(|i| i.key.as_str()).collect::<Vec<_>>(),
            ["acme/web#12", "acme/web#13"]
        );
        assert!(all[0].claimed && !all[1].claimed);
        let filtered = |f2: ItemFilter| items(&f.s, &f2).unwrap().len();
        assert_eq!(
            filtered(ItemFilter {
                text: Some("export".into()),
                ..Default::default()
            }),
            1
        );
        assert_eq!(
            filtered(ItemFilter {
                status: Some("Open".into()),
                ..Default::default()
            }),
            2
        );
        assert_eq!(
            filtered(ItemFilter {
                assignee: Some("ada".into()),
                ..Default::default()
            }),
            1
        );
        assert_eq!(
            filtered(ItemFilter {
                label: Some("bug".into()),
                ..Default::default()
            }),
            1
        );
        assert_eq!(f.http.requests().len(), calls, "a view sends no request");
        // No ticket file in the repository.
        let status = Repo::open(f.repo.path()).unwrap().status().unwrap();
        assert!(
            status
                .unstaged
                .iter()
                .chain(&status.staged)
                .all(|c| !c.path.contains("issues"))
        );

        // `pr:` resolves from the mirror, `wi:` too. A ref that the mirror lacks stays unresolved.
        let pr = resolve_mirror(&f.s, "pr:code:7").unwrap().unwrap();
        assert_eq!(pr.title.as_deref(), Some("Add export endpoint"));
        assert_eq!(pr.status.as_deref(), Some("open"));
        assert!(resolve_mirror(&f.s, "pr:code:99").unwrap().is_none());
        let m = f.s.sync.mirror().unwrap();
        let mut t = Ticket::new(m.ticket("issues", "acme/web#13").unwrap().unwrap().item);
        t.item.key = "ACME-1".into();
        m.put_tickets("issues", &[t]).unwrap();
        let wi = resolve_mirror(&f.s, "wi:ACME-1").unwrap().unwrap();
        assert_eq!(
            (wi.title.as_deref(), wi.status.as_deref()),
            (Some("Add export"), Some("open"))
        );
        assert!(resolve_mirror(&f.s, "wi:ACME-2").unwrap().is_none());
    }

    #[test]
    fn a_failed_poll_keeps_the_mirror_and_shows_the_failed_state() {
        let f = fixture();
        run_tick(&f.s).unwrap();
        // The tracker goes away: the next poll fails and nothing changes in the mirror.
        let r = ensure(&f.s).unwrap().unwrap();
        r.with(|e| {
            e.mirror().mark_failed("issues", "offline")?;
            Ok(())
        })
        .unwrap();
        let st = state(&f.s).unwrap();
        assert_eq!(st[0].status, SyncStatus::Failed);
        assert_eq!(st[0].error.as_deref(), Some("offline"));
        assert_eq!(items(&f.s, &ItemFilter::default()).unwrap().len(), 2);
    }

    #[test]
    fn the_automation_file_is_validated_before_it_is_written() {
        let f = fixture();
        let view = automation_get(&f.s).unwrap();
        assert_eq!(view.file, AutomationFile::Missing);
        assert_eq!(view.automation.interval, 60);
        assert!(
            !view.automation.writes.tracker_comment,
            "write switches start off"
        );

        let mut a = view.automation;
        a.interval = 10;
        assert!(automation_save(&f.s, &a).is_err());
        assert_eq!(automation_get(&f.s).unwrap().file, AutomationFile::Missing);

        a.interval = 45;
        a.pickup.label = Some("agent".into());
        a.concurrency.global = 1;
        automation_save(&f.s, &a).unwrap();
        let back = automation_get(&f.s).unwrap();
        assert_eq!(back.file, AutomationFile::Valid);
        assert_eq!(back.automation, a);
        // The running engine takes the rules in place.
        let r = ensure(&f.s).unwrap().unwrap();
        assert_eq!(r.plan().automation.interval, 45);

        // A file that nobody can read: the view says so and the engine stops.
        std::fs::write(f.repo.path().join(AUTOMATION_FILE), "interval: 5\n").unwrap();
        let bad = automation_get(&f.s).unwrap();
        assert_eq!(bad.file, AutomationFile::Invalid);
        assert!(bad.issues[0].contains("interval"));
        assert!(run_tick(&f.s).is_err());
        assert!(state(&f.s).unwrap().is_empty());
    }

    #[test]
    fn import_shows_a_count_first_and_writes_after_the_confirm() {
        let f = fixture();
        assert!(import_confirm(&f.s).is_err(), "no plan, no write");
        assert_eq!(import_plan(&f.s).unwrap(), 2);
        assert!(items(&f.s, &ItemFilter::default()).unwrap().is_empty());
        assert_eq!(import_confirm(&f.s).unwrap(), 2);
        assert_eq!(items(&f.s, &ItemFilter::default()).unwrap().len(), 2);
        assert!(import_confirm(&f.s).is_err(), "a plan is used once");
    }

    #[test]
    fn adopt_link_and_unlink() {
        let f = fixture();
        assert!(adopt(&f.s, "  ").is_err());
        assert_eq!(
            adopt(&f.s, "acme/web#12").unwrap().title,
            "Fix login redirect"
        );
        assert!(
            link(&f.s, "nope", "acme/web#12").is_err(),
            "the local side is a ref"
        );
        link(&f.s, "change:add-sync", "acme/web#12").unwrap();
        let row = &items(&f.s, &ItemFilter::default()).unwrap()[0];
        assert_eq!(row.linked.as_deref(), Some("change:add-sync"));
        assert!(unlink(&f.s, "change:add-sync").unwrap());
        assert!(!unlink(&f.s, "change:add-sync").unwrap());
        assert_eq!(items(&f.s, &ItemFilter::default()).unwrap()[0].linked, None);
    }
}
