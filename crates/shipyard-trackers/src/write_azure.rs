//! Azure DevOps writes, REST 7.1. A work item changes with a JSON Patch document, which needs the
//! content type `application/json-patch+json`.
//!
//! shortcut: a time entry has no home. Azure DevOps keeps a Completed Work total, not a list of
//! entries, so an entry cannot carry the mark of REQ-023. [`TrackerWrite::add_worklog`] answers
//! `Unsupported`, although the flag `time_tracking` stays on for the estimate.

use crate::Tracker;
use crate::azure::{API, Azure, COMMENTS_API};
use crate::marker;
use crate::model::*;
use crate::work::*;
use serde_json::{Value, json};
use shipyard_core::work::Field;
use shipyard_core::work::MINUTES_PER_DAY;
use shipyard_http::{Method, Request, Response, build_url, encode, items, num, text};

const ESTIMATE: &str = "Microsoft.VSTS.Scheduling.OriginalEstimate";
const HIERARCHY: &str = "System.LinkTypes.Hierarchy-Reverse";
/// The first of these that a project has is the type of a story. The process template decides.
const STORY_TYPES: [&str; 5] = [
    "User Story",
    "Product Backlog Item",
    "Requirement",
    "Issue",
    "Task",
];

/// The comment text as HTML. Azure DevOps stores comments as HTML: escape the text, keep the lines.
fn html(body: &str) -> String {
    marker::to_wire(body, true)
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace("\r\n", "\n")
        .replace('\n', "<br>")
}

fn op(op: &str, path: &str, value: Value) -> Value {
    json!({ "op": op, "path": path, "value": value })
}

impl Azure {
    fn send(
        &self,
        method: Method,
        path: &str,
        api: &str,
        body: Value,
        patch: bool,
    ) -> Result<Response, TrackerError> {
        let url = build_url(&self.base, path, &[("api-version", api)]);
        let mut req = Request::write(method, url, self.auth(), body);
        if patch {
            req = req.header("Content-Type", "application/json-patch+json");
        }
        Ok(self.http.send(&req)?.ok()?)
    }

    /// Change a work item with a JSON Patch document.
    fn patch(&self, id: &str, ops: Vec<Value>) -> Result<Response, TrackerError> {
        let id = digits("work item", id)?;
        self.send(
            Method::Patch,
            &format!("/_apis/wit/workitems/{id}"),
            API,
            Value::Array(ops),
            true,
        )
    }

    fn remove(&self, path: &str) -> Result<(), TrackerError> {
        let url = build_url(&self.base, path, &[("api-version", COMMENTS_API)]);
        self.http.send(&Request::delete(url, self.auth()))?.ok()?;
        Ok(())
    }

    /// The type of a story in `project`, read once for each project.
    fn story_type(&self, project: &str) -> Result<String, TrackerError> {
        if let Some(t) = self.types.lock().expect("types lock").get(project) {
            return Ok(t.clone());
        }
        let v = self.call(
            &format!("/{}/_apis/wit/workitemtypes", encode(project)),
            &[],
        )?;
        let names: Vec<String> = items(&v, "/value")
            .iter()
            .map(|t| text(t, "/name"))
            .collect();
        let found = STORY_TYPES
            .iter()
            .find(|t| names.iter().any(|n| n == *t))
            .ok_or_else(|| {
                TrackerError::Config(format!(
                    "no story type in {project}: it has {}",
                    names.join(", ")
                ))
            })?;
        self.types
            .lock()
            .expect("types lock")
            .insert(project.into(), (*found).into());
        Ok((*found).into())
    }

    fn parent_url(&self, parent: &str) -> Result<String, TrackerError> {
        Ok(format!(
            "{}/_apis/wit/workItems/{}",
            self.base,
            digits("work item", parent)?
        ))
    }

    /// The operations that set `f`. The title, the description and the estimate are fields. The
    /// parent is a link: on an update the old link goes first.
    fn ops(&self, f: &Fields, key: Option<&str>) -> Result<Vec<Value>, TrackerError> {
        let mut ops = Vec::new();
        if let Some(t) = &f.title {
            ops.push(op("add", "/fields/System.Title", json!(t)));
        }
        if let Some(d) = &f.description {
            ops.push(op("add", "/fields/System.Description", json!(html(d))));
        }
        if let Some(days) = f.days {
            let hours = days * f64::from(MINUTES_PER_DAY) / 60.0;
            ops.push(op("add", &format!("/fields/{ESTIMATE}"), json!(hours)));
        }
        if let Some(p) = &f.parent {
            if let Some(key) = key {
                let item = self.call(
                    &format!("/_apis/wit/workitems/{}", digits("work item", key)?),
                    &[("$expand", "relations")],
                )?;
                if let Some(i) = items(&item, "/relations")
                    .iter()
                    .position(|r| text(r, "/rel") == HIERARCHY)
                {
                    ops.push(json!({ "op": "remove", "path": format!("/relations/{i}") }));
                }
            }
            ops.push(op(
                "add",
                "/relations/-",
                json!({ "rel": HIERARCHY, "url": self.parent_url(p)? }),
            ));
        }
        Ok(ops)
    }

