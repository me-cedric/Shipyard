//! The mirror of work items and pull requests, and the claim table (spec `sync`, REQ-005,
//! REQ-008, REQ-010, REQ-016). SQLite in the app data folder. The tracker and the forge stay the
//! source of truth: nothing here is a source for a write to them.

use std::collections::HashSet;
use std::path::Path;

use rusqlite::{Connection, OptionalExtension, params};
use shipyard_core::pickup::{PullSnapshot, SyncEvent, Ticket};

use crate::Result;

const VERSION: i64 = 1;

/// The sync state of one connection (REQ-013, REQ-014).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncState {
    /// Unix seconds when the last good poll started.
    pub last_ok: Option<u64>,
    /// Failed polls since the last good one.
    pub failures: u32,
    pub error: Option<String>,
}

/// A claim on this machine (REQ-008).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Claim {
    pub key: String,
    pub machine: String,
    /// The ticket status at pickup.
    pub status: String,
    /// The stamp is on the ticket (REQ-009).
    pub stamped: bool,
    /// Unix seconds.
    pub claimed_at: u64,
}

/// What one good poll writes. The whole commit is one transaction.
pub struct Poll<'a> {
    /// Only the new and changed rows.
    pub tickets: &'a [Ticket],
    pub pulls: &'a [PullSnapshot],
    /// Comment ids to remember, by ticket key.
    pub seen: &'a [(String, Vec<String>)],
    /// Events to hand off. They wait in the outbox until `ack`.
    pub events: &'a [SyncEvent],
    /// Unix seconds when the poll started. `None` for a poll that read only part of the list:
    /// the cursor stays, so the next poll still asks for what this one did not read.
    pub at: Option<u64>,
}

pub struct Mirror {
    conn: Connection,
}

