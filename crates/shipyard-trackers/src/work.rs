//! Tracker writes for the Work space (spec `work`, REQ-002, REQ-006, REQ-008, REQ-022, REQ-023,
//! REQ-026, REQ-029): assign, label, transition, worklog, and the apply of estimate rows.
//!
//! A write is a function that a person's action calls. The adapters in the other modules read only.
//! A worklog needs a [`Click`]: nothing in a run or a tick builds one (REQ-022).
//!
//! Built for every kind: Jira (Cloud and Data Center), GitHub Issues, GitLab Issues, Azure DevOps
//! and Linear. A call that needs a capability that the kind lacks answers
//! [`TrackerError::Unsupported`] and sends nothing (REQ-003). The comment calls also serve the claim
//! stamp of `add-sync` and the questions of `add-questions-loop`: see [`crate::marker`].
//!
//! shortcut: calls run one after the other with no pause between them; add a spacing when a tracker
//! answers 429 on a large apply.

use crate::github::{self, GitHub};
use crate::gitlab::GitLab;
use crate::jira::{API, EpicFields, Flavor, Jira};
use crate::linear::Linear;
use crate::marker;
use crate::model::*;
use crate::{Tracker, TrackerConfig, azure::Azure};
use serde::Serialize;
use serde_json::{Value, json};
use shipyard_core::work::{
    Action, DiffRow, Field, MINUTES_PER_DAY, Row, RowKind, TimeEntry, parse_day, parse_mark,
    plan_diff, worklog_note,
};
use shipyard_http::{Auth, Http, Method, Request, Response, build_url, encode, items, num, text};
use shipyard_secrets::Secret;
use std::collections::HashMap;
use std::sync::Arc;

/// The proof that a person acted. Only a command that a person invoked builds it. A worklog write
/// takes one, so an agent, a run or a tick cannot send a worklog (REQ-022).
pub struct Click(());

impl Click {
    pub fn by_person() -> Self {
        Click(())
    }
}

/// A worklog as the tracker holds it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Worklog {
    pub id: String,
    pub minutes: u32,
    pub note: String,
    pub started: String,
}

pub struct NewWorklog<'a> {
    pub minutes: u32,
    pub note: &'a str,
    /// The instant of the work, in the format of the tracker. See [`started_at`].
    pub started: &'a str,
    /// Reduce the remaining estimate by the time. A person chooses (REQ-022).
    pub reduce_remaining: bool,
}

/// The fields that a write sets. A field that is `None` is left as it is. The status and the
/// assignee are not here: apply never writes them (REQ-026).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Fields {
    pub title: Option<String>,
    pub description: Option<String>,
    pub days: Option<f64>,
    /// The key of the parent ticket.
    pub parent: Option<String>,
}

/// What a create or an update wrote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Written {
    pub key: String,
    /// The fields that this tracker cannot hold. They were not sent.
    pub skipped: Vec<Field>,
}

pub trait TrackerWrite: Tracker {
    /// Needs the `assignee` flag. `account` is the id that the tracker uses (`Team::resolve`).
    fn assign(&self, key: &str, account: &str) -> Result<(), TrackerError>;

    /// Needs the `labels` flag. The pickup label of REQ-008 goes through here.
    fn add_label(&self, key: &str, label: &str) -> Result<(), TrackerError>;

    /// Needs the `labels` flag. A label that the ticket does not hold is not an error.
    fn remove_label(&self, _key: &str, _label: &str) -> Result<(), TrackerError> {
        Err(Capability::Labels.into())
    }

    /// `priority` is one of [`PRIORITIES`]. A tracker with no priority field refuses (Q-123).
    fn set_priority(&self, _key: &str, _priority: &str) -> Result<(), TrackerError> {
        Err(TrackerError::Refused(
            "this tracker has no priority field".into(),
        ))
    }

    /// The issue type by its name in the tracker (`Bug`, `Story`; `issue`, `incident` on GitLab).
    /// A tracker with no type field refuses (Q-125).
    fn set_issue_type(&self, _key: &str, _name: &str) -> Result<(), TrackerError> {
        Err(TrackerError::Refused(
            "this tracker has no issue type to change".into(),
        ))
    }