    /// Send `ops`. A story type has no `OriginalEstimate` field and answers 400: send again with
    /// no estimate and report it as skipped.
    fn write_item(
        &self,
        run: impl Fn(Vec<Value>) -> Result<Response, TrackerError>,
        mut ops: Vec<Value>,
    ) -> Result<(Response, Vec<Field>), TrackerError> {
        let marker = format!("/fields/{ESTIMATE}");
        let has = |ops: &[Value]| ops.iter().any(|o| text(o, "/path") == marker);
        match run(ops.clone()) {
            Err(TrackerError::Http(shipyard_http::Error::Status {
                status: 400,
                detail,
                ..
            })) if has(&ops) && detail.contains("OriginalEstimate") => {
                ops.retain(|o| text(o, "/path") != marker);
                Ok((run(ops)?, vec![Field::Estimate]))
            }
            other => Ok((other?, vec![])),
        }
    }
}

impl TrackerWrite for Azure {
    fn assign(&self, key: &str, account: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Assignee)?;
        self.patch(
            key,
            vec![op("add", "/fields/System.AssignedTo", json!(account))],
        )?;
        Ok(())
    }

    fn add_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        if label.contains(';') {
            return Err(TrackerError::Config(
                "an Azure DevOps tag holds no `;`".into(),
            ));
        }
        let item = self
            .call(
                &format!("/_apis/wit/workitems/{}", digits("work item", key)?),
                &[("fields", "System.Tags")],
            )
            .map_err(|e| e.not_found(key))?;
        let tags = text(&item, "/fields/System.Tags");
        let mut all: Vec<&str> = tags
            .split(';')
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .collect();
        if all.iter().any(|t| t.eq_ignore_ascii_case(label)) {
            return Ok(());
        }
        all.push(label);
        // `test` on the revision: a change by someone else since the read stops the write.
        self.patch(
            key,
            vec![
                op("test", "/rev", json!(num(&item, "/rev").unwrap_or(0))),
                op("add", "/fields/System.Tags", json!(all.join("; "))),
            ],
        )?;
        Ok(())
    }

    fn remove_label(&self, key: &str, label: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Labels)?;
        let item = self
            .call(
                &format!("/_apis/wit/workitems/{}", digits("work item", key)?),
                &[("fields", "System.Tags")],
            )
            .map_err(|e| e.not_found(key))?;
        let tags = text(&item, "/fields/System.Tags");
        let all: Vec<&str> = tags
            .split(';')
            .map(str::trim)
            .filter(|t| !t.is_empty() && !t.eq_ignore_ascii_case(label))
            .collect();
        self.patch(
            key,
            vec![
                op("test", "/rev", json!(num(&item, "/rev").unwrap_or(0))),
                op("add", "/fields/System.Tags", json!(all.join("; "))),
            ],
        )?;
        Ok(())
    }

    fn set_priority(&self, key: &str, priority: &str) -> Result<(), TrackerError> {
        // Azure DevOps priority is 1 to 4: lowest and low share the last place.
        let n = super::work::rank(priority)?.min(4);
        self.patch(
            key,
            vec![op(
                "add",
                "/fields/Microsoft.VSTS.Common.Priority",
                json!(n),
            )],
        )?;
        Ok(())
    }

    fn transition(&self, key: &str, to: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Transitions)?;
        self.patch(key, vec![op("add", "/fields/System.State", json!(to))])
            .map(|_| ())
            .map_err(refused)
    }

    fn add_worklog(&self, _: &Click, _: &str, _: &NewWorklog) -> Result<Worklog, TrackerError> {
        Err(Capability::TimeTracking.into())
    }

    fn worklogs(&self, _: &str) -> Result<Vec<Worklog>, TrackerError> {
        Err(Capability::TimeTracking.into())
    }

    fn create(
        &self,
        scope: &str,
        epic: bool,
        f: &Fields,
        label: &str,
    ) -> Result<Written, TrackerError> {
        let kind = if epic {
            "Epic".to_string()
        } else {
            self.story_type(scope)?
        };
        let mut ops = self.ops(f, None)?;
        ops.push(op("add", "/fields/System.Tags", json!(label)));
        let path = format!("/{}/_apis/wit/workitems/${}", encode(scope), encode(&kind));
        let (made, skipped) = self.write_item(
            |o| self.send(Method::Post, &path, API, Value::Array(o), true),
            ops,
        )?;
        Ok(Written {
            key: made.json()?["id"].to_string(),
            skipped,
        })
    }

    fn update(&self, key: &str, f: &Fields) -> Result<Written, TrackerError> {
        let ops = self.ops(f, Some(key))?;
        let skipped = if ops.is_empty() {
            vec![]
        } else {
            self.write_item(|o| self.patch(key, o), ops)?.1
        };
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
        let project = self.project(key)?;
        let res = self.send(
            Method::Post,
            &format!("/{}/_apis/wit/workItems/{key}/comments", encode(&project)),
            COMMENTS_API,
            json!({ "text": html(body) }),
            false,
        )?;
        Ok(res.json()?["id"].to_string())
    }

    fn edit_comment(&self, key: &str, id: &str, body: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let id = digits("comment", id)?;
        let project = self.project(key)?;
        self.send(
            Method::Patch,
            &format!(
                "/{}/_apis/wit/workItems/{key}/comments/{id}",
                encode(&project)
            ),
            COMMENTS_API,
            json!({ "text": html(body) }),
            false,
        )
        .map(|_| ())
        .map_err(own)
    }

    fn delete_comment(&self, key: &str, id: &str) -> Result<(), TrackerError> {
        self.capabilities().require(Capability::Comments)?;
        let id = digits("comment", id)?;
        let project = self.project(key)?;
        self.remove(&format!(
            "/{}/_apis/wit/workItems/{key}/comments/{id}",
            encode(&project)
        ))
        .map_err(own)
    }
}
