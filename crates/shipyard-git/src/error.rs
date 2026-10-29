//! One error type for the git2 operations. The messages hold no secret.

use shipyard_secrets::SecretError;

pub type Result<T> = std::result::Result<T, GitError>;

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("git: {0}")]
    Git(String),
    #[error("not a working copy: {0}")]
    NotARepo(String),
    #[error("path is not inside the working copy: {0}")]
    BadPath(String),
    #[error("uncommitted changes would be overwritten: {}", .0.join(", "))]
    DirtyTree(Vec<String>),
    #[error("conflicts in: {}", .0.join(", "))]
    Conflicts(Vec<String>),
    #[error("nothing is staged")]
    NothingStaged,
    #[error("the commit summary is empty")]
    EmptySummary,
    #[error("no git identity: set user.name and user.email")]
    NoIdentity,
    #[error("the repository is busy with a {0}")]
    Busy(String),
    #[error("branch not found: {0}")]
    NoBranch(String),
    #[error("branch already exists: {0}")]
    BranchExists(String),
    #[error("branch name is not valid: {0}")]
    BadBranchName(String),
    #[error("the branch has no upstream")]
    NoUpstream,
    #[error("HEAD is detached")]
    Detached,
    #[error("push rejected: {0}")]
    PushRejected(String),
    #[error("the worktree has uncommitted changes: {0}")]
    WorktreeDirty(String),
    #[error("worktree not found: {0}")]
    NoWorktree(String),
    #[error("{0}")]
    Credentials(String),
}

impl From<git2::Error> for GitError {
    fn from(e: git2::Error) -> Self {
        Self::Git(e.message().to_string())
    }
}

impl From<SecretError> for GitError {
    fn from(e: SecretError) -> Self {
        Self::Credentials(e.to_string())
    }
}
