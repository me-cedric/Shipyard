//! The forge contract suite (REQ-005, REQ-012, REQ-019). One suite runs against the three adapters
//! on recorded JSON. The fixtures hold the same pull requests and checks in the shape of each
//! product. No test uses the network.

use shipyard_forges::*;
use shipyard_http::Method;
use shipyard_http::fake::FakeHttp;
use shipyard_secrets::Secret;
use std::sync::Arc;

macro_rules! fx {
    ($path:literal) => {
        include_str!(concat!("fixtures/", $path))
    };
}

struct Case {
    name: &'static str,
    forge: Box<dyn Forge>,
    fake: Arc<FakeHttp>,
    repo: &'static str,
    /// `can_push` of the three listed repositories (the third one is archived).
    push: [Option<bool>; 3],
}

fn build(kind: ForgeKind, url: &str, fake: Arc<FakeHttp>) -> Box<dyn Forge> {
    let config = ForgeConfig {
        kind,
        url: url.into(),
    };
    connect(&config, Secret::new("tok-contract-secret"), fake).expect("connect")
}

fn github() -> Case {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/user/repos", 200, fx!("github/repos.json"))
        .get("/user", 200, fx!("github/user.json"))
        .get(
            "/commits/abc123/check-runs",
            200,
            fx!("github/check_runs.json"),
        )
        .get("/commits/abc123/status", 200, fx!("github/status.json"))
        .get("/repos/acme/web/pulls/7", 200, fx!("github/pull.json"))
        .get("/repos/acme/web/pulls?", 200, fx!("github/pulls.json"))
        .get("/repos/acme/web", 200, fx!("github/repo.json"));
    Case {
        name: "github",
        forge: build(ForgeKind::GitHub, "https://github.com", fake.clone()),
        fake,
        repo: "acme/web",
        push: [Some(true), Some(false), Some(false)],
    }
}

fn gitlab() -> Case {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/api/v4/user", 200, fx!("gitlab/user.json"))
        .get(
            "/personal_access_tokens/self",
            200,
            fx!("gitlab/token_self.json"),
        )
        .get("/api/v4/projects?", 200, fx!("gitlab/repos.json"))
        .get("/pipelines/99/jobs", 200, fx!("gitlab/jobs.json"))
        .get("/merge_requests/7", 200, fx!("gitlab/mr.json"))
        .get("/merge_requests?", 200, fx!("gitlab/mrs.json"))
        .get("/projects/acme%2Fweb", 200, fx!("gitlab/repo.json"));
    Case {
        name: "gitlab",
        forge: build(ForgeKind::GitLab, "https://gitlab.com", fake.clone()),
        fake,
        repo: "acme/web",
        push: [Some(true), Some(false), Some(false)],
    }
}

fn azure() -> Case {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/_apis/connectionData", 200, fx!("azure/connection.json"))
        .get("/_apis/git/repositories?", 200, fx!("azure/repos.json"))
        .get("/pullrequests/7/statuses", 200, fx!("azure/statuses.json"))
        .get(
            "/_apis/policy/evaluations",
            200,
            fx!("azure/evaluations.json"),
        )
        .get("/pullrequests/7?", 200, fx!("azure/pull.json"))
        .get("/pullrequests?", 200, fx!("azure/pulls.json"))
        .get("/_apis/git/repositories/web?", 200, fx!("azure/repo.json"));
    Case {
        name: "azure-devops",
        forge: build(
            ForgeKind::AzureDevOps,
            "https://dev.azure.com/acme",
            fake.clone(),
        ),
        fake,
        repo: "Payments/web",
        push: [None, None, None],
    }
}

fn cases() -> Vec<Case> {
    vec![github(), gitlab(), azure()]
}

