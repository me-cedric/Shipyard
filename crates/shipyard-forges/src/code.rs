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
use std::collections::BTreeSet;

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

/// The files of a pull request. `truncated` is set when the listing stopped at the page cap or at
/// a page that failed: the list is then the first files only.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PullFiles {
    pub files: Vec<PullFile>,
    pub truncated: bool,
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

/// A note of a review on one line of the new file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LineNote {
    pub path: String,
    pub line: u32,
    pub text: String,
    /// The commit that the note was written on. Empty: the current head.
    pub head_sha: String,
}

/// A note written on another commit than the head: its line may have moved.
fn older(n: &LineNote, head: &str) -> bool {
    !n.head_sha.is_empty() && n.head_sha != head
}

/// What a review left behind: the notes that no write could post, and how many notes went into
/// the review text because the forge has no line for them.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReviewSent {
    pub failed: Vec<LineNote>,
    pub in_body: u32,
}

fn count(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

/// The lines of the new file that a unified diff shows: added and context lines.
fn new_lines(patch: &str) -> BTreeSet<u32> {
    let mut shown = BTreeSet::new();
    let mut at: Option<u32> = None;
    for l in patch.lines() {
        if let Some(h) = l.strip_prefix("@@ -") {
            at = h
                .split_once('+')
                .and_then(|(_, n)| n.split([',', ' ']).next()?.parse().ok());
        } else if let Some(n) = at {
            match l.chars().next() {
                Some('-' | '\\') => {}
                _ => {
                    shown.insert(n);
                    at = Some(n + 1);
                }
            }
        }
    }
    shown
}

/// Splits the notes into those on a line that the diff shows, and the rest. A note of an older
/// commit goes in the rest: its line may be another line now.
fn split_notes<'a>(
    files: &[PullFile],
    notes: &'a [LineNote],
    head: &str,
) -> (Vec<&'a LineNote>, Vec<&'a LineNote>) {
    notes.iter().partition(|n| {
        !older(n, head)
            && files.iter().any(|f| {
                f.path == n.path
                    && f.patch
                        .as_deref()
                        .is_some_and(|p| new_lines(p).contains(&n.line))
            })
    })
}

/// The summary, then one line for each note that has no line of its own.
fn with_notes(body: &str, notes: &[&LineNote], head: &str) -> String {
    let mut t = body.trim().to_string();
    if !notes.is_empty() {
        if !t.is_empty() {
            t.push_str("\n\n");
        }
        let lines: Vec<String> = notes
            .iter()
            .map(|n| {
                let tag = if older(n, head) {
                    " (older version)"
                } else {
                    ""
                };
                format!("- `{}:{}`{tag} {}", n.path, n.line, n.text.trim())
            })
            .collect();
        t.push_str(&lines.join("\n"));
    }
    t
}

/// One review as one body: a verdict, or a plain comment. Nothing to say sends nothing.
fn send_body<A: CodeApi + ?Sized>(
    api: &A,
    repo: &str,
    number: u64,
    verdict: Option<Verdict>,
    body: &str,
) -> Result<(), ForgeError> {
    match verdict {
        Some(v) => api.verdict(repo, number, v, body),
        None if body.trim().is_empty() => Ok(()),
        None => api.comment(repo, number, body),
    }
}

pub trait CodeApi: PullApi {
    /// The text of the pull request (REQ-019).
    fn description(&self, repo: &str, number: u64) -> Result<String, ForgeError>;

    /// The standing verdict of each reviewer who gave one.
    fn verdicts(&self, repo: &str, number: u64) -> Result<Vec<ReviewerVerdict>, ForgeError>;

    /// The methods that the forge offers (REQ-022).
    fn merge_methods(&self) -> &'static [MergeMethod];

    fn files(&self, repo: &str, number: u64) -> Result<Vec<PullFile>, ForgeError>;

    /// The files, with the mark that the list is cut short. The default has no cap.
    fn files_capped(&self, repo: &str, number: u64) -> Result<PullFiles, ForgeError> {
        Ok(PullFiles {
            files: self.files(repo, number)?,
            truncated: false,
        })
    }

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

