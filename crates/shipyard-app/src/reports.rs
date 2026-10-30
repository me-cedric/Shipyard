//! Client exports (spec `knowledge`, REQ-014 to REQ-016, Q-044): the change request, the work done
//! between two refs, and one workbook for each page (costing, flows, RAID, plan, security), and
//! the Gantt as SVG.
//!
//! Each command takes `click`: it refuses when `click` is false. A write inside the project also
//! refuses in a read-only profile. A source that cannot be read gives a named gap and does not
//! fail the export. A day rate is never read, so no export can hold one. The view calls one
//! command and picks the path with a save dialog. The words of the cover come from `ExportText`.
//! The column headers are English, as in the Excel export of the costing tool.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

use serde::Serialize;
use shipyard_core::work::{iso, parse_day};
use shipyard_git::{RangeCommit, Repo, work_item_keys};
use shipyard_store::export::{SheetOut, docx_bytes, markdown_blocks, xlsx_bytes};
use shipyard_store::project::write_atomic;
use shipyard_store::reports::{
    ChangeRequest, CrFile, change_request_md, costing_sheets, flows_sheets, gantt_svg, next_cr_id,
    not_read, raid_sheet, schedule_sheet, security_sheets, task_deltas,
};
use shipyard_store::{code, delivery_docs, design, madr, raid};
use specta::Type;
use tauri::AppHandle;

use crate::commands::{AppState, Res, blocking, err};
use crate::design::{Proj, project};
use crate::knowledge::{ExportText, meta, write_export};
use crate::work::refuse_read_only;

/// The folder of the change requests, in the delivery folder.
pub const CHANGE_REQUESTS: &str = "docs/delivery/change-requests";

/// A write needs the click of a person. A file inside the project also needs a profile that is
/// not read only. A file outside it, such as the one of a save dialog, is not a project write.
pub(crate) fn need_export_click(s: &AppState, path: &str, click: bool) -> Res<()> {
    if !click {
        return Err("this change needs the click of a person".into());
    }
    let root = s
        .registry()?
        .active()
        .and_then(|e| Path::new(&e.path).canonicalize().ok());
    let inside = Path::new(path)
        .parent()
        .and_then(|d| d.canonicalize().ok())
        .zip(root)
        .is_some_and(|(dir, root)| dir.starts_with(root));
    if inside {
        refuse_read_only(s)?;
    }
    Ok(())
}

/// One workbook. `build` reads the sources of this moment and gives the worksheets.
fn book(
    s: &AppState,
    t: &ExportText,
    path: &str,
    click: bool,
    build: impl FnOnce(&Proj) -> Res<Vec<SheetOut>>,
) -> Res<()> {
    need_export_click(s, path, click)?;
    let p = project(s)?;
    let parts = build(&p)?;
    write_export(
        path,
        "xlsx",
        &xlsx_bytes(&meta(s, &p, t), &parts).map_err(err)?,
    )
}

// ---------------------------------------------------------------- pages

/// The estimate sheets: days for each task and role. No day rate, cost or price.
pub fn export_costing(s: &AppState, t: &ExportText, path: &str, click: bool) -> Res<()> {
    book(s, t, path, click, |_| {
        let sheets = crate::work::sheets_for_export(s)?;
        let refs: Vec<_> = sheets
            .iter()
            .map(|(slug, r)| (slug.clone(), r.as_ref().map_err(Clone::clone)))
            .collect();
        Ok(costing_sheets(&refs))
    })
}

/// The network flows, one worksheet for each flow file.
pub fn export_flows(s: &AppState, t: &ExportText, path: &str, click: bool) -> Res<()> {
    book(s, t, path, click, |p| {
        let mut out = Vec::new();
        for a in design::list(&p.root, &p.file)
            .iter()
            .filter(|a| a.kind == "flow")
        {
            let rows = std::fs::read_to_string(p.root.join(&a.path))
                .map_err(|e| format!("{}: {e}", a.path))
                .and_then(|x| design::read_flows(&x));
            match rows {
                Ok(rows) => out.extend(flows_sheets(&[(a.title.clone(), rows)])),
                Err(why) => out.push(not_read(&a.title, &why)),
            }
        }
        if out.is_empty() {
            return Err("the project has no network flow file".into());
        }
        Ok(out)
    })
}

