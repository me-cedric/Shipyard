//! Pull request reads and writes for Code / Pull requests (spec `code`, REQ-019 to REQ-023,
//! REQ-025): files, commits, comment, verdict, merge. Opening and marking ready are in
//! [`PullApi`]. A call here sends its write. The caller checks the write switch or asks for a
//! click first. A refusal of the forge comes back with the forge message (REQ-025).

use crate::azure::{API, Azure, repo_path as az_repo};
use crate::github::{GitHub, repo_path as gh_repo};
use crate::gitlab::{GitLab, project_path};
use crate::{ForgeError, PullApi, PullState};
use serde::{Deserialize, Serialize};
use serde_json::json;
use shipyard_http::{Method, items, text};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum MergeMethod {
    Merge,
    Squash,
    Rebase,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Verdict {
    Approve,
    RequestChanges,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PullFile {
    pub path: String,
    /// `added`, `modified`, `removed` or `renamed`.
    pub status: String,
    /// The unified diff. `None` when the forge sends none (Azure DevOps).
    pub patch: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PullCommit {
    pub sha: String,
    pub summary: String,
}

/// The verdict of one reviewer (REQ-021).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ReviewerVerdict {
    pub reviewer: String,
    /// `approved` or `changes-requested`.
    pub state: String,
}

pub trait CodeApi: PullApi {
    /// The text of the pull request (REQ-019).
    fn description(&self, repo: &str, number: u64) -> Result<String, ForgeError>;

    /// The standing verdict of each reviewer who gave one.
    fn verdicts(&self, repo: &str, number: u64) -> Result<Vec<ReviewerVerdict>, ForgeError>;

    /// The methods that the forge offers (REQ-022).
    fn merge_methods(&self) -> &'static [MergeMethod];

    fn files(&self, repo: &str, number: u64) -> Result<Vec<PullFile>, ForgeError>;

    fn commits(&self, repo: &str, number: u64) -> Result<Vec<PullCommit>, ForgeError>;

    /// A plain comment on the conversation.
    fn comment(&self, repo: &str, number: u64, body: &str) -> Result<(), ForgeError>;

    /// A verdict. A request for changes needs a text (REQ-021).
    fn verdict(
        &self,
        repo: &str,
        number: u64,
        verdict: Verdict,
        body: &str,
    ) -> Result<(), ForgeError>;

    fn send_merge(&self, repo: &str, number: u64, method: MergeMethod) -> Result<(), ForgeError>;

    /// Merge with a method that the forge offers. A draft or a closed pull request is refused
    /// before any write (REQ-022).
    fn merge(&self, repo: &str, number: u64, method: MergeMethod) -> Result<(), ForgeError> {
        if !self.merge_methods().contains(&method) {
            return Err(ForgeError::Config(format!(
                "this forge does not offer the method {method:?}"
            )));
        }
        let p = self.pull(repo, number)?;
        if p.state != PullState::Open {
            return Err(ForgeError::Config("the pull request is not open".into()));
        }
        if p.draft {
            return Err(ForgeError::Config(
                "a draft pull request cannot merge: mark it ready first".into(),
            ));
        }
        self.send_merge(repo, number, method)
    }
}

fn check_text(body: &str, what: &str) -> Result<(), ForgeError> {
    if body.trim().is_empty() {
        return Err(ForgeError::Config(format!("{what} needs some text")));
    }
    Ok(())
}

fn check_verdict(verdict: Verdict, body: &str) -> Result<(), ForgeError> {
    match verdict {
        Verdict::RequestChanges => check_text(body, "a request for changes"),
        Verdict::Approve => Ok(()),
    }
}

impl CodeApi for GitHub {
    fn description(&self, repo: &str, number: u64) -> Result<String, ForgeError> {
        let v = self.call(&format!("{}/pulls/{number}", gh_repo(repo)?), &[])?;
        Ok(text(&v, "/body"))
    }

    fn verdicts(&self, repo: &str, number: u64) -> Result<Vec<ReviewerVerdict>, ForgeError> {
        let v = self.call(
            &format!("{}/pulls/{number}/reviews", gh_repo(repo)?),
            &[("per_page", "100")],
        )?;
        // Oldest first: the last verdict of a person stands. A plain comment is no verdict.
        let mut last: Vec<ReviewerVerdict> = Vec::new();
        for r in items(&v, "") {
            let state = match text(r, "/state").as_str() {
                "APPROVED" => "approved",
                "CHANGES_REQUESTED" => "changes-requested",
                _ => continue,
            };
            let reviewer = text(r, "/user/login");
            last.retain(|x| x.reviewer != reviewer);
            last.push(ReviewerVerdict {
                reviewer,
                state: state.into(),
            });
        }
        Ok(last)
    }

    fn merge_methods(&self) -> &'static [MergeMethod] {
        &[MergeMethod::Merge, MergeMethod::Squash, MergeMethod::Rebase]
    }

    fn files(&self, repo: &str, number: u64) -> Result<Vec<PullFile>, ForgeError> {
        let v = self.call(
            &format!("{}/pulls/{number}/files", gh_repo(repo)?),
            &[("per_page", "100")],
        )?;
        Ok(items(&v, "")
            .iter()
            .map(|f| PullFile {
                path: text(f, "/filename"),
                status: text(f, "/status"),
                patch: f["patch"].as_str().map(str::to_string),
            })
            .collect())
    }

    fn commits(&self, repo: &str, number: u64) -> Result<Vec<PullCommit>, ForgeError> {
        let v = self.call(
            &format!("{}/pulls/{number}/commits", gh_repo(repo)?),
            &[("per_page", "100")],
        )?;
        Ok(items(&v, "")
            .iter()
            .map(|c| PullCommit {
                sha: text(c, "/sha"),
                summary: text(c, "/commit/message")
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_string(),
            })
            .collect())
    }

    fn comment(&self, repo: &str, number: u64, body: &str) -> Result<(), ForgeError> {
        check_text(body, "a comment")?;
        self.write(
            Method::Post,
            &format!("{}/issues/{number}/comments", gh_repo(repo)?),
            json!({ "body": body }),
        )?;
        Ok(())
    }

    fn verdict(&self, repo: &str, number: u64, v: Verdict, body: &str) -> Result<(), ForgeError> {
        check_verdict(v, body)?;
        let event = match v {
            Verdict::Approve => "APPROVE",
            Verdict::RequestChanges => "REQUEST_CHANGES",
        };
        self.write(
            Method::Post,
            &format!("{}/pulls/{number}/reviews", gh_repo(repo)?),
            json!({ "event": event, "body": body }),
        )?;
        Ok(())
    }

    fn send_merge(&self, repo: &str, number: u64, method: MergeMethod) -> Result<(), ForgeError> {
        self.write(
            Method::Put,
            &format!("{}/pulls/{number}/merge", gh_repo(repo)?),
            json!({ "merge_method": format!("{method:?}").to_lowercase() }),
        )?;
        Ok(())
    }
}

impl CodeApi for GitLab {
    fn description(&self, repo: &str, number: u64) -> Result<String, ForgeError> {
        let v = self.call(
            &format!("{}/merge_requests/{number}", project_path(repo)?),
            &[],
        )?;
        Ok(text(&v, "/description"))
    }

    // shortcut: GitLab shows approvals only. A request for changes is a note: no verdict here.
    fn verdicts(&self, repo: &str, number: u64) -> Result<Vec<ReviewerVerdict>, ForgeError> {
        let v = self.call(
            &format!("{}/merge_requests/{number}/approvals", project_path(repo)?),
            &[],
        )?;
        Ok(items(&v, "/approved_by")
            .iter()
            .map(|a| ReviewerVerdict {
                reviewer: text(a, "/user/username"),
                state: "approved".into(),
            })
            .collect())
    }

    // shortcut: no rebase merge. GitLab rebases in a separate call; add it when a team asks.
    fn merge_methods(&self) -> &'static [MergeMethod] {
        &[MergeMethod::Merge, MergeMethod::Squash]
    }

    fn files(&self, repo: &str, number: u64) -> Result<Vec<PullFile>, ForgeError> {
        let v = self.call(
            &format!("{}/merge_requests/{number}/diffs", project_path(repo)?),
            &[("per_page", "100")],
        )?;
        Ok(items(&v, "")
            .iter()
            .map(|f| PullFile {
                path: text(f, "/new_path"),
                status: if f["new_file"].as_bool() == Some(true) {
                    "added"
                } else if f["deleted_file"].as_bool() == Some(true) {
                    "removed"
                } else if f["renamed_file"].as_bool() == Some(true) {
                    "renamed"
                } else {
                    "modified"
                }
                .into(),
                patch: f["diff"].as_str().map(str::to_string),
            })
            .collect())
    }

    fn commits(&self, repo: &str, number: u64) -> Result<Vec<PullCommit>, ForgeError> {
        let v = self.call(
            &format!("{}/merge_requests/{number}/commits", project_path(repo)?),
            &[("per_page", "100")],
        )?;
        Ok(items(&v, "")
            .iter()
            .map(|c| PullCommit {
                sha: text(c, "/id"),
                summary: text(c, "/title"),
            })
            .collect())
    }

    fn comment(&self, repo: &str, number: u64, body: &str) -> Result<(), ForgeError> {
        check_text(body, "a comment")?;
        self.write(
            Method::Post,
            &format!("{}/merge_requests/{number}/notes", project_path(repo)?),
            json!({ "body": body }),
        )?;
        Ok(())
    }

    // shortcut: GitLab has no request-changes call in the stable API. It posts the text as a
    // note. Q-076 asks the owner.
    fn verdict(&self, repo: &str, number: u64, v: Verdict, body: &str) -> Result<(), ForgeError> {
        check_verdict(v, body)?;
        let base = format!("{}/merge_requests/{number}", project_path(repo)?);
        match v {
            Verdict::Approve => {
                self.write(Method::Post, &format!("{base}/approve"), json!({}))?;
                if !body.trim().is_empty() {
                    self.comment(repo, number, body)?;
                }
            }
            Verdict::RequestChanges => {
                self.comment(repo, number, &format!("Changes requested: {body}"))?;
            }
        }
        Ok(())
    }

    fn send_merge(&self, repo: &str, number: u64, method: MergeMethod) -> Result<(), ForgeError> {
        self.write(
            Method::Put,
            &format!("{}/merge_requests/{number}/merge", project_path(repo)?),
            json!({ "squash": method == MergeMethod::Squash }),
        )?;
        Ok(())
    }
}

