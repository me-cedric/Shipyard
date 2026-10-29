//! Analyze for Code / Impacts (spec `code`, REQ-029 to REQ-032): one developer action plan and one
//! PM digest, from two separate asks. The runner is a port: the app wraps an agent CLI, a test
//! gives a fake. The prompt and the answers are scrubbed of each secret value.

use serde::Deserialize;
use shipyard_core::assistant::scrub;
use shipyard_core::code::check_digest;

use std::path::PathBuf;
use std::time::Duration;

use crate::AgentError;
use crate::runner::{Event, Recv, RunSpec, runner, start};

/// The seven axes of the plan (REQ-030).
pub const AXES: [&str; 7] = [
    "behaviour",
    "contracts",
    "data",
    "configuration",
    "security",
    "operations",
    "artifacts",
];

const RATINGS: [&str; 4] = ["none", "low", "medium", "high"];
/// The part of the diff that goes in a prompt.
const MAX_DIFF: usize = 60_000;

/// One question, one answer, no tools.
pub trait Ask: Send + Sync {
    fn ask(&self, prompt: &str) -> Result<String, AgentError>;
}

/// An agent CLI in plan mode (read only) as an [`Ask`]. The answer is the text of the run.
pub struct RunnerAsk {
    pub runner: String,
    pub dir: PathBuf,
    pub scratch: PathBuf,
    /// Run this program in place of the CLI. Tests use it.
    pub program: Option<PathBuf>,
}

impl Ask for RunnerAsk {
    fn ask(&self, prompt: &str) -> Result<String, AgentError> {
        let r = runner(&self.runner)
            .ok_or_else(|| AgentError::Invalid(format!("unknown runner: {}", self.runner)))?;
        std::fs::create_dir_all(&self.scratch).map_err(|e| AgentError::Run(e.to_string()))?;
        let mut spec = RunSpec::new(prompt, &self.dir, &self.scratch);
        spec.program = self.program.clone();
        let run = start(&*r, spec)?;
        let (mut text, mut error) = (String::new(), None);
        loop {
            match run.recv_timeout(Duration::from_secs(600)) {
                Recv::Event(Event::Text { text: t }) => text.push_str(&t),
                Recv::Event(Event::Error { message }) => error = Some(message),
                Recv::Event(_) => {}
                Recv::Idle => {
                    run.cancel();
                    return Err(AgentError::Run(
                        "the runner was silent for ten minutes".into(),
                    ));
                }
                Recv::Done => break,
            }
        }
        match error {
            Some(m) => Err(AgentError::Provider(m)),
            None if text.trim().is_empty() => {
                Err(AgentError::Provider("the runner gave no text".into()))
            }
            None => Ok(text),
        }
    }
}

pub struct Comparison<'a> {
    /// The branch, the tag or the revision that the working copy is compared with.
    pub base: &'a str,
    pub files: &'a [String],
    /// The unified diff, uncommitted work included.
    pub diff: &'a str,
    /// The refs that the project knows and that may cite the changed files. A ref that the
    /// runner names and that is not here is dropped (REQ-030).
    pub refs: &'a [String],
    pub secrets: &'a [String],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Analysis {
    /// Markdown for the developer.
    pub plan: String,
    /// Markdown for the PM: no path, no trace, no secret.
    pub digest: String,
    pub stale: Vec<String>,
}

#[derive(Deserialize, Default)]
struct RawPlan {
    #[serde(default)]
    axes: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    stale: Vec<String>,
    #[serde(default)]
    actions: Vec<String>,
}

fn json_part(text: &str) -> Option<&str> {
    let (a, b) = (text.find('{')?, text.rfind('}')?);
    text.get(a..=b)
}

fn plan_prompt(c: &Comparison) -> String {
    let diff: String = c.diff.chars().take(MAX_DIFF).collect();
    format!(
        "Compare the working copy with `{}`. Changed files:\n{}\n\nDiff:\n{}\n\n\
         Answer with one JSON object and nothing else: \
         {{\"axes\": {{<axis>: \"none\"|\"low\"|\"medium\"|\"high\"}}, \"stale\": [<ref>], \"actions\": [<step>]}}. \
         The axes are: {}. `stale` lists the refs that the change makes stale, from: {}. \
         `actions` is an ordered list.",
        c.base,
        c.files.join("\n"),
        diff,
        AXES.join(", "),
        c.refs.join(", "),
    )
}

fn digest_prompt(c: &Comparison, plan: &str) -> String {
    format!(
        "Write a digest for a project manager in plain language, from this impact plan:\n{plan}\n\n\
         State the business impact, the change of scope and planning, the risks and who must act. \
         Write no file path, no code, no stack trace and no secret. Do not tie a person's name to a judgment. \
         The comparison base is `{}`.",
        c.base
    )
}

fn render_plan(c: &Comparison, raw: &RawPlan, stale: &[String]) -> String {
    let mut out = format!("# Impact plan: {}\n\n## Axes\n\n", c.base);
    for axis in AXES {
        let r = raw
            .axes
            .get(axis)
            .map(|r| r.trim().to_lowercase())
            .filter(|r| RATINGS.contains(&r.as_str()))
            .unwrap_or_else(|| "none".into());
        out.push_str(&format!("- {axis}: {r}\n"));
    }
    out.push_str("\n## Stale refs\n\n");
    for s in stale {
        out.push_str(&format!("- {s}\n"));
    }
    out.push_str("\n## Actions\n\n");
    for (i, a) in raw.actions.iter().enumerate() {
        out.push_str(&format!("{}. {}\n", i + 1, a.trim()));
    }
    out
}

/// Runs the two asks. The digest is checked with `check_digest`: one retry that names the fault,
/// then an error. Nothing is written here.
pub fn analyze(runner: &dyn Ask, c: &Comparison) -> Result<Analysis, AgentError> {
    let scrubbed = |t: &str| scrub(t, c.secrets);
    let answer = runner.ask(&scrubbed(&plan_prompt(c)))?;
    let raw: RawPlan = json_part(&answer)
        .and_then(|j| serde_json::from_str(j).ok())
        .ok_or_else(|| AgentError::Provider("the plan answer is not a JSON object".into()))?;
    let stale: Vec<String> = raw
        .stale
        .iter()
        .filter(|s| c.refs.contains(s))
        .cloned()
        .collect();
    let plan = scrubbed(&render_plan(c, &raw, &stale));

    let secrets: Vec<&str> = c.secrets.iter().map(String::as_str).collect();
    let prompt = scrubbed(&digest_prompt(c, &plan));
    let mut digest = scrubbed(&runner.ask(&prompt)?);
    if let Err(first) = check_digest(&digest, &secrets) {
        let again = format!(
            "{prompt}\n\nYour last digest failed: {}. Write it again.",
            first.message()
        );
        digest = scrubbed(&runner.ask(&again)?);
        check_digest(&digest, &secrets).map_err(|e| AgentError::Provider(e.message()))?;
    }
    Ok(Analysis {
        plan,
        digest: digest.trim().to_string(),
        stale,
    })
}