/// The RAID register: each file of the questions folder is one row.
pub fn export_raid(s: &AppState, t: &ExportText, path: &str, click: bool) -> Res<()> {
    book(s, t, path, click, |p| {
        let items: Vec<_> = raid::list_register(&p.root)
            .map_err(err)?
            .iter()
            .map(|f| raid::parse_item(&f.path, &f.text))
            .collect();
        Ok(vec![raid_sheet(&items)])
    })
}

/// The plan of one estimate sheet: one row for each task bar.
pub fn export_schedule(
    s: &AppState,
    t: &ExportText,
    slug: &str,
    path: &str,
    click: bool,
) -> Res<()> {
    book(s, t, path, click, |_| {
        Ok(vec![schedule_sheet(
            slug,
            &crate::work::plan(s, slug)?.gantt,
        )])
    })
}

/// The Gantt of one estimate sheet as an SVG file, with `text.title` as its title.
pub fn export_gantt(s: &AppState, t: &ExportText, slug: &str, path: &str, click: bool) -> Res<()> {
    need_export_click(s, path, click)?;
    let svg = gantt_svg(&t.title, &crate::work::plan(s, slug)?.gantt);
    write_export(path, "svg", svg.as_bytes())
}

/// The last scan reports, one worksheet for each scanner. A finding has a place and no value.
pub fn export_security(s: &AppState, t: &ExportText, path: &str, click: bool) -> Res<()> {
    book(s, t, path, click, |p| {
        let sheets = security_sheets(&code::list_quality(&p.root));
        if sheets.is_empty() {
            return Err("no scanner report: run a scan first".into());
        }
        Ok(sheets)
    })
}

// ---------------------------------------------------------------- work done

/// One changed file with the people and the work behind it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkDoneRow {
    pub path: String,
    /// `added`, `deleted` or `modified`, from the first and the last commit of the range.
    pub status: &'static str,
    /// The authors, the one with most commits first.
    pub authors: String,
    pub commits: u32,
    pub added: u32,
    pub removed: u32,
    /// The work item keys in the messages of those commits.
    pub items: Vec<String>,
}

#[derive(Default)]
struct Acc {
    first: Option<char>,
    last: char,
    authors: BTreeMap<String, u32>,
    commits: u32,
    added: u32,
    removed: u32,
    items: BTreeSet<String>,
}

/// One row for each file that a commit of the range touched, by path. `commits` is oldest first.
/// The lines are the sum over the commits, so a line that changed twice counts twice.
pub fn work_done_rows(commits: &[RangeCommit]) -> Vec<WorkDoneRow> {
    let mut by: BTreeMap<&str, Acc> = BTreeMap::new();
    for c in commits {
        let keys = work_item_keys(&c.message);
        for f in &c.files {
            let a = by.entry(&f.path).or_default();
            a.first.get_or_insert(f.status);
            a.last = f.status;
            *a.authors.entry(c.author.clone()).or_default() += 1;
            a.commits += 1;
            a.added += f.added;
            a.removed += f.removed;
            a.items.extend(keys.iter().cloned());
        }
    }
    by.into_iter()
        .map(|(path, a)| {
            let mut who: Vec<_> = a.authors.into_iter().collect();
            who.sort_by(|x, y| y.1.cmp(&x.1).then_with(|| x.0.cmp(&y.0)));
            WorkDoneRow {
                path: path.into(),
                status: match (a.first, a.last) {
                    (_, 'D') => "deleted",
                    (Some('A'), _) => "added",
                    _ => "modified",
                },
                authors: who.into_iter().map(|w| w.0).collect::<Vec<_>>().join("; "),
                commits: a.commits,
                added: a.added,
                removed: a.removed,
                items: a.items.into_iter().collect(),
            }
        })
        .collect()
}

