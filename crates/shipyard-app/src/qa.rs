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
const MAX_BYTES: u64 = 1_000_000;
/// The commands that a proposal keeps, at most.
const MAX_GATES: usize = 10;

/// A check of the project: its command and, for a named command, the label key (`lint`,
/// `typecheck`, `test`, `check`, `build`) that the view turns into a plain name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Check {
    pub label: Option<&'static str>,
    pub command: String,
}

fn check(label: &'static str, command: impl Into<String>) -> Check {
    Check {
        label: Some(label),
        command: command.into(),
    }
}

/// The named commands of `agent-compass.commands.json`: `lint`, `typecheck` and `test`. `check` and
/// `build` count only when none of those three exists.
fn compass(root: &Path) -> Vec<Check> {
    let Some(json) = std::fs::read_to_string(root.join("agent-compass.commands.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
    else {
        return Vec::new();
    };
    let pick = |names: &[&'static str]| -> Vec<Check> {
        names
            .iter()
            .filter_map(|n| {
                let c = json[*n].as_str()?.trim();
                (!c.is_empty()).then(|| check(n, c))
            })
            .collect()
    };
    let main = pick(&["lint", "typecheck", "test"]);
    if !main.is_empty() {
        return main;
    }
    pick(&["check", "build"]).into_iter().take(1).collect()
}

/// Whether a `Makefile` or `justfile` text has a target called `name`.
fn has_target(text: &str, name: &str) -> bool {
    text.lines().any(|l| {
        l.strip_prefix(name)
            .is_some_and(|r| (r.starts_with(':') && !r.starts_with(":=")) || r.starts_with(' '))
    })
}

/// The checks that the project files show: the scripts of `package.json`, and the test command
/// of Cargo, Gradle, SwiftPM, a `Makefile` or a `justfile`. A stack that the project does not
/// have gives no check.
fn detected(root: &Path) -> Vec<Check> {
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
        for n in ["lint", "typecheck", "test", "check"] {
            if json["scripts"][n].is_string() {
                out.push(check(n, format!("{runner} {n}")));
            }
        }
    }
    if root.join("Cargo.toml").is_file() {
        out.push(check("test", "cargo test"));
    }
    if root.join("gradlew").is_file() {
        out.push(check("test", "./gradlew test"));
    }
    if root.join("Package.swift").is_file() {
        out.push(check("test", "swift test"));
    }
    for (file, tool) in [("Makefile", "make"), ("justfile", "just")] {
        if let Ok(text) = std::fs::read_to_string(root.join(file)) {
            for n in ["test", "check"] {
                if has_target(&text, n) {
                    out.push(check(n, format!("{tool} {n}")));
                }
            }
        }
    }
    out
}

/// Whether the project has an OpenSpec change that is not archived.
fn has_changes(root: &Path) -> bool {
    let file = match shipyard_store::project::read_project_file(root) {
        Ok(shipyard_store::project::FileRead::Valid(f)) => f,
        _ => shipyard_core::project::ProjectFile::new("", ""),
    };
    let specs = file.path("specs");
    shipyard_store::archive::dir_names(&root.join(specs).join("changes"))
        .iter()
        .any(|c| c != "archive")
}

/// The checks of a project, in this order: the `gates` of `.shipyard/project.yaml` (the team's own
/// list), else the named commands of `agent-compass.commands.json`, else the detected ones. The
/// check that verifies all docs follows when the project has OpenSpec changes.
pub fn checks(root: &Path) -> Vec<Check> {
    let gates = match shipyard_store::project::read_project_file(root) {
        Ok(shipyard_store::project::FileRead::Valid(f)) => f.gates,
        _ => Vec::new(),
    };
    let mut all: Vec<Check> = if gates.is_empty() {
        let named = compass(root);
        if named.is_empty() {
            detected(root)
        } else {
            named
        }
    } else {
        gates
            .into_iter()
            .map(|command| Check {
                label: None,
                command,
            })
            .collect()
    };
    let mut seen = Vec::new();
    all.retain(|c| {
        let new = !seen.contains(&c.command);
        seen.push(c.command.clone());
        new
    });
    if has_changes(root) {
        all.push(Check {
            label: None,
            command: VERIFY_DOCS.into(),
        });
    }
    all
}

// ---------------------------------------------------------------- a failed check

/// The program that a shell could not find, from the end of a failed output. `127` is the code of
/// a shell, `9009` the code of `cmd` on Windows.
fn missing_program(code: Option<i32>, tail: &str) -> Option<String> {
    let line = tail.lines().rev().find(|l| {
        l.contains("not found") || l.contains("is not recognized as an internal or external")
    })?;
    let program = match code {
        Some(127) => {
            let segs: Vec<&str> = line.split(':').map(str::trim).collect();
            let at = segs.iter().rposition(|s| s.ends_with("not found"))?;
            if at + 1 == segs.len() {
                segs.get(at.checked_sub(1)?)?.to_string()
            } else {
                segs[at + 1].to_string()
            }
        }
        Some(9009) => line.split('\'').nth(1)?.to_string(),
        _ => return None,
    };
    let program = program.trim_matches(['\'', '"', '`']);
    // A line that names more than one word is a message of the program, not a name.
    (!program.is_empty() && !program.contains(char::is_whitespace)).then(|| program.to_string())
}

/// Why a check failed, in plain words: the program that is not found, or the exit code.
pub fn failure(command: &str, code: Option<i32>, counts: &str, tail: &str) -> String {
    if let Some(p) = missing_program(code, tail) {
        return format!("{p} is not installed or not found");
    }
    match code {
        Some(n) => format!("`{command}` stopped with exit code {n}"),
        None if tail.is_empty() => counts.into(),
        None => format!("`{command}` was stopped before it ended"),
    }
}

// ---------------------------------------------------------------- set up checks

/// The commands of the `run:` steps of a workflow text. A command that needs the CI (an
/// expression, a secret) or only installs a tool is out.
fn run_commands(text: &str) -> Vec<String> {
    let lines: Vec<&str> = text.lines().collect();
    let indent = |l: &str| l.len() - l.trim_start().len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let l = lines[i];
        i += 1;
        let t = l.trim_start();
        let t = t.strip_prefix("- ").unwrap_or(t).trim_start();
        let Some(rest) = t.strip_prefix("run:") else {
            continue;
        };
        let rest = rest.trim();
        if !rest.starts_with(['|', '>']) {
            out.push(rest.trim_matches(['\'', '"']).to_string());
            continue;
        }
        let mut block = Vec::new();
        while i < lines.len() && (lines[i].trim().is_empty() || indent(lines[i]) > indent(l)) {
            block.push(lines[i].trim());
            i += 1;
        }
        if rest.starts_with('>') {
            out.push(block.join(" "));
            continue;
        }
        let mut joined = String::new();
        for b in block {
            match b.strip_suffix('\\') {
                Some(open) => {
                    joined.push_str(open.trim_end());
                    joined.push(' ');
                }
                None => {
                    joined.push_str(b);
                    out.push(std::mem::take(&mut joined));
                }
            }
        }
    }
    out
}

