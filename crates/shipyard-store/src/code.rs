//! Code reports in the repository and the commit link index (spec `code`, REQ-009, REQ-024,
//! REQ-028, REQ-033).
//!
//! The last report of a check or a scanner is `.shipyard/quality/<kind>-<name>.yaml`. An impact
//! analysis is two dated files in `.shipyard/impacts/`: `<date>-<slug>.plan.md` and
//! `<date>-<slug>.digest.md`. A report never holds a secret value: a finding has no value field
//! and the text is scrubbed against the secrets that the caller gives.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::Result;
use crate::design::slug;
use crate::ref_index::{Citation, Entity, RefIndex};
use crate::safe_write;

pub const QUALITY_DIR: &str = ".shipyard/quality";
pub const IMPACTS_DIR: &str = ".shipyard/impacts";
const LAYOUT_IMPACTS: &str = "docs/delivery/impacts";
const LAYOUT_DIGESTS: &str = "docs/delivery/digests";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ReportKind {
    Check,
    Scanner,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ScanSeverity {
    Low,
    Medium,
    High,
    Critical,
}

/// A scanner finding. It has a place and no value (REQ-027).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ScanFinding {
    pub severity: ScanSeverity,
    pub path: String,
    pub line: Option<u32>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QualityReport {
    pub kind: ReportKind,
    pub name: String,
    /// ISO 8601 date and time of the run.
    pub at: String,
    pub passed: bool,
    pub duration_ms: u32,
    /// The last lines of the output.
    pub tail: String,
    pub findings: Vec<ScanFinding>,
}

pub fn scrub(text: &str, secrets: &[&str]) -> String {
    secrets
        .iter()
        .filter(|s| s.len() >= 4)
        .fold(text.to_string(), |t, s| t.replace(s, "[redacted]"))
}

/// The YAML text of a report with each secret value replaced (REQ-028).
pub fn encode_quality(r: &QualityReport, secrets: &[&str]) -> Result<String> {
    let mut r = r.clone();
    r.tail = scrub(&r.tail, secrets);
    for f in &mut r.findings {
        f.message = scrub(&f.message, secrets);
        f.path = scrub(&f.path, secrets);
    }
    Ok(crate::yaml::to_string(&r)?)
}

pub fn decode_quality(text: &str) -> Result<QualityReport> {
    Ok(serde_norway::from_str(text)?)
}

fn quality_file(root: &Path, kind: ReportKind, name: &str) -> PathBuf {
    let k = if kind == ReportKind::Check {
        "check"
    } else {
        "scanner"
    };
    root.join(QUALITY_DIR)
        .join(format!("{k}-{}.yaml", slug(name)))
}

/// Keeps the last report of a check or a scanner. It replaces the older one.
pub fn save_quality(root: &Path, r: &QualityReport, secrets: &[&str]) -> Result<PathBuf> {
    let path = quality_file(root, r.kind, &r.name);
    fs::create_dir_all(root.join(QUALITY_DIR))?;
    safe_write::write(&path, &encode_quality(r, secrets)?, None)?;
    Ok(path)
}

/// The last reports. A file that does not parse is skipped. Sorted by kind then name.
pub fn list_quality(root: &Path) -> Vec<QualityReport> {
    let Ok(dir) = fs::read_dir(root.join(QUALITY_DIR)) else {
        return Vec::new();
    };
    let mut out: Vec<(String, QualityReport)> = dir
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let r = decode_quality(&fs::read_to_string(e.path()).ok()?).ok()?;
            Some((name, r))
        })
        .collect();
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out.into_iter().map(|(_, r)| r).collect()
}

/// One saved analysis: the two files stay apart (REQ-033).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ImpactEntry {
    /// `YYYY-MM-DD`.
    pub date: String,
    pub slug: String,
    /// Paths relative to the repository root.
    pub plan: String,
    pub digest: String,
}

fn date_ok(date: &str) -> bool {
    let b = date.as_bytes();
    b.len() == 10
        && b.iter().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                *c == b'-'
            } else {
                c.is_ascii_digit()
            }
        })
}

/// Writes the plan and the digest as two dated files. A second analysis of the same day and
/// slug gets `-2`, `-3`. Nothing is overwritten.
pub fn save_impact(
    root: &Path,
    date: &str,
    name: &str,
    plan: &str,
    digest: &str,
) -> Result<ImpactEntry> {
    if !date_ok(date) {
        return Err("the date must be YYYY-MM-DD".into());
    }
    let base = slug(name);
    if base.is_empty() {
        return Err("the analysis needs a name".into());
    }
    let dir = root.join(IMPACTS_DIR);
    fs::create_dir_all(&dir)?;
    let mut stem = format!("{date}-{base}");
    let mut n = 1;
    while dir.join(format!("{stem}.plan.md")).exists()
        || dir.join(format!("{stem}.digest.md")).exists()
    {
        n += 1;
        stem = format!("{date}-{base}-{n}");
    }
    let (plan_rel, digest_rel) = (
        format!("{IMPACTS_DIR}/{stem}.plan.md"),
        format!("{IMPACTS_DIR}/{stem}.digest.md"),
    );
    safe_write::create(&root.join(&plan_rel), plan)?;
    safe_write::create(&root.join(&digest_rel), digest)?;
    Ok(ImpactEntry {
        date: date.into(),
        slug: stem[11..].to_string(),
        plan: plan_rel,
        digest: digest_rel,
    })
}

