//! The external scanners of Code / Quality: `osv-scanner` (dependencies), `semgrep` (code) and
//! `skillspector` (agent skills). They run only when installed. Only the
//! findings that the Quality view shows are kept.

use std::path::Path;
use std::process::Command;

use serde_json::Value;
use shipyard_agents::which::{quiet, search_dirs, which};
use shipyard_store::code::{ScanFinding, ScanSeverity};

/// A scanner name and the program that runs it.
pub const EXTERNAL: [(&str, &str); 3] = [
    ("dependencies", "osv-scanner"),
    ("code", "semgrep"),
    ("skills", "skillspector"),
];

/// The folders that hold agent skills.
const SKILL_ROOTS: [&str; 2] = [".agents/skills", ".claude/skills"];

/// The install commands of a program, tried in order: the first whose manager exists runs.
/// shortcut: package managers only, no download of a release. Add one when a manager is missing.
fn installers(program: &str) -> &'static [&'static [&'static str]] {
    match program {
        "osv-scanner" => &[
            &["brew", "install", "osv-scanner"],
            &[
                "go",
                "install",
                "github.com/google/osv-scanner/v2/cmd/osv-scanner@latest",
            ],
        ],
        "semgrep" => &[
            &["brew", "install", "semgrep"],
            &["pipx", "install", "semgrep"],
        ],
        "skillspector" => &[&["uv", "tool", "install", "skillspector"]],
        _ => &[],
    }
}

pub fn program(scanner: &str) -> Option<&'static str> {
    EXTERNAL
        .iter()
        .find(|(n, _)| *n == scanner)
        .map(|(_, p)| *p)
}

pub fn installed(program: &str) -> bool {
    which(program, &search_dirs()).is_some()
}

/// Install a scanner with the first package manager that this machine has.
pub fn install(scanner: &str) -> Result<(), String> {
    let program = program(scanner).ok_or_else(|| format!("`{scanner}` is not a scanner"))?;
    let dirs = search_dirs();
    let cmd = installers(program)
        .iter()
        .find(|c| which(c[0], &dirs).is_some())
        .ok_or_else(|| format!("no package manager found to install `{program}`"))?;
    let bin = which(cmd[0], &dirs).ok_or("manager vanished")?;
    let out = quiet(Command::new(bin).args(&cmd[1..]))
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    let tail: String = String::from_utf8_lossy(&out.stderr)
        .lines()
        .rev()
        .take(3)
        .collect::<Vec<_>>()
        .join(" ");
    Err(format!("`{}` failed: {tail}", cmd.join(" ")))
}

/// The ignore list of `osv-scanner`, each entry with its reason.
const OSV_CONFIG: &str = ".osv-scanner.toml";

/// The lock files that `osv-scanner` reads.
const LOCKFILES: [&str; 11] = [
    "Cargo.lock",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "poetry.lock",
    "uv.lock",
    "Pipfile.lock",
    "composer.lock",
    "Gemfile.lock",
    "go.mod",
];

/// The folders of `root` that git does not own: nested worktrees and repositories, and submodules.
fn foreign_dirs(root: &Path) -> Result<Vec<String>, String> {
    Ok(crate::code::scan_files(root)?
        .into_iter()
        .filter(|p| root.join(p).is_dir())
        .map(|p| p.trim_end_matches('/').to_string())
        .collect())
}

/// The runs of a scanner, each one the arguments of its program. `json` asks for the report that
/// Shipyard reads; without it the arguments are the ones for a terminal. Git lists the lock files
/// and the folders: an ignored folder, a nested worktree and a submodule are out (REQ-004).
pub fn runs(scanner: &str, root: &Path, json: bool) -> Result<Vec<Vec<String>>, String> {
    let owned = |a: &[&str]| a.iter().map(|x| (*x).to_string()).collect::<Vec<_>>();
    Ok(match scanner {
        "dependencies" => {
            let files: Vec<String> = crate::code::scan_files(root)?
                .into_iter()
                .filter(|p| {
                    let name = p.rsplit('/').next().unwrap_or(p);
                    LOCKFILES.contains(&name) && root.join(p).is_file()
                })
                .collect();
            if files.is_empty() {
                return Ok(Vec::new());
            }
            let mut a = owned(&["scan", "source"]);
            if json {
                a.extend(owned(&["--format", "json"]));
            }
            // The config lookup of osv-scanner stops at the folder of each lock file: pass it once.
            if root.join(OSV_CONFIG).is_file() {
                a.extend(owned(&["--config", OSV_CONFIG]));
            }
            a.extend(files.into_iter().flat_map(|f| ["-L".to_string(), f]));
            vec![a]
        }
        "code" => {
            let mut a = owned(&["scan", "--config", "auto"]);
            if json {
                a.extend(owned(&["--json", "--quiet"]));
            }
            a.extend(
                foreign_dirs(root)?
                    .into_iter()
                    .flat_map(|d| ["--exclude".to_string(), d]),
            );
            a.push(".".into());
            vec![a]
        }
        _ => SKILL_ROOTS
            .iter()
            .filter(|r| root.join(r).is_dir())
            .map(|r| {
                let mut a = owned(&["scan", r, "--recursive", "--no-llm"]);
                if json {
                    a.extend(owned(&["--format", "json"]));
                }
                a
            })
            .collect(),
    })
}