    /// The due day as `YYYY-MM-DD`. `None` clears it. A tracker with no due date refuses (Q-125).
    fn set_due_date(&self, _key: &str, _day: Option<&str>) -> Result<(), TrackerError> {
        Err(TrackerError::Refused("this tracker has no due date".into()))
    }

    /// Needs the `transitions` flag. A refusal is [`TrackerError::Refused`] with the reason (REQ-002).
    fn transition(&self, key: &str, to: &str) -> Result<(), TrackerError>;

    /// Needs the `time_tracking` flag.
    fn add_worklog(
        &self,
        click: &Click,
        key: &str,
        log: &NewWorklog,
    ) -> Result<Worklog, TrackerError>;

    /// Needs the `time_tracking` flag.
    fn worklogs(&self, key: &str) -> Result<Vec<Worklog>, TrackerError>;

    /// Create a ticket in `scope`, with `label` on it for the match of a later apply (Q-033).
    fn create(
        &self,
        scope: &str,
        epic: bool,
        fields: &Fields,
        label: &str,
    ) -> Result<Written, TrackerError>;

    fn update(&self, key: &str, fields: &Fields) -> Result<Written, TrackerError>;

    /// The issue type names that a create uses for an epic and for a story. Only Jira has such
    /// types: the other trackers ignore the call.
    fn set_issue_types(&self, _epic: &str, _story: &str) {}

    /// One page of comments, oldest first, with id, author, created time and body. `cursor` is
    /// `Page::next` of the page before, `None` for the first. Needs the `comments` flag. The body
    /// holds the canonical marker, never the wire form ([`crate::marker`]).
    fn comments_page(&self, key: &str, cursor: Option<&str>)
    -> Result<Page<Comment>, TrackerError>;

    /// Post a comment and return its id. Write the marker of [`crate::marker::make`] in `body`.
    /// Needs the `comments` flag. A comment is not a worklog: no [`Click`].
    fn add_comment(&self, key: &str, body: &str) -> Result<String, TrackerError>;

    /// Replace the body of a comment. A comment of another person is [`TrackerError::Refused`].
    fn edit_comment(&self, key: &str, id: &str, body: &str) -> Result<(), TrackerError>;

    /// Delete a comment. A comment of another person is [`TrackerError::Refused`].
    fn delete_comment(&self, key: &str, id: &str) -> Result<(), TrackerError>;
}

/// The priorities of the edit, highest first. A tracker maps them to its own scale.
pub const PRIORITIES: [&str; 5] = ["highest", "high", "medium", "low", "lowest"];

/// The place of a priority in [`PRIORITIES`], from 1 (highest) to 5.
pub(crate) fn rank(priority: &str) -> Result<u8, TrackerError> {
    PRIORITIES
        .iter()
        .position(|p| p.eq_ignore_ascii_case(priority.trim()))
        .map(|i| i as u8 + 1)
        .ok_or_else(|| TrackerError::Config(format!("`{priority}` is not a priority")))
}

/// Every comment of a ticket, oldest first. It follows the cursor of [`TrackerWrite::comments_page`].
/// shortcut: it stops after 50 pages (5,000 comments).
pub fn all_comments(w: &dyn TrackerWrite, key: &str) -> Result<Vec<Comment>, TrackerError> {
    every(|cursor| w.comments_page(key, cursor))
}

/// Build the writer of a connection. Same checks as [`crate::connect`].
pub fn connect_write(
    config: &TrackerConfig,
    secret: Secret,
    http: Arc<dyn Http>,
) -> Result<Box<dyn TrackerWrite>, TrackerError> {
    let base = || shipyard_http::base_url(&config.url).map_err(TrackerError::from);
    Ok(match config.kind {
        TrackerKind::JiraCloud => {
            let user = config.user.clone().filter(|u| !u.trim().is_empty());
            let user = user
                .ok_or_else(|| TrackerError::Config("Jira Cloud needs the account email".into()))?;
            Box::new(Jira::cloud(http, base()?, user, secret))
        }
        TrackerKind::JiraDataCenter => Box::new(Jira::data_center(http, base()?, secret)),
        TrackerKind::GitHubIssues => Box::new(GitHub::new(http, &base()?, secret)),
        TrackerKind::GitLabIssues => Box::new(GitLab::new(http, &base()?, secret)),
        TrackerKind::AzureDevOps => Box::new(Azure::new(http, base()?, secret)),
        TrackerKind::Linear => Box::new(Linear::new(http, secret)),
    })
}

