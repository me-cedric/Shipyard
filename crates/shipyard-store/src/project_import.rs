//! The project import (spec `projects`, REQ-014, REQ-015, Q-003 option 1). It reads a repository
//! with the existing layout and writes the matching Shipyard files into a project. It never changes the source.
//! It never replaces a file: a target that exists is a conflict and stays as it is (Q-090).
//!
//! Slides copy as they are (same `docs/slides`). A dashboard becomes tiles and the work log becomes
//! one time file for each member and month (Q-129).
//!
//! The import reads the default paths only. A path that a project overrode is not read (Q-091).

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde_json::Value;
use shipyard_core::project::{PROJECT_FILE, ProjectConnections, ProjectFile};
use shipyard_core::work::{Availability, Feature, Member, Sheet, Span, Task, Team};

use crate::{docs_layout, knowledge, project, safe_write, work};

const MAX_BYTES: u64 = 2 * 1024 * 1024;
const MAX_DEPTH: usize = 8;
const MAX_FILES: usize = 2000;
/// The folders that have the same layout in the source and in Shipyard. Files are copied as they are.
const SAME: [&str; 4] = [
    "docs/decisions",
    "docs/delivery/questions",
    "docs/openspec",
    "docs/slides",
];
const DASHBOARDS: &str = "docs/delivery/dashboards";
const WORKLOG: &str = "docs/delivery/worklog";

/// Paths are relative to the project root. `skipped` holds the source path and the reason.
#[derive(Debug, Default, PartialEq)]
pub struct Report {
    pub copied: Vec<String>,
    pub skipped: Vec<(String, String)>,
    pub conflicts: Vec<String>,
}

impl Report {
    fn put(&mut self, source: &str, target: &str, root: &Path, text: &str) {
        let path = root.join(target);
        if path.symlink_metadata().is_ok() {
            self.conflicts.push(target.into());
        } else if let Err(e) = safe_write::create(&path, text) {
            self.skipped.push((source.into(), e.to_string()));
        } else {
            self.copied.push(target.into());
        }
    }
}

/// Refuses a symlink on `rel` under `base`. `read_dir` and `read_to_string` follow a symlink in a
/// parent folder, so a link such as `docs/decisions -> ../..` would reach files outside the source.
fn plain(base: &Path, rel: &str) -> std::result::Result<(), String> {
    let mut path = base.to_path_buf();
    for part in rel.split('/') {
        path.push(part);
        if fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("symlink is not followed".into());
        }
    }
    Ok(())
}

