//! GitLab merge requests, pipelines and projects, REST v4. Works for gitlab.com and self-managed.

use crate::model::*;
use crate::{Forge, PullRequest};
use serde_json::Value;
use shipyard_http::{Auth, Http, Request, Response, TestOutcome, build_url, encode, items, text};
use shipyard_secrets::Secret;
use std::sync::Arc;

pub struct GitLab {
    http: Arc<dyn Http>,
    api: String,
    token: Secret,
}

impl GitLab {
    pub fn new(http: Arc<dyn Http>, base: &str, token: Secret) -> Self {
        Self {
            http,
            api: format!("{base}/api/v4"),
            token,
        }
    }

    fn send(&self, path: &str, query: &[(&str, &str)]) -> Result<Response, ForgeError> {
        let req = Request::get(
            build_url(&self.api, path, query),
            Auth::Header("PRIVATE-TOKEN", self.token.clone()),
        );
        Ok(self.http.send(&req)?.ok()?)
    }

    fn call(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, ForgeError> {
        Ok(self.send(path, query)?.json()?)
    }
}

/// `/projects/<encoded path>`. The whole path is one encoded segment.
fn project_path(repo: &str) -> Result<String, ForgeError> {
    segments(repo, 2, 20)?;
    Ok(format!("/projects/{}", encode(repo)))
}

fn pull(v: &Value) -> PullRequest {
    PullRequest {
        number: shipyard_http::num(v, "/iid").unwrap_or(0),
        title: text(v, "/title"),
        state: match text(v, "/state").as_str() {
            "merged" => PullState::Merged,
            "opened" => PullState::Open,
            _ => PullState::Closed,
        },
        draft: v["draft"].as_bool() == Some(true),
        author: text(v, "/author/username"),
        source_branch: text(v, "/source_branch"),
        target_branch: text(v, "/target_branch"),
        head_sha: text(v, "/sha"),
        url: text(v, "/web_url"),
        updated: text(v, "/updated_at"),
    }
}

fn repository(v: &Value) -> Repository {
    let archived = v["archived"].as_bool() == Some(true);
    // Developer (30) and above can push. A project and its group each grant a level.
    let level = [
        "/permissions/project_access/access_level",
        "/permissions/group_access/access_level",
    ]
    .iter()
    .filter_map(|p| v.pointer(p).and_then(Value::as_u64))
    .max();
    Repository {
        slug: text(v, "/path_with_namespace"),
        url: text(v, "/web_url"),
        default_branch: text(v, "/default_branch"),
        archived,
        // A project that shares its group with the account gives a level of 0 or none: not pushable.
        can_push: v
            .get("permissions")
            .map(|_| level.is_some_and(|l| l >= 30) && !archived),
    }
}

fn job_state(job: &Value) -> CheckState {
    match text(job, "/status").as_str() {
        "success" => CheckState::Passing,
        // A failed job that may fail does not fail the pipeline.
        "failed" if job["allow_failure"].as_bool() == Some(true) => CheckState::Skipped,
        "failed" | "canceled" => CheckState::Failing,
        "skipped" | "manual" => CheckState::Skipped,
        _ => CheckState::Pending,
    }
}

impl Forge for GitLab {
    fn kind(&self) -> ForgeKind {
        ForgeKind::GitLab
    }

    fn me(&self) -> Result<String, ForgeError> {
        let v = self.call("/user", &[])?;
        Ok(Some(text(&v, "/name"))
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| text(&v, "/username")))
    }

    fn list_pulls(&self, repo: &str, q: &PullQuery) -> Result<Page<PullRequest>, ForgeError> {
        let per_page = q.page_size().to_string();
        let page = q.cursor.clone().unwrap_or_else(|| "1".into());
        let state = match q.state {
            StateFilter::Open => "opened",
            StateFilter::Closed => "closed",
            StateFilter::Merged => "merged",
            StateFilter::All => "all",
        };
        let res = self.send(
            &format!("{}/merge_requests", project_path(repo)?),
            &[
                ("state", state),
                ("order_by", "updated_at"),
                ("sort", "desc"),
                ("per_page", per_page.as_str()),
                ("page", page.as_str()),
            ],
        )?;
        let next = res
            .header("x-next-page")
            .filter(|n| !n.is_empty())
            .map(String::from);
        Ok(Page {
            items: res
                .json()?
                .as_array()
                .into_iter()
                .flatten()
                .map(pull)
                .collect(),
            next,
        })
    }

    fn pull(&self, repo: &str, number: u64) -> Result<PullRequest, ForgeError> {
        let v = self
            .call(
                &format!("{}/merge_requests/{number}", project_path(repo)?),
                &[],
            )
            .map_err(|e| e.not_found(&format!("{repo}!{number}")))?;
        Ok(pull(&v))
    }

    fn ci_status(&self, repo: &str, number: u64) -> Result<CiStatus, ForgeError> {
        let project = project_path(repo)?;
        let mr = self
            .call(&format!("{project}/merge_requests/{number}"), &[])
            .map_err(|e| e.not_found(&format!("{repo}!{number}")))?;
        let Some(id) = shipyard_http::num(&mr, "/head_pipeline/id") else {
            return Ok(CiStatus::from_checks(Vec::new()));
        };
        let jobs = self.call(
            &format!("{project}/pipelines/{id}/jobs"),
            &[("per_page", "100")],
        )?;
        let checks = jobs
            .as_array()
            .into_iter()
            .flatten()
            .map(|j| Check {
                name: text(j, "/name"),
                state: job_state(j),
                url: text(j, "/web_url"),
            })
            .collect();
        Ok(CiStatus::from_checks(checks))
    }

    fn list_repos(
        &self,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<Page<Repository>, ForgeError> {
        let size = if limit == 0 { 30 } else { limit.min(100) };
        let per_page = size.to_string();
        let res = self.send(
            "/projects",
            &[
                ("membership", "true"),
                ("order_by", "last_activity_at"),
                ("per_page", per_page.as_str()),
                ("page", cursor.unwrap_or("1")),
            ],
        )?;
        let next = res
            .header("x-next-page")
            .filter(|n| !n.is_empty())
            .map(String::from);
        Ok(Page {
            items: res
                .json()?
                .as_array()
                .into_iter()
                .flatten()
                .map(repository)
                .collect(),
            next,
        })
    }

    fn repository(&self, repo: &str) -> Result<Repository, ForgeError> {
        let v = self
            .call(&project_path(repo)?, &[])
            .map_err(|e| e.not_found(repo))?;
        Ok(repository(&v))
    }

    fn test(&self, repo: Option<&str>) -> TestOutcome {
        let kind = self.kind();
        let account = match self.me() {
            Ok(me) => me,
            Err(e) => return outcome(e, kind),
        };
        // A personal access token lists its scopes. Another kind of token has no such record: skip it.
        if let Ok(token) = self.call("/personal_access_tokens/self", &[]) {
            let scopes: Vec<&str> = items(&token, "/scopes")
                .iter()
                .filter_map(Value::as_str)
                .collect();
            if !scopes.is_empty() && !scopes.iter().any(|s| matches!(*s, "api" | "read_api")) {
                return TestOutcome::MissingScope {
                    scope: kind.read_scope().into(),
                };
            }
        }
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
