//! The factory host and its commands, over fake ports (spec `factory` T018). A real project
//! folder, a fake runner, a fake writer; no process and no network.

use std::sync::{Arc, Mutex};

use shipyard_core::pickup::{Automation, Writes};
use shipyard_core::run::RunState;
use shipyard_engine::fake::{FakeAgents, FakeGit, FakePulls, FakeWorkspaces, FakeWriter, todo};
use shipyard_engine::ports::{AgentEvent, StartRequest};
use shipyard_mcp::session::Binding;
use shipyard_mcp::tools::agent::{
    AgentEvent as Tool, AgentEvents, AskQuestion, Message, Outcome, QuestionKind, Report,
};
use shipyard_store::factory_files::default_workflows;

use super::*;
use crate::commands::projects;
use crate::connections::Connections;

/// One step, one question tool: a run that asks and a run that ends on its own.
const ONE: &str = "
id: one
steps:
  - id: work
    role: worker
    model: mid
    tools: [report, ask_question, message]
limits: { max_turns: 5, budget_usd: 1, stall_s: 300 }
";

pub(crate) struct Fx {
    _data: tempfile::TempDir,
    pub repo: tempfile::TempDir,
    pub s: AppState,
    pub agents: FakeAgents,
    pub writer: FakeWriter,
    pub id: String,
    pub events: Arc<Mutex<Vec<(String, Ping)>>>,
}

pub(crate) fn fx(writes: Writes) -> Fx {
    let (data, repo) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    shipyard_git::project::init(repo.path()).unwrap();
    let agents = FakeAgents::default();
    let conns = Arc::new(Connections::new(
        data.path(),
        Arc::new(shipyard_secrets::MemoryStore::default()),
        Arc::new(shipyard_http::fake::FakeHttp::new()),
    ));
    let s = AppState::with_agents(data.path().join("data"), conns, Arc::new(agents.clone()));
    projects::open(&s, repo.path().to_str().unwrap(), true).unwrap();
    let id = s.registry().unwrap().active().unwrap().id.clone();
    seed(repo.path()).unwrap();

    let roles: Vec<String> = DEFAULT_ROLES.iter().map(|r| r.to_string()).collect();
    let mut files = Loaded::default();
    for (wf_id, text) in default_workflows() {
        files.workflows.insert(
            wf_id.to_string(),
            parse_workflow(wf_id, text, &roles).unwrap(),
        );
    }
    let one = parse_workflow("one", ONE, &roles).unwrap();
    files.workflows.insert(one.id.clone(), one);
    let writer = FakeWriter::default();
    let pulls = FakePulls::default();
    writer.link(&pulls);
    s.factory.factory.set_project(
        &id,
        Project {
            automation: Automation {
                writes,
                ..Automation::default()
            },
            files,
            default_workflow: "one".into(),
            root: repo.path().into(),
            source: "jira".into(),
            mirror: Arc::new(Mutex::new(Mirror::open_memory().unwrap())),
            writer: Arc::new(writer.clone()),
            workspaces: Arc::new(FakeWorkspaces::default()),
            git: Arc::new(FakeGit::default()),
            pulls: Arc::new(pulls),
            forge: "github".into(),
            gates: Vec::new(),
            base: None,
            reviewers: vec!["alice".into()],
            refs: s.index_of(&id).ok(),
        },
    );
    let events: Arc<Mutex<Vec<(String, Ping)>>> = Arc::default();
    let seen = events.clone();
    s.factory
        .on_event(move |name, ping| seen.lock().unwrap().push((name.into(), ping.clone())));
    // The first publish only learns the state.
    s.factory.publish();
    Fx {
        _data: data,
        repo,
        s,
        agents,
        writer,
        id,
        events,
    }
}

impl Fx {
    pub fn start(&self, key: &str) -> String {
        let f = &self.s.factory.factory;
        f.start(&StartRequest {
            project: self.id.clone(),
            ticket: todo(key),
            status: "To Do".into(),
            machine: "m1".into(),
            stamped: false,
        })
        .unwrap();
        let run = f.active_runs().last().unwrap().run_id.clone();
        f.pump();
        run
    }

    pub fn names(&self) -> Vec<String> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .map(|(n, _)| n.clone())
            .collect()
    }
}

pub(crate) fn ask() -> AskQuestion {
    AskQuestion {
        question: "Which scope?".into(),
        options: vec!["small".into(), "large".into()],
        recommended: 1,
        free_text: false,
        kind: QuestionKind::Ticket,
        spec: None,
    }
}

