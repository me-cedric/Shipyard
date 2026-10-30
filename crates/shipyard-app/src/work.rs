//! Work IPC (spec `work`, REQ-003 to REQ-029): the team, the estimate sheets with seal and Excel,
//! the plan, the time entries, and the writes to the tracker that a person asks for.
//!
//! The files live in the repository as text (`shipyard_store::work`). The views read the mirror and
//! never call a tracker, except the two reads that a person asks for: `time_fetch` and the
//! refresh of a ticket after a write. A command that writes to a tracker takes `click`: it
//! refuses when `click` is false, so a caller that is not a person's action cannot write
//! (REQ-006, REQ-022, REQ-025, REQ-029). The passphrase of the seal stays in memory for the
//! session. It is never written, logged or put in an error text.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use shipyard_core::pickup::Ticket;
use shipyard_core::refs::parse;
use shipyard_core::work::{
    self, Action, Calendar, Decisions, DiffRow, Field, Gantt, MonthSpend, Portfolio, Row, Sheet,
    Suggestion, Team, TimeEntry, TimeRow, Totals, TrackerLog,
};
use shipyard_core::work_item::{Capabilities, WorkItem};
use shipyard_engine::tick::source_key;
use shipyard_store::excel::{self, MAX_BYTES, Preview};
use shipyard_store::project::write_atomic;
use shipyard_store::seal::{self, Sealer, is_sealed};
use shipyard_store::work::{
    CALENDAR_PATH, DECISIONS_PATH, TEAM_PATH, load_team_with, read_calendar, read_decisions,
    read_sheet, read_sheet_with, read_team, read_time, sheet_path, time_add as add_to_month,
    time_path, write_calendar, write_decisions, write_sheet, write_sheet_with, write_team,
    write_team_with, write_time,
};
use shipyard_store::{legacy, project_import};
use shipyard_trackers::work::{self as writes, Click, RowResult, Sent, TrackerWrite};
use specta::Type;
use tauri::AppHandle;

use crate::commands::sync::{active, automation_in, tracker_target};
use crate::commands::{AppState, Res, blocking, err};
use crate::connections::Connection;

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ---------------------------------------------------------------- session

fn json_sheet_path(slug: &str) -> String {
    format!("docs/costing/{slug}.json")
}

/// The Legacy team file. It is the team when `.shipyard/team.yaml` does not exist (Q-102).
const LEGACY_TEAM: &str = "docs/planning/team.json";

/// What the app keeps in memory for Work, by project id.
///
/// shortcut: the passphrase is a plain `String`. The memory is not wiped on lock or on exit. Add
/// a zeroing type when the threat model needs it.
#[derive(Default)]
pub struct Session {
    /// The unlocked passphrase. Memory only (REQ-014).
    pass: Mutex<HashMap<String, String>>,
    /// One sealer for each unlocked project. It keeps the derived keys, so a read or a write
    /// derives no key twice (a derivation costs a fifth of a second). It goes with the passphrase.
    sealers: Mutex<HashMap<String, Sealer>>,
    /// The last team file that was valid: a refused file keeps it (REQ-003).
    team: Mutex<HashMap<String, Team>>,
    /// The Excel preview that waits for the confirm of a person (REQ-012).
    excel: Mutex<HashMap<String, Preview>>,
    /// The offset of the screen from UTC, in minutes east, as the view last said. `today` follows
    /// it, so the plan starts on the day of the person and not on the day of Greenwich.
    offset: AtomicI32,
    /// One lock for each time entry that goes to the tracker: two sends of one entry never run at
    /// once (REQ-023).
    sending: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

struct Ctx<'a> {
    s: &'a AppState,
    project: String,
    root: PathBuf,
}

fn ctx(s: &AppState) -> Res<Ctx<'_>> {
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    Ok(Ctx {
        s,
        project: e.id,
        root: e.path.into(),
    })
}

