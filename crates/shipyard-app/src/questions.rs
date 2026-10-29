//! The questions of the runs and the messages that agents leave for the person (spec
//! `questions-loop` T011, REQ-008, REQ-011, REQ-015, REQ-020; `factory` REQ-019).
//!
//! The engine owns the rules: the first answer wins, an unclear reply waits for a choice, an
//! answer in the Inbox resumes the run even when the comment or the ticket move is still an
//! approval. These functions only read the engine and pass a choice to it.
//!
//! An answer that a person gives in the Inbox posts no extra comment: the question comment is the
//! one tracker write of the loop, and a later reply on the tracker is logged as late.

use serde::Serialize;
use shipyard_core::question::{Choice, Question};
use specta::Type;
use tauri::AppHandle;

use crate::commands::sync::active;
use crate::commands::{AppState, Res, blocking};

/// A question with the run that asked it (`questions-loop` REQ-020).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QuestionView {
    pub run: String,
    /// The ticket of the run.
    pub key: String,
    pub title: String,
    pub question: Question,
}

/// The questions of the runs of the active project, open ones first, oldest first.
pub fn questions(s: &AppState) -> Res<Vec<QuestionView>> {
    let Some(a) = active(s)? else {
        return Ok(Vec::new());
    };
    let f = &s.factory.factory;
    let runs = f.runs();
    let mut out: Vec<QuestionView> = f
        .questions()
        .into_iter()
        .filter_map(|(run, question)| {
            let r = runs
                .iter()
                .find(|r| r.id == run && r.project == a.entry.id)?;
            Some(QuestionView {
                key: r.key.clone(),
                title: r.title.clone(),
                run,
                question,
            })
        })
        .collect();
    // Stable: the order of the engine stays inside each group.
    out.sort_by_key(|q| q.question.state != shipyard_core::question::QuestionState::Open);
    Ok(out)
}

/// A choice from the card: an option, or free text when the question allows it. An unclear
/// reply on the tracker is settled the same way. Resumes the run when no question is left open.
pub fn answer(s: &AppState, run: &str, id: &str, choice: Choice) -> Res<()> {
    let out = s.factory.factory.answer(run, id, choice);
    s.factory.publish();
    out
}

/// A message that an agent left for the person (`message` to `person`).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MessageView {
    pub run: String,
    /// The number of the message in its run, from 0. `message_read` takes it.
    pub n: u32,
    pub key: String,
    pub title: String,
    /// The step or child that wrote it.
    pub from: String,
    pub text: String,
    /// Unix seconds.
    pub at: f64,
    pub read: bool,
}

pub fn messages(s: &AppState) -> Res<Vec<MessageView>> {
    let Some(a) = active(s)? else {
        return Ok(Vec::new());
    };
    let f = &s.factory.factory;
    let runs = f.runs();
    let mut count = std::collections::HashMap::<String, u32>::new();
    Ok(f.messages()
        .into_iter()
        .filter_map(|(run, m)| {
            let n = count.entry(run.clone()).or_default();
            let at = *n;
            *n += 1;
            let r = runs
                .iter()
                .find(|r| r.id == run && r.project == a.entry.id)?;
            Some(MessageView {
                key: r.key.clone(),
                title: r.title.clone(),
                run,
                n: at,
                from: m.from,
                text: m.text,
                at: m.at as f64,
                read: m.read,
            })
        })
        .collect())
}

pub fn message_read(s: &AppState, run: &str, n: u32) -> Res<()> {
    let out = s.factory.factory.read_message(run, n as usize);
    s.factory.publish();
    out
}

#[tauri::command]
#[specta::specta]
pub async fn questions_list(app: AppHandle) -> Res<Vec<QuestionView>> {
    blocking(app, questions).await
}

#[tauri::command]
#[specta::specta]
pub async fn question_answer(app: AppHandle, run: String, id: String, choice: Choice) -> Res<()> {
    blocking(app, move |s| answer(s, &run, &id, choice)).await
}

#[tauri::command]
#[specta::specta]
pub async fn messages_list(app: AppHandle) -> Res<Vec<MessageView>> {
    blocking(app, messages).await
}

#[tauri::command]
#[specta::specta]
pub async fn message_read_mark(app: AppHandle, run: String, n: u32) -> Res<()> {
    blocking(app, move |s| message_read(s, &run, n)).await
}

#[cfg(test)]
mod tests;
