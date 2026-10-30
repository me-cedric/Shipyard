//! The origin of the active project: detect it, set or change it, and publish a local project to
//! a forge (create the repository, set `origin`, push the working branch). Each write needs the
//! click of a person and a project that is not read only. No address with a user name or a
//! password goes in or out: the token stays in the keychain.

use std::path::Path;

use serde::Serialize;
use shipyard_git::Repo;
use specta::Type;
use tauri::AppHandle;

use crate::commands::code::without_userinfo;
use crate::commands::overview::{host_slug, web_url};
use crate::commands::{Api, AppState, Res, blocking, err};
use crate::connections::{ConnectionGroup, ConnectionKind};
use crate::work::need_click;

const ORIGIN: &str = "origin";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Origin {
    pub name: String,
    /// The address, with no user name or password.
    pub url: String,
    pub web_url: Option<String>,
    /// `owner/repo` on the forge.
    pub slug: Option<String>,
    /// The forge connection whose host is the host of the address.
    pub connection: Option<String>,
}

fn root(s: &AppState) -> Res<std::path::PathBuf> {
    Ok(s.registry()?
        .active()
        .ok_or("no active project")?
        .path
        .clone()
        .into())
}

fn describe(s: &AppState, name: String, url: &str) -> Res<Origin> {
    let url = without_userinfo(url);
    let host = host_slug(&url);
    let connection = match &host {
        Some((h, _)) => s
            .connections
            .list()?
            .into_iter()
            .find(|c| {
                c.group == ConnectionGroup::Forge
                    && host_slug(&format!("{}/x", c.url.trim_end_matches('/')))
                        .is_some_and(|(ch, _)| ch == *h)
            })
            .map(|c| c.id),
        None => None,
    };
    Ok(Origin {
        name,
        web_url: web_url(&url),
        slug: host.map(|(_, slug)| slug),
        url,
        connection,
    })
}

/// The origin of the active project, or `None` for a local project.
pub fn origin(s: &AppState) -> Res<Option<Origin>> {
    let r = Repo::open(&root(s)?).map_err(err)?;
    match r.remote().map_err(err)? {
        Some((name, url)) => Ok(Some(describe(s, name, &url)?)),
        None => Ok(None),
    }
}

/// An `https` address with a host and a path, or the `git@host:path` form. No user name or
/// password, no space, no control character, never a leading `-`.
pub fn check_address(url: &str) -> Res<&str> {
    let url = url.trim();
    let clean = !url.is_empty()
        && !url.starts_with('-')
        && !url.chars().any(|c| c.is_whitespace() || c.is_control());
    let https = url
        .strip_prefix("https://")
        .is_some_and(|r| !r.split('/').next().unwrap_or("").contains('@') && r.contains('/'));
    let scp = url.strip_prefix("git@").is_some_and(|r| {
        r.split_once(':')
            .is_some_and(|(h, p)| !h.is_empty() && !p.is_empty())
    });
    if clean && (https || scp) {
        Ok(url)
    } else {
        Err(
            "bad remote address: use https://host/owner/repo.git, with no user name or password"
                .into(),
        )
    }
}

/// Points `origin` at an address, or creates it.
pub fn remote_set(s: &AppState, url: &str, click: bool) -> Res<Origin> {
    need_click(s, click)?;
    let url = check_address(url)?;
    Repo::open(&root(s)?)
        .map_err(err)?
        .set_remote(ORIGIN, url)
        .map_err(err)?;
    describe(s, ORIGIN.into(), url)
}

/// The address that git clones: GitHub and GitLab add `.git` to the web page.
fn clone_url(kind: ConnectionKind, web: &str) -> String {
    match kind {
        ConnectionKind::AzureDevOps => web.to_string(),
        _ => format!("{}.git", web.trim_end_matches('/').trim_end_matches(".git")),
    }
}

