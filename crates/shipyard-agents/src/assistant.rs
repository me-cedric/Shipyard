//! One assistant turn on the runner layer of the factory (spec `assistant`, REQ-006, REQ-010,
//! REQ-011, REQ-018, REQ-020). [`run_turn`] builds the prompt, starts the runner of the thread,
//! reads its events into one [`ChatMessage`] and never fails: a failure is a message with a state.
//!
//! - A tool result that says a permission was refused ends the turn as `Waiting`. A grant runs the
//!   turn again with the session resumed and the tool allowed. It never sends the first request again.
//! - A retry resumes the session too, so edits that are already in the files are not replayed.
//! - Every text passes through the secret filter.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use shipyard_core::assistant::{
    ChatMessage, ChatRole, Context, MessageState, Quote, ThreadSettings, TraceStep, Usage, failure,
    is_denial, prompt, scrub,
};

use crate::assistant_modes::run_spec;
use crate::runner::{CancelHandle, Event, Recv, runner, start};

/// No event for this long ends the turn.
const IDLE: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnKind {
    /// The person sent a request.
    Send,
    /// The person granted this tool after a denial.
    Grant(String),
    /// The person retries after a failure.
    Retry,
}

pub struct TurnInput<'a> {
    pub kind: TurnKind,
    pub settings: &'a ThreadSettings,
    pub context: &'a Context,
    pub quotes: &'a [Quote],
    /// The request of the person. A grant and a retry with a session do not send it again.
    pub text: &'a str,
    /// The loaded rules, as text (`assistant_rules`). Loaded before the turn starts.
    pub rules: &'a str,
    /// The folder that the runner works in (`assistant_modes::workdir`).
    pub dir: &'a Path,
    /// A folder outside `dir` for the files of the runner.
    pub scratch: &'a Path,
    pub session: Option<&'a str>,
    /// Tools granted before in this thread.
    pub granted: &'a [String],
    /// Values that must not reach a prompt, a message or a log.
    pub secrets: &'a [String],
    /// Run this program in place of the CLI. Tests use it.
    pub program: Option<PathBuf>,
}

pub struct TurnOutput {
    pub message: ChatMessage,
    /// The session to keep: the new one, else the one that went in.
    pub session: Option<String>,
}

fn now() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as u32)
}

fn failed(
    raw: &str,
    secrets: &[String],
    text: String,
    trace: Vec<TraceStep>,
    usage: Usage,
) -> ChatMessage {
    let (kind, message) = failure(&scrub(raw, secrets));
    ChatMessage {
        role: ChatRole::Assistant,
        text,
        quotes: Vec::new(),
        refs: Vec::new(),
        trace,
        state: MessageState::Failed { kind, message },
        usage,
        at: now(),
    }
}

pub fn run_turn(i: TurnInput) -> TurnOutput {
    run_turn_with(i, &|_| {})
}

/// Like [`run_turn`]. `on_start` gets the kill switch once the process runs. A cancelled turn
/// ends as `Done` and keeps the text that came before.
pub fn run_turn_with(i: TurnInput, on_start: &dyn Fn(CancelHandle)) -> TurnOutput {
    run_turn_live(i, on_start, &|_| {})
}