/// The command line of a scanner for the terminal, or `None` for the scanner that runs in process.
pub fn command(scanner: &str, root: &Path) -> Option<String> {
    let program = program(scanner)?;
    let quote = |a: &String| {
        if a.chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_./=".contains(c))
        {
            a.clone()
        } else {
            format!("'{}'", a.replace('\'', "'\\''"))
        }
    };
    let runs = runs(scanner, root, false).ok()?;
    let line = runs
        .iter()
        .map(|a| {
            format!(
                "{program} {}",
                a.iter().map(quote).collect::<Vec<_>>().join(" ")
            )
        })
        .collect::<Vec<_>>()
        .join(" && ");
    (!line.is_empty()).then_some(line)
}

const SCAN_LIMIT: std::time::Duration = std::time::Duration::from_secs(15 * 60);

/// Run one program: the report is its stdout. `on_lines` gets the last lines of its stderr while
/// it runs, at most four times a second.
/// The group of the scanner is killed at `limit`.
fn exec(
    bin: &Path,
    args: &[String],
    root: &Path,
    limit: std::time::Duration,
    on_lines: &dyn Fn(Vec<String>),
) -> Result<String, String> {
    use std::io::{BufRead, BufReader, Read};
    use std::process::Stdio;
    use std::sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
    };
    let mut cmd = Command::new(bin);
    cmd.args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut cmd, 0);
    let mut child = quiet(&mut cmd).spawn().map_err(|e| e.to_string())?;
    // 0 running, 1 ended, 2 timed out.
    let state = Arc::new(AtomicU8::new(0));
    let pid = child.id();
    let watch = state.clone();
    std::thread::spawn(move || {
        let start = std::time::Instant::now();
        while watch.load(Ordering::SeqCst) == 0 {
            if start.elapsed() >= limit
                && watch
                    .compare_exchange(0, 2, Ordering::SeqCst, Ordering::SeqCst)
                    .is_ok()
            {
                shipyard_agents::runner::kill_group(pid);
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    });
    let (mut out, err) = (child.stdout.take(), child.stderr.take());
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(o) = out.as_mut() {
            let _ = o.read_to_end(&mut bytes);
        }
        String::from_utf8_lossy(&bytes).into_owned()
    });
    let mut last: std::collections::VecDeque<String> = Default::default();
    let mut sent = std::time::Instant::now();
    for line in BufReader::new(err.ok_or("no stderr")?).lines() {
        let Ok(line) = line else { continue };
        if line.trim().is_empty() {
            continue;
        }
        last.push_back(line);
        if last.len() > 20 {
            last.pop_front();
        }
        if sent.elapsed() >= std::time::Duration::from_millis(250) {
            sent = std::time::Instant::now();
            on_lines(last.iter().cloned().collect());
        }
    }
    let _ = child.wait();
    let timed_out = state
        .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
        .is_err();
    on_lines(last.into_iter().collect());
    let report = reader
        .join()
        .map_err(|_| "the scanner output was lost".to_string());
    if timed_out {
        return Err(format!(
            "the scanner ran longer than {} s and was stopped",
            limit.as_secs()
        ));
    }
    report
}

