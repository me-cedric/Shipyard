//! The sync adapters and the host (spec `sync`, REQ-001, REQ-005, REQ-014, REQ-016). A memory
//! keychain and a fake HTTP client stand in for the world.

use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use shipyard_app::connections::{ConnectionDraft, ConnectionGroup, ConnectionKind, Connections};
use shipyard_app::sync::{ForgeAdapter, Plan, SyncHost, TrackerAdapter};
use shipyard_core::pickup::{Automation, Ci, PrState};
use shipyard_engine::iso;
use shipyard_engine::ports::{ForgePort, ListQuery, TrackerPort};
use shipyard_http::{Method, fake::FakeHttp};
use shipyard_secrets::{MemoryStore, Secret};

macro_rules! tracker_fx {
    ($f:literal) => {
        include_str!(concat!(
            "../../shipyard-trackers/tests/fixtures/github/",
            $f
        ))
    };
}
macro_rules! forge_fx {
    ($f:literal) => {
        include_str!(concat!("../../shipyard-forges/tests/fixtures/github/", $f))
    };
}

struct Fixture {
    dir: tempfile::TempDir,
    http: Arc<FakeHttp>,
    conns: Arc<Connections>,
}

/// A sync host over a fake factory: a started run is a record, nothing runs.
fn host(f: &Fixture, background: bool) -> SyncHost {
    let dispatch = Arc::new(shipyard_engine::fake::FakeDispatch::new(
        &shipyard_engine::fake::Log::default(),
    ));
    SyncHost::new(f.dir.path(), f.conns.clone(), background, dispatch)
}

fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let http = Arc::new(FakeHttp::new());
    // The account of the connection. Only its comments can hold a claim stamp.
    http.get(
        "api.github.com/user",
        200,
        r#"{"login":"ada","name":"Ada"}"#,
    );
    http.get(
        "/repos/acme/web/issues/12/comments",
        200,
        tracker_fx!("comments.json"),
    )
    .get("/repos/acme/web/issues/12", 200, tracker_fx!("issue.json"))
    .get("/repos/acme/web/issues?", 200, tracker_fx!("search.json"))
    .get(
        "/commits/abc123/check-runs",
        200,
        forge_fx!("check_runs.json"),
    )
    .get("/commits/abc123/status", 200, forge_fx!("status.json"))
    .get("/repos/acme/web/pulls/7", 200, forge_fx!("pull.json"))
    .get("/repos/acme/web/pulls?", 200, forge_fx!("pulls.json"));
    let conns = Arc::new(Connections::new(
        dir.path(),
        Arc::new(MemoryStore::default()),
        http.clone(),
    ));
    for (name, group) in [
        ("Issues", ConnectionGroup::Tracker),
        ("Code", ConnectionGroup::Forge),
    ] {
        let c = conns
            .add(ConnectionDraft {
                name: name.into(),
                group,
                kind: ConnectionKind::GitHub,
                url: "https://github.com".into(),
                user: None,
            })
            .unwrap();
        conns
            .set_secret(&c.id, Secret::new("tok-adapter-secret"))
            .unwrap();
    }
    Fixture { dir, http, conns }
}

fn plan(auto: Automation) -> Plan {
    Plan {
        project: "web".into(),
        tracker: "issues".into(),
        scope: Some("acme/web".into()),
        forge: Some(("code".into(), "acme/web".into())),
        automation: auto,
    }
}

#[test]
fn the_tracker_adapter_lists_open_tickets_first_and_changes_after() {
    let f = fixture();
    let t = TrackerAdapter::new(f.conns.clone(), "issues", Some("acme/web".into()));
    let page = t.list(&ListQuery::default()).unwrap();
    // The list holds an item that is a pull request: the adapter drops it.
    let keys: Vec<_> = page.items.iter().map(|i| i.item.key.as_str()).collect();
    assert_eq!(keys, ["acme/web#12", "acme/web#13"]);
    assert!(page.next.is_none());

    let since = ListQuery {
        since: Some("2026-10-27T00:00:00Z".into()),
        cursor: None,
    };
    t.list(&since).unwrap();
    let url = f.http.requests().last().unwrap().url.clone();
    assert!(
        url.contains("since=2026-10-27T00%3A00%3A00Z")
            || url.contains("since=2026-10-27T00:00:00Z"),
        "{url}"
    );

    assert_eq!(
        t.get("acme/web#12").unwrap().item.title,
        "Fix login redirect"
    );
    assert_eq!(t.comments("acme/web#12").unwrap().len(), 1);
    // GitHub issues hold comments, so they can hold a stamp. This ticket has none.
    assert!(t.can_stamp());
    assert!(t.stamps("acme/web#12").unwrap().is_empty());
}

