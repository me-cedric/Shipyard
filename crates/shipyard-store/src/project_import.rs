//! The Legacy import (spec `projects`, REQ-014, REQ-015, Q-003 option 1). It reads a Legacy
//! repository and writes the matching Shipyard files into a project. It never changes the source.
//! It never replaces a file: a target that exists is a conflict and stays as it is (Q-090).
//!
//! Legacy keeps the default paths only. A path that the Legacy registry overrode is not read (Q-091).
//! Sources: Legacy `src/lib/planning.ts` (team), `src/lib/costing.ts` (sheets),
//! `src/lib/tickets/model.ts` (tickets config) and `src/lib/personas.ts` (roles).

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde_json::Value;
use shipyard_core::project::{PROJECT_FILE, ProjectConnections, ProjectFile};
use shipyard_core::work::{Availability, Feature, Member, Sheet, Span, Task, Team};

use crate::{project, safe_write, work};

const MAX_BYTES: u64 = 2 * 1024 * 1024;
/// The folders that have the same layout in Legacy and in Shipyard. Files are copied as they are.
const SAME: [&str; 3] = ["docs/decisions", "docs/delivery/questions", "docs/openspec"];

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

fn read(path: &Path) -> std::result::Result<String, String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not a regular file".into());
    }
    if meta.len() > MAX_BYTES {
        return Err("too large".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// The files under `dir`, as paths relative to `base`, sorted. A symlink is not followed.
fn files(base: &Path, rel: &str, out: &mut Vec<String>) {
    let Ok(rd) = fs::read_dir(base.join(rel)) else {
        return;
    };
    let mut names: Vec<_> = rd.flatten().collect();
    names.sort_by_key(|e| e.file_name());
    for e in names {
        let p = format!("{rel}/{}", e.file_name().to_string_lossy());
        if e.file_type().is_ok_and(|t| t.is_dir()) {
            files(base, &p, out);
        } else {
            out.push(p);
        }
    }
}

fn json(source: &Path, rel: &str) -> Option<std::result::Result<Value, String>> {
    if source.join(rel).symlink_metadata().is_err() {
        return None;
    }
    Some(read(&source.join(rel)).and_then(|t| serde_json::from_str(&t).map_err(|e| e.to_string())))
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

/// A Legacy persona is a role. Its name is the role in Shipyard (`role_rates` keys on it).
fn roles(source: &Path) -> BTreeMap<String, String> {
    let Some(Ok(v)) = json(source, "docs/personas/personas.json") else {
        return BTreeMap::new();
    };
    list(&v, "personas")
        .iter()
        .map(|p| (text(p, "id").to_string(), text(p, "name").to_lowercase()))
        .collect()
}

fn team(v: &Value, roles: &BTreeMap<String, String>) -> Team {
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

fn sheet(v: &Value, stem: &str, roles: &BTreeMap<String, String>) -> Sheet {
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
        // A version 1 sheet has no currency. Legacy shows the CGI tool default.
        currency: Some(text(meta, "currency"))
            .filter(|c| !c.is_empty())
            .unwrap_or("EUR")
            .into(),
        margin_rate: meta
            .get("marginRate")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
        features,
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
        file.key = "KVY".into();
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

/// Imports the Legacy repository `source` into the project `root`.
pub fn import(source: &Path, root: &Path) -> Report {
    let mut r = Report::default();
    let roles = roles(source);

    // Project config and tickets config.
    let tickets = json(source, "docs/delivery/tickets.config.json");
    if let Some(Err(e)) = &tickets {
        r.skipped
            .push(("docs/delivery/tickets.config.json".into(), e.clone()));
    }
    let has_legacy = tickets.is_some()
        || ["docs/planning/team.json", "docs/costing", "docs/personas"]
            .iter()
            .chain(&SAME)
            .any(|p| source.join(p).exists());
    if has_legacy {
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
    files(source, "docs/costing", &mut sheets);
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

    // Decisions, RAID files and specs: the same path and the same text.
    for dir in SAME {
        let mut found = Vec::new();
        files(source, dir, &mut found);
        for rel in found {
            match read(&source.join(&rel)) {
                Ok(t) => r.put(&rel, &rel, root, &t),
                Err(e) => r.skipped.push((rel, e)),
            }
        }
    }
    r
}
