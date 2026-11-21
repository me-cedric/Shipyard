//! The budget notice (`shell-setup-rights` REQ-007): "A budget reaches Warn at". It reads the
//! monthly budgets of this computer and what each AI tool spent this month.
//!
//! The level is Warn at of the open project (`spec:runs-recipes#REQ-006`), in
//! `.shipyard/automation.yaml`. With no project or no valid file, it is [`DEFAULT_WARN_AT`].

use serde::Serialize;
use shipyard_agents::machine::SpendRow;
use specta::Type;

use crate::commands::{Api, AppState, blocking};
use crate::machine::Budget;

/// The share of a budget at which the notice shows when the project sets no Warn at.
pub const DEFAULT_WARN_AT: f64 = shipyard_core::run::BUDGET_ALERT;

/// The Warn at level of the budgets, from 0 to 1: the setting of the open project.
pub fn warn_at(s: &AppState) -> f64 {
    use shipyard_store::automation_file::{AutomationRead, read_automation};
    match crate::factory::root_of(s).map(|(_, root)| read_automation(&root)) {
        Ok(Ok(AutomationRead::Valid(a))) => a.budgets.warn(),
        _ => DEFAULT_WARN_AT,
    }
}

/// A budget that reached the Warn at level this month.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BudgetReached {
    /// An empty text is the budget of all AI tools together.
    pub runner: String,
    pub spent_usd: f64,
    pub budget_usd: f64,
    /// The share of the budget that is spent, in percent, rounded down.
    pub percent: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BudgetStatus {
    /// The level in percent, as a whole number: the label of the setting reads it.
    pub warn_percent: u32,
    pub month: String,
    pub reached: Vec<BudgetReached>,
}

/// The budgets that reached `warn_at` (0 to 1) in `month` (`YYYY-MM`). A budget of 0 never
/// reaches it: it means no money is set, and a division by it has no meaning.
pub fn reached(
    rows: &[SpendRow],
    budgets: &[Budget],
    month: &str,
    warn_at: f64,
) -> Vec<BudgetReached> {
    budgets
        .iter()
        .filter(|b| b.usd > 0.0)
        .filter_map(|b| {
            let spent: f64 = rows
                .iter()
                .filter(|r| {
                    r.day.starts_with(month) && (b.runner.is_empty() || r.runner == b.runner)
                })
                .map(|r| r.cost_usd)
                .sum();
            (spent >= b.usd * warn_at).then(|| BudgetReached {
                runner: b.runner.clone(),
                spent_usd: spent,
                budget_usd: b.usd,
                percent: (spent / b.usd * 100.0) as u32,
            })
        })
        .collect()
}

pub fn status(s: &AppState) -> BudgetStatus {
    let month = shipyard_agents::machine::day_string(std::time::SystemTime::now())[..7].to_string();
    let spend = crate::machine::spend(s, 31);
    let warn = warn_at(s).clamp(0.0, 1.0);
    BudgetStatus {
        warn_percent: (warn * 100.0).round() as u32,
        reached: reached(&spend.rows, &spend.budgets, &month, warn),
        month,
    }
}

/// The budgets that reached Warn at this month, for the notice.
#[tauri::command]
#[specta::specta]
pub async fn budget_status(app: tauri::AppHandle) -> Api<BudgetStatus> {
    blocking(app, |s| Ok(status(s))).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(day: &str, runner: &str, usd: f64) -> SpendRow {
        SpendRow {
            day: day.into(),
            runner: runner.into(),
            cost_usd: usd,
            ..Default::default()
        }
    }

    fn budget(runner: &str, usd: f64) -> Budget {
        Budget {
            runner: runner.into(),
            usd,
        }
    }

    #[test]
    fn a_budget_reaches_warn_at_when_the_month_spend_gets_there() {
        let rows = [
            row("2026-11-02", "claude", 40.0),
            row("2026-11-09", "claude", 30.0),
            row("2026-10-30", "claude", 500.0),
            row("2026-11-03", "codex", 5.0),
        ];
        let b = [
            budget("claude", 100.0),
            budget("codex", 100.0),
            budget("", 100.0),
        ];
        let r = reached(&rows, &b, "2026-11", 0.7);
        let names: Vec<&str> = r.iter().map(|x| x.runner.as_str()).collect();
        // 70 of 100 for claude, 5 of 100 for codex, 75 of 100 for all.
        assert_eq!(names, ["claude", ""]);
        assert_eq!((r[0].percent, r[1].percent), (70, 75));
        assert!(reached(&rows, &b, "2026-11", 0.8).is_empty());
        assert!(reached(&rows, &[budget("claude", 0.0)], "2026-11", 0.8).is_empty());
    }

    #[test]
    fn the_seam_gives_the_default_of_80_percent() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().to_path_buf());
        assert_eq!(warn_at(&s), 0.8);
        assert_eq!(status(&s).warn_percent, 80);
    }
}
