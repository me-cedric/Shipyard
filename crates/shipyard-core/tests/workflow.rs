//! Workflow model, checks, schema, DAG scheduler and fan-out (spec `factory`, REQ-010, REQ-012,
//! REQ-013, REQ-014, REQ-035).

use std::collections::{BTreeMap, BTreeSet};

use shipyard_core::workflow::*;

const FEATURE: &str = r#"
id: feature
steps:
  - { id: grill,  role: planner,  model: opus,   effort: high,   skill: grill-me, tools: [ask_question, report] }
  - { id: plan,   role: planner,  model: opus,   effort: high,   needs: [grill], gate: human, mode: plan }
  - { id: build,  role: worker,   model: sonnet, effort: medium, needs: [plan], workspace: worktree, for_each: plan.tasks, max_parallel: 2, retry: 2 }
  - { id: review, role: reviewer, model: opus,   effort: high,   needs: [build], fresh_context: true, max_rounds: 2 }
  - { id: pr,     action: open_pr, needs: [review] }
limits: { max_turns: 40, budget_usd: 5, stall_s: 300 }
"#;

fn parse(yaml: &str) -> Workflow {
    serde_yaml::from_str(yaml).expect("valid yaml")
}

fn roles() -> Vec<String> {
    DEFAULT_ROLES.iter().map(|r| r.to_string()).collect()
}

fn with_steps(steps: &str) -> Workflow {
    parse(&format!(
        "id: t\nsteps:\n{steps}\nlimits: {{ max_turns: 1, budget_usd: 1, stall_s: 1 }}\n"
    ))
}

#[test]
fn feature_workflow_parses_and_checks_clean() {
    let wf = parse(FEATURE);
    assert_eq!(wf.check(&roles()), []);
    let build = wf.step("build").unwrap();
    assert_eq!(build.workspace, Workspace::Worktree);
    assert_eq!(build.effort, Some(Effort::Medium));
    assert_eq!(build.max_parallel(), 2);
    assert_eq!(
        build.source(),
        Some(ForEach {
            step: "plan",
            field: "tasks"
        })
    );
    let plan = wf.step("plan").unwrap();
    assert_eq!((plan.gate, plan.mode), (Gate::Human, Mode::Plan));
    let pr = wf.step("pr").unwrap();
    assert_eq!(pr.action, Some(Action::OpenPr));
    assert_eq!(pr.workspace, Workspace::Shared);
    assert_eq!(wf.limits.stall_s, 300);
}

#[test]
fn unknown_field_is_rejected() {
    let bad = FEATURE.replace("fresh_context: true", "fresh: true");
    assert!(serde_yaml::from_str::<Workflow>(&bad).is_err());
    let bad = FEATURE.replace("limits:", "extra: 1\nlimits:");
    assert!(serde_yaml::from_str::<Workflow>(&bad).is_err());
    let bad = FEATURE.replace("gate: human", "gate: maybe");
    assert!(serde_yaml::from_str::<Workflow>(&bad).is_err());
}

#[test]
fn needs_cycle_names_both_steps() {
    let wf = with_steps(
        "  - { id: a, role: worker, needs: [b] }\n  - { id: b, role: worker, needs: [a] }\n  - { id: c, role: worker, needs: [a] }",
    );
    assert_eq!(
        wf.check(&roles()),
        [WorkflowIssue::Cycle {
            steps: vec!["a".into(), "b".into()]
        }]
    );
}

#[test]
fn self_need_is_a_cycle() {
    let wf = with_steps("  - { id: a, role: worker, needs: [a] }");
    assert_eq!(
        wf.check(&roles()),
        [WorkflowIssue::Cycle {
            steps: vec!["a".into()]
        }]
    );
}

#[test]
fn step_rules() {
    let wf = with_steps(concat!(
        "  - { id: a, role: security }\n",
        "  - { id: a, role: worker }\n",
        "  - { id: b, needs: [zz] }\n",
        "  - { id: c, role: worker, action: open_pr }\n",
        "  - { id: d, role: worker, for_each: a.items }\n",
        "  - { id: e, role: reviewer, max_rounds: 3, max_parallel: 0, budget: -1, timeout: 0 }\n",
        "  - { id: F.x, role: worker }",
    ));
    let issues = wf.check(&roles());
    for want in [
        WorkflowIssue::UnknownRole {
            step: "a".into(),
            role: "security".into(),
        },
        WorkflowIssue::DuplicateStep { step: "a".into() },
        WorkflowIssue::UnknownNeed {
            step: "b".into(),
            need: "zz".into(),
        },
        WorkflowIssue::RoleOrAction { step: "b".into() },
        WorkflowIssue::RoleOrAction { step: "c".into() },
        WorkflowIssue::BadForEach { step: "d".into() },
        WorkflowIssue::BadValue {
            field: "steps.e.max_rounds".into(),
        },
        WorkflowIssue::BadValue {
            field: "steps.e.max_parallel".into(),
        },
        WorkflowIssue::BadValue {
            field: "steps.e.budget".into(),
        },
        WorkflowIssue::BadValue {
            field: "steps.e.timeout".into(),
        },
        WorkflowIssue::BadId {
            field: "steps.F.x".into(),
        },
    ] {
        assert!(issues.contains(&want), "missing {want:?} in {issues:?}");
    }
    assert_eq!(issues.len(), 11, "{issues:?}");
}

#[test]
fn project_role_is_known_once_listed() {
    let wf = with_steps("  - { id: a, role: security }");
    let mut known = roles();
    known.push("security".into());
    assert_eq!(wf.check(&known), []);
}

