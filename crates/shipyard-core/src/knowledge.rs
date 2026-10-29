//! Knowledge rules (spec `knowledge`, REQ-007, REQ-020, REQ-021). No I/O.

use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;
use specta::Type;

use crate::refs::{Ref, parse};

/// An entity of the graph and the time of its last change in seconds. `0` means unknown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stamp {
    pub reference: String,
    pub changed: i64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Type)]
pub struct Marks {
    /// No entity cites it.
    pub orphan: bool,
    /// An entity that it cites changed after its own last change.
    pub stale: bool,
}

/// `edges` are `(source, target)`: the source cites the target. An edge with an unknown end
/// or an unknown time marks nothing as stale.
pub fn marks(nodes: &[Stamp], edges: &[(String, String)]) -> BTreeMap<String, Marks> {
    let time: BTreeMap<&str, i64> = nodes
        .iter()
        .map(|n| (n.reference.as_str(), n.changed))
        .collect();
    let cited: BTreeSet<&str> = edges
        .iter()
        .filter(|(s, t)| s != t)
        .map(|(_, t)| t.as_str())
        .collect();
    let mut out: BTreeMap<String, Marks> = nodes
        .iter()
        .map(|n| {
            let orphan = !cited.contains(n.reference.as_str());
            (
                n.reference.clone(),
                Marks {
                    orphan,
                    stale: false,
                },
            )
        })
        .collect();
    for (s, t) in edges {
        let (Some(&ts), Some(&tt)) = (time.get(s.as_str()), time.get(t.as_str())) else {
            continue;
        };
        if ts > 0 && tt > ts {
            out.entry(s.clone()).or_default().stale = true;
        }
    }
    out
}

/// The learning path: models first, then the ADRs in number order, then the capability specs.
/// A requirement ref (`spec:x#REQ-001`) and any other kind stay out. Each step appears once.
pub fn path_order(refs: &[String]) -> Vec<String> {
    let mut steps: Vec<(u8, String, String)> = refs
        .iter()
        .filter_map(|r| {
            let (rank, key) = match parse(r)? {
                Ref::Slug(crate::refs::SlugKind::Model, n) => (0, n),
                Ref::Adr(n) => (1, n),
                Ref::Spec {
                    capability,
                    req: None,
                } => (2, capability),
                _ => return None,
            };
            Some((rank, key, r.clone()))
        })
        .collect();
    steps.sort();
    steps.dedup();
    steps.into_iter().map(|(_, _, r)| r).collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Term {
    pub term: String,
    pub meaning: String,
    /// The spec that defines it.
    pub spec: String,
}

/// The `term: meaning` lines of the `### Glossary` section of each spec (Q-046 option 1).
/// A section ends at the next heading. The first definition of a term wins. Sorted by term.
pub fn glossary(specs: &[(String, String)]) -> Vec<Term> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for (spec, text) in specs {
        let mut inside = false;
        for line in text.lines() {
            if line.starts_with('#') {
                inside = line.trim_end() == "### Glossary";
                continue;
            }
            let item = line.trim().trim_start_matches(['-', '*']).trim();
            let Some((term, meaning)) = item.split_once(':').filter(|_| inside) else {
                continue;
            };
            let (term, meaning) = (term.trim().trim_matches('`'), meaning.trim());
            if !term.is_empty() && !meaning.is_empty() && seen.insert(term.to_lowercase()) {
                out.push(Term {
                    term: term.into(),
                    meaning: meaning.into(),
                    spec: spec.clone(),
                });
            }
        }
    }
    out.sort_by_key(|t| t.term.to_lowercase());
    out
}
