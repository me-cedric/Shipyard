//! Budget booking for assistant turns (spec `assistant` REQ-012). A turn books tokens and money
//! into the counters that the runs use, so Factory / Usage shows them in the same day and member
//! totals. The turn is a usage event of the run log under the synthetic run id
//! `assistant:<project>`: [`crate::usage`] counts such an event for the day and for its member.

use std::time::Duration;

use shipyard_core::run::{self, BudgetLevel};

use crate::iso;
use crate::run_engine::{Factory, Inner};

/// The run id prefix of an assistant booking. It is no run: `persist` skips it.
pub const RUN_PREFIX: &str = "assistant:";

/// One booked turn.
pub(crate) struct Booked {
    pub member: String,
    pub tokens: u64,
    pub usd: f64,
}

/// The state of the budgets for a new assistant turn.
#[derive(Debug, Clone, PartialEq)]
pub struct Gate {
    /// `Alert` from 80 %: the panel alerts. `Spent` from 100 %: the panel refuses the turn.
    pub level: BudgetLevel,
    /// The budget that gave the level: `day 2026-10-29` or `member Alice`. `None` when `Under`.
    pub budget: Option<String>,
}

impl Inner {
    /// The bookings of `project`, oldest first.
    pub(crate) fn assistant_bookings(&self, project: &str) -> Vec<Booked> {
        let run = format!("{RUN_PREFIX}{project}");
        self.log
            .usage_events()
            .unwrap_or_default()
            .into_iter()
            .filter(|e| e.run == run)
            .map(|e| {
                let n = |k: &str| e.payload[k].as_u64().unwrap_or(0);
                Booked {
                    member: e.payload["member"].as_str().unwrap_or_default().to_string(),
                    tokens: n("input_tokens") + n("output_tokens"),
                    usd: e.payload["cost_usd"].as_f64().unwrap_or(0.0),
                }
            })
            .collect()
    }
}

impl Factory {
    /// Book one turn. `member` is the person (`""`: none). A failed write is an error: the caller
    /// shows it, the turn already ran.
    pub fn book_assistant(
        &self,
        project: &str,
        member: &str,
        input_tokens: u64,
        output_tokens: u64,
        cost_usd: f64,
    ) -> crate::Result<()> {
        let mut inner = self.lock();
        let payload = serde_json::json!({
            "type": "usage",
            "member": member,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
        });
        let ts = inner.clock.now().as_millis() as u64;
        inner.log.append(
            &format!("{RUN_PREFIX}{project}"),
            None,
            shipyard_store::run_log::kind::RUNNER,
            &payload,
            ts,
        )?;
        inner.add_booking(project, &payload, ts);
        Ok(())
    }

    /// The worse of the day budget and the member budget, with the money spent so far today.
    /// Default: no budget, so `Under` (Q-023).
    pub fn assistant_gate(&self, project: &str, member: &str) -> Gate {
        let inner = self.lock();
        let Some(p) = inner.projects.get(project) else {
            return Gate {
                level: BudgetLevel::Under,
                budget: None,
            };
        };
        let b = &p.automation.budgets;
        let today = iso(Duration::from_secs(inner.clock.now().as_secs()))[..10].to_string();
        let day = b.for_day(&today).map(|usd| {
            let spent = inner.day_spend(project).get(&today).map_or(0.0, |d| d.1);
            (run::budget_level(spent, usd), format!("day {today}"))
        });
        let who = b.for_member(member).map(|usd| {
            let spent = inner.member_spend(project).get(member).map_or(0.0, |d| d.1);
            (run::budget_level(spent, usd), format!("member {member}"))
        });
        let rank = |l: BudgetLevel| match l {
            BudgetLevel::Under => 0,
            BudgetLevel::Alert => 1,
            BudgetLevel::Spent => 2,
        };
        let (level, name) = [day, who]
            .into_iter()
            .flatten()
            .max_by_key(|(l, _)| rank(*l))
            .unwrap_or((BudgetLevel::Under, String::new()));
        Gate {
            level,
            budget: (level != BudgetLevel::Under).then_some(name),
        }
    }
}
