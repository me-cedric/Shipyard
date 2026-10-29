//! The questions and the messages of the runs, over a fake runner (spec `questions-loop` T011,
//! REQ-008, REQ-011, REQ-020; `factory` REQ-019).

use shipyard_core::delivery::Lane;
use shipyard_core::pickup::Writes;
use shipyard_core::question::Choice;
use shipyard_core::run::RunState;
use shipyard_mcp::tools::agent::{AgentEvent as Tool, AgentEvents, Message};

use crate::factory::tests::{ask, binding, fx};
use crate::factory::{run_get, runs};

#[test]
fn a_question_waits_the_run_and_an_inbox_answer_resumes_it() {
    let fx = fx(Writes::default());
    let run = fx.start("SHIP-1");
    let f = &fx.s.factory.factory;
    f.emit(&binding(&run), Tool::AskQuestion(ask())).unwrap();
    assert_eq!(runs(&fx.s).unwrap()[0].lane, Lane::NeedsYou);
    assert_eq!(runs(&fx.s).unwrap()[0].open_questions, 1);

    let q = crate::questions::questions(&fx.s).unwrap();
    assert_eq!(q.len(), 1);
    assert_eq!(
        (q[0].key.as_str(), q[0].question.options.len()),
        ("SHIP-1", 2)
    );
    // A choice that is not an option does not answer.
    assert!(crate::questions::answer(&fx.s, &run, "Q-001", Choice::Option { n: 9 }).is_err());
    assert_eq!(
        run_get(&fx.s, &run).unwrap().unwrap().state,
        RunState::WaitingForAnswer
    );
    crate::questions::answer(&fx.s, &run, "Q-001", Choice::Option { n: 2 }).unwrap();
    assert_eq!(
        run_get(&fx.s, &run).unwrap().unwrap().state,
        RunState::Working
    );
    let q = crate::questions::questions(&fx.s).unwrap();
    assert_eq!(
        q[0].question.state,
        shipyard_core::question::QuestionState::Answered
    );
    assert_eq!(runs(&fx.s).unwrap()[0].open_questions, 0);
}

#[test]
fn a_message_to_the_person_is_listed_and_marked_read() {
    let fx = fx(Writes::default());
    let run = fx.start("SHIP-1");
    let msg = |t: &str| {
        Tool::Message(Message {
            to: "person".into(),
            text: t.into(),
        })
    };
    let f = &fx.s.factory.factory;
    f.emit(&binding(&run), msg("first")).unwrap();
    f.emit(&binding(&run), msg("second")).unwrap();
    let list = crate::questions::messages(&fx.s).unwrap();
    assert_eq!(
        list.iter()
            .map(|m| (m.n, m.text.as_str(), m.read))
            .collect::<Vec<_>>(),
        [(0, "first", false), (1, "second", false)]
    );
    assert_eq!(list[0].from, "work");
    crate::questions::message_read(&fx.s, &run, 1).unwrap();
    let list = crate::questions::messages(&fx.s).unwrap();
    assert_eq!((list[0].read, list[1].read), (false, true));
    assert!(crate::questions::message_read(&fx.s, &run, 5).is_err());
}
