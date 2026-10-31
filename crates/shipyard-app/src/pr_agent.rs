//! Agent pull request actions (spec `agent-pr`): review a pull request with an agent, write the
//! text of a new pull request with an agent, and the automatic review of the sync tick.
//!
//! The review runs one read-only turn in a worktree at the head commit. It reuses the reviewer
//! checklist and the finding rules of `shipyard_engine::review`. The result is a draft that waits
//! in the app data folder: one file for each head commit, so a second tick or a second click starts
//! no second review. A person posts the draft with one click. The automatic `post` mode posts a
//! comment review and never an approval or a request for changes.
//!
//! A review is a session of the factory: it shows in Factory / Sessions, a person stops it there,
//! and it counts in the limit of the factory. A draft that waits shows in Home / Needs you. The
//! post puts each finding on its line through the code host (`CodeApi::review`).

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use shipyard_agents::assistant::{TurnInput, TurnKind, run_turn_with};
use shipyard_agents::runner::CancelHandle;
use shipyard_core::assistant::{Context, MessageState, ThreadSettings, scrub};
use shipyard_core::pickup::{AutoReview, PrState, PullSnapshot, reviews_due};
use shipyard_core::run::BudgetLevel;
use shipyard_engine::ports::Dispatch;
use shipyard_engine::review::{
    DraftVerdict, PullBrief, TextBrief, parse_draft, parse_text, pull_prompt, text_prompt,
};
use shipyard_forges::{LineNote, PullQuery, PullState, StateFilter, Verdict};
use shipyard_git::Repo;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::factory::SessionView;
use crate::work::need_click;

/// The member key of the usage that a review books: the assistant, as for its turns.
const MEMBER: &str = "assistant";
/// The head commit is not in the local repository. A later try may find it, so an automatic try
/// that fails with this text leaves no marker.
const HEAD_MISSING: &str = "the head commit is not in the local repository: fetch the branch first";
/// The tick looks for pull requests to review this often (in turns of the factory loop).
pub const AUTO_EVERY: u32 = 120;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewFinding {
    /// `P0`, `P1` or `P2`.
    pub severity: String,
    pub path: String,
    pub line: u32,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ReviewVerdict {
    Approve,
    Comment,
    RequestChanges,
}

impl From<DraftVerdict> for ReviewVerdict {
    fn from(v: DraftVerdict) -> Self {
        match v {
            DraftVerdict::Approve => Self::Approve,
            DraftVerdict::Comment => Self::Comment,
            DraftVerdict::RequestChanges => Self::RequestChanges,
        }
    }
}

/// A draft review: what the agent found at one head commit. It waits for a person to post it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDraft {
    pub number: u32,
    /// The title of the pull request, for Home / Needs you.
    #[serde(default)]
    pub title: String,
    pub head_sha: String,
    pub summary: String,
    pub verdict: ReviewVerdict,
    pub findings: Vec<ReviewFinding>,
    /// The findings that cited no changed file or no line.
    pub dropped: u32,
    pub posted: bool,
    /// A review that the automatic setting started.
    pub auto: bool,
}

/// A draft that waits for a person, as Home / Needs you shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewWait {
    pub number: u32,
    pub head_sha: String,
    pub title: String,
    /// The ref of the pull request, `pr:<connection>:<number>`. Empty without a code host.
    pub reference: String,
}

/// What the page sends to post: the draft after the person edited it.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPost {
    pub number: u32,
    pub head_sha: String,
    pub summary: String,
    pub verdict: ReviewVerdict,
    pub findings: Vec<ReviewFinding>,
}

/// The title and the body that the agent wrote. Nothing is opened.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PrText {
    pub title: String,
    pub body: String,
}

/// What a review needs to know about the pull request.
pub struct ReviewInput {
    pub number: u32,
    pub title: String,
    pub description: String,
    pub source: String,
    pub target: String,
    pub head_sha: String,
    /// Each changed file with its patch.
    pub files: Vec<(String, Option<String>)>,
}

// ---------------------------------------------------------------- running reviews

struct Job {
    project: String,
    number: u32,
    cancel: Option<CancelHandle>,
    runner: String,
    model: Option<String>,
}

/// The views read the factory again when a review starts or ends. The first handle counts.
static APP: OnceLock<AppHandle> = OnceLock::new();

/// The event name of a change of the reviews. It is one of the factory events of the views.
const EVENT: &str = "factory-review";

fn changed(number: u32) {
    if let Some(app) = APP.get() {
        let _ = app.emit(
            EVENT,
            serde_json::json!({ "run": format!("review{number}"), "id": number.to_string() }),
        );
    }
}

static RUNNING: Mutex<Vec<Job>> = Mutex::new(Vec::new());

fn jobs() -> std::sync::MutexGuard<'static, Vec<Job>> {
    RUNNING.lock().unwrap_or_else(|e| e.into_inner())
}

fn running(project: &str, number: u32) -> bool {
    jobs()
        .iter()
        .any(|j| j.project == project && j.number == number)
}

/// A review that runs. The slot frees itself when the review ends, with any result.
struct Slot {
    project: String,
    number: u32,
}

impl Slot {
    fn take(project: &str, number: u32) -> Res<Self> {
        let mut all = jobs();
        if all
            .iter()
            .any(|j| j.project == project && j.number == number)
        {
            return Err("a review of this pull request is running".into());
        }
        all.push(Job {
            project: project.into(),
            number,
            cancel: None,
            runner: String::new(),
            model: None,
        });
        drop(all);
        changed(number);
        Ok(Self {
            project: project.into(),
            number,
        })
    }

    fn cancel_with(&self, h: CancelHandle) {
        if let Some(j) = jobs()
            .iter_mut()
            .find(|j| j.project == self.project && j.number == self.number)
        {
            j.cancel = Some(h);
        }
    }

