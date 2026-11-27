//! Team rights (spec `team-rights`, ADR 0019): the roles and their default rights, the overrides of
//! a member, the personal narrowing and the match of the person in the team. No I/O.

use std::collections::BTreeMap;

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
    /// Estimates, the plan calendar and the write to the issue tracker (`shell-setup-rights` REQ-004).
    #[serde(rename = "plan.edit")]
    PlanEdit,
}

impl Right {
    pub const ALL: [Right; 11] = [
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
        Right::PlanEdit,
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
            Right::PlanEdit => "plan.edit",
        }
    }

    pub fn parse(text: &str) -> Option<Right> {
        Right::ALL.into_iter().find(|r| r.as_str() == text.trim())
    }

    /// The area of the right (REQ-005).
    pub fn area(self) -> Area {
        match self {
            Right::WorkEdit => Area::Work,
            Right::SpecsEdit => Area::Specs,
            Right::DesignEdit => Area::Design,
            Right::KnowledgeEdit => Area::Knowledge,
            Right::CodeWrite | Right::CodeMerge => Area::Code,
            Right::RunsStart | Right::RunsApprove => Area::Runs,
            Right::ProjectSettings => Area::Settings,
            Right::CostsView => Area::Costs,
            Right::PlanEdit => Area::Plan,
        }
    }

    /// The level that the right needs in its area: `read` for `costs.view`, else `write`.
    pub fn need(self) -> Level {
        if self == Right::CostsView {
            Level::Read
        } else {
            Level::Write
        }
    }
}

/// An area of the app. Each role has one level in each area (REQ-005).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type,
)]
#[serde(rename_all = "lowercase")]
pub enum Area {
    Work,
    Specs,
    Design,
    Knowledge,
    Code,
    Runs,
    Settings,
    /// Amounts of money. Not a space: `none` hides the amounts.
    Costs,
    /// Estimates and the plan: `read` is See, `write` is Change. Time entries stay personal.
    Plan,
}

impl Area {
    pub const ALL: [Area; 9] = [
        Area::Work,
        Area::Specs,
        Area::Design,
        Area::Knowledge,
        Area::Code,
        Area::Runs,
        Area::Settings,
        Area::Costs,
        Area::Plan,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Area::Work => "work",
            Area::Specs => "specs",
            Area::Design => "design",
            Area::Knowledge => "knowledge",
            Area::Code => "code",
            Area::Runs => "runs",
            Area::Settings => "settings",
            Area::Costs => "costs",
            Area::Plan => "plan",
        }
    }

    pub fn parse(text: &str) -> Option<Area> {
        Area::ALL.into_iter().find(|a| a.as_str() == text.trim())
    }
}

/// The level of a role in an area: `none` hides the area, `read` shows it, `write` also changes it.
#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type,
)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    #[default]
    None,
    Read,
    Write,
}

impl Level {
    pub fn as_str(self) -> &'static str {
        match self {
            Level::None => "none",
            Level::Read => "read",
            Level::Write => "write",
        }
    }

    pub fn parse(text: &str) -> Option<Level> {
        [Level::None, Level::Read, Level::Write]
            .into_iter()
            .find(|l| l.as_str() == text.trim())
    }
}

/// The levels of a role or a person in each area, and the two action switches. An action
/// counts only with `write` on its area (REQ-005).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Access {
    pub work: Level,
    pub specs: Level,
    pub design: Level,
    pub knowledge: Level,
    pub code: Level,
    pub runs: Level,
    pub settings: Level,
    pub costs: Level,
    /// `plan.edit`. The default is the level of `work`.
    pub plan: Level,
    /// `code.merge`.
    pub merge: bool,
    /// `runs.approve`.
    pub approve: bool,
}

impl Access {
    /// Each area `write` and each action: an admin, a solo project.
    pub const ADMIN: Access = Access::of([Level::Write; 8], true, true);
    /// Each area `read`, no action: the read-only profile.
    const READ: Access = Access::of([Level::Read; 8], false, false);

    /// The levels in the order of [`Area::ALL`] without Plan: Plan starts at the level of `work`.
    const fn of(l: [Level; 8], merge: bool, approve: bool) -> Access {
        Access {
            work: l[0],
            specs: l[1],
            design: l[2],
            knowledge: l[3],
            code: l[4],
            runs: l[5],
            settings: l[6],
            costs: l[7],
            plan: l[0],
            merge,
            approve,
        }
    }

