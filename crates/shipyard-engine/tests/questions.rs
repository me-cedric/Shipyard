//! The questions loop in the engine (spec `questions-loop`, REQ-001, REQ-002, REQ-004 to REQ-007,
//! REQ-009, REQ-011 to REQ-014, REQ-016 to REQ-019). A fake tracker writer and a fake clock.

mod fx;

use std::collections::HashSet;

use fx::{Fx, ONE, SOURCE, writes};
use shipyard_core::pickup::{SyncEvent, Writes};
use shipyard_core::question::{Choice, QuestionState};
use shipyard_core::run::RunState;
use shipyard_engine::approvals::Write;
use shipyard_engine::fake::comment;
use shipyard_engine::handoff::comment_events;
use shipyard_engine::ports::{AgentEvent, Dispatch};
use shipyard_mcp::session::Binding;
use shipyard_mcp::tools::agent::{AgentEvent as Tool, AgentEvents, AskQuestion, QuestionKind};

fn ask(options: usize, recommended: u32, spec: Option<&str>) -> AskQuestion {
    AskQuestion {
        question: "Which scope?".into(),
        options: (1..=options).map(|n| format!("option {n}")).collect(),
        recommended,
        free_text: false,
        kind: if spec.is_some() {
            QuestionKind::Spec
        } else {
            QuestionKind::Ticket
        },
        spec: spec.map(Into::into),
    }
}

/// A run in `Working` with its agent on the session `s-1`.
fn working(w: Writes) -> (Fx, String) {
    let fx = Fx::new(w, &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    fx.event("work", AgentEvent::Session { id: "s-1".into() });
    assert_eq!(fx.state(&run), RunState::Working);
    (fx, run)
}

fn reply(fx: &Fx, id: &str, body: &str, q: &str) {
    let e = SyncEvent::Comment {
        key: "SHIP-1".into(),
        comment: comment(id, body),
        answers: Some(q.into()),
    };
    fx.f.event(&e).unwrap();
}

fn comments(fx: &Fx) -> Vec<String> {
    fx.writer
        .sent()
        .into_iter()
        .filter_map(|w| match w {
            Write::Comment { body, .. } => Some(body),
            _ => None,
        })
        .collect()
}

#[test]
fn the_shape_is_checked() {
    let (fx, run) = working(writes(true));
    let five = fx.f.ask(&run, "work", ask(5, 1, None)).unwrap_err();
    assert!(five.contains("two to four"), "{five}");
    assert!(fx.f.ask(&run, "work", ask(3, 0, None)).is_err());
    assert!(fx.f.ask(&run, "work", ask(1, 1, None)).is_err());
    let mut spec = ask(3, 1, None);
    spec.kind = QuestionKind::Spec;
    assert!(fx.f.ask(&run, "work", spec).is_err());
    assert_eq!(fx.state(&run), RunState::Working);
}

#[test]
fn ask_waits_moves_the_ticket_and_posts_one_comment() {
    let (fx, run) = working(writes(true));
    let id = fx.f.ask(&run, "work", ask(3, 2, None)).unwrap();
    assert_eq!(id, "Q-001");
    let info = fx.f.run_info(&run).unwrap();
    assert_eq!(info.run.state, RunState::WaitingForAnswer);
    assert_eq!(info.run.return_to, Some(RunState::Working));
    assert!(fx.agents.running().is_empty());
    assert!(fx.writer.sent().contains(&Write::Transition {
        key: "SHIP-1".into(),
        status: "Needs info".into()
    }));
    let posted = comments(&fx);
    assert_eq!(posted.len(), 1);
    let body = &posted[0];
    assert!(body.starts_with("<!-- shipyard:q Q-001 -->"));
    assert!(body.contains("1. option 1\n2. option 2 (recommended)\n3. option 3"));
    assert!(body.ends_with("`/answer B`."));
    // The comment id is stored: only that comment is a marker for `answers`.
    let stored = fx
        .mirror
        .lock()
        .unwrap()
        .questions(SOURCE, "SHIP-1")
        .unwrap();
    let n = fx
        .writer
        .sent()
        .iter()
        .position(|w| matches!(w, Write::Comment { .. }))
        .unwrap();
    assert_eq!(stored, HashSet::from([format!("c{}", n + 1)]));
    // No RAID file for a ticket question.
    assert!(
        !fx.dir
            .path()
            .join("docs/delivery/questions/Q-001.md")
            .exists()
    );
}

#[test]
fn switch_off_makes_the_move_and_the_comment_approvals() {
    let (fx, run) = working(Writes::default());
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    // The ticket moves of the start wait too: the newer move replaced them.
    let new: Vec<Write> = fx.f.approvals().iter().map(|a| a.write.clone()).collect();
    assert_eq!(new.len(), 3);
    assert!(
        new.iter()
            .any(|w| matches!(w, Write::Transition { status, .. } if status == "Needs info"))
    );
    assert!(new.iter().any(|w| matches!(w, Write::Comment { .. })));
    // An answer in the Inbox still resumes the run.
    fx.f.answer(&run, "Q-001", Choice::Option { n: 1 }).unwrap();
    assert_eq!(fx.state(&run), RunState::Working);
}

#[test]
fn a_tracker_with_no_comments_gets_none() {
    let (fx, run) = working(writes(true));
    fx.writer.set_can_comment(false);
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    assert!(comments(&fx).is_empty());
    assert!(fx.f.approvals().is_empty());
}

#[test]
fn a_spec_question_gets_a_raid_file_and_the_next_id() {
    let (fx, run) = working(writes(true));
    let dir = fx.dir.path().join("docs/delivery/questions");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("Q-012.md"), "# Q-012\n").unwrap();
    let id =
        fx.f.ask(&run, "work", ask(3, 1, Some("spec:projects#REQ-003")))
            .unwrap();
    assert_eq!(id, "Q-013");
    let text = std::fs::read_to_string(dir.join("Q-013.md")).unwrap();
    assert!(text.contains("spec:projects#REQ-003"), "{text}");
}