impl Ctx<'_> {
    fn pass(&self) -> Option<String> {
        lock(&self.s.work.pass).get(&self.project).cloned()
    }

    /// Run `f` with the sealer of this project, or `None` when the session holds no passphrase.
    fn with_sealer<T>(&self, f: impl FnOnce(Option<&mut Sealer>) -> T) -> T {
        f(lock(&self.s.work.sealers).get_mut(&self.project))
    }

    /// Keep the passphrase and its sealer for this session.
    fn keep_pass(&self, pass: &str) -> Res<()> {
        let sealer = Sealer::new(pass).map_err(err)?;
        lock(&self.s.work.pass).insert(self.project.clone(), pass.into());
        lock(&self.s.work.sealers).insert(self.project.clone(), sealer);
        Ok(())
    }

    fn forget_pass(&self) {
        lock(&self.s.work.pass).remove(&self.project);
        lock(&self.s.work.sealers).remove(&self.project);
    }

    fn read(&self, rel: &str) -> Res<Option<String>> {
        match std::fs::read_to_string(self.root.join(rel)) {
            Ok(t) => Ok(Some(t)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("{rel}: {e}")),
        }
    }

    fn write(&self, rel: &str, text: &str) -> Res<()> {
        let _g = self.s.guard();
        write_atomic(&self.root.join(rel), text.as_bytes()).map_err(err)
    }

    /// The passphrase that a write seals with. With the seal on and no passphrase, a write would
    /// drop the sealed values: it is refused (REQ-005, REQ-014).
    fn write_pass(&self) -> Res<Option<String>> {
        match self.pass() {
            Some(p) => Ok(Some(p)),
            None if self.sealed()? => Err(seal::SealError::Locked.to_string()),
            None => Ok(None),
        }
    }

    /// The slugs of `docs/costing/*.yaml` and of the Legacy `*.json` sheets, sorted. A YAML sheet
    /// hides the JSON sheet of the same slug.
    fn slugs(&self) -> Res<Vec<String>> {
        let Ok(rd) = std::fs::read_dir(self.root.join("docs/costing")) else {
            return Ok(Vec::new());
        };
        let mut out: Vec<String> = rd
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                (name.strip_suffix(".yaml").or(name.strip_suffix(".json"))).map(String::from)
            })
            .filter(|slug| sheet_path(slug).is_ok())
            .collect();
        out.sort();
        out.dedup();
        Ok(out)
    }

    /// The sheet is a Legacy JSON file: there is no YAML file for it (Q-102).
    fn json_sheet(&self, slug: &str) -> bool {
        sheet_path(slug).is_ok_and(|p| !self.root.join(p).exists())
            && self.root.join(json_sheet_path(slug)).is_file()
    }

    fn sheet_text(&self, slug: &str) -> Res<Option<String>> {
        if self.json_sheet(slug) {
            return self.read(&json_sheet_path(slug));
        }
        self.read(&sheet_path(slug).map_err(err)?)
    }

    fn sheet(&self, slug: &str) -> Res<Sheet> {
        let text = self
            .sheet_text(slug)?
            .ok_or_else(|| format!("no sheet `{slug}`"))?;
        if self.json_sheet(slug) {
            let v = serde_json::from_str(&text).map_err(|e| format!("{slug}: {e}"))?;
            return Ok(project_import::sheet(
                &v,
                slug,
                &project_import::roles(&self.root),
            ));
        }
        self.with_sealer(|sealer| read_sheet_with(&text, sealer))
            .map_err(err)
    }

    /// The sheets that open now. A locked or invalid file is left out.
    fn readable(&self) -> Res<Vec<(String, Sheet)>> {
        Ok(self
            .slugs()?
            .into_iter()
            .filter_map(|slug| self.sheet(&slug).ok().map(|s| (slug, s)))
            .collect())
    }

    /// The team, or the last valid one when the file is refused.
    fn team(&self) -> TeamView {
        let last = lock(&self.s.work.team)
            .get(&self.project)
            .cloned()
            .unwrap_or_default();
        let text = self.team_text();
        let load = self.with_sealer(|sealer| load_team_with(text.as_deref(), sealer, &last));
        if load.error.is_none() {
            lock(&self.s.work.team).insert(self.project.clone(), load.team.clone());
        }
        TeamView {
            locked: load.team.locked,
            team: load.team,
            error: load.error,
        }
    }

    /// The text of the team: the YAML file, or the Legacy `team.json` as YAML.
    fn team_text(&self) -> Option<String> {
        self.read(TEAM_PATH).unwrap_or_default().or_else(|| {
            let v = serde_json::from_str(&self.read(LEGACY_TEAM).ok()??).ok()?;
            let team = project_import::team(&v, &project_import::roles(&self.root));
            write_team(&team, None).ok()
        })
    }

    /// The Legacy team file is the team now, so a save writes it in its own format.
    fn json_team(&self) -> bool {
        !self.root.join(TEAM_PATH).exists() && self.root.join(LEGACY_TEAM).is_file()
    }

    fn decisions(&self) -> Res<Decisions> {
        let text = self.read(DECISIONS_PATH)?.unwrap_or_default();
        read_decisions(&text).map_err(|e| format!("{DECISIONS_PATH}: {e}"))
    }

    fn calendar(&self) -> Res<Calendar> {
        let text = self.read(CALENDAR_PATH)?.unwrap_or_default();
        read_calendar(&text).map_err(|e| format!("{CALENDAR_PATH}: {e}"))
    }

    // ---- the seal

    fn sealed(&self) -> Res<bool> {
        for slug in self.slugs()? {
            if self.sheet_text(&slug)?.is_some_and(|t| is_sealed(&t)) {
                return Ok(true);
            }
        }
        Ok(self
            .read(TEAM_PATH)?
            .and_then(|t| read_team(&t, None).ok())
            .is_some_and(|t| t.locked))
    }

    /// Every sealed text opens with `pass`, or the first one that does not names the reason.
    fn verify(&self, pass: &str) -> Res<()> {
        for slug in self.slugs()? {
            if let Some(t) = self.sheet_text(&slug)?.filter(|t| is_sealed(t)) {
                seal::open(Some(pass), &t).map_err(err)?;
            }
        }
        if let Some(t) = self.read(TEAM_PATH)? {
            read_team(&t, Some(pass)).map_err(err)?;
        }
        Ok(())
    }

    fn seal_state(&self) -> Res<SealState> {
        Ok(SealState {
            sealed: self.sealed()?,
            unlocked: self.pass().is_some(),
        })
    }
}

/// The day of `secs` (Unix time) at `offset_minutes` east of UTC, as `YYYY-MM-DD`.
fn local_day(secs: u64, offset_minutes: i32) -> String {
    let local = secs as i64 + i64::from(offset_minutes) * 60;
    work::iso(local.div_euclid(86_400) as i32)
}

/// Today on the screen of the person: the offset that the view sent with `work_context`.
pub(crate) fn today(s: &AppState) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    local_day(secs, s.work.offset.load(Ordering::Relaxed))
}

/// A write needs the click of a person, and a project in a read-only profile takes no write
/// (`Overrides.read_only`).
pub(crate) fn need_click(s: &AppState, click: bool) -> Res<()> {
    if !click {
        return Err("this change needs the click of a person".into());
    }
    if s.registry()?
        .active()
        .is_some_and(|e| e.overrides.read_only == Some(true))
    {
        return Err("the profile of this project is read only".into());
    }
    Ok(())
}

// ---------------------------------------------------------------- the tracker

pub(crate) struct Target {
    id: String,
    scope: Option<String>,
    pub(crate) caps: Capabilities,
}

impl Target {
    /// The mirror key of the rows of this connection and container.
    fn source(&self) -> String {
        source_key(&self.id, self.scope.as_deref())
    }
}

pub(crate) fn tracker(s: &AppState) -> Res<Target> {
    let a = active(s)?.ok_or("no active project")?;
    let (id, scope, kind) =
        tracker_target(s, &a)?.ok_or("the project has no tracker connection")?;
    Ok(Target {
        id,
        scope,
        caps: kind.tracker().capabilities(),
    })
}

fn writer(s: &AppState, t: &Target) -> Res<Box<dyn TrackerWrite>> {
    let w = s.connections.tracker_write(&t.id)?;
    // The issue types of the project (`docs/delivery/tickets.config.json`) name the Jira types.
    if let Some(e) = s.registry()?.active() {
        let c = shipyard_store::delivery_docs::tickets_config(std::path::Path::new(&e.path));
        w.set_issue_types(&c.epic, &c.story);
    }
    Ok(w)
}

/// The mirrored items of a tracker. No request leaves the machine.
pub(crate) fn mirror_items(s: &AppState, t: &Target) -> Res<Vec<WorkItem>> {
    if !s.sync.mirror_exists() {
        return Ok(Vec::new());
    }
    Ok(s.sync
        .mirror()
        .map_err(err)?
        .tickets(&t.source())
        .map_err(err)?
        .into_iter()
        .map(|t| t.item)
        .collect())
}

/// Read the written tickets again into the mirror, so the views show the change at once. The write
/// worked: a failed read is not an error, the next tick brings the row.
fn refresh(s: &AppState, t: &Target, w: &dyn TrackerWrite, keys: impl IntoIterator<Item = String>) {
    if let Ok(m) = s.sync.mirror() {
        for key in keys {
            let Ok(item) = w.get(&key) else { continue };
            let mut row = m
                .ticket(&t.source(), &key)
                .ok()
                .flatten()
                .unwrap_or_else(|| Ticket::new(item.clone()));
            row.item = item;
            let _ = m.put_tickets(&t.source(), &[row]);
        }
    }
    s.sync.changed();
}

