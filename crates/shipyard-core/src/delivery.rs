//! Pure rules of delivery: branch name, base choice, labels, pull request title and body, the
//! impacts digest and the lane of a run (spec `delivery`, REQ-007, REQ-009, REQ-010, REQ-011,
//! REQ-021, REQ-027; `factory` REQ-038). No I/O: the engine reads the forge and the run log.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::run::RunState;
use crate::work_item::WorkKind;

const MAX_KEBAB: usize = 60;

/// Branch prefixes that a coding tool gives. The branch gets a new name before the first push.
pub const TOOL_PREFIXES: [&str; 6] = [
    "claude/",
    "codex/",
    "copilot/",
    "cursor/",
    "gemini/",
    "opencode/",
];

fn fold(c: char) -> &'static str {
    match c {
        'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' => "a",
        'ç' => "c",
        'è' | 'é' | 'ê' | 'ë' => "e",
        'ì' | 'í' | 'î' | 'ï' => "i",
        'ñ' => "n",
        'ò' | 'ó' | 'ô' | 'ö' | 'õ' | 'ø' => "o",
        'ù' | 'ú' | 'û' | 'ü' => "u",
        'ý' | 'ÿ' => "y",
        'ß' => "ss",
        'œ' => "oe",
        'æ' => "ae",
        _ => "-",
    }
}

/// Lowercase ASCII words joined by `-`, 60 characters at most. Accents fold, every other
/// character is a separator.
pub fn kebab(text: &str) -> String {
    let mut out = String::new();
    for c in text.chars().flat_map(char::to_lowercase) {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else {
            out.push_str(fold(c));
        }
    }
    let words: Vec<&str> = out.split('-').filter(|w| !w.is_empty()).collect();
    let mut joined = words.join("-");
    joined.truncate(MAX_KEBAB);
    joined.trim_end_matches('-').to_string()
}

/// `<type>/<area>/<kebab>` (REQ-007). An empty part becomes `general` or `change`.
pub fn branch_name(ty: &str, area: &str, subject: &str) -> String {
    let or = |s: String, d: &str| if s.is_empty() { d.to_string() } else { s };
    format!(
        "{ty}/{}/{}",
        or(kebab(area), "general"),
        or(kebab(subject), "change")
    )
}

/// The conventional type of a ticket kind.
pub fn commit_type(kind: WorkKind) -> &'static str {
    match kind {
        WorkKind::Bug => "fix",
        _ => "feat",
    }
}

pub fn is_tool_branch(name: &str) -> bool {
    TOOL_PREFIXES.iter().any(|p| name.starts_with(p))
}