pub(crate) fn binding(run: &str) -> Binding {
    Binding {
        run: run.into(),
        step: "work".into(),
        tools: vec!["ask_question".into(), "message".into(), "report".into()],
    }
}

#[test]
fn a_run_shows_in_its_lane_with_its_steps_and_a_ref_that_resolves() {
    let fx = fx(Writes::default());
    let run = fx.start("SHIP-1");
    let v = runs(&fx.s).unwrap();
    assert_eq!(v.len(), 1);
    assert_eq!(
        (v[0].id.as_str(), v[0].key.as_str()),
        (run.as_str(), "SHIP-1")
    );
    assert_eq!(v[0].state, RunState::Working);
    assert_eq!(v[0].lane, Lane::Working);
    assert_eq!(v[0].reference, format!("run:{run}"));
    assert_eq!(v[0].steps[0].id, "work");
    assert_eq!(run_get(&fx.s, &run).unwrap().unwrap().id, run);
    assert!(run_get(&fx.s, "01JNOPE").unwrap().is_none());

    // `run:` resolves from the factory, with a step too. An unknown step is unresolved.
    let r = resolve_run(&fx.s, &format!("run:{run}")).unwrap();
    assert_eq!(r.state, shipyard_store::ref_query::State::Resolved);
    assert_eq!(r.status.as_deref(), Some("Working"));
    assert!(r.title.unwrap().starts_with("SHIP-1"));
    assert_eq!(
        resolve_run(&fx.s, &format!("run:{run}/work"))
            .unwrap()
            .state,
        shipyard_store::ref_query::State::Resolved
    );
    assert_eq!(
        resolve_run(&fx.s, &format!("run:{run}/nope"))
            .unwrap()
            .state,
        shipyard_store::ref_query::State::Unresolved
    );
    assert!(resolve_run(&fx.s, "run:01JABCDEFG0000000000000000").is_none());
    assert!(resolve_run(&fx.s, "wi:SHIP-1").is_none());
}

#[test]
fn a_pull_request_decides_the_lane_of_a_run_in_review() {
    use shipyard_engine::run_engine::StepInfo;
    let info = RunInfo {
        id: "01J".into(),
        project: "p".into(),
        key: "K-1".into(),
        title: "t".into(),
        url: String::new(),
        workflow: "feature".into(),
        run: shipyard_core::run::Run {
            state: RunState::PROpen,
            return_to: None,
        },
        pr: Some(7),
        cost_usd: 0.5,
        tokens: u64::MAX,
        turns: 3,
        budget_usd: 10.0,
        steps: vec![StepInfo {
            id: "pr".into(),
            state: StepState::Done,
            units: vec![],
        }],
        findings: vec![],
        worktree_kept: None,
    };
    let pr = |ci: &str, review: &str, draft: bool| PrRowView {
        reference: "pr:github:7".into(),
        forge: "github".into(),
        number: 7,
        title: "t".into(),
        state: "open".into(),
        draft,
        ci: ci.into(),
        review: review.into(),
        head_sha: "abc".into(),
        url: String::new(),
        updated: String::new(),
        lane: Lane::InReview,
        runs: vec![],
    };
    let lane_of = |rows: &[PrRowView]| run_view(&info, rows, 0, 0).lane;
    assert_eq!(lane_of(&[]), Lane::InReview, "no signal yet");
    assert_eq!(
        lane_of(&[pr("passing", "clear", false)]),
        Lane::ReadyToMerge
    );
    assert_eq!(lane_of(&[pr("failing", "clear", false)]), Lane::InReview);
    assert_eq!(
        lane_of(&[pr("passing", "changes_requested", false)]),
        Lane::InReview
    );
    assert_eq!(lane_of(&[pr("passing", "clear", true)]), Lane::InReview);
    let v = run_view(&info, &[pr("failing", "clear", false)], 2, 1);
    assert_eq!(v.pr.as_ref().unwrap().ci, "failing");
    assert_eq!(v.tokens, u32::MAX, "a count over u32 is capped");
    assert_eq!((v.open_questions, v.approvals), (2, 1));
}

