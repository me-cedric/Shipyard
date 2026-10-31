//! Live backend tests against GitHub (W13, part 2). Each test calls the command functions of the
//! app with an `AppState`, as the window does, and reads back the result from GitHub.
//!
//! They run only with `SHIPYARD_LIVE=1`. Otherwise each test prints a message and passes, so CI
//! stays green. The token comes from `GH_TOKEN` at run time and is never printed.
//!
//!     SHIPYARD_LIVE=1 GH_TOKEN=$(gh auth token) \
//!       cargo test -p shipyard-app --test live_github -- --test-threads=1 --nocapture
//!
//! `SHIPYARD_CA_BUNDLE` (or `SSL_CERT_FILE`) names a certificate file that the app trusts next to the
//! OS roots, for a machine behind a proxy that signs its own certificates. `SHIPYARD_SEED_DIR` names
//! the seed project (default `~/Projects/shipyard-acceptance`).
//!
//! The project is a copy of the seed project (`node scripts/acceptance/seed.mjs --remote github`).
//! A test opens a branch and a pull request at most, and removes both at the end. The repositories
//! stay, and so do the two sample issues that the tracker test reuses.

use std::fmt::Display;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use shipyard_app::commands::sync::{self as sync, ItemFilter};
use shipyard_app::commands::{AppState, code as git, projects};
use shipyard_app::connections::{ConnectionDraft, ConnectionGroup, ConnectionKind, Connections};
use shipyard_app::{code, delivery, design, knowledge, publish, specs, work};
use shipyard_core::work::{Row, RowKind};
use shipyard_forges::Verdict;
use shipyard_secrets::{MemoryStore, Secret};

const OWNER: &str = "me-cedric";
const SLUG: &str = "me-cedric/shipyard-acceptance";
const PUBLISH_SLUG: &str = "me-cedric/shipyard-acceptance-publish";

fn stamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// The state of one live test: a copy of the seed project, a state over a memory keychain that
/// holds the token, and what to remove at the end.
struct Live {
    _dir: tempfile::TempDir,
    data: PathBuf,
    root: PathBuf,
    conns: Arc<Connections>,
    s: AppState,
    token: String,
    forge: String,
    /// The failed steps. A step that fails does not stop the test: the cleanup must run.
    fails: Vec<String>,
    prs: Vec<u32>,
    branches: Vec<String>,
}

fn live() -> Option<Live> {
    if std::env::var("SHIPYARD_LIVE").as_deref() != Ok("1") {
        eprintln!("skipped: set SHIPYARD_LIVE=1 and GH_TOKEN to run the live GitHub tests");
        return None;
    }
    let token =
        std::env::var("GH_TOKEN").expect("SHIPYARD_LIVE=1 needs GH_TOKEN in the environment");
    let home = std::env::var("HOME").expect("HOME");
    let seed = std::env::var("SHIPYARD_SEED_DIR")
        .unwrap_or_else(|_| format!("{home}/Projects/shipyard-acceptance"));
    assert!(
        Path::new(&seed).join(".shipyard/project.yaml").is_file(),
        "no seed project at {seed}: run `node scripts/acceptance/seed.mjs --remote github`"
    );
    let dir = tempfile::tempdir().unwrap();
    let data = dir.path().join("data");
    std::fs::create_dir_all(&data).unwrap();
    let root = dir.path().join("project");
    let cp = Command::new("cp")
        .args(["-R", &seed])
        .arg(&root)
        .status()
        .unwrap();
    assert!(cp.success(), "copy of the seed project failed");

    let conns = Arc::new(Connections::new(
        &data,
        Arc::new(MemoryStore::default()),
        Arc::new(shipyard_http::Client),
    ));
    let mut ids = Vec::new();
    for (name, group) in [
        ("Issue tracker", ConnectionGroup::Tracker),
        ("Code host", ConnectionGroup::Forge),
    ] {
        let c = conns
            .add(ConnectionDraft {
                name: name.into(),
                group,
                kind: ConnectionKind::GitHub,
                url: "https://github.com".into(),
                user: Some(OWNER.into()),
            })
            .unwrap();
        conns.set_secret(&c.id, Secret::new(token.clone())).unwrap();
        ids.push(c.id);
    }
    let (tracker, forge) = (ids[0].clone(), ids[1].clone());

    // The project names its connections, as a person does in Settings. The pickup rule is aimed at
    // an account that does not exist, so a tick never claims a ticket of the sample project.
    let file = root.join(".shipyard/project.yaml");
    let text = std::fs::read_to_string(&file).unwrap();
    std::fs::write(
        &file,
        format!(
            "{text}connections:\n  tracker: {tracker}\n  forge: {forge}\n  trackerScope: {SLUG}\n"
        ),
    )
    .unwrap();
    std::fs::write(
        root.join(".shipyard/automation.yaml"),
        "interval: 60\npickup:\n  label: agent\n  assignee: shipyard-live-nobody\n  statuses: []\n\
         concurrency:\n  global: 2\nwrites:\n  push: false\n  pull_request: false\n  \
         tracker_transition: false\n  tracker_comment: false\n",
    )
    .unwrap();

    let s = AppState::with_connections(data.clone(), conns.clone());
    let l = Live {
        _dir: dir,
        data,
        root,
        conns,
        s,
        token,
        forge,
        fails: Vec::new(),
        prs: Vec::new(),
        branches: Vec::new(),
    };
    // The first request of a process can fail with `UnknownIssuer` while the next one passes: the
    // app builds its root store from the OS roots on each request and ignores a read error (finding
    // F1 of the report). One throw-away call keeps that out of the steps below.
    let _ = l.conns.forge(&l.forge).map(|f| f.repository(SLUG));
    let out = projects::open(&l.s, l.root.to_str().unwrap())
        .unwrap_or_else(|e| panic!("{}", l.redact(&e)));
    assert_eq!(format!("{:?}", out.status), "Opened", "{:?}", out.message);
    Some(l)
}

