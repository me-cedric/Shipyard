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
