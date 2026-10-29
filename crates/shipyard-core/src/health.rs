//! Health rules: pure functions from facts to findings (spec `projects`, REQ-011 to REQ-013, REQ-018).

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::project::{PROJECT_FILE, ignore_block};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Severity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Group {
    Compliance,
    Tools,
    Refs,
    /// Reserved: no generated file exists yet.
    Generated,
}

/// What a person can do about a finding. Only `Write` changes a file, and only after a confirm click.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Fix {
    Write { path: String, content: String },
    Open { target: String },
    Recheck,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Finding {
    pub id: String,
    pub group: Group,
    pub severity: Severity,
    /// Message key. The UI translates it.
    pub code: String,
    pub detail: Option<String>,
    /// Ref of the entity that holds the problem.
    pub source: Option<String>,
    pub fix: Fix,
}

pub enum FileState {
    Missing,
    Valid,
    /// Each issue: the line, when known, and the value.
    Invalid(Vec<(Option<usize>, String)>),
}

pub struct CompassResult {
    pub ok: bool,
    pub output: String,
}

pub struct BrokenRef {
    pub target: String,
    pub source: String,
}

pub struct HealthInput {
    pub project_file: FileState,
    /// Text of a new project file, for the fix of a missing one.
    pub new_project_file: String,
    /// Content of `.gitignore`, or `None` when absent.
    pub gitignore: Option<String>,
    /// Each tool and whether it runs.
    pub tools: Vec<(String, bool)>,
    /// `None` when no helper ran.
    pub compass: Option<CompassResult>,
    pub broken_refs: Vec<BrokenRef>,
}

fn finding(id: String, group: Group, severity: Severity, code: &str, fix: Fix) -> Finding {
    Finding {
        id,
        group,
        severity,
        code: code.into(),
        detail: None,
        source: None,
        fix,
    }
}

pub fn evaluate(i: &HealthInput) -> Vec<Finding> {
    let mut out = Vec::new();
    let open_file = Fix::Open {
        target: format!("doc:{PROJECT_FILE}"),
    };
    match &i.project_file {
        FileState::Valid => {}
        FileState::Missing => out.push(finding(
            "project-file-missing".into(),
            Group::Compliance,
            Severity::Warning,
            "project-file-missing",
            Fix::Write {
                path: PROJECT_FILE.into(),
                content: i.new_project_file.clone(),
            },
        )),
        FileState::Invalid(issues) => {
            for (n, (line, value)) in issues.iter().enumerate() {
                let mut f = finding(
                    format!("project-file-invalid:{n}"),
                    Group::Compliance,
                    Severity::Error,
                    "project-file-invalid",
                    open_file.clone(),
                );
                f.detail = Some(match line {
                    Some(l) => format!("{l}: {value}"),
                    None => value.clone(),
                });
                out.push(f);
            }
        }
    }
    if let Some(content) = ignore_block(i.gitignore.as_deref().unwrap_or("")) {
        out.push(finding(
            "ignore-missing".into(),
            Group::Compliance,
            Severity::Info,
            "ignore-missing",
            Fix::Write {
                path: ".gitignore".into(),
                content,
            },
        ));
    }
    for (tool, ok) in &i.tools {
        if !ok {
            let severity = if tool == "git" {
                Severity::Error
            } else {
                Severity::Warning
            };
            let mut f = finding(
                format!("tool-missing:{tool}"),
                Group::Tools,
                severity,
                "tool-missing",
                Fix::Recheck,
            );
            f.detail = Some(tool.clone());
            out.push(f);
        }
    }
    if let Some(c) = i.compass.as_ref().filter(|c| !c.ok) {
        let mut f = finding(
            "compass".into(),
            Group::Tools,
            Severity::Warning,
            "compass",
            Fix::Recheck,
        );
        f.detail = c
            .output
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .map(|l| l.trim().to_string());
        out.push(f);
    }
    for b in &i.broken_refs {
        let mut f = finding(
            format!("ref-broken:{}>{}", b.target, b.source),
            Group::Refs,
            Severity::Warning,
            "ref-broken",
            Fix::Open {
                target: b.source.clone(),
            },
        );
        f.detail = Some(b.target.clone());
        f.source = Some(b.source.clone());
        out.push(f);
    }
    out
}

/// The worst severity, or `None` for a healthy project.
pub fn worst(findings: &[Finding]) -> Option<Severity> {
    findings.iter().map(|f| f.severity).max()
}
