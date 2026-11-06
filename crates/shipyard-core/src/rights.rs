//! Team rights (spec `team-rights`, ADR 0019): the roles and their default rights, the overrides of
//! a member, the personal narrowing and the match of the person in the team. No I/O.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::health::{Finding, Fix, Group, Severity};
use crate::work::{Member, Team};

/// The team file, as a health finding opens it.
pub const TEAM_FILE: &str = ".shipyard/team.yaml";

/// One right. Each write command and each write tool needs one (REQ-007).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type,
)]
pub enum Right {
    #[serde(rename = "work.edit")]
    WorkEdit,
    #[serde(rename = "specs.edit")]
    SpecsEdit,
    #[serde(rename = "design.edit")]
    DesignEdit,
    #[serde(rename = "knowledge.edit")]
    KnowledgeEdit,
    #[serde(rename = "code.write")]
    CodeWrite,
    #[serde(rename = "code.merge")]
    CodeMerge,
    #[serde(rename = "runs.start")]
    RunsStart,
    #[serde(rename = "runs.approve")]
    RunsApprove,
    #[serde(rename = "project.settings")]
    ProjectSettings,
    /// The one read right: amounts of money (REQ-005).
    #[serde(rename = "costs.view")]
    CostsView,
}

impl Right {
    pub const ALL: [Right; 10] = [
        Right::WorkEdit,
        Right::SpecsEdit,
        Right::DesignEdit,
        Right::KnowledgeEdit,
        Right::CodeWrite,
        Right::CodeMerge,
        Right::RunsStart,
        Right::RunsApprove,
        Right::ProjectSettings,
        Right::CostsView,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Right::WorkEdit => "work.edit",
            Right::SpecsEdit => "specs.edit",
            Right::DesignEdit => "design.edit",
            Right::KnowledgeEdit => "knowledge.edit",
            Right::CodeWrite => "code.write",
            Right::CodeMerge => "code.merge",
            Right::RunsStart => "runs.start",
            Right::RunsApprove => "runs.approve",
            Right::ProjectSettings => "project.settings",
            Right::CostsView => "costs.view",
        }
    }

    pub fn parse(text: &str) -> Option<Right> {
        Right::ALL.into_iter().find(|r| r.as_str() == text.trim())
    }
}

/// The roles of the team file (REQ-005). `admin` is a flag of the member, not a role.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type,
)]
// The views name it `TeamRole`: `Role` is the personal role of Settings / Me.
#[serde(rename = "TeamRole", rename_all = "lowercase")]
pub enum Role {
    Po,
    Pm,
    Architect,
    Techlead,
    Ba,
    Developer,
    Qa,
    Designer,
    Viewer,
}

impl Role {
    pub const ALL: [Role; 9] = [
        Role::Po,
        Role::Pm,
        Role::Architect,
        Role::Techlead,
        Role::Ba,
        Role::Developer,
        Role::Qa,
        Role::Designer,
        Role::Viewer,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Role::Po => "po",
            Role::Pm => "pm",
            Role::Architect => "architect",
            Role::Techlead => "techlead",
            Role::Ba => "ba",
            Role::Developer => "developer",
            Role::Qa => "qa",
            Role::Designer => "designer",
            Role::Viewer => "viewer",
        }
    }

    /// The role that `text` names, without case. `None` for any other text.
    pub fn parse(text: &str) -> Option<Role> {
        let t = text.trim();
        Role::ALL
            .into_iter()
            .find(|r| r.as_str().eq_ignore_ascii_case(t))
    }

    /// The default rights of the role: the table of the spec.
    pub fn defaults(self) -> &'static [Right] {
        use Right::*;
        match self {
            Role::Po => &[WorkEdit, SpecsEdit, KnowledgeEdit, CostsView],
            Role::Pm => &[WorkEdit, KnowledgeEdit, CostsView],
            Role::Architect => &[
                WorkEdit,
                SpecsEdit,
                DesignEdit,
                KnowledgeEdit,
                CodeWrite,
                CodeMerge,
                RunsStart,
                RunsApprove,
                CostsView,
            ],
            Role::Techlead => &Right::ALL,
            Role::Ba => &[WorkEdit, SpecsEdit, KnowledgeEdit, RunsStart],
            Role::Developer => &[
                WorkEdit,
                DesignEdit,
                KnowledgeEdit,
                CodeWrite,
                RunsStart,
                RunsApprove,
            ],
            Role::Qa => &[WorkEdit, SpecsEdit, KnowledgeEdit, CodeWrite, RunsStart],
            Role::Designer => &[WorkEdit, DesignEdit, KnowledgeEdit],
            Role::Viewer => &[],
        }
    }
}

