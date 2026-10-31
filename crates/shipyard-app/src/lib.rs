//! Tauri shell. Commands live in `commands/`, one module for each feature.

pub mod agents;
pub mod applog;
pub mod assistant;
pub mod assistant_attach;
pub mod auto_commit;
pub mod branding;
pub mod certs;
pub mod close_guard;
pub mod code;
pub mod codex_trust;
pub mod commands;
pub mod connections;
pub mod costing;
pub mod delivery;
pub mod design;
pub mod design_preview;
pub mod device_login;
pub mod doctor;
pub mod doctor_bootstrap;
pub mod documents;
pub mod errors;
pub mod extensions;
pub mod factory;
pub mod feedback;
pub mod figma;
pub mod files;
pub mod knowledge;
pub mod learning;
pub mod machine;
pub mod mcp_tools;
pub mod openers;
pub mod orca;
pub mod outside;
pub mod pr_agent;
pub mod publish;
pub mod qa;
pub mod questions;
mod reports;
pub mod request_tree;
pub mod runner_setup;
pub mod sbom;
pub mod scanners;
mod shell;
pub mod specs;
pub mod sync;
pub mod terminal;
pub mod terminals;
pub mod window;
pub mod work;

use commands::{
    AppState, agents as ag, app, assistant as asst, code as git, connections as conn,
    delivery_docs, health, overview, prefs, projects, refs, shell as sh, sync as sy,
};
use extensions as ex;
use knowledge as kw;
use tauri::{Emitter, Manager};
use tauri_specta::{Builder, collect_commands};

