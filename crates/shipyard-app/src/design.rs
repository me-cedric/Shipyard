//! Design IPC (spec `design`): the artifacts, the file reads and writes, the ADRs, the flow table,
//! the API try request and the open-outside action.
//!
//! Every path from the view goes through `shipyard_store::design::resolve`. A write goes through
//! `safe_write` (REQ-023). A file that cannot be read stays unchanged (REQ-005).

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use shipyard_core::flows::{self, FlowRow};
use shipyard_core::project::ProjectFile;
use shipyard_http::{Auth, Method, Request};
use shipyard_store::design::{self, Artifact, MAX_BYTES, Screen};
use shipyard_store::madr::{self, Adr, Decision};
use shipyard_store::project::{FileRead, read_project_file};
use shipyard_store::safe_write::{self, Saved};
use specta::Type;
use tauri::AppHandle;

use crate::commands::{AppState, Res, blocking, err};

/// The active project: its folder and its project file.
pub(crate) struct Proj {
    pub root: PathBuf,
    pub file: ProjectFile,
    pub id: String,
}

pub(crate) fn project(s: &AppState) -> Res<Proj> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let root = PathBuf::from(&e.path);
    let file = match read_project_file(&root) {
        Ok(FileRead::Valid(f)) => f,
        _ => ProjectFile::new(&e.name, &e.key),
    };
    Ok(Proj {
        root,
        file,
        id: e.id,
    })
}

/// A text file and the stamp that a later write must give back.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Text {
    pub text: String,
    pub stamp: String,
}

/// The result of a write. With `conflict`, nothing was written and `stamp` is the stamp on disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Written {
    pub conflict: bool,
    pub stamp: Option<String>,
}

/// Read a file that is UTF-8 and not bigger than `MAX_BYTES`. The file stays unchanged.
pub(crate) fn read_text(full: &Path, rel: &str) -> Res<Text> {
    let stamp = safe_write::stamp(full).map_err(err)?;
    let stamp = stamp.ok_or_else(|| format!("{rel}: no such file"))?;
    let meta = std::fs::metadata(full).map_err(|e| format!("{rel}: {e}"))?;
    if !meta.is_file() || meta.len() > MAX_BYTES {
        return Err(format!("{rel}: not a file or too big"));
    }
    let bytes = std::fs::read(full).map_err(|e| format!("{rel}: {e}"))?;
    let text = String::from_utf8(bytes).map_err(|_| format!("{rel}: not UTF-8 text"))?;
    Ok(Text { text, stamp })
}

/// Write in full or not at all. `create` makes a new file and refuses an existing one.
pub(crate) fn put(
    s: &AppState,
    full: &Path,
    text: &str,
    stamp: Option<&str>,
    create: bool,
) -> Res<Written> {
    if text.len() as u64 > MAX_BYTES {
        return Err("the text is too big".into());
    }
    let _g = s.guard();
    let done = |st| Written {
        conflict: false,
        stamp: Some(st),
    };
    if create {
        return safe_write::create(full, text).map(done).map_err(err);
    }
    match safe_write::write(full, text, stamp).map_err(err)? {
        Saved::Done(st) => Ok(done(st)),
        Saved::Conflict => Ok(Written {
            conflict: true,
            stamp: safe_write::stamp(full).ok().flatten(),
        }),
    }
}

// ---------------------------------------------------------------- list

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DesignList {
    pub artifacts: Vec<Artifact>,
    pub adrs: Vec<Adr>,
    pub screens: Vec<Screen>,
    /// Why `screens.json` is not readable. The screens stay empty then.
    pub screens_error: Option<String>,
    /// Repository path of the design doc.
    pub doc: String,
}

pub fn list(s: &AppState) -> Res<DesignList> {
    let p = project(s)?;
    let (screens, screens_error) = match design::read_screens(&p.root, &p.file) {
        Ok(v) => (v, None),
        Err(e) => (Vec::new(), Some(e)),
    };
    Ok(DesignList {
        artifacts: design::list(&p.root, &p.file),
        adrs: madr::list(&p.root, &p.file),
        screens,
        screens_error,
        doc: design::design_doc_path(&p.file),
    })
}

pub fn read(s: &AppState, rel: &str) -> Res<Text> {
    let p = project(s)?;
    read_text(&design::resolve(&p.root, &p.file, rel)?, rel)
}