#[test]
fn cancel_the_kill_switch_and_the_plan_gate_are_one_call_each() {
    let fx = fx(Writes::default());
    let a = fx.start("SHIP-1");
    cancel(&fx.s, &a).unwrap();
    assert_eq!(run_get(&fx.s, &a).unwrap().unwrap().lane, Lane::Done);
    assert!(
        unblock(&fx.s, &a).is_err(),
        "a cancelled run is not blocked"
    );
    assert!(cancel(&fx.s, "01JNOPE").is_err());

    // The global switch cancels each live run and refuses a new one.
    let b = fx.start("SHIP-2");
    assert!(!kill_switch(&fx.s));
    assert!(set_kill_switch(&fx.s, true));
    assert!(kill_switch(&fx.s));
    assert_eq!(
        run_get(&fx.s, &b).unwrap().unwrap().state,
        RunState::Cancelled
    );
    assert!(
        fx.s.factory
            .start(&StartRequest {
                project: fx.id.clone(),
                ticket: todo("SHIP-3"),
                status: "To Do".into(),
                machine: "m1".into(),
                stamped: false,
            })
            .is_err()
    );
    set_kill_switch(&fx.s, false);
}

#[test]
fn a_run_with_a_plan_gate_waits_for_a_click_and_a_rejection_runs_the_plan_again() {
    let fx = fx(Writes::default());
    // The feature workflow has a human gate after `plan`.
    fx.s.factory.factory.set_project(&fx.id, {
        // A fresh project that defaults to `feature`.
        let roles: Vec<String> = DEFAULT_ROLES.iter().map(|r| r.to_string()).collect();
        let mut files = Loaded::default();
        for (id, text) in default_workflows() {
            files
                .workflows
                .insert(id.to_string(), parse_workflow(id, text, &roles).unwrap());
        }
        Project {
            automation: Automation::default(),
            files,
            default_workflow: "feature".into(),
            root: fx.repo.path().into(),
            source: "jira".into(),
            mirror: Arc::new(Mutex::new(Mirror::open_memory().unwrap())),
            writer: Arc::new(fx.writer.clone()),
            workspaces: Arc::new(FakeWorkspaces::default()),
            git: Arc::new(FakeGit::default()),
            pulls: Arc::new(FakePulls::default()),
            forge: "github".into(),
            gates: Vec::new(),
            base: None,
            reviewers: vec![],
            refs: None,
        }
    });
    let run = fx.start("SHIP-1");
    let f = &fx.s.factory.factory;
    let done = |step: &str, output: serde_json::Value| {
        f.report(
            &run,
            step,
            Report {
                outcome: Outcome::Done,
                summary: "ok".into(),
                refs: vec![],
                output: output.as_object().cloned(),
            },
        )
        .unwrap();
        f.pump();
    };
    done("grill", serde_json::json!({}));
    done("plan", serde_json::json!({"tasks": ["a"]}));
    assert_eq!(
        run_get(&fx.s, &run).unwrap().unwrap().state,
        RunState::PlanReview
    );
    assert_eq!(runs(&fx.s).unwrap()[0].lane, Lane::NeedsYou);

    reject_plan(&fx.s, &run, "add a test task").unwrap();
    assert_eq!(
        run_get(&fx.s, &run).unwrap().unwrap().state,
        RunState::Planning
    );
    f.pump();
    done("plan", serde_json::json!({"tasks": ["a", "b"]}));
    approve_plan(&fx.s, &run).unwrap();
    assert_eq!(
        run_get(&fx.s, &run).unwrap().unwrap().state,
        RunState::Working
    );
    assert!(
        approve_plan(&fx.s, &run).is_err(),
        "a second click is refused"
    );
}

#[test]
fn a_paused_run_resumes_with_more_budget_and_a_negative_amount_is_refused() {
    let fx = fx(Writes::default());
    let run = fx.start("SHIP-1");
    // The `one` workflow has a 1 USD budget: spend it.
    fx.agents.push(
        "work",
        AgentEvent::Usage {
            input_tokens: 10,
            output_tokens: 10,
            cached_tokens: 0,
            cost_usd: Some(1.5),
        },
    );
    fx.s.factory.factory.pump();
    assert_eq!(
        run_get(&fx.s, &run).unwrap().unwrap().state,
        RunState::Paused
    );
    assert!(resume(&fx.s, &run, -1.0, 0).is_err());
    assert!(resume(&fx.s, &run, f64::NAN, 0).is_err());
    assert_eq!(resume(&fx.s, &run, 5.0, 0).unwrap(), RunState::Working);
    assert_eq!(run_get(&fx.s, &run).unwrap().unwrap().budget_usd, 6.0);
}