    /// The runner and model of the turn, for the row in Factory / Sessions.
    fn describe(&self, t: &ThreadSettings) {
        if let Some(j) = jobs()
            .iter_mut()
            .find(|j| j.project == self.project && j.number == self.number)
        {
            j.runner = t.runner.clone();
            j.model = t.model.clone();
        }
        changed(self.number);
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        jobs().retain(|j| !(j.project == self.project && j.number == self.number));
        changed(self.number);
    }
}

/// How many reviews run. The factory counts them in its limit (REQ-008).
pub fn running_count() -> usize {
    jobs().len()
}

/// The running reviews of a project as sessions of Factory / Sessions (REQ-008).
pub fn sessions(project: &str) -> Vec<SessionView> {
    jobs()
        .iter()
        .filter(|j| j.project == project)
        .map(|j| SessionView {
            run: format!("review{}", j.number),
            key: format!("#{}", j.number),
            step: "review".into(),
            runner: j.runner.clone(),
            model: j.model.clone(),
            state: shipyard_core::workflow::StepState::Running,
            tokens: 0,
            cost_usd: 0.0,
            pull: Some(j.number),
        })
        .collect()
}

/// Stops every running review: the switch "Agents stopped" does.
pub fn stop_all() {
    for j in jobs().iter() {
        if let Some(h) = &j.cancel {
            h.cancel();
        }
    }
}

/// Stops the running review of a pull request. Nothing runs: nothing happens.
pub fn review_stop(s: &AppState, number: u32) -> Res<()> {
    let (pid, _) = project(s)?;
    for j in jobs().iter() {
        if j.project == pid
            && j.number == number
            && let Some(h) = &j.cancel
        {
            h.cancel();
        }
    }
    Ok(())
}

// ---------------------------------------------------------------- the draft store

fn project(s: &AppState) -> Res<(String, PathBuf)> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Ok((e.id, e.path.into()))
}

fn plain_sha(sha: &str) -> Res<&str> {
    if sha.len() >= 7 && sha.len() <= 64 && sha.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(sha)
    } else {
        Err(format!("bad commit id: {sha}"))
    }
}

fn file(s: &AppState, pid: &str, number: u32, sha: &str, ext: &str) -> Res<PathBuf> {
    let sha = plain_sha(sha)?;
    if pid.is_empty() || !pid.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("bad project id: {pid}"));
    }
    Ok(s.dir
        .join("pr-reviews")
        .join(pid)
        .join(format!("{number}-{sha}.{ext}")))
}

fn load(s: &AppState, pid: &str, number: u32, sha: &str) -> Res<Option<ReviewDraft>> {
    match std::fs::read(file(s, pid, number, sha, "json")?) {
        Ok(b) => serde_json::from_slice(&b).map(Some).map_err(err),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(err(e)),
    }
}

fn save(s: &AppState, pid: &str, d: &ReviewDraft) -> Res<()> {
    let path = file(s, pid, d.number, &d.head_sha, "json")?;
    shipyard_store::project::write_atomic(&path, &serde_json::to_vec_pretty(d).map_err(err)?)
        .map_err(err)
}

/// A review of this head commit exists, or its automatic try failed: a tick starts none.
fn reviewed(s: &AppState, pid: &str, number: u32, sha: &str) -> bool {
    ["json", "failed"]
        .iter()
        .any(|e| file(s, pid, number, sha, e).is_ok_and(|p| p.exists()))
}

/// The draft of a pull request at its head commit, if one exists.
pub fn review_get(s: &AppState, number: u32, head_sha: &str) -> Res<Option<ReviewDraft>> {
    let (pid, _) = project(s)?;
    load(s, &pid, number, head_sha)
}

/// The drafts that wait for a person, newest first: not posted, and on a pull request that is
/// still open at that head commit. `open: None` (no answer of the code host) keeps them all.
fn waiting(mut drafts: Vec<ReviewDraft>, open: Option<&[(u64, String)]>) -> Vec<ReviewDraft> {
    drafts.retain(|d| {
        !d.posted
            && open.is_none_or(|o| {
                o.iter()
                    .any(|(n, sha)| *n == u64::from(d.number) && *sha == d.head_sha)
            })
    });
    drafts
}

/// The number and head commit of each open pull request: every page, so an older one is not lost.
/// `fetch` gives one page for a cursor, and `None` on a failure: the caller keeps every draft.
fn open_heads(
    mut fetch: impl FnMut(Option<String>) -> Option<(Vec<(u64, String)>, Option<String>)>,
) -> Option<Vec<(u64, String)>> {
    let mut all = Vec::new();
    let mut cursor = None;
    // shortcut: 40 pages of 100 pull requests, then the answer is unknown; raise it if a project needs more.
    for _ in 0..40 {
        let (items, next) = fetch(cursor.take())?;
        all.extend(items);
        if next.is_none() {
            return Some(all);
        }
        cursor = next;
    }
    None
}

/// The drafts of the active project that wait for a person: Home / Needs you shows them.
pub fn review_waiting(s: &AppState) -> Res<Vec<ReviewWait>> {
    let (pid, _) = project(s)?;
    let dir = s.dir.join("pr-reviews").join(&pid);
    let mut found: Vec<(std::time::SystemTime, ReviewDraft)> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| {
            let draft = serde_json::from_slice(&std::fs::read(e.path()).ok()?).ok()?;
            Some((e.metadata().ok()?.modified().ok()?, draft))
        })
        .collect();
    found.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    let host = crate::code::forge(s).ok();
    let open = host.as_ref().and_then(|(api, slug, _)| {
        open_heads(|cursor| {
            let query = PullQuery {
                state: StateFilter::Open,
                limit: 100,
                cursor,
            };
            let page = api.list_pulls(slug, &query).ok()?;
            let items = page.items.into_iter().map(|p| (p.number, p.head_sha));
            Some((items.collect(), page.next))
        })
    });
    let conn = host.map(|(_, _, id)| id);
    Ok(
        waiting(found.into_iter().map(|(_, d)| d).collect(), open.as_deref())
            .into_iter()
            .map(|d| ReviewWait {
                reference: conn
                    .as_ref()
                    .map_or_else(String::new, |c| format!("pr:{c}:{}", d.number)),
                number: d.number,
                head_sha: d.head_sha,
                title: d.title,
            })
            .collect(),
    )
}

