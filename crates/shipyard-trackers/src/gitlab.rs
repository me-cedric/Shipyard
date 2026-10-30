//! GitLab Issues, REST v4. Works for gitlab.com and a self-managed host.

use crate::Tracker;
use crate::model::*;
use serde_json::Value;
use shipyard_http::{Auth, Http, Request, build_url, encode, items, num, text};
use shipyard_secrets::Secret;
use std::sync::Arc;

pub struct GitLab {
    pub(crate) http: Arc<dyn Http>,
    pub(crate) api: String,
    pub(crate) token: Secret,
}

impl GitLab {
    pub fn new(http: Arc<dyn Http>, base: &str, token: Secret) -> Self {
        Self {
            http,
            api: format!("{base}/api/v4"),
            token,
        }
    }

    fn send(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<shipyard_http::Response, TrackerError> {
        let req = Request::get(
            build_url(&self.api, path, query),
            Auth::Header("PRIVATE-TOKEN", self.token.clone()),
        );
        Ok(self.http.send(&req)?.ok()?)
    }

    fn call(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, TrackerError> {
        Ok(self.send(path, query)?.json()?)
    }
}

pub(crate) fn person(v: &Value) -> Person {
    Person {
        id: v["id"].to_string(),
        name: text(v, "/name"),
    }
}

fn item(v: &Value, scope_hint: &str) -> WorkItem {
    let labels: Vec<String> = items(v, "/labels")
        .iter()
        .filter_map(Value::as_str)
        .map(String::from)
        .collect();
    let kind = match text(v, "/issue_type").as_str() {
        "incident" => WorkKind::Bug,
        "task" => WorkKind::Task,
        _ => kind_from_labels(&labels),
    };
    let state = text(v, "/state");
    let full = text(v, "/references/full");
    let key = if full.is_empty() {
        format!("{scope_hint}#{}", v["iid"])
    } else {
        full
    };
    WorkItem {
        key,
        title: text(v, "/title"),
        description: text(v, "/description"),
        kind,
        status: Status {
            category: if state == "closed" {
                StatusCategory::Done
            } else {
                StatusCategory::Todo
            },
            name: state,
        },
        assignee: v.pointer("/assignees/0").map(person),
        labels,
        parent: None,
        url: text(v, "/web_url"),
        updated: text(v, "/updated_at"),
        time: time(
            num(v, "/time_stats/time_estimate").filter(|s| *s > 0),
            num(v, "/time_stats/total_time_spent").filter(|s| *s > 0),
        ),
    }
}

/// `group/project#7` as (`group/project`, `7`).
pub(crate) fn split_key(key: &str) -> Result<(&str, &str), TrackerError> {
    match key.rsplit_once('#') {
        Some((slug, iid))
            if !slug.is_empty() && !iid.is_empty() && iid.chars().all(|c| c.is_ascii_digit()) =>
        {
            Ok((slug, iid))
        }
        _ => Err(TrackerError::NotFound(key.into())),
    }
}

impl Tracker for GitLab {
    fn kind(&self) -> TrackerKind {
        TrackerKind::GitLabIssues
    }

    fn me(&self) -> Result<Person, TrackerError> {
        Ok(person(&self.call("/user", &[])?))
    }

    fn scopes(&self) -> Result<Vec<Scope>, TrackerError> {
        let v = self.call(
            "/projects",
            &[
                ("membership", "true"),
                ("simple", "true"),
                ("per_page", "100"),
                ("order_by", "last_activity_at"),
            ],
        )?;
        Ok(items(&v, "")
            .iter()
            .map(|r| Scope {
                id: text(r, "/path_with_namespace"),
                name: text(r, "/path_with_namespace"),
            })
            .collect())
    }

    fn search(&self, q: &WorkQuery) -> Result<Page<WorkItem>, TrackerError> {
        check_query(&self.capabilities(), q)?;
        let per_page = q.page_size().to_string();
        let page = q.cursor.clone().unwrap_or_else(|| "1".into());
        let mut query = vec![
            ("state", "all"),
            ("order_by", "updated_at"),
            ("sort", "asc"),
            ("per_page", per_page.as_str()),
            ("page", page.as_str()),
        ];
        if let Some(since) = &q.updated_since {
            query.push(("updated_after", since));
        }
        if let Some(label) = &q.label {
            query.push(("labels", label));
        }
        // Across projects only the issues assigned to the person are listed.
        if q.assignee_me || q.scope.is_none() {
            query.push(("scope", "assigned_to_me"));
        }
        let path = match &q.scope {
            Some(scope) => format!("/projects/{}/issues", encode(scope)),
            None => "/issues".into(),
        };
        let res = self.send(&path, &query)?;
        let next = res
            .header("x-next-page")
            .filter(|n| !n.is_empty())
            .map(String::from);
        let hint = q.scope.clone().unwrap_or_default();
        let found = res
            .json()?
            .as_array()
            .into_iter()
            .flatten()
            .map(|i| item(i, &hint))
            .collect();
        Ok(Page { items: found, next })
    }

    fn get(&self, key: &str) -> Result<WorkItem, TrackerError> {
        let (slug, iid) = split_key(key)?;
        let v = self
            .call(&format!("/projects/{}/issues/{iid}", encode(slug)), &[])
            .map_err(|e| e.not_found(key))?;
        Ok(item(&v, slug))
    }

    fn comments(&self, key: &str) -> Result<Vec<Comment>, TrackerError> {
        every(|cursor| self.comment_page(key, cursor))
    }
}

impl GitLab {
    /// One page of comments, oldest first, with no system note. The cursor is the page number.
    pub(crate) fn comment_page(
        &self,
        key: &str,
        cursor: Option<&str>,
    ) -> Result<Page<Comment>, TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let (slug, iid) = split_key(key)?;
        let page = digits("page", cursor.unwrap_or("1"))?;
        let res = self
            .send(
                &format!("/projects/{}/issues/{iid}/notes", encode(slug)),
                &[("sort", "asc"), ("per_page", "100"), ("page", page)],
            )
            .map_err(|e| e.not_found(key))?;
        let next = res
            .header("x-next-page")
            .filter(|n| !n.is_empty())
            .map(String::from);
        let found = res
            .json()?
            .as_array()
            .into_iter()
            .flatten()
            .filter(|n| n["system"].as_bool() != Some(true))
            .map(|n| Comment {
                id: n["id"].to_string(),
                author: person(&n["author"]),
                body: text(n, "/body"),
                created: text(n, "/created_at"),
            })
            .collect();
        Ok(Page { items: found, next })
    }
}
