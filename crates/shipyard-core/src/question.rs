//! Questions of the human-in-the-loop step: the `ask_question` shape, the reply parser and the
//! question states (spec `questions-loop`, REQ-002, REQ-010 to REQ-014, REQ-018, REQ-020).
//! No I/O: the engine detects the reply (`pickup::answers`) and logs each outcome.

use std::fmt;

use serde::{Deserialize, Serialize};
use specta::Type;

pub const MIN_OPTIONS: usize = 2;
pub const MAX_OPTIONS: usize = 4;

/// An answer: an option number from 1, or free text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Choice {
    Option { n: u32 },
    Text { text: String },
}

enum Pick {
    In(u32),
    Out,
    NotAForm,
}

/// A bare number, or one letter (A is option 1).
fn pick(word: &str, options: usize) -> Pick {
    let n = if !word.is_empty() && word.len() <= 3 && word.bytes().all(|b| b.is_ascii_digit()) {
        word.parse::<u32>().unwrap_or(0)
    } else if let [b] = word.as_bytes() {
        if !b.is_ascii_alphabetic() {
            return Pick::NotAForm;
        }
        u32::from(b.to_ascii_lowercase() - b'a') + 1
    } else {
        return Pick::NotAForm;
    };
    if (1..=options as u32).contains(&n) {
        Pick::In(n)
    } else {
        Pick::Out
    }
}

/// Read a reply (REQ-010, REQ-011). `None` is an unclear reply: it never resumes the run.
/// Forms: `2`, `b`, `/answer B`, any case. A number or letter out of range is unclear, also when
/// free text is allowed. Other text is free text when the question allows it.
pub fn parse_reply(text: &str, options: usize, free_text: bool) -> Option<Choice> {
    let t = text.trim();
    let head = t.get(..7).filter(|h| h.eq_ignore_ascii_case("/answer"));
    let body = match head.map(|_| &t[7..]) {
        Some(rest) if rest.is_empty() || rest.starts_with(char::is_whitespace) => rest.trim(),
        _ => t,
    };
    if body.is_empty() {
        return None;
    }
    match pick(body, options) {
        Pick::In(n) => Some(Choice::Option { n }),
        Pick::Out => None,
        Pick::NotAForm => free_text.then(|| Choice::Text { text: body.into() }),
    }
}

/// REQ-020. Adapted from the lifecycle of Legacy `src/lib/raid.ts` (`ALLOWED_NEXT`): Shipyard
/// has no `assigned` state, and the fold (`specs`) is not a question state.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum QuestionState {
    #[default]
    Open,
    Answered,
    /// The ticket became terminal before an answer (REQ-018).
    Withdrawn,
}

pub fn can_move(from: QuestionState, to: QuestionState) -> bool {
    from == QuestionState::Open && to != QuestionState::Open
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AnswerSource {
    Inbox,
    Tracker { comment: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Answer {
    pub choice: Choice,
    pub source: AnswerSource,
    /// The reply text as it stood at detection (REQ-012). Empty for an Inbox choice.
    pub text: String,
}

/// What a reply or a choice did. The engine logs each one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Answered,
    /// Not an answer: the card shows it (REQ-011).
    Unclear,
    /// The question had an answer already. Log it, change nothing (REQ-013).
    Late,
    /// The question was withdrawn.
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AskError {
    /// The id is not `Q-<digits>`.
    Id,
    Empty,
    OptionCount,
    Recommended,
}

impl fmt::Display for AskError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Id => "the question id must be Q-NNN",
            Self::Empty => "the question and each option need text",
            Self::OptionCount => "a question needs two to four options",
            Self::Recommended => "the recommended option must be one of the options",
        })
    }
}

impl std::error::Error for AskError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Question {
    /// `Q-NNN`. The entity is `q:Q-NNN`.
    pub id: String,
    pub question: String,
    pub options: Vec<String>,
    /// From 1.
    pub recommended: u32,
    pub free_text: bool,
    /// The spec ref of a spec-level question (`spec:<capability>#REQ-NNN`).
    pub spec: Option<String>,
    pub state: QuestionState,
    pub answer: Option<Answer>,
    /// The last unclear reply, for the card (REQ-011).
    pub unclear: Option<String>,
    /// The answer comment changed after detection: the card shows a note (REQ-012).
    pub edited: bool,
}

impl Question {
    /// Check the `ask_question` shape (REQ-002).
    pub fn new(
        id: &str,
        question: &str,
        options: Vec<String>,
        recommended: u32,
        free_text: bool,
        spec: Option<String>,
    ) -> Result<Self, AskError> {
        let digits = id.strip_prefix("Q-").unwrap_or("");
        if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
            return Err(AskError::Id);
        }
        if !(MIN_OPTIONS..=MAX_OPTIONS).contains(&options.len()) {
            return Err(AskError::OptionCount);
        }
        if question.trim().is_empty() || options.iter().any(|o| o.trim().is_empty()) {
            return Err(AskError::Empty);
        }
        if !(1..=options.len() as u32).contains(&recommended) {
            return Err(AskError::Recommended);
        }
        Ok(Self {
            id: id.into(),
            question: question.into(),
            options,
            recommended,
            free_text,
            spec,
            state: QuestionState::Open,
            answer: None,
            unclear: None,
            edited: false,
        })
    }

    fn take(&mut self, choice: Option<Choice>, source: AnswerSource, text: &str) -> Outcome {
        match self.state {
            QuestionState::Answered => return Outcome::Late,
            QuestionState::Withdrawn => return Outcome::Closed,
            QuestionState::Open => {}
        }
        let Some(choice) = choice else {
            return Outcome::Unclear;
        };
        self.state = QuestionState::Answered;
        self.unclear = None;
        self.answer = Some(Answer {
            choice,
            source,
            text: text.into(),
        });
        Outcome::Answered
    }

    /// The first human reply after the marker, with its text at detection (REQ-009, REQ-010).
    pub fn reply(&mut self, comment: &str, text: &str) -> Outcome {
        let choice = parse_reply(text, self.options.len(), self.free_text);
        let source = AnswerSource::Tracker {
            comment: comment.into(),
        };
        let out = self.take(choice, source, text.trim());
        if out == Outcome::Unclear {
            self.unclear = Some(text.trim().into());
        }
        out
    }

    /// An answer in the Inbox, or a choice on the card of an unclear reply (REQ-008, REQ-011).
    pub fn choose(&mut self, choice: Choice) -> Outcome {
        let valid = match &choice {
            Choice::Option { n } => (1..=self.options.len() as u32).contains(n),
            Choice::Text { text } => self.free_text && !text.trim().is_empty(),
        };
        self.take(valid.then_some(choice), AnswerSource::Inbox, "")
    }

    /// A comment changed. `true` when it is the answer: log the edit and keep the answer.
    pub fn edit(&mut self, comment: &str) -> bool {
        let hit = matches!(
            &self.answer,
            Some(Answer { source: AnswerSource::Tracker { comment: c }, .. }) if c == comment
        );
        self.edited |= hit;
        hit
    }

    /// Close an open question with no answer (REQ-018). `false` when it was not open.
    pub fn withdraw(&mut self) -> bool {
        let ok = can_move(self.state, QuestionState::Withdrawn);
        if ok {
            self.state = QuestionState::Withdrawn;
        }
        ok
    }
}

/// The run leaves `WaitingForAnswer` only when no question of it is open (REQ-014).
pub fn all_answered(questions: &[Question]) -> bool {
    questions.iter().all(|q| q.state != QuestionState::Open)
}