#[test]
fn the_run_log_comes_in_pages_and_a_bad_id_is_refused() {
    let fx = fx(Writes::default());
    let run = fx.start("SHIP-1");
    let all = run_log(&fx.s, &run, 0, 500).unwrap();
    assert!(all.events.len() >= 4 && !all.more);
    assert!(all.events.iter().any(|e| e.kind == "state"));
    let first = run_log(&fx.s, &run, 0, 2).unwrap();
    assert_eq!((first.events.len(), first.more), (2, true));
    assert_eq!(first.last, first.events[1].id);
    let rest = run_log(&fx.s, &run, first.last, 500).unwrap();
    assert_eq!(first.events.len() + rest.events.len(), all.events.len());
    // The payload is JSON text.
    let state = all.events.iter().find(|e| e.kind == "state").unwrap();
    assert!(serde_json::from_str::<serde_json::Value>(&state.payload).is_ok());
    assert!(run_log(&fx.s, "../x", 0, 10).is_err());
    assert!(
        run_log(&fx.s, "01JABCDEFG0000000000000000", 0, 10)
            .unwrap()
            .events
            .is_empty()
    );
}

#[test]
fn the_views_hear_a_new_run_approval_question_and_message_once() {
    let fx = fx(Writes::default());
    let run = fx.start("SHIP-1");
    fx.s.factory.publish();
    let names = fx.names();
    assert!(names.contains(&RUN_EVENT.to_string()), "{names:?}");
    assert!(names.contains(&APPROVAL_EVENT.to_string()), "{names:?}");
    let before = fx.events.lock().unwrap().len();
    fx.s.factory.publish();
    assert_eq!(
        fx.events.lock().unwrap().len(),
        before,
        "no change, no event"
    );

    let f = &fx.s.factory.factory;
    // The message comes first: a question parks the agent.
    f.emit(
        &binding(&run),
        Tool::Message(Message {
            to: "person".into(),
            text: "hello".into(),
        }),
    )
    .unwrap();
    f.emit(&binding(&run), Tool::AskQuestion(ask())).unwrap();
    fx.s.factory.publish();
    let events = fx.events.lock().unwrap().clone();
    let tail = &events[before..];
    let question = tail.iter().find(|(n, _)| n == QUESTION_EVENT).unwrap();
    assert_eq!(
        (question.1.run.as_str(), question.1.id.as_str()),
        (run.as_str(), "Q-001")
    );
    let message = tail.iter().find(|(n, _)| n == MESSAGE_EVENT).unwrap();
    assert_eq!(message.1.id, "0");
    assert!(
        tail.iter().any(|(n, p)| n == RUN_EVENT && p.run == run),
        "the state changed too"
    );
}

#[test]
fn the_loop_turn_pumps_and_frees_the_claim_of_a_run_that_ended() {
    let fx = fx(Writes::default());
    let run = fx.start("SHIP-1");
    // An exit with code 0 and no report ends the one step, so the run is done.
    fx.agents.push(
        "work",
        AgentEvent::Exit {
            code: Some(0),
            cancelled: false,
        },
    );
    let freed = Mutex::new(Vec::new());
    fx.s.factory.tick(|project, key| {
        freed
            .lock()
            .unwrap()
            .push((project.to_string(), key.to_string()))
    });
    assert_eq!(run_get(&fx.s, &run).unwrap().unwrap().state, RunState::Done);
    assert_eq!(
        *freed.lock().unwrap(),
        [(fx.id.clone(), "SHIP-1".to_string())]
    );
    // The agent session of the step was ended.
    assert!(
        fx.agents
            .ended()
            .iter()
            .any(|(r, s)| *r == run && s == "work")
    );
    // Nothing is freed twice.
    let again = Mutex::new(0);
    fx.s.factory.tick(|_, _| *again.lock().unwrap() += 1);
    assert_eq!(*again.lock().unwrap(), 0);
}

fn write_file(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, text).unwrap();
}