impl Live {
    fn redact(&self, text: &str) -> String {
        text.replace(&self.token, "***")
    }

    /// One step. A failure is recorded with its error text and the step goes on.
    fn step<T, E: Display>(&mut self, what: &str, r: Result<T, E>) -> Option<T> {
        match r {
            Ok(v) => {
                println!("ok    {what}");
                Some(v)
            }
            Err(e) => {
                let line = format!("{what}: {}", self.redact(&e.to_string()));
                println!("FAIL  {line}");
                self.fails.push(line);
                None
            }
        }
    }

    /// A condition of a step.
    fn expect(&mut self, what: &str, cond: bool, detail: impl Display) {
        self.step(
            what,
            if cond {
                Ok(())
            } else {
                Err(format!("{detail}"))
            },
        );
    }

    fn finish(mut self) {
        self.cleanup();
        assert!(
            self.fails.is_empty(),
            "failed steps:\n{}",
            self.fails.join("\n")
        );
    }

    /// Closes the pull requests and deletes the branches that this test opened. The repositories
    /// stay. `gh` does this: the app has no command to delete a remote branch.
    fn cleanup(&mut self) {
        for n in std::mem::take(&mut self.prs) {
            let _ = Command::new("gh")
                .args(["pr", "close", &n.to_string(), "--repo", SLUG])
                .output();
        }
        for b in std::mem::take(&mut self.branches) {
            let out = Command::new("gh")
                .args([
                    "api",
                    "-X",
                    "DELETE",
                    &format!("repos/{SLUG}/git/refs/heads/{b}"),
                ])
                .output();
            println!(
                "clean branch {b}: {}",
                out.map_or("gh missing".into(), |o| o.status.to_string())
            );
        }
    }

    fn gh_json(&self, args: &[&str]) -> Value {
        let out = Command::new("gh").args(args).output().expect("gh");
        serde_json::from_slice(&out.stdout).unwrap_or(Value::Null)
    }

    fn reg(&mut self, branch: &str) {
        self.branches.push(branch.into());
    }
}

impl Drop for Live {
    fn drop(&mut self) {
        // A panic in a hard step still removes what was opened.
        self.cleanup();
    }
}

fn len<T: Serialize>(v: &T) -> usize {
    serde_json::to_value(v)
        .ok()
        .and_then(|v| v.as_array().map(Vec::len))
        .unwrap_or(0)
}

