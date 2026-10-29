//! The compass reader (spec `extensions`, REQ-001, REQ-002, REQ-004): the pinned tree is read
//! only, the lock `.agents/compass.lock.json` gives the state, and the files of the project give
//! the stack. Nothing here writes.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use shipyard_core::extensions::{Entry, Kind, safe_rel, sync_state};
use specta::Type;

use crate::Result;

/// Shipyard pins the compass at this path (ADR 0010).
pub const DEFAULT_TREE: &str = "docs/agent-compass";
const LOCK: &str = ".agents/compass.lock.json";
const CONFIG: &str = ".agents/compass.json";
const INSTINCTS: &str = ".agents/instincts";

/// The skills that suit a stack. shortcut: a fixed table, since a skill has no stack field; move
/// it to the skill frontmatter when compass adds one.
const SUITS: [(&str, &[&str]); 5] = [
    ("react-web", &["design-taste-skills", "ui-conformance"]),
    ("nestjs-api", &["api-contract-sync"]),
    ("angular-web", &["api-contract-sync"]),
    ("expo-mobile", &["native-mobile-skills"]),
    ("swift-native", &["native-mobile-skills"]),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Compass {
    /// The path of the tree, relative to the project root.
    pub tree: String,
    /// The version of the tree.
    pub version: String,
    /// The version that the lock pins. `None` before the first sync.
    pub pinned: Option<String>,
    pub stacks: Vec<String>,
    pub entries: Vec<Entry>,
}

fn json(path: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

/// The tree that the project pins: the default path, else a submodule whose address names
/// `agent-compass`. `None` for a project with no pin (the view shows Add compass).
pub fn tree_of(root: &Path) -> Option<String> {
    let has = |t: &str| root.join(t).join("bin/ac.mjs").is_file();
    if has(DEFAULT_TREE) {
        return Some(DEFAULT_TREE.into());
    }
    let text = fs::read_to_string(root.join(".gitmodules")).ok()?;
    let mut path = None;
    for l in text.lines().map(str::trim) {
        if let Some(p) = l.strip_prefix("path =") {
            path = Some(p.trim().to_string());
        } else if l.starts_with("url =") && l.contains("agent-compass") {
            return path.filter(|p| safe_rel(p) && has(p));
        }
    }
    None
}

/// The value of a key in the frontmatter of a text.
fn front(text: &str, key: &str) -> Option<String> {
    let body = text.strip_prefix("---\n")?;
    body.lines()
        .take_while(|l| l.trim_end() != "---")
        .find_map(|l| l.strip_prefix(key)?.strip_prefix(':'))
        .map(|v| v.trim().trim_matches('"').to_string())
}

fn names(dir: &Path, dirs: bool, ext: &str) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir() == dirs)
        .filter_map(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            if dirs {
                Some(n)
            } else {
                n.strip_suffix(ext).map(str::to_string)
            }
        })
        .collect();
    v.sort();
    v
}

/// The stacks of the project, from its files. shortcut: root markers and the root `package.json`
/// only; a monorepo that keeps its apps deeper needs a walk (Legacy `stacks.rs` has one).
pub fn detect_stacks(root: &Path) -> Vec<String> {
    let deps: Vec<String> = json(&root.join("package.json"))
        .into_iter()
        .flat_map(|v| {
            ["dependencies", "devDependencies"]
                .iter()
                .filter_map(|k| {
                    v.get(k)?
                        .as_object()
                        .map(|o| o.keys().cloned().collect::<Vec<_>>())
                })
                .flatten()
                .collect::<Vec<_>>()
        })
        .collect();
    let dep = |p: &str| deps.iter().any(|d| d == p || d.starts_with(p));
    let mut out = Vec::new();
    let mut add = |on: bool, id: &str| {
        if on {
            out.push(id.to_string());
        }
    };
    add(dep("react") && !dep("react-native"), "react-web");
    add(dep("@nestjs/"), "nestjs-api");
    add(
        dep("@angular/") || root.join("angular.json").is_file(),
        "angular-web",
    );
    add(dep("expo") || dep("react-native"), "expo-mobile");
    add(root.join("Package.swift").is_file(), "swift-native");
    add(root.join("Cargo.toml").is_file(), "rust");
    out
}

