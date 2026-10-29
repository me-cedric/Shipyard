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
