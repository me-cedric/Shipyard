//! GitLab Issues writes, REST v4. Time goes through GraphQL: REST has no list of time logs, and the
//! mark of an entry needs one (REQ-023). That needs a GitLab with `timelogCreate` and `Issue.timelogs`
//! (15.x).

use crate::Tracker;
use crate::gitlab::{GitLab, split_key};
use crate::marker;
use crate::model::*;
use crate::work::*;
use serde_json::{Value, json};
use shipyard_core::work::Field;
use shipyard_http::{Auth, Method, Request, Response, build_url, encode, items, num, text};

impl GitLab {
    fn auth(&self) -> Auth {
        Auth::Header("PRIVATE-TOKEN", self.token.clone())
    }

    fn write(&self, method: Method, path: &str, body: Value) -> Result<Response, TrackerError> {
        let req = Request::write(method, build_url(&self.api, path, &[]), self.auth(), body);
        Ok(self.http.send(&req)?.ok()?)
    }

    fn remove(&self, path: &str) -> Result<(), TrackerError> {
        let req = Request::delete(build_url(&self.api, path, &[]), self.auth());
        self.http.send(&req)?.ok()?;
        Ok(())
    }

    fn issue_path(key: &str) -> Result<String, TrackerError> {
        let (slug, iid) = split_key(key)?;
        Ok(format!("/projects/{}/issues/{iid}", encode(slug)))
    }

    /// GraphQL lives next to the REST root: `https://host/api/graphql`.
    fn graphql(&self, query: &str, variables: Value) -> Result<Value, TrackerError> {
        let url = format!("{}/graphql", self.api.trim_end_matches("/v4"));
        let body = json!({ "query": query, "variables": variables });
        let v = self
            .http
            .json(&Request::post_json(url, self.auth(), body))?;
        if let Some(first) = v.pointer("/errors/0") {
            return Err(TrackerError::Refused(text(first, "/message")));
        }
        Ok(v)
    }

    /// The estimate in minutes. GitLab reads `960m` as 16 hours.
    fn estimate(&self, path: &str, days: Option<f64>) -> Result<(), TrackerError> {
        if let Some(d) = days {
            let m = (d * f64::from(shipyard_core::work::MINUTES_PER_DAY)).round() as u32;
            self.write(
                Method::Post,
                &format!("{path}/time_estimate"),
                json!({ "duration": format!("{m}m") }),
            )?;
        }
        Ok(())
    }
}

fn skipped(f: &Fields) -> Vec<Field> {
    f.parent.iter().map(|_| Field::Parent).collect()
}

/// `+0100` as `+01:00`: GraphQL reads ISO 8601 with a colon.
fn iso(started: &str) -> String {
    let n = started.len();
    match started.as_bytes().get(n.wrapping_sub(5)) {
        Some(b'+' | b'-') if started[n - 4..].bytes().all(|b| b.is_ascii_digit()) => {
            format!("{}:{}", &started[..n - 2], &started[n - 2..])
        }
        _ => started.to_string(),
    }
}

fn log(v: &Value) -> Worklog {
    Worklog {
        id: text(v, "/id"),
        minutes: (num(v, "/timeSpent").unwrap_or(0) / 60) as u32,
        note: text(v, "/summary"),
        started: text(v, "/spentAt"),
    }
}

const LOG: &str = "id spentAt summary timeSpent";