#[test]
fn a_reply_resumes_the_session_with_the_answer() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(3, 1, None)).unwrap();
    // The tick finds the first human reply after the stored marker.
    let posted = fx
        .mirror
        .lock()
        .unwrap()
        .questions(SOURCE, "SHIP-1")
        .unwrap();
    let marker = comment(posted.iter().next().unwrap(), &comments(&fx)[0]);
    let thread = [marker, comment("9", "2"), comment("10", "3")];
    let (events, _) = comment_events(
        "SHIP-1",
        &thread,
        &HashSet::from(["#baseline".into()]),
        &posted,
    );
    // The marker itself answers nothing.
    assert_eq!(events.len(), 3);
    for e in &events {
        fx.f.event(e).unwrap();
    }
    let info = fx.f.run_info(&run).unwrap();
    assert_eq!(info.run.state, RunState::Working);
    let q = &fx.f.questions()[0].1;
    assert_eq!(q.answer.as_ref().unwrap().choice, Choice::Option { n: 2 });
    // The later reply is logged with no effect (REQ-013).
    assert!(
        fx.logged(&run, "question")
            .iter()
            .any(|e| e["outcome"] == "late")
    );
    let again = fx.agents.briefs().pop().unwrap();
    assert_eq!(again.resume.as_deref(), Some("s-1"));
    assert!(
        again.prompt.contains("Q-001 Which scope?: option 2"),
        "{}",
        again.prompt
    );
    // The ticket moves back to the status of the return state.
    assert_eq!(
        fx.writer
            .sent()
            .iter()
            .filter(|w| matches!(w, Write::Transition { status, .. } if status == "In Progress"))
            .count(),
        2
    );
}

#[test]
fn an_unclear_reply_is_asked_again_once() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(3, 1, None)).unwrap();
    reply(&fx, "9", "5", "Q-001");
    assert_eq!(fx.state(&run), RunState::WaitingForAnswer);
    assert_eq!(fx.f.questions()[0].1.unclear.as_deref(), Some("5"));
    let posted = comments(&fx);
    assert_eq!(posted.len(), 2);
    assert!(posted[1].starts_with("<!-- shipyard:q Q-001 -->"));
    reply(&fx, "11", "maybe", "Q-001");
    assert_eq!(comments(&fx).len(), 2);
    // The person chooses on the card.
    fx.f.answer(&run, "Q-001", Choice::Option { n: 2 }).unwrap();
    assert_eq!(fx.state(&run), RunState::Working);
}

#[test]
fn inbox_first_wins() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(3, 1, None)).unwrap();
    fx.f.answer(&run, "Q-001", Choice::Option { n: 1 }).unwrap();
    reply(&fx, "9", "3", "Q-001");
    assert_eq!(
        fx.f.questions()[0].1.answer.as_ref().unwrap().choice,
        Choice::Option { n: 1 }
    );
    assert!(
        fx.logged(&run, "question")
            .iter()
            .any(|e| e["outcome"] == "late")
    );
}