/// The past analyses, newest first. A plan with no digest file is skipped.
pub fn list_impacts(root: &Path) -> Vec<ImpactEntry> {
    let dir = fs::read_dir(root.join(IMPACTS_DIR));
    let mut out: Vec<ImpactEntry> = dir
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let stem = name.strip_suffix(".plan.md")?;
            let digest = format!("{IMPACTS_DIR}/{stem}.digest.md");
            (date_ok(stem.get(..10)?) && root.join(&digest).exists()).then(|| ImpactEntry {
                date: stem[..10].into(),
                slug: stem.get(11..).unwrap_or_default().into(),
                plan: format!("{IMPACTS_DIR}/{name}"),
                digest,
            })
        })
        .collect();
    out.extend(layout_notes(root));
    out.sort_by(|a, b| (&b.date, &b.slug).cmp(&(&a.date, &a.slug)));
    out
}

/// The notes of a project with the existing layout: `docs/delivery/impacts/<date>-<slug>.md`, with the digest of the
/// same name in `docs/delivery/digests/` when it exists (else an empty `digest`).
fn layout_notes(root: &Path) -> Vec<ImpactEntry> {
    let Ok(dir) = fs::read_dir(root.join(LAYOUT_IMPACTS)) else {
        return Vec::new();
    };
    dir.flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let stem = name.strip_suffix(".md")?;
            let digest = format!("{LAYOUT_DIGESTS}/{name}");
            date_ok(stem.get(..10)?).then(|| ImpactEntry {
                date: stem[..10].into(),
                slug: stem.get(11..).unwrap_or_default().into(),
                plan: format!("{LAYOUT_IMPACTS}/{name}"),
                digest: if root.join(&digest).exists() {
                    digest
                } else {
                    String::new()
                },
            })
        })
        .collect()
}

/// A commit with the refs that it links to (`core::code::commit_refs`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitLink {
    pub sha: String,
    pub summary: String,
    pub refs: Vec<String>,
}

/// Puts one commit and its links in the ref index, as the source `git:commit:<sha>`. A commit
/// is indexed once, when it is made, with the branch that it was made on. A `commit:<sha>`
/// resolves, and `wi:` and `run:` show it as a backlink (REQ-009, REQ-024).
pub fn index_commit(index: &mut RefIndex, c: &CommitLink) -> Result<()> {
    let me = format!("commit:{}", c.sha);
    let entity = Entity::new(&me, &c.summary, None, None);
    let citations: Vec<Citation> = c
        .refs
        .iter()
        .map(|r| Citation {
            source: me.clone(),
            target: r.clone(),
        })
        .collect();
    index.set_source(&format!("git:{me}"), &c.sha, &[entity], &citations)
}

// ---------------------------------------------------------------- watch interval (REQ-015, Q-042)

/// The minutes between two fetches of a project when it sets none.
pub const DEFAULT_WATCH_MINUTES: u32 = 15;
const MAX_WATCH_MINUTES: u32 = 24 * 60;

/// The interval is personal: `<data>/code/<project>/watch.json`, never in the repository (Q-042).
fn watch_file(data: &Path, project: &str) -> Result<PathBuf> {
    let plain = !project.is_empty()
        && !project.starts_with(['-', '.'])
        && project
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if !plain {
        return Err(format!("not a plain project id: {project}").into());
    }
    Ok(data.join("code").join(project).join("watch.json"))
}

/// A missing or unreadable file gives the default.
pub fn watch_minutes(data: &Path, project: &str) -> u32 {
    watch_file(data, project)
        .ok()
        .and_then(|f| fs::read(f).ok())
        .and_then(|b| serde_json::from_slice::<u32>(&b).ok())
        .filter(|m| (1..=MAX_WATCH_MINUTES).contains(m))
        .unwrap_or(DEFAULT_WATCH_MINUTES)
}

pub fn set_watch_minutes(data: &Path, project: &str, minutes: u32) -> Result<()> {
    if !(1..=MAX_WATCH_MINUTES).contains(&minutes) {
        return Err(format!("the interval is 1 to {MAX_WATCH_MINUTES} minutes").into());
    }
    crate::project::write_atomic(&watch_file(data, project)?, minutes.to_string().as_bytes())
}

