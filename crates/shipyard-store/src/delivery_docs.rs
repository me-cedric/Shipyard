//! The Legacy delivery files, read and written in place (Q-106): the personas
//! (`docs/personas/personas.json`), the work split by profile (`docs/delivery/assignments.json`,
//! read only) and the tickets config (`docs/delivery/tickets.config.json`).
//!
//! A save merges into the file that exists, so a key that Shipyard does not own stays. JSON keys
//! come out sorted (Q-103). Sources: Legacy `src/lib/personas.ts`, `src/lib/delivery.ts`,
//! `src/lib/tickets/model.ts`.

use std::fs;
use std::path::Path;

use serde::Serialize;
use serde_json::{Map, Value, json};
use specta::Type;

use crate::{Result, project::write_atomic};

pub const PERSONAS: &str = "docs/personas/personas.json";
pub const ASSIGNMENTS: &str = "docs/delivery/assignments.json";
pub const TICKETS_CONFIG: &str = "docs/delivery/tickets.config.json";
pub const TICKETS: &str = "docs/delivery/tickets.json";
pub const IMPACT_NOTES: &str = "docs/delivery/impacts";
const MAX_BYTES: u64 = 2 * 1024 * 1024;

fn read(root: &Path, rel: &str) -> Option<Value> {
    let path = root.join(rel);
    let meta = fs::symlink_metadata(&path).ok()?;
    if !meta.is_file() || meta.len() > MAX_BYTES {
        return None;
    }
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

fn write(root: &Path, rel: &str, v: &Value) -> Result<()> {
    let path = root.join(rel);
    // A symlink in the way is refused: a write must stay in the project.
    if fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err(format!("{rel} is a symlink").into());
    }
    write_atomic(&path, (serde_json::to_string_pretty(v)? + "\n").as_bytes())
}

fn str_of(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or("").to_string()
}

fn num_of(v: &Value, k: &str) -> f64 {
    v.get(k)
        .and_then(Value::as_f64)
        .filter(|n| n.is_finite())
        .unwrap_or(0.0)
}

fn strs(v: &Value, k: &str) -> Vec<String> {
    v.get(k)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn list<'a>(v: &'a Value, k: &str) -> &'a [Value] {
    v.get(k)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

// ---------------------------------------------------------------- personas

#[derive(Debug, Clone, PartialEq, Serialize, serde::Deserialize, Type)]
pub struct Persona {
    pub id: String,
    pub name: String,
    pub description: String,
    /// The sale daily rate.
    pub tjm: f64,
    /// The internal daily cost.
    pub cjm: f64,
    pub username: String,
    pub active: bool,
}

/// The personas of the project. A missing or bad file gives none.
pub fn personas(root: &Path) -> Vec<Persona> {
    let Some(v) = read(root, PERSONAS) else {
        return Vec::new();
    };
    list(&v, "personas")
        .iter()
        .map(|p| Persona {
            id: str_of(p, "id"),
            name: str_of(p, "name"),
            description: str_of(p, "description"),
            tjm: num_of(p, "tjm"),
            cjm: num_of(p, "cjm"),
            username: str_of(p, "username"),
            active: p.get("active").and_then(Value::as_bool) != Some(false),
        })
        .collect()
}

