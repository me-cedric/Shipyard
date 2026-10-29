//! The tracker contract suite (REQ-002, REQ-003, REQ-004, REQ-012). One suite runs against all six
//! adapters. Each adapter reads recorded JSON from `tests/fixtures` through a fake `Http`.
//! The fixtures hold the same two tickets in the shape of each product. No test uses the network.

use shipyard_http::Method;
use shipyard_http::fake::FakeHttp;
use shipyard_secrets::Secret;
use shipyard_trackers::*;
use std::sync::Arc;

macro_rules! fx {
    ($path:literal) => {
        include_str!(concat!("fixtures/", $path))
    };
}

struct Case {
    name: &'static str,
    tracker: Box<dyn Tracker>,
    fake: Arc<FakeHttp>,
    scope: &'static str,
    key: &'static str,
    /// The status of the first ticket, as the product words it.
    status: (&'static str, StatusCategory),
    assignee: &'static str,
    /// The display name of the account behind the credential.
    me: &'static str,
}

fn build(
    kind: TrackerKind,
    url: &str,
    user: Option<&str>,
    fake: Arc<FakeHttp>,
) -> Box<dyn Tracker> {
    let config = TrackerConfig {
        kind,
        url: url.into(),
        user: user.map(String::from),
    };
    connect(&config, Secret::new("tok-contract-secret"), fake).expect("connect")
}

fn jira(kind: TrackerKind) -> Case {
    let cloud = kind == TrackerKind::JiraCloud;
    let fake = Arc::new(FakeHttp::new());
    if cloud {
        fake.get("/rest/api/2/search/jql", 200, fx!("jira/search_cloud.json"))
            .get("/rest/api/2/myself", 200, fx!("jira/myself_cloud.json"))
            .get(
                "/issue/PROJ-12/comment",
                200,
                fx!("jira/comments_cloud.json"),
            )
            .get("/issue/PROJ-12", 200, fx!("jira/issue_cloud.json"));
    } else {
        fake.get("/rest/api/2/search?", 200, fx!("jira/search_dc.json"))
            .get("/rest/api/2/myself", 200, fx!("jira/myself_dc.json"))
            .get("/issue/PROJ-12/comment", 200, fx!("jira/comments_dc.json"))
            .get("/issue/PROJ-12", 200, fx!("jira/issue_dc.json"));
    }
    Case {
        name: if cloud { "jira-cloud" } else { "jira-dc" },
        tracker: build(
            kind,
            "https://jira.example.com",
            Some("ada@example.com"),
            fake.clone(),
        ),
        fake,
        scope: "PROJ",
        key: "PROJ-12",
        status: ("In Progress", StatusCategory::InProgress),
        assignee: "Ada Lovelace",
        me: "Ada Lovelace",
    }
}

fn github() -> Case {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/user", 200, fx!("github/user.json"))
        .get(
            "/repos/acme/web/issues/12/comments",
            200,
            fx!("github/comments.json"),
        )
        .get("/repos/acme/web/issues/12", 200, fx!("github/issue.json"))
        .get("/repos/acme/web/issues?", 200, fx!("github/search.json"))
        .get("api.github.com/issues?", 200, fx!("github/search.json"));
    Case {
        name: "github",
        tracker: build(
            TrackerKind::GitHubIssues,
            "https://github.com",
            None,
            fake.clone(),
        ),
        fake,
        scope: "acme/web",
        key: "acme/web#12",
        status: ("open", StatusCategory::Todo),
        assignee: "ada",
        me: "Ada Lovelace",
    }
}

fn gitlab() -> Case {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/api/v4/user", 200, fx!("gitlab/user.json"))
        .get("/issues/12/notes", 200, fx!("gitlab/notes.json"))
        .get("/issues/12", 200, fx!("gitlab/issue.json"))
        .get_with(
            "/issues?",
            200,
            &[("X-Next-Page", "2")],
            fx!("gitlab/search.json"),
        );
    Case {
        name: "gitlab",
        tracker: build(
            TrackerKind::GitLabIssues,
            "https://gitlab.com",
            None,
            fake.clone(),
        ),
        fake,
        scope: "acme/web",
        key: "acme/web#12",
        status: ("opened", StatusCategory::Todo),
        assignee: "Ada Lovelace",
        me: "Ada Lovelace",
    }
}

fn azure() -> Case {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/_apis/connectionData", 200, fx!("azure/connection.json"))
        .post("/_apis/wit/wiql", "SELECT", 200, fx!("azure/wiql.json"))
        .get("/_apis/wit/workitems?ids=", 200, fx!("azure/batch.json"))
        .get("/comments", 200, fx!("azure/comments.json"))
        .get(
            "workitems/412?fields=System.TeamProject&",
            200,
            fx!("azure/project_only.json"),
        )
        .get("/_apis/wit/workitems/412", 200, fx!("azure/item.json"));
    Case {
        name: "azure-devops",
        tracker: build(
            TrackerKind::AzureDevOps,
            "https://dev.azure.com/acme",
            None,
            fake.clone(),
        ),
        fake,
        scope: "Payments",
        key: "412",
        status: ("Active", StatusCategory::InProgress),
        assignee: "Ada Lovelace",
        me: "Ada Lovelace",
    }
}

fn linear() -> Case {
    let fake = Arc::new(FakeHttp::new());
    fake.post("graphql", "viewer", 200, fx!("linear/viewer.json"))
        .post(
            "graphql",
            "comments(first",
            200,
            fx!("linear/comments.json"),
        )
        .post("graphql", "issues(first", 200, fx!("linear/issues.json"))
        .post("graphql", "issue(id", 200, fx!("linear/issue.json"));
    Case {
        name: "linear",
        tracker: build(
            TrackerKind::Linear,
            "https://linear.app",
            None,
            fake.clone(),
        ),
        fake,
        scope: "ENG",
        key: "ENG-42",
        status: ("In Progress", StatusCategory::InProgress),
        assignee: "Ada Lovelace",
        me: "Ada Lovelace",
    }
}

fn cases() -> Vec<Case> {
    vec![
        jira(TrackerKind::JiraCloud),
        jira(TrackerKind::JiraDataCenter),
        github(),
        gitlab(),
        azure(),
        linear(),
    ]
}

fn check_first_item(c: &Case, item: &WorkItem) {
    let n = c.name;
    let caps = c.tracker.capabilities();
    assert_eq!(item.key, c.key, "{n}: key");
    assert_eq!(item.title, "Fix login redirect", "{n}: title");
    assert_eq!(
        item.description, "Users land on a blank page after login.",
        "{n}: description"
    );
    assert_eq!(item.kind, WorkKind::Bug, "{n}: kind");
    assert_eq!(
        (item.status.name.as_str(), item.status.category),
        c.status,
        "{n}: status"
    );
    assert_eq!(
        item.assignee.as_ref().map(|p| p.name.as_str()),
        Some(c.assignee),
        "{n}: assignee"
    );
    assert_eq!(item.labels, ["bug", "shipyard"], "{n}: labels");
    assert!(
        item.updated.starts_with("2026-10-28T09:30"),
        "{n}: updated {}",
        item.updated
    );
    assert!(item.url.starts_with("https://"), "{n}: url {}", item.url);
    // A flag that is off leaves the field empty. A flag that is on fills it.
    assert_eq!(
        item.parent.is_some(),
        caps.hierarchy,
        "{n}: parent follows the hierarchy flag"
    );
    assert_eq!(
        item.time.is_some(),
        caps.time_tracking,
        "{n}: time follows the time tracking flag"
    );
    if let Some(t) = &item.time {
        assert_eq!(
            (t.estimate_minutes, t.spent_minutes),
            (Some(120), Some(30)),
            "{n}: time"
        );
    }
}

#[test]
fn every_adapter_returns_the_same_work_item_shape() {
    for c in cases() {
        let page = c
            .tracker
            .search(&WorkQuery {
                scope: Some(c.scope.into()),
                ..WorkQuery::default()
            })
            .unwrap();
        // GitHub drops the pull request: two items for every product.
        assert_eq!(page.items.len(), 2, "{}: item count", c.name);
        check_first_item(&c, &page.items[0]);
        let second = &page.items[1];
        assert_eq!(second.title, "Add export", "{}", c.name);
        assert_eq!(
            second.description, "",
            "{}: a null description is empty",
            c.name
        );
        assert_eq!(second.assignee, None, "{}", c.name);
        assert!(second.labels.is_empty(), "{}", c.name);
        assert_eq!(second.status.category, StatusCategory::Todo, "{}", c.name);
        assert!(
            second.parent.is_none() && second.time.is_none(),
            "{}",
            c.name
        );
    }
}

#[test]
fn get_returns_the_same_item_as_search() {
    for c in cases() {
        let item = c.tracker.get(c.key).unwrap();
        check_first_item(&c, &item);
    }
}

#[test]
fn comments_return_the_same_shape() {
    for c in cases() {
        let comments = c.tracker.comments(c.key).unwrap();
        assert_eq!(comments.len(), 1, "{}: system notes are dropped", c.name);
        assert_eq!(comments[0].body, "Reproduced on staging.", "{}", c.name);
        assert!(!comments[0].author.name.is_empty(), "{}", c.name);
        assert!(
            comments[0].created.starts_with("2026-10-28T10:00"),
            "{}",
            c.name
        );
    }
}

#[test]
fn the_flags_match_the_product() {
    let flags = |k: TrackerKind| {
        let c = k.capabilities();
        [
            c.hierarchy,
            c.transitions,
            c.labels,
            c.comments,
            c.time_tracking,
            c.assignee,
        ]
    };
    assert_eq!(flags(TrackerKind::JiraCloud), [true; 6]);
    assert_eq!(flags(TrackerKind::JiraDataCenter), [true; 6]);
    assert_eq!(flags(TrackerKind::AzureDevOps), [true; 6]);
    assert_eq!(
        flags(TrackerKind::GitHubIssues),
        [false, true, true, true, false, true]
    );
    assert_eq!(
        flags(TrackerKind::GitLabIssues),
        [false, true, true, true, true, true]
    );
    assert_eq!(
        flags(TrackerKind::Linear),
        [true, true, true, true, false, true]
    );
    for c in cases() {
        assert_eq!(
            c.tracker.capabilities(),
            c.tracker.kind().capabilities(),
            "{}",
            c.name
        );
    }
}

#[test]
fn the_test_passes_and_sends_no_write() {
    for c in cases() {
        assert_eq!(
            c.tracker.test(),
            TestOutcome::Passed {
                account: c.me.into()
            },
            "{}",
            c.name
        );
        c.assert_read_only();
    }
}

#[test]
fn the_credential_never_appears_in_a_url() {
    for c in cases() {
        c.tracker
            .search(&WorkQuery {
                scope: Some(c.scope.into()),
                ..WorkQuery::default()
            })
            .unwrap();
        for r in c.fake.requests() {
            assert!(
                !r.url.contains("tok-contract-secret"),
                "{}: {}",
                c.name,
                r.url
            );
            assert!(
                !format!("{r:?}").contains("tok-contract-secret"),
                "{}: Debug leaked",
                c.name
            );
        }
    }
}

#[test]
fn a_filter_that_needs_an_absent_flag_sends_nothing() {
    let caps = Capabilities {
        hierarchy: false,
        transitions: false,
        labels: false,
        comments: false,
        time_tracking: false,
        assignee: false,
    };
    assert_eq!(
        caps.require(Capability::Comments),
        Err(Capability::Comments)
    );
    assert!(matches!(
        TrackerError::from(Capability::Comments),
        TrackerError::Unsupported(Capability::Comments)
    ));
    assert!(caps.require(Capability::Hierarchy).is_err());
}

#[test]
fn a_rejected_token_and_a_missing_scope_are_named() {
    let fake = Arc::new(FakeHttp::new());
    fake.get_with(
        "/api/v4/user",
        403,
        &[(
            "WWW-Authenticate",
            r#"Bearer error="insufficient_scope" scope="read_api""#,
        )],
        "{}",
    );
    let t = build(TrackerKind::GitLabIssues, "https://gitlab.com", None, fake);
    assert_eq!(
        t.test(),
        TestOutcome::MissingScope {
            scope: "read_api".into()
        }
    );

    let fake = Arc::new(FakeHttp::new());
    fake.get("/user", 401, r#"{"message":"Bad credentials"}"#);
    let t = build(TrackerKind::GitHubIssues, "https://github.com", None, fake);
    assert!(matches!(t.test(), TestOutcome::Failed { reason } if reason.contains("rejected")));

    let fake = Arc::new(FakeHttp::new());
    fake.get("/rest/api/2/myself", 403, "{}");
    let t = build(
        TrackerKind::JiraDataCenter,
        "https://jira.example.com",
        None,
        fake,
    );
    assert_eq!(
        t.test(),
        TestOutcome::MissingScope {
            scope: "Browse projects".into()
        }
    );

    let fake = Arc::new(FakeHttp::new());
    fake.post("graphql", "viewer", 400, fx!("linear/auth_error.json"));
    let t = build(TrackerKind::Linear, "https://linear.app", None, fake);
    assert!(matches!(t.test(), TestOutcome::Failed { reason } if reason.contains("rejected")));
}

#[test]
fn a_sign_in_page_is_not_a_pass() {
    // Azure DevOps answers a bad token with a 200 and an HTML page.
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/_apis/connectionData",
        200,
        "<html><title>Sign In</title></html>",
    );
    let t = build(
        TrackerKind::AzureDevOps,
        "https://dev.azure.com/acme",
        None,
        fake,
    );
    assert!(matches!(t.test(), TestOutcome::Failed { reason } if reason.contains("web page")));
}

#[test]
fn a_bad_address_or_a_missing_email_is_refused_before_any_request() {
    let fake = Arc::new(FakeHttp::new());
    let cfg = |kind, url: &str, user: Option<&str>| TrackerConfig {
        kind,
        url: url.into(),
        user: user.map(String::from),
    };
    let secret = || Secret::new("tok");
    for (kind, url, user) in [
        (TrackerKind::GitLabIssues, "http://gitlab.example.com", None),
        (
            TrackerKind::GitLabIssues,
            "https://tok@gitlab.example.com",
            None,
        ),
        (TrackerKind::JiraCloud, "https://acme.atlassian.net", None),
        (
            TrackerKind::JiraCloud,
            "https://acme.atlassian.net",
            Some(" "),
        ),
    ] {
        assert!(
            connect(&cfg(kind, url, user), secret(), fake.clone()).is_err(),
            "{kind:?} {url}"
        );
    }
    assert!(fake.requests().is_empty());
}

#[test]
fn a_bad_query_is_refused_before_any_request() {
    let c = github();
    let q = WorkQuery {
        scope: Some("acme/web/../../x".into()),
        ..WorkQuery::default()
    };
    assert!(matches!(c.tracker.search(&q), Err(TrackerError::Config(_))));
    let q = WorkQuery {
        updated_since: Some("yesterday".into()),
        ..WorkQuery::default()
    };
    assert!(matches!(c.tracker.search(&q), Err(TrackerError::Config(_))));
    assert!(matches!(
        c.tracker.get("nonsense"),
        Err(TrackerError::NotFound(_))
    ));
    assert!(c.fake.requests().is_empty());
}

#[test]
fn a_404_becomes_not_found() {
    let fake = Arc::new(FakeHttp::new());
    fake.get(
        "/issue/PROJ-99",
        404,
        r#"{"errorMessages":["Issue does not exist"]}"#,
    );
    let t = build(
        TrackerKind::JiraDataCenter,
        "https://jira.example.com",
        None,
        fake,
    );
    assert!(matches!(t.get("PROJ-99"), Err(TrackerError::NotFound(k)) if k == "PROJ-99"));
}

// ---- Adapter facts that the shared suite cannot state.

#[test]
fn jira_keeps_custom_fields_inside_the_adapter() {
    let c = jira(TrackerKind::JiraCloud);
    let item = c.tracker.get("PROJ-12").unwrap();
    let json = serde_json::to_string(&item).unwrap();
    for leak in ["customfield", "Sprint", "10016"] {
        assert!(!json.contains(leak), "the work item leaked {leak}: {json}");
    }
}

#[test]
fn jira_builds_a_quoted_jql_and_pages() {
    let c = jira(TrackerKind::JiraCloud);
    let q = WorkQuery {
        scope: Some("PROJ".into()),
        label: Some(r#"a"b"#.into()),
        assignee_me: true,
        updated_since: Some("2026-10-28T09:30:00Z".into()),
        ..WorkQuery::default()
    };
    let page = c.tracker.search(&q).unwrap();
    assert_eq!(page.next.as_deref(), Some("tok-2"));
    let url = c.fake.requests()[0].url.clone();
    for part in [
        "project%20%3D%20%22PROJ%22",
        "labels%20%3D%20%22a%5C%22b%22",
        "currentUser%28%29",
        "2026-10-28%2009%3A30",
    ] {
        assert!(url.contains(part), "{part} missing in {url}");
    }
    let dc = jira(TrackerKind::JiraDataCenter);
    let page = dc.tracker.search(&WorkQuery::default()).unwrap();
    assert_eq!(page.next.as_deref(), Some("2"));
    assert!(dc.fake.requests()[0].url.contains("startAt=0"));
}

#[test]
fn github_and_gitlab_page_and_use_the_right_host() {
    let c = github();
    let page = c
        .tracker
        .search(&WorkQuery {
            limit: 3,
            ..WorkQuery::default()
        })
        .unwrap();
    assert_eq!(page.next.as_deref(), Some("2"));
    assert!(
        c.fake.requests()[0]
            .url
            .starts_with("https://api.github.com/issues?")
    );

    let fake = Arc::new(FakeHttp::new());
    fake.get("/api/v3/repos/acme/web/issues?", 200, "[]");
    let t = build(
        TrackerKind::GitHubIssues,
        "https://git.corp.example",
        None,
        fake.clone(),
    );
    let page = t
        .search(&WorkQuery {
            scope: Some("acme/web".into()),
            ..WorkQuery::default()
        })
        .unwrap();
    assert_eq!((page.items.len(), page.next), (0, None));

    let c = gitlab();
    let page = c
        .tracker
        .search(&WorkQuery {
            scope: Some(c.scope.into()),
            ..WorkQuery::default()
        })
        .unwrap();
    assert_eq!(page.next.as_deref(), Some("2"));
    assert!(
        c.fake.requests()[0]
            .url
            .contains("/projects/acme%2Fweb/issues?")
    );
}

#[test]
fn azure_orders_the_batch_by_the_query_and_pages_by_offset() {
    // The page of one asks for the first id only.
    let fake = Arc::new(FakeHttp::new());
    fake.post("/_apis/wit/wiql", "SELECT", 200, fx!("azure/wiql.json"))
        .get("workitems?ids=412&", 200, fx!("azure/batch_one.json"));
    let t = build(
        TrackerKind::AzureDevOps,
        "https://dev.azure.com/acme",
        None,
        fake.clone(),
    );
    let page = t
        .search(&WorkQuery {
            limit: 1,
            ..WorkQuery::default()
        })
        .unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].key, "412");
    assert_eq!(page.next.as_deref(), Some("1"));
    let wiql = fake.requests()[0].clone();
    assert_eq!(wiql.method, Method::Post);
    assert!(wiql.url.contains("timePrecision=true"));
    // HTML in the description becomes plain text.
    assert!(!page.items[0].description.contains('<'));

