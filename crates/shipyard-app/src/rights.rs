//! The rights of the person in the open project (spec `team-rights`, ADR 0019): who the person
//! is, the team file that gives the rights, the one check in front of each write, and the audit log.
//!
//! The rights come from the team file of the default branch, as last fetched, when the project has
//! a remote (Q-150). Without a remote, or before the first fetch, the working copy gives them. A
//! team file that cannot be read gives the rights of `viewer`: the check fails closed.

use std::io::{BufRead, Write as _};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use shipyard_core::rights::{self, Access, Found, Person, Role};
use shipyard_core::work::Team;
use shipyard_git::Repo;
use shipyard_store::prefs::Prefs;
use shipyard_store::project::{Entry, write_atomic};
use shipyard_store::work::{TEAM_PATH, read_team};
use specta::Type;
use tauri::AppHandle;

pub use shipyard_core::rights::Right;

use crate::commands::sync::{Active, active, active_of};
use crate::commands::{Api, AppState, Res, blocking, err};

/// The audit log keeps 90 days (Q-146).
const KEEP_SECS: u64 = 90 * 86_400;

/// One writer at a time for the audit files. Not the state guard: a check can run under it.
static AUDIT: Mutex<()> = Mutex::new(());

/// One row of the table of the team: the defaults and the `roles:` block of the team file.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RoleRights {
    pub role: Role,
    pub access: Access,
    /// The rights that `access` gives.
    pub rights: Vec<Right>,
}

/// One row of the table to save.
#[derive(Debug, Clone, PartialEq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RoleAccess {
    pub role: Role,
    pub access: Access,
}

/// The roles of one member to save. The first role is the `role` of the member.
#[derive(Debug, Clone, PartialEq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MemberRoles {
    pub handle: String,
    pub roles: Vec<Role>,
}

/// What the views need: the person, where the rights come from, the warnings and the table of
/// each role: the defaults and the `roles:` block (REQ-002, REQ-003, REQ-008).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RightsView {
    pub person: Person,
    /// The default branch that gives the rights (`origin/main`). `None`: the working copy.
    pub branch: Option<String>,
    /// Unix seconds of the last fetch, when known.
    #[specta(type = Option<u32>)]
    pub fetched: Option<u64>,
    /// `team-differs`: the team file of the working copy is not the one of the default branch.
    /// `team-invalid`: the team file cannot be read, so the person is `viewer`.
    pub warnings: Vec<String>,
    pub roles: Vec<RoleRights>,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// The team file of the working copy. Only `.shipyard/team.yaml` gives rights (REQ-001): the
