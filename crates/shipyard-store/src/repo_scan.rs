//! Reads the repository artifacts that the index covers: ADRs, RAID questions, OpenSpec changes
//! and specs, workflows and the project file. Each file gives entities and citations.

use std::path::Path;
use std::time::UNIX_EPOCH;

use shipyard_core::gherkin;
use shipyard_core::project::ProjectFile;
use shipyard_core::refs::{Ref, detect, parse};

use crate::design::{api_info, file_ref, parse_screens, screens_path};
use crate::project::parse_project_file;
use crate::ref_index::{Citation, Entity};
use crate::seal::is_sealed;
use crate::work::{read_decisions, read_sheet, read_team};

const MAX_BYTES: u64 = 1_000_000;

/// The folders to scan: the artifact paths of the project file (with the design folders and the
/// test plan folder), `.shipyard` and the work files (estimate sheets and plan decisions).
pub fn roots(p: &ProjectFile) -> Vec<String> {
    let mut r: Vec<String> = ["decisions", "questions", "specs"]
        .iter()
        .map(|k| p.path(k).to_string())
        .collect();
    r.extend(
        [
            "diagrams",
            "models",
            "api",
            "data",
            "flows",
            "designs",
            "test-plans",
            "handbook",
            "documents",
            "slides",
        ]
        .iter()
        .map(|k| p.path(k).to_string()),
    );
    r.extend([".shipyard", "docs/costing", "docs/planning"].map(String::from));
    r
}

pub struct File {
    pub rel: String,
    pub fingerprint: String,
}

pub fn walk(root: &Path, roots: &[String]) -> Vec<File> {
    fn rec(root: &Path, rel: &str, out: &mut Vec<File>) {
        let Ok(rd) = std::fs::read_dir(root.join(rel)) else {
            return;
        };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let child = format!("{rel}/{name}");
            let Ok(meta) = e.metadata() else { continue };
            if meta.is_dir() {
                if name != "node_modules" && name != ".git" {
                    rec(root, &child, out);
                }
            } else if meta.len() <= MAX_BYTES
                && (name.ends_with(".drawio.svg")
                    || matches!(
                        name.rsplit('.').next(),
                        Some(
                            "md" | "yaml"
                                | "yml"
                                | "json"
                                | "feature"
                                | "excalidraw"
                                | "drawio"
                                | "mmd"
                                | "mermaid"
                                | "bpmn"
                                | "c4"
                                | "likec4"
                                | "dbml"
                        )
                    ))
            {
                let nanos = meta
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_nanos());
                out.push(File {
                    rel: child,
                    fingerprint: format!("{nanos}-{}", meta.len()),
                });
            }
        }
    }
    let mut out = Vec::new();
    for r in roots {
        rec(root, r, &mut out);
    }
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    out.dedup_by(|a, b| a.rel == b.rel);
    out
}

/// The value of `key:` in a front matter block, or of a `Key: value` line.
fn front(text: &str, key: &str) -> Option<String> {
    let rest = text.strip_prefix("---\n")?;
    let block = rest.split("\n---").next()?;
    block.lines().find_map(|l| {
        l.strip_prefix(key)?
            .strip_prefix(':')
            .map(|v| v.trim().to_string())
    })
}

pub(crate) fn title_of(text: &str) -> Option<String> {
    let body = text
        .strip_prefix("---\n")
        .and_then(|r| r.split_once("\n---").map(|(_, b)| b))
        .unwrap_or(text);
    body.lines()
        .find_map(|l| l.strip_prefix("# ").map(|t| t.trim().to_string()))
        .filter(|t| !t.is_empty())
}

pub(crate) fn file_stem(rel: &str) -> &str {
    let name = rel.rsplit('/').next().unwrap_or(rel);
    let name = name.strip_suffix(".drawio.svg").unwrap_or(name);
    name.rsplit_once('.').map_or(name, |(s, _)| s)
}

/// `rel` below `base`, without the leading slash.
fn below<'a>(rel: &'a str, base: &str) -> Option<&'a str> {
    rel.strip_prefix(base)?.strip_prefix('/')
}