#[test]
fn workflows_list_read_check_and_save_the_files_of_the_repository() {
    let fx = fx(Writes::default());
    let list = workflows(&fx.s).unwrap();
    assert_eq!(
        list.iter().map(|w| w.id.as_str()).collect::<Vec<_>>(),
        ["bug", "feature", "review-only", "spec-split", "spike"]
    );
    let feature = list.iter().find(|w| w.id == "feature").unwrap();
    assert_eq!(feature.steps, ["grill", "plan", "build", "review", "pr"]);
    assert!(list.iter().all(|w| w.issue.is_none()));

    let file = workflow_read(&fx.s, "bug").unwrap();
    assert!(file.text.contains("id: bug") && file.workflow.is_some() && file.issue.is_none());
    assert!(workflow_read(&fx.s, "nope").is_err());
    assert!(
        workflow_read(&fx.s, "../etc").is_err(),
        "an id is a file name"
    );

    // A check reports the first issue with its line and writes nothing.
    let bad = file.text.replace("role: triager", "role: nobody");
    let issue = workflow_validate(&fx.s, "bug", &bad).unwrap().unwrap();
    assert!(issue.message.contains("nobody"), "{}", issue.message);
    assert!(issue.line.is_some());
    assert_eq!(issue.file, ".shipyard/workflows/bug.yaml");
    assert!(
        workflow_validate(&fx.s, "bug", &file.text)
            .unwrap()
            .is_none()
    );

    // Save refuses an invalid text: the file stays as it was.
    assert!(
        workflow_save(&fx.s, "bug", &bad)
            .unwrap_err()
            .contains("nobody")
    );
    assert_eq!(workflow_read(&fx.s, "bug").unwrap().text, file.text);
    assert!(workflow_save(&fx.s, "Bad Id", &file.text).is_err());
    assert!(workflow_save(&fx.s, "big", &"#".repeat(MAX_FILE + 1)).is_err());

    // A valid new file shows in the list.
    let new = file.text.replace("id: bug", "id: hotfix");
    workflow_save(&fx.s, "hotfix", &new).unwrap();
    assert!(workflows(&fx.s).unwrap().iter().any(|w| w.id == "hotfix"));

    // A file that broke by hand shows with its issue and keeps its last valid version.
    write_file(
        fx.repo.path(),
        ".shipyard/workflows/hotfix.yaml",
        "id: hotfix\nsteps: [",
    );
    let list = workflows(&fx.s).unwrap();
    assert!(
        list.iter()
            .find(|w| w.id == "hotfix")
            .unwrap()
            .issue
            .is_some()
    );
    write_file(
        fx.repo.path(),
        ".shipyard/workflows/never.yaml",
        "not: [valid",
    );
    assert!(
        workflows(&fx.s)
            .unwrap()
            .iter()
            .any(|w| w.id == "never" && w.issue.is_some())
    );
}

#[test]
fn roles_list_read_and_save_with_a_bundled_fallback() {
    let fx = fx(Writes::default());
    let list = roles(&fx.s).unwrap();
    assert_eq!(list.len(), 7);
    assert!(list.iter().all(|r| r.bundled && r.file));
    let worker = list.iter().find(|r| r.id == "worker").unwrap();
    assert_eq!(worker.model.as_deref(), Some("mid"));

    let text = role_read(&fx.s, "worker").unwrap();
    assert!(text.role.is_some() && text.text.contains("worker"));
    // A deleted file falls back to the bundled profile.
    std::fs::remove_file(fx.repo.path().join(".shipyard/roles/docs.md")).unwrap();
    let docs = roles(&fx.s)
        .unwrap()
        .into_iter()
        .find(|r| r.id == "docs")
        .unwrap();
    assert!(!docs.file && docs.bundled);
    assert!(role_read(&fx.s, "docs").unwrap().role.is_some());
    assert!(role_read(&fx.s, "nobody").is_err());

    // A new role: saved, listed, and the next workflow check accepts it.
    let sec = "---\nname: security\ndescription: Look for holes\nmodel: top\neffort: high\n---\nReview for security.\n";
    role_save(&fx.s, "security", sec).unwrap();
    let list = roles(&fx.s).unwrap();
    let sec_role = list.iter().find(|r| r.id == "security").unwrap();
    assert!(!sec_role.bundled && sec_role.file);
    assert_eq!(sec_role.effort, Some(Effort::High));
    // A role file that names another file is refused.
    assert!(role_save(&fx.s, "other", sec).is_err());
    assert!(role_save(&fx.s, "../x", sec).is_err());
}

