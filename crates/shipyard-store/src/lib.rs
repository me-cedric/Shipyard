//! Stores in the app data folder and codecs for repository files.

pub mod archive;
pub mod assistant_defaults;
pub mod automation_file;
pub mod catalog;
pub mod code;
pub mod compass;
pub mod design;
pub mod excel;
pub mod export;
pub mod factory_files;
pub mod fold;
pub mod knowledge;
pub mod legacy;
pub mod project_import;
pub mod madr;
pub mod mirror;
pub mod openspec_validate;
pub mod plugins;
pub mod pr;
pub mod prefs;
pub mod project;
pub mod raid;
pub mod ref_index;
pub mod ref_query;
mod repo_scan;
pub mod roles_skills;
pub mod run_log;
pub mod safe_write;
pub mod seal;
pub mod threads;
pub mod work;

/// One error type for the stores. The callers show its text.
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Result<T> = std::result::Result<T, Error>;
