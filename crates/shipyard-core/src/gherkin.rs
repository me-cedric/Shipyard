//! Gherkin test plans: parser and requirement coverage (spec `specs`, REQ-011 to REQ-013).
//! Tag, step, Background, Outline and Examples rules follow the usual Gherkin reader. No I/O.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::refs::detect;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub keyword: String,
    pub text: String,
    pub line: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub name: String,
    pub line: u32,
    pub steps: Vec<Step>,
    /// Each ref in the name, the tags, the steps and the doc strings, and the tags of the feature.
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub title: String,
    pub scenarios: Vec<Scenario>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyntaxError {
    pub line: u32,
    pub message: String,
}

#[derive(PartialEq)]
enum Block {
    Top,
    Background,
    Scenario,
    Examples,
}

const STEPS: [&str; 6] = ["Given", "When", "Then", "And", "But", "*"];

fn add_refs(refs: &mut Vec<String>, text: &str) {
    for f in detect(text) {
        let s = f.target.to_string();
        if !refs.contains(&s) {
            refs.push(s);
        }
    }
}

fn after<'a>(t: &'a str, keywords: &[&str]) -> Option<&'a str> {
    keywords
        .iter()
        .find_map(|k| t.strip_prefix(k)?.strip_prefix(':'))
        .map(str::trim)
}

fn step(t: &str) -> Option<(&str, &str)> {
    STEPS.iter().find_map(|k| {
        let rest = t.strip_prefix(k)?;
        (rest.is_empty() || rest.starts_with(char::is_whitespace)).then(|| (*k, rest.trim()))
    })
}

/// Parses a plan. Returns each syntax error with its line.
pub fn parse(text: &str) -> Result<Plan, Vec<SyntaxError>> {
    let mut title: Option<String> = None;
    let mut scenarios: Vec<Scenario> = Vec::new();
    let mut errors = Vec::new();
    let (mut feature_refs, mut tags) = (Vec::new(), Vec::new());
    let (mut block, mut has_step) = (Block::Top, false);
    let mut doc: Option<(&str, u32)> = None;
    for (raw, n) in text.trim_start_matches('\u{feff}').lines().zip(1u32..) {
        let t = raw.trim();
        let mut err = |m: &str| {
            errors.push(SyntaxError {
                line: n,
                message: m.into(),
            })
        };
        if let Some((delim, _)) = doc {
            if t.starts_with(delim) {
                doc = None;
            } else if let (Block::Scenario | Block::Examples, Some(s)) =
                (&block, scenarios.last_mut())
            {
                add_refs(&mut s.refs, t);
            }
        } else if t.is_empty() || t.starts_with('#') {
        } else if t.starts_with('@') {
            add_refs(&mut tags, t);
        } else if let Some(name) = after(t, &["Feature"]) {
            if title.is_some() {
                err("second Feature");
            }
            title.get_or_insert_with(|| name.into());
            feature_refs = std::mem::take(&mut tags);
            block = Block::Top;
        } else if after(t, &["Background"]).is_some() {
            (block, has_step) = (Block::Background, false);
            tags.clear();
        } else if after(t, &["Rule"]).is_some() {
            block = Block::Top;
            tags.clear();
        } else if let Some(name) = after(
            t,
            &[
                "Scenario Outline",
                "Scenario Template",
                "Scenario",
                "Example",
            ],
        ) {
            if title.is_none() {
                err("Scenario before Feature");
            }
            let mut refs = feature_refs.clone();
            for s in tags.drain(..) {
                if !refs.contains(&s) {
                    refs.push(s);
                }
            }
            add_refs(&mut refs, name);
            scenarios.push(Scenario {
                name: name.into(),
                line: n,
                steps: Vec::new(),
                refs,
            });
            (block, has_step) = (Block::Scenario, false);
        } else if after(t, &["Examples", "Scenarios"]).is_some() {
            block = Block::Examples;
            tags.clear();
        } else if let Some((keyword, rest)) = step(t) {
            match (&block, scenarios.last_mut()) {
                (Block::Scenario, Some(s)) => {
                    add_refs(&mut s.refs, rest);
                    s.steps.push(Step {
                        keyword: keyword.into(),
                        text: rest.into(),
                        line: n,
                    });
                    has_step = true;
                }
                (Block::Background, _) => has_step = true,
                _ => err("step outside a scenario"),
            }
        } else if t.starts_with('|') {
            if block != Block::Examples && !has_step {
                err("table outside a step");
            }
        } else if t.starts_with("\"\"\"") || t.starts_with("```") {
            doc = Some((&t[..3], n));
        } else if block == Block::Top {
            // Free text under Feature or Rule is a description.
        } else {
            err("step has no keyword");
        }
    }
    if let Some((_, line)) = doc {
        errors.push(SyntaxError {
            line,
            message: "doc string not closed".into(),
        });
    }
    match title {
        Some(title) if errors.is_empty() => Ok(Plan { title, scenarios }),
        None if errors.is_empty() => Err(vec![SyntaxError {
            line: 1,
            message: "no Feature".into(),
        }]),
        _ => Err(errors),
    }
}

fn cited(plans: &[Plan]) -> impl Iterator<Item = &String> {
    plans
        .iter()
        .flat_map(|p| &p.scenarios)
        .flat_map(|s| &s.refs)
}

/// The requirement refs that no scenario cites (REQ-013).
pub fn uncovered(reqs: &[String], plans: &[Plan]) -> Vec<String> {
    reqs.iter()
        .filter(|r| !cited(plans).any(|c| c == *r))
        .cloned()
        .collect()
}

/// The cited `spec:` refs that are not in `known`.
pub fn broken(plans: &[Plan], known: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for c in cited(plans) {
        if c.starts_with("spec:") && !known.contains(c) && !out.contains(c) {
            out.push(c.clone());
        }
    }
    out
}