// ---------------------------------------------------------------- the sends of a person

/// A time entry, sent or found (REQ-023).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum Sent {
    /// The worklog went out. The id is the receipt to store.
    Sent(Worklog),
    /// The tracker already held a worklog with the mark of the entry. Nothing was sent.
    AlreadyThere(Worklog),
}

/// `YYYY-MM-DDT09:00:00.000+0100`: the day anchors at 09:00 in the offset of the machine.
/// The tracker then shows the day that the person meant, in any zone (Legacy `docs/jira-temps.md`).
pub fn started_at(day: &str, offset_minutes: i32) -> Result<String, TrackerError> {
    if parse_day(day).is_none() {
        return Err(TrackerError::Config(format!("`{day}` is not a date")));
    }
    let sign = if offset_minutes < 0 { '-' } else { '+' };
    let abs = offset_minutes.abs();
    Ok(format!(
        "{day}T09:00:00.000{sign}{:02}{:02}",
        abs / 60,
        abs % 60
    ))
}

/// Send one time entry to the worklog of its ticket, on the action of a person (REQ-022).
///
/// The order is the one of REQ-023. The caller has written the entry. This function looks up the
/// mark of the entry in the tracker first, and sends only when none has it. A failed lookup sends
/// nothing. A lost answer is [`TrackerError::Lost`]: the next call finds the worklog by its mark.
/// The caller stores the receipt third.
pub fn send_worklog(
    w: &dyn TrackerWrite,
    click: &Click,
    entry: &TimeEntry,
    offset_minutes: i32,
    reduce_remaining: bool,
) -> Result<Sent, TrackerError> {
    w.capabilities().require(Capability::TimeTracking)?;
    if entry.worklog.is_some() {
        return Err(TrackerError::Refused(
            "the entry has a receipt: it is in the tracker".into(),
        ));
    }
    let key = entry
        .ticket
        .as_deref()
        .ok_or_else(|| TrackerError::Config("the entry names no ticket".into()))?;
    if let Some(found) = w
        .worklogs(key)?
        .into_iter()
        .find(|l| parse_mark(&l.note).as_deref() == Some(&entry.id))
    {
        return Ok(Sent::AlreadyThere(found));
    }
    let note = worklog_note(&entry.note, &entry.id);
    let started = started_at(&entry.day, offset_minutes)?;
    let log = NewWorklog {
        minutes: entry.minutes,
        note: &note,
        started: &started,
        reduce_remaining,
    };
    match w.add_worklog(click, key, &log) {
        Ok(l) => Ok(Sent::Sent(l)),
        Err(TrackerError::Http(shipyard_http::Error::Transport(e))) => Err(TrackerError::Lost(e)),
        Err(e) => Err(e),
    }
}

// ---------------------------------------------------------------- apply

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RowResult {
    pub reference: String,
    pub action: Action,
    pub key: Option<String>,
    /// The reason that the row failed. The rows before it stay written (REQ-026).
    pub error: Option<String>,
    pub skipped: Vec<Field>,
}

fn fields(row: &Row, parent: Option<&str>, only: Option<&[Field]>) -> Fields {
    let want = |f: Field| only.is_none_or(|o| o.contains(&f));
    Fields {
        title: want(Field::Title).then(|| row.title.clone()),
        description: want(Field::Description).then(|| row.description.clone()),
        days: row.days.filter(|_| want(Field::Estimate)),
        parent: parent.filter(|_| want(Field::Parent)).map(String::from),
    }
}

/// The preview of REQ-025 for one tracker: [`plan_diff`], without the fields that the tracker
/// cannot hold. A flat tracker has no parent and no estimate, so they are no change there.
pub fn diff(caps: &Capabilities, rows: Vec<Row>, mirror: &[WorkItem]) -> Vec<DiffRow> {
    plan_diff(rows, mirror)
        .into_iter()
        .map(|d| fit(caps, d))
        .collect()
}