fn json<T: Serialize>(v: &T) -> Value {
    serde_json::to_value(v).unwrap()
}

// ---------------------------------------------------------------- 1. the seed project opens

#[test]
fn open_the_seed_project() {
    let Some(mut l) = live() else { return };
    let d = l.step("design: list", design::list(&l.s));
    if let Some(d) = d {
        let v = json(&d);
        let arts = v["artifacts"].as_array().cloned().unwrap_or_default();
        let has = |kind: &str, fmt: Option<&str>| {
            arts.iter().any(|x| {
                x["kind"] == kind && fmt.is_none_or(|f| x["format"] == f) && x["issue"].is_null()
            })
        };
        for (kind, fmt) in [
            ("diagram", Some("excalidraw")),
            ("diagram", Some("mermaid")),
            ("diagram", Some("bpmn")),
            ("diagram", Some("drawio")),
            ("model", None),
            ("api", None),
            ("data", None),
            ("flow", None),
        ] {
            l.expect(
                &format!("design: a readable {kind} {}", fmt.unwrap_or("")),
                has(kind, fmt),
                json(&arts),
            );
        }
        l.expect(
            "design: 3 decisions",
            v["adrs"].as_array().map_or(0, Vec::len) == 3,
            &v["adrs"],
        );
        l.expect(
            "design: screens",
            v["screens"].as_array().is_some_and(|s| !s.is_empty()),
            &v["screens"],
        );
    }
    let changes = l.step("specs: changes", specs::changes(&l.s));
    if let Some(c) = changes {
        let ids: Vec<String> = json(&c)
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x["id"].as_str().unwrap_or("").into())
            .collect();
        l.expect(
            "specs: two open changes",
            ids.contains(&"add-discount-codes".into()) && ids.contains(&"add-gift-cards".into()),
            format!("{ids:?}"),
        );
    }
    if let Some(c) = l.step("specs: capabilities", specs::capabilities(&l.s)) {
        l.expect("specs: two settled capabilities", len(&c) == 2, json(&c));
    }
    if let Some(q) = l.step("questions: RAID", specs::questions(&l.s)) {
        l.expect("questions: five items", len(&q) == 5, len(&q));
    }
    if let Some(t) = l.step("test plans", specs::testplans(&l.s)) {
        l.expect(
            "test plans: two, no syntax error",
            len(&t) == 2
                && json(&t)
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|p| p["errors"].as_array().is_some_and(Vec::is_empty)),
            json(&t),
        );
    }
    if let Some(u) = l.step(
        "test plans: coverage of checkout",
        specs::coverage(&l.s, "checkout"),
    ) {
        l.expect(
            "test plans: each requirement of checkout has a scenario",
            u.is_empty(),
            format!("{u:?}"),
        );
    }
    if let Some(t) = l.step("work: team", work::team_get(&l.s)) {
        let v = json(&t);
        l.expect(
            "work: seven members, no error",
            v["team"]["members"].as_array().map_or(0, Vec::len) == 7 && v["error"].is_null(),
            &v["error"],
        );
    }
    if let Some(s) = l.step("work: sheets", work::list_sheets(&l.s)) {
        l.expect(
            "work: two readable sheets",
            len(&s) == 2
                && json(&s)
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|x| x["error"].is_null()),
            json(&s),
        );
    }
    l.step("work: portfolio", work::portfolio(&l.s));
    l.step("work: plan of checkout", work::plan(&l.s, "checkout"));
    if let Some(t) = l.step(
        "work: time of chloe",
        work::time_month(&l.s, Some("chloe"), "2026-10"),
    ) {
        l.expect(
            "work: three time entries",
            json(&t)["rows"].as_array().map_or(0, Vec::len) == 3,
            json(&t),
        );
    }
    if let Some(d) = l.step("knowledge: documents", knowledge::doc_list(&l.s)) {
        let v = json(&d);
        l.expect(
            "knowledge: handbook, documents and a deck",
            v["handbook"].as_array().map_or(0, Vec::len) == 2
                && v["documents"].as_array().map_or(0, Vec::len) == 2
                && v["slides"].as_array().is_some_and(|s| !s.is_empty()),
            v,
        );
    }
    if let Some(d) = l.step("knowledge: dashboards", knowledge::dashboard_list(&l.s)) {
        l.expect("knowledge: one dashboard", len(&d) == 1, len(&d));
    }
    l.step("knowledge: learning paths", knowledge::learn(&l.s));
    if let Some(g) = l.step("knowledge: graph", knowledge::graph(&l.s)) {
        let text = json(&g).to_string();
        for r in ["adr:0001", "spec:checkout", "q:Q-001", "diagram:context"] {
            l.expect(
                &format!("knowledge: graph holds {r}"),
                text.contains(&format!("\"{r}\"")),
                r,
            );
        }
    }
    if let Some(p) = l.step(
        "delivery files: personas",
        shipyard_app::commands::delivery_docs::personas(&l.s),
    ) {
        l.expect("delivery files: three personas", len(&p) == 3, len(&p));
    }
    l.step(
        "delivery files: assignments",
        shipyard_app::commands::delivery_docs::assignments(&l.s),
    );
    if let Some(a) = l.step("sync: automation file", sync::automation_get(&l.s)) {
        l.expect(
            "sync: the file is valid",
            format!("{:?}", a.file) == "Valid",
            format!("{:?}", a.issues),
        );
    }
    l.finish();
}

