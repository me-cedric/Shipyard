//! What a run reads from its folder for review and delivery (spec `delivery` REQ-001, REQ-002,
//! REQ-005): the files and the diff against the base, one line, a folder at a revision.

use std::fs;
use std::path::Path;

use git2::{Repository, RepositoryInitOptions};
use shipyard_git::Repo;

fn init(dir: &Path) -> Repo {
    let mut o = RepositoryInitOptions::new();
    o.initial_head("main");
    let r = Repository::init_opts(dir, &o).unwrap();
    let mut c = r.config().unwrap();
    c.set_str("user.name", "Test User").unwrap();
    c.set_str("user.email", "test@example.com").unwrap();
    Repo::open(dir).unwrap()
}

fn write(r: &Repo, rel: &str, text: &str) {
    let p = r.workdir().join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn commit(r: &Repo, rel: &str, text: &str) -> String {
    write(r, rel, text);
    r.stage(&[rel.to_string()]).unwrap();
    r.commit(&format!("chore: write {rel}"), "").unwrap()
}

/// `main` with a spec and a source file, then a branch with one commit and one loose file.
fn fixture() -> (tempfile::TempDir, Repo, String) {
    let tmp = tempfile::tempdir().unwrap();
    let r = init(tmp.path());
    commit(&r, "docs/openspec/a/spec.md", "# A\n");
    let base = commit(&r, "src/lib.rs", "one\ntwo\n");
    r.create_branch("work").unwrap();
    r.switch_branch("work").unwrap();
    commit(&r, "src/new.rs", "fn new() {}\n");
    write(&r, "src/lib.rs", "one\nTWO\n");
    write(&r, "loose.txt", "untracked\n");
    (tmp, r, base)
}

#[test]
fn the_changed_files_hold_commits_edits_and_untracked_files() {
    let (_t, r, _) = fixture();
    let mut files = r.changed_since("main").unwrap();
    files.sort();
    assert_eq!(files, ["loose.txt", "src/lib.rs", "src/new.rs"]);
}

#[test]
fn the_diff_shows_the_change_and_is_cut_at_the_cap() {
    let (_t, r, _) = fixture();
    let diff = r.diff_since("main", 100_000).unwrap();
    assert!(diff.contains("+fn new() {}"), "{diff}");
    assert!(diff.contains("-two") && diff.contains("+TWO"), "{diff}");
    let cut = r.diff_since("main", 40).unwrap();
    assert!(cut.len() < diff.len() && cut.contains("[cut]"), "{cut}");
}

#[test]
fn the_diff_by_file_has_the_shape_of_the_code_space_and_a_total_cap() {
    let (_t, r, _) = fixture();
    let files = r.file_diffs_since("main", 100_000).unwrap();
    let lib = files.iter().find(|f| f.path == "src/lib.rs").unwrap();
    assert!(
        lib.text.contains("+TWO") && !lib.binary && !lib.truncated,
        "{lib:?}"
    );
    assert_eq!(
        files.len(),
        r.changed_since("main").unwrap().len(),
        "one entry for each changed file"
    );
    let capped = r.file_diffs_since("main", 10).unwrap();
    assert!(capped.iter().any(|f| f.truncated));
    assert!(capped.iter().map(|f| f.text.len()).sum::<usize>() <= 10);
}

#[test]
fn a_line_is_read_from_the_folder_and_a_missing_one_is_none() {
    let (_t, r, _) = fixture();
    assert_eq!(r.line("src/lib.rs", 2).unwrap().as_deref(), Some("TWO"));
    assert_eq!(r.line("src/lib.rs", 9).unwrap(), None);
    assert_eq!(r.line("nope.rs", 1).unwrap(), None);
    assert!(r.line("../x", 1).is_err(), "a path stays in the folder");
}

#[test]
fn a_folder_at_a_revision_lists_the_files_with_their_text() {
    let (_t, r, base) = fixture();
    let at_base = r.files_at(&base, "docs/openspec", 10, 1000).unwrap();
    assert_eq!(
        at_base,
        [("docs/openspec/a/spec.md".to_string(), "# A\n".to_string())]
    );
    assert!(
        r.files_at("main", "docs/none", 10, 1000)
            .unwrap()
            .is_empty()
    );
    // The count and the size are capped.
    assert!(r.files_at(&base, "docs", 0, 1000).unwrap().is_empty());
    assert!(r.files_at(&base, "docs", 10, 2).unwrap()[0].1.len() <= 2);
}

#[test]
fn the_head_is_the_full_commit_id() {
    let (_t, r, _) = fixture();
    let head = r.head_sha().unwrap();
    assert_eq!(head.len(), 40);
    assert_eq!(head, r.status().unwrap().head.unwrap());
}