/// `team.json` of the docs layout has no role and no admin flag.
fn local_team(root: &Path) -> Res<Option<String>> {
    match std::fs::read_to_string(root.join(TEAM_PATH)) {
        Ok(t) => Ok(Some(t)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{TEAM_PATH}: {e}")),
    }
}

/// The team that gives the rights, the default branch that holds it, and whether the working
/// copy differs from it.
struct Source {
    team: Res<Team>,
    branch: Option<String>,
    differs: bool,
}

fn source(root: &Path, repo: Option<&Repo>) -> Source {
    let local = local_team(root);
    let remote = repo.and_then(|r| Some((r, r.remote().ok()??.0)));
    let branch = remote
        .as_ref()
        .and_then(|(r, name)| r.default_branch(name).map(|b| (*r, b)));
    let (text, differs) = match (&branch, &remote) {
        (Some((r, b)), _) => {
            // The full ref: a local branch or a tag named `origin/main` does not win.
            let at = r
                .text_at(&format!("refs/remotes/{b}"), TEAM_PATH)
                .map_err(err);
            let differs = match (&at, &local) {
                (Ok(a), Ok(l)) => a != l,
                _ => true,
            };
            (at, differs)
        }
        // A remote, but no default branch fetched yet (REQ-002). The shared state is "no team
        // file", which gives each person every right (REQ-004). A team file of the working copy
        // can only give the same rights or fewer, so it applies, with the warning: it is not the
        // file of the default branch.
        (None, Some(_)) => {
            let differs = !matches!(local, Ok(None));
            (local, differs)
        }
        (None, None) => (local, false),
    };
    let team = text.and_then(|t| match t {
        None => Ok(Team::default()),
        Some(t) => read_team(&t, None).map_err(err),
    });
    Source {
        team,
        branch: branch.map(|(_, b)| b),
        differs,
    }
}

/// The right that a file action on `full` needs: `project.settings` when `full` is the team file
/// or a folder that holds it, else `code.write`. A delete or a move of the team file changes the
/// rights (REQ-001): with no team file, each person has every right. The parent folder is
/// resolved and the case is ignored, so a link or another case does not skip the check.
pub(crate) fn path_right(root: &Path, full: &Path) -> Right {
    let real = |p: &Path| p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    let full = match (full.parent(), full.file_name()) {
        (Some(dir), Some(name)) => real(dir).join(name),
        _ => full.to_path_buf(),
    };
    let low = |p: &Path| -> Vec<String> {
        p.components()
            .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
            .collect()
    };
    let root = real(root);
    let (path, team) = (low(&full), low(&root.join(TEAM_PATH)));
    if path.len() > low(&root).len() && team.starts_with(&path) {
        Right::ProjectSettings
    } else {
        Right::CodeWrite
    }
}

/// The stronger of two rights for one action: `project.settings` wins over `code.write`.
pub(crate) fn both(a: Right, b: Right) -> Right {
    if a == Right::ProjectSettings { a } else { b }
}

/// The personal role of this machine for the project: the e-mail map, then the profile of the
/// project, then the role of Settings / Me (the order of the views).
fn personal(s: &AppState, e: &Entry, email: Option<&str>) -> Option<String> {
    let o = &e.overrides;
    email
        .and_then(|m| o.assignments.as_ref()?.get(m).cloned())
        .or_else(|| o.profile_role.clone())
        .or_else(|| {
            serde_json::to_value(Prefs::load(&s.dir).role)
                .ok()?
                .as_str()
                .map(String::from)
        })
}

/// The person and the rights in the active project. `Err` when no project is open.
pub fn current(s: &AppState) -> Res<RightsView> {
    view(s, true)
}

/// `narrow`: the personal role and the read-only profile remove rights (REQ-006).
fn view(s: &AppState, narrow: bool) -> Res<RightsView> {
    let a = active(s)?.ok_or("no active project")?;
    view_of(s, &a, narrow)
}

fn view_of(s: &AppState, a: &Active, narrow: bool) -> Res<RightsView> {
    let root = PathBuf::from(&a.entry.path);
    let repo = Repo::open(&root).ok();
    let email = repo.as_ref().and_then(Repo::user_email);
    let src = source(&root, repo.as_ref());
    // Only an account that the token of a passed test gave: never the typed `user` (REQ-003).
    let accounts: Vec<String> = [a.tracker.as_deref(), a.forge.as_deref()]
        .into_iter()
        .flatten()
        .filter_map(|id| s.connections.account(id))
        .collect();
    let read_only = narrow && a.entry.overrides.read_only == Some(true);
    let personal = narrow
        .then(|| personal(s, &a.entry, email.as_deref()))
        .flatten();
    let mut warnings = Vec::new();
    if src.differs {
        warnings.push("team-differs".to_string());
    }
    let person = match &src.team {
        Ok(team) => rights::person(
            team,
            &accounts,
            email.as_deref(),
            personal.as_deref(),
            read_only,
        ),
        Err(_) => {
            warnings.push("team-invalid".into());
            rights::unknown(read_only)
        }
    };
    let fetched = src
        .branch
        .as_ref()
        .and_then(|_| std::fs::metadata(root.join(".git/FETCH_HEAD")).ok())
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    Ok(RightsView {
        person,
        branch: src.branch,
        fetched,
        warnings,
        roles: rights::table(src.team.as_ref().unwrap_or(&Team::default()))
            .into_iter()
            .map(|(role, access)| RoleRights {
                role,
                access,
                rights: access.rights(),
            })
            .collect(),
    })
}

/// The check in front of a write (REQ-007). The audit line names the command and its target ref
/// (REQ-010). `target` is empty when the command gives none.
pub(crate) fn require(s: &AppState, right: Right, what: &'static str, target: &str) -> Res<()> {
    check(s, right, what, target)
}

/// `require` with the rights of the team file alone: for the save of the overrides that narrow.
pub(crate) fn require_unnarrowed(
    s: &AppState,
    right: Right,
    what: &'static str,
    target: &str,
) -> Res<()> {
    decide(s, right, what, target, false)
}

/// The check with the command or tool and the target ref that the audit line names. A refusal
/// names the missing right and the role. With no open project, or when the person cannot be
/// found, the write is refused.
pub(crate) fn check(s: &AppState, right: Right, what: &str, target: &str) -> Res<()> {
    decide(s, right, what, target, true)
}

fn decide(s: &AppState, right: Right, what: &str, target: &str, narrow: bool) -> Res<()> {
    let view = view(s, narrow);
    let allowed = view.as_ref().is_ok_and(|v| v.person.has(right));
    if let Ok(v) = &view {
        let result = if allowed { "allowed" } else { "refused" };
        record(s, v, right, what, target, result)?;
    }
    match view {
        Ok(_) if allowed => Ok(()),
        Ok(v) => Err(v.person.refusal(right)),
        Err(e) => Err(e),
    }
}

/// Write one audit line for the active project. A failed write goes to the app log only.
fn record(
    s: &AppState,
    v: &RightsView,
    right: Right,
    what: &str,
    target: &str,
    result: &str,
) -> Res<()> {
    if let Some(e) = s.registry()?.active() {
        let line = AuditLine {
            time: now(),
            member: v.person.member.clone(),
            found: v.person.found,
            right,
            what: what.into(),
            target: target.into(),
            result: result.into(),
        };
        if let Err(why) = audit(&s.dir, &file_key(e), &line) {
            crate::applog::record("warn", &format!("audit log: {why}"));
        }
    }
    Ok(())
}

/// The audit line of a write that needs no right: a join request (REQ-011). `right` is the right
/// that the merge of its pull request needs. The result is `requested`.
pub(crate) fn note(s: &AppState, right: Right, what: &str, target: &str) -> Res<()> {
    record(s, &current(s)?, right, what, target, "requested")
}

/// The person has `right` now. No audit line: for a view or a mode, not for a write.
pub(crate) fn allows(s: &AppState, right: Right) -> bool {
    current(s).is_ok_and(|v| v.person.has(right))
}

/// The person of a project as the factory sees it: a run keeps the rights of the member who
/// started it (REQ-009). Each project gets its own person, from its own team file. `None` when
/// the project is not on this machine or its person cannot be found: the run then has no right,
/// and each write waits in the Inbox.
pub(crate) fn actor(s: &AppState, project: &str) -> Option<shipyard_engine::run_engine::Actor> {
    let entry = s.registry().ok()?.get(project).cloned()?;
    let p = view_of(s, &active_of(entry), true).ok()?.person;
    Some(shipyard_engine::run_engine::Actor {
        by: p.member.unwrap_or_else(|| p.found.as_str().into()),
        hidden: p.access.hidden(),
        rights: p.rights,
    })
}

/// A setting of this machine, not of the project (a sign-in, a key, a tool): no team right covers
/// it. It needs the click of a person, and the read-only profile of the project still refuses it.
pub(crate) fn need_click_local(s: &AppState, click: bool) -> Res<()> {
    if !click {
        return Err("this change needs the click of a person".into());
    }
    if s.registry()?
        .active()
        .is_some_and(|e| e.overrides.read_only == Some(true))
    {
        return Err("the profile of this project is read only".into());
    }
    Ok(())
}

// ---------------------------------------------------------------- audit log

/// One line of `audit/<project key>.jsonl` (REQ-010).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct AuditLine {
    /// Unix seconds.
    #[specta(type = u32)]
    pub time: u64,
    /// The handle of the member. `None`: solo or unknown.
    pub member: Option<String>,
    pub found: Found,
    pub right: Right,
    /// The command or the tool.
    pub what: String,
    /// The target ref. Empty when the command gives none.
    pub target: String,
    /// `allowed`, `refused`, or `requested` for a join request.
    pub result: String,
}

