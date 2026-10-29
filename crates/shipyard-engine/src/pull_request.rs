//! The pull request step (spec `delivery`, REQ-007 to REQ-017).
//!
//! The `open_pr` action runs in `SelfReview`, in small idempotent stages: name the branch, commit
//! the files of the change, rebase onto the base, push, look for the pull request of the branch,
//! open it. Each stage looks at the real state first, so a retry after a crash or a click finds
//! its place again and never opens a second pull request. The push and the pull request follow
//! their switches; a push that rewrites history is a force with lease and always waits for a
//! click. A write that waits is an approval: the stage goes on from the click (`Inner::sent`).
//! A git problem (a rename, a conflict, a release base, no reviewer) blocks the run. A forge read
//! that fails fails the step, with its retries.

use serde_json::json;
use shipyard_core::delivery::{self, GateCheck, PrBody, TicketLine};
use shipyard_core::run::RunEvent;
use shipyard_core::workflow::StepState;
use shipyard_store::pr;
use shipyard_store::run_log::kind;

use crate::approvals::Write;
use crate::ports::Merge;
use crate::review::Finding;
use crate::run_engine::Inner;

/// What the run knows about its delivery.
#[derive(Default)]
pub(crate) struct Delivered {
    pub base: Option<String>,
    /// The branch went to the remote in this round of delivery.
    pub pushed: bool,
    /// A rebase moved commits since the last push.
    pub rewrote: bool,
    /// The last commit that the run made: the fix that the thread replies name.
    pub sha: Option<String>,
    pub gate: Vec<GateCheck>,
    /// The P0 and P1 findings of the last review.
    pub findings: Vec<Finding>,
    /// A feedback round is on: from `ChangesRequested` until the pull request is open again.
    pub fixing: bool,
    /// The threads that the fix answers.
    pub threads: Vec<String>,
    /// Feedback that came while the run could not take it.
    pub feedback: Vec<String>,
    pub summarized: bool,
    pub kept: Option<String>,
}

/// Why a stage stopped.
enum Stop {
    /// A person must act: the run blocks.
    Block(String),
    /// A call failed: the step fails, with its retries.
    Fail(String),
}

const GENERIC: [&str; 6] = ["crates", "packages", "apps", "src", "lib", "app"];

/// The area of a change: the first folder that all files share and that is not a generic root.
fn area_of(files: &[String]) -> String {
    let dirs: Vec<Vec<&str>> = files
        .iter()
        .map(|f| {
            let mut parts: Vec<&str> = f.split('/').collect();
            parts.pop();
            parts
        })
        .collect();
    let Some(first) = dirs.first() else {
        return String::new();
    };
    let common: Vec<&str> = first
        .iter()
        .enumerate()
        .take_while(|(i, d)| dirs.iter().all(|p| p.get(*i) == Some(d)))
        .map(|(_, d)| *d)
        .collect();
    common
        .iter()
        .find(|d| !GENERIC.contains(d))
        .or(common.first())
        .map(|d| delivery::kebab(d))
        .unwrap_or_default()
}

impl Inner {
    /// The base of the run: the declared one, else `develop`, else the default branch. Never a
    /// release branch (REQ-009).
    pub(crate) fn base_of(&mut self, run_id: &str) -> Result<String, String> {
        if let Some(b) = &self.runs[run_id].d.base {
            return Ok(b.clone());
        }
        let p = self.project_of(run_id).ok_or("the project is not open")?;
        let (declared, pulls) = (p.base.clone(), p.pulls.clone());
        let b = pulls.branches().map_err(|e| format!("branches: {e}"))?;
        let base = delivery::base_branch(declared.as_deref(), &b.names, &b.default).map_err(
            |delivery::BaseError::Release(r)| {
                format!("the base `{r}` is a release branch: a person picks the base")
            },
        )?;
        self.rec(run_id).d.base = Some(base.clone());
        Ok(base)
    }

    /// The running action step of the run, when it has one.
    fn pr_step(&self, run_id: &str) -> Option<String> {
        let rec = &self.runs[run_id];
        rec.wf
            .steps
            .iter()
            .find(|s| s.action.is_some() && rec.steps[&s.id].state == StepState::Running)
            .map(|s| s.id.clone())
    }

