//! Specs IPC (spec `specs`): changes and artifact status, validation, capabilities, questions,
//! test plans, the fold, the split and the archive.
//!
//! A write goes through `safe_write` (REQ-023). The fold, the split apply and the archive need the
//! click of a person. The split writes to the tracker only through the Work apply path
//! (`work::write_diff`), with the row ref as the match mark (REQ-018).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use shipyard_core::gherkin::{self, Plan, SyntaxError};
use shipyard_core::specs::{
    ARTIFACTS, ArtifactStatus, Marker, Requirement, artifact_path, markers, requirements, status,
    valid_change_id,
};
use shipyard_core::split::{self, Draft, Kind};
use shipyard_core::work::{DiffRow, Row, RowKind};
use shipyard_core::work_item::StatusCategory;
use shipyard_store::design::{self, resolve_in};
use shipyard_store::openspec_validate::{self, Finding};
use shipyard_store::project::write_atomic;
use shipyard_store::raid::{self, Entry, Question};
use shipyard_store::{archive, fold};
use shipyard_trackers::work as writes;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::connections::slug_text;
use crate::design::{Proj, Text, Written, project, put, read_text};
use crate::work::{ApplyRow, mirror_items, need_click, tracker, write_diff};

/// The folders that `specs_read` and `specs_write` open: the openspec folder, the questions and
/// the test plans.
const FOLDERS: [&str; 3] = ["specs", "questions", "test-plans"];

/// The last validation of each change, by project id and change id. Memory only: an artifact is
/// done after a passed validation since the last `specs_validate` (REQ-002).
#[derive(Default)]
pub struct Session {
    validated: Mutex<HashMap<(String, String), Vec<Finding>>>,
}

impl Session {
    fn set(&self, project: &str, change: &str, findings: Vec<Finding>) {
        let mut m = self.validated.lock().unwrap_or_else(|e| e.into_inner());
        m.insert((project.into(), change.into()), findings);
    }

    fn get(&self, project: &str, change: &str) -> Option<Vec<Finding>> {
        let m = self.validated.lock().unwrap_or_else(|e| e.into_inner());
        m.get(&(project.into(), change.into())).cloned()
    }

    fn forget(&self, project: &str, change: &str) {
        let mut m = self.validated.lock().unwrap_or_else(|e| e.into_inner());
        m.remove(&(project.into(), change.into()));
    }
}

fn openspec(p: &Proj) -> PathBuf {
    p.root.join(p.file.path("specs"))
}

/// The folder of the specs, relative to the project root.
pub(crate) fn specs_folder(s: &AppState) -> Res<String> {
    Ok(project(s)?.file.path("specs").to_string())
}

fn change_id(id: &str) -> Res<()> {
    if valid_change_id(id) && id != "archive" {
        Ok(())
    } else {
        Err(format!("invalid change id: {id}"))
    }
}

// ---------------------------------------------------------------- changes

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactState {
    /// `proposal`, `spec`, `plan`, `checklist` or `tasks`.
    pub artifact: String,
    pub capability: Option<String>,
    /// Inside the change folder.
    pub path: String,
    pub status: ArtifactStatus,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChangeView {
    pub id: String,
    /// The plain title that the person typed. The id when the change has none.
    pub title: String,
    /// Repository path of the change folder.
    pub path: String,
    /// `true` after a validation since the app started.
    pub validated: bool,
    pub artifacts: Vec<ArtifactState>,
}

/// The `title` of `.openspec.yaml`, a JSON string, or the id.
fn change_title(dir: &Path, id: &str) -> String {
    std::fs::read_to_string(dir.join(".openspec.yaml"))
        .ok()
        .and_then(|t| {
            let line = t.lines().find_map(|l| l.strip_prefix("title: "))?;
            serde_json::from_str::<String>(line).ok()
        })
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| id.into())
}