fn specta_builder() -> Builder<tauri::Wry> {
    // The payload of the event `terminal-output`: no command returns it, so it is listed here.
    Builder::<tauri::Wry>::new()
        .typ::<terminal::TerminalOutput>()
        .commands(collect_commands![
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
            projects::projects_init,
            projects::projects_clone,
            projects::projects_switch,
            projects::projects_close,
            projects::projects_remove,
            projects::projects_set_view,
            projects::project_settings,
            projects::project_file_save,
            projects::project_overrides_save,
            projects::profile_email_get,
            health::health_run,
            health::health_fix,
            delivery_docs::project_import,
            delivery_docs::personas_list,
            delivery_docs::personas_save,
            delivery_docs::assignments_read,
            delivery_docs::tickets_config_get,
            delivery_docs::tickets_config_save,
            delivery_docs::tickets_links,
            delivery_docs::delivery_notes,
            overview::projects_overview,
            overview::project_open_remote,
            overview::code_push_target,
            overview::code_chain_gate,
            overview::code_chain_watch,
            crate::commands::chain_acks::code_chain_ack,
            crate::commands::chain_acks::code_chain_ack_withdraw,
            conn::connections_list,
            conn::connections_add,
            conn::connections_edit,
            conn::connections_remove,
            conn::connections_users,
            conn::connections_set_secret,
            conn::connections_test,
            conn::connections_repos,
            conn::connections_create_repo,
            crate::commands::setup::connections_suggest,
            crate::commands::setup::connections_scopes,
            crate::commands::setup::connections_open_token_page,
            crate::commands::logins::connections_detect,
            crate::commands::logins::connections_use_login,
            git::code_status,
            git::code_diff,
            git::code_stage,
            git::code_unstage,
            git::code_discard,
            git::code_commit,
            git::code_log,
            git::code_commit_detail,
            git::code_commit_diff,
            git::code_branches,
            git::code_branch_create,
            git::code_branch_switch,
            git::code_branch_delete,
            git::code_branch_merge,
            git::code_merge_abort,
            git::code_branch_rebase,
            git::code_rebase_continue,
            git::code_rebase_abort,
            git::code_blame,
            git::code_push_force,
            git::code_stash_push,
            git::code_stash_list,
            git::code_stash_apply,
            git::code_stash_drop,
            git::code_conflicts,
            git::code_resolve,
            git::code_fetch,
            git::code_pull,
            git::code_push,
            git::code_watch_tick,
            git::code_watch_notice,
            git::code_watch_interval,
            git::code_watch_interval_set,
            git::code_remote_url,
            git::code_file_read,
            git::code_file_list,
            crate::code::code_pull_detail,
            crate::code::code_pull_labels,
            crate::code::code_pull_open,
            crate::code::code_pull_comment,
            crate::code::code_pull_verdict,
            crate::code::code_pull_merge,
            crate::code::code_pull_ready,
            crate::code::code_pull_close,
            crate::code::code_pull_send_back,
            crate::code::code_pull_archive_spec,
            crate::device_login::device_login_start,
            crate::device_login::device_login_poll,
            crate::publish::code_origin,
            crate::publish::code_remote_set,
            crate::publish::code_publish,
            crate::openers::editors_list,
            crate::openers::editor_open,
            crate::openers::open_link,
            crate::code::code_quality,
            crate::code::code_check_run,
            crate::qa::code_coverage,
            crate::qa::code_gates_propose,
            crate::qa::code_gates_save,
            crate::documents::doc_search,
            crate::documents::doc_docx_list,
            crate::documents::doc_docx_read,
            crate::specs::requirements::specs_requirements,
            crate::specs::requirements::specs_testplan_generate,
            crate::work::apply_run_rows,
            crate::code::code_scan_run,
            crate::code::code_scanner_install,
            crate::sbom::code_sbom_export,
            crate::code::code_impact_refs,
            crate::code::code_impact_list,
            crate::code::code_impact_read,
            crate::code::code_impact_analyze,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            terminal::terminal_close_all,
            crate::terminals::terminal_apps,
            crate::terminals::terminal_launch,
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
            crate::mcp_tools::mcp_test,
            crate::mcp_tools::mcp_test_all,
            crate::mcp_tools::mcp_recommended,
            crate::mcp_tools::mcp_recommended_enable,
            crate::mcp_tools::gitlab_mcp_set_on,
            crate::pr_agent::pr_review_start,
            crate::pr_agent::pr_review_get,
            crate::pr_agent::pr_review_post,
            crate::pr_agent::pr_review_stop,
            crate::pr_agent::pr_review_waiting,
            crate::pr_agent::pr_write_text,
            crate::machine::machine_sessions,
            crate::machine::machine_session_stop,
            crate::machine::machine_spend,
            crate::machine::machine_budget_set,
            crate::outside::mcp_outside_get,
            crate::outside::mcp_outside_set,
            crate::outside::mcp_outside_wire,
            crate::outside::mcp_outside_token,
            crate::outside::mcp_elsewhere_list,
            crate::outside::mcp_elsewhere_import,
            crate::certs::certs_status,
            crate::certs::certs_import,
            crate::certs::certs_remove,
            crate::doctor::doctor_tools,
            crate::doctor::doctor_tool_install,
            crate::doctor::doctor_ledger,
            crate::doctor_bootstrap::doctor_bootstrap_plan,
            crate::doctor_bootstrap::doctor_bootstrap_apply,
            crate::assistant_attach::assistant_attach,
            crate::feedback::feedback_open,
            crate::applog::debug_log,
            ag::tiers_get,
            ag::tiers_set,
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
            work::work_ticket_comments,
            work::work_ticket_comment_add,
            work::work_ticket_edit,
            work::work_ticket_label_add,
            work::work_ticket_label_remove,
            work::work_ticket_priority_set,
            work::work_ticket_type_set,
            work::work_ticket_due_set,
            files::files_create_file,
            files::files_create_folder,
            files::files_rename,
            files::files_delete,
            orca::orca_status,
            orca::orca_open,
            work::work_ticket_edit_caps,
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
            costing::estimate_profiles,
            costing::estimate_delete,
            costing::plan_png_save,
            costing::plan_calendar_get,
            work::plan_decisions_save,
            work::plan_calendar_save,
            work::time_list,
            work::time_add,
            work::time_fetch,
            work::time_pull_month,
            work::time_send,
            work::apply_preview,
            work::apply_run,
            work::work_item_preview,
            work::work_item_create,
            factory::runs_list,
            factory::run_get_one,
            factory::run_log_page,
            factory::sessions_list,
            factory::usage_get,
            request_tree::usage_tree_get,
            factory::budget_set,
            factory::run_diff,
            factory::run_start,
            factory::run_cancel,
            factory::run_resume,
            factory::run_unblock,
            factory::run_plan_approve,
            factory::run_plan_reject,
            factory::kill_switch_get,
            factory::run_log_degraded,
            factory::kill_switch_set,
            factory::workflows_list,
            factory::workflow_get,
            factory::workflow_check,
            factory::workflow_write,
            factory::roles_list,
            factory::role_get,
            factory::role_write,
            questions::questions_list,
            questions::question_answer,
            questions::messages_list,
            questions::message_read_mark,
            delivery::approvals_list,
            delivery::approval_approve,
            delivery::approval_reject,
            delivery::pulls_list,
            delivery::pulls_status_get,
            design::design_list,
            design::design_read,
            design::design_write,
            design::design_adr_create,
            design::design_adr_decide,
            design::design_flows_save,
            design::design_try,
            design::design_open,
            design_preview::design_bytes,
            figma::design_fig_view,
            figma::figma_token_state,
            figma::figma_token_set,
            figma::figma_files,
            figma::figma_preview,
            figma::figma_tokens,
            specs::specs_changes,
            specs::specs_change_create,
            specs::specs_change_from_ticket,
            specs::specs_change_delegate,
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
            specs::bdd::specs_bdd,
            specs::specs_fold,
            specs::specs_split_draft,
            specs::specs_split_save,
            specs::specs_split_preview,
            specs::specs_split_apply,
            specs::specs_archive,
            asst::assistant_threads,
            asst::assistant_create,
            asst::assistant_get,
            asst::assistant_rename,
            asst::assistant_delete,
            asst::assistant_worktree_discard,
            asst::assistant_diff,
            asst::assistant_save_draft,
            asst::assistant_settings_set,
            asst::assistant_ref_add,
            asst::assistant_ref_remove,
            asst::assistant_send,
            asst::assistant_stop,
            asst::assistant_live,
            asst::assistant_grant,
            asst::assistant_retry,
            asst::assistant_explain,
            asst::assistant_to_factory_preview,
            asst::assistant_to_factory,
            asst::conflict_to_factory,
            asst::assistant_defaults_get,
            asst::assistant_defaults_set,
            asst::assistant_options,
            kw::graph_get,
            kw::graph_code,
            kw::graph_code_index,
            kw::explain_context_get,
            kw::doc_list_get,
            kw::doc_read_one,
            kw::doc_write_one,
            kw::slide_theme_get,
            kw::slide_theme_set,
            kw::slide_parse,
            kw::dashboard_list_get,
            kw::dashboard_get_one,
            kw::dashboard_save_one,
            kw::dashboard_tile,
            kw::learn_get,
            crate::learning::learning_get,
            crate::learning::learning_feeds_read,
            crate::learning::learning_feed_add,
            crate::learning::learning_feed_remove,
            crate::learning::learning_path_save,
            crate::learning::learning_path_delete,
            crate::learning::learning_progress_set,
            kw::export_dossier_file,
            kw::export_functional_file,
            kw::export_sheet_file,
            kw::export_dossier_complete_file,
            crate::reports::export_costing_file,
            crate::reports::export_flows_file,
            crate::reports::export_raid_file,
            crate::reports::export_schedule_file,
            crate::reports::export_gantt_file,
            crate::reports::export_security_file,
            crate::reports::export_work_done_file,
            crate::reports::export_change_request_files,
            ex::compass_get,
            ex::compass_preview,
            ex::compass_apply,
            ex::compass_upgrade,
            ex::roles_skills_get,
            ex::catalog_get,
            ex::catalog_preview,
            ex::catalog_deploy,
            ex::plugin_review,
            ex::plugin_apply,
            ex::child_list,
            ex::child_add,
            ex::child_remove,
            ex::child_clone,
            ex::child_deploy,
            ex::manage::compass_policies,
            ex::manage::compass_policy_apply,
            ex::manage::compass_import,
            ex::manage::compass_remove,
            ex::manage::catalog_undeploy,
            ex::manage::plugin_list,
            ex::manage::plugin_set_enabled,
            ex::manage::plugin_remove,
            ex::plugin_settings::plugin_settings_get,
            ex::plugin_settings::plugin_settings_save,
            ex::compass_setup::compass_external,
            ex::compass_setup::compass_external_refresh,
            ex::compass_setup::compass_external_reinstall,
            ex::compass_setup::compass_contract_install,
            ex::compass_setup::compass_objectives,
            ex::compass_setup::compass_objective_apply,
            auto_commit::auto_commit_get,
            auto_commit::auto_commit_set,
            auto_commit::auto_commit_run,
            close_guard::close_guard_state,
            close_guard::close_anyway,
            window::app_data_folder,
            branding::picture_get,
            branding::picture_set,
            branding::feedback_mail,
            crate::commands::git_extra::git_stash_pop,
            crate::commands::git_extra::git_stash_diff,
            crate::commands::git_extra::git_branch_fast_forward,
            crate::commands::git_extra::git_linked_inspect,
            runner_setup::runner_install,
            codex_trust::codex_trust_state,
            codex_trust::codex_trust,
            sh::shell_menu,
            sh::notify_os,
            sh::update_check,
        ])
}

