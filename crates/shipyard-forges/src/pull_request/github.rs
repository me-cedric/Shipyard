//! GitHub: REST for pulls, labels and reviewers; GraphQL for threads and the ready mark
//! (REST has no thread resolve and no resolved flag).

use super::*;
use crate::github::{GitHub, pull, repo_path, repository};
use crate::{ForgeError, Repository, segments};
use serde_json::json;
use shipyard_http::{Auth, Method, Request, build_url, encode, items, text};

impl GitHub {
    pub(crate) fn write(
        &self,
        method: Method,
        path: &str,
        body: Value,
    ) -> Result<Value, ForgeError> {
        let req = Request::write(
            method,
            build_url(&self.api, path, &[]),
            Auth::Bearer(self.token.clone()),
            body,
        )
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
        json_or_null(self.http.send(&req)?.ok()?)
    }

    fn get(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, ForgeError> {
        let req = Request::get(
            build_url(&self.api, path, query),
            Auth::Bearer(self.token.clone()),
        )
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
        Ok(self.http.json(&req)?)
    }

    /// github.com: `api.github.com/graphql`. Enterprise Server: `<host>/api/graphql`.
    fn graphql(&self, query: &str, variables: Value) -> Result<Value, ForgeError> {
        let url = match self.api.strip_suffix("/api/v3") {
            Some(host) => format!("{host}/api/graphql"),
            None => format!("{}/graphql", self.api),
        };
        let body = json!({ "query": query, "variables": variables });
        let reply = self.write_to(&url, body)?;
        if let Some(first) = items(&reply, "/errors").first() {
            return Err(ForgeError::Rejected(
                self.token.scrub(&text(first, "/message")),
            ));
        }
        Ok(reply["data"].clone())
    }

    fn write_to(&self, url: &str, body: Value) -> Result<Value, ForgeError> {
        let req = Request::write(
            Method::Post,
            url.to_string(),
            Auth::Bearer(self.token.clone()),
            body,
        );
        json_or_null(self.http.send(&req)?.ok()?)
    }
}

/// `CHANGES_REQUESTED` stands until the same person approves, comments with a verdict or
/// the review is dismissed. The reviews come oldest first.
fn changes_requested(reviews: &Value) -> bool {
    let mut last: Vec<(String, String)> = Vec::new();
    for r in reviews.as_array().into_iter().flatten() {
        let state = text(r, "/state");
        if matches!(state.as_str(), "COMMENTED" | "PENDING") {
            continue;
        }
        let who = text(r, "/user/login");
        last.retain(|(w, _)| *w != who);
        last.push((who, state));
    }
    last.iter().any(|(_, s)| s == "CHANGES_REQUESTED")
}

/// `mergeable_state` is computed on the single read only; a list item says "unknown".
fn mergeable(v: &Value) -> Mergeable {
    match v["mergeable_state"].as_str() {
        Some("clean" | "has_hooks" | "unstable") => Mergeable::Clean,
        Some("dirty") => Mergeable::Conflict,
        Some("blocked" | "behind" | "draft") => Mergeable::Blocked,
        _ => match v["mergeable"].as_bool() {
            Some(true) => Mergeable::Clean,
            Some(false) => Mergeable::Conflict,
            None => Mergeable::Unknown,
        },
    }
}

impl PullApi for GitHub {
    fn create_repo(&self, slug: &str) -> Result<Repository, ForgeError> {
        let parts = segments(slug, 2, 2)?;
        // An organization has its own route; the account itself uses `/user/repos`.
        let login = text(&self.get("/user", &[])?, "/login");
        let path = if parts[0].eq_ignore_ascii_case(&login) {
            "/user/repos".to_string()
        } else {
            format!("/orgs/{}/repos", encode(parts[0]))
        };
        let v = self.write(
            Method::Post,
            &path,
            json!({ "name": parts[1], "private": true }),
        )?;
        Ok(repository(&v))
    }

