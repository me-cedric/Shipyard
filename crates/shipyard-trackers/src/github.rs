//! GitHub Issues, REST. github.com answers on `api.github.com`; Enterprise Server on `/api/v3`.
//! The issues endpoints list pull requests too. The adapter drops them.

use crate::Tracker;
use crate::model::*;
use serde_json::Value;
use shipyard_http::{Auth, Http, Request, build_url, items, text};
use shipyard_secrets::Secret;
use std::sync::Arc;

pub struct GitHub {
    pub(crate) http: Arc<dyn Http>,
    pub(crate) api: String,
    pub(crate) token: Secret,
}

impl GitHub {
    pub fn new(http: Arc<dyn Http>, base: &str, token: Secret) -> Self {
        let host = base
            .split("://")
            .nth(1)
            .unwrap_or(base)
            .trim_start_matches("www.");
        let api = if host.eq_ignore_ascii_case("github.com") {
            "https://api.github.com".to_string()
        } else {
            format!("{base}/api/v3")
        };
        Self { http, api, token }
    }

    fn request(&self, path: &str, query: &[(&str, &str)]) -> Request {
        Request::get(
            build_url(&self.api, path, query),
            Auth::Bearer(self.token.clone()),
        )
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
    }

    fn call(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, TrackerError> {
        Ok(self.http.json(&self.request(path, query))?)
    }
}

/// `owner/repo`, or an error. The check keeps a crafted scope out of the URL path.
pub(crate) fn repo(scope: &str) -> Result<&str, TrackerError> {
    let ok = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    };
    match scope.split_once('/') {
        Some((o, r)) if ok(o) && ok(r) => Ok(scope),
        _ => Err(TrackerError::Config(format!(
            "a GitHub scope is owner/repo, not {scope}"
        ))),
    }
}

fn person(v: &Value) -> Person {
    // The issue lists carry the login only; `/user` also carries the display name.
    let name = Some(text(v, "/name"))
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| text(v, "/login"));
    Person {
        id: text(v, "/login"),
        name,
    }
}

fn item(v: &Value) -> WorkItem {
    let labels: Vec<String> = items(v, "/labels")
        .iter()
        .map(|l| text(l, "/name"))
        .collect();
    let slug = text(v, "/repository_url")
        .split("/repos/")
        .nth(1)
        .unwrap_or_default()
        .to_string();
    let type_name = text(v, "/type/name");
    let kind = if type_name.is_empty() {
        kind_from_labels(&labels)
    } else {
        kind_from_name(&type_name)
    };
    let closed = text(v, "/state") == "closed";
    WorkItem {
        key: format!("{slug}#{}", v["number"]),
        title: text(v, "/title"),
        description: text(v, "/body"),
        kind,
        status: Status {
            name: text(v, "/state"),
            category: if closed {
                StatusCategory::Done
            } else {
                StatusCategory::Todo
            },
        },
        assignee: v.pointer("/assignees/0").map(person),
        labels,
        parent: None,
        url: text(v, "/html_url"),
        updated: text(v, "/updated_at"),
        time: None,
    }
}

/// `owner/repo#12` as (`owner/repo`, `12`).
pub(crate) fn split_key(key: &str) -> Result<(&str, &str), TrackerError> {
    let (slug, number) = key
        .rsplit_once('#')
        .ok_or_else(|| TrackerError::NotFound(key.into()))?;
    repo(slug)?;
    if number.is_empty() || !number.chars().all(|c| c.is_ascii_digit()) {
        return Err(TrackerError::NotFound(key.into()));
    }
    Ok((slug, number))
}

impl Tracker for GitHub {
    fn kind(&self) -> TrackerKind {
        TrackerKind::GitHubIssues
    }

    fn me(&self) -> Result<Person, TrackerError> {
        Ok(person(&self.call("/user", &[])?))
    }

    fn search(&self, q: &WorkQuery) -> Result<Page<WorkItem>, TrackerError> {
        check_query(&self.capabilities(), q)?;
        let per_page = q.page_size().to_string();
        let page = q.cursor.clone().unwrap_or_else(|| "1".into());
        let me;
        let mut query = vec![
            ("state", "all"),
            ("sort", "updated"),
            ("direction", "asc"),
            ("per_page", per_page.as_str()),
            ("page", page.as_str()),
        ];
        if let Some(since) = &q.updated_since {
            query.push(("since", since));
        }
        if let Some(label) = &q.label {
            query.push(("labels", label));
        }
        let path = match &q.scope {
            Some(scope) => {
                if q.assignee_me {
                    me = self.me()?.id;
                    query.push(("assignee", &me));
                }
                format!("/repos/{}/issues", repo(scope)?)
            }
            // Across repositories only the issues assigned to the person are listed.
            None => {
                query.push(("filter", "assigned"));
                "/issues".into()
            }
        };
        let v = self.call(&path, &query)?;
        let raw = v.as_array().map_or(0, Vec::len);
        let found = v
            .as_array()
            .into_iter()
            .flatten()
            .filter(|i| i.get("pull_request").is_none())
            .map(item)
            .collect();
        let next =
            (raw == q.page_size()).then(|| (page.parse::<u64>().unwrap_or(1) + 1).to_string());
        Ok(Page { items: found, next })
    }

    fn get(&self, key: &str) -> Result<WorkItem, TrackerError> {
        let (slug, number) = split_key(key)?;
        let v = self
            .call(&format!("/repos/{slug}/issues/{number}"), &[])
            .map_err(|e| e.not_found(key))?;
        Ok(item(&v))
    }

    fn comments(&self, key: &str) -> Result<Vec<Comment>, TrackerError> {
        every(|cursor| self.comment_page(key, cursor))
    }
}

impl GitHub {
    /// One page of comments, oldest first. The cursor is the page number.
    pub(crate) fn comment_page(
        &self,
        key: &str,
        cursor: Option<&str>,
    ) -> Result<Page<Comment>, TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let (slug, number) = split_key(key)?;
        let page = digits("page", cursor.unwrap_or("1"))?;
        let res = self
            .http
            .send(&self.request(
                &format!("/repos/{slug}/issues/{number}/comments"),
                &[("per_page", "100"), ("page", page)],
            ))?
            .ok()
            .map_err(|e| TrackerError::from(e).not_found(key))?;
        let more = res
            .header("link")
            .is_some_and(|l| l.contains("rel=\"next\""));
        let found = res
            .json()?
            .as_array()
            .into_iter()
            .flatten()
            .map(|c| Comment {
                id: c["id"].to_string(),
                author: person(&c["user"]),
                body: text(c, "/body"),
                created: text(c, "/created_at"),
            })
            .collect();
        let next = more.then(|| (page.parse::<u64>().unwrap_or(1) + 1).to_string());
        Ok(Page { items: found, next })
    }
}