const CI_WORDS: [&str; 7] = ["lint", "test", "typecheck", "check", "clippy", "fmt", "tsc"];
const CI_SKIP: [&str; 16] = [
    "corepack",
    "pnpm install",
    "npm ci",
    "npm install",
    "yarn install",
    "sudo",
    "apt",
    "echo",
    "git ",
    "cd ",
    "curl",
    "export",
    "brew",
    "pip",
    "test ",
    "[",
];

fn is_check(c: &str) -> bool {
    let c = c.trim();
    !c.is_empty()
        && !c.contains("${{")
        && !c.contains("install")
        && !CI_SKIP.iter().any(|p| c.starts_with(p))
        && CI_WORDS.iter().any(|w| c.contains(w))
}

/// A proposal for the `gates` of a project: the gates that it saved, then the commands that the
/// project already shows (the compass commands, the detected scripts), then the check steps of its CI workflows. A person
/// edits the list before it is saved. shortcut: a plain reader of the `run:` lines, no agent.
pub fn propose(root: &Path) -> Vec<String> {
    let named = compass(root);
    let mut all: Vec<String> = match shipyard_store::project::read_project_file(root) {
        Ok(shipyard_store::project::FileRead::Valid(f)) => f.gates,
        _ => Vec::new(),
    };
    let found = if named.is_empty() {
        detected(root)
    } else {
        named
    };
    for c in found.into_iter().map(|c| c.command) {
        if !all.contains(&c) {
            all.push(c);
        }
    }
    let mut files: Vec<_> = std::fs::read_dir(root.join(".github/workflows"))
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "yml" || x == "yaml"))
        .collect();
    files.sort();
    for f in files {
        let text = std::fs::read_to_string(f).unwrap_or_default();
        for c in run_commands(&text).into_iter().filter(|c| is_check(c)) {
            if !all.contains(&c) {
                all.push(c);
            }
        }
    }
    all.truncate(MAX_GATES);
    all
}