// ---------------------------------------------------------------- context

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkContext {
    /// The tracker connection of the project.
    pub tracker: Option<String>,
    /// The flags of the tracker. A view disables an action that the flags lack (REQ-006, REQ-022).
    pub capabilities: Option<Capabilities>,
    /// The container that apply creates tickets in. `None` when the project has no setting.
    pub scope: Option<String>,
    /// The label that marks an item for agent work. `None` when `automation.yaml` turns it off.
    pub pickup_label: Option<String>,
    /// The member of the tracker account of this machine, by the `user` of the connection.
    pub me: Option<String>,
    /// `YYYY-MM-DD`, the first day of the plan.
    pub today: String,
}

fn conn_of(s: &AppState) -> Res<Option<Connection>> {
    match active(s)?.and_then(|a| a.tracker) {
        Some(id) => s.connections.get(&id),
        None => Ok(None),
    }
}

/// The member that the `user` of the tracker connection resolves to through `team.yaml`.
fn me_of(conn: &Option<Connection>, team: &Team) -> Option<String> {
    conn.as_ref()
        .and_then(|c| c.user.as_deref())
        .and_then(|u| team.resolve(u))
        .map(|m| m.handle.clone())
}

/// `offset_minutes` is the offset of the screen from UTC, east positive: the day of the plan, the
/// booked window and the default day of a time entry are the day of the person.
pub fn context(s: &AppState, offset_minutes: i32) -> Res<WorkContext> {
    if !(-14 * 60..=14 * 60).contains(&offset_minutes) {
        return Err("the offset is not a time zone offset".into());
    }
    s.work.offset.store(offset_minutes, Ordering::Relaxed);
    let c = ctx(s)?;
    let a = active(s)?.ok_or("no active project")?;
    let conn = conn_of(s)?;
    let me = me_of(&conn, &c.team().team);
    Ok(WorkContext {
        tracker: conn.as_ref().map(|c| c.id.clone()),
        capabilities: conn.as_ref().and_then(|c| c.capabilities),
        scope: tracker_target(s, &a)?.and_then(|t| t.1),
        pickup_label: automation_in(&c.root)?.pickup.label,
        me,
        today: today(s),
    })
}

// ---------------------------------------------------------------- team

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TeamView {
    pub team: Team,
    /// A day rate is sealed and this machine has no passphrase (REQ-005).
    pub locked: bool,
    /// Why the file was refused. The team is then the last valid one (REQ-003).
    pub error: Option<String>,
}

pub fn team_get(s: &AppState) -> Res<TeamView> {
    Ok(ctx(s)?.team())
}

/// Write `.shipyard/team.yaml`. A team with a duplicate handle or account is refused and the
/// file stays. A locked team is refused: the write would drop the sealed rates (REQ-005).
pub fn team_save(s: &AppState, mut team: Team) -> Res<TeamView> {
    let c = ctx(s)?;
    if c.team().locked {
        return Err(seal::SealError::Locked.to_string());
    }
    team.locked = false;
    c.write_pass()?;
    if c.json_team() {
        let roles = project_import::roles(&c.root);
        let old = c.read(LEGACY_TEAM)?;
        c.write(
            LEGACY_TEAM,
            &legacy::team_json(&team, old.as_deref(), &roles),
        )?;
        return Ok(c.team());
    }
    let text = c
        .with_sealer(|sealer| write_team_with(&team, sealer))
        .map_err(err)?;
    c.write(TEAM_PATH, &text)?;
    Ok(c.team())
}

/// The skills of an item: its labels without the pickup label and the refs, and its components.
fn skills_of(t: &Ticket, pickup: Option<&str>) -> Vec<String> {
    t.item
        .labels
        .iter()
        .filter(|l| parse(l).is_none() && Some(l.as_str()) != pickup)
        .chain(&t.components)
        .cloned()
        .collect()
}

/// Rank the members for a mirrored item (REQ-007). It assigns nothing. The booked days of a member
/// come from the plan of every readable sheet, over the seven days from today.
pub fn suggest(s: &AppState, key: &str) -> Res<Vec<Suggestion>> {
    let c = ctx(s)?;
    let t = tracker(s)?;
    let ticket = s
        .sync
        .mirror()
        .map_err(err)?
        .ticket(&t.source(), key)
        .map_err(err)?
        .ok_or_else(|| format!("not in the mirror: {key}"))?;
    let team = c.team().team;
    let pickup = automation_in(&c.root)?.pickup.label;
    let booked = work::booked(
        &c.readable()?,
        &team,
        &c.calendar()?,
        &c.decisions()?,
        &today(s),
        7,
    );
    Ok(work::suggest(
        &skills_of(&ticket, pickup.as_deref()),
        &team,
        &booked,
    ))
}

/// Assign an item to a member: the first tracker account of the member goes to the tracker
/// (REQ-006). The system never assigns by itself.
pub fn assign(s: &AppState, key: &str, handle: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let c = ctx(s)?;
    let team = c.team().team;
    let m = team
        .resolve(handle)
        .ok_or_else(|| format!("unknown member `{handle}`"))?;
    // shortcut: a member with several accounts sends the first. A tracker per account needs a
    // team file format that names the connection.
    let account = m
        .trackers
        .first()
        .ok_or_else(|| format!("{} has no tracker account in team.yaml", m.name))?;
    let t = tracker(s)?;
    let w = writer(s, &t)?;
    w.assign(key, account).map_err(err)?;
    refresh(s, &t, &*w, [key.to_string()]);
    Ok(())
}

/// Mark an item for agent work: add the pickup label of `automation.yaml` (REQ-008).
pub fn mark(s: &AppState, key: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let c = ctx(s)?;
    let label = automation_in(&c.root)?
        .pickup
        .label
        .ok_or("the pickup label is off in automation.yaml")?;
    let t = tracker(s)?;
    let w = writer(s, &t)?;
    w.add_label(key, &label).map_err(err)?;
    refresh(s, &t, &*w, [key.to_string()]);
    Ok(())
}

/// Send an item to the factory as a run: add the label `wf:<workflow>` and, when `automation.yaml`
/// has one, the pickup label. The factory claims the item. Nothing here starts a run (`assistant`
/// REQ-015). The caller checks the workflow id.
pub fn mark_for_run(s: &AppState, key: &str, workflow: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let c = ctx(s)?;
    let pickup = automation_in(&c.root)?.pickup.label;
    let t = tracker(s)?;
    let w = writer(s, &t)?;
    w.add_label(key, &format!("wf:{workflow}")).map_err(err)?;
    if let Some(label) = pickup {
        w.add_label(key, &label).map_err(err)?;
    }
    refresh(s, &t, &*w, [key.to_string()]);
    Ok(())
}

