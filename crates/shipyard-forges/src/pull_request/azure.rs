//! Azure DevOps: pull requests, labels, reviewers and threads, REST 7.1.

use super::*;
use crate::azure::{API, Azure, repo_path, repository};
use crate::{CiState, ForgeError, Repository, segments};
use serde_json::json;
use shipyard_http::{Auth, Method, Request, build_url, encode, items, text};

impl Azure {
    pub(crate) fn write(
        &self,
        method: Method,
        path: &str,
        body: Value,
    ) -> Result<Value, ForgeError> {
        let req = Request::write(
            method,
            build_url(&self.base, path, &[("api-version", API)]),
            Auth::Basic(String::new(), self.token.clone()),
            body,
        );
        json_or_null(self.http.send(&req)?.ok()?)
    }
}

fn is_guid(id: &str) -> bool {
    let parts: Vec<&str> = id.split('-').collect();
    parts.len() == 5
        && parts
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(p, n)| p.len() == n && p.chars().all(|c| c.is_ascii_hexdigit()))
}

fn mergeable(v: &Value) -> Mergeable {
    match v["mergeStatus"].as_str() {
        Some("succeeded") => Mergeable::Clean,
        Some("conflicts") => Mergeable::Conflict,
        Some("rejectedByPolicy" | "failure") => Mergeable::Blocked,
        _ => Mergeable::Unknown,
    }
}

impl PullApi for Azure {
    // Azure DevOps has no per-repository visibility: the project sets it.
    fn create_repo(&self, slug: &str) -> Result<Repository, ForgeError> {
        let parts = segments(slug, 2, 2)?;
        let path = format!("/{}/_apis/git/repositories", encode(parts[0]));
        let v = self.write(Method::Post, &path, json!({ "name": parts[1] }))?;
        Ok(repository(&v))
    }

    fn find_pull(&self, repo: &str, branch: &str) -> Result<Option<PullRequest>, ForgeError> {
        check_branch(branch)?;
        let source = format!("refs/heads/{branch}");
        let v = self.call(
            &format!("{}/pullrequests", repo_path(repo)?),
            &[
                ("searchCriteria.sourceRefName", source.as_str()),
                ("searchCriteria.status", "all"),
                ("$top", "30"),
            ],
            API,
        )?;
        Ok(prefer_open(
            items(&v, "/value")
                .iter()
                .map(|p| self.pull_from(p, repo))
                .collect(),
        ))
    }

    fn create_pull(&self, repo: &str, new: &NewPull) -> Result<PullRequest, ForgeError> {
        check_new(new)?;
        let v = self.write(
            Method::Post,
            &format!("{}/pullrequests", repo_path(repo)?),
            json!({
                "sourceRefName": format!("refs/heads/{}", new.source),
                "targetRefName": format!("refs/heads/{}", new.target),
                "title": new.title.trim(),
                "description": new.body,
                "isDraft": new.draft,
            }),
        )?;
        let made = self.pull_from(&v, repo);
        if made.number == 0 {
            return Err(ForgeError::Rejected(
                "the forge accepted the request but returned no pull request".into(),
            ));
        }
        Ok(made)
    }

    fn mark_ready(&self, repo: &str, number: u64) -> Result<(), ForgeError> {
        self.write(
            Method::Patch,
            &format!("{}/pullrequests/{number}", repo_path(repo)?),
            json!({ "isDraft": false }),
        )?;
        Ok(())
    }

    fn labels(&self, repo: &str) -> Result<Vec<String>, ForgeError> {
        // shortcut: Azure DevOps keeps no label list per repository. The labels in use on the
        // last 100 pull requests are the labels that exist. Use the tagging API if a team needs
        // a label that no recent pull request carries.
        let v = self.call(
            &format!("{}/pullrequests", repo_path(repo)?),
            &[("searchCriteria.status", "all"), ("$top", "100")],
            API,
        )?;
        let mut out: Vec<String> = items(&v, "/value")
            .iter()
            .flat_map(|p| items(p, "/labels").iter().map(|l| text(l, "/name")))
            .filter(|n| !n.is_empty())
            .collect();
        out.sort();
        out.dedup();
        Ok(out)
    }

