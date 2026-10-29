//! Specs commands over a temp repository and a fake tracker (spec `specs`). No test starts the
//! OpenSpec CLI, opens a window or uses the network.

use shipyard_core::work::Action;

use super::*;
use crate::work::tests::{Fx, NO_ISSUES, fx, issue, ticket};

const SPEC: &str = "# Spec: auth\n\n## Purpose\n\nStatus: Draft\n\n### Requirements\n\n- REQ-001: Login. [NEEDS CLARIFICATION: Q-001 Which provider?]\n\n## ADDED Requirements\n\n### Requirement: REQ-001 Login\n\nText.\n\n### Requirement: REQ-002 Logout\n\nText.\n";
const CHANGE_SPEC: &str = "docs/openspec/changes/add-auth/specs/auth/spec.md";

fn put_file(f: &Fx, rel: &str, text: &str) {
    let p = f.repo.path().join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, text).unwrap();
}

fn file(f: &Fx, rel: &str) -> String {
    std::fs::read_to_string(f.repo.path().join(rel)).unwrap_or_default()
}

/// A change with a proposal and the spec of one capability.
fn with_change(f: &Fx) {
    put_file(
        f,
        "docs/openspec/changes/add-auth/proposal.md",
        "# add-auth\n",
    );
    put_file(f, CHANGE_SPEC, SPEC);
}

fn question(title: &str) -> Question {
    Question {
        kind: "question".into(),
        status: "open".into(),
        raised_at: "2026-10-29".into(),
        raised_by: "ana".into(),
        owner: "ana".into(),
        title: title.into(),
        ..Question::default()
    }
}

fn finding(artifact: &str, capability: Option<&str>) -> Finding {
    Finding {
        artifact: artifact.into(),
        capability: capability.map(Into::into),
        path: String::new(),
        line: None,
        message: "bad".into(),
        level: "error".into(),
    }
}

fn statuses(f: &Fx) -> Vec<(String, ArtifactStatus)> {
    changes(&f.s).unwrap()[0]
        .artifacts
        .iter()
        .map(|a| (a.path.clone(), a.status))
        .collect()
}

// ---------------------------------------------------------------- changes

#[test]
fn a_new_change_has_the_proposal_from_the_template_and_the_schema_file() {
    let f = fx();
    put_file(
        &f,
        "docs/openspec/schemas/shipyard-delivery/templates/proposal.md",
        "# [CHANGE]\n\n## Why\n",
    );
    let v = change_create(&f.s, "add-auth").unwrap();
    assert_eq!(v.id, "add-auth");
    assert_eq!(
        file(&f, "docs/openspec/changes/add-auth/proposal.md"),
        "# add-auth\n\n## Why\n"
    );
    assert!(
        file(&f, "docs/openspec/changes/add-auth/.openspec.yaml")
            .starts_with("schema: shipyard-delivery\n")
    );
    for bad in ["add-auth", "Bad_Id", "archive", "a/b", ""] {
        assert!(change_create(&f.s, bad).is_err(), "{bad}");
    }
}

#[test]
fn an_artifact_is_missing_draft_or_done_and_done_needs_a_passed_validation_that_a_write_clears() {
    let f = fx();
    with_change(&f);
    let at = |s: &[(String, ArtifactStatus)], p: &str| s.iter().find(|(x, _)| x == p).unwrap().1;
    let s = statuses(&f);
    assert_eq!(s.len(), 5);
    assert_eq!(
        at(&s, "proposal.md"),
        ArtifactStatus::Draft,
        "no validation yet"
    );
    assert_eq!(at(&s, "specs/auth/plan.md"), ArtifactStatus::Missing);

    let p = project(&f.s).unwrap();
    f.s.specs
        .set(&p.id, "add-auth", vec![finding("spec", Some("auth"))]);
    let s = statuses(&f);
    assert_eq!(at(&s, "proposal.md"), ArtifactStatus::Done);
    assert_eq!(at(&s, "specs/auth/spec.md"), ArtifactStatus::Draft);
    assert_eq!(at(&s, "specs/auth/tasks.md"), ArtifactStatus::Missing);

    // A write to the change clears the result.
    let stamp = read(&f.s, "docs/openspec/changes/add-auth/proposal.md")
        .unwrap()
        .stamp;
    write(
        &f.s,
        "docs/openspec/changes/add-auth/proposal.md",
        "# add-auth\nmore\n",
        Some(&stamp),
        false,
    )
    .unwrap();
    assert_eq!(at(&statuses(&f), "proposal.md"), ArtifactStatus::Draft);
}

