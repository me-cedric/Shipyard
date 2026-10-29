//! Azure DevOps Services and Server, REST 7.1. The base address holds the organization or the
//! collection: `https://dev.azure.com/acme`. The credential is a personal access token.
//!
//! A search is two calls: a WIQL query (read-only, sent as POST) returns ids, then one batch read
//! returns the fields. The cursor is the offset in the id list.

use crate::Tracker;
use crate::model::*;
use serde_json::{Value, json};
use shipyard_http::{Auth, Http, Request, build_url, encode, items, num, text};
use shipyard_secrets::Secret;
use std::sync::Arc;

const API: &str = "7.1";
const FIELDS: &str = "System.Id,System.Title,System.Description,System.WorkItemType,System.State,System.AssignedTo,System.Tags,System.Parent,System.ChangedDate,System.TeamProject,Microsoft.VSTS.Scheduling.OriginalEstimate,Microsoft.VSTS.Scheduling.CompletedWork";

pub struct Azure {
    http: Arc<dyn Http>,
    base: String,
    token: Secret,
}

impl Azure {
    pub fn new(http: Arc<dyn Http>, base: String, token: Secret) -> Self {
        Self { http, base, token }
    }

    fn auth(&self) -> Auth {
        Auth::Basic(String::new(), self.token.clone())
    }

    fn call(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, TrackerError> {
        let mut q = query.to_vec();
        q.push(("api-version", API));
        Ok(self
            .http
            .json(&Request::get(build_url(&self.base, path, &q), self.auth()))?)
    }

    fn fetch(&self, ids: &[String]) -> Result<Vec<WorkItem>, TrackerError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let joined = ids.join(",");
        let v = self.call(
            "/_apis/wit/workitems",
            &[("ids", &joined), ("fields", FIELDS)],
        )?;
        Ok(items(&v, "/value").iter().map(item).collect())
    }
}

fn person(v: &Value) -> Person {
    let id = [text(v, "/id"), text(v, "/uniqueName")]
        .into_iter()
        .find(|s| !s.is_empty())
        .unwrap_or_default();
    Person {
        id,
        name: [text(v, "/displayName"), text(v, "/providerDisplayName")]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default(),
    }
}

/// shortcut: the state category comes from common state names, not from the process template;
/// read `/_apis/wit/workitemtypes/{type}/states` if a custom process needs it.
fn category(state: &str) -> StatusCategory {
    match state.to_ascii_lowercase().as_str() {
        "closed" | "done" | "removed" | "completed" | "resolved" | "inactive" => {
            StatusCategory::Done
        }
        "new" | "to do" | "proposed" | "approved" | "design" | "open" => StatusCategory::Todo,
        _ => StatusCategory::InProgress,
    }
}

fn hours_to_minutes(v: &Value, pointer: &str) -> Option<u64> {
    v.pointer(pointer)
        .and_then(Value::as_f64)
        .map(|h| (h * 60.0).round() as u64)
}

fn item(v: &Value) -> WorkItem {
    let f = |name: &str| text(v, &format!("/fields/{}", name.replace('/', "~1")));
    let state = f("System.State");
    let tags = f("System.Tags");
    let estimate = hours_to_minutes(v, "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate");
    let spent = hours_to_minutes(v, "/fields/Microsoft.VSTS.Scheduling.CompletedWork");
    let assignee = v
        .pointer("/fields/System.AssignedTo")
        .filter(|a| a.is_object())
        .map(person);
    WorkItem {
        key: v["id"].to_string(),
        title: f("System.Title"),
        description: plain_text(&f("System.Description")),
        kind: kind_from_name(&f("System.WorkItemType")),
        status: Status {
            category: category(&state),
            name: state,
        },
        assignee,
        labels: tags
            .split(';')
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .map(String::from)
            .collect(),
        parent: num(v, "/fields/System.Parent").map(|p| p.to_string()),
        url: text(v, "/_links/html/href"),
        updated: f("System.ChangedDate"),
        time: (estimate.is_some() || spent.is_some()).then_some(TimeTracking {
            estimate_minutes: estimate,
            spent_minutes: spent,
        }),
    }
}