pub fn scan(rel: &str, text: &str, p: &ProjectFile) -> (Vec<Entity>, Vec<Citation>) {
    let doc = format!("doc:{rel}");
    let title = title_of(text).unwrap_or_else(|| file_stem(rel).to_string());
    let mut ents = Vec::new();
    let mut extra: Vec<Citation> = Vec::new();
    let mut primary = doc.clone();
    let mut add = |target: String, title: &str, status: Option<String>| {
        ents.push(Entity {
            target,
            title: title.into(),
            status,
            location: Some(rel.into()),
            hidden: false,
        });
    };

    if let Some(name) = below(rel, p.path("decisions")).filter(|n| !n.contains('/')) {
        let digits: String = name.chars().take(4).collect();
        if digits.len() == 4 && digits.bytes().all(|b| b.is_ascii_digit()) {
            primary = format!("adr:{digits}");
            add(primary.clone(), &title, front(text, "status"));
        }
    } else if let Some(name) = below(rel, p.path("questions")).filter(|n| !n.contains('/')) {
        if let Some(n) = file_stem(name)
            .strip_prefix("Q-")
            .filter(|n| n.len() >= 3 && n.bytes().all(|b| b.is_ascii_digit()))
        {
            primary = format!("q:Q-{n}");
            add(primary.clone(), &title, front(text, "status"));
        }
    } else if rel == screens_path(p) {
        for sc in parse_screens(text).unwrap_or_default() {
            let target = format!("screen:{}", sc.slug);
            if parse(&target).is_none() {
                continue;
            }
            extra.extend(
                sc.artifacts
                    .iter()
                    .filter(|a| parse(a).is_some())
                    .map(|a| Citation {
                        source: target.clone(),
                        target: a.clone(),
                    }),
            );
            add(target, &sc.title, None);
        }
    } else if let Some((kind, slug)) = file_ref(rel, p).filter(|(k, _)| {
        // A file in the API folder is a contract only when its text says so.
        *k != "api" || matches!(api_info(text), Ok(Some(_)))
    }) {
        primary = format!("{kind}:{slug}");
        let name = match (kind, api_info(text)) {
            ("api", Ok(Some((Some(t), _)))) => t,
            ("test", _) => gherkin::parse(text)
                .ok()
                .map(|plan| plan.title)
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| file_stem(rel).into()),
            _ => file_stem(rel).into(),
        };
        add(primary.clone(), &name, None);
    } else if let Some(rest) = below(rel, p.path("specs")) {
        let parts: Vec<&str> = rest.split('/').collect();
        match parts.as_slice() {
            ["changes", id, "proposal.md"] => {
                primary = format!("change:{id}");
                add(primary.clone(), &title, None);
            }
            ["changes", _, "specs", cap, "spec.md"] | ["specs", cap, "spec.md"] => {
                primary = format!("spec:{cap}");
                let status = text
                    .lines()
                    .find_map(|l| l.strip_prefix("Status:"))
                    .map(|s| s.trim().to_string());
                add(primary.clone(), &title, status);
                for l in text.lines() {
                    let Some(req) = l.strip_prefix("### Requirement: REQ-") else {
                        continue;
                    };
                    let (n, name) = req.split_once(' ').unwrap_or((req, ""));
                    if n.len() >= 3 && n.bytes().all(|b| b.is_ascii_digit()) {
                        add(format!("spec:{cap}#REQ-{n}"), name.trim(), None);
                    }
                }
            }
            _ => {}
        }
    } else if rel == ".shipyard/team.yaml" {
        // A sealed day rate leaves the members readable: only the rate is hidden (REQ-005).
        for m in read_team(text, None).map(|t| t.members).unwrap_or_default() {
            add(format!("member:{}", m.handle), &m.name, Some(m.role));
        }
    } else if let Some(slug) = rel
        .strip_prefix("docs/costing/")
        .and_then(|n| n.strip_suffix(".yaml"))
        .filter(|n| !n.contains('/'))
    {
        // A sealed sheet is one opaque entity: no row is read (REQ-014).
        primary = format!("est:{slug}");
        match read_sheet(text, None) {
            Ok(sheet) => {
                add(primary.clone(), &sheet.name, None);
                for f in &sheet.features {
                    add(format!("est:{slug}#{}", f.id), &f.name, None);
                }
                for (_, t) in sheet.tasks() {
                    add(format!("est:{slug}#{}", t.id), &t.name, None);
                    if let Some(key) = &t.ticket {
                        extra.push(Citation {
                            source: primary.clone(),
                            target: format!("wi:{key}"),
                        });
                    }
                }
            }
            Err(_) => add(
                primary.clone(),
                slug,
                is_sealed(text).then(|| "sealed".into()),
            ),
        }
    } else if rel == "docs/planning/plan.yaml" {
        // The members that a person chose for a task: the sheet cites the member.
        for (task, d) in read_decisions(text).map(|d| d.tasks).unwrap_or_default() {
            if let (Some(Ref::Estimate { sheet, .. }), Some(h)) = (parse(&task), &d.member) {
                extra.push(Citation {
                    source: format!("est:{sheet}"),
                    target: format!("member:{h}"),
                });
            }
        }
    } else if rel == ".shipyard/project.yaml" {
        if let Ok(f) = parse_project_file(text) {
            primary = format!("project:{}", f.id());
            add(primary.clone(), &f.name, None);
        }
    } else if let Some(id) = rel
        .strip_prefix(".shipyard/workflows/")
        .and_then(|n| n.strip_suffix(".yaml").or(n.strip_suffix(".yml")))
    {
        primary = format!("wf:{id}");
        let name = text
            .lines()
            .find_map(|l| l.strip_prefix("name:"))
            .map(|n| n.trim().trim_matches('"').to_string());
        add(primary.clone(), name.as_deref().unwrap_or(id), None);
    }

    // The file is also a `doc:` entity. It stays out of search when it has a better entity.
    let twin = primary != doc;
    ents.push(Entity {
        target: doc,
        title,
        status: None,
        location: Some(rel.into()),
        hidden: twin,
    });

    let mut cites: Vec<Citation> = detect(text)
        .into_iter()
        .map(|f| Citation {
            source: primary.clone(),
            target: f.target.to_string(),
        })
        .chain(extra)
        .filter(|c| c.source != c.target)
        .collect();
    cites.sort_by(|a, b| a.target.cmp(&b.target));
    cites.dedup();
    (ents, cites)
}
