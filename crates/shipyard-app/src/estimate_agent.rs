//! "Ask an agent to estimate" (spec `app-redesign`, REQ-030 and REQ-033): one read-only turn of
//! an agent proposes a best, a likely and a worst value with its assumptions for the selected
//! tasks of a sheet. It never writes the sheet: the person accepts a proposal, and the page saves
//! it with `estimate_save`.
//!
//! It follows `pr_agent`: the turn is a session of the factory, so it shows in Crew / Sessions, a
//! person stops it there, "Agents stopped" stops it, and it counts in the agent limit. It runs
//! with the budget gate and books its usage under the assistant member.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use shipyard_agents::assistant::{TurnInput, TurnKind, run_turn_with};
use shipyard_agents::runner::CancelHandle;
use shipyard_core::assistant::{Context, MessageState, ThreadSettings, scrub};
use shipyard_core::run::BudgetLevel;
use shipyard_engine::estimate::{parse, prompt};
use shipyard_engine::ports::Dispatch;
use specta::Type;
use tauri::{AppHandle, Emitter};

use crate::commands::{Api, AppState, Res, blocking};
use crate::factory::SessionView;
use crate::work::need_click;

/// The member key of the usage that an estimate books: the assistant, as for its turns.
const MEMBER: &str = "assistant";
/// The step of the session row. Crew / Sessions knows an estimate session by it.
const STEP: &str = "estimate";
const STOPPED: &str = "the estimate was stopped";

/// What the agent proposes for one task, in days. It is not in the sheet.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EstimateProposal {
    pub task: String,
    pub best: f64,
    pub likely: f64,
    pub worst: f64,
    pub assumptions: Vec<String>,
}

// ---------------------------------------------------------------- running estimates

struct Job {
    project: String,
    slug: String,
    cancel: Option<CancelHandle>,
    runner: String,
    model: Option<String>,
    /// A stop came, maybe before the turn had a handle to cancel: the turn must not start.
    stopped: bool,
}

/// The views read the factory again when an estimate starts or ends. The first handle counts.
static APP: OnceLock<AppHandle> = OnceLock::new();

/// A change of the estimates is the factory event that a change of the agent reviews sends.
fn changed(slug: &str) {
    if let Some(app) = APP.get() {
        let run = format!("{STEP}-{slug}");
        let _ = app.emit(
            "factory-review",
            serde_json::json!({ "run": run, "id": slug }),
        );
    }
}

static RUNNING: Mutex<Vec<Job>> = Mutex::new(Vec::new());

fn jobs() -> std::sync::MutexGuard<'static, Vec<Job>> {
    RUNNING.lock().unwrap_or_else(|e| e.into_inner())
}

/// An estimate that runs. The slot frees itself when the estimate ends, with any result.
struct Slot {
    project: String,
    slug: String,
}

impl Slot {
    fn take(project: &str, slug: &str) -> Res<Self> {
        let mut all = jobs();
        if all.iter().any(|j| j.project == project && j.slug == slug) {
            return Err("an estimate of this sheet is running".into());
        }
        all.push(Job {
            project: project.into(),
            slug: slug.into(),
            cancel: None,
            runner: String::new(),
            model: None,
            stopped: false,
        });
        drop(all);
        changed(slug);
        Ok(Self {
            project: project.into(),
            slug: slug.into(),
        })
    }

    fn with_job<T>(&self, f: impl FnOnce(&mut Job) -> T) -> Option<T> {
        jobs()
            .iter_mut()
            .find(|j| j.project == self.project && j.slug == self.slug)
            .map(f)
    }

    fn cancel_with(&self, h: CancelHandle) {
        self.with_job(|j| {
            // A stop that came while the turn started cancels it now.
            if j.stopped {
                h.cancel();
            }
            j.cancel = Some(h);
        });
    }

    fn stopped(&self) -> bool {
        self.with_job(|j| j.stopped).unwrap_or(false)
    }