fn fit(caps: &Capabilities, mut d: DiffRow) -> DiffRow {
    if d.action == Action::Update {
        d.changes.retain(|f| match f {
            Field::Parent => caps.hierarchy,
            Field::Estimate => caps.time_tracking,
            _ => true,
        });
        if d.changes.is_empty() {
            d.action = Action::Unchanged;
        }
    }
    d
}

/// The ticket that holds `label`, from the tracker and not from the mirror.
fn existing(
    w: &dyn TrackerWrite,
    scope: &str,
    label: &str,
) -> Result<Option<WorkItem>, TrackerError> {
    let page = w.search(&WorkQuery {
        scope: Some(scope.into()),
        label: Some(label.into()),
        limit: 5,
        ..WorkQuery::default()
    })?;
    Ok(page
        .items
        .into_iter()
        .find(|i| i.labels.iter().any(|l| l == label)))
}

/// Write the rows of a preview, one at a time, in order, on the action of a person (REQ-026).
///
/// Each result says what happened. A failed row stops nothing that is written: the rows before
/// it stay, and a row after it runs unless it needs the ticket of the failed row. A row that has
/// no ticket in the preview is looked up in the tracker by its label before it is created, so a
/// second apply on a stale mirror, or after a lost answer, creates no duplicate. The status and
/// the assignee are never written.
pub fn apply(w: &dyn TrackerWrite, scope: &str, rows: &[DiffRow]) -> Vec<RowResult> {
    let caps = w.capabilities();
    let mut keys: HashMap<&str, String> = rows
        .iter()
        .filter_map(|d| d.key.clone().map(|k| (d.row.reference.as_str(), k)))
        .collect();
    let mut out = Vec::new();
    for d in rows {
        let row = &d.row;
        let mut result = RowResult {
            reference: row.reference.clone(),
            action: d.action,
            key: d.key.clone(),
            error: None,
            skipped: vec![],
        };
        let outcome = (|| -> Result<(), String> {
            let (mut action, mut key, mut changes) = (d.action, d.key.clone(), d.changes.clone());
            // The ticket of the epic: this run, or the preview. A row that does not write the parent
            // does not need it.
            let epic = |needed: bool| -> Result<Option<String>, String> {
                match row.parent.as_deref() {
                    Some(p) if caps.hierarchy && needed => {
                        Ok(Some(keys.get(p).cloned().ok_or("its epic has no ticket")?))
                    }
                    _ => Ok(None),
                }
            };
            if action == Action::Create
                && let Some(item) = existing(w, scope, &row.reference).map_err(|e| e.to_string())?
            {
                let mut flat = row.clone();
                flat.parent = None;
                let found = fit(
                    &caps,
                    plan_diff(vec![flat], std::slice::from_ref(&item)).remove(0),
                );
                changes = found.changes;
                if row.parent.is_some() && caps.hierarchy && item.parent != epic(true)? {
                    changes.push(Field::Parent);
                }
                action = if changes.is_empty() {
                    Action::Unchanged
                } else {
                    Action::Update
                };
                key = Some(item.key);
            }
            result.action = action;
            result.key = key.clone();
            match action {
                Action::Unchanged => {}
                Action::Create => {
                    let parent = epic(true)?;
                    let made = w
                        .create(
                            scope,
                            row.kind == RowKind::Epic,
                            &fields(row, parent.as_deref(), None),
                            &row.reference,
                        )
                        .map_err(|e| e.to_string())?;
                    result.key = Some(made.key);
                    result.skipped = made.skipped;
                }
                Action::Update => {
                    let key = key.as_deref().ok_or("no ticket to update")?;
                    let parent = epic(changes.contains(&Field::Parent))?;
                    let done = w
                        .update(key, &fields(row, parent.as_deref(), Some(&changes)))
                        .map_err(|e| e.to_string())?;
                    result.skipped = done.skipped;
                }
            }
            if row.parent.is_some() && !caps.hierarchy && result.action != Action::Unchanged {
                result.skipped.push(Field::Parent);
            }
            Ok(())
        })();
        if let Err(e) = outcome {
            result.error = Some(e);
        } else if let Some(k) = &result.key {
            keys.insert(row.reference.as_str(), k.clone());
        }
        out.push(result);
    }
    out
}

