//! Project defaults of new assistant threads (spec `assistant`, REQ-019).

use shipyard_core::assistant::{AssistantMode, Permission};
use shipyard_store::assistant_defaults::{AssistantDefaults, load, save};

#[test]
fn a_project_with_no_defaults_gives_claude_in_ask_mode() {
    let dir = tempfile::tempdir().unwrap();
    let s = load(dir.path(), "ship").settings();
    assert_eq!(
        (s.runner.as_str(), s.mode, s.model),
        ("claude", AssistantMode::Ask, None)
    );
}

#[test]
fn a_default_sets_the_runner_model_effort_and_mode_of_a_new_thread_for_its_project_only() {
    let dir = tempfile::tempdir().unwrap();
    save(
        dir.path(),
        "ship",
        &AssistantDefaults {
            runner: Some("codex".into()),
            model: Some("gpt".into()),
            effort: Some("high".into()),
            mode: Some(AssistantMode::Plan),
            permission: Some(Permission::Auto),
        },
    )
    .unwrap();
    let s = load(dir.path(), "ship").settings();
    assert_eq!(s.runner, "codex");
    assert_eq!(
        (s.model.as_deref(), s.effort.as_deref()),
        (Some("gpt"), Some("high"))
    );
    assert_eq!(
        (s.mode, s.permission),
        (AssistantMode::Plan, Permission::Auto)
    );
    assert_eq!(load(dir.path(), "other").settings().runner, "claude");
    assert!(save(dir.path(), "../x", &AssistantDefaults::default()).is_err());
}