#[test]
fn two_questions_wait_for_both() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    let second = fx.f.ask(&run, "work", ask(2, 1, None));
    // The agent was stopped; a second question comes from another step or an earlier call.
    assert_eq!(second, Ok("Q-002".into()));
    reply(&fx, "9", "1", "Q-001");
    assert_eq!(fx.state(&run), RunState::WaitingForAnswer);
    reply(&fx, "10", "b", "Q-002");
    let info = fx.f.run_info(&run).unwrap();
    assert_eq!(info.run.state, RunState::Working);
}

#[test]
fn an_edit_after_the_answer_keeps_it() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(3, 1, None)).unwrap();
    reply(&fx, "9", "2", "Q-001");
    fx.f.comment_edited("SHIP-1", "9");
    let q = &fx.f.questions()[0].1;
    assert!(q.edited);
    assert_eq!(q.answer.as_ref().unwrap().choice, Choice::Option { n: 2 });
    assert!(
        fx.logged(&run, "question")
            .iter()
            .any(|e| e["outcome"] == "edited")
    );
}

#[test]
fn a_terminal_ticket_withdraws_ticket_questions_only() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    fx.f.ask(&run, "work", ask(2, 1, Some("spec:projects#REQ-003")))
        .unwrap();
    let before = comments(&fx).len();
    fx.f.stop(&run, "ticket terminal").unwrap();
    let qs = fx.f.questions();
    assert_eq!(qs[0].1.state, QuestionState::Withdrawn);
    assert_eq!(qs[1].1.state, QuestionState::Open);
    assert_eq!(comments(&fx).len(), before);
    assert_eq!(fx.state(&run), RunState::Cancelled);
}

#[test]
fn waiting_stops_the_clocks_and_reminds_once() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    fx.advance(3600);
    // No stall while the run waits (REQ-004, factory REQ-006).
    assert_eq!(fx.state(&run), RunState::WaitingForAnswer);
    assert!(fx.logged(&run, "alert").is_empty());
    fx.advance(23 * 3600);
    fx.advance(24 * 3600);
    let alerts = fx.logged(&run, "alert");
    assert_eq!(alerts.len(), 1);
    assert_eq!(alerts[0]["remind"], "q:Q-001");
    assert_eq!(fx.state(&run), RunState::WaitingForAnswer);
}

#[test]
fn the_agent_tools_reach_the_run_bus() {
    let (fx, run) = working(writes(true));
    let who = Binding {
        run: run.clone(),
        step: "work".into(),
        tools: vec!["post_progress".into(), "report".into()],
    };
    let progress = Tool::PostProgress(shipyard_mcp::tools::agent::PostProgress {
        text: "half".into(),
    });
    fx.f.emit(&who, progress).unwrap();
    assert!(fx.logged(&run, "tool").iter().any(|e| e["text"] == "half"));
    let ask = Tool::AskQuestion(ask(2, 1, None));
    assert_eq!(fx.f.emit(&who, ask).unwrap()["question"], "Q-001");
    assert_eq!(fx.state(&run), RunState::WaitingForAnswer);
}

#[test]
fn a_run_cancel_and_the_global_kill_withdraw_ticket_questions_like_a_terminal_ticket() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    fx.f.cancel(&run).unwrap();
    assert_eq!(fx.f.questions()[0].1.state, QuestionState::Withdrawn);

    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    fx.f.set_kill_switch(true);
    assert_eq!(fx.state(&run), RunState::Cancelled);
    assert_eq!(fx.f.questions()[0].1.state, QuestionState::Withdrawn);
}

#[test]
fn the_question_comment_has_no_mention_and_no_attribution() {
    let (fx, run) = working(writes(true));
    let mut q = ask(2, 1, None);
    q.question = "@alice should we ship?\n🤖 Generated with a tool".into();
    q.options = vec!["yes @bob".into(), "no".into()];
    fx.f.ask(&run, "work", q).unwrap();
    let body = comments(&fx).pop().unwrap();
    assert!(!body.contains("@alice") && !body.contains("@bob"), "{body}");
    assert!(body.contains("@\u{200B}alice"), "{body}");
    assert!(!body.contains("Generated with"), "{body}");
    assert!(
        body.starts_with("<!-- shipyard:q "),
        "the marker stays: {body}"
    );
}

// ---- an answer in the app is on the ticket too (REQ-016)