impl TrackerWrite for GitLab {
    fn assign(&self, key: &str, account: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Assignee)?;
        let id: u64 = account.parse().map_err(|_| {
            TrackerError::Config(format!("a GitLab user id is a number, not {account}"))
        })?;
        self.write(
            Method::Put,
            &Self::issue_path(key)?,
            json!({ "assignee_ids": [id] }),
        )?;
        Ok(())
    }

    fn add_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        if label.contains(',') {
            return Err(TrackerError::Config("a GitLab label holds no comma".into()));
        }
        self.write(
            Method::Put,
            &Self::issue_path(key)?,
            json!({ "add_labels": label }),
        )?;
        Ok(())
    }

    fn remove_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        if label.contains(',') {
            return Err(TrackerError::Config("a GitLab label holds no comma".into()));
        }
        self.write(
            Method::Put,
            &Self::issue_path(key)?,
            json!({ "remove_labels": label }),
        )?;
        Ok(())
    }

    fn set_issue_type(&self, key: &str, name: &str) -> Result<(), TrackerError> {
        self.write(
            Method::Put,
            &Self::issue_path(key)?,
            json!({ "issue_type": name.to_lowercase() }),
        )?;
        Ok(())
    }

    fn set_due_date(&self, key: &str, day: Option<&str>) -> Result<(), TrackerError> {
        // An empty due date clears the field on GitLab.
        self.write(
            Method::Put,
            &Self::issue_path(key)?,
            json!({ "due_date": day.unwrap_or("") }),
        )?;
        Ok(())
    }

    fn transition(&self, key: &str, to: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Transitions)?;
        let event = match to.to_ascii_lowercase().as_str() {
            "closed" | "close" => "close",
            "opened" | "open" | "reopen" => "reopen",
            _ => {
                return Err(TrackerError::Refused(
                    "a GitLab issue has two states: opened and closed".into(),
                ));
            }
        };
        self.write(
            Method::Put,
            &Self::issue_path(key)?,
            json!({ "state_event": event }),
        )
        .map(|_| ())
        .map_err(refused)
    }

    fn add_worklog(
        &self,
        _click: &Click,
        key: &str,
        l: &NewWorklog,
    ) -> Result<Worklog, TrackerError> {
        self.capabilities().require(Capability::TimeTracking)?;
        let issue = self
            .http
            .json(&Request::get(
                build_url(&self.api, &Self::issue_path(key)?, &[]),
                self.auth(),
            ))
            .map_err(|e| TrackerError::from(e).not_found(key))?;
        // GitLab has no remaining estimate: `reduce_remaining` changes nothing here.
        let query = format!(
            "mutation($input: TimelogCreateInput!) {{ timelogCreate(input: $input) {{ timelog {{ {LOG} }} errors }} }}"
        );
        let v = self.graphql(
            &query,
            json!({ "input": {
                "issuableId": format!("gid://gitlab/Issue/{}", issue["id"]),
                "timeSpent": format!("{}m", l.minutes),
                "spentAt": iso(l.started),
                "summary": l.note,
            }}),
        )?;
        if let Some(e) = v
            .pointer("/data/timelogCreate/errors/0")
            .and_then(Value::as_str)
        {
            return Err(TrackerError::Refused(e.into()));
        }
        Ok(log(&v["data"]["timelogCreate"]["timelog"]))
    }

    fn worklogs(&self, key: &str) -> Result<Vec<Worklog>, TrackerError> {
        self.capabilities().require(Capability::TimeTracking)?;
        let (slug, iid) = split_key(key)?;
        let query = format!(
            "query($path: ID!, $iid: String!, $after: String) {{ project(fullPath: $path) {{ issue(iid: $iid) {{ timelogs(first: 100, after: $after) {{ nodes {{ {LOG} }} pageInfo {{ hasNextPage endCursor }} }} }} }} }}"
        );
        every(|cursor| {
            let v = self.graphql(&query, json!({ "path": slug, "iid": iid, "after": cursor }))?;
            let logs = &v["data"]["project"]["issue"]["timelogs"];
            if !logs.is_object() {
                return Err(TrackerError::NotFound(key.into()));
            }
            let next = (logs["pageInfo"]["hasNextPage"].as_bool() == Some(true))
                .then(|| text(logs, "/pageInfo/endCursor"));
            Ok(Page {
                items: items(logs, "/nodes").iter().map(log).collect(),
                next,
            })
        })
    }

    fn create(
        &self,
        scope: &str,
        _epic: bool,
        f: &Fields,
        label: &str,
    ) -> Result<Written, TrackerError> {
        let path = format!("/projects/{}/issues", encode(scope));
        let body = json!({
            "title": f.title.clone().unwrap_or_default(),
            "description": f.description.clone().unwrap_or_default(),
            "labels": label,
        });
        let made = self.write(Method::Post, &path, body)?.json()?;
        let iid = made["iid"].to_string();
        self.estimate(&format!("{path}/{iid}"), f.days)?;
        Ok(Written {
            key: format!("{scope}#{iid}"),
            skipped: skipped(f),
        })
    }

    fn update(&self, key: &str, f: &Fields) -> Result<Written, TrackerError> {
        let path = Self::issue_path(key)?;
        let mut body = json!({});
        if let Some(t) = &f.title {
            body["title"] = json!(t);
        }
        if let Some(d) = &f.description {
            body["description"] = json!(d);
        }
        if body.as_object().is_some_and(|o| !o.is_empty()) {
            self.write(Method::Put, &path, body)?;
        }
        self.estimate(&path, f.days)?;
        Ok(Written {
            key: key.into(),
            skipped: skipped(f),
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
        let res = self.write(
            Method::Post,
            &format!("{}/notes", Self::issue_path(key)?),
            json!({ "body": marker::to_wire(body, false) }),
        )?;
        Ok(res.json()?["id"].to_string())
    }

    fn edit_comment(&self, key: &str, id: &str, body: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let id = digits("comment", id)?;
        self.write(
            Method::Put,
            &format!("{}/notes/{id}", Self::issue_path(key)?),
            json!({ "body": marker::to_wire(body, false) }),
        )
        .map(|_| ())
        .map_err(own)
    }

    fn delete_comment(&self, key: &str, id: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let id = digits("comment", id)?;
        self.remove(&format!("{}/notes/{id}", Self::issue_path(key)?))
            .map_err(own)
    }
}