pub fn run() {
    shipyard_agents::which::fix_path();
    let builder = specta_builder();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(builder.invoke_handler())
        // A run or an assistant turn in flight holds the window until the person answers.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                close_guard::on_close_requested(window.app_handle(), window, api);
            }
        })
        // A menu item runs the palette action with the same id (REQ-012).
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-action", event.id().as_ref());
        })
        .setup(|app| {
            let exe = std::env::current_exe().ok();
            let dir = window::data_dir(exe.as_deref(), app.path().app_data_dir()?);
            std::fs::create_dir_all(&dir)?;
            window::restore(app.handle(), &dir);
            app.manage(AppState::new(dir.clone()));
            certs::apply(&app.state::<AppState>());
            // Each tick and each change of the mirror tells the views to read it again (REQ-016).
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            state.sync.on_change(move || {
                let _ = handle.emit(sy::TICK_EVENT, ());
            });
            // The views read the factory again on these events (T018).
            let handle = app.handle().clone();
            state.factory.on_event(move |name, ping| {
                let _ = handle.emit(name, ping);
            });
            // The agent tools endpoint listens on 127.0.0.1 before the first run starts.
            if let Err(e) = state.factory.start_mcp(state.agents.proxy.clone()) {
                eprintln!("agent tools endpoint: {e}");
                applog::record("error", &format!("agent tools endpoint: {e}"));
            }
            // The server for outside agents starts only when the person turned it on.
            applog::record(
                "info",
                &format!("Shipyard {} started", env!("CARGO_PKG_VERSION")),
            );
            outside::set_app(app.handle().clone());
            outside::start_saved(&state);
            // The engine of the active project starts with the app.
            sy::refresh(&state);
            factory::spawn_loop(app.handle().clone());
            app.set_menu(shell::menu::build(app.handle(), &Default::default())?)?;
            git::spawn_watch(app.handle().clone());
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
                Err(e) => {
                    eprintln!("MCP relay: {e}");
                    applog::record("error", &format!("MCP relay: {e}"));
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Shipyard")
        .run(|app, event| {
            // Each server that the app started ends with it (REQ-007).
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();
                // The agent processes stop, the runs keep their state: the next start resumes them.
                state.factory.factory.shutdown();
                // A gate command and its children stop too (`delivery::kill_gates`).
                delivery::kill_gates();
                terminal::close_all();
                state.agents.mcp.stop_all();
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
