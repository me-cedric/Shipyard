//! The workflow model of `.shipyard/workflows/<id>.yaml`, its checks, the DAG scheduler and the
//! fan-out rules (spec `factory`, REQ-010, REQ-012, REQ-013, REQ-014, REQ-035). No I/O: the store
//! reads the file and validates it with `schema/workflow.schema.json`, then calls `check`.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use specta::Type;

/// The roles that exist with no file in `.shipyard/roles/` (REQ-014).
pub const DEFAULT_ROLES: [&str; 7] = [
    "scout", "worker", "reviewer", "planner", "tester", "docs", "triager",
];
/// Children of a `for_each` step that run at the same time when `max_parallel` is not set.
pub const DEFAULT_PARALLEL: u32 = 2;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct Workflow {
    pub id: String,
    /// File order. The scheduler and the views keep it.
    pub steps: Vec<Step>,
    pub limits: WorkflowLimits,
}

/// Limits of each run of the workflow (REQ-035).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct WorkflowLimits {
    pub max_turns: u32,
    pub budget_usd: f64,
    pub stall_s: u32,
}

/// One step (REQ-012). A step has a `role` or an `action`, never both.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields, default)]
pub struct Step {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<Effort>,
    /// The agent tools that the step may call (REQ-016). Empty: none.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skill: Option<String>,
    pub mode: Mode,
    pub workspace: Workspace,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub needs: Vec<String>,
    pub gate: Gate,
    /// `<step>.<field>`: one child for each item of that output. `<step>` is in `needs`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub for_each: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_parallel: Option<u32>,
    /// Retries after a failure. 0: the first failure fails the run.
    pub retry: u32,
    /// Seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u32>,
    /// USD for this step, inside the workflow budget.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub budget: Option<f64>,
    pub fresh_context: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_rounds: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<Action>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Effort {
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Plan,
    #[default]
    Auto,
}

/// `shared`: the one worktree of the run. `worktree`: one worktree for each child.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Workspace {
    Worktree,
    #[default]
    Shared,
    None,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Gate {
    #[default]
    None,
    Human,
}

/// A step that the engine does itself, with no agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    OpenPr,
}

/// The source list of a `for_each` step.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ForEach<'a> {
    pub step: &'a str,
    pub field: &'a str,
}

impl Step {
    pub fn max_parallel(&self) -> u32 {
        self.max_parallel.unwrap_or(DEFAULT_PARALLEL)
    }

    /// `for_each` split at the first dot. `None` when it is absent or malformed.
    pub fn source(&self) -> Option<ForEach<'_>> {
        let (step, field) = self.for_each.as_deref()?.split_once('.')?;
        (!step.is_empty() && !field.is_empty()).then_some(ForEach { step, field })
    }
}

/// One reason to refuse a workflow file. The view shows it with the line of its field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WorkflowIssue {
    NoSteps,
    /// `field` is `id` or `steps.<id>`. An id holds only `a-z`, `0-9`, `-` and `_`.
    BadId {
        field: String,
    },
    DuplicateStep {
        step: String,
    },
    UnknownNeed {
        step: String,
        need: String,
    },
    /// The steps of one `needs` cycle, in order.
    Cycle {
        steps: Vec<String>,
    },
    /// No file in `.shipyard/roles/` and not a default role.
    UnknownRole {
        step: String,
        role: String,
    },
    /// The step has both a role and an action, or neither.
    RoleOrAction {
        step: String,
    },
    /// `for_each` is not `<need>.<field>`.
    BadForEach {
        step: String,
    },
    /// A number out of range. `field` is a path such as `limits.stall_s`.
    BadValue {
        field: String,
    },
}

/// Adapted from Legacy `checked()` (`src-tauri/src/application/tickets/delegate.rs`), without
/// `.` and `:`, which the `for_each` path and the refs use.
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
}

impl Workflow {
    pub fn step(&self, id: &str) -> Option<&Step> {
        self.steps.iter().find(|s| s.id == id)
    }

