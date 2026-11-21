//! The close guard. It holds the
//! window while work is in flight: a factory run
//! or an assistant turn. The window asks, and `close_anyway` answers once.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use serde::Serialize;
use shipyard_engine::ports::Dispatch;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, Window};

use crate::commands::{Api, AppState, Res, blocking, err};

/// Set once the person answered "close anyway": the second close request goes through.
static FORCED: AtomicBool = AtomicBool::new(false);

/// How many editors hold an unsaved draft. The UI sets it on each change.
static DRAFTS: AtomicU32 = AtomicU32::new(0);

/// What runs now, for the sentence of the dialog.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
pub struct InFlight {
    pub runs: u32,
    pub turns: u32,
    pub drafts: u32,
}

pub fn in_flight(s: &AppState) -> InFlight {
    InFlight {
        runs: s.factory.factory.active_runs().len() as u32,
        turns: crate::assistant::busy_turns() as u32,
        drafts: DRAFTS.load(Ordering::SeqCst),
    }
}

fn holds(f: InFlight, forced: bool) -> bool {
    !forced && (f.runs > 0 || f.turns > 0 || f.drafts > 0)
}

/// Called for each close request of the window. It holds the window and tells the UI, or it
/// commits the pending changes when the project asks for that and lets the window close.
pub fn on_close_requested(app: &AppHandle, window: &Window, api: &tauri::CloseRequestApi) {
    let state = app.state::<AppState>();
    if holds(in_flight(&state), FORCED.load(Ordering::SeqCst)) {
        api.prevent_close();
        let _ = window.emit("close-guard", ());
        return;
    }
    crate::window::remember(window, &state.dir);
    // A failed commit or push must not trap the person in the app.
    let committed = crate::auto_commit::run(&state, "chore: save changes on close [shipyard]");
    let ahead = crate::commands::code::status(&state).map_or(0, |c| c.ahead);
    if pushes(
        &committed,
        ahead,
        shipyard_store::prefs::Prefs::load(&state.dir).close_push,
    ) {
        let _ = crate::commands::code::push(&state);
    }
}

/// The close pushes the branch, with every unpushed commit, only when the person asked for it.
fn pushes(committed: &Result<Option<String>, String>, ahead: u32, close_push: bool) -> bool {
    close_push && (ahead > 0 || matches!(committed, Ok(Some(_))))
}

#[tauri::command]
#[specta::specta]
pub async fn close_guard_state(app: AppHandle) -> Api<InFlight> {
    blocking(app, |s| Ok(in_flight(s))).await
}

/// One run of the open project that works now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ProjectRun {
    pub run: String,
    /// The ticket.
    pub key: String,
}

/// The runs of the open project that have not ended: what the question of a project close lists
/// (`shell-setup-rights` REQ-012). The runs of other projects do not count.
pub fn project_runs(s: &AppState) -> Res<Vec<ProjectRun>> {
    let Some(a) = crate::commands::sync::active(s)? else {
        return Ok(Vec::new());
    };
    Ok(s.factory
        .factory
        .active_runs()
        .into_iter()
        .filter(|r| r.project == a.entry.id)
        .map(|r| ProjectRun {
            run: r.run_id,
            key: r.key,
        })
        .collect())
}

/// Stop each run of the open project, then close the project. A run that the person may not stop
/// (`runs.start`) keeps the project open: a refusal here must never close a project over runs
/// that go on. Keep them working is the plain `projects_close`.
pub fn close_stopping(s: &AppState) -> Res<()> {
    for r in project_runs(s)? {
        crate::factory::cancel(s, &r.run)?;
    }
    crate::commands::projects::close(s)
}

/// The runs of the open project that work, for the question of a project close.
#[tauri::command]
#[specta::specta]
pub async fn projects_close_state(app: AppHandle) -> Api<Vec<ProjectRun>> {
    blocking(app, project_runs).await
}

/// Stop the runs of the open project and close it.
#[tauri::command]
#[specta::specta]
pub async fn projects_close_stop(app: AppHandle) -> Api<()> {
    blocking(app, close_stopping).await
}