/// Saves the personas. A persona with the same id keeps the keys that this module does not own.
/// An empty id or name, a duplicate id and a negative rate are refused.
pub fn save_personas(root: &Path, list_in: &[Persona]) -> Result<()> {
    let mut seen = std::collections::BTreeSet::new();
    for p in list_in {
        if p.id.trim().is_empty() || p.name.trim().is_empty() {
            return Err("a persona needs an id and a name".into());
        }
        if !seen.insert(p.id.as_str()) {
            return Err(format!("two personas have the id {}", p.id).into());
        }
        if p.tjm < 0.0 || p.cjm < 0.0 || !p.tjm.is_finite() || !p.cjm.is_finite() {
            return Err(format!("the rates of {} must be zero or more", p.name).into());
        }
    }
    let old = read(root, PERSONAS).unwrap_or(Value::Null);
    let mut top: Map<String, Value> = old.as_object().cloned().unwrap_or_default();
    top.entry("version").or_insert(json!(1));
    let rows: Vec<Value> = list_in
        .iter()
        .map(|p| {
            let prev = list(&old, "personas")
                .iter()
                .find(|x| str_of(x, "id") == p.id);
            let mut o: Map<String, Value> =
                prev.and_then(Value::as_object).cloned().unwrap_or_default();
            o.insert("id".into(), json!(p.id));
            o.insert("name".into(), json!(p.name.trim()));
            o.insert("description".into(), json!(p.description));
            o.insert("tjm".into(), json!(p.tjm));
            o.insert("cjm".into(), json!(p.cjm));
            o.insert("username".into(), json!(p.username));
            o.insert("active".into(), json!(p.active));
            Value::Object(o)
        })
        .collect();
    top.insert("personas".into(), Value::Array(rows));
    write(root, PERSONAS, &Value::Object(top))
}