    pub fn level(&self, area: Area) -> Level {
        let mut copy = *self;
        *copy.slot(area)
    }

    fn slot(&mut self, area: Area) -> &mut Level {
        match area {
            Area::Work => &mut self.work,
            Area::Specs => &mut self.specs,
            Area::Design => &mut self.design,
            Area::Knowledge => &mut self.knowledge,
            Area::Code => &mut self.code,
            Area::Runs => &mut self.runs,
            Area::Settings => &mut self.settings,
            Area::Costs => &mut self.costs,
            Area::Plan => &mut self.plan,
        }
    }

    /// The right is valid: the level of its area, and the switch of an action.
    pub fn has(&self, right: Right) -> bool {
        self.level(right.area()) >= right.need()
            && match right {
                Right::CodeMerge => self.merge,
                Right::RunsApprove => self.approve,
                _ => true,
            }
    }

    /// The rights, in the order of [`Right::ALL`].
    pub fn rights(&self) -> Vec<Right> {
        Right::ALL.into_iter().filter(|r| self.has(*r)).collect()
    }

    /// The areas at `none`.
    pub fn hidden(&self) -> Vec<Area> {
        Area::ALL
            .into_iter()
            .filter(|a| self.level(*a) == Level::None)
            .collect()
    }

    fn zip(self, other: Access, f: fn(Level, Level) -> Level, g: fn(bool, bool) -> bool) -> Access {
        let mut out = self;
        for a in Area::ALL {
            *out.slot(a) = f(self.level(a), other.level(a));
        }
        out.merge = g(self.merge, other.merge);
        out.approve = g(self.approve, other.approve);
        out
    }

    /// The highest level in each area: a person with several roles.
    pub fn max(self, other: Access) -> Access {
        self.zip(other, Level::max, |a, b| a || b)
    }

    /// The lowest level in each area: a narrowing.
    pub fn min(self, other: Access) -> Access {
        self.zip(other, Level::min, |a, b| a && b)
    }

    /// An override: `+right` raises its area to the level that it needs, `-right` lowers the area
    /// below it. For an action, only its switch changes.
    fn set(&mut self, right: Right, on: bool) {
        match right {
            Right::CodeMerge => self.merge = on,
            Right::RunsApprove => self.approve = on,
            _ => {
                let need = right.need();
                let below = if need == Level::Write {
                    Level::Read
                } else {
                    Level::None
                };
                let slot = self.slot(right.area());
                *slot = if on {
                    (*slot).max(need)
                } else {
                    (*slot).min(below)
                };
            }
        }
    }

    /// A cell of the `roles:` block. `false` when the key or the value is unknown.
    fn apply(&mut self, key: &str, cell: &Cell) -> bool {
        match (key.trim(), cell) {
            ("merge", Cell::Flag(on)) => self.merge = *on,
            ("approve", Cell::Flag(on)) => self.approve = *on,
            (k, Cell::Text(t)) => match (Area::parse(k), Level::parse(t)) {
                (Some(a), Some(l)) => *self.slot(a) = l,
                _ => return false,
            },
            _ => return false,
        }
        true
    }
}

/// A value of the `roles:` block: a level (`write`) or an action switch (`true`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum Cell {
    Flag(bool),
    Text(String),
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

    /// The default levels of the role: the table of the spec.
    pub fn defaults(self) -> Access {
        use Level::{None as N, Read as R, Write as W};
        // work, specs, design, knowledge, code, runs, settings, costs; merge, approve
        match self {
            Role::Po => Access::of([W, W, R, W, R, R, R, R], false, false),
            Role::Pm => Access::of([W, R, R, W, R, R, R, R], false, false),
            Role::Architect => Access::of([W, W, W, W, W, W, R, R], true, true),
            Role::Techlead => Access::ADMIN,
            Role::Ba => Access::of([W, W, R, W, R, W, R, N], false, false),
            Role::Developer => Access::of([W, R, W, W, W, W, R, N], false, true),
            Role::Qa => Access::of([W, W, R, W, W, W, R, N], false, false),
            Role::Designer => Access::of([W, R, W, W, R, R, R, N], false, false),
            Role::Viewer => Access::of([R, R, R, R, N, R, R, N], false, false),
        }
    }
}