// ---------------------------------------------------------------- 2. issue tracker

#[test]
fn issue_tracker_on_github_issues() {
    let Some(mut l) = live() else { return };
    let none = ItemFilter::default();

    // List: one sync, then the mirror.
    let report = l.step("sync: one tick", sync::run_tick(&l.s));
    if let Some(r) = &report {
        l.expect(
            "sync: the tracker polled, nothing failed",
            !r.polled.is_empty() && r.failed.is_empty(),
            format!("{r:?}"),
        );
        l.expect(
            "sync: no run started on the sample project",
            r.started.is_empty(),
            format!("{:?}", r.started),
        );
    }
    if let Some(items) = l.step("list: the mirror", sync::items(&l.s, &none)) {
        l.expect(
            "list: the four sample issues",
            items.len() >= 4,
            items.len(),
        );
        let agent = sync::items(
            &l.s,
            &ItemFilter {
                label: Some("agent".into()),
                ..Default::default()
            },
        )
        .unwrap_or_default();
        l.expect(
            "list: filter by the label agent",
            agent.len() >= 2,
            agent.len(),
        );
    }

    // Create: the ref is the match mark, so a second run finds the same issue.
    let row = Row {
        reference: "est:acceptance#live-issue".into(),
        kind: RowKind::Story,
        title: "Live test issue".into(),
        description: "Made by the live tests of Shipyard. It stays open and is reused.".into(),
        days: None,
        parent: None,
    };
    let made = l.step("create: one work item", work::item_create(&l.s, row, true));
    let key = made.as_ref().and_then(|m| m.key.clone());
    if let Some(m) = &made {
        l.expect(
            "create: no row error",
            m.error.is_none(),
            format!("{:?}", m.error),
        );
    }
    let Some(key) = key else {
        l.fails
            .push("no issue key: the steps after create did not run".into());
        return l.finish();
    };
    println!("issue {key}");

    l.step(
        "label: add `live-test`",
        work::ticket_label_add(&l.s, &key, "live-test", true),
    );
    l.step(
        "label: mark for the agent (pickup label)",
        work::mark(&l.s, &key, true),
    );
    l.step(
        "label: mark for a run (wf:feature)",
        work::mark_for_run(&l.s, &key, "feature", true),
    );
    l.step(
        "assign: member chloe to the tracker account",
        work::assign(&l.s, &key, "chloe", true),
    );
    let body = format!("Live test comment {}", stamp());
    l.step(
        "comment: add",
        work::ticket_comment_add(&l.s, &key, &body, true),
    );
    if let Some(c) = l.step(
        "comment: read the thread",
        work::ticket_comments(&l.s, &key),
    ) {
        l.expect(
            "comment: the thread holds the comment",
            c.iter().any(|x| x.body == body),
            len(&c),
        );
    }
    l.step(
        "transition: closed",
        work::transition(&l.s, &key, "closed", true),
    );
    l.step(
        "transition: open again",
        work::transition(&l.s, &key, "open", true),
    );
    let bad = work::transition(&l.s, &key, "In Progress", true);
    l.expect(
        "transition: a state that GitHub lacks is refused in plain words",
        bad.is_err(),
        "the move to In Progress went through",
    );
    l.expect(
        "write: a call without the click is refused",
        work::ticket_comment_add(&l.s, &key, "x", false).is_err(),
        "no click was accepted",
    );

    // The mirror after a sync.
    l.step("sync: a second tick", sync::run_tick(&l.s));
    let found = sync::items(
        &l.s,
        &ItemFilter {
            text: Some(key.clone()),
            ..Default::default()
        },
    )
    .unwrap_or_default();
    match found.first() {
        Some(i) => {
            let want = ["agent", "live-test", "wf:feature"];
            l.expect(
                "mirror: the labels came back",
                want.iter().all(|w| i.labels.iter().any(|x| x == w)),
                format!("{:?}", i.labels),
            );
            l.expect(
                "mirror: the assignee came back as chloe",
                i.member.as_deref() == Some("chloe"),
                format!("{:?} {:?}", i.assignee, i.member),
            );
            l.expect(
                "mirror: the issue is open",
                i.category != "done",
                &i.category,
            );
        }
        None => l
            .fails
            .push(format!("mirror: {key} is not in the mirror after a tick")),
    }
    l.finish();
}

