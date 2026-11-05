//! Rename of a file with its links. `collect` finds every text file whose links to the item change,
//! `review` shows the exact line changes, and `apply` writes them and moves the file in one step.
//! The files are written to temp files first. A failure restores each file that was already replaced.

use std::collections::BTreeSet;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;
use shipyard_core::project::ProjectFile;
use specta::Type;

use crate::Result;
use crate::ref_index::RefIndex;
use crate::repo_scan;

const MAX_BYTES: u64 = 2_000_000;
const TMP: &str = "shipyard-tmp";

#[derive(Debug, Clone, Serialize, Type)]
pub struct LinkLine {
    pub line: u32,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct LinkFile {
    pub path: String,
    pub lines: Vec<LinkLine>,
}

/// A file whose text changes: its path from the project root, its text now and its new text.
pub struct Pending {
    pub path: String,
    pub old: String,
    pub new: String,
}

fn dir_of(rel: &str) -> &str {
    rel.rsplit_once('/').map_or("", |(d, _)| d)
}

/// The path of `to` as a link written in a file of the folder `dir`. All paths are from the root.
fn relative(dir: &str, to: &str) -> String {
    let d: Vec<&str> = dir.split('/').filter(|c| !c.is_empty()).collect();
    let t: Vec<&str> = to.split('/').collect();
    let same = d.iter().zip(&t).take_while(|(a, b)| a == b).count();
    let up = std::iter::repeat_n("..", d.len() - same);
    up.chain(t[same..].iter().copied())
        .collect::<Vec<_>>()
        .join("/")
}

/// The primary ref of a file: what the index would call it. A file with no ref of its own is a doc.
fn ref_of(rel: &str, text: Option<&str>, p: &ProjectFile) -> String {
    text.and_then(|t| repo_scan::scan(rel, t, p).0.into_iter().next())
        .map_or_else(|| format!("doc:{rel}"), |e| e.target)
}

/// Text files of the project that can hold a link: Markdown, YAML and JSON. Hidden folders stay out,
/// except `.shipyard`.
fn walk(root: &Path, rel: &str, out: &mut BTreeSet<String>) {
    let Ok(rd) = std::fs::read_dir(root.join(rel)) else {
        return;
    };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let child = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        let Ok(kind) = e.file_type() else { continue };
        if kind.is_dir() {
            let hidden = name.starts_with('.') && name != ".shipyard";
            if !hidden && name != "node_modules" && name != "target" {
                walk(root, &child, out);
            }
        } else if kind.is_file()
            && matches!(
                name.rsplit('.').next(),
                Some("md" | "yaml" | "yml" | "json")
            )
            && e.metadata().is_ok_and(|m| m.len() <= MAX_BYTES)
        {
            out.insert(child);
        }
    }
}

/// A match must not sit inside a longer name: no name character before it, and none after it.
fn edge(b: &[u8], start: usize, end: usize) -> bool {
    let name = |c: u8| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-');
    let before = start == 0 || !(name(b[start - 1]) || matches!(b[start - 1], b'.' | b'/'));
    let after = b.get(end).is_none_or(|&c| {
        !(name(c) || c == b'/' || (c == b'.' && b.get(end + 1).is_some_and(|&n| name(n))))
    });
    before && after
}

/// The line with each needle replaced, or `None` when no needle is in it. Longer needles go first.
fn rewrite_line(line: &str, pairs: &[(String, String)]) -> Option<String> {
    let b = line.as_bytes();
    let (mut out, mut i, mut hit) = (String::new(), 0, false);
    while i < line.len() {
        let found = pairs
            .iter()
            .find(|(n, _)| line[i..].starts_with(n.as_str()) && edge(b, i, i + n.len()));
        if let Some((n, r)) = found {
            out.push_str(r);
            i += n.len();
            hit = true;
        } else {
            let c = line[i..].chars().next()?;
            out.push(c);
            i += c.len_utf8();
        }
    }
    hit.then_some(out)
}

