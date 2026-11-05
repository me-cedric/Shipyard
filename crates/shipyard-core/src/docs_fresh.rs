//! Which docs are out of date against the code (spec `docs-freshness`, REQ-002, REQ-003). Pure:
//! the caller gives the changed files.

use crate::project::{DocRule, ProjectFile};

/// A doc target that did not follow. `rule` is the name of the rule, or its first pattern.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StaleDoc {
    pub rule: String,
    /// The target as the rule writes it: a path kind or a repository path.
    pub doc: String,
    /// The changed files that the rule matches.
    pub changed: Vec<String>,
}

/// The rules of the project, or the fixed chain of today when it has none (REQ-002).
pub fn rules(file: &ProjectFile) -> Vec<DocRule> {
    if !file.docs.is_empty() {
        return file.docs.clone();
    }
    let rule = |kind: &str, feeds: &[&str]| DocRule {
        name: Some(kind.into()),
        code: vec![format!("{}/**", file.path(kind).trim_matches('/'))],
        feeds: feeds.iter().map(|s| (*s).into()).collect(),
    };
    vec![
        rule("specs", &["designs", "models", "api", "data", "test-plans"]),
        rule("api", &["test-plans"]),
    ]
}

/// One segment against a segment pattern: `*` matches any text inside the segment.
fn segment(pattern: &str, text: &str) -> bool {
    let mut parts = pattern.split('*');
    let first = parts.next().unwrap_or("");
    let Some(mut rest) = text.strip_prefix(first) else {
        return false;
    };
    let mut parts: Vec<&str> = parts.collect();
    let Some(last) = parts.pop() else {
        return rest.is_empty();
    };
    for p in parts {
        let Some(at) = rest.find(p) else {
            return false;
        };
        rest = &rest[at + p.len()..];
    }
    rest.ends_with(last)
}

/// `*` matches any text inside one segment (so `*` alone is a whole segment and `*.rs` is a
/// suffix), and `**` as a segment matches any number of segments. Segments are `/` apart.
pub fn matches(pattern: &str, path: &str) -> bool {
    fn go(p: &[&str], s: &[&str]) -> bool {
        match p.split_first() {
            None => s.is_empty(),
            Some((&"**", rest)) => (0..=s.len()).any(|i| go(rest, &s[i..])),
            Some((seg, rest)) => s
                .split_first()
                .is_some_and(|(x, tail)| segment(seg, x) && go(rest, tail)),
        }
    }
    let p: Vec<&str> = pattern.split('/').collect();
    let s: Vec<&str> = path.split('/').collect();
    go(&p, &s)
}

/// The folder or file of a doc target: a path kind of the project, else the path itself.
pub fn target_path<'a>(file: &'a ProjectFile, target: &'a str) -> &'a str {
    let known = file.paths.contains_key(target) || !file.path(target).is_empty();
    if known { file.path(target) } else { target }.trim_matches('/')
}