    /// The runner and model of the turn, for the row in Crew / Sessions.
    fn describe(&self, t: &ThreadSettings) {
        self.with_job(|j| {
            j.runner = t.runner.clone();
            j.model = t.model.clone();
        });
        changed(&self.slug);
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        jobs().retain(|j| !(j.project == self.project && j.slug == self.slug));
        changed(&self.slug);
    }
}

/// How many estimates run. The factory counts them in its limit.
pub fn running_count() -> usize {
    jobs().len()
}

/// The running estimates of a project as sessions of Crew / Sessions. `key` is the sheet.
pub fn sessions(project: &str) -> Vec<SessionView> {
    jobs()
        .iter()
        .filter(|j| j.project == project)
        .map(|j| SessionView {
            run: format!("{STEP}-{}", j.slug),
            key: j.slug.clone(),
            step: STEP.into(),
            runner: j.runner.clone(),
            model: j.model.clone(),
            state: shipyard_core::workflow::StepState::Running,
            tokens: 0,
            cost_usd: 0.0,
            started: 0.0,
            pull: None,
        })
        .collect()
}

fn stop_where(hit: impl Fn(&Job) -> bool) {
    for j in jobs().iter_mut().filter(|j| hit(j)) {
        j.stopped = true;
        if let Some(h) = &j.cancel {
            h.cancel();
        }
    }
}

/// Stops every running estimate: the switch "Agents stopped" does.
pub fn stop_all() {
    stop_where(|_| true);
}

/// Stops the running estimate of a sheet. Nothing runs: nothing happens.
pub fn stop(s: &AppState, slug: &str) -> Res<()> {
    let (pid, _) = project(s)?;
    stop_where(|j| j.project == pid && j.slug == slug);
    Ok(())
}

// ---------------------------------------------------------------- the guards

fn project(s: &AppState) -> Res<(String, PathBuf)> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Ok((e.id, e.path.into()))
}

fn secrets(s: &AppState) -> Vec<String> {
    let mut all = s.agents.secret_values();
    all.extend(s.connections.secret_values());
    all
}

/// The switch, the budget and the limit of the factory stop an estimate (REQ-033).
fn guard(s: &AppState, pid: &str, root: &Path) -> Res<()> {
    if crate::factory::kill_switch(s) {
        return Err("the agents are stopped: switch them on first".into());
    }
    let gate = s.factory.factory.assistant_gate(pid, MEMBER);
    if gate.level == BudgetLevel::Spent {
        return Err(format!(
            "the budget {} is spent: the estimate waits for the next budget",
            gate.budget.unwrap_or_default()
        ));
    }
    let limit = crate::commands::sync::automation_in(root)
        .unwrap_or_default()
        .concurrency
        .global as usize;
    let busy = s.factory.factory.active_runs().len() + crate::pr_agent::running_count();
    if busy + jobs().len() >= limit {
        return Err("the agent limit is reached: wait for a run to end".into());
    }
    Ok(())
}

// ---------------------------------------------------------------- one estimate

/// One read-only turn of the agent in the project. The usage books under the assistant member.
fn ask(
    s: &AppState,
    pid: &str,
    root: &Path,
    text: &str,
    slot: &Slot,
    program: Option<PathBuf>,
) -> Res<String> {
    let mut settings = shipyard_store::assistant_defaults::load(&s.dir, pid).settings();
    settings.mode = shipyard_core::assistant::AssistantMode::Ask;
    settings.permission = shipyard_core::assistant::Permission::ReadOnly;
    slot.describe(&settings);
    let secrets = secrets(s);
    let scratch = s.dir.join("estimates").join(pid).join("scratch");
    let out = run_turn_with(
        TurnInput {
            kind: TurnKind::Send,
            settings: &settings,
            context: &Context::default(),
            quotes: &[],
            text,
            rules: "",
            dir: root,
            scratch: &scratch,
            session: None,
            granted: &[],
            secrets: &secrets,
            program,
        },
        &|h| slot.cancel_with(h),
    );
    let u = &out.message.usage;
    if u.input_tokens + u.output_tokens > 0 || u.cost_usd > 0.0 {
        let booked = s.factory.factory.book_assistant(
            pid,
            MEMBER,
            u.input_tokens.into(),
            u.output_tokens.into(),
            u.cost_usd,
        );
        if let Err(e) = booked {
            eprintln!("estimate budget: {e}");
        }
    }
    if slot.stopped() {
        return Err(STOPPED.into());
    }
    match out.message.state {
        MessageState::Failed { message, .. } => Err(message),
        _ => Ok(out.message.text),
    }
}

