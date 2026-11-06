//! Ask to join (`team-rights` REQ-011, Q-149): an unknown person adds a member entry with the
//! role `viewer` to the team file on a new branch, and opens a pull request for an admin.
//!
//! The write needs no right of the team file: it changes the default branch only through a
//! reviewed pull request. It needs a click. The working copy, the index and HEAD stay as they are.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use shipyard_core::rights::Role;
use shipyard_core::work::{Member, Team};
use shipyard_forges::NewPull;
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

/// Ask to join the team of the open project (REQ-011).
#[tauri::command]
#[specta::specta]
pub async fn work_team_join(app: AppHandle, ask: JoinAsk, click: bool) -> Api<JoinSent> {
    blocking(app, move |s| team_join(s, ask, click)).await
}

#[cfg(test)]
mod tests;