    /// A review of the pull request at `head_sha`: the summary, a verdict (`None`: a comment
    /// review) and each note on its line. A note on a line that the diff does not show goes into
    /// the body, so no note is lost. The default sends one body, for a forge that has no line
    /// comments (Azure DevOps). `Ok` holds the notes that no write could post, after the body
    /// and the verdict went out: the review is sent, so a caller must not send it again. It also
    /// counts the notes that went into the review text.
    fn review(
        &self,
        repo: &str,
        number: u64,
        head_sha: &str,
        verdict: Option<Verdict>,
        body: &str,
        notes: &[LineNote],
    ) -> Result<ReviewSent, ForgeError> {
        let all: Vec<&LineNote> = notes.iter().collect();
        send_body(
            self,
            repo,
            number,
            verdict,
            &with_notes(body, &all, head_sha),
        )?;
        Ok(ReviewSent {
            failed: Vec::new(),
            in_body: count(notes.len()),
        })
    }

    fn send_merge(&self, repo: &str, number: u64, method: MergeMethod) -> Result<(), ForgeError>;

    /// The write that closes the pull request without a merge.
    fn send_close(&self, repo: &str, number: u64) -> Result<(), ForgeError>;

    /// Close an open pull request without a merge. A merged or closed one is refused.
    fn close(&self, repo: &str, number: u64) -> Result<(), ForgeError> {
        if self.pull(repo, number)?.state != PullState::Open {
            return Err(ForgeError::Config("the pull request is not open".into()));
        }
        self.send_close(repo, number)
    }

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

/// The most pages of 100 that one listing reads.
const MAX_PAGES: u32 = 30;

/// Every item of a listing of 100 per page, until a short page. The second value is true when the
/// list is cut short: the cap of [`MAX_PAGES`] came first, or page 2 or a later page failed (the
/// first page failing is an error). A listing of exactly the cap cannot tell, and says cut short.
fn all_pages(
    get: impl Fn(&[(&str, &str)]) -> Result<serde_json::Value, ForgeError>,
) -> Result<(Vec<serde_json::Value>, bool), ForgeError> {
    let mut out = Vec::new();
    for page in 1..=MAX_PAGES {
        let p = page.to_string();
        let v = match get(&[("per_page", "100"), ("page", p.as_str())]) {
            Ok(v) => v,
            Err(_) if page > 1 => return Ok((out, true)),
            Err(e) => return Err(e),
        };
        let got = items(&v, "");
        let short = got.len() < 100;
        out.extend_from_slice(got);
        if short {
            return Ok((out, false));
        }
    }
    Ok((out, true))
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
        Ok(self.files_capped(repo, number)?.files)
    }

