//! The AI sessions of this computer and their spend (Factory / Sessions and Usage). The reader is
//! `shipyard_agents::machine`; this module adds the budgets, which live in `machine-budgets.json`
//! in the app data folder, and the commands.

use serde::{Deserialize, Serialize};
use shipyard_agents::machine::{self, MachineSession, Roots, SpendRow};
use shipyard_store::project::write_atomic;
use specta::Type;
use std::path::Path;
use tauri::Emitter;

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
const CACHE_FILE: &str = "machine-cache.json";

fn read(dir: &Path) -> Vec<Budget> {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// Tells the views the totals so far while the scan reads. The command result stays the truth.
pub const PROGRESS_EVENT: &str = "machine-spend-progress";

/// The spend of the last `days` days and the budgets.
pub fn spend(s: &AppState, days: u32) -> Spend {
    spend_with(s, days, &|_| {})
}

fn spend_with(
    s: &AppState,
    days: u32,
    progress: &(dyn Fn(machine::SpendProgress) + Sync),
) -> Spend {
    let roots = Roots {
        cache: Some(s.dir.join(CACHE_FILE)),
        ..Roots::from_env()
    };
    Spend {
        rows: machine::report_with(&roots, days, progress),
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
        crate::rights::need_click_local(s, click)?;
        machine::stop(pid)
    })
    .await
}

/// What Take control gives the view: the folder and the command that open the session again in
/// the Shipyard terminal (`shell-setup-rights` REQ-002).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct TakeOver {
    pub cwd: String,
    pub command: String,
}

/// The folder and the resume command of the running session `pid`. `Err` when the session has no
/// resume command, so no session stops that the person cannot take over.
fn take_over_of(sessions: &[MachineSession], pid: u32) -> Res<TakeOver> {
    let found = sessions
        .iter()
        .find(|x| x.pid == Some(pid))
        .ok_or_else(|| format!("no AI session runs as process {pid}"))?;
    let command = machine::resume_command(&found.runner, &found.session)
        .ok_or_else(|| format!("{} has no session to resume", found.runner))?;
    if found.cwd.is_empty() {
        return Err("the session has no folder to resume in".into());
    }
    Ok(TakeOver {
        cwd: found.cwd.clone(),
        command,
    })
}

/// Take control: stop the session and give the command that resumes it. It needs the click of a
/// person, like a stop.
pub fn take_control(s: &AppState, roots: &Roots, pid: u32, click: bool) -> Res<TakeOver> {
    crate::rights::need_click_local(s, click)?;
    let plan = take_over_of(&machine::sessions(roots), pid)?;
    machine::stop(pid)?;
    Ok(plan)
}

#[tauri::command]
#[specta::specta]
pub async fn machine_session_take(app: tauri::AppHandle, pid: u32, click: bool) -> Api<TakeOver> {
    blocking(app, move |s| {
        take_control(s, &Roots::from_env(), pid, click)
    })
    .await
}

/// The last lines of the live output of a session, from the history file of its tool. Empty when
/// the tool writes none that Shipyard reads.
#[tauri::command]
#[specta::specta]
pub async fn machine_session_output(
    app: tauri::AppHandle,
    runner: String,
    session: String,
) -> Api<Vec<String>> {
    blocking(app, move |s| {
        let roots = Roots {
            cache: Some(s.dir.join(CACHE_FILE)),
            ..Roots::from_env()
        };
        Ok(machine::live_output(&roots, &runner, &session, 200))
    })
    .await
}

/// The load of the agent processes: processor and memory.
#[tauri::command]
#[specta::specta]
pub async fn machine_load(app: tauri::AppHandle) -> Api<machine::MachineLoad> {
    blocking(app, |_| Ok(machine::load())).await
}

#[tauri::command]
#[specta::specta]
pub async fn machine_spend(app: tauri::AppHandle, days: u32) -> Api<Spend> {
    let handle = app.clone();
    blocking(app, move |s| {
        Ok(spend_with(s, days, &|p| {
            let _ = handle.emit(PROGRESS_EVENT, p);
        }))
    })
    .await
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

    fn session(runner: &str, id: &str, cwd: &str, pid: Option<u32>) -> MachineSession {
        MachineSession {
            runner: runner.into(),
            session: id.into(),
            cwd: cwd.into(),
            pid,
            ..Default::default()
        }
    }

    #[test]
    fn take_control_resumes_claude_code_and_refuses_what_cannot_resume() {
        let all = [
            session("claude", "abc-1", "/w/app", Some(7)),
            session("gemini", "x", "/w/app", Some(8)),
            session("claude", "", "/w/app", Some(9)),
            session("claude", "abc-2", "", Some(10)),
        ];
        assert_eq!(
            take_over_of(&all, 7).unwrap(),
            TakeOver {
                cwd: "/w/app".into(),
                command: "claude --resume abc-1".into()
            }
        );
        for pid in [8, 9, 10, 99] {
            assert!(take_over_of(&all, pid).is_err(), "{pid}");
        }
    }

    #[test]
    fn take_control_needs_a_click_and_stops_nothing_without_one() {
        let dir = tempfile::tempdir().unwrap();
        let s = state(dir.path());
        let roots = Roots {
            claude: dir.path().join("c"),
            codex: dir.path().join("x"),
            cache: None,
        };
        assert!(
            take_control(&s, &roots, 1, false)
                .unwrap_err()
                .contains("click")
        );
        // With a click and no such session, nothing stops.
        assert!(take_control(&s, &roots, 1, true).is_err());
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