#[test]
fn a_read_or_write_stays_in_the_openspec_questions_and_test_plan_folders() {
    let f = fx();
    for bad in [
        "README.md",
        "../x.md",
        "docs/decisions/0001-x.md",
        "/etc/hosts",
    ] {
        assert!(read(&f.s, bad).is_err(), "{bad}");
        assert!(write(&f.s, bad, "x", None, true).is_err(), "{bad}");
    }
    assert!(
        write(
            &f.s,
            "docs/delivery/test-plans/a.feature",
            "Feature: a\n",
            None,
            true
        )
        .is_ok()
    );
    assert!(write(&f.s, "docs/openspec/constitution.md", "# C\n", None, true).is_ok());
}

#[test]
fn capabilities_count_requirements_and_a_spec_lists_its_markers() {
    let f = fx();
    put_file(&f, "docs/openspec/specs/auth/spec.md", SPEC);
    let c = capabilities(&f.s).unwrap();
    assert_eq!((c[0].capability.as_str(), c[0].requirements), ("auth", 2));
    let v = spec(&f.s, &c[0].path).unwrap();
    assert_eq!(v.requirements.len(), 2);
    assert_eq!(v.markers[0].question.as_deref(), Some("Q-001"));
}

// ---------------------------------------------------------------- questions

#[test]
fn a_question_gets_the_next_id_and_an_unknown_kind_or_a_duplicate_id_is_refused() {
    let f = fx();
    let a = question_create(&f.s, question("First?")).unwrap();
    let b = question_create(&f.s, question("Second?")).unwrap();
    assert_eq!(
        (a.as_str(), b.as_str()),
        (
            "docs/delivery/questions/Q-001.md",
            "docs/delivery/questions/Q-002.md"
        )
    );
    let mut dup = question("Third?");
    dup.id = "Q-001".into();
    assert!(question_create(&f.s, dup).is_err());

    let list = questions(&f.s).unwrap();
    assert_eq!(list[1].path, b, "paths are relative");
    let mut q = list[1].question.clone();
    q.status = "answered".into();
    let stamp = read(&f.s, &b).unwrap().stamp;
    assert!(!question_save(&f.s, &b, &q, Some(&stamp)).unwrap().conflict);
    assert!(file(&f, &b).contains("status: answered"));
    q.kind = "nonsense".into();
    assert!(question_save(&f.s, &b, &q, None).is_err());
    q.kind = "risk".into();
    q.id = "Q-001".into();
    assert!(question_save(&f.s, &b, &q, None).is_err(), "duplicate id");
    assert!(question_save(&f.s, "docs/openspec/x.md", &q, None).is_err());
}

// ---------------------------------------------------------------- test plans

#[test]
fn test_plans_show_scenarios_refs_syntax_errors_and_broken_refs_and_coverage_lists_the_rest() {
    let f = fx();
    put_file(&f, "docs/openspec/specs/auth/spec.md", SPEC);
    put_file(
        &f,
        "docs/delivery/test-plans/auth.feature",
        "Feature: Auth\n  @spec:auth#REQ-001 @spec:auth#REQ-009\n  Scenario: login\n    Given a user\n",
    );
    put_file(
        &f,
        "docs/delivery/test-plans/bad.feature",
        "this is not gherkin\n",
    );
    let plans = testplans(&f.s).unwrap();
    let auth = plans.iter().find(|p| p.title == "Auth").unwrap();
    assert_eq!(auth.scenarios, 1);
    assert_eq!(auth.refs, ["spec:auth#REQ-001", "spec:auth#REQ-009"]);
    assert_eq!(auth.broken, ["spec:auth#REQ-009"]);
    let bad = plans
        .iter()
        .find(|p| p.path.ends_with("bad.feature"))
        .unwrap();
    assert!(!bad.errors.is_empty() && bad.scenarios == 0);
    assert_eq!(coverage(&f.s, "auth").unwrap(), ["spec:auth#REQ-002"]);
}

