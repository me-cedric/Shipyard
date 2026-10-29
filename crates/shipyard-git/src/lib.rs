//! Git operations for projects. The `git` command runs clone, init and state (`project`),
//! so a person's credential helpers apply. `git2` runs the working copy operations
//! (`code`) and the worktrees (`worktree`). `auth` is the one place for credentials and proxy.

pub mod auth;
pub mod code;
pub mod error;
pub mod project;
pub mod worktree;

pub use auth::{Auth, Credential};
pub use code::Repo;
pub use error::{GitError, Result};
