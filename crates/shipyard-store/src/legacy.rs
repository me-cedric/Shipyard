//! The Legacy layout, read in place (Q-102): the path detection for a folder with no project file,
//! the Legacy project registry, and the writers that keep a Legacy JSON file in its own format.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::{Map, Value, json};
use shipyard_core::project::{ProjectFile, validate};
use shipyard_core::work::{Calendar, Decisions, Sheet, TaskDecision, Team};

const DRAWINGS: [&str; 6] = ["excalidraw", "drawio", "mmd", "mermaid", "bpmn", "svg"];
const MODELS: [&str; 2] = ["c4", "likec4"];
const DEPTH: usize = 6;

/// True when a file below `dir` has one of the extensions.
fn holds(root: &Path, dir: &str, exts: &[&str], depth: usize) -> bool {
    let Ok(rd) = fs::read_dir(root.join(dir)) else {
        return false;
    };
    rd.flatten().any(|e| {
        let name = e.file_name().to_string_lossy().into_owned();
        let path = format!("{dir}/{name}");
        match e.file_type() {
            Ok(t) if t.is_dir() => depth < DEPTH && holds(root, &path, exts, depth + 1),
            Ok(t) if t.is_file() => name
                .rsplit_once('.')
                .is_some_and(|(_, x)| exts.contains(&x.to_lowercase().as_str())),
            _ => false,
        }
    })
}

/// The paths of a Legacy layout that differ from the Shipyard defaults, for what exists on disk.
/// A plain folder gives an empty map.
pub fn detect_paths(root: &Path) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let mut put = |k: &str, v: &str| out.insert(k.to_string(), v.to_string());
    if holds(root, "docs/drawings", &DRAWINGS, 0) && !holds(root, "docs/diagrams", &DRAWINGS, 0) {
        put("diagrams", "docs/drawings");
    }
    if holds(root, "docs/diagrams", &MODELS, 0) && !holds(root, "docs/models", &MODELS, 0) {
        put("models", "docs/diagrams");
    }
    if root.join("docs/network/flows.json").is_file() {
        put("flows", "docs/network/flows.json");
    }
    out
}

