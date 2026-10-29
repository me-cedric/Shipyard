#![allow(dead_code)]

use std::sync::Arc;
use std::time::Duration;

use shipyard_core::pickup::Automation;
use shipyard_engine::fake::{FakeClock, FakeDispatch, FakeForge, FakeTracker, Log};
use shipyard_engine::tick::{Config, Engine};
use shipyard_store::mirror::Mirror;

/// 2026-10-29T10:00:00Z.
pub const START: u64 = 1_793_268_000;

/// One tracker, one forge and one clock. Each machine is an engine with its own mirror and factory.
pub struct World {
    pub clock: FakeClock,
    pub log: Log,
    pub tracker: FakeTracker,
    pub forge: FakeForge,
}

pub struct Machine {
    pub engine: Engine,
    pub dispatch: FakeDispatch,
}

pub fn secs(n: u64) -> Duration {
    Duration::from_secs(n)
}

/// The default automation with the claim stamp switched on or off.
pub fn auto(stamp: bool) -> Automation {
    let mut a = Automation::default();
    a.writes.tracker_comment = stamp;
    a
}

impl World {
    pub fn new() -> Self {
        let clock = FakeClock::new(secs(START));
        let log = Log::default();
        Self {
            tracker: FakeTracker::new(&clock, &log),
            forge: FakeForge::new(&log),
            clock,
            log,
        }
    }

    pub fn machine(&self, name: &str, auto: Automation) -> Machine {
        self.machine_with(name, auto, Mirror::open_memory().unwrap())
    }

    pub fn machine_with(&self, name: &str, auto: Automation, mirror: Mirror) -> Machine {
        let dispatch = FakeDispatch::new(&self.log);
        let mut cfg = Config::new(name, "ship", "jira");
        cfg.forge = Some("github".into());
        let engine = Engine::new(
            cfg,
            auto,
            mirror,
            Box::new(self.tracker.clone()),
            Some(Box::new(self.forge.clone())),
            Arc::new(dispatch.clone()),
            Arc::new(self.clock.clone()),
        )
        .with_jitter(|| 0.5);
        Machine { engine, dispatch }
    }
}
