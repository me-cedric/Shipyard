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

/// Run an installed scanner in `root` and read its findings.
pub fn run(scanner: &str, root: &Path) -> Result<Vec<ScanFinding>, String> {
    let program = program(scanner).ok_or_else(|| format!("`{scanner}` is not a scanner"))?;
    let bin = which(program, &search_dirs())
        .ok_or_else(|| format!("the scanner `{scanner}` is not installed"))?;
    let root_arg = root.to_string_lossy().to_string();
    let exec = |args: &[&str]| -> Result<String, String> {
        let out = quiet(Command::new(&bin).args(args).current_dir(root))
            .output()
            .map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    };
    match scanner {
        "dependencies" => parse_osv(&exec(&["--format", "json", "-r", &root_arg])?, root),
        "code" => parse_semgrep(
            &exec(&["scan", "--json", "--quiet", "--config", "auto", &root_arg])?,
            root,
        ),
        _ => {
            let mut all = Vec::new();
            for r in SKILL_ROOTS.iter().filter(|r| root.join(r).is_dir()) {
                let json = exec(&["scan", r, "--recursive", "--no-llm", "--format", "json"])?;
                all.extend(parse_skills(&json, r)?);
            }
            Ok(all)
        }
    }
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

    #[test]
    fn an_unknown_scanner_has_no_program_and_no_installer() {
        assert_eq!(program("code"), Some("semgrep"));
        assert!(program("secrets").is_none() && install("secrets").is_err());
    }
}