/// The project file for a folder without one: the defaults, then the detected Legacy paths, then
/// `extra` (the paths that the Legacy registry holds).
pub fn layout_file(
    root: &Path,
    name: &str,
    key: &str,
    extra: &BTreeMap<String, String>,
) -> ProjectFile {
    let mut f = ProjectFile::new(name, key);
    f.paths.extend(detect_paths(root));
    f.paths.extend(extra.clone());
    // A path that fails the rule is dropped: the default stays.
    let bad: Vec<String> = validate(&f)
        .into_iter()
        .filter_map(|i| i.field.strip_prefix("paths.").map(String::from))
        .collect();
    for k in bad {
        f.paths.remove(&k);
    }
    f
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacyProject {
    pub id: String,
    pub name: String,
    pub path: String,
    /// Shipyard keys. Only the paths that the Legacy entry sets.
    pub paths: BTreeMap<String, String>,
}

/// The Legacy key of an artifact folder, and the Shipyard key that holds it.
const KEYS: [(&str, &str); 12] = [
    ("diagrams", "models"),
    ("drawings", "diagrams"),
    ("adr", "decisions"),
    ("openapi", "api"),
    ("data_models", "data"),
    ("openspec", "specs"),
    ("test_plans", "test-plans"),
    ("designs", "designs"),
    ("flows", "flows"),
    ("slides", "slides"),
    ("dashboards", "dashboards"),
    ("delivery", "questions"),
];

/// Reads `projects.json` of Legacy. Only the id, the name, the path and the paths are read: the
/// other fields (address, user, overrides) never leave the file. A missing or bad file gives none.
pub fn read_registry(file: &Path) -> Vec<LegacyProject> {
    #[derive(Deserialize)]
    struct Raw {
        #[serde(default)]
        projects: Vec<Item>,
    }
    #[derive(Deserialize)]
    struct Item {
        #[serde(default)]
        id: String,
        #[serde(default)]
        name: String,
        #[serde(default)]
        path: String,
        #[serde(default)]
        paths: BTreeMap<String, Value>,
    }
    let Ok(raw) = fs::read(file)
        .map_err(drop)
        .and_then(|b| serde_json::from_slice::<Raw>(&b).map_err(drop))
    else {
        return Vec::new();
    };
    raw.projects
        .into_iter()
        .filter(|p| !p.id.is_empty() && Path::new(&p.path).is_absolute())
        .map(|p| {
            let paths = KEYS
                .iter()
                .filter_map(|(k, s)| {
                    let v = p.paths.get(*k)?.as_str()?.trim().trim_end_matches('/');
                    // Legacy keeps the delivery folder. The questions are one level below it.
                    let v = if *k == "delivery" {
                        format!("{v}/questions")
                    } else {
                        v.into()
                    };
                    (!v.is_empty() && !v.starts_with('/')).then(|| ((*s).to_string(), v))
                })
                .collect();
            LegacyProject {
                name: if p.name.is_empty() {
                    p.id.clone()
                } else {
                    p.name
                },
                id: p.id,
                path: p.path,
                paths,
            }
        })
        .collect()
}

/// Where Legacy keeps `projects.json` on this machine.
pub fn registry_file() -> Option<PathBuf> {
    let var = |k: &str| std::env::var_os(k).map(PathBuf::from);
    let base = if cfg!(target_os = "macos") {
        var("HOME")?.join("Library/Application Support")
    } else if cfg!(windows) {
        var("APPDATA")?
    } else {
        var("XDG_DATA_HOME").or_else(|| var("HOME").map(|h| h.join(".local/share")))?
    };
    Some(base.join("legacy/projects.json"))
}

// ---------------------------------------------------------------- JSON write-back

fn obj(v: Option<&Value>) -> Map<String, Value> {
    v.and_then(Value::as_object).cloned().unwrap_or_default()
}

fn slug(s: &str) -> String {
    let s: String = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    s.trim_matches('-').to_string()
}

fn persona_id(role: &str, roles: &BTreeMap<String, String>) -> String {
    roles
        .iter()
        .find(|(_, name)| name.as_str() == role)
        .map_or_else(|| role.to_string(), |(id, _)| id.clone())
}

/// The Legacy sheet text for `sheet`. An entry of `old` keeps every key that Shipyard does not own
/// (groups, macro sizes, the plan). JSON keys come out sorted.
pub fn sheet_json(sheet: &Sheet, old: Option<&str>, roles: &BTreeMap<String, String>) -> String {
    let old: Value = old
        .and_then(|t| serde_json::from_str(t).ok())
        .unwrap_or(Value::Null);
    let mut top = obj(Some(&old));
    top.entry("version").or_insert(json!(1));
    let mut meta = obj(old.get("meta"));
    meta.insert("name".into(), json!(sheet.name));
    meta.insert("currency".into(), json!(sheet.currency));
    meta.insert("marginRate".into(), json!(sheet.margin_rate));
    top.insert("meta".into(), Value::Object(meta));
    let find = |list: Option<&Value>, id: &str| {
        list.and_then(Value::as_array)
            .and_then(|a| {
                a.iter()
                    .find(|x| slug(x.get("id").and_then(Value::as_str).unwrap_or("")) == id)
            })
            .cloned()
    };
    let features: Vec<Value> = sheet
        .features
        .iter()
        .map(|f| {
            let old_f = find(old.get("features"), &f.id);
            let mut o = obj(old_f.as_ref());
            o.entry("id").or_insert(json!(f.id));
            o.insert("name".into(), json!(f.name));
            let tasks: Vec<Value> = f
                .tasks
                .iter()
                .map(|t| {
                    let mut x =
                        obj(find(old_f.as_ref().and_then(|v| v.get("tasks")), &t.id).as_ref());
                    x.entry("id").or_insert(json!(t.id));
                    x.insert("name".into(), json!(t.name));
                    x.insert("description".into(), json!(t.description));
                    x.insert("personaId".into(), json!(persona_id(&t.role, roles)));
                    x.insert("mandays".into(), json!(t.percent.or(t.days).unwrap_or(0.0)));
                    x.insert(
                        "chargeType".into(),
                        json!(if t.percent.is_some() { "ratio" } else { "days" }),
                    );
                    x.insert(
                        "kind".into(),
                        json!(if t.other { "other" } else { "build" }),
                    );
                    x.insert("comments".into(), json!(t.note));
                    Value::Object(x)
                })
                .collect();
            o.insert("tasks".into(), Value::Array(tasks));
            Value::Object(o)
        })
        .collect();
    top.insert("features".into(), Value::Array(features));
    serde_json::to_string_pretty(&Value::Object(top)).unwrap_or_default() + "\n"
}

/// The Legacy `team.json` text for `team`. A member of `old` matches by id (the handle), then by
/// name, then by the slug of its name. A match keeps every key that Shipyard does not own.
pub fn team_json(team: &Team, old: Option<&str>, roles: &BTreeMap<String, String>) -> String {
    let old: Value = old
        .and_then(|t| serde_json::from_str(t).ok())
        .unwrap_or(Value::Null);
    let mut top = obj(Some(&old));
    top.entry("version").or_insert(json!(1));
    let members: Vec<Value> = team
        .members
        .iter()
        .map(|m| {
            // The handle is the Legacy `id`: a renamed member keeps its entry. The name is the fallback.
            let prev = old.get("members").and_then(Value::as_array).and_then(|a| {
                let by = |k: &str, v: &str| {
                    a.iter()
                        .find(|x| x.get(k).and_then(Value::as_str) == Some(v))
                };
                // `team` derives the handle from the name, so a Legacy member with its own id
                // still matches through the slug of its old name.
                by("id", &m.handle)
                    .or_else(|| by("name", &m.name))
                    .or_else(|| {
                        a.iter().find(|x| {
                            slug(x.get("name").and_then(Value::as_str).unwrap_or("")) == m.handle
                        })
                    })
            });
            let mut o = obj(prev);
            o.entry("id").or_insert(json!(m.handle));
            o.insert("personaId".into(), json!(persona_id(&m.role, roles)));
            // The first window carries the availability. Other windows and their load stay.
            let mut windows = o
                .get("windows")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if windows.is_empty() {
                windows.push(json!({"load": 1}));
            }
            if let Some(w) = windows[0].as_object_mut() {
                w.insert("from".into(), json!(m.availability.from));
                w.insert("to".into(), json!(m.availability.until));
            }
            o.insert("windows".into(), Value::Array(windows));
            o.insert("name".into(), json!(m.name));
            if let Some(e) = m.trackers.iter().find(|t| t.contains('@')) {
                o.insert("email".into(), json!(e));
            }
            if let Some(r) = m.day_rate {
                o.insert("tjm".into(), json!(r));
            }
            let absences: Vec<Value> = m
                .availability
                .absences
                .iter()
                .map(|a| json!({"from": a.from, "to": a.to}))
                .collect();
            o.insert("absences".into(), Value::Array(absences));
            Value::Object(o)
        })
        .collect();
    top.insert("members".into(), Value::Array(members));
    serde_json::to_string_pretty(&Value::Object(top)).unwrap_or_default() + "\n"
}

// ---------------------------------------------------------------- calendar.json and plan.json

/// The calendar of a Legacy `docs/planning/calendar.json`. Legacy writes a holiday as
/// `{date, name}`. A text that is not valid gives the default week.
pub fn calendar_from_json(text: &str) -> Calendar {
    let v: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    let mut c = Calendar::default();
    if let Some(days) = v["workingDays"].as_array() {
        let days: Vec<u8> = days
            .iter()
            .filter_map(|d| d.as_u64().filter(|d| (1..=7).contains(d)))
            .map(|d| d as u8)
            .collect();
        // An empty week is a mistake in Legacy too: it keeps the default.
        if !days.is_empty() {
            c.working_days = days;
        }
    }
    c.holidays = v["holidays"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|h| h["date"].as_str().or(h.as_str()))
        .map(String::from)
        .collect();
    c
}

/// The Legacy calendar text for `cal`. A holiday that `old` knows keeps its name.
pub fn calendar_json(cal: &Calendar, old: Option<&str>) -> String {
    let old: Value = old
        .and_then(|t| serde_json::from_str(t).ok())
        .unwrap_or(Value::Null);
    let name = |d: &str| {
        old["holidays"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|h| h["date"] == d)
            .and_then(|h| h["name"].as_str())
            .unwrap_or("")
            .to_string()
    };
    let mut top = obj(Some(&old));
    top.insert("version".into(), json!(1));
    top.insert("workingDays".into(), json!(cal.working_days));
    let holidays: Vec<Value> = cal
        .holidays
        .iter()
        .map(|d| json!({"date": d, "name": name(d)}))
        .collect();
    top.insert("holidays".into(), Value::Array(holidays));
    serde_json::to_string_pretty(&Value::Object(top)).unwrap_or_default() + "\n"
}

/// The decisions of a Legacy `docs/planning/plan.json`. `slug_of` finds the sheet that holds a
/// task id. A task that no sheet holds is left out. The first member and a pinned start are kept
/// (`start-on`); the other fields stay in the file.
pub fn decisions_from_json(text: &str, slug_of: impl Fn(&str) -> Option<String>) -> Decisions {
    let v: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    let mut d = Decisions::default();
    for t in v["tasks"].as_array().into_iter().flatten() {
        let Some(id) = t["taskId"].as_str().map(slug) else {
            continue;
        };
        let Some(sheet) = slug_of(&id) else { continue };
        let key = format!("est:{sheet}#{id}");
        let start = (t["anchor"] == "start-on")
            .then(|| t["anchorDate"].as_str().filter(|s| !s.is_empty()))
            .flatten()
            .map(String::from);
        let member = t["memberIds"][0].as_str().map(slug);
        if start.is_some() || member.is_some() {
            d.order.push(key.clone());
            d.tasks.insert(key, TaskDecision { start, member });
        }
    }
    d
}

/// The Legacy plan text for `d`. A task entry of `old` keeps its duration, predecessors and note.
pub fn plan_json(d: &Decisions, old: Option<&str>) -> String {
    let old: Value = old
        .and_then(|t| serde_json::from_str(t).ok())
        .unwrap_or(Value::Null);
    let mut top = obj(Some(&old));
    top.insert("version".into(), json!(1));
    let mut tasks: Vec<Value> = old["tasks"].as_array().cloned().unwrap_or_default();
    let id_of = |k: &str| k.rsplit_once('#').map(|(_, id)| id.to_string());
    for t in &mut tasks {
        let Some(o) = t.as_object_mut() else { continue };
        let id = o.get("taskId").and_then(Value::as_str).map(slug);
        // A decision that was dropped clears the pin and the member only.
        if !d.tasks.keys().any(|k| id_of(k) == id) {
            o.insert("memberIds".into(), json!([]));
            o.insert("anchor".into(), json!("auto"));
            o.insert("anchorDate".into(), json!(""));
        }
    }
    for (key, dec) in &d.tasks {
        let Some(id) = id_of(key) else { continue };
        let at = tasks
            .iter()
            .position(|t| t["taskId"].as_str().map(slug).as_deref() == Some(id.as_str()));
        let mut o = at
            .and_then(|i| tasks[i].as_object().cloned())
            .unwrap_or_else(|| {
                let mut o = Map::new();
                o.insert("taskId".into(), json!(id));
                o.insert("alsoAfter".into(), json!([]));
                o.insert("durationDays".into(), json!(0));
                o.insert("note".into(), json!(""));
                o
            });
        o.insert(
            "memberIds".into(),
            json!(dec.member.iter().collect::<Vec<_>>()),
        );
        o.insert(
            "anchor".into(),
            json!(if dec.start.is_some() {
                "start-on"
            } else {
                "auto"
            }),
        );
        o.insert(
            "anchorDate".into(),
            json!(dec.start.clone().unwrap_or_default()),
        );
        match at {
            Some(i) => tasks[i] = Value::Object(o),
            None => tasks.push(Value::Object(o)),
        }
    }
    top.insert("tasks".into(), Value::Array(tasks));
    serde_json::to_string_pretty(&Value::Object(top)).unwrap_or_default() + "\n"
}

#[cfg(test)]
mod plan_tests {
    use super::*;

    #[test]
    fn calendar_and_plan_round_trip_and_keep_what_shipyard_does_not_own() {
        let cal = calendar_from_json(
            r#"{"version":1,"workingDays":[1,2,3],"holidays":[{"date":"2026-12-24","name":"Bridge"}]}"#,
        );
        assert_eq!(cal.working_days, [1, 2, 3]);
        assert_eq!(cal.holidays, ["2026-12-24"]);
        let out = calendar_json(
            &cal,
            Some(r#"{"holidays":[{"date":"2026-12-24","name":"Bridge"}]}"#),
        );
        assert!(out.contains("Bridge"));
        assert_eq!(calendar_from_json("{").working_days, [1, 2, 3, 4, 5]);

        let old = r#"{"version":1,"tasks":[{"taskId":"T1","memberIds":["ada","bob"],"anchor":"start-on","anchorDate":"2026-11-02","durationDays":4,"alsoAfter":[],"note":"keep"},{"taskId":"zz","memberIds":["ada"]}]}"#;
        let d = decisions_from_json(old, |id| (id == "t1").then(|| "app".to_string()));
        assert_eq!(d.order, ["est:app#t1"]);
        assert_eq!(d.tasks["est:app#t1"].start.as_deref(), Some("2026-11-02"));
        assert_eq!(d.tasks["est:app#t1"].member.as_deref(), Some("ada"));
        let mut d2 = d.clone();
        d2.tasks.get_mut("est:app#t1").unwrap().start = None;
        let back: Value = serde_json::from_str(&plan_json(&d2, Some(old))).unwrap();
        assert_eq!(back["tasks"][0]["note"], "keep");
        assert_eq!(back["tasks"][0]["durationDays"], 4);
        assert_eq!(back["tasks"][0]["anchor"], "auto");
        // A task that the decisions do not name loses only its member and pin.
        assert_eq!(back["tasks"][1]["memberIds"], json!([]));
    }
}
