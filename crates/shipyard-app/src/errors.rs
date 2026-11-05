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
    /// Open a Settings field. `target` is the route and the anchor id of the row, such as `/settings/project#issue-tracker`.
    Setting,
    /// Read the tracker again.
    Sync,
    /// Install a tool. `target` is the tool id of Settings / Health.
    Install,
    /// Create a project.
    CreateProject,
    /// Go to a page. `target` is its path, with an anchor id when a control must open, such as `/code/changes` or `/work/team#add-member`.
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
    NoMember,
    NoAccount,
    UnknownMember,
    NotFound,
    NoRemote,
    SecretFound,
    FileTooBig,
    FileUnsupported,
    PathInvalid,
    AlreadyExists,
    FileChanged,
    NoCompass,
    ToolMissing,
    ToolFailed,
    ConnectionKind,
    SignInFailed,
    GitState,
    ThreadState,
    Stopped,
    ImportNotPlanned,
    ServerOff,
    InputInvalid,
    TrackerUnsupported,
}

impl ErrorCode {
    /// The one action of the code, if it has one.
    fn action(self) -> Option<ErrorAction> {
        let (kind, target) = match self {
            Self::NoProject => (ActionKind::CreateProject, ""),
            Self::NoMember | Self::UnknownMember => (ActionKind::Open, "/work/team#add-member"),
            Self::NoTracker => (ActionKind::Setting, "/settings/project#issue-tracker"),
            Self::NoSecret | Self::TokenRefused | Self::NoAccount | Self::DeviceNotSet => {
                (ActionKind::Setting, "/settings/connections#connections")
            }
            Self::ScopeMissing => (ActionKind::Setting, "/settings/project#tracker-scope"),
            Self::PickupOff => (ActionKind::Setting, "/settings/project#pickup-label"),
            Self::TicketNotInMirror => (ActionKind::Sync, ""),
            Self::NodeMissing => (ActionKind::Install, "node"),
            Self::MergeDraft | Self::MergeClosed | Self::MergeMethod => {
                (ActionKind::Open, "/code/pull-requests")
            }
            Self::ForgeDenied | Self::GitlabNoMcp | Self::GitlabAddress => {
                (ActionKind::Setting, "/settings/connections#connections")
            }
            Self::CertUntrusted => (ActionKind::Setting, "/settings/connections#certificates"),
            Self::GitNothingStaged => (ActionKind::Open, "/code/changes"),
            Self::GitNoUpstream => (ActionKind::Open, "/code/branches"),
            Self::NoTerminal | Self::TerminalGone => {
                (ActionKind::Setting, "/settings/me#terminal-app")
            }
            Self::NoRemote => (ActionKind::Open, "/code/branches"),
            Self::NoCompass => (ActionKind::Open, "/settings/agents-rules#compass-upgrade"),
            Self::ToolMissing => (ActionKind::Open, "/settings/health#tools"),
            Self::ConnectionKind => (ActionKind::Setting, "/settings/connections#connections"),
            Self::SignInFailed => (ActionKind::Setting, "/settings/connections#connections"),
            Self::GitState => (ActionKind::Open, "/code/branches"),
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
    ("no team member matches", ErrorCode::NoMember),
    ("no signed-in account", ErrorCode::NoAccount),
    ("the team has no member", ErrorCode::UnknownMember),
    ("no change against", ErrorCode::NoChanges),
    (
        "pull request of the run is not open",
        ErrorCode::MergeClosed,
    ),
    ("no base branch", ErrorCode::NoBase),
    ("the base branch `", ErrorCode::NoBase),
    ("unknown project", ErrorCode::NotFound),
    ("unknown connection", ErrorCode::NotFound),
    ("unknown tool", ErrorCode::NotFound),
    ("unknown runner", ErrorCode::NotFound),
    ("unknown provider", ErrorCode::NotFound),
    ("unknown entry", ErrorCode::NotFound),
    ("unknown child project", ErrorCode::NotFound),
    ("unknown tile", ErrorCode::NotFound),
    ("unknown stack or agent", ErrorCode::NotFound),
    ("unknown member", ErrorCode::NotFound),
    ("no workflow `", ErrorCode::NotFound),
    ("no role `", ErrorCode::NotFound),
    ("no sheet `", ErrorCode::NotFound),
    ("no run ", ErrorCode::NotFound),
    ("no question ", ErrorCode::NotFound),
    ("no change ", ErrorCode::NotFound),
    ("no capability ", ErrorCode::NotFound),
    ("no entry `", ErrorCode::NotFound),
    ("no linked project", ErrorCode::NotFound),
    ("no ticket ", ErrorCode::NotFound),
    ("the finding is gone", ErrorCode::NotFound),
    ("the server is gone from that file", ErrorCode::NotFound),
    ("has no remote", ErrorCode::NoRemote),
    (
        "the remote address is not a web address",
        ErrorCode::NoRemote,
    ),
    ("looks like a secret", ErrorCode::SecretFound),
    ("too big", ErrorCode::FileTooBig),
    ("too large", ErrorCode::FileTooBig),
    ("is larger than", ErrorCode::FileTooBig),
    ("the file is over", ErrorCode::FileTooBig),
    ("the workbook is over", ErrorCode::FileTooBig),
    ("not a file under", ErrorCode::FileTooBig),
    ("not UTF-8 text", ErrorCode::FileUnsupported),
    ("is not a PNG file", ErrorCode::FileUnsupported),
    ("is not a text file", ErrorCode::FileUnsupported),
    ("no PEM certificate", ErrorCode::FileUnsupported),
    ("PEM block", ErrorCode::FileUnsupported),
    ("is not valid JSON", ErrorCode::FileUnsupported),
    ("is not an object", ErrorCode::FileUnsupported),
    ("is not a .docx file", ErrorCode::FileUnsupported),
    ("is not an .xlsx file", ErrorCode::FileUnsupported),
    ("the file is not a .", ErrorCode::FileUnsupported),
    ("a page is a .md file", ErrorCode::FileUnsupported),
    ("a JSON sheet", ErrorCode::FileUnsupported),
    ("is not a path of the project", ErrorCode::PathInvalid),
    ("path is not absolute", ErrorCode::PathInvalid),
    ("not an absolute file path", ErrorCode::PathInvalid),
    ("the path is not a file", ErrorCode::PathInvalid),
    ("the path is a folder", ErrorCode::PathInvalid),
    ("does not exist", ErrorCode::PathInvalid),
    ("no such file", ErrorCode::PathInvalid),
    ("path not allowed", ErrorCode::PathInvalid),
    ("fix path is not inside", ErrorCode::PathInvalid),
    ("invalid folder", ErrorCode::PathInvalid),
    ("a folder does not move into itself", ErrorCode::PathInvalid),
    ("already exists", ErrorCode::AlreadyExists),
    ("duplicate id", ErrorCode::AlreadyExists),
    ("changed on disk", ErrorCode::FileChanged),
    ("changed since the preview", ErrorCode::FileChanged),
    ("version changed", ErrorCode::FileChanged),
    ("no compass is pinned", ErrorCode::NoCompass),
    ("is not installed", ErrorCode::ToolMissing),
    ("did not start", ErrorCode::ToolMissing),
    ("node did not run", ErrorCode::ToolMissing),
    ("Orca is not running", ErrorCode::ToolMissing),
    ("tools endpoint is not running", ErrorCode::ToolMissing),
    ("did not answer", ErrorCode::ToolMissing),
    ("manager vanished", ErrorCode::ToolMissing),
    ("the orca command", ErrorCode::ToolMissing),
    ("` failed:", ErrorCode::ToolFailed),
    ("is not a tracker", ErrorCode::ConnectionKind),
    ("is not a forge", ErrorCode::ConnectionKind),
    (
        "the kind of a connection does not change",
        ErrorCode::ConnectionKind,
    ),
    ("need a GitLab connection", ErrorCode::ConnectionKind),
    ("refused the sign-in", ErrorCode::SignInFailed),
    ("gave no token for", ErrorCode::SignInFailed),
    ("device login: ", ErrorCode::SignInFailed),
    ("detached HEAD", ErrorCode::GitState),
    ("the run folder is on", ErrorCode::GitState),
    ("no working branch", ErrorCode::GitState),
    ("working branch before", ErrorCode::GitState),
    ("switch to the branch", ErrorCode::GitState),
    ("unstage your changes first", ErrorCode::GitState),
    ("is the base: no pull request", ErrorCode::GitState),
    ("is not cloned yet", ErrorCode::GitState),
    ("clone the child project first", ErrorCode::GitState),
    ("git could not list the files", ErrorCode::GitState),
    ("this thread already runs", ErrorCode::ThreadState),
    ("the thread has no message", ErrorCode::ThreadState),
    ("the thread waits for no permission", ErrorCode::ThreadState),
    ("switch the thread to agent mode", ErrorCode::ThreadState),
    ("nothing to retry", ErrorCode::ThreadState),
    ("the review was stopped", ErrorCode::Stopped),
    ("the test stopped", ErrorCode::Stopped),
    ("no import is planned", ErrorCode::ImportNotPlanned),
    ("turn the server on first", ErrorCode::ServerOff),
    ("server is not active", ErrorCode::ServerOff),
    ("is empty", ErrorCode::InputInvalid),
    ("a reason is needed", ErrorCode::InputInvalid),
    ("is not valid", ErrorCode::InputInvalid),
    ("has bad characters", ErrorCode::InputInvalid),
    ("is not an id", ErrorCode::InputInvalid),
    ("is not a plain run", ErrorCode::InputInvalid),
    ("is not a run id", ErrorCode::InputInvalid),
    ("is not a workflow id", ErrorCode::InputInvalid),
    ("bad commit id", ErrorCode::InputInvalid),
    ("bad project id", ErrorCode::InputInvalid),
    ("not a ref", ErrorCode::InputInvalid),
    ("not a dashboard name", ErrorCode::InputInvalid),
    ("not an ADR", ErrorCode::InputInvalid),
    ("not a flow file", ErrorCode::InputInvalid),
    ("not a question file", ErrorCode::InputInvalid),
    ("not a spec:", ErrorCode::InputInvalid),
    ("not a contract", ErrorCode::InputInvalid),
    ("method not allowed", ErrorCode::InputInvalid),
    ("the contract does not list", ErrorCode::InputInvalid),
    ("is not an absolute http", ErrorCode::InputInvalid),
    ("the body is not JSON", ErrorCode::InputInvalid),
    ("section titles", ErrorCode::InputInvalid),
    ("invalid view", ErrorCode::InputInvalid),
    ("not a scanner", ErrorCode::InputInvalid),
    ("not a runner", ErrorCode::InputInvalid),
    ("not a check of this project", ErrorCode::InputInvalid),
    ("not a host name", ErrorCode::InputInvalid),
    ("this tracker has no", ErrorCode::TrackerUnsupported),
    ("the tracker does not hold", ErrorCode::TrackerUnsupported),
    (
        "this is not a Figma project address",
        ErrorCode::FigmaAddress,
    ),
    ("needs a name", ErrorCode::InputInvalid),
    ("not a saved analysis", ErrorCode::PathInvalid),
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
        assert_eq!(e.action.unwrap().target, "/settings/project#tracker-scope");
        assert_eq!(AppError::from("odd").code, ErrorCode::Unknown);
        let e = AppError::from("a draft pull request cannot merge: mark it ready first");
        assert_eq!(e.action.unwrap().kind, ActionKind::Open);
        let e = AppError::from("HTTP 401: bad credentials");
        assert_eq!(
            e.action.unwrap().target,
            "/settings/connections#connections"
        );
        // An outage has no action: a forge outage must not read the tracker again.
        let e = AppError::from("network error: connection refused");
        assert_eq!((e.code, e.action), (ErrorCode::ForgeUnreachable, None));
        // A proxy that the OS trusts and the client does not: the person adds its certificate.
        let e = AppError::from("network error: invalid peer certificate: UnknownIssuer");
        assert_eq!(e.code, ErrorCode::CertUntrusted);
        assert_eq!(
            e.action.unwrap().target,
            "/settings/connections#certificates"
        );
        let e = AppError::from("invalid change id: Bad Id");
        assert_eq!((e.code, e.action), (ErrorCode::ChangeIdInvalid, None));
        let e = AppError::from("the terminal app is not installed: Kitty");
        assert_eq!(e.action.unwrap().target, "/settings/me#terminal-app");
        // A named member that is not in the team is not the signed-in person.
        let e = AppError::from("the team has no member `zed`");
        assert_eq!(e.code, ErrorCode::UnknownMember);
        assert_eq!(e.action.unwrap().target, "/work/team#add-member");
        // Each entry of the table is reached: an earlier needle never hides a later one.
        // Sample of the grouped codes: each gets its action, or none.
        let e = AppError::from("unknown project: zed");
        assert_eq!((e.code, e.action), (ErrorCode::NotFound, None));
        let e = AppError::from("the project has no remote");
        assert_eq!(e.code, ErrorCode::NoRemote);
        assert_eq!(e.action.unwrap().target, "/code/branches");
        let e = AppError::from("the orca command is not installed");
        assert_eq!(e.code, ErrorCode::ToolMissing);
        assert_eq!(e.action.unwrap().target, "/settings/health#tools");
        let e = AppError::from("the title is empty");
        assert_eq!(e.code, ErrorCode::InputInvalid);
        // The base branch text keeps the base code, not the missing-path code.
        let e = AppError::from("the base branch `dev` does not exist");
        assert_eq!(e.code, ErrorCode::NoBase);
        let e = AppError::from("a.docx does not exist");
        assert_eq!(e.code, ErrorCode::PathInvalid);
        let e = AppError::from("x.md holds what looks like a secret");
        assert_eq!(e.code, ErrorCode::SecretFound);
        let e = AppError::from("the pull request of the run is not open");
        assert_eq!(e.code, ErrorCode::MergeClosed);
        // A text that only shares words with a known one stays unknown.
        for text in [
            "ac gave no result",
            "the runner gave no text",
            "step s1 is not running",
        ] {
            assert_eq!(AppError::from(text).code, ErrorCode::Unknown, "{text}");
        }
        let e = AppError::from("device login: github.com gave no user_code: ");
        assert_eq!(e.code, ErrorCode::SignInFailed);
        for (needle, code) in KNOWN {
            assert_eq!(AppError::from(*needle).code, *code, "{needle}");
        }
    }
}
