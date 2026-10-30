//! The assistant of the active project (spec `assistant`). Threads live in the app data folder;
//! a turn runs on the runner layer of the factory and books into its budgets. The logic is in plain
//! functions on `&AppState`; `commands::assistant` only runs them on a blocking thread.
//!
//! - Send to factory (REQ-014, REQ-015): the item comes from `work::item_create` after a click;
//!   a run is the label `wf:<id>` on that item. Q-048: a run always needs an item, so the item is
//!   made first. Nothing here starts a run: the factory claims the item.
//! - Explain (REQ-016): an ask-mode turn on one entity. Only refs that resolve stay cited.
//! - Member budgets: a turn books under the member `assistant`, apart from the unassigned runs.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use shipyard_agents::assistant::{TurnInput, TurnKind, run_turn};
use shipyard_agents::assistant_modes;
use shipyard_agents::assistant_rules;
use shipyard_core::assistant::{
    AssistantMode, ChatMessage, ChatRole, Context, MessageState, Quote, Thread, ThreadSettings,
    ThreadSummary, failure, scrub,
};
use shipyard_core::refs::parse;
use shipyard_core::run::BudgetLevel;
use shipyard_core::work::{DiffRow, Row, RowKind};
use shipyard_git::code::FileDiff;
use shipyard_store::assistant_defaults::{self, AssistantDefaults};
use shipyard_store::ref_query::State;
use shipyard_store::threads::{Threads, now};
use specta::Type;

use crate::commands::{AppState, Res, err, refs};
use crate::work::ApplyRow;

/// Threads with a turn in progress: a second turn on the same thread is refused.
static BUSY: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// The member key of the turns. Not `""`: that key is the unassigned runs and their `*` budget.
const MEMBER: &str = "assistant";

/// The values that no text of the assistant may show: provider keys and connection secrets
/// (REQ-020).
fn secrets(s: &AppState) -> Vec<String> {
    let mut all = s.agents.secret_values();
    all.extend(s.connections.secret_values());
    all
}

/// The number of threads with a turn in progress. The close guard reads it.
pub fn busy_turns() -> usize {
    BUSY.lock().unwrap_or_else(|e| e.into_inner()).len()
}

struct Busy(String);

impl Busy {
    fn take(id: &str) -> Res<Self> {
        let mut b = BUSY.lock().unwrap_or_else(|e| e.into_inner());
        if b.iter().any(|x| x == id) {
            return Err("this thread already runs a turn".into());
        }
        b.push(id.into());
        Ok(Self(id.into()))
    }
}

impl Drop for Busy {
    fn drop(&mut self) {
        BUSY.lock()
            .unwrap_or_else(|e| e.into_inner())
            .retain(|x| *x != self.0);
    }
}

// ---------------------------------------------------------------- types

/// A quota window of the account, when the runner reports it. No runner reports one yet.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindow {
    pub label: String,
    pub percent: u32,
}