/// Creates a private repository on a forge connection, sets `origin` to it and pushes the working
/// branch. A project that has a remote is refused: change it with [`remote_set`]. When the push
/// fails, the repository and `origin` exist: a plain push finishes the job.
pub fn publish(s: &AppState, connection: &str, slug: &str, click: bool) -> Res<Origin> {
    need_click(s, click)?;
    let path = root(s)?;
    let r = Repo::open(&path).map_err(err)?;
    if r.remote().map_err(err)?.is_some() {
        return Err("the project already has a remote: change it instead".into());
    }
    r.head_sha()
        .map_err(|_| "make a first commit before you publish the project".to_string())?;
    let kind = s
        .connections
        .get(connection)?
        .ok_or_else(|| format!("unknown connection: {connection}"))?
        .kind;
    let made = s
        .connections
        .pull_api(connection)?
        .create_repo(slug.trim())
        .map_err(err)?;
    let url = clone_url(kind, &made.url);
    r.set_remote(ORIGIN, &url).map_err(err)?;
    let auth = s.connections.git_auth(&url)?;
    r.push(ORIGIN, &auth).map_err(|e| {
        format!(
            "the repository {} exists and origin is set, but the push failed: {e}",
            made.slug
        )
    })?;
    link_forge(s, &path, connection);
    describe(s, ORIGIN.into(), &url)
}

/// The project names the forge connection, unless it names one. A failed link never hides the
/// publish that went through.
fn link_forge(s: &AppState, root: &Path, connection: &str) {
    use shipyard_store::project::{FileRead, read_project_file};
    let Ok(FileRead::Valid(mut file)) = read_project_file(root) else {
        return;
    };
    let conns = file.connections.get_or_insert_with(Default::default);
    if conns.forge.is_none() {
        conns.forge = Some(connection.into());
        let _ = crate::commands::projects::save_file(s, file);
    }
}

#[tauri::command]
#[specta::specta]
pub async fn code_origin(app: AppHandle) -> Api<Option<Origin>> {
    blocking(app, origin).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_remote_set(app: AppHandle, url: String, click: bool) -> Api<Origin> {
    blocking(app, move |s| remote_set(s, &url, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn code_publish(
    app: AppHandle,
    connection: String,
    slug: String,
    click: bool,
) -> Api<Origin> {
    blocking(app, move |s| publish(s, &connection, &slug, click)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::projects::create;

    fn project() -> (tempfile::TempDir, AppState) {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        create(&s, dir.path().join("p").to_str().unwrap(), "P", "PRJ").unwrap();
        (dir, s)
    }

    #[test]
    fn only_a_plain_address_is_accepted() {
        for ok in ["https://github.com/a/b.git", "git@github.com:a/b.git"] {
            assert!(check_address(ok).is_ok(), "{ok}");
        }
        for bad in [
            "",
            "-oProxy=x",
            "https://me:tok@github.com/a/b.git",
            "http://github.com/a/b",
            "https://github.com",
            "https://github.com/a b",
            "/local/path",
        ] {
            assert!(check_address(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn the_clone_address_adds_git_except_on_azure() {
        assert_eq!(
            clone_url(ConnectionKind::GitHub, "https://github.com/a/b"),
            "https://github.com/a/b.git"
        );
        assert_eq!(
            clone_url(
                ConnectionKind::AzureDevOps,
                "https://dev.azure.com/o/p/_git/r"
            ),
            "https://dev.azure.com/o/p/_git/r"
        );
    }

    #[test]
    fn a_local_project_has_no_origin_until_it_is_set_with_a_click() {
        let (_d, s) = project();
        assert_eq!(origin(&s).unwrap(), None);
        assert!(
            remote_set(&s, "https://github.com/a/b.git", false)
                .unwrap_err()
                .contains("click")
        );
        let o = remote_set(&s, "https://github.com/a/b.git", true).unwrap();
        assert_eq!(o.slug.as_deref(), Some("a/b"));
        assert_eq!(o.web_url.as_deref(), Some("https://github.com/a/b"));
        let o = remote_set(&s, "git@gitlab.com:c/d.git", true).unwrap();
        assert_eq!(origin(&s).unwrap().unwrap().url, o.url);
        assert_eq!(o.slug.as_deref(), Some("c/d"));
    }

    #[test]
    fn publish_needs_a_click_no_remote_and_a_first_commit() {
        let (_d, s) = project();
        assert!(
            publish(&s, "gh", "a/b", false)
                .unwrap_err()
                .contains("click")
        );
        let e = publish(&s, "gh", "a/b", true).unwrap_err();
        assert!(e.contains("first commit"), "{e}");
        remote_set(&s, "https://github.com/a/b.git", true).unwrap();
        let e = publish(&s, "gh", "a/b", true).unwrap_err();
        assert!(e.contains("already has a remote"), "{e}");
    }
}