/// Move an item to a status. The tracker may refuse: the text names the reason and the card
/// returns (REQ-002).
pub fn transition(s: &AppState, key: &str, to: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let t = tracker(s)?;
    let w = writer(s, &t)?;
    w.transition(key, to).map_err(err)?;
    refresh(s, &t, &*w, [key.to_string()]);
    Ok(())
}

// ---------------------------------------------------------------- ticket thread

/// One comment of a ticket, as the person reads it. A hidden marker of Shipyard is not shown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TicketComment {
    pub id: String,
    pub author: String,
    pub body: String,
    pub created: String,
}

/// The comments of a ticket, oldest first. It reads the tracker: a person asked for it. A
/// comment that holds only a Shipyard marker (a claim stamp) is left out. Source of the logic:
/// Legacy `tickets_issue` (`src-tauri/src/infrastructure/jira.rs`).
pub fn ticket_comments(s: &AppState, key: &str) -> Res<Vec<TicketComment>> {
    let t = tracker(s)?;
    if !t.caps.comments {
        return Err("the tracker does not hold comments".into());
    }
    let w = writer(s, &t)?;
    Ok(writes::all_comments(&*w, key)
        .map_err(err)?
        .into_iter()
        .filter(|c| {
            let b = c.body.trim();
            !(b.starts_with("<!-- shipyard:")
                && b.ends_with("-->")
                && b.matches("<!--").count() == 1)
        })
        .map(|c| TicketComment {
            id: c.id,
            author: c.author.name,
            body: c.body,
            created: c.created,
        })
        .collect())
}

/// Posts a comment. An empty body is refused.
pub fn ticket_comment_add(s: &AppState, key: &str, body: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    if body.trim().is_empty() {
        return Err("the comment is empty".into());
    }
    let t = tracker(s)?;
    let w = writer(s, &t)?;
    w.add_comment(key, body.trim()).map_err(err)?;
    Ok(())
}

/// Sets the title, the description or the estimate in days of a ticket. A field left `None` stays.
/// A title that is empty after trim is refused. A tracker that cannot hold a field lists it in the
/// answer (`skipped`).
pub fn ticket_edit(
    s: &AppState,
    key: &str,
    title: Option<String>,
    description: Option<String>,
    days: Option<f64>,
    click: bool,
) -> Res<Vec<String>> {
    need_click(s, click)?;
    let title = title.map(|t| t.trim().to_string());
    if title.as_deref() == Some("") {
        return Err("the title is empty".into());
    }
    if days.is_some_and(|d| !d.is_finite() || d < 0.0) {
        return Err("the estimate must be zero or more days".into());
    }
    let t = tracker(s)?;
    let w = writer(s, &t)?;
    let done = w
        .update(
            key,
            &writes::Fields {
                title,
                description,
                days,
                parent: None,
            },
        )
        .map_err(err)?;
    refresh(s, &t, &*w, [key.to_string()]);
    Ok(done.skipped.iter().map(|f| format!("{f:?}")).collect())
}

/// Adds a label. A blank label or one with a space is refused: no tracker keeps a label with a
/// space in the same way.
pub fn ticket_label_add(s: &AppState, key: &str, label: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let label = label.trim();
    if label.is_empty() || label.contains(char::is_whitespace) {
        return Err("a label is one word".into());
    }
    let t = tracker(s)?;
    let w = writer(s, &t)?;
    w.add_label(key, label).map_err(err)?;
    refresh(s, &t, &*w, [key.to_string()]);
    Ok(())
}

// ---------------------------------------------------------------- seal

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SealState {
    /// A sheet or a day rate is sealed in the repository.
    pub sealed: bool,
    /// This session holds the passphrase.
    pub unlocked: bool,
}

pub fn seal_state(s: &AppState) -> Res<SealState> {
    ctx(s)?.seal_state()
}

/// Keep the passphrase for this session. A passphrase that does not open the sealed files is
/// refused and nothing is kept (REQ-014).
pub fn unlock(s: &AppState, passphrase: &str) -> Res<SealState> {
    let c = ctx(s)?;
    if !c.sealed()? {
        return Err("nothing is sealed".into());
    }
    c.verify(passphrase)?;
    c.keep_pass(passphrase)?;
    c.seal_state()
}

pub fn lock_session(s: &AppState) -> Res<SealState> {
    let c = ctx(s)?;
    c.forget_pass();
    c.seal_state()
}

/// Seal every sheet and every day rate with the passphrase (REQ-014). Files that are sealed
/// already stay as they are. If any sealed file does not open with the passphrase, nothing is
/// written.
pub fn seal_all(s: &AppState, passphrase: &str) -> Res<SealState> {
    let c = ctx(s)?;
    if passphrase.trim().is_empty() {
        return Err(seal::SealError::EmptyPassphrase.to_string());
    }
    c.verify(passphrase)?;
    for slug in c.slugs()? {
        // shortcut: a Legacy JSON sheet is not sealed. Move it to YAML first.
        let Some(text) = c
            .sheet_text(&slug)?
            .filter(|t| !is_sealed(t) && !c.json_sheet(&slug))
        else {
            continue;
        };
        let sheet = read_sheet(&text, None).map_err(|e| format!("{slug}: {e}"))?;
        let sealed = write_sheet(&sheet, Some(passphrase)).map_err(err)?;
        c.write(&sheet_path(&slug).map_err(err)?, &sealed)?;
    }
    if let Some(text) = c.read(TEAM_PATH)? {
        // A sealed rate reads as `None` without the passphrase, so a plain rate is a `Some`.
        let plain =
            read_team(&text, None).is_ok_and(|t| t.members.iter().any(|m| m.day_rate.is_some()));
        if plain {
            let all = read_team(&text, Some(passphrase)).map_err(err)?;
            c.write(TEAM_PATH, &write_team(&all, Some(passphrase)).map_err(err)?)?;
        }
    }
    c.keep_pass(passphrase)?;
    c.seal_state()
}

/// Open every sealed file again and forget the passphrase (REQ-014).
pub fn unseal_all(s: &AppState, passphrase: &str) -> Res<SealState> {
    let c = ctx(s)?;
    if !c.sealed()? {
        return Err("nothing is sealed".into());
    }
    c.verify(passphrase)?;
    for slug in c.slugs()? {
        let Some(text) = c.sheet_text(&slug)?.filter(|t| is_sealed(t)) else {
            continue;
        };
        let sheet = read_sheet(&text, Some(passphrase)).map_err(err)?;
        c.write(
            &sheet_path(&slug).map_err(err)?,
            &write_sheet(&sheet, None).map_err(err)?,
        )?;
    }
    if let Some(text) = c.read(TEAM_PATH)? {
        let team = read_team(&text, Some(passphrase)).map_err(err)?;
        c.write(TEAM_PATH, &write_team(&team, None).map_err(err)?)?;
    }
    c.forget_pass();
    c.seal_state()
}