#[test]
fn a_missing_secret_is_a_failed_call_with_a_reason() {
    let f = fixture();
    let c = f
        .conns
        .add(ConnectionDraft {
            name: "Bare".into(),
            group: ConnectionGroup::Tracker,
            kind: ConnectionKind::GitHub,
            url: "https://github.com".into(),
            user: None,
        })
        .unwrap();
    let t = TrackerAdapter::new(f.conns.clone(), &c.id, None);
    assert_eq!(
        t.list(&ListQuery::default()).err().as_deref(),
        Some("no secret saved")
    );
    let gone = TrackerAdapter::new(f.conns.clone(), "gone", None);
    assert!(gone.get("x").unwrap_err().contains("unknown connection"));
}

#[test]
fn the_forge_adapter_maps_pull_requests_and_ci() {
    let f = fixture();
    let p = ForgeAdapter::new(f.conns.clone(), "code", "acme/web");
    let page = p.pulls(&ListQuery::default()).unwrap();
    let open = page.items.iter().find(|s| s.number == 7).unwrap();
    assert_eq!(
        (open.state, open.ci, open.draft),
        (PrState::Open, Ci::Failing, false)
    );
    let merged = page.items.iter().find(|s| s.number == 6).unwrap();
    assert_eq!((merged.state, merged.ci), (PrState::Merged, Ci::None));
    assert_eq!(p.pull(7).unwrap().head_sha, "abc123");

    // With `since`, a merged pull request older than the cutoff is left out, an open one stays.
    let since = ListQuery {
        since: Some("2026-10-28T00:00:00Z".into()),
        cursor: None,
    };
    let numbers: Vec<_> = p
        .pulls(&since)
        .unwrap()
        .items
        .iter()
        .map(|s| s.number)
        .collect();
    assert_eq!(numbers, [7]);
}

#[test]
fn the_host_keeps_one_engine_for_a_plan_and_replaces_it_for_a_new_one() {
    let f = fixture();
    let host = host(&f, false);
    host.apply("web", Some(plan(Automation::default())))
        .unwrap();
    let first = host.running("web").unwrap();

    // Same sources: the same engine takes the new rules in place.
    let auto = Automation {
        interval: 90,
        ..Automation::default()
    };
    host.apply("web", Some(plan(auto))).unwrap();
    let same = host.running("web").unwrap();
    assert!(Arc::ptr_eq(&first, &same));
    assert_eq!(same.plan().automation.interval, 90);

    // Another scope: a new engine.
    let mut other = plan(Automation::default());
    other.scope = None;
    host.apply("web", Some(other)).unwrap();
    assert!(!Arc::ptr_eq(&first, &host.running("web").unwrap()));

    host.apply("web", None).unwrap();
    assert!(host.running("web").is_none());
    assert!(host.states("web").unwrap().is_empty());
}

#[test]
fn two_projects_on_one_connection_keep_their_own_cursor_and_only_the_open_one_runs() {
    let f = fixture();
    let host = host(&f, false);
    host.apply("web", Some(plan(Automation::default())))
        .unwrap();
    host.running("web").unwrap().tick(true).unwrap();
    let mirror = host.mirror().unwrap();
    assert!(mirror.state("issues@acme/web").unwrap().last_ok.is_some());

    // Another project: the same connection, another container.
    let mut other = plan(Automation::default());
    other.project = "api".into();
    other.scope = Some("acme/api".into());
    host.apply("api", Some(other)).unwrap();
    assert!(
        host.running("web").is_none(),
        "the project that is not open stops"
    );
    assert_eq!(
        mirror.state("issues@acme/api").unwrap().last_ok,
        None,
        "the poll of one container never moves the cursor of the other"
    );
    assert!(mirror.claims("issues@acme/api").unwrap().is_empty());
    assert!(!mirror.tickets("issues@acme/web").unwrap().is_empty());
    assert!(mirror.tickets("issues@acme/api").unwrap().is_empty());
}

