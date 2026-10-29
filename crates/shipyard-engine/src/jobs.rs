//! Slow work outside the factory lock (spec `factory`, REQ-048).
//!
//! A gate command and a tracker or forge write can take minutes. Under the lock they would hold
//! the views, the agent tools, the sync and the exit. So each change has two phases. Phase one
//! runs under the lock: it decides, logs the intent and queues a [`Job`]. When the lock goes
//! (`Guard`), the jobs run with no lock, one thread for each run (the jobs of one run keep their
//! order). Phase two locks again and applies each result: [`Inner::apply_job`].
//!
//! A result that describes a fact outside (a comment that went out, a pull request that opened)
//! is always recorded. A decision that follows from it (the next stage of the pull request, the
//! verdict of a gate) is taken only when the run did not change in between (`epoch`). A gate verdict
//! that is dropped for this reason is asked again by the next pump (`StepRec::gating`).

use std::collections::BTreeMap;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use shipyard_core::delivery::GateCheck;
use shipyard_core::workflow::Step;
use shipyard_store::run_log::kind;

use crate::approvals::Write;
use crate::ports::{Git, PortResult, Writer};
use crate::review::Finding;
use crate::run_engine::Inner;

/// Where a caller reads the id that a write made, once its job ended.
pub(crate) type Slot = Arc<Mutex<Option<String>>>;

pub(crate) struct Job {
    pub run: String,
    /// The change counter of the run when the job was queued.
    pub epoch: u64,
    pub work: Work,
}

pub(crate) enum Work {
    /// The gate commands of a review, and what the review found before them.
    Gate {
        git: Arc<dyn Git>,
        gates: Vec<String>,
        step: Step,
        findings: Vec<Finding>,
        dropped: Vec<Value>,
        criteria: Value,
    },
    Write {
        write: Write,
        writer: Arc<dyn Writer>,
        slot: Option<Slot>,
    },
    /// The impacts digest for the body of the pull request: 2 or 3 agent asks.
    Digest { git: Arc<dyn Git>, base: String },
}

pub(crate) enum Done {
    Gate(PortResult<Vec<GateCheck>>),
    Write(PortResult<String>),
    Digest(PortResult<Option<String>>),
}

fn run_one(job: &Job) -> Done {
    let work = AssertUnwindSafe(|| match &job.work {
        Work::Gate { git, gates, .. } => Done::Gate(git.gate(&job.run, gates)),
        Work::Write { write, writer, .. } => Done::Write(writer.send(write)),
        Work::Digest { git, base } => Done::Digest(git.digest(&job.run, base)),
    });
    catch_unwind(work).unwrap_or_else(|_| {
        let e = "the call panicked".to_string();
        match job.work {
            Work::Gate { .. } => Done::Gate(Err(e)),
            Work::Write { .. } => Done::Write(Err(e)),
            Work::Digest { .. } => Done::Digest(Err(e)),
        }
    })
}

/// Run the jobs with no lock: one thread for each run, in order inside a run.
pub(crate) fn run_all(jobs: &[Job]) -> Vec<Done> {
    let mut groups: BTreeMap<&str, Vec<usize>> = BTreeMap::new();
    for (i, j) in jobs.iter().enumerate() {
        groups.entry(&j.run).or_default().push(i);
    }
    let mut done: Vec<Option<Done>> = jobs.iter().map(|_| None).collect();
    std::thread::scope(|s| {
        let threads: Vec<_> = groups
            .into_values()
            .map(|ix| {
                s.spawn(move || {
                    ix.into_iter()
                        .map(|i| (i, run_one(&jobs[i])))
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        for t in threads {
            for (i, d) in t.join().unwrap_or_default() {
                done[i] = Some(d);
            }
        }
    });
    done.into_iter()
        .map(|d| d.unwrap_or_else(|| Done::Write(Err("the call did not end".into()))))
        .collect()
}

impl Inner {
    /// Queue a job for the end of the change.
    pub(crate) fn queue(&mut self, run_id: &str, work: Work) {
        let epoch = self.gens.get(run_id).copied().unwrap_or(0);
        if let Some(map) = self.counter(&work) {
            *map.entry(run_id.into()).or_default() += 1;
        }
        self.jobs.push(Job {
            run: run_id.into(),
            epoch,
            work,
        });
    }

    /// The count that a job keeps: a gate stops the pump of its run, a push or a pull request
    /// stops the next stage of the pull request step. Other writes keep no count.
    fn counter(&mut self, work: &Work) -> Option<&mut BTreeMap<String, u32>> {
        match work {
            Work::Gate { .. } => Some(&mut self.busy),
            Work::Write {
                write: Write::Push { .. } | Write::OpenPr { .. },
                ..
            }
            | Work::Digest { .. } => Some(&mut self.delivering),
            Work::Write { .. } => None,
        }
    }

    /// A gate of this run is out: the pump leaves the run alone.
    pub(crate) fn is_busy(&self, run_id: &str) -> bool {
        self.busy.get(run_id).is_some_and(|n| *n > 0)
    }

    /// A push or a pull request of this run is out.
    pub(crate) fn is_delivering(&self, run_id: &str) -> bool {
        self.delivering.get(run_id).is_some_and(|n| *n > 0)
    }

    /// Phase two: apply the result of a job.
    pub(crate) fn apply_job(&mut self, job: Job, done: Done) {
        if let Some(map) = self.counter(&job.work)
            && let Some(n) = map.get_mut(&job.run)
        {
            *n = n.saturating_sub(1);
        }
        if !self.runs.contains_key(&job.run) {
            return;
        }
        let same = self.gens.get(&job.run).copied().unwrap_or(0) == job.epoch;
        match (job.work, done) {
            (Work::Write { write, slot, .. }, Done::Write(result)) => {
                self.write_done(&job.run, &write, result, same, slot);
            }
            (
                Work::Gate {
                    step,
                    findings,
                    dropped,
                    criteria,
                    ..
                },
                Done::Gate(result),
            ) => {
                // A gate that the exit stopped has no verdict: the next start asks again.
                if !same || self.closing {
                    let note = json!({"note": "the run changed during the gate: the verdict is dropped, the next pump asks again"});
                    self.log(&job.run, Some(&step.id), kind::NOTE, note);
                    return;
                }
                self.gate_done(&job.run, &step, findings, dropped, criteria, result);
                if self.project_of(&job.run).is_some() {
                    self.pump_run(&job.run);
                }
            }
            (Work::Digest { .. }, Done::Digest(result)) => {
                // A failed digest never blocks the pull request: it opens with no impacts.
                // A run that changed asks again from the next pump (`drive_pr`).
                if same && !self.closing {
                    self.rec(&job.run).d.digest = Some(result.ok().flatten());
                    self.advance_pr(&job.run);
                }
            }
            _ => unreachable!("a job and its result have the same kind"),
        }
    }
}
