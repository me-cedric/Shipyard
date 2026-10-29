//! GitHub pull requests, checks and repositories, REST.
//! github.com answers on `api.github.com`; Enterprise Server on `/api/v3`.

use crate::model::*;
use crate::{Forge, PullRequest};
use serde_json::Value;
use shipyard_http::{Auth, Http, Request, TestOutcome, build_url, encode, items, text};
use shipyard_secrets::Secret;
use std::sync::Arc;

pub struct GitHub {
    http: Arc<dyn Http>,
    api: String,
    token: Secret,
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

    fn call(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, ForgeError> {
        let req = Request::get(
            build_url(&self.api, path, query),
            Auth::Bearer(self.token.clone()),
        )
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
        Ok(self.http.json(&req)?)
    }
}

/// `owner/repo` as a path.
fn repo_path(repo: &str) -> Result<String, ForgeError> {
    let parts = segments(repo, 2, 2)?;
    Ok(format!("/repos/{}/{}", encode(parts[0]), encode(parts[1])))
}

fn pull(v: &Value) -> PullRequest {
    let state = if !text(v, "/merged_at").is_empty() {
        PullState::Merged
    } else if text(v, "/state") == "closed" {
        PullState::Closed
    } else {
        PullState::Open
    };
    PullRequest {
        number: shipyard_http::num(v, "/number").unwrap_or(0),
        title: text(v, "/title"),
        state,
        draft: v["draft"].as_bool() == Some(true),
        author: text(v, "/user/login"),
        source_branch: text(v, "/head/ref"),
        target_branch: text(v, "/base/ref"),
        head_sha: text(v, "/head/sha"),
        url: text(v, "/html_url"),
        updated: text(v, "/updated_at"),
    }
}

fn repository(v: &Value) -> Repository {
    let archived = v["archived"].as_bool() == Some(true);
    Repository {
        slug: text(v, "/full_name"),
        url: text(v, "/html_url"),
        default_branch: text(v, "/default_branch"),
        archived,
        // The permissions object is present when the request is authenticated.
        can_push: v
            .pointer("/permissions/push")
            .and_then(Value::as_bool)
            .map(|p| p && !archived),
    }
}

fn run_state(run: &Value) -> CheckState {
    if text(run, "/status") != "completed" {
        return CheckState::Pending;
    }
    match text(run, "/conclusion").as_str() {
        "success" | "neutral" => CheckState::Passing,
        "skipped" => CheckState::Skipped,
        _ => CheckState::Failing,
    }
}

impl Forge for GitHub {
    fn kind(&self) -> ForgeKind {
        ForgeKind::GitHub
    }

    fn me(&self) -> Result<String, ForgeError> {
        let v = self.call("/user", &[])?;
        Ok(Some(text(&v, "/name"))
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| text(&v, "/login")))
    }

    fn list_pulls(&self, repo: &str, q: &PullQuery) -> Result<Page<PullRequest>, ForgeError> {
        let per_page = q.page_size().to_string();
        let page = q.cursor.clone().unwrap_or_else(|| "1".into());
        // GitHub has no `merged` filter: a merged pull request is a closed one with `merged_at`.
        let state = match q.state {
            StateFilter::Open => "open",
            StateFilter::Closed | StateFilter::Merged => "closed",
            StateFilter::All => "all",
        };
        let v = self.call(
            &format!("{}/pulls", repo_path(repo)?),
            &[
                ("state", state),
                ("sort", "updated"),
                ("direction", "desc"),
                ("per_page", per_page.as_str()),
                ("page", page.as_str()),
            ],
        )?;
        let raw = v.as_array().map_or(0, Vec::len);
        let mut found: Vec<PullRequest> = v.as_array().into_iter().flatten().map(pull).collect();
        match q.state {
            // shortcut: a filtered page can hold fewer items than asked; the caller follows `next`.
            StateFilter::Merged => found.retain(|p| p.state == PullState::Merged),
            StateFilter::Closed => found.retain(|p| p.state == PullState::Closed),
            _ => {}
        }
        let next =
            (raw == q.page_size()).then(|| (page.parse::<u64>().unwrap_or(1) + 1).to_string());
        Ok(Page { items: found, next })
    }

    fn pull(&self, repo: &str, number: u64) -> Result<PullRequest, ForgeError> {
        let v = self
            .call(&format!("{}/pulls/{number}", repo_path(repo)?), &[])
            .map_err(|e| e.not_found(&format!("{repo}#{number}")))?;
        Ok(pull(&v))
    }

    fn ci_status(&self, repo: &str, number: u64) -> Result<CiStatus, ForgeError> {
        let sha = self.pull(repo, number)?.head_sha;
        let root = format!("{}/commits/{}", repo_path(repo)?, encode(&sha));
        let runs = self.call(&format!("{root}/check-runs"), &[("per_page", "100")])?;
        // Older CI systems post a commit status, not a check run.
        let statuses = self.call(&format!("{root}/status"), &[("per_page", "100")])?;
        let mut checks: Vec<Check> = items(&runs, "/check_runs")
            .iter()
            .map(|r| Check {
                name: text(r, "/name"),
                state: run_state(r),
                url: text(r, "/html_url"),
            })
            .collect();
        checks.extend(items(&statuses, "/statuses").iter().map(|s| Check {
            name: text(s, "/context"),
            state: match text(s, "/state").as_str() {
                "success" => CheckState::Passing,
                "failure" | "error" => CheckState::Failing,
                _ => CheckState::Pending,
            },
            url: text(s, "/target_url"),
        }));
        Ok(CiStatus::from_checks(checks))
    }

    fn list_repos(
        &self,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<Page<Repository>, ForgeError> {
        let size = if limit == 0 { 30 } else { limit.min(100) };
        let per_page = size.to_string();
        let page = cursor.unwrap_or("1");
        let v = self.call(
            "/user/repos",
            &[
                ("affiliation", "owner,collaborator,organization_member"),
                ("sort", "updated"),
                ("per_page", per_page.as_str()),
                ("page", page),
            ],
        )?;
        let raw = v.as_array().map_or(0, Vec::len);
        let next = (raw == size).then(|| (page.parse::<u64>().unwrap_or(1) + 1).to_string());
        Ok(Page {
            items: v.as_array().into_iter().flatten().map(repository).collect(),
            next,
        })
    }

    fn repository(&self, repo: &str) -> Result<Repository, ForgeError> {
        let v = self
            .call(&repo_path(repo)?, &[])
            .map_err(|e| e.not_found(repo))?;
        Ok(repository(&v))
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
