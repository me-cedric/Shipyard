//! A factory with fakes: runner, writer, workspaces, clock. The run log is a file, so the test
//! reads what the factory wrote.
#![allow(dead_code)]

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use shipyard_core::pickup::{Automation, Writes};
use shipyard_core::run::RunState;
use shipyard_core::workflow::DEFAULT_ROLES;
use shipyard_engine::fake::{
    FakeAgents, FakeClock, FakeGit, FakePulls, FakeWorkspaces, FakeWriter, todo,
};
use shipyard_engine::ports::{AgentEvent, Dispatch, StartRequest};
use shipyard_engine::run_engine::{Config, Factory, Project};
use shipyard_mcp::tools::agent::{Outcome, Report};
use shipyard_store::factory_files::{Loaded, default_workflows, parse_workflow};
use shipyard_store::mirror::Mirror;
use shipyard_store::run_log::RunLog;

/// 2026-10-29T10:00:00Z.
pub const START: u64 = 1_793_268_000;
pub const SOURCE: &str = "jira";

/// One step, no gate, no pull request.
pub const ONE: &str = "
id: one
steps:
  - id: work
    role: worker
    model: mid
    retry: 1
    tools: [report, ask_question]
limits: { max_turns: 3, budget_usd: 1, stall_s: 300 }
";

pub struct Fx {
    pub f: Arc<Factory>,
    pub agents: FakeAgents,
    pub writer: FakeWriter,
    pub ws: FakeWorkspaces,
    pub git: FakeGit,
    pub pulls: FakePulls,
    pub clock: FakeClock,
    pub mirror: Arc<Mutex<Mirror>>,
    pub dir: tempfile::TempDir,
    log: RunLog,
}

pub fn writes(on: bool) -> Writes {
    Writes {
        push: on,
        pull_request: on,
        tracker_transition: on,
        tracker_comment: on,
    }
}

impl Fx {
    /// The five default workflows and `extra`. Default workflow: `one` when given, else `feature`.
    pub fn new(writes: Writes, extra: &[&str]) -> Self {
        Self::with(writes, extra, Config::default())
    }

    pub fn with(writes: Writes, extra: &[&str], cfg: Config) -> Self {
        Self::build(writes, extra, cfg, |_| {})
    }

    /// `tweak` changes the project before the factory gets it: gates, base, reviewers.
    pub fn build(
        writes: Writes,
        extra: &[&str],
        cfg: Config,
        tweak: impl FnOnce(&mut Project),
    ) -> Self {
        let roles: Vec<String> = DEFAULT_ROLES.iter().map(|r| r.to_string()).collect();
        let mut files = Loaded::default();
        for (id, text) in default_workflows() {
            files
                .workflows
                .insert(id.to_string(), parse_workflow(id, text, &roles).unwrap());
        }
        for text in extra {
            let wf: shipyard_core::workflow::Workflow = workflow_of(text);
            files.workflows.insert(wf.id.clone(), wf);
        }
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("runs.sqlite");
        let clock = FakeClock::new(Duration::from_secs(START));
        let agents = FakeAgents::default();
        let f = Arc::new(Factory::new(
            cfg,
            Arc::new(agents.clone()),
            Arc::new(clock.clone()),
            RunLog::open(&path).unwrap(),
        ));
        let writer = FakeWriter::default();
        let ws = FakeWorkspaces::default();
        let git = FakeGit::default();
        let pulls = FakePulls::default();
        writer.link(&pulls);
        let mirror = Arc::new(Mutex::new(Mirror::open_memory().unwrap()));
        let automation = Automation {
            writes,
            ..Automation::default()
        };
        let mut project = Project {
            automation,
            files,
            default_workflow: if extra.is_empty() { "feature" } else { "one" }.into(),
            root: dir.path().to_path_buf(),
            source: SOURCE.into(),
            mirror: mirror.clone(),
            writer: Arc::new(writer.clone()),
            workspaces: Arc::new(ws.clone()),
            git: Arc::new(git.clone()),
            pulls: Arc::new(pulls.clone()),
            forge: "github".into(),
            gates: Vec::new(),
            base: None,
            reviewers: vec!["alice".into()],
        };
        tweak(&mut project);
        f.set_project("ship", project);
        Self {
            f,
            agents,
            writer,
            ws,
            git,
            pulls,
            clock,
            mirror,
            log: RunLog::open(&path).unwrap(),
            dir,
        }
    }

    /// Start a run on ticket `key` with these extra labels. Returns the run id.
    pub fn start(&self, key: &str, labels: &[&str]) -> String {
        let mut ticket = todo(key);
        ticket
            .item
            .labels
            .extend(labels.iter().map(|l| l.to_string()));
        self.f
            .start(&StartRequest {
                project: "ship".into(),
                ticket,
                status: "To Do".into(),
                machine: "m1".into(),
                stamped: false,
            })
            .unwrap();
        let run = self.f.active_runs().last().unwrap().run_id.clone();
        self.f.pump();
        run
    }

    pub fn state(&self, run: &str) -> RunState {
        self.f.run_info(run).unwrap().run.state
    }

    pub fn advance(&self, s: u64) {
        self.clock.advance(Duration::from_secs(s));
        self.f.pump();
    }

    /// Payloads of one kind in the run log of `run`.
    pub fn logged(&self, run: &str, kind: &str) -> Vec<Value> {
        self.log
            .run(run)
            .unwrap()
            .into_iter()
            .filter(|e| e.kind == kind)
            .map(|e| e.payload)
            .collect()
    }

    pub fn report(&self, run: &str, step: &str, outcome: Outcome, output: Value) {
        let output = output.as_object().cloned();
        self.f
            .report(
                run,
                step,
                Report {
                    outcome,
                    summary: format!("{step} report"),
                    refs: Vec::new(),
                    output,
                },
            )
            .unwrap();
    }

    pub fn done(&self, run: &str, step: &str) {
        self.report(run, step, Outcome::Done, json!({}));
    }

    pub fn event(&self, step: &str, e: AgentEvent) {
        self.agents.push(step, e);
        self.f.pump();
    }
}

fn workflow_of(text: &str) -> shipyard_core::workflow::Workflow {
    serde_yaml::from_str(text).unwrap()
}