/// The file name of the audit log of a project: its key, else its id.
fn file_key(e: &Entry) -> String {
    let ok = |k: &str| {
        !k.is_empty()
            && k.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    };
    [e.key.as_str(), e.id.as_str()]
        .into_iter()
        .find(|k| ok(k))
        .unwrap_or("project")
        .to_string()
}

fn audit_path(dir: &Path, key: &str) -> PathBuf {
    dir.join("audit").join(format!("{key}.jsonl"))
}

fn time_of(line: &str) -> u64 {
    serde_json::from_str::<serde_json::Value>(line)
        .ok()
        .and_then(|v| v["time"].as_u64())
        .unwrap_or(0)
}

/// Append one line. When the first line is older than 90 days, the old lines go first.
fn audit(dir: &Path, key: &str, line: &AuditLine) -> Res<()> {
    let _g = AUDIT.lock().unwrap_or_else(|e| e.into_inner());
    let path = audit_path(dir, key);
    std::fs::create_dir_all(path.parent().ok_or("no audit folder")?).map_err(err)?;
    let cut = line.time.saturating_sub(KEEP_SECS);
    let first = std::fs::File::open(&path).ok().and_then(|f| {
        std::io::BufReader::new(f)
            .lines()
            .next()
            .and_then(Result::ok)
    });
    if first.is_some_and(|l| time_of(&l) < cut) {
        let text = std::fs::read_to_string(&path).map_err(err)?;
        let kept: String = text
            .lines()
            .filter(|l| time_of(l) >= cut)
            .map(|l| format!("{l}\n"))
            .collect();
        write_atomic(&path, kept.as_bytes()).map_err(err)?;
    }
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(err)?;
    let text = serde_json::to_string(line).map_err(err)?;
    f.write_all(format!("{text}\n").as_bytes()).map_err(err)
}