// ---------------------------------------------------------------- 3. code host

/// A branch with one new file, published. Returns the file path.
fn branch_with_change(l: &mut Live, branch: &str, base: &str) -> Option<String> {
    l.step(
        &format!("branch: switch to {base}"),
        git::branch_switch(&l.s, base),
    )?;
    l.step(
        &format!("branch: create {branch}"),
        git::branch_create(&l.s, branch),
    )?;
    l.reg(branch);
    let rel = format!(
        "docs/live-test/{}.md",
        branch.rsplit('/').next().unwrap_or("note")
    );
    std::fs::create_dir_all(l.root.join("docs/live-test")).ok()?;
    std::fs::write(
        l.root.join(&rel),
        "# Live test note\n\nWritten by the live tests of Shipyard.\n",
    )
    .ok()?;
    l.step(
        "branch: stage the change",
        git::stage(&l.s, std::slice::from_ref(&rel)),
    )?;
    l.step(
        "branch: commit",
        git::commit(&l.s, "docs(live): add a live test note", ""),
    )?;
    l.step("branch: push (publish the branch)", git::push(&l.s))?;
    Some(rel)
}

#[test]
fn code_host_pull_request_on_github() {
    let Some(mut l) = live() else { return };
    let branch = format!("test/live/pr-{}", stamp());
    let Some(rel) = branch_with_change(&mut l, &branch, "main") else {
        return l.finish();
    };

    let opened = l.step(
        "pull request: open",
        code::pull_open(
            &l.s,
            code::OpenPull {
                title: "test(live): a pull request from the live tests".into(),
                body: "Opened by the live tests of Shipyard. It closes at the end of the run."
                    .into(),
                base: None,
                draft: false,
                labels: vec!["agent".into()],
            },
            true,
        ),
    );
    let Some(opened) = opened else {
        return l.finish();
    };
    let n = opened.number;
    l.prs.push(n);
    println!("pull request #{n} {}", opened.url);
    l.expect(
        "pull request: the label exists, so none is missing",
        opened.missing_labels.is_empty() && opened.label_error.is_none(),
        format!("{:?} {:?}", opened.missing_labels, opened.label_error),
    );

    if let Some(d) = l.step("pull request: read the detail", code::pull_detail(&l.s, n)) {
        l.expect(
            "pull request: open, from the branch",
            d.state == "open" && d.source_branch == branch,
            format!("{} {}", d.state, d.source_branch),
        );
        l.expect(
            "pull request: the changed file is listed",
            d.files.iter().any(|f| f.path == rel),
            format!("{:?}", d.files.len()),
        );
        l.expect(
            "pull request: one commit",
            d.commits.len() == 1,
            d.commits.len(),
        );
        println!(
            "      checks: {} ci={} mergeable={} merge methods={}",
            d.checks.len(),
            d.ci,
            d.mergeable,
            d.merge_methods.len()
        );
        l.expect(
            "pull request: the label landed",
            l.gh_json(&[
                "pr",
                "view",
                &n.to_string(),
                "--repo",
                SLUG,
                "--json",
                "labels",
            ])["labels"]
                .to_string()
                .contains("agent"),
            "label agent is missing on GitHub",
        );
    }
    l.step(
        "pull request: the labels of the forge",
        code::pull_labels(&l.s),
    );

    // List: the sync brings the pull request into the mirror.
    l.step("sync: one tick", sync::run_tick(&l.s));
    if let Some(rows) = l.step(
        "pull request: list from the mirror",
        delivery::pr_rows(&l.s),
    ) {
        l.expect(
            "pull request: the list holds it",
            rows.iter().any(|r| r.number == n),
            format!("{} rows", rows.len()),
        );
    }

    // Review. GitHub refuses a request for changes from the author of the pull request, and the
    // token here is the author: the refusal is a finding, with its text.
    let note = format!("Live test review note {}", stamp());
    l.step(
        "pull request: comment",
        code::pull_comment(&l.s, n, &note, true),
    );
    l.expect(
        "pull request: the comment is on GitHub",
        l.gh_json(&[
            "pr",
            "view",
            &n.to_string(),
            "--repo",
            SLUG,
            "--json",
            "comments",
        ])["comments"]
            .to_string()
            .contains(&note),
        "the comment is missing",
    );
    l.step(
        "pull request: request changes (send back)",
        code::pull_send_back(&l.s, n, "Live test: please change this.", true),
    );
    l.step("pull request: request changes, no click is refused", {
        let r = code::pull_verdict(&l.s, n, Verdict::RequestChanges, "x", false);
        if r.is_err() {
            Ok(())
        } else {
            Err("no click was accepted".to_string())
        }
    });

    l.step(
        "pull request: close with a reason",
        code::pull_close(&l.s, n, "Live test is over.", true),
    );
    if let Some(d) = l.step("pull request: read it again", code::pull_detail(&l.s, n)) {
        l.expect("pull request: closed", d.state == "closed", d.state);
    }
    l.expect(
        "pull request: close twice is refused",
        code::pull_close(&l.s, n, "", true).is_err(),
        "a closed pull request was closed again",
    );
    l.step("branch: back to main", git::branch_switch(&l.s, "main"));
    l.finish();
}

