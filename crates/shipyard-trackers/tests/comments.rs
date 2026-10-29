//! Contract tests for the comment calls and the hidden markers (`add-sync` REQ-009, `add-questions-loop`
//! REQ-006 and REQ-009). One suite runs against the six writers. A fake `Http` answers from recorded
//! JSON in `tests/fixtures`; no test uses the network.

use serde_json::{Value, json};
use shipyard_core::work_item::TrackerKind;
use shipyard_http::fake::FakeHttp;
use shipyard_http::{Error as HttpError, Method};
use shipyard_secrets::Secret;
use shipyard_trackers::marker;
use shipyard_trackers::work::*;
use shipyard_trackers::{TrackerConfig, TrackerError};
use std::sync::Arc;

macro_rules! fx {
    ($path:literal) => {
        include_str!(concat!("fixtures/", $path))
    };
}

struct C {
    w: Box<dyn TrackerWrite>,
    fake: Arc<FakeHttp>,
    key: &'static str,
    /// The ids of the three comments of the two recorded pages, oldest first.
    ids: &'static [&'static str],
    /// The id that the recorded create answer holds.
    created: &'static str,
}

const NAMES: [&str; 6] = [
    "jira-cloud",
    "jira-dc",
    "github",
    "gitlab",
    "azure",
    "linear",
];

fn writer(name: &str, fake: &Arc<FakeHttp>) -> Box<dyn TrackerWrite> {
    let (kind, url) = match name {
        "jira-cloud" => (TrackerKind::JiraCloud, "https://acme.atlassian.net"),
        "jira-dc" => (TrackerKind::JiraDataCenter, "https://jira.example.com"),
        "github" => (TrackerKind::GitHubIssues, "https://github.com"),
        "gitlab" => (TrackerKind::GitLabIssues, "https://gitlab.com"),
        "azure" => (TrackerKind::AzureDevOps, "https://dev.azure.com/acme"),
        _ => (TrackerKind::Linear, "https://linear.app"),
    };
    let config = TrackerConfig {
        kind,
        url: url.into(),
        user: Some("ada@example.com".into()),
    };
    connect_write(&config, Secret::new("tok-comment-secret"), fake.clone()).expect("connect")
}