#[test]
fn every_adapter_lists_pull_requests_in_the_same_shape() {
    for c in cases() {
        let q = PullQuery {
            state: StateFilter::All,
            ..PullQuery::default()
        };
        let page = c.forge.list_pulls(c.repo, &q).unwrap();
        assert_eq!(page.items.len(), 2, "{}", c.name);
        let (open, merged) = (&page.items[0], &page.items[1]);
        assert_eq!(
            (open.number, open.state, open.draft),
            (7, PullState::Open, false),
            "{}",
            c.name
        );
        assert_eq!(open.title, "Add export endpoint", "{}", c.name);
        assert_eq!(
            open.author.chars().take(3).collect::<String>(),
            "ada",
            "{}",
            c.name
        );
        assert_eq!(
            (open.source_branch.as_str(), open.target_branch.as_str()),
            ("feature/export", "main"),
            "{}",
            c.name
        );
        assert_eq!(open.head_sha, "abc123", "{}", c.name);
        assert!(
            open.url.starts_with("https://") && open.url.contains('7'),
            "{}: {}",
            c.name,
            open.url
        );
        assert!(
            open.updated.starts_with("2026-10-28T09:30"),
            "{}: {}",
            c.name,
            open.updated
        );
        assert_eq!(
            (merged.number, merged.state),
            (6, PullState::Merged),
            "{}",
            c.name
        );
        assert!(
            merged.updated.starts_with("2026-10-27"),
            "{}: {}",
            c.name,
            merged.updated
        );
    }
}

#[test]
fn pull_returns_one_request() {
    for c in cases() {
        let p = c.forge.pull(c.repo, 7).unwrap();
        assert_eq!(
            (p.number, p.state, p.head_sha.as_str()),
            (7, PullState::Open, "abc123"),
            "{}",
            c.name
        );
    }
}

#[test]
fn ci_status_is_the_same_for_every_forge() {
    for c in cases() {
        let ci = c.forge.ci_status(c.repo, 7).unwrap();
        assert_eq!(ci.state, CiState::Failing, "{}", c.name);
        let got: Vec<(&str, CheckState)> = ci
            .checks
            .iter()
            .map(|k| (k.name.as_str(), k.state))
            .collect();
        assert_eq!(
            got,
            [
                ("build", CheckState::Passing),
                ("docs", CheckState::Skipped),
                ("lint", CheckState::Failing)
            ],
            "{}",
            c.name
        );
    }
}

#[test]
fn repositories_carry_the_push_marker() {
    for c in cases() {
        let page = c.forge.list_repos(None, 0).unwrap();
        let got: Vec<Option<bool>> = page.items.iter().map(|r| r.can_push).collect();
        assert_eq!(got, c.push, "{}", c.name);
        assert_eq!(page.items[0].default_branch, "main", "{}", c.name);
        assert!(
            page.items[2].archived || c.name == "azure-devops",
            "{}",
            c.name
        );
        assert!(
            page.items[0].slug.ends_with("/web"),
            "{}: {}",
            c.name,
            page.items[0].slug
        );
    }
}

