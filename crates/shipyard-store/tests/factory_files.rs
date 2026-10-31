//! The default workflows and roles, the seed and the reload with the last valid version (spec
//! `factory`, REQ-010, REQ-011, REQ-014, REQ-035).

use shipyard_core::workflow::{Action, DEFAULT_ROLES, Effort, Gate, Mode, Workflow, Workspace};
use shipyard_store::factory_files::{
    Loaded, ROLES_DIR, WORKFLOWS_DIR, default_roles, default_workflows, load, parse_role, seed,
};

fn roles() -> Vec<String> {
    DEFAULT_ROLES.iter().map(|r| r.to_string()).collect()
}

fn workflow(id: &str) -> Workflow {
    let (_, text) = default_workflows().iter().find(|(i, _)| *i == id).unwrap();
    serde_norway::from_str(text).unwrap()
}

/// A step that only reads runs in plan mode: the CLI refuses a write (security review, finding 5).
#[test]
fn a_read_only_step_runs_in_plan_mode() {
    for (id, _) in default_workflows() {
        for s in workflow(id).steps {
            if matches!(
                s.role.as_deref(),
                Some("planner" | "reviewer" | "scout" | "triager")
            ) {
                assert_eq!(s.mode, Mode::Plan, "{id}/{}", s.id);
            }
        }
    }
}

#[test]
fn five_workflows_and_seven_roles_ship_and_validate() {
    let ids: Vec<_> = default_workflows().iter().map(|(i, _)| *i).collect();
    assert_eq!(
        ids,
        ["feature", "bug", "spike", "spec-split", "review-only"]
    );
    for (id, text) in default_workflows() {
        let wf: Workflow = serde_norway::from_str(text).unwrap_or_else(|e| panic!("{id}: {e}"));
        assert_eq!(wf.id, *id);
        assert_eq!(wf.check(&roles()), [], "{id}");
    }
    let names: Vec<_> = default_roles().iter().map(|(n, _)| *n).collect();
    for r in DEFAULT_ROLES {
        assert!(names.contains(&r), "{r}");
    }
    assert_eq!(names.len(), 7);
}

/// The token rules: planner and reviewer on the top tier with high effort, workers on the mid tier
/// with medium effort, scouts on the small tier with low effort.
#[test]
fn every_step_follows_the_token_rules() {
    for (id, _) in default_workflows() {
        for s in workflow(id).steps {
            let want = match s.role.as_deref() {
                Some("planner" | "reviewer") => ("top", Effort::High),
                Some("worker" | "tester" | "docs") => ("mid", Effort::Medium),
                Some("scout" | "triager") => ("small", Effort::Low),
                Some(r) => panic!("{id}/{}: role {r}", s.id),
                None => {
                    assert!(s.model.is_none() && s.effort.is_none(), "{id}/{}", s.id);
                    continue;
                }
            };
            assert_eq!(
                (s.model.as_deref(), s.effort),
                (Some(want.0), Some(want.1)),
                "{id}/{}",
                s.id
            );
            if s.role.as_deref() == Some("reviewer") {
                assert!(s.fresh_context, "{id}/{}", s.id);
                assert_eq!(s.max_rounds, Some(2), "{id}/{}", s.id);
            }
            if s.for_each.is_some() {
                assert_eq!(s.max_parallel, Some(2), "{id}/{}", s.id);
            }
        }
    }
}

#[test]
fn feature_grills_first_and_gates_the_plan() {
    let wf = workflow("feature");
    let ids: Vec<_> = wf.steps.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["grill", "plan", "build", "review", "pr"]);
    assert_eq!(wf.steps[0].skill.as_deref(), Some("grill-me"));
    assert!(wf.steps[0].tools.contains(&"ask_question".into()));
    assert_eq!(wf.step("plan").unwrap().gate, Gate::Human);
    let build = wf.step("build").unwrap();
    assert_eq!(build.workspace, Workspace::Worktree);
    assert_eq!(build.for_each.as_deref(), Some("plan.tasks"));
    assert_eq!(wf.step("pr").unwrap().action, Some(Action::OpenPr));
}