/// The proposals of an agent for the tasks `task_ids` of the sheet `slug`. The sheet file stays
/// as it is. `program` runs in place of the CLI (tests).
pub fn start(
    s: &AppState,
    slug: &str,
    task_ids: &[String],
    click: bool,
    program: Option<PathBuf>,
) -> Res<Vec<EstimateProposal>> {
    need_click(
        s,
        click,
        crate::rights::Right::WorkEdit,
        "estimate_agent_start",
        slug,
    )?;
    if task_ids.is_empty() {
        return Err("no task is selected".into());
    }
    // A sealed sheet stays on this machine: its text never goes to an agent.
    if crate::work::seal_state(s)?.sealed {
        return Err("the sheet is sealed: an agent cannot estimate it".into());
    }
    let sheet = crate::work::sheet_get(s, slug)?.sheet;
    if sheet.frozen {
        return Err(crate::work::FROZEN.into());
    }
    let (pid, root) = project(s)?;
    guard(s, &pid, &root)?;
    let slot = Slot::take(&pid, slug)?;
    let text = ask(s, &pid, &root, &prompt(&sheet, task_ids), &slot, program)?;
    let secrets = secrets(s);
    Ok(parse(&text, task_ids)?
        .into_iter()
        .map(|p| EstimateProposal {
            task: p.task,
            best: p.best,
            likely: p.likely,
            worst: p.worst,
            assumptions: p.assumptions.iter().map(|a| scrub(a, &secrets)).collect(),
        })
        .collect())
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn estimate_agent_start(
    app: AppHandle,
    slug: String,
    task_ids: Vec<String>,
    click: bool,
) -> Api<Vec<EstimateProposal>> {
    let _ = APP.set(app.clone());
    blocking(app, move |s| start(s, &slug, &task_ids, click, None)).await
}

#[tauri::command]
#[specta::specta]
pub async fn estimate_agent_stop(app: AppHandle, slug: String) -> Api<()> {
    blocking(app, move |s| stop(s, &slug)).await
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use shipyard_agents::fake::program;
    use shipyard_core::project::ProjectFile;
    use shipyard_core::work::{Feature, Sheet, Task};
    use shipyard_http::fake::FakeHttp;
    use shipyard_secrets::MemoryStore;

    use super::*;
    use crate::connections::Connections;

    /// The running slots and the limit are global: the tests that start an estimate take turns.
    static TURN: Mutex<()> = Mutex::new(());

    struct Fx {
        data: tempfile::TempDir,
        repo: tempfile::TempDir,
        s: AppState,
        pid: String,
    }

    fn fx() -> Fx {
        let repo = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let conns = Arc::new(Connections::new(
            data.path(),
            Arc::new(MemoryStore::default()),
            Arc::new(FakeHttp::new()),
        ));
        let s = AppState::with_connections(data.path().join("data"), conns);
        let pid = s
            .with_registry(|r| {
                let id = r
                    .register(
                        repo.path().to_str().unwrap(),
                        &ProjectFile::new("Ship", "SHIP"),
                    )
                    .id
                    .clone();
                r.activate(&id);
                Ok(id)
            })
            .unwrap();
        let task = |id: &str| Task {
            id: id.into(),
            name: format!("Task {id}"),
            role: "dev".into(),
            days: Some(2.0),
            ..Default::default()
        };
        let sheet = Sheet {
            name: "Lot".into(),
            currency: "EUR".into(),
            features: vec![Feature {
                id: "f".into(),
                name: "Sign in".into(),
                description: String::new(),
                tasks: vec![task("a"), task("b"), task("c")],
            }],
            ..Default::default()
        };
        crate::work::sheet_save(&s, "lot", sheet).unwrap();
        Fx { data, repo, s, pid }
    }

    /// A runner that runs `before`, answers with `text` and counts its starts in `runs`.
    fn runner(f: &Fx, before: &str, text: &str) -> PathBuf {
        let body = format!(
            r#"cat > /dev/null
echo x >> '{runs}'
{before}
echo '{{"type":"system","session_id":"s1"}}'
echo '{{"type":"assistant","message":{{"content":[{{"type":"text","text":{text}}}]}}}}'
echo '{{"type":"result","subtype":"success","is_error":false,"session_id":"s1","total_cost_usd":0.1,"usage":{{"input_tokens":30,"output_tokens":12}}}}'"#,
            runs = f.data.path().join("runs").display(),
            text = serde_json::to_string(text).unwrap()
        );
        program(f.data.path(), "fake-claude", &body)
    }

    fn started(f: &Fx) -> usize {
        std::fs::read_to_string(f.data.path().join("runs"))
            .unwrap_or_default()
            .lines()
            .count()
    }

    fn file(f: &Fx) -> Vec<u8> {
        std::fs::read(f.repo.path().join("docs/costing/lot.yaml")).unwrap()
    }

    fn ids(all: &[&str]) -> Vec<String> {
        all.iter().map(|s| s.to_string()).collect()
    }

    /// One line: the `echo` of the fake program would turn `\n` into a line break.
    const ANSWER: &str = r#"{"estimates":[{"task":"a","best":1,"likely":2,"worst":4,"assumptions":["One sign-in provider"]},{"task":"b","best":0.5,"likely":1,"worst":2,"assumptions":[]},{"task":"c","best":3,"likely":5,"worst":9,"assumptions":["No migration"]},{"task":"other","best":1,"likely":1,"worst":1}]}"#;

    #[test]
    fn each_selected_task_gets_a_proposal_and_the_sheet_file_stays() {
        let _turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let f = fx();
        let before = file(&f);
        let bin = runner(&f, "", ANSWER);
        let all = ids(&["a", "b", "c"]);
        let out = start(&f.s, "lot", &all, true, Some(bin.clone())).unwrap();
        assert_eq!(
            out.iter().map(|p| p.task.as_str()).collect::<Vec<_>>(),
            ["a", "b", "c"]
        );
        assert_eq!((out[0].best, out[0].likely, out[0].worst), (1.0, 2.0, 4.0));
        assert_eq!(out[2].assumptions, ["No migration"]);
        assert_eq!(file(&f), before);
        // The slot is free again, and the action needs a click and a selection.
        assert!(sessions(&f.pid).is_empty());
        let e = start(&f.s, "lot", &all, false, Some(bin.clone())).unwrap_err();
        assert!(e.contains("click"), "{e}");
        let e = start(&f.s, "lot", &[], true, Some(bin)).unwrap_err();
        assert_eq!(e, "no task is selected");
        assert_eq!(started(&f), 1);
    }

    #[test]
    fn a_sealed_sheet_a_frozen_sheet_and_stopped_agents_start_no_agent() {
        let _turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let f = fx();
        let bin = runner(&f, "", ANSWER);
        let all = ids(&["a"]);
        crate::factory::set_kill_switch(&f.s, true);
        let e = start(&f.s, "lot", &all, true, Some(bin.clone())).unwrap_err();
        assert!(e.contains("the agents are stopped"), "{e}");
        crate::factory::set_kill_switch(&f.s, false);
        let mut sheet = crate::work::sheet_get(&f.s, "lot").unwrap().sheet;
        sheet.frozen = true;
        crate::work::sheet_save(&f.s, "lot", sheet.clone()).unwrap();
        let e = start(&f.s, "lot", &all, true, Some(bin.clone())).unwrap_err();
        assert_eq!(e, crate::work::FROZEN);
        sheet.frozen = false;
        crate::work::sheet_save(&f.s, "lot", sheet).unwrap();
        // Sealed and unlocked on this machine: the text still does not go to an agent.
        crate::work::seal_all(&f.s, "a long passphrase").unwrap();
        let e = start(&f.s, "lot", &all, true, Some(bin)).unwrap_err();
        assert!(e.contains("the sheet is sealed"), "{e}");
        assert_eq!(started(&f), 0);
    }

    #[test]
    fn a_running_estimate_is_a_session_and_a_stop_leaves_the_sheet_file_unchanged() {
        let _turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let f = fx();
        let before = file(&f);
        let bin = runner(&f, "sleep 20", ANSWER);
        let all = ids(&["a"]);
        std::thread::scope(|scope| {
            let run = scope.spawn(|| start(&f.s, "lot", &all, true, Some(bin)));
            // The stop comes when the agent runs.
            for _ in 0..500 {
                if started(&f) == 1 {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            let rows = crate::factory::sessions(&f.s).unwrap();
            assert_eq!(
                (rows[0].key.as_str(), rows[0].step.as_str(), rows[0].state),
                (
                    "lot",
                    "estimate",
                    shipyard_core::workflow::StepState::Running
                )
            );
            assert!(sessions("other-project").is_empty());
            assert_eq!(Dispatch::reserved(&*f.s.factory), 1);
            stop(&f.s, "lot").unwrap();
            assert_eq!(run.join().unwrap().unwrap_err(), STOPPED);
        });
        assert_eq!(file(&f), before);
        assert!(crate::factory::sessions(&f.s).unwrap().is_empty());
    }

    #[test]
    fn stop_all_agents_stops_an_estimate_before_its_turn_has_a_handle() {
        let _turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let f = fx();
        let slot = Slot::take(&f.pid, "lot").unwrap();
        assert!(!slot.stopped());
        crate::factory::set_kill_switch(&f.s, true);
        assert!(slot.stopped());
        crate::factory::set_kill_switch(&f.s, false);
        // One estimate for each sheet at a time.
        assert!(Slot::take(&f.pid, "lot").is_err());
    }

    #[test]
    fn a_spent_budget_starts_no_estimate() {
        use shipyard_engine::fake::{FakeGit, FakePulls, FakeWorkspaces, FakeWriter};
        let _turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let f = fx();
        let bin = runner(&f, "", ANSWER);
        let writer = FakeWriter::default();
        let pulls = FakePulls::default();
        writer.link(&pulls);
        // The factory knows the project, with a day budget of 0.05 USD.
        f.s.factory.factory.set_project(
            &f.pid,
            shipyard_engine::run_engine::Project {
                automation: shipyard_core::pickup::Automation {
                    budgets: shipyard_core::pickup::Budgets {
                        day: [("*".to_string(), 0.05)].into(),
                        ..Default::default()
                    },
                    ..Default::default()
                },
                files: Default::default(),
                default_workflow: "one".into(),
                root: f.repo.path().into(),
                source: "jira".into(),
                mirror: Arc::new(Mutex::new(
                    shipyard_store::mirror::Mirror::open_memory().unwrap(),
                )),
                writer: Arc::new(writer),
                workspaces: Arc::new(FakeWorkspaces::default()),
                git: Arc::new(FakeGit::default()),
                pulls: Arc::new(pulls),
                forge: "github".into(),
                gates: Vec::new(),
                base: None,
                reviewers: Vec::new(),
                refs: None,
                languages: Default::default(),
            },
        );
        let all = ids(&["a"]);
        // The first estimate books 0.10 USD and spends the 0.05 USD of the day.
        start(&f.s, "lot", &all, true, Some(bin.clone())).unwrap();
        let e = start(&f.s, "lot", &all, true, Some(bin)).unwrap_err();
        assert!(e.contains("is spent"), "{e}");
        assert_eq!(started(&f), 1);
    }
}