/// An override of a member: `+right` adds it, `-right` removes it. `None` when it is not one.
fn override_of(text: &str) -> Option<(bool, Right)> {
    let t = text.trim();
    let (add, name) = match t.as_bytes().first()? {
        b'+' => (true, &t[1..]),
        b'-' => (false, &t[1..]),
        _ => return None,
    };
    Right::parse(name).map(|r| (add, r))
}

/// The rights of a member of the team file: each right for an admin, else the defaults of the
/// role (an unknown role is `viewer`), then the overrides. An unknown override has no effect.
pub fn member_rights(m: &Member) -> BTreeSet<Right> {
    if m.admin {
        return Right::ALL.into();
    }
    let mut set: BTreeSet<Right> = Role::parse(&m.role)
        .unwrap_or(Role::Viewer)
        .defaults()
        .iter()
        .copied()
        .collect();
    for (add, r) in m.rights.iter().filter_map(|o| override_of(o)) {
        if add {
            set.insert(r);
        } else {
            set.remove(&r);
        }
    }
    set
}

/// The rights that a personal role of this machine leaves (REQ-006). `None`: no personal role, no
/// narrowing. The roles of an older Shipyard map as the migration does (Q-145): `lead` is `po`,
/// `junior` is `developer` without `code.merge` and `runs.approve`. Another text leaves no right.
pub fn personal_rights(role: &str) -> Option<BTreeSet<Right>> {
    let role = role.trim().to_ascii_lowercase();
    let (base, minus): (Role, &[Right]) = match role.as_str() {
        "" | "none" => return None,
        "lead" => (Role::Po, &[]),
        "junior" => (Role::Developer, &[Right::CodeMerge, Right::RunsApprove]),
        other => match Role::parse(other) {
            Some(r) => (r, &[]),
            None => return Some(BTreeSet::new()),
        },
    };
    Some(
        base.defaults()
            .iter()
            .copied()
            .filter(|r| !minus.contains(r))
            .collect(),
    )
}

/// How Shipyard found the person (REQ-003, REQ-004).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Found {
    /// The team file names no admin yet: every person has every right.
    Solo,
    /// The account of a signed-in issue tracker or code host connection.
    Account,
    /// The git e-mail.
    Email,
    Unknown,
}

impl Found {
    pub fn as_str(self) -> &'static str {
        match self {
            Found::Solo => "solo",
            Found::Account => "account",
            Found::Email => "email",
            Found::Unknown => "unknown",
        }
    }
}

/// The one member that matches, `None` for none or for two.
fn one<'a>(mut hits: impl Iterator<Item = &'a Member>) -> Result<Option<&'a Member>, ()> {
    let Some(first) = hits.next() else {
        return Ok(None);
    };
    if hits.any(|m| m.handle != first.handle) {
        return Err(());
    }
    Ok(Some(first))
}

/// The member that is the person: first an account of a signed-in connection in the `trackers`
/// of a member, else the git e-mail in the `emails` (or an e-mail account) of a member (REQ-003). Two members that match
/// give an unknown person. A team with no admin (no member, or members from before rights) gives `Solo`.
pub fn identify<'a>(
    team: &'a Team,
    accounts: &[String],
    email: Option<&str>,
) -> (Option<&'a Member>, Found) {
    // Rights apply once the team names an admin: a team file from before rights (members, no
    // admin) keeps every person at every right, so no project locks itself out on an update.
    if !team.members.iter().any(|m| m.admin) {
        return (None, Found::Solo);
    }
    let same =
        |a: &String, b: &str| !b.trim().is_empty() && a.trim().eq_ignore_ascii_case(b.trim());
    let by_account = one(team.members.iter().filter(|m| {
        m.trackers
            .iter()
            .any(|t| accounts.iter().any(|a| same(t, a)))
    }));
    match by_account {
        Err(()) => return (None, Found::Unknown),
        Ok(Some(m)) => return (Some(m), Found::Account),
        Ok(None) => {}
    }
    let Some(email) = email else {
        return (None, Found::Unknown);
    };
    // An account that is an e-mail is an e-mail too: older team files keep it there.
    let mails = |m: &&Member| {
        m.emails
            .iter()
            .chain(m.trackers.iter().filter(|t| t.contains('@')))
            .any(|e| same(e, email))
    };
    match one(team.members.iter().filter(mails)) {
        Ok(Some(m)) => (Some(m), Found::Email),
        _ => (None, Found::Unknown),
    }
}