/// The levels of `role` in this team: the defaults, then the `roles:` block of the team file.
/// An unknown area or level of the block has no effect: [`findings`] names it.
pub fn role_access(team: &Team, role: Role) -> Access {
    let mut access = role.defaults();
    for (_, block) in team
        .roles
        .iter()
        .filter(|(k, _)| Role::parse(k) == Some(role))
    {
        for (key, cell) in block {
            access.apply(key, cell);
        }
    }
    access
}

/// The table of the team: each role and its levels (REQ-002).
pub fn table(team: &Team) -> Vec<(Role, Access)> {
    Role::ALL
        .into_iter()
        .map(|r| (r, role_access(team, r)))
        .collect()
}

/// The places that a role can hide (`shell-setup-rights` REQ-011): each place but Today and
/// Setup, which the person needs to get back.
pub const HIDEABLE: [&str; 5] = ["flow", "plan", "crew", "library", "code"];
/// The key of the places that a role does not see, in the `roles:` block: `hide: plan,code`.
const HIDE_KEY: &str = "hide";

/// The places of a `hide` cell, in the order of [`HIDEABLE`]. `None` for a cell that is no list
/// of known places.
fn hide_list(cell: &Cell) -> Option<Vec<String>> {
    let Cell::Text(text) = cell else {
        return None;
    };
    let named: Vec<&str> = text
        .split(',')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();
    named.iter().all(|p| HIDEABLE.contains(p)).then(|| {
        HIDEABLE
            .iter()
            .filter(|p| named.contains(p))
            .map(|p| (*p).to_string())
            .collect()
    })
}

impl Role {
    /// The places that the role does not see until the team says otherwise (the design of the
    /// Role views page).
    pub fn default_hidden(self) -> Vec<String> {
        let places: &[&str] = match self {
            Role::Po | Role::Pm => &["code"],
            Role::Ba | Role::Viewer => &["crew", "code"],
            Role::Architect => &["plan"],
            Role::Qa => &["plan", "crew"],
            Role::Designer => &["plan", "crew", "code"],
            Role::Techlead | Role::Developer => &[],
        };
        places.iter().map(|p| (*p).to_string()).collect()
    }
}

/// The places that `role` does not see in this team: the `hide` cell of its `roles:` block, or
/// [`Role::default_hidden`] when the block has none. An empty cell hides none.
pub fn role_hidden(team: &Team, role: Role) -> Vec<String> {
    team.roles
        .iter()
        .filter(|(k, _)| Role::parse(k) == Some(role))
        .filter_map(|(_, block)| block.iter().find(|(k, _)| k.trim() == HIDE_KEY))
        .filter_map(|(_, cell)| hide_list(cell))
        .next_back()
        .unwrap_or_else(|| role.default_hidden())
}

/// The places to save for a role: the known ones, in the order of [`HIDEABLE`]. An unknown place
/// is refused.
pub fn clean_hidden(places: &[String]) -> Result<Vec<String>, String> {
    hide_list(&Cell::Text(places.join(",")))
        .ok_or_else(|| format!("a role hides only: {}", HIDEABLE.join(", ")))
}

/// The `roles:` block that gives `table` and `hidden`: the cells that differ from the defaults.
/// A role with the defaults has no entry.
pub fn block(
    table: &[(Role, Access)],
    hidden: &[(Role, Vec<String>)],
) -> BTreeMap<String, BTreeMap<String, Cell>> {
    table
        .iter()
        .filter_map(|(role, a)| {
            let d = role.defaults();
            let mut cells: BTreeMap<String, Cell> = Area::ALL
                .into_iter()
                .filter(|x| a.level(*x) != d.level(*x))
                .map(|x| (x.as_str().into(), Cell::Text(a.level(x).as_str().into())))
                .collect();
            for (key, on, was) in [
                ("merge", a.merge, d.merge),
                ("approve", a.approve, d.approve),
            ] {
                if on != was {
                    cells.insert(key.into(), Cell::Flag(on));
                }
            }
            if let Some((_, h)) = hidden.iter().find(|(r, _)| r == role)
                && *h != role.default_hidden()
            {
                cells.insert(HIDE_KEY.into(), Cell::Text(h.join(",")));
            }
            (!cells.is_empty()).then(|| (role.as_str().to_string(), cells))
        })
        .collect()
}

