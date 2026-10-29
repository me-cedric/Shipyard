//! Claims and claim stamps (spec `sync`, REQ-008, REQ-009, REQ-010).
//!
//! A claim has two layers. The local claim is a row in the store: two runs on one machine never
//! claim one ticket. The stamp is a mark on the ticket: two machines never run one ticket.
//! The oldest live stamp wins (by first claim: a refresh keeps it), so two machines that write at
//! once agree on the winner after a read-back. A stamp is live while its age is under the stale time (`q:Q-021`).
//! The stamp is a tracker write. It follows `Writes::stamp_allowed`. With the switch off the claim
//! stays local: this machine still reads the stamps of others and yields to a live one.

use std::time::Duration;

use shipyard_store::mirror::Mirror;

use crate::Result;
use crate::ports::{PortResult, TrackerPort};

pub struct Claims<'a> {
    pub mirror: &'a Mirror,
    pub tracker: &'a dyn TrackerPort,
    pub source: &'a str,
    pub machine: &'a str,
    pub stale: Duration,
    /// This machine may write the stamp: the switch is on and the tracker can hold one.
    pub stamp: bool,
    pub now: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// `stamped: false` means a local claim only.
    Won { stamped: bool },
    /// This machine already holds a claim on the ticket.
    Held,
    /// Another machine holds a live stamp.
    Lost { machine: String },
    /// The tracker failed or refused. The local claim is released.
    Failed(String),
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Released {
    pub existed: bool,
    /// The claim is gone, but the stamp stays until it goes stale.
    pub stamp_error: Option<String>,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Heartbeat {
    /// Keys whose live stamp belongs to another machine now. The caller stops those runs.
    pub lost: Vec<String>,
    /// Keys of claims that no active run holds. They are released.
    pub orphans: Vec<String>,
    pub errors: Vec<String>,
}

impl Claims<'_> {
    /// The machine of the oldest live stamp, by first claim.
    fn leader(&self, key: &str) -> PortResult<Option<String>> {
        Ok(self
            .tracker
            .stamps(key)?
            .into_iter()
            .find(|s| s.age < self.stale)
            .map(|s| s.machine))
    }

    fn foreign(&self, leader: Option<String>) -> Option<String> {
        leader.filter(|m| m != self.machine)
    }

    /// Take the claim. Call it only for a ticket that the pickup rules chose.
    pub fn claim(&self, key: &str, status: &str) -> Result<Outcome> {
        let at = self.now.as_secs();
        if !self
            .mirror
            .claim(self.source, key, self.machine, status, false, at)?
        {
            return Ok(Outcome::Held);
        }
        let outcome = self.stamp(key);
        match &outcome {
            Outcome::Won { stamped: true } => self.mirror.set_stamped(self.source, key, true)?,
            Outcome::Won { .. } => {}
            _ => {
                self.mirror.release(self.source, key)?;
            }
        }
        Ok(outcome)
    }

    fn stamp(&self, key: &str) -> Outcome {
        // Reads need no switch: a live stamp of another machine always ends the claim.
        match self.leader(key).map(|l| self.foreign(l)) {
            Err(e) => return Outcome::Failed(e),
            Ok(Some(machine)) => return Outcome::Lost { machine },
            Ok(None) => {}
        }
        if !self.stamp {
            return Outcome::Won { stamped: false };
        }
        if let Err(e) = self.tracker.write_stamp(key, self.machine) {
            return Outcome::Failed(e);
        }
        // Read back: a machine that wrote at the same moment may be older than this one.
        match self.leader(key).map(|l| self.foreign(l)) {
            Ok(None) => Outcome::Won { stamped: true },
            other => {
                // Best effort: a stamp that stays goes stale in the stale time.
                let _ = self.tracker.clear_stamp(key, self.machine);
                match other {
                    Ok(Some(machine)) => Outcome::Lost { machine },
                    Err(e) => Outcome::Failed(e),
                    Ok(None) => unreachable!(),
                }
            }
        }
    }

    /// The run ends: release the claim and remove the stamp (REQ-010).
    pub fn release(&self, key: &str) -> Result<Released> {
        let stamped = self
            .mirror
            .claims(self.source)?
            .iter()
            .any(|c| c.key == key && c.stamped);
        let stamp_error = if stamped {
            self.tracker.clear_stamp(key, self.machine).err()
        } else {
            None
        };
        let existed = self.mirror.release(self.source, key)?;
        Ok(Released {
            existed,
            stamp_error,
        })
    }

    /// Once per tick. A claim without an active run is released. For the others: yield to a live
    /// stamp of another machine, else refresh the own stamp so that it does not go stale. With the
    /// switch off (`stamp: false`) no refresh is a tracker write.
    pub fn heartbeat(&self, active: &[String]) -> Result<Heartbeat> {
        let mut out = Heartbeat::default();
        for c in self.mirror.claims(self.source)? {
            if !active.contains(&c.key) {
                let r = self.release(&c.key)?;
                out.errors
                    .extend(r.stamp_error.map(|e| format!("{}: {e}", c.key)));
                out.orphans.push(c.key);
                continue;
            }
            match self.leader(&c.key).map(|l| self.foreign(l)) {
                Err(e) => out.errors.push(format!("{}: {e}", c.key)),
                Ok(Some(_)) => out.lost.push(c.key),
                Ok(None) if c.stamped && self.stamp => {
                    if let Err(e) = self.tracker.write_stamp(&c.key, self.machine) {
                        out.errors.push(format!("{}: {e}", c.key));
                    }
                }
                Ok(None) => {}
            }
        }
        Ok(out)
    }
}
