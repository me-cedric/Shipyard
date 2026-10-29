//! The append-only run log (spec `factory`, REQ-021, REQ-034). SQLite in the app data folder, one
//! file for every run of every project. The store inserts and reads. It never updates or deletes:
//! the file refuses both with triggers, so raw SQL fails too. The UI and the ticket summary read
//! this one log.
//!
//! The file holds one more table, `snapshots`: the engine saves its in-memory state there after
//! each change and reads it at the start. A snapshot is derived data that names the last log
//! event that it covers (`event`). The events after it tell the engine which writes went out
//! before a crash. The log stays the record; a snapshot can be replaced.

use std::path::Path;

use rusqlite::{Connection, Row, params};
use serde_json::Value;

use crate::Result;

const VERSION: i64 = 1;

/// The kinds that REQ-021 names. A kind is plain text: the engine may add more, such as `answer`
/// or `late_answer` for `questions-loop`.
pub mod kind {
    /// A run state change: `{"from": "Queued", "to": "Claimed", "event": ...}`.
    pub const STATE: &str = "state";
    /// An agent tool call.
    pub const TOOL: &str = "tool";
    /// An event of the runner: a message, a turn, a cost.
    pub const RUNNER: &str = "runner";
    /// A write to a tracker, a forge or a remote, sent or held as an approval.
    pub const WRITE: &str = "write";
    /// The pull request of a run: `{"ref": "pr:<forge>:<number>"}` (`delivery` REQ-017).
    pub const PR: &str = "pr";
    /// A note for a person: a refused transition, a late answer, an edit.
    pub const NOTE: &str = "note";
}

