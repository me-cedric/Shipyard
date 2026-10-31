//! Stash pop and diff, branch fast-forward and inspect, on temporary repositories.

use std::fs;
use std::path::Path;

use git2::{Repository, RepositoryInitOptions};
use shipyard_git::code::Forward;
use shipyard_git::{Auth, Repo};
use tempfile::TempDir;

fn ident(r: &Repository) {
    let mut c = r.config().unwrap();
    c.set_str("user.name", "Test User").unwrap();
    c.set_str("user.email", "test@example.com").unwrap();
}

fn init(dir: &Path) -> Repo {
    let mut o = RepositoryInitOptions::new();
    o.initial_head("main");
    ident(&Repository::init_opts(dir, &o).unwrap());
    Repo::open(dir).unwrap()
}

fn write(r: &Repo, rel: &str, text: &str) {
    fs::write(r.workdir().join(rel), text).unwrap();
}

fn commit(r: &Repo, rel: &str, text: &str, msg: &str) -> String {
    write(r, rel, text);
    r.stage(&[rel.to_string()]).unwrap();
    r.commit(msg, "").unwrap()
}

#[test]
fn a_pop_applies_then_drops_and_a_diff_shows_the_changes() {
    let tmp = TempDir::new().unwrap();
    let mut r = init(tmp.path());
    commit(&r, "a.txt", "1\n", "chore: a");
    write(&r, "a.txt", "2\n");
    r.stash_push(Some("my work")).unwrap();
    let id = r.stash_list().unwrap()[0].id.clone();
    let diff = r.stash_diff(&id, 64 * 1024).unwrap();
    assert_eq!(diff.len(), 1);
    assert_eq!(diff[0].path, "a.txt");
    assert!(diff[0].text.contains("+2"));
    r.stash_pop(&id).unwrap();
    assert!(r.stash_list().unwrap().is_empty());
    assert_eq!(
        fs::read_to_string(r.workdir().join("a.txt")).unwrap(),
        "2\n"
    );
    assert!(r.stash_pop(&id).is_err());
    assert!(r.stash_diff(&id, 1024).is_err());
}

#[test]
fn a_branch_that_lags_moves_and_one_with_its_own_commits_is_refused() {
    let tmp = TempDir::new().unwrap();
    let url = tmp.path().join("remote.git");
    let mut o = RepositoryInitOptions::new();
    o.bare(true).initial_head("main");
    Repository::init_opts(&url, &o).unwrap();
    let a = init(&tmp.path().join("a"));
    commit(&a, "base.txt", "base\n", "chore: base");
    Repository::open(a.workdir())
        .unwrap()
        .remote("origin", url.to_str().unwrap())
        .unwrap();
    a.push("origin", &Auth::none()).unwrap();
    let b_dir = tmp.path().join("b");
    ident(&Repository::clone(url.to_str().unwrap(), &b_dir).unwrap());
    let mut b = Repo::open(&b_dir).unwrap();

    assert_eq!(b.fast_forward("main").unwrap(), Forward::UpToDate);
    commit(&a, "base.txt", "next\n", "feat: next");
    a.push("origin", &Auth::none()).unwrap();
    b.fetch("origin", &Auth::none()).unwrap();
    assert_eq!(b.inspect().unwrap().behind, 1);
    assert_eq!(b.fast_forward("main").unwrap(), Forward::Moved);
    assert_eq!(
        fs::read_to_string(b_dir.join("base.txt")).unwrap(),
        "next\n"
    );
    let seen = b.inspect().unwrap();
    assert_eq!(
        (seen.branch.as_deref(), seen.behind, seen.changes),
        (Some("main"), 0, 0)
    );
    assert_eq!(seen.last.as_deref(), Some("feat: next"));

    commit(&b, "own.txt", "own\n", "feat: own");
    commit(&a, "base.txt", "later\n", "feat: later");
    a.push("origin", &Auth::none()).unwrap();
    b.fetch("origin", &Auth::none()).unwrap();
    assert!(b.fast_forward("main").is_err());
    assert!(b.fast_forward("nope").is_err());
    write(&b, "loose.txt", "x\n");
    assert_eq!(b.inspect().unwrap().changes, 1);
}