/// The files whose links to `from` change when it becomes `to`, and the new ref of the item. The
/// files are the text files of the project and the files of the backlinks. The new name stays in
/// the folder of the old one.
pub fn collect(
    index: &RefIndex,
    root: &Path,
    p: &ProjectFile,
    from: &str,
    to: &str,
) -> Result<(Vec<Pending>, String)> {
    if dir_of(from) != dir_of(to) {
        return Err("a rename keeps the folder of the file".into());
    }
    let text = std::fs::read_to_string(root.join(from)).ok();
    let (old_ref, new_ref) = (
        ref_of(from, text.as_deref(), p),
        ref_of(to, text.as_deref(), p),
    );
    let mut files = BTreeSet::new();
    walk(root, "", &mut files);
    for target in [format!("doc:{from}"), old_ref.clone()] {
        for source in index.backlinks(&target)?.into_iter().flat_map(|g| g.items) {
            let place = index.resolve(&source.source)?.and_then(|r| r.location);
            let inside = |l: &str| {
                Path::new(l)
                    .components()
                    .all(|c| matches!(c, std::path::Component::Normal(_)))
            };
            if let Some(l) = place.filter(|l| inside(l) && root.join(l).is_file()) {
                files.insert(l);
            }
        }
    }
    files.remove(from);
    let mut shared = vec![
        (format!("/{from}"), format!("/{to}")),
        (from.into(), to.into()),
    ];
    if old_ref != new_ref {
        shared.push((old_ref, new_ref.clone()));
    }
    let mut pending = Vec::new();
    for path in files {
        let Ok(old) = std::fs::read_to_string(root.join(&path)) else {
            continue;
        };
        let mut pairs = shared.clone();
        let (a, b) = (relative(dir_of(&path), from), relative(dir_of(&path), to));
        if !a.starts_with("..") {
            pairs.push((format!("./{a}"), format!("./{b}")));
        }
        pairs.push((a, b));
        pairs.sort_by_key(|(n, _)| std::cmp::Reverse(n.len()));
        let mut new = String::with_capacity(old.len());
        for l in old.split_inclusive('\n') {
            new.push_str(&rewrite_line(l, &pairs).unwrap_or_else(|| l.into()));
        }
        if new != old {
            pending.push(Pending { path, old, new });
        }
    }
    Ok((pending, new_ref))
}

/// The line changes of each file, for the review before the rename.
pub fn review(pending: &[Pending]) -> Vec<LinkFile> {
    pending
        .iter()
        .map(|w| LinkFile {
            path: w.path.clone(),
            lines: w
                .old
                .split_inclusive('\n')
                .zip(w.new.split_inclusive('\n'))
                .enumerate()
                .filter(|(_, (a, b))| a != b)
                .map(|(i, (a, b))| LinkLine {
                    line: i as u32 + 1,
                    before: a.trim_end().into(),
                    after: b.trim_end().into(),
                })
                .collect(),
        })
        .collect()
}

/// Rewrites the files and moves `from` to `to`. A failure leaves every file as it was.
pub fn apply(root: &Path, from: &str, to: &str, pending: &[Pending]) -> Result<()> {
    let (src, dst) = (root.join(from), root.join(to));
    commit(root, pending, || std::fs::rename(src, dst))
}

fn tmp_of(root: &Path, rel: &str) -> PathBuf {
    root.join(format!("{rel}.{TMP}"))
}

