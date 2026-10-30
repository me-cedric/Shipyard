//! The request tree of FinOps: the requests of one run, with tokens and cost, nested by step.
//! Legacy builds it from session transcripts (`infrastructure/finops.rs`, `FinopsFlameNode`);
//! Shipyard reads the usage events of its own run log, so the tree holds only runs of this
//! project. A child of a `for_each` step is a step of its own, `step/child`.

use serde::Serialize;
use shipyard_engine::usage::Request;
use specta::Type;
use tauri::AppHandle;

use crate::commands::sync::active;
use crate::commands::{AppState, Res, blocking};

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RequestView {
    /// Unix seconds.
    pub at: u32,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub usd: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StepTree {
    pub step: String,
    pub tokens: u32,
    pub usd: f64,
    pub requests: Vec<RequestView>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RunTree {
    pub run: String,
    pub key: String,
    pub tokens: u32,
    pub usd: f64,
    /// In order of the first request.
    pub steps: Vec<StepTree>,
}

fn small(n: u64) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

pub fn build(run: &str, key: &str, requests: Vec<Request>) -> RunTree {
    let mut steps: Vec<StepTree> = Vec::new();
    for r in requests {
        let at = steps
            .iter()
            .position(|s| s.step == r.step)
            .unwrap_or_else(|| {
                steps.push(StepTree {
                    step: r.step.clone(),
                    tokens: 0,
                    usd: 0.0,
                    requests: Vec::new(),
                });
                steps.len() - 1
            });
        let step = &mut steps[at];
        step.tokens = step
            .tokens
            .saturating_add(small(r.input_tokens + r.output_tokens));
        step.usd += r.cost_usd;
        step.requests.push(RequestView {
            at: small(r.ts / 1000),
            input_tokens: small(r.input_tokens),
            output_tokens: small(r.output_tokens),
            usd: r.cost_usd,
        });
    }
    RunTree {
        run: run.into(),
        key: key.into(),
        tokens: steps.iter().fold(0u32, |a, s| a.saturating_add(s.tokens)),
        usd: steps.iter().map(|s| s.usd).sum(),
        steps,
    }
}

pub fn usage_tree(s: &AppState, run: &str) -> Res<RunTree> {
    let a = active(s)?.ok_or("no active project")?;
    let f = &s.factory.factory;
    let info = f
        .runs()
        .into_iter()
        .find(|r| r.id == run && r.project == a.entry.id)
        .ok_or_else(|| format!("no run `{run}` in this project"))?;
    Ok(build(&info.id, &info.key, f.requests(run)))
}

#[tauri::command]
#[specta::specta]
pub async fn usage_tree_get(app: AppHandle, run: String) -> Res<RunTree> {
    blocking(app, move |s| usage_tree(s, &run)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(step: &str, ts: u64, i: u64, o: u64, usd: f64) -> Request {
        Request {
            step: step.into(),
            ts,
            input_tokens: i,
            output_tokens: o,
            cost_usd: usd,
        }
    }

    #[test]
    fn requests_nest_under_their_step_and_the_totals_add_up() {
        let t = build(
            "r1",
            "SHIP-1",
            vec![
                req("plan", 1000, 100, 50, 0.5),
                req("work/a", 2000, 10, 10, 0.25),
                req("plan", 3000, 100, 0, 0.25),
            ],
        );
        assert_eq!(
            t.steps.iter().map(|s| s.step.as_str()).collect::<Vec<_>>(),
            ["plan", "work/a"]
        );
        assert_eq!(
            (t.steps[0].tokens, t.steps[0].usd, t.steps[0].requests.len()),
            (250, 0.75, 2)
        );
        assert_eq!((t.tokens, t.usd), (270, 1.0));
        assert_eq!(t.steps[0].requests[1].at, 3);
        assert!(build("r", "k", Vec::new()).steps.is_empty());
    }
}