fn read(base: &Path, rel: &str) -> std::result::Result<String, String> {
    plain(base, rel)?;
    let path = base.join(rel);
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not a regular file".into());
    }
    if meta.len() > MAX_BYTES {
        return Err("too large".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// The files under the folder `rel` of `base`, as paths relative to `base`, sorted. A symlink on the
/// path to the folder is refused. Dotfiles are skipped. The walk stops at `MAX_DEPTH` and `MAX_FILES`.
/// A symlink inside the folder is listed as a file: `read` refuses it.
fn files(
    base: &Path,
    rel: &str,
    depth: usize,
    out: &mut Vec<String>,
    skipped: &mut Vec<(String, String)>,
) {
    if let Err(e) = plain(base, rel) {
        skipped.push((rel.into(), e));
        return;
    }
    if depth > MAX_DEPTH {
        skipped.push((rel.into(), "too deep".into()));
        return;
    }
    let Ok(rd) = fs::read_dir(base.join(rel)) else {
        return;
    };
    let mut names: Vec<_> = rd.flatten().collect();
    names.sort_by_key(|e| e.file_name());
    for e in names {
        let name = e.file_name().to_string_lossy().into_owned();
        let p = format!("{rel}/{name}");
        if name.starts_with('.') {
            skipped.push((p, "hidden file".into()));
        } else if out.len() >= MAX_FILES {
            skipped.push((p, "too many files".into()));
            return;
        } else if e.file_type().is_ok_and(|t| t.is_dir()) {
            files(base, &p, depth + 1, out, skipped);
        } else {
            out.push(p);
        }
    }
}

fn json(source: &Path, rel: &str) -> Option<std::result::Result<Value, String>> {
    if source.join(rel).symlink_metadata().is_err() {
        return None;
    }
    Some(read(source, rel).and_then(|t| serde_json::from_str(&t).map_err(|e| e.to_string())))
}

fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn list<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

/// Lower case letters, digits and `-`: the form of a handle, a slug and a row id.
fn slug(s: &str) -> String {
    let s: String = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    s.trim_matches('-').to_string()
}

/// A persona is a role. Its name is the role in Shipyard (`role_rates` keys on it).
pub fn roles(source: &Path) -> BTreeMap<String, String> {
    let Some(Ok(v)) = json(source, "docs/personas/personas.json") else {
        return BTreeMap::new();
    };
    list(&v, "personas")
        .iter()
        .map(|p| (text(p, "id").to_string(), text(p, "name").to_lowercase()))
        .collect()
}

pub fn team(v: &Value, roles: &BTreeMap<String, String>) -> Team {
    let mut used = BTreeSet::new();
    let members = list(v, "members")
        .iter()
        .map(|m| {
            let base = Some(slug(text(m, "name")))
                .filter(|s| !s.is_empty())
                .unwrap_or("member".into());
            let handle = (1..)
                .map(|n| {
                    if n == 1 {
                        base.clone()
                    } else {
                        format!("{base}-{n}")
                    }
                })
                .find(|h| used.insert(h.clone()))
                .unwrap_or_default();
            let windows = list(m, "windows");
            let from = windows
                .iter()
                .map(|w| text(w, "from"))
                .filter(|d| !d.is_empty())
                .min();
            let until = windows
                .iter()
                .map(|w| text(w, "to"))
                .filter(|d| !d.is_empty())
                .max();
            let load = windows
                .iter()
                .filter_map(|w| w.get("load")?.as_f64())
                .fold(0.0, f64::max);
            let id = text(m, "personaId");
            Member {
                name: text(m, "name").into(),
                handle,
                trackers: Some(text(m, "email").to_lowercase())
                    .filter(|e| !e.is_empty())
                    .into_iter()
                    .collect(),
                role: roles.get(id).cloned().unwrap_or_else(|| id.into()),
                capacity: if load > 0.0 { 5.0 * load } else { 5.0 },
                skills: Vec::new(),
                day_rate: m.get("tjm").and_then(Value::as_f64).filter(|r| *r > 0.0),
                availability: Availability {
                    from: from.map(Into::into),
                    until: until.map(Into::into),
                    absences: list(m, "absences")
                        .iter()
                        .map(|a| Span {
                            from: text(a, "from").into(),
                            to: text(a, "to").into(),
                        })
                        .collect(),
                },
            }
        })
        .collect();
    Team {
        members,
        locked: false,
    }
}

pub fn sheet(v: &Value, stem: &str, roles: &BTreeMap<String, String>) -> Sheet {
    let meta = v.get("meta").unwrap_or(&Value::Null);
    let features = list(v, "features")
        .iter()
        .map(|f| Feature {
            id: slug(text(f, "id")),
            name: text(f, "name").into(),
            description: String::new(),
            tasks: list(f, "tasks")
                .iter()
                .map(|t| {
                    let n = t.get("mandays").and_then(Value::as_f64).unwrap_or(0.0);
                    let ratio = text(t, "chargeType") == "ratio";
                    let id = text(t, "personaId");
                    Task {
                        id: slug(text(t, "id")),
                        name: text(t, "name").into(),
                        description: text(t, "description").into(),
                        role: roles.get(id).cloned().unwrap_or_else(|| id.into()),
                        days: (!ratio).then_some(n),
                        percent: ratio.then_some(n),
                        other: text(t, "kind") == "other",
                        ticket: None,
                        note: text(t, "comments").into(),
                        ..Task::default()
                    }
                })
                .collect(),
        })
        .collect();
    Sheet {
        name: Some(text(meta, "name"))
            .filter(|n| !n.is_empty())
            .unwrap_or(stem)
            .into(),
        // A version 1 sheet has no currency. The default currency is used.
        currency: Some(text(meta, "currency"))
            .filter(|c| !c.is_empty())
            .unwrap_or("EUR")
            .into(),
        margin_rate: meta
            .get("marginRate")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
        features,
        frozen: false,
    }
}

/// The project file: the folder name, the Jira project key and the tracker scope of the tickets config.
fn project_file(source: &Path, tickets: Option<&Value>) -> ProjectFile {
    let name = source
        .file_name()
        .map_or("project".into(), |n| n.to_string_lossy().into_owned());
    let key = tickets.map(|t| text(t, "projectKey").to_uppercase());
    let derived: String = name
        .to_uppercase()
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .skip_while(|c| !c.is_ascii_uppercase())
        .take(10)
        .collect();
    let mut file = ProjectFile::new(
        &name,
        key.filter(|k| !k.is_empty()).as_deref().unwrap_or(&derived),
    );
    if shipyard_core::project::validate(&file)
        .iter()
        .any(|i| i.field == "key")
    {
        file.key = "PRJ".into();
    }
    let scope = tickets
        .map(|t| text(t, "projectKey"))
        .filter(|k| !k.is_empty());
    if let (Some(scope), Some("" | "jira")) = (scope, tickets.map(|t| text(t, "tracker"))) {
        file.connections = Some(ProjectConnections {
            tracker_scope: Some(scope.to_uppercase()),
            ..Default::default()
        });
    }
    file
}

/// The Shipyard tile that shows what a data source answers. A source with no such tile
/// (git, release, forge, provision, custom files) has none, and its widget is skipped.
fn tile_kind(source: &str) -> Option<&'static str> {
    Some(match source.split('.').next()? {
        "tickets" | "worklog" | "team" | "schedule" => "work",
        "delivery" if source == "delivery.notes" => "impact",
        "delivery" => "work",
        "costing" => "estimates",
        "qa" | "gates" => "quality",
        "specs" => "specs",
        "raid" => "questions",
        _ => return None,
    })
}

/// A dashboard (`widgets` with a `source`) as Shipyard tiles. A widget with no tile for its
/// source, and a note, are left out and named in the second value.
pub fn dashboard(v: &Value, fallback: &str) -> (knowledge::Dashboard, Vec<String>) {
    let mut left = Vec::new();
    let mut tiles: Vec<knowledge::Tile> = Vec::new();
    for (i, w) in list(v, "widgets").iter().enumerate() {
        let source = text(w, "source");
        let Some(kind) = tile_kind(source) else {
            left.push(format!("{}: no tile for `{source}`", text(w, "id")));
            continue;
        };
        let base = Some(slug(text(w, "id")))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("tile-{}", i + 1));
        let id = (1..)
            .map(|n| {
                if n == 1 {
                    base.clone()
                } else {
                    format!("{base}-{n}")
                }
            })
            .find(|c| tiles.iter().all(|t| &t.id != c))
            .unwrap_or_default();
        let n = |k: &str, d: u64| w.get(k).and_then(Value::as_u64).unwrap_or(d).min(48) as u32;
        tiles.push(knowledge::Tile {
            id,
            kind: kind.into(),
            x: n("x", 0),
            y: n("y", 0),
            w: n("w", 4).max(1),
            h: n("h", 3).max(1),
            title: String::new(),
        });
    }
    let title = Some(text(v, "name"))
        .filter(|t| !t.is_empty())
        .unwrap_or(fallback);
    (
        knowledge::Dashboard {
            title: title.into(),
            tiles,
            ..Default::default()
        },
        left,
    )
}

