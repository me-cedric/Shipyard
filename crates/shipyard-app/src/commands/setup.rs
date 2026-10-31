//! Setup helpers for a person with little technical knowledge: a connection suggested from the git
//! remote, the containers that a tracker offers as its scope, the page where a token is made, and the
//! link of the only tracker connection to the project.

use std::path::Path;

use serde::Serialize;
use shipyard_git::Repo;
use shipyard_git::auth::https_host;
use shipyard_store::project::{FileRead, read_project_file};
use specta::Type;
use tauri::AppHandle;

use super::overview::{host_slug, open_page};
use super::{Api, AppState, Res, blocking, err};
use crate::connections::{ConnectionGroup, ConnectionKind};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSuggestion {
    /// `None` for a host that is not a known product.
    pub kind: Option<ConnectionKind>,
    pub name: String,
    pub url: String,
}

/// The connection that the origin remote of the project suggests.
pub fn suggestion(remote: &str) -> Option<ConnectionSuggestion> {
    let (host, slug) = host_slug(remote)?;
    let host = host.split(':').next().unwrap_or_default().to_string();
    let azure = host.ends_with("dev.azure.com") || host.ends_with("visualstudio.com");
    let kind = if azure {
        Some(ConnectionKind::AzureDevOps)
    } else if host.contains("gitlab") {
        Some(ConnectionKind::GitLab)
    } else if host.contains("github") {
        Some(ConnectionKind::GitHub)
    } else {
        None
    };
    let mut parts = slug.split('/');
    let org = match parts.next() {
        Some("v3") => parts.next(),
        first => first,
    };
    let (name, url) = match (kind, org) {
        (Some(ConnectionKind::AzureDevOps), Some(org)) => (
            "Azure DevOps".into(),
            format!("https://dev.azure.com/{org}"),
        ),
        (Some(ConnectionKind::GitHub), _) if host == "github.com" => {
            ("GitHub".into(), "https://github.com".into())
        }
        (Some(ConnectionKind::GitLab), _) if host == "gitlab.com" => {
            ("GitLab".into(), "https://gitlab.com".into())
        }
        _ => (host.clone(), format!("https://{host}")),
    };
    Some(ConnectionSuggestion { kind, name, url })
}

pub fn suggest(s: &AppState) -> Res<Option<ConnectionSuggestion>> {
    let Some(e) = s.registry()?.active().cloned() else {
        return Ok(None);
    };
    Ok(Repo::open(Path::new(&e.path))
        .ok()
        .and_then(|r| r.remote().ok().flatten())
        .and_then(|(_, url)| suggestion(&url)))
}

/// The page of the product where a person makes a token. `url` is the address of the connection.
pub fn token_page(kind: ConnectionKind, url: &str) -> Res<String> {
    let host = || https_host(url).ok_or_else(|| "bad address: use an https address".to_string());
    Ok(match kind {
        ConnectionKind::GitHub => format!("https://{}/settings/tokens", host()?),
        ConnectionKind::GitLab => {
            format!("https://{}/-/user_settings/personal_access_tokens", host()?)
        }
        ConnectionKind::AzureDevOps => {
            format!("https://{}/_usersSettings/tokens", url_path(url)?)
        }
        ConnectionKind::JiraCloud => {
            "https://id.atlassian.com/manage-profile/security/api-tokens".into()
        }
        ConnectionKind::JiraDataCenter => format!("https://{}/secure/ViewProfile.jspa", host()?),
        ConnectionKind::Linear => "https://linear.app/settings/account/security".into(),
    })
}

