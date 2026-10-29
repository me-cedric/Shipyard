//! GitLab: merge requests, discussions and labels, REST v4.

use super::*;
use crate::gitlab::{GitLab, project_path, pull, repository};
use crate::{CiState, ForgeError, Repository, segments};
use serde_json::json;
use shipyard_http::{Auth, Method, Request, build_url, encode, items, text};

impl GitLab {
    pub(crate) fn write(
        &self,
        method: Method,
        path: &str,
        body: Value,
    ) -> Result<Value, ForgeError> {
        let req = Request::write(
            method,
            build_url(&self.api, path, &[]),
            Auth::Header("PRIVATE-TOKEN", self.token.clone()),
            body,
        );
        json_or_null(self.http.send(&req)?.ok()?)
    }
}

/// GitLab has no draft flag on creation: the title prefix is the flag.
fn draft_title(title: &str, draft: bool) -> String {
    let title = title.trim();
    if draft && !is_draft_title(title) {
        format!("Draft: {title}")
    } else {
        title.to_string()
    }
}

fn is_draft_title(title: &str) -> bool {
    let t = title.to_ascii_lowercase();
    ["draft:", "[draft]", "(draft)"]
        .iter()
        .any(|p| t.starts_with(p))
}

fn ready_title(title: &str) -> String {
    let t = title.trim();
    if is_draft_title(t) {
        t.split_once([':', ']', ')'])
            .map_or(t, |(_, rest)| rest)
            .trim()
            .to_string()
    } else {
        t.to_string()
    }
}

/// Conflicts first, then the detailed status, then the older `merge_status`.
fn mergeable(v: &Value) -> Mergeable {
    if v["has_conflicts"].as_bool() == Some(true) {
        return Mergeable::Conflict;
    }
    if let Some(detail) = v["detailed_merge_status"].as_str() {
        return match detail {
            "mergeable" => Mergeable::Clean,
            "conflict" => Mergeable::Conflict,
            "checking" | "unchecked" | "preparing" => Mergeable::Unknown,
            _ => Mergeable::Blocked,
        };
    }
    match v["merge_status"].as_str() {
        Some("can_be_merged") => Mergeable::Clean,
        Some("cannot_be_merged") => Mergeable::Conflict,
        Some("checking" | "unchecked") | None => Mergeable::Unknown,
        Some(_) => Mergeable::Blocked,
    }
}

impl PullApi for GitLab {
    fn create_repo(&self, slug: &str) -> Result<Repository, ForgeError> {
        let parts = segments(slug, 2, 20)?;
        let (name, group) = parts.split_last().expect("two segments at least");
        let group = group.join("/");
        let ns = self
            .call(&format!("/namespaces/{}", encode(&group)), &[])
            .map_err(|e| e.not_found(&group))?;
        let v = self.write(
            Method::Post,
            "/projects",
            json!({
                "name": name, "path": name, "visibility": "private",
                "namespace_id": shipyard_http::num(&ns, "/id").unwrap_or(0),
            }),
        )?;
        Ok(repository(&v))
    }

    fn find_pull(&self, repo: &str, branch: &str) -> Result<Option<PullRequest>, ForgeError> {
        check_branch(branch)?;
        let v = self.call(
            &format!("{}/merge_requests", project_path(repo)?),
            &[
                ("source_branch", branch),
                ("state", "all"),
                ("order_by", "updated_at"),
                ("sort", "desc"),
                ("per_page", "30"),
            ],
        )?;
        Ok(prefer_open(
            v.as_array().into_iter().flatten().map(pull).collect(),
        ))
    }

    fn create_pull(&self, repo: &str, new: &NewPull) -> Result<PullRequest, ForgeError> {
        check_new(new)?;
        let v = self.write(
            Method::Post,
            &format!("{}/merge_requests", project_path(repo)?),
            json!({
                "title": draft_title(&new.title, new.draft),
                "source_branch": new.source,
                "target_branch": new.target,
                "description": new.body,
            }),
        )?;
        let made = pull(&v);
        if made.number == 0 {
            return Err(ForgeError::Rejected(
                "the forge accepted the request but returned no merge request".into(),
            ));
        }
        Ok(made)
    }

    fn mark_ready(&self, repo: &str, number: u64) -> Result<(), ForgeError> {
        let path = format!("{}/merge_requests/{number}", project_path(repo)?);
        let mr = self
            .call(&path, &[])
            .map_err(|e| e.not_found(&format!("{repo}!{number}")))?;
        self.write(
            Method::Put,
            &path,
            json!({ "title": ready_title(&text(&mr, "/title")) }),
        )?;
        Ok(())
    }