    /// Take the next stage of the pull request step. It stops at a write that waits.
    pub(crate) fn advance_pr(&mut self, run_id: &str) {
        let Some(sid) = self.pr_step(run_id) else {
            return;
        };
        match self.try_pr(run_id) {
            Ok(()) => {}
            Err(Stop::Block(why)) => {
                self.block(run_id, &sid, &why);
            }
            Err(Stop::Fail(why)) => self.action_failed(run_id, &why),
        }
    }

    /// The pump: start the step again after a retry delay, or after a click on `unblock`.
    pub(crate) fn drive_pr(&mut self, run_id: &str) {
        if !self.runs[run_id].run.state.clocks_run() {
            return;
        }
        let Some(sid) = self.pr_step(run_id) else {
            return;
        };
        let now = self.now_s();
        let u = &mut self.rec(run_id).steps.get_mut(&sid).expect("step").units[0];
        if u.state == StepState::Pending && u.retry_at.is_some_and(|t| t <= now) {
            u.state = StepState::Running;
            u.retry_at = None;
        }
        let waits = self.approvals.iter().any(|a| {
            a.run == run_id && matches!(a.write, Write::Push { .. } | Write::OpenPr { .. })
        });
        if self.runs[run_id].steps[&sid].units[0].state == StepState::Running && !waits {
            self.advance_pr(run_id);
        }
    }

    fn try_pr(&mut self, run_id: &str) -> Result<(), Stop> {
        use Stop::{Block, Fail};
        let base = self.base_of(run_id).map_err(Block)?;
        let p = self
            .project_of(run_id)
            .ok_or_else(|| Block("the project is not open".into()))?;
        let (git, pulls, reviewers) = (p.git.clone(), p.pulls.clone(), p.reviewers.clone());
        let rec = &self.runs[run_id];
        let (ty, title, key, url) = (
            delivery::commit_type(rec.kind),
            rec.title.clone(),
            rec.key.clone(),
            rec.url.clone(),
        );
        let git_err = |what: &str| {
            let what = what.to_string();
            move |e: String| Block(format!("{what}: {e}"))
        };

        let changes = git.changes(run_id, &base).map_err(git_err("changes"))?;
        if changes.files.is_empty() {
            return Err(Block("nothing to deliver: the run changed no file".into()));
        }
        let area = area_of(&changes.files);
        let mut branch = git.branch(run_id).map_err(git_err("branch"))?;
        if delivery::is_tool_branch(&branch) && !self.runs[run_id].d.pushed {
            let new = delivery::branch_name(ty, &area, &title);
            git.rename_branch(run_id, &new).map_err(git_err("rename"))?;
            let note = json!({"renamed": {"from": branch, "to": new}});
            self.log(run_id, None, kind::NOTE, note);
            branch = new;
        }
        let found = pulls
            .find(&branch)
            .map_err(|e| Fail(format!("find the pull request: {e}")))?;
        if found.is_none() && reviewers.is_empty() {
            return Err(Block(
                "name a reviewer in the Automation settings: a pull request needs one".into(),
            ));
        }
        let scope = delivery::kebab(&area);
        if !changes.uncommitted.is_empty() {
            let summary = delivery::conventional(ty, &scope, &title);
            let description = format!("Ticket: {key}");
            let sha = git
                .commit(run_id, &changes.uncommitted, &summary, &description)
                .map_err(git_err("commit"))?;
            self.rec(run_id).d.sha = Some(sha);
        }
        match git.rebase(run_id, &base).map_err(git_err("rebase"))? {
            Merge::Clean => {}
            Merge::Rewrote => self.rec(run_id).d.rewrote = true,
            Merge::Conflicts(files) => {
                let why = format!("rebase onto {base}: conflicts in {}", files.join(", "));
                return Err(Block(why));
            }
        }

        let d = &self.runs[run_id].d;
        // A pull request that exists already was pushed in an earlier round.
        if !d.pushed && (found.is_none() || d.fixing) {
            let force = found.is_some() && d.rewrote;
            let push = Write::Push {
                run: run_id.into(),
                branch,
                base,
                force_with_lease: force,
            };
            // A push that went out goes on from `sent`; one that waits goes on from the click.
            self.write(run_id, push);
            return Ok(());
        }
        if let Some(number) = found {
            self.pr_opened(run_id, &number.to_string());
            return Ok(());
        }

        let existing = pulls.labels().map_err(|e| Fail(format!("labels: {e}")))?;
        let labels = delivery::pr_labels(&existing, ty, &changes.files);
        let rec = &self.runs[run_id];
        let body = PrBody {
            opening: format!("Delivers {key}: {title}. Run: run:{run_id}"),
            gate: rec.d.gate.clone(),
            tickets: vec![TicketLine {
                key,
                title: title.clone(),
                url,
            }],
            impacts: None,
        };
        let open = Write::OpenPr {
            run: run_id.into(),
            branch,
            base,
            title: delivery::conventional(ty, &scope, &title),
            body: body.render(),
            labels,
            reviewers,
            draft: true,
        };
        self.write(run_id, open);
        Ok(())
    }

