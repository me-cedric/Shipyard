//! Ask to join (`team-rights` REQ-011, Q-149): an unknown person adds a member entry with the
//! role `viewer` to the team file on a new branch, and opens a pull request for an admin.
//!
//! The write needs no right of the team file: it changes the default branch only through a
//! reviewed pull request. It needs a click. The working copy, the index and HEAD stay as they are.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use shipyard_core::rights::Role;
use shipyard_core::work::{Member, Team};
use shipyard_forges::{NewPull, PullQuery, StateFilter};
use shipyard_git::Repo;
use shipyard_store::work::{TEAM_PATH, read_team, write_team};
use specta::Type;
use tauri::AppHandle;

use crate::commands::sync::active;
use crate::commands::{Api, AppState, Res, blocking, err};
use crate::connections::slug_text;
use crate::rights::Right;

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinAsk {
    pub name: String,
    pub emails: Vec<String>,
    /// More accounts. The logins of the signed-in connections of the project are added.
    pub accounts: Vec<String>,
    /// The role that the person asks for. The entry gets `viewer`: the pull request names this
    /// role, and an admin sets it.
    pub role: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinSent {
    /// The branch that holds the entry: `shipyard/join-<handle>`.
    pub branch: String,
    /// The pull request. `None`: no code host connection, the branch is local only.
    pub url: Option<String>,
    /// The command that sends the branch, when no pull request opened.
    pub push: Option<String>,
    /// The member entry as YAML, for the person to send to an admin.
    pub entry: String,
}

fn valid_email(e: &str) -> bool {
    e.len() <= 120 && e.contains('@') && !e.contains(char::is_whitespace)
}

/// Write the join request. See the module text.
pub fn team_join(s: &AppState, ask: JoinAsk, click: bool) -> Res<JoinSent> {
    if !click {
        return Err("this change needs the click of a person".into());
    }
    let name = ask.name.trim();
    if name.is_empty() || name.len() > 120 {
        return Err("give your name (120 characters or fewer)".into());
    }
    let emails: Vec<String> = ask
        .emails
        .iter()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty())
        .collect();
    if let Some(bad) = emails.iter().find(|e| !valid_email(e)) {
        return Err(format!("not an e-mail: {bad}"));
    }
    let role = Role::parse(&ask.role).ok_or_else(|| format!("unknown role `{}`", ask.role))?;
    if crate::rights::current(s)?.person.member.is_some() {
        return Err("you are in the team file already".into());
    }
    let a = active(s)?.ok_or("no active project")?;
    let repo = Repo::open(&PathBuf::from(&a.entry.path)).map_err(err)?;
    let remote = repo.remote().map_err(err)?;
    // `origin/main`: the team file that gives the rights (REQ-002). No remote: the head.
    let base = remote.as_ref().and_then(|(n, _)| repo.default_branch(n));
    let rev = base.clone().unwrap_or_else(|| "HEAD".into());
    let mut team = match repo.text_at(&rev, TEAM_PATH).map_err(err)? {
        Some(t) => read_team(&t, None).map_err(err)?,
        None => Team::default(),
    };
    if team.locked {
        return Err("the team file is sealed: send your entry to an admin".into());
    }
    let mut accounts: Vec<String> = [a.tracker.as_deref(), a.forge.as_deref()]
        .into_iter()
        .flatten()
        .filter_map(|id| s.connections.get(id).ok().flatten()?.user)
        .chain(ask.accounts.iter().map(|x| x.trim().to_string()))
        // A login of digits only is a numeric id that an old test saved: it names nobody.
        .filter(|x| !x.is_empty() && x.len() <= 120 && !x.bytes().all(|b| b.is_ascii_digit()))
        .collect();
    accounts.sort();
    accounts.dedup();
    let base_handle = accounts
        .iter()
        .chain(&emails)
        .map(|x| slug_text(x.split('@').next().unwrap_or(x)))
        .chain([slug_text(name)])
        .find(|h| !h.is_empty())
        .ok_or("give a name with a letter or a digit")?;
    let mut handle = base_handle.clone();
    for n in 2.. {
        if team.resolve(&handle).is_none() {
            break;
        }
        handle = format!("{base_handle}-{n}");
    }
    let member = Member {
        name: name.into(),
        handle: handle.clone(),
        trackers: accounts,
        emails,
        role: Role::Viewer.as_str().into(),
        capacity: 5.0,
        ..Member::default()
    };
    let entry = write_team(
        &Team {
            members: vec![member.clone()],
            ..Team::default()
        },
        None,
    )
    .map_err(err)?;
    team.members.push(member);
    let text = write_team(&team, None).map_err(err)?;
    let branch = format!("shipyard/join-{handle}");
    let asked = role.as_str();
    repo.commit_file_to_branch(
        &rev,
        &branch,
        TEAM_PATH,
        &text,
        &format!("chore(team): ask to join as {handle}"),
        &format!("Asked role: {asked}"),
    )
    .map_err(err)?;
    crate::rights::note(s, Right::ProjectSettings, "team_join", &branch)?;
    let target = base
        .as_deref()
        .and_then(|b| b.split_once('/'))
        .map(|(_, b)| b.to_string());
    let forge = crate::code::forge(s).ok();
    let (Some((api, slug, _)), Some((remote, url)), Some(target)) = (forge, remote.clone(), target)
    else {
        let push = remote.map(|(r, _)| format!("git push {r} {branch}"));
        return Ok(JoinSent {
            branch,
            url: None,
            push,
            entry,
        });
    };
    let auth = s.connections.git_auth(&url)?;
    repo.push_branch(&remote, &branch, &auth).map_err(err)?;
    let made = api
        .create_pull(
            &slug,
            &NewPull {
                title: format!("Add {name} to the team"),
                body: format!(
                    "{name} asks to join the team.\n\nAsked role: `{asked}`. The entry gives \
                     `viewer`: set the role before the merge."
                ),
                source: branch.clone(),
                target,
                draft: false,
            },
        )
        .map_err(err)?;
    Ok(JoinSent {
        branch,
        url: Some(made.url),
        push: None,
        entry,
    })
}

