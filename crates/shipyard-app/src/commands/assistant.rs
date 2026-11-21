//! The assistant panel commands (spec `assistant`). The logic is in `crate::assistant`; a command
//! only runs it on a blocking thread, because a turn waits for a runner.

use shipyard_core::assistant::{Context, Quote, ThreadSettings, ThreadSummary};
use shipyard_core::work::DiffRow;
use shipyard_git::code::FileDiff;
use shipyard_store::assistant_defaults::AssistantDefaults;
use tauri::{AppHandle, Emitter};

use super::{Api, blocking};
use crate::assistant as a;
use a::{FactorySend, LiveTurn, RunnerOptions, ThreadView, TurnResult};

/// The thread list changed outside a call of the UI: the short name of a thread came.
pub const THREADS_EVENT: &str = "assistant-threads";

#[tauri::command]
#[specta::specta]
pub async fn assistant_threads(app: AppHandle) -> Api<Vec<ThreadSummary>> {
    blocking(app, a::threads_list).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_create(app: AppHandle, title: Option<String>) -> Api<ThreadView> {
    blocking(app, move |s| a::thread_create(s, title)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_get(app: AppHandle, thread: String) -> Api<ThreadView> {
    blocking(app, move |s| a::thread_get(s, &thread)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_rename(app: AppHandle, thread: String, title: String) -> Api<ThreadSummary> {
    blocking(app, move |s| a::thread_rename(s, &thread, &title)).await
}

/// Fails when the worktree of the thread holds changes: discard it first.
#[tauri::command]
#[specta::specta]
pub async fn assistant_delete(app: AppHandle, thread: String) -> Api<()> {
    blocking(app, move |s| a::thread_delete(s, &thread)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_worktree_discard(
    app: AppHandle,
    thread: String,
    force: bool,
) -> Api<ThreadView> {
    blocking(app, move |s| a::worktree_discard(s, &thread, force)).await
}

/// Keep the change of one file, or of all with no path. Returns the files that are left to review.
#[tauri::command]
#[specta::specta]
pub async fn assistant_file_keep(
    app: AppHandle,
    thread: String,
    path: Option<String>,
) -> Api<Vec<FileDiff>> {
    blocking(app, move |s| a::worktree_keep(s, &thread, path.as_deref())).await
}

/// Revert one file of the thread. Returns the files that are left to review.
#[tauri::command]
#[specta::specta]
pub async fn assistant_file_undo(
    app: AppHandle,
    thread: String,
    path: String,
) -> Api<Vec<FileDiff>> {
    blocking(app, move |s| a::worktree_undo_file(s, &thread, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_diff(app: AppHandle, thread: String) -> Api<Vec<FileDiff>> {
    blocking(app, move |s| a::thread_diff(s, &thread)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_save_draft(
    app: AppHandle,
    thread: String,
    draft: String,
    context: Context,
) -> Api<()> {
    blocking(app, move |s| a::save_draft(s, &thread, &draft, context)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_settings_set(
    app: AppHandle,
    thread: String,
    settings: ThreadSettings,
) -> Api<ThreadView> {
    blocking(app, move |s| a::settings_set(s, &thread, settings)).await
}

/// Adds the ref only when it resolves. An error text says why it did not.
#[tauri::command]
#[specta::specta]
pub async fn assistant_ref_add(app: AppHandle, thread: String, text: String) -> Api<Context> {
    blocking(app, move |s| a::ref_add(s, &thread, &text)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_ref_remove(app: AppHandle, thread: String, text: String) -> Api<Context> {
    blocking(app, move |s| a::ref_remove(s, &thread, &text)).await
}

/// Runs one turn and returns the assistant message. An error text: a spent budget, a busy thread.
/// A runner failure is not an error: it is a message with the state `failed`.
#[tauri::command]
#[specta::specta]
pub async fn assistant_send(
    app: AppHandle,
    thread: String,
    text: String,
    quotes: Vec<Quote>,
    context: Context,
) -> Api<TurnResult> {
    let id = thread.clone();
    let done = blocking(app.clone(), move |s| {
        a::send(s, &thread, text, quotes, context)
    })
    .await?;
    // After the first answer the AI tool gives the thread a short name, in the background.
    if a::needs_name(&done.thread.thread) {
        tauri::async_runtime::spawn(async move {
            let named = blocking(app.clone(), move |s| a::auto_name(s, &id, None)).await;
            if let Ok(Some(_)) = named {
                let _ = app.emit(THREADS_EVENT, ());
            }
        });
    }
    Ok(done)
}

/// Stops the running turn of a thread. The turn ends with the reply that came so far.
#[tauri::command]
#[specta::specta]
pub async fn assistant_stop(thread: String) -> Api<()> {
    a::stop(&thread);
    Ok(())
}

/// The tool calls and the tokens of the running turn of a thread so far. Empty when no turn runs.
#[tauri::command]
#[specta::specta]
pub async fn assistant_live(thread: String) -> Api<LiveTurn> {
    Ok(a::live_turn(&thread))
}

/// Grants the tool that the last message waits for and resumes the session.
#[tauri::command]
#[specta::specta]
pub async fn assistant_grant(app: AppHandle, thread: String) -> Api<TurnResult> {
    blocking(app, move |s| a::grant(s, &thread)).await
}

/// Resumes the session after a failed turn. It does not send the first request again.
#[tauri::command]
#[specta::specta]
pub async fn assistant_retry(app: AppHandle, thread: String) -> Api<TurnResult> {
    blocking(app, move |s| a::retry(s, &thread)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_explain(app: AppHandle, thread: String, entity: String) -> Api<TurnResult> {
    blocking(app, move |s| a::explain(s, &thread, &entity)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_to_factory_preview(app: AppHandle, thread: String) -> Api<DiffRow> {
    blocking(app, move |s| a::to_factory_preview(s, &thread)).await
}

/// `workflow` of `null`: a work item. A workflow id: the item gets the label `wf:<id>`.
#[tauri::command]
#[specta::specta]
pub async fn assistant_to_factory(
    app: AppHandle,
    thread: String,
    workflow: Option<String>,
    click: bool,
) -> Api<FactorySend> {
    blocking(app, move |s| a::to_factory(s, &thread, workflow, click)).await
}

/// Hand the conflicted files to a workflow: one work item with the label `wf:<id>`.
#[tauri::command]
#[specta::specta]
pub async fn conflict_to_factory(
    app: AppHandle,
    workflow: String,
    click: bool,
) -> Api<FactorySend> {
    blocking(app, move |s| a::conflict_to_factory(s, workflow, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_defaults_get(app: AppHandle) -> Api<AssistantDefaults> {
    blocking(app, a::defaults_get).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_defaults_set(
    app: AppHandle,
    defaults: AssistantDefaults,
) -> Api<AssistantDefaults> {
    blocking(app, move |s| a::defaults_set(s, defaults)).await
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_options(app: AppHandle) -> Api<Vec<RunnerOptions>> {
    blocking(app, a::options).await
}

/// The slash commands of a runner: the files that its CLI reads.
#[tauri::command]
#[specta::specta]
pub async fn assistant_slash_commands(
    app: AppHandle,
    runner: String,
) -> Api<Vec<shipyard_agents::slash::SlashCommand>> {
    blocking(app, move |s| a::slash_commands(s, &runner)).await
}
