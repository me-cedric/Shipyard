//! The BDD view of Specs / Test plans: every scenario of every plan with its last run. Source of
//! the logic: Legacy `src/lib/test-plan.ts` (`parsePlanRuns`, `planDataPath`) and
//! `src/pages/qa/bdd-view.tsx`. A plan `x.feature` has `x.json` beside it with the last verdict of
//! each scenario. An unknown verdict, or no run, is `not-covered`: a guess upward would hide a gap.

use serde::Serialize;
use serde_json::Value;
use shipyard_core::gherkin::Plan;
use specta::Type;
use tauri::AppHandle;

use super::{plans, project};
use crate::commands::{AppState, Res, blocking};

const VERDICTS: [&str; 5] = ["pass", "fail", "partial", "blocked", "not-covered"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BddRow {
    /// The path of the plan.
    pub plan: String,
    pub scenario: String,
    pub line: u32,
    pub steps: u32,
    /// The refs that the scenario cites.
    pub refs: Vec<String>,
    /// `pass`, `fail`, `partial`, `blocked` or `not-covered`.
    pub verdict: String,
    /// The instant of the last run, or empty.
    pub at: String,
    /// `manual` or `automated`, or empty.
    pub by: String,
    pub evidence: String,
}

/// The rows of one plan. `runs` is the text of the `.json` sibling, when there is one.
pub fn rows(path: &str, plan: &Plan, runs: Option<&str>) -> Vec<BddRow> {
    let runs: Value = runs
        .and_then(|t| serde_json::from_str(t).ok())
        .unwrap_or(Value::Null);
    let run = |name: &str| {
        runs["runs"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|r| r["scenario"] == name)
    };
    let text = |r: Option<&Value>, k: &str| {
        r.and_then(|r| r[k].as_str())
            .unwrap_or_default()
            .to_string()
    };
    plan.scenarios
        .iter()
        .map(|s| {
            let r = run(&s.name);
            let verdict = text(r, "verdict");
            BddRow {
                plan: path.into(),
                scenario: s.name.clone(),
                line: s.line,
                steps: s.steps.len() as u32,
                refs: s.refs.clone(),
                verdict: if VERDICTS.contains(&verdict.as_str()) {
                    verdict
                } else {
                    "not-covered".into()
                },
                at: text(r, "at"),
                by: text(r, "by"),
                evidence: text(r, "evidence"),
            }
        })
        .collect()
}

pub fn bdd(s: &AppState) -> Res<Vec<BddRow>> {
    let p = project(s)?;
    Ok(plans(&p)
        .into_iter()
        .filter_map(|(path, parsed)| {
            let plan = parsed.ok()?;
            let sibling = path.trim_end_matches(".feature").to_string() + ".json";
            let runs = std::fs::read_to_string(p.root.join(sibling)).ok();
            Some(rows(&path, &plan, runs.as_deref()))
        })
        .flatten()
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn specs_bdd(app: AppHandle) -> Res<Vec<BddRow>> {
    blocking(app, bdd).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_core::gherkin::parse;

    #[test]
    fn a_scenario_takes_its_verdict_from_the_json_sibling_and_a_gap_stays_a_gap() {
        let plan = parse(
            "Feature: Login\n  Scenario: ok\n    Given a user\n    Then it works\n  Scenario: nope\n    Given a user\n  Scenario: odd\n    Given x\n",
        )
        .unwrap();
        let runs = r#"{"version":1,"runs":[
          {"scenario":"ok","verdict":"pass","at":"2026-10-01T10:00:00Z","by":"automated","evidence":"pnpm test"},
          {"scenario":"odd","verdict":"great"}]}"#;
        let r = rows("docs/x.feature", &plan, Some(runs));
        assert_eq!(
            r.iter().map(|x| x.verdict.as_str()).collect::<Vec<_>>(),
            ["pass", "not-covered", "not-covered"]
        );
        assert_eq!(
            (r[0].by.as_str(), r[0].evidence.as_str()),
            ("automated", "pnpm test")
        );
        assert_eq!(r[0].steps, 2);
        // No sibling file, or a broken one: every scenario is a gap.
        assert!(
            rows("p", &plan, None)
                .iter()
                .all(|x| x.verdict == "not-covered")
        );
        assert!(rows("p", &plan, Some("{")).iter().all(|x| x.at.is_empty()));
    }
}
