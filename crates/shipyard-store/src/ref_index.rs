//! The ref index: entities and citations, derived from the repository, the mirror and the run log
//! (spec `refs`, REQ-003, REQ-004). It is derived data and can be rebuilt.

use std::path::Path;

use rusqlite::{Connection, params};
use shipyard_core::project::ProjectFile;

use crate::{Result, repo_scan};

const VERSION: i64 = 1;

/// One entity with a ref.
#[derive(Debug, Clone, PartialEq)]
pub struct Entity {
    pub target: String,
    pub title: String,
    pub status: Option<String>,
    pub location: Option<String>,
    /// A hidden entity resolves but does not show in search.
    pub hidden: bool,
}

impl Entity {
    pub fn new(target: &str, title: &str, status: Option<&str>, location: Option<&str>) -> Self {
        Self {
            target: target.into(),
            title: title.into(),
            status: status.map(Into::into),
            location: location.map(Into::into),
            hidden: false,
        }
    }
}

/// `source` cites `target`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Citation {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct SyncStats {
    pub changed: usize,
    pub removed: usize,
}

pub struct RefIndex {
    pub(crate) conn: Connection,
}

impl RefIndex {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        Self::init(Connection::open(path)?)
    }

    pub fn open_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Self> {
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if v != VERSION {
            // Derived data: a new schema starts from an empty index.
            conn.execute_batch(
                "DROP TABLE IF EXISTS sources; DROP TABLE IF EXISTS entities;
                 DROP TABLE IF EXISTS citations; DROP TABLE IF EXISTS meta;",
            )?;
        }
        conn.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS sources(key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS entities(
                 ref TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT, location TEXT,
                 hidden INTEGER NOT NULL DEFAULT 0, source_key TEXT NOT NULL);
             CREATE INDEX IF NOT EXISTS entities_ref ON entities(ref);
             CREATE TABLE IF NOT EXISTS citations(source_key TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL);
             CREATE INDEX IF NOT EXISTS citations_target ON citations(target);
             CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
             PRAGMA user_version = {VERSION};"
        ))?;
        Ok(Self { conn })
    }

    /// Replaces everything that one source holds. A source is a repository file (`file:<path>`),
    /// the mirror (`mirror:<key>`) or the run log (`runlog:<id>`).
    pub fn set_source(
        &mut self,
        key: &str,
        fingerprint: &str,
        entities: &[Entity],
        citations: &[Citation],
    ) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM entities WHERE source_key = ?1", [key])?;
        tx.execute("DELETE FROM citations WHERE source_key = ?1", [key])?;
        tx.execute(
            "INSERT OR REPLACE INTO sources(key, fingerprint) VALUES (?1, ?2)",
            [key, fingerprint],
        )?;
        for e in entities {
            let kind = e.target.split(':').next().unwrap_or_default();
            tx.execute(
                "INSERT INTO entities(ref, kind, title, status, location, hidden, source_key) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![e.target, kind, e.title, e.status, e.location, e.hidden, key],
            )?;
        }
        for c in citations {
            tx.execute(
                "INSERT INTO citations(source_key, source, target) VALUES (?1,?2,?3)",
                params![key, c.source, c.target],
            )?;
        }
        Ok(tx.commit()?)
    }

    /// The fingerprint that `set_source` stored for `key`. A caller that reads a source other than
    /// a file (the mirror) compares it first and skips the read when it did not change.
    pub fn fingerprint(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT fingerprint FROM sources WHERE key = ?1",
                [key],
                |r| r.get(0),
            )
            .map(Some)
            .or_else(|e| {
                if e == rusqlite::Error::QueryReturnedNoRows {
                    Ok(None)
                } else {
                    Err(e)
                }
            })?)
    }

    pub fn remove_source(&mut self, key: &str) -> Result<()> {
        let tx = self.conn.transaction()?;
        for table in ["entities", "citations"] {
            tx.execute(&format!("DELETE FROM {table} WHERE source_key = ?1"), [key])?;
        }
        tx.execute("DELETE FROM sources WHERE key = ?1", [key])?;
        Ok(tx.commit()?)
    }

    /// The number of indexed sources.
    pub fn count_sources(&self) -> Result<usize> {
        Ok(self
            .conn
            .query_row("SELECT COUNT(*) FROM sources", [], |r| r.get::<_, i64>(0))?
            as usize)
    }

    /// Drops the whole index. The next `sync_repo` rebuilds it.
    pub fn clear(&mut self) -> Result<()> {
        Ok(self
            .conn
            .execute_batch("DELETE FROM sources; DELETE FROM entities; DELETE FROM citations;")?)
    }

    /// Indexes the files that changed since the last call and drops the files that are gone.
    pub fn sync_repo(&mut self, root: &Path, project: &ProjectFile) -> Result<SyncStats> {
        let roots = repo_scan::roots(project);
        self.conn.execute(
            "INSERT OR REPLACE INTO meta(key, value) VALUES ('roots', ?1)",
            [roots.join("\n")],
        )?;
        let files = repo_scan::walk(root, &roots);
        let mut stats = SyncStats::default();
        let known: Vec<(String, String)> = {
            let mut st = self
                .conn
                .prepare("SELECT key, fingerprint FROM sources WHERE key LIKE 'file:%'")?;
            st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<std::result::Result<_, _>>()?
        };
        for (key, _) in known
            .iter()
            .filter(|(k, _)| !files.iter().any(|f| format!("file:{}", f.rel) == *k))
        {
            self.remove_source(key)?;
            stats.removed += 1;
        }
        for f in files {
            let key = format!("file:{}", f.rel);
            if known
                .iter()
                .any(|(k, fp)| *k == key && *fp == f.fingerprint)
            {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(root.join(&f.rel)) else {
                continue;
            };
            let (entities, citations) = repo_scan::scan(&f.rel, &text, project);
            self.set_source(&key, &f.fingerprint, &entities, &citations)?;
            stats.changed += 1;
        }
        Ok(stats)
    }
}
