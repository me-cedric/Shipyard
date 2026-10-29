//! Jira Cloud and Jira Data Center, REST v2.
//!
//! v2 and not v3: a description and a comment are plain strings, so no ADF parser is needed.
//! The two products differ in three points only: the credential (email and API token against a
//! personal access token), the search call (`/search/jql` with a page token against `/search` with
//! an offset), and the account id (`accountId` against `name`).

use crate::Tracker;
use crate::marker;
use crate::model::{self, *};
use serde_json::Value;
use shipyard_http::{Auth, Http, Request, build_url, encode, items, text};
use shipyard_secrets::Secret;
use std::sync::{Arc, Mutex};

const FIELDS: &str =
    "summary,description,labels,issuetype,parent,timetracking,status,assignee,updated";
pub(crate) const API: &str = "/rest/api/2";

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Flavor {
    Cloud,
    DataCenter,
}

pub struct Jira {
    pub(crate) http: Arc<dyn Http>,
    pub(crate) base: String,
    pub(crate) auth: Auth,
    pub(crate) flavor: Flavor,
    /// The custom fields of epics, read once from `/field` (Data Center only).
    pub(crate) epic: Mutex<Option<EpicFields>>,
}

/// The ids of the two custom fields that Data Center needs for epics.
#[derive(Clone, Default)]
pub(crate) struct EpicFields {
    /// `Epic Link`: set on a story to link it to its epic.
    pub(crate) link: Option<String>,
    /// `Epic Name`: required when an epic is created.
    pub(crate) name: Option<String>,
}

impl Jira {
    pub fn cloud(http: Arc<dyn Http>, base: String, email: String, token: Secret) -> Self {
        Self {
            http,
            base,
            auth: Auth::Basic(email, token),
            flavor: Flavor::Cloud,
            epic: Mutex::default(),
        }
    }

    pub fn data_center(http: Arc<dyn Http>, base: String, token: Secret) -> Self {
        Self {
            http,
            base,
            auth: Auth::Bearer(token),
            flavor: Flavor::DataCenter,
            epic: Mutex::default(),
        }
    }

    fn call(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, TrackerError> {
        let url = build_url(&self.base, path, query);
        Ok(self.http.json(&Request::get(url, self.auth.clone()))?)
    }

    fn item(&self, v: &Value) -> WorkItem {
        let key = text(v, "/key");
        let type_name = text(v, "/fields/issuetype/name");
        let kind = if v
            .pointer("/fields/issuetype/subtask")
            .and_then(Value::as_bool)
            == Some(true)
        {
            WorkKind::Subtask
        } else {
            kind_from_name(&type_name)
        };
        let category = match text(v, "/fields/status/statusCategory/key").as_str() {
            "done" => StatusCategory::Done,
            "indeterminate" => StatusCategory::InProgress,
            _ => StatusCategory::Todo,
        };
        let assignee = v
            .pointer("/fields/assignee")
            .filter(|a| a.is_object())
            .map(person);
        let parent = Some(text(v, "/fields/parent/key")).filter(|k| !k.is_empty());
        let labels = items(v, "/fields/labels")
            .iter()
            .filter_map(Value::as_str)
            .map(String::from)
            .collect();
        let description = text(v, "/fields/description");
        WorkItem {
            url: format!("{}/browse/{key}", self.base),
            key,
            title: text(v, "/fields/summary"),
            description,
            kind,
            status: Status {
                name: text(v, "/fields/status/name"),
                category,
            },
            assignee,
            labels,
            parent,
            updated: text(v, "/fields/updated"),
            time: model::time(
                shipyard_http::num(v, "/fields/timetracking/originalEstimateSeconds"),
                shipyard_http::num(v, "/fields/timetracking/timeSpentSeconds"),
            ),
        }
    }
}

fn person(v: &Value) -> Person {
    let id = ["/accountId", "/name", "/key"]
        .iter()
        .map(|p| text(v, p))
        .find(|s| !s.is_empty())
        .unwrap_or_default();
    Person {
        id,
        name: text(v, "/displayName"),
    }
}

/// A JQL string literal.
fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn jql(q: &WorkQuery) -> String {
    let mut parts = Vec::new();
    if let Some(scope) = &q.scope {
        parts.push(format!("project = {}", quote(scope)));
    }
    if let Some(since) = &q.updated_since {
        // JQL reads `yyyy-MM-dd HH:mm`.
        let minute: String = since.chars().take(16).collect::<String>().replace('T', " ");
        parts.push(format!("updated >= {}", quote(&minute)));
    }
    if let Some(label) = &q.label {
        parts.push(format!("labels = {}", quote(label)));
    }
    if q.assignee_me {
        parts.push("assignee = currentUser()".into());
    }
    if parts.is_empty() {
        // Jira Cloud refuses an unbounded query.
        parts.push("updated >= -30d".into());
    }
    format!("{} ORDER BY updated ASC", parts.join(" AND "))
}

impl Tracker for Jira {
    fn kind(&self) -> TrackerKind {
        match self.flavor {
            Flavor::Cloud => TrackerKind::JiraCloud,
            Flavor::DataCenter => TrackerKind::JiraDataCenter,
        }
    }

