//! The sync engine: the tick, claims, hand-off and import (spec `sync`). It is synchronous, like
//! the adapters: the app runs [`tick::Engine::run`] on its own thread. The engine talks to the
//! trackers, the forges and the factory through the traits in [`ports`], so a test uses the
//! fakes in [`fake`] and the app wraps the real adapters.
//! The factory ([`run_engine::Factory`]) implements [`ports::Dispatch`]: runs, workflows, clocks,
//! approvals ([`approvals`]) and the questions loop ([`questions`]). A restart takes the runs back
//! from the run log file ([`persist`]). The agent tools that need the run are in [`tools`].

pub mod approvals;
pub mod children;
pub mod claims;
pub mod fake;
pub mod feedback;
mod fence;
pub mod handoff;
pub mod import;
mod jobs;
pub mod merge;
pub mod persist;
pub mod ports;
pub mod pull_request;
pub mod questions;
pub mod review;
pub mod run_engine;
pub mod tick;
pub mod tools;
pub mod usage;

use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub use shipyard_store::{Error, Result};

/// Time since the Unix epoch. A test uses [`fake::FakeClock`].
pub trait Clock: Send + Sync {
    fn now(&self) -> Duration;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> Duration {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
    }
}

/// `2026-10-29T10:00:00Z`. The form that a tracker accepts for "updated since".
pub fn iso(t: Duration) -> String {
    let secs = t.as_secs();
    let (days, rest) = ((secs / 86_400) as i64, secs % 86_400);
    // Civil date from a day count (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}