    fn labels(&self, repo: &str) -> Result<Vec<String>, ForgeError> {
        let mut out = Vec::new();
        // shortcut: 10 pages of 100 labels. A project with more labels loses the rest.
        for page in 1..=10 {
            let p = page.to_string();
            let v = self.call(
                &format!("{}/labels", project_path(repo)?),
                &[("per_page", "100"), ("page", p.as_str())],
            )?;
            let got = v.as_array().map_or(0, Vec::len);
            out.extend(items(&v, "").iter().map(|l| text(l, "/name")));
            if got < 100 {
                break;
            }
        }
        Ok(out)
    }

    fn apply_labels(&self, repo: &str, number: u64, labels: &[String]) -> Result<(), ForgeError> {
        // `add_labels` adds. `labels` would replace the set and remove a person's label.
        self.write(
            Method::Put,
            &format!("{}/merge_requests/{number}", project_path(repo)?),
            json!({ "add_labels": labels.join(",") }),
        )?;
        Ok(())
    }

    fn add_reviewers(
        &self,
        repo: &str,
        number: u64,
        reviewers: &[String],
    ) -> Result<(), ForgeError> {
        if reviewers.is_empty() {
            return Ok(());
        }
        let path = format!("{}/merge_requests/{number}", project_path(repo)?);
        // `reviewer_ids` replaces the list: start from the reviewers that are there.
        let mr = self
            .call(&path, &[])
            .map_err(|e| e.not_found(&format!("{repo}!{number}")))?;
        let mut ids: Vec<u64> = items(&mr, "/reviewers")
            .iter()
            .filter_map(|r| shipyard_http::num(r, "/id"))
            .collect();
        for name in reviewers {
            let found = self.call("/users", &[("username", name.as_str())])?;
            let id = items(&found, "")
                .first()
                .and_then(|u| shipyard_http::num(u, "/id"))
                .ok_or_else(|| ForgeError::NotFound(format!("user {name}")))?;
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
        self.write(Method::Put, &path, json!({ "reviewer_ids": ids }))?;
        Ok(())
    }

    fn threads(&self, repo: &str, number: u64) -> Result<Vec<ReviewThread>, ForgeError> {
        let v = self.call(
            &format!(
                "{}/merge_requests/{number}/discussions",
                project_path(repo)?
            ),
            &[("per_page", "100")],
        )?;
        Ok(v.as_array()
            .into_iter()
            .flatten()
            // A thread has resolvable notes. A plain comment and a system note do not.
            .filter(|d| {
                items(d, "/notes")
                    .iter()
                    .any(|n| n["resolvable"].as_bool() == Some(true))
            })
            .map(|d| {
                let notes = items(d, "/notes");
                ReviewThread {
                    id: text(d, "/id"),
                    resolved: notes
                        .iter()
                        .filter(|n| n["resolvable"].as_bool() == Some(true))
                        .all(|n| n["resolved"].as_bool() == Some(true)),
                    path: Some(text(&notes[0], "/position/new_path")).filter(|p| !p.is_empty()),
                    line: line(&notes[0], "/position/new_line"),
                    comments: notes
                        .iter()
                        .filter(|n| n["system"].as_bool() != Some(true))
                        .map(|n| ThreadComment {
                            author: text(n, "/author/username"),
                            body: text(n, "/body"),
                        })
                        .collect(),
                }
            })
            .collect())
    }

    fn reply_thread(
        &self,
        repo: &str,
        number: u64,
        thread: &str,
        body: &str,
    ) -> Result<(), ForgeError> {
        check_reply(body)?;
        self.write(
            Method::Post,
            &format!(
                "{}/merge_requests/{number}/discussions/{}/notes",
                project_path(repo)?,
                encode(thread)
            ),
            json!({ "body": body }),
        )?;
        Ok(())
    }

    fn resolve_thread(&self, repo: &str, number: u64, thread: &str) -> Result<(), ForgeError> {
        self.write(
            Method::Put,
            &format!(
                "{}/merge_requests/{number}/discussions/{}",
                project_path(repo)?,
                encode(thread)
            ),
            json!({ "resolved": true }),
        )?;
        Ok(())
    }

    fn status(&self, repo: &str, number: u64) -> Result<PullStatus, ForgeError> {
        let raw = self
            .call(
                &format!("{}/merge_requests/{number}", project_path(repo)?),
                &[],
            )
            .map_err(|e| e.not_found(&format!("{repo}!{number}")))?;
        let p = pull(&raw);
        let open = p.state == PullState::Open;
        Ok(PullStatus {
            state: p.state,
            draft: p.draft,
            ci: if open {
                self.ci_status(repo, number)?.state
            } else {
                CiState::None
            },
            // GitLab has the verdict in its detailed merge status only.
            changes_requested: open
                && raw["detailed_merge_status"].as_str() == Some("requested_changes"),
            mergeable: if open {
                mergeable(&raw)
            } else {
                Mergeable::Unknown
            },
            head_sha: p.head_sha,
        })
    }
}
