//! Sessions, usage and the day and member budgets (spec `factory` REQ-022, REQ-031, REQ-032).
//! The money of a day comes from the usage events of the run log, in UTC days. The money of a
//! member comes from the runs, by the assignee of the ticket in the mirror.

use std::collections::BTreeMap;
use std::time::Duration;

use shipyard_core::pickup::Budgets;
use shipyard_core::run::{self, BudgetLevel};
use shipyard_core::workflow::StepState;

use crate::iso;
use crate::run_engine::{Factory, Inner};

/// Tokens and money of one day or of one member, with its budget (`None`: no budget).
#[derive(Debug, Clone, PartialEq)]
pub struct Spend {
    pub key: String,
    pub tokens: u64,
    pub usd: f64,
    pub budget: Option<f64>,
}

/// One agent session: a step or a child of a step that started.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionInfo {
    pub run: String,
    pub project: String,
    pub key: String,
    /// The unit id: the step id, or the child id of a `for_each` step.
    pub step: String,
    pub runner: String,
    pub model: Option<String>,
    pub state: StepState,
    pub tokens: u64,
    pub cost_usd: f64,
    /// Unix seconds.
    pub started: u64,
}

/// The sessions that `Factory::sessions` keeps of the finished steps, newest first.
const RECENT: usize = 50;

fn day_of(t: Duration) -> String {
    iso(t)[..10].to_string()
}

impl Inner {
    /// The ticket assignee of the run. `""`: none, or the ticket is not in the mirror.
    pub(crate) fn member_of(&self, run_id: &str) -> String {
        let (Some(p), Some(r)) = (self.project_of(run_id), self.runs.get(run_id)) else {
            return String::new();
        };
        let ticket = p
            .mirror
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .ticket(&p.source, &r.key);
        ticket
            .ok()
            .flatten()
            .and_then(|t| t.item.assignee)
            .map(|a| a.name)
            .unwrap_or_default()
    }

    /// Tokens and money of each UTC day, from the usage events of the runs of `project`.
    fn day_spend(&self, project: &str) -> BTreeMap<String, (u64, f64)> {
        let mut days: BTreeMap<String, (u64, f64)> = BTreeMap::new();
        for e in self.log.usage_events().unwrap_or_default() {
            if self.runs.get(&e.run).is_none_or(|r| r.project != project) {
                continue;
            }
            let n = |k: &str| e.payload[k].as_u64().unwrap_or(0);
            let d = days.entry(day_of(Duration::from_millis(e.ts))).or_default();
            d.0 += n("input_tokens") + n("output_tokens");
            d.1 += e.payload["cost_usd"].as_f64().unwrap_or(0.0);
        }
        days
    }

    /// Tokens and money of each member over the runs of `project`.
    fn member_spend(&self, project: &str) -> BTreeMap<String, (u64, f64)> {
        let mut out: BTreeMap<String, (u64, f64)> = BTreeMap::new();
        for r in self.runs.values().filter(|r| r.project == project) {
            let m = out.entry(self.member_of(&r.id)).or_default();
            m.0 += r.tokens;
            m.1 += r.cost;
        }
        out
    }

    /// The worse of the day level and the member level of the run (REQ-022). `Under` with no
    /// budget: the default is no budget per day or per member.
    pub(crate) fn spend_levels(&self, run_id: &str) -> [BudgetLevel; 2] {
        let (Some(p), Some(r)) = (self.project_of(run_id), self.runs.get(run_id)) else {
            return [BudgetLevel::Under; 2];
        };
        let b = &p.automation.budgets;
        if b.is_empty() {
            return [BudgetLevel::Under; 2];
        }
        let today = day_of(self.clock.now());
        let day = b.for_day(&today).map_or(BudgetLevel::Under, |usd| {
            let spent = self.day_spend(&r.project).get(&today).map_or(0.0, |d| d.1);
            run::budget_level(spent, usd)
        });
        let member = self.member_of(run_id);
        let member = b.for_member(&member).map_or(BudgetLevel::Under, |usd| {
            let spent = self
                .member_spend(&r.project)
                .get(&member)
                .map_or(0.0, |d| d.1);
            run::budget_level(spent, usd)
        });
        [day, member]
    }
}

impl Factory {
    /// New budgets after an edit of the automation file. They count from the next usage event.
    pub fn set_budgets(&self, project: &str, budgets: Budgets) {
        if let Some(p) = self.lock().projects.get_mut(project) {
            p.automation.budgets = budgets;
        }
    }

    /// The days and the members of `project`, each with its budget. Days are newest first.
    pub fn usage(&self, project: &str) -> (Vec<Spend>, Vec<Spend>) {
        let inner = self.lock();
        let Some(p) = inner.projects.get(project) else {
            return Default::default();
        };
        let b = &p.automation.budgets;
        let rows = |m: BTreeMap<String, (u64, f64)>, budget: &dyn Fn(&str) -> Option<f64>| {
            m.into_iter()
                .map(|(key, (tokens, usd))| Spend {
                    budget: budget(&key),
                    key,
                    tokens,
                    usd,
                })
                .collect::<Vec<_>>()
        };
        let mut days = rows(inner.day_spend(project), &|d| b.for_day(d));
        days.reverse();
        (
            days,
            rows(inner.member_spend(project), &|m| b.for_member(m)),
        )
    }

    /// The live sessions and the most recent ended ones, newest first. A step that never started
    /// has none.
    pub fn sessions(&self) -> Vec<SessionInfo> {
        let inner = self.lock();
        let mut out: Vec<SessionInfo> = inner
            .runs
            .values()
            .flat_map(|r| {
                let units = r.steps.values().flat_map(|s| s.units.iter());
                let started =
                    units.filter(|u| u.state != StepState::Pending && !u.runner.is_empty());
                started.map(|u| SessionInfo {
                    run: r.id.clone(),
                    project: r.project.clone(),
                    key: r.key.clone(),
                    step: u.id.clone(),
                    runner: u.runner.clone(),
                    model: u.model.clone(),
                    state: u.state,
                    tokens: u.tokens,
                    cost_usd: u.cost,
                    started: u.started,
                })
            })
            .collect();
        out.sort_by_key(|s| std::cmp::Reverse(s.started));
        let live = out.iter().filter(|s| s.state == StepState::Running).count();
        out.truncate(live.max(RECENT));
        out
    }
}