// ---------------------------------------------------------------- estimates

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum SheetState {
    Ready,
    /// Sealed and this machine has no passphrase: the view shows no number (REQ-014).
    Locked,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SheetItem {
    pub slug: String,
    pub name: Option<String>,
    pub state: SheetState,
    pub error: Option<String>,
    pub totals: Option<Totals>,
}

/// One ticket of the mirror beside the task that names it (REQ-015).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskTicket {
    pub task: String,
    pub key: String,
    pub title: String,
    /// The original estimate of the ticket. `None` when the tracker has none.
    pub estimate_minutes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SheetView {
    pub slug: String,
    pub sheet: Sheet,
    /// Price, cost and margin (REQ-011). Computed, never stored.
    pub totals: Totals,
    /// The days of each task by task id: a percentage task shows its computed days (REQ-010).
    pub days: BTreeMap<String, f64>,
    /// Effort and cost by month. It sums to `totals` (REQ-011).
    pub spread: Vec<MonthSpend>,
    pub tickets: Vec<TaskTicket>,
}

/// Every sheet for an export: its slug and the sheet, or why it cannot be read (a sealed sheet
/// with no passphrase in this session). A sheet holds no day rate.
pub(crate) fn sheets_for_export(s: &AppState) -> Res<Vec<(String, Res<Sheet>)>> {
    let c = ctx(s)?;
    Ok(c.slugs()?
        .into_iter()
        .map(|slug| {
            let sheet = c.sheet(&slug);
            (slug, sheet)
        })
        .collect())
}

pub fn list_sheets(s: &AppState) -> Res<Vec<SheetItem>> {
    let c = ctx(s)?;
    let rates = work::role_rates(&c.team().team);
    c.slugs()?
        .into_iter()
        .map(|slug| {
            let item = |name, state, error, totals| SheetItem {
                slug: slug.clone(),
                name,
                state,
                error,
                totals,
            };
            Ok(match c.sheet(&slug) {
                Ok(sheet) => item(
                    Some(sheet.name.clone()),
                    SheetState::Ready,
                    None,
                    Some(work::totals(&sheet, &rates)),
                ),
                Err(_)
                    if c.pass().is_none()
                        && c.sheet_text(&slug)?.is_some_and(|t| is_sealed(&t)) =>
                {
                    item(None, SheetState::Locked, None, None)
                }
                Err(e) => item(None, SheetState::Invalid, Some(e), None),
            })
        })
        .collect()
}

fn sheet_view(c: &Ctx, slug: &str) -> Res<SheetView> {
    let sheet = c.sheet(slug)?;
    let team = c.team().team;
    let build = work::build_days(&sheet);
    let days = sheet
        .tasks()
        .map(|(_, t)| (t.id.clone(), work::task_days(t, build)))
        .collect();
    let spread = work::gantt(
        slug,
        &sheet,
        &team,
        &c.calendar()?,
        &c.decisions()?,
        &today(c.s),
    )
    .spread();
    let mirror = match tracker(c.s) {
        Ok(t) => mirror_items(c.s, &t)?,
        Err(_) => Vec::new(),
    };
    let tickets = sheet
        .tasks()
        .filter_map(|(_, t)| {
            let key = t.ticket.as_deref()?;
            let item = mirror.iter().find(|i| i.key == key)?;
            Some(TaskTicket {
                task: t.id.clone(),
                key: key.into(),
                title: item.title.clone(),
                estimate_minutes: item
                    .time
                    .as_ref()
                    .and_then(|t| t.estimate_minutes)
                    .map(|m| m as u32),
            })
        })
        .collect();
    Ok(SheetView {
        slug: slug.into(),
        totals: work::totals(&sheet, &work::role_rates(&team)),
        sheet,
        days,
        spread,
        tickets,
    })
}

pub fn sheet_get(s: &AppState, slug: &str) -> Res<SheetView> {
    sheet_view(&ctx(s)?, slug)
}

/// Write a sheet. It holds the entries and no total (REQ-010). A sealed project seals the file.
pub fn sheet_save(s: &AppState, slug: &str, sheet: Sheet) -> Res<SheetView> {
    let c = ctx(s)?;
    let rel = sheet_path(slug).map_err(err)?;
    if c.json_sheet(slug) {
        let old = c.sheet_text(slug)?;
        let roles = project_import::roles(&c.root);
        c.write(
            &json_sheet_path(slug),
            &legacy::sheet_json(&sheet, old.as_deref(), &roles),
        )?;
        return sheet_view(&c, slug);
    }
    c.write_pass()?;
    let text = c
        .with_sealer(|sealer| write_sheet_with(&sheet, sealer))
        .map_err(err)?;
    c.write(&rel, &text)?;
    sheet_view(&c, slug)
}

pub fn portfolio(s: &AppState) -> Res<Portfolio> {
    let c = ctx(s)?;
    Ok(work::portfolio(
        &c.readable()?,
        &work::role_rates(&c.team().team),
    ))
}

// ---------------------------------------------------------------- Excel

/// A path that a dialog gave: absolute, `.xlsx`, and no other kind of path.
fn xlsx_path(path: &str) -> Res<PathBuf> {
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err("the path is not absolute".into());
    }
    if p.extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("xlsx")
    {
        return Err("the file is not an .xlsx file".into());
    }
    Ok(p)
}

/// Read the workbook and keep the preview until the confirm. It writes nothing (REQ-012).
pub fn excel_read(s: &AppState, path: &str, scope: Option<&str>) -> Res<Preview> {
    let c = ctx(s)?;
    let p = xlsx_path(path)?;
    let meta = std::fs::metadata(&p).map_err(|e| format!("{path}: {e}"))?;
    if !meta.is_file() {
        return Err("the path is not a file".into());
    }
    if meta.len() > MAX_BYTES as u64 {
        return Err(format!("the workbook is over {} MB", MAX_BYTES / 1_048_576));
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("{path}: {e}"))?;
    let preview = excel::preview(&bytes, scope).map_err(err)?;
    lock(&s.work.excel).insert(c.project, preview.clone());
    Ok(preview)
}

