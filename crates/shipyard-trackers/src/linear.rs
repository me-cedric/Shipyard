//! Linear, GraphQL. The personal API key goes in `Authorization` with no `Bearer` prefix.
//! Every query is a read. A request body never holds a `mutation`.

use crate::Tracker;
use crate::model::*;
use serde_json::{Value, json};
use shipyard_http::{Auth, Error, Http, Request, items, text};
use shipyard_secrets::Secret;
use std::sync::Arc;

const ENDPOINT: &str = "https://api.linear.app/graphql";
const ISSUE: &str = "id identifier title description url updatedAt estimate state { name type } assignee { id name } labels { nodes { name } } parent { identifier }";

pub struct Linear {
    http: Arc<dyn Http>,
    key: Secret,
}

impl Linear {
    pub fn new(http: Arc<dyn Http>, key: Secret) -> Self {
        Self { http, key }
    }

    fn gql(&self, query: &str, variables: Value) -> Result<Value, TrackerError> {
        let body = json!({ "query": query, "variables": variables });
        let res = self.http.send(&Request::post_json(
            ENDPOINT,
            Auth::Header("Authorization", self.key.clone()),
            body,
        ))?;
        // Linear answers a refusal with 400 and an `errors` list: read it before the status.
        if let Ok(v) = res.json()
            && let Some(first) = v.get("errors").and_then(|e| e.get(0))
        {
            let kind = text(first, "/extensions/type").to_ascii_lowercase();
            let message = text(first, "/message");
            let status = if kind.contains("authentication") {
                401
            } else if kind.contains("forbidden") || kind.contains("permission") {
                403
            } else {
                0
            };
            return Err(match status {
                0 => Error::Parse(format!("Linear: {message}")),
                status => Error::Status {
                    status,
                    detail: message,
                    scope: None,
                },
            }
            .into());
        }
        Ok(res.ok()?.json()?)
    }
}

fn person(v: &Value) -> Person {
    Person {
        id: text(v, "/id"),
        name: text(v, "/name"),
    }
}

fn item(v: &Value) -> WorkItem {
    let labels: Vec<String> = items(v, "/labels/nodes")
        .iter()
        .map(|l| text(l, "/name"))
        .collect();
    let parent = Some(text(v, "/parent/identifier")).filter(|p| !p.is_empty());
    let kind = match kind_from_labels(&labels) {
        WorkKind::Task if parent.is_some() => WorkKind::Subtask,
        other => other,
    };
    let category = match text(v, "/state/type").as_str() {
        "completed" | "canceled" => StatusCategory::Done,
        "started" => StatusCategory::InProgress,
        _ => StatusCategory::Todo,
    };
    WorkItem {
        key: text(v, "/identifier"),
        title: text(v, "/title"),
        description: text(v, "/description"),
        kind,
        status: Status {
            name: text(v, "/state/name"),
            category,
        },
        assignee: v.get("assignee").filter(|a| a.is_object()).map(person),
        labels,
        parent,
        url: text(v, "/url"),
        updated: text(v, "/updatedAt"),
        time: None,
    }
}

impl Tracker for Linear {
    fn kind(&self) -> TrackerKind {
        TrackerKind::Linear
    }

    fn me(&self) -> Result<Person, TrackerError> {
        let v = self.gql("query { viewer { id name } }", json!({}))?;
        Ok(person(&v["data"]["viewer"]))
    }

    fn search(&self, q: &WorkQuery) -> Result<Page<WorkItem>, TrackerError> {
        check_query(&self.capabilities(), q)?;
        let mut filter = serde_json::Map::new();
        if let Some(team) = &q.scope {
            filter.insert("team".into(), json!({ "key": { "eq": team } }));
        }
        if let Some(since) = &q.updated_since {
            filter.insert("updatedAt".into(), json!({ "gte": since }));
        }
        if let Some(label) = &q.label {
            filter.insert("labels".into(), json!({ "name": { "eq": label } }));
        }
        if q.assignee_me {
            filter.insert("assignee".into(), json!({ "isMe": { "eq": true } }));
        }
        let query = format!(
            "query($first: Int, $after: String, $filter: IssueFilter) {{ issues(first: $first, after: $after, filter: $filter) {{ nodes {{ {ISSUE} }} pageInfo {{ hasNextPage endCursor }} }} }}"
        );
        let v = self.gql(
            &query,
            json!({ "first": q.page_size(), "after": q.cursor, "filter": filter }),
        )?;
        let issues = &v["data"]["issues"];
        let next = (issues["pageInfo"]["hasNextPage"].as_bool() == Some(true))
            .then(|| text(issues, "/pageInfo/endCursor"));
        Ok(Page {
            items: items(issues, "/nodes").iter().map(item).collect(),
            next,
        })
    }

    fn get(&self, key: &str) -> Result<WorkItem, TrackerError> {
        let query = format!("query($id: String!) {{ issue(id: $id) {{ {ISSUE} }} }}");
        let v = self.gql(&query, json!({ "id": key }))?;
        match v["data"]["issue"].as_object() {
            Some(_) => Ok(item(&v["data"]["issue"])),
            None => Err(TrackerError::NotFound(key.into())),
        }
    }

    fn comments(&self, key: &str) -> Result<Vec<Comment>, TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let query = "query($id: String!) { issue(id: $id) { comments(first: 100) { nodes { id body createdAt user { id name } } } } }";
        let v = self.gql(query, json!({ "id": key }))?;
        if !v["data"]["issue"].is_object() {
            return Err(TrackerError::NotFound(key.into()));
        }
        Ok(items(&v["data"]["issue"], "/comments/nodes")
            .iter()
            .map(|c| Comment {
                id: text(c, "/id"),
                author: person(&c["user"]),
                body: text(c, "/body"),
                created: text(c, "/createdAt"),
            })
            .collect())
    }
}
