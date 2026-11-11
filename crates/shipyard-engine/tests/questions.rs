//! The questions loop in the engine (spec `questions-loop`, REQ-001, REQ-002, REQ-004 to REQ-007,
//! REQ-009, REQ-011 to REQ-014, REQ-016 to REQ-019). A fake tracker writer and a fake clock.

mod fx;

use std::collections::HashSet;

use fx::{Fx, ONE, SOURCE, writes};
use shipyard_core::pickup::{SyncEvent, Writes};
use shipyard_core::question::{Choice, QuestionState};
use shipyard_core::run::{Cause, RunState};
use shipyard_core::work::Team;
use shipyard_core::work_item::Comment;
use shipyard_engine::approvals::Write;
use shipyard_engine::fake::comment;
use shipyard_engine::handoff::comment_events;
use shipyard_engine::ports::{AgentEvent, Dispatch};
use shipyard_engine::run_engine::Config;
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
        stop: None,
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
    // One reminder comment with the marker: a reply to it answers the question.
    let sent = comments(&fx);
    assert_eq!(sent.len(), 2, "{sent:?}");
    assert!(
        sent[1].starts_with("<!-- shipyard:q Q-001 -->"),
        "{}",
        sent[1]
    );
    assert!(sent[1].contains("Reminder: Which scope?"), "{}", sent[1]);
    assert_eq!(
        posted_ids(&fx).len(),
        2,
        "the reminder is a comment of Shipyard"
    );
}

