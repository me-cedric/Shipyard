//! Detection tests (spec `refs`, REQ-005, Q-011 option 1).

use shipyard_core::refs::{Ref, detect};

fn found(text: &str) -> Vec<String> {
    detect(text).iter().map(|f| f.target.to_string()).collect()
}

#[test]
fn finds_a_ref_in_prose() {
    assert_eq!(found("See adr:0004 for the reason."), ["adr:0004"]);
}

#[test]
fn skips_a_code_span() {
    assert!(found("Write `adr:0004` in the field.").is_empty());
    assert!(found("Write ``adr:0004`` in the field.").is_empty());
    assert_eq!(found("`a` adr:0004 `b`"), ["adr:0004"]);
}

#[test]
fn an_unclosed_backtick_does_not_hide_the_rest() {
    assert_eq!(found("it`s adr:0004"), ["adr:0004"]);
}

#[test]
fn skips_a_fenced_block_and_resumes_after_it() {
    let text =
        "before q:Q-001\n```rust\nlet x = \"wi:SHIP-1\";\n```\nafter q:Q-002\n~~~\nq:Q-003\n~~~\n";
    assert_eq!(found(text), ["q:Q-001", "q:Q-002"]);
}

#[test]
fn a_shorter_fence_does_not_close_a_longer_one() {
    assert!(found("````\n```\nq:Q-001\n````\n").is_empty());
}

#[test]
fn trims_punctuation_and_keeps_the_range() {
    let text = "(spec:auth#REQ-003), wi:SHIP-42. doc:docs/a.md:";
    let hits = detect(text);
    let names: Vec<_> = hits.iter().map(|h| h.target.to_string()).collect();
    assert_eq!(names, ["spec:auth#REQ-003", "wi:SHIP-42", "doc:docs/a.md"]);
    for h in &hits {
        assert_eq!(text[h.start..h.end], h.target.to_string());
    }
}

#[test]
fn ignores_invalid_text_and_urls() {
    assert!(found("foo:bar adr:12 https://example.com/x").is_empty());
}

#[test]
fn kind_names_the_prefix() {
    assert_eq!(detect("wi:SHIP-1")[0].target.kind(), "wi");
    assert_eq!(Ref::Adr("0001".into()).kind(), "adr");
}
