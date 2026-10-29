//! Stores in the app data folder and codecs for repository files.

pub mod prefs;
pub mod project;
pub mod ref_index;
pub mod ref_query;
mod repo_scan;
pub mod seal;

/// One error type for the stores. The callers show its text.
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Result<T> = std::result::Result<T, Error>;