// ---------------------------------------------------------------- the rules of the project

fn has_dir(root: &Path, parts: &[&str]) -> bool {
    parts.iter().any(|p| root.join(p).exists())
}

/// The compass `review` skill and the `reviewer` role of the project (REQ-003).
pub fn review_rules(root: &Path) -> (bool, bool) {
    (
        has_dir(root, &[".claude/skills/review", ".agents/skills/review"]),
        has_dir(root, &[".claude/agents/reviewer.md"]),
    )
}

fn has_pr_flow(root: &Path) -> bool {
    has_dir(root, &[".claude/skills/pr-flow", ".agents/skills/pr-flow"])
}

/// The runner, model and effort of a read-only turn: the `reviewer` role when it names a model,
/// else the default runner of the project (REQ-002).
fn settings(s: &AppState, pid: &str) -> ThreadSettings {
    let mut t = shipyard_store::assistant_defaults::load(&s.dir, pid).settings();
    t.mode = shipyard_core::assistant::AssistantMode::Ask;
    t.permission = shipyard_core::assistant::Permission::ReadOnly;
    if let Some(role) = crate::factory::roles(s)
        .ok()
        .and_then(|r| r.into_iter().find(|r| r.id == "reviewer"))
    {
        let tiers = s.agents.tiers().unwrap_or_default();
        let row = tiers.iter().find(|r| r.runner == t.runner);
        let named = |tier: &str| -> Option<String> {
            let id = match tier {
                "top" => row?.top.clone(),
                "mid" => row?.mid.clone(),
                "small" => row?.small.clone(),
                other => other.to_string(),
            };
            (!id.is_empty()).then_some(id)
        };
        if let Some(m) = role.model.as_deref().and_then(named) {
            t.model = Some(m);
        }
        if let Some(e) = role.effort {
            t.effort = Some(format!("{e:?}").to_lowercase());
        }
    }
    t
}

fn secrets(s: &AppState) -> Vec<String> {
    let mut all = s.agents.secret_values();
    all.extend(s.connections.secret_values());
    all
}

// ---------------------------------------------------------------- the guards

/// The switch, the budget and the limit of the factory stop a review (REQ-008).
fn guard(s: &AppState, pid: &str, root: &Path) -> Res<()> {
    if crate::factory::kill_switch(s) {
        return Err("the agents are stopped: switch them on first".into());
    }
    let gate = s.factory.factory.assistant_gate(pid, MEMBER);
    if gate.level == BudgetLevel::Spent {
        return Err(format!(
            "the budget {} is spent: the review waits for the next budget",
            gate.budget.unwrap_or_default()
        ));
    }
    let limit = crate::commands::sync::automation_in(root)
        .unwrap_or_default()
        .concurrency
        .global as usize;
    if s.factory.factory.active_runs().len() + jobs().len() >= limit {
        return Err("the agent limit is reached: wait for a run to end".into());
    }
    Ok(())
}

// ---------------------------------------------------------------- one review

/// Runs one agent review at the head commit and keeps the draft. A head commit that has a draft
/// gets that draft: the review runs once for each head commit (REQ-006). `program` runs in place
/// of the CLI (tests).
pub fn run_review(
    s: &AppState,
    input: &ReviewInput,
    auto: bool,
    program: Option<PathBuf>,
) -> Res<ReviewDraft> {
    let (pid, root) = project(s)?;
    if let Some(d) = load(s, &pid, input.number, &input.head_sha)? {
        return Ok(d);
    }
    guard(s, &pid, &root)?;
    let slot = Slot::take(&pid, input.number)?;
    // A retry after a failed automatic try starts again.
    let _ = std::fs::remove_file(file(s, &pid, input.number, &input.head_sha, "failed")?);
    let out = review_turn(s, &pid, &root, input, &slot, program);
    match out {
        Ok(draft) => {
            let draft = ReviewDraft { auto, ..draft };
            save(s, &pid, &draft)?;
            changed(draft.number);
            Ok(draft)
        }
        Err(e) => {
            if auto && e != HEAD_MISSING {
                let path = file(s, &pid, input.number, &input.head_sha, "failed")?;
                let _ = shipyard_store::project::write_atomic(&path, e.as_bytes());
            }
            Err(e)
        }
    }
}

/// A head commit that is not here yet: fetch the branches of the remote, then the head of the pull
/// request (a fork has no branch there). A failure leaves the commit missing, and the review says so.
fn fetch_head(s: &AppState, repo: &Repo, number: u32, sha: &str) {
    let Ok(Some((name, url))) = repo.remote() else {
        return;
    };
    let Ok(auth) = s.connections.git_auth(&url) else {
        return;
    };
    if repo.fetch(&name, &auth).is_err() || !repo.has_commit(sha) {
        repo.fetch_pull_head(&name, number, &auth);
    }
}

