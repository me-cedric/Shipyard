//! Code, the forge, quality and impact parts (spec `code`, REQ-018 to REQ-033). The git parts are
//! in `commands/code.rs`, the terminal in `terminal.rs`.
//!
//! Each write to a forge, each check run and each Analyze needs the click of a person (`click`):
//! the factory has its own switches and approvals, and none of them reaches here. A failed forge
//! write returns the message of the forge and is never retried (REQ-025).

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use shipyard_agents::impacts::{Analysis, Comparison, RunnerAsk, analyze};
use shipyard_core::code::{commit_refs, run_in_message};
use shipyard_forges::{
    CheckState, CodeApi, ForgeError, MergeMethod, NewPull, PullFile, PullState, ReviewerVerdict,
    Verdict,
};
use shipyard_git::Repo;
use shipyard_store::code::{
    CommitLink, IMPACTS_DIR, ImpactEntry, QualityReport, ReportKind, ScanFinding, ScanSeverity,
    index_commit, list_impacts, list_quality, save_impact, save_quality,
};
use specta::Type;
use tauri::AppHandle;

use crate::commands::sync::{active, origin_slug, tracker_source};
use crate::commands::{Api, AppState, Res, blocking, err};
use crate::scanners;
use crate::work::need_click;

/// The message when the project has no forge connection: the view shows one Connect action.
pub const NO_FORGE: &str = "the project names no forge connection";
const MAX_DIFF: usize = 200_000;
const CHECK_LIMIT: Duration = Duration::from_secs(15 * 60);
/// The scanners of Code / Quality. Only `secrets` ships with the app (Q-043).
const SCANNERS: [(&str, bool); 4] = [
    ("secrets", true),
    ("dependencies", false),
    ("code", false),
    ("skills", false),
];

fn root(s: &AppState) -> Res<PathBuf> {
    Ok(s.registry()?
        .active()
        .ok_or("no active project")?
        .path
        .clone()
        .into())
}

fn secrets(s: &AppState) -> Vec<String> {
    let mut all = s.agents.secret_values();
    all.extend(s.connections.secret_values());
    all
}

/// The mirrored work item keys: the only keys that a commit or a pull request can link to.
pub(crate) fn known_keys(s: &AppState) -> Vec<String> {
    let Ok(Some(a)) = active(s) else {
        return Vec::new();
    };
    let Ok(Some(src)) = tracker_source(s, &a) else {
        return Vec::new();
    };
    if !s.sync.mirror_exists() {
        return Vec::new();
    }
    s.sync
        .mirror()
        .and_then(|m| m.tickets(&src))
        .map(|t| t.into_iter().map(|t| t.item.key).collect())
        .unwrap_or_default()
}

// ---------------------------------------------------------------- commit links (REQ-009)

/// Links a new commit to its work item and its run. The branch name and the message give the key.
pub fn index_new_commit(s: &AppState, sha: &str) -> Res<()> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let repo = Repo::open(Path::new(&e.path)).map_err(err)?;
    let info = repo.commit_info(sha).map_err(err)?;
    let branch = repo
        .branches()
        .map_err(err)?
        .into_iter()
        .find(|b| b.is_head)
        .map(|b| b.name)
        .unwrap_or_default();
    let message = format!("{}\n{}", info.summary, info.description);
    let refs = commit_refs(&branch, &message, &known_keys(s), run_in_message(&message));
    let shared = s.index_of(&e.id)?;
    let mut index = shared.lock().unwrap_or_else(|e| e.into_inner());
    index_commit(
        &mut index,
        &CommitLink {
            sha: info.sha,
            summary: info.summary,
            refs,
        },
    )
    .map_err(err)
}

// ---------------------------------------------------------------- pull requests (REQ-018 to REQ-025)

pub(crate) fn forge(s: &AppState) -> Res<(Box<dyn CodeApi>, String, String)> {
    let a = active(s)?.ok_or("no active project")?;
    let id = a.forge.clone().ok_or(NO_FORGE)?;
    let slug = origin_slug(&a.entry).ok_or("the project has no remote repository")?;
    Ok((s.connections.code_api(&id)?, slug, id))
}