/// A ref that names a branch, a tag or a commit. It never starts with `-`.
fn check_ref(r: &str) -> Res<&str> {
    let r = r.trim();
    if r.is_empty() || r.len() > 200 || r.starts_with('-') || r.chars().any(char::is_control) {
        return Err(format!("`{r}` is not a ref"));
    }
    Ok(r)
}

/// The title and status of the work items of the tracker mirror. No request leaves the machine. A
/// project with no tracker gives nothing: the sheet then lists the keys only.
fn item_titles(s: &AppState) -> HashMap<String, (String, String)> {
    crate::work::tracker(s)
        .and_then(|t| crate::work::mirror_items(s, &t))
        .unwrap_or_default()
        .into_iter()
        .map(|i| (i.key, (i.title, i.status.name)))
        .collect()
}

fn day(time: i64) -> String {
    iso(time.div_euclid(86_400) as i32)
}

/// The worksheets of the work done: the files, the work items that the commit messages name (with
/// the title and the status from `titles` when the tracker mirror has them) and the commits.
pub fn work_done_sheets(
    commits: &[RangeCommit],
    titles: &HashMap<String, (String, String)>,
) -> Vec<SheetOut> {
    let mut by_item: BTreeMap<String, (u32, BTreeSet<&str>)> = BTreeMap::new();
    for c in commits {
        for k in work_item_keys(&c.message) {
            let e = by_item.entry(k).or_default();
            e.0 += 1;
            e.1.extend(c.files.iter().map(|f| f.path.as_str()));
        }
    }
    let head = |h: &[&str]| h.iter().map(|x| (*x).to_string()).collect();
    vec![
        SheetOut {
            name: "Files".into(),
            headers: head(&[
                "File",
                "Status",
                "Author",
                "Commits",
                "Added",
                "Removed",
                "Work items",
            ]),
            rows: work_done_rows(commits)
                .iter()
                .map(|r| {
                    vec![
                        r.path.clone(),
                        r.status.into(),
                        r.authors.clone(),
                        r.commits.to_string(),
                        r.added.to_string(),
                        r.removed.to_string(),
                        r.items.join(", "),
                    ]
                })
                .collect(),
        },
        SheetOut {
            name: "Work items".into(),
            headers: head(&["Key", "Title", "Status", "Commits", "Files"]),
            rows: by_item
                .iter()
                .map(|(k, (n, files))| {
                    let (title, status) = titles.get(k).cloned().unwrap_or_default();
                    vec![
                        k.clone(),
                        title,
                        status,
                        n.to_string(),
                        files.len().to_string(),
                    ]
                })
                .collect(),
        },
        SheetOut {
            name: "Commits".into(),
            headers: head(&["Commit", "Date", "Author", "Summary", "Work items"]),
            rows: commits
                .iter()
                .map(|c| {
                    vec![
                        c.id.chars().take(8).collect(),
                        day(c.time),
                        c.author.clone(),
                        c.message.lines().next().unwrap_or_default().into(),
                        work_item_keys(&c.message).join(", "),
                    ]
                })
                .collect(),
        },
    ]
}

/// The work done between two refs, for a period that names the report (`from` and `to`, both
/// `YYYY-MM-DD`, `to` not before `from`). The two refs bound the content. The period does not
/// filter the commits: it is on the cover so that the report says what time it covers. Worksheets:
/// the files, the linked work items and the commits.
pub fn export_work_done(
    s: &AppState,
    t: &ExportText,
    base: &str,
    head: &str,
    period: (&str, &str),
    path: &str,
    click: bool,
) -> Res<()> {
    let (base, head) = (check_ref(base)?, check_ref(head)?);
    let ((from, to), (f, u)) = (period, (parse_day(period.0), parse_day(period.1)));
    if f.is_none() || u.is_none() || f > u {
        return Err(
            "the period needs two dates, `YYYY-MM-DD`, and the end not before the start".into(),
        );
    }
    need_export_click(s, path, click)?;
    let p = project(s)?;
    let commits = Repo::open(&p.root)
        .and_then(|r| r.range_commits(base, head))
        .map_err(err)?;
    let parts = work_done_sheets(&commits, &item_titles(s));
    let mut m = meta(s, &p, t);
    m.title = format!("{} ({from} - {to})", m.title);
    m.project = format!("{}: {base}..{head}", m.project);
    write_export(path, "xlsx", &xlsx_bytes(&m, &parts).map_err(err)?)
}

