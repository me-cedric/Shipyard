//! The `pr:<forge>:<number>` entity (spec `delivery`, REQ-017, REQ-028). The mirror of `sync` is
//! the source for reads: this module adds no table. The link between a run and its pull request is
//! one event of the run log, so the run and the pull request find each other.

use serde_json::json;
use shipyard_core::delivery::{self, PrSignal};
use shipyard_core::pickup::{Ci, PrState, PullSnapshot};
use shipyard_core::refs::{Ref, parse};

use crate::Result;
use crate::mirror::Mirror;
use crate::run_log::{RunLog, kind};

/// The review state of the pull request. The forge adapter sets only `changes_requested`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Review {
    Clear,
    ChangesRequested,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrRow {
    /// `pr:<forge>:<number>`.
    pub reference: String,
    /// The connection id of the forge, the middle part of the ref.
    pub forge: String,
    pub number: u64,
    pub title: String,
    pub state: PrState,
    pub draft: bool,
    pub ci: Ci,
    pub review: Review,
    pub head_sha: String,
    pub url: String,
    pub updated: String,
}

impl PrRow {
    /// What `shipyard_core::delivery::lane` reads. A forge with no CI gives `Pending`: nothing
    /// says that the checks passed, so the run stays in review for a person to move.
    pub fn signal(&self) -> PrSignal {
        PrSignal {
            ci: match self.ci {
                Ci::Passing => delivery::Ci::Passing,
                Ci::Failing => delivery::Ci::Failing,
                Ci::Pending | Ci::None => delivery::Ci::Pending,
            },
            changes_requested: self.review == Review::ChangesRequested,
            draft: self.draft,
        }
    }
}

/// The ref text. The forge name is checked by the ref grammar of `shipyard_core::refs`.
pub fn pr_ref(forge: &str, number: u64) -> Result<String> {
    let text = format!("pr:{forge}:{number}");
    match parse(&text) {
        Some(Ref::Pr { .. }) => Ok(text),
        _ => Err(format!("`{forge}` is not a forge name for a pr: ref").into()),
    }
}

fn to_row(forge: &str, p: PullSnapshot) -> PrRow {
    PrRow {
        reference: format!("pr:{forge}:{}", p.number),
        forge: forge.into(),
        number: p.number,
        title: p.title,
        state: p.state,
        draft: p.draft,
        ci: p.ci,
        review: if p.changes_requested {
            Review::ChangesRequested
        } else {
            Review::Clear
        },
        head_sha: p.head_sha,
        url: p.url,
        updated: p.updated,
    }
}

/// The pull requests of one forge connection, by number. `source` is the mirror key of the forge
/// (`connection@repo`, see `shipyard_engine::tick::source_key`). `forge` is the name in the ref.
pub fn rows(m: &Mirror, forge: &str, source: &str) -> Result<Vec<PrRow>> {
    Ok(m.pulls(source)?
        .into_iter()
        .map(|p| to_row(forge, p))
        .collect())
}

pub fn row(m: &Mirror, forge: &str, source: &str, number: u64) -> Result<Option<PrRow>> {
    Ok(rows(m, forge, source)?
        .into_iter()
        .find(|r| r.number == number))
}

/// Record the pull request on the run (REQ-017). One event of kind `pr`: `{"ref": "pr:..."}`.
pub fn record(
    log: &RunLog,
    run: &str,
    step: Option<&str>,
    forge: &str,
    number: u64,
    ts: u64,
) -> Result<i64> {
    let reference = pr_ref(forge, number)?;
    log.append(run, step, kind::PR, &json!({ "ref": reference }), ts)
}

/// The pull request of a run: the last one that the run recorded.
pub fn pr_of_run(log: &RunLog, run: &str) -> Result<Option<String>> {
    Ok(log
        .last(run, kind::PR)?
        .and_then(|e| e.payload["ref"].as_str().map(str::to_string)))
}

/// The runs that recorded this pull request. The backlink of the entity.
pub fn runs_of(log: &RunLog, forge: &str, number: u64) -> Result<Vec<String>> {
    log.cites(&pr_ref(forge, number)?)
}