// ---------------------------------------------------------------- assignments

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssignmentItem {
    pub id: String,
    pub title: String,
    pub why: String,
    pub first_steps: Vec<String>,
    pub spec_ref: String,
    pub mandays: f64,
    /// The `what` of a gate, or empty.
    pub gate: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct AssignmentSeam {
    pub with: String,
    pub contract: String,
    pub rule: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssignmentGate {
    pub what: String,
    pub blocks: Vec<String>,
    pub unblocked_by: String,
    pub approver: String,
}

/// The scope of one profile.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Assignment {
    pub persona_id: String,
    pub persona_name: String,
    pub scope: Vec<String>,
    pub brief: String,
    pub items: Vec<AssignmentItem>,
    pub seams: Vec<AssignmentSeam>,
    pub mandays: f64,
    /// The man-days at the sale rate of the persona. Zero when the persona has no rate.
    pub cost: f64,
    /// The text that a lead pastes into a chat or a ticket.
    pub brief_text: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Assignments {
    pub generated_at: String,
    pub assignments: Vec<Assignment>,
    pub gates: Vec<AssignmentGate>,
    pub overlap_risk: String,
}

fn brief_text(a: &Assignment, gates: &[AssignmentGate]) -> String {
    let mut out = vec![format!("# {}", a.persona_name), String::new()];
    if !a.brief.is_empty() {
        out.extend([a.brief.clone(), String::new()]);
    }
    if !a.scope.is_empty() {
        out.extend([format!("Scope: {}", a.scope.join(", ")), String::new()]);
    }
    for i in &a.items {
        let days = if i.mandays > 0.0 {
            format!(" - {}d", i.mandays)
        } else {
            String::new()
        };
        out.push(format!("## {}. {}{days}", i.id, i.title));
        if !i.why.is_empty() {
            out.push(i.why.clone());
        }
        out.extend(i.first_steps.iter().map(|s| format!("- {s}")));
        if let Some(g) = gates
            .iter()
            .find(|g| !i.gate.is_empty() && g.what == i.gate)
        {
            let by = if g.unblocked_by.is_empty() {
                "?"
            } else {
                &g.unblocked_by
            };
            out.push(format!("> Blocked by: {} - unblocked by {by}", g.what));
        }
        out.push(String::new());
    }
    if !a.seams.is_empty() {
        out.push("## Coordination".into());
        for s in &a.seams {
            let rule = if s.rule.is_empty() {
                String::new()
            } else {
                format!(" ({})", s.rule)
            };
            out.push(format!("- with {}: {}{rule}", s.with, s.contract));
        }
    }
    out.join("\n").trim().to_string() + "\n"
}

/// The work split by profile. A missing or bad file gives an empty document. The cost uses the
/// sale rate of the persona of each profile.
pub fn assignments(root: &Path) -> Assignments {
    let Some(v) = read(root, ASSIGNMENTS) else {
        return Assignments::default();
    };
    let rates: std::collections::BTreeMap<String, f64> =
        personas(root).into_iter().map(|p| (p.id, p.tjm)).collect();
    let gates: Vec<AssignmentGate> = list(&v, "gates")
        .iter()
        .map(|g| AssignmentGate {
            what: str_of(g, "what"),
            blocks: strs(g, "blocks"),
            unblocked_by: str_of(g, "unblockedBy"),
            approver: str_of(g, "approver"),
        })
        .collect();
    let rows = list(&v, "assignments")
        .iter()
        .map(|a| {
            let items: Vec<AssignmentItem> = list(a, "items")
                .iter()
                .enumerate()
                .map(|(n, i)| AssignmentItem {
                    id: Some(str_of(i, "id"))
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| format!("A{}", n + 1)),
                    title: str_of(i, "title"),
                    why: str_of(i, "why"),
                    first_steps: strs(i, "firstSteps"),
                    spec_ref: str_of(i, "specRef"),
                    mandays: num_of(i, "mandays"),
                    gate: str_of(i, "gate"),
                })
                .collect();
            let mandays: f64 = items.iter().map(|i| i.mandays).sum();
            let persona_id = str_of(a, "personaId");
            let mut out = Assignment {
                cost: mandays * rates.get(&persona_id).copied().unwrap_or(0.0),
                persona_id,
                persona_name: str_of(a, "personaName"),
                scope: strs(a, "scope"),
                brief: str_of(a, "brief"),
                seams: list(a, "seams")
                    .iter()
                    .map(|s| AssignmentSeam {
                        with: str_of(s, "with"),
                        contract: str_of(s, "contract"),
                        rule: str_of(s, "rule"),
                    })
                    .collect(),
                items,
                mandays,
                brief_text: String::new(),
            };
            out.brief_text = brief_text(&out, &gates);
            out
        })
        .collect();
    Assignments {
        generated_at: str_of(&v, "generatedAt"),
        assignments: rows,
        gates,
        overlap_risk: str_of(&v, "overlapRisk"),
    }
}

// ---------------------------------------------------------------- tickets config

#[derive(Debug, Clone, PartialEq, Serialize, serde::Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TicketsConfig {
    pub epic: String,
    pub story: String,
    pub task: String,
    pub subtask: String,
    /// `timetracking`, `points` or `none`.
    pub estimate_mode: String,
    pub estimate_field: String,
    pub hours_per_day: f64,
    pub labels: Vec<String>,
    pub spec_base_url: String,
    /// `feature` or `group`.
    pub hierarchy: String,
}

impl Default for TicketsConfig {
    /// The defaults of Legacy `src/lib/tickets/model.ts`.
    fn default() -> Self {
        Self {
            epic: "Epic".into(),
            story: "Story".into(),
            task: "Task".into(),
            subtask: "Sub-task".into(),
            estimate_mode: "timetracking".into(),
            estimate_field: String::new(),
            hours_per_day: 7.0,
            labels: Vec::new(),
            spec_base_url: String::new(),
            hierarchy: "feature".into(),
        }
    }
}