/// The handle of the member whose tracker account is `email`, else the part before the `@`.
fn handle_of(team: &Team, email: &str) -> String {
    let email = email.trim().to_lowercase();
    team.members
        .iter()
        .find(|m| m.trackers.contains(&email))
        .map(|m| m.handle.clone())
        .or_else(|| Some(slug(email.split('@').next().unwrap_or(""))).filter(|h| !h.is_empty()))
        .unwrap_or_else(|| "member".into())
}

/// One month of the work log (`entries` with `date`, `author`, `minutes`, `what`, `ticket`,
/// `jiraId`) as time entries by member handle. An entry with no valid day, no author or no minutes
/// is left out.
pub fn worklog(v: &Value, team: &Team) -> BTreeMap<String, Vec<shipyard_core::work::TimeEntry>> {
    let mut out: BTreeMap<String, Vec<shipyard_core::work::TimeEntry>> = BTreeMap::new();
    for (i, e) in list(v, "entries").iter().enumerate() {
        let day = text(e, "date").get(..10).unwrap_or("");
        let minutes = e
            .get("minutes")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .round();
        let author = text(e, "author");
        if shipyard_core::work::parse_day(day).is_none()
            || author.trim().is_empty()
            || minutes < 1.0
        {
            continue;
        }
        let list = out.entry(handle_of(team, author)).or_default();
        let base = Some(text(e, "id").to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("{day}-{i}"));
        let id = (1..)
            .map(|n| {
                if n == 1 {
                    base.clone()
                } else {
                    format!("{base}-{n}")
                }
            })
            .find(|c| list.iter().all(|t| &t.id != c))
            .unwrap_or_default();
        let some = |k: &str| Some(text(e, k).to_string()).filter(|t| !t.is_empty());
        list.push(shipyard_core::work::TimeEntry {
            id,
            day: day.into(),
            minutes: minutes as u32,
            note: text(e, "what").into(),
            ticket: some("ticket"),
            worklog: some("jiraId"),
        });
    }
    out
}