    fn me(&self) -> Result<Person, TrackerError> {
        Ok(person(&self.call(&format!("{API}/myself"), &[])?))
    }

    fn search(&self, q: &WorkQuery) -> Result<Page<WorkItem>, TrackerError> {
        check_query(&self.capabilities(), q)?;
        let jql = jql(q);
        let limit = q.page_size().to_string();
        let cursor = q.cursor.clone().unwrap_or_default();
        let mut query = vec![
            ("jql", jql.as_str()),
            ("fields", FIELDS),
            ("maxResults", limit.as_str()),
        ];
        let v = match self.flavor {
            Flavor::Cloud => {
                if !cursor.is_empty() {
                    query.push(("nextPageToken", cursor.as_str()));
                }
                self.call(&format!("{API}/search/jql"), &query)?
            }
            Flavor::DataCenter => {
                query.push((
                    "startAt",
                    if cursor.is_empty() {
                        "0"
                    } else {
                        cursor.as_str()
                    },
                ));
                self.call(&format!("{API}/search"), &query)?
            }
        };
        let issues: Vec<WorkItem> = items(&v, "/issues").iter().map(|i| self.item(i)).collect();
        let next = match self.flavor {
            Flavor::Cloud => Some(text(&v, "/nextPageToken")).filter(|t| !t.is_empty()),
            Flavor::DataCenter => {
                let start = cursor.parse::<u64>().unwrap_or(0) + issues.len() as u64;
                let total = shipyard_http::num(&v, "/total").unwrap_or(0);
                (start < total && !issues.is_empty()).then(|| start.to_string())
            }
        };
        Ok(Page {
            items: issues,
            next,
        })
    }

    fn get(&self, key: &str) -> Result<WorkItem, TrackerError> {
        let v = self
            .call(
                &format!("{API}/issue/{}", encode(key)),
                &[("fields", FIELDS)],
            )
            .map_err(|e| e.not_found(key))?;
        Ok(self.item(&v))
    }

    fn comments(&self, key: &str) -> Result<Vec<Comment>, TrackerError> {
        every(|cursor| self.comment_page(key, cursor))
    }
}

impl Jira {
    /// One page of comments, oldest first. The cursor is the offset.
    pub(crate) fn comment_page(
        &self,
        key: &str,
        cursor: Option<&str>,
    ) -> Result<Page<Comment>, TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let start: u64 = cursor.map_or(Ok(0), |c| {
            c.parse()
                .map_err(|_| TrackerError::Config(format!("`{c}` is not a page cursor")))
        })?;
        let v = self
            .call(
                &format!("{API}/issue/{}/comment", encode(key)),
                &[("startAt", &start.to_string()), ("maxResults", "100")],
            )
            .map_err(|e| e.not_found(key))?;
        let found: Vec<Comment> = items(&v, "/comments")
            .iter()
            .map(|c| Comment {
                id: text(c, "/id"),
                author: person(c.pointer("/author").unwrap_or(&Value::Null)),
                body: marker::from_wire(&text(c, "/body")),
                created: text(c, "/created"),
            })
            .collect();
        let end = start + found.len() as u64;
        let total = shipyard_http::num(&v, "/total").unwrap_or(0);
        let next = (end < total && !found.is_empty()).then(|| end.to_string());
        Ok(Page { items: found, next })
    }
}