fn state_name(st: PullState) -> &'static str {
    match st {
        PullState::Open => "open",
        PullState::Closed => "closed",
        PullState::Merged => "merged",
    }
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PullCheck {
    pub name: String,
    /// `pending`, `passing`, `failing` or `skipped`.
    pub state: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PullThread {
    pub id: String,
    pub resolved: bool,
    pub path: Option<String>,
    pub line: Option<u32>,
    /// `author: text`, oldest first.
    pub comments: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PullDetail {
    /// `pr:<connection>:<number>`.
    pub reference: String,
    pub number: u32,
    pub title: String,
    pub description: String,
    pub state: String,
    pub draft: bool,
    pub author: String,
    pub source_branch: String,
    pub target_branch: String,
    pub head_sha: String,
    pub url: String,
    pub files: Vec<PullFile>,
    /// The commits as `commit:<sha>` refs with their summary.
    pub commits: Vec<PullCommitRef>,
    pub checks: Vec<PullCheck>,
    /// `none`, `pending`, `passing` or `failing`.
    pub ci: String,
    pub threads: Vec<PullThread>,
    pub verdicts: Vec<ReviewerVerdict>,
    /// `clean`, `conflict`, `blocked` or `unknown`.
    pub mergeable: String,
    pub merge_methods: Vec<MergeMethod>,
    /// `wi:` and `run:` refs of the pull request (REQ-024).
    pub links: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PullCommitRef {
    pub reference: String,
    pub summary: String,
}

pub fn pull_detail(s: &AppState, number: u32) -> Res<PullDetail> {
    let (api, slug, conn) = forge(s)?;
    let n = u64::from(number);
    let p = api.pull(&slug, n).map_err(err)?;
    let status = api.status(&slug, n).map_err(err)?;
    let ci = api.ci_status(&slug, n).map_err(err)?;
    let commits = api.commits(&slug, n).map_err(err)?;
    let mut links =
        shipyard_core::code::commit_refs(&p.source_branch, &p.title, &known_keys(s), None);
    if let Ok(rows) = crate::delivery::pr_rows(s) {
        links.extend(
            rows.into_iter()
                .filter(|r| r.number == number)
                .flat_map(|r| r.runs)
                .map(|r| {
                    if r.starts_with("run:") {
                        r
                    } else {
                        format!("run:{r}")
                    }
                }),
        );
    }
    Ok(PullDetail {
        reference: format!("pr:{conn}:{number}"),
        number,
        description: api.description(&slug, n).map_err(err)?,
        state: state_name(p.state).into(),
        draft: p.draft,
        author: p.author,
        source_branch: p.source_branch,
        target_branch: p.target_branch,
        head_sha: p.head_sha,
        url: p.url,
        title: p.title,
        files: api.files(&slug, n).map_err(err)?,
        commits: commits
            .into_iter()
            .map(|c| PullCommitRef {
                reference: format!("commit:{}", c.sha),
                summary: c.summary,
            })
            .collect(),
        checks: ci
            .checks
            .into_iter()
            .map(|c| PullCheck {
                name: c.name,
                state: match c.state {
                    CheckState::Pending => "pending",
                    CheckState::Passing => "passing",
                    CheckState::Failing => "failing",
                    CheckState::Skipped => "skipped",
                }
                .into(),
                url: c.url,
            })
            .collect(),
        ci: format!("{:?}", status.ci).to_lowercase(),
        threads: api
            .threads(&slug, n)
            .map_err(err)?
            .into_iter()
            .map(|t| PullThread {
                id: t.id,
                resolved: t.resolved,
                path: t.path,
                line: t.line,
                comments: t
                    .comments
                    .into_iter()
                    .map(|c| format!("{}: {}", c.author, c.body))
                    .collect(),
            })
            .collect(),
        verdicts: api.verdicts(&slug, n).map_err(err)?,
        mergeable: format!("{:?}", status.mergeable).to_lowercase(),
        merge_methods: api.merge_methods().to_vec(),
        links,
    })
}

/// The labels that exist on the forge: the form offers only these (REQ-020).
pub fn pull_labels(s: &AppState) -> Res<Vec<String>> {
    let (api, slug, _) = forge(s)?;
    api.labels(&slug).map_err(err)
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenPull {
    pub title: String,
    pub body: String,
    /// The base branch. Default: the default branch of the repository (`delivery` REQ-009).
    pub base: Option<String>,
    pub draft: bool,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenedPull {
    pub reference: String,
    pub number: u32,
    pub url: String,
    /// Labels that the forge does not have. Nothing created them.
    pub missing_labels: Vec<String>,
    /// The forge refused the labels. The pull request exists: this is not a failure of the open.
    pub label_error: Option<String>,
}

/// Opens a pull request from the working branch. The branch must be published first.
pub fn pull_open(s: &AppState, input: OpenPull, click: bool) -> Res<OpenedPull> {
    need_click(s, click)?;
    let (api, slug, conn) = forge(s)?;
    let repo = Repo::open(&root(s)?).map_err(err)?;
    let head = repo
        .branches()
        .map_err(err)?
        .into_iter()
        .find(|b| b.is_head)
        .ok_or("no working branch")?;
    if head.upstream.is_none() {
        return Err("publish the working branch before you open a pull request".into());
    }
    let target = match input.base.filter(|b| !b.trim().is_empty()) {
        Some(b) => b,
        None => api.repository(&slug).map_err(err)?.default_branch,
    };
    let made = api
        .create_pull(
            &slug,
            &NewPull {
                title: input.title,
                body: input.body,
                source: head.name,
                target,
                draft: input.draft,
            },
        )
        .map_err(err)?;
    // The pull request exists now: a label error goes in the result, never in an `Err`.
    let (missing_labels, label_error) = if input.labels.is_empty() {
        (Vec::new(), None)
    } else {
        match api.add_labels(&slug, made.number, &input.labels) {
            Ok(r) => (r.missing, None),
            Err(e) => (Vec::new(), Some(err(e))),
        }
    };
    Ok(OpenedPull {
        reference: format!("pr:{conn}:{}", made.number),
        number: made.number as u32,
        url: made.url,
        missing_labels,
        label_error,
    })
}

pub fn pull_comment(s: &AppState, number: u32, body: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let (api, slug, _) = forge(s)?;
    api.comment(&slug, u64::from(number), body).map_err(err)
}

pub fn pull_verdict(
    s: &AppState,
    number: u32,
    verdict: Verdict,
    body: &str,
    click: bool,
) -> Res<()> {
    need_click(s, click)?;
    let (api, slug, _) = forge(s)?;
    api.verdict(&slug, u64::from(number), verdict, body)
        .map_err(err)
}

/// The click is the confirmation that names the method (REQ-022). A draft is refused.
pub fn pull_merge(s: &AppState, number: u32, method: MergeMethod, click: bool) -> Res<()> {
    need_click(s, click)?;
    let (api, slug, _) = forge(s)?;
    api.merge(&slug, u64::from(number), method).map_err(err)
}

pub fn pull_ready(s: &AppState, number: u32, click: bool) -> Res<()> {
    need_click(s, click)?;
    let (api, slug, _) = forge(s)?;
    api.mark_ready(&slug, u64::from(number)).map_err(err)
}

/// Closes an open pull request without a merge. A reason, when given, goes in a comment first.
pub fn pull_close(s: &AppState, number: u32, reason: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let (api, slug, _) = forge(s)?;
    let n = u64::from(number);
    if api.pull(&slug, n).map_err(err)?.state != PullState::Open {
        return Err("the pull request is not open".into());
    }
    if !reason.trim().is_empty() {
        api.comment(&slug, n, reason).map_err(err)?;
    }
    api.close(&slug, n).map_err(err)
}

/// Sends the pull request back to the agent: a request for changes with the text. The factory
/// reads it as a review and starts a feedback round on the same pull request. One account that
/// made the pull request cannot ask for changes on it (HTTP 422): the text then goes in a comment
/// and the round starts here, since the forge never reports a review.
pub fn pull_send_back(s: &AppState, number: u32, text: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let (api, slug, _) = forge(s)?;
    let n = u64::from(number);
    match api.verdict(&slug, n, Verdict::RequestChanges, text) {
        Err(ForgeError::Http(shipyard_http::Error::Status {
            status: 422,
            detail,
            ..
        })) if detail.to_lowercase().contains("own pull request") => {
            api.comment(&slug, n, text).map_err(err)?;
            s.factory.send_back(n, text);
            Ok(())
        }
        other => other.map_err(err),
    }
}

/// Stages what the archive of `change` moved or wrote: the removed change folder, the new archive
/// folders (`archived`, names inside `changes/archive`) and each settled capability. A stray file of the specs folder stays out of the commit.
fn stage_archive(
    r: &Repo,
    folder: &str,
    change: &str,
    archived: &[String],
    caps: &[String],
) -> Res<()> {
    let base = folder.trim_end_matches('/');
    let mut paths = vec![format!("{base}/changes/{change}")];
    paths.extend(
        archived
            .iter()
            .map(|a| format!("{base}/changes/archive/{a}")),
    );
    paths.extend(caps.iter().map(|c| format!("{base}/specs/{c}")));
    r.stage(&paths).map_err(err)
}

/// Archives the spec change `change` in the branch of the pull request: the archive, one commit
/// and a push. The working branch must be the branch of the pull request, and nothing else may be
/// staged, so the commit holds the archive only. Open items of the change need `confirmed`.
pub fn pull_archive_spec(
    s: &AppState,
    number: u32,
    change: &str,
    confirmed: bool,
    click: bool,
) -> Res<String> {
    need_click(s, click)?;
    let (api, slug, _) = forge(s)?;
    let source = api
        .pull(&slug, u64::from(number))
        .map_err(err)?
        .source_branch;
    let r = Repo::open(&root(s)?).map_err(err)?;
    let st = r.status().map_err(err)?;
    if st.branch.as_deref() != Some(source.as_str()) {
        return Err(format!(
            "switch to the branch {source} of the pull request first"
        ));
    }
    if !st.staged.is_empty() {
        return Err("unstage your changes first: the archive makes its own commit".into());
    }
    let folder = crate::specs::specs_folder(s)?;
    // The archive names its folder with its own date: stage the folders that it added, so a run
    // across midnight does not matter.
    let archive_dir = root(s)?.join(&folder).join("changes/archive");
    let names = || -> Vec<String> {
        std::fs::read_dir(&archive_dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect()
    };
    let before = names();
    let caps = crate::specs::archive_change(s, change, confirmed)?;
    let added: Vec<String> = names()
        .into_iter()
        .filter(|n| !before.contains(n))
        .collect();
    stage_archive(&r, &folder, change, &added, &caps)?;
    let sha = r
        .commit(&format!("docs(spec): archive {change}"), "")
        .map_err(err)?;
    crate::commands::code::push(s)?;
    Ok(sha)
}

// ---------------------------------------------------------------- quality (REQ-026 to REQ-028)

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QualityRow {
    /// The declared command, or the scanner name.
    pub name: String,
    /// The key of a plain name (`lint`, `typecheck`, `test`, `check`, `build`) for a command that a
    /// project file names. The view shows the command in the detail.
    pub label: Option<String>,
    /// `false` for a scanner that the app does not ship (Q-043).
    pub available: bool,
    pub last: Option<QualityReport>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QualityView {
    pub checks: Vec<QualityRow>,
    pub scanners: Vec<QualityRow>,
}

/// The checks of the project (`qa::checks`: its `gates`, else its compass commands, else the ones
/// that its files show), the scanners and the last report of each, read from the repository
/// (REQ-028).
pub fn quality_view(s: &AppState) -> Res<QualityView> {
    let root = root(s)?;
    let reports = list_quality(&root);
    let last = |kind, name: &str| {
        reports
            .iter()
            .find(|r| r.kind == kind && r.name == name)
            .cloned()
    };
    Ok(QualityView {
        checks: crate::qa::checks(&root)
            .into_iter()
            .map(|c| QualityRow {
                last: last(ReportKind::Check, &c.command),
                name: c.command,
                label: c.label.map(String::from),
                available: true,
            })
            .collect(),
        scanners: SCANNERS
            .iter()
            .map(|(n, available)| QualityRow {
                name: (*n).into(),
                label: None,
                available: *available || scanners::program(n).is_some_and(scanners::installed),
                last: last(ReportKind::Scanner, n),
            })
            .collect(),
    })
}

/// `YYYY-MM-DDTHH:MM:SSZ` of now.
pub(crate) fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    format!(
        "{}T{:02}:{:02}:{:02}Z",
        shipyard_core::work::iso((secs / 86_400) as i32),
        secs % 86_400 / 3600,
        secs % 3600 / 60,
        secs % 60
    )
}

/// Runs one declared check after the click that names it. It runs nothing else (REQ-026).
pub fn check_run(s: &AppState, command: &str, click: bool) -> Res<QualityReport> {
    need_click(s, click)?;
    let root = root(s)?;
    if !crate::qa::checks(&root)
        .iter()
        .any(|c| c.command == command)
    {
        return Err(format!("`{command}` is not a check of this project"));
    }
    let log = s.dir.join("check.log");
    let start = Instant::now();
    let (passed, tail, findings) = if command == crate::qa::VERIFY_DOCS {
        let (tail, findings) = crate::qa::verify_docs(s)?;
        (findings.is_empty(), tail, findings)
    } else {
        let gate = crate::delivery::run_gate_out(&root, &log, command, CHECK_LIMIT);
        if gate.check.passed {
            (true, gate.check.counts, Vec::new())
        } else {
            // A failed check says why: the exit code or the missing program, then the last lines.
            let why = crate::qa::failure(command, gate.code, &gate.check.counts, &gate.tail);
            let finding = ScanFinding {
                severity: ScanSeverity::High,
                path: String::new(),
                line: None,
                message: why,
            };
            (false, gate.tail, vec![finding])
        }
    };
    let report = QualityReport {
        kind: ReportKind::Check,
        name: command.into(),
        at: now_iso(),
        passed,
        duration_ms: start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32,
        tail,
        findings,
    };
    save_quality(
        &root,
        &report,
        &secrets(s).iter().map(String::as_str).collect::<Vec<_>>(),
    )
    .map_err(err)?;
    Ok(report)
}

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

/// The findings of one text. A finding names a place and a kind, never the value (REQ-027).
/// shortcut: patterns, no entropy. A key in an unknown shape is missed: add a pattern or a
/// scanner (Q-043).
pub fn scan_text(path: &str, text: &str) -> Vec<ScanFinding> {
    let mut out = Vec::new();
    let mut add = |line: usize, severity, message: &str| {
        out.push(ScanFinding {
            severity,
            path: path.into(),
            line: Some(line as u32),
            message: message.into(),
        });
    };
    for (i, l) in text.lines().enumerate() {
        let n = i + 1;
        if l.contains("-----BEGIN") && l.contains("PRIVATE KEY-----") {
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
                    .map(|v| v.trim_start_matches([' ', '"', '\'']));
                value.is_some_and(|v| {
                    let v = v.split(['"', '\'', ' ', ',', ';']).next().unwrap_or("");
                    v.len() >= 8 && !v.starts_with(['$', '{', '<', '%']) && !v.contains('(')
                })
            })
        });
        if assigned {
            add(n, ScanSeverity::Medium, "a secret value is assigned");
        }
    }
    out
}

/// The files of the working copy that git tracks or could track (ignored files are out).
fn scan_files(root: &Path) -> Res<Vec<String>> {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["ls-files", "-z", "-co", "--exclude-standard"])
        .output()
        .map_err(err)?;
    if !out.status.success() {
        return Err("git could not list the files".into());
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .split('\0')
        .filter(|p| !p.is_empty())
        .map(String::from)
        .collect())
}

pub fn scan_run(s: &AppState, name: &str, click: bool) -> Res<QualityReport> {
    need_click(s, click)?;
    let Some((_, builtin)) = SCANNERS.iter().find(|(n, _)| *n == name) else {
        return Err(format!("`{name}` is not a scanner"));
    };
    let root = root(s)?;
    let start = Instant::now();
    let mut findings = Vec::new();
    if *builtin {
        for rel in scan_files(&root)? {
            let Ok(text) = std::fs::read_to_string(root.join(&rel)) else {
                continue; // binary or unreadable
            };
            // The reports of the scanner hold no value, but a report is a file: skip it.
            if !rel.starts_with(".shipyard/quality/") && text.len() < 2_000_000 {
                findings.extend(scan_text(&rel, &text));
            }
        }
    } else {
        findings = scanners::run(name, &root)?;
    }
    let report = QualityReport {
        kind: ReportKind::Scanner,
        name: name.into(),
        at: now_iso(),
        passed: findings.is_empty(),
        duration_ms: start.elapsed().as_millis().min(u128::from(u32::MAX)) as u32,
        tail: format!("{} finding(s)", findings.len()),
        findings,
    };
    save_quality(
        &root,
        &report,
        &secrets(s).iter().map(String::as_str).collect::<Vec<_>>(),
    )
    .map_err(err)?;
    Ok(report)
}

// ---------------------------------------------------------------- impacts (REQ-029 to REQ-033)

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ImpactRefs {
    pub branches: Vec<String>,
    pub tags: Vec<String>,
    /// The default base: `main`, else `master`, else the first branch.
    pub default: String,
}

pub fn impact_refs(s: &AppState) -> Res<ImpactRefs> {
    let repo = Repo::open(&root(s)?).map_err(err)?;
    let branches: Vec<String> = repo
        .branches()
        .map_err(err)?
        .into_iter()
        .map(|b| b.name)
        .collect();
    let default = ["main", "master"]
        .iter()
        .find(|d| branches.iter().any(|b| b == *d))
        .map(|d| (*d).to_string())
        .or_else(|| branches.first().cloned())
        .unwrap_or_default();
    Ok(ImpactRefs {
        tags: repo.tags().map_err(err)?,
        branches,
        default,
    })
}

pub fn impact_list(s: &AppState) -> Res<Vec<ImpactEntry>> {
    Ok(list_impacts(&root(s)?))
}

/// The text of a saved plan or digest. Only the impacts folder is readable.
pub fn impact_read(s: &AppState, rel: &str) -> Res<String> {
    let known = list_impacts(&root(s)?)
        .into_iter()
        .any(|e| e.plan == rel || e.digest == rel);
    if !known {
        return Err(format!("{rel} is not a saved analysis in {IMPACTS_DIR}"));
    }
    std::fs::read_to_string(root(s)?.join(rel)).map_err(err)
}

/// Runs the two asks and saves the two files (REQ-030 to REQ-033).
pub fn analyze_with(
    s: &AppState,
    ask: &dyn shipyard_agents::impacts::Ask,
    base: &str,
) -> Res<(ImpactEntry, Analysis)> {
    let root = root(s)?;
    let repo = Repo::open(&root).map_err(err)?;
    let files = repo.changed_since(base).map_err(err)?;
    if files.is_empty() {
        return Err(format!("no change against `{base}`"));
    }
    let diff = repo.diff_since(base, MAX_DIFF).map_err(err)?;
    let refs: Vec<String> = known_keys(s)
        .into_iter()
        .map(|k| format!("wi:{k}"))
        .collect();
    let secrets = secrets(s);
    let a = analyze(
        ask,
        &Comparison {
            base,
            files: &files,
            diff: &diff,
            refs: &refs,
            secrets: &secrets,
        },
    )
    .map_err(err)?;
    let entry =
        save_impact(&root, &crate::work::today(s), base, &a.plan, &a.digest).map_err(err)?;
    Ok((entry, a))
}

pub fn impact_analyze(s: &AppState, base: &str, click: bool) -> Res<ImpactEntry> {
    need_click(s, click)?;
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let runner = shipyard_store::assistant_defaults::load(&s.dir, &e.id)
        .settings()
        .runner;
    let ask = RunnerAsk {
        runner,
        dir: PathBuf::from(&e.path),
        scratch: s.dir.join("scratch").join(format!("impacts-{}", e.id)),
        program: None,
    };
    analyze_with(s, &ask, base).map(|(entry, _)| entry)
}

/// The digest of the diff of a run against its base, for the pull request body (REQ-032).
/// `rev` is the base of the run, `folder` its worktree. `runner` is an agent CLI id.
pub fn digest_of(
    runner: &str,
    scratch: PathBuf,
    folder: &Path,
    rev: &str,
    secrets: &[String],
) -> Res<String> {
    let repo = Repo::open(folder).map_err(err)?;
    let files = repo.changed_since(rev).map_err(err)?;
    let diff = repo.diff_since(rev, MAX_DIFF).map_err(err)?;
    let ask = RunnerAsk {
        runner: runner.to_string(),
        dir: folder.to_path_buf(),
        scratch,
        program: None,
    };
    analyze(
        &ask,
        &Comparison {
            base: rev,
            files: &files,
            diff: &diff,
            refs: &[],
            secrets,
        },
    )
    .map(|a| a.digest)
    .map_err(err)
}

pub fn run_digest(s: &AppState, folder: &Path, base: &str) -> Res<String> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let runner = shipyard_store::assistant_defaults::load(&s.dir, &e.id)
        .settings()
        .runner;
    let scratch = s.dir.join("scratch").join(format!("digest-{}", e.id));
    digest_of(&runner, scratch, folder, base, &secrets(s))
}

/// A pull request that opened or merged tells the mirror at once: one sync tick, so the Code and
/// Work views read it again. A failed tick never fails the write, which went through.
fn synced<T>(s: &AppState, written: Res<T>) -> Res<T> {
    if written.is_ok() {
        let _ = crate::commands::sync::run_tick(s);
    }
    written
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn code_pull_detail(app: AppHandle, number: u32) -> Api<PullDetail> {
    blocking(app, move |s| pull_detail(s, number)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull_labels(app: AppHandle) -> Api<Vec<String>> {
    blocking(app, pull_labels).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull_open(app: AppHandle, input: OpenPull, click: bool) -> Api<OpenedPull> {
    blocking(app, move |s| synced(s, pull_open(s, input, click))).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull_comment(app: AppHandle, number: u32, body: String, click: bool) -> Api<()> {
    blocking(app, move |s| pull_comment(s, number, &body, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull_verdict(
    app: AppHandle,
    number: u32,
    verdict: Verdict,
    body: String,
    click: bool,
) -> Api<()> {
    blocking(app, move |s| pull_verdict(s, number, verdict, &body, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull_merge(
    app: AppHandle,
    number: u32,
    method: MergeMethod,
    click: bool,
) -> Api<()> {
    blocking(app, move |s| {
        synced(s, pull_merge(s, number, method, click))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull_ready(app: AppHandle, number: u32, click: bool) -> Api<()> {
    blocking(app, move |s| pull_ready(s, number, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull_close(app: AppHandle, number: u32, reason: String, click: bool) -> Api<()> {
    blocking(app, move |s| {
        synced(s, pull_close(s, number, &reason, click))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull_send_back(
    app: AppHandle,
    number: u32,
    text: String,
    click: bool,
) -> Api<()> {
    blocking(app, move |s| {
        synced(s, pull_send_back(s, number, &text, click))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn code_pull_archive_spec(
    app: AppHandle,
    number: u32,
    change: String,
    confirmed: bool,
    click: bool,
) -> Api<String> {
    blocking(app, move |s| {
        pull_archive_spec(s, number, &change, confirmed, click)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn code_quality(app: AppHandle) -> Api<QualityView> {
    blocking(app, quality_view).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_check_run(app: AppHandle, command: String, click: bool) -> Api<QualityReport> {
    blocking(app, move |s| check_run(s, &command, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_scan_run(app: AppHandle, name: String, click: bool) -> Api<QualityReport> {
    blocking(app, move |s| scan_run(s, &name, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_scanner_install(app: AppHandle, name: String, click: bool) -> Api<()> {
    blocking(app, move |s| {
        need_click(s, click)?;
        scanners::install(&name)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn code_impact_refs(app: AppHandle) -> Api<ImpactRefs> {
    blocking(app, impact_refs).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_impact_list(app: AppHandle) -> Api<Vec<ImpactEntry>> {
    blocking(app, impact_list).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_impact_read(app: AppHandle, path: String) -> Api<String> {
    blocking(app, move |s| impact_read(s, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_impact_analyze(app: AppHandle, base: String, click: bool) -> Api<ImpactEntry> {
    blocking(app, move |s| impact_analyze(s, &base, click)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{code as git_cmd, projects};
    use shipyard_agents::AgentError;
    use shipyard_agents::impacts::Ask;
    use std::process::Command;
    use std::sync::Mutex;

    fn git(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .unwrap();
        assert!(out.status.success(), "git {args:?}: {out:?}");
    }

    fn project(dir: &Path) -> (AppState, PathBuf) {
        let s = AppState::new(dir.join("data"));
        let root = dir.join("p");
        std::fs::create_dir_all(&root).unwrap();
        git(&root, &["init", "-q", "-b", "main"]);
        git(&root, &["config", "user.name", "Test User"]);
        git(&root, &["config", "user.email", "test@example.com"]);
        std::fs::write(root.join("a.txt"), "one\n").unwrap();
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-q", "-m", "chore: base"]);
        projects::open(&s, root.to_str().unwrap()).unwrap();
        (s, std::fs::canonicalize(&root).unwrap())
    }

    #[test]
    fn an_archive_stages_its_own_paths_and_not_a_stray_file_of_the_specs_folder() {
        let dir = tempfile::tempdir().unwrap();
        let (_s, root) = project(dir.path());
        let put = |rel: &str| {
            let p = root.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, "x\n").unwrap();
        };
        put("specs/changes/add-auth/proposal.md");
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-q", "-m", "docs: change"]);
        // What the archive does: the change leaves, the archive folder and the capability come.
        std::fs::remove_dir_all(root.join("specs/changes/add-auth")).unwrap();
        put("specs/changes/archive/2026-01-02-add-auth/proposal.md");
        put("specs/specs/auth/spec.md");
        // Strays under the same folder.
        put("specs/notes.md");
        put("specs/changes/other/proposal.md");
        let r = Repo::open(&root).unwrap();
        let added = ["2026-01-02-add-auth".to_string()];
        stage_archive(&r, "specs/", "add-auth", &added, &["auth".into()]).unwrap();
        let list = |args: &[&str]| {
            let out = Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(args)
                .output()
                .unwrap();
            String::from_utf8(out.stdout).unwrap()
        };
        // Same content in the three places: a rename pair must not hide a path.
        assert_eq!(
            list(&["diff", "--cached", "--name-only", "--no-renames"]),
            "specs/changes/add-auth/proposal.md\n\
             specs/changes/archive/2026-01-02-add-auth/proposal.md\n\
             specs/specs/auth/spec.md\n"
        );
        assert_eq!(
            list(&["ls-files", "--others", "--exclude-standard"]),
            "specs/changes/other/proposal.md\nspecs/notes.md\n"
        );
    }

    #[test]
    fn a_forge_write_needs_a_click_and_a_forge() {
        let dir = tempfile::tempdir().unwrap();
        let (s, _) = project(dir.path());
        let e = pull_comment(&s, 1, "x", false).unwrap_err();
        assert!(e.contains("click"), "{e}");
        assert_eq!(
            pull_merge(&s, 1, MergeMethod::Merge, true).unwrap_err(),
            NO_FORGE
        );
        assert_eq!(pull_ready(&s, 1, true).unwrap_err(), NO_FORGE);
        assert!(pull_ready(&s, 1, false).unwrap_err().contains("click"));
    }

    #[test]
    fn only_a_declared_check_runs_and_its_report_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path());
        let file = root.join(".shipyard/project.yaml");
        let text = std::fs::read_to_string(&file).unwrap();
        std::fs::write(&file, format!("{text}\ngates:\n  - echo all-green\n")).unwrap();
        assert!(check_run(&s, "echo all-green", false).is_err());
        assert!(
            check_run(&s, "echo other", true)
                .unwrap_err()
                .contains("not a check")
        );
        let r = check_run(&s, "echo all-green", true).unwrap();
        assert!(r.passed && r.tail == "all-green", "{r:?}");
        let v = quality_view(&s).unwrap();
        assert_eq!(v.checks[0].last.as_ref().map(|r| r.passed), Some(true));
        // The row follows the machine: available exactly when the tool is installed.
        assert!(v.scanners.iter().any(|x| {
            x.name == "dependencies" && x.available == scanners::installed("osv-scanner")
        }));
        assert!(
            scan_run(&s, "nope", true)
                .unwrap_err()
                .contains("not a scanner")
        );
        if !scanners::installed("osv-scanner") {
            assert!(
                scan_run(&s, "dependencies", true)
                    .unwrap_err()
                    .contains("not installed")
            );
        }
    }

    #[test]
    fn a_read_only_profile_blocks_a_write_in_the_backend() {
        let dir = tempfile::tempdir().unwrap();
        let (s, _) = project(dir.path());
        assert!(scan_run(&s, "secrets", true).is_ok());
        let on = shipyard_store::project::Overrides {
            read_only: Some(true),
            ..Default::default()
        };
        crate::commands::projects::save_overrides(&s, on).unwrap();
        let e = scan_run(&s, "secrets", true).unwrap_err();
        assert!(e.contains("read only"), "{e}");
    }

    #[test]
    fn the_secret_scan_reports_a_place_and_never_the_value() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path());
        let secret = format!("ghp_{}", "a1B2c3D4e5".repeat(4));
        std::fs::write(root.join("conf.txt"), format!("x\nkey = {secret}\n")).unwrap();
        std::fs::write(root.join("pw.env"), "PASSWORD=\"hunter2hunter2\"\nok = 1\n").unwrap();
        let r = scan_run(&s, "secrets", true).unwrap();
        assert!(!r.passed);
        let hit = r.findings.iter().find(|f| f.path == "conf.txt").unwrap();
        assert_eq!((hit.line, hit.severity), (Some(2), ScanSeverity::High));
        assert!(r.findings.iter().any(|f| f.path == "pw.env"));
        let kept =
            std::fs::read_to_string(root.join(".shipyard/quality/scanner-secrets.yaml")).unwrap();
        assert!(
            !kept.contains(&secret) && !kept.contains("hunter2hunter2"),
            "{kept}"
        );
        assert!(scan_text("a.rs", "let token = env::var(\"X\");").is_empty());
    }

    struct Fake(Mutex<Vec<&'static str>>);

    impl Ask for Fake {
        fn ask(&self, _: &str) -> Result<String, AgentError> {
            Ok(self.0.lock().unwrap().remove(0).into())
        }
    }

    #[test]
    fn analyze_saves_a_plan_and_a_digest_in_two_files() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path());
        std::fs::write(root.join("new.txt"), "uncommitted\n").unwrap();
        let ask = Fake(Mutex::new(vec![
            r#"{"axes": {"data": "high"}, "stale": [], "actions": ["Migrate"]}"#,
            "The release slips one week.",
        ]));
        let (entry, a) = analyze_with(&s, &ask, "main").unwrap();
        assert_ne!(entry.plan, entry.digest);
        let plan = std::fs::read_to_string(root.join(&entry.plan)).unwrap();
        let digest = std::fs::read_to_string(root.join(&entry.digest)).unwrap();
        assert!(plan.contains("- data: high") && !digest.contains("data: high"));
        assert_eq!(a.digest, digest);
        assert_eq!(impact_list(&s).unwrap(), std::slice::from_ref(&entry));
        assert_eq!(impact_read(&s, &entry.digest).unwrap(), digest);
        assert!(impact_read(&s, "a.txt").is_err());
        let refs = impact_refs(&s).unwrap();
        assert_eq!(refs.default, "main");
        // Nothing changed: no analysis.
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-q", "-m", "chore: x"]);
        assert!(analyze_with(&s, &ask, "main").is_err());
    }

    #[test]
    fn a_commit_of_a_run_links_to_its_run() {
        let dir = tempfile::tempdir().unwrap();
        let (s, root) = project(dir.path());
        std::fs::write(root.join("b.txt"), "x\n").unwrap();
        git_cmd::stage(&s, &["b.txt".to_string()]).unwrap();
        let sha = git_cmd::commit(&s, "chore: merge", "Shipyard run run:r-7: merged.").unwrap();
        let id = s.registry().unwrap().active().unwrap().id.clone();
        let shared = s.index_of(&id).unwrap();
        let index = shared.lock().unwrap();
        let groups = index.backlinks("run:r-7").unwrap();
        assert_eq!(groups[0].items[0].source, format!("commit:{sha}"));
    }

    #[test]
    fn a_write_keeps_its_result_when_the_sync_tick_has_nothing_to_do() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        assert_eq!(synced(&s, Ok(7)).unwrap(), 7);
        assert_eq!(
            synced::<u8>(&s, Err("refused".into())).unwrap_err(),
            "refused"
        );
    }
}