// ---------------------------------------------------------------- fold

#[test]
fn a_fold_needs_the_click_and_writes_the_answer_into_the_spec_once() {
    let f = fx();
    put_file(&f, "docs/openspec/specs/auth/spec.md", SPEC);
    question_create(
        &f.s,
        Question {
            id: "Q-001".into(),
            ..question("Which provider?")
        },
    )
    .unwrap();
    let path = "docs/openspec/specs/auth/spec.md";
    let stamp = read(&f.s, path).unwrap().stamp;
    assert!(fold_answer(&f.s, path, "Q-001", "OIDC", &stamp, false).is_err());
    assert_eq!(file(&f, path), SPEC, "no click, no write");
    assert!(fold_answer(&f.s, path, "Q-009", "x", &stamp, true).is_err());
    assert!(
        fold_answer(
            &f.s,
            "docs/delivery/questions/Q-001.md",
            "Q-001",
            "x",
            &stamp,
            true
        )
        .is_err()
    );

    assert!(
        !fold_answer(&f.s, path, "Q-001", "OIDC", &stamp, true)
            .unwrap()
            .conflict
    );
    let text = file(&f, path);
    assert!(
        text.contains("- REQ-001: Login. OIDC") && text.contains("- Q-001 Which provider?: OIDC"),
        "{text}"
    );
    // The stamp is old now.
    assert!(
        fold_answer(&f.s, path, "Q-001", "OIDC", &stamp, true).is_err() || file(&f, path) == text
    );
}

// ---------------------------------------------------------------- split (REQ-018)

fn split_routes(f: &Fx) {
    f.http
        .get("/rest/api/2/search/jql", 200, NO_ISSUES)
        .post(
            "/rest/api/2/issue",
            r#""name":"Epic""#,
            201,
            r#"{"id":"1","key":"PROJ-10"}"#,
        )
        .post(
            "/rest/api/2/issue",
            r#""summary":"Login""#,
            201,
            r#"{"id":"2","key":"PROJ-11"}"#,
        )
        .post(
            "/rest/api/2/issue",
            r#""summary":"Logout""#,
            201,
            r#"{"id":"3","key":"PROJ-12"}"#,
        )
        .get(
            "/rest/api/2/issue/PROJ-10",
            200,
            &issue(
                "PROJ-10",
                "auth",
                "Requirements: spec:auth#REQ-001, spec:auth#REQ-002",
                "est:add-auth#auth",
                None,
                0,
            ),
        )
        .get(
            "/rest/api/2/issue/PROJ-11",
            200,
            &issue(
                "PROJ-11",
                "Login",
                "Requirements: spec:auth#REQ-001",
                "est:add-auth#auth-req-001",
                Some("PROJ-10"),
                0,
            ),
        )
        .get(
            "/rest/api/2/issue/PROJ-12",
            200,
            &issue(
                "PROJ-12",
                "Logout",
                "Requirements: spec:auth#REQ-002",
                "est:add-auth#auth-req-002",
                Some("PROJ-10"),
                0,
            ),
        );
}

#[test]
fn the_draft_comes_from_the_specs_and_an_edited_draft_is_kept_outside_the_repository() {
    let f = fx();
    with_change(&f);
    let mut d = split_draft(&f.s, "add-auth").unwrap();
    assert_eq!(
        d.items
            .iter()
            .map(|i| i.row_id.as_str())
            .collect::<Vec<_>>(),
        ["auth", "auth-req-001", "auth-req-002"]
    );
    d.items[1].title = "Sign in".into();
    split_save(&f.s, &d).unwrap();
    assert_eq!(
        split_draft(&f.s, "add-auth").unwrap().items[1].title,
        "Sign in"
    );
    assert!(split_draft(&f.s, "nope").is_err());
    assert!(split_draft(&f.s, "../x").is_err());
    assert_eq!(file(&f, CHANGE_SPEC), SPEC, "the repository is unchanged");
}

