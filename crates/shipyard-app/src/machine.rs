//! The AI sessions of this computer and their spend (Factory / Sessions and Usage). The reader is
//! `shipyard_agents::machine`; this module adds the budgets, which live in `machine-budgets.json`
//! in the app data folder, and the commands.

use serde::{Deserialize, Serialize};
use shipyard_agents::machine::{self, MachineSession, Roots, SpendRow};
use shipyard_store::project::write_atomic;
use specta::Type;
use std::path::Path;

use crate::commands::{Api, AppState, Res, blocking, err};

/// A budget for one month. An empty `runner` is the budget of all runners together.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Budget {
    pub runner: String,
    pub usd: f64,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct Spend {
    pub rows: Vec<SpendRow>,
    pub budgets: Vec<Budget>,
}

const FILE: &str = "machine-budgets.json";

fn read(dir: &Path) -> Vec<Budget> {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// The spend of the last `days` days and the budgets.
pub fn spend(s: &AppState, days: u32) -> Spend {
    Spend {
        rows: machine::report(&Roots::from_env(), days),
        budgets: read(&s.dir),
    }
}

/// Set the monthly budget of a runner (`""` for all). `None` removes it.
pub fn budget_set(s: &AppState, runner: &str, usd: Option<f64>) -> Res<Vec<Budget>> {
    if usd.is_some_and(|u| !u.is_finite() || u < 0.0) {
        return Err("the budget must be 0 or more".into());
    }
    if !runner.is_empty()
        && !runner
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("the runner name has bad characters".into());
    }
    let _g = s.guard();
    let mut all = read(&s.dir);
    all.retain(|b| b.runner != runner);
    if let Some(usd) = usd {
        all.push(Budget {
            runner: runner.into(),
            usd,
        });
    }
    all.sort_by(|a, b| a.runner.cmp(&b.runner));
    let text = serde_json::to_vec_pretty(&all).map_err(err)?;
    write_atomic(&s.dir.join(FILE), &text).map_err(err)?;
    Ok(all)
}

#[tauri::command]
#[specta::specta]
pub async fn machine_sessions(app: tauri::AppHandle) -> Api<Vec<MachineSession>> {
    blocking(app, |_| Ok(machine::sessions(&Roots::from_env()))).await
}

#[tauri::command]
#[specta::specta]
pub async fn machine_session_stop(app: tauri::AppHandle, pid: u32, click: bool) -> Api<()> {
    blocking(app, move |s| {
        crate::work::need_click(s, click)?;
        machine::stop(pid)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn machine_spend(app: tauri::AppHandle, days: u32) -> Api<Spend> {
    blocking(app, move |s| Ok(spend(s, days))).await
}

#[tauri::command]
#[specta::specta]
pub async fn machine_budget_set(
    app: tauri::AppHandle,
    runner: String,
    usd: Option<f64>,
) -> Api<Vec<Budget>> {
    blocking(app, move |s| budget_set(s, &runner, usd)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connections::Connections;
    use std::sync::Arc;

    fn state(dir: &Path) -> AppState {
        AppState::with_connections(dir.to_path_buf(), Arc::new(Connections::system(dir)))
    }

    #[test]
    fn a_budget_is_saved_replaced_and_removed_and_a_bad_one_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let s = state(dir.path());
        assert!(budget_set(&s, "", Some(-1.0)).is_err());
        assert!(budget_set(&s, "a/b", Some(1.0)).is_err());
        budget_set(&s, "claude", Some(50.0)).unwrap();
        let all = budget_set(&s, "claude", Some(80.0)).unwrap();
        assert_eq!(
            all,
            [Budget {
                runner: "claude".into(),
                usd: 80.0
            }]
        );
        assert_eq!(spend(&s, 30).budgets, all);
        assert!(budget_set(&s, "claude", None).unwrap().is_empty());
    }
}