/// The start of the branch that [`team_join`] makes: the pull requests of a join request.
const JOIN_BRANCH: &str = "shipyard/join-";

/// One join request that waits on the code host (REQ-010 of `code-host-tickets`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinRequest {
    pub number: u32,
    /// The name of the person, from the title of the pull request.
    pub name: String,
    /// The handle of the new member entry: the end of the branch name.
    pub handle: String,
    /// The role that the person asked for. `viewer` when the text does not say.
    pub asked: String,
    pub url: String,
}

/// The role in the text of the pull request: ``Asked role: `qa` ``.
fn asked_role(body: &str) -> String {
    body.split("Asked role: `")
        .nth(1)
        .and_then(|r| r.split('`').next())
        .filter(|r| Role::parse(r).is_some())
        .unwrap_or("viewer")
        .to_string()
}

/// The open pull requests that ask to join the team. Nothing is written.
pub fn team_join_requests(s: &AppState) -> Res<Vec<JoinRequest>> {
    let (api, slug, _) = crate::code::forge(s)?;
    let page = api
        .list_pulls(
            &slug,
            &PullQuery {
                state: StateFilter::Open,
                limit: 100,
                ..PullQuery::default()
            },
        )
        .map_err(err)?;
    Ok(page
        .items
        .into_iter()
        .filter_map(|p| {
            let handle = p.source_branch.strip_prefix(JOIN_BRANCH)?.to_string();
            let name = p
                .title
                .strip_prefix("Add ")
                .and_then(|t| t.strip_suffix(" to the team"))
                .unwrap_or(&p.title)
                .to_string();
            let asked = api
                .description(&slug, p.number)
                .map_or_else(|_| "viewer".into(), |d| asked_role(&d));
            Some(JoinRequest {
                number: u32::try_from(p.number).ok()?,
                name,
                handle,
                asked,
                url: p.url,
            })
        })
        .collect())
}