// ---------------------------------------------------------------- change request

/// The files of one change request, as paths relative to the project.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ChangeRequestOut {
    /// `CR-003`.
    pub id: String,
    pub markdown: String,
    pub docx: String,
}

/// Writes `CR-<id>.md` and `CR-<id>.docx` in `docs/delivery/change-requests`. The id is one above
/// the highest one in the folder, so no file is replaced. The content is the change between `base`
/// and `head`: the files (scope), the impact notes and the decision records that changed, the days
/// of each estimated task before and after (no day rate), and a table for the approvals. The text
/// is English. The files are written, not committed. A person reads them and commits them.
pub fn export_change_request(
    s: &AppState,
    title: &str,
    base: &str,
    head: &str,
    approvers: &[String],
    click: bool,
) -> Res<ChangeRequestOut> {
    crate::work::need_click(s, click)?;
    let (base, head) = (check_ref(base)?, check_ref(head)?);
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() || title.len() > 200 {
        return Err("the title needs 1 to 200 characters".into());
    }
    let p = project(s)?;
    let repo = Repo::open(&p.root).map_err(err)?;
    let files = repo.range_diff(base, head).map_err(err)?;
    let commits = repo.range_commits(base, head).map_err(err)?;
    let changed = |path: &str| files.iter().any(|f| f.path == path);

    // The estimate delta: each sheet as it stood at the two refs.
    type Pair = (
        Option<Res<shipyard_core::work::Sheet>>,
        Option<Res<shipyard_core::work::Sheet>>,
    );
    let mut sheets: BTreeMap<String, Pair> = BTreeMap::new();
    for (slug, r) in crate::work::sheets_at(s, &repo, base)? {
        sheets.entry(slug).or_default().0 = Some(r);
    }
    for (slug, r) in crate::work::sheets_at(s, &repo, head)? {
        sheets.entry(slug).or_default().1 = Some(r);
    }
    let (mut tasks, mut unread) = (Vec::new(), Vec::new());
    for (slug, (was, now)) in &sheets {
        let side = |r: &Option<Res<_>>| r.as_ref().and_then(|r| r.as_ref().err().cloned());
        match side(was).or_else(|| side(now)) {
            Some(why) => unread.push((slug.clone(), why)),
            None => tasks.extend(task_deltas(
                slug,
                was.as_ref().and_then(|r| r.as_ref().ok()),
                now.as_ref().and_then(|r| r.as_ref().ok()),
            )),
        }
    }

    let dir = p.root.join(CHANGE_REQUESTS);
    let names: Vec<String> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    let cr = ChangeRequest {
        id: next_cr_id(&names),
        date: crate::work::today(s),
        project: p.file.name.clone(),
        title,
        base: base.into(),
        head: head.into(),
        commits: commits.len(),
        files: files
            .iter()
            .map(|f| CrFile {
                path: f.path.clone(),
                status: f.status.to_string(),
                added: f.added,
                removed: f.removed,
            })
            .collect(),
        impacts: delivery_docs::delivery_notes(&p.root)
            .into_iter()
            .filter(|n| changed(&n.path))
            .map(|n| (n.title, n.path))
            .collect(),
        tasks,
        unread,
        decisions: madr::list(&p.root, &p.file)
            .into_iter()
            .filter(|a| changed(&a.path))
            .map(|a| (a.number, a.title, a.status))
            .collect(),
        approvers: approvers
            .iter()
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect(),
    };
    let md = change_request_md(&cr);
    let words = shipyard_store::export::Meta {
        title: format!("{} - {}", cr.id, cr.title),
        project: cr.project.clone(),
        generated_on: cr.date.clone(),
        empty: String::new(),
        gap: String::new(),
        generated: "Generated".into(),
    };
    let docx = docx_bytes(&words, &markdown_blocks(&md, 1)).map_err(err)?;
    let (rel_md, rel_docx) = (
        format!("{CHANGE_REQUESTS}/{}.md", cr.id),
        format!("{CHANGE_REQUESTS}/{}.docx", cr.id),
    );
    let _g = s.guard();
    // Two files that were built in memory, then written: a failed build leaves no half result.
    if p.root.join(&rel_md).exists() || p.root.join(&rel_docx).exists() {
        return Err(format!("{} already exists", cr.id));
    }
    write_atomic(&p.root.join(&rel_md), md.as_bytes()).map_err(err)?;
    write_atomic(&p.root.join(&rel_docx), &docx).map_err(err)?;
    Ok(ChangeRequestOut {
        id: cr.id,
        markdown: rel_md,
        docx: rel_docx,
    })
}

