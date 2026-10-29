//! Extensions IPC (spec `extensions`): the compass entries, the roles and skills, the catalog, the
//! plugins and the child projects. A write that leaves the app (a clone, a deploy to a clone)
//! runs only from its own command, which the view calls after a click. Nothing pushes (Q-051).

pub mod compass;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use shipyard_core::extensions::{Kind, WriteReport, current_keys, progress, proposed};
use shipyard_git::child_deploy::{branch_new, commit_all};
use shipyard_git::project::clone_repo;
use shipyard_store::catalog::{self, Component};
use shipyard_store::compass::{self as store_compass, Compass};
use shipyard_store::plugins::{self, Review};
use shipyard_store::roles_skills::{self, Row};
use specta::Type;
use tauri::AppHandle;

use crate::agents::McpCustom;
use crate::commands::{AppState, Res, blocking, err};
use compass::Applied;

fn root(s: &AppState) -> Res<PathBuf> {
    Ok(crate::design::project(s)?.root)
}

// ---------------------------------------------------------------- compass

#[tauri::command]
#[specta::specta]
pub async fn compass_get(app: AppHandle) -> Res<Option<Compass>> {
    blocking(app, |s| store_compass::read(&root(s)?).map_err(err)).await
}

#[tauri::command]
#[specta::specta]
pub async fn compass_preview(app: AppHandle, kind: Kind, id: String) -> Res<String> {
    blocking(app, move |s| {
        store_compass::preview(&root(s)?, kind, &id).map_err(err)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn compass_apply(app: AppHandle, entries: Vec<String>) -> Res<Applied> {
    blocking(app, move |s| compass::apply(&root(s)?, &entries)).await
}

#[tauri::command]
#[specta::specta]
pub async fn compass_upgrade(app: AppHandle, selection: Option<Vec<String>>) -> Res<Applied> {
    blocking(app, move |s| {
        compass::upgrade(&root(s)?, selection.as_deref())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn roles_skills_get(app: AppHandle) -> Res<Vec<Row>> {
    blocking(app, |s| roles_skills::list(&root(s)?).map_err(err)).await
}

// ---------------------------------------------------------------- catalog

#[tauri::command]
#[specta::specta]
pub async fn catalog_get(app: AppHandle) -> Res<Vec<Component>> {
    blocking(app, |s| catalog::list(&root(s)?).map_err(err)).await
}

/// The files that a deploy would write and keep. It writes nothing (REQ-010).
#[tauri::command]
#[specta::specta]
pub async fn catalog_preview(app: AppHandle, id: String) -> Res<WriteReport> {
    blocking(app, move |s| catalog::preview(&root(s)?, &id).map_err(err)).await
}

#[tauri::command]
#[specta::specta]
pub async fn catalog_deploy(app: AppHandle, id: String) -> Res<WriteReport> {
    blocking(app, move |s| catalog::deploy(&root(s)?, &id).map_err(err)).await
}

// ---------------------------------------------------------------- plugins

/// A plugin file is bounded before it is read.
fn plugin_at(path: &str) -> Res<plugins::Plugin> {
    let meta = std::fs::metadata(path).map_err(err)?;
    if !meta.is_file() || meta.len() > 12 * 1024 * 1024 {
        return Err("the archive is not a file or is too large".into());
    }
    plugins::read(&std::fs::read(path).map_err(err)?).map_err(err)
}

/// Read the `.zip` as data and list what it would write. Nothing is written (REQ-011, REQ-012).
#[tauri::command]
#[specta::specta]
pub async fn plugin_review(app: AppHandle, path: String) -> Res<Review> {
    blocking(app, move |s| {
        Ok(plugins::review(&root(s)?, &plugin_at(&path)?))
    })
    .await
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PluginApplied {
    pub report: WriteReport,
    /// The servers that now show in Settings / Connections.
    pub mcp_added: Vec<String>,
    /// `<name>: <reason>`.
    pub mcp_failed: Vec<String>,
}

/// Write the accepted items. An MCP server goes to connections as an address: a header value
/// stays a `${VAR}` reference that the person fills there (REQ-013).
#[tauri::command]
#[specta::specta]
pub async fn plugin_apply(
    app: AppHandle,
    path: String,
    accepted: Vec<String>,
) -> Res<PluginApplied> {
    blocking(app, move |s| {
        let done = plugins::apply(&root(s)?, &plugin_at(&path)?, &accepted).map_err(err)?;
        let (mut mcp_added, mut mcp_failed) = (Vec::new(), Vec::new());
        for (name, server) in done.mcp {
            let draft = McpCustom {
                id: None,
                name: name.clone(),
                description: "Plugin".into(),
                command: server.url.unwrap_or_default(),
                args: Vec::new(),
                env: Vec::new(),
            };
            match s.agents.mcp_add_custom(draft) {
                Ok(_) => mcp_added.push(name),
                Err(e) => mcp_failed.push(format!("{name}: {e}")),
            }
        }
        Ok(PluginApplied {
            report: done.report,
            mcp_added,
            mcp_failed,
        })
    })
    .await
}

// ---------------------------------------------------------------- child projects

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ChildRec {
    pub id: String,
    pub name: String,
    /// A git address, or a local path.
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct Child {
    pub id: String,
    pub name: String,
    pub url: String,
    pub cloned: bool,
    /// n of m (REQ-015).
    pub held: u32,
    pub total: u32,
    /// The current parent entries that the child lacks, as keys.
    pub proposed: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct ChildResult {
    pub id: String,
    pub branch: Option<String>,
    pub commit: Option<String>,
    pub report: WriteReport,
    pub error: Option<String>,
}

fn recs_file(s: &AppState) -> Res<PathBuf> {
    let id = s
        .registry()?
        .active()
        .map(|e| e.id.clone())
        .ok_or("no active project")?;
    Ok(s.dir.join("children").join(format!("{id}.json")))
}

fn clone_dir(s: &AppState, child: &str) -> Res<PathBuf> {
    Ok(recs_file(s)?.with_extension("").join(child))
}

fn recs(s: &AppState) -> Res<Vec<ChildRec>> {
    Ok(std::fs::read_to_string(recs_file(s)?)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default())
}

fn save(s: &AppState, v: &[ChildRec]) -> Res<()> {
    let f = recs_file(s)?;
    shipyard_store::project::write_atomic(
        &f,
        serde_json::to_string_pretty(v).map_err(err)?.as_bytes(),
    )
    .map_err(err)
}

/// The keys that a child may take: current in the parent. A guide is read in the tree, so it is
/// not deployed.
fn parent_keys(parent: &Path) -> Res<Vec<String>> {
    let mut keys = store_compass::read(parent)
        .map_err(err)?
        .map(|c| {
            current_keys(
                &c.entries
                    .into_iter()
                    .filter(|e| e.kind != Kind::Guide)
                    .collect::<Vec<_>>(),
            )
        })
        .unwrap_or_default();
    for c in catalog::list(parent).map_err(err)? {
        if c.state == shipyard_core::extensions::SyncState::Current {
            keys.push(format!("component:{}", c.id));
        }
    }
    Ok(keys)
}

fn child_view(s: &AppState, parent: &Path, r: &ChildRec) -> Res<Child> {
    let dir = clone_dir(s, &r.id)?;
    let cloned = dir.join(".git").exists();
    let has: Vec<String> = if cloned {
        [store_compass::held(&dir), catalog::held(&dir)].concat()
    } else {
        Vec::new()
    };
    let all = parent_keys(parent)?;
    let (held, total) = progress(&all, &has);
    Ok(Child {
        id: r.id.clone(),
        name: r.name.clone(),
        url: r.url.clone(),
        cloned,
        held: held as u32,
        total: total as u32,
        proposed: proposed(&all, &has),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn child_list(app: AppHandle) -> Res<Vec<Child>> {
    blocking(app, |s| {
        let parent = root(s)?;
        recs(s)?.iter().map(|r| child_view(s, &parent, r)).collect()
    })
    .await
}

/// Record a child project. It clones nothing: the clone is a separate click.
#[tauri::command]
#[specta::specta]
pub async fn child_add(app: AppHandle, name: String, url: String) -> Res<Child> {
    blocking(app, move |s| {
        let id: String = name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_string();
        if id.is_empty() || url.trim().is_empty() || url.starts_with('-') {
            return Err("a child project needs a name and an address".into());
        }
        let mut all = recs(s)?;
        if all.iter().any(|r| r.id == id) {
            return Err(format!("{id} exists"));
        }
        let rec = ChildRec {
            id,
            name: name.trim().into(),
            url: url.trim().into(),
        };
        all.push(rec.clone());
        save(s, &all)?;
        child_view(s, &root(s)?, &rec)
    })
    .await
}

/// Forget a child. The clone on disk stays: the app deletes no folder of a person.
#[tauri::command]
#[specta::specta]
pub async fn child_remove(app: AppHandle, id: String) -> Res<()> {
    blocking(app, move |s| {
        let mut all = recs(s)?;
        all.retain(|r| r.id != id);
        save(s, &all)
    })
    .await
}

fn rec(s: &AppState, id: &str) -> Res<ChildRec> {
    recs(s)?
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("unknown child project: {id}"))
}

/// Clone the child into the app data folder (REQ-016). It reads the remote and writes there.
#[tauri::command]
#[specta::specta]
pub async fn child_clone(app: AppHandle, id: String) -> Res<Child> {
    blocking(app, move |s| {
        let r = rec(s, &id)?;
        let dest = clone_dir(s, &id)?;
        if !dest.join(".git").exists() {
            clone_repo(&r.url, &dest, &s.connections.git_auth(&r.url)?)?;
        }
        child_view(s, &root(s)?, &r)
    })
    .await
}

/// Deploy keys to one child: a new branch in its clone and one commit. Nothing is pushed.
fn deploy_one(
    s: &AppState,
    parent: &Path,
    id: &str,
    keys: &[String],
    branch: &str,
) -> Res<ChildResult> {
    let r = rec(s, id)?;
    let dir = clone_dir(s, id)?;
    if !dir.join(".git").exists() {
        return Err("clone the child project first".into());
    }
    let view = child_view(s, parent, &r)?;
    if let Some(k) = keys.iter().find(|k| !view.proposed.contains(k)) {
        return Err(format!("not proposed: {k}"));
    }
    branch_new(&dir, branch)?;
    let mut report = WriteReport::default();
    let mut compass_keys = Vec::new();
    for k in keys {
        match k.strip_prefix("component:") {
            Some(c) => {
                let done = catalog::deploy_to(parent, &dir, c).map_err(err)?;
                report.written.extend(done.written);
                report.kept.extend(done.kept);
            }
            None => compass_keys.push(k.clone()),
        }
    }
    if !compass_keys.is_empty() {
        let done = compass::apply_in(parent, &dir, &compass_keys)?;
        report.written.extend(done.report.written);
        report.kept.extend(done.report.kept);
    }
    let commit = commit_all(
        &dir,
        &format!("chore(extensions): deploy {} entries", keys.len()),
    )?;
    Ok(ChildResult {
        id: id.into(),
        branch: Some(branch.into()),
        commit,
        report,
        error: None,
    })
}

/// Deploy to each chosen child (REQ-016, REQ-017, REQ-018). A child that fails does not stop the
/// others: its result holds the error. A Health fix runs here with the key of the finding.
#[tauri::command]
#[specta::specta]
pub async fn child_deploy(
    app: AppHandle,
    ids: Vec<String>,
    keys: Vec<String>,
) -> Res<Vec<ChildResult>> {
    blocking(app, move |s| {
        let parent = root(s)?;
        let at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_secs());
        let branch = format!("shipyard/extensions-{at}");
        Ok(ids
            .iter()
            .map(|id| {
                deploy_one(s, &parent, id, &keys, &branch).unwrap_or_else(|error| ChildResult {
                    id: id.clone(),
                    branch: None,
                    commit: None,
                    report: WriteReport::default(),
                    error: Some(error),
                })
            })
            .collect())
    })
    .await
}