#[test]
fn a_split_writes_nothing_before_the_click_one_ref_per_item_and_a_second_apply_none() {
    let f = fx();
    with_change(&f);
    split_routes(&f);

    let pv = split_preview(&f.s, "add-auth").unwrap();
    assert!(pv.problems.is_empty(), "{:?}", pv.problems);
    assert_eq!(
        pv.rows
            .iter()
            .map(|d| (d.row.reference.as_str(), d.action))
            .collect::<Vec<_>>(),
        [
            ("est:add-auth#auth", Action::Create),
            ("est:add-auth#auth-req-001", Action::Create),
            ("est:add-auth#auth-req-002", Action::Create),
        ]
    );
    assert_eq!(pv.rows[1].row.parent.as_deref(), Some("est:add-auth#auth"));
    assert!(pv.rows[1].row.description.contains("spec:auth#REQ-001"));
    assert_eq!(f.writes(), 0, "the preview sends nothing");
    assert!(split_apply(&f.s, "add-auth", false).is_err());
    assert_eq!(f.writes(), 0, "no click, no write");

    let out = split_apply(&f.s, "add-auth", true).unwrap();
    assert!(out.iter().all(|r| r.error.is_none()), "{out:?}");
    assert_eq!(
        out.iter()
            .filter_map(|r| r.key.as_deref())
            .collect::<Vec<_>>(),
        ["PROJ-10", "PROJ-11", "PROJ-12"]
    );
    assert_eq!(f.writes(), 3);
    assert_eq!(f.item("PROJ-11").labels, ["est:add-auth#auth-req-001"]);

    let again = split_apply(&f.s, "add-auth", true).unwrap();
    assert!(again.iter().all(|r| r.action == Action::Unchanged));
    assert_eq!(f.writes(), 3, "a second apply creates no duplicate");
}

#[test]
fn a_draft_with_a_problem_is_not_applied_and_an_item_with_no_known_ref_is_listed() {
    let f = fx();
    with_change(&f);
    split_routes(&f);
    let mut d = split_draft(&f.s, "add-auth").unwrap();
    d.items[2].reqs = vec!["spec:auth#REQ-099".into()];
    split_save(&f.s, &d).unwrap();
    let pv = split_preview(&f.s, "add-auth").unwrap();
    assert_eq!(pv.problems, ["auth-req-002: unknown ref spec:auth#REQ-099"]);
    assert!(split_apply(&f.s, "add-auth", true).is_err());
    assert_eq!(f.writes(), 0);
}

// ---------------------------------------------------------------- archive

#[test]
fn an_archive_with_an_open_item_needs_the_confirm_and_a_done_item_does_not_count() {
    let f = fx();
    with_change(&f);
    let mut done = ticket("PROJ-2", "Done one", &["est:add-auth#auth-req-002"]);
    done.status.category = shipyard_core::work_item::StatusCategory::Done;
    f.put(vec![
        ticket("PROJ-1", "Open one", &["est:add-auth#auth-req-001"]),
        done,
    ]);

    let e = archive_change(&f.s, "add-auth", false).unwrap_err();
    assert!(e.contains("PROJ-1") && !e.contains("PROJ-2"), "{e}");
    assert!(
        f.repo
            .path()
            .join("docs/openspec/changes/add-auth")
            .is_dir()
    );
    assert_eq!(archive_change(&f.s, "add-auth", true).unwrap(), ["auth"]);
    assert!(
        !f.repo
            .path()
            .join("docs/openspec/changes/add-auth")
            .exists()
    );
    assert!(file(&f, "docs/openspec/specs/auth/spec.md").contains("Requirement: REQ-001"));
    assert!(archive_change(&f.s, "archive", true).is_err());
}