/// Read the tree and the lock. `None` when the project pins no compass.
pub fn read(root: &Path) -> Result<Option<Compass>> {
    let Some(tree) = tree_of(root) else {
        return Ok(None);
    };
    let base = root.join(&tree);
    let version = json(&base.join("package.json"))
        .and_then(|v| v.get("version")?.as_str().map(str::to_string))
        .unwrap_or_default();
    let lock = json(&root.join(LOCK));
    let pinned = lock
        .as_ref()
        .and_then(|l| l.get("version")?.as_str().map(str::to_string));
    let strs = |v: Option<&Value>| -> Vec<String> {
        v.and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default()
    };
    let locked = strs(lock.as_ref().and_then(|l| l.get("skills")));
    let packs_on = strs(
        json(&root.join(CONFIG))
            .as_ref()
            .and_then(|c| c.get("packs")),
    );
    let contract_on = lock
        .as_ref()
        .and_then(|l| l.get("blocks")?.get("AGENTS.md"))
        .is_some();
    let stacks = detect_stacks(root);
    let suited: Vec<&str> = SUITS
        .iter()
        .filter(|(s, _)| stacks.iter().any(|x| x == s))
        .flat_map(|(_, ids)| ids.iter().copied())
        .collect();

    let mut entries = Vec::new();
    let mut push = |kind: Kind, id: &str, in_lock: bool, risk: Option<String>, writes: bool| {
        entries.push(Entry {
            kind,
            id: id.into(),
            title: id.into(),
            risk,
            writes,
            suits: kind == Kind::Skill && suited.contains(&id),
            state: sync_state(in_lock, pinned.as_deref(), &version),
            pinned: pinned.clone(),
            expected: version.clone(),
        });
    };
    for id in names(&base.join("skills"), true, "") {
        let text =
            fs::read_to_string(base.join("skills").join(&id).join("SKILL.md")).unwrap_or_default();
        let (risk, writes) = (front(&text, "risk_level"), front(&text, "writes_files"));
        push(
            Kind::Skill,
            &id,
            locked.contains(&id),
            risk,
            writes.as_deref() == Some("true"),
        );
    }
    for id in names(&base.join("packs"), true, "") {
        push(Kind::Pack, &id, packs_on.contains(&id), None, true);
    }
    for id in names(&base.join("docs/guide"), false, ".md") {
        push(Kind::Guide, &id, lock.is_some(), None, false);
    }
    // A pattern is an instinct file. The project holds the applied ones.
    let mut patterns = names(&base.join("instincts"), false, ".md");
    let applied = names(&root.join(INSTINCTS), false, ".md");
    let extra: Vec<String> = applied
        .iter()
        .filter(|a| !patterns.contains(a))
        .cloned()
        .collect();
    patterns.extend(extra);
    for id in patterns {
        push(Kind::Pattern, &id, applied.contains(&id), None, true);
    }
    push(Kind::Contract, "contract", contract_on, None, true);
    Ok(Some(Compass {
        tree,
        version,
        pinned,
        stacks,
        entries,
    }))
}

/// The keys (`kind:id`) that a project holds, from its own files only: a child has no tree
/// (REQ-015). Skills and the contract come from the lock, packs from `compass.json`.
pub fn held(root: &Path) -> Vec<String> {
    let lock = json(&root.join(LOCK));
    let mut out = Vec::new();
    for s in lock
        .iter()
        .flat_map(|l| l.get("skills")?.as_array().cloned())
        .flatten()
    {
        out.extend(s.as_str().map(|s| format!("skill:{s}")));
    }
    if lock
        .as_ref()
        .is_some_and(|l| l.get("blocks").and_then(|b| b.get("AGENTS.md")).is_some())
    {
        out.push("contract:contract".into());
    }
    for p in json(&root.join(CONFIG))
        .iter()
        .flat_map(|c| c.get("packs")?.as_array().cloned())
        .flatten()
    {
        out.extend(p.as_str().map(|p| format!("pack:{p}")));
    }
    out.extend(
        names(&root.join(INSTINCTS), false, ".md")
            .into_iter()
            .map(|p| format!("pattern:{p}")),
    );
    out
}

/// The files under a folder, relative with `/`, sorted. Links are not followed.
pub fn walk_files(top: &Path) -> Result<Vec<String>> {
    let mut files = Vec::new();
    let mut stack = vec![top.to_path_buf()];
    while let Some(d) = stack.pop() {
        for e in fs::read_dir(&d)?.flatten() {
            let p = e.path();
            let t = e.file_type()?;
            if t.is_dir() {
                stack.push(p);
            } else if t.is_file() {
                files.push(p.strip_prefix(top)?.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    files.sort();
    Ok(files)
}

/// The text of an entry, for the preview. It changes no file (REQ-002).
pub fn preview(root: &Path, kind: Kind, id: &str) -> Result<String> {
    if !safe_rel(id) || id.contains('/') {
        return Err(format!("path not allowed: {id}").into());
    }
    let tree = tree_of(root).ok_or("no compass is pinned")?;
    let base = root.join(&tree);
    let file = match kind {
        Kind::Skill => base.join("skills").join(id).join("SKILL.md"),
        Kind::Guide => base.join("docs/guide").join(format!("{id}.md")),
        Kind::Contract => base.join("core/blocks/AGENTS.md"),
        Kind::Pattern => {
            let own = root.join(INSTINCTS).join(format!("{id}.md"));
            if own.is_file() {
                own
            } else {
                base.join("instincts").join(format!("{id}.md"))
            }
        }
        Kind::Pack => return Ok(walk_files(&base.join("packs").join(id))?.join("\n")),
    };
    Ok(fs::read_to_string(file)?)
}