/// Accepts a join request: adds the entry of the branch to the team file of the base with `role`
/// and no admin or extra rights, refuses any other change on the branch, pushes the branch and
/// merges the pull request. It needs the merge right, and a click.
pub fn team_join_accept(s: &AppState, number: u32, role: &str, click: bool) -> Res<()> {
    crate::work::need_click(
        s,
        click,
        Right::CodeMerge,
        "team_join_accept",
        &format!("#{number}"),
    )?;
    let role = Role::parse(role).ok_or_else(|| format!("unknown role `{role}`"))?;
    let (api, slug, _) = crate::code::forge(s)?;
    let n = u64::from(number);
    let pull = api.pull(&slug, n).map_err(err)?;
    let handle = pull
        .source_branch
        .strip_prefix(JOIN_BRANCH)
        .ok_or("this pull request is not a join request")?
        .to_string();
    let a = active(s)?.ok_or("no active project")?;
    let repo = Repo::open(&PathBuf::from(&a.entry.path)).map_err(err)?;
    let (remote, url) = repo
        .remote()
        .map_err(err)?
        .ok_or("the project has no remote")?;
    let auth = s.connections.git_auth(&url)?;
    repo.fetch(&remote, &auth).map_err(err)?;
    // The commit, not the name: a commit on a name that the remote has is refused as protected.
    let rev = repo
        .rev_sha(&format!("{remote}/{}", pull.source_branch))
        .map_err(err)?;
    // The branch belongs to the person who asks: trust nothing on it but the one new entry.
    let (base, files) = repo
        .changed_from_merge_base(&rev, &format!("{remote}/{}", pull.target_branch))
        .map_err(err)?;
    if files.iter().any(|f| f != TEAM_PATH) {
        return Err("the branch changes more than the team file".into());
    }
    let read = |at: &str| -> Res<Team> {
        read_team(
            &repo
                .text_at(at, TEAM_PATH)
                .map_err(err)?
                .ok_or("a team file is missing")?,
            None,
        )
        .map_err(err)
    };
    let theirs = read(&rev)?;
    let mut team = read(&base)?;
    let mut entry = theirs
        .members
        .iter()
        .find(|m| m.handle == handle)
        .cloned()
        .ok_or("the branch holds no entry for this person")?;
    if team.members.iter().any(|m| m.handle == handle) {
        return Err("this person is already in the team".into());
    }
    let others: Vec<_> = theirs
        .members
        .iter()
        .filter(|m| m.handle != handle)
        .collect();
    if others.len() != team.members.len() || others.iter().zip(&team.members).any(|(a, b)| *a != b)
    {
        return Err("the branch changes another member".into());
    }
    entry.role = role.as_str().into();
    entry.admin = false;
    entry.roles.clear();
    entry.rights.clear();
    team.members.push(entry);
    let text = write_team(&team, None).map_err(err)?;
    repo.commit_file_to_branch(
        &rev,
        &pull.source_branch,
        TEAM_PATH,
        &text,
        &format!("chore(team): set the role of {handle} to {}", role.as_str()),
        "",
    )
    .map_err(err)?;
    repo.push_branch(&remote, &pull.source_branch, &auth)
        .map_err(err)?;
    let method = *api
        .merge_methods()
        .first()
        .ok_or("the code host offers no merge method")?;
    api.merge(&slug, n, method).map_err(err)
}

/// Refuses a join request: the pull request closes, and the team file stays as it is.
pub fn team_join_refuse(s: &AppState, number: u32, click: bool) -> Res<()> {
    let (api, slug, _) = crate::code::forge(s)?;
    let pull = api.pull(&slug, u64::from(number)).map_err(err)?;
    if !pull.source_branch.starts_with(JOIN_BRANCH) {
        return Err("this pull request is not a join request".into());
    }
    crate::code::pull_close(s, number, "", click)
}

#[tauri::command]
#[specta::specta]
pub async fn work_team_join_requests(app: AppHandle) -> Api<Vec<JoinRequest>> {
    blocking(app, team_join_requests).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_team_join_accept(
    app: AppHandle,
    number: u32,
    role: String,
    click: bool,
) -> Api<()> {
    blocking(app, move |s| team_join_accept(s, number, &role, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_team_join_refuse(app: AppHandle, number: u32, click: bool) -> Api<()> {
    blocking(app, move |s| team_join_refuse(s, number, click)).await
}

/// Ask to join the team of the open project (REQ-011).
#[tauri::command]
#[specta::specta]
pub async fn work_team_join(app: AppHandle, ask: JoinAsk, click: bool) -> Api<JoinSent> {
    blocking(app, move |s| team_join(s, ask, click)).await
}

#[cfg(test)]
mod tests;
