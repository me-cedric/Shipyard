//! The catalog of a tool, with fake tools in a folder. One test: the fake programs are written and
//! started in turn, so no other thread forks while a script is open for writing.
#![cfg(unix)]

use std::time::Duration;

use shipyard_agents::catalog::catalog_in;
use shipyard_agents::fake::program;

#[test]
fn a_tool_that_lists_wins_and_a_tool_that_does_not_falls_back_to_the_table() {
    let dir = tempfile::tempdir().unwrap();
    let dirs = [dir.path().to_path_buf()];
    let wait = Duration::from_secs(5);
    // No tool installed: the table.
    let c = catalog_in("claude", &dirs, wait);
    assert_eq!(c.efforts, ["low", "medium", "high", "xhigh", "max"]);
    assert_eq!(
        c.models.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        ["opus", "sonnet", "haiku"]
    );
    assert!(c.models[2].efforts.is_empty());
    // Gemini has no effort and OpenCode has no table.
    let g = catalog_in("gemini", &dirs, wait);
    assert!(g.efforts.is_empty() && g.models.iter().all(|m| m.efforts.is_empty()));
    assert!(catalog_in("opencode", &dirs, wait).models.is_empty());
    // The help of Claude Code narrows the levels of the table.
    program(dir.path(), "claude", "echo '--effort <l> x (low, high)'");
    let c = catalog_in("claude", &dirs, wait);
    assert_eq!(c.efforts, ["low", "high"]);
    assert_eq!(c.models[0].efforts, ["low", "high"]);
    assert!(c.models[2].efforts.is_empty(), "haiku takes none");
    // OpenCode lists its own models.
    program(dir.path(), "opencode", "echo 'a/b'");
    let o = catalog_in("opencode", &dirs, wait);
    assert_eq!(o.models[0].id, "a/b");
    // Codex lists its models and their levels.
    program(
        dir.path(),
        "codex",
        r#"echo '{"models":[{"slug":"m1","visibility":"list","supported_reasoning_levels":[{"effort":"low"}]}]}'"#,
    );
    let x = catalog_in("codex", &dirs, wait);
    assert_eq!(
        (x.models[0].id.as_str(), x.efforts.as_slice()),
        ("m1", ["low".to_string()].as_slice())
    );
    // A tool that hangs is cut at the wait, and the table answers.
    program(dir.path(), "codex", "sleep 30");
    let c = catalog_in("codex", &dirs, Duration::from_millis(200));
    assert_eq!(c.models[0].id, "gpt-5-codex");
    assert_eq!(c.efforts, ["low", "medium", "high"]);
    // A tool runs in the temp folder, not in the folder of the caller.
    let seen = dir.path().join("cwd");
    program(
        dir.path(),
        "opencode",
        &format!("pwd > '{}'; echo 'a/b'", seen.display()),
    );
    assert_eq!(catalog_in("opencode", &dirs, wait).models[0].id, "a/b");
    assert_eq!(
        std::fs::canonicalize(std::fs::read_to_string(&seen).unwrap().trim()).unwrap(),
        std::fs::canonicalize(std::env::temp_dir()).unwrap()
    );
    // A tool that closes stdout and keeps running is killed at the time limit.
    let pid = dir.path().join("pid");
    program(
        dir.path(),
        "opencode",
        &format!("echo $$ > '{}'; exec >&-; exec sleep 30", pid.display()),
    );
    let start = std::time::Instant::now();
    assert!(
        catalog_in("opencode", &dirs, Duration::from_millis(300))
            .models
            .is_empty()
    );
    assert!(start.elapsed() < Duration::from_secs(5));
    let alive = std::process::Command::new("kill")
        .args(["-0", std::fs::read_to_string(&pid).unwrap().trim()])
        .stderr(std::process::Stdio::null())
        .status()
        .unwrap()
        .success();
    assert!(!alive, "the tool still runs");
}
