//! Send to factory and Explain, the parts that need no tracker (spec `assistant`, REQ-014 to
//! REQ-016). The writes and the turns are tested in `src/assistant.rs` and `src/work/tests.rs`.

use shipyard_app::assistant::*;
use shipyard_core::assistant::*;
use shipyard_core::work::RowKind;

fn thread() -> Thread {
    Thread {
        id: "th-1".into(),
        project: "ship".into(),
        title: String::new(),
        settings: ThreadSettings::new("claude"),
        context: Context {
            view: "work/board".into(),
            selected: None,
            refs: vec!["wi:SHIP-12".into()],
        },
        draft: String::new(),
        session: None,
        granted: vec![],
        messages: vec![],
        usage: Usage::default(),
        worktree: None,
        created: 0,
        updated: 0,
    }
}

#[test]
fn the_work_item_holds_the_plan_and_the_refs_of_the_thread() {
    let mut t = thread();
    assert!(
        work_item_row(&t, &[]).is_err(),
        "an empty thread has nothing to send"
    );
    t.messages
        .push(ChatMessage::user("Plan the login change\nmore", vec![], 1));
    let mut plan = ChatMessage::user("", vec![], 2);
    plan.role = ChatRole::Assistant;
    plan.text = "1. Add the form. token sk-abc\n2. Test it.".into();
    plan.refs = vec!["spec:auth#REQ-004".into(), "wi:SHIP-12".into()];
    t.messages.push(plan);

    let row = work_item_row(&t, &["sk-abc".to_string()]).unwrap();
    assert_eq!(row.title, "Plan the login change");
    assert_eq!(
        row.reference, "doc:assistant/th-1",
        "the match mark of a second click"
    );
    assert_eq!(row.kind, RowKind::Story);
    assert!(row.description.contains("1. Add the form. token ***"));
    assert!(!row.description.contains("sk-abc"));
    assert!(
        row.description.contains("- wi:SHIP-12") && row.description.contains("- spec:auth#REQ-004")
    );
    assert_eq!(
        row.description.matches("wi:SHIP-12").count(),
        1,
        "a ref once"
    );

    t.title = "Login plan".into();
    assert_eq!(work_item_row(&t, &[]).unwrap().title, "Login plan");
}

#[test]
fn a_run_is_the_label_wf_and_a_plain_workflow_id_only() {
    assert_eq!(run_label("feature").unwrap(), "wf:feature");
    for bad in ["", "../x", "Feature", "a b", "a:b"] {
        assert!(run_label(bad).is_err(), "{bad}");
    }
}

#[test]
fn explain_cites_only_refs_that_resolve() {
    let text = "See @spec:auth#REQ-004, (wi:SHIP-12) and `wi:NONE-1`. Also spec:auth#REQ-004.";
    assert_eq!(
        cited(text),
        ["spec:auth#REQ-004", "wi:SHIP-12", "wi:NONE-1"]
    );
    let (body, kept) = keep_resolved(text, |r| r != "wi:NONE-1");
    assert_eq!(kept, ["spec:auth#REQ-004", "wi:SHIP-12"]);
    assert!(!body.contains("NONE-1") && body.contains("[unresolved ref]"));
    assert!(explain_request("spec:auth#REQ-004").contains("spec:auth#REQ-004"));
    let none = no_source("spec:x#REQ-001");
    assert_eq!(none.text, "No source for spec:x#REQ-001 in this project.");
    assert!(none.refs.is_empty() && none.role == ChatRole::Assistant);
}

#[test]
fn the_ring_reads_the_last_call_against_the_window_of_the_runner() {
    let mut t = thread();
    assert_eq!(gauge(&t).used_tokens, 0);
    let mut a = ChatMessage::user("x", vec![], 1);
    a.usage.input_tokens = 100;
    a.usage.cached_tokens = 50;
    a.usage.output_tokens = 10;
    t.messages.push(a);
    t.messages.push(ChatMessage::user("y", vec![], 2));
    let g = gauge(&t);
    assert_eq!((g.used_tokens, g.window_tokens), (160, 200_000));
    assert!(g.quotas.is_empty(), "no runner reports a quota window yet");
    assert!(window_tokens("gemini") > window_tokens("claude"));
    assert!(efforts("copilot").is_empty() && !efforts("claude").is_empty());
}