#[test]
fn the_agent_tools_reach_the_run_bus() {
    let (fx, run) = working(writes(true));
    let who = Binding {
        run: run.clone(),
        step: "work".into(),
        tools: vec!["post_progress".into(), "report".into()],
        attempt: String::new(),
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

// ---- the wait of a question and a reply to a stop report (REQ-019, REQ-022)

#[test]
fn a_question_with_no_answer_escalates_after_72_h_and_a_late_answer_moves_the_run_back() {
    let (fx, run) = working(writes(true));
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    fx.advance(71 * 3600);
    assert_eq!(fx.state(&run), RunState::WaitingForAnswer);
    fx.advance(3600);
    assert_eq!(fx.state(&run), RunState::Blocked);
    let e = fx.f.run_info(&run).unwrap().escalation.unwrap();
    assert_eq!(e.cause, Cause::NoAnswer);
    assert_eq!(e.lines, ["Q-001: Which scope?"]);
    assert_eq!(fx.f.questions()[0].1.state, QuestionState::Open);
    let reports = comments(&fx);
    assert!(
        reports
            .last()
            .unwrap()
            .starts_with(&format!("<!-- shipyard:stop {run} -->"))
    );
    // More time: no second report and no refused move in the log.
    fx.advance(3600);
    assert_eq!(
        fx.logged(&run, "note")
            .iter()
            .filter(|n| n.get("refused").is_some())
            .count(),
        0
    );
    reply(&fx, "40", "1", "Q-001");
    assert_eq!(fx.state(&run), RunState::Working);
}

#[test]
fn the_wait_comes_from_the_automation_file() {
    let fx = Fx::build(writes(true), &[ONE], Config::default(), |p| {
        p.automation.questions.remind_after_h = 1;
        p.automation.questions.escalate_after_h = 2;
    });
    let run = fx.start("SHIP-1", &[]);
    fx.f.ask(&run, "work", ask(2, 1, None)).unwrap();
    fx.advance(3600);
    assert_eq!(fx.logged(&run, "alert").len(), 1);
    fx.advance(3600);
    assert_eq!(fx.state(&run), RunState::Blocked);
}

const MEMBER: &str = "members:
  - { name: Bob, handle: bob, trackers: [u2], role: developer, admin: true, capacity: 5, skills: [] }
";
const NOT_BOB: &str = "members:
  - { name: Ann, handle: ann, trackers: [ann], role: developer, admin: true, capacity: 5, skills: [] }
";

fn exit(code: i32) -> AgentEvent {
    AgentEvent::Exit {
        code: Some(code),
        cancelled: false,
    }
}

fn with_team(fx: &Fx, run: &str, team: Option<&str>) {
    let project = fx.f.run_info(run).unwrap().project;
    let team: Option<Team> = team.map(|t| serde_norway::from_str(t).unwrap());
    fx.f.set_team(&project, team);
}

/// A run blocked with its retries spent, and its stop report on the ticket.
fn blocked(team: Option<&str>) -> (Fx, String) {
    let fx = Fx::new(writes(true), &[ONE]);
    let run = fx.start("SHIP-1", &[]);
    with_team(&fx, &run, team);
    fx.event("work", exit(1));
    fx.advance(10);
    fx.event("work", exit(2));
    assert_eq!(fx.state(&run), RunState::Blocked);
    (fx, run)
}

/// The ticket as the tick reads it: each comment of Shipyard (`c<n>`), then `extra`. Each
/// comment that the tick saw before is not new.
fn on_ticket(fx: &Fx, extra: Comment) {
    let mut thread: Vec<Comment> = fx
        .writer
        .sent()
        .iter()
        .enumerate()
        .filter_map(|(i, w)| match w {
            Write::Comment { body, .. } => Some(comment(&format!("c{}", i + 1), body)),
            _ => None,
        })
        .collect();
    let mut seen: HashSet<String> = thread.iter().map(|c| c.id.clone()).collect();
    seen.insert("#baseline".into());
    thread.push(extra);
    let (events, _) = comment_events("SHIP-1", &thread, &seen, &posted_ids(fx));
    for e in events {
        fx.f.event(&e).unwrap();
    }
}

fn notes(fx: &Fx, run: &str) -> String {
    serde_json::to_string(&fx.logged(run, "note")).unwrap()
}

#[test]
fn a_reply_of_a_member_after_the_stop_report_unblocks_with_the_reply_as_data() {
    let (fx, run) = blocked(Some(MEMBER));
    on_ticket(&fx, comment("90", "Use the v2 endpoint"));
    assert_eq!(fx.state(&run), RunState::Working);
    let brief = fx.agents.briefs().pop().unwrap();
    assert!(
        brief.prompt.contains(
            "<untrusted-data source=\"ticket reply\">\nUse the v2 endpoint\n</untrusted-data>"
        ),
        "{}",
        brief.prompt
    );
}

#[test]
fn a_team_with_no_admin_takes_the_reply_of_anyone() {
    let (fx, run) = blocked(Some("members: []\n"));
    on_ticket(&fx, comment("90", "Try again"));
    assert_eq!(fx.state(&run), RunState::Working);
}

#[test]
fn a_reply_of_a_person_who_is_not_a_member_is_logged_and_ignored() {
    for team in [Some(NOT_BOB), None] {
        let (fx, run) = blocked(team);
        on_ticket(&fx, comment("90", "Use the v2 endpoint"));
        assert_eq!(fx.state(&run), RunState::Blocked, "{team:?}");
        assert!(notes(&fx, &run).contains("reply 90 of u2: the author is not a team member"));
    }
}

#[test]
fn a_comment_of_shipyard_after_the_stop_report_is_no_reply() {
    let (fx, run) = blocked(Some(MEMBER));
    fx.mirror
        .lock()
        .unwrap()
        .question_posted(SOURCE, "SHIP-1", "90")
        .unwrap();
    on_ticket(&fx, comment("90", "Shipyard stopped the run."));
    assert_eq!(fx.state(&run), RunState::Blocked);
}

#[test]
fn a_reply_never_resumes_a_paused_run() {
    let fx = Fx::build(writes(true), &[ONE], Config::default(), |p| {
        p.automation.budgets.day = [("*".to_string(), 1.0)].into();
    });
    let run = fx.start("SHIP-1", &[]);
    with_team(&fx, &run, Some(MEMBER));
    fx.event(
        "work",
        AgentEvent::Usage {
            input_tokens: 1,
            output_tokens: 1,
            cached_tokens: 0,
            cost_usd: Some(2.0),
        },
    );
    assert_eq!(fx.state(&run), RunState::Paused);
    on_ticket(&fx, comment("90", "Go on"));
    assert_eq!(fx.state(&run), RunState::Paused);
    assert!(notes(&fx, &run).contains("a reply does not resume a paused run"));
}

#[test]
fn a_call_of_an_old_attempt_is_ignored_and_logged() {
    let (fx, run) = working(writes(true));
    let who = Binding {
        run: run.clone(),
        step: "work".into(),
        tools: vec!["report".into()],
        attempt: "old".into(),
    };
    let report = Tool::Report(shipyard_mcp::tools::agent::Report {
        outcome: shipyard_mcp::tools::agent::Outcome::Done,
        summary: "late".into(),
        refs: Vec::new(),
        output: None,
    });
    let err = fx.f.emit(&who, report).unwrap_err();
    assert!(err.contains("not the current attempt"), "{err}");
    assert_eq!(fx.state(&run), RunState::Working);
    assert!(fx.logged(&run, "note").iter().any(|n| n["fenced"] == "old"));
}