impl Mirror {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        // Two engines can share the file: wait for the lock instead of failing.
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        Self::init(conn)
    }

    pub fn open_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Self> {
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        // 0 is a new file. Another number is an older layout.
        if v != 0 && v != VERSION {
            // Derived data except the claims, and a claim is rebuilt from the active runs.
            conn.execute_batch(
                "DROP TABLE IF EXISTS tickets; DROP TABLE IF EXISTS pulls; DROP TABLE IF EXISTS state;
                 DROP TABLE IF EXISTS seen; DROP TABLE IF EXISTS outbox; DROP TABLE IF EXISTS adopted;
                 DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS claims;",
            )?;
        }
        conn.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS tickets(
                 source TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL,
                 PRIMARY KEY(source, key));
             CREATE TABLE IF NOT EXISTS pulls(
                 source TEXT NOT NULL, number INTEGER NOT NULL, body TEXT NOT NULL,
                 PRIMARY KEY(source, number));
             CREATE TABLE IF NOT EXISTS state(
                 source TEXT PRIMARY KEY, last_ok INTEGER, failures INTEGER NOT NULL DEFAULT 0,
                 error TEXT);
             CREATE TABLE IF NOT EXISTS seen(
                 source TEXT NOT NULL, key TEXT NOT NULL, comment_id TEXT NOT NULL,
                 PRIMARY KEY(source, key, comment_id));
             CREATE TABLE IF NOT EXISTS outbox(
                 id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS adopted(
                 source TEXT NOT NULL, key TEXT NOT NULL, PRIMARY KEY(source, key));
             CREATE TABLE IF NOT EXISTS links(
                 source TEXT NOT NULL, local TEXT NOT NULL, key TEXT NOT NULL,
                 PRIMARY KEY(source, local), UNIQUE(source, key));
             CREATE TABLE IF NOT EXISTS questions(
                 source TEXT NOT NULL, key TEXT NOT NULL, comment_id TEXT NOT NULL,
                 PRIMARY KEY(source, key, comment_id));
             CREATE TABLE IF NOT EXISTS claims(
                 source TEXT NOT NULL, key TEXT NOT NULL, machine TEXT NOT NULL,
                 status TEXT NOT NULL, stamped INTEGER NOT NULL, claimed_at INTEGER NOT NULL,
                 PRIMARY KEY(source, key));
             PRAGMA user_version = {VERSION};"
        ))?;
        Ok(Self { conn })
    }

    // ---- reads (REQ-005, REQ-016)

    pub fn tickets(&self, source: &str) -> Result<Vec<Ticket>> {
        let mut st = self
            .conn
            .prepare("SELECT body FROM tickets WHERE source = ?1 ORDER BY key")?;
        let rows = st.query_map([source], |r| r.get::<_, String>(0))?;
        rows.map(|b| Ok(serde_json::from_str(&b?)?)).collect()
    }

    pub fn ticket(&self, source: &str, key: &str) -> Result<Option<Ticket>> {
        let body: Option<String> = self
            .conn
            .query_row(
                "SELECT body FROM tickets WHERE source = ?1 AND key = ?2",
                [source, key],
                |r| r.get(0),
            )
            .optional()?;
        Ok(body.map(|b| serde_json::from_str(&b)).transpose()?)
    }

    pub fn pulls(&self, source: &str) -> Result<Vec<PullSnapshot>> {
        let mut st = self
            .conn
            .prepare("SELECT body FROM pulls WHERE source = ?1 ORDER BY number")?;
        let rows = st.query_map([source], |r| r.get::<_, String>(0))?;
        rows.map(|b| Ok(serde_json::from_str(&b?)?)).collect()
    }

    /// A text that changes when a ticket, a pull request or a link of `source` changes. The ref
    /// index uses it to decide whether to read the mirror again. A write replaces a row, and a
    /// replaced row takes a new `rowid`, so the count and the highest `rowid` move with it.
    pub fn fingerprint(&self, source: &str) -> Result<String> {
        let mut out = Vec::new();
        for table in ["tickets", "pulls", "links"] {
            let (n, top): (i64, i64) = self.conn.query_row(
                &format!("SELECT COUNT(*), COALESCE(MAX(rowid), 0) FROM {table} WHERE source = ?1"),
                [source],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            out.push(format!("{n}.{top}"));
        }
        Ok(out.join("-"))
    }

    pub fn state(&self, source: &str) -> Result<SyncState> {
        let row = self
            .conn
            .query_row(
                "SELECT last_ok, failures, error FROM state WHERE source = ?1",
                [source],
                |r| {
                    Ok(SyncState {
                        last_ok: r.get::<_, Option<i64>>(0)?.map(|v| v as u64),
                        failures: r.get::<_, i64>(1)? as u32,
                        error: r.get(2)?,
                    })
                },
            )
            .optional()?;
        Ok(row.unwrap_or(SyncState {
            last_ok: None,
            failures: 0,
            error: None,
        }))
    }

    pub fn seen(&self, source: &str, key: &str) -> Result<HashSet<String>> {
        let mut st = self
            .conn
            .prepare("SELECT comment_id FROM seen WHERE source = ?1 AND key = ?2")?;
        let rows = st.query_map([source, key], |r| r.get(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// The ids of the comments that this system posted as questions on a ticket
    /// (`add-questions-loop` REQ-009). Only these comments hold a question marker.
    pub fn questions(&self, source: &str, key: &str) -> Result<HashSet<String>> {
        let mut st = self
            .conn
            .prepare("SELECT comment_id FROM questions WHERE source = ?1 AND key = ?2")?;
        let rows = st.query_map([source, key], |r| r.get(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    // ---- writes

    /// Remember the id of a question comment that this system posted. The factory calls it right
    /// after the post.
    pub fn question_posted(&self, source: &str, key: &str, comment_id: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO questions(source, key, comment_id) VALUES (?1, ?2, ?3)",
            [source, key, comment_id],
        )?;
        Ok(())
    }

    fn upsert_tickets(tx: &rusqlite::Transaction, source: &str, tickets: &[Ticket]) -> Result<()> {
        for t in tickets {
            tx.execute(
                "INSERT OR REPLACE INTO tickets(source, key, body) VALUES (?1, ?2, ?3)",
                params![source, t.item.key, serde_json::to_string(t)?],
            )?;
        }
        Ok(())
    }

    fn queue(
        tx: &rusqlite::Transaction,
        source: &str,
        seen: &[(String, Vec<String>)],
        events: &[SyncEvent],
    ) -> Result<()> {
        for (key, ids) in seen {
            for id in ids {
                tx.execute(
                    "INSERT OR IGNORE INTO seen(source, key, comment_id) VALUES (?1, ?2, ?3)",
                    params![source, key, id],
                )?;
            }
        }
        for e in events {
            tx.execute(
                "INSERT INTO outbox(body) VALUES (?1)",
                [serde_json::to_string(e)?],
            )?;
        }
        Ok(())
    }

    /// Remember comments and queue events outside a poll. The tick cursor stays.
    pub fn record(
        &self,
        source: &str,
        seen: &[(String, Vec<String>)],
        events: &[SyncEvent],
    ) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        Self::queue(&tx, source, seen, events)?;
        Ok(tx.commit()?)
    }

    /// Rows that do not come from a tick (adopt, import). The tick cursor does not move.
    pub fn put_tickets(&self, source: &str, tickets: &[Ticket]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        Self::upsert_tickets(&tx, source, tickets)?;
        Ok(tx.commit()?)
    }

    /// Like `put_tickets`, but a row that the mirror holds with a later `updated` stays. A list that
    /// a person read a while ago must not overwrite what a poll wrote since. Returns the count
    /// written.
    /// shortcut: `updated` compares as text. One tracker writes one form, so the order holds.
    pub fn put_tickets_newer(&self, source: &str, tickets: &[Ticket]) -> Result<usize> {
        let tx = self.conn.unchecked_transaction()?;
        let mut fresh = Vec::new();
        for t in tickets {
            let held = self.ticket(source, &t.item.key)?;
            if held.is_none_or(|h| h.item.updated <= t.item.updated) {
                fresh.push(t.clone());
            }
        }
        Self::upsert_tickets(&tx, source, &fresh)?;
        tx.commit()?;
        Ok(fresh.len())
    }

    /// One good poll: upsert rows, remember comments, queue events, record the tick. Atomic.
    pub fn commit(&self, source: &str, poll: &Poll) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        Self::upsert_tickets(&tx, source, poll.tickets)?;
        for p in poll.pulls {
            tx.execute(
                "INSERT OR REPLACE INTO pulls(source, number, body) VALUES (?1, ?2, ?3)",
                params![source, p.number as i64, serde_json::to_string(p)?],
            )?;
        }
        Self::queue(&tx, source, poll.seen, poll.events)?;
        tx.execute(
            "INSERT INTO state(source, last_ok, failures, error) VALUES (?1, ?2, 0, NULL)
             ON CONFLICT(source) DO UPDATE SET last_ok = COALESCE(?2, last_ok), failures = 0,
             error = NULL",
            params![source, poll.at.map(|t| t as i64)],
        )?;
        Ok(tx.commit()?)
    }

    /// The mirror stays as it was (REQ-014).
    pub fn mark_failed(&self, source: &str, error: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO state(source, last_ok, failures, error) VALUES (?1, NULL, 1, ?2)
             ON CONFLICT(source) DO UPDATE SET failures = failures + 1, error = ?2",
            params![source, error],
        )?;
        Ok(())
    }

    /// Forgets the failures of a source: its secret or its host changed since they happened.
    pub fn clear_failure(&self, source: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE state SET failures = 0, error = NULL WHERE source = ?1",
            params![source],
        )?;
        Ok(())
    }

    // ---- outbox

    /// The events not yet acknowledged, oldest first.
    pub fn pending_events(&self) -> Result<Vec<(i64, SyncEvent)>> {
        let mut st = self
            .conn
            .prepare("SELECT id, body FROM outbox ORDER BY id")?;
        let rows = st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
        rows.map(|r| {
            let (id, body) = r?;
            Ok((id, serde_json::from_str(&body)?))
        })
        .collect()
    }

    pub fn ack(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM outbox WHERE id = ?1", [id])?;
        Ok(())
    }

    // ---- adopt and link (REQ-015)

    pub fn adopt(&self, source: &str, key: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO adopted(source, key) VALUES (?1, ?2)",
            [source, key],
        )?;
        Ok(())
    }

    pub fn adopted(&self, source: &str) -> Result<Vec<String>> {
        let mut st = self
            .conn
            .prepare("SELECT key FROM adopted WHERE source = ?1 ORDER BY key")?;
        let rows = st.query_map([source], |r| r.get(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// One ticket per local item, one local item per ticket. Linking the same pair again is fine.
    pub fn link(&self, source: &str, local: &str, key: &str) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        let by_local: Option<String> = tx
            .query_row(
                "SELECT key FROM links WHERE source = ?1 AND local = ?2",
                [source, local],
                |r| r.get(0),
            )
            .optional()?;
        let by_key: Option<String> = tx
            .query_row(
                "SELECT local FROM links WHERE source = ?1 AND key = ?2",
                [source, key],
                |r| r.get(0),
            )
            .optional()?;
        match (by_local.as_deref(), by_key.as_deref()) {
            (Some(k), Some(l)) if k == key && l == local => return Ok(()),
            (Some(k), _) => return Err(format!("{local} is already linked to {k}").into()),
            (None, Some(l)) => return Err(format!("{key} is already linked to {l}").into()),
            (None, None) => {}
        }
        tx.execute(
            "INSERT INTO links(source, local, key) VALUES (?1, ?2, ?3)",
            [source, local, key],
        )?;
        Ok(tx.commit()?)
    }

    pub fn unlink(&self, source: &str, local: &str) -> Result<bool> {
        let n = self.conn.execute(
            "DELETE FROM links WHERE source = ?1 AND local = ?2",
            [source, local],
        )?;
        Ok(n == 1)
    }

    /// `(local item, ticket key)`, by local item.
    pub fn links(&self, source: &str) -> Result<Vec<(String, String)>> {
        let mut st = self
            .conn
            .prepare("SELECT local, key FROM links WHERE source = ?1 ORDER BY local")?;
        let rows = st.query_map([source], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    // ---- claims (REQ-008, REQ-010)

    /// Take the claim. `false` when a claim of the ticket exists. The primary key makes it atomic,
    /// also across processes that share the file.
    pub fn claim(
        &self,
        source: &str,
        key: &str,
        machine: &str,
        status: &str,
        stamped: bool,
        now: u64,
    ) -> Result<bool> {
        let n = self.conn.execute(
            "INSERT OR IGNORE INTO claims(source, key, machine, status, stamped, claimed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![source, key, machine, status, stamped, now as i64],
        )?;
        Ok(n == 1)
    }

    pub fn set_stamped(&self, source: &str, key: &str, stamped: bool) -> Result<()> {
        self.conn.execute(
            "UPDATE claims SET stamped = ?3 WHERE source = ?1 AND key = ?2",
            params![source, key, stamped],
        )?;
        Ok(())
    }

    /// `false` when no claim existed.
    pub fn release(&self, source: &str, key: &str) -> Result<bool> {
        let n = self.conn.execute(
            "DELETE FROM claims WHERE source = ?1 AND key = ?2",
            [source, key],
        )?;
        Ok(n == 1)
    }

    pub fn claims(&self, source: &str) -> Result<Vec<Claim>> {
        let mut st = self.conn.prepare(
            "SELECT key, machine, status, stamped, claimed_at FROM claims
             WHERE source = ?1 ORDER BY key",
        )?;
        let rows = st.query_map([source], |r| {
            Ok(Claim {
                key: r.get(0)?,
                machine: r.get(1)?,
                status: r.get(2)?,
                stamped: r.get(3)?,
                claimed_at: r.get::<_, i64>(4)? as u64,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }
}