impl CodeApi for Azure {
    fn description(&self, repo: &str, number: u64) -> Result<String, ForgeError> {
        Ok(text(&self.raw_pull(repo, number)?, "/description"))
    }

    fn verdicts(&self, repo: &str, number: u64) -> Result<Vec<ReviewerVerdict>, ForgeError> {
        let raw = self.raw_pull(repo, number)?;
        Ok(items(&raw, "/reviewers")
            .iter()
            .filter_map(|r| {
                let vote = r["vote"].as_i64()?;
                let state = match vote {
                    5 | 10 => "approved",
                    -5 | -10 => "changes-requested",
                    _ => return None,
                };
                Some(ReviewerVerdict {
                    reviewer: text(r, "/displayName"),
                    state: state.into(),
                })
            })
            .collect())
    }

    fn merge_methods(&self) -> &'static [MergeMethod] {
        &[MergeMethod::Merge, MergeMethod::Squash, MergeMethod::Rebase]
    }

    // shortcut: Azure DevOps sends no patch. The file list has paths and status only.
    fn files(&self, repo: &str, number: u64) -> Result<Vec<PullFile>, ForgeError> {
        let base = format!("{}/pullrequests/{number}/iterations", az_repo(repo)?);
        let iters = self.call(&base, &[], API)?;
        let last = items(&iters, "/value")
            .iter()
            .filter_map(|i| shipyard_http::num(i, "/id"))
            .max()
            .unwrap_or(1);
        let v = self.call(&format!("{base}/{last}/changes"), &[], API)?;
        Ok(items(&v, "/changeEntries")
            .iter()
            .map(|c| PullFile {
                path: text(c, "/item/path").trim_start_matches('/').to_string(),
                status: match text(c, "/changeType").as_str() {
                    "add" => "added",
                    "delete" => "removed",
                    "rename" => "renamed",
                    _ => "modified",
                }
                .into(),
                patch: None,
            })
            .collect())
    }

    fn commits(&self, repo: &str, number: u64) -> Result<Vec<PullCommit>, ForgeError> {
        let v = self.call(
            &format!("{}/pullrequests/{number}/commits", az_repo(repo)?),
            &[],
            API,
        )?;
        Ok(items(&v, "/value")
            .iter()
            .map(|c| PullCommit {
                sha: text(c, "/commitId"),
                summary: text(c, "/comment").lines().next().unwrap_or("").to_string(),
            })
            .collect())
    }

    fn comment(&self, repo: &str, number: u64, body: &str) -> Result<(), ForgeError> {
        check_text(body, "a comment")?;
        self.write(
            Method::Post,
            &format!("{}/pullrequests/{number}/threads", az_repo(repo)?),
            json!({ "comments": [{ "content": body, "commentType": 1 }], "status": 1 }),
        )?;
        Ok(())
    }

    fn verdict(&self, repo: &str, number: u64, v: Verdict, body: &str) -> Result<(), ForgeError> {
        check_verdict(v, body)?;
        let me = self.call(
            "/_apis/connectionData",
            &[("connectOptions", "none")],
            "7.1-preview",
        )?;
        let id = text(&me, "/authenticatedUser/id");
        if id.is_empty() {
            return Err(ForgeError::Rejected("the forge gave no user id".into()));
        }
        // 10 approved, -5 waiting for the author.
        let vote = if v == Verdict::Approve { 10 } else { -5 };
        self.write(
            Method::Put,
            &format!("{}/pullrequests/{number}/reviewers/{id}", az_repo(repo)?),
            json!({ "vote": vote }),
        )?;
        if !body.trim().is_empty() {
            self.comment(repo, number, body)?;
        }
        Ok(())
    }

    fn send_merge(&self, repo: &str, number: u64, method: MergeMethod) -> Result<(), ForgeError> {
        let raw = self.raw_pull(repo, number)?;
        let strategy = match method {
            MergeMethod::Merge => "noFastForward",
            MergeMethod::Squash => "squash",
            MergeMethod::Rebase => "rebase",
        };
        self.write(
            Method::Patch,
            &format!("{}/pullrequests/{number}", az_repo(repo)?),
            json!({
                "status": "completed",
                "lastMergeSourceCommit": { "commitId": text(&raw, "/lastMergeSourceCommit/commitId") },
                "completionOptions": { "mergeStrategy": strategy },
            }),
        )?;
        Ok(())
    }
}
