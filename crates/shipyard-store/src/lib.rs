//! Stores in the app data folder and codecs for repository files.

pub mod archive;
pub mod assistant_defaults;
pub mod automation_file;
pub mod catalog;
pub mod catalog_undeploy;
pub mod code;
pub mod compass;
pub mod compass_user;
pub mod delivery_docs;
pub mod design;
pub mod docs_layout;
pub mod docx_view;
pub mod excel;
pub mod export;
pub mod factory_files;
pub mod fold;
pub mod knowledge;
pub mod learning;
pub mod madr;
pub mod mirror;
pub mod openspec_validate;
pub mod plugin_config;
pub mod plugin_manage;
pub mod plugins;
pub mod pr;
pub mod prefs;
pub mod project;
pub mod project_import;
pub mod raid;
pub mod ref_index;
pub mod ref_query;
mod repo_scan;
pub mod reports;
pub mod roles_skills;
pub mod run_log;
pub mod safe_write;
pub mod seal;
pub mod threads;
pub mod work;

/// One error type for the stores. The callers show its text.
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Result<T> = std::result::Result<T, Error>;