/// The tickets config, with the defaults for a key that the file lacks.
pub fn tickets_config(root: &Path) -> TicketsConfig {
    let d = TicketsConfig::default();
    let Some(v) = read(root, TICKETS_CONFIG) else {
        return d;
    };
    let ty = |k: &str, fallback: &str| {
        Some(
            v.pointer(&format!("/issueTypes/{k}"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        )
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback.into())
    };
    let mode = v
        .pointer("/estimate/mode")
        .and_then(Value::as_str)
        .unwrap_or("");
    let hours = num_of(&v, "hoursPerDay");
    TicketsConfig {
        epic: ty("epic", &d.epic),
        story: ty("story", &d.story),
        task: ty("task", &d.task),
        subtask: ty("subtask", &d.subtask),
        estimate_mode: if ["timetracking", "points", "none"].contains(&mode) {
            mode.into()
        } else {
            d.estimate_mode
        },
        estimate_field: v
            .pointer("/estimate/fieldId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .into(),
        hours_per_day: if hours > 0.0 { hours } else { d.hours_per_day },
        labels: strs(&v, "labels"),
        spec_base_url: str_of(&v, "specBaseUrl"),
        hierarchy: if str_of(&v, "hierarchy") == "group" {
            "group".into()
        } else {
            d.hierarchy
        },
    }
}

/// Saves the config. It keeps the other keys of the file (site, cloudId, projectKey, ade). The
/// issue types and the mode and the hierarchy must be valid, and the hours per day must be
/// between 1 and 24.
pub fn save_tickets_config(root: &Path, c: &TicketsConfig) -> Result<()> {
    if [&c.epic, &c.story, &c.task, &c.subtask]
        .iter()
        .any(|t| t.trim().is_empty())
    {
        return Err("each issue type needs a name".into());
    }
    if !["timetracking", "points", "none"].contains(&c.estimate_mode.as_str()) {
        return Err(format!("unknown estimate mode: {}", c.estimate_mode).into());
    }
    if !["feature", "group"].contains(&c.hierarchy.as_str()) {
        return Err(format!("unknown hierarchy: {}", c.hierarchy).into());
    }
    if !(c.hours_per_day >= 1.0 && c.hours_per_day <= 24.0) {
        return Err("the hours per day must be between 1 and 24".into());
    }
    let url = c.spec_base_url.trim();
    if !url.is_empty() && !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("the spec base URL must start with http:// or https://".into());
    }
    let old = read(root, TICKETS_CONFIG).unwrap_or(Value::Null);
    let mut top: Map<String, Value> = old.as_object().cloned().unwrap_or_default();
    top.entry("version").or_insert(json!(1));
    top.insert(
        "issueTypes".into(),
        json!({"epic": c.epic.trim(), "story": c.story.trim(), "task": c.task.trim(), "subtask": c.subtask.trim()}),
    );
    top.insert(
        "estimate".into(),
        json!({"mode": c.estimate_mode, "fieldId": c.estimate_field.trim()}),
    );
    top.insert("hoursPerDay".into(), json!(c.hours_per_day));
    let labels: Vec<&str> = c
        .labels
        .iter()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();
    top.insert("labels".into(), json!(labels));
    top.insert("specBaseUrl".into(), json!(url));
    top.insert("hierarchy".into(), json!(c.hierarchy));
    write(root, TICKETS_CONFIG, &Value::Object(top))
}

// ---------------------------------------------------------------- tickets registry

/// The link of a Legacy ticket to its Jira issue (`docs/delivery/tickets.json`, read only).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TicketLink {
    /// The Legacy key of the ticket.
    pub key: String,
    /// The Jira key, empty before the first write.
    pub issue_key: String,
    pub level: String,
    pub state: String,
    pub spec_ref: String,
}

