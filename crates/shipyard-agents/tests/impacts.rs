//! Analyze against a fake runner (spec `code`, REQ-030 to REQ-032): seven axes, stale refs, two
//! separate outputs, a clean digest.

use shipyard_agents::AgentError;
use shipyard_agents::impacts::*;
use std::sync::Mutex;

struct Fake {
    answers: Mutex<Vec<String>>,
    prompts: Mutex<Vec<String>>,
}

impl Fake {
    fn new(answers: &[&str]) -> Self {
        Self {
            answers: Mutex::new(answers.iter().rev().map(|s| s.to_string()).collect()),
            prompts: Mutex::default(),
        }
    }
}

impl Ask for Fake {
    fn ask(&self, prompt: &str) -> Result<String, AgentError> {
        self.prompts.lock().unwrap().push(prompt.into());
        self.answers
            .lock()
            .unwrap()
            .pop()
            .ok_or_else(|| AgentError::Provider("no answer".into()))
    }
}

const PLAN: &str = r#"Here: {"axes": {"contracts": "High", "data": "low", "bogus": "high"},
 "stale": ["spec:auth", "spec:invented"], "actions": ["Update the contract", "Run the tests"]}"#;

fn cmp<'a>(refs: &'a [String], secrets: &'a [String], files: &'a [String]) -> Comparison<'a> {
    Comparison {
        base: "v1.0",
        files,
        diff: "+key = tok-secret-1",
        refs,
        secrets,
    }
}

#[test]
fn the_plan_rates_seven_axes_and_keeps_only_known_stale_refs() {
    let refs = vec!["spec:auth".to_string()];
    let files = vec!["src/api.rs".to_string()];
    let fake = Fake::new(&[
        PLAN,
        "Login ships a week late. Risk is low. The PM must decide.",
    ]);
    let a = analyze(&fake, &cmp(&refs, &[], &files)).unwrap();
    for axis in AXES {
        assert!(a.plan.contains(&format!("- {axis}: ")), "{axis}");
    }
    assert!(a.plan.contains("- contracts: high"));
    assert!(a.plan.contains("- security: none"));
    assert_eq!(a.stale, ["spec:auth"]);
    assert!(a.plan.find("1. Update").unwrap() < a.plan.find("2. Run").unwrap());
}

#[test]
fn the_digest_is_a_second_ask_with_no_path_and_no_secret() {
    let refs = vec![];
    let secrets = vec!["tok-secret-1".to_string()];
    let files = vec!["src/api.rs".to_string()];
    let fake = Fake::new(&[PLAN, "Login ships late."]);
    let a = analyze(&fake, &cmp(&refs, &secrets, &files)).unwrap();
    let prompts = fake.prompts.lock().unwrap();
    assert_eq!(prompts.len(), 2);
    assert!(prompts.iter().all(|p| !p.contains("tok-secret-1")));
    assert!(
        !prompts[1].contains("src/api.rs"),
        "the digest ask has no file list"
    );
    assert_ne!(a.plan, a.digest);
}

#[test]
fn a_dirty_digest_gets_one_retry_then_an_error() {
    let (refs, files) = (vec![], vec![]);
    let fake = Fake::new(&[PLAN, "Changed src/lib.rs", "Clean text."]);
    let a = analyze(&fake, &cmp(&refs, &[], &files)).unwrap();
    assert_eq!(a.digest, "Clean text.");
    let fake = Fake::new(&[PLAN, "Changed src/lib.rs", "Still src/lib.rs"]);
    assert!(analyze(&fake, &cmp(&refs, &[], &files)).is_err());
}

#[test]
fn a_plan_that_is_not_json_is_an_error() {
    let (refs, files) = (vec![], vec![]);
    let fake = Fake::new(&["no json here"]);
    assert!(analyze(&fake, &cmp(&refs, &[], &files)).is_err());
}

#[cfg(unix)]
#[test]
fn the_runner_ask_returns_the_text_of_a_fake_cli() {
    let tmp = tempfile::tempdir().unwrap();
    let bin = shipyard_agents::fake::program(
        tmp.path(),
        "fake-cli",
        r#"cat > /dev/null
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"Plain answer."}]}}'"#,
    );
    let (work, scratch) = (tmp.path().join("work"), tmp.path().join("scratch"));
    std::fs::create_dir_all(&work).unwrap();
    let ask = RunnerAsk {
        runner: "claude".into(),
        dir: work,
        scratch,
        program: Some(bin),
    };
    assert_eq!(ask.ask("question").unwrap(), "Plain answer.");
    let bad = RunnerAsk {
        runner: "nope".into(),
        ..ask
    };
    assert!(bad.ask("q").is_err());
}
