//! Work item shape and capability flags (spec `connections`, REQ-003, REQ-004).

use shipyard_core::work_item::{
    Capabilities, Capability, Status, StatusCategory, TrackerKind, WorkItem, WorkKind,
};

const ALL_FLAGS: [Capability; 6] = [
    Capability::Hierarchy,
    Capability::Transitions,
    Capability::Labels,
    Capability::Comments,
    Capability::TimeTracking,
    Capability::Assignee,
];

fn off(kind: TrackerKind) -> Vec<Capability> {
    let caps = kind.capabilities();
    ALL_FLAGS.into_iter().filter(|c| !caps.has(*c)).collect()
}

#[test]
fn each_kind_states_the_six_flags() {
    use Capability::{Hierarchy, TimeTracking};
    assert_eq!(TrackerKind::ALL.len(), 6);
    assert!(off(TrackerKind::JiraCloud).is_empty());
    assert!(off(TrackerKind::JiraDataCenter).is_empty());
    assert!(off(TrackerKind::AzureDevOps).is_empty());
    assert_eq!(off(TrackerKind::GitHubIssues), [Hierarchy, TimeTracking]);
    assert_eq!(off(TrackerKind::GitLabIssues), [Hierarchy]);
    assert_eq!(off(TrackerKind::Linear), [TimeTracking]);
}

#[test]
fn a_flag_that_is_off_is_named_by_the_error() {
    let caps = TrackerKind::GitHubIssues.capabilities();
    assert_eq!(caps.require(Capability::Labels), Ok(()));
    assert_eq!(
        caps.require(Capability::TimeTracking),
        Err(Capability::TimeTracking)
    );
}

#[test]
fn every_kind_names_its_read_scope() {
    for kind in TrackerKind::ALL {
        assert!(!kind.read_scope().is_empty(), "{kind:?}");
    }
}

#[test]
fn the_kind_names_are_stable_in_json() {
    let names: Vec<String> = TrackerKind::ALL
        .iter()
        .map(|k| serde_json::to_string(k).unwrap())
        .collect();
    assert_eq!(
        names,
        [
            "\"jira-cloud\"",
            "\"jira-data-center\"",
            "\"github\"",
            "\"gitlab\"",
            "\"azure-dev-ops\"",
            "\"linear\""
        ]
    );
}

#[test]
fn the_flags_serialize_in_camel_case() {
    let caps: Capabilities = TrackerKind::Linear.capabilities();
    let json = serde_json::to_value(caps).unwrap();
    assert_eq!(json["timeTracking"], false);
    assert_eq!(json["hierarchy"], true);
}

#[test]
fn a_work_item_holds_no_tracker_field() {
    // The shape is closed: a Jira custom field has no place in it (REQ-004).
    let item = WorkItem {
        key: "ENG-1".into(),
        title: "t".into(),
        description: String::new(),
        kind: WorkKind::Task,
        status: Status {
            name: "Open".into(),
            category: StatusCategory::Todo,
        },
        assignee: None,
        labels: vec![],
        parent: None,
        url: String::new(),
        updated: String::new(),
        time: None,
    };
    let json = serde_json::to_value(&item).unwrap();
    let mut keys: Vec<&str> = json
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort();
    assert_eq!(
        keys,
        [
            "assignee",
            "description",
            "key",
            "kind",
            "labels",
            "parent",
            "status",
            "time",
            "title",
            "updated",
            "url"
        ]
    );
}