// ---------------------------------------------------------------- commands

/// The estimate sheets as an `.xlsx`: days, no money.
#[tauri::command]
#[specta::specta]
pub async fn export_costing_file(
    app: AppHandle,
    text: ExportText,
    path: String,
    click: bool,
) -> Res<()> {
    blocking(app, move |s| export_costing(s, &text, &path, click)).await
}

/// The network flows as an `.xlsx`, one worksheet for each flow file.
#[tauri::command]
#[specta::specta]
pub async fn export_flows_file(
    app: AppHandle,
    text: ExportText,
    path: String,
    click: bool,
) -> Res<()> {
    blocking(app, move |s| export_flows(s, &text, &path, click)).await
}

/// The RAID register as an `.xlsx`.
#[tauri::command]
#[specta::specta]
pub async fn export_raid_file(
    app: AppHandle,
    text: ExportText,
    path: String,
    click: bool,
) -> Res<()> {
    blocking(app, move |s| export_raid(s, &text, &path, click)).await
}

/// The plan of one estimate sheet as an `.xlsx`.
#[tauri::command]
#[specta::specta]
pub async fn export_schedule_file(
    app: AppHandle,
    text: ExportText,
    slug: String,
    path: String,
    click: bool,
) -> Res<()> {
    blocking(app, move |s| export_schedule(s, &text, &slug, &path, click)).await
}

/// The Gantt of one estimate sheet as an `.svg`.
#[tauri::command]
#[specta::specta]
pub async fn export_gantt_file(
    app: AppHandle,
    text: ExportText,
    slug: String,
    path: String,
    click: bool,
) -> Res<()> {
    blocking(app, move |s| export_gantt(s, &text, &slug, &path, click)).await
}

/// The security findings as an `.xlsx`, one worksheet for each scanner.
#[tauri::command]
#[specta::specta]
pub async fn export_security_file(
    app: AppHandle,
    text: ExportText,
    path: String,
    click: bool,
) -> Res<()> {
    blocking(app, move |s| export_security(s, &text, &path, click)).await
}

/// The work done between two refs as an `.xlsx`. `from` and `to` are `YYYY-MM-DD` and required.
#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn export_work_done_file(
    app: AppHandle,
    text: ExportText,
    base: String,
    head: String,
    from: String,
    to: String,
    path: String,
    click: bool,
) -> Res<()> {
    blocking(app, move |s| {
        export_work_done(s, &text, &base, &head, (&from, &to), &path, click)
    })
    .await
}

/// Writes the change request files in the delivery folder of the project.
#[tauri::command]
#[specta::specta]
pub async fn export_change_request_files(
    app: AppHandle,
    title: String,
    base: String,
    head: String,
    approvers: Vec<String>,
    click: bool,
) -> Res<ChangeRequestOut> {
    blocking(app, move |s| {
        export_change_request(s, &title, &base, &head, &approvers, click)
    })
    .await
}

#[cfg(test)]
mod tests;