/// The audit lines of the active project, oldest first.
pub(crate) fn audit_lines(s: &AppState) -> Res<Vec<AuditLine>> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Ok(std::fs::read_to_string(audit_path(&s.dir, &file_key(&e)))
        .unwrap_or_default()
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect())
}

/// The last 100 lines of the audit log, for a person with `project.settings` (REQ-010).
pub fn audit_tail(s: &AppState) -> Res<Vec<AuditLine>> {
    let p = current(s)?.person;
    if !p.has(Right::ProjectSettings) {
        return Err(p.refusal(Right::ProjectSettings));
    }
    let mut lines = audit_lines(s)?;
    Ok(lines.split_off(lines.len().saturating_sub(100)))
}

/// Save the `roles:` block and the roles of the members (REQ-019). It needs `project.settings`
/// and writes an audit line. A row that is the default leaves the block. An unknown handle or a
/// member with no role is refused, and the file stays.
pub fn roles_save(s: &AppState, table: &[RoleAccess], members: &[MemberRoles]) -> Res<RightsView> {
    require(s, Right::ProjectSettings, "rights_roles_save", TEAM_PATH)?;
    if crate::work::team_is_json(s)? {
        return Err(format!(
            "the roles need {TEAM_PATH}: the team.json of the docs layout gives no rights"
        ));
    }
    let view = crate::work::team_get(s)?;
    if let Some(e) = view.error {
        return Err(e);
    }
    let mut team = view.team;
    let rows: Vec<(Role, Access)> = rights::table(&team)
        .into_iter()
        .map(|(role, old)| {
            let new = table.iter().rev().find(|r| r.role == role);
            (role, new.map_or(old, |r| r.access))
        })
        .collect();
    team.roles = rights::block(&rows);
    for mr in members {
        let m = team
            .members
            .iter_mut()
            .find(|m| m.handle == mr.handle)
            .ok_or_else(|| format!("no member {}", mr.handle))?;
        let first = mr
            .roles
            .first()
            .ok_or_else(|| format!("{} needs one role", mr.handle))?;
        m.role = first.as_str().into();
        m.roles = match mr.roles.len() {
            1 => Vec::new(),
            _ => mr.roles.iter().map(|r| r.as_str().to_string()).collect(),
        };
    }
    crate::work::team_save(s, team)?;
    current(s)
}

/// The person and the rights in the open project, for the views (REQ-008).
#[tauri::command]
#[specta::specta]
pub async fn rights_get(app: AppHandle) -> Api<RightsView> {
    blocking(app, current).await
}

/// Save the table of the roles and the roles of the members.
#[tauri::command]
#[specta::specta]
pub async fn rights_roles_save(
    app: AppHandle,
    table: Vec<RoleAccess>,
    members: Vec<MemberRoles>,
) -> Api<RightsView> {
    blocking(app, move |s| roles_save(s, &table, &members)).await
}

/// The last lines of the audit log of the open project.
#[tauri::command]
#[specta::specta]
pub async fn rights_audit_tail(app: AppHandle) -> Api<Vec<AuditLine>> {
    blocking(app, audit_tail).await
}

#[cfg(test)]
mod tests;