/// Replace a sheet with the previewed one. Without `confirmed` the sheet stays (REQ-012).
pub fn excel_replace(s: &AppState, slug: &str, confirmed: bool) -> Res<SheetView> {
    let c = ctx(s)?;
    let rel = sheet_path(slug).map_err(err)?;
    if c.json_sheet(slug) {
        return Err("a Legacy JSON sheet takes no Excel import".into());
    }
    let pass = c.write_pass()?;
    {
        let pending = lock(&s.work.excel);
        let preview = pending
            .get(&c.project)
            .ok_or("no import is planned: read the workbook first")?;
        let _g = s.guard();
        std::fs::create_dir_all(c.root.join("docs/costing")).map_err(err)?;
        excel::replace_sheet(&c.root.join(&rel), preview, confirmed, pass.as_deref())
            .map_err(err)?;
    }
    lock(&s.work.excel).remove(&c.project);
    sheet_view(&c, slug)
}

/// Write a sheet to a workbook that the CGI costing tool opens (REQ-013).
pub fn excel_write(s: &AppState, slug: &str, path: &str) -> Res<()> {
    let c = ctx(s)?;
    let p = xlsx_path(path)?;
    if p.is_dir() {
        return Err("the path is a folder".into());
    }
    if !p.parent().is_some_and(Path::is_dir) {
        return Err("the folder of the path does not exist".into());
    }
    let rates = work::role_rates(&c.team().team);
    let bytes = excel::export(&c.sheet(slug)?, &rates).map_err(err)?;
    write_atomic(&p, &bytes).map_err(err)
}

// ---------------------------------------------------------------- plan

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlanView {
    pub slug: String,
    pub gantt: Gantt,
    pub decisions: Decisions,
    pub calendar: Calendar,
    pub today: String,
}

/// The Gantt of a sheet, from the team and the calendar now. Only the decisions of a person are
/// in a file (REQ-017).
pub fn plan(s: &AppState, slug: &str) -> Res<PlanView> {
    let c = ctx(s)?;
    let sheet = c.sheet(slug)?;
    let (decisions, calendar, today) = (c.decisions()?, c.calendar()?, today(s));
    Ok(PlanView {
        slug: slug.into(),
        gantt: work::gantt(slug, &sheet, &c.team().team, &calendar, &decisions, &today),
        decisions,
        calendar,
        today,
    })
}

pub fn decisions_save(s: &AppState, decisions: &Decisions) -> Res<()> {
    let c = ctx(s)?;
    c.write(DECISIONS_PATH, &write_decisions(decisions).map_err(err)?)
}

pub fn calendar_save(s: &AppState, calendar: &Calendar) -> Res<()> {
    let c = ctx(s)?;
    c.write(CALENDAR_PATH, &write_calendar(calendar).map_err(err)?)
}

// ---------------------------------------------------------------- time

