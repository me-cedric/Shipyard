//! Reply parser and question states (spec `questions-loop`, REQ-002, REQ-010 to REQ-014,
//! REQ-018, REQ-020).

use shipyard_core::question::*;

fn opt(n: u32) -> Option<Choice> {
    Some(Choice::Option { n })
}

#[test]
fn number_letter_and_command_forms() {
    assert_eq!(parse_reply("2", 3, false), opt(2));
    assert_eq!(parse_reply("  3 \n", 3, false), opt(3));
    assert_eq!(parse_reply("a", 3, false), opt(1));
    assert_eq!(parse_reply("C", 3, false), opt(3));
    assert_eq!(parse_reply("/answer c", 3, false), opt(3));
    assert_eq!(parse_reply("/ANSWER 2", 3, false), opt(2));
    assert_eq!(parse_reply("/Answer   B", 3, true), opt(2));
}

#[test]
fn out_of_range_is_unclear_even_with_free_text() {
    assert_eq!(parse_reply("5", 3, false), None);
    assert_eq!(parse_reply("5", 3, true), None);
    assert_eq!(parse_reply("0", 3, true), None);
    assert_eq!(parse_reply("e", 3, true), None);
    assert_eq!(parse_reply("/answer d", 3, true), None);
}

#[test]
fn free_text_only_when_allowed() {
    let text = "Use Postgres, not SQLite";
    assert_eq!(
        parse_reply(text, 3, true),
        Some(Choice::Text { text: text.into() })
    );
    assert_eq!(parse_reply(text, 3, false), None);
    assert_eq!(
        parse_reply("/answer keep both", 2, true),
        Some(Choice::Text {
            text: "keep both".into()
        })
    );
    assert_eq!(parse_reply("/answer keep both", 2, false), None);
}

#[test]
fn empty_and_bare_command_are_unclear() {
    for t in ["", "   ", "/answer", "/answer   "] {
        assert_eq!(parse_reply(t, 3, true), None, "{t:?}");
    }
    // `/answered 2` is not the command: it is free text.
    assert_eq!(
        parse_reply("/answered 2", 3, true),
        Some(Choice::Text {
            text: "/answered 2".into()
        })
    );
}

fn question() -> Question {
    Question::new(
        "Q-012",
        "Which store?",
        vec!["SQLite".into(), "Postgres".into(), "Files".into()],
        1,
        false,
        None,
    )
    .unwrap()
}

#[test]
fn ask_shape_is_checked() {
    let two = vec!["a".to_string(), "b".to_string()];
    assert!(Question::new("Q-1", "q?", two.clone(), 2, true, None).is_ok());
    assert_eq!(
        Question::new("Q-1", "q?", vec!["a".into()], 1, false, None).unwrap_err(),
        AskError::OptionCount
    );
    assert_eq!(
        Question::new("Q-1", "q?", vec!["a".into(); 5], 1, false, None).unwrap_err(),
        AskError::OptionCount
    );
    assert_eq!(
        Question::new("Q-1", "q?", two.clone(), 3, false, None).unwrap_err(),
        AskError::Recommended
    );
    assert_eq!(
        Question::new("Q-1", " ", two.clone(), 1, false, None).unwrap_err(),
        AskError::Empty
    );
    assert_eq!(
        Question::new("Q-1", "q?", vec!["a".into(), " ".into()], 1, false, None).unwrap_err(),
        AskError::Empty
    );
    assert_eq!(
        Question::new("12", "q?", two, 1, false, None).unwrap_err(),
        AskError::Id
    );
}

#[test]
fn tracker_reply_answers_once() {
    let mut q = question();
    assert_eq!(q.state, QuestionState::Open);
    assert_eq!(q.reply("c1", "2"), Outcome::Answered);
    assert_eq!(q.state, QuestionState::Answered);
    let a = q.answer.clone().unwrap();
    assert_eq!(a.choice, Choice::Option { n: 2 });
    assert_eq!(
        a.source,
        AnswerSource::Tracker {
            comment: "c1".into()
        }
    );
    assert_eq!(a.text, "2");
    // A later reply or an Inbox answer is logged without effect (REQ-013).
    assert_eq!(q.reply("c2", "3"), Outcome::Late);
    assert_eq!(q.choose(Choice::Option { n: 1 }), Outcome::Late);
    assert_eq!(q.answer.unwrap().choice, Choice::Option { n: 2 });
}

#[test]
fn inbox_first_wins() {
    let mut q = question();
    assert_eq!(q.choose(Choice::Option { n: 1 }), Outcome::Answered);
    assert_eq!(q.answer.as_ref().unwrap().source, AnswerSource::Inbox);
    assert_eq!(q.reply("c9", "2"), Outcome::Late);
}

#[test]
fn unclear_reply_waits_and_shows_on_the_card() {
    let mut q = question();
    assert_eq!(q.reply("c1", "5"), Outcome::Unclear);
    assert_eq!(q.state, QuestionState::Open);
    assert_eq!(q.unclear.as_deref(), Some("5"));
    // The person chooses on the card.
    assert_eq!(q.choose(Choice::Option { n: 2 }), Outcome::Answered);
    assert_eq!(q.unclear, None);
    assert_eq!(q.answer.unwrap().choice, Choice::Option { n: 2 });
}

#[test]
fn inbox_choice_out_of_shape_is_refused() {
    let mut q = question();
    assert_eq!(q.choose(Choice::Option { n: 4 }), Outcome::Unclear);
    assert_eq!(
        q.choose(Choice::Text { text: "x".into() }),
        Outcome::Unclear
    );
    assert_eq!(q.state, QuestionState::Open);
}

#[test]
fn edit_after_detection_keeps_the_answer() {
    let mut q = question();
    q.reply("c1", "2");
    assert!(q.edit("c1"));
    assert!(q.edited);
    assert_eq!(q.answer.as_ref().unwrap().choice, Choice::Option { n: 2 });
    // Another comment, or an open question, needs no note.
    assert!(!q.edit("c7"));
    assert!(!question().edit("c1"));
}

#[test]
fn withdraw_and_lifecycle() {
    let mut q = question();
    assert!(q.withdraw());
    assert_eq!(q.state, QuestionState::Withdrawn);
    assert_eq!(q.reply("c1", "1"), Outcome::Closed);
    assert!(!q.withdraw());
    let mut done = question();
    done.reply("c1", "1");
    assert!(!done.withdraw());
    assert!(can_move(QuestionState::Open, QuestionState::Answered));
    assert!(can_move(QuestionState::Open, QuestionState::Withdrawn));
    assert!(!can_move(QuestionState::Answered, QuestionState::Open));
    assert!(!can_move(QuestionState::Withdrawn, QuestionState::Answered));
}

#[test]
fn run_waits_for_every_question() {
    let mut a = question();
    let mut b = question();
    b.id = "Q-013".into();
    assert!(!all_answered(&[a.clone(), b.clone()]));
    a.reply("c1", "1");
    assert!(!all_answered(&[a.clone(), b.clone()]));
    b.withdraw();
    assert!(all_answered(&[a, b]));
}
