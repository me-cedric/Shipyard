//! The page exports and the change request, as pure builders (spec `knowledge`, REQ-014, REQ-016).
//!
//! A builder takes data that the caller read and gives worksheets, an SVG text or a Markdown text.
//! It reads no file. A day rate is never an input: a costing worksheet holds days and no money.

use std::collections::BTreeMap;
use std::fmt::Write as _;

use shipyard_core::flows::FlowRow;
use shipyard_core::work::{Gantt, Sheet, build_days, iso, parse_day, task_days};

use crate::code::{QualityReport, ReportKind};
use crate::export::SheetOut;
use crate::raid::Item;

fn sheet_out(name: &str, headers: &[&str], rows: Vec<Vec<String>>) -> SheetOut {
    SheetOut {
        name: name.into(),
        headers: headers.iter().map(|h| (*h).into()).collect(),
        rows,
    }
}

/// A worksheet for a source that could not be read: the name and the reason. The export does not
/// fail for it.
pub fn not_read(name: &str, why: &str) -> SheetOut {
    sheet_out(name, &["Not read"], vec![vec![why.into()]])
}

/// Days as text with no trailing zero: `2`, `0.5`.
pub fn num(n: f64) -> String {
    let t = format!("{n:.3}");
    t.trim_end_matches('0').trim_end_matches('.').to_string()
}

