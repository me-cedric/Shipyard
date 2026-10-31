//! Test plans from spec requirements: one scenario stub for each requirement that no scenario
//! cites, and the view of each requirement with the scenarios that cover it.

use serde::Serialize;
use shipyard_core::specs::requirements;
use specta::Type;
use tauri::AppHandle;

use super::bdd::bdd;
use super::{coverage, project, req_refs, spec_texts};
use crate::commands::{Api, AppState, Res, blocking, err};
use crate::design::{put, read_text};
use crate::work::need_click;

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioHit {
    pub plan: String,
    pub scenario: String,
    pub line: u32,
    /// `pass`, `fail`, `partial`, `blocked` or `not-covered`.
    pub verdict: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RequirementRow {
    pub capability: String,
    /// `spec:<capability>#REQ-NNN`.
    pub reference: String,
    pub title: String,
    /// The scenarios that cite the requirement. Empty: the requirement is not covered.
    pub scenarios: Vec<ScenarioHit>,
}

/// Each requirement of the settled specs and of the changes, with the scenarios that cite it.
pub fn requirement_rows(s: &AppState) -> Res<Vec<RequirementRow>> {
    let p = project(s)?;
    let scenarios = bdd(s)?;
    let mut out: Vec<RequirementRow> = Vec::new();
    for (cap, text) in spec_texts(&p) {
        for (reference, req) in req_refs(&cap, &text).into_iter().zip(requirements(&text)) {
            if out.iter().any(|r| r.reference == reference) {
                continue;
            }
            out.push(RequirementRow {
                capability: cap.clone(),
                title: req.title,
                scenarios: scenarios
                    .iter()
                    .filter(|b| b.refs.contains(&reference))
                    .map(|b| ScenarioHit {
                        plan: b.plan.clone(),
                        scenario: b.scenario.clone(),
                        line: b.line,
                        verdict: b.verdict.clone(),
                    })
                    .collect(),
                reference,
            });
        }
    }
    Ok(out)
}

/// The plan that a generation wrote and the number of stubs that it added.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct GeneratedPlan {
    pub path: String,
    pub added: u32,
}

/// Adds one scenario stub for each requirement of the capability that no scenario cites, to
/// `<test-plans>/<capability>.feature`. An existing plan keeps its text. After a click only.
pub fn generate(s: &AppState, capability: &str, click: bool) -> Res<GeneratedPlan> {
    need_click(s, click)?;
    let p = project(s)?;
    let texts = spec_texts(&p);
    if !texts.iter().any(|(c, _)| c == capability) {
        return Err(format!("no capability {capability}"));
    }
    let path = format!("{}/{capability}.feature", p.file.path("test-plans"));
    let full = p.root.join(&path);
    let missing = coverage(s, capability)?;
    if missing.is_empty() {
        return Ok(GeneratedPlan { path, added: 0 });
    }
    let title = |reference: &str| {
        texts
            .iter()
            .filter(|(c, _)| c == capability)
            .flat_map(|(c, t)| req_refs(c, t).into_iter().zip(requirements(t)))
            .find(|(r, _)| r == reference)
            .map_or_else(String::new, |(_, req)| req.title)
    };
    let existing = full
        .is_file()
        .then(|| read_text(&full, &path))
        .transpose()?;
    let mut text = existing
        .as_ref()
        .map_or_else(|| format!("Feature: {capability}\n"), |t| t.text.clone());
    if !text.ends_with('\n') {
        text.push('\n');
    }
    for reference in &missing {
        text.push_str(&format!(
            "\n  @{reference}\n  Scenario: {}\n    Given the context of the requirement\n    When the user acts\n    Then the requirement holds\n",
            title(reference)
        ));
    }
    if let Some(dir) = full.parent() {
        std::fs::create_dir_all(dir).map_err(err)?;
    }
    let w = put(
        s,
        &full,
        &text,
        existing.as_ref().map(|t| t.stamp.as_str()),
        existing.is_none(),
    )?;
    if w.conflict {
        return Err(format!("{path} changed on disk: read it again"));
    }
    Ok(GeneratedPlan {
        path,
        added: missing.len() as u32,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn specs_requirements(app: AppHandle) -> Api<Vec<RequirementRow>> {
    blocking(app, requirement_rows).await
}

#[tauri::command]
#[specta::specta]
pub async fn specs_testplan_generate(
    app: AppHandle,
    capability: String,
    click: bool,
) -> Api<GeneratedPlan> {
    blocking(app, move |s| generate(s, &capability, click)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work::tests::fx;

    #[test]
    fn a_generation_adds_one_stub_for_each_uncovered_requirement_and_a_second_one_adds_none() {
        let f = fx();
        let spec = f.repo.path().join("docs/openspec/specs/auth/spec.md");
        std::fs::create_dir_all(spec.parent().unwrap()).unwrap();
        std::fs::write(
            &spec,
            "# Spec: auth\n\n### Requirement: REQ-001 Login\n\nText.\n\n### Requirement: REQ-002 Logout\n\nText.\n",
        )
        .unwrap();
        assert!(generate(&f.s, "auth", false).is_err());
        assert!(generate(&f.s, "../x", true).is_err());
        let g = generate(&f.s, "auth", true).unwrap();
        assert_eq!(
            (g.path.as_str(), g.added),
            ("docs/delivery/test-plans/auth.feature", 2)
        );
        let rows = requirement_rows(&f.s).unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.scenarios.len() == 1), "{rows:?}");
        assert_eq!(rows[0].scenarios[0].scenario, "Login");
        assert_eq!(generate(&f.s, "auth", true).unwrap().added, 0);
        assert!(coverage(&f.s, "auth").unwrap().is_empty());
    }
}