/// The member of a time entry: the one named, or the one that the tracker account of this
/// machine resolves to. No member, no entry (REQ-020).
fn member_of(c: &Ctx, named: Option<&str>) -> Res<String> {
    let team = c.team().team;
    let id = match named {
        Some(h) => Some(h.to_string()),
        None => me_of(&conn_of(c.s)?, &team),
    };
    id.and_then(|h| team.resolve(&h).map(|m| m.handle.clone()))
        .ok_or_else(|| {
            "cannot resolve the member: set `user` on the tracker connection to a tracker account of \
             the team, or name the member"
                .into()
        })
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TimeView {
    pub member: String,
    pub month: String,
    /// The entries of the month. An entry with a receipt is `in-tracker`, the others `to-send`.
    pub rows: Vec<TimeRow>,
    /// The tracker has the time tracking flag (REQ-022).
    pub can_send: bool,
}

fn month_entries(c: &Ctx, handle: &str, month: &str) -> Res<Vec<TimeEntry>> {
    let rel = time_path(handle, &format!("{month}-01")).map_err(err)?;
    read_time(&c.read(&rel)?.unwrap_or_default()).map_err(|e| format!("{rel}: {e}"))
}

pub fn time_month(s: &AppState, member: Option<&str>, month: &str) -> Res<TimeView> {
    let c = ctx(s)?;
    let handle = member_of(&c, member)?;
    let entries = month_entries(&c, &handle, month)?;
    Ok(TimeView {
        can_send: tracker(s).is_ok_and(|t| t.caps.time_tracking),
        rows: work::reconcile(&entries, &[]),
        member: handle,
        month: month.into(),
    })
}

/// A ticket key from the text of a person: `wi:ACME-1` or `ACME-1`.
fn ticket_key(text: &str) -> String {
    text.trim()
        .strip_prefix("wi:")
        .unwrap_or(text.trim())
        .into()
}

/// Write an entry (REQ-020). It names a ticket of the mirror or none. It sends nothing (REQ-022).
pub fn time_write(
    s: &AppState,
    member: Option<&str>,
    day: &str,
    minutes: u32,
    note: &str,
    ticket: Option<&str>,
) -> Res<TimeEntry> {
    let c = ctx(s)?;
    let handle = member_of(&c, member)?;
    if minutes == 0 || minutes > 24 * 60 {
        return Err("the duration is from 1 minute to 24 hours".into());
    }
    let ticket = ticket.map(ticket_key).filter(|k| !k.is_empty());
    if let Some(key) = &ticket {
        let t = tracker(s)?;
        if !mirror_items(s, &t)?.iter().any(|i| i.key == *key) {
            return Err(format!("not in the mirror: {key}"));
        }
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let entry = TimeEntry {
        id: format!("t{nanos:x}"),
        day: day.into(),
        minutes,
        note: note.trim().into(),
        ticket,
        worklog: None,
    };
    let rel = time_path(&handle, day).map_err(err)?;
    let text = add_to_month(c.read(&rel)?.as_deref(), entry.clone()).map_err(err)?;
    c.write(&rel, &text)?;
    Ok(entry)
}

/// All the entries of a member that name `key`, from every month.
fn entries_of(c: &Ctx, handle: &str, key: &str) -> Res<Vec<TimeEntry>> {
    let dir = c.root.join("docs/time").join(handle);
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut months: Vec<String> = rd
        .flatten()
        .filter_map(|e| {
            e.file_name()
                .to_string_lossy()
                .strip_suffix(".yaml")
                .map(String::from)
        })
        .collect();
    months.sort();
    let mut out = Vec::new();
    for m in months {
        out.extend(
            month_entries(c, handle, &m)?
                .into_iter()
                .filter(|e| e.ticket.as_deref() == Some(key)),
        );
    }
    Ok(out)
}

/// Fetch the worklogs of a ticket and put them beside the entries (REQ-023, REQ-024). A person
/// asks for it: it is a read of the tracker. It adds nothing, sends nothing and corrects nothing.
pub fn time_rows(s: &AppState, member: Option<&str>, ticket: &str) -> Res<Vec<TimeRow>> {
    let c = ctx(s)?;
    let handle = member_of(&c, member)?;
    let key = ticket_key(ticket);
    let t = tracker(s)?;
    let logs: Vec<TrackerLog> = writer(s, &t)?
        .worklogs(&key)
        .map_err(err)?
        .into_iter()
        .map(|l| TrackerLog {
            id: l.id,
            minutes: l.minutes,
            note: l.note,
        })
        .collect();
    Ok(work::reconcile(&entries_of(&c, &handle, &key)?, &logs))
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TimeSent {
    /// The entry with its receipt.
    pub entry: TimeEntry,
    /// The tracker held a worklog with the mark of the entry. Nothing was sent (REQ-023).
    pub already_there: bool,
}

/// Send one entry to the worklog, on the click of a person (REQ-022). The entry is written
/// already. The tracker is asked for the mark first. The receipt is stored last (REQ-023).
/// `offset_minutes` is the offset of this machine from UTC.
pub fn worklog_send(
    s: &AppState,
    member: Option<&str>,
    day: &str,
    id: &str,
    offset_minutes: i32,
    reduce_remaining: bool,
    click: bool,
) -> Res<TimeSent> {
    need_click(s, click)?;
    if !(-14 * 60..=14 * 60).contains(&offset_minutes) {
        return Err("the offset is not a time zone offset".into());
    }
    let c = ctx(s)?;
    let handle = member_of(&c, member)?;
    let rel = time_path(&handle, day).map_err(err)?;
    // One send of one entry at a time: the second waits, then finds the receipt and is refused.
    let one = lock(&s.work.sending)
        .entry(format!("{}/{rel}#{id}", c.project))
        .or_default()
        .clone();
    let _one = lock(&one);
    let entries = read_time(&c.read(&rel)?.unwrap_or_default()).map_err(err)?;
    let entry = entries
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("no entry `{id}` in {rel}"))?;
    let t = tracker(s)?;
    let w = writer(s, &t)?;
    let (log, already_there) = match writes::send_worklog(
        &*w,
        &Click::by_person(),
        &entry,
        offset_minutes,
        reduce_remaining,
    )
    .map_err(err)?
    {
        Sent::Sent(l) => (l, false),
        Sent::AlreadyThere(l) => (l, true),
    };
    // The send took a while. Read the file again under the guard and set the receipt on that
    // copy: a write of another entry in the meantime stays.
    let _g = s.guard();
    let mut entries = read_time(&c.read(&rel)?.unwrap_or_default()).map_err(err)?;
    let at = entries.iter().position(|e| e.id == id).ok_or_else(|| {
        format!(
            "the entry `{id}` is gone from {rel}: its worklog {} is in the tracker",
            log.id
        )
    })?;
    entries[at].worklog = Some(log.id);
    write_atomic(
        &c.root.join(&rel),
        write_time(&entries).map_err(err)?.as_bytes(),
    )
    .map_err(err)?;
    Ok(TimeSent {
        entry: entries.swap_remove(at),
        already_there,
    })
}

// ---------------------------------------------------------------- plan and apply

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRow {
    pub reference: String,
    pub action: Action,
    /// The key of the ticket that the row wrote or matched.
    pub key: Option<String>,
    /// Why the row failed. The rows before it stay written (REQ-026).
    pub error: Option<String>,
    /// The fields that this tracker cannot hold. They were not sent.
    pub skipped: Vec<Field>,
}

impl From<RowResult> for ApplyRow {
    fn from(r: RowResult) -> Self {
        Self {
            reference: r.reference,
            action: r.action,
            key: r.key,
            error: r.error,
            skipped: r.skipped,
        }
    }
}

/// The rows of the sheets now. The effort is read from the sheets here and kept nowhere (REQ-019).
fn rows_of(c: &Ctx, slugs: &[String]) -> Res<Vec<Row>> {
    let mut out = Vec::new();
    for slug in slugs {
        out.extend(work::rows(slug, &c.sheet(slug)?));
    }
    Ok(out)
}

/// Mark each row create, update or unchanged against the mirror (REQ-025). It sends nothing.
pub fn preview(s: &AppState, slugs: &[String]) -> Res<Vec<DiffRow>> {
    let c = ctx(s)?;
    let t = tracker(s)?;
    Ok(writes::diff(
        &t.caps,
        rows_of(&c, slugs)?,
        &mirror_items(s, &t)?,
    ))
}

pub(crate) fn container(t: &Target) -> Res<&str> {
    t.scope.as_deref().ok_or_else(|| {
        "set the tracker scope in .shipyard/project.yaml (connections.trackerScope)".to_string()
    })
}

/// Write the rows to the tracker, on the click of a person (REQ-026). The preview is computed
/// again from the sheets and the mirror, so a stale preview writes nothing that the sheets no
/// longer say. A failed row keeps the rows before it. Status and assignee are never written.
pub fn apply(s: &AppState, slugs: &[String], click: bool) -> Res<Vec<ApplyRow>> {
    need_click(s, click)?;
    let c = ctx(s)?;
    let t = tracker(s)?;
    container(&t)?;
    let diff = writes::diff(&t.caps, rows_of(&c, slugs)?, &mirror_items(s, &t)?);
    write_diff(s, &t, &diff)
}

/// Send a diff to the container of the tracker and read the written tickets again. The caller has
/// the click. The Specs split uses it too (`specs` REQ-018).
pub(crate) fn write_diff(s: &AppState, t: &Target, diff: &[DiffRow]) -> Res<Vec<ApplyRow>> {
    let scope = container(t)?;
    let w = writer(s, t)?;
    let results = writes::apply(&*w, scope, diff);
    refresh(
        s,
        t,
        &*w,
        results
            .iter()
            .filter(|r| r.error.is_none() && r.action != Action::Unchanged)
            .filter_map(|r| r.key.clone()),
    );
    Ok(results.into_iter().map(Into::into).collect())
}

/// A row for one work item that a person asks for from a ref (REQ-029). The ref is the match mark.
fn item_row(row: &Row) -> Res<()> {
    if parse(&row.reference).is_none() {
        return Err(format!("`{}` is not a ref", row.reference));
    }
    if row.title.trim().is_empty() {
        return Err("the title is empty".into());
    }
    Ok(())
}

/// The preview of one row (REQ-029, REQ-025). It sends nothing.
pub fn item_preview(s: &AppState, row: Row) -> Res<DiffRow> {
    item_row(&row)?;
    let t = tracker(s)?;
    Ok(writes::diff(&t.caps, vec![row], &mirror_items(s, &t)?).remove(0))
}

/// Create one work item after one click. A second click finds the ticket by its label and
/// creates none (REQ-029).
pub fn item_create(s: &AppState, row: Row, click: bool) -> Res<ApplyRow> {
    need_click(s, click)?;
    item_row(&row)?;
    let t = tracker(s)?;
    let scope = container(&t)?;
    let w = writer(s, &t)?;
    let r = writes::create_from_ref(&*w, scope, row, &mirror_items(s, &t)?);
    if r.error.is_none() && r.action != Action::Unchanged {
        refresh(s, &t, &*w, r.key.clone());
    }
    Ok(r.into())
}

// ---------------------------------------------------------------- commands

#[tauri::command]
#[specta::specta]
pub async fn work_context(app: AppHandle, offset_minutes: i32) -> Res<WorkContext> {
    blocking(app, move |s| context(s, offset_minutes)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_team(app: AppHandle) -> Res<TeamView> {
    blocking(app, team_get).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_team_save(app: AppHandle, team: Team) -> Res<TeamView> {
    blocking(app, move |s| team_save(s, team)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_suggest(app: AppHandle, key: String) -> Res<Vec<Suggestion>> {
    blocking(app, move |s| suggest(s, &key)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_assign(app: AppHandle, key: String, member: String, click: bool) -> Res<()> {
    blocking(app, move |s| assign(s, &key, &member, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_mark(app: AppHandle, key: String, click: bool) -> Res<()> {
    blocking(app, move |s| mark(s, &key, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_ticket_comments(app: AppHandle, key: String) -> Res<Vec<TicketComment>> {
    blocking(app, move |s| ticket_comments(s, &key)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_ticket_comment_add(
    app: AppHandle,
    key: String,
    body: String,
    click: bool,
) -> Res<()> {
    blocking(app, move |s| ticket_comment_add(s, &key, &body, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_ticket_edit(
    app: AppHandle,
    key: String,
    title: Option<String>,
    description: Option<String>,
    days: Option<f64>,
    click: bool,
) -> Res<Vec<String>> {
    blocking(app, move |s| {
        ticket_edit(s, &key, title, description, days, click)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn work_ticket_label_add(
    app: AppHandle,
    key: String,
    label: String,
    click: bool,
) -> Res<()> {
    blocking(app, move |s| ticket_label_add(s, &key, &label, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_transition(app: AppHandle, key: String, to: String, click: bool) -> Res<()> {
    blocking(app, move |s| transition(s, &key, &to, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_seal_state(app: AppHandle) -> Res<SealState> {
    blocking(app, seal_state).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_unlock(app: AppHandle, passphrase: String) -> Res<SealState> {
    blocking(app, move |s| unlock(s, &passphrase)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_lock(app: AppHandle) -> Res<SealState> {
    blocking(app, lock_session).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_seal(app: AppHandle, passphrase: String) -> Res<SealState> {
    blocking(app, move |s| seal_all(s, &passphrase)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_unseal(app: AppHandle, passphrase: String) -> Res<SealState> {
    blocking(app, move |s| unseal_all(s, &passphrase)).await
}

#[tauri::command]
#[specta::specta]
pub async fn estimate_list(app: AppHandle) -> Res<Vec<SheetItem>> {
    blocking(app, list_sheets).await
}

#[tauri::command]
#[specta::specta]
pub async fn estimate_get(app: AppHandle, slug: String) -> Res<SheetView> {
    blocking(app, move |s| sheet_get(s, &slug)).await
}

#[tauri::command]
#[specta::specta]
pub async fn estimate_save(app: AppHandle, slug: String, sheet: Sheet) -> Res<SheetView> {
    blocking(app, move |s| sheet_save(s, &slug, sheet)).await
}

#[tauri::command]
#[specta::specta]
pub async fn estimate_portfolio(app: AppHandle) -> Res<Portfolio> {
    blocking(app, portfolio).await
}

#[tauri::command]
#[specta::specta]
pub async fn excel_preview(app: AppHandle, path: String, scope: Option<String>) -> Res<Preview> {
    blocking(app, move |s| excel_read(s, &path, scope.as_deref())).await
}

#[tauri::command]
#[specta::specta]
pub async fn excel_confirm(app: AppHandle, slug: String, confirmed: bool) -> Res<SheetView> {
    blocking(app, move |s| excel_replace(s, &slug, confirmed)).await
}

#[tauri::command]
#[specta::specta]
pub async fn excel_export(app: AppHandle, slug: String, path: String) -> Res<()> {
    blocking(app, move |s| excel_write(s, &slug, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn plan_get(app: AppHandle, slug: String) -> Res<PlanView> {
    blocking(app, move |s| plan(s, &slug)).await
}

#[tauri::command]
#[specta::specta]
pub async fn plan_decisions_save(app: AppHandle, decisions: Decisions) -> Res<()> {
    blocking(app, move |s| decisions_save(s, &decisions)).await
}

#[tauri::command]
#[specta::specta]
pub async fn plan_calendar_save(app: AppHandle, calendar: Calendar) -> Res<()> {
    blocking(app, move |s| calendar_save(s, &calendar)).await
}

#[tauri::command]
#[specta::specta]
pub async fn time_list(app: AppHandle, member: Option<String>, month: String) -> Res<TimeView> {
    blocking(app, move |s| time_month(s, member.as_deref(), &month)).await
}

#[tauri::command]
#[specta::specta]
pub async fn time_add(
    app: AppHandle,
    member: Option<String>,
    day: String,
    minutes: u32,
    note: String,
    ticket: Option<String>,
) -> Res<TimeEntry> {
    blocking(app, move |s| {
        time_write(
            s,
            member.as_deref(),
            &day,
            minutes,
            &note,
            ticket.as_deref(),
        )
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn time_fetch(
    app: AppHandle,
    member: Option<String>,
    ticket: String,
) -> Res<Vec<TimeRow>> {
    blocking(app, move |s| time_rows(s, member.as_deref(), &ticket)).await
}

#[tauri::command]
#[specta::specta]
pub async fn time_send(
    app: AppHandle,
    member: Option<String>,
    day: String,
    id: String,
    offset_minutes: i32,
    reduce_remaining: bool,
    click: bool,
) -> Res<TimeSent> {
    blocking(app, move |s| {
        worklog_send(
            s,
            member.as_deref(),
            &day,
            &id,
            offset_minutes,
            reduce_remaining,
            click,
        )
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn apply_preview(app: AppHandle, slugs: Vec<String>) -> Res<Vec<DiffRow>> {
    blocking(app, move |s| preview(s, &slugs)).await
}

#[tauri::command]
#[specta::specta]
pub async fn apply_run(app: AppHandle, slugs: Vec<String>, click: bool) -> Res<Vec<ApplyRow>> {
    blocking(app, move |s| apply(s, &slugs, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_item_preview(app: AppHandle, row: Row) -> Res<DiffRow> {
    blocking(app, move |s| item_preview(s, row)).await
}

#[tauri::command]
#[specta::specta]
pub async fn work_item_create(app: AppHandle, row: Row, click: bool) -> Res<ApplyRow> {
    blocking(app, move |s| item_create(s, row, click)).await
}

#[cfg(test)]
pub(crate) mod tests;
