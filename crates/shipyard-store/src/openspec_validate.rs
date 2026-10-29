//! Strict validation of a change with the OpenSpec CLI, and the map of its findings to the
//! artifacts (spec `specs`, REQ-004). The mapper is pure; `run` starts the CLI.

use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use shipyard_core::specs::{ARTIFACTS, artifact_path, valid_change_id};
use specta::Type;

const TIMEOUT: Duration = Duration::from_secs(120);

/// Named `SpecFinding` in the bindings: `health::Finding` has the name `Finding`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename = "SpecFinding", rename_all = "camelCase")]
pub struct Finding {
    /// `proposal`, `spec`, `plan`, `checklist` or `tasks`.
    pub artifact: String,
    pub capability: Option<String>,
    /// The path inside the change folder.
    pub path: String,
    pub line: Option<u32>,
    pub message: String,
    pub level: String,
}

fn one(message: &str) -> Vec<Finding> {
    vec![Finding {
        artifact: "proposal".into(),
        capability: None,
        path: String::new(),
        line: None,
        message: message.into(),
        level: "error".into(),
    }]
}

/// The line of the first text that the message quotes, such as `"REQ-002 Second"`.
fn find_line(message: &str, text: &str) -> Option<u32> {
    let quoted = message.split('"').nth(1).filter(|q| !q.is_empty())?;
    text.lines()
        .position(|l| l.contains(quoted))
        .map(|i| i as u32 + 1)
}

fn finding(issue: &Value, files: &[(String, String)]) -> Finding {
    let s = |k: &str| issue[k].as_str().unwrap_or("");
    let cli_path = s("path").trim_start_matches("specs/");
    let (capability, file) = match cli_path.split_once('/') {
        Some((c, f)) => (Some(c.to_string()), f),
        None => (None, cli_path),
    };
    let stem = file
        .rsplit('/')
        .next()
        .unwrap_or(file)
        .trim_end_matches(".md");
    let artifact = match ARTIFACTS.iter().find(|a| **a == stem) {
        Some(a) => a,
        None if capability.is_some() => "spec",
        None => "proposal",
    };
    let path = artifact_path(artifact, capability.as_deref().unwrap_or(""));
    let line = files
        .iter()
        .find(|(p, _)| *p == path)
        .and_then(|(_, t)| find_line(s("message"), t));
    Finding {
        artifact: artifact.into(),
        capability,
        path,
        line,
        message: s("message").into(),
        level: s("level").to_lowercase(),
    }
}

/// Maps the JSON of `validate --json` to findings. `files` holds the text of each file of the
/// change, by path inside the change folder. Output that is not JSON gives `validator missing`.
pub fn map(json: &str, files: &[(String, String)]) -> Vec<Finding> {
    let Ok(v) = serde_json::from_str::<Value>(json) else {
        return one("validator missing");
    };
    if let Some(items) = v["items"].as_array() {
        return items
            .iter()
            .flat_map(|i| i["issues"].as_array().into_iter().flatten())
            .map(|i| finding(i, files))
            .collect();
    }
    match v["status"].as_array() {
        Some(st) => st
            .iter()
            .flat_map(|s| one(s["message"].as_str().unwrap_or("validator failed")))
            .collect(),
        None => one("validator missing"),
    }
}

fn read_files(root: &Path, dir: &Path, out: &mut Vec<(String, String)>) {
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            read_files(root, &p, out);
        } else if let (Ok(t), Ok(rel)) = (fs::read_to_string(&p), p.strip_prefix(root)) {
            out.push((rel.to_string_lossy().replace('\\', "/"), t));
        }
    }
}

/// Runs the command and gives its stdout, or the finding text on a start error or after `limit`.
/// On a timeout the child is killed.
fn output_within(mut cmd: Command, limit: Duration) -> Result<String, &'static str> {
    const MISSING: &str = "validator missing";
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| MISSING)?;
    let mut pipe = child.stdout.take().ok_or(MISSING)?;
    let reader = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = pipe.read_to_end(&mut buf);
        buf
    });
    let start = Instant::now();
    while child.try_wait().map_err(|_| MISSING)?.is_none() {
        if start.elapsed() >= limit {
            let _ = child.kill();
            let _ = child.wait();
            // No join: a grandchild may hold the pipe open.
            return Err("validator missing: no answer within 120 s");
        }
        thread::sleep(Duration::from_millis(50));
    }
    let out = reader.join().map_err(|_| MISSING)?;
    Ok(String::from_utf8_lossy(&out).into_owned())
}

/// Runs `npx -y --registry=<npm> @fission-ai/openspec@1.15.0 validate <id> --strict --json` in the
/// parent of the openspec folder. The version is fixed and the registry is set, so a repository
/// `.npmrc` cannot redirect it. A missing `npx`, a failed run or a run over 120 s gives one finding
/// `validator missing`.
pub fn run(openspec_dir: &Path, change_id: &str) -> Vec<Finding> {
    if !valid_change_id(change_id) {
        return one("invalid change id");
    }
    let Some(cwd) = openspec_dir.parent() else {
        return one("validator missing");
    };
    let mut cmd = Command::new("npx");
    cmd.args([
        "-y",
        "--registry=https://registry.npmjs.org/",
        "@fission-ai/openspec@1.15.0",
        "validate",
        change_id,
        "--strict",
        "--json",
    ])
    .current_dir(cwd);
    let out = match output_within(cmd, TIMEOUT) {
        Ok(o) => o,
        Err(m) => return one(m),
    };
    let root = openspec_dir.join("changes").join(change_id);
    let mut files = Vec::new();
    read_files(&root, &root, &mut files);
    map(&out, &files)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn a_slow_command_is_killed_at_the_limit() {
        let mut slow = Command::new("sleep");
        slow.arg("5");
        let t = Instant::now();
        assert!(
            output_within(slow, Duration::from_millis(200))
                .unwrap_err()
                .contains("120 s")
        );
        assert!(t.elapsed() < Duration::from_secs(3));
        let mut fast = Command::new("echo");
        fast.arg("hi");
        assert_eq!(output_within(fast, TIMEOUT).as_deref(), Ok("hi\n"));
    }
}