/// Like [`run_turn_with`]. `on_step` gets the trace so far after each tool call and result.
pub fn run_turn_live(
    i: TurnInput,
    on_start: &dyn Fn(CancelHandle),
    on_step: &dyn Fn(&[TraceStep]),
) -> TurnOutput {
    let keep = i.session.map(String::from);
    let resumed = i.session.is_some() && i.kind != TurnKind::Send;
    let request = match (&i.kind, resumed) {
        (TurnKind::Grant(tool), true) => {
            format!("Permission granted for {tool}. Continue the work from where it stopped.")
        }
        (TurnKind::Retry, true) => "Continue from where the last turn stopped. Do not repeat an edit that is already in the files.".to_string(),
        _ => {
            let quotes: Vec<Quote> = i
                .quotes
                .iter()
                .map(|q| Quote {
                    source: scrub(&q.source, i.secrets),
                    text: scrub(&q.text, i.secrets),
                })
                .collect();
            prompt(i.settings.mode, i.rules, i.context, &quotes, &scrub(i.text, i.secrets))
        }
    };
    let mut granted = i.granted.to_vec();
    if let TurnKind::Grant(t) = &i.kind
        && !granted.contains(t)
    {
        granted.push(t.clone());
    }
    let out = |message| TurnOutput {
        message,
        session: keep.clone(),
    };
    let Some(r) = runner(&i.settings.runner) else {
        let raw = format!("unknown runner: {}", i.settings.runner);
        return out(failed(
            &raw,
            i.secrets,
            String::new(),
            vec![],
            Usage::default(),
        ));
    };
    if let Err(e) = std::fs::create_dir_all(i.scratch) {
        return out(failed(
            &e.to_string(),
            i.secrets,
            String::new(),
            vec![],
            Usage::default(),
        ));
    }
    let mut spec = run_spec(i.settings, &granted, request, i.dir, i.scratch, i.session);
    spec.program = i.program.clone();
    let run = match start(&*r, spec) {
        Ok(run) => run,
        Err(e) => {
            return out(failed(
                &e.to_string(),
                i.secrets,
                String::new(),
                vec![],
                Usage::default(),
            ));
        }
    };

    on_start(run.cancel_handle());
    let (mut texts, mut trace, mut usage) = (Vec::new(), Vec::<TraceStep>::new(), Usage::default());
    let (mut session, mut error, mut denied) = (keep.clone(), None::<String>, None::<String>);
    let mut open: HashMap<String, (usize, Instant)> = HashMap::new();
    loop {
        let ev = match run.recv_timeout(IDLE) {
            Recv::Event(e) => e,
            Recv::Idle => {
                run.cancel();
                error.get_or_insert_with(|| "The runner was silent for ten minutes.".into());
                break;
            }
            Recv::Done => break,
        };
        match ev {
            Event::Session { id } => session = Some(id),
            Event::Text { text } => texts.push(scrub(&text, i.secrets)),
            Event::ToolCall { id, name, input } => {
                open.insert(id, (trace.len(), Instant::now()));
                trace.push(TraceStep {
                    tool: scrub(&name, i.secrets),
                    target: scrub(&input, i.secrets),
                    ms: 0,
                });
                on_step(&trace);
            }
            Event::ToolResult { id, ok, output } => {
                let at = open.remove(&id);
                if let Some((n, t)) = at {
                    trace[n].ms = t.elapsed().as_millis().min(u32::MAX as u128) as u32;
                }
                if !ok && is_denial(&output) && denied.is_none() {
                    let tool = at.map(|(n, _)| trace[n].tool.clone());
                    denied = Some(tool.unwrap_or_else(|| "tool".into()));
                }
                on_step(&trace);
            }
            Event::Usage {
                input_tokens,
                output_tokens,
                cached_tokens,
                cost_usd,
            } => {
                usage.add(&Usage {
                    input_tokens: input_tokens.min(u32::MAX as u64) as u32,
                    output_tokens: output_tokens.min(u32::MAX as u64) as u32,
                    cached_tokens: cached_tokens.min(u32::MAX as u64) as u32,
                    cost_usd: cost_usd.unwrap_or(0.0),
                });
            }
            Event::Error { message } => {
                error.get_or_insert(message);
            }
            Event::Turn | Event::Exit { .. } => {}
        }
    }
    // A call with no result yet ends with the turn.
    for (n, t) in open.into_values() {
        trace[n].ms = t.elapsed().as_millis().min(u32::MAX as u128) as u32;
    }
    let text = texts.join("\n\n");
    let message = match (error, denied) {
        (Some(raw), _) => failed(&raw, i.secrets, text, trace, usage),
        (None, Some(permission)) => ChatMessage {
            role: ChatRole::Assistant,
            text,
            quotes: Vec::new(),
            refs: Vec::new(),
            trace,
            state: MessageState::Waiting { permission },
            usage,
            at: now(),
        },
        (None, None) => ChatMessage {
            role: ChatRole::Assistant,
            text,
            quotes: Vec::new(),
            refs: Vec::new(),
            trace,
            state: MessageState::Done,
            usage,
            at: now(),
        },
    };
    TurnOutput { message, session }
}
