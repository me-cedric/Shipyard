//! Commit summary and branch name rules (spec `code`, REQ-008 and REQ-012).

use shipyard_core::code::{NameError, check_branch_name, check_summary};

#[test]
fn a_summary_needs_an_allowed_type_and_a_subject() {
    for ok in [
        "feat: add login",
        "fix(auth): refuse an empty token",
        "docs(code): x",
        &format!("chore: {}", "a".repeat(70)),
    ] {
        assert_eq!(check_summary(ok), Ok(()), "{ok}");
    }
    assert_eq!(check_summary("  "), Err(NameError::Empty));
    assert_eq!(check_summary("wip: x"), Err(NameError::BadType));
    assert_eq!(check_summary("add login"), Err(NameError::BadType));
    assert_eq!(check_summary("feat(auth: x"), Err(NameError::BadType));
    assert_eq!(check_summary("feat(): x"), Err(NameError::BadType));
    assert_eq!(check_summary("Feat: x"), Err(NameError::BadType));
    assert_eq!(check_summary("feat:  "), Err(NameError::EmptySubject));
    assert!(NameError::BadType.message().contains("refactor"));
}

#[test]
fn a_branch_name_is_type_area_kebab() {
    assert_eq!(check_branch_name("fix/auth/login-timeout"), Ok(()));
    assert_eq!(check_branch_name("feat/api2/add-v2"), Ok(()));
    for bad in [
        "patch-3",
        "fix/auth",
        "fix/auth/a/b",
        "wip/auth/x",
        "fix/Auth/x",
        "fix/auth/x--y",
        "fix/auth/-x",
        "fix//x",
        "fix/auth/x y",
    ] {
        assert_eq!(check_branch_name(bad), Err(NameError::BadBranch), "{bad}");
    }
}

use shipyard_core::code::{DigestError, check_digest, commit_refs, run_in_message, work_item_key};

fn keys(k: &[&str]) -> Vec<String> {
    k.iter().map(|s| s.to_string()).collect()
}

#[test]
fn a_work_item_key_matches_as_a_whole_word() {
    let known = keys(&["SHIP-4", "SHIP-42"]);
    assert_eq!(
        work_item_key("feat/auth/SHIP-42-login", &known),
        Some("SHIP-42")
    );
    assert_eq!(work_item_key("fix: SHIP-4 refuse", &known), Some("SHIP-4"));
    assert_eq!(work_item_key("fix: XSHIP-42 refuse", &known), None);
    assert_eq!(work_item_key("fix: SHIP-421", &known), None);
    assert_eq!(work_item_key("fix: SHIP-99", &known), None);
}

#[test]
fn the_ref_list_has_each_link_once() {
    let known = keys(&["SHIP-42"]);
    let refs = commit_refs(
        "feat/auth/SHIP-42-login",
        "fix: SHIP-42",
        &known,
        Some("r-1"),
    );
    assert_eq!(refs, ["wi:SHIP-42", "run:r-1"]);
    assert!(commit_refs("main", "chore: x", &known, None).is_empty());
}

#[test]
fn a_digest_has_no_path_trace_or_secret() {
    assert_eq!(
        check_digest(
            "Login ships next week. Risk: low, 3/4 done.",
            &["tok-abcdef"]
        ),
        Ok(())
    );
    assert!(matches!(
        check_digest("changed src/lib.rs", &[]),
        Err(DigestError::Path(_))
    ));
    assert!(matches!(
        check_digest("see C:\\work\\a", &[]),
        Err(DigestError::Path(_))
    ));
    assert!(matches!(
        check_digest("thread panicked at x", &[]),
        Err(DigestError::Trace(_))
    ));
    assert_eq!(
        check_digest("token tok-abcdef", &["tok-abcdef"]),
        Err(DigestError::Secret)
    );
    assert!(DigestError::Secret.message().contains("secret"));
}

#[test]
fn a_run_commit_names_its_run_in_the_message() {
    assert_eq!(
        run_in_message("Shipyard run run:r-12_a: merged.\n\nGate: ok"),
        Some("r-12_a")
    );
    assert_eq!(run_in_message("feat: add login"), None);
    assert_eq!(run_in_message("see run: nothing"), None);
}
