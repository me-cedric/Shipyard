//! The agent review of a pull request: the prompt and the draft (spec `agent-pr`, REQ-003, REQ-004).

use shipyard_engine::review::{DraftVerdict, PullBrief, Severity, parse_draft, pull_prompt};

fn brief(skill: bool, role: bool, files: &[(String, Option<String>)]) -> String {
    pull_prompt(&PullBrief {
        number: 7,
        title: "Add sign in",
        description: "",
        source: "feat/auth",
        target: "main",
        head: "abc1234",
        files,
        skill,
        role,
    })
}

#[test]
fn the_prompt_names_the_project_skill_and_role_only_when_the_project_has_them() {
    let files = [("src/a.rs".to_string(), Some("@@ -1 +1 @@\n+x".to_string()))];
    let both = brief(true, true, &files);
    assert!(both.contains("`review` skill") && both.contains("`reviewer` role"));
    assert!(brief(true, false, &files).contains("`review` skill"));
    let plain = brief(false, false, &files);
    assert!(!plain.contains("skill") && !plain.contains("reviewer"));
    assert!(
        plain.contains("Checklist") && plain.contains("--- src/a.rs") && plain.contains("abc1234")
    );
}

#[test]
fn a_long_patch_is_cut_and_says_so() {
    let big = "x".repeat(200_000);
    let p = brief(
        false,
        false,
        &[("a.rs".into(), Some(big)), ("b.rs".into(), None)],
    );
    assert!(p.contains("(patch cut)") && p.len() < 130_000);
}

#[test]
fn the_draft_keeps_findings_on_changed_files_and_drops_the_rest() {
    let text = r#"Here it is: {"summary":"Two defects","verdict":"request_changes","findings":[
        {"severity":"P1","path":"src/a.rs","line":3,"text":"bad"},
        {"severity":"P2","path":"src/other.rs","line":1,"text":"not in the diff"},
        {"severity":"P2","path":"src/a.rs","text":"no line"},
        {"severity":"P2","path":"../etc/passwd","line":1,"text":"outside"}]}"#;
    let d = parse_draft(text, &["src/a.rs".into()]).unwrap();
    assert_eq!(d.verdict, DraftVerdict::RequestChanges);
    assert_eq!((d.findings.len(), d.dropped), (1, 3));
    assert_eq!(d.findings[0].severity, Severity::P1);
    assert_eq!(d.summary, "Two defects");
}

#[test]
fn an_approval_with_a_blocking_finding_is_a_comment_and_a_bad_answer_is_an_error() {
    let text = r#"{"summary":"ok","verdict":"approve","findings":[{"severity":"P0","path":"a","line":1,"text":"t"}]}"#;
    assert_eq!(
        parse_draft(text, &["a".into()]).unwrap().verdict,
        DraftVerdict::Comment
    );
    let clean = r#"{"summary":"ok","verdict":"Approve","findings":[]}"#;
    assert_eq!(
        parse_draft(clean, &[]).unwrap().verdict,
        DraftVerdict::Approve
    );
    assert!(parse_draft("no json here", &[]).is_err());
    assert!(parse_draft("} {", &[]).is_err());
}

#[test]
fn the_text_prompt_follows_pr_flow_only_when_the_project_has_it_and_the_answer_needs_a_title() {
    use shipyard_engine::review::{TextBrief, parse_text, text_prompt};
    let files = [("a.rs".to_string(), "+x".to_string())];
    let refs = ["wi:ACME-1".to_string()];
    let with = |flow| {
        text_prompt(&TextBrief {
            branch: "feat/x",
            base: "main",
            refs: &refs,
            files: &files,
            flow,
        })
    };
    assert!(with(true).contains("`pr-flow` skill") && with(true).contains("wi:ACME-1"));
    assert!(!with(false).contains("pr-flow") && with(false).contains("Do not open it"));
    let (title, body) = parse_text(r#"ok {"title":" Add x ","body":"Why"}"#).unwrap();
    assert_eq!((title.as_str(), body.as_str()), ("Add x", "Why"));
    assert!(parse_text(r#"{"title":"","body":"b"}"#).is_err());
    assert!(parse_text("nothing").is_err());
}
