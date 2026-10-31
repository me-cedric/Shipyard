//! Test plans from spec requirements: one scenario for each requirement that no scenario cites and
//! that holds the text of a scenario, and the view of each requirement with the scenarios that
//! cover it.

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
    /// The requirement holds the text of a scenario: a generation can build the steps from it.
    pub detailed: bool,
}

/// The Given, When and Then lines of the first scenario that a requirement holds in its own text
/// (`- **WHEN** a person asks`), as Gherkin steps. `line` is the line of its heading, from 1. Empty
/// without a When and a Then: a scenario of filler words would say nothing.
fn steps(text: &str, line: u32) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for l in text
        .lines()
        .skip(line as usize)
        .take_while(|l| !l.starts_with("### "))
    {
        if l.starts_with("####") && !out.is_empty() {
            break;
        }
        let plain = l.replace("**", "");
        let Some((word, rest)) = plain.trim().trim_start_matches('-').trim().split_once(' ') else {
            continue;
        };
        let keyword = match word {
            "GIVEN" => "Given",
            "WHEN" => "When",
            "THEN" => "Then",
            "AND" if !out.is_empty() => "And",
            _ => continue,
        };
        out.push(format!("    {keyword} {}", rest.trim()));
    }
    let has = |k: &str| out.iter().any(|l| l.trim_start().starts_with(k));
    if has("When") && has("Then") {
        out
    } else {
        Vec::new()
    }
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
                detailed: !steps(&text, req.line).is_empty(),
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

/// The plan that a generation wrote and the number of scenarios that it added.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct GeneratedPlan {
    pub path: String,
    pub added: u32,
}

/// Adds one scenario for each requirement of the capability that no scenario cites and that holds
/// the text of a scenario, to `<test-plans>/<capability>.feature`. The steps are the ones of the
/// requirement. A requirement with no such text gets none. An existing plan keeps its text. After
/// a click only.
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
    let mut scenarios = String::new();
    let mut added = 0;
    for reference in &missing {
        let hit = texts
            .iter()
            .filter(|(c, _)| c == capability)
            .flat_map(|(c, t)| {
                req_refs(c, t)
                    .into_iter()
                    .zip(requirements(t))
                    .map(move |(r, req)| (r, steps(t, req.line), req.title))
            })
            .find(|(r, lines, _)| r == reference && !lines.is_empty());
        let Some((_, lines, title)) = hit else {
            continue;
        };
        scenarios.push_str(&format!(
            "\n  @{reference}\n  Scenario: {title}\n{}\n",
            lines.join("\n")
        ));
        added += 1;
    }
    if added == 0 {
        return Ok(GeneratedPlan { path, added: 0 });
    }
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
    text.push_str(&scenarios);
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
    Ok(GeneratedPlan { path, added })
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
    fn a_generation_builds_the_steps_from_the_requirement_and_skips_one_with_no_such_text() {
        let f = fx();
        let spec = f.repo.path().join("docs/openspec/specs/auth/spec.md");
        std::fs::create_dir_all(spec.parent().unwrap()).unwrap();
        std::fs::write(
            &spec,
            "# Spec: auth\n\n### Requirement: REQ-001 Login\n\nText.\n\n#### Scenario: Login\n\n- **GIVEN** a registered person\n- **WHEN** they enter the right password\n- **THEN** they see their home\n- **AND** a session starts\n\n### Requirement: REQ-002 Logout\n\nText.\n\n### Requirement: REQ-003 Lock\n\n- **WHEN** the password fails 5 times\n- **THEN** the account locks\n",
        )
        .unwrap();
        assert!(generate(&f.s, "auth", false).is_err());
        assert!(generate(&f.s, "../x", true).is_err());
        let rows = requirement_rows(&f.s).unwrap();
        let detailed: Vec<bool> = rows.iter().map(|r| r.detailed).collect();
        assert_eq!(detailed, [true, false, true]);
        let g = generate(&f.s, "auth", true).unwrap();
        assert_eq!(
            (g.path.as_str(), g.added),
            ("docs/delivery/test-plans/auth.feature", 2)
        );
        let plan = std::fs::read_to_string(f.repo.path().join(&g.path)).unwrap();
        assert!(plan.contains("    Given a registered person\n    When they enter the right password\n    Then they see their home\n    And a session starts\n"), "{plan}");
        assert!(
            plan.contains("    When the password fails 5 times\n    Then the account locks\n"),
            "{plan}"
        );
        // No filler, and no scenario for the requirement that has no text of one.
        assert!(!plan.contains("the context of the requirement"), "{plan}");
        assert!(!plan.contains("Logout"), "{plan}");
        let rows = requirement_rows(&f.s).unwrap();
        assert_eq!(rows[0].scenarios[0].scenario, "Login");
        assert!(rows[1].scenarios.is_empty());
        assert_eq!(generate(&f.s, "auth", true).unwrap().added, 0);
    }
}