/// Create one work item from a ref after one click of a person (REQ-029). It is the apply of
/// REQ-026 for one row. The row carries the source ref as its label, so a second click finds the
/// ticket and creates none.
pub fn create_from_ref(
    w: &dyn TrackerWrite,
    scope: &str,
    row: Row,
    mirror: &[WorkItem],
) -> RowResult {
    apply(w, scope, &diff(&w.capabilities(), vec![row], mirror)).remove(0)
}

// ---------------------------------------------------------------- Jira

fn minutes(days: f64) -> u32 {
    (days * f64::from(MINUTES_PER_DAY)).round() as u32
}

impl Jira {
    fn issue_type(&self, epic: bool) -> String {
        match self.types.lock().expect("types lock").as_ref() {
            Some((e, s)) => if epic { e } else { s }.clone(),
            None => if epic { "Epic" } else { "Story" }.into(),
        }
    }

    fn send(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        body: Value,
    ) -> Result<Response, TrackerError> {
        let url = build_url(&self.base, path, query);
        Ok(self
            .http
            .send(&Request::write(method, url, self.auth.clone(), body))?
            .ok()?)
    }

    fn read(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, TrackerError> {
        let url = build_url(&self.base, path, query);
        Ok(self.http.json(&Request::get(url, self.auth.clone()))?)
    }

    fn remove(&self, path: &str) -> Result<(), TrackerError> {
        let url = build_url(&self.base, path, &[]);
        self.http
            .send(&Request::delete(url, self.auth.clone()))?
            .ok()?;
        Ok(())
    }

    /// The ids of the epic fields. Data Center keeps them in custom fields that differ by
    /// instance, so one `GET /field` finds them. The answer is kept for the connection.
    fn epic_fields(&self) -> Result<EpicFields, TrackerError> {
        let mut cache = self.epic.lock().expect("epic lock");
        if let Some(found) = cache.as_ref() {
            return Ok(found.clone());
        }
        let all = self.read(&format!("{API}/field"), &[])?;
        let by = |custom: &str| {
            all.as_array()?
                .iter()
                .find(|f| text(f, "/schema/custom") == custom)
                .map(|f| text(f, "/id"))
                .filter(|id| !id.is_empty())
        };
        let found = EpicFields {
            link: by("com.pyxis.greenhopper.jira:gh-epic-link"),
            name: by("com.pyxis.greenhopper.jira:gh-epic-label"),
        };
        *cache = Some(found.clone());
        Ok(found)
    }
}

/// A 403 on the edit or the delete of a comment: the tracker lets a person change their own only.
pub(crate) fn own(e: TrackerError) -> TrackerError {
    match e {
        TrackerError::Http(shipyard_http::Error::Status {
            status: 403,
            detail,
            ..
        }) => TrackerError::Refused(format!("only the author can change this comment: {detail}")),
        other => other,
    }
}

/// A 400 or 409 on a transition is the workflow saying no.
pub(crate) fn refused(e: TrackerError) -> TrackerError {
    match e {
        TrackerError::Http(shipyard_http::Error::Status {
            status: 400 | 409 | 422,
            detail,
            ..
        }) => TrackerError::Refused(detail),
        other => other,
    }
}

fn jira_worklog(v: &Value) -> Worklog {
    Worklog {
        id: text(v, "/id"),
        minutes: (num(v, "/timeSpentSeconds").unwrap_or(0) / 60) as u32,
        note: text(v, "/comment"),
        started: text(v, "/started"),
    }
}

impl TrackerWrite for Jira {
    fn set_issue_types(&self, epic: &str, story: &str) {
        let (epic, story) = (epic.trim(), story.trim());
        if !epic.is_empty() && !story.is_empty() {
            *self.types.lock().expect("types lock") = Some((epic.into(), story.into()));
        }
    }