/// `<type>(<scope>): <subject>`, the commit and the pull request title (REQ-008, REQ-010).
pub fn conventional(ty: &str, scope: &str, subject: &str) -> String {
    let subject = strip_attribution(subject);
    if scope.is_empty() {
        format!("{ty}: {subject}")
    } else {
        format!("{ty}({scope}): {subject}")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BaseError {
    /// A feature pull request never goes onto a release branch.
    Release(String),
}

/// The declared base, else `develop` when it exists, else the default branch (REQ-009).
pub fn base_branch(
    declared: Option<&str>,
    branches: &[String],
    default: &str,
) -> Result<String, BaseError> {
    let base = declared
        .or(branches.iter().any(|b| b == "develop").then_some("develop"))
        .unwrap_or(default);
    if base.starts_with("release") {
        Err(BaseError::Release(base.into()))
    } else {
        Ok(base.into())
    }
}

/// Label names of each conventional type, in order of preference.
fn type_labels(ty: &str) -> &'static [&'static str] {
    match ty {
        "feat" => &["feat", "feature", "enhancement"],
        "fix" => &["fix", "bug", "bugfix"],
        "docs" => &["docs", "documentation"],
        "refactor" => &["refactor", "refactoring"],
        "test" => &["test", "tests", "testing"],
        "perf" => &["perf", "performance"],
        "chore" => &["chore", "maintenance"],
        "ci" => &["ci"],
        "build" => &["build"],
        _ => &[],
    }
}

/// The labels to add (REQ-011): one type label, then each area label whose name is a folder of
/// a changed path (`ui`, `area:ui` or `area/ui`). Only labels in `existing`, in its spelling.
/// The result only adds: the caller keeps every label that a person set.
pub fn pr_labels(existing: &[String], ty: &str, paths: &[String]) -> Vec<String> {
    let find = |name: &str| existing.iter().find(|l| l.eq_ignore_ascii_case(name));
    let mut out: Vec<String> = type_labels(ty)
        .iter()
        .find_map(|n| find(n))
        .into_iter()
        .cloned()
        .collect();
    let folders = paths
        .iter()
        .flat_map(|p| p.rsplit_once('/').map_or("", |(dir, _)| dir).split('/'))
        .filter(|f| !f.is_empty());
    for f in folders {
        let hit = existing.iter().find(|l| {
            let name = l
                .strip_prefix("area:")
                .or_else(|| l.strip_prefix("area/"))
                .unwrap_or(l);
            name.eq_ignore_ascii_case(f)
        });
        if let Some(l) = hit.filter(|l| !out.contains(l)) {
            out.push(l.clone());
        }
    }
    out
}

/// Remove every line that holds an AI attribution (REQ-008, REQ-010, REQ-024): a `Co-Authored-By`
/// line or `generated with`. The robot sign is deleted from the line that holds it, so a title
/// keeps its words and `check_message` of `shipyard-git` finds nothing to refuse.
pub fn strip_attribution(text: &str) -> String {
    text.lines()
        .filter_map(|l| {
            let plain = l.replace('\u{1F916}', "");
            let lower = plain.trim().to_lowercase();
            if lower.starts_with("co-authored-by:") || lower.contains("generated with") {
                return None;
            }
            Some(if plain.len() == l.len() {
                l.to_string()
            } else {
                plain.trim().to_string()
            })
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Break each `@name` and each `[~id]` (Jira) with a zero-width space: a tracker or a forge does
/// not notify a person for text that an agent or a ticket wrote. An address (`a@b.c`) stays.
pub fn neutralize_mentions(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut prev = None::<char>;
    for c in text.chars() {
        out.push(c);
        if c == '@' && !prev.is_some_and(char::is_alphanumeric) {
            out.push('\u{200B}');
        }
        prev = Some(c);
    }
    out.replace("[~", "[\u{200B}~")
}

/// The rule for text that Shipyard posts to a tracker or a forge: no attribution, no mention.
pub fn clean_outgoing(text: &str) -> String {
    neutralize_mentions(&strip_attribution(text))
}

/// One gate command and its exact counts from the run log (REQ-006).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct GateCheck {
    pub command: String,
    pub passed: bool,
    pub counts: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TicketLine {
    pub key: String,
    pub title: String,
    pub url: String,
}

/// The pull request body (REQ-010, REQ-027). Every count comes from the run log as it stands.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PrBody {
    pub opening: String,
    pub gate: Vec<GateCheck>,
    pub tickets: Vec<TicketLine>,
    /// The impacts digest of `code`, when it gave one.
    pub impacts: Option<String>,
}

impl PrBody {
    /// Opening paragraph, gate, one item for each ticket, then the impacts digest.
    pub fn render(&self) -> String {
        let mut out = format!("{}\n\n## Gate\n\n", self.opening.trim());
        for g in &self.gate {
            let verdict = if g.passed { "passed" } else { "failed" };
            out += &format!("- `{}`: {verdict}, {}\n", g.command, g.counts);
        }
        out += "\n## Tickets\n\n";
        for t in &self.tickets {
            out += &format!("- [{}]({}) {}\n", t.key, t.url, t.title);
        }
        if let Some(digest) = self.impacts.as_deref().filter(|d| !d.trim().is_empty()) {
            out += &format!("\n## Impacts\n\n{}\n", digest.trim());
        }
        strip_attribution(&out) + "\n"
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Ci {
    Passing,
    Failing,
    Pending,
}

/// What the forge says about the pull request of a `PROpen` run (REQ-021).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PrSignal {
    pub ci: Ci,
    pub changes_requested: bool,
    pub draft: bool,
}

/// The six lanes of Factory / Runs, in order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Lane {
    Queued,
    Working,
    NeedsYou,
    InReview,
    ReadyToMerge,
    Done,
}

impl Lane {
    pub const ALL: [Lane; 6] = [
        Self::Queued,
        Self::Working,
        Self::NeedsYou,
        Self::InReview,
        Self::ReadyToMerge,
        Self::Done,
    ];
}

/// The lane of a run (`factory` REQ-038). A `PROpen` run is ready to merge only with passing
/// CI, no change request and no draft. With no signal yet, it is in review.
pub fn lane(state: RunState, pr: Option<&PrSignal>) -> Lane {
    use RunState as S;
    match state {
        S::Queued | S::Claimed | S::RetryQueued => Lane::Queued,
        S::Planning | S::Working | S::SelfReview | S::ChangesRequested => Lane::Working,
        S::PlanReview | S::WaitingForAnswer | S::Blocked | S::Paused | S::Failed => Lane::NeedsYou,
        S::Merged | S::Done | S::Cancelled => Lane::Done,
        S::PROpen => match pr {
            Some(p) if p.ci == Ci::Passing && !p.changes_requested && !p.draft => {
                Lane::ReadyToMerge
            }
            _ => Lane::InReview,
        },
    }
}