/// The happy routes of a tracker. `deny` answers an edit and a delete with 403.
fn case(name: &'static str, deny: bool) -> C {
    let fake = Arc::new(FakeHttp::new());
    let (status, body) = if deny {
        (403, "only the author")
    } else {
        (200, "{}")
    };
    let (key, ids, created): (&str, &'static [&'static str], &str) = match name {
        "jira-cloud" | "jira-dc" => {
            fake.put("/issue/PROJ-12/comment/10050", "", status, body)
                .delete(
                    "/issue/PROJ-12/comment/10050",
                    if deny { 403 } else { 204 },
                    "",
                )
                .post(
                    "/issue/PROJ-12/comment",
                    "",
                    201,
                    fx!("jira/comment_created.json"),
                )
                .get("startAt=2", 200, fx!("jira/comments_page2.json"))
                .get("startAt=0", 200, fx!("jira/comments_page1.json"));
            ("PROJ-12", &["10001", "10002", "10003"], "10050")
        }
        "github" => {
            fake.patch("/repos/acme/web/issues/comments/9001", "", status, body)
                .delete("/repos/acme/web/issues/comments/9001", if deny { 403 } else { 204 }, "")
                .post(
                    "/repos/acme/web/issues/12/comments",
                    "",
                    201,
                    fx!("github/comment_created.json"),
                )
                .get("page=2", 200, fx!("github/comments_page2.json"))
                .get_with(
                    "/issues/12/comments",
                    200,
                    &[(
                        "Link",
                        r#"<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=2>; rel="last""#,
                    )],
                    fx!("github/comments_page1.json"),
                );
            ("acme/web#12", &["9001", "9002", "9003"], "9001")
        }
        "gitlab" => {
            fake.put("/issues/12/notes/501", "", status, body)
                .delete("/issues/12/notes/501", if deny { 403 } else { 204 }, "")
                .post("/issues/12/notes", "", 201, fx!("gitlab/note_created.json"))
                .get("page=2", 200, fx!("gitlab/notes_page2.json"))
                .get_with(
                    "/issues/12/notes",
                    200,
                    &[("X-Next-Page", "2")],
                    fx!("gitlab/notes_page1.json"),
                );
            ("acme/web#12", &["501", "502"], "501")
        }
        "azure" => {
            fake.get(
                "workitems/412?fields=System.TeamProject&",
                200,
                fx!("azure/project_only.json"),
            )
            .patch(
                "/Payments/_apis/wit/workItems/412/comments/41",
                "",
                status,
                body,
            )
            .delete(
                "/Payments/_apis/wit/workItems/412/comments/41",
                if deny { 403 } else { 204 },
                "",
            )
            .post(
                "/Payments/_apis/wit/workItems/412/comments",
                "",
                200,
                fx!("azure/comment_created.json"),
            )
            .get(
                "continuationToken=tok-2",
                200,
                fx!("azure/comments_page2.json"),
            )
            .get("/comments", 200, fx!("azure/comments_page1.json"));
            ("412", &["31", "32", "33"], "41")
        }
        _ => {
            if deny {
                fake.post(
                    "graphql",
                    "commentUpdate",
                    200,
                    r#"{"errors":[{"message":"forbidden","extensions":{"type":"forbidden"}}]}"#,
                )
                .post(
                    "graphql",
                    "commentDelete",
                    200,
                    r#"{"errors":[{"message":"forbidden","extensions":{"type":"forbidden"}}]}"#,
                );
            } else {
                fake.post(
                    "graphql",
                    "commentUpdate",
                    200,
                    r#"{"data":{"commentUpdate":{"success":true}}}"#,
                )
                .post(
                    "graphql",
                    "commentDelete",
                    200,
                    r#"{"data":{"commentDelete":{"success":true}}}"#,
                );
            }
            fake.post(
                "graphql",
                "commentCreate",
                200,
                fx!("linear/comment_created.json"),
            )
            .post(
                "graphql",
                r#""after":"cur-2""#,
                200,
                fx!("linear/comments_page2.json"),
            )
            .post(
                "graphql",
                "comments(first",
                200,
                fx!("linear/comments_page1.json"),
            )
            .post(
                "graphql",
                "issue(id: $id) { id }",
                200,
                fx!("linear/issue_id.json"),
            );
            ("ENG-42", &["c1", "c2", "c3"], "c9")
        }
    };
    C {
        w: writer(name, &fake),
        fake,
        key,
        ids,
        created,
    }
}

fn question() -> String {
    format!(
        "Which option?\n\n1. a & b (recommended)\n2. <c>\n\nReply with the number.\n\n{}",
        marker::make("q", "Q-007")
    )
}

/// The JSON that the last write request sent.
fn last_write(fake: &FakeHttp) -> Value {
    fake.requests()
        .into_iter()
        .rev()
        .find(|r| r.method != Method::Get && r.body.is_some())
        .and_then(|r| r.body)
        .expect("a write with a body")
}

/// The text of the comment in a write body, whatever the tracker calls the field.
fn sent_text(v: &Value) -> String {
    if let Some(vars) = v.pointer("/variables/input/body") {
        return vars.as_str().unwrap().into();
    }
    ["/body", "/text"]
        .iter()
        .find_map(|p| v.pointer(p))
        .and_then(Value::as_str)
        .expect("a comment text")
        .into()
}

// ---- add

#[test]
fn a_comment_is_added_and_its_id_comes_back_for_every_tracker() {
    for name in NAMES {
        let c = case(name, false);
        let id = c.w.add_comment(c.key, "hello").unwrap();
        assert_eq!(id, c.created, "{name}");
        assert_eq!(sent_text(&last_write(&c.fake)), "hello", "{name}");
    }
}

#[test]
fn the_marker_goes_out_in_the_wire_form_of_the_tracker() {
    for name in NAMES {
        let c = case(name, false);
        c.w.add_comment(c.key, &question()).unwrap();
        let text = sent_text(&last_write(&c.fake));
        match name {
            "github" | "gitlab" => assert!(
                text.ends_with("<!-- shipyard:q Q-007 -->"),
                "{name}: {text}"
            ),
            "azure" => assert!(
                text.ends_with("(shipyard:q Q-007)")
                    && text.contains("&amp;")
                    && text.contains("<br>"),
                "{name}: {text}"
            ),
            _ => assert!(
                text.ends_with("(shipyard:q Q-007)") && !text.contains("<!--"),
                "{name}: {text}"
            ),
        }
    }
}

