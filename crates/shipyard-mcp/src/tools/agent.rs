//! The eight agent tools (factory REQ-016 to REQ-020). The tools run no engine logic. Each valid
//! call becomes one typed [`AgentEvent`] for [`AgentEvents`], and the answer of the engine goes back
//! to the agent. The run and the step come from the session of the token, never from the input.

use crate::schema;
use crate::session::Binding;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use shipyard_core::question::{MAX_OPTIONS, MIN_OPTIONS};

/// The tool names, in the order that `tools/list` gives them.
pub const NAMES: [&str; 8] = [
    "ask_question",
    "post_progress",
    "handoff",
    "message",
    "spawn_subtask",
    "report",
    "read_ticket",
    "read_ref",
];

/// The engine or the app implements this. `Err` is a message for the agent. The engine owns every
/// rule that needs state: the run state, the `for_each` and `max_parallel` limits, the ticket mirror.
pub trait AgentEvents: Send + Sync {
    fn emit(&self, who: &Binding, event: AgentEvent) -> Result<Value, String>;
}

#[derive(Debug, Clone, PartialEq)]
pub enum AgentEvent {
    AskQuestion(AskQuestion),
    PostProgress(PostProgress),
    Handoff(Handoff),
    Message(Message),
    SpawnSubtask(SpawnSubtask),
    Report(Report),
    ReadTicket(ReadTicket),
    ReadRef(ReadRef),
}

impl AgentEvent {
    pub fn tool(&self) -> &'static str {
        NAMES[match self {
            Self::AskQuestion(_) => 0,
            Self::PostProgress(_) => 1,
            Self::Handoff(_) => 2,
            Self::Message(_) => 3,
            Self::SpawnSubtask(_) => 4,
            Self::Report(_) => 5,
            Self::ReadTicket(_) => 6,
            Self::ReadRef(_) => 7,
        }]
    }
}