    fn assign(&self, key: &str, account: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Assignee)?;
        let body = match self.flavor {
            Flavor::Cloud => json!({ "accountId": account }),
            Flavor::DataCenter => json!({ "name": account }),
        };
        self.send(
            Method::Put,
            &format!("{API}/issue/{}/assignee", encode(key)),
            &[],
            body,
        )?;
        Ok(())
    }

    fn add_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        let body = json!({ "update": { "labels": [{ "add": label }] } });
        self.send(
            Method::Put,
            &format!("{API}/issue/{}", encode(key)),
            &[],
            body,
        )?;
        Ok(())
    }

    fn remove_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        let body = json!({ "update": { "labels": [{ "remove": label }] } });
        self.send(
            Method::Put,
            &format!("{API}/issue/{}", encode(key)),
            &[],
            body,
        )?;
        Ok(())
    }

    fn set_priority(&self, key: &str, priority: &str) -> Result<(), TrackerError> {
        // The default Jira scheme names: Highest, High, Medium, Low, Lowest.
        let name = PRIORITIES[usize::from(rank(priority)? - 1)];
        let name = format!("{}{}", name[..1].to_uppercase(), &name[1..]);
        self.send(
            Method::Put,
            &format!("{API}/issue/{}", encode(key)),
            &[],
            json!({ "fields": { "priority": { "name": name } } }),
        )?;
        Ok(())
    }

    fn set_issue_type(&self, key: &str, name: &str) -> Result<(), TrackerError> {
        self.send(
            Method::Put,
            &format!("{API}/issue/{}", encode(key)),
            &[],
            json!({ "fields": { "issuetype": { "name": name } } }),
        )
        .map(|_| ())
        .map_err(refused)
    }

    fn set_due_date(&self, key: &str, day: Option<&str>) -> Result<(), TrackerError> {
        self.send(
            Method::Put,
            &format!("{API}/issue/{}", encode(key)),
            &[],
            json!({ "fields": { "duedate": day } }),
        )?;
        Ok(())
    }

    fn transition(&self, key: &str, to: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Transitions)?;
        let path = format!("{API}/issue/{}/transitions", encode(key));
        let listed = self.read(&path, &[])?;
        let all = items(&listed, "/transitions");
        let wanted = all.iter().find(|t| {
            text(t, "/to/name").eq_ignore_ascii_case(to)
                || text(t, "/name").eq_ignore_ascii_case(to)
        });
        let Some(t) = wanted else {
            let names: Vec<String> = all.iter().map(|t| text(t, "/to/name")).collect();
            return Err(TrackerError::Refused(format!(
                "{key} cannot move to {to} from its status. It can move to: {}",
                names.join(", ")
            )));
        };
        self.send(
            Method::Post,
            &path,
            &[],
            json!({ "transition": { "id": text(t, "/id") } }),
        )
        .map(|_| ())
        .map_err(refused)
    }

    fn add_worklog(
        &self,
        _click: &Click,
        key: &str,
        log: &NewWorklog,
    ) -> Result<Worklog, TrackerError> {
        self.capabilities().require(Capability::TimeTracking)?;
        let adjust = if log.reduce_remaining {
            "auto"
        } else {
            "leave"
        };
        let body = json!({
            "timeSpentSeconds": u64::from(log.minutes) * 60,
            "started": log.started,
            "comment": log.note,
        });
        let res = self.send(
            Method::Post,
            &format!("{API}/issue/{}/worklog", encode(key)),
            &[("adjustEstimate", adjust)],
            body,
        )?;
        Ok(jira_worklog(&res.json()?))
    }

    fn worklogs(&self, key: &str) -> Result<Vec<Worklog>, TrackerError> {
        self.capabilities().require(Capability::TimeTracking)?;
        let v = self
            .read(
                &format!("{API}/issue/{}/worklog", encode(key)),
                &[("maxResults", "1000")],
            )
            .map_err(|e| e.not_found(key))?;
        Ok(items(&v, "/worklogs").iter().map(jira_worklog).collect())
    }

    fn create(
        &self,
        scope: &str,
        epic: bool,
        f: &Fields,
        label: &str,
    ) -> Result<Written, TrackerError> {
        let mut skipped = Vec::new();
        let mut fields = json!({
            "project": { "key": scope },
            "summary": f.title.clone().unwrap_or_default(),
            "description": f.description.clone().unwrap_or_default(),
            "issuetype": { "name": self.issue_type(epic) },
            "labels": [label],
        });
        if epic
            && self.flavor == Flavor::DataCenter
            && let Some(id) = self.epic_fields()?.name
        {
            // Data Center refuses an epic with no `Epic Name`.
            fields[id] = json!(f.title.clone().unwrap_or_default());
        }
        self.set(&mut fields, f, &mut skipped)?;
        let res = self.send(
            Method::Post,
            &format!("{API}/issue"),
            &[],
            json!({ "fields": fields }),
        )?;
        Ok(Written {
            key: text(&res.json()?, "/key"),
            skipped,
        })
    }

    fn update(&self, key: &str, f: &Fields) -> Result<Written, TrackerError> {
        let mut skipped = Vec::new();
        let mut fields = json!({});
        if let Some(t) = &f.title {
            fields["summary"] = json!(t);
        }
        if let Some(d) = &f.description {
            fields["description"] = json!(d);
        }
        self.set(
            &mut fields,
            &Fields {
                title: None,
                description: None,
                ..f.clone()
            },
            &mut skipped,
        )?;
        self.send(
            Method::Put,
            &format!("{API}/issue/{}", encode(key)),
            &[],
            json!({ "fields": fields }),
        )?;
        Ok(Written {
            key: key.into(),
            skipped,
        })
    }

    fn comments_page(
        &self,
        key: &str,
        cursor: Option<&str>,
    ) -> Result<Page<Comment>, TrackerError> {
        self.comment_page(key, cursor)
    }

    fn add_comment(&self, key: &str, body: &str) -> Result<String, TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let res = self.send(
            Method::Post,
            &format!("{API}/issue/{}/comment", encode(key)),
            &[],
            json!({ "body": marker::to_wire(body, true) }),
        )?;
        Ok(text(&res.json()?, "/id"))
    }

    fn edit_comment(&self, key: &str, id: &str, body: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let id = digits("comment", id)?;
        self.send(
            Method::Put,
            &format!("{API}/issue/{}/comment/{id}", encode(key)),
            &[],
            json!({ "body": marker::to_wire(body, true) }),
        )
        .map(|_| ())
        .map_err(own)
    }

    fn delete_comment(&self, key: &str, id: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let id = digits("comment", id)?;
        self.remove(&format!("{API}/issue/{}/comment/{id}", encode(key)))
            .map_err(own)
    }
}