/// Imports the repository `source` into the project `root`.
pub fn import(source: &Path, root: &Path) -> Report {
    let mut r = Report::default();
    let roles = roles(source);

    // Project config and tickets config.
    let tickets = json(source, "docs/delivery/tickets.config.json");
    if let Some(Err(e)) = &tickets {
        r.skipped
            .push(("docs/delivery/tickets.config.json".into(), e.clone()));
    }
    let has_layout = tickets.is_some()
        || [
            "docs/planning/team.json",
            "docs/planning/calendar.json",
            "docs/planning/plan.json",
            "docs/costing",
            "docs/personas",
            DASHBOARDS,
            WORKLOG,
        ]
        .iter()
        // Slides alone say nothing: Shipyard keeps its decks in the same folder.
        .chain(SAME.iter().filter(|p| **p != "docs/slides"))
        .any(|p| source.join(p).exists());
    if has_layout {
        let file = project_file(source, tickets.as_ref().and_then(|t| t.as_ref().ok()));
        match project::render_project_file(&file) {
            Ok(t) => r.put("docs/delivery/tickets.config.json", PROJECT_FILE, root, &t),
            Err(e) => r.skipped.push((PROJECT_FILE.into(), e.to_string())),
        }
    }

    // Team.
    match json(source, "docs/planning/team.json") {
        None => {}
        Some(Err(e)) => r.skipped.push(("docs/planning/team.json".into(), e)),
        Some(Ok(v)) => match work::write_team(&team(&v, &roles), None) {
            Ok(t) => r.put("docs/planning/team.json", work::TEAM_PATH, root, &t),
            Err(e) => r
                .skipped
                .push(("docs/planning/team.json".into(), e.to_string())),
        },
    }

    // Costing sheets.
    let mut sheets = Vec::new();
    files(source, "docs/costing", 0, &mut sheets, &mut r.skipped);
    for rel in sheets.iter().filter(|p| p.ends_with(".json")) {
        let stem = slug(
            rel.trim_start_matches("docs/costing/")
                .trim_end_matches(".json"),
        );
        let out = json(source, rel)
            .unwrap_or(Err("gone".into()))
            .and_then(|v| {
                work::write_sheet(&sheet(&v, &stem, &roles), None).map_err(|e| e.to_string())
            })
            .and_then(|t| Ok((work::sheet_path(&stem).map_err(|e| e.to_string())?, t)));
        match out {
            Ok((target, t)) => r.put(rel, &target, root, &t),
            Err(e) => r.skipped.push((rel.clone(), e)),
        }
    }

    // Calendar and plan decisions (Q-122): the working week, the holidays and the pinned tasks.
    match json(source, "docs/planning/calendar.json") {
        None => {}
        Some(Err(e)) => r.skipped.push(("docs/planning/calendar.json".into(), e)),
        Some(Ok(v)) => match work::write_calendar(&docs_layout::calendar_from_json(&v.to_string()))
        {
            Ok(t) => r.put("docs/planning/calendar.json", work::CALENDAR_PATH, root, &t),
            Err(e) => r
                .skipped
                .push(("docs/planning/calendar.json".into(), e.to_string())),
        },
    }
    if let Some(res) = json(source, "docs/planning/plan.json") {
        let held: Vec<(String, Sheet)> = sheets
            .iter()
            .filter(|p| p.ends_with(".json"))
            .filter_map(|rel| {
                let stem = slug(
                    rel.trim_start_matches("docs/costing/")
                        .trim_end_matches(".json"),
                );
                Some((
                    stem.clone(),
                    sheet(&json(source, rel)?.ok()?, &stem, &roles),
                ))
            })
            .collect();
        let slug_of = |id: &str| {
            held.iter()
                .find(|(_, s)| {
                    s.features
                        .iter()
                        .any(|f| f.tasks.iter().any(|t| t.id == id))
                })
                .map(|(slug, _)| slug.clone())
        };
        match res.map_err(|e| e.to_string()).and_then(|v| {
            work::write_decisions(&docs_layout::decisions_from_json(&v.to_string(), slug_of))
                .map_err(|e| e.to_string())
        }) {
            Ok(t) => r.put("docs/planning/plan.json", work::DECISIONS_PATH, root, &t),
            Err(e) => r.skipped.push(("docs/planning/plan.json".into(), e)),
        }
    }

    // Dashboards (Q-129): the tiles that Shipyard has a data source for.
    let mut found = Vec::new();
    files(source, DASHBOARDS, 0, &mut found, &mut r.skipped);
    for rel in found.iter().filter(|p| p.ends_with(".json")) {
        let stem = slug(
            rel.trim_start_matches(DASHBOARDS)
                .trim_matches('/')
                .trim_end_matches(".json"),
        );
        let loaded = json(source, rel).unwrap_or(Err("gone".into()));
        let v = match loaded {
            Ok(v) => v,
            Err(e) => {
                r.skipped.push((rel.clone(), e));
                continue;
            }
        };
        let (d, left) = dashboard(&v, &stem);
        r.skipped.extend(left.into_iter().map(|l| (rel.clone(), l)));
        if stem.is_empty() || d.tiles.is_empty() {
            r.skipped.push((rel.clone(), "no tile to keep".into()));
            continue;
        }
        match knowledge::dashboard_text(&d) {
            Ok(t) => r.put(rel, &format!("docs/dashboards/{stem}.yaml"), root, &t),
            Err(e) => r.skipped.push((rel.clone(), e.to_string())),
        }
    }

    // The work log (Q-129): one file for each month becomes one time file for each member.
    let members = match json(source, "docs/planning/team.json") {
        Some(Ok(v)) => team(&v, &roles),
        _ => Team::default(),
    };
    let mut found = Vec::new();
    files(source, WORKLOG, 0, &mut found, &mut r.skipped);
    for rel in found.iter().filter(|p| p.ends_with(".json")) {
        let v = match json(source, rel).unwrap_or(Err("gone".into())) {
            Ok(v) => v,
            Err(e) => {
                r.skipped.push((rel.clone(), e));
                continue;
            }
        };
        for (handle, entries) in worklog(&v, &members) {
            let out = work::time_path(&handle, &entries[0].day)
                .and_then(|path| Ok((path, work::write_time(&entries)?)));
            match out {
                Ok((path, t)) => r.put(rel, &path, root, &t),
                Err(e) => r.skipped.push((rel.clone(), e.to_string())),
            }
        }
    }

    // Decisions, RAID files and specs: the same path and the same text.
    for dir in SAME {
        let mut found = Vec::new();
        files(source, dir, 0, &mut found, &mut r.skipped);
        for rel in found {
            match read(source, &rel) {
                Ok(t) => r.put(&rel, &rel, root, &t),
                Err(e) => r.skipped.push((rel, e)),
            }
        }
    }
    r
}