/// The saved engine state of one key, such as `run:<ulid>` or `meta`.
#[derive(Debug, Clone, PartialEq)]
pub struct Snapshot {
    pub key: String,
    /// The last log event that the snapshot covers. `0`: none of this key.
    pub event: i64,
    pub value: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Event {
    /// Grows with each event, in all runs. It is the order and the cursor of a tail.
    pub id: i64,
    /// The ULID of `run:<ulid>`.
    pub run: String,
    /// The step id of `run:<ulid>/<step-id>`, when the event belongs to a step.
    pub step: Option<String>,
    pub kind: String,
    pub payload: Value,
    /// The caller's clock, in Unix milliseconds. The store never reads a clock.
    pub ts: u64,
}

pub struct RunLog {
    conn: Connection,
}

impl RunLog {
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
        // The log is the record of what ran. A layout that this build does not know is an
        // error, never a reset.
        if v != 0 && v != VERSION {
            return Err(format!("run log layout {v} is not known (expected {VERSION})").into());
        }
        conn.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS events(
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 run TEXT NOT NULL CHECK(run <> ''),
                 step TEXT,
                 kind TEXT NOT NULL,
                 payload TEXT NOT NULL,
                 ts INTEGER NOT NULL);
             CREATE INDEX IF NOT EXISTS events_run ON events(run, id);
             CREATE TABLE IF NOT EXISTS snapshots(
                 key TEXT PRIMARY KEY, event INTEGER NOT NULL, value TEXT NOT NULL);
             CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
                 BEGIN SELECT RAISE(ABORT, 'the run log is append-only'); END;
             CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
                 BEGIN SELECT RAISE(ABORT, 'the run log is append-only'); END;
             PRAGMA user_version = {VERSION};"
        ))?;
        Ok(Self { conn })
    }

    /// Add one event. Returns its id.
    pub fn append(
        &self,
        run: &str,
        step: Option<&str>,
        kind: &str,
        payload: &Value,
        ts: u64,
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO events(run, step, kind, payload, ts) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![run, step, kind, serde_json::to_string(payload)?, ts as i64],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Every event of a run, oldest first.
    pub fn run(&self, run: &str) -> Result<Vec<Event>> {
        self.query("WHERE run = ?1 ORDER BY id", params![run])
    }

    /// The events of a run after `id`, oldest first.
    pub fn after(&self, run: &str, id: i64) -> Result<Vec<Event>> {
        self.query("WHERE run = ?1 AND id > ?2 ORDER BY id", params![run, id])
    }

    /// At most `limit` events of a run after `id`, oldest first. A view pages with the last id.
    pub fn page(&self, run: &str, id: i64, limit: usize) -> Result<Vec<Event>> {
        self.query(
            "WHERE run = ?1 AND id > ?2 ORDER BY id LIMIT ?3",
            params![run, id, limit as i64],
        )
    }

    /// The id of the newest event of a run. `0`: the run has none.
    pub fn last_id(&self, run: &str) -> Result<i64> {
        Ok(self.conn.query_row(
            "SELECT COALESCE(MAX(id), 0) FROM events WHERE run = ?1",
            [run],
            |r| r.get(0),
        )?)
    }

    /// Save or replace the snapshot of `key`. Never touches an event.
    pub fn save_snapshot(&self, key: &str, event: i64, value: &Value) -> Result<()> {
        self.conn.execute(
            "INSERT INTO snapshots(key, event, value) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET event = ?2, value = ?3",
            params![key, event, serde_json::to_string(value)?],
        )?;
        Ok(())
    }

    /// Every snapshot, by key.
    pub fn snapshots(&self) -> Result<Vec<Snapshot>> {
        let mut st = self
            .conn
            .prepare("SELECT key, event, value FROM snapshots ORDER BY key")?;
        let rows = st.query_map([], |r| {
            let text: String = r.get(2)?;
            Ok(Snapshot {
                key: r.get(0)?,
                event: r.get(1)?,
                value: serde_json::from_str(&text).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        2,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// The events after `id` in all runs, oldest first, at most `limit`. The tail of the UI.
    pub fn since(&self, id: i64, limit: usize) -> Result<Vec<Event>> {
        self.query(
            "WHERE id > ?1 ORDER BY id LIMIT ?2",
            params![id, limit as i64],
        )
    }

    /// The newest event of a kind in a run. The engine reads the run state this way after a
    /// restart (`kind::STATE`).
    pub fn last(&self, run: &str, kind: &str) -> Result<Option<Event>> {
        Ok(self
            .query(
                "WHERE run = ?1 AND kind = ?2 ORDER BY id DESC LIMIT 1",
                params![run, kind],
            )?
            .pop())
    }

    /// The run ids, in order of their first event.
    pub fn runs(&self) -> Result<Vec<String>> {
        let mut st = self
            .conn
            .prepare("SELECT run FROM events GROUP BY run ORDER BY MIN(id)")?;
        let rows = st.query_map([], |r| r.get(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// The runs that have a payload value equal to `target`, such as `pr:code:7` or `wi:SHIP-42`.
    /// The backlink of an entity to its runs.
    pub fn cites(&self, target: &str) -> Result<Vec<String>> {
        // The JSON text of a string value, quotes included, so `pr:code:7` never matches
        // `pr:code:70`. `instr` has no wildcard.
        let needle = serde_json::to_string(target)?;
        let mut st = self.conn.prepare(
            "SELECT run FROM events WHERE instr(payload, ?1) > 0 GROUP BY run ORDER BY MIN(id)",
        )?;
        let rows = st.query_map([needle], |r| r.get(0))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    fn query(&self, clause: &str, args: impl rusqlite::Params) -> Result<Vec<Event>> {
        let mut st = self.conn.prepare(&format!(
            "SELECT id, run, step, kind, payload, ts FROM events {clause}"
        ))?;
        let rows = st.query_map(args, event)?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }
}

fn event(r: &Row) -> rusqlite::Result<Event> {
    let payload: String = r.get(4)?;
    Ok(Event {
        id: r.get(0)?,
        run: r.get(1)?,
        step: r.get(2)?,
        kind: r.get(3)?,
        payload: serde_json::from_str(&payload).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, Box::new(e))
        })?,
        ts: r.get::<_, i64>(5)? as u64,
    })
}