/// Run an installed scanner in `root` and read its findings.
pub fn run(
    scanner: &str,
    root: &Path,
    on_lines: &dyn Fn(Vec<String>),
) -> Result<Vec<ScanFinding>, String> {
    let program = program(scanner).ok_or_else(|| format!("`{scanner}` is not a scanner"))?;
    let bin = which(program, &search_dirs())
        .ok_or_else(|| format!("the scanner `{scanner}` is not installed"))?;
    let mut all = Vec::new();
    for (i, args) in runs(scanner, root, true)?.iter().enumerate() {
        let json = exec(&bin, args, root, SCAN_LIMIT, on_lines)?;
        all.extend(match scanner {
            "dependencies" => parse_osv(&json, root)?,
            "code" => parse_semgrep(&json, root)?,
            _ => {
                let dir = SKILL_ROOTS.iter().filter(|r| root.join(r).is_dir()).nth(i);
                parse_skills(&json, dir.copied().unwrap_or_default())?
            }
        });
    }
    Ok(all)
}

fn json(text: &str, who: &str) -> Result<Value, String> {
    serde_json::from_str(text).map_err(|e| format!("the {who} report is not valid JSON: {e}"))
}

fn s(v: &Value) -> &str {
    v.as_str().unwrap_or_default()
}

fn level(label: &str) -> ScanSeverity {
    match label.to_ascii_uppercase().as_str() {
        "CRITICAL" => ScanSeverity::Critical,
        "ERROR" | "HIGH" => ScanSeverity::High,
        "INFO" | "LOW" => ScanSeverity::Low,
        _ => ScanSeverity::Medium,
    }
}

/// The CVSS score that osv-scanner gives a group, as a severity.
fn cvss(score: &str) -> ScanSeverity {
    match score.parse::<f32>() {
        Ok(x) if x >= 9.0 => ScanSeverity::Critical,
        Ok(x) if x >= 7.0 => ScanSeverity::High,
        Ok(x) if x >= 4.0 => ScanSeverity::Medium,
        Ok(_) => ScanSeverity::Low,
        Err(_) => ScanSeverity::Medium,
    }
}

/// An advisory and its aliases count once.
pub fn parse_osv(text: &str, root: &Path) -> Result<Vec<ScanFinding>, String> {
    let v = json(text, "osv-scanner")?;
    let mut out = Vec::new();
    for r in v["results"].as_array().into_iter().flatten() {
        let src = Path::new(s(&r["source"]["path"]));
        let path = src
            .strip_prefix(root)
            .unwrap_or(src)
            .to_string_lossy()
            .into_owned();
        for p in r["packages"].as_array().into_iter().flatten() {
            let pkg = format!(
                "{}@{}",
                s(&p["package"]["name"]),
                s(&p["package"]["version"])
            );
            let vulns = p["vulnerabilities"].as_array().cloned().unwrap_or_default();
            let mut seen: Vec<String> = Vec::new();
            for g in p["groups"].as_array().into_iter().flatten() {
                let ids: Vec<&str> = g["ids"].as_array().into_iter().flatten().map(s).collect();
                let Some(id) = ids.first() else { continue };
                let summary = vulns
                    .iter()
                    .find(|x| ids.contains(&s(&x["id"])))
                    .map_or("", |x| s(&x["summary"]));
                seen.extend(ids.iter().map(|i| (*i).to_string()));
                out.push(ScanFinding {
                    severity: cvss(s(&g["max_severity"])),
                    path: path.clone(),
                    line: None,
                    message: format!("{id} {pkg} {summary}").trim().into(),
                });
            }
            // Old reports have no groups: one advisory, one finding.
            for x in vulns
                .iter()
                .filter(|x| !seen.iter().any(|i| i == s(&x["id"])))
            {
                out.push(ScanFinding {
                    severity: ScanSeverity::Medium,
                    path: path.clone(),
                    line: None,
                    message: format!("{} {pkg} {}", s(&x["id"]), s(&x["summary"]))
                        .trim()
                        .into(),
                });
            }
        }
    }
    Ok(out)
}

pub fn parse_semgrep(text: &str, root: &Path) -> Result<Vec<ScanFinding>, String> {
    let v = json(text, "semgrep")?;
    Ok(v["results"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|r| {
            let p = Path::new(s(&r["path"]));
            ScanFinding {
                severity: level(s(&r["extra"]["severity"])),
                path: p
                    .strip_prefix(root)
                    .unwrap_or(p)
                    .to_string_lossy()
                    .into_owned(),
                line: r["start"]["line"].as_u64().map(|l| l as u32),
                message: format!("{} {}", s(&r["check_id"]), s(&r["extra"]["message"])),
            }
        })
        .collect())
}

