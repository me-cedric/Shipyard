//! The logins of the `gh` and `glab` command line tools on this machine. A person picks a login:
//! the app reads the token from the tool, saves it in the keychain and tests it. The token never
//! reaches the screen, a log or an error text. A token that the forge refuses leaves no connection.

use std::process::{Command, Stdio};

use serde::Serialize;
use shipyard_agents::which::{quiet, search_dirs, which};
use shipyard_git::auth::https_host;
use shipyard_http::TestOutcome;
use shipyard_secrets::Secret;
use specta::Type;
use tauri::AppHandle;

use super::{Api, AppState, Res, blocking};
use crate::connections::{
    Connection, ConnectionDraft, ConnectionGroup, ConnectionKind, ConnectionState,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct CliLogin {
    /// `gh` or `glab`.
    pub tool: String,
    pub host: String,
    pub user: String,
}

/// The logins that the output of `<tool> auth status` lists. It reads the two forms of the line:
/// `Logged in to HOST account USER` and `Logged in to HOST as USER`.
pub fn parse_status(tool: &str, text: &str) -> Vec<CliLogin> {
    text.lines()
        .filter_map(|line| {
            let rest = line.split_once("Logged in to ")?.1;
            let mut words = rest.split_whitespace();
            let host = words.next()?;
            let user = match words.next()? {
                "account" | "as" => words.next()?,
                _ => return None,
            };
            Some(CliLogin {
                tool: tool.into(),
                host: host.into(),
                user: user
                    .trim_matches(|c: char| !c.is_alphanumeric() && !"-_.".contains(c))
                    .into(),
            })
        })
        .collect()
}

/// A host name only: letters, digits, `.`, `-` and `:`. It never starts with `-`, so it cannot
/// pass for an option of the tool.
fn valid_host(h: &str) -> bool {
    !h.is_empty()
        && !h.starts_with('-')
        && h.chars()
            .all(|c| c.is_ascii_alphanumeric() || ".-:".contains(c))
}

/// Runs `tool args` and returns its output (the error stream too). `None` when the tool is not
/// installed, does not run or fails.
type Runner<'a> = &'a dyn Fn(&str, &[&str]) -> Option<String>;

/// `glab auth status` exits non-zero when one host fails, yet it still lists the other hosts. Its
/// text is read whatever the exit code. Any other call (a token) must succeed.
fn accept(args: &[&str], success: bool) -> bool {
    success || args == ["auth", "status"]
}

fn run_tool(tool: &str, args: &[&str]) -> Option<String> {
    let path = which(tool, &search_dirs())?;
    let mut cmd = Command::new(path);
    quiet(&mut cmd).args(args).stdin(Stdio::null());
    let out = cmd.output().ok()?;
    let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    accept(args, out.status.success()).then_some(text)
}

pub fn detect_with(run: Runner) -> Vec<CliLogin> {
    ["gh", "glab"]
        .into_iter()
        .filter_map(|tool| Some(parse_status(tool, &run(tool, &["auth", "status"])?)))
        .flatten()
        .collect()
}

/// The logins of the tools that are installed and signed in.
pub fn detect() -> Vec<CliLogin> {
    detect_with(&run_tool)
}

/// Makes a forge connection from a login of the tool. The caller passes the click of a person.
pub fn use_login_with(
    s: &AppState,
    run: Runner,
    tool: &str,
    host: &str,
    click: bool,
) -> Res<Connection> {
    crate::rights::need_click_local(s, click)?;
    let kind = match tool {
        "gh" => ConnectionKind::GitHub,
        "glab" => ConnectionKind::GitLab,
        _ => return Err(format!("unknown tool: {tool}")),
    };
    if !valid_host(host) {
        return Err(format!("not a host name: {host}"));
    }
    let args: &[&str] = if tool == "gh" {
        &["auth", "token", "--hostname", host]
    } else {
        &["config", "get", "token", "--host", host]
    };
    let token = run(tool, args)
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .ok_or_else(|| format!("{tool} gave no token for {host}"))?;
    // A code host connection of this product and host is repaired, not doubled.
    let known = s.connections.list()?.into_iter().find(|c| {
        c.group == ConnectionGroup::Forge
            && c.kind == kind
            && https_host(&c.url).is_some_and(|h| h.eq_ignore_ascii_case(host))
    });
    let reused = known.is_some();
    let c = match known {
        Some(c) => c,
        None => s.connections.add(ConnectionDraft {
            name: format!("{host} ({tool})"),
            group: ConnectionGroup::Forge,
            kind,
            url: format!("https://{host}"),
            user: None,
        })?,
    };
    let done = s
        .connections
        .set_secret(&c.id, Secret::new(token))
        .and_then(|_| s.connections.test(&c.id));
    match done {
        Ok(TestOutcome::Passed { .. }) => {
            let _ = super::connections::passed(s, &c.id, true);
            // The sign-in is a save of a connection: it links the project.
            let _ = super::setup::auto_link(s);
            s.connections.get(&c.id)?.ok_or("connection lost".into())
        }
        other => {
            if !reused {
                let _ = s.connections.remove(&c.id);
            }
            Err(match other {
                Ok(TestOutcome::Failed { reason }) => {
                    format!("{host} refused the token of {tool}: {reason}")
                }
                Ok(_) => format!("{host} did not confirm the token of {tool}"),
                Err(e) => e,
            })
        }
    }
}

/// The issue tracker and the code host of the active project when its `origin` is on GitHub or a
/// GitLab host, from what works: a connection that tests ok first, then the login of `gh` or `glab`
/// (its token is read from the tool now). One source asks nothing. Both roles share it. It runs once
/// per project open: a source that fails is not tried again.
pub fn auto_connect_with(s: &AppState, run: Runner) -> Res<()> {
    let Some(sug) = super::setup::suggest(s)? else {
        return Ok(());
    };
    let (Some(kind @ (ConnectionKind::GitHub | ConnectionKind::GitLab)), Some(host)) =
        (sug.kind, https_host(&sug.url))
    else {
        return Ok(());
    };
    let mine = || -> Res<Vec<Connection>> {
        Ok(s.connections
            .list()?
            .into_iter()
            .filter(|c| c.kind == kind && https_host(&c.url).as_deref() == Some(host.as_str()))
            .collect())
    };
    let works = |all: &[Connection], g| {
        all.iter()
            .any(|c| c.group == g && c.state == ConnectionState::Passed)
    };
    let done = |all: &[Connection]| {
        works(all, ConnectionGroup::Tracker) && works(all, ConnectionGroup::Forge)
    };
    if done(&mine()?) {
        return Ok(());
    }
    // A saved secret that was never tested, or that failed, may work now: test it first.
    for c in mine()?
        .iter()
        .filter(|c| c.secret && c.state != ConnectionState::Passed)
    {
        let _ = s.connections.test(&c.id);
    }
    // A working source serves the other role: it is made, or it replaces a rejected one.
    for c in mine()?
        .iter()
        .filter(|c| c.state == ConnectionState::Passed)
    {
        let _ = super::connections::passed(s, &c.id, true);
    }
    if done(&mine()?) {
        return super::setup::auto_link(s);
    }
    let tool = if kind == ConnectionKind::GitHub {
        "gh"
    } else {
        "glab"
    };
    let signed_in = run(tool, &["auth", "status"]).is_some_and(|t| {
        parse_status(tool, &t)
            .iter()
            .any(|l| l.host.eq_ignore_ascii_case(&host))
    });
    if signed_in {
        use_login_with(s, run, tool, &host, true)?;
    }
    super::setup::auto_link(s)
}

/// On a project open. Not in tests: they must not read the `gh` login of the machine.
#[cfg(not(test))]
pub fn auto_connect(s: &AppState) {
    let _ = auto_connect_with(s, &run_tool);
}

#[tauri::command]
#[specta::specta]
pub async fn connections_detect(app: AppHandle) -> Api<Vec<CliLogin>> {
    blocking(app, |_| Ok(detect())).await
}

#[tauri::command]
#[specta::specta]
pub async fn connections_use_login(
    app: AppHandle,
    tool: String,
    host: String,
    click: bool,
) -> Api<Connection> {
    blocking(app, move |s| {
        use_login_with(s, &run_tool, &tool, &host, click)
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use shipyard_http::fake::FakeHttp;
    use shipyard_secrets::{MemoryStore, SecretStore};
    use shipyard_store::project::{FileRead, read_project_file};

    use super::*;
    use crate::connections::Connections;

    const GH: &str = "github.com\n  ✓ Logged in to github.com account ana-dev (keyring)\n  - Active account: true\n";
    const GLAB: &str =
        "gitlab.example.com\n  ✓ Logged in to gitlab.example.com as bob (/home/b/config.yml)\n";

    #[test]
    fn both_forms_of_the_status_line_give_a_login() {
        let gh = parse_status("gh", GH);
        assert_eq!(
            gh,
            [CliLogin {
                tool: "gh".into(),
                host: "github.com".into(),
                user: "ana-dev".into()
            }]
        );
        let glab = parse_status("glab", GLAB);
        assert_eq!(glab[0].host, "gitlab.example.com");
        assert_eq!(glab[0].user, "bob");
        assert!(parse_status("gh", "You are not logged in").is_empty());
    }

    #[test]
    fn one_broken_host_does_not_hide_the_others() {
        let text = "gitlab.bad.example\n  x gitlab.bad.example: API call failed: 401\ngitlab.com\n  ✓ Logged in to gitlab.com as cy (/home/c/config.yml)\n";
        let got = parse_status("glab", text);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].host, "gitlab.com");
        // A non-zero exit of the status call keeps its text. A token call must succeed.
        assert!(accept(&["auth", "status"], false));
        assert!(!accept(&["config", "get", "token", "--host", "h"], false));
    }

    #[test]
    fn a_tool_that_is_missing_gives_no_login() {
        assert!(detect_with(&|_, _| None).is_empty());
        let got = detect_with(&|t, a| {
            assert_eq!(a, ["auth", "status"]);
            (t == "gh").then(|| GH.to_string())
        });
        assert_eq!(got.len(), 1);
    }

    fn state(dir: &std::path::Path, http: FakeHttp) -> AppState {
        let conns = Arc::new(Connections::new(
            dir,
            Arc::new(MemoryStore::default()),
            Arc::new(http),
        ));
        AppState::with_connections(dir.join("data"), conns)
    }

    #[test]
    fn a_login_becomes_a_connection_only_when_the_forge_accepts_its_token() {
        let tool = |_: &str, _: &[&str]| Some("tok-login-secret\n".to_string());
        let dir = tempfile::tempdir().unwrap();
        let denied = FakeHttp::new();
        denied.get("/user", 401, "{}");
        let s = state(dir.path(), denied);
        assert!(use_login_with(&s, &tool, "gh", "github.com", false).is_err());
        assert!(use_login_with(&s, &tool, "gh", "--evil", true).is_err());
        assert!(use_login_with(&s, &tool, "git", "github.com", true).is_err());
        assert!(use_login_with(&s, &|_, _| None, "gh", "github.com", true).is_err());

        // The forge refuses the token: no connection stays, and the token is not in the error.
        let e = use_login_with(&s, &tool, "gh", "github.com", true).unwrap_err();
        assert!(!e.contains("tok-login-secret"), "{e}");
        assert!(s.connections.list().unwrap().is_empty());

        let dir2 = tempfile::tempdir().unwrap();
        let ok = FakeHttp::new();
        ok.get("/user", 200, r#"{"login":"ana-dev"}"#)
            .get("/user/repos", 200, "[]")
            .get("/issues", 200, "[]");
        let s = state(dir2.path(), ok);
        let c = use_login_with(&s, &tool, "gh", "github.com", true).unwrap();
        assert_eq!(c.name, "github.com (gh)");
        assert!(c.secret);
        // The same login serves the issue tracker role of the host too.
        let list = s.connections.list().unwrap();
        assert!(
            list.iter()
                .any(|t| t.group == ConnectionGroup::Tracker && t.secret)
        );
    }

    /// The `origin` of a new project is on github.com.
    fn project_on_github(s: &AppState, dir: &std::path::Path) {
        let root = dir.join("p");
        super::super::projects::create(s, root.to_str().unwrap(), "P", "PRJ").unwrap();
        let ok = std::process::Command::new("git")
            .args(["remote", "add", "origin", "git@github.com:acme/app.git"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success();
        assert!(ok);
    }

    fn gh(t: &str, a: &[&str]) -> Option<String> {
        assert_eq!(t, "gh");
        Some(if a[0] == "auth" && a[1] == "status" {
            GH.to_string()
        } else {
            "tok-cli\n".to_string()
        })
    }

    #[test]
    fn a_gh_login_makes_both_roles_once_and_links_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let ok = FakeHttp::new();
        ok.get("/user", 200, r#"{"login":"ana-dev"}"#)
            .get("/user/repos", 200, "[]")
            .get("/issues", 200, "[]");
        let s = state(dir.path(), ok);
        project_on_github(&s, dir.path());
        auto_connect_with(&s, &gh).unwrap();
        let list = s.connections.list().unwrap();
        assert_eq!(list.len(), 2);
        assert!(
            list.iter()
                .all(|c| c.secret && c.state == ConnectionState::Passed)
        );
        let FileRead::Valid(f) = read_project_file(&dir.path().join("p")).unwrap() else {
            panic!("a valid file")
        };
        let links = f.connections.unwrap();
        assert!(links.tracker.is_some() && links.forge.is_some());
        // A second open adds nothing and does not ask the tool for a token again.
        auto_connect_with(&s, &|_, _| panic!("no call on a second open")).unwrap();
        assert_eq!(s.connections.list().unwrap().len(), 2);
    }

    /// A GitHub that refuses the token `tok-rejected`.
    struct Picky(FakeHttp);

    impl shipyard_http::Http for Picky {
        fn send(
            &self,
            r: &shipyard_http::Request,
        ) -> Result<shipyard_http::Response, shipyard_http::Error> {
            let res = self.0.send(r)?;
            Ok(match &r.auth {
                shipyard_http::Auth::Bearer(t) if t.expose() == "tok-rejected" => {
                    shipyard_http::Response { status: 401, ..res }
                }
                _ => res,
            })
        }
    }

    #[test]
    fn a_login_replaces_the_rejected_token_of_the_issue_tracker() {
        let dir = tempfile::tempdir().unwrap();
        let http = FakeHttp::new();
        http.get("/user", 200, r#"{"login":"ana-dev"}"#)
            .get("/user/repos", 200, "[]")
            .get("/issues", 200, "[]");
        let store = Arc::new(MemoryStore::default());
        let conns = Arc::new(Connections::new(
            dir.path(),
            store.clone(),
            Arc::new(Picky(http)),
        ));
        let s = AppState::with_connections(dir.path().join("data"), conns);
        project_on_github(&s, dir.path());
        let old = s
            .connections
            .add(ConnectionDraft {
                name: "GitHub".into(),
                group: ConnectionGroup::Tracker,
                kind: ConnectionKind::GitHub,
                url: "https://github.com".into(),
                user: None,
            })
            .unwrap();
        s.connections
            .set_secret(&old.id, Secret::new("tok-rejected"))
            .unwrap();
        auto_connect_with(&s, &gh).unwrap();
        let list = s.connections.list().unwrap();
        assert_eq!(list.len(), 2);
        let tracker = list.iter().find(|c| c.id == old.id).unwrap();
        assert!(tracker.secret && tracker.state == ConnectionState::Passed);
        // The tracker reads the entry of the code host, and its own rejected entry is gone.
        assert!(
            store
                .get(&shipyard_secrets::conn_account(&old.id))
                .unwrap()
                .is_none()
        );
    }
}
