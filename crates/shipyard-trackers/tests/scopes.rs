//! The scope list of each tracker: the containers that a person picks from. A fake `Http` answers.

use shipyard_core::work_item::TrackerKind;
use shipyard_http::fake::FakeHttp;
use shipyard_secrets::Secret;
use shipyard_trackers::{TrackerConfig, connect};
use std::sync::Arc;

fn ids(kind: TrackerKind, url: &str, route: &str, body: &str) -> Vec<String> {
    let fake = Arc::new(FakeHttp::new());
    fake.get(route, 200, body);
    let config = TrackerConfig {
        kind,
        url: url.into(),
        user: Some("ada@example.com".into()),
    };
    let tracker = connect(&config, Secret::new("tok-scope"), fake).expect("connect");
    tracker
        .scopes()
        .expect("scopes")
        .into_iter()
        .map(|s| s.id)
        .collect()
}

#[test]
fn each_tracker_lists_its_containers() {
    use TrackerKind::*;
    assert_eq!(
        ids(
            JiraCloud,
            "https://acme.atlassian.net",
            "/project",
            r#"[{"key":"ACME","name":"Acme"},{"key":"OPS","name":"Ops"}]"#
        ),
        ["ACME", "OPS"]
    );
    assert_eq!(
        ids(
            GitHubIssues,
            "https://github.com",
            "/user/repos",
            r#"[{"full_name":"acme/app"}]"#
        ),
        ["acme/app"]
    );
    assert_eq!(
        ids(
            GitLabIssues,
            "https://gitlab.com",
            "/projects",
            r#"[{"path_with_namespace":"acme/team/app"}]"#
        ),
        ["acme/team/app"]
    );
    assert_eq!(
        ids(
            AzureDevOps,
            "https://dev.azure.com/acme",
            "/_apis/projects",
            r#"{"value":[{"name":"Web"}]}"#
        ),
        ["Web"]
    );
}