/// A finding names the pattern, never the matched text: a skill can quote a secret.
pub fn parse_skills(text: &str, dir: &str) -> Result<Vec<ScanFinding>, String> {
    let v = json(text, "skillspector")?;
    let list: Vec<&Value> = match v["skills"].as_array() {
        Some(a) => a.iter().collect(),
        None => vec![&v],
    };
    Ok(list
        .into_iter()
        .flat_map(|sk| sk["issues"].as_array().into_iter().flatten())
        .map(|i| ScanFinding {
            severity: level(s(&i["severity"])),
            path: format!("{dir}/{}", s(&i["location"]["file"])),
            line: i["location"]["start_line"].as_u64().map(|l| l as u32),
            message: format!("{}: {}", s(&i["category"]), s(&i["pattern"])),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn a_scanner_past_its_limit_is_stopped() {
        let start = std::time::Instant::now();
        let r = exec(
            Path::new("/bin/sleep"),
            &["30".into()],
            Path::new("/"),
            std::time::Duration::from_millis(200),
            &|_| {},
        );
        assert!(r.unwrap_err().contains("was stopped"));
        assert!(start.elapsed() < std::time::Duration::from_secs(10));
    }

    #[test]
    fn osv_groups_count_an_advisory_and_its_alias_once() {
        let j = r#"{"results":[{"source":{"path":"/r/Cargo.lock"},"packages":[{"package":{"name":"a","version":"1"},
          "vulnerabilities":[{"id":"GHSA-1","summary":"bad"},{"id":"CVE-1"}],
          "groups":[{"ids":["GHSA-1","CVE-1"],"max_severity":"9.8"}]}]}]}"#;
        let f = parse_osv(j, Path::new("/r")).unwrap();
        assert_eq!(f.len(), 1);
        assert_eq!(
            (f[0].severity, f[0].path.as_str()),
            (ScanSeverity::Critical, "Cargo.lock")
        );
        assert!(f[0].message.contains("GHSA-1 a@1 bad"));
    }

    #[test]
    fn semgrep_and_skills_reports_read() {
        let j = r#"{"results":[{"check_id":"r.x","path":"/r/a.js","start":{"line":3},"extra":{"severity":"ERROR","message":"m"}}]}"#;
        let f = parse_semgrep(j, Path::new("/r")).unwrap();
        assert_eq!(
            (f[0].line, f[0].severity, f[0].path.as_str()),
            (Some(3), ScanSeverity::High, "a.js")
        );
        let k = r#"{"issues":[{"severity":"HIGH","category":"Injection","pattern":"p","location":{"file":"S/SKILL.md","start_line":2}}]}"#;
        let f = parse_skills(k, ".agents/skills").unwrap();
        assert_eq!(f[0].path, ".agents/skills/S/SKILL.md");
        assert!(parse_semgrep("nope", Path::new("/r")).is_err());
    }

    fn git(root: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .arg("-C")
            .arg(root)
            .args(args)
            .status()
            .unwrap();
        assert!(ok.success());
    }

    #[test]
    fn the_scanners_read_tracked_lock_files_and_skip_nested_worktrees() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let w = |rel: &str| {
            let p = r.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, "x").unwrap();
        };
        git(r, &["init", "-q"]);
        w("Cargo.lock");
        w("app/pnpm-lock.yaml");
        w("ignored/yarn.lock");
        w(".gitignore");
        std::fs::write(r.join(".gitignore"), "ignored/\n").unwrap();
        // A nested worktree: a folder with its own repository and a lock file.
        w(".claude/worktrees/x/Cargo.lock");
        git(&r.join(".claude/worktrees/x"), &["init", "-q"]);
        let deps = runs("dependencies", r, false).unwrap();
        assert_eq!(
            deps[0].join(" "),
            "scan source -L Cargo.lock -L app/pnpm-lock.yaml"
        );
        assert_eq!(
            command("dependencies", r).unwrap(),
            "osv-scanner scan source -L Cargo.lock -L app/pnpm-lock.yaml"
        );
        let code = runs("code", r, true).unwrap();
        assert!(
            code[0].join(" ").contains("--exclude .claude/worktrees/x "),
            "{code:?}"
        );
        assert!(runs("skills", r, true).unwrap().is_empty());
        assert!(command("secrets", r).is_none());
    }

    #[test]
    fn an_unknown_scanner_has_no_program_and_no_installer() {
        assert_eq!(program("code"), Some("semgrep"));
        assert!(program("secrets").is_none() && install("secrets").is_err());
    }
}
