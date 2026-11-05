//! Q-134: a tool with no status command shows "Signed out" after a run that ends on a sign-in
//! error. Its own test binary: the mark is process-wide, and other run tests would clear it.

#![cfg(unix)]

use shipyard_agents::fake::program;
use shipyard_agents::runner::*;
use std::time::Duration;
use tempfile::TempDir;

/// Runs the opencode runner on a fake program with the body `script`, to its end.
fn run(script: &str) {
    let tmp = TempDir::new().unwrap();
    let work = tmp.path().join("work");
    std::fs::create_dir_all(&work).unwrap();
    let mut spec = RunSpec::new("Fix the login.", &work, tmp.path().join("scratch"));
    spec.program = Some(program(tmp.path(), "fake-cli", script));
    let run = start(&*runner("opencode").unwrap(), spec).unwrap();
    loop {
        match run.recv_timeout(Duration::from_secs(30)) {
            Recv::Event(_) => {}
            Recv::Idle => panic!("the run was silent for 30 s"),
            Recv::Done => return,
        }
    }
}

#[test]
fn a_sign_in_error_marks_the_tool_and_a_good_run_or_a_sign_in_clears_it() {
    assert!(!signed_out_by_last_run("opencode"));

    run("cat > /dev/null\necho 'Error: not logged in. Run opencode auth login' >&2\nexit 1");
    assert!(signed_out_by_last_run("opencode"));
    assert!(!signed_out_by_last_run("copilot"));

    // A failure for another reason leaves the mark as it is.
    run("cat > /dev/null\necho 'cannot reach the API' >&2\nexit 3");
    assert!(signed_out_by_last_run("opencode"));

    run("cat > /dev/null\nexit 0");
    assert!(!signed_out_by_last_run("opencode"));

    run("cat > /dev/null\necho '401 Unauthorized' >&2\nexit 1");
    assert!(signed_out_by_last_run("opencode"));
    clear_signed_out("opencode");
    assert!(!signed_out_by_last_run("opencode"));
}