const ALLOW_MARKERS: [&str; 2] = ["shipyard:allow-secret", "gitleaks:allow"];
const KEY_WORDS: [&str; 6] = ["password", "passwd", "secret", "token", "api_key", "apikey"];
/// Token shapes: a prefix and the least length of the whole token.
const TOKEN_SHAPES: [(&str, usize, &str); 7] = [
    ("ghp_", 36, "GitHub token"),
    ("gho_", 36, "GitHub token"),
    ("github_pat_", 40, "GitHub token"),
    ("glpat-", 20, "GitLab token"),
    ("AKIA", 20, "AWS key id"),
    ("xoxb-", 20, "Slack token"),
    ("sk-", 24, "API key"),
];

/// Files where a value stands without quotes: config files, and free text with no extension (a
/// log line, a feedback text). In source code a secret value is a quoted literal: `secret: r.secret`
/// is a field, not a value.
fn bare_values(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
    name.starts_with('.')
        || ext.is_none_or(|e| {
            [
                "sh",
                "bash",
                "zsh",
                "ps1",
                "env",
                "yaml",
                "yml",
                "toml",
                "ini",
                "properties",
                "conf",
                "cfg",
                "txt",
            ]
            .contains(&e.as_str())
        })
}

/// The findings of one text. A finding names a place and a kind, never the value (REQ-027).
/// A line with `shipyard:allow-secret` or `gitleaks:allow`, or the line after one, is skipped: a
/// test value that has the shape of a token says so. A plain word (letters only) is a label, not a
/// secret value.
/// shortcut: patterns, no entropy. A key in an unknown shape is missed: add a pattern or a
/// scanner (Q-043).
pub fn scan_text(path: &str, text: &str) -> Vec<ScanFinding> {
    let bare = bare_values(path);
    let mut out = Vec::new();
    let mut add = |line: usize, severity, message: &str| {
        out.push(ScanFinding {
            severity,
            path: path.into(),
            line: Some(line as u32),
            message: message.into(),
        });
    };
    let mut allowed = false; // the line before holds the marker
    for (i, l) in text.lines().enumerate() {
        let n = i + 1;
        let marked = ALLOW_MARKERS.iter().any(|m| l.contains(m));
        let after_marker = std::mem::replace(&mut allowed, marked);
        if marked || after_marker {
            continue;
        }
        // A key block starts its line or follows a quote (a JSON string). Code that looks for one
        // passes it as an argument, `contains("-----BEGIN`: that is not a key.
        let at_start = l.trim_start().starts_with("-----BEGIN");
        let after_quote = l.match_indices("-----BEGIN").any(|(at, _)| {
            let before = l[..at].trim_end_matches(['"', '\'', '`', '\\']);
            at > before.len() && !before.ends_with('(')
        });
        // Key text after the marker is a key, also as an argument or after `NAME=`. A search line
        // such as `contains("-----BEGIN PRIVATE KEY-----")` has none. gitleaks:allow
        let key_text = l.find("PRIVATE KEY-----").is_some_and(|m| {
            let body = &l[m + "PRIVATE KEY-----".len()..];
            l.contains("-----BEGIN")
                && (body.starts_with("\\n")
                    || body
                        .starts_with(|c: char| c.is_ascii_alphanumeric() || c == '+' || c == '/')
                    || body.contains("-----END"))
        });
        if (at_start || after_quote || key_text) && l.contains("PRIVATE KEY-----") {
            add(n, ScanSeverity::Critical, "private key");
            continue;
        }
        let shaped = l
            .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-'))
            .find_map(|t| {
                TOKEN_SHAPES
                    .iter()
                    .find(|(p, min, _)| t.starts_with(p) && t.len() >= *min)
                    .map(|(_, _, what)| *what)
            });
        if let Some(what) = shaped {
            add(n, ScanSeverity::High, what);
            continue;
        }
        let low = l.to_lowercase();
        let assigned = KEY_WORDS.iter().any(|k| {
            low.find(k).is_some_and(|at| {
                let rest = low[at + k.len()..].trim_start_matches(['"', '\'', ' ']);
                let value = rest
                    .strip_prefix(['=', ':'])
                    .map(|v| v.trim_start_matches(' '))
                    .filter(|v| bare || v.starts_with(['"', '\'']))
                    .map(|v| v.trim_start_matches(['"', '\'']));
                value.is_some_and(|v| {
                    let v = v.split(['"', '\'', ' ', ',', ';']).next().unwrap_or("");
                    v.len() >= 8
                        && !v.chars().all(char::is_alphabetic)
                        && !v.starts_with(['$', '{', '<', '%'])
                        && !v.contains('(')
                })
            })
        });
        if assigned {
            add(n, ScanSeverity::Medium, "a secret value is assigned");
        }
    }
    out
}