impl Jira {
    /// The estimate and the parent. Data Center links a story to an epic through the `Epic Link`
    /// custom field. A Data Center without that field cannot hold the parent: it is skipped.
    fn set(
        &self,
        fields: &mut Value,
        f: &Fields,
        skipped: &mut Vec<Field>,
    ) -> Result<(), TrackerError> {
        if let Some(d) = f.days {
            fields["timetracking"] = json!({ "originalEstimate": format!("{}m", minutes(d)) });
        }
        match (&f.parent, self.flavor) {
            (Some(p), Flavor::Cloud) => fields["parent"] = json!({ "key": p }),
            (Some(p), Flavor::DataCenter) => match self.epic_fields()?.link {
                Some(id) => fields[id] = json!(p),
                None => skipped.push(Field::Parent),
            },
            (None, _) => {}
        }
        Ok(())
    }
}

// ---------------------------------------------------------------- GitHub

impl GitHub {
    fn send(&self, method: Method, path: &str, body: Value) -> Result<Response, TrackerError> {
        let req = Request::write(
            method,
            format!("{}{path}", self.api),
            Auth::Bearer(self.token.clone()),
            body,
        )
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
        Ok(self.http.send(&req)?.ok()?)
    }

    fn remove(&self, path: &str) -> Result<(), TrackerError> {
        let req = Request::delete(
            format!("{}{path}", self.api),
            Auth::Bearer(self.token.clone()),
        )
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
        self.http.send(&req)?.ok()?;
        Ok(())
    }