fn review_turn(
    s: &AppState,
    pid: &str,
    root: &Path,
    input: &ReviewInput,
    slot: &Slot,
    program: Option<PathBuf>,
) -> Res<ReviewDraft> {
    let repo = Repo::open(root).map_err(err)?;
    let short: String = input.head_sha.chars().take(7).collect();
    let run = format!("review{}-{short}", input.number);
    if !repo.has_commit(&input.head_sha) {
        fetch_head(s, &repo, input.number, &input.head_sha);
    }
    repo.child_worktree_add(&s.dir, pid, &run, "pr", Some(&input.head_sha))
        .map_err(|_| HEAD_MISSING.to_string())?;
    let result = (|| {
        let dir = shipyard_git::worktree::child_path(&s.dir, pid, &run, "pr").map_err(err)?;
        let (skill, role) = review_rules(root);
        let prompt = pull_prompt(&PullBrief {
            number: input.number,
            title: &input.title,
            description: &input.description,
            source: &input.source,
            target: &input.target,
            head: &input.head_sha,
            files: &input.files,
            skill,
            role,
        });
        let text = ask(s, pid, &dir, &prompt, Some(slot), program)?;
        let changed: Vec<String> = input.files.iter().map(|(p, _)| p.clone()).collect();
        let d = parse_draft(&text, &changed)?;
        let secrets = secrets(s);
        Ok(ReviewDraft {
            number: input.number,
            title: input.title.clone(),
            head_sha: input.head_sha.clone(),
            summary: scrub(&d.summary, &secrets),
            verdict: d.verdict.into(),
            findings: d
                .findings
                .into_iter()
                .filter_map(|f| {
                    Some(ReviewFinding {
                        severity: format!("{:?}", f.severity),
                        path: f.path?,
                        line: f.line?,
                        text: scrub(&f.text, &secrets),
                    })
                })
                .collect(),
            dropped: u32::try_from(d.dropped).unwrap_or(u32::MAX),
            posted: false,
            auto: false,
        })
    })();
    // The worktree and its branch go in each case. The review changed nothing in them.
    let _ = repo.child_worktree_remove(&s.dir, pid, &run, "pr", true);
    if let Ok(branch) = shipyard_git::worktree::child_branch(&run, "pr") {
        let _ = repo.delete_branch(&branch, true);
    }
    result
}

/// One read-only turn of the agent in `dir`. The usage books under the assistant member.
fn ask(
    s: &AppState,
    pid: &str,
    dir: &Path,
    prompt: &str,
    slot: Option<&Slot>,
    program: Option<PathBuf>,
) -> Res<String> {
    let settings = settings(s, pid);
    if let Some(slot) = slot {
        slot.describe(&settings);
    }
    let secrets = secrets(s);
    let scratch = s.dir.join("pr-reviews").join(pid).join("scratch");
    let out = run_turn_with(
        TurnInput {
            kind: TurnKind::Send,
            settings: &settings,
            context: &Context::default(),
            quotes: &[],
            text: prompt,
            rules: "",
            dir,
            scratch: &scratch,
            session: None,
            granted: &[],
            secrets: &secrets,
            program,
        },
        &|h| {
            if let Some(slot) = slot {
                slot.cancel_with(h);
            }
        },
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
            eprintln!("pr review budget: {e}");
        }
    }
    match out.message.state {
        MessageState::Failed { message, .. } => Err(message),
        _ => Ok(out.message.text),
    }
}

// ---------------------------------------------------------------- the actions

/// The review of an open pull request (REQ-001, REQ-009).
pub fn review_start(s: &AppState, number: u32, click: bool) -> Res<ReviewDraft> {
    need_click(s, click)?;
    review_pull(s, number, false)
}

fn review_pull(s: &AppState, number: u32, auto: bool) -> Res<ReviewDraft> {
    let (api, slug, _) = crate::code::forge(s)?;
    let n = u64::from(number);
    let p = api.pull(&slug, n).map_err(err)?;
    if p.state != PullState::Open {
        return Err("the pull request is not open".into());
    }
    let files = api
        .files(&slug, n)
        .map_err(err)?
        .into_iter()
        .map(|f| (f.path, f.patch))
        .collect();
    run_review(
        s,
        &ReviewInput {
            number,
            title: p.title,
            description: api.description(&slug, n).map_err(err)?,
            source: p.source_branch,
            target: p.target_branch,
            head_sha: p.head_sha,
            files,
        },
        auto,
        None,
    )
}

/// Posts the draft that the person edited, once (REQ-004). `mode` of the automatic setting posts a
/// comment only (REQ-007).
pub fn review_post(s: &AppState, post: ReviewPost, click: bool) -> Res<()> {
    need_click(s, click)?;
    post_with(s, post, false)
}

/// The drafts that post now. A second post of the same draft waits for no one: it is refused.
static POSTING: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[derive(Debug)]
struct PostLock(String);

impl PostLock {
    fn take(key: String) -> Res<Self> {
        let mut all = POSTING.lock().unwrap_or_else(|e| e.into_inner());
        if all.contains(&key) {
            return Err("the review is posted already".into());
        }
        all.push(key.clone());
        Ok(Self(key))
    }
}

impl Drop for PostLock {
    fn drop(&mut self) {
        POSTING
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .retain(|k| *k != self.0);
    }
}

/// An automatic post is a comment, whatever the draft says.
fn post_verdict(draft: ReviewVerdict, comment_only: bool) -> ReviewVerdict {
    if comment_only {
        ReviewVerdict::Comment
    } else {
        draft
    }
}

/// What goes to the code host: the verdict, the summary and each finding as a note on its line.
/// A secret never leaves in the text.
fn review_args(
    post: &ReviewPost,
    comment_only: bool,
    secrets: &[String],
) -> (ReviewVerdict, String, Vec<LineNote>) {
    let notes = post
        .findings
        .iter()
        .map(|f| LineNote {
            path: f.path.clone(),
            line: f.line,
            text: scrub(&format!("{} {}", f.severity, f.text.trim()), secrets),
        })
        .collect();
    (
        post_verdict(post.verdict, comment_only),
        scrub(&post.summary, secrets),
        notes,
    )
}

fn post_with(s: &AppState, post: ReviewPost, comment_only: bool) -> Res<()> {
    crate::work::refuse_read_only(s)?;
    let (pid, _) = project(s)?;
    let _lock = PostLock::take(format!("{pid}-{}-{}", post.number, post.head_sha))?;
    let mut draft = load(s, &pid, post.number, &post.head_sha)?.ok_or("no draft review")?;
    if draft.posted {
        return Err("the review is posted already".into());
    }
    if post.summary.trim().is_empty() && post.findings.is_empty() {
        return Err("the review is empty".into());
    }
    let (api, slug, _) = crate::code::forge(s)?;
    let (verdict, summary, notes) = review_args(&post, comment_only, &secrets(s));
    api.review(
        &slug,
        u64::from(post.number),
        &post.head_sha,
        match verdict {
            ReviewVerdict::Comment => None,
            ReviewVerdict::Approve => Some(Verdict::Approve),
            ReviewVerdict::RequestChanges => Some(Verdict::RequestChanges),
        },
        &summary,
        &notes,
    )
    .map_err(err)?;
    draft.summary = post.summary;
    draft.verdict = verdict;
    draft.findings = post.findings;
    draft.posted = true;
    save(s, &pid, &draft)?;
    changed(draft.number);
    Ok(())
}