fn change_view(s: &AppState, p: &Proj, id: &str) -> ChangeView {
    let dir = openspec(p).join("changes").join(id);
    let found = s.specs.get(&p.id, id);
    let caps = archive::dir_names(&dir.join("specs"));
    let mut artifacts = Vec::new();
    for a in ARTIFACTS {
        // The proposal sits at the root; the other four sit under each capability.
        let list: Vec<Option<&String>> = if a == "proposal" {
            vec![None]
        } else {
            caps.iter().map(Some).collect()
        };
        for cap in list {
            let path = artifact_path(a, cap.map_or("", |c| c.as_str()));
            let findings: Vec<Finding> = found
                .iter()
                .flatten()
                .filter(|f| f.artifact == a && f.capability.as_ref() == cap)
                .cloned()
                .collect();
            let st = match (dir.join(&path).is_file(), found.is_some()) {
                // Without a validation nothing is done: a file is a draft.
                (true, false) => ArtifactStatus::Draft,
                (exists, _) => status(exists, findings.len()),
            };
            artifacts.push(ArtifactState {
                artifact: a.into(),
                capability: cap.cloned(),
                path,
                status: st,
                findings,
            });
        }
    }
    ChangeView {
        id: id.into(),
        title: change_title(&dir, id),
        path: format!("{}/changes/{id}", p.file.path("specs")),
        validated: found.is_some(),
        artifacts,
    }
}

pub fn changes(s: &AppState) -> Res<Vec<ChangeView>> {
    let p = project(s)?;
    Ok(archive::dir_names(&openspec(&p).join("changes"))
        .iter()
        .filter(|id| *id != "archive")
        .map(|id| change_view(s, &p, id))
        .collect())
}

/// A new change from a plain title: the id is the slug of the title. The proposal comes from the
/// schema template and the title goes to `.openspec.yaml` (REQ-003).
pub fn change_create(s: &AppState, title: &str) -> Res<ChangeView> {
    let title = title.trim();
    let id = slug_text(title);
    let id = id.as_str();
    // The id of a title is not an id that a person typed: this error asks for another title.
    change_id(id).map_err(|_| format!("the title needs a letter or a digit: {title}"))?;
    let p = project(s)?;
    let base = openspec(&p);
    let dir = base.join("changes").join(id);
    if dir.exists() {
        return Err(format!("change exists: {id}"));
    }
    let tpl = base.join("schemas/shipyard-delivery/templates/proposal.md");
    let proposal = std::fs::read_to_string(&tpl)
        .map_err(|e| format!("template {}: {e}", tpl.display()))?
        .replace("[CHANGE]", title);
    let meta = format!(
        "schema: shipyard-delivery\ncreated: {}\ntitle: {}\n",
        crate::work::today(s),
        serde_json::to_string(title).map_err(err)?
    );
    put(s, &dir.join("proposal.md"), &proposal, None, true)?;
    put(s, &dir.join(".openspec.yaml"), &meta, None, true)?;
    Ok(change_view(s, &p, id))
}

/// Run strict validation and keep the findings in memory (REQ-004).
pub fn validate(s: &AppState, id: &str) -> Res<Vec<Finding>> {
    change_id(id)?;
    let p = project(s)?;
    let findings = openspec_validate::run(&openspec(&p), id);
    s.specs.set(&p.id, id, findings.clone());
    Ok(findings)
}

// ---------------------------------------------------------------- files

fn path_of(p: &Proj, rel: &str) -> Res<PathBuf> {
    resolve_in(&p.root, &p.file, rel, &FOLDERS)
}

pub fn read(s: &AppState, rel: &str) -> Res<Text> {
    let p = project(s)?;
    read_text(&path_of(&p, rel)?, rel)
}

/// The change of a path `<openspec>/changes/<id>/...`.
fn change_of(p: &Proj, rel: &str) -> Option<String> {
    let rest = rel
        .strip_prefix(p.file.path("specs"))?
        .strip_prefix("/changes/")?;
    rest.split('/').next().map(String::from)
}