    fn files_capped(&self, repo: &str, number: u64) -> Result<PullFiles, ForgeError> {
        let path = format!("{}/pulls/{number}/files", gh_repo(repo)?);
        let (pages, truncated) = all_pages(|q| self.call(&path, q))?;
        Ok(PullFiles {
            files: pages
                .iter()
                .map(|f| PullFile {
                    path: text(f, "/filename"),
                    status: text(f, "/status"),
                    patch: f["patch"].as_str().map(str::to_string),
                })
                .collect(),
            truncated,
        })
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

    fn review(
        &self,
        repo: &str,
        number: u64,
        head_sha: &str,
        verdict: Option<Verdict>,
        body: &str,
        notes: &[LineNote],
    ) -> Result<ReviewSent, ForgeError> {
        let (inline, rest) = split_notes(&self.files(repo, number)?, notes, head_sha);
        let text = with_notes(body, &rest, head_sha);
        let in_body = count(rest.len());
        if inline.is_empty() {
            send_body(self, repo, number, verdict, &text)?;
            return Ok(ReviewSent {
                failed: Vec::new(),
                in_body,
            });
        }
        // The summary and the notes together are the text of the review.
        if let Some(v) = verdict {
            check_verdict(
                v,
                &with_notes(body, &notes.iter().collect::<Vec<_>>(), head_sha),
            )?;
        }
        let event = match verdict {
            Some(Verdict::Approve) => "APPROVE",
            Some(Verdict::RequestChanges) => "REQUEST_CHANGES",
            None => "COMMENT",
        };
        let comments: Vec<_> = inline
            .iter()
            .map(|n| json!({ "path": n.path, "line": n.line, "side": "RIGHT", "body": n.text }))
            .collect();
        let sent = self.write(
            Method::Post,
            &format!("{}/pulls/{number}/reviews", gh_repo(repo)?),
            json!({ "commit_id": head_sha, "event": event, "body": text, "comments": comments }),
        );
        match sent {
            Ok(_) => Ok(ReviewSent {
                failed: Vec::new(),
                in_body,
            }),
            // The line is not in the diff of that commit: the whole review goes as one body.
            Err(ForgeError::Http(shipyard_http::Error::Status { status: 422, .. })) => {
                let all: Vec<&LineNote> = notes.iter().collect();
                send_body(
                    self,
                    repo,
                    number,
                    verdict,
                    &with_notes(body, &all, head_sha),
                )?;
                Ok(ReviewSent {
                    failed: Vec::new(),
                    in_body: count(notes.len()),
                })
            }
            Err(e) => Err(e),
        }
    }

    fn send_merge(&self, repo: &str, number: u64, method: MergeMethod) -> Result<(), ForgeError> {
        self.write(
            Method::Put,
            &format!("{}/pulls/{number}/merge", gh_repo(repo)?),
            json!({ "merge_method": format!("{method:?}").to_lowercase() }),
        )?;
        Ok(())
    }

    fn send_close(&self, repo: &str, number: u64) -> Result<(), ForgeError> {
        self.write(
            Method::Patch,
            &format!("{}/pulls/{number}", gh_repo(repo)?),
            json!({ "state": "closed" }),
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
        Ok(self.files_capped(repo, number)?.files)
    }

    fn files_capped(&self, repo: &str, number: u64) -> Result<PullFiles, ForgeError> {
        let path = format!("{}/merge_requests/{number}/diffs", project_path(repo)?);
        let (pages, truncated) = all_pages(|q| self.call(&path, q))?;
        Ok(PullFiles {
            files: pages
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
                .collect(),
            truncated,
        })
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

    fn review(
        &self,
        repo: &str,
        number: u64,
        head_sha: &str,
        verdict: Option<Verdict>,
        body: &str,
        notes: &[LineNote],
    ) -> Result<ReviewSent, ForgeError> {
        // The summary and the notes together are the text of the review.
        if let Some(v) = verdict {
            check_verdict(
                v,
                &with_notes(body, &notes.iter().collect::<Vec<_>>(), head_sha),
            )?;
        }
        let base = format!("{}/merge_requests/{number}", project_path(repo)?);
        let refs = self.call(&base, &[])?;
        let sha = |k: &str| text(&refs, &format!("/diff_refs/{k}"));
        // A new push moved the lines: the notes go in the body, not on another line.
        let (inline, rest) = if sha("head_sha").is_empty() || sha("head_sha") != head_sha {
            (Vec::new(), notes.iter().collect())
        } else {
            split_notes(&self.files(repo, number)?, notes, head_sha)
        };
        // The body and the verdict go first: when they fail, no line comment exists yet and a
        // retry cannot post one twice.
        let mut text = with_notes(body, &rest, head_sha);
        let in_body = count(rest.len());
        // A request for changes with line notes only: the line comments carry the reasons.
        if text.is_empty() && verdict == Some(Verdict::RequestChanges) {
            text = "See the line comments.".into();
        }
        send_body(self, repo, number, verdict, &text)?;
        let mut refused = Vec::new();
        for n in inline {
            let position = json!({
                "position_type": "text",
                "base_sha": sha("base_sha"), "start_sha": sha("start_sha"), "head_sha": sha("head_sha"),
                "old_path": n.path, "new_path": n.path, "new_line": n.line,
            });
            let sent = self.write(
                Method::Post,
                &format!("{base}/discussions"),
                json!({ "body": n.text, "position": position }),
            );
            // A line that the forge refuses goes into a comment.
            if sent.is_err() {
                refused.push(n);
            }
        }
        if refused.is_empty() {
            return Ok(ReviewSent {
                failed: Vec::new(),
                in_body,
            });
        }
        // The verdict and the body are sent. A failure now is reported apart, not as an error: a
        // retry would post the verdict twice.
        Ok(
            match self.comment(repo, number, &with_notes("", &refused, head_sha)) {
                Ok(()) => ReviewSent {
                    failed: Vec::new(),
                    in_body: in_body + count(refused.len()),
                },
                Err(_) => ReviewSent {
                    failed: refused.into_iter().cloned().collect(),
                    in_body,
                },
            },
        )
    }

    fn send_merge(&self, repo: &str, number: u64, method: MergeMethod) -> Result<(), ForgeError> {
        self.write(
            Method::Put,
            &format!("{}/merge_requests/{number}/merge", project_path(repo)?),
            json!({ "squash": method == MergeMethod::Squash }),
        )?;
        Ok(())
    }

    fn send_close(&self, repo: &str, number: u64) -> Result<(), ForgeError> {
        self.write(
            Method::Put,
            &format!("{}/merge_requests/{number}", project_path(repo)?),
            json!({ "state_event": "close" }),
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

    fn send_close(&self, repo: &str, number: u64) -> Result<(), ForgeError> {
        self.write(
            Method::Patch,
            &format!("{}/pullrequests/{number}", az_repo(repo)?),
            json!({ "status": "abandoned" }),
        )?;
        Ok(())
    }
}