fn flat(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

// ---------------------------------------------------------------- costing

/// One worksheet for each estimate sheet: feature, task, role and days. A first worksheet gives
/// the days of each sheet. A sheet that cannot be read, such as a sealed sheet with no passphrase,
/// gives a worksheet with the reason. No day rate, cost or price reaches a worksheet.
pub fn costing_sheets(sheets: &[(String, Result<&Sheet, String>)]) -> Vec<SheetOut> {
    let mut summary = Vec::new();
    let mut parts = Vec::new();
    for (slug, sheet) in sheets {
        match sheet {
            Ok(s) => {
                let build = build_days(s);
                let mut total = 0.0;
                let mut rows: Vec<Vec<String>> = s
                    .tasks()
                    .map(|(f, t)| {
                        let days = task_days(t, build);
                        total += days;
                        vec![
                            f.name.clone(),
                            t.name.clone(),
                            t.role.clone(),
                            num(days),
                            t.ticket.clone().unwrap_or_default(),
                            flat(&t.note),
                        ]
                    })
                    .collect();
                rows.push(vec![
                    "Total".into(),
                    String::new(),
                    String::new(),
                    num(total),
                ]);
                summary.push(vec![slug.clone(), s.name.clone(), num(total)]);
                let name = if s.name.is_empty() { slug } else { &s.name };
                parts.push(sheet_out(
                    name,
                    &["Feature", "Task", "Role", "Days", "Ticket", "Note"],
                    rows,
                ));
            }
            Err(why) => {
                summary.push(vec![
                    slug.clone(),
                    String::new(),
                    format!("not read: {why}"),
                ]);
                parts.push(not_read(slug, why));
            }
        }
    }
    let mut out = vec![sheet_out("Summary", &["Sheet", "Name", "Days"], summary)];
    out.extend(parts);
    out
}

// ---------------------------------------------------------------- flows

/// One worksheet for each flow file.
pub fn flows_sheets(files: &[(String, Vec<FlowRow>)]) -> Vec<SheetOut> {
    files
        .iter()
        .map(|(name, rows)| {
            sheet_out(
                name,
                &[
                    "Source",
                    "Destination",
                    "Network",
                    "Protocol",
                    "Port",
                    "Action",
                    "Note",
                ],
                rows.iter()
                    .map(|r| {
                        vec![
                            r.source.clone(),
                            r.destination.clone(),
                            r.network.clone(),
                            r.protocol.clone(),
                            r.port.clone().unwrap_or_default(),
                            format!("{:?}", r.action),
                            flat(r.note.as_deref().unwrap_or_default()),
                        ]
                    })
                    .collect(),
            )
        })
        .collect()
}

// ---------------------------------------------------------------- RAID

/// The register as one worksheet. The last column names a file that needs a look: a value outside
/// the vocabulary or a missing key.
pub fn raid_sheet(items: &[Item]) -> SheetOut {
    let rows = items
        .iter()
        .map(|i| {
            let mut flag = Vec::new();
            if i.kind.is_none() || i.status.is_none() {
                flag.push("value outside the vocabulary".to_string());
            }
            if !i.missing.is_empty() {
                flag.push(format!("missing: {}", i.missing.join(", ")));
            }
            vec![
                i.id.clone(),
                i.kind.map_or(String::new(), |k| k.as_str().into()),
                i.status.map_or(String::new(), |s| s.as_str().into()),
                i.raised_at.clone(),
                i.raised_by.clone(),
                i.owner.clone(),
                i.spec_ref.clone(),
                i.task_ref.clone(),
                i.ticket.clone(),
                flat(&i.question),
                flat(&i.answer),
                flat(&i.consequence),
                flag.join("; "),
            ]
        })
        .collect();
    sheet_out(
        "RAID",
        &[
            "Id",
            "Kind",
            "Status",
            "Raised on",
            "Raised by",
            "Owner",
            "Spec",
            "Task",
            "Ticket",
            "Question",
            "Answer",
            "Consequence",
            "Flag",
        ],
        rows,
    )
}

// ---------------------------------------------------------------- schedule and Gantt

/// The bars of a plan as one worksheet, in the order of the plan.
pub fn schedule_sheet(slug: &str, g: &Gantt) -> SheetOut {
    sheet_out(
        slug,
        &["Feature", "Task", "Role", "Member", "Start", "End", "Days"],
        g.bars
            .iter()
            .map(|b| {
                vec![
                    b.feature.clone(),
                    b.name.clone(),
                    b.role.clone(),
                    b.member.clone().unwrap_or_default(),
                    b.start.clone(),
                    b.end.clone(),
                    num(b.days),
                ]
            })
            .collect(),
    )
}

const PALETTE: [&str; 6] = [
    "#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2",
];
const LABEL_W: i32 = 240;
const ROW_H: i32 = 24;
const HEAD_H: i32 = 44;

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// A self-contained SVG of the plan: one bar for each task, a color for each role, a line at each
/// month. It holds no script, no font file and no link. A bar with a date that does not parse is
/// left out.
pub fn gantt_svg(title: &str, g: &Gantt) -> String {
    let bars: Vec<_> = g
        .bars
        .iter()
        .filter_map(|b| {
            Some((
                b,
                parse_day(&b.start)?,
                parse_day(&b.end)?.max(parse_day(&b.start)?),
            ))
        })
        .collect();
    let first = bars.iter().map(|x| x.1).min().unwrap_or(0);
    let last = bars.iter().map(|x| x.2).max().unwrap_or(0);
    let span = if bars.is_empty() { 1 } else { last - first + 1 };
    let px = (900 / span).clamp(2, 24);
    let width = LABEL_W + span * px + 20;
    let height = HEAD_H + ROW_H * bars.len().max(1) as i32 + 10;
    let roles: Vec<&str> = bars
        .iter()
        .map(|x| x.0.role.as_str())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    let mut s = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" \
         viewBox=\"0 0 {width} {height}\" font-family=\"sans-serif\" font-size=\"12\">\n\
         <rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>\n\
         <text x=\"8\" y=\"18\" font-size=\"14\" font-weight=\"bold\">{}</text>\n",
        esc(title)
    );
    if bars.is_empty() {
        let _ = writeln!(
            s,
            "<text x=\"8\" y=\"{}\" fill=\"#64748b\">No task</text>",
            HEAD_H + 16
        );
    }
    for day in first..first + span {
        let name = iso(day);
        if name.ends_with("-01") || day == first {
            let x = LABEL_W + (day - first) * px;
            let _ = writeln!(
                s,
                "<line x1=\"{x}\" y1=\"{}\" x2=\"{x}\" y2=\"{height}\" stroke=\"#e2e8f0\"/>\n\
                 <text x=\"{}\" y=\"{}\" fill=\"#64748b\">{}</text>",
                HEAD_H - 8,
                x + 3,
                HEAD_H - 12,
                &name[..7]
            );
        }
    }
    for (i, (b, from, to)) in bars.iter().enumerate() {
        let y = HEAD_H + ROW_H * i as i32;
        let color = PALETTE[roles.iter().position(|r| *r == b.role).unwrap_or(0) % PALETTE.len()];
        let _ = writeln!(
            s,
            "<text x=\"8\" y=\"{}\">{}</text>\n\
             <rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"3\" fill=\"{color}\"><title>{}</title></rect>",
            y + 16,
            esc(&b.name.chars().take(34).collect::<String>()),
            LABEL_W + (from - first) * px,
            y + 4,
            (to - from + 1) * px,
            ROW_H - 8,
            esc(&format!(
                "{} - {} to {}, {} d",
                b.role,
                b.start,
                b.end,
                num(b.days)
            ))
        );
    }
    s.push_str("</svg>\n");
    s
}