/// The roles of a member: `role`, then `roles`, without the copies. An unknown role is
/// `viewer`, and a member with no role is `viewer`.
pub fn roles_of(m: &Member) -> Vec<Role> {
    let mut out = Vec::new();
    for t in std::iter::once(&m.role)
        .chain(&m.roles)
        .filter(|t| !t.trim().is_empty())
    {
        let r = Role::parse(t).unwrap_or(Role::Viewer);
        if !out.contains(&r) {
            out.push(r);
        }
    }
    if out.is_empty() {
        out.push(Role::Viewer);
    }
    out
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

/// The levels of a member of the team file: each area `write` for an admin, else the highest
/// level of the roles in each area, then the overrides. An unknown override has no effect.
pub fn member_access(team: &Team, m: &Member) -> Access {
    if m.admin {
        return Access::ADMIN;
    }
    let mut access = roles_of(m)
        .into_iter()
        .map(|r| role_access(team, r))
        .reduce(Access::max)
        .unwrap_or_default();
    for (add, r) in m.rights.iter().filter_map(|o| override_of(o)) {
        access.set(r, add);
    }
    access
}

/// The levels that a personal role of this machine leaves (REQ-006). `None`: no personal role,
/// no narrowing. The roles of an older Shipyard map as the migration does (Q-145): `lead` is
/// `po`, `junior` is `developer` without `code.merge` and `runs.approve`. Another text leaves the
/// defaults of `viewer`.
pub fn personal_access(team: &Team, role: &str) -> Option<Access> {
    let role = role.trim().to_ascii_lowercase();
    Some(match role.as_str() {
        "" | "none" => return None,
        "lead" => role_access(team, Role::Po),
        "junior" => Access {
            merge: false,
            approve: false,
            ..role_access(team, Role::Developer)
        },
        other => Role::parse(other).map_or(Role::Viewer.defaults(), |r| role_access(team, r)),
    })
}

/// A save of the team keeps an admin: the last admin cannot remove their own settings write
/// (REQ-019). A team with no admin before may stay without one.
pub fn keeps_admin(old: &Team, new: &Team) -> Result<(), String> {
    let admin = |t: &Team| t.members.iter().any(|m| m.admin);
    if admin(old) && !admin(new) {
        return Err(
            "the team needs one admin: the last admin cannot remove the settings write".into(),
        );
    }
    Ok(())
}

/// The area of a ref: the read tools of a run refuse a ref of a hidden area (REQ-018). `None`:
/// the ref is in no area.
pub fn ref_area(text: &str) -> Option<Area> {
    Some(match text.trim().split(':').next()? {
        "wi" | "est" | "member" => Area::Work,
        "spec" | "change" | "test" | "q" => Area::Specs,
        "adr" | "diagram" | "model" | "api" | "data" | "flow" | "screen" => Area::Design,
        "doc" => Area::Knowledge,
        "pr" | "commit" => Area::Code,
        "run" | "wf" => Area::Runs,
        _ => return None,
    })
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
    /// The first role of the team file. `None`: solo.
    pub role: Option<Role>,
    /// Each role of the team file. Empty: solo.
    pub roles: Vec<Role>,
    pub admin: bool,
    /// The read-only profile of the project is on.
    pub read_only: bool,
    /// The places that the roles of the person do not see (`shell-setup-rights` REQ-011).
    pub hidden: Vec<String>,
    /// The levels after the personal narrowing and the read-only profile.
    pub access: Access,
    /// The rights that the levels give, in the order of [`Right::ALL`].
    pub rights: Vec<Right>,
}

impl Person {
    pub fn has(&self, right: Right) -> bool {
        self.rights.contains(&right)
    }

    pub fn level(&self, area: Area) -> Level {
        self.access.level(area)
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

/// The person and the levels (REQ-003 to REQ-006). `personal` is the personal role of this
/// machine. It and `read_only` only lower levels: the read-only profile leaves `read` at most.
/// The personal role does not lower an admin or a solo person. Settings is never `none` for an
/// admin.
pub fn person(
    team: &Team,
    accounts: &[String],
    email: Option<&str>,
    personal: Option<&str>,
    read_only: bool,
) -> Person {
    let (member, found) = identify(team, accounts, email);
    let (roles, admin, mut access) = match (member, found) {
        (_, Found::Solo) => (Vec::new(), true, Access::ADMIN),
        (Some(m), _) => (roles_of(m), m.admin, member_access(team, m)),
        (None, _) => (vec![Role::Viewer], false, role_access(team, Role::Viewer)),
    };
    // The personal role never lowers an admin or a solo person (owner decision, 2026-11-26).
    if let Some(keep) = personal
        .filter(|_| !admin)
        .and_then(|p| personal_access(team, p))
    {
        access = access.min(keep);
    }
    if read_only {
        access = access.min(Access::READ);
    }
    if admin {
        access.settings = access.settings.max(Level::Read);
    }
    // A person sees a place when one of the roles sees it. An admin sees each place.
    let mut hidden: Vec<String> = match (member, found) {
        (Some(m), _) if !m.admin => HIDEABLE
            .iter()
            .map(|p| (*p).to_string())
            .filter(|p| roles.iter().all(|r| role_hidden(team, *r).contains(p)))
            .collect(),
        _ => Vec::new(),
    };
    // The personal role of this machine only hides more. A team admin sees each place; a solo
    // person sees the places of the role they picked.
    for p in personal.map_or_else(Vec::new, |r| personal_hidden(team, r)) {
        if !hidden.contains(&p) && (found == Found::Solo || !admin) {
            hidden.push(p);
        }
    }
    Person {
        hidden,
        member: member.map(|m| m.handle.clone()),
        found,
        role: roles.first().copied(),
        roles,
        admin,
        read_only,
        rights: access.rights(),
        access,
    }
}

/// Does `person` approve a step that names `role` (`runs-recipes` REQ-008)? Only a member with that
/// role does. A solo person has every right and approves each step.
pub fn may_approve_as(person: &Person, role: &str) -> bool {
    person.found == Found::Solo
        || person
            .roles
            .iter()
            .any(|r| r.as_str().eq_ignore_ascii_case(role))
}

/// The places that a personal role of this machine hides: the same map as [`personal_access`].
fn personal_hidden(team: &Team, role: &str) -> Vec<String> {
    match role.trim().to_ascii_lowercase().as_str() {
        "" | "none" => Vec::new(),
        "lead" => role_hidden(team, Role::Po),
        "junior" => role_hidden(team, Role::Developer),
        other => Role::parse(other).map_or_else(Vec::new, |r| role_hidden(team, r)),
    }
}

/// A person that Shipyard cannot place: the team file cannot be read. Fail closed: the defaults
/// of `viewer`.
pub fn unknown(read_only: bool) -> Person {
    let access = Role::Viewer.defaults();
    Person {
        member: None,
        found: Found::Unknown,
        role: Some(Role::Viewer),
        roles: vec![Role::Viewer],
        admin: false,
        read_only,
        hidden: Vec::new(),
        rights: access.rights(),
        access,
    }
}

/// The health findings of the team file (REQ-001): an unknown role, an unknown override, an
/// unknown role, area or level in the `roles:` block.
pub fn findings(team: &Team) -> Vec<Finding> {
    let finding = |id: String, code: &str, handle: &str, detail: String| Finding {
        id,
        group: Group::Compliance,
        severity: Severity::Warning,
        code: code.into(),
        detail: Some(detail),
        source: (!handle.is_empty()).then(|| format!("member:{handle}")),
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
        let texts = std::iter::once(&m.role).chain(&m.roles);
        for role in
            texts.filter(|r| Role::parse(r).is_none() && !(r.is_empty() && !m.roles.is_empty()))
        {
            out.push(finding(
                match role == &m.role {
                    true => format!("team-role-unknown:{}", m.handle),
                    false => format!("team-role-unknown:{}:{role}", m.handle),
                },
                "team-role-unknown",
                &m.handle,
                format!("{}: {role}", m.handle),
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
    for (role, cells) in &team.roles {
        let mut probe = Access::default();
        let bad = cells.iter().filter(|(k, c)| {
            let known = (k.trim() == HIDE_KEY && hide_list(c).is_some()) || probe.apply(k, c);
            Role::parse(role).is_none() || !known
        });
        for (key, cell) in bad {
            let value = match cell {
                Cell::Flag(on) => on.to_string(),
                Cell::Text(t) => t.clone(),
            };
            out.push(finding(
                format!("team-level-unknown:{role}:{key}"),
                "team-level-unknown",
                "",
                format!("roles.{role}.{key}: {value}"),
            ));
        }
    }
    out
}
