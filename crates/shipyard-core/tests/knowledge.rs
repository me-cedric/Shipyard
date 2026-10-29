//! Knowledge rules: orphan and stale marks, path order, glossary (spec `knowledge`, REQ-007,
//! REQ-020, REQ-021).

use shipyard_core::knowledge::{Stamp, glossary, marks, path_order};

fn stamp(r: &str, changed: i64) -> Stamp {
    Stamp {
        reference: r.into(),
        changed,
    }
}

fn edge(s: &str, t: &str) -> (String, String) {
    (s.into(), t.into())
}

fn strings(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

#[test]
fn an_entity_that_nobody_cites_is_an_orphan() {
    let nodes = [
        stamp("spec:a", 5),
        stamp("adr:0004", 5),
        stamp("adr:0009", 5),
    ];
    let m = marks(&nodes, &[edge("spec:a", "adr:0004")]);
    assert!(!m["adr:0004"].orphan);
    assert!(m["spec:a"].orphan && m["adr:0009"].orphan);
}

#[test]
fn a_self_citation_does_not_save_an_orphan() {
    let m = marks(&[stamp("adr:0004", 1)], &[edge("adr:0004", "adr:0004")]);
    assert!(m["adr:0004"].orphan);
}

#[test]
fn a_spec_is_stale_when_a_cited_adr_changed_after_it() {
    let nodes = [
        stamp("spec:a", 10),
        stamp("adr:0004", 20),
        stamp("adr:0005", 5),
    ];
    let m = marks(
        &nodes,
        &[edge("spec:a", "adr:0004"), edge("spec:a", "adr:0005")],
    );
    assert!(m["spec:a"].stale);
    assert!(!m["adr:0004"].stale && !m["adr:0005"].stale);
}

#[test]
fn an_unknown_time_or_an_unknown_end_marks_nothing_stale() {
    let nodes = [stamp("spec:a", 0), stamp("adr:0004", 20)];
    let m = marks(
        &nodes,
        &[edge("spec:a", "adr:0004"), edge("spec:a", "adr:9999")],
    );
    assert!(!m["spec:a"].stale);
}

#[test]
fn the_path_goes_models_then_adrs_by_number_then_capability_specs() {
    let refs = strings(&[
        "spec:work",
        "adr:0010",
        "wi:KEY-1",
        "spec:work#REQ-001",
        "adr:0002",
        "model:core",
        "spec:agents",
        "adr:0002",
    ]);
    assert_eq!(
        path_order(&refs),
        strings(&[
            "model:core",
            "adr:0002",
            "adr:0010",
            "spec:agents",
            "spec:work"
        ])
    );
}

#[test]
fn the_glossary_reads_the_glossary_section_only() {
    let spec = "# Spec\n## Purpose\nrun: not a term here\n### Glossary\n\
                - run: one agent job\n- `Wave`: a build step\nnot a line\n### Goal\nx: y\n";
    let other = "### Glossary\nrun: a second meaning\nbrief: a short text\n";
    let terms = glossary(&[
        ("spec:factory".into(), spec.into()),
        ("spec:work".into(), other.into()),
    ]);
    let got: Vec<_> = terms
        .iter()
        .map(|t| (t.term.as_str(), t.meaning.as_str(), t.spec.as_str()))
        .collect();
    assert_eq!(
        got,
        [
            ("brief", "a short text", "spec:work"),
            ("run", "one agent job", "spec:factory"),
            ("Wave", "a build step", "spec:factory"),
        ]
    );
}
