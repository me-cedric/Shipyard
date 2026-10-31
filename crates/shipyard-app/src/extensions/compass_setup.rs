//! The compass setup (spec `extensions`): the external skill sources (`upstream` in compass) with
//! their drift, refresh and reinstall; the contract install; the objectives, each one a set of
//! compass assets. Every call goes through the `ac` tool of the pinned tree. A write needs a click
//! and a project that is not read only.

use std::path::Path;

use serde::Serialize;
use serde_json::Value;
use shipyard_core::extensions::{WriteReport, safe_rel};
use shipyard_store::compass::{Compass, read};
use specta::Type;
use tauri::AppHandle;

use super::compass::{Applied, ac, apply};
use super::root;
use crate::commands::{Api, Res, blocking, err};
use crate::work::need_click;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ExternalState {
    /// The source is not switched on.
    Off,
    Current,
    /// A sync would create, update or remove files of the source.
    Drift,
    /// A person edited files of the source: a sync keeps them.
    Edited,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ExternalSource {
    pub id: String,
    pub description: String,
    pub recommended: bool,
    pub available: bool,
    pub skills: Vec<String>,
    /// The files that a sync would change.
    pub changed: Vec<String>,
    /// The files that a person edited.
    pub edited: Vec<String>,
    pub state: ExternalState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Objective {
    pub id: String,
    /// The assets of the objective, as `kind:id`.
    pub assets: Vec<String>,
    /// The assets that are on.
    pub on: Vec<String>,
    /// The assets that do not fit this project.
    pub unavailable: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ObjectiveApplied {
    pub report: WriteReport,
    /// The assets that were not switched on, as `kind:id`.
    pub skipped: Vec<String>,
}

/// The objectives and their assets. `recommended` is the recommended set of compass.
const OBJECTIVES: [(&str, &[&str]); 7] = [
    ("recommended", &[]),
    (
        "quality",
        &[
            "skill:review",
            "skill:ci-triage",
            "skill:debug",
            "skill:harness-loop",
            "pack:security",
            "pack:e2e",
        ],
    ),
    (
        "specs",
        &[
            "skill:spec-flow",
            "skill:task-flow",
            "skill:grill",
            "skill:remaining-work",
            "upstream:mattpocock",
        ],
    ),
    (
        "architecture",
        &[
            "skill:adr",
            "skill:architecture-advisor",
            "skill:impact-analysis",
            "skill:api-contract-sync",
        ],
    ),
    (
        "frontend",
        &[
            "skill:design-taste-skills",
            "skill:ui-conformance",
            "upstream:taste",
            "upstream:playwright-cli",
            "mcp:playwright",
        ],
    ),
    (
        "mobile",
        &[
            "skill:native-mobile-skills",
            "upstream:expo",
            "upstream:android",
            "upstream:dimillian",
            "upstream:agent-device",
        ],
    ),
    (
        "devops",
        &[
            "pack:ci-github",
            "pack:local-run",
            "pack:env",
            "upstream:devops-security",
            "mcp:kubernetes",
            "mcp:grafana",
        ],
    ),
];

fn list(v: &Value) -> &[Value] {
    v.as_array().map_or(&[], Vec::as_slice)
}

fn text(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or_default().to_string()
}

fn key_of(a: &Value) -> String {
    format!("{}:{}", text(a, "kind"), text(a, "id"))
}

/// The skill folder that a path of a sync change is in: `<any>/skills/<id>/...`.
fn skill_of(path: &str) -> Option<&str> {
    let parts: Vec<&str> = path.split('/').collect();
    parts.windows(3).find(|w| w[0] == "skills").map(|w| w[1])
}

/// The sources of `ac assets --json`, with the changes of `ac check --json`.
pub fn external_of(assets: &Value, check: &Value) -> Vec<ExternalSource> {
    let all = list(&assets["assets"]);
    let changes = list(&check["changes"]);
    all.iter()
        .filter(|a| a["kind"] == "upstream")
        .map(|a| {
            let id = text(a, "id");
            let source = format!("upstream:{id}");
            let skills: Vec<String> = all
                .iter()
                .filter(|s| s["kind"] == "skill" && s["source"] == source.as_str())
                .map(|s| text(s, "id"))
                .collect();
            let (mut changed, mut edited) = (Vec::new(), Vec::new());
            for c in changes {
                let path = text(c, "path");
                if !skill_of(&path).is_some_and(|s| skills.iter().any(|k| k == s)) {
                    continue;
                }
                match c["action"].as_str() {
                    Some("kept") => edited.push(path),
                    Some("create" | "update" | "remove" | "release") => changed.push(path),
                    _ => {}
                }
            }
            let on = a["on"].as_bool() == Some(true);
            let state = if !on {
                ExternalState::Off
            } else if !changed.is_empty() {
                ExternalState::Drift
            } else if !edited.is_empty() {
                ExternalState::Edited
            } else {
                ExternalState::Current
            };
            ExternalSource {
                description: text(a, "description"),
                recommended: a["recommended"].as_bool() == Some(true),
                available: a["available"].as_bool() == Some(true),
                id,
                skills,
                changed,
                edited,
                state,
            }
        })
        .collect()
}

/// The objectives against the assets of `ac assets --json`.
pub fn objectives_of(assets: &Value) -> Vec<Objective> {
    let all = list(&assets["assets"]);
    let find = |k: &str| all.iter().find(|a| key_of(a) == k);
    OBJECTIVES
        .iter()
        .map(|(id, keys)| {
            let assets: Vec<String> = if keys.is_empty() {
                all.iter()
                    .filter(|a| a["recommended"].as_bool() == Some(true))
                    .filter(|a| {
                        matches!(
                            a["kind"].as_str(),
                            Some("skill" | "pack" | "upstream" | "mcp" | "plugin" | "agent")
                        )
                    })
                    .map(key_of)
                    .collect()
            } else {
                keys.iter().map(|k| k.to_string()).collect()
            };
            let on = assets
                .iter()
                .filter(|k| find(k).is_some_and(|a| a["on"].as_bool() == Some(true)))
                .cloned()
                .collect();
            let unavailable = assets
                .iter()
                .filter(|k| find(k).is_none_or(|a| a["available"].as_bool() != Some(true)))
                .cloned()
                .collect();
            Objective {
                id: id.to_string(),
                assets,
                on,
                unavailable,
            }
        })
        .collect()
}

fn compass(root: &Path) -> Res<Compass> {
    read(root)
        .map_err(err)?
        .ok_or_else(|| "no compass is pinned".into())
}

fn assets(root: &Path, c: &Compass) -> Res<Value> {
    ac(root, &c.tree, root, &["assets"])
}

/// The files that a sync answer names.
fn report_of(done: &Value) -> WriteReport {
    let mut report = WriteReport::default();
    for ch in list(&done["changes"]) {
        let path = text(ch, "path");
        match ch["action"].as_str() {
            Some("create" | "update") => report.written.push(path),
            Some("kept") => report.kept.push(path),
            _ => {}
        }
    }
    report
}

pub fn external(root: &Path) -> Res<Vec<ExternalSource>> {
    let c = compass(root)?;
    let check = ac(root, &c.tree, root, &["check"])?;
    Ok(external_of(&assets(root, &c)?, &check))
}

/// Puts back the files of one source: the edited files go, then a sync writes them again.
pub fn reinstall(root: &Path, id: &str) -> Res<Applied> {
    let source = external(root)?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("unknown entry: {id}"))?;
    let c = compass(root)?;
    if source.state == ExternalState::Off {
        ac(
            root,
            &c.tree,
            root,
            &["assets", "on", &format!("upstream:{id}")],
        )?;
    }
    for path in &source.edited {
        if !safe_rel(path) {
            return Err(format!("path not allowed: {path}"));
        }
        let file = root.join(path);
        // Only a plain file goes: a link or a folder stays.
        if file.symlink_metadata().is_ok_and(|m| m.is_file()) {
            std::fs::remove_file(&file).map_err(err)?;
        }
    }
    apply(root, &[])
}

/// The contract and the compass files: `ac init` for a project with no compass settings, else a sync.
pub fn contract_install(root: &Path) -> Res<Applied> {
    let c = compass(root)?;
    if root.join(".agents/compass.json").is_file() {
        return apply(root, &[]);
    }
    let done = ac(root, &c.tree, root, &["init"])?;
    Ok(Applied {
        report: report_of(&done),
        version: compass(root)?.version,
    })
}

/// Switches on the assets of one objective that fit the project, then syncs.
pub fn objective_apply(root: &Path, id: &str) -> Res<ObjectiveApplied> {
    let c = compass(root)?;
    let goal = objectives_of(&assets(root, &c)?)
        .into_iter()
        .find(|o| o.id == id)
        .ok_or_else(|| format!("unknown entry: {id}"))?;
    if goal.id == "recommended" {
        ac(root, &c.tree, root, &["assets", "recommended"])?;
    } else {
        for k in goal
            .assets
            .iter()
            .filter(|k| !goal.on.contains(k) && !goal.unavailable.contains(k))
        {
            ac(root, &c.tree, root, &["assets", "on", k])?;
        }
    }
    Ok(ObjectiveApplied {
        report: apply(root, &[])?.report,
        skipped: goal.unavailable,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn compass_external(app: AppHandle) -> Api<Vec<ExternalSource>> {
    blocking(app, |s| external(&root(s)?)).await
}

/// Fetches the external sources again and syncs the project.
#[tauri::command]
#[specta::specta]
pub async fn compass_external_refresh(app: AppHandle, click: bool) -> Api<Applied> {
    blocking(app, move |s| {
        need_click(s, click)?;
        apply(&root(s)?, &[])
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn compass_external_reinstall(app: AppHandle, id: String, click: bool) -> Api<Applied> {
    blocking(app, move |s| {
        need_click(s, click)?;
        reinstall(&root(s)?, &id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn compass_contract_install(app: AppHandle, click: bool) -> Api<Applied> {
    blocking(app, move |s| {
        need_click(s, click)?;
        contract_install(&root(s)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn compass_objectives(app: AppHandle) -> Api<Vec<Objective>> {
    blocking(app, |s| {
        let r = root(s)?;
        Ok(objectives_of(&assets(&r, &compass(&r)?)?))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn compass_objective_apply(
    app: AppHandle,
    id: String,
    click: bool,
) -> Api<ObjectiveApplied> {
    blocking(app, move |s| {
        need_click(s, click)?;
        objective_apply(&root(s)?, &id)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn assets() -> Value {
        json!({ "assets": [
            { "kind": "upstream", "id": "taste", "description": "2 skills", "on": true,
              "available": true, "recommended": true },
            { "kind": "upstream", "id": "expo", "description": "23 skills", "on": false,
              "available": false, "recommended": false },
            { "kind": "upstream", "id": "gtk", "on": true, "available": true },
            { "kind": "skill", "id": "taste-skill", "source": "upstream:taste", "on": true },
            { "kind": "skill", "id": "gtk-review", "source": "upstream:gtk", "on": true },
            { "kind": "skill", "id": "review", "source": "compass", "on": true,
              "available": true, "recommended": true },
            { "kind": "skill", "id": "debug", "source": "compass", "on": false,
              "available": true, "recommended": true },
            { "kind": "file", "id": "AGENTS.md", "on": true, "recommended": true },
        ]})
    }

    #[test]
    fn a_source_shows_its_drift_and_its_edits() {
        let check = json!({ "changes": [
            { "action": "update", "path": ".claude/skills/taste-skill/SKILL.md" },
            { "action": "kept", "path": ".agents/skills/taste-skill/notes.md" },
            { "action": "kept", "path": ".agents/skills/gtk-review/SKILL.md" },
            { "action": "create", "path": ".agents/skills/review/SKILL.md" },
        ]});
        let s = external_of(&assets(), &check);
        assert_eq!(s.len(), 3);
        assert_eq!(s[0].state, ExternalState::Drift);
        assert_eq!(s[0].changed, vec![".claude/skills/taste-skill/SKILL.md"]);
        assert_eq!(s[0].edited, vec![".agents/skills/taste-skill/notes.md"]);
        assert_eq!(s[1].state, ExternalState::Off);
        assert_eq!(s[2].state, ExternalState::Edited);
        let clean = external_of(&assets(), &json!({ "changes": [] }));
        assert_eq!(clean[0].state, ExternalState::Current);
    }

    #[test]
    fn an_objective_counts_its_assets_on_and_the_ones_that_do_not_fit() {
        let o = objectives_of(&assets());
        let rec = o.iter().find(|o| o.id == "recommended").unwrap();
        assert_eq!(
            rec.assets,
            vec!["upstream:taste", "skill:review", "skill:debug"]
        );
        assert_eq!(rec.on, vec!["upstream:taste", "skill:review"]);
        let q = o.iter().find(|o| o.id == "quality").unwrap();
        assert_eq!(q.on, vec!["skill:review"]);
        // `skill:ci-triage` is not in the list: it does not fit.
        assert!(q.unavailable.contains(&"skill:ci-triage".to_string()));
        assert!(!q.unavailable.contains(&"skill:debug".to_string()));
        assert_eq!(skill_of(".claude/skills/a/b/c.md"), Some("a"));
        assert_eq!(skill_of("AGENTS.md"), None);
    }
}