#[test]
fn limits_must_be_positive() {
    let wf = parse(
        "id: t\nsteps:\n  - { id: a, role: worker }\nlimits: { max_turns: 0, budget_usd: -1, stall_s: 0 }\n",
    );
    let fields: Vec<String> = wf
        .check(&roles())
        .into_iter()
        .map(|i| match i {
            WorkflowIssue::BadValue { field } => field,
            other => panic!("{other:?}"),
        })
        .collect();
    assert_eq!(
        fields,
        ["limits.max_turns", "limits.budget_usd", "limits.stall_s"]
    );
    assert!(serde_yaml::from_str::<Workflow>("id: t\nsteps: []\n").is_err());
}

#[test]
fn no_steps_and_bad_workflow_id() {
    let wf = parse("id: Bad Id\nsteps: []\nlimits: { max_turns: 1, budget_usd: 1, stall_s: 1 }\n");
    assert_eq!(
        wf.check(&roles()),
        [
            WorkflowIssue::BadId { field: "id".into() },
            WorkflowIssue::NoSteps
        ]
    );
}

fn states(pairs: &[(&str, StepState)]) -> BTreeMap<String, StepState> {
    pairs.iter().map(|(k, v)| (k.to_string(), *v)).collect()
}

#[test]
fn scheduler_follows_needs() {
    let wf = parse(FEATURE);
    assert_eq!(runnable(&wf, &BTreeMap::new()), ["grill"]);
    assert_eq!(
        runnable(&wf, &states(&[("grill", StepState::Running)])),
        Vec::<String>::new()
    );
    assert_eq!(
        runnable(&wf, &states(&[("grill", StepState::Done)])),
        ["plan"]
    );
    // The human gate holds the dependents until a person approves.
    let gated = states(&[("grill", StepState::Done), ("plan", StepState::Gate)]);
    assert!(runnable(&wf, &gated).is_empty());
    let approved = states(&[("grill", StepState::Done), ("plan", StepState::Done)]);
    assert_eq!(runnable(&wf, &approved), ["build"]);
}

#[test]
fn scheduler_runs_independent_steps_together_and_stops_on_failure() {
    let wf = with_steps(
        "  - { id: a, role: worker }\n  - { id: b, role: worker }\n  - { id: c, role: worker, needs: [a, b] }",
    );
    assert_eq!(runnable(&wf, &BTreeMap::new()), ["a", "b"]);
    assert_eq!(runnable(&wf, &states(&[("a", StepState::Done)])), ["b"]);
    assert_eq!(
        runnable(
            &wf,
            &states(&[("a", StepState::Done), ("b", StepState::Done)])
        ),
        ["c"]
    );
    assert!(runnable(&wf, &states(&[("a", StepState::Failed)])).is_empty());
}

#[test]
fn fan_out_respects_max_parallel() {
    use StepState::*;
    assert_eq!(next_children(&[Pending; 5], 2), [0, 1]);
    assert_eq!(
        next_children(&[Running, Pending, Pending, Pending, Pending], 2),
        [1]
    );
    assert_eq!(
        next_children(&[Done, Running, Running, Pending, Pending], 2),
        Vec::<usize>::new()
    );
    assert_eq!(
        next_children(&[Done, Done, Running, Pending, Pending], 2),
        [3]
    );
    // No new child after a failure.
    assert!(next_children(&[Failed, Pending], 2).is_empty());
    // A zero limit still runs one child.
    assert_eq!(next_children(&[Pending, Pending], 0), [0]);
}

#[test]
fn fan_in_collects_children() {
    use StepState::*;
    assert_eq!(fan_in(&[]), Done);
    assert_eq!(fan_in(&[Done; 5]), Done);
    assert_eq!(fan_in(&[Done, Running]), Running);
    assert_eq!(fan_in(&[Failed, Running]), Running);
    assert_eq!(fan_in(&[Failed, Done, Pending]), Failed);
}

fn keys(v: &serde_json::Value) -> BTreeSet<String> {
    v.as_object().unwrap().keys().cloned().collect()
}

#[test]
fn schema_matches_the_model() {
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../schema/workflow.schema.json")).unwrap();
    let full = Step {
        id: "s".into(),
        role: Some("worker".into()),
        model: Some("opus".into()),
        effort: Some(Effort::High),
        tools: vec!["report".into()],
        skill: Some("grill-me".into()),
        mode: Mode::Plan,
        workspace: Workspace::Worktree,
        needs: vec!["a".into()],
        gate: Gate::Human,
        for_each: Some("a.items".into()),
        max_parallel: Some(2),
        retry: 1,
        timeout: Some(60),
        budget: Some(1.0),
        fresh_context: true,
        max_rounds: Some(2),
        action: Some(Action::OpenPr),
    };
    let step = serde_json::to_value(&full).unwrap();
    let defs = &schema["$defs"];
    assert_eq!(keys(&defs["step"]["properties"]), keys(&step));
    assert_eq!(defs["step"]["additionalProperties"], false);
    assert_eq!(schema["additionalProperties"], false);
    let limits = serde_json::to_value(parse(FEATURE).limits).unwrap();
    assert_eq!(keys(&defs["limits"]["properties"]), keys(&limits));
    for (field, values) in [
        ("effort", vec!["low", "medium", "high", "xhigh", "max"]),
        ("mode", vec!["plan", "auto"]),
        ("workspace", vec!["worktree", "shared", "none"]),
        ("gate", vec!["none", "human"]),
        ("action", vec!["open_pr"]),
    ] {
        let listed: Vec<&str> = defs["step"]["properties"][field]["enum"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(listed, values, "{field}");
        for v in values {
            let yaml = format!("id: s\n{field}: {v}\n");
            assert!(serde_yaml::from_str::<Step>(&yaml).is_ok(), "{field}: {v}");
        }
    }
}