/// Stage 1 writes each new text to a temp file. Stage 2 renames the temp files over the files, then
/// runs `last`. When a stage fails, the files already replaced get their old text back.
fn commit(
    root: &Path,
    pending: &[Pending],
    last: impl FnOnce() -> std::io::Result<()>,
) -> Result<()> {
    let mut made: Vec<PathBuf> = Vec::new();
    let staged = pending.iter().try_for_each(|w| {
        let path = root.join(&w.path);
        if std::fs::read_to_string(&path)? != w.old {
            return Err(std::io::Error::other(format!("{} changed", w.path)));
        }
        let t = tmp_of(root, &w.path);
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&t)?;
        made.push(t.clone());
        f.write_all(w.new.as_bytes())?;
        std::fs::set_permissions(&t, std::fs::metadata(&path)?.permissions())
    });
    if let Err(e) = staged {
        made.iter().for_each(|t| drop(std::fs::remove_file(t)));
        return Err(e.into());
    }
    let mut done = 0;
    let mut result = Ok(());
    for (w, t) in pending.iter().zip(&made) {
        result = std::fs::rename(t, root.join(&w.path));
        if result.is_err() {
            break;
        }
        done += 1;
    }
    if result.is_ok() {
        result = last();
    }
    let Err(e) = result else { return Ok(()) };
    made[done..]
        .iter()
        .for_each(|t| drop(std::fs::remove_file(t)));
    let stuck: Vec<&str> = pending[..done]
        .iter()
        .filter(|w| {
            let t = tmp_of(root, &w.path);
            std::fs::write(&t, &w.old)
                .and_then(|()| std::fs::rename(&t, root.join(&w.path)))
                .is_err()
        })
        .map(|w| w.path.as_str())
        .collect();
    Err(if stuck.is_empty() {
        e.to_string()
    } else {
        format!("{e}. Not restored: {}", stuck.join(", "))
    }
    .into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs(a: &str, b: &str) -> Vec<(String, String)> {
        vec![(a.into(), b.into())]
    }

    #[test]
    fn a_match_never_sits_inside_a_longer_name() {
        let p = pairs("a.mmd", "b.mmd");
        assert_eq!(
            rewrite_line("[x](a.mmd#top) a.mmd.", &p).unwrap(),
            "[x](b.mmd#top) b.mmd."
        );
        for keep in ["data.mmd", "a.mmd.bak", "x/a.mmd", "a.mmd/y", "a.mmd-2"] {
            assert!(rewrite_line(keep, &p).is_none(), "{keep}");
        }
        assert_eq!(
            relative("docs/flows", "docs/diagrams/a.mmd"),
            "../diagrams/a.mmd"
        );
        assert_eq!(relative("docs", "docs/a.mmd"), "a.mmd");
        assert_eq!(relative("", "docs/a.mmd"), "docs/a.mmd");
    }

    fn project() -> (tempfile::TempDir, PathBuf, RefIndex) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_path_buf();
        for (path, text) in [
            ("docs/diagrams/old.mmd", "graph TD\n"),
            (
                "docs/flows/net.md",
                "See [d](../diagrams/old.mmd) and [[diagram:old]].\nNo link here.\n",
            ),
            (
                "docs/diagrams/note.md",
                "Next to [d](old.mmd) and [e](./old.mmd).\n",
            ),
            (
                "README.md",
                "Root: docs/diagrams/old.mmd and doc:docs/diagrams/old.mmd\nKeep data.mmd\n",
            ),
            (
                "docs/data/map.yaml",
                "source: diagram:old\nother: diagram:older\n",
            ),
            (
                "docs/data/map.json",
                "{\"path\": \"docs/diagrams/old.mmd\"}\r\n",
            ),
        ] {
            std::fs::create_dir_all(root.join(path).parent().unwrap()).unwrap();
            std::fs::write(root.join(path), text).unwrap();
        }
        let p = ProjectFile::new("x", "X");
        let mut index = RefIndex::open_memory().unwrap();
        index.sync_repo(&root, &p).unwrap();
        (tmp, root, index)
    }

    #[test]
    fn every_form_of_a_link_is_rewritten_and_the_review_shows_the_lines() {
        let (_t, root, index) = project();
        let p = ProjectFile::new("x", "X");
        let (pending, new_ref) = collect(
            &index,
            &root,
            &p,
            "docs/diagrams/old.mmd",
            "docs/diagrams/new.mmd",
        )
        .unwrap();
        assert_eq!(new_ref, "diagram:new");
        let text = |path: &str| {
            pending
                .iter()
                .find(|w| w.path == path)
                .map(|w| w.new.as_str())
        };
        assert_eq!(
            text("docs/flows/net.md"),
            Some("See [d](../diagrams/new.mmd) and [[diagram:new]].\nNo link here.\n")
        );
        assert_eq!(
            text("docs/diagrams/note.md"),
            Some("Next to [d](new.mmd) and [e](./new.mmd).\n")
        );
        assert_eq!(
            text("README.md"),
            Some("Root: docs/diagrams/new.mmd and doc:docs/diagrams/new.mmd\nKeep data.mmd\n")
        );
        assert_eq!(
            text("docs/data/map.yaml"),
            Some("source: diagram:new\nother: diagram:older\n")
        );
        assert_eq!(
            text("docs/data/map.json"),
            Some("{\"path\": \"docs/diagrams/new.mmd\"}\r\n")
        );
        let net = &review(&pending)
            .into_iter()
            .find(|f| f.path == "docs/flows/net.md")
            .unwrap();
        assert_eq!((net.lines.len(), net.lines[0].line), (1, 1));
        assert_eq!(
            net.lines[0].after,
            "See [d](../diagrams/new.mmd) and [[diagram:new]]."
        );
        // Nothing is written before the apply.
        assert!(root.join("docs/diagrams/old.mmd").is_file());
        apply(
            &root,
            "docs/diagrams/old.mmd",
            "docs/diagrams/new.mmd",
            &pending,
        )
        .unwrap();
        assert!(
            root.join("docs/diagrams/new.mmd").is_file()
                && !root.join("docs/diagrams/old.mmd").exists()
        );
        assert!(
            std::fs::read_to_string(root.join("README.md"))
                .unwrap()
                .contains("new.mmd")
        );
        assert!(!root.join(format!("README.md.{TMP}")).exists());
    }

    #[test]
    fn a_rename_into_another_folder_is_refused() {
        let (_t, root, index) = project();
        let p = ProjectFile::new("x", "X");
        assert!(
            collect(
                &index,
                &root,
                &p,
                "docs/diagrams/old.mmd",
                "docs/flows/old.mmd"
            )
            .is_err()
        );
    }

    fn snapshot(root: &Path) -> Vec<(String, String)> {
        let mut all = BTreeSet::new();
        walk(root, "", &mut all);
        all.into_iter()
            .map(|p| (std::fs::read_to_string(root.join(&p)).unwrap(), p))
            .map(|(t, p)| (p, t))
            .collect()
    }

    #[test]
    fn a_failure_in_the_last_step_restores_every_file() {
        let (_t, root, index) = project();
        let p = ProjectFile::new("x", "X");
        let before = snapshot(&root);
        let (pending, _) = collect(
            &index,
            &root,
            &p,
            "docs/diagrams/old.mmd",
            "docs/diagrams/new.mmd",
        )
        .unwrap();
        assert!(pending.len() > 2);
        let err = commit(&root, &pending, || Err(std::io::Error::other("disk full"))).unwrap_err();
        assert_eq!(err.to_string(), "disk full");
        assert_eq!(snapshot(&root), before);
    }

    #[test]
    fn a_failed_write_leaves_every_file_and_no_temp_file() {
        let (_t, root, index) = project();
        let p = ProjectFile::new("x", "X");
        let before = snapshot(&root);
        let (pending, _) = collect(
            &index,
            &root,
            &p,
            "docs/diagrams/old.mmd",
            "docs/diagrams/new.mmd",
        )
        .unwrap();
        // The temp path of the last file is taken, so its write fails after the others were staged.
        let last = &pending.last().unwrap().path;
        std::fs::create_dir(tmp_of(&root, last)).unwrap();
        assert!(
            apply(
                &root,
                "docs/diagrams/old.mmd",
                "docs/diagrams/new.mmd",
                &pending
            )
            .is_err()
        );
        std::fs::remove_dir(tmp_of(&root, last)).unwrap();
        assert_eq!(snapshot(&root), before);
        assert!(root.join("docs/diagrams/old.mmd").is_file());
        let mut left = BTreeSet::new();
        walk(&root, "", &mut left);
        assert!(left.iter().all(|f| !f.ends_with(TMP)));
    }

    #[test]
    fn a_file_that_changed_since_the_plan_stops_the_rename() {
        let (_t, root, index) = project();
        let p = ProjectFile::new("x", "X");
        let (pending, _) = collect(
            &index,
            &root,
            &p,
            "docs/diagrams/old.mmd",
            "docs/diagrams/new.mmd",
        )
        .unwrap();
        std::fs::write(root.join("README.md"), "edited meanwhile\n").unwrap();
        assert!(
            apply(
                &root,
                "docs/diagrams/old.mmd",
                "docs/diagrams/new.mmd",
                &pending
            )
            .is_err()
        );
        assert!(root.join("docs/diagrams/old.mmd").is_file());
    }
}
