//! Azure DevOps pull requests, build policies and repositories, REST 7.1.
//! The base address holds the organization or the collection: `https://dev.azure.com/acme`.
//! A repository slug is `project/repo`. The credential is a personal access token.

use crate::model::*;
use crate::{Forge, PullRequest};
use serde_json::Value;
use shipyard_http::{Auth, Http, Request, TestOutcome, build_url, encode, items, text};
use shipyard_secrets::Secret;
use std::sync::Arc;

pub(crate) const API: &str = "7.1";
const GIT_NAMESPACE: &str = "2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87";

pub struct Azure {
    pub(crate) http: Arc<dyn Http>,
    pub(crate) base: String,
    pub(crate) token: Secret,
}

impl Azure {
    pub fn new(http: Arc<dyn Http>, base: String, token: Secret) -> Self {
        Self { http, base, token }
    }

    pub(crate) fn call(
        &self,
        path: &str,
        query: &[(&str, &str)],
        api: &str,
    ) -> Result<Value, ForgeError> {
        let mut q = query.to_vec();
        q.push(("api-version", api));
        let req = Request::get(
            build_url(&self.base, path, &q),
            Auth::Basic(String::new(), self.token.clone()),
        );
        Ok(self.http.json(&req)?)
    }

    /// The raw pull request: the policy call needs the project id that it holds.
    pub(crate) fn raw_pull(&self, repo: &str, number: u64) -> Result<Value, ForgeError> {
        self.call(
            &format!("{}/pullrequests/{number}", repo_path(repo)?),
            &[],
            API,
        )
        .map_err(|e| e.not_found(&format!("{repo}!{number}")))
    }

    pub(crate) fn pull_from(&self, v: &Value, repo: &str) -> PullRequest {
        let number = shipyard_http::num(v, "/pullRequestId").unwrap_or(0);
        let (project, name) = repo.split_once('/').unwrap_or((repo, ""));
        let closed = text(v, "/closedDate");
        PullRequest {
            number,
            title: text(v, "/title"),
            state: match text(v, "/status").as_str() {
                "completed" => PullState::Merged,
                "abandoned" => PullState::Closed,
                _ => PullState::Open,
            },
            draft: v["isDraft"].as_bool() == Some(true),
            author: [
                text(v, "/createdBy/displayName"),
                text(v, "/createdBy/uniqueName"),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default(),
            source_branch: branch(&text(v, "/sourceRefName")),
            target_branch: branch(&text(v, "/targetRefName")),
            head_sha: text(v, "/lastMergeSourceCommit/commitId"),
            url: format!(
                "{}/{}/_git/{}/pullrequest/{number}",
                self.base,
                encode(project),
                encode(name)
            ),
            updated: if closed.is_empty() {
                text(v, "/creationDate")
            } else {
                closed
            },
        }
    }
}

/// `/<project>/_apis/git/repositories/<repo>`.
pub(crate) fn repo_path(repo: &str) -> Result<String, ForgeError> {
    let parts = segments(repo, 2, 2)?;
    Ok(format!(
        "/{}/_apis/git/repositories/{}",
        encode(parts[0]),
        encode(parts[1])
    ))
}

pub(crate) fn repository(v: &Value) -> Repository {
    Repository {
        slug: format!("{}/{}", text(v, "/project/name"), text(v, "/name")),
        url: text(v, "/webUrl"),
        default_branch: branch(&text(v, "/defaultBranch")),
        archived: v["isDisabled"].as_bool() == Some(true),
        // A listing carries no permission: `repository()` of the trait asks the security API.
        can_push: None,
    }
}

fn status_state(state: &str) -> CheckState {
    match state {
        "succeeded" => CheckState::Passing,
        "failed" | "error" => CheckState::Failing,
        "notApplicable" | "notSet" => CheckState::Skipped,
        _ => CheckState::Pending,
    }
}

impl Forge for Azure {
    fn kind(&self) -> ForgeKind {
        ForgeKind::AzureDevOps
    }

    fn me(&self) -> Result<String, ForgeError> {
        let v = self.call(
            "/_apis/connectionData",
            &[("connectOptions", "none")],
            "7.1-preview",
        )?;
        Ok(text(&v, "/authenticatedUser/providerDisplayName"))
    }

