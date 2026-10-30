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

/// One request of a run: a usage event of the runner, with the step that it belongs to.
#[derive(Debug, Clone, PartialEq)]
pub struct Request {
    /// The unit id: the step id, or the child id of a `for_each` step. Empty: no step.
    pub step: String,
    /// Unix milliseconds.
    pub ts: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
}

/// The sessions that `Factory::sessions` keeps of the finished steps, newest first.
const RECENT: usize = 50;

/// Running tokens and money of one project, by UTC day and by member.
#[derive(Default)]
pub(crate) struct Spent {
    days: BTreeMap<String, (u64, f64)>,
    members: BTreeMap<String, (u64, f64)>,
}

impl Spent {
    /// Add a usage event to its day. Gives its tokens and money.
    fn day(&mut self, payload: &serde_json::Value, ts: u64) -> (u64, f64) {
        let n = |k: &str| payload[k].as_u64().unwrap_or(0);
        let (tokens, usd) = (
            n("input_tokens") + n("output_tokens"),
            payload["cost_usd"].as_f64().unwrap_or(0.0),
        );
        let d = self
            .days
            .entry(day_of(Duration::from_millis(ts)))
            .or_default();
        d.0 += tokens;
        d.1 += usd;
        (tokens, usd)
    }

    fn member(&mut self, name: String, tokens: u64, usd: f64) {
        let m = self.members.entry(name).or_default();
        m.0 += tokens;
        m.1 += usd;
    }
}

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

    /// The running totals of `project`: the days from the usage events of the log, the members
    /// from the runs. Built once when the project opens (`Factory::set_project`).
    pub(crate) fn build_spent(&self, project: &str) -> Spent {
        let mut out = Spent::default();
        for e in self.log.usage_events().unwrap_or_default() {
            let mine = match e.run.strip_prefix(crate::budget::RUN_PREFIX) {
                Some(p) => p == project,
                None => self.runs.get(&e.run).is_some_and(|r| r.project == project),
            };
            if mine {
                out.day(&e.payload, e.ts);
            }
        }
        for r in self.runs.values().filter(|r| r.project == project) {
            out.member(self.member_of(&r.id), r.tokens, r.cost);
        }
        for b in self.assistant_bookings(project) {
            out.member(b.member, b.tokens, b.usd);
        }
        out
    }

    /// Add a usage event of the log to the day totals of its project.
    pub(crate) fn add_day(&mut self, run_id: &str, payload: &serde_json::Value, ts: u64) {
        let project = match self.runs.get(run_id) {
            Some(r) => r.project.clone(),
            None => return,
        };
        if let Some(s) = self.spent.get_mut(&project) {
            s.day(payload, ts);
        }
    }

    /// Add a booked assistant turn (`budget::book_assistant`) to the day and the member.
    pub(crate) fn add_booking(&mut self, project: &str, payload: &serde_json::Value, ts: u64) {
        if let Some(s) = self.spent.get_mut(project) {
            let (tokens, usd) = s.day(payload, ts);
            let member = payload["member"].as_str().unwrap_or_default();
            s.member(member.to_string(), tokens, usd);
        }
    }

    /// Add the usage of a run to the total of its assignee. Zero adds the row only.
    pub(crate) fn add_member(&mut self, run_id: &str, tokens: u64, usd: f64) {
        let Some(project) = self.runs.get(run_id).map(|r| r.project.clone()) else {
            return;
        };
        if self.spent.contains_key(&project) {
            let member = self.member_of(run_id);
            if let Some(s) = self.spent.get_mut(&project) {
                s.member(member, tokens, usd);
            }
        }
    }

    /// Tokens and money of each UTC day, from the usage events of the runs of `project`.
    pub(crate) fn day_spend(&self, project: &str) -> BTreeMap<String, (u64, f64)> {
        self.spent
            .get(project)
            .map(|s| s.days.clone())
            .unwrap_or_default()
    }

    /// Tokens and money of each member over the runs of `project`.
    pub(crate) fn member_spend(&self, project: &str) -> BTreeMap<String, (u64, f64)> {
        self.spent
            .get(project)
            .map(|s| s.members.clone())
            .unwrap_or_default()
    }

    /// The day level and the member level of the run (REQ-022), each with its budget key
    /// (`day:<date>`, `member:<name>`). A level exists only for a budget: the default is no
    /// budget per day or per member.
    pub(crate) fn spend_levels(&self, run_id: &str) -> Vec<(String, BudgetLevel)> {
        let (Some(p), Some(r)) = (self.project_of(run_id), self.runs.get(run_id)) else {
            return Vec::new();
        };
        let b = &p.automation.budgets;
        let Some(s) = self.spent.get(&r.project).filter(|_| !b.is_empty()) else {
            return Vec::new();
        };
        let today = day_of(self.clock.now());
        let member = self.member_of(run_id);
        let day = b.for_day(&today).map(|usd| {
            let spent = s.days.get(&today).map_or(0.0, |d| d.1);
            (format!("day:{today}"), run::budget_level(spent, usd))
        });
        let who = b.for_member(&member).map(|usd| {
            let spent = s.members.get(&member).map_or(0.0, |d| d.1);
            (format!("member:{member}"), run::budget_level(spent, usd))
        });
        day.into_iter().chain(who).collect()
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

    /// The requests of one run, oldest first: its usage events from the run log.
    pub fn requests(&self, run: &str) -> Vec<Request> {
        let inner = self.lock();
        inner
            .log
            .usage_events()
            .unwrap_or_default()
            .into_iter()
            .filter(|e| e.run == run)
            .map(|e| {
                let n = |k: &str| e.payload[k].as_u64().unwrap_or(0);
                Request {
                    step: e.step.clone().unwrap_or_default(),
                    ts: e.ts,
                    input_tokens: n("input_tokens"),
                    output_tokens: n("output_tokens"),
                    cost_usd: e.payload["cost_usd"].as_f64().unwrap_or(0.0),
                }
            })
            .collect()
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
        let mut ended = 0;
        out.retain(|s| {
            ended += usize::from(s.state != StepState::Running);
            s.state == StepState::Running || ended <= RECENT
        });
        out
    }
}
