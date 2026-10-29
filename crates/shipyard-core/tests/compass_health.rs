//! The compass findings for Health (spec `extensions`, REQ-007).

use shipyard_core::compass_health::findings;
use shipyard_core::extensions::{Entry, Kind, SyncState};
use shipyard_core::health::{Fix, Severity};

fn entry(id: &str, state: SyncState) -> Entry {
    kind_entry(Kind::Skill, id, state)
}

fn kind_entry(kind: Kind, id: &str, state: SyncState) -> Entry {
    Entry {
        kind,
        id: id.into(),
        title: id.into(),
        risk: None,
        writes: false,
        suits: false,
        state,
        pinned: None,
        expected: "1.0.2".into(),
    }
}

#[test]
fn a_stale_entry_or_an_absent_contract_is_a_finding_with_one_apply_fix() {
    let f = findings(&[
        entry("a", SyncState::Current),
        entry("b", SyncState::Stale),
        kind_entry(Kind::Contract, "contract", SyncState::Absent),
        entry("d", SyncState::Absent),
    ]);
    assert_eq!(f.len(), 2, "an absent skill is a choice, not a finding");
    assert_eq!(f[0].code, "compass-stale");
    assert_eq!(f[0].severity, Severity::Warning);
    assert_eq!(f[0].detail.as_deref(), Some("b"));
    assert_eq!(
        f[0].fix,
        Fix::Apply {
            entry: "skill:b".into()
        }
    );
    assert_eq!(f[1].code, "compass-absent");
}

#[test]
fn current_entries_give_no_finding() {
    assert!(findings(&[entry("a", SyncState::Current)]).is_empty());
}