    fn apply_labels(&self, repo: &str, number: u64, labels: &[String]) -> Result<(), ForgeError> {
        for label in labels {
            self.write(
                Method::Post,
                &format!("{}/pullrequests/{number}/labels", repo_path(repo)?),
                json!({ "name": label }),
            )?;
        }
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
        // shortcut: an identity id only. A name lookup needs the vssps identity service on
        // another host. Resolve names in the connection settings when a team needs it.
        if let Some(bad) = reviewers.iter().find(|r| !is_guid(r)) {
            return Err(ForgeError::Config(format!(
                "Azure DevOps reviewers are identity ids (a GUID), not {bad}"
            )));
        }
        let list: Vec<Value> = reviewers.iter().map(|id| json!({ "id": id })).collect();
        // POST adds reviewers and keeps the votes that exist. PUT would reset a vote.
        self.write(
            Method::Post,
            &format!("{}/pullrequests/{number}/reviewers", repo_path(repo)?),
            Value::Array(list),
        )?;
        Ok(())
    }

    fn threads(&self, repo: &str, number: u64) -> Result<Vec<ReviewThread>, ForgeError> {
        let v = self.call(
            &format!("{}/pullrequests/{number}/threads", repo_path(repo)?),
            &[],
            API,
        )?;
        Ok(items(&v, "/value")
            .iter()
            .filter(|t| t["isDeleted"].as_bool() != Some(true))
            .filter_map(|t| {
                let comments: Vec<ThreadComment> = items(t, "/comments")
                    .iter()
                    .filter(|c| text(c, "/commentType") != "system")
                    .map(|c| ThreadComment {
                        author: text(c, "/author/displayName"),
                        body: text(c, "/content"),
                    })
                    .collect();
                // A thread of system messages only (a vote, a push) is not a conversation.
                (!comments.is_empty()).then(|| ReviewThread {
                    id: shipyard_http::num(t, "/id").map_or_else(String::new, |n| n.to_string()),
                    resolved: matches!(
                        text(t, "/status").as_str(),
                        "fixed" | "closed" | "wontFix" | "byDesign"
                    ),
                    path: Some(text(t, "/threadContext/filePath")).filter(|p| !p.is_empty()),
                    line: line(t, "/threadContext/rightFileStart/line"),
                    comments,
                })
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
        let id: u64 = thread
            .parse()
            .map_err(|_| ForgeError::Config(format!("not a thread id: {thread}")))?;
        // Comment 1 is the root of the thread.
        self.write(
            Method::Post,
            &format!(
                "{}/pullrequests/{number}/threads/{id}/comments",
                repo_path(repo)?
            ),
            json!({ "content": body, "parentCommentId": 1, "commentType": 1 }),
        )?;
        Ok(())
    }

    fn resolve_thread(&self, repo: &str, number: u64, thread: &str) -> Result<(), ForgeError> {
        let id: u64 = thread
            .parse()
            .map_err(|_| ForgeError::Config(format!("not a thread id: {thread}")))?;
        self.write(
            Method::Patch,
            &format!("{}/pullrequests/{number}/threads/{id}", repo_path(repo)?),
            json!({ "status": "fixed" }),
        )?;
        Ok(())
    }

    fn status(&self, repo: &str, number: u64) -> Result<PullStatus, ForgeError> {
        let raw = self.raw_pull(repo, number)?;
        let p = self.pull_from(&raw, repo);
        let open = p.state == PullState::Open;
        Ok(PullStatus {
            state: p.state,
            draft: p.draft,
            ci: if open {
                self.ci_status(repo, number)?.state
            } else {
                CiState::None
            },
            // Vote -10 is rejected, -5 is waiting for the author.
            changes_requested: open
                && items(&raw, "/reviewers")
                    .iter()
                    .any(|r| r["vote"].as_i64().is_some_and(|v| v <= -5)),
            mergeable: if open {
                mergeable(&raw)
            } else {
                Mergeable::Unknown
            },
            head_sha: p.head_sha,
        })
    }
}
