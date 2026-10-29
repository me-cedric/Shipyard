//! Resolve, backlinks, search and check on the ref index (spec `refs`, REQ-006 to REQ-010).

use std::collections::BTreeMap;

use rusqlite::params;
use serde::Serialize;
use shipyard_core::refs::{Ref, parse};
use specta::Type;

use crate::Result;
use crate::ref_index::RefIndex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum State {
    Resolved,
    /// The target is not known yet. It stays unresolved until its source is indexed (Q-012).
    Unresolved,
    Broken,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    #[serde(rename = "ref")]
    pub target: String,
    pub kind: String,
    pub state: State,
    pub title: Option<String>,
    /// The state of the entity itself, such as `accepted` for an ADR.
    pub status: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct Backlink {
    pub source: String,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct BacklinkGroup {
    pub kind: String,
    pub count: u32,
    pub items: Vec<Backlink>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    #[serde(rename = "ref")]
    pub target: String,
    pub kind: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct BrokenCitation {
    pub target: String,
    pub source: String,
}

/// Kinds that the repository files cover. A missing target of another kind stays unresolved
/// until its capability indexes its source.
/// Title, status and location of an entity.
type Row = (String, Option<String>, Option<String>);

const COVERED: [&str; 6] = ["adr", "q", "change", "spec", "wf", "doc"];

impl RefIndex {
    fn lookup(&self, target: &str) -> Result<Option<Row>> {
        Ok(self
            .conn
            .query_row(
                "SELECT title, status, location FROM entities WHERE ref = ?1 ORDER BY source_key LIMIT 1",
                [target],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map(Some)
            .or_else(|e| if e == rusqlite::Error::QueryReturnedNoRows { Ok(None) } else { Err(e) })?)
    }

    fn missing_state(&self, r: &Ref) -> Result<State> {
        if !COVERED.contains(&r.kind()) {
            return Ok(State::Unresolved);
        }
        Ok(match r {
            // A path outside the scanned folders is not known, so it is not broken.
            Ref::Doc(path) => {
                let roots: String = self
                    .conn
                    .query_row("SELECT value FROM meta WHERE key = 'roots'", [], |r| {
                        r.get(0)
                    })
                    .unwrap_or_default();
                if roots.lines().any(|d| path.starts_with(&format!("{d}/"))) {
                    State::Broken
                } else {
                    State::Unresolved
                }
            }
            _ => State::Broken,
        })
    }

    /// `None` when the text is not a ref.
    pub fn resolve(&self, text: &str) -> Result<Option<Resolved>> {
        let Some(r) = parse(text) else {
            return Ok(None);
        };
        let (state, title, status, location) = match self.lookup(text)? {
            Some((t, s, l)) => (State::Resolved, Some(t), s, l),
            None => (self.missing_state(&r)?, None, None, None),
        };
        Ok(Some(Resolved {
            target: text.into(),
            kind: r.kind().into(),
            state,
            title,
            status,
            location,
        }))
    }

    /// The entities that cite `target`, grouped by kind.
    pub fn backlinks(&self, target: &str) -> Result<Vec<BacklinkGroup>> {
        let mut st = self.conn.prepare(
            "SELECT DISTINCT c.source, (SELECT title FROM entities e WHERE e.ref = c.source LIMIT 1)
             FROM citations c WHERE c.target = ?1 ORDER BY c.source",
        )?;
        let rows = st.query_map([target], |r| {
            Ok(Backlink {
                source: r.get(0)?,
                title: r.get(1)?,
            })
        })?;
        let mut groups: BTreeMap<String, Vec<Backlink>> = BTreeMap::new();
        for b in rows {
            let b = b?;
            let kind = b.source.split(':').next().unwrap_or_default().to_string();
            groups.entry(kind).or_default().push(b);
        }
        Ok(groups
            .into_iter()
            .map(|(kind, items)| BacklinkGroup {
                kind,
                count: items.len() as u32,
                items,
            })
            .collect())
    }

    /// Entities whose ref or title holds the text. A ref match ranks first.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let like = format!(
            "%{}%",
            q.replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );
        let mut st = self.conn.prepare(
            "SELECT ref, kind, title FROM entities WHERE hidden = 0
               AND (lower(ref) LIKE ?1 ESCAPE '\\' OR lower(title) LIKE ?1 ESCAPE '\\')
             GROUP BY ref
             ORDER BY CASE WHEN lower(ref) LIKE ?1 ESCAPE '\\' THEN 0 ELSE 1 END, ref LIMIT ?2",
        )?;
        let rows = st.query_map(params![like, limit as i64], |r| {
            Ok(SearchHit {
                target: r.get(0)?,
                kind: r.get(1)?,
                title: r.get(2)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Each citation whose target is broken.
    pub fn check(&self) -> Result<Vec<BrokenCitation>> {
        let mut st = self
            .conn
            .prepare("SELECT DISTINCT target, source FROM citations ORDER BY target, source")?;
        let pairs: Vec<(String, String)> = st
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<_, _>>()?;
        let mut out = Vec::new();
        for (target, source) in pairs {
            if self
                .resolve(&target)?
                .is_some_and(|r| r.state == State::Broken)
            {
                out.push(BrokenCitation { target, source });
            }
        }
        Ok(out)
    }
}