#[test]
fn the_other_workflows_match_the_spec() {
    // bug: no plan gate, ends with a pull request.
    let bug = workflow("bug");
    assert!(bug.steps.iter().all(|s| s.gate == Gate::None));
    assert_eq!(bug.steps.first().unwrap().role.as_deref(), Some("triager"));
    assert_eq!(bug.steps.last().unwrap().action, Some(Action::OpenPr));
    // spike: grills, no pull request.
    let spike = workflow("spike");
    assert_eq!(spike.steps[0].skill.as_deref(), Some("grill-me"));
    assert!(spike.steps.iter().all(|s| s.action.is_none()));
    // spec-split: a human gate, no pull request.
    let split = workflow("spec-split");
    assert!(split.steps.iter().any(|s| s.gate == Gate::Human));
    assert!(split.steps.iter().all(|s| s.action.is_none()));
    // review-only: reviews, no build, no pull request.
    let review = workflow("review-only");
    assert_eq!(review.steps[0].role.as_deref(), Some("reviewer"));
    assert!(
        review
            .steps
            .iter()
            .all(|s| s.action.is_none() && s.role.as_deref() != Some("worker"))
    );
}

#[test]
fn every_role_states_its_tier_the_report_limit_and_the_style_contract() {
    let tier = |n: &str| match n {
        "planner" | "reviewer" => ("top", Effort::High),
        "worker" | "tester" | "docs" => ("mid", Effort::Medium),
        _ => ("small", Effort::Low),
    };
    for (name, text) in default_roles() {
        let r = parse_role(name, text).unwrap_or_else(|e| panic!("{name}: {e:?}"));
        let (model, effort) = tier(name);
        assert_eq!(r.model.as_deref(), Some(model), "{name}");
        assert_eq!(r.effort, Some(effort), "{name}");
        assert!(!r.description.is_empty(), "{name}");
        for needle in [
            "400 words",
            "`ponytail`",
            "`i-have-adhd`",
            "`caveman`",
            "`asd-ste100`",
        ] {
            assert!(r.prompt.contains(needle), "{name}: {needle}");
        }
    }
}

#[test]
fn no_default_names_a_vendor_model() {
    for (_, text) in default_workflows().iter().chain(default_roles()) {
        for vendor in ["opus", "sonnet", "haiku", "gpt", "gemini", "claude"] {
            assert!(
                !text.to_lowercase().contains(vendor),
                "vendor id {vendor} in a default"
            );
        }
    }
}

#[test]
fn seed_writes_each_directory_once_and_never_overwrites() {
    let dir = tempfile::tempdir().unwrap();
    let written = seed(dir.path()).unwrap();
    assert_eq!(written.len(), 12);
    assert!(dir.path().join(WORKFLOWS_DIR).join("feature.yaml").exists());
    assert!(dir.path().join(ROLES_DIR).join("scout.md").exists());
    // A person edits one file and deletes another: a second seed changes nothing.
    let feature = dir.path().join(WORKFLOWS_DIR).join("feature.yaml");
    std::fs::write(&feature, "mine").unwrap();
    std::fs::remove_file(dir.path().join(WORKFLOWS_DIR).join("bug.yaml")).unwrap();
    assert!(seed(dir.path()).unwrap().is_empty());
    assert_eq!(std::fs::read_to_string(feature).unwrap(), "mine");
    assert!(!dir.path().join(WORKFLOWS_DIR).join("bug.yaml").exists());
}

#[test]
fn a_seeded_project_loads_clean() {
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path()).unwrap();
    let l = load(dir.path(), &Loaded::default()).unwrap();
    assert_eq!(l.issues, []);
    assert_eq!(l.workflows.len(), 5);
    assert_eq!(l.roles.len(), 7);
    assert_eq!(l.workflows["feature"].steps.len(), 5);
}

fn put(dir: &std::path::Path, rel: &str, text: &str) {
    let p = dir.join(rel);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, text).unwrap();
}