    fn find_pull(&self, repo: &str, branch: &str) -> Result<Option<PullRequest>, ForgeError> {
        check_branch(branch)?;
        let owner = segments(repo, 2, 2)?[0];
        let head = format!("{owner}:{branch}");
        let v = self.get(
            &format!("{}/pulls", repo_path(repo)?),
            &[
                ("head", head.as_str()),
                ("state", "all"),
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
            &format!("{}/pulls", repo_path(repo)?),
            json!({
                "title": new.title.trim(), "head": new.source, "base": new.target,
                "body": new.body, "draft": new.draft,
            }),
        )?;
        let made = pull(&v);
        if made.number == 0 {
            return Err(ForgeError::Rejected(
                "the forge accepted the request but returned no pull request".into(),
            ));
        }
        Ok(made)
    }

    fn mark_ready(&self, repo: &str, number: u64) -> Result<(), ForgeError> {
        let raw = self
            .get(&format!("{}/pulls/{number}", repo_path(repo)?), &[])
            .map_err(|e| e.not_found(&format!("{repo}#{number}")))?;
        self.graphql(
            "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}",
            json!({ "id": text(&raw, "/node_id") }),
        )?;
        Ok(())
    }

    fn labels(&self, repo: &str) -> Result<Vec<String>, ForgeError> {
        let mut out = Vec::new();
        // shortcut: 10 pages of 100 labels. A repository with more labels loses the rest.
        for page in 1..=10 {
            let p = page.to_string();
            let v = self.get(
                &format!("{}/labels", repo_path(repo)?),
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
        self.write(
            Method::Post,
            &format!("{}/issues/{number}/labels", repo_path(repo)?),
            json!({ "labels": labels }),
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
        self.write(
            Method::Post,
            &format!("{}/pulls/{number}/requested_reviewers", repo_path(repo)?),
            json!({ "reviewers": reviewers }),
        )?;
        Ok(())
    }

    fn threads(&self, repo: &str, number: u64) -> Result<Vec<ReviewThread>, ForgeError> {
        let parts = segments(repo, 2, 2)?;
        let data = self.graphql(
            "query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved path line comments(first:50){nodes{author{login} body}}}}}}}",
            json!({ "owner": parts[0], "name": parts[1], "number": number }),
        )?;
        Ok(items(&data, "/repository/pullRequest/reviewThreads/nodes")
            .iter()
            .map(|t| ReviewThread {
                id: text(t, "/id"),
                resolved: t["isResolved"].as_bool() == Some(true),
                path: Some(text(t, "/path")).filter(|p| !p.is_empty()),
                line: line(t, "/line"),
                comments: items(t, "/comments/nodes")
                    .iter()
                    .map(|c| ThreadComment {
                        author: text(c, "/author/login"),
                        body: text(c, "/body"),
                    })
                    .collect(),
            })
            .collect())
    }

    fn reply_thread(
        &self,
        _repo: &str,
        _number: u64,
        thread: &str,
        body: &str,
    ) -> Result<(), ForgeError> {
        check_reply(body)?;
        self.graphql(
            "mutation($thread:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$thread,body:$body}){comment{id}}}",
            json!({ "thread": thread, "body": body }),
        )?;
        Ok(())
    }

    fn resolve_thread(&self, _repo: &str, _number: u64, thread: &str) -> Result<(), ForgeError> {
        self.graphql(
            "mutation($thread:ID!){resolveReviewThread(input:{threadId:$thread}){thread{isResolved}}}",
            json!({ "thread": thread }),
        )?;
        Ok(())
    }

    fn status(&self, repo: &str, number: u64) -> Result<PullStatus, ForgeError> {
        let path = format!("{}/pulls/{number}", repo_path(repo)?);
        let raw = self
            .get(&path, &[])
            .map_err(|e| e.not_found(&format!("{repo}#{number}")))?;
        let p = pull(&raw);
        let mut status = PullStatus {
            state: p.state,
            draft: p.draft,
            ci: CiState::None,
            changes_requested: false,
            mergeable: Mergeable::Unknown,
            head_sha: p.head_sha,
        };
        if p.state == PullState::Open {
            status.mergeable = mergeable(&raw);
            status.changes_requested =
                changes_requested(&self.get(&format!("{path}/reviews"), &[("per_page", "100")])?);
            status.ci = self.ci_status(repo, number)?.state;
        }
        Ok(status)
    }
}