pub fn write(
    s: &AppState,
    rel: &str,
    text: &str,
    stamp: Option<&str>,
    create: bool,
) -> Res<Written> {
    let p = project(s)?;
    put(
        s,
        &design::resolve(&p.root, &p.file, rel)?,
        text,
        stamp,
        create,
    )
}

// ---------------------------------------------------------------- ADR

/// A new proposed ADR with the next free number (REQ-009).
pub fn adr_create(s: &AppState, title: &str) -> Res<Adr> {
    let title = title.trim();
    if title.is_empty() || title.contains(['\n', '\r']) {
        return Err("the title must be one line".into());
    }
    let p = project(s)?;
    let number = madr::next_number(&madr::list(&p.root, &p.file));
    let date = crate::work::today(s);
    let (name, text) = madr::new_adr(&number, title, &date);
    let path = format!("{}/{name}", p.file.path("decisions"));
    put(
        s,
        &design::resolve(&p.root, &p.file, &path)?,
        &text,
        None,
        true,
    )?;
    Ok(Adr {
        number,
        title: title.into(),
        status: "proposed".into(),
        date,
        path,
    })
}

/// Accept or reject a proposed ADR with a comment (REQ-010). `stamp` is the stamp of the read.
pub fn adr_decide(
    s: &AppState,
    rel: &str,
    decision: Decision,
    comment: &str,
    stamp: &str,
) -> Res<Written> {
    let p = project(s)?;
    let full = design::resolve(&p.root, &p.file, rel)?;
    if !rel.starts_with(&format!("{}/", p.file.path("decisions"))) {
        return Err(format!("not an ADR: {rel}"));
    }
    let text = read_text(&full, rel)?.text;
    let out = madr::decide(&text, decision, comment, &crate::work::today(s))?;
    put(s, &full, &out, Some(stamp), false)
}

// ---------------------------------------------------------------- flows

/// Save the flow table. Each row must pass `flows::check` (REQ-018).
pub fn flows_save(s: &AppState, rel: &str, rows: &[FlowRow], stamp: Option<&str>) -> Res<Written> {
    let p = project(s)?;
    let full = design::resolve(&p.root, &p.file, rel)?;
    if !design::is_under(rel, p.file.path("flows")) {
        return Err(format!("not a flow file: {rel}"));
    }
    for r in rows {
        flows::check(r).map_err(|e| format!("row {}: {e}", r.id))?;
    }
    put(s, &full, &design::write_flows(rows), stamp, !full.exists())
}

// ---------------------------------------------------------------- try

