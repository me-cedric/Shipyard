//! The compass check for Health (spec `extensions`, REQ-007): a stale entry is a finding with one
//! fix that applies it. An absent entry is a finding only for the contract: a skill or a pack
//! that a person never chose is not a defect (Q-075).

use crate::extensions::{Entry, Kind, SyncState};
use crate::health::{Finding, Fix, Group, Severity};

pub fn findings(entries: &[Entry]) -> Vec<Finding> {
    entries
        .iter()
        .filter(|e| {
            e.state == SyncState::Stale
                || (e.state == SyncState::Absent && e.kind == Kind::Contract)
        })
        .map(|e| {
            let stale = e.state == SyncState::Stale;
            let code = if stale {
                "compass-stale"
            } else {
                "compass-absent"
            };
            Finding {
                id: format!("compass:{}", e.key()),
                group: Group::Tools,
                severity: if stale {
                    Severity::Warning
                } else {
                    Severity::Info
                },
                code: code.into(),
                detail: Some(e.id.clone()),
                source: None,
                fix: Fix::Apply { entry: e.key() },
            }
        })
        .collect()
}
