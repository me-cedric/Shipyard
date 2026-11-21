//! The request tree of FinOps: the requests of one run, with tokens and cost, nested by step.
//! Shipyard reads the usage events of its own run log, so the tree holds only runs of this
//! project. A child of a `for_each` step is a step of its own, `step/child`.

use serde::Serialize;
use shipyard_engine::usage::Request;
use specta::Type;
use tauri::AppHandle;

use crate::commands::sync::active;
use crate::commands::{Api, AppState, Res, blocking};

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RequestView {
    /// Unix seconds.
    pub at: u32,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub usd: f64,
}

/// One tool call of a step, as the runner recorded it in the run log.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallView {
    pub name: String,
    /// The input of the call as the runner wrote it: a path, a command or a short text.
    pub target: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StepTree {
    pub step: String,
    pub tokens: u32,
    pub usd: f64,
    pub requests: Vec<RequestView>,
    /// The tool calls of the step, in order (`shell-setup-rights` REQ-003).
    pub tools: Vec<ToolCallView>,
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

/// The tool calls in the events of a run log: the `runner` events of the type `tool_call`, with
/// the unit that they belong to. An event with no unit has none.
pub fn tool_calls(events: &[shipyard_store::run_log::Event]) -> Vec<(String, ToolCallView)> {
    events
        .iter()
        .filter(|e| e.kind == shipyard_store::run_log::kind::RUNNER)
        .filter(|e| e.payload["type"] == "tool_call")
        .filter_map(|e| {
            let text = |k: &str| e.payload[k].as_str().unwrap_or_default().to_string();
            Some((
                e.step.clone()?,
                ToolCallView {
                    name: text("name"),
                    target: text("input"),
                },
            ))
        })
        .collect()
}

pub fn build(
    run: &str,
    key: &str,
    requests: Vec<Request>,
    tools: Vec<(String, ToolCallView)>,
) -> RunTree {
    let mut steps: Vec<StepTree> = Vec::new();
    let new = |step: &str| StepTree {
        step: step.into(),
        tokens: 0,
        usd: 0.0,
        requests: Vec::new(),
        tools: Vec::new(),
    };
    for (step, call) in tools {
        let at = steps
            .iter()
            .position(|s| s.step == step)
            .unwrap_or_else(|| {
                steps.push(new(&step));
                steps.len() - 1
            });
        steps[at].tools.push(call);
    }
    for r in requests {
        let at = steps
            .iter()
            .position(|s| s.step == r.step)
            .unwrap_or_else(|| {
                steps.push(new(&r.step));
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
    let tools = tool_calls(&s.factory.log().run(run).map_err(crate::commands::err)?);
    Ok(build(&info.id, &info.key, f.requests(run), tools))
}

#[tauri::command]
#[specta::specta]
pub async fn usage_tree_get(app: AppHandle, run: String) -> Api<RunTree> {
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
            Vec::new(),
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
        assert!(build("r", "k", Vec::new(), Vec::new()).steps.is_empty());
    }

    fn event(
        step: Option<&str>,
        kind: &str,
        payload: serde_json::Value,
    ) -> shipyard_store::run_log::Event {
        shipyard_store::run_log::Event {
            id: 1,
            run: "r1".into(),
            step: step.map(String::from),
            kind: kind.into(),
            payload,
            ts: 0,
        }
    }

    #[test]
    fn the_tool_calls_of_a_step_come_from_the_run_log_and_show_under_it() {
        use serde_json::json;
        let log = [
            event(
                Some("plan"),
                "runner",
                json!({"type": "tool_call", "id": "a", "name": "read_ticket", "input": "SHIP-1"}),
            ),
            event(Some("plan"), "runner", json!({"type": "usage"})),
            event(
                Some("plan"),
                "note",
                json!({"type": "tool_call", "name": "x"}),
            ),
            event(None, "runner", json!({"type": "tool_call", "name": "lost"})),
            event(
                Some("build"),
                "runner",
                json!({"type": "tool_call", "name": "read_ref", "input": "spec:a#REQ-1"}),
            ),
        ];
        let calls = tool_calls(&log);
        assert_eq!(calls.len(), 2);
        let t = build("r1", "SHIP-1", vec![req("plan", 1000, 1, 1, 0.1)], calls);
        let plan = t.steps.iter().find(|s| s.step == "plan").unwrap();
        assert_eq!(plan.tools[0].name, "read_ticket");
        assert_eq!(plan.requests.len(), 1);
        // A step with a tool call and no request still shows.
        let build_step = t.steps.iter().find(|s| s.step == "build").unwrap();
        assert_eq!(build_step.tools[0].target, "spec:a#REQ-1");
        assert!(build_step.requests.is_empty());
    }
}