#[test]
fn a_background_engine_ticks_by_itself_and_tells_the_views() {
    let f = fixture();
    let host = host(&f, true);
    let changes = Arc::new(AtomicU32::new(0));
    let seen = changes.clone();
    host.on_change(move || {
        seen.fetch_add(1, Ordering::SeqCst);
    });
    host.apply("web", Some(plan(Automation::default())))
        .unwrap();

    let deadline = Instant::now() + Duration::from_secs(10);
    let mut done = false;
    while Instant::now() < deadline && !done {
        done = host
            .states("web")
            .unwrap()
            .iter()
            .all(|(_, st, _)| st.last_ok.is_some())
            && !host.states("web").unwrap().is_empty();
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(done, "the first tick runs at once");
    assert!(changes.load(Ordering::SeqCst) >= 1, "a tick event went out");
    // The tick that was due at start is the only one for now: the interval is 60 s.
    let requests = f.http.requests().len();
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(f.http.requests().len(), requests);
    host.apply("web", None).unwrap();
}

/// A GitHub comment list: one person's comment, then the stamps `(machine, seconds ago)`.
fn comment_list(stamps: &[(&str, u64)]) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    let mut items = vec![
        r#"{"id":700,"user":{"login":"grace"},"body":"Reproduced on staging.","created_at":"2026-10-28T10:00:00Z"}"#
            .to_string(),
    ];
    for (i, (machine, ago)) in stamps.iter().enumerate() {
        items.push(format!(
            r#"{{"id":{},"user":{{"login":"ada"}},"body":"<!-- shipyard:claim {machine} -->","created_at":"{}"}}"#,
            9001 + i,
            iso(now - Duration::from_secs(*ago)),
        ));
    }
    format!("[{}]", items.join(","))
}

fn bodies(f: &Fixture, method: Method) -> Vec<(String, String)> {
    f.http
        .requests()
        .into_iter()
        .filter(|r| r.method == method)
        .map(|r| (r.url, r.body.map(|b| b.to_string()).unwrap_or_default()))
        .collect()
}

#[test]
fn a_claim_stamp_is_a_hidden_comment_that_the_questions_loop_never_sees() {
    let f = fixture();
    let t = TrackerAdapter::new(f.conns.clone(), "issues", Some("acme/web".into()));
    let comments = comment_list(&[("m-a", 3600), ("m-b", 30)]);
    f.http
        .get("/repos/acme/web/issues/5/comments", 200, &comments);
    let stamps = t.stamps("acme/web#5").unwrap();
    assert_eq!(
        stamps
            .iter()
            .map(|s| s.machine.as_str())
            .collect::<Vec<_>>(),
        ["m-a", "m-b"],
        "oldest first"
    );
    assert!(stamps[0].age > Duration::from_secs(3500) && stamps[0].age < Duration::from_secs(3700));
    assert!(stamps[1].age < Duration::from_secs(60));
    // The person's comment stays. The stamps do not reach `questions-loop`.
    let seen = t.comments("acme/web#5").unwrap();
    assert_eq!(seen.len(), 1);
    assert_eq!(seen[0].body, "Reproduced on staging.");
}

#[test]
fn a_stamp_is_written_once_refreshed_when_old_and_cleared_for_its_machine_only() {
    let f = fixture();
    let t = TrackerAdapter::new(f.conns.clone(), "issues", Some("acme/web".into()));
    let comments = comment_list(&[("m-a", 3600), ("m-b", 30)]);
    f.http
        .get("/repos/acme/web/issues/5/comments", 200, &comments)
        .post(
            "/repos/acme/web/issues/5/comments",
            "shipyard:claim",
            201,
            tracker_fx_created(),
        )
        .delete("/repos/acme/web/issues/comments/", 204, "");

    // A new machine adds its stamp.
    t.write_stamp("acme/web#5", "m-c").unwrap();
    let posts = bodies(&f, Method::Post);
    assert_eq!(posts.len(), 1);
    assert!(
        posts[0].1.contains("<!-- shipyard:claim m-c."),
        "{}",
        posts[0].1
    );

    // A young stamp is left alone: a tick each minute does not write each minute.
    t.write_stamp("acme/web#5", "m-b").unwrap();
    assert_eq!(bodies(&f, Method::Post).len(), 1);

    // An old stamp is written again, then the old copy goes.
    t.write_stamp("acme/web#5", "m-a").unwrap();
    assert_eq!(bodies(&f, Method::Post).len(), 2);
    assert_eq!(
        bodies(&f, Method::Delete)
            .into_iter()
            .map(|(u, _)| u)
            .collect::<Vec<_>>(),
        ["https://api.github.com/repos/acme/web/issues/comments/9001"]
    );

    // Clear removes the stamp of one machine and nothing else.
    t.clear_stamp("acme/web#5", "m-b").unwrap();
    let deletes = bodies(&f, Method::Delete);
    assert_eq!(deletes.len(), 2);
    assert!(deletes[1].0.ends_with("/issues/comments/9002"));
}

#[test]
fn a_stamp_counts_only_from_the_account_of_the_connection() {
    let f = fixture();
    let t = TrackerAdapter::new(f.conns.clone(), "issues", Some("acme/web".into()));
    f.http.get(
        "/repos/acme/web/issues/5/comments",
        200,
        r#"[{"id":1,"user":{"login":"mallory"},"body":"<!-- shipyard:claim m-evil -->","created_at":"2026-10-29T09:59:00Z"},
            {"id":2,"user":{"login":"ada"},"body":"<!-- shipyard:claim m-a -->","created_at":"2026-10-29T09:59:30Z"}]"#,
    );
    let machines: Vec<_> = t
        .stamps("acme/web#5")
        .unwrap()
        .into_iter()
        .map(|s| s.machine)
        .collect();
    assert_eq!(
        machines,
        ["m-a"],
        "the look-alike of another account is no stamp"
    );
}