/// The links of `tickets.json`, sorted by Legacy key. Legacy source: `src/lib/tickets/store.ts`
/// `parseRegistry`. A missing or broken file gives none.
pub fn ticket_links(root: &Path) -> Vec<TicketLink> {
    let Some(v) = read(root, TICKETS) else {
        return Vec::new();
    };
    let mut out: Vec<TicketLink> = v
        .get("entries")
        .and_then(Value::as_object)
        .map(|m| {
            m.iter()
                .map(|(key, e)| TicketLink {
                    key: key.clone(),
                    issue_key: str_of(e, "issueKey"),
                    level: str_of(e, "level"),
                    state: str_of(e, "state"),
                    spec_ref: str_of(e, "specRef"),
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| a.key.cmp(&b.key));
    out
}

// ---------------------------------------------------------------- delivery notes

/// One note of `docs/delivery/impacts`: the title, date, base and audience of its front matter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct DeliveryNote {
    pub path: String,
    pub title: String,
    pub date: String,
    pub base: String,
    pub audience: String,
}

fn front(text: &str, key: &str) -> String {
    let Some(rest) = text.strip_prefix("---\n") else {
        return String::new();
    };
    let head = rest.split("\n---").next().unwrap_or("");
    head.lines()
        .find_map(|l| l.strip_prefix(key)?.strip_prefix(':'))
        .map(|v| v.trim().trim_matches('"').to_string())
        .unwrap_or_default()
}

/// The notes of `docs/delivery/impacts`, newest first. The title comes from the front matter,
/// else the first heading, else the file name. Legacy source: `infrastructure/delivery.rs`
/// `list_notes`.
pub fn delivery_notes(root: &Path) -> Vec<DeliveryNote> {
    let Ok(dir) = fs::read_dir(root.join(IMPACT_NOTES)) else {
        return Vec::new();
    };
    let mut out: Vec<DeliveryNote> = dir
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let meta = e.metadata().ok()?;
            if !name.ends_with(".md") || !meta.is_file() || meta.len() > MAX_BYTES {
                return None;
            }
            let text = fs::read_to_string(e.path()).ok()?;
            let title = Some(front(&text, "title"))
                .filter(|t| !t.is_empty())
                .or_else(|| {
                    text.lines()
                        .find_map(|l| l.strip_prefix("# ").map(|h| h.trim().to_string()))
                })
                .unwrap_or_else(|| name.clone());
            Some(DeliveryNote {
                path: format!("{IMPACT_NOTES}/{name}"),
                title,
                date: front(&text, "date"),
                base: front(&text, "base"),
                audience: front(&text, "audience"),
            })
        })
        .collect();
    out.sort_by(|a, b| b.date.cmp(&a.date).then(a.path.cmp(&b.path)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    #[test]
    fn personas_are_read_and_a_save_keeps_the_other_keys() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(personas(root).is_empty());
        put(
            root,
            PERSONAS,
            r#"{"version":1,"x":1,"personas":[{"id":"p1","name":"Dev","tjm":500,"extra":true,"active":false}]}"#,
        );
        let mut all = personas(root);
        assert_eq!((all[0].tjm, all[0].cjm, all[0].active), (500.0, 0.0, false));
        all[0].tjm = 520.0;
        all.push(Persona {
            id: "p2".into(),
            name: "QA".into(),
            description: String::new(),
            tjm: 400.0,
            cjm: 300.0,
            username: String::new(),
            active: true,
        });
        save_personas(root, &all).unwrap();
        let text = fs::read_to_string(root.join(PERSONAS)).unwrap();
        assert!(text.contains("\"extra\": true") && text.contains("\"x\": 1"));
        assert_eq!(personas(root).len(), 2);
        all[1].id = "p1".into();
        assert!(save_personas(root, &all).is_err(), "duplicate id");
        all[1].id = "p2".into();
        all[1].tjm = -1.0;
        assert!(save_personas(root, &all).is_err(), "negative rate");
        all[1].tjm = 1.0;
        all[1].name = " ".into();
        assert!(save_personas(root, &all).is_err(), "empty name");
    }

    #[test]
    fn assignments_give_the_days_the_cost_and_a_brief() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert_eq!(assignments(root), Assignments::default());
        put(
            root,
            PERSONAS,
            r#"{"personas":[{"id":"p1","name":"Dev","tjm":500}]}"#,
        );
        put(
            root,
            ASSIGNMENTS,
            r#"{"version":1,"overlapRisk":"low","gates":[{"what":"Keys","blocks":["A1"],"unblockedBy":"ops"}],
            "assignments":[{"personaId":"p1","personaName":"Dev","scope":["src/"],"brief":"Build it",
            "items":[{"id":"A1","title":"Login","mandays":2,"firstSteps":["read"],"gate":"Keys"},{"title":"Logout","mandays":1}],
            "seams":[{"with":"QA","contract":"tests","rule":"one writer"}]}]}"#,
        );
        let a = assignments(root);
        let d = &a.assignments[0];
        assert_eq!((d.mandays, d.cost), (3.0, 1500.0));
        assert_eq!(d.items[1].id, "A2");
        assert!(d.brief_text.contains("## A1. Login - 2d"));
        assert!(
            d.brief_text
                .contains("> Blocked by: Keys - unblocked by ops")
        );
        assert!(d.brief_text.contains("- with QA: tests (one writer)"));
        assert_eq!(a.overlap_risk, "low");
        put(root, ASSIGNMENTS, "not json");
        assert!(assignments(root).assignments.is_empty());
    }

    #[test]
    fn the_tickets_config_has_defaults_validates_and_keeps_other_keys() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert_eq!(tickets_config(root), TicketsConfig::default());
        put(
            root,
            TICKETS_CONFIG,
            r#"{"version":1,"projectKey":"demo","site":"s","hoursPerDay":8,"issueTypes":{"epic":"Initiative"},"hierarchy":"group"}"#,
        );
        let mut c = tickets_config(root);
        assert_eq!(
            (c.epic.as_str(), c.story.as_str(), c.hours_per_day),
            ("Initiative", "Story", 8.0)
        );
        assert_eq!(c.hierarchy, "group");
        c.labels = vec![" a ".into(), "".into()];
        c.estimate_mode = "points".into();
        c.estimate_field = "customfield_1".into();
        save_tickets_config(root, &c).unwrap();
        let text = fs::read_to_string(root.join(TICKETS_CONFIG)).unwrap();
        assert!(
            text.contains("\"projectKey\": \"demo\"")
                && text.contains("\"fieldId\": \"customfield_1\"")
        );
        assert_eq!(tickets_config(root).labels, vec!["a".to_string()]);
        for bad in [
            TicketsConfig {
                epic: " ".into(),
                ..c.clone()
            },
            TicketsConfig {
                estimate_mode: "x".into(),
                ..c.clone()
            },
            TicketsConfig {
                hierarchy: "x".into(),
                ..c.clone()
            },
            TicketsConfig {
                hours_per_day: 0.0,
                ..c.clone()
            },
            TicketsConfig {
                spec_base_url: "ftp://x".into(),
                ..c.clone()
            },
        ] {
            assert!(save_tickets_config(root, &bad).is_err());
        }
    }

    #[test]
    fn the_legacy_ticket_links_and_the_delivery_notes_are_read() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(ticket_links(root).is_empty() && delivery_notes(root).is_empty());
        put(
            root,
            TICKETS,
            r#"{"version":1,"entries":{"b":{"issueKey":"K-2","level":"story","state":"synced"},"a":{"issueKey":"K-1","specRef":"s"}}}"#,
        );
        let links = ticket_links(root);
        assert_eq!(
            (links[0].key.as_str(), links[0].issue_key.as_str()),
            ("a", "K-1")
        );
        assert_eq!(links[1].state, "synced");
        put(
            root,
            "docs/delivery/impacts/a.md",
            "---\ntitle: \"Old\"\ndate: 2026-01-01\n---\nx",
        );
        put(root, "docs/delivery/impacts/b.md", "# Heading\n");
        put(root, "docs/delivery/impacts/c.txt", "no");
        let notes = delivery_notes(root);
        assert_eq!(notes.len(), 2);
        assert_eq!(
            (notes[0].title.as_str(), notes[0].date.as_str()),
            ("Old", "2026-01-01")
        );
        assert_eq!(notes[1].title, "Heading");
    }
}
