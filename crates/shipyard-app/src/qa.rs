//! Code / Quality extras: the check and test commands that the project files declare, the coverage
//! report that the project produces, and the check that verifies all docs.
//!
//! A declared script runs through `code::check_run`, after a click, like a gate. Nothing here
//! starts a process by itself.

use std::path::{Path, PathBuf};

use serde::Serialize;
use shipyard_store::code::{ScanFinding, ScanSeverity};
use shipyard_store::openspec_validate;
use specta::Type;
use tauri::AppHandle;

use crate::commands::refs::with_index;
use crate::commands::{Api, AppState, Res, blocking};
use crate::design::project;

/// The name of the check that verifies all docs. `check_run` runs it in process.
pub const VERIFY_DOCS: &str = "verify all docs";
const SCRIPTS: [&str; 5] = ["test", "check", "lint", "typecheck", "coverage"];
const MAX_BYTES: u64 = 1_000_000;

/// The check and test commands of the project files: the scripts of `package.json` and
/// `cargo test` for a Cargo project.
pub fn scripts(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(json) = std::fs::read_to_string(root.join("package.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
    {
        let runner = if root.join("pnpm-lock.yaml").is_file() {
            "pnpm run"
        } else if root.join("yarn.lock").is_file() {
            "yarn run"
        } else {
            "npm run"
        };
        out.extend(
            SCRIPTS
                .iter()
                .filter(|n| json["scripts"][**n].is_string())
                .map(|n| format!("{runner} {n}")),
        );
    }
    if root.join("Cargo.toml").is_file() {
        out.push("cargo test".into());
    }
    out
}

// ---------------------------------------------------------------- coverage

/// The line coverage of the last report that the project produced.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    /// The repository path of the report.
    pub source: String,
    /// The share of covered lines, rounded, 0 to 100.
    pub percent: u32,
    pub covered: u32,
    pub total: u32,
}

const REPORTS: [&str; 6] = [
    "coverage/lcov.info",
    "coverage/coverage-summary.json",
    "coverage/cobertura-coverage.xml",
    "coverage.xml",
    "lcov.info",
    "target/llvm-cov/lcov.info",
];

fn sum_lines(text: &str, key: &str) -> u32 {
    text.lines()
        .filter_map(|l| l.strip_prefix(key)?.trim().parse::<u32>().ok())
        .sum()
}

fn attr(text: &str, name: &str) -> Option<u32> {
    let rest = &text[text.find(&format!("{name}=\""))? + name.len() + 2..];
    rest[..rest.find('"')?].parse().ok()
}

/// `(covered, total)` lines of a report: lcov, an Istanbul summary or Cobertura.
pub fn parse_lines(name: &str, text: &str) -> Option<(u32, u32)> {
    let (covered, total) = if name.ends_with(".json") {
        let lines = &serde_json::from_str::<serde_json::Value>(text).ok()?["total"]["lines"];
        (
            lines["covered"].as_u64()? as u32,
            lines["total"].as_u64()? as u32,
        )
    } else if name.ends_with(".xml") {
        (attr(text, "lines-covered")?, attr(text, "lines-valid")?)
    } else {
        (sum_lines(text, "LH:"), sum_lines(text, "LF:"))
    };
    (total > 0).then_some((covered, total))
}

pub fn coverage(s: &AppState) -> Res<Option<Coverage>> {
    let p = project(s)?;
    Ok(REPORTS.iter().find_map(|rel| {
        let full = p.root.join(rel);
        if std::fs::metadata(&full).ok()?.len() > 50 * MAX_BYTES {
            return None;
        }
        let (covered, total) = parse_lines(rel, &std::fs::read_to_string(full).ok()?)?;
        Some(Coverage {
            source: (*rel).into(),
            percent: (f64::from(covered) * 100.0 / f64::from(total)).round() as u32,
            covered,
            total,
        })
    }))
}

// ---------------------------------------------------------------- verify all docs

fn markdown(root: &Path, rel: &str, out: &mut Vec<String>) {
    let Ok(rd) = std::fs::read_dir(root.join(rel)) else {
        return;
    };
    let mut names: Vec<_> = rd.flatten().collect();
    names.sort_by_key(|e| e.file_name());
    for e in names {
        let name = e.file_name().to_string_lossy().into_owned();
        let child = format!("{rel}/{name}");
        match e.file_type() {
            Ok(t) if t.is_dir() && name != "node_modules" && name != ".git" => {
                markdown(root, &child, out);
            }
            Ok(t) if t.is_file() && name.ends_with(".md") => out.push(child),
            _ => {}
        }
    }
}

/// The relative links of a Markdown text that point to nothing, with their lines. Code fences are
/// skipped. shortcut: `[text](target)` only, no reference-style links.
pub fn broken_links(root: &Path, file: &str, text: &str) -> Vec<(u32, String)> {
    let dir = Path::new(file).parent().unwrap_or(Path::new(""));
    let mut out = Vec::new();
    let mut fenced = false;
    for (i, line) in text.lines().enumerate() {
        if line.trim_start().starts_with("```") || line.trim_start().starts_with("~~~") {
            fenced = !fenced;
        }
        if fenced {
            continue;
        }
        let mut rest = line;
        while let Some(at) = rest.find("](") {
            rest = &rest[at + 2..];
            let target = rest.split([')', ' ']).next().unwrap_or("");
            let path = target.split(['#', '?']).next().unwrap_or("");
            if path.is_empty()
                || path.contains("://")
                || path.starts_with("mailto:")
                || path.starts_with('<')
            {
                continue;
            }
            let path = path.replace("%20", " ");
            let full: PathBuf = match path.strip_prefix('/') {
                Some(abs) => root.join(abs),
                None => root.join(dir).join(&path),
            };
            if !full.exists() {
                out.push((i as u32 + 1, target.to_string()));
            }
        }
    }
    out
}

/// OpenSpec strict validation of each change, the links of the docs and the refs that point to
/// nothing. The summary goes to the `tail` of the report.
pub fn verify_docs(s: &AppState) -> Res<(String, Vec<ScanFinding>)> {
    let p = project(s)?;
    let specs = p.file.path("specs").to_string();
    let found = |severity, path: String, line, message: String| ScanFinding {
        severity,
        path,
        line,
        message,
    };
    let mut out = Vec::new();
    let changes: Vec<String> =
        shipyard_store::archive::dir_names(&p.root.join(&specs).join("changes"))
            .into_iter()
            .filter(|c| c != "archive")
            .collect();
    for id in &changes {
        for f in openspec_validate::run(&p.root.join(&specs), id) {
            let severity = if f.level == "error" {
                ScanSeverity::High
            } else {
                ScanSeverity::Medium
            };
            out.push(found(
                severity,
                format!("{specs}/changes/{id}/{}", f.path),
                f.line,
                f.message,
            ));
        }
    }
    let mut files = Vec::new();
    markdown(&p.root, "docs", &mut files);
    for file in &files {
        let Ok(text) = std::fs::read_to_string(p.root.join(file)) else {
            continue;
        };
        for (line, target) in broken_links(&p.root, file, &text) {
            out.push(found(
                ScanSeverity::Medium,
                file.clone(),
                Some(line),
                format!("broken link: {target}"),
            ));
        }
    }
    for b in with_index(s, |i| i.check())? {
        out.push(found(
            ScanSeverity::Medium,
            b.source,
            None,
            format!("broken ref: {}", b.target),
        ));
    }
    let tail = format!(
        "{} changes, {} pages, {} problems",
        changes.len(),
        files.len(),
        out.len()
    );
    Ok((tail, out))
}

#[tauri::command]
#[specta::specta]
pub async fn code_coverage(app: AppHandle) -> Api<Option<Coverage>> {
    blocking(app, coverage).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_three_report_formats_give_covered_and_total_lines() {
        assert_eq!(
            parse_lines(
                "coverage/lcov.info",
                "SF:a\nLF:10\nLH:7\nend_of_record\nSF:b\nLF:10\nLH:3\n"
            ),
            Some((10, 20))
        );
        assert_eq!(
            parse_lines(
                "coverage-summary.json",
                r#"{"total":{"lines":{"total":50,"covered":40,"pct":80}}}"#
            ),
            Some((40, 50))
        );
        assert_eq!(
            parse_lines(
                "coverage.xml",
                r#"<coverage lines-valid="8" lines-covered="2" line-rate="0.25">"#
            ),
            Some((2, 8))
        );
        assert_eq!(parse_lines("lcov.info", "SF:a\n"), None);
        assert_eq!(parse_lines("x.json", "{"), None);
    }

    #[test]
    fn the_scripts_of_the_project_files_become_checks() {
        let dir = tempfile::tempdir().unwrap();
        assert!(scripts(dir.path()).is_empty());
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"scripts":{"test":"vitest","build":"x","lint":"biome"}}"#,
        )
        .unwrap();
        std::fs::write(dir.path().join("pnpm-lock.yaml"), "").unwrap();
        std::fs::write(dir.path().join("Cargo.toml"), "").unwrap();
        assert_eq!(
            scripts(dir.path()),
            ["pnpm run test", "pnpm run lint", "cargo test"]
        );
    }

    #[test]
    fn a_link_to_a_missing_file_is_found_and_a_fence_or_an_address_is_not() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("docs")).unwrap();
        std::fs::write(dir.path().join("docs/b.md"), "").unwrap();
        let text = "[ok](b.md#top) [web](https://x.y/z) [gone](nope.md)\n```\n[x](lost.md)\n```\n[abs](/docs/b.md)\n";
        assert_eq!(
            broken_links(dir.path(), "docs/a.md", text),
            [(1, "nope.md".to_string())]
        );
    }

    #[test]
    fn verifying_all_docs_reports_a_broken_link_and_the_check_keeps_the_report() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let p = dir.path().join("one");
        shipyard_git::project::init(&p).unwrap();
        crate::commands::projects::open(&s, p.to_str().unwrap()).unwrap();
        std::fs::create_dir_all(p.join("docs")).unwrap();
        std::fs::write(p.join("docs/a.md"), "# A\n\n[gone](gone.md)\n").unwrap();
        let (tail, found) = verify_docs(&s).unwrap();
        assert!(tail.ends_with("problems"), "{tail}");
        let link: Vec<_> = found.iter().filter(|f| f.path == "docs/a.md").collect();
        assert_eq!(link.len(), 1);
        assert_eq!(link[0].line, Some(3));
        assert!(crate::code::check_run(&s, "verify all docs", false).is_err());
        let r = crate::code::check_run(&s, VERIFY_DOCS, true).unwrap();
        assert!(!r.passed);
        assert!(
            crate::code::quality_view(&s)
                .unwrap()
                .checks
                .iter()
                .any(|c| c.name == VERIFY_DOCS && c.last.is_some())
        );
    }
}