/// A WIQL string literal.
fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn wiql(q: &WorkQuery) -> String {
    let mut parts = Vec::new();
    if let Some(project) = &q.scope {
        parts.push(format!("[System.TeamProject] = {}", quote(project)));
    }
    if let Some(since) = &q.updated_since {
        parts.push(format!("[System.ChangedDate] >= {}", quote(since)));
    }
    if let Some(label) = &q.label {
        parts.push(format!("[System.Tags] CONTAINS {}", quote(label)));
    }
    if q.assignee_me {
        parts.push("[System.AssignedTo] = @Me".into());
    }
    if parts.is_empty() {
        parts.push("[System.ChangedDate] >= @Today - 30".into());
    }
    format!(
        "SELECT [System.Id] FROM WorkItems WHERE {} ORDER BY [System.ChangedDate] ASC",
        parts.join(" AND ")
    )
}

impl Tracker for Azure {
    fn kind(&self) -> TrackerKind {
        TrackerKind::AzureDevOps
    }

    fn me(&self) -> Result<Person, TrackerError> {
        let v = self.call("/_apis/connectionData", &[("connectOptions", "none")])?;
        Ok(person(v.get("authenticatedUser").unwrap_or(&Value::Null)))
    }

    fn search(&self, q: &WorkQuery) -> Result<Page<WorkItem>, TrackerError> {
        check_query(&self.capabilities(), q)?;
        let size = q.page_size();
        let offset: usize = q
            .cursor
            .as_deref()
            .and_then(|c| c.parse().ok())
            .unwrap_or(0);
        // The query is re-run for each page: the id list is not kept between calls.
        let top = (offset + size + 1).to_string();
        let url = build_url(
            &self.base,
            "/_apis/wit/wiql",
            &[
                ("api-version", API),
                ("timePrecision", "true"),
                ("$top", top.as_str()),
            ],
        );
        let v = self.http.json(&Request::post_json(
            url,
            self.auth(),
            json!({ "query": wiql(q) }),
        ))?;
        let ids: Vec<String> = items(&v, "/workItems")
            .iter()
            .map(|w| w["id"].to_string())
            .collect();
        let page = ids
            .iter()
            .skip(offset)
            .take(size)
            .cloned()
            .collect::<Vec<_>>();
        let next = (ids.len() > offset + size).then(|| (offset + size).to_string());
        let mut found = self.fetch(&page)?;
        // The batch read does not promise the order of the ids.
        found.sort_by_key(|w| page.iter().position(|id| *id == w.key));
        Ok(Page { items: found, next })
    }

    fn get(&self, key: &str) -> Result<WorkItem, TrackerError> {
        if key.is_empty() || !key.chars().all(|c| c.is_ascii_digit()) {
            return Err(TrackerError::NotFound(key.into()));
        }
        let v = self
            .call(
                &format!("/_apis/wit/workitems/{key}"),
                &[("fields", FIELDS)],
            )
            .map_err(|e| e.not_found(key))?;
        Ok(item(&v))
    }

    fn comments(&self, key: &str) -> Result<Vec<Comment>, TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        // The comments call needs the project, which the item holds.
        let project = self
            .call(
                &format!("/_apis/wit/workitems/{key}"),
                &[("fields", "System.TeamProject")],
            )
            .map_err(|e| e.not_found(key))?;
        let project = text(&project, "/fields/System.TeamProject");
        let v = self.call(
            &format!("/{}/_apis/wit/workItems/{key}/comments", encode(&project)),
            &[],
        )?;
        Ok(items(&v, "/comments")
            .iter()
            .map(|c| Comment {
                id: c["id"].to_string(),
                author: person(&c["createdBy"]),
                body: plain_text(&text(c, "/text")),
                created: text(c, "/createdDate"),
            })
            .collect())
    }
}
