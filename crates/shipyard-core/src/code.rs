//! Commit and branch name rules (spec `code`, REQ-008 and REQ-012). Pure functions, no I/O.

/// The commit types. A branch name starts with one of them.
pub const COMMIT_TYPES: [&str; 6] = ["feat", "fix", "chore", "docs", "refactor", "test"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NameError {
    /// The summary or the name has no text.
    Empty,
    /// The type is not in [`COMMIT_TYPES`], or the form is not `<type>(<scope>): <subject>`.
    BadType,
    /// The summary has a type and no subject.
    EmptySubject,
    /// A branch name needs `<type>/<area>/<kebab>`: three parts in lower case with hyphens.
    BadBranch,
}

impl NameError {
    /// An English text that names the allowed types. The view shows it as it is.
    pub fn message(self) -> String {
        let types = COMMIT_TYPES.join(", ");
        match self {
            Self::Empty => "the summary is empty".into(),
            Self::BadType => {
                format!("the summary must be `<type>(<scope>): <subject>`, type: {types}")
            }
            Self::EmptySubject => "the subject is empty".into(),
            Self::BadBranch => {
                format!("the branch must be `<type>/<area>/<kebab>`, type: {types}")
            }
        }
    }
}

/// Checks `<type>(<scope>): <subject>`. The scope is optional but not empty when its
/// parentheses are there. A long summary is fine: the 50 character advice is the view's.
pub fn check_summary(summary: &str) -> Result<(), NameError> {
    let s = summary.trim();
    if s.is_empty() {
        return Err(NameError::Empty);
    }
    let (head, subject) = s.split_once(':').ok_or(NameError::BadType)?;
    let (ty, scope) = match head.split_once('(') {
        Some((ty, rest)) => (ty, Some(rest.strip_suffix(')').ok_or(NameError::BadType)?)),
        None => (head, None),
    };
    if !COMMIT_TYPES.contains(&ty) || scope.is_some_and(|c| c.trim().is_empty()) {
        return Err(NameError::BadType);
    }
    if subject.trim().is_empty() {
        return Err(NameError::EmptySubject);
    }
    Ok(())
}

fn is_kebab(s: &str) -> bool {
    !s.is_empty()
        && s.split('-').all(|p| {
            !p.is_empty()
                && p.chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}

/// A file name that no automatic commit and no outside agent takes: `.git`, the environment
/// files, `*.pem`, `*.key` and a private key such as `id_rsa`. The case does not count.
pub fn is_secret_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n == ".git"
        || n.starts_with(concat!(".", "env"))
        || n.ends_with(".pem")
        || n.ends_with(".key")
        || (n.starts_with("id_") && !n.contains('.'))
}

/// Checks `<type>/<area>/<kebab>` for a branch that a person creates.
pub fn check_branch_name(name: &str) -> Result<(), NameError> {
    let mut parts = name.split('/');
    match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(ty), Some(area), Some(subject), None)
            if COMMIT_TYPES.contains(&ty) && is_kebab(area) && is_kebab(subject) =>
        {
            Ok(())
        }
        _ => Err(NameError::BadBranch),
    }
}

/// The first key of `known` that the text holds as a whole key: `SHIP-42` in
/// `feat/auth/SHIP-42-login` or in `fix(auth): SHIP-42 refuse`. `SHIP-4` never matches `SHIP-42`
/// and `XSHIP-42` never matches `SHIP-42` (REQ-009).
pub fn work_item_key<'a>(text: &str, known: &'a [String]) -> Option<&'a str> {
    let bytes = text.as_bytes();
    let word = |b: u8| b.is_ascii_alphanumeric();
    known.iter().map(String::as_str).find(|k| {
        !k.is_empty()
            && text.match_indices(k).any(|(i, _)| {
                let before = i == 0 || !word(bytes[i - 1]);
                let after = bytes.get(i + k.len()).is_none_or(|b| !word(*b));
                before && after
            })
    })
}

/// The refs of a commit (REQ-009): `wi:<key>` from the branch or the message, `run:<id>` when a
/// run made it. A work item that is not in `known` is no link.
pub fn commit_refs(
    branch: &str,
    message: &str,
    known: &[String],
    run: Option<&str>,
) -> Vec<String> {
    let mut out = Vec::new();
    for text in [branch, message] {
        if let Some(k) = work_item_key(text, known) {
            let r = format!("wi:{k}");
            if !out.contains(&r) {
                out.push(r);
            }
        }
    }
    if let Some(id) = run.filter(|r| !r.is_empty()) {
        out.push(format!("run:{id}"));
    }
    out
}

/// The run id of a commit that a run made: the `run:<id>` token in its message (REQ-009).
pub fn run_in_message(message: &str) -> Option<&str> {
    let at = message.find("run:")?;
    let id: &str = message[at + 4..]
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'))
        .next()?;
    (!id.is_empty()).then_some(id)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DigestError {
    /// The digest holds a file path (REQ-031).
    Path(String),
    /// The digest holds a technical trace.
    Trace(String),
    /// The digest holds a secret value.
    Secret,
}

impl DigestError {
    pub fn message(&self) -> String {
        match self {
            Self::Path(p) => format!("the digest holds a file path: {p}"),
            Self::Trace(t) => format!("the digest holds a technical trace: {t}"),
            Self::Secret => "the digest holds a secret value".into(),
        }
    }
}

/// Checks a PM digest: no secret value, no file path, no technical trace (REQ-031).
/// shortcut: a path is a word with a `/` or `\` and a dot or a leading `.`, `~` or drive; a
/// plain fraction like `3/4` passes. Tighten it if a real digest slips through.
pub fn check_digest(text: &str, secrets: &[&str]) -> Result<(), DigestError> {
    if secrets.iter().any(|s| s.len() >= 4 && text.contains(s)) {
        return Err(DigestError::Secret);
    }
    for marker in [
        "Traceback",
        "stack backtrace",
        "panicked at",
        "Exception in",
        "\n    at ",
    ] {
        if text.contains(marker) {
            return Err(DigestError::Trace(marker.trim().into()));
        }
    }
    for w in text.split_whitespace() {
        let w = w.trim_matches(|c: char| "()[]{}<>\"'`,;:".contains(c));
        let sep = w.contains('/') || w.contains('\\');
        let pathy = w.starts_with(['.', '~'])
            || w.contains('.')
            || w.as_bytes().get(1) == Some(&b':')
            || w.starts_with('/');
        if sep && pathy && w.len() > 2 && !w.starts_with("http") {
            return Err(DigestError::Path(w.into()));
        }
    }
    Ok(())
}