#[test]
fn the_push_target_check_names_a_read_only_repository() {
    // GitHub and GitLab: the fixture holds a repository that the account can only read.
    let gh = github().forge.repository("acme/web").unwrap();
    assert_eq!(gh.can_push, Some(false));
    let gl = gitlab();
    gl.fake
        .get("/projects/acme%2Fdocs", 200, fx!("gitlab/repo.json"));
    assert_eq!(
        gl.forge.repository("acme/docs").unwrap().can_push,
        Some(false)
    );
    // Azure DevOps: a listing does not say; the security API answers for one repository.
    let az = azure();
    assert_eq!(az.forge.repository("Payments/web").unwrap().can_push, None);
    az.fake
        .get("/_apis/permissions/", 200, r#"{"value":[true]}"#);
    assert_eq!(
        az.forge.repository("Payments/web").unwrap().can_push,
        Some(true)
    );
    let asked = az.fake.requests();
    assert!(
        asked
            .iter()
            .any(|r| r.url.contains("tokens=repoV2%2Fp1%2Fr1")),
        "{asked:?}"
    );
}

#[test]
fn the_test_passes_and_sends_no_write() {
    for c in cases() {
        assert_eq!(
            c.forge.test(None),
            TestOutcome::Passed {
                account: "Ada Lovelace".into()
            },
            "{}",
            c.name
        );
        assert_eq!(
            c.forge.test(Some(c.repo)),
            TestOutcome::Passed {
                account: "Ada Lovelace".into()
            },
            "{}",
            c.name
        );
        let reqs = c.fake.requests();
        assert!(reqs.len() >= 2, "{}", c.name);
        assert!(
            reqs.iter().all(|r| r.method == Method::Get),
            "{}: a forge adapter reads with GET only",
            c.name
        );
        assert!(
            reqs.iter().all(|r| !r.url.contains("tok-contract-secret")),
            "{}",
            c.name
        );
    }
}

#[test]
fn a_missing_scope_is_named() {
    // GitHub fine-grained token: the refusal names the permission.
    let fake = Arc::new(FakeHttp::new());
    fake.get("/user", 200, fx!("github/user.json")).get_with(
        "/repos/acme/web/pulls",
        403,
        &[("X-Accepted-GitHub-Permissions", "pull_requests=read")],
        "{}",
    );
    let f = build(ForgeKind::GitHub, "https://github.com", fake);
    assert_eq!(
        f.test(Some("acme/web")),
        TestOutcome::MissingScope {
            scope: "pull_requests=read".into()
        }
    );

    // GitLab personal access token without an API scope.
    let fake = Arc::new(FakeHttp::new());
    fake.get("/api/v4/user", 200, fx!("gitlab/user.json")).get(
        "/personal_access_tokens/self",
        200,
        fx!("gitlab/token_self_narrow.json"),
    );
    let f = build(ForgeKind::GitLab, "https://gitlab.com", fake);
    assert_eq!(
        f.test(None),
        TestOutcome::MissingScope {
            scope: "read_api".into()
        }
    );

    // Azure DevOps: a 403 with no hint names the scope of the product.
    let fake = Arc::new(FakeHttp::new());
    fake.get("/_apis/connectionData", 200, fx!("azure/connection.json"))
        .get("/_apis/git/repositories", 403, "{}");
    let f = build(ForgeKind::AzureDevOps, "https://dev.azure.com/acme", fake);
    assert_eq!(
        f.test(None),
        TestOutcome::MissingScope {
            scope: "Code: Read".into()
        }
    );
}

#[test]
fn a_rejected_token_and_an_unseen_repository_are_not_a_pass() {
    let fake = Arc::new(FakeHttp::new());
    fake.get("/user", 401, "{}");
    let f = build(ForgeKind::GitHub, "https://github.com", fake);
    assert!(matches!(f.test(None), TestOutcome::Failed { reason } if reason.contains("rejected")));

    let fake = Arc::new(FakeHttp::new());
    fake.get("/user", 200, fx!("github/user.json"))
        .get("/repos/acme/secret/pulls", 404, "{}");
    let f = build(ForgeKind::GitHub, "https://github.com", fake);
    assert!(
        matches!(f.test(Some("acme/secret")), TestOutcome::Failed { reason } if reason.contains("not found"))
    );
}

#[test]
fn github_filters_merged_and_pages() {
    let c = github();
    let q = PullQuery {
        state: StateFilter::Merged,
        limit: 2,
        ..PullQuery::default()
    };
    let page = c.forge.list_pulls(c.repo, &q).unwrap();
    assert_eq!(page.items.iter().map(|p| p.number).collect::<Vec<_>>(), [6]);
    assert_eq!(page.next.as_deref(), Some("2"));
    assert!(c.fake.requests()[0].url.contains("state=closed"));
}

#[test]
fn a_bad_repository_name_or_address_is_refused_before_any_request() {
    for c in cases() {
        for bad in ["", "web", "acme/../x", "acme//web", "acme/web?x=1"] {
            assert!(
                c.forge.list_pulls(bad, &PullQuery::default()).is_err(),
                "{}: {bad}",
                c.name
            );
        }
        assert!(c.fake.requests().is_empty(), "{}", c.name);
    }
    let fake = Arc::new(FakeHttp::new());
    for url in ["http://github.com", "https://tok@github.com", "not a url"] {
        let config = ForgeConfig {
            kind: ForgeKind::GitHub,
            url: url.into(),
        };
        assert!(
            connect(&config, Secret::new("t"), fake.clone()).is_err(),
            "{url}"
        );
    }
}

#[test]
fn gitlab_encodes_the_project_path_and_follows_the_next_page_header() {
    let fake = Arc::new(FakeHttp::new());
    fake.get_with(
        "/merge_requests?",
        200,
        &[("X-Next-Page", "2")],
        fx!("gitlab/mrs.json"),
    );
    let f = build(
        ForgeKind::GitLab,
        "https://gitlab.example.com",
        fake.clone(),
    );
    let page = f
        .list_pulls("group/sub/web", &PullQuery::default())
        .unwrap();
    assert_eq!(page.next.as_deref(), Some("2"));
    let url = fake.requests()[0].url.clone();
    assert!(
        url.starts_with(
            "https://gitlab.example.com/api/v4/projects/group%2Fsub%2Fweb/merge_requests?"
        ),
        "{url}"
    );
}