    fn list_pulls(&self, repo: &str, q: &PullQuery) -> Result<Page<PullRequest>, ForgeError> {
        let size = q.page_size();
        let top = size.to_string();
        let skip: usize = q
            .cursor
            .as_deref()
            .and_then(|c| c.parse().ok())
            .unwrap_or(0);
        let skip_text = skip.to_string();
        let status = match q.state {
            StateFilter::Open => "active",
            StateFilter::Closed => "abandoned",
            StateFilter::Merged => "completed",
            StateFilter::All => "all",
        };
        let v = self.call(
            &format!("{}/pullrequests", repo_path(repo)?),
            &[
                ("searchCriteria.status", status),
                ("$top", top.as_str()),
                ("$skip", skip_text.as_str()),
            ],
            API,
        )?;
        let found: Vec<PullRequest> = items(&v, "/value")
            .iter()
            .map(|p| self.pull_from(p, repo))
            .collect();
        let next = (found.len() == size).then(|| (skip + size).to_string());
        Ok(Page { items: found, next })
    }

    fn pull(&self, repo: &str, number: u64) -> Result<PullRequest, ForgeError> {
        Ok(self.pull_from(&self.raw_pull(repo, number)?, repo))
    }

    fn ci_status(&self, repo: &str, number: u64) -> Result<CiStatus, ForgeError> {
        let raw = self.raw_pull(repo, number)?;
        let mut checks: Vec<Check> = Vec::new();
        // Statuses that a CI system posted to the pull request.
        let statuses = self.call(
            &format!("{}/pullrequests/{number}/statuses", repo_path(repo)?),
            &[],
            API,
        )?;
        checks.extend(items(&statuses, "/value").iter().map(|s| Check {
            name: text(s, "/context/name"),
            state: status_state(&text(s, "/state")),
            url: text(s, "/targetUrl"),
        }));
        // Build policies of the target branch. Other policies (reviewers) are not CI.
        let project_id = text(&raw, "/repository/project/id");
        if !project_id.is_empty() {
            let artifact = format!("vstfs:///CodeReview/CodeReviewId/{project_id}/{number}");
            let project = repo.split('/').next().unwrap_or_default();
            let evaluations = self.call(
                &format!("/{}/_apis/policy/evaluations", encode(project)),
                &[("artifactId", artifact.as_str())],
                "7.1-preview.1",
            )?;
            checks.extend(
                items(&evaluations, "/value")
                    .iter()
                    .filter(|e| text(e, "/configuration/type/displayName") == "Build")
                    .map(|e| Check {
                        name: text(e, "/configuration/settings/displayName"),
                        state: match text(e, "/status").as_str() {
                            "approved" => CheckState::Passing,
                            "rejected" | "broken" => CheckState::Failing,
                            "notApplicable" => CheckState::Skipped,
                            _ => CheckState::Pending,
                        },
                        url: String::new(),
                    }),
            );
        }
        Ok(CiStatus::from_checks(checks))
    }

    fn list_repos(
        &self,
        _cursor: Option<&str>,
        _limit: usize,
    ) -> Result<Page<Repository>, ForgeError> {
        // The API returns every repository of the organization in one answer.
        let v = self.call("/_apis/git/repositories", &[], API)?;
        Ok(Page {
            items: items(&v, "/value").iter().map(repository).collect(),
            next: None,
        })
    }

    fn repository(&self, repo: &str) -> Result<Repository, ForgeError> {
        let v = self
            .call(&repo_path(repo)?, &[], API)
            .map_err(|e| e.not_found(repo))?;
        let mut repo = repository(&v);
        // The security namespace "Git Repositories", bit 4 (GenericContribute): may the account push?
        // A refused or failed check leaves the marker unknown.
        let token = format!("repoV2/{}/{}", text(&v, "/project/id"), text(&v, "/id"));
        let path = format!("/_apis/permissions/{GIT_NAMESPACE}/4");
        repo.can_push = self
            .call(&path, &[("tokens", token.as_str())], API)
            .ok()
            .and_then(|p| p.pointer("/value/0").and_then(Value::as_bool))
            .map(|allowed| allowed && !repo.archived);
        Ok(repo)
    }

    fn test(&self, repo: Option<&str>) -> TestOutcome {
        let kind = self.kind();
        let account = match self.me() {
            Ok(me) => me,
            Err(e) => return outcome(e, kind),
        };
        let probe = match repo {
            Some(repo) => self
                .list_pulls(
                    repo,
                    &PullQuery {
                        limit: 1,
                        ..PullQuery::default()
                    },
                )
                .map(drop),
            None => self.list_repos(None, 1).map(drop),
        };
        match probe {
            Ok(()) => TestOutcome::Passed { account },
            Err(e) => outcome(e, kind),
        }
    }
}