// ---------------------------------------------------------------- security

/// One worksheet for each scanner report. A check report is not a security finding and is left
/// out.
pub fn security_sheets(reports: &[QualityReport]) -> Vec<SheetOut> {
    reports
        .iter()
        .filter(|r| r.kind == ReportKind::Scanner)
        .map(|r| {
            sheet_out(
                &r.name,
                &["Severity", "Path", "Line", "Message"],
                r.findings
                    .iter()
                    .map(|f| {
                        vec![
                            format!("{:?}", f.severity).to_lowercase(),
                            f.path.clone(),
                            f.line.map_or(String::new(), |l| l.to_string()),
                            flat(&f.message),
                        ]
                    })
                    .collect(),
            )
        })
        .collect()
}

// ---------------------------------------------------------------- change request

#[derive(Debug, Clone, PartialEq)]
pub struct CrFile {
    pub path: String,
    pub status: String,
    pub added: u32,
    pub removed: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CrTask {
    pub sheet: String,
    pub name: String,
    /// `added`, `removed` or `changed`.
    pub change: &'static str,
    pub before: f64,
    pub after: f64,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ChangeRequest {
    /// `CR-003`.
    pub id: String,
    /// `YYYY-MM-DD`.
    pub date: String,
    pub project: String,
    pub title: String,
    pub base: String,
    pub head: String,
    pub commits: usize,
    pub files: Vec<CrFile>,
    /// Impact notes that changed: title and path.
    pub impacts: Vec<(String, String)>,
    pub tasks: Vec<CrTask>,
    /// Estimate sheets that could not be read at one of the refs: name and reason.
    pub unread: Vec<(String, String)>,
    /// ADRs that changed: number, title and status.
    pub decisions: Vec<(String, String, String)>,
    /// The people who must sign.
    pub approvers: Vec<String>,
}

/// `CR-001` for an empty folder, else one above the highest `CR-NNN.md` name. A hole is never
/// reused.
pub fn next_cr_id(names: &[String]) -> String {
    let max = names
        .iter()
        .filter_map(|n| {
            let stem = n.strip_suffix(".md")?;
            let digits = stem.strip_prefix("CR-")?;
            digits
                .bytes()
                .all(|b| b.is_ascii_digit())
                .then(|| digits.parse::<u32>().ok())?
        })
        .max()
        .unwrap_or(0);
    format!("CR-{:03}", max.saturating_add(1))
}

/// How the tasks of one estimate sheet differ between two refs. A sheet that is absent on one
/// side adds or removes all its tasks. A percentage task is a share of the build days of its own
/// sheet, so a change of build work moves it too. A task whose days did not move is left out.
pub fn task_deltas(slug: &str, before: Option<&Sheet>, after: Option<&Sheet>) -> Vec<CrTask> {
    let days = |s: Option<&Sheet>| -> BTreeMap<String, (String, f64)> {
        s.map(|s| {
            let build = build_days(s);
            s.tasks()
                .map(|(_, t)| (t.id.clone(), (t.name.clone(), task_days(t, build))))
                .collect()
        })
        .unwrap_or_default()
    };
    let (was, now) = (days(before), days(after));
    let mut out = Vec::new();
    for (id, (name, a)) in &now {
        let task = |change, b| CrTask {
            sheet: slug.into(),
            name: name.clone(),
            change,
            before: b,
            after: *a,
        };
        match was.get(id) {
            None => out.push(task("added", 0.0)),
            Some((_, b)) if (b - a).abs() > 1e-9 => out.push(task("changed", *b)),
            Some(_) => {}
        }
    }
    for (id, (name, b)) in &was {
        if !now.contains_key(id) {
            out.push(CrTask {
                sheet: slug.into(),
                name: name.clone(),
                change: "removed",
                before: *b,
                after: 0.0,
            });
        }
    }
    out
}

fn cell(s: &str) -> String {
    // The reader of a table splits on `|`, so a bar in a name would shift the columns.
    flat(&s.replace('|', "/"))
}

fn signed(n: f64) -> String {
    if n > 0.0 {
        format!("+{}", num(n))
    } else {
        num(n)
    }
}

/// The Markdown text of a change request: scope, impacts, estimate delta, decisions and approvals.
/// The `.docx` is made from this text, so both hold the same words.
pub fn change_request_md(cr: &ChangeRequest) -> String {
    let title = flat(&cr.title);
    let mut o = format!(
        "---\nid: {}\ndate: {}\nproject: \"{}\"\ntitle: \"{}\"\nbase: {}\nhead: {}\n---\n\n# {} - {title}\n\n## Scope\n\n",
        cr.id,
        cr.date,
        flat(&cr.project).replace('"', "'"),
        title.replace('"', "'"),
        flat(&cr.base),
        flat(&cr.head),
        cr.id,
    );
    if cr.files.is_empty() {
        o.push_str("No file changed between the two refs.\n");
    } else {
        let _ = writeln!(
            o,
            "{} commit(s) and {} file(s) between `{}` and `{}`.\n\n| File | Status | Added | Removed |\n| --- | --- | --- | --- |",
            cr.commits,
            cr.files.len(),
            flat(&cr.base),
            flat(&cr.head)
        );
        for f in &cr.files {
            let _ = writeln!(
                o,
                "| {} | {} | {} | {} |",
                cell(&f.path),
                f.status,
                f.added,
                f.removed
            );
        }
    }
    o.push_str("\n## Impacts\n\n");
    if cr.impacts.is_empty() {
        o.push_str("No impact note changed between the two refs.\n");
    }
    for (t, p) in &cr.impacts {
        let _ = writeln!(o, "- {} ({})", cell(t), cell(p));
    }
    o.push_str("\n## Estimate delta\n\n");
    if cr.tasks.is_empty() {
        o.push_str("No estimated task changed.\n");
    } else {
        o.push_str("| Sheet | Task | Change | Days before | Days after |\n| --- | --- | --- | --- | --- |\n");
        for t in &cr.tasks {
            let _ = writeln!(
                o,
                "| {} | {} | {} | {} | {} |",
                cell(&t.sheet),
                cell(&t.name),
                t.change,
                num(t.before),
                num(t.after)
            );
        }
        let (b, a): (f64, f64) = cr
            .tasks
            .iter()
            .fold((0.0, 0.0), |s, t| (s.0 + t.before, s.1 + t.after));
        let _ = writeln!(o, "\nDays: {} to {} ({}).", num(b), num(a), signed(a - b));
    }
    for (name, why) in &cr.unread {
        let _ = writeln!(o, "\nNot read: {} ({}).", cell(name), cell(why));
    }
    o.push_str("\n## Decisions\n\n");
    if cr.decisions.is_empty() {
        o.push_str("No decision record changed between the two refs.\n");
    } else {
        o.push_str("| ADR | Title | Status |\n| --- | --- | --- |\n");
        for (n, t, s) in &cr.decisions {
            let _ = writeln!(o, "| {} | {} | {} |", cell(n), cell(t), cell(s));
        }
    }
    o.push_str("\n## Approvals\n\n");
    if cr.approvers.is_empty() {
        o.push_str("No approver is named.\n");
    } else {
        o.push_str("| Name | Decision | Date | Signature |\n| --- | --- | --- | --- |\n");
        for a in &cr.approvers {
            let _ = writeln!(o, "| {} |  |  |  |", cell(a));
        }
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_core::work::{Bar, Feature, Task};

    fn sheet(tasks: &[(&str, f64)]) -> Sheet {
        Sheet {
            name: "Lot 1".into(),
            features: vec![Feature {
                id: "f".into(),
                name: "Feature".into(),
                tasks: tasks
                    .iter()
                    .map(|(id, d)| Task {
                        id: (*id).into(),
                        name: format!("Task {id}"),
                        role: "dev".into(),
                        days: Some(*d),
                        ..Task::default()
                    })
                    .collect(),
                ..Feature::default()
            }],
            ..Sheet::default()
        }
    }

    #[test]
    fn a_costing_worksheet_holds_days_and_no_money() {
        let s = sheet(&[("a", 2.0), ("b", 0.5)]);
        let out = costing_sheets(&[
            ("lot-1".into(), Ok(&s)),
            ("sealed".into(), Err("the sheet is sealed".into())),
        ]);
        assert_eq!(out[0].rows[0], ["lot-1", "Lot 1", "2.5"]);
        assert_eq!(out[1].rows.last().unwrap()[3], "2.5");
        assert_eq!(out[2].rows[0][0], "the sheet is sealed");
        let all: String = out.iter().flat_map(|s| &s.headers).cloned().collect();
        assert!(!all.to_lowercase().contains("rate") && !all.to_lowercase().contains("cost"));
    }

    #[test]
    fn the_estimate_delta_names_added_removed_and_changed_tasks() {
        let (a, b) = (
            sheet(&[("a", 2.0), ("b", 1.0), ("c", 3.0)]),
            sheet(&[("a", 2.0), ("b", 4.0), ("d", 1.0)]),
        );
        let d = task_deltas("lot", Some(&a), Some(&b));
        let rows: Vec<_> = d
            .iter()
            .map(|t| (t.name.as_str(), t.change, t.before, t.after))
            .collect();
        assert_eq!(
            rows,
            [
                ("Task b", "changed", 1.0, 4.0),
                ("Task d", "added", 0.0, 1.0),
                ("Task c", "removed", 3.0, 0.0)
            ]
        );
        assert_eq!(task_deltas("lot", None, Some(&a)).len(), 3);
    }

    #[test]
    fn the_next_id_is_one_above_the_highest_and_a_hole_stays() {
        assert_eq!(next_cr_id(&[]), "CR-001");
        let names = [
            "CR-001.md",
            "CR-004.md",
            "CR-004.docx",
            "notes.md",
            "CR-x.md",
        ]
        .map(String::from);
        assert_eq!(next_cr_id(&names), "CR-005");
    }

    #[test]
    fn the_change_request_has_the_five_sections_and_one_table_shape() {
        let cr = ChangeRequest {
            id: "CR-002".into(),
            date: "2026-10-30".into(),
            project: "Shipyard".into(),
            title: "Add\nexport | v2".into(),
            base: "main".into(),
            head: "work".into(),
            commits: 2,
            files: vec![CrFile {
                path: "a|b.rs".into(),
                status: "M".into(),
                added: 3,
                removed: 1,
            }],
            tasks: task_deltas(
                "lot",
                Some(&sheet(&[("a", 1.0)])),
                Some(&sheet(&[("a", 3.0)])),
            ),
            decisions: vec![("0004".into(), "Polling".into(), "accepted".into())],
            approvers: vec!["Ada".into()],
            ..ChangeRequest::default()
        };
        let md = change_request_md(&cr);
        for h in [
            "## Scope",
            "## Impacts",
            "## Estimate delta",
            "## Decisions",
            "## Approvals",
        ] {
            assert!(md.contains(h), "{h}");
        }
        assert!(md.contains("# CR-002 - Add export | v2\n"));
        assert!(md.contains("| a/b.rs | M | 3 | 1 |"));
        assert!(md.contains("Days: 1 to 3 (+2)."));
        assert!(md.contains("No impact note changed"));
        assert!(md.contains("| Ada |  |  |  |"));
    }

    #[test]
    fn the_gantt_svg_is_self_contained_and_escapes_names() {
        let bar = |name: &str, start: &str, end: &str| Bar {
            task: "t".into(),
            feature: "f".into(),
            name: name.into(),
            role: "dev".into(),
            member: None,
            start: start.into(),
            end: end.into(),
            days: 2.0,
            months: vec![],
        };
        let g = Gantt {
            bars: vec![
                bar("A <b> & c", "2026-10-01", "2026-11-03"),
                bar("bad", "x", "y"),
            ],
        };
        let svg = gantt_svg("Plan \"1\"", &g);
        assert!(svg.starts_with("<svg xmlns=") && svg.trim_end().ends_with("</svg>"));
        assert!(svg.contains("A &lt;b&gt; &amp; c") && svg.contains("Plan &quot;1&quot;"));
        assert_eq!(
            svg.matches("<rect x=").count(),
            1,
            "a bad date leaves the bar out"
        );
        assert!(svg.contains("2026-11"), "a month line");
        assert!(gantt_svg("Empty", &Gantt { bars: vec![] }).contains("No task"));
        assert!(!svg.contains("<script") && !svg.contains("href"));
    }
}