/// Writes the `gates` of `.shipyard/project.yaml`. The other fields stay. A file that does not
/// read is never overwritten.
pub fn save_gates(s: &AppState, gates: Vec<String>) -> Res<()> {
    use shipyard_store::project::{FileRead, read_project_file, write_project_file};
    let entry = s.registry()?.active().cloned().ok_or("no active project")?;
    let root = PathBuf::from(&entry.path);
    let mut file = match read_project_file(&root).map_err(crate::commands::err)? {
        FileRead::Valid(f) => f,
        FileRead::Missing => shipyard_core::project::ProjectFile::new(&entry.name, &entry.key),
        FileRead::Invalid(_) => {
            return Err("fix `.shipyard/project.yaml` first: it does not read".into());
        }
    };
    file.gates = gates
        .into_iter()
        .map(|g| g.trim().to_string())
        .filter(|g| !g.is_empty())
        .collect();
    write_project_file(&root, &file).map_err(crate::commands::err)
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

/// The proposal for the `gates` of the active project. It reads files and writes nothing.
#[tauri::command]
#[specta::specta]
pub async fn code_gates_propose(app: AppHandle) -> Api<Vec<String>> {
    blocking(app, |s| Ok(propose(&project(s)?.root))).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_gates_save(app: AppHandle, gates: Vec<String>, click: bool) -> Api<()> {
    blocking(app, move |s| {
        crate::work::need_click(s, click)?;
        save_gates(s, gates)
    })
    .await
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

    fn commands(root: &Path) -> Vec<String> {
        checks(root).into_iter().map(|c| c.command).collect()
    }

    fn write(root: &Path, rel: &str, text: &str) {
        let full = root.join(rel);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        std::fs::write(full, text).unwrap();
    }

    #[test]
    fn the_checks_follow_the_gates_then_the_compass_commands_then_the_detected_ones() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(checks(root).is_empty());
        write(
            root,
            "package.json",
            r#"{"scripts":{"test":"vitest","build":"x","lint":"biome","check":"c"}}"#,
        );
        write(root, "pnpm-lock.yaml", "");
        write(root, "Cargo.toml", "");
        write(root, "Makefile", "build:\n\ttrue\ntest:\n\ttrue\n");
        assert_eq!(
            commands(root),
            [
                "pnpm run lint",
                "pnpm run test",
                "pnpm run check",
                "cargo test",
                "make test"
            ]
        );
        write(
            root,
            "agent-compass.commands.json",
            r#"{"check":"pnpm check","lint":"pnpm lint","typecheck":null,"test":"pnpm t","build":"pnpm b"}"#,
        );
        let named = checks(root);
        assert_eq!(
            named
                .iter()
                .map(|c| (c.label, c.command.as_str()))
                .collect::<Vec<_>>(),
            [(Some("lint"), "pnpm lint"), (Some("test"), "pnpm t")]
        );
        write(
            root,
            ".shipyard/project.yaml",
            "name: X\nkey: X\ngates:\n  - make ci\n",
        );
        let own = checks(root);
        assert_eq!(
            own,
            [Check {
                label: None,
                command: "make ci".into()
            }]
        );
    }

    #[test]
    fn a_compass_file_with_only_check_and_build_gives_check() {
        let dir = tempfile::tempdir().unwrap();
        write(
            dir.path(),
            "agent-compass.commands.json",
            r#"{"check":"pnpm check","build":"pnpm build"}"#,
        );
        assert_eq!(commands(dir.path()), ["pnpm check"]);
    }

    #[test]
    fn only_the_stacks_that_the_project_has_give_a_check() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "package.json", r#"{"scripts":{"lint":"x"}}"#);
        assert_eq!(commands(root), ["npm run lint"]);
        write(root, "gradlew", "");
        write(root, "Package.swift", "");
        write(root, "justfile", "check *args:\n  true\n");
        assert_eq!(
            commands(root),
            ["npm run lint", "./gradlew test", "swift test", "just check"]
        );
    }

    #[test]
    fn verify_all_docs_shows_only_with_an_open_spec_change() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("docs/openspec/changes/archive")).unwrap();
        assert!(commands(root).is_empty());
        std::fs::create_dir_all(root.join("docs/openspec/changes/one")).unwrap();
        assert_eq!(commands(root), [VERIFY_DOCS]);
    }

    #[test]
    fn a_failure_names_the_missing_program_or_the_exit_code() {
        let why = |code, tail: &str| failure("pnpm run lint", code, "last", tail);
        for tail in [
            "sh: pnpm: command not found",
            "zsh: command not found: pnpm",
            "sh: 1: pnpm: not found",
            "/bin/sh: line 1: pnpm: command not found",
        ] {
            assert_eq!(why(Some(127), tail), "pnpm is not installed or not found");
        }
        assert_eq!(
            why(
                Some(9009),
                "'pnpm' is not recognized as an internal or external command,"
            ),
            "pnpm is not installed or not found"
        );
        assert_eq!(
            why(Some(1), "sh: pnpm: command not found"),
            "`pnpm run lint` stopped with exit code 1"
        );
        assert_eq!(
            why(Some(127), "no such thing"),
            "`pnpm run lint` stopped with exit code 127"
        );
        assert_eq!(
            failure("x", None, "timeout after 9 s", ""),
            "timeout after 9 s"
        );
    }

    #[test]
    fn the_run_steps_of_a_workflow_give_the_check_commands() {
        let text = "jobs:\n  a:\n    steps:\n      - run: corepack enable && pnpm install\n      - run: pnpm lint\n      - run: |\n          cargo fmt --all --check\n          cargo clippy \\\n            -- -D warnings\n          echo done\n      - run: pnpm test ${{ matrix.x }}\n      - name: x\n        run: pnpm exec playwright install chromium\n";
        let found: Vec<String> = run_commands(text)
            .into_iter()
            .filter(|c| is_check(c))
            .collect();
        assert_eq!(
            found,
            [
                "pnpm lint",
                "cargo fmt --all --check",
                "cargo clippy -- -D warnings"
            ]
        );
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), ".github/workflows/ci.yml", text);
        write(dir.path(), "Cargo.toml", "");
        assert_eq!(
            propose(dir.path()),
            [
                "cargo test",
                "pnpm lint",
                "cargo fmt --all --check",
                "cargo clippy -- -D warnings"
            ]
        );
    }

    #[test]
    fn the_saved_gates_come_first_in_the_proposal() {
        let dir = tempfile::tempdir().unwrap();
        let (s, p) = open_project(dir.path());
        write(&p, "Cargo.toml", "");
        save_gates(&s, vec!["make verify".into(), "cargo test".into()]).unwrap();
        assert_eq!(propose(&p), ["make verify", "cargo test"]);
    }

    fn open_project(dir: &Path) -> (AppState, PathBuf) {
        let s = AppState::new(dir.join("data"));
        let p = dir.join("one");
        shipyard_git::project::init(&p).unwrap();
        crate::commands::projects::open(&s, p.to_str().unwrap()).unwrap();
        (s, p)
    }

    #[test]
    fn a_failed_check_shows_why_and_the_gates_save_keeps_the_other_fields() {
        let dir = tempfile::tempdir().unwrap();
        let (s, p) = open_project(dir.path());
        assert!(save_gates(&s, vec!["  ".into()]).is_ok());
        save_gates(
            &s,
            vec![
                " echo one; exit 3 ".into(),
                "no-such-program-xyz".into(),
                "".into(),
            ],
        )
        .unwrap();
        let file = std::fs::read_to_string(p.join(".shipyard/project.yaml")).unwrap();
        assert!(
            file.contains("key:") && file.contains("- no-such-program-xyz"),
            "{file}"
        );
        let r = crate::code::check_run(&s, "echo one; exit 3", true).unwrap();
        assert!(!r.passed);
        assert_eq!(
            r.findings[0].message,
            "`echo one; exit 3` stopped with exit code 3"
        );
        assert_eq!(r.tail, "one");
        let r = crate::code::check_run(&s, "no-such-program-xyz", true).unwrap();
        assert_eq!(
            r.findings[0].message,
            "no-such-program-xyz is not installed or not found"
        );
        std::fs::write(p.join(".shipyard/project.yaml"), "gates: [").unwrap();
        assert!(save_gates(&s, vec!["x".into()]).is_err());
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
        let (s, p) = open_project(dir.path());
        std::fs::create_dir_all(p.join("docs/openspec/changes/one")).unwrap();
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