const TRY_BODY_MAX: usize = 1024 * 1024;

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TryRequest {
    /// The contract file.
    pub path: String,
    /// One of the `servers` of the contract, as written there.
    pub server: String,
    pub method: String,
    /// Starts with `/`. The query is part of it.
    pub route: String,
    /// JSON text.
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TryResponse {
    pub status: u16,
    /// At most 1 MB.
    pub body: String,
    pub truncated: bool,
    pub elapsed_ms: u32,
}

/// Send one request from a contract (REQ-013, Q-039 option 1). The server must be one that the
/// contract lists. A request that is not GET needs `click`. The request holds no credential. The
/// URL is in no log and in no error text.
pub fn try_request(s: &AppState, r: &TryRequest, click: bool) -> Res<TryResponse> {
    let method = match r.method.to_ascii_uppercase().as_str() {
        "GET" => Method::Get,
        "POST" => Method::Post,
        "PUT" => Method::Put,
        "PATCH" => Method::Patch,
        "DELETE" => Method::Delete,
        m => return Err(format!("method not allowed: {m}")),
    };
    if method != Method::Get {
        crate::work::need_click(click)?;
    }
    if !r.route.starts_with('/')
        || r.route.starts_with("//")
        || r.route.contains(char::is_whitespace)
    {
        return Err("the route must start with one `/` and hold no space".into());
    }
    let p = project(s)?;
    let contract = design::resolve(&p.root, &p.file, &r.path)?;
    if !design::is_under(&r.path, p.file.path("api")) {
        return Err(format!("not a contract: {}", r.path));
    }
    let (_, base) = design::api_servers(&read_text(&contract, &r.path)?.text)?
        .into_iter()
        .find(|(raw, _)| *raw == r.server)
        .ok_or("the contract does not list this server")?;
    if !(base.starts_with("https://") || base.starts_with("http://")) {
        return Err("the server is not an absolute http or https address".into());
    }
    let body = r
        .body
        .as_deref()
        .filter(|b| !b.trim().is_empty())
        .map(serde_json::from_str::<Value>)
        .transpose()
        .map_err(|e| format!("the body is not JSON: {e}"))?;
    let url = format!("{}{}", base.trim_end_matches('/'), r.route);
    let req = Request {
        method,
        url: url.clone(),
        auth: Auth::None,
        headers: Vec::new(),
        body,
        timeout: Some(Duration::from_secs(20)),
    };
    let start = Instant::now();
    let res = s
        .connections
        .http()
        .send(&req)
        .map_err(|e| e.to_string().replace(&url, "the server"))?;
    let truncated = res.body.len() > TRY_BODY_MAX;
    let cut = &res.body[..res.body.len().min(TRY_BODY_MAX)];
    Ok(TryResponse {
        status: res.status,
        body: String::from_utf8_lossy(cut).into_owned(),
        truncated,
        elapsed_ms: start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32,
    })
}

// ---------------------------------------------------------------- open outside

/// The files that the OS may open: design files and the diagram formats that the app shows
/// read-only (Q-040).
const OUTSIDE: [&str; 4] = [".fig", ".drawio", ".drawio.svg", ".bpmn"];

/// What the OS opens: an https address, or the absolute path of an `OUTSIDE` file in the repository.
fn outside_target(root: &Path, target: &str) -> Res<String> {
    if let Some(rest) = target.strip_prefix("https://") {
        let ok =
            !rest.is_empty() && !target.contains(|c: char| c.is_whitespace() || c.is_control());
        return if ok {
            Ok(target.into())
        } else {
            Err("bad address".into())
        };
    }
    let bad = || format!("not an https address or a design file of the project: {target}");
    let lower = target.to_lowercase();
    if !design::plain(target) || !OUTSIDE.iter().any(|e| lower.ends_with(e)) {
        return Err(bad());
    }
    let full = root.join(target).canonicalize().map_err(|_| bad())?;
    let base = root.canonicalize().map_err(err)?;
    if full.starts_with(&base) && full.is_file() {
        Ok(full.to_string_lossy().into_owned())
    } else {
        Err(bad())
    }
}

/// Open a `.fig` link outside the app, with the default application of the OS (REQ-019). Ported
/// from Legacy `open_repo_file`: the path is checked against the repository first, and no shell
/// parses the argument.
pub fn open_outside(s: &AppState, target: &str) -> Res<()> {
    let p = project(s)?;
    let arg = outside_target(&p.root, target)?;
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut cmd = std::process::Command::new("xdg-open");
    cmd.arg(arg)
        .spawn()
        .map_err(|e| format!("cannot open: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn design_list(app: AppHandle) -> Res<DesignList> {
    blocking(app, list).await
}

#[tauri::command]
#[specta::specta]
pub async fn design_read(app: AppHandle, path: String) -> Res<Text> {
    blocking(app, move |s| read(s, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn design_write(
    app: AppHandle,
    path: String,
    text: String,
    stamp: Option<String>,
    create: bool,
) -> Res<Written> {
    blocking(app, move |s| {
        write(s, &path, &text, stamp.as_deref(), create)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn design_adr_create(app: AppHandle, title: String) -> Res<Adr> {
    blocking(app, move |s| adr_create(s, &title)).await
}

#[tauri::command]
#[specta::specta]
pub async fn design_adr_decide(
    app: AppHandle,
    path: String,
    decision: Decision,
    comment: String,
    stamp: String,
) -> Res<Written> {
    blocking(app, move |s| {
        adr_decide(s, &path, decision, &comment, &stamp)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn design_flows_save(
    app: AppHandle,
    path: String,
    rows: Vec<FlowRow>,
    stamp: Option<String>,
) -> Res<Written> {
    blocking(app, move |s| flows_save(s, &path, &rows, stamp.as_deref())).await
}

#[tauri::command]
#[specta::specta]
pub async fn design_try(app: AppHandle, request: TryRequest, click: bool) -> Res<TryResponse> {
    blocking(app, move |s| try_request(s, &request, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn design_open(app: AppHandle, target: String) -> Res<()> {
    blocking(app, move |s| open_outside(s, &target)).await
}

#[cfg(test)]
mod tests;