    /// Every issue of the file. `roles` holds the default roles and the project roles.
    pub fn check(&self, roles: &[String]) -> Vec<WorkflowIssue> {
        use WorkflowIssue as I;
        let mut out = Vec::new();
        let bad = |field: String| I::BadValue { field };
        if !valid_id(&self.id) {
            out.push(I::BadId { field: "id".into() });
        }
        if self.steps.is_empty() {
            out.push(I::NoSteps);
        }
        let mut seen = HashMap::new();
        for s in &self.steps {
            let step = || s.id.clone();
            if !valid_id(&s.id) {
                out.push(I::BadId {
                    field: format!("steps.{}", s.id),
                });
            }
            if seen.insert(s.id.as_str(), ()).is_some() {
                out.push(I::DuplicateStep { step: step() });
            }
            for need in &s.needs {
                if self.step(need).is_none() {
                    out.push(I::UnknownNeed {
                        step: step(),
                        need: need.clone(),
                    });
                }
            }
            if s.role.is_some() == s.action.is_some() {
                out.push(I::RoleOrAction { step: step() });
            }
            if let Some(role) = s.role.as_ref().filter(|r| !roles.contains(r)) {
                out.push(I::UnknownRole {
                    step: step(),
                    role: role.clone(),
                });
            }
            if s.for_each.is_some()
                && !s
                    .source()
                    .is_some_and(|f| s.needs.iter().any(|n| n == f.step))
            {
                out.push(I::BadForEach { step: step() });
            }
            if s.max_rounds.is_some_and(|r| r > crate::run::MAX_ROUNDS) {
                out.push(bad(format!("steps.{}.max_rounds", s.id)));
            }
            if s.max_parallel == Some(0) {
                out.push(bad(format!("steps.{}.max_parallel", s.id)));
            }
            if s.budget.is_some_and(|b| !(b.is_finite() && b > 0.0)) {
                out.push(bad(format!("steps.{}.budget", s.id)));
            }
            if s.timeout == Some(0) {
                out.push(bad(format!("steps.{}.timeout", s.id)));
            }
        }
        if let Some(steps) = self.cycle() {
            out.push(I::Cycle { steps });
        }
        let l = &self.limits;
        if l.max_turns == 0 {
            out.push(bad("limits.max_turns".into()));
        }
        if !(l.budget_usd.is_finite() && l.budget_usd > 0.0) {
            out.push(bad("limits.budget_usd".into()));
        }
        if l.stall_s == 0 {
            out.push(bad("limits.stall_s".into()));
        }
        out
    }

    /// The first `needs` cycle in file order, or `None`.
    fn cycle(&self) -> Option<Vec<String>> {
        // 0: not seen, 1: on the path, 2: done.
        fn visit(
            wf: &Workflow,
            i: usize,
            mark: &mut [u8],
            path: &mut Vec<usize>,
        ) -> Option<Vec<String>> {
            mark[i] = 1;
            path.push(i);
            for need in &wf.steps[i].needs {
                let Some(j) = wf.steps.iter().position(|s| &s.id == need) else {
                    continue;
                };
                match mark[j] {
                    1 => {
                        let from = path.iter().position(|&p| p == j).unwrap_or(0);
                        return Some(
                            path[from..]
                                .iter()
                                .map(|&p| wf.steps[p].id.clone())
                                .collect(),
                        );
                    }
                    0 => {
                        if let Some(c) = visit(wf, j, mark, path) {
                            return Some(c);
                        }
                    }
                    _ => {}
                }
            }
            path.pop();
            mark[i] = 2;
            None
        }
        let mut mark = vec![0u8; self.steps.len()];
        (0..self.steps.len()).find_map(|i| {
            (mark[i] == 0)
                .then(|| visit(self, i, &mut mark, &mut Vec::new()))
                .flatten()
        })
    }
}

/// The live state of a step, or of one child of a `for_each` step.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StepState {
    #[default]
    Pending,
    Running,
    /// Output ready, `gate: human`: waits for a person. A rejection sets it back to `Pending`.
    Gate,
    Done,
    Failed,
}

/// The steps to start now, in file order: pending, with every need done. A missing entry is
/// `Pending`. Nothing starts after a failed step: the run retries or fails first.
pub fn runnable(wf: &Workflow, states: &BTreeMap<String, StepState>) -> Vec<String> {
    let state = |id: &str| states.get(id).copied().unwrap_or_default();
    if states.values().any(|s| *s == StepState::Failed) {
        return Vec::new();
    }
    wf.steps
        .iter()
        .filter(|s| state(&s.id) == StepState::Pending)
        .filter(|s| s.needs.iter().all(|n| state(n) == StepState::Done))
        .map(|s| s.id.clone())
        .collect()
}

/// The children to start now: pending ones while fewer than `max_parallel` run (at least one).
/// None after a failed child.
pub fn next_children(children: &[StepState], max_parallel: u32) -> Vec<usize> {
    if children.contains(&StepState::Failed) {
        return Vec::new();
    }
    let running = children
        .iter()
        .filter(|c| **c == StepState::Running)
        .count();
    let free = (max_parallel.max(1) as usize).saturating_sub(running);
    children
        .iter()
        .enumerate()
        .filter(|(_, c)| **c == StepState::Pending)
        .map(|(i, _)| i)
        .take(free)
        .collect()
}

/// The state of a `for_each` step from its children. No children: done.
pub fn fan_in(children: &[StepState]) -> StepState {
    if children.iter().all(|c| *c == StepState::Done) {
        StepState::Done
    } else if children.contains(&StepState::Failed) && !children.contains(&StepState::Running) {
        StepState::Failed
    } else {
        StepState::Running
    }
}