    /// The pull request is open: the action step ends and the run moves to `PROpen`
    /// (REQ-017). After a feedback round, the threads that the fix answers get their reply.
    pub(crate) fn pr_opened(&mut self, run_id: &str, made: &str) {
        let number: Option<u64> = made.parse().ok();
        let forge = self.project_of(run_id).map(|p| p.forge.clone());
        let ts = self.clock.now().as_millis() as u64;
        let rec = self.rec(run_id);
        rec.pr = number;
        let actions: Vec<String> = rec
            .wf
            .steps
            .iter()
            .filter(|s| s.action.is_some())
            .map(|s| s.id.clone())
            .collect();
        for (_, s) in rec.steps.iter_mut().filter(|(id, _)| actions.contains(id)) {
            if s.state == StepState::Running {
                for u in &mut s.units {
                    u.state = StepState::Done;
                }
                s.state = StepState::Done;
            }
        }
        let d = &mut rec.d;
        let (fixing, threads, sha) = (d.fixing, std::mem::take(&mut d.threads), d.sha.take());
        d.fixing = false;
        d.pushed = false;
        let logged = match (&forge, number) {
            (Some(f), Some(n)) => pr::record(&self.log, run_id, None, f, n, ts)
                .map(|_| ())
                .map_err(|e| e.to_string()),
            _ => self
                .log
                .append(run_id, None, kind::PR, &json!({"number": number}), ts)
                .map(|_| ())
                .map_err(|e| e.to_string()),
        };
        if let Err(e) = logged {
            self.errors.push(format!("run log {run_id}: {e}"));
        }
        if let (true, false, Some(sha)) = (fixing, threads.is_empty(), sha) {
            let reply = format!("Fixed in {}.", &sha[..sha.len().min(8)]);
            self.write(
                run_id,
                Write::ResolveThreads {
                    run: run_id.into(),
                    threads,
                    reply,
                },
            );
        }
        self.transition(run_id, RunEvent::PrOpened);
    }

    /// A write of the step failed, or a forge read did: the action step failed, with its retries.
    pub(crate) fn action_failed(&mut self, run_id: &str, why: &str) {
        let action = self.pr_step(run_id);
        if let Some(sid) = action {
            self.unit_failed(run_id, &sid, 0, why);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::area_of;

    fn area(files: &[&str]) -> String {
        area_of(&files.iter().map(|f| f.to_string()).collect::<Vec<_>>())
    }

    #[test]
    fn the_area_is_the_first_shared_folder_that_is_not_a_root() {
        assert_eq!(
            area(&[
                "crates/shipyard-engine/src/a.rs",
                "crates/shipyard-engine/b.rs"
            ]),
            "shipyard-engine"
        );
        assert_eq!(area(&["src/features/factory/a.tsx"]), "features");
        assert_eq!(area(&["crates/a/x.rs", "crates/b/y.rs"]), "crates");
        assert_eq!(area(&["README.md"]), "");
        assert_eq!(area(&["docs/a.md", "src/b.rs"]), "");
    }
}
