//! The error of a command: a code, the raw details and one optional action.
//!
//! Most code in the app still makes a plain `String`. A `String` becomes an `AppError` at the edge of a
//! command: `classify` gives it a code from the table `KNOWN`. A text that the table lacks gets
//! `Unknown`, and the view shows the details as they are. The views translate the code (EN and FR,
//! `src/lib/i18n/errors.ts`) and show the action as a button.

use std::fmt;

use serde::Serialize;
use specta::Type;

/// What a person can do about an error. The view maps each kind to a button.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    /// Open a Settings field. `target` is `connections`, `trackerScope`, `pickupLabel` or `terminalApp`.
    Setting,
    /// Read the tracker again.
    Sync,
    /// Install a tool. `target` is the tool id of Settings / Health.
    Install,
    /// Create a project.
    CreateProject,
    /// Go to a page. `target` is its path, such as `/code/changes`.
    Open,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ErrorAction {
    pub kind: ActionKind,
    pub target: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// Not in the table: the view shows the details.
    Unknown,
    NoProject,
    NoTracker,
    ScopeMissing,
    PickupOff,
    TicketNotInMirror,
    NeedsClick,
    NodeMissing,
    NoPackageManager,
    NoSecret,
    TokenRefused,
    ConnectionName,
    ConnectionAddress,
    SecretInvalid,
    TitleInvalid,
    ChangeIdInvalid,
    ChangeExists,
    RunNotStarted,
    RunActive,
    MergeDraft,
    MergeClosed,
    MergeMethod,
    ForgeUnreachable,
    CertUntrusted,
    ForgeDenied,
    ForgeMissing,
    GitNothingStaged,
    GitIdentity,
    GitBusy,
    GitNoUpstream,
    NoTerminal,
    TerminalGone,
    DeviceNotSet,
    NoEditor,
    NoFirstCommit,
    RemoteAddress,
    RemoteExists,
    SheetFrozen,
    FeedInvalid,
    SettingInvalid,
    GitlabNoMcp,
    GitlabAddress,
    ReadOnly,
    AgentsStopped,
    AgentLimit,
    BudgetSpent,
    HeadMissing,
    NoChanges,
    ReviewPosted,
    ReviewRunning,
    FigmaNoToken,
    BranchDiverged,
    PictureInvalid,
    ReviewNoResult,
    AgentNoText,
    AgentNoTitle,
    ReviewNoDraft,
    ReviewEmpty,
    NoBase,
    FigmaAddress,
}

impl ErrorCode {
    /// The one action of the code, if it has one.
    fn action(self) -> Option<ErrorAction> {
        let (kind, target) = match self {
            Self::NoProject => (ActionKind::CreateProject, ""),
            Self::NoTracker | Self::NoSecret | Self::TokenRefused => {
                (ActionKind::Setting, "connections")
            }
            Self::ScopeMissing => (ActionKind::Setting, "trackerScope"),
            Self::PickupOff => (ActionKind::Setting, "pickupLabel"),
            Self::TicketNotInMirror => (ActionKind::Sync, ""),
            Self::NodeMissing => (ActionKind::Install, "node"),
            Self::MergeDraft | Self::MergeClosed | Self::MergeMethod => {
                (ActionKind::Open, "/code/pull-requests")
            }
            Self::ForgeDenied | Self::GitlabNoMcp | Self::GitlabAddress => {
                (ActionKind::Setting, "connections")
            }
            Self::CertUntrusted => (ActionKind::Setting, "certificate"),
            Self::GitNothingStaged => (ActionKind::Open, "/code/changes"),
            Self::GitNoUpstream => (ActionKind::Open, "/code/branches"),
            Self::NoTerminal | Self::TerminalGone => (ActionKind::Setting, "terminalApp"),
            _ => return None,
        };
        Some(ErrorAction {
            kind,
            target: target.into(),
        })
    }
}