// ---------------------------------------------------------------- 4. spec archive in a pull request

#[test]
fn spec_archive_in_a_pull_request() {
    let Some(mut l) = live() else { return };
    let branch = format!("docs/live/archive-{}", stamp());
    if branch_with_change(&mut l, &branch, "main").is_none() {
        return l.finish();
    }
    let opened = l.step(
        "pull request: open",
        code::pull_open(
            &l.s,
            code::OpenPull {
                title: "docs(live): archive a spec change from the live tests".into(),
                body: "Opened by the live tests of Shipyard. It closes at the end of the run."
                    .into(),
                base: None,
                draft: false,
                labels: vec![],
            },
            true,
        ),
    );
    let Some(n) = opened.map(|o| o.number) else {
        return l.finish();
    };
    l.prs.push(n);
    println!("pull request #{n}");

    // The archive moves the change and settles its capability, then commits and pushes.
    let sha = l.step(
        "archive: add-gift-cards in the pull request",
        code::pull_archive_spec(&l.s, n, "add-gift-cards", false, true),
    );
    if let Some(sha) = &sha {
        l.expect("archive: one commit sha", sha.len() >= 7, sha);
    }
    if let Some(d) = l.step("archive: read the pull request", code::pull_detail(&l.s, n)) {
        let paths: Vec<&str> = d.files.iter().map(|f| f.path.as_str()).collect();
        l.expect(
            "archive: the capability is settled in specs/",
            paths.contains(&"docs/openspec/specs/gift-cards/spec.md"),
            format!("{paths:?}"),
        );
        l.expect(
            "archive: the change folder is archived",
            paths.iter().any(|p| {
                p.contains("changes/archive/") && p.ends_with("-add-gift-cards/proposal.md")
            }),
            format!("{paths:?}"),
        );
        // Git shows the move of the change folder as renames, so the old paths are not listed.
        l.expect(
            "archive: the open change folder is gone from the working copy",
            !l.root.join("docs/openspec/changes/add-gift-cards").exists(),
            "the folder is still there",
        );
        l.expect(
            "archive: the pull request has two commits",
            d.commits.len() == 2,
            d.commits.len(),
        );
    }
    if let Some(st) = l.step(
        "archive: the working copy is clean after it",
        git::status(&l.s),
    ) {
        let v = json(&st);
        l.expect(
            "archive: nothing staged",
            v["staged"].as_array().is_none_or(Vec::is_empty),
            &v["staged"],
        );
    }
    l.expect(
        "archive: the same change twice is refused",
        code::pull_archive_spec(&l.s, n, "add-gift-cards", false, true).is_err(),
        "a second archive went through",
    );
    l.step(
        "pull request: close",
        code::pull_close(&l.s, n, "Live test is over.", true),
    );
    l.step("branch: back to main", git::branch_switch(&l.s, "main"));
    l.finish();
}