/// A ticket question is for the ticket thread. A spec question also gets a RAID file (needs `spec`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionKind {
    #[default]
    Ticket,
    Spec,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AskQuestion {
    pub question: String,
    pub options: Vec<String>,
    /// From 1.
    pub recommended: u32,
    #[serde(default)]
    pub free_text: bool,
    #[serde(default)]
    pub kind: QuestionKind,
    pub spec: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PostProgress {
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Handoff {
    pub role: String,
    pub summary: String,
    /// The step that takes the work, when the role has more than one step.
    pub step: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Message {
    /// A step id of this run, or `person`.
    pub to: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SpawnSubtask {
    pub title: String,
    pub brief: String,
    pub role: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Done,
    Partial,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Report {
    pub outcome: Outcome,
    pub summary: String,
    #[serde(default)]
    pub refs: Vec<String>,
    /// Named output fields for the next steps, such as the list `tasks` of a plan.
    pub output: Option<Map<String, Value>>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadTicket {
    #[serde(rename = "ref")]
    pub reference: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadRef {
    #[serde(rename = "ref")]
    pub reference: String,
}

fn text(max: u32) -> Value {
    json!({ "type": "string", "minLength": 1, "maxLength": max })
}

/// The description (Simplified Technical English) and the input schema of a tool.
fn def(name: &str) -> (&'static str, Value) {
    let object = |required: &[&str], props: Value| json!({ "type": "object", "properties": props, "required": required, "additionalProperties": false });
    match name {
        "ask_question" => (
            "Ask the person one question when a decision belongs to a person. Give 2 to 4 options and the number of the recommended option. The run waits until a person answers. Do not ask when you can decide.",
            object(
                &["question", "options", "recommended"],
                json!({
                    "question": text(500),
                    "options": { "type": "array", "minItems": MIN_OPTIONS, "maxItems": MAX_OPTIONS, "items": text(200) },
                    "recommended": { "type": "integer", "minimum": 1, "maximum": MAX_OPTIONS },
                    "free_text": { "type": "boolean" },
                    "kind": { "type": "string", "enum": ["ticket", "spec"] },
                    "spec": text(200),
                }),
            ),
        ),
        "post_progress" => (
            "Show a short progress text to the person. Use it after each major part of your work. The run does not stop.",
            object(&["text"], json!({ "text": text(280) })),
        ),
        "handoff" => (
            "Pass the work to another role in the same run. Write the summary that the other role needs to continue.",
            object(
                &["role", "summary"],
                json!({ "role": text(64), "summary": text(4000), "step": text(64) }),
            ),
        ),
        "message" => (
            "Send a text to a step of this run, or to the person with the target person. The step reads the text at its next turn. Send facts, not chat.",
            object(
                &["to", "text"],
                json!({ "to": text(64), "text": text(2000) }),
            ),
        ),
        "spawn_subtask" => (
            "Start a child task with its own role. Write a title and a full brief. The engine refuses the call when the limits of your step are reached.",
            object(
                &["title", "brief", "role"],
                json!({ "title": text(200), "brief": text(8000), "role": text(64) }),
            ),
        ),
        "report" => (
            "Send the final report of your step. Give the outcome (done, partial or failed), a summary and the refs of your artifacts. Put lists for the next steps in output. The step ends when you call this tool.",
            object(
                &["outcome", "summary"],
                json!({
                    "outcome": { "type": "string", "enum": ["done", "partial", "failed"] },
                    "summary": text(8000),
                    "refs": { "type": "array", "maxItems": 50, "items": text(200) },
                    "output": { "type": "object" },
                }),
            ),
        ),
        "read_ticket" => (
            "Read the mirrored ticket of a ref that starts with wi:. This tool changes nothing. An unknown ticket gives an error.",
            object(&["ref"], json!({ "ref": text(200) })),
        ),
        _ => (
            "Read the title, the state, the location and the backlinks of any ref. This tool changes nothing. An unknown ref gives an error.",
            object(&["ref"], json!({ "ref": text(200) })),
        ),
    }
}

/// The `tools/list` entry of each tool that `allowed` names.
pub fn definitions(allowed: impl Fn(&str) -> bool) -> Vec<Value> {
    NAMES
        .into_iter()
        .filter(|n| allowed(n))
        .map(|name| {
            let (description, schema) = def(name);
            json!({ "name": name, "description": description, "inputSchema": schema })
        })
        .collect()
}

fn filled(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field}: needs text"));
    }
    Ok(())
}

/// Check the input of `name` and make its event. `report_max` is the size cap of a report in bytes.
pub fn parse(name: &str, input: &Value, report_max: usize) -> Result<AgentEvent, String> {
    if !NAMES.contains(&name) {
        return Err(format!("unknown tool: {name}"));
    }
    schema::check(&def(name).1, input)?;
    let bad = |e: serde_json::Error| e.to_string();
    let copy = || input.clone();
    Ok(match name {
        "ask_question" => {
            let a: AskQuestion = serde_json::from_value(copy()).map_err(bad)?;
            filled("question", &a.question)?;
            if let Some(i) = a.options.iter().position(|o| o.trim().is_empty()) {
                return Err(format!("options[{i}]: needs text"));
            }
            if a.recommended as usize > a.options.len() {
                return Err("recommended: must be the number of one option".into());
            }
            match (a.kind, a.spec.as_deref()) {
                (QuestionKind::Spec, Some(s)) if s.starts_with("spec:") => {}
                (QuestionKind::Spec, _) => {
                    return Err("spec: a spec question needs a ref that starts with spec:".into());
                }
                (QuestionKind::Ticket, Some(_)) => {
                    return Err(
                        "spec: only a spec question has a spec ref (set kind to spec)".into(),
                    );
                }
                (QuestionKind::Ticket, None) => {}
            }
            AgentEvent::AskQuestion(a)
        }
        "post_progress" => {
            let p: PostProgress = serde_json::from_value(copy()).map_err(bad)?;
            filled("text", &p.text)?;
            AgentEvent::PostProgress(p)
        }
        "handoff" => {
            let h: Handoff = serde_json::from_value(copy()).map_err(bad)?;
            filled("role", &h.role)?;
            filled("summary", &h.summary)?;
            AgentEvent::Handoff(h)
        }
        "message" => {
            let m: Message = serde_json::from_value(copy()).map_err(bad)?;
            filled("to", &m.to)?;
            filled("text", &m.text)?;
            AgentEvent::Message(m)
        }
        "spawn_subtask" => {
            let s: SpawnSubtask = serde_json::from_value(copy()).map_err(bad)?;
            filled("title", &s.title)?;
            filled("brief", &s.brief)?;
            filled("role", &s.role)?;
            AgentEvent::SpawnSubtask(s)
        }
        "report" => {
            let r: Report = serde_json::from_value(copy()).map_err(bad)?;
            filled("summary", &r.summary)?;
            let size = input.to_string().len();
            if size > report_max {
                return Err(format!("report: {size} bytes, the limit is {report_max}"));
            }
            AgentEvent::Report(r)
        }
        "read_ticket" => {
            let t: ReadTicket = serde_json::from_value(copy()).map_err(bad)?;
            if !t.reference.starts_with("wi:") {
                return Err("ref: a ticket ref starts with wi:".into());
            }
            AgentEvent::ReadTicket(t)
        }
        _ => {
            let r: ReadRef = serde_json::from_value(copy()).map_err(bad)?;
            filled("ref", &r.reference)?;
            AgentEvent::ReadRef(r)
        }
    })
}
