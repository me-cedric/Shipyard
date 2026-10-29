//! Tauri shell. Commands live in `commands/`, one module for each feature.

pub mod agents;
mod commands;
pub mod connections;
pub mod design;
mod shell;
pub mod specs;
pub mod sync;
pub mod work;

use commands::{
    AppState, agents as ag, app, code, connections as conn, health, legacy, prefs, projects, refs,
    shell as sh, sync as sy,
};
use tauri::{Emitter, Manager};
use tauri_specta::{Builder, collect_commands};

fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        app::app_info,
        prefs::prefs_get,
        prefs::prefs_set,
        refs::refs_parse,
        refs::refs_resolve,
        refs::refs_backlinks,
        refs::refs_search,
        refs::refs_check,
        refs::refs_reindex,
        projects::projects_list,
        projects::projects_active,
        projects::projects_open,
        projects::projects_create,
        projects::projects_clone,
        projects::projects_switch,
        projects::projects_set_view,
        projects::project_settings,
        projects::project_file_save,
        projects::project_overrides_save,
        health::health_run,
        health::health_fix,
        legacy::project_import,
        conn::connections_list,
        conn::connections_add,
        conn::connections_edit,
        conn::connections_remove,
        conn::connections_users,
        conn::connections_set_secret,
        conn::connections_test,
        conn::connections_repos,
        code::code_status,
        code::code_diff,
        code::code_stage,
        code::code_unstage,
        code::code_discard,
        code::code_commit,
        code::code_log,
        code::code_commit_detail,
        code::code_commit_diff,
        code::code_branches,
        code::code_branch_create,
        code::code_branch_switch,
        code::code_branch_delete,
        code::code_stash_push,
        code::code_stash_list,
        code::code_stash_apply,
        code::code_stash_drop,
        code::code_conflicts,
        code::code_resolve,
        code::code_fetch,
        code::code_pull,
        code::code_push,
        code::code_watch_tick,
        code::code_watch_notice,
        ag::runners_list,
        ag::providers_list,
        ag::providers_add,
        ag::providers_edit,
        ag::providers_set_secret,
        ag::providers_remove,
        ag::providers_test,
        ag::providers_models,
        ag::mcp_list,
        ag::mcp_enable,
        ag::mcp_add_custom,
        ag::mcp_remove,
        ag::mcp_forget,
        ag::mcp_set_field,
        ag::mcp_start,
        ag::mcp_stop,
        ag::mcp_state,
        ag::mcp_install,
        sy::sync_state,
        sy::sync_now,
        sy::sync_automation_get,
        sy::sync_automation_save,
        sy::sync_items,
        sy::sync_import_plan,
        sy::sync_import_confirm,
        sy::sync_adopt,
        sy::sync_link,
        sy::sync_unlink,
        work::work_context,
        work::work_team,
        work::work_team_save,
        work::work_suggest,
        work::work_assign,
        work::work_mark,
        work::work_transition,
        work::work_seal_state,
        work::work_unlock,
        work::work_lock,
        work::work_seal,
        work::work_unseal,
        work::estimate_list,
        work::estimate_get,
        work::estimate_save,
        work::estimate_portfolio,
        work::excel_preview,
        work::excel_confirm,
        work::excel_export,
        work::plan_get,
        work::plan_decisions_save,
        work::plan_calendar_save,
        work::time_list,
        work::time_add,
        work::time_fetch,
        work::time_send,
        work::apply_preview,
        work::apply_run,
        work::work_item_preview,
        work::work_item_create,
        design::design_list,
        design::design_read,
        design::design_write,
        design::design_adr_create,
        design::design_adr_decide,
        design::design_flows_save,
        design::design_try,
        design::design_open,
        specs::specs_changes,
        specs::specs_change_create,
        specs::specs_read,
        specs::specs_write,
        specs::specs_validate,
        specs::specs_capabilities,
        specs::specs_spec,
        specs::specs_questions,
        specs::specs_question_save,
        specs::specs_question_create,
        specs::specs_testplans,
        specs::specs_coverage,
        specs::specs_fold,
        specs::specs_split_draft,
        specs::specs_split_save,
        specs::specs_split_preview,
        specs::specs_split_apply,
        specs::specs_archive,
        sh::shell_menu,
        sh::notify_os,
        sh::update_check,
    ])
}

/// The default remote watch interval (spec `code`, REQ-015).
const WATCH_EVERY: std::time::Duration = std::time::Duration::from_secs(15 * 60);

pub fn run() {
    let builder = specta_builder();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(builder.invoke_handler())
        // A menu item runs the palette action with the same id (REQ-012).
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-action", event.id().as_ref());
        })
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(AppState::new(dir.clone()));
            // Each tick and each change of the mirror tells the views to read it again (REQ-016).
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            state.sync.on_change(move || {
                let _ = handle.emit(sy::TICK_EVENT, ());
            });
            // The engine of the active project starts with the app.
            sy::refresh(&state);
            app.set_menu(shell::menu::build(app.handle(), &Default::default())?)?;
            code::spawn_watch(app.handle().clone(), WATCH_EVERY);
            // The relay answers `shipyard --mcp-relay <id>` with the open server (REQ-018).
            // A failure leaves each agent turn to start its own server.
            #[cfg(unix)]
            match shipyard_mcp::relay::Relay::listen(
                app.state::<AppState>().agents.proxy.clone(),
                &shipyard_mcp::relay::socket_path(&dir),
            ) {
                Ok(relay) => {
                    app.manage(relay);
                }
                Err(e) => eprintln!("MCP relay: {e}"),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Shipyard")
        .run(|app, event| {
            // Each server that the app started ends with it (REQ-007).
            if let tauri::RunEvent::Exit = event {
                app.state::<AppState>().agents.mcp.stop_all();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use specta_typescript::Typescript;

    /// Writes `src/lib/ipc/bindings.ts`. Run it with `pnpm ipc:gen`.
    #[test]
    fn export_bindings() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src/lib/ipc/bindings.ts");
        let ts = Typescript::default()
            .header("// Generated by tauri-specta. Do not edit. Regenerate with `pnpm ipc:gen`.");
        specta_builder().export(ts, path).expect("export bindings");
    }
}
