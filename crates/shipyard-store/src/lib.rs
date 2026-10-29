//! Stores in the app data folder and codecs for repository files.

pub mod archive;
pub mod automation_file;
pub mod design;
pub mod excel;
pub mod factory_files;
pub mod fold;
pub mod madr;
pub mod mirror;
pub mod openspec_validate;
pub mod pr;
pub mod prefs;
pub mod project;
pub mod raid;
pub mod ref_index;
pub mod ref_query;
mod repo_scan;
pub mod run_log;
pub mod safe_write;
pub mod seal;
pub mod work;

/// One error type for the stores. The callers show its text.
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Result<T> = std::result::Result<T, Error>;