    fn patch(&self, key: &str, body: Value) -> Result<(), TrackerError> {
        let (slug, number) = github::split_key(key)?;
        self.send(
            Method::Patch,
            &format!("/repos/{slug}/issues/{number}"),
            body,
        )?;
        Ok(())
    }
}

impl TrackerWrite for GitHub {
    fn assign(&self, key: &str, account: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Assignee)?;
        self.patch(key, json!({ "assignees": [account] }))
    }

    fn add_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        let (slug, number) = github::split_key(key)?;
        self.send(
            Method::Post,
            &format!("/repos/{slug}/issues/{number}/labels"),
            json!({ "labels": [label] }),
        )?;
        Ok(())
    }

    fn remove_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        let (slug, number) = github::split_key(key)?;
        self.remove(&format!(
            "/repos/{slug}/issues/{number}/labels/{}",
            encode(label)
        ))
    }

    fn transition(&self, key: &str, to: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Transitions)?;
        match to.to_ascii_lowercase().as_str() {
            state @ ("open" | "closed") => {
                self.patch(key, json!({ "state": state })).map_err(refused)
            }
            _ => Err(TrackerError::Refused(
                "a GitHub issue has two states: open and closed".into(),
            )),
        }
    }

    fn add_worklog(
        &self,
        _click: &Click,
        _key: &str,
        _log: &NewWorklog,
    ) -> Result<Worklog, TrackerError> {
        Err(Capability::TimeTracking.into())
    }

    fn worklogs(&self, _key: &str) -> Result<Vec<Worklog>, TrackerError> {
        Err(Capability::TimeTracking.into())
    }

    fn create(
        &self,
        scope: &str,
        _epic: bool,
        f: &Fields,
        label: &str,
    ) -> Result<Written, TrackerError> {
        let slug = github::repo(scope)?;
        let body = json!({
            "title": f.title.clone().unwrap_or_default(),
            "body": f.description.clone().unwrap_or_default(),
            "labels": [label],
        });
        let res = self
            .send(Method::Post, &format!("/repos/{slug}/issues"), body)?
            .json()?;
        Ok(Written {
            key: format!("{slug}#{}", res["number"]),
            skipped: flat_skipped(f),
        })
    }

    fn update(&self, key: &str, f: &Fields) -> Result<Written, TrackerError> {
        let mut body = json!({});
        if let Some(t) = &f.title {
            body["title"] = json!(t);
        }
        if let Some(d) = &f.description {
            body["body"] = json!(d);
        }
        if body.as_object().is_some_and(|o| !o.is_empty()) {
            self.patch(key, body)?;
        }
        Ok(Written {
            key: key.into(),
            skipped: flat_skipped(f),
        })
    }

    fn comments_page(
        &self,
        key: &str,
        cursor: Option<&str>,
    ) -> Result<Page<Comment>, TrackerError> {
        self.comment_page(key, cursor)
    }

    fn add_comment(&self, key: &str, body: &str) -> Result<String, TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let (slug, number) = github::split_key(key)?;
        let res = self.send(
            Method::Post,
            &format!("/repos/{slug}/issues/{number}/comments"),
            json!({ "body": body }),
        )?;
        Ok(res.json()?["id"].to_string())
    }

    fn edit_comment(&self, key: &str, id: &str, body: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let (slug, _) = github::split_key(key)?;
        let id = digits("comment", id)?;
        self.send(
            Method::Patch,
            &format!("/repos/{slug}/issues/comments/{id}"),
            json!({ "body": body }),
        )
        .map(|_| ())
        .map_err(own)
    }

    fn delete_comment(&self, key: &str, id: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let (slug, _) = github::split_key(key)?;
        let id = digits("comment", id)?;
        self.remove(&format!("/repos/{slug}/issues/comments/{id}"))
            .map_err(own)
    }
}

/// A flat tracker holds no estimate and no parent.
fn flat_skipped(f: &Fields) -> Vec<Field> {
    let mut out = Vec::new();
    if f.days.is_some() {
        out.push(Field::Estimate);
    }
    if f.parent.is_some() {
        out.push(Field::Parent);
    }
    out
}
