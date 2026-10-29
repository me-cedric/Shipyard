//! Gherkin parser and coverage tests (spec `specs`, REQ-011 to REQ-013).

use shipyard_core::gherkin::{Plan, broken, parse, uncovered};

const PLAN: &str = r#"# a comment
@spec:specs#REQ-001
Feature: Specs plan
  Free text of the feature.

  Background:
    Given a project

  Rule: Validation
    @spec:specs#REQ-004 @smoke
    Scenario: Finding on a spec
      Given a spec for spec:specs#REQ-005
      When the person validates
      """
      doc string with spec:specs#REQ-006
      """
      Then the spec shows the finding
      | col | val |
      And no other artifact does
      * and a star step
      But not this one

    Scenario Outline: Many <n>
      Given <n> items
      Examples:
        | n |
        | 1 |
"#;

fn plan() -> Plan {
    parse(PLAN).unwrap()
}

#[test]
fn parses_title_scenarios_and_steps() {
    let p = plan();
    assert_eq!(p.title, "Specs plan");
    assert_eq!(p.scenarios.len(), 2);
    let s = &p.scenarios[0];
    assert_eq!(s.name, "Finding on a spec");
    assert_eq!(s.line, 11);
    let kw: Vec<_> = s.steps.iter().map(|x| x.keyword.as_str()).collect();
    assert_eq!(kw, ["Given", "When", "Then", "And", "*", "But"]);
    assert_eq!(s.steps[0].text, "a spec for spec:specs#REQ-005");
    assert_eq!(s.steps[0].line, 12);
    assert_eq!(p.scenarios[1].name, "Many <n>");
    assert_eq!(p.scenarios[1].steps.len(), 1);
}

#[test]
fn refs_from_name_tags_steps_and_feature() {
    let p = plan();
    let r = &p.scenarios[0].refs;
    for want in [
        "spec:specs#REQ-001",
        "spec:specs#REQ-004",
        "spec:specs#REQ-005",
        "spec:specs#REQ-006",
    ] {
        assert!(r.iter().any(|x| x == want), "{want} in {r:?}");
    }
    let name = parse("Feature: f\n  Scenario: cites spec:a#REQ-001\n    Given x\n").unwrap();
    assert_eq!(name.scenarios[0].refs, vec!["spec:a#REQ-001"]);
}

#[test]
fn step_without_keyword_is_an_error_with_its_line() {
    let e = parse("Feature: f\n  Scenario: s\n    Given a\n    the person acts\n").unwrap_err();
    assert_eq!(e.len(), 1);
    assert_eq!(e[0].line, 4);
}

#[test]
fn reports_each_syntax_error() {
    assert_eq!(parse("").unwrap_err()[0].line, 1);
    let e = parse("Scenario: s\n  Given a\n").unwrap_err();
    assert_eq!(e[0].line, 1);
    let e = parse("Feature: f\n  Scenario: s\n    Given a\n    \"\"\"\n    open\n").unwrap_err();
    assert_eq!(e[0].line, 4);
    let e = parse("Feature: f\n  Given early\n").unwrap_err();
    assert_eq!(e[0].line, 2);
}

#[test]
fn coverage_and_broken_refs() {
    let p = plan();
    let reqs: Vec<String> = [
        "spec:specs#REQ-001",
        "spec:specs#REQ-004",
        "spec:specs#REQ-009",
    ]
    .map(String::from)
    .to_vec();
    assert_eq!(
        uncovered(&reqs, std::slice::from_ref(&p)),
        vec!["spec:specs#REQ-009"]
    );
    let b = broken(std::slice::from_ref(&p), &reqs);
    assert_eq!(b, vec!["spec:specs#REQ-005", "spec:specs#REQ-006"]);
}

#[test]
fn accepts_a_bom_a_tab_and_crlf() {
    let p = parse("\u{feff}Feature: f\r\n  Scenario: s\r\n    Given\ta tab\r\n").unwrap();
    assert_eq!(p.scenarios[0].steps[0].text, "a tab");
}