// ---------------------------------------------------------------- 5. publish a local project

#[test]
fn publish_a_local_project() {
    let Some(mut l) = live() else { return };
    // A second state with its own app data folder, over the same connections.
    let s2 = AppState::with_connections(l.data.join("publish-state"), l.conns.clone());
    let local = l.data.join("local-project");
    std::fs::create_dir_all(&local).unwrap();
    std::fs::write(
        local.join("README.md"),
        "# Publish test\n\nA local project that the live tests publish.\n",
    )
    .unwrap();
    let made = projects::make(&s2, local.to_str().unwrap(), true);
    let ok = l.step("make it a project (git init, first commit)", made);
    if ok.is_none() {
        return l.finish();
    }
    l.expect(
        "publish: no origin before",
        publish::origin(&s2).ok().flatten().is_none(),
        "a new project already has a remote",
    );

    let exists = l
        .conns
        .forge(&l.forge)
        .and_then(|f| f.repository(PUBLISH_SLUG).map_err(|e| e.to_string()))
        .is_ok();
    if exists {
        // A second run: the repository stays, so the app must refuse in plain words.
        println!("note  {PUBLISH_SLUG} exists from an earlier run: checking the refusal");
        let r = publish::publish(&s2, &l.forge, PUBLISH_SLUG, true);
        l.expect(
            "publish: an existing repository is refused with a message",
            r.as_ref().is_err_and(|e| !e.is_empty()),
            format!("{r:?}"),
        );
        println!(
            "      refusal: {}",
            r.err().map(|e| l.redact(&e)).unwrap_or_default()
        );
    } else {
        let o = l.step(
            "publish: create the private repository and push",
            publish::publish(&s2, &l.forge, PUBLISH_SLUG, true),
        );
        if let Some(o) = o {
            l.expect(
                "publish: origin has no user name or token",
                !o.url.contains('@') && !o.url.contains(&l.token),
                &o.url,
            );
            l.expect(
                "publish: origin slug",
                o.slug.as_deref() == Some(PUBLISH_SLUG),
                format!("{:?}", o.slug),
            );
            l.expect(
                "publish: origin matches the forge connection",
                o.connection.as_deref() == Some(l.forge.as_str()),
                format!("{:?}", o.connection),
            );
        }
        let pushed = l.gh_json(&["api", &format!("repos/{PUBLISH_SLUG}/branches")]);
        l.expect(
            "publish: the push landed",
            pushed.as_array().is_some_and(|b| !b.is_empty()),
            pushed,
        );
        if let Ok(shipyard_store::project::FileRead::Valid(f)) =
            shipyard_store::project::read_project_file(&local)
        {
            l.expect(
                "publish: the project names the forge connection",
                f.connections.and_then(|c| c.forge).as_deref() == Some(l.forge.as_str()),
                "link_forge did not write",
            );
        }
    }
    let v = l.gh_json(&["repo", "view", PUBLISH_SLUG, "--json", "visibility"]);
    l.expect(
        "publish: the repository is private",
        v["visibility"] == "PRIVATE",
        v,
    );
    l.finish();
}