#[test]
fn linear_looks_the_issue_up_before_it_comments() {
    let c = case("linear", false);
    c.w.add_comment(c.key, "hello").unwrap();
    let reqs = c.fake.requests();
    assert_eq!(reqs.len(), 2);
    let create = reqs[1].body.as_ref().unwrap().to_string();
    assert!(create.contains(r#""issueId":"uuid-ENG-42""#), "{create}");
}

#[test]
fn azure_sends_the_comment_to_the_preview_api_of_the_project() {
    let c = case("azure", false);
    c.w.add_comment(c.key, "hello").unwrap();
    let post = c
        .fake
        .requests()
        .into_iter()
        .find(|r| r.method == Method::Post)
        .unwrap();
    assert!(
        post.url.contains("api-version=7.1-preview.4"),
        "{}",
        post.url
    );
}

// ---- list

#[test]
fn comments_page_by_cursor_and_return_the_canonical_marker() {
    for name in NAMES {
        let c = case(name, false);
        let one = c.w.comments_page(c.key, None).unwrap();
        assert!(one.next.is_some(), "{name}: a second page");
        let two = c.w.comments_page(c.key, one.next.as_deref()).unwrap();
        assert_eq!(two.next, None, "{name}");
        let all: Vec<_> = one.items.iter().chain(&two.items).collect();
        let got: Vec<&str> = all.iter().map(|c| c.id.as_str()).collect();
        // GitLab drops its system note.
        assert_eq!(got, c.ids, "{name}");
        let asked = all
            .iter()
            .find(|c| marker::find(&c.body, "q").is_some())
            .unwrap_or_else(|| panic!("{name}: no marker comment"));
        assert_eq!(
            marker::find(&asked.body, "q").as_deref(),
            Some("Q-007"),
            "{name}"
        );
        assert!(
            asked.body.ends_with("<!-- shipyard:q Q-007 -->"),
            "{name}: {}",
            asked.body
        );
        assert!(
            !asked.author.name.is_empty() && asked.created.starts_with("2026-10-28"),
            "{name}"
        );
    }
}

#[test]
fn all_comments_follows_every_page() {
    for name in NAMES {
        let c = case(name, false);
        let all = all_comments(&*c.w, c.key).unwrap();
        let ids: Vec<&str> = all.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, c.ids, "{name}");
    }
}

#[test]
fn the_plain_read_returns_the_canonical_marker_too() {
    for name in ["jira-cloud", "jira-dc", "azure", "linear"] {
        let c = case(name, false);
        let all = c.w.comments(c.key).unwrap();
        assert_eq!(all.len(), c.ids.len(), "{name}: every page");
        let asked = all.iter().find(|c| c.body.contains("shipyard:q")).unwrap();
        assert!(
            asked.body.ends_with("<!-- shipyard:q Q-007 -->"),
            "{name}: {}",
            asked.body
        );
    }
}

// ---- edit and delete

#[test]
fn a_comment_is_edited_and_deleted_by_id() {
    for name in NAMES {
        let c = case(name, false);
        c.w.edit_comment(c.key, c.created, "new text").unwrap();
        assert_eq!(sent_text(&last_write(&c.fake)), "new text", "{name}");
        c.w.delete_comment(c.key, c.created).unwrap();
        let last = c.fake.requests().pop().unwrap();
        if name == "linear" {
            let b = last.body.unwrap().to_string();
            assert!(
                b.contains("commentDelete") && b.contains(&format!(r#""id":"{}""#, c.created)),
                "{b}"
            );
        } else {
            assert_eq!(last.method, Method::Delete, "{name}");
            assert!(last.url.contains(c.created), "{name}: {}", last.url);
        }
    }
}

#[test]
fn a_comment_of_another_person_is_refused_with_a_reason() {
    for name in NAMES {
        let c = case(name, true);
        for result in [
            c.w.edit_comment(c.key, c.created, "x"),
            c.w.delete_comment(c.key, c.created),
        ] {
            let err = result.unwrap_err();
            assert!(matches!(err, TrackerError::Refused(_)), "{name}: {err:?}");
            assert!(!format!("{err:?}").contains("tok-comment-secret"));
        }
    }
}

#[test]
fn a_crafted_comment_id_never_reaches_the_url() {
    for name in ["github", "gitlab", "azure", "jira-cloud"] {
        let c = case(name, false);
        let before = c.fake.requests().len();
        assert!(c.w.edit_comment(c.key, "1/../../x", "x").is_err(), "{name}");
        assert!(c.w.delete_comment(c.key, "1?x=y").is_err(), "{name}");
        assert_eq!(
            c.fake.requests().len(),
            before,
            "{name}: a request went out"
        );
    }
}

#[test]
fn a_failed_comment_write_names_the_status() {
    let fake = Arc::new(FakeHttp::new());
    fake.post("/comments", "", 500, "boom");
    let w = writer("github", &fake);
    let err = w.add_comment("acme/web#12", "x").unwrap_err();
    assert!(
        matches!(
            err,
            TrackerError::Http(HttpError::Status { status: 500, .. })
        ),
        "{err:?}"
    );
}

// ---- the round trip through the conversion of each tracker

/// A list page that holds one comment with `stored` as its body, in the shape of the tracker.
fn page_of(name: &str, stored: &str) -> String {
    let user =
        json!({"id": 1, "login": "ada", "accountId": "a", "displayName": "Ada", "name": "Ada"});
    match name {
        "jira-cloud" | "jira-dc" => json!({"startAt":0,"total":1,"comments":[
            {"id":"1","author":user,"body":stored,"created":"2026-10-29T08:00:00.000+0000"}]}),
        "github" => json!([{"id":1,"user":user,"body":stored,"created_at":"2026-10-29T08:00:00Z"}]),
        "gitlab" => json!([{"id":1,"author":user,"body":stored,"system":false,"created_at":"2026-10-29T08:00:00Z"}]),
        "azure" => json!({"comments":[{"id":1,"createdBy":user,"text":stored,"createdDate":"2026-10-29T08:00:00Z"}]}),
        _ => json!({"data":{"issue":{"comments":{"nodes":[
            {"id":"1","user":user,"body":stored,"createdAt":"2026-10-29T08:00:00Z"}],
            "pageInfo":{"hasNextPage":false,"endCursor":null}}}}}),
    }
    .to_string()
}

/// What each tracker does to a body between the write and the read. These are the changes that a
/// recorded session shows or that the product documents: Jira Cloud turns `--` into a dash, Azure
/// DevOps wraps text in `div` and removes HTML comments, the others keep the text.
fn stored_by(name: &str, wire: &str) -> String {
    match name {
        "jira-cloud" => wire.replace("--", "\u{2013}"),
        "azure" => format!("<div>{}</div>", wire.replace("<!--", "").replace("-->", "")),
        _ => wire.to_string(),
    }
}

#[test]
fn the_marker_survives_the_write_the_conversion_and_the_read() {
    for name in NAMES {
        let sent = case(name, false);
        let body = question();
        sent.w.add_comment(sent.key, &body).unwrap();
        let wire = sent_text(&last_write(&sent.fake));

        let fake = Arc::new(FakeHttp::new());
        let (key, route) = match name {
            "jira-cloud" | "jira-dc" => ("PROJ-12", "/issue/PROJ-12/comment"),
            "github" => ("acme/web#12", "/issues/12/comments"),
            "gitlab" => ("acme/web#12", "/issues/12/notes"),
            "azure" => ("412", "/comments"),
            _ => ("ENG-42", "comments(first"),
        };
        if name == "azure" {
            fake.get(
                "workitems/412?fields=System.TeamProject&",
                200,
                fx!("azure/project_only.json"),
            );
        }
        let page = page_of(name, &stored_by(name, &wire));
        if name == "linear" {
            fake.post("graphql", route, 200, &page);
        } else {
            fake.get(route, 200, &page);
        }
        let got = writer(name, &fake).comments_page(key, None).unwrap();
        assert_eq!(got.items[0].body, body, "{name}");
        assert_eq!(
            marker::find(&got.items[0].body, "q").as_deref(),
            Some("Q-007"),
            "{name}"
        );
    }
}