fn posted_ids(fx: &Fx) -> HashSet<String> {
    fx.mirror
        .lock()
        .unwrap()
        .questions(SOURCE, "SHIP-1")
        .unwrap()
}

#[test]
fn an_answer_in_the_app_posts_one_marked_comment_that_is_no_reply() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(3, 1, None)).unwrap();
    fx.f.answer(&run, "Q-001", Choice::Option { n: 2 }).unwrap();
    // The run goes on at once.
    assert_eq!(fx.state(&run), RunState::Working);
    let sent = comments(&fx);
    assert_eq!(sent.len(), 2, "{sent:?}");
    assert!(
        sent[1].starts_with("<!-- shipyard:a Q-001 -->"),
        "{}",
        sent[1]
    );
    assert!(sent[1].contains("Answer: 2. option 2"), "{}", sent[1]);
    assert!(
        !sent[1].contains("Which scope?"),
        "the question went out already"
    );
    // The id is stored: the echo is no human reply, and a later person is still a late reply.
    let posted = posted_ids(&fx);
    assert_eq!(posted.len(), 2, "{posted:?}");
    let ids: Vec<String> = (1..=2)
        .map(|n| format!("c{}", position_of(&fx, n)))
        .collect();
    let thread = [
        comment(&ids[0], &sent[0]),
        comment(&ids[1], &sent[1]),
        comment("9", "I think 3"),
    ];
    let seen = HashSet::from(["#baseline".into()]);
    let (events, _) = comment_events("SHIP-1", &thread, &seen, &posted);
    let answered: Vec<_> = events
        .iter()
        .map(|e| match e {
            SyncEvent::Comment {
                comment, answers, ..
            } => (comment.id.clone(), answers.clone()),
            _ => unreachable!(),
        })
        .collect();
    assert_eq!(answered.len(), 3);
    assert_eq!(answered[1].1, None, "the echo answers nothing");
    assert_eq!(answered[2].1.as_deref(), Some("Q-001"));
}

/// The id that the fake writer gave to the n-th comment.
fn position_of(fx: &Fx, n: usize) -> usize {
    fx.writer
        .sent()
        .iter()
        .enumerate()
        .filter(|(_, w)| matches!(w, Write::Comment { .. }))
        .nth(n - 1)
        .map(|(i, _)| i + 1)
        .unwrap()
}

#[test]
fn a_question_comment_that_still_waits_is_replaced_by_one_comment_with_the_answer() {
    let (fx, run) = working(Writes::default());
    fx.f.ask(&run, "work", ask(3, 1, None)).unwrap();
    let waits = |fx: &Fx| {
        fx.f.approvals()
            .iter()
            .filter(|a| matches!(a.write, Write::Comment { .. }))
            .count()
    };
    assert_eq!(waits(&fx), 1);
    // The switch is off: the click is the consent for this one comment.
    fx.f.answer(&run, "Q-001", Choice::Option { n: 3 }).unwrap();
    assert_eq!(waits(&fx), 0, "the question comment is gone");
    let sent = comments(&fx);
    assert_eq!(sent.len(), 1, "{sent:?}");
    assert!(sent[0].starts_with("<!-- shipyard:a Q-001 -->"));
    assert!(sent[0].contains("Which scope?"), "{}", sent[0]);
    assert!(sent[0].contains("Answer: 3. option 3"), "{}", sent[0]);
    assert!(!sent[0].contains("shipyard:q"), "{}", sent[0]);
    assert_eq!(posted_ids(&fx).len(), 1);
    assert_eq!(fx.state(&run), RunState::Working);
}

#[test]
fn a_tracker_without_comments_gets_no_answer_comment_and_the_log_says_so() {
    let (fx, run) = working(writes(true));
    fx.writer.set_can_comment(false);
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    fx.f.answer(&run, "Q-001", Choice::Option { n: 1 }).unwrap();
    assert!(comments(&fx).is_empty());
    assert_eq!(fx.state(&run), RunState::Working);
    assert!(fx.logged(&run, "note").iter().any(|n| {
        n["note"]
            .as_str()
            .is_some_and(|t| t.contains("the tracker has no comments"))
    }));
}

#[test]
fn a_reply_on_the_tracker_posts_no_answer_comment() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(3, 1, None)).unwrap();
    reply(&fx, "9", "2", "Q-001");
    assert_eq!(fx.state(&run), RunState::Working);
    assert_eq!(comments(&fx).len(), 1, "only the question");
}
