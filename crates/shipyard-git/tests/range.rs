//! The reads between two refs for the client reports: the net diff and the commits of a range.

use std::fs;

use git2::{Repository, RepositoryInitOptions};
use shipyard_git::Repo;

fn init(dir: &std::path::Path) -> Repo {
    let mut o = RepositoryInitOptions::new();
    o.initial_head("main");
    let r = Repository::init_opts(dir, &o).unwrap();
    let mut c = r.config().unwrap();
    c.set_str("user.name", "Test User").unwrap();
    c.set_str("user.email", "test@example.com").unwrap();
    Repo::open(dir).unwrap()
}

fn commit(r: &Repo, rel: &str, text: &str, msg: &str) -> String {
    let p = r.workdir().join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
    r.stage(&[rel.to_string()]).unwrap();
    r.commit(msg, "").unwrap()
}

#[test]
fn a_range_gives_the_net_diff_and_the_commits_with_their_lines() {
    let tmp = tempfile::tempdir().unwrap();
    let r = init(tmp.path());
    let base = commit(&r, "a.txt", "one\ntwo\n", "chore: start");
    commit(&r, "a.txt", "one\nTWO\nthree\n", "feat: PAY-7 edit a");
    let head = commit(&r, "b.txt", "new\n", "feat: add b");

    let diff = r.range_diff(&base, &head).unwrap();
    let rows: Vec<_> = diff
        .iter()
        .map(|f| (f.path.as_str(), f.status, f.added, f.removed))
        .collect();
    assert_eq!(rows, [("a.txt", 'M', 2, 1), ("b.txt", 'A', 1, 0)]);

    let commits = r.range_commits(&base, &head).unwrap();
    assert_eq!(commits.len(), 2, "the base commit is not in the range");
    assert_eq!(commits[0].author, "Test User");
    assert!(commits[0].message.contains("PAY-7"));
    assert_eq!(commits[0].files[0].path, "a.txt");
    assert_eq!(commits[1].files[0].status, 'A');

    assert!(r.range_commits("no-such-ref", &head).is_err());
    assert!(r.range_commits(&head, &head).unwrap().is_empty());
}