#[test]
fn the_runner_port_opens_a_session_for_a_start_and_closes_it_with_the_scratch_folder() {
    let tmp = tempfile::tempdir().unwrap();
    let endpoint = Arc::new(OnceLock::new());
    let mut agents = RunnerAgents::new(tmp.path(), endpoint.clone());
    let work = tmp.path().join("work");
    std::fs::create_dir_all(&work).unwrap();
    let brief = |step: &str| Brief {
        run: "01JRUN00000000000000000AA".into(),
        step: step.into(),
        project: "p".into(),
        runner: "claude".into(),
        model: Some("sonnet".into()),
        effort: Some(Effort::High),
        mode: Mode::Auto,
        tools: vec!["report".into()],
        prompt: "Fix it.".into(),
        dir: work.clone(),
        resume: None,
    };
    // No endpoint yet, and an unknown runner: nothing starts and nothing stays.
    assert!(agents.start(&brief("a")).is_err());
    let _ = endpoint.set(Endpoint {
        sessions: Arc::new(Sessions::default()),
        url: "http://127.0.0.1:9/mcp".into(),
    });
    let mut bad = brief("a");
    bad.runner = "nope".into();
    assert!(agents.start(&bad).is_err());
    assert!(
        agents.start(&brief("../x")).is_err(),
        "a step id is a folder name"
    );
    assert!(
        !tmp.path().join("agents").exists()
            || std::fs::read_dir(tmp.path().join("agents"))
                .unwrap()
                .next()
                .is_none()
    );

    // A fake CLI that prints a session and exits.
    let bin = shipyard_agents::fake::program(
        tmp.path(),
        "claude",
        r#"echo '{"type":"system","session_id":"s-9"}'"#,
    );
    agents.program = Some(bin);
    let sessions = endpoint.get().unwrap().sessions.clone();
    let mut a = agents.start(&brief("a")).unwrap();
    let mut b = agents.start(&brief("b")).unwrap();
    let scratch_a = tmp.path().join("agents/01JRUN00000000000000000AA/a");
    assert!(
        scratch_a.is_dir(),
        "a unit has its own folder under the app data"
    );
    assert!(!scratch_a.starts_with(&work), "never in the worktree");
    let mut seen = Vec::new();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while !matches!(seen.last(), Some(AgentEvent::Exit { .. }))
        && std::time::Instant::now() < deadline
    {
        match a.next() {
            Some(e) => seen.push(e),
            None => std::thread::sleep(std::time::Duration::from_millis(20)),
        }
    }
    assert!(
        seen.iter()
            .any(|e| matches!(e, AgentEvent::Session { id } if id == "s-9")),
        "{seen:?}"
    );
    // The end of step `a` revokes its token and removes its folder. Step `b` is untouched.
    agents.end("01JRUN00000000000000000AA", "a");
    assert!(!scratch_a.exists());
    assert_eq!(sessions.revoke_step("01JRUN00000000000000000AA", "a"), 0);
    assert_eq!(sessions.revoke_step("01JRUN00000000000000000AA", "b"), 1);
    b.cancel();
}

#[test]
fn tool_names_reach_the_cli_as_shipyard_mcp_tools() {
    assert_eq!(
        cli_tools(&["report".into(), "github__search".into()]),
        ["mcp__shipyard__report", "mcp__shipyard__github__search"]
    );
    assert!(plain("build-1") && plain("01JRUN"));
    assert!(!plain("../x") && !plain("-x") && !plain("a b") && !plain(""));
}

/// A run log that does not open is not touched. The factory runs on a scratch log that the writer
/// and the reader of the views share, and the host says so.
#[test]
fn a_run_log_that_does_not_open_gives_a_shared_scratch_log_and_says_so() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join(LOG_FILE);
    std::fs::write(
        &file,
        "this is not a database, and it is not ours to overwrite",
    )
    .unwrap();
    let host = FactoryHost::new(dir.path(), Tiers::default(), None);
    assert!(host.degraded().is_some());
    assert!(
        std::fs::read_to_string(&file)
            .unwrap()
            .starts_with("this is not"),
        "the file of the person is left as it was"
    );
    // What the factory writes, the reader of the views sees: one scratch file, two connections.
    host.factory.set_kill_switch(true);
    let saved = host.log().snapshots().unwrap();
    assert!(saved.iter().any(|s| s.key == "meta"), "{}", saved.len());
    let good = tempfile::tempdir().unwrap();
    assert!(
        FactoryHost::new(good.path(), Tiers::default(), None)
            .degraded()
            .is_none()
    );
}

#[test]
fn the_start_removes_the_scratch_folders_of_runs_that_are_not_live() {
    let dir = tempfile::tempdir().unwrap();
    for sub in ["LIVE/work", "OLD/work", "OLD/review"] {
        std::fs::create_dir_all(dir.path().join("agents").join(sub)).unwrap();
    }
    sweep_scratch(dir.path(), &BTreeSet::from(["LIVE".to_string()]));
    assert!(dir.path().join("agents/LIVE/work").is_dir());
    assert!(!dir.path().join("agents/OLD").exists());
    // No folder at all is no error.
    sweep_scratch(&dir.path().join("none"), &BTreeSet::new());
}