/// What the ring and the quota windows show (REQ-023).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Gauge {
    /// Tokens of the last model call of the thread: input, cache and output.
    pub used_tokens: u32,
    pub window_tokens: u32,
    pub quotas: Vec<QuotaWindow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThreadView {
    pub thread: Thread,
    pub gauge: Gauge,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TurnResult {
    pub thread: ThreadView,
    pub message: ChatMessage,
    /// The files that the thread changed in its worktree (agent mode).
    pub changed: Vec<FileDiff>,
    /// The budget at 80 % or more, named. The turn ran.
    pub alert: Option<String>,
}

/// What a person may pick for a runner (REQ-011).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RunnerOptions {
    pub runner: String,
    pub models: Vec<String>,
    pub efforts: Vec<String>,
    pub window_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FactorySend {
    pub item: ApplyRow,
    /// `wf:<id>` when the thread was sent as a run.
    pub label: Option<String>,
}

// ---------------------------------------------------------------- pure helpers

/// The context window of a runner, in tokens. shortcut: a constant table, a runner that reports
/// its window replaces it.
pub fn window_tokens(runner: &str) -> u32 {
    match runner {
        "claude" => 200_000,
        "codex" => 400_000,
        "gemini" => 1_000_000,
        _ => 128_000,
    }
}

pub fn efforts(runner: &str) -> Vec<String> {
    let list: &[&str] = match runner {
        "claude" => &["low", "medium", "high", "xhigh", "max"],
        "codex" => &["minimal", "low", "medium", "high"],
        _ => &[],
    };
    list.iter().map(|e| e.to_string()).collect()
}

pub fn gauge(t: &Thread) -> Gauge {
    let used = t
        .messages
        .iter()
        .rev()
        .map(|m| &m.usage)
        .find(|u| u.input_tokens + u.cached_tokens + u.output_tokens > 0)
        .map_or(0, |u| u.input_tokens + u.cached_tokens + u.output_tokens);
    Gauge {
        used_tokens: used,
        window_tokens: window_tokens(&t.settings.runner),
        quotas: Vec::new(),
    }
}

/// `wf:<id>`. The id is a plain name, as a workflow file id is.
pub fn run_label(workflow: &str) -> Res<String> {
    match parse(&format!("wf:{workflow}")) {
        Some(_) => Ok(format!("wf:{workflow}")),
        None => Err(format!("`{workflow}` is not a workflow id")),
    }
}

/// The refs in a text: a token that parses as a ref, once each, in order.
pub fn cited(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tok in text.split_whitespace() {
        let tok = tok.trim_matches(|c: char| {
            matches!(
                c,
                '.' | ',' | ';' | ':' | '(' | ')' | '[' | ']' | '"' | '\'' | '`' | '*' | '<' | '>'
            )
        });
        let tok = tok.trim_start_matches('@');
        if parse(tok).is_some() && !out.iter().any(|r| r == tok) {
            out.push(tok.to_string());
        }
    }
    out
}

const NOT_FOUND: &str = "[unresolved ref]";

/// Keep only refs that resolve: the text loses the others, the list holds the rest.
pub fn keep_resolved(text: &str, resolves: impl Fn(&str) -> bool) -> (String, Vec<String>) {
    let mut text = text.to_string();
    let mut kept = Vec::new();
    for r in cited(&text) {
        if resolves(&r) {
            kept.push(r);
        } else {
            text = text.replace(&r, NOT_FOUND);
        }
    }
    (text, kept)
}

/// The request of an Explain turn.
pub fn explain_request(entity: &str) -> String {
    format!(
        "Explain {entity}: what it is, why it exists and how it connects to the rest of the project. Cite a source only as a ref from the context."
    )
}

/// The answer when the entity has no source in the project (REQ-016).
pub fn no_source(entity: &str) -> ChatMessage {
    ChatMessage::assistant(
        &format!("No source for {entity} in this project."),
        MessageState::Done,
        now(),
    )
}

fn first_line(text: &str, max: usize) -> String {
    text.trim()
        .lines()
        .next()
        .unwrap_or("")
        .chars()
        .take(max)
        .collect()
}

/// The row of the work item of a thread: the summary and its refs. The ref `doc:assistant/<id>` is
/// the match mark, so a second click finds the item and creates none.
pub fn work_item_row(t: &Thread, secrets: &[String]) -> Res<Row> {
    let plan = t
        .messages
        .iter()
        .rev()
        .find(|m| m.role == ChatRole::Assistant && !m.text.trim().is_empty())
        .map_or("", |m| m.text.trim());
    let title = if t.title.trim().is_empty() {
        t.messages
            .iter()
            .find(|m| m.role == ChatRole::User)
            .map_or(String::new(), |m| first_line(&m.text, 80))
    } else {
        first_line(&t.title, 80)
    };
    if title.is_empty() {
        return Err("the thread has no message to send".into());
    }
    let mut refs: Vec<String> = t.context.refs.clone();
    for m in &t.messages {
        for r in &m.refs {
            if !refs.contains(r) {
                refs.push(r.clone());
            }
        }
    }
    let mut description: String = plan.chars().take(4000).collect();
    if !refs.is_empty() {
        description.push_str("\n\nRefs:\n");
        for r in &refs {
            description.push_str(&format!("- {r}\n"));
        }
    }
    Ok(Row {
        reference: format!("doc:assistant/{}", t.id),
        kind: RowKind::Story,
        title: scrub(&title, secrets),
        description: scrub(description.trim(), secrets),
        days: None,
        parent: None,
    })
}

// ---------------------------------------------------------------- state

fn project(s: &AppState) -> Res<(String, PathBuf)> {
    let e = s
        .registry()?
        .active()
        .cloned()
        .ok_or("no project is open")?;
    Ok((e.id, PathBuf::from(e.path)))
}

fn view(thread: Thread) -> ThreadView {
    ThreadView {
        gauge: gauge(&thread),
        thread,
    }
}

pub fn threads_list(s: &AppState) -> Res<Vec<ThreadSummary>> {
    let (id, _) = project(s)?;
    Threads::new(&s.dir).list(&id).map_err(err)
}

/// A new thread with the defaults of the project (REQ-019).
pub fn thread_create(s: &AppState, title: Option<String>) -> Res<ThreadView> {
    let (id, _) = project(s)?;
    let settings = assistant_defaults::load(&s.dir, &id).settings();
    let t = Threads::new(&s.dir)
        .create(&id, title.as_deref().unwrap_or("").trim(), settings)
        .map_err(err)?;
    Ok(view(t))
}

pub fn thread_get(s: &AppState, thread: &str) -> Res<ThreadView> {
    let (id, _) = project(s)?;
    Ok(view(Threads::new(&s.dir).get(&id, thread).map_err(err)?))
}

pub fn thread_rename(s: &AppState, thread: &str, title: &str) -> Res<ThreadSummary> {
    let (id, _) = project(s)?;
    Ok(Threads::new(&s.dir)
        .rename(&id, thread, title)
        .map_err(err)?
        .summary())
}

/// Delete the thread and its worktree. A worktree with changes stays and the call fails: the
/// person acts on the result first (`worktree_discard`).
pub fn thread_delete(s: &AppState, thread: &str) -> Res<()> {
    let (id, root) = project(s)?;
    let _busy = Busy::take(thread)?;
    let st = Threads::new(&s.dir);
    let mut t = st.get(&id, thread).map_err(err)?;
    assistant_modes::discard(&s.dir, &root, &mut t, false).map_err(err)?;
    st.delete(&id, thread).map_err(err)
}

/// Remove the worktree of a thread. `force` throws its changes away.
pub fn worktree_discard(s: &AppState, thread: &str, force: bool) -> Res<ThreadView> {
    let (id, root) = project(s)?;
    let _busy = Busy::take(thread)?;
    let st = Threads::new(&s.dir);
    let mut t = st.get(&id, thread).map_err(err)?;
    assistant_modes::discard(&s.dir, &root, &mut t, force).map_err(err)?;
    st.save(&t).map_err(err)?;
    Ok(view(t))
}

pub fn thread_diff(s: &AppState, thread: &str) -> Res<Vec<FileDiff>> {
    let (id, _) = project(s)?;
    let t = Threads::new(&s.dir).get(&id, thread).map_err(err)?;
    t.worktree
        .as_ref()
        .map_or(Ok(Vec::new()), |w| assistant_modes::diff(w).map_err(err))
}

/// The draft and the context stay with the thread when the view changes (REQ-001).
pub fn save_draft(s: &AppState, thread: &str, draft: &str, context: Context) -> Res<()> {
    let (id, _) = project(s)?;
    let st = Threads::new(&s.dir);
    let mut t = st.get(&id, thread).map_err(err)?;
    t.draft = scrub(draft, &secrets(s));
    t.context = context;
    st.save(&t).map_err(err)
}

fn known_runner(id: &str) -> Res<()> {
    shipyard_agents::runner::runner(id)
        .map(|_| ())
        .ok_or_else(|| format!("unknown runner: {id}"))
}

/// New settings. A model or an effort that stays while the runner changes is dropped: it belongs
/// to the old runner (REQ-011).
pub fn settings_set(s: &AppState, thread: &str, mut new: ThreadSettings) -> Res<ThreadView> {
    known_runner(&new.runner)?;
    let (id, _) = project(s)?;
    let _busy = Busy::take(thread)?;
    let st = Threads::new(&s.dir);
    let mut t = st.get(&id, thread).map_err(err)?;
    if new.runner != t.settings.runner {
        if new.model == t.settings.model {
            new.model = None;
        }
        if new.effort == t.settings.effort {
            new.effort = None;
        }
        // Another runner has no session of this one.
        t.session = None;
    }
    // A session belongs to a folder: the project root, or the worktree of an agent thread.
    if new.writes() != t.settings.writes() {
        t.session = None;
    }
    t.settings = new;
    st.save(&t).map_err(err)?;
    Ok(view(t))
}

/// Add a ref to the context only when it resolves (REQ-005). The context is saved.
pub fn ref_add(s: &AppState, thread: &str, text: &str) -> Res<Context> {
    let (id, _) = project(s)?;
    let st = Threads::new(&s.dir);
    let mut t = st.get(&id, thread).map_err(err)?;
    let resolves = resolves(s, text.trim().trim_start_matches('@'));
    t.context.add_ref(text, resolves)?;
    st.save(&t).map_err(err)?;
    Ok(t.context)
}

pub fn ref_remove(s: &AppState, thread: &str, text: &str) -> Res<Context> {
    let (id, _) = project(s)?;
    let st = Threads::new(&s.dir);
    let mut t = st.get(&id, thread).map_err(err)?;
    t.context.remove_ref(text);
    st.save(&t).map_err(err)?;
    Ok(t.context)
}

fn resolves(s: &AppState, text: &str) -> bool {
    matches!(refs::resolve(s, text), Ok(Some(r)) if r.state == State::Resolved)
}

pub fn defaults_get(s: &AppState) -> Res<AssistantDefaults> {
    let (id, _) = project(s)?;
    Ok(assistant_defaults::load(&s.dir, &id))
}

pub fn defaults_set(s: &AppState, d: AssistantDefaults) -> Res<AssistantDefaults> {
    if let Some(r) = &d.runner {
        known_runner(r)?;
    }
    let (id, _) = project(s)?;
    assistant_defaults::save(&s.dir, &id, &d).map_err(err)?;
    Ok(d)
}

/// The models and efforts of each runner. The models are the tier models of Settings /
/// Connections; a runner with none uses its own default.
pub fn options(s: &AppState) -> Res<Vec<RunnerOptions>> {
    Ok(s.agents
        .tiers()?
        .into_iter()
        .map(|t| {
            let mut models: Vec<String> = Vec::new();
            for m in [t.top, t.mid, t.small] {
                if !m.is_empty() && !models.contains(&m) {
                    models.push(m);
                }
            }
            RunnerOptions {
                efforts: efforts(&t.runner),
                window_tokens: window_tokens(&t.runner),
                runner: t.runner,
                models,
            }
        })
        .collect())
}

// ---------------------------------------------------------------- turns

/// What starts a turn.
pub enum Start {
    Send {
        text: String,
        quotes: Vec<Quote>,
        context: Context,
    },
    Grant,
    Retry,
    /// Explain one entity in ask mode, whatever the mode of the thread.
    Explain(String),
}

fn fail_message(raw: &str) -> ChatMessage {
    let (kind, message) = failure(raw);
    ChatMessage::assistant("", MessageState::Failed { kind, message }, now())
}

/// One turn: check the budget, run the runner, save the thread, book the usage. `program` runs in
/// place of the CLI (tests).
pub fn turn(s: &AppState, thread: &str, start: Start, program: Option<PathBuf>) -> Res<TurnResult> {
    let (pid, root) = project(s)?;
    let _busy = Busy::take(thread)?;
    let st = Threads::new(&s.dir);
    let mut t = st.get(&pid, thread).map_err(err)?;
    let secrets = secrets(s);

    // The budget first: at 100 % the turn does not start and the budget is named (REQ-012).
    let gate = s.factory.factory.assistant_gate(&pid, MEMBER);
    if gate.level == BudgetLevel::Spent {
        return Err(format!(
            "The budget {} is spent. A new turn waits for the next budget.",
            gate.budget.unwrap_or_default()
        ));
    }
    let alert = (gate.level == BudgetLevel::Alert)
        .then_some(gate.budget)
        .flatten();

    let (kind, text, quotes, mut mode) = match &start {
        Start::Send {
            text,
            quotes,
            context,
        } => {
            if text.trim().is_empty() {
                return Err("the message is empty".into());
            }
            t.context = context.clone();
            let text = scrub(text, &secrets);
            let quotes: Vec<Quote> = quotes
                .iter()
                .map(|q| Quote {
                    source: scrub(&q.source, &secrets),
                    text: scrub(&q.text, &secrets),
                })
                .collect();
            t.messages
                .push(ChatMessage::user(&text, quotes.clone(), now()));
            if t.title.trim().is_empty() {
                t.title = first_line(&text, 60);
            }
            (TurnKind::Send, text, quotes, t.settings.mode)
        }
        Start::Grant => {
            let Some(MessageState::Waiting { permission }) =
                t.messages.last().map(|m| m.state.clone())
            else {
                return Err("the thread waits for no permission".into());
            };
            if !t.settings.writes() {
                return Err("switch the thread to agent mode to grant a tool".into());
            }
            let (text, quotes) = last_request(&t);
            (TurnKind::Grant(permission), text, quotes, t.settings.mode)
        }
        Start::Retry => {
            if !matches!(
                t.messages.last().map(|m| &m.state),
                Some(MessageState::Failed { .. })
            ) {
                return Err("nothing to retry".into());
            }
            let (text, quotes) = last_request(&t);
            (TurnKind::Retry, text, quotes, t.settings.mode)
        }
        Start::Explain(entity) => {
            let entity = entity.trim().trim_start_matches('@').to_string();
            let request = explain_request(&entity);
            t.messages
                .push(ChatMessage::user(&request, Vec::new(), now()));
            if !resolves(s, &entity) {
                t.messages.push(no_source(&entity));
                t.updated = now();
                st.save(&t).map_err(err)?;
                let message = t.messages.last().cloned().expect("a message");
                return Ok(TurnResult {
                    thread: view(t),
                    message,
                    changed: Vec::new(),
                    alert,
                });
            }
            t.context.selected = Some(entity);
            (TurnKind::Send, request, Vec::new(), AssistantMode::Ask)
        }
    };
    // Explain runs in the project folder with no session, and leaves the thread session as it is.
    let explain = matches!(start, Start::Explain(_));
    if explain {
        mode = AssistantMode::Ask;
    }
    t.updated = now();
    st.save(&t).map_err(err)?;

    // Rules and skills load now, once: a change reaches the next turn (REQ-013).
    let rules = assistant_rules::load(&root).render();
    let mut settings = t.settings.clone();
    settings.mode = mode;
    // Agent mode makes the worktree of the thread on its first turn.
    let mut wt = t.clone();
    wt.settings.mode = mode;
    let dir = assistant_modes::workdir(&s.dir, &root, &mut wt);
    let worktree = wt.worktree;
    let scratch = s
        .dir
        .join("assistant")
        .join(&pid)
        .join("scratch")
        .join(&t.id);
    let out = match dir {
        Ok(dir) => run_turn(TurnInput {
            kind: kind.clone(),
            settings: &settings,
            context: &t.context,
            quotes: &quotes,
            text: &text,
            rules: &rules,
            dir: &dir,
            scratch: &scratch,
            session: t.session.as_deref().filter(|_| !explain),
            granted: &t.granted,
            secrets: &secrets,
            program,
        }),
        Err(e) => shipyard_agents::assistant::TurnOutput {
            message: fail_message(&scrub(&e.to_string(), &secrets)),
            session: t.session.clone(),
        },
    };

    let mut message = out.message;
    // Only refs that resolve stay cited (REQ-016, REQ-017).
    let (body, kept) = keep_resolved(&message.text, |r| resolves(s, r));
    message.text = body;
    message.refs = kept;

    // Save on the thread as it is now: the person may have edited the draft during the turn.
    let mut t = st.get(&pid, thread).map_err(err)?;
    if let TurnKind::Grant(p) = &kind
        && !t.granted.contains(p)
    {
        t.granted.push(p.clone());
    }
    if worktree.is_some() {
        t.worktree = worktree;
    }
    if !explain {
        t.session = out.session;
    }
    t.usage.add(&message.usage);
    t.messages.push(message.clone());
    t.updated = now();
    st.save(&t).map_err(err)?;

    let u = &message.usage;
    if u.input_tokens + u.output_tokens > 0 || u.cost_usd > 0.0 {
        let booked = s.factory.factory.book_assistant(
            &pid,
            MEMBER,
            u.input_tokens.into(),
            u.output_tokens.into(),
            u.cost_usd,
        );
        if let Err(e) = booked {
            eprintln!("assistant budget: {e}");
        }
    }
    let changed = t
        .worktree
        .as_ref()
        .and_then(|w| assistant_modes::diff(w).ok())
        .unwrap_or_default();
    Ok(TurnResult {
        thread: view(t),
        message,
        changed,
        alert,
    })
}

fn last_request(t: &Thread) -> (String, Vec<Quote>) {
    t.messages
        .iter()
        .rev()
        .find(|m| m.role == ChatRole::User)
        .map_or((String::new(), Vec::new()), |m| {
            (m.text.clone(), m.quotes.clone())
        })
}

pub fn send(
    s: &AppState,
    thread: &str,
    text: String,
    quotes: Vec<Quote>,
    context: Context,
) -> Res<TurnResult> {
    turn(
        s,
        thread,
        Start::Send {
            text,
            quotes,
            context,
        },
        None,
    )
}

pub fn grant(s: &AppState, thread: &str) -> Res<TurnResult> {
    turn(s, thread, Start::Grant, None)
}

pub fn retry(s: &AppState, thread: &str) -> Res<TurnResult> {
    turn(s, thread, Start::Retry, None)
}

pub fn explain(s: &AppState, thread: &str, entity: &str) -> Res<TurnResult> {
    turn(s, thread, Start::Explain(entity.into()), None)
}

// ---------------------------------------------------------------- send to factory

fn thread_row(s: &AppState, thread: &str) -> Res<(Thread, Row)> {
    let (id, _) = project(s)?;
    let t = Threads::new(&s.dir).get(&id, thread).map_err(err)?;
    let row = work_item_row(&t, &secrets(s))?;
    Ok((t, row))
}

/// The confirm step of a work item: what would be created. It sends nothing (REQ-014).
pub fn to_factory_preview(s: &AppState, thread: &str) -> Res<DiffRow> {
    let (_, row) = thread_row(s, thread)?;
    crate::work::item_preview(s, row)
}

/// Create the work item after the click. With a `workflow`, also label it `wf:<id>` so the factory
/// claims it (REQ-015). Never starts a run. A workflow that the project does not have is refused
/// before anything is written.
pub fn to_factory(
    s: &AppState,
    thread: &str,
    workflow: Option<String>,
    click: bool,
) -> Res<FactorySend> {
    crate::work::need_click(s, click)?;
    let label = match &workflow {
        Some(id) => {
            let label = run_label(id)?;
            if !crate::factory::workflows(s)?.iter().any(|w| w.id == *id) {
                return Err(format!("no workflow `{id}` in this project"));
            }
            Some(label)
        }
        None => None,
    };
    let (_, row) = thread_row(s, thread)?;
    create_and_mark(s, row, workflow, label, click)
}

fn create_and_mark(
    s: &AppState,
    row: Row,
    workflow: Option<String>,
    label: Option<String>,
    click: bool,
) -> Res<FactorySend> {
    let item = crate::work::item_create(s, row, click)?;
    if let Some(e) = &item.error {
        return Err(e.clone());
    }
    if let (Some(id), Some(key)) = (&workflow, &item.key) {
        crate::work::mark_for_run(s, key, id, click)?;
    }
    Ok(FactorySend { item, label })
}

/// Hand the conflicted files to the factory: one work item that names them, labelled `wf:<id>` so
/// the factory claims it. Legacy has an agent button only (`conflict-dialog.tsx`). A second click
/// finds the item by its ref `doc:conflict/merge` and creates none.
pub fn conflict_to_factory(s: &AppState, workflow: String, click: bool) -> Res<FactorySend> {
    crate::work::need_click(s, click)?;
    let label = run_label(&workflow)?;
    if !crate::factory::workflows(s)?
        .iter()
        .any(|w| w.id == workflow)
    {
        return Err(format!("no workflow `{workflow}` in this project"));
    }
    let files: Vec<String> = crate::commands::code::conflicts(s)?
        .into_iter()
        .map(|c| c.path)
        .collect();
    if files.is_empty() {
        return Err("no file is in conflict".into());
    }
    let list: String = files.iter().map(|f| format!("- {f}\n")).collect();
    let row = Row {
        reference: "doc:conflict/merge".into(),
        kind: RowKind::Story,
        title: format!("Resolve the merge conflict in {} file(s)", files.len()),
        description: scrub(
            &format!(
                "Resolve the conflict markers. Keep the intent of both sides.\n\nFiles:\n{list}"
            ),
            &secrets(s),
        ),
        days: None,
        parent: None,
    };
    create_and_mark(s, row, Some(workflow), Some(label), click)
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_agents::fake::program;
    use shipyard_core::project::ProjectFile;
    use shipyard_http::fake::FakeHttp;
    use shipyard_secrets::MemoryStore;
    use std::sync::Arc;

    use crate::connections::Connections;

    struct Fx {
        data: tempfile::TempDir,
        repo: tempfile::TempDir,
        s: AppState,
        pid: String,
    }

    fn fx() -> Fx {
        let repo = tempfile::tempdir().unwrap();
        shipyard_git::project::init(repo.path()).unwrap();
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
        Fx { data, repo, s, pid }
    }

    fn reply(f: &Fx, text: &str) -> PathBuf {
        let body = format!(
            r#"cat > /dev/null
echo '{{"type":"system","session_id":"s1"}}'
echo '{{"type":"assistant","message":{{"content":[{{"type":"text","text":"{text}"}}]}}}}'
echo '{{"type":"result","subtype":"success","is_error":false,"session_id":"s1","total_cost_usd":0.1,"usage":{{"input_tokens":30,"output_tokens":12}}}}'"#
        );
        program(f.data.path(), "fake-claude", &body)
    }

    fn send_text(f: &Fx, id: &str, text: &str, program: PathBuf) -> Res<TurnResult> {
        turn(
            &f.s,
            id,
            Start::Send {
                text: text.into(),
                quotes: vec![],
                context: Context::default(),
            },
            Some(program),
        )
    }

    #[test]
    fn threads_belong_to_the_project_live_in_app_data_and_keep_their_turns() {
        let f = fx();
        let t = thread_create(&f.s, None).unwrap().thread;
        assert_eq!(t.settings.runner, "claude");
        assert!(threads_list(&f.s).unwrap().iter().any(|x| x.id == t.id));
        let bin = reply(&f, &format!("See project:{} and wi:NONE-1.", f.pid));
        let r = send_text(&f, &t.id, "What is this?", bin).unwrap();
        assert_eq!(r.message.state, MessageState::Done);
        // Only the ref that resolves stays cited; the other one is cut out of the text.
        assert_eq!(
            r.message.refs,
            [format!("project:{}", f.pid)],
            "{:?}",
            r.message
        );
        assert!(r.message.text.contains(NOT_FOUND) && !r.message.text.contains("NONE-1"));
        assert_eq!(
            (r.thread.gauge.used_tokens, r.thread.gauge.window_tokens),
            (42, 200_000)
        );
        assert!(r.thread.gauge.quotas.is_empty());
        let t = thread_get(&f.s, &t.id).unwrap().thread;
        assert_eq!(
            (t.messages.len(), t.session.as_deref(), t.title.as_str()),
            (2, Some("s1"), "What is this?")
        );
        assert_eq!(t.usage.output_tokens, 12);
        // Nothing of the thread is in the repository.
        let in_repo: Vec<_> = std::fs::read_dir(f.repo.path())
            .unwrap()
            .filter_map(|e| e.ok()?.file_name().into_string().ok())
            .collect();
        assert!(
            in_repo
                .iter()
                .all(|n| !n.contains("assistant") && !n.contains("th-")),
            "{in_repo:?}"
        );
        // The draft and the context survive.
        let ctx = Context {
            view: "work/board".into(),
            ..Context::default()
        };
        save_draft(&f.s, &t.id, "typing", ctx).unwrap();
        let t = thread_get(&f.s, &t.id).unwrap().thread;
        assert_eq!(
            (t.draft.as_str(), t.context.view.as_str()),
            ("typing", "work/board")
        );
        thread_delete(&f.s, &t.id).unwrap();
        assert!(threads_list(&f.s).unwrap().is_empty());
    }

    #[test]
    fn a_ref_joins_the_context_only_when_it_resolves_and_a_runner_switch_drops_the_model() {
        let f = fx();
        let t = thread_create(&f.s, None).unwrap().thread;
        assert!(ref_add(&f.s, &t.id, "wi:NONE-1").is_err());
        assert!(ref_add(&f.s, &t.id, "nonsense").is_err());
        let c = ref_add(&f.s, &t.id, &format!("@project:{}", f.pid)).unwrap();
        assert_eq!(c.refs, [format!("project:{}", f.pid)]);
        assert!(ref_remove(&f.s, &t.id, &c.refs[0]).unwrap().refs.is_empty());

        let mut s = t.settings.clone();
        s.model = Some("opus".into());
        let v = settings_set(&f.s, &t.id, s.clone()).unwrap();
        assert_eq!(v.thread.settings.model.as_deref(), Some("opus"));
        s.runner = "codex".into();
        let v = settings_set(&f.s, &t.id, s).unwrap();
        assert_eq!(
            (
                v.thread.settings.runner.as_str(),
                v.thread.settings.model.clone()
            ),
            ("codex", None)
        );
        let mut bad = v.thread.settings.clone();
        bad.runner = "nope".into();
        assert!(settings_set(&f.s, &t.id, bad).is_err());
    }

    #[test]
    fn explain_with_no_source_says_so_and_runs_nothing() {
        let f = fx();
        let t = thread_create(&f.s, None).unwrap().thread;
        let r = explain(&f.s, &t.id, "spec:nothing#REQ-999").unwrap();
        assert_eq!(
            r.message.text,
            "No source for spec:nothing#REQ-999 in this project."
        );
        assert!(r.message.refs.is_empty() && r.message.trace.is_empty());
        assert_eq!(r.thread.thread.session, None);
    }

    #[test]
    fn explain_runs_in_ask_mode_even_when_the_thread_is_in_agent_mode() {
        let f = fx();
        let mut t = thread_create(&f.s, None).unwrap().thread;
        t.settings.mode = AssistantMode::Agent;
        settings_set(&f.s, &t.id, t.settings.clone()).unwrap();
        let bin = reply(&f, "It is the project.");
        let entity = format!("project:{}", f.pid);
        let r = turn(&f.s, &t.id, Start::Explain(entity), Some(bin)).unwrap();
        assert_eq!(r.message.state, MessageState::Done);
        assert!(
            r.thread.thread.worktree.is_none(),
            "ask mode makes no worktree"
        );
        assert_eq!(
            r.thread.thread.settings.mode,
            AssistantMode::Agent,
            "the thread keeps its mode"
        );
    }

    #[test]
    fn a_grant_needs_a_wait_and_a_retry_needs_a_failure() {
        let f = fx();
        let t = thread_create(&f.s, None).unwrap().thread;
        assert!(grant(&f.s, &t.id).is_err());
        assert!(retry(&f.s, &t.id).is_err());
        assert!(send(&f.s, &t.id, " ".into(), vec![], Context::default()).is_err());
    }

    #[test]
    fn defaults_set_the_next_thread_and_the_options_follow_the_runners() {
        let f = fx();
        let d = AssistantDefaults {
            runner: Some("codex".into()),
            mode: Some(AssistantMode::Plan),
            ..Default::default()
        };
        defaults_set(&f.s, d.clone()).unwrap();
        assert_eq!(defaults_get(&f.s).unwrap(), d);
        let t = thread_create(&f.s, Some("x".into())).unwrap().thread;
        assert_eq!(
            (t.settings.runner.as_str(), t.settings.mode),
            ("codex", AssistantMode::Plan)
        );
        assert!(
            defaults_set(
                &f.s,
                AssistantDefaults {
                    runner: Some("nope".into()),
                    ..Default::default()
                }
            )
            .is_err()
        );
        let o = options(&f.s).unwrap();
        let claude = o.iter().find(|r| r.runner == "claude").unwrap();
        assert_eq!(claude.models, ["opus", "sonnet", "haiku"]);
        assert!(!claude.efforts.is_empty());
    }

    #[test]
    fn a_conflict_hand_off_needs_a_click_a_known_workflow_and_a_conflict() {
        let f = fx();
        assert!(conflict_to_factory(&f.s, "w".into(), false).is_err());
        assert!(conflict_to_factory(&f.s, "../x".into(), true).is_err());
        let e = conflict_to_factory(&f.s, "nope".into(), true).unwrap_err();
        assert!(e.contains("no workflow"), "{e}");
    }

    #[test]
    fn send_to_factory_needs_a_click_a_message_and_a_known_workflow() {
        let f = fx();
        let t = thread_create(&f.s, None).unwrap().thread;
        assert!(to_factory(&f.s, &t.id, None, false).is_err());
        assert!(
            to_factory_preview(&f.s, &t.id).is_err(),
            "an empty thread has nothing to send"
        );
        assert!(to_factory(&f.s, &t.id, Some("../x".into()), true).is_err());
        assert!(to_factory(&f.s, &t.id, Some("nope".into()), true).is_err());
    }

    #[test]
    fn a_tracker_error_is_an_error_not_a_send() {
        use crate::work::tests::{NO_ISSUES, fx as tracker_fx};
        let f = tracker_fx();
        let t = thread_create(&f.s, None).unwrap().thread;
        let (pid, _) = project(&f.s).unwrap();
        let st = Threads::new(&f.s.dir);
        let mut th = st.get(&pid, &t.id).unwrap();
        th.messages
            .push(ChatMessage::user("Plan the login", vec![], 1));
        st.save(&th).unwrap();
        f.http.get("/rest/api/2/search/jql", 200, NO_ISSUES).post(
            "/rest/api/2/issue",
            "",
            400,
            r#"{"errors":{"summary":"bad"}}"#,
        );
        let e = to_factory(&f.s, &t.id, None, true).unwrap_err();
        assert!(e.contains("400"), "{e}");
    }

    #[test]
    fn a_mode_change_across_the_worktree_drops_the_session_and_explain_uses_none() {
        let f = fx();
        let t = thread_create(&f.s, None).unwrap().thread;
        send_text(&f, &t.id, "Hi", reply(&f, "Hello.")).unwrap();
        let mut s = t.settings.clone();
        s.mode = AssistantMode::Plan;
        let v = settings_set(&f.s, &t.id, s.clone()).unwrap();
        assert_eq!(
            v.thread.session.as_deref(),
            Some("s1"),
            "ask to plan: same folder"
        );
        s.mode = AssistantMode::Agent;
        let v = settings_set(&f.s, &t.id, s.clone()).unwrap();
        assert_eq!(v.thread.session, None, "plan to agent: the worktree");
        // A session of the worktree: Explain runs in the project folder and does not resume it.
        let mut th = Threads::new(&f.s.dir).get(&f.pid, &t.id).unwrap();
        th.session = Some("wt".into());
        Threads::new(&f.s.dir).save(&th).unwrap();
        let rec = f.data.path().join("argv");
        let body = format!(
            "printf '%s\\n' \"$@\" > '{}'\ncat > /dev/null\necho '{{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"session_id\":\"ex\",\"usage\":{{}}}}'",
            rec.display()
        );
        let bin = program(f.data.path(), "fake-explain", &body);
        let entity = format!("project:{}", f.pid);
        turn(&f.s, &t.id, Start::Explain(entity), Some(bin)).unwrap();
        let argv = std::fs::read_to_string(&rec).unwrap();
        assert!(!argv.contains("--resume"), "{argv}");
        let v = thread_get(&f.s, &t.id).unwrap();
        assert_eq!(
            v.thread.session.as_deref(),
            Some("wt"),
            "the thread session stays"
        );
        s.mode = AssistantMode::Ask;
        let v = settings_set(&f.s, &t.id, s).unwrap();
        assert_eq!(v.thread.session, None, "agent to ask: the project folder");
    }

    #[test]
    fn a_connection_secret_never_stays_in_the_draft() {
        use crate::connections::{ConnectionDraft, ConnectionGroup, ConnectionKind};
        let f = fx();
        let c =
            f.s.connections
                .add(ConnectionDraft {
                    name: "Tracker".into(),
                    group: ConnectionGroup::Tracker,
                    kind: ConnectionKind::GitHub,
                    url: "https://github.com".into(),
                    user: None,
                })
                .unwrap();
        f.s.connections
            .set_secret(&c.id, shipyard_secrets::Secret::new("tok-fake-secret"))
            .unwrap();
        assert!(secrets(&f.s).contains(&"tok-fake-secret".to_string()));
        let t = thread_create(&f.s, None).unwrap().thread;
        save_draft(&f.s, &t.id, "use tok-fake-secret here", Context::default()).unwrap();
        let t = thread_get(&f.s, &t.id).unwrap().thread;
        assert_eq!(t.draft, "use *** here");
    }

    #[test]
    fn a_turn_books_under_the_assistant_member_with_input_plus_output_tokens() {
        let f = crate::factory::tests::fx(shipyard_core::pickup::Writes::default());
        let t = thread_create(&f.s, None).unwrap().thread;
        let tmp = tempfile::tempdir().unwrap();
        let bin = program(
            tmp.path(),
            "fake-claude",
            r#"cat > /dev/null
echo '{"type":"result","subtype":"success","is_error":false,"session_id":"s1","usage":{"input_tokens":30,"output_tokens":12,"cache_read_input_tokens":500}}'"#,
        );
        turn(
            &f.s,
            &t.id,
            Start::Send {
                text: "Hi".into(),
                quotes: vec![],
                context: Context::default(),
            },
            Some(bin),
        )
        .unwrap();
        let (_, members) = f.s.factory.factory.usage(&f.id);
        let rows: Vec<_> = members.iter().map(|m| (m.key.as_str(), m.tokens)).collect();
        assert_eq!(
            rows,
            [("assistant", 42)],
            "the cache is not booked, and no `` member"
        );
    }
}