/// The raw texts that the Rust code makes, by the part that is the same each time. The first match wins.
pub const KNOWN: &[(&str, ErrorCode)] = &[
    ("no project is open", ErrorCode::NoProject),
    ("no active project", ErrorCode::NoProject),
    ("has no tracker connection", ErrorCode::NoTracker),
    ("the tracker scope is not set", ErrorCode::ScopeMissing),
    ("the pickup label is off", ErrorCode::PickupOff),
    ("not in the mirror", ErrorCode::TicketNotInMirror),
    ("needs the click of a person", ErrorCode::NeedsClick),
    ("npm is not installed", ErrorCode::NodeMissing),
    ("no package manager found", ErrorCode::NoPackageManager),
    ("no secret saved", ErrorCode::NoSecret),
    ("refused the token", ErrorCode::TokenRefused),
    ("the name needs", ErrorCode::ConnectionName),
    ("bad address", ErrorCode::ConnectionAddress),
    ("the secret needs", ErrorCode::SecretInvalid),
    ("the title needs", ErrorCode::TitleInvalid),
    ("invalid change id", ErrorCode::ChangeIdInvalid),
    ("change exists", ErrorCode::ChangeExists),
    ("the run did not start", ErrorCode::RunNotStarted),
    ("a run is active on", ErrorCode::RunActive),
    ("a draft pull request cannot merge", ErrorCode::MergeDraft),
    ("the pull request is not open", ErrorCode::MergeClosed),
    ("does not offer the method", ErrorCode::MergeMethod),
    (
        "invalid peer certificate: UnknownIssuer",
        ErrorCode::CertUntrusted,
    ),
    ("HTTP 401", ErrorCode::ForgeDenied),
    ("HTTP 403", ErrorCode::ForgeDenied),
    ("HTTP 404", ErrorCode::ForgeMissing),
    ("network error:", ErrorCode::ForgeUnreachable),
    ("nothing is staged", ErrorCode::GitNothingStaged),
    ("no git identity", ErrorCode::GitIdentity),
    ("the repository is busy with", ErrorCode::GitBusy),
    ("the branch has no upstream", ErrorCode::GitNoUpstream),
    ("no terminal app was found", ErrorCode::NoTerminal),
    ("terminal app is not installed", ErrorCode::TerminalGone),
    ("browser sign-in is not set up", ErrorCode::DeviceNotSet),
    ("no code editor was found", ErrorCode::NoEditor),
    ("make a first commit before", ErrorCode::NoFirstCommit),
    ("bad remote address", ErrorCode::RemoteAddress),
    ("the project already has a remote", ErrorCode::RemoteExists),
    ("the sheet is frozen", ErrorCode::SheetFrozen),
    ("does not hold an RSS or Atom feed", ErrorCode::FeedInvalid),
    ("the setting ", ErrorCode::SettingInvalid),
    (
        "the GitLab sign-in has no mcp scope",
        ErrorCode::GitlabNoMcp,
    ),
    ("the GitLab address changed", ErrorCode::GitlabAddress),
    ("is read only", ErrorCode::ReadOnly),
    ("the agents are stopped", ErrorCode::AgentsStopped),
    ("the agent limit is reached", ErrorCode::AgentLimit),
    ("is spent: the review waits", ErrorCode::BudgetSpent),
    (
        "the head commit is not in the local repository",
        ErrorCode::HeadMissing,
    ),
    (
        "the branch has no changes to describe",
        ErrorCode::NoChanges,
    ),
    ("the review is posted already", ErrorCode::ReviewPosted),
    (
        "a review of this pull request is running",
        ErrorCode::ReviewRunning,
    ),
    ("no Figma token", ErrorCode::FigmaNoToken),
    (
        "has its own commits: merge or rebase it",
        ErrorCode::BranchDiverged,
    ),
    (
        "the picture is not a PNG or a JPEG file",
        ErrorCode::PictureInvalid,
    ),
    ("the picture is larger than 1 MB", ErrorCode::PictureInvalid),
    ("the review has no result", ErrorCode::ReviewNoResult),
    ("the agent wrote no text", ErrorCode::AgentNoText),
    ("the agent wrote no title", ErrorCode::AgentNoTitle),
    ("no draft review", ErrorCode::ReviewNoDraft),
    ("the review is empty", ErrorCode::ReviewEmpty),
    ("the branch has no base to compare with", ErrorCode::NoBase),
    ("this is not a Figma file address", ErrorCode::FigmaAddress),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct AppError {
    pub code: ErrorCode,
    /// The raw text, for the debug console and for a code that has no message.
    pub details: String,
    pub action: Option<ErrorAction>,
}

impl AppError {
    pub fn new(code: ErrorCode, details: impl Into<String>) -> Self {
        Self {
            code,
            details: details.into(),
            action: code.action(),
        }
    }
}

impl From<String> for AppError {
    fn from(text: String) -> Self {
        let code = KNOWN
            .iter()
            .find(|(needle, _)| text.contains(needle))
            .map_or(ErrorCode::Unknown, |(_, code)| *code);
        Self::new(code, text)
    }
}

impl From<&str> for AppError {
    fn from(text: &str) -> Self {
        text.to_string().into()
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.details
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.details)
    }
}

impl std::ops::Deref for AppError {
    type Target = str;
    fn deref(&self) -> &str {
        &self.details
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_known_text_gets_its_code_and_action() {
        let e = AppError::from("ACME-9 is not in the mirror: sync first");
        assert_eq!(e.code, ErrorCode::TicketNotInMirror);
        assert_eq!(e.action.unwrap().kind, ActionKind::Sync);
        let e = AppError::from("set the tracker scope: the tracker scope is not set");
        assert_eq!(e.action.unwrap().target, "trackerScope");
        assert_eq!(AppError::from("odd").code, ErrorCode::Unknown);
        let e = AppError::from("a draft pull request cannot merge: mark it ready first");
        assert_eq!(e.action.unwrap().kind, ActionKind::Open);
        let e = AppError::from("HTTP 401: bad credentials");
        assert_eq!(e.action.unwrap().target, "connections");
        // An outage has no action: a forge outage must not read the tracker again.
        let e = AppError::from("network error: connection refused");
        assert_eq!((e.code, e.action), (ErrorCode::ForgeUnreachable, None));
        // A proxy that the OS trusts and the client does not: the person adds its certificate.
        let e = AppError::from("network error: invalid peer certificate: UnknownIssuer");
        assert_eq!(e.code, ErrorCode::CertUntrusted);
        assert_eq!(e.action.unwrap().target, "certificate");
        let e = AppError::from("invalid change id: Bad Id");
        assert_eq!((e.code, e.action), (ErrorCode::ChangeIdInvalid, None));
        let e = AppError::from("the terminal app is not installed: Kitty");
        assert_eq!(e.action.unwrap().target, "terminalApp");
        // Each entry of the table is reached: an earlier needle never hides a later one.
        for (needle, code) in KNOWN {
            assert_eq!(AppError::from(*needle).code, *code, "{needle}");
        }
    }
}