/// One entry for each rule and each target where a file that the rule matches changed and no file
/// of the target changed. A rename lists both paths in `changed`, so both count.
pub fn stale(file: &ProjectFile, changed: &[String]) -> Vec<StaleDoc> {
    let mut out = Vec::new();
    for r in rules(file) {
        let hit: Vec<String> = changed
            .iter()
            .filter(|c| r.code.iter().any(|p| matches(p, c)))
            .cloned()
            .collect();
        if hit.is_empty() {
            continue;
        }
        for doc in &r.feeds {
            let at = target_path(file, doc);
            let followed = changed
                .iter()
                .any(|c| c == at || c.strip_prefix(at).is_some_and(|r| r.starts_with('/')));
            if !followed {
                out.push(StaleDoc {
                    rule: r.name.clone().unwrap_or_else(|| r.code[0].clone()),
                    doc: doc.clone(),
                    changed: hit.clone(),
                });
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(l: &[&str]) -> Vec<String> {
        l.iter().map(|s| (*s).into()).collect()
    }

    fn cargo_rule() -> ProjectFile {
        let mut f = ProjectFile::new("A", "A");
        f.docs = vec![DocRule {
            name: None,
            code: v(&["crates/*/Cargo.toml"]),
            feeds: v(&["models"]),
        }];
        f
    }

    #[test]
    fn the_matcher_knows_one_segment_and_any_segments() {
        assert!(matches("crates/*/Cargo.toml", "crates/core/Cargo.toml"));
        assert!(!matches("crates/*/Cargo.toml", "crates/a/b/Cargo.toml"));
        assert!(!matches("crates/*/Cargo.toml", "crates/Cargo.toml"));
        assert!(matches("src/**", "src/a/b/c.rs"));
        assert!(matches("src/**/mod.rs", "src/mod.rs"));
        assert!(matches("src/**/mod.rs", "src/a/b/mod.rs"));
        assert!(!matches("src/**", "lib/a.rs"));
        assert!(matches("a.rs", "a.rs") && !matches("a.rs", "b.rs"));
        // A wildcard inside a segment: prefix, suffix and middle, never across a `/`.
        assert!(matches("src/*.rs", "src/lib.rs"));
        assert!(!matches("src/*.rs", "src/a/lib.rs"));
        assert!(!matches("src/*.rs", "src/lib.ts"));
        assert!(matches("src/mod_*", "src/mod_a"));
        assert!(matches("a*b*c", "aXbYc") && !matches("a*b*c", "aXcYb"));
        assert!(matches("*", "anything") && matches("**/*.rs", "a/b/c.rs"));
        assert!(!matches("src/*.rs", "src/.rs.bak"));
    }

    #[test]
    fn a_doc_is_stale_until_its_target_moves() {
        let f = cargo_rule();
        let w = stale(&f, &v(&["crates/x/Cargo.toml"]));
        assert_eq!(w.len(), 1);
        assert_eq!(
            (w[0].rule.as_str(), w[0].doc.as_str()),
            ("crates/*/Cargo.toml", "models")
        );
        assert_eq!(w[0].changed, v(&["crates/x/Cargo.toml"]));
        let both = v(&["crates/x/Cargo.toml", "docs/models/architecture.c4"]);
        assert!(stale(&f, &both).is_empty());
        assert!(stale(&f, &v(&["README.md"])).is_empty());
    }

    #[test]
    fn a_target_is_a_path_kind_or_a_repository_path() {
        let mut f = cargo_rule();
        f.docs[0].feeds = v(&["docs/handbook.md"]);
        assert_eq!(stale(&f, &v(&["crates/x/Cargo.toml"])).len(), 1);
        assert!(stale(&f, &v(&["crates/x/Cargo.toml", "docs/handbook.md"])).is_empty());
        f.paths.insert("models".into(), "arch".into());
        f.docs[0].feeds = v(&["models"]);
        assert!(stale(&f, &v(&["crates/x/Cargo.toml", "arch/a.c4"])).is_empty());
        assert_eq!(
            stale(&f, &v(&["crates/x/Cargo.toml", "docs/models/a.c4"])).len(),
            1
        );
    }

    #[test]
    fn a_project_with_no_rule_keeps_the_old_chain() {
        let f = ProjectFile::new("A", "A");
        let spec = v(&["docs/openspec/x/spec.md"]);
        let w = stale(&f, &spec);
        let to: Vec<&str> = w.iter().map(|w| w.doc.as_str()).collect();
        assert_eq!(to, ["designs", "models", "api", "data", "test-plans"]);
        assert!(w.iter().all(|w| w.rule == "specs"));
        let api = stale(&f, &v(&["docs/api/a.yaml", "docs/openspec/x/spec.md"]));
        assert!(!api.iter().any(|w| w.doc == "api"));
        assert!(api.iter().any(|w| w.rule == "api" && w.doc == "test-plans"));
    }

    #[test]
    fn a_rename_counts_both_paths() {
        let f = cargo_rule();
        let renamed = v(&["crates/old/Cargo.toml", "crates/new/Cargo.toml"]);
        assert_eq!(stale(&f, &renamed)[0].changed, renamed);
        let moved = v(&[
            "docs/models/old.c4",
            "docs/models/new.c4",
            "crates/new/Cargo.toml",
        ]);
        assert!(stale(&f, &moved).is_empty());
    }
}