/// "Write with an agent": a title and a body from the branch diff, the linked ticket and the
/// linked spec change (REQ-005). Nothing opens: the person edits the text and clicks Open.
pub fn pr_write(s: &AppState, base: Option<String>, click: bool) -> Res<PrText> {
    need_click(s, click)?;
    pr_write_with(s, base, None)
}

pub fn pr_write_with(s: &AppState, base: Option<String>, program: Option<PathBuf>) -> Res<PrText> {
    let (pid, root) = project(s)?;
    let repo = Repo::open(&root).map_err(err)?;
    let branch = repo
        .branches()
        .map_err(err)?
        .into_iter()
        .find(|b| b.is_head)
        .ok_or("no working branch")?
        .name;
    let base = match base.filter(|b| !b.trim().is_empty()) {
        Some(b) => b,
        None => match crate::code::forge(s) {
            Ok((api, slug, _)) => api.repository(&slug).map_err(err)?.default_branch,
            Err(_) => "main".into(),
        },
    };
    let diffs = [base.clone(), format!("origin/{base}")]
        .iter()
        .find_map(|b| repo.file_diffs_since(b, 200_000).ok())
        .ok_or("the branch has no base to compare with")?;
    if diffs.is_empty() {
        return Err("the branch has no changes to describe".into());
    }
    let mut refs = shipyard_core::code::commit_refs(&branch, "", &crate::code::known_keys(s), None);
    for d in &diffs {
        let mut parts = d.path.split('/');
        while let Some(p) = parts.next() {
            if p == "changes"
                && let Some(id) = parts.next()
                && id != "archive"
            {
                let r = format!("change:{id}");
                if !refs.contains(&r) {
                    refs.push(r);
                }
            }
        }
    }
    let files: Vec<(String, String)> = diffs.into_iter().map(|d| (d.path, d.text)).collect();
    let prompt = text_prompt(&TextBrief {
        branch: &branch,
        base: &base,
        refs: &refs,
        files: &files,
        flow: has_pr_flow(&root),
    });
    guard(s, &pid, &root)?;
    let text = ask(s, &pid, &root, &prompt, None, program)?;
    let (title, body) = parse_text(&text)?;
    let secrets = secrets(s);
    Ok(PrText {
        title: scrub(&title, &secrets),
        body: scrub(&body, &secrets),
    })
}

// ---------------------------------------------------------------- the automatic review

/// The automatic mode of the project when a tick may use it. A read-only project and a stopped
/// factory have none (REQ-008, REQ-009).
fn auto_mode(s: &AppState, root: &Path) -> Option<AutoReview> {
    let mode = crate::commands::sync::automation_in(root)
        .unwrap_or_default()
        .auto_review;
    (mode != AutoReview::Off
        && !crate::factory::kill_switch(s)
        && crate::work::refuse_read_only(s).is_ok())
    .then_some(mode)
}

