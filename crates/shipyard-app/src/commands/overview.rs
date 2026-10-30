//! The Projects page, the push-target check and the docs-chain gate (W10, Q-111 to Q-113).
//!
//! Legacy sources: `src/pages/Home.tsx` `ProjectCard` (the cards), `check_push_target` and
//! `src/lib/chain.ts` (the gate).

use std::path::Path;

use serde::Serialize;
use shipyard_core::project::ProjectFile;
use shipyard_git::Repo;
use shipyard_store::project::{FileRead, read_project_file};
use specta::Type;
use tauri::AppHandle;

use super::{AppState, Res, blocking, err};

/// `https://user@host/a/b.git` and `git@host:a/b.git` both give `("host", "a/b")`.
pub fn host_slug(url: &str) -> Option<(String, String)> {
    let (host, path) = if let Some((_, rest)) = url.split_once("://") {
        rest.split_once('/')?
    } else {
        url.split_once('@')?.1.split_once(':')?
    };
    let host = host.rsplit_once('@').map_or(host, |(_, h)| h);
    let slug = path.trim_matches('/').trim_end_matches(".git");
    (!host.is_empty() && !slug.is_empty()).then(|| (host.to_lowercase(), slug.to_string()))
}

/// The web page of a remote address. Always `https`.
pub fn web_url(url: &str) -> Option<String> {
    host_slug(url).map(|(h, s)| format!("https://{h}/{s}"))
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCard {
    pub id: String,
    pub name: String,
    pub path: String,
    /// The host of the remote, or `None` for a local project.
    pub host: Option<String>,
    pub web_url: Option<String>,
    pub branch: Option<String>,
    pub last_commit: Option<String>,
    /// Seconds since the Unix epoch.
    pub last_commit_time: Option<u32>,
    pub ahead: u32,
    pub behind: u32,
    pub changes: u32,
}

fn card(id: &str, name: &str, path: &str) -> ProjectCard {
    let mut c = ProjectCard {
        id: id.into(),
        name: name.into(),
        path: path.into(),
        host: None,
        web_url: None,
        branch: None,
        last_commit: None,
        last_commit_time: None,
        ahead: 0,
        behind: 0,
        changes: 0,
    };
    // A project whose folder is gone or is no repository stays on the page with no figures.
    let Ok(r) = Repo::open(Path::new(path)) else {
        return c;
    };
    if let Ok(st) = r.status() {
        c.branch = st.branch.clone();
        (c.ahead, c.behind) = (st.ahead, st.behind);
        c.changes = [&st.staged, &st.unstaged, &st.untracked, &st.conflicted]
            .iter()
            .map(|l| l.len() as u32)
            .sum();
    }
    if let Ok(page) = r.log(0, 1)
        && let Some(last) = page.commits.first()
    {
        c.last_commit = Some(last.summary.clone());
        c.last_commit_time = Some(last.time);
    }
    if let Ok(Some((_, url))) = r.remote() {
        c.host = host_slug(&url).map(|(h, _)| h);
        c.web_url = web_url(&url);
    }
    c
}

/// One card for each registered project, in registry order. The page groups them by host.
pub fn overview(s: &AppState) -> Res<Vec<ProjectCard>> {
    Ok(s.registry()?
        .projects()
        .iter()
        .map(|e| card(&e.id, &e.name, &e.path))
        .collect())
}

/// Opens the web page of the remote of project `id` in the browser. A project with no remote is an error.
pub fn open_remote(s: &AppState, id: &str) -> Res<()> {
    let reg = s.registry()?;
    let e = reg.get(id).ok_or("unknown project")?;
    let (_, url) = Repo::open(Path::new(&e.path))
        .map_err(err)?
        .remote()
        .map_err(err)?
        .ok_or("the project has no remote")?;
    let page = web_url(&url).ok_or("the remote address is not a web address")?;
    let (program, args): (&str, Vec<&str>) = if cfg!(target_os = "macos") {
        ("open", vec![&page])
    } else if cfg!(windows) {
        ("cmd", vec!["/C", "start", "", &page])
    } else {
        ("xdg-open", vec![&page])
    };
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(err)
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PushTarget {
    pub remote: String,
    pub branch: Option<String>,
    /// `Some(false)`: the account cannot push to this repository. `None`: the forge does not say,
    /// or no connection matches the host.
    pub can_push: Option<bool>,
    /// The working branch is the default branch of the repository.
    pub on_default: bool,
}

/// Looks up the repository of the remote on the forge connection of its host. It reads, it never
/// writes. Legacy source: `check_push_target`.
pub fn push_target(s: &AppState) -> Res<PushTarget> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let r = Repo::open(Path::new(&e.path)).map_err(err)?;
    let (remote, url) = r
        .remote()
        .map_err(err)?
        .ok_or("the project has no remote")?;
    let branch = r.status().map_err(err)?.branch;
    let mut out = PushTarget {
        remote,
        branch,
        can_push: None,
        on_default: false,
    };
    let Some((host, slug)) = host_slug(&url) else {
        return Ok(out);
    };
    let forge = s.connections.list()?.into_iter().find(|c| {
        c.group == crate::connections::ConnectionGroup::Forge
            && host_slug(&format!("{}/x", c.url.trim_end_matches('/')))
                .is_some_and(|(h, _)| h == host)
    });
    let Some(forge) = forge else { return Ok(out) };
    let mut cursor = None;
    // shortcut: five pages of 100 repositories, upgrade when an account holds more.
    for _ in 0..5 {
        let page = s.connections.repos(&forge.id, cursor.as_deref(), 100)?;
        if let Some(repo) = page
            .items
            .iter()
            .find(|p| p.slug.eq_ignore_ascii_case(&slug))
        {
            out.can_push = repo.can_push;
            out.on_default = out.branch.as_deref() == Some(repo.default_branch.as_str());
            break;
        }
        cursor = page.next;
        if cursor.is_none() {
            break;
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ChainWarning {
    /// The path kind that changed.
    pub from: String,
    /// The path kind that did not follow.
    pub to: String,
    pub changed: Vec<String>,
}

/// A change in the first kind puts each listed kind out of date. Shortcut: a fixed chain of the
/// kinds that Shipyard lists, not the page guides of Legacy.
const CHAIN: [(&str, &[&str]); 2] = [
    ("specs", &["designs", "models", "api", "data", "test-plans"]),
    ("api", &["test-plans"]),
];

fn inside(path: &str, folder: &str) -> bool {
    let folder = folder.trim_matches('/');
    path.strip_prefix(folder)
        .is_some_and(|r| r.starts_with('/'))
}

/// The links of the chain where the upstream folder changed and the downstream folder did not.
pub fn stale(file: &ProjectFile, changed: &[String]) -> Vec<ChainWarning> {
    let touched = |kind: &str| -> Vec<String> {
        changed
            .iter()
            .filter(|p| inside(p, file.path(kind)))
            .cloned()
            .collect()
    };
    let mut out = Vec::new();
    for (from, tos) in CHAIN {
        let up = touched(from);
        for to in tos.iter().filter(|_| !up.is_empty()) {
            if touched(to).is_empty() {
                out.push(ChainWarning {
                    from: from.into(),
                    to: (*to).into(),
                    changed: up.clone(),
                });
            }
        }
    }
    out
}

/// The warnings before a commit (`push` false: the staged files) or a push (the files that the
/// upstream does not hold). A project with no valid project file has none.
pub fn chain_gate(s: &AppState, push: bool) -> Res<Vec<ChainWarning>> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let root = Path::new(&e.path);
    let FileRead::Valid(file) = read_project_file(root).map_err(err)? else {
        return Ok(Vec::new());
    };
    let r = Repo::open(root).map_err(err)?;
    let st = r.status().map_err(err)?;
    let changed: Vec<String> = if push {
        match st.upstream {
            Some(up) => r.changed_since(&up).map_err(err)?,
            None => Vec::new(),
        }
    } else {
        st.staged.iter().map(|f| f.path.clone()).collect()
    };
    Ok(stale(&file, &changed))
}

#[tauri::command]
#[specta::specta]
pub async fn projects_overview(app: AppHandle) -> Res<Vec<ProjectCard>> {
    blocking(app, overview).await
}

#[tauri::command]
#[specta::specta]
pub async fn project_open_remote(app: AppHandle, id: String) -> Res<()> {
    blocking(app, move |s| open_remote(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_push_target(app: AppHandle) -> Res<PushTarget> {
    blocking(app, push_target).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_chain_gate(app: AppHandle, push: bool) -> Res<Vec<ChainWarning>> {
    blocking(app, move |s| chain_gate(s, push)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_remote_address_gives_its_host_and_web_page() {
        assert_eq!(
            host_slug("https://u:t@GitHub.com/acme/web.git"),
            Some(("github.com".into(), "acme/web".into()))
        );
        assert_eq!(
            web_url("git@gitlab.com:g/s/p.git").unwrap(),
            "https://gitlab.com/g/s/p"
        );
        assert_eq!(host_slug("/local/path"), None);
        assert_eq!(host_slug("https://host/"), None);
    }

    #[test]
    fn the_gate_warns_when_a_spec_moves_and_its_test_plan_does_not() {
        let f = ProjectFile::new("A", "A");
        let spec = vec!["docs/openspec/x/spec.md".to_string()];
        let w = stale(&f, &spec);
        assert!(w.iter().any(|w| w.from == "specs" && w.to == "test-plans"));
        let both = vec![spec[0].clone(), "docs/delivery/test-plans/a.md".to_string()];
        assert!(!stale(&f, &both).iter().any(|w| w.to == "test-plans"));
        assert!(stale(&f, &["src/a.rs".to_string()]).is_empty());
    }

    #[test]
    fn the_overview_has_one_card_for_each_project_and_survives_a_missing_folder() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let p = dir.path().join("one");
        shipyard_git::project::init(&p).unwrap();
        super::super::projects::open(&s, p.to_str().unwrap()).unwrap();
        let cards = overview(&s).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].host, None);
        assert!(cards[0].changes > 0, "the project file is new");
        assert!(open_remote(&s, &cards[0].id).is_err());
        assert!(open_remote(&s, "nope").is_err());
        assert!(push_target(&s).is_err());
        assert!(chain_gate(&s, true).unwrap().is_empty());
    }
}