pub fn write(
    s: &AppState,
    rel: &str,
    text: &str,
    stamp: Option<&str>,
    create: bool,
) -> Res<Written> {
    let p = project(s)?;
    let out = put(s, &path_of(&p, rel)?, text, stamp, create)?;
    // The text changed, so the last validation no longer says anything about it.
    if let Some(id) = change_of(&p, rel).filter(|_| !out.conflict) {
        s.specs.forget(&p.id, &id);
    }
    Ok(out)
}

// ---------------------------------------------------------------- capabilities

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityRow {
    pub capability: String,
    pub path: String,
    pub requirements: u32,
}

/// The settled capabilities: `<openspec>/specs/<cap>/spec.md` (REQ-005).
pub fn capabilities(s: &AppState) -> Res<Vec<CapabilityRow>> {
    let p = project(s)?;
    let base = p.file.path("specs");
    Ok(archive::dir_names(&openspec(&p).join("specs"))
        .into_iter()
        .filter_map(|cap| {
            let path = format!("{base}/specs/{cap}/spec.md");
            let text = std::fs::read_to_string(p.root.join(&path)).ok()?;
            Some(CapabilityRow {
                requirements: requirements(&text).len() as u32,
                capability: cap,
                path,
            })
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SpecView {
    pub requirements: Vec<Requirement>,
    pub markers: Vec<Marker>,
}

pub fn spec(s: &AppState, rel: &str) -> Res<SpecView> {
    let text = read(s, rel)?.text;
    Ok(SpecView {
        requirements: requirements(&text),
        markers: markers(&text),
    })
}

// ---------------------------------------------------------------- questions

fn questions_dir(p: &Proj) -> PathBuf {
    p.root.join(p.file.path("questions"))
}

fn relative(p: &Proj, mut e: Entry) -> Entry {
    if let Ok(r) = Path::new(&e.path).strip_prefix(&p.root) {
        e.path = r.to_string_lossy().replace('\\', "/");
    }
    e
}

/// The RAID register, with paths relative to the repository (REQ-008).
pub fn questions(s: &AppState) -> Res<Vec<Entry>> {
    let p = project(s)?;
    Ok(raid::list(&questions_dir(&p))
        .into_iter()
        .map(|e| relative(&p, e))
        .collect())
}

/// Save one question file (REQ-009, REQ-010). `raid::write` refuses an unknown kind or status.
pub fn question_save(s: &AppState, rel: &str, q: &Question, stamp: Option<&str>) -> Res<Written> {
    let p = project(s)?;
    let full = path_of(&p, rel)?;
    if !design::is_under(rel, p.file.path("questions")) {
        return Err(format!("not a question file: {rel}"));
    }
    if questions(s)?
        .iter()
        .any(|e| e.path != rel && e.question.id == q.id)
    {
        return Err(format!("duplicate id {}", q.id));
    }
    let old = std::fs::read_to_string(&full).unwrap_or_default();
    put(s, &full, &raid::write_over(q, &old)?, stamp, false)
}

/// Create a question file. An empty id takes the next free one. It returns the path.
pub fn question_create(s: &AppState, mut q: Question) -> Res<String> {
    let p = project(s)?;
    let dir = questions_dir(&p);
    if q.id.is_empty() {
        q.id = raid::next_entry_id(&raid::list(&dir));
    }
    let _g = s.guard();
    raid::create_in(&dir, &q).map_err(err)?;
    Ok(format!("{}/{}.md", p.file.path("questions"), q.id))
}

// ---------------------------------------------------------------- test plans

/// The text of each requirement source: settled specs and the specs of each change, with the
/// capability name. `known` and `coverage` read them (REQ-013).
fn spec_texts(p: &Proj) -> Vec<(String, String)> {
    let base = openspec(p);
    let mut out = Vec::new();
    let mut add = |dir: PathBuf| {
        for cap in archive::dir_names(&dir) {
            if let Ok(t) = std::fs::read_to_string(dir.join(&cap).join("spec.md")) {
                out.push((cap, t));
            }
        }
    };
    add(base.join("specs"));
    for id in archive::dir_names(&base.join("changes"))
        .iter()
        .filter(|i| *i != "archive")
    {
        add(base.join("changes").join(id).join("specs"));
    }
    out
}

fn req_refs(cap: &str, text: &str) -> Vec<String> {
    requirements(text)
        .into_iter()
        .map(|r| format!("spec:{cap}#{}", r.id))
        .collect()
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlanRow {
    pub path: String,
    pub title: String,
    pub scenarios: u32,
    /// The refs that the scenarios cite.
    pub refs: Vec<String>,
    pub errors: Vec<SyntaxError>,
    /// The cited `spec:` refs that no spec holds.
    pub broken: Vec<String>,
}

/// Each plan file with its parse result. A plan with a syntax error has no scenarios.
fn plans(p: &Proj) -> Vec<(String, Result<Plan, Vec<SyntaxError>>)> {
    let dir = p.file.path("test-plans").to_string();
    let mut names: Vec<String> = std::fs::read_dir(p.root.join(&dir))
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".feature"))
        .collect();
    names.sort();
    names
        .into_iter()
        .map(|n| {
            let path = format!("{dir}/{n}");
            let parsed = match std::fs::read_to_string(p.root.join(&path)) {
                Ok(t) => gherkin::parse(&t),
                Err(e) => Err(vec![SyntaxError {
                    line: 0,
                    message: format!("cannot read: {e}"),
                }]),
            };
            (path, parsed)
        })
        .collect()
}

pub fn testplans(s: &AppState) -> Res<Vec<PlanRow>> {
    let p = project(s)?;
    let known: Vec<String> = spec_texts(&p)
        .iter()
        .flat_map(|(c, t)| req_refs(c, t))
        .collect();
    Ok(plans(&p)
        .into_iter()
        .map(|(path, parsed)| match parsed {
            Ok(plan) => {
                let mut refs: Vec<String> = Vec::new();
                for r in plan.scenarios.iter().flat_map(|s| &s.refs) {
                    if !refs.contains(r) {
                        refs.push(r.clone());
                    }
                }
                PlanRow {
                    broken: gherkin::broken(std::slice::from_ref(&plan), &known),
                    title: plan.title.clone(),
                    scenarios: plan.scenarios.len() as u32,
                    refs,
                    errors: Vec::new(),
                    path,
                }
            }
            Err(errors) => PlanRow {
                title: path.rsplit('/').next().unwrap_or(&path).into(),
                scenarios: 0,
                refs: Vec::new(),
                errors,
                broken: Vec::new(),
                path,
            },
        })
        .collect())
}

/// The requirements of a capability that no scenario cites (REQ-013).
pub fn coverage(s: &AppState, cap: &str) -> Res<Vec<String>> {
    let p = project(s)?;
    let mut reqs: Vec<String> = Vec::new();
    for (c, t) in spec_texts(&p).iter().filter(|(c, _)| c == cap) {
        for r in req_refs(c, t) {
            if !reqs.contains(&r) {
                reqs.push(r);
            }
        }
    }
    let ok: Vec<Plan> = plans(&p).into_iter().filter_map(|(_, r)| r.ok()).collect();
    Ok(gherkin::uncovered(&reqs, &ok))
}

// ---------------------------------------------------------------- fold

/// Write the answer of a spec-level question into the spec, after one click (REQ-015).
pub fn fold_answer(
    s: &AppState,
    rel: &str,
    question_id: &str,
    answer: &str,
    stamp: &str,
    click: bool,
) -> Res<Written> {
    need_click(s, click)?;
    let p = project(s)?;
    let full = path_of(&p, rel)?;
    if !design::is_under(rel, p.file.path("specs")) || !rel.ends_with("/spec.md") {
        return Err(format!("not a spec: {rel}"));
    }
    let title = raid::list(&questions_dir(&p))
        .into_iter()
        .find(|e| e.question.id == question_id)
        .map(|e| e.question.title)
        .ok_or_else(|| format!("no question {question_id}"))?;
    let text = read_text(&full, rel)?.text;
    let out = fold::fold(&text, question_id, &title, answer)?;
    write(s, rel, &out, Some(stamp), false)
}

// ---------------------------------------------------------------- split

fn draft_path(s: &AppState, p: &Proj, change: &str) -> PathBuf {
    s.dir
        .join("split")
        .join(&p.id)
        .join(format!("{change}.json"))
}

/// The saved draft, else a draft from the specs of the change (REQ-016).
pub fn split_draft(s: &AppState, change: &str) -> Res<Draft> {
    change_id(change)?;
    let p = project(s)?;
    if let Ok(t) = std::fs::read_to_string(draft_path(s, &p, change)) {
        return serde_json::from_str(&t).map_err(|e| format!("saved draft: {e}"));
    }
    let dir = openspec(&p).join("changes").join(change);
    if !dir.is_dir() {
        return Err(format!("no change {change}"));
    }
    let specs: Vec<(String, String)> = archive::dir_names(&dir.join("specs"))
        .into_iter()
        .filter_map(|cap| {
            let t = std::fs::read_to_string(dir.join("specs").join(&cap).join("spec.md")).ok()?;
            Some((cap, t))
        })
        .collect();
    Ok(split::draft(change, &specs))
}

/// Keep an edited draft in the app data folder. It writes no repository file (REQ-017).
pub fn split_save(s: &AppState, draft: &Draft) -> Res<()> {
    change_id(&draft.change)?;
    let p = project(s)?;
    let text = serde_json::to_string_pretty(draft).map_err(err)?;
    let _g = s.guard();
    write_atomic(&draft_path(s, &p, &draft.change), text.as_bytes()).map_err(err)
}

/// The rows of a draft in the shape of the Work apply. Epics come first, so a story finds its
/// parent (REQ-018).
fn split_rows(d: &Draft) -> Vec<Row> {
    let mut items: Vec<&split::Item> = d.items.iter().collect();
    items.sort_by_key(|i| i.kind != Kind::Epic);
    items
        .into_iter()
        .map(|i| Row {
            reference: split::row_ref(&d.change, &i.row_id),
            kind: match i.kind {
                Kind::Epic => RowKind::Epic,
                Kind::Story => RowKind::Story,
            },
            title: i.title.clone(),
            description: split::description(i),
            days: None,
            parent: i.parent.as_ref().map(|r| split::row_ref(&d.change, r)),
        })
        .collect()
}

fn known_reqs(p: &Proj) -> Vec<String> {
    spec_texts(p)
        .iter()
        .flat_map(|(c, t)| req_refs(c, t))
        .collect()
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SplitPreview {
    /// The problems that block the apply.
    pub problems: Vec<String>,
    pub rows: Vec<DiffRow>,
}

/// Mark each item create, update or unchanged against the mirror. It sends nothing (REQ-017).
pub fn split_preview(s: &AppState, change: &str) -> Res<SplitPreview> {
    let d = split_draft(s, change)?;
    let p = project(s)?;
    let t = tracker(s)?;
    Ok(SplitPreview {
        problems: split::check(&d, &known_reqs(&p)),
        rows: writes::diff(&t.caps, split_rows(&d), &mirror_items(s, &t)?),
    })
}

/// Hand the reviewed split to the Work apply, after one click (REQ-018). The diff is computed
/// again from the draft and the mirror, so a second apply finds each ticket by its row ref and
/// creates none.
pub fn split_apply(s: &AppState, change: &str, click: bool) -> Res<Vec<ApplyRow>> {
    need_click(s, click)?;
    let d = split_draft(s, change)?;
    let p = project(s)?;
    let problems = split::check(&d, &known_reqs(&p));
    if !problems.is_empty() {
        return Err(problems.join("; "));
    }
    let t = tracker(s)?;
    let diff = writes::diff(&t.caps, split_rows(&d), &mirror_items(s, &t)?);
    write_diff(s, &t, &diff)
}

// ---------------------------------------------------------------- archive

/// Archive a change after the click of a person. Work items of the change that are not done are
/// open items: they need `confirmed` (REQ-020).
pub fn archive_change(s: &AppState, id: &str, confirmed: bool) -> Res<Vec<String>> {
    crate::work::refuse_read_only(s)?;
    change_id(id)?;
    let p = project(s)?;
    // No tracker means no mirrored items.
    let open: Vec<String> = match tracker(s) {
        Ok(t) => mirror_items(s, &t)?
            .into_iter()
            .filter(|i| {
                i.labels
                    .iter()
                    .any(|l| l.starts_with(&format!("est:{id}#")))
                    && i.status.category != StatusCategory::Done
            })
            .map(|i| format!("{} {}", i.key, i.title))
            .collect(),
        Err(_) => Vec::new(),
    };
    let _g = s.guard();
    let moved = archive::archive(&openspec(&p), id, &crate::work::today(s), &open, confirmed)?;
    s.specs.forget(&p.id, id);
    Ok(moved)
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn specs_changes(app: AppHandle) -> Api<Vec<ChangeView>> {
    blocking(app, changes).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_change_create(app: AppHandle, title: String) -> Api<ChangeView> {
    blocking(app, move |s| change_create(s, &title)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_read(app: AppHandle, path: String) -> Api<Text> {
    blocking(app, move |s| read(s, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_write(
    app: AppHandle,
    path: String,
    text: String,
    stamp: Option<String>,
    create: bool,
) -> Api<Written> {
    blocking(app, move |s| {
        write(s, &path, &text, stamp.as_deref(), create)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_validate(app: AppHandle, id: String) -> Api<Vec<Finding>> {
    blocking(app, move |s| validate(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_capabilities(app: AppHandle) -> Api<Vec<CapabilityRow>> {
    blocking(app, capabilities).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_spec(app: AppHandle, path: String) -> Api<SpecView> {
    blocking(app, move |s| spec(s, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_questions(app: AppHandle) -> Api<Vec<Entry>> {
    blocking(app, questions).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_question_save(
    app: AppHandle,
    path: String,
    question: Question,
    stamp: Option<String>,
) -> Api<Written> {
    blocking(app, move |s| {
        question_save(s, &path, &question, stamp.as_deref())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_question_create(app: AppHandle, question: Question) -> Api<String> {
    blocking(app, move |s| question_create(s, question)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_testplans(app: AppHandle) -> Api<Vec<PlanRow>> {
    blocking(app, testplans).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_coverage(app: AppHandle, capability: String) -> Api<Vec<String>> {
    blocking(app, move |s| coverage(s, &capability)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_fold(
    app: AppHandle,
    spec_path: String,
    question_id: String,
    answer: String,
    stamp: String,
    click: bool,
) -> Api<Written> {
    blocking(app, move |s| {
        fold_answer(s, &spec_path, &question_id, &answer, &stamp, click)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_split_draft(app: AppHandle, change: String) -> Api<Draft> {
    blocking(app, move |s| split_draft(s, &change)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_split_save(app: AppHandle, draft: Draft) -> Api<()> {
    blocking(app, move |s| split_save(s, &draft)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_split_preview(app: AppHandle, change: String) -> Api<SplitPreview> {
    blocking(app, move |s| split_preview(s, &change)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_split_apply(app: AppHandle, change: String, click: bool) -> Api<Vec<ApplyRow>> {
    blocking(app, move |s| split_apply(s, &change, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_archive(app: AppHandle, id: String, confirmed: bool) -> Api<Vec<String>> {
    blocking(app, move |s| archive_change(s, &id, confirmed)).await
}

pub mod bdd;
#[cfg(test)]
mod tests;