/// One look at the open pull requests of the active project (REQ-006). It starts the review of
/// each head commit that has none, in the background. `post` posts a comment review (REQ-007).
pub fn auto_tick(app: &AppHandle) {
    let _ = APP.set(app.clone());
    let s = app.state::<AppState>();
    let Ok((pid, root)) = project(&s) else { return };
    let Some(mode) = auto_mode(&s, &root) else {
        return;
    };
    let Ok((api, slug, _)) = crate::code::forge(&s) else {
        return;
    };
    let query = PullQuery {
        state: StateFilter::Open,
        limit: 50,
        cursor: None,
    };
    let Ok(page) = api.list_pulls(&slug, &query) else {
        return;
    };
    let snaps: Vec<PullSnapshot> = page
        .items
        .into_iter()
        .map(|p| PullSnapshot {
            number: p.number,
            title: p.title,
            state: PrState::Open,
            draft: p.draft,
            head_sha: p.head_sha,
            url: p.url,
            ci: shipyard_core::pickup::Ci::None,
            changes_requested: false,
            updated: p.updated,
        })
        .collect();
    let due = reviews_due(mode, &snaps, |n, sha| {
        reviewed(&s, &pid, u32::try_from(n).unwrap_or(0), sha) || running(&pid, n as u32)
    });
    for (number, _) in due {
        let Ok(number) = u32::try_from(number) else {
            continue;
        };
        if guard(&s, &pid, &root).is_err() {
            return;
        }
        let app = app.clone();
        std::thread::spawn(move || {
            let s = app.state::<AppState>();
            match review_pull(&s, number, true) {
                Ok(d) if mode == AutoReview::Post => {
                    let post = ReviewPost {
                        number,
                        head_sha: d.head_sha,
                        summary: d.summary,
                        verdict: ReviewVerdict::Comment,
                        findings: d.findings,
                    };
                    if let Err(e) = post_with(&s, post, true) {
                        eprintln!("auto review #{number}: {e}");
                    }
                }
                Ok(_) => {}
                Err(e) => eprintln!("auto review #{number}: {e}"),
            }
        });
        // One start for each look: the limit and the budget are checked again at the next one.
        return;
    }
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn pr_review_start(app: AppHandle, number: u32, click: bool) -> Api<ReviewDraft> {
    let _ = APP.set(app.clone());
    blocking(app, move |s| review_start(s, number, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn pr_review_get(
    app: AppHandle,
    number: u32,
    head_sha: String,
) -> Api<Option<ReviewDraft>> {
    blocking(app, move |s| review_get(s, number, &head_sha)).await
}

#[tauri::command]
#[specta::specta]
pub async fn pr_review_waiting(app: AppHandle) -> Api<Vec<ReviewWait>> {
    blocking(app, review_waiting).await
}

#[tauri::command]
#[specta::specta]
pub async fn pr_review_post(app: AppHandle, post: ReviewPost, click: bool) -> Api<()> {
    blocking(app, move |s| review_post(s, post, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn pr_review_stop(app: AppHandle, number: u32) -> Api<()> {
    blocking(app, move |s| review_stop(s, number)).await
}

#[tauri::command]
#[specta::specta]
pub async fn pr_write_text(app: AppHandle, base: Option<String>, click: bool) -> Api<PrText> {
    blocking(app, move |s| pr_write(s, base, click)).await
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use shipyard_agents::fake::program;
    use shipyard_core::project::ProjectFile;
    use shipyard_http::fake::FakeHttp;
    use shipyard_secrets::MemoryStore;

    use super::*;
    use crate::connections::Connections;

    /// The running slots and the limit are global: the tests that start a review take turns.
    static TURN: Mutex<()> = Mutex::new(());

    fn turn() -> std::sync::MutexGuard<'static, ()> {
        TURN.lock().unwrap_or_else(|e| e.into_inner())
    }

    struct Fx {
        data: tempfile::TempDir,
        repo: tempfile::TempDir,
        s: AppState,
        pid: String,
        first: String,
        second: String,
    }

    fn git(dir: &Path, args: &[&str]) {
        let ok = std::process::Command::new("git")
            .current_dir(dir)
            .args(args)
            .status()
            .unwrap()
            .success();
        assert!(ok, "git {args:?}");
    }

    fn fx() -> Fx {
        let repo = tempfile::tempdir().unwrap();
        shipyard_git::project::init(repo.path()).unwrap();
        git(repo.path(), &["config", "user.email", "a@example.com"]);
        git(repo.path(), &["config", "user.name", "A"]);
        std::fs::write(repo.path().join("a.txt"), "one\n").unwrap();
        git(repo.path(), &["add", "a.txt", ".gitignore"]);
        git(repo.path(), &["commit", "-q", "-m", "one"]);
        let r = Repo::open(repo.path()).unwrap();
        let first = r.head_sha().unwrap();
        std::fs::write(repo.path().join("a.txt"), "one\ntwo\n").unwrap();
        git(repo.path(), &["commit", "-q", "-am", "two"]);
        let second = r.head_sha().unwrap();
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
        Fx {
            data,
            repo,
            s,
            pid,
            first,
            second,
        }
    }

    /// A runner that answers with `text` and counts its starts in `runs`.
    fn runner(f: &Fx, text: &str) -> PathBuf {
        let runs = f.data.path().join("runs");
        let body = format!(
            r#"cat > /dev/null
echo x >> '{runs}'
echo '{{"type":"system","session_id":"s1"}}'
echo '{{"type":"assistant","message":{{"content":[{{"type":"text","text":{text}}}]}}}}'
echo '{{"type":"result","subtype":"success","is_error":false,"session_id":"s1","total_cost_usd":0.1,"usage":{{"input_tokens":30,"output_tokens":12}}}}'"#,
            runs = runs.display(),
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

    /// The pull request number: each test has its own, as the running slots are global.
    fn input(f: &Fx, number: u32) -> ReviewInput {
        ReviewInput {
            number,
            title: "Add two".into(),
            description: String::new(),
            source: "feat/two".into(),
            target: "main".into(),
            head_sha: f.second.clone(),
            files: vec![("a.txt".into(), Some("@@ -1 +1,2 @@\n one\n+two\n".into()))],
        }
    }

    const ANSWER: &str = r#"{"summary":"One note","verdict":"approve","findings":[{"severity":"P1","path":"a.txt","line":2,"text":"No test"},{"severity":"P2","path":"other.txt","line":1,"text":"Not in the diff"}]}"#;

    #[test]
    fn a_review_makes_one_draft_for_each_head_commit_and_leaves_no_worktree() {
        let _turn = turn();
        let f = fx();
        let bin = runner(&f, ANSWER);
        let d = run_review(&f.s, &input(&f, 7), false, Some(bin.clone())).unwrap();
        assert_eq!(d.summary, "One note");
        // An approval with a P1 finding is a comment, and the finding of another file is dropped.
        assert_eq!(
            (d.verdict, d.findings.len(), d.dropped),
            (ReviewVerdict::Comment, 1, 1)
        );
        assert_eq!(d.findings[0].line, 2);
        // The second ask gets the same draft and starts no agent.
        let again = run_review(&f.s, &input(&f, 7), false, Some(bin)).unwrap();
        assert_eq!((again, started(&f)), (d.clone(), 1));
        assert_eq!(review_get(&f.s, 7, &f.second).unwrap(), Some(d));
        let left = f.s.dir.join("worktrees").join(&f.pid);
        assert!(std::fs::read_dir(&left).map_or(true, |mut e| e.next().is_none()));
        let repo = Repo::open(f.repo.path()).unwrap();
        assert!(
            repo.branches()
                .unwrap()
                .iter()
                .all(|b| !b.name.starts_with("shipyard/"))
        );
        // Nothing of the draft is in the repository.
        assert!(!f.repo.path().join(".shipyard").join("pr-reviews").exists());
    }

    #[test]
    fn a_stopped_factory_and_a_missing_commit_start_no_review() {
        let _turn = turn();
        let f = fx();
        let bin = runner(&f, ANSWER);
        crate::factory::set_kill_switch(&f.s, true);
        let e = run_review(&f.s, &input(&f, 8), false, Some(bin.clone())).unwrap_err();
        assert_eq!(
            crate::errors::AppError::from(e).code,
            crate::errors::ErrorCode::AgentsStopped
        );
        crate::factory::set_kill_switch(&f.s, false);
        let mut lost = input(&f, 8);
        lost.head_sha = "0".repeat(40);
        let e = run_review(&f.s, &lost, false, Some(bin)).unwrap_err();
        assert_eq!(
            crate::errors::AppError::from(e).code,
            crate::errors::ErrorCode::HeadMissing
        );
        assert_eq!(started(&f), 0);
    }

    #[test]
    fn an_automatic_try_that_failed_is_not_tried_again_for_that_commit() {
        let _turn = turn();
        let f = fx();
        let bin = runner(&f, "no json at all");
        assert!(run_review(&f.s, &input(&f, 9), true, Some(bin.clone())).is_err());
        assert!(reviewed(&f.s, &f.pid, 9, &f.second));
        let due = reviews_due(
            AutoReview::Draft,
            &[PullSnapshot {
                number: 9,
                title: String::new(),
                state: PrState::Open,
                draft: false,
                head_sha: f.second.clone(),
                url: String::new(),
                ci: shipyard_core::pickup::Ci::None,
                changes_requested: false,
                updated: String::new(),
            }],
            |n, sha| reviewed(&f.s, &f.pid, u32::try_from(n).unwrap(), sha),
        );
        assert!(due.is_empty());
        // A person who clicks tries again and the marker goes.
        let ok = runner(&f, ANSWER);
        assert!(run_review(&f.s, &input(&f, 9), false, Some(ok)).is_ok());
    }

    fn read_only(f: &Fx) {
        let on = shipyard_store::project::Overrides {
            read_only: Some(true),
            ..Default::default()
        };
        crate::commands::projects::save_overrides(&f.s, on).unwrap();
    }

    #[test]
    fn a_read_only_project_has_no_automatic_review_and_posts_nothing() {
        let _turn = turn();
        let f = fx();
        let dir = f.repo.path().join(".shipyard");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("automation.yaml"), "auto_review: post\n").unwrap();
        assert_eq!(auto_mode(&f.s, f.repo.path()), Some(AutoReview::Post));
        run_review(&f.s, &input(&f, 12), false, Some(runner(&f, ANSWER))).unwrap();
        read_only(&f);
        assert_eq!(auto_mode(&f.s, f.repo.path()), None);
        let post = ReviewPost {
            number: 12,
            head_sha: f.second.clone(),
            summary: "x".into(),
            verdict: ReviewVerdict::Comment,
            findings: Vec::new(),
        };
        // The automatic path has no click: the lock alone must stop it.
        let e = post_with(&f.s, post, true).unwrap_err();
        assert!(e.contains("read only"), "{e}");
    }

    #[test]
    fn an_automatic_post_is_a_comment_and_a_click_keeps_the_verdict() {
        assert_eq!(
            post_verdict(ReviewVerdict::Approve, true),
            ReviewVerdict::Comment
        );
        assert_eq!(
            post_verdict(ReviewVerdict::RequestChanges, true),
            ReviewVerdict::Comment
        );
        assert_eq!(
            post_verdict(ReviewVerdict::RequestChanges, false),
            ReviewVerdict::RequestChanges
        );
    }

    /// The factory knows the project, with a day budget of `usd`.
    fn day_budget(f: &Fx, usd: f64) {
        use shipyard_engine::fake::{FakeGit, FakePulls, FakeWorkspaces, FakeWriter};
        let writer = FakeWriter::default();
        let pulls = FakePulls::default();
        writer.link(&pulls);
        f.s.factory.factory.set_project(
            &f.pid,
            shipyard_engine::run_engine::Project {
                automation: shipyard_core::pickup::Automation {
                    budgets: shipyard_core::pickup::Budgets {
                        day: [("*".to_string(), usd)].into(),
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
            },
        );
    }

    #[test]
    fn a_spent_budget_starts_no_review() {
        let _turn = turn();
        let f = fx();
        let bin = runner(&f, ANSWER);
        day_budget(&f, 0.05);
        // The first review books 0.10 USD and spends the 0.05 USD of the day.
        run_review(&f.s, &input(&f, 13), false, Some(bin.clone())).unwrap();
        let e = run_review(&f.s, &input(&f, 14), false, Some(bin)).unwrap_err();
        assert_eq!(
            crate::errors::AppError::from(e).code,
            crate::errors::ErrorCode::BudgetSpent
        );
        assert_eq!(started(&f), 1);
    }

    #[test]
    fn the_same_draft_cannot_post_twice_at_once() {
        let first = PostLock::take("p-1-abc".into()).unwrap();
        let e = PostLock::take("p-1-abc".into()).unwrap_err();
        assert_eq!(
            crate::errors::AppError::from(e).code,
            crate::errors::ErrorCode::ReviewPosted
        );
        assert!(PostLock::take("p-1-def".into()).is_ok());
        drop(first);
        assert!(PostLock::take("p-1-abc".into()).is_ok());
    }

    #[test]
    fn an_automatic_try_with_a_missing_commit_leaves_no_marker_and_a_later_try_may_work() {
        let _turn = turn();
        let f = fx();
        let bin = runner(&f, ANSWER);
        let mut lost = input(&f, 15);
        lost.head_sha = "0".repeat(40);
        assert!(run_review(&f.s, &lost, true, Some(bin.clone())).is_err());
        assert!(!reviewed(&f.s, &f.pid, 15, &lost.head_sha));
        // The commit is there at the next tick.
        assert!(run_review(&f.s, &input(&f, 15), true, Some(bin)).is_ok());
    }

    fn draft(number: u32, sha: &str, posted: bool) -> ReviewDraft {
        ReviewDraft {
            number,
            title: format!("Pull {number}"),
            head_sha: sha.into(),
            summary: "s".into(),
            verdict: ReviewVerdict::Comment,
            findings: Vec::new(),
            dropped: 0,
            posted,
            auto: true,
        }
    }

    #[test]
    fn a_running_review_is_a_session_that_the_factory_counts_and_stops_with_its_slot() {
        let _turn = turn();
        let f = fx();
        let slot = Slot::take(&f.pid, 31).unwrap();
        let mut t = ThreadSettings::new("claude");
        t.model = Some("opus".into());
        slot.describe(&t);
        let row = &crate::factory::sessions(&f.s).unwrap()[0];
        assert_eq!(
            (
                row.key.as_str(),
                row.pull,
                row.runner.as_str(),
                row.model.as_deref(),
                row.state
            ),
            (
                "#31",
                Some(31),
                "claude",
                Some("opus"),
                shipyard_core::workflow::StepState::Running
            )
        );
        assert!(sessions("other-project").is_empty());
        // The tick of the factory sees one slot held by something other than a run.
        assert_eq!(Dispatch::reserved(&*f.s.factory), 1);
        drop(slot);
        assert!(crate::factory::sessions(&f.s).unwrap().is_empty());
        assert_eq!(Dispatch::reserved(&*f.s.factory), 0);
    }

    #[test]
    fn a_draft_that_waits_shows_until_it_is_posted_or_its_pull_request_moves_on() {
        let _turn = turn();
        let f = fx();
        save(&f.s, &f.pid, &draft(3, &f.first, false)).unwrap();
        save(&f.s, &f.pid, &draft(4, &f.second, true)).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        save(&f.s, &f.pid, &draft(5, &f.second, false)).unwrap();
        // No code host answer: every unposted draft waits, the newest first.
        let numbers = |d: Vec<ReviewDraft>| d.iter().map(|d| d.number).collect::<Vec<_>>();
        let seen = review_waiting(&f.s).unwrap();
        assert_eq!(seen.iter().map(|w| w.number).collect::<Vec<_>>(), [5, 3]);
        assert_eq!(
            (seen[0].title.as_str(), seen[0].reference.as_str()),
            ("Pull 5", "")
        );
        // With an answer, a draft waits only on an open pull request at the same head commit.
        let all = vec![
            draft(3, &f.first, false),
            draft(5, &f.second, false),
            draft(6, "abc1234", false),
        ];
        let open = [(5, f.second.clone()), (3, "other".to_string())];
        assert_eq!(numbers(waiting(all, Some(&open))), [5]);
    }

    #[test]
    fn the_open_pull_requests_come_from_every_page_or_from_none() {
        let pages = [
            (vec![(1, "a".to_string())], Some("2".to_string())),
            (vec![(2, "b".to_string())], Some("3".to_string())),
            (vec![(3, "c".to_string())], None),
        ];
        let mut asked = Vec::new();
        let all = open_heads(|cursor| {
            asked.push(cursor.clone());
            let at = cursor.map_or(0, |c| c.parse::<usize>().unwrap() - 1);
            Some(pages[at].clone())
        });
        assert_eq!(all.unwrap().len(), 3);
        assert_eq!(asked, [None, Some("2".into()), Some("3".into())]);
        // A page that fails gives no answer: every draft stays.
        assert_eq!(
            open_heads(|c| c.is_none().then(|| (vec![], Some("2".into())))),
            None
        );
    }

    #[test]
    fn the_post_sends_each_finding_as_a_note_and_an_automatic_post_is_a_comment() {
        let post = ReviewPost {
            number: 7,
            head_sha: "abc1234".into(),
            summary: " Sum key-123 ".into(),
            verdict: ReviewVerdict::Approve,
            findings: vec![ReviewFinding {
                severity: "P1".into(),
                path: "a.txt".into(),
                line: 2,
                text: " No test ".into(),
            }],
        };
        let (v, summary, notes) = review_args(&post, false, &["key-123".into()]);
        assert_eq!(v, ReviewVerdict::Approve);
        assert!(!summary.contains("key-123"), "{summary}");
        assert_eq!(
            notes,
            [LineNote {
                path: "a.txt".into(),
                line: 2,
                text: "P1 No test".into()
            }]
        );
        assert_eq!(review_args(&post, true, &[]).0, ReviewVerdict::Comment);
    }

    #[test]
    fn a_draft_posts_only_once_and_needs_a_click() {
        let _turn = turn();
        let f = fx();
        run_review(&f.s, &input(&f, 10), false, Some(runner(&f, ANSWER))).unwrap();
        let post = ReviewPost {
            number: 10,
            head_sha: f.second.clone(),
            summary: "x".into(),
            verdict: ReviewVerdict::Comment,
            findings: Vec::new(),
        };
        assert!(
            review_post(&f.s, post.clone(), false)
                .unwrap_err()
                .contains("click")
        );
        // No forge connection here: the post fails before it marks the draft posted.
        assert!(review_post(&f.s, post, true).is_err());
        assert!(!review_get(&f.s, 10, &f.second).unwrap().unwrap().posted);
    }

    #[test]
    fn the_project_skill_and_role_are_found_in_either_folder() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(review_rules(dir.path()), (false, false));
        std::fs::create_dir_all(dir.path().join(".agents/skills/review")).unwrap();
        std::fs::create_dir_all(dir.path().join(".claude/agents")).unwrap();
        std::fs::write(dir.path().join(".claude/agents/reviewer.md"), "").unwrap();
        assert_eq!(review_rules(dir.path()), (true, true));
        assert!(!has_pr_flow(dir.path()));
        std::fs::create_dir_all(dir.path().join(".claude/skills/pr-flow")).unwrap();
        assert!(has_pr_flow(dir.path()));
    }

    #[test]
    fn write_with_an_agent_fills_a_title_and_a_body_from_the_diff_and_opens_nothing() {
        let _turn = turn();
        let f = fx();
        let bin = runner(
            &f,
            r#"{"title":"Add two","body":"Adds a line. Refs: none"}"#,
        );
        let t = pr_write_with(&f.s, Some(f.first.clone()), Some(bin)).unwrap();
        assert_eq!(
            (t.title.as_str(), t.body.as_str()),
            ("Add two", "Adds a line. Refs: none")
        );
        assert!(pr_write(&f.s, None, false).unwrap_err().contains("click"));
        // A branch with no change since its base has nothing to describe.
        // The runner is a fake here too: a call that reached the real CLI would cost money.
        let none = runner(&f, "{}");
        let e = pr_write_with(&f.s, Some(f.second.clone()), Some(none)).unwrap_err();
        assert_eq!(
            crate::errors::AppError::from(e).code,
            crate::errors::ErrorCode::NoChanges
        );
    }
}