    // The batch read returns the items in another order than the query: the adapter restores it.
    let c = azure();
    let page = c.tracker.search(&WorkQuery::default()).unwrap();
    assert_eq!(
        page.items
            .iter()
            .map(|w| w.key.as_str())
            .collect::<Vec<_>>(),
        ["412", "413"]
    );
    assert_eq!(page.next, None);
}

#[test]
fn linear_pages_by_cursor_and_asks_only_for_reads() {
    let c = linear();
    let page = c
        .tracker
        .search(&WorkQuery {
            scope: Some("ENG".into()),
            ..WorkQuery::default()
        })
        .unwrap();
    assert_eq!(page.next.as_deref(), Some("cur-2"));
    let body = c.fake.requests()[0].body.clone().unwrap().to_string();
    assert!(body.contains(r#""key":{"eq":"ENG"}"#), "{body}");
}

impl Case {
    /// Every request is a `GET`, or a `POST` that holds a read query and no mutation.
    fn assert_read_only(&self) {
        let reqs = self.fake.requests();
        assert!(!reqs.is_empty(), "{}", self.name);
        for r in reqs {
            if r.method == Method::Post {
                let body = r.body.as_ref().map(ToString::to_string).unwrap_or_default();
                assert!(!body.contains("mutation"), "{}: {body}", self.name);
                assert!(
                    r.url.contains("graphql") || r.url.contains("wiql"),
                    "{}: POST {}",
                    self.name,
                    r.url
                );
            }
        }
    }
}