#[test]
fn a_stamp_ages_by_the_clock_of_the_tracker_not_by_this_machine() {
    let f = fixture();
    let t = TrackerAdapter::new(f.conns.clone(), "issues", Some("acme/web".into()));
    // The server says 10:00:00 whatever the local clock says. The stamp is 30 s old by it.
    f.http.get_with(
        "/repos/acme/web/issues/5/comments",
        200,
        &[("Date", "Thu, 29 Oct 2026 10:00:00 GMT")],
        r#"[{"id":2,"user":{"login":"ada"},"body":"<!-- shipyard:claim m-a -->","created_at":"2026-10-29T09:59:30Z"}]"#,
    );
    let age = t.stamps("acme/web#5").unwrap()[0].age;
    assert!(
        (30..40).contains(&age.as_secs()),
        "30 s by the server clock, not the gap to this machine: {age:?}"
    );
}

#[test]
fn a_refresh_keeps_the_place_of_the_first_claim() {
    let f = fixture();
    let t = TrackerAdapter::new(f.conns.clone(), "issues", Some("acme/web".into()));
    f.http
        .get(
            "/repos/acme/web/issues/5/comments",
            200,
            r#"[{"id":2,"user":{"login":"ada"},"body":"<!-- shipyard:claim m-a.1793260000 -->","created_at":"2026-10-29T09:59:55Z"},
                {"id":3,"user":{"login":"ada"},"body":"<!-- shipyard:claim m-b.1793267990 -->","created_at":"2026-10-29T09:59:50Z"}]"#,
        )
        .post(
            "/repos/acme/web/issues/5/comments",
            "shipyard:claim",
            201,
            tracker_fx_created(),
        )
        .delete("/repos/acme/web/issues/comments/", 204, "");
    t.write_stamp("acme/web#5", "m-a").unwrap();
    let posts = bodies(&f, Method::Post);
    assert!(
        posts[0]
            .1
            .contains("<!-- shipyard:claim m-a.1793260000 -->"),
        "the new stamp carries the time of the first claim: {}",
        posts[0].1
    );
    // The order of a stamp is its first claim: m-a stays first, whatever its comment time.
    let order: Vec<_> = t
        .stamps("acme/web#5")
        .unwrap()
        .into_iter()
        .map(|s| s.machine)
        .collect();
    assert_eq!(order, ["m-a", "m-b"]);
}

fn tracker_fx_created() -> &'static str {
    tracker_fx!("comment_created.json")
}

#[test]
fn a_tick_with_the_comment_switch_on_stamps_the_ticket_it_claims() {
    let f = fixture();
    f.http.post(
        "/repos/acme/web/issues/12/comments",
        "shipyard:claim",
        201,
        tracker_fx_created(),
    );
    let host = host(&f, false);
    let mut auto = Automation::default();
    auto.writes.tracker_comment = true;
    host.apply("web", Some(plan(auto))).unwrap();
    let r = host.running("web").unwrap();
    let report = r.tick(true).unwrap();
    assert_eq!(report.started, ["acme/web#12"], "{:?}", report.errors);

    // The fake tracker keeps no state, so the heartbeat of the same tick cannot see the stamp and
    // writes it again. A real ticket shows it, and the write waits (see the test above).
    let posts = bodies(&f, Method::Post);
    assert!(!posts.is_empty());
    for (url, body) in posts {
        assert!(
            url.ends_with("/issues/12/comments"),
            "only the claimed ticket: {url}"
        );
        assert!(body.contains("shipyard:claim m-"), "{body}");
    }
    let claims = host.mirror().unwrap().claims("issues@acme/web").unwrap();
    assert!(
        claims[0].stamped,
        "the claim says that the ticket holds the stamp"
    );
}

#[test]
fn a_tick_with_the_switch_off_writes_nothing_to_the_tracker() {
    let f = fixture();
    let host = host(&f, false);
    host.apply("web", Some(plan(Automation::default())))
        .unwrap();
    let report = host.running("web").unwrap().tick(true).unwrap();
    assert_eq!(report.started, ["acme/web#12"]);
    assert!(bodies(&f, Method::Post).is_empty());
    assert!(bodies(&f, Method::Delete).is_empty());
    assert!(!host.mirror().unwrap().claims("issues@acme/web").unwrap()[0].stamped);
}
