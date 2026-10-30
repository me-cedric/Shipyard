//! The close guard. It holds the
//! window while work is in flight: a factory run
//! or an assistant turn. The window asks, and `close_anyway` answers once.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use shipyard_engine::ports::Dispatch;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, Window};

use crate::commands::{AppState, Res, blocking, err};

/// Set once the person answered "close anyway": the second close request goes through.
static FORCED: AtomicBool = AtomicBool::new(false);

/// What runs now, for the sentence of the dialog.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
pub struct InFlight {
    pub runs: u32,
    pub turns: u32,
}

pub fn in_flight(s: &AppState) -> InFlight {
    InFlight {
        runs: s.factory.factory.active_runs().len() as u32,
        turns: crate::assistant::busy_turns() as u32,
    }
}

fn holds(f: InFlight, forced: bool) -> bool {
    !forced && (f.runs > 0 || f.turns > 0)
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
    // A failed commit must not trap the person in the app.
    let _ = crate::auto_commit::run(&state, "chore: save changes on close [shipyard]");
}

#[tauri::command]
#[specta::specta]
pub async fn close_guard_state(app: AppHandle) -> Res<InFlight> {
    blocking(app, |s| Ok(in_flight(s))).await
}

/// Close past the guard. `destroy` does not raise a second request.
#[tauri::command]
#[specta::specta]
pub async fn close_anyway(window: Window) -> Res<()> {
    FORCED.store(true, Ordering::SeqCst);
    window.destroy().map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn work_in_flight_holds_the_window_until_the_person_answers() {
        let idle = InFlight { runs: 0, turns: 0 };
        assert!(!holds(idle, false));
        assert!(holds(InFlight { runs: 1, turns: 0 }, false));
        assert!(holds(InFlight { runs: 0, turns: 2 }, false));
        assert!(!holds(InFlight { runs: 1, turns: 1 }, true));
    }
}