#[test]
fn an_invalid_save_keeps_the_last_valid_version_and_names_the_line() {
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path()).unwrap();
    let first = load(dir.path(), &Loaded::default()).unwrap();
    let path = format!("{WORKFLOWS_DIR}/feature.yaml");
    let good = std::fs::read_to_string(dir.path().join(&path)).unwrap();

    // An unknown field.
    put(dir.path(), &path, &good.replace("fresh_context", "fresh"));
    let l = load(dir.path(), &first).unwrap();
    assert_eq!(l.workflows["feature"], first.workflows["feature"]);
    assert_eq!(l.workflows.len(), 5);
    assert_eq!(l.issues.len(), 1);
    assert_eq!(l.issues[0].file, path);
    assert!(l.issues[0].line.is_some());

    // A valid change reloads at once and the error goes.
    put(
        dir.path(),
        &path,
        &good.replace("max_turns: 40", "max_turns: 50"),
    );
    let l = load(dir.path(), &l).unwrap();
    assert_eq!(l.issues, []);
    assert_eq!(l.workflows["feature"].limits.max_turns, 50);
}

#[test]
fn a_check_issue_names_its_line() {
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path()).unwrap();
    let first = load(dir.path(), &Loaded::default()).unwrap();
    let path = format!("{WORKFLOWS_DIR}/feature.yaml");
    let good = std::fs::read_to_string(dir.path().join(&path)).unwrap();
    put(
        dir.path(),
        &path,
        &good.replace("role: reviewer", "role: security"),
    );
    let l = load(dir.path(), &first).unwrap();
    assert_eq!(l.workflows["feature"], first.workflows["feature"]);
    let issue = &l.issues[0];
    assert!(issue.message.contains("security"), "{}", issue.message);
    let line = issue.line.unwrap();
    let text = std::fs::read_to_string(dir.path().join(&path)).unwrap();
    assert!(text.lines().nth(line - 1).unwrap().contains("security"));

    // A project role file makes the same workflow valid.
    put(
        dir.path(),
        &format!("{ROLES_DIR}/security.md"),
        "---\nname: security\nmodel: top\neffort: high\n---\nYou review security.\n",
    );
    let l = load(dir.path(), &l).unwrap();
    assert_eq!(l.issues, []);
    assert_eq!(l.roles["security"].prompt.trim(), "You review security.");
}

#[test]
fn a_first_load_with_an_invalid_file_has_no_workflow_for_it() {
    let dir = tempfile::tempdir().unwrap();
    put(
        dir.path(),
        &format!("{WORKFLOWS_DIR}/broken.yaml"),
        "id: broken\nsteps: 3\n",
    );
    let l = load(dir.path(), &Loaded::default()).unwrap();
    assert!(l.workflows.is_empty());
    assert_eq!(l.issues.len(), 1);
}

#[test]
fn the_id_must_match_the_file_name() {
    let dir = tempfile::tempdir().unwrap();
    let (_, text) = default_workflows()[1];
    put(dir.path(), &format!("{WORKFLOWS_DIR}/other.yaml"), text);
    let l = load(dir.path(), &Loaded::default()).unwrap();
    assert!(l.workflows.is_empty());
    assert!(l.issues[0].message.contains("file name"));
}

#[test]
fn a_deleted_role_file_falls_back_to_the_bundled_profile() {
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path()).unwrap();
    std::fs::remove_file(dir.path().join(ROLES_DIR).join("scout.md")).unwrap();
    let l = load(dir.path(), &Loaded::default()).unwrap();
    // The workflows still validate, and the profile still resolves.
    assert_eq!(l.issues, []);
    assert!(!l.roles.contains_key("scout"));
    assert_eq!(l.role("scout").unwrap().model.as_deref(), Some("small"));
    assert!(l.role("nobody").is_none());
}

#[test]
fn a_bad_role_file_keeps_the_last_valid_profile() {
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path()).unwrap();
    let first = load(dir.path(), &Loaded::default()).unwrap();
    put(
        dir.path(),
        &format!("{ROLES_DIR}/worker.md"),
        "---\nmodel: [unclosed\n---\nbody\n",
    );
    let l = load(dir.path(), &first).unwrap();
    assert_eq!(l.roles["worker"], first.roles["worker"]);
    assert_eq!(l.issues.len(), 1);
    assert_eq!(l.issues[0].file, format!("{ROLES_DIR}/worker.md"));
}
