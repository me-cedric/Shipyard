//! The fold preview of an answer into the Clarifications of its spec (spec `questions-loop`,
//! REQ-015). Pure: it reads text and returns text. The write after a click belongs to `specs`
//! REQ-015, which writes `Fold::after`.
//!
//! The place follows `specs` REQ-015: `### Clarifications` at the end of `## Purpose`, never a new
//! `## ` section. The bullet is `- Q-NNN <question>: <answer>`, the same text that the Questions view
//! shows in its preview. `fold` is the write path of the Specs space: the same preview, as text.

use std::fmt;

use crate::raid::{Item, Status};

/// One change, in the numbers of the old text. `removed` lines start at `line`. With none removed,
/// `added` goes in before `line`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Edit {
    pub line: usize,
    pub removed: Vec<String>,
    pub added: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fold {
    /// The whole spec after the fold. No edit means that it equals the input.
    pub after: String,
    pub edits: Vec<Edit>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FoldError {
    /// The question has no answer, or it is not in the `answered` state.
    NotAnswered,
    /// The spec has no `## Purpose` for a new `### Clarifications`.
    NoPurpose,
    /// The fold would add or remove a `## ` section (the answer starts a line with `## `).
    Sections,
}

impl fmt::Display for FoldError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::NotAnswered => "the question has no answer to fold",
            Self::NoPurpose => "the spec has no `## Purpose` section",
            Self::Sections => "the fold would change the sections",
        })
    }
}

impl std::error::Error for FoldError {}

/// One line: the white space of a text collapses.
fn flat(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Each marker `[NEEDS CLARIFICATION: <id> ...]` of the line and its working assumption, replaced by
/// the answer. A marker of another id stays. Returns `None` when the line has none.
fn replace_marker(line: &str, id: &str, answer: &str) -> Option<String> {
    let open = "[NEEDS CLARIFICATION:";
    let (mut out, mut from, mut hit) = (String::new(), 0, false);
    while let Some(at) = line[from..].find(open).map(|i| i + from) {
        let rest = line[at + open.len()..].trim_start();
        let named = rest
            .strip_prefix(id)
            .is_some_and(|r| r.starts_with([' ', ']']));
        let Some(close) = line[at..].find(']').map(|i| i + at) else {
            break;
        };
        if !named {
            out.push_str(&line[from..at + open.len()]);
            from = at + open.len();
            continue;
        }
        let mut end = close + 1;
        // shortcut: the sentence ends at the first ". " or at the end of the line, so an
        // "e.g. " inside a working assumption cuts it short. Upgrade when a spec needs it.
        let tail = line[end..].trim_start();
        if tail.starts_with("Working assumption:") {
            let sentence = tail
                .match_indices('.')
                .find(|(i, _)| tail[i + 1..].is_empty() || tail[i + 1..].starts_with(' '))
                .map_or(tail.len(), |(i, _)| i + 1);
            end = line.len() - tail.len() + sentence;
        }
        out.push_str(&line[from..at]);
        out.push_str(answer);
        from = end;
        hit = true;
    }
    out.push_str(&line[from..]);
    hit.then_some(out)
}

fn heading_level(l: &str) -> usize {
    let n = l.bytes().take_while(|&b| b == b'#').count();
    if l[n..].starts_with(' ') { n } else { 0 }
}

pub fn fold_preview(spec: &str, item: &Item) -> Result<Fold, FoldError> {
    if item.status != Some(Status::Answered) || item.answer.trim().is_empty() {
        return Err(FoldError::NotAnswered);
    }
    let crlf = spec.contains("\r\n");
    let src = spec.replace("\r\n", "\n");
    let lines: Vec<&str> = src.split('\n').collect();
    let answer = flat(&item.answer);
    let mut edits = Vec::new();

    for (i, l) in lines.iter().enumerate() {
        if let Some(new) = replace_marker(l, &item.id, &answer) {
            edits.push(Edit {
                line: i + 1,
                removed: vec![l.to_string()],
                added: vec![new],
            });
        }
    }

    let question = flat(item.question.lines().next().unwrap_or(""));
    let bullet = format!("- {} {question}: {answer}", item.id);
    let section_end = |start: usize, level: usize| {
        lines[start + 1..]
            .iter()
            .position(|l| (1..=level).contains(&heading_level(l)))
            .map_or(lines.len(), |p| start + 1 + p)
    };
    // After the last non-blank line of a section: the blank lines before the next heading stay.
    let after_content = |start: usize, end: usize| {
        lines[start..end]
            .iter()
            .rposition(|l| !l.trim().is_empty())
            .map_or(start + 1, |p| start + p + 1)
    };
    let heading = lines
        .iter()
        .position(|l| l.trim().eq_ignore_ascii_case("### Clarifications"));
    let insert = match heading {
        Some(h) => {
            let at = after_content(h, section_end(h, 3));
            (!lines[h..at].contains(&bullet.as_str())).then(|| (at, vec![bullet]))
        }
        None => {
            let p = lines
                .iter()
                .position(|l| l.trim() == "## Purpose")
                .ok_or(FoldError::NoPurpose)?;
            let at = after_content(p, section_end(p, 2));
            let block = ["".into(), "### Clarifications".into(), "".into(), bullet];
            Some((at, block.to_vec()))
        }
    };
    if let Some((at, added)) = insert {
        edits.push(Edit {
            line: at + 1,
            removed: Vec::new(),
            added,
        });
    }

    edits.sort_by_key(|e| e.line);
    let mut out: Vec<String> = lines.iter().map(|l| l.to_string()).collect();
    // From the bottom, so an edit never moves the lines of the next one.
    for e in edits.iter().rev() {
        out.splice(e.line - 1..e.line - 1 + e.removed.len(), e.added.clone());
    }
    let after = out.join("\n");
    let h2 = |t: &str| t.lines().filter(|l| l.starts_with("## ")).count();
    if h2(&after) != h2(&src) {
        return Err(FoldError::Sections);
    }
    Ok(Fold {
        after: if crlf {
            after.replace('\n', "\r\n")
        } else {
            after
        },
        edits,
    })
}

/// The text of the spec after the fold of one answer. It refuses a question or an answer of more
/// than one line, and a spec where no marker cites `question_id`: a write needs a marker to replace.
pub fn fold(
    spec: &str,
    question_id: &str,
    question: &str,
    answer: &str,
) -> std::result::Result<String, String> {
    if question.contains('\n') || answer.contains('\n') {
        return Err("the question and the answer must be one line".into());
    }
    let item = Item {
        id: question_id.into(),
        question: question.into(),
        answer: answer.into(),
        status: Some(Status::Answered),
        ..Item::default()
    };
    let f = fold_preview(spec, &item).map_err(|e| e.to_string())?;
    if f.edits.iter().all(|e| e.removed.is_empty()) {
        return Err(format!("no marker cites {question_id}"));
    }
    Ok(f.after)
}