/// `host/path` of an `https` address, without a trailing slash.
fn url_path(url: &str) -> Res<String> {
    url.trim()
        .strip_prefix("https://")
        .map(|r| r.trim_end_matches('/').to_string())
        .ok_or_else(|| "bad address: use an https address".to_string())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ScopeChoice {
    pub id: String,
    pub name: String,
}

/// The containers of a tracker connection, from its API. Empty when the API lists none: the view
/// keeps a free text field then.
pub fn scopes(s: &AppState, id: &str) -> Res<Vec<ScopeChoice>> {
    Ok(s.connections
        .tracker(id)?
        .scopes()
        .map_err(err)?
        .into_iter()
        .map(|c| ScopeChoice {
            id: c.id,
            name: c.name,
        })
        .collect())
}

/// The only tracker connection becomes the tracker of the active project when the project names
/// none. The code host connection that matches the host of the `origin` remote becomes its code
/// host the same way (the only one, when the project has no remote). Two candidates are a choice of
/// the person, so nothing is linked then.
pub fn auto_link(s: &AppState) -> Res<()> {
    let Some(e) = s.registry()?.active().cloned() else {
        return Ok(());
    };
    let FileRead::Valid(mut file) = read_project_file(Path::new(&e.path)).map_err(err)? else {
        return Ok(());
    };
    let all = s.connections.list()?;
    let group = |g| all.iter().filter(move |c| c.group == g).collect::<Vec<_>>();
    let have = file.connections.get_or_insert_with(Default::default);
    let mut changed = false;
    if have.tracker.is_none()
        && let [only] = group(ConnectionGroup::Tracker).as_slice()
    {
        have.tracker = Some(only.id.clone());
        changed = true;
    }
    if have.forge.is_none() {
        let origin = Repo::open(Path::new(&e.path))
            .ok()
            .and_then(|r| r.remote().ok().flatten())
            .and_then(|(_, url)| host_slug(&url))
            .map(|(host, _)| host.split(':').next().unwrap_or_default().to_string());
        let hosts: Vec<_> = group(ConnectionGroup::Forge)
            .into_iter()
            .filter(|c| {
                origin.as_deref().is_none_or(|o| {
                    https_host(&c.url).is_some_and(|h| h.split(':').next() == Some(o))
                })
            })
            .collect();
        if let [only] = hosts.as_slice() {
            have.forge = Some(only.id.clone());
            changed = true;
        }
    }
    if !changed {
        return Ok(());
    }
    super::projects::save_file(s, file)
}

#[tauri::command]
#[specta::specta]
pub async fn connections_suggest(app: AppHandle) -> Api<Option<ConnectionSuggestion>> {
    blocking(app, suggest).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_scopes(app: AppHandle, id: String) -> Api<Vec<ScopeChoice>> {
    blocking(app, move |s| scopes(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_open_token_page(
    app: AppHandle,
    kind: ConnectionKind,
    url: String,
) -> Api<()> {
    blocking(app, move |_| open_page(&token_page(kind, &url)?)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_remote_suggests_the_product_the_name_and_the_address() {
        let s = |r| suggestion(r).unwrap();
        let g = s("git@github.com:acme/app.git");
        assert_eq!(
            (g.kind, g.name.as_str(), g.url.as_str()),
            (Some(ConnectionKind::GitHub), "GitHub", "https://github.com")
        );
        let z = s("git@ssh.dev.azure.com:v3/acme/web/app");
        assert_eq!(z.url, "https://dev.azure.com/acme");
        let l = s("https://git.corp.example/team/app.git");
        assert_eq!((l.kind, l.url.as_str()), (None, "https://git.corp.example"));
        let h = s("https://gitlab.corp.example/team/app.git");
        assert_eq!(h.kind, Some(ConnectionKind::GitLab));
        assert_eq!(h.name, "gitlab.corp.example");
        assert!(suggestion("/local/path").is_none());
    }

    #[test]
    fn the_only_tracker_connection_links_itself_and_two_leave_the_choice() {
        use crate::commands::projects::create;
        use crate::connections::ConnectionDraft;
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let root = dir.path().join("p");
        create(&s, root.to_str().unwrap(), "P", "PRJ").unwrap();
        let tracker = |name: &str| ConnectionDraft {
            name: name.into(),
            group: ConnectionGroup::Tracker,
            kind: ConnectionKind::GitHub,
            url: "https://github.com".into(),
            user: None,
        };
        let linked = |root: &Path| match read_project_file(root).unwrap() {
            FileRead::Valid(f) => f.connections.and_then(|c| c.tracker),
            _ => panic!("a valid file"),
        };
        let one = s.connections.add(tracker("One")).unwrap();
        auto_link(&s).unwrap();
        assert_eq!(linked(&root), Some(one.id));
        // A second tracker connection is the choice of the person.
        let mut file = match read_project_file(&root).unwrap() {
            FileRead::Valid(f) => f,
            _ => panic!("a valid file"),
        };
        file.connections = None;
        super::super::projects::save_file(&s, file).unwrap();
        s.connections.add(tracker("Two")).unwrap();
        auto_link(&s).unwrap();
        assert_eq!(linked(&root), None);
    }

    #[test]
    fn the_code_host_of_the_origin_host_links_itself_and_two_on_a_host_leave_the_choice() {
        use crate::commands::projects::create;
        use crate::connections::ConnectionDraft;
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let root = dir.path().join("p");
        create(&s, root.to_str().unwrap(), "P", "PRJ").unwrap();
        let host = |name: &str, url: &str| ConnectionDraft {
            name: name.into(),
            group: ConnectionGroup::Forge,
            kind: ConnectionKind::GitHub,
            url: url.into(),
            user: None,
        };
        let linked = || match read_project_file(&root).unwrap() {
            FileRead::Valid(f) => f.connections.and_then(|c| c.forge),
            _ => panic!("a valid file"),
        };
        let unlink = || {
            let FileRead::Valid(mut f) = read_project_file(&root).unwrap() else {
                panic!("a valid file")
            };
            f.connections = None;
            super::super::projects::save_file(&s, f).unwrap();
        };
        // The only code host of the machine links, when the project has no remote.
        let other = s
            .connections
            .add(host("Other", "https://gitlab.com"))
            .unwrap();
        auto_link(&s).unwrap();
        assert_eq!(linked(), Some(other.id));
        unlink();
        // With an origin remote, only the host that matches links: the other one stays out.
        let ok = std::process::Command::new("git")
            .args(["remote", "add", "origin", "git@github.com:acme/app.git"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success();
        assert!(ok);
        auto_link(&s).unwrap();
        assert_eq!(linked(), None);
        let hub = s
            .connections
            .add(host("Hub", "https://github.com"))
            .unwrap();
        auto_link(&s).unwrap();
        assert_eq!(linked(), Some(hub.id));
        // Two code hosts on the origin host are the choice of the person.
        unlink();
        s.connections
            .add(host("Hub two", "https://GitHub.com/"))
            .unwrap();
        auto_link(&s).unwrap();
        assert_eq!(linked(), None);
    }

    #[test]
    fn the_token_page_follows_the_address_and_only_https_opens() {
        let page = |k, u| token_page(k, u).unwrap();
        assert_eq!(
            page(ConnectionKind::GitLab, "https://git.example.com"),
            "https://git.example.com/-/user_settings/personal_access_tokens"
        );
        assert_eq!(
            page(ConnectionKind::AzureDevOps, "https://dev.azure.com/acme/"),
            "https://dev.azure.com/acme/_usersSettings/tokens"
        );
        assert!(token_page(ConnectionKind::GitHub, "http://github.com").is_err());
        assert!(open_page("file:///etc/passwd").is_err());
        // No character that a Windows shell reads gets to a command line.
        for bad in [
            "https://dev.azure.com/acme&calc&",
            "https://a.example/x|calc",
            "https://a.example/x^y",
            "https://a.example/x y",
            "https://a.example/\"x",
            "https:///path",
        ] {
            assert!(open_page(bad).is_err(), "{bad}");
        }
    }
}