/// The editors with an unsaved draft now.
#[tauri::command]
#[specta::specta]
pub async fn close_guard_drafts(count: u32) -> Api<()> {
    DRAFTS.store(count, Ordering::SeqCst);
    Ok(())
}

/// Close past the guard. `destroy` does not raise a second request.
#[tauri::command]
#[specta::specta]
pub async fn close_anyway(window: Window) -> Api<()> {
    FORCED.store(true, Ordering::SeqCst);
    window.destroy().map_err(|e| err(e).into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn work_in_flight_holds_the_window_until_the_person_answers() {
        let idle = InFlight {
            runs: 0,
            turns: 0,
            drafts: 0,
        };
        assert!(!holds(idle, false));
        assert!(holds(
            InFlight {
                runs: 1,
                turns: 0,
                drafts: 0
            },
            false
        ));
        assert!(holds(
            InFlight {
                runs: 0,
                turns: 2,
                drafts: 0
            },
            false
        ));
        assert!(holds(
            InFlight {
                runs: 0,
                turns: 0,
                drafts: 1
            },
            false
        ));
        assert!(!holds(
            InFlight {
                runs: 1,
                turns: 1,
                drafts: 1
            },
            true
        ));
    }

    #[test]
    fn stop_them_cancels_the_runs_of_the_project_and_closes_it() {
        use crate::factory::tests::fx;
        use shipyard_core::pickup::Writes;
        let f = fx(Writes::default());
        let (a, b) = (f.start("SHIP-1"), f.start("SHIP-2"));
        let runs: Vec<String> = project_runs(&f.s)
            .unwrap()
            .into_iter()
            .map(|r| r.run)
            .collect();
        assert_eq!(runs.len(), 2);
        assert!(runs.contains(&a) && runs.contains(&b));
        close_stopping(&f.s).unwrap();
        assert!(f.s.registry().unwrap().active().is_none());
        assert!(f.s.factory.factory.active_runs().is_empty());
    }

    #[test]
    fn keep_them_working_closes_the_project_and_the_runs_go_on() {
        use crate::factory::tests::fx;
        use shipyard_core::pickup::Writes;
        let f = fx(Writes::default());
        f.start("SHIP-1");
        crate::commands::projects::close(&f.s).unwrap();
        assert!(f.s.registry().unwrap().active().is_none());
        assert_eq!(f.s.factory.factory.active_runs().len(), 1);
        // With no project open, the question has no run to list.
        assert!(project_runs(&f.s).unwrap().is_empty());
    }

    #[test]
    fn a_person_who_may_not_stop_runs_cannot_stop_them_and_the_project_stays_open() {
        use crate::factory::tests::fx;
        use shipyard_core::pickup::Writes;
        use shipyard_core::work::{Member, Team};
        use shipyard_store::work::{TEAM_PATH, write_team};
        let f = fx(Writes::default());
        f.start("SHIP-1");
        // The team names an admin that is not the person: the person is a viewer.
        let team = Team {
            members: vec![Member {
                name: "Root".into(),
                handle: "root".into(),
                emails: vec!["root@example.com".into()],
                role: "techlead".into(),
                admin: true,
                ..Member::default()
            }],
            ..Team::default()
        };
        std::fs::create_dir_all(f.repo.path().join(".shipyard")).unwrap();
        std::fs::write(
            f.repo.path().join(TEAM_PATH),
            write_team(&team, None).unwrap(),
        )
        .unwrap();
        let e = close_stopping(&f.s).unwrap_err();
        assert!(e.starts_with("missing right runs.start"), "{e}");
        assert!(f.s.registry().unwrap().active().is_some());
        assert_eq!(f.s.factory.factory.active_runs().len(), 1);
    }

    #[test]
    fn the_close_pushes_every_unpushed_commit_and_only_when_asked() {
        let made = Ok(Some("abc".to_string()));
        assert!(pushes(&made, 0, true));
        assert!(!pushes(&made, 0, false));
        assert!(!pushes(&Ok(None), 0, true));
        assert!(!pushes(&Err("busy".into()), 0, true));
        // Earlier commits wait for the push, with or without a commit at close.
        assert!(pushes(&Ok(None), 2, true));
        assert!(pushes(&Err("busy".into()), 1, true));
        assert!(!pushes(&Ok(None), 2, false));
    }
}
