//! Adopt, link and import (spec `sync`, REQ-015).

use shipyard_core::pickup::Ticket;

use crate::Result;
use crate::ports::{ListQuery, collect_pages};
use crate::tick::Engine;

/// The most pages that an import reads. A tracker that never ends a list stops here.
const MAX_PAGES: u32 = 1000;

/// The open tickets of the tracker. Nothing is written until `Engine::import`.
pub struct ImportPlan {
    pub tickets: Vec<Ticket>,
}

impl ImportPlan {
    /// The count to show before the person confirms.
    pub fn count(&self) -> usize {
        self.tickets.len()
    }
}

impl Engine {
    /// Read every open ticket of the tracker. It writes nothing (REQ-015).
    pub fn import_plan(&self) -> Result<ImportPlan> {
        let (tickets, truncated) = collect_pages(MAX_PAGES, |cursor| {
            self.tracker.list(&ListQuery {
                since: None,
                cursor,
            })
        })?;
        if truncated {
            return Err(format!("the tracker lists more than {MAX_PAGES} pages").into());
        }
        Ok(ImportPlan { tickets })
    }

    /// Write the plan to the mirror. The tick cursor stays: the next tick still reads the changes
    /// since its last good poll. Returns the count written.
    pub fn import(&self, plan: &ImportPlan) -> Result<usize> {
        self.mirror.put_tickets(&self.cfg.tracker, &plan.tickets)?;
        Ok(plan.tickets.len())
    }

    /// Take one ticket by key into the mirror. Each tick keeps it current, even when the
    /// polled list leaves it out.
    pub fn adopt(&self, key: &str) -> Result<Ticket> {
        let ticket = self.tracker.get(key)?;
        self.mirror
            .put_tickets(&self.cfg.tracker, std::slice::from_ref(&ticket))?;
        self.mirror.adopt(&self.cfg.tracker, key)?;
        Ok(ticket)
    }

    /// Link a local item to a ticket. A ticket that the mirror lacks is adopted first.
    pub fn link(&self, local: &str, key: &str) -> Result<()> {
        if self.mirror.ticket(&self.cfg.tracker, key)?.is_none() {
            self.adopt(key)?;
        }
        self.mirror.link(&self.cfg.tracker, local, key)
    }

    pub fn unlink(&self, local: &str) -> Result<bool> {
        self.mirror.unlink(&self.cfg.tracker, local)
    }
}