/// The person in the open project and the rights that the person has now.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename = "RightsPerson", rename_all = "camelCase")]
pub struct Person {
    /// The handle of the member. `None`: solo, or unknown.
    pub member: Option<String>,
    pub found: Found,
    /// The role of the team file. `None`: solo.
    pub role: Option<Role>,
    pub admin: bool,
    /// The read-only profile of the project is on.
    pub read_only: bool,
    /// The rights after the personal narrowing and the read-only profile, in the order of
    /// [`Right::ALL`].
    pub rights: Vec<Right>,
}

impl Person {
    pub fn has(&self, right: Right) -> bool {
        self.rights.contains(&right)
    }

    /// The text of a refusal: the missing right and the role (REQ-007). With the read-only
    /// profile on, the text says so: the error of the views opens Settings / Project.
    pub fn refusal(&self, right: Right) -> String {
        let role = match (self.role, self.admin) {
            (Some(r), false) => r.as_str(),
            _ => "admin",
        };
        let why = if self.read_only {
            ": the profile of this project is read only"
        } else {
            ""
        };
        format!("missing right {} ({role}){why}", right.as_str())
    }
}

/// The person and the rights (REQ-003 to REQ-006). `personal` is the personal role of this
/// machine. It and `read_only` only remove rights: the read-only profile keeps `costs.view` only.
pub fn person(
    team: &Team,
    accounts: &[String],
    email: Option<&str>,
    personal: Option<&str>,
    read_only: bool,
) -> Person {
    let (member, found) = identify(team, accounts, email);
    let (role, admin, mut rights) = match (member, found) {
        (_, Found::Solo) => (None, true, Right::ALL.into()),
        (Some(m), _) => (
            Some(Role::parse(&m.role).unwrap_or(Role::Viewer)),
            m.admin,
            member_rights(m),
        ),
        (None, _) => (Some(Role::Viewer), false, BTreeSet::new()),
    };
    if let Some(keep) = personal.and_then(personal_rights) {
        rights.retain(|r| keep.contains(r));
    }
    if read_only {
        rights.retain(|r| *r == Right::CostsView);
    }
    Person {
        member: member.map(|m| m.handle.clone()),
        found,
        role,
        admin,
        read_only,
        rights: rights.into_iter().collect(),
    }
}

/// A person that Shipyard cannot place: the team file cannot be read. Fail closed: `viewer`.
pub fn unknown(read_only: bool) -> Person {
    Person {
        member: None,
        found: Found::Unknown,
        role: Some(Role::Viewer),
        admin: false,
        read_only,
        rights: Vec::new(),
    }
}

/// The health findings of the team file (REQ-001): an unknown role, an unknown override.
pub fn findings(team: &Team) -> Vec<Finding> {
    let finding = |id: String, code: &str, handle: &str, detail: String| Finding {
        id,
        group: Group::Compliance,
        severity: Severity::Warning,
        code: code.into(),
        detail: Some(detail),
        source: Some(format!("member:{handle}")),
        fix: Fix::Open {
            target: format!("doc:{TEAM_FILE}"),
        },
    };
    let mut out = Vec::new();
    if !team.members.is_empty() && !team.members.iter().any(|m| m.admin) {
        let first = &team.members[0].handle;
        out.push(finding(
            "team-no-admin".into(),
            "team-no-admin",
            first,
            "no member is admin: every person has every right".into(),
        ));
    }
    for m in &team.members {
        if Role::parse(&m.role).is_none() {
            out.push(finding(
                format!("team-role-unknown:{}", m.handle),
                "team-role-unknown",
                &m.handle,
                format!("{}: {}", m.handle, m.role),
            ));
        }
        for o in m.rights.iter().filter(|o| override_of(o).is_none()) {
            out.push(finding(
                format!("team-right-unknown:{}:{o}", m.handle),
                "team-right-unknown",
                &m.handle,
                format!("{}: {o}", m.handle),
            ));
        }
    }
    out
}
