//! Artifact status, requirements and open markers of a change (spec `specs`). No I/O.

use serde::{Deserialize, Serialize};
use specta::Type;

/// The five artifacts of a change. The proposal sits at the change root; the others sit under
/// `specs/<capability>/`.
pub const ARTIFACTS: [&str; 5] = ["proposal", "spec", "plan", "checklist", "tasks"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ArtifactStatus {
    Missing,
    Draft,
    Done,
}

/// Missing without a file, done without a finding, draft otherwise (REQ-002).
pub fn status(exists: bool, findings: usize) -> ArtifactStatus {
    match (exists, findings) {
        (false, _) => ArtifactStatus::Missing,
        (true, 0) => ArtifactStatus::Done,
        (true, _) => ArtifactStatus::Draft,
    }
}

/// The path of an artifact inside the change folder.
pub fn artifact_path(artifact: &str, capability: &str) -> String {
    match artifact {
        "proposal" => "proposal.md".into(),
        _ => format!("specs/{capability}/{artifact}.md"),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Requirement {
    pub id: String,
    pub title: String,
    pub line: u32,
}

/// Each `### Requirement: REQ-NNN Title` line.
pub fn requirements(text: &str) -> Vec<Requirement> {
    text.lines()
        .zip(1..)
        .filter_map(|(l, line)| {
            let rest = l.strip_prefix("### Requirement: REQ-")?;
            let n = rest.bytes().take_while(u8::is_ascii_digit).count();
            let (num, title) = rest.split_at(n);
            (n >= 3 && (title.is_empty() || title.starts_with(' '))).then(|| Requirement {
                id: format!("REQ-{num}"),
                title: title.trim().to_string(),
                line,
            })
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Marker {
    pub line: u32,
    /// `Q-NNN`, when the marker cites one.
    pub question: Option<String>,
    pub text: String,
}

const OPEN: &str = "[NEEDS CLARIFICATION:";

/// Each `[NEEDS CLARIFICATION: ...]` marker (REQ-007).
pub fn markers(text: &str) -> Vec<Marker> {
    let mut out = Vec::new();
    for (l, line) in text.lines().zip(1..) {
        let mut rest = l;
        while let Some(i) = rest.find(OPEN) {
            let after = &rest[i + OPEN.len()..];
            let Some(end) = after.find(']') else { break };
            let text = after[..end].trim();
            let question = text
                .split_whitespace()
                .next()
                .filter(|q| {
                    q.strip_prefix("Q-")
                        .is_some_and(|n| n.len() >= 3 && n.bytes().all(|c| c.is_ascii_digit()))
                })
                .map(str::to_string);
            out.push(Marker {
                line,
                question,
                text: text.to_string(),
            });
            rest = &after[end..];
        }
    }
    out
}

/// Kebab-case: lowercase letters and digits in segments that a single hyphen joins (REQ-003).
pub fn valid_change_id(id: &str) -> bool {
    !id.is_empty()
        && id.split('-').all(|s| {
            !s.is_empty()
                && s.bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}
