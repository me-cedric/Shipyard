//! Conflicts: list the blocks, resolve by choice (REQ-005).
//!
//! The blocks come from a fresh diff3 merge of the three index sides, so the base text is there
//! whatever the `merge.conflictStyle` setting says.
//! shortcut: a file that holds marker-like lines of its own can split wrong, take a whole side then.

use std::fs;
use std::path::Path;

use git2::{Index, IndexConflict, MergeFileInput, MergeFileOptions};
use serde::{Deserialize, Serialize};
use specta::Type;

use super::{Repo, check_paths};
use crate::error::{GitError, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Segment {
    /// Lines both sides agree on.
    Text { text: String },
    /// One block. `base` is empty when the file has no common ancestor.
    Block {
        ours: String,
        base: String,
        theirs: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ConflictFile {
    pub path: String,
    /// Both sides are UTF-8 text, so `segments` is filled. False for binary files and for a
    /// side that deleted the file: take a whole side.
    pub text: bool,
    pub segments: Vec<Segment>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Choice {
    Ours,
    Theirs,
    /// Ours, then theirs.
    Both,
    Neither,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Side {
    Ours,
    Theirs,
}

/// The paths of the conflicts in `index`.
pub(crate) fn conflict_paths(index: &Index) -> Result<Vec<String>> {
    Ok(index
        .conflicts()?
        .filter_map(|c| c.ok())
        .filter_map(|c| path_of(&c))
        .collect())
}

fn path_of(c: &IndexConflict) -> Option<String> {
    let e = c
        .our
        .as_ref()
        .or(c.their.as_ref())
        .or(c.ancestor.as_ref())?;
    Some(String::from_utf8_lossy(&e.path).into_owned())
}

fn input<'a>(content: &'a [u8], path: &str) -> MergeFileInput<'a> {
    let mut i = MergeFileInput::new();
    i.content(content).path(path);
    i
}

fn parse(text: &str) -> Vec<Segment> {
    enum S {
        Text,
        Ours,
        Base,
        Theirs,
    }
    let mut out = Vec::new();
    let (mut cur, mut o, mut b, mut t) = Default::default();
    let mut st = S::Text;
    let flush = |cur: &mut String, out: &mut Vec<Segment>| {
        if !cur.is_empty() {
            out.push(Segment::Text {
                text: std::mem::take(cur),
            });
        }
    };
    for line in text.split_inclusive('\n') {
        let l = line.trim_end_matches(['\r', '\n']);
        match st {
            S::Text if l.starts_with("<<<<<<<") => {
                flush(&mut cur, &mut out);
                st = S::Ours;
            }
            S::Ours if l.starts_with("|||||||") => st = S::Base,
            S::Ours | S::Base if l == "=======" => st = S::Theirs,
            S::Theirs if l.starts_with(">>>>>>>") => {
                out.push(Segment::Block {
                    ours: std::mem::take(&mut o),
                    base: std::mem::take(&mut b),
                    theirs: std::mem::take(&mut t),
                });
                st = S::Text;
            }
            S::Text => cur.push_str(line),
            S::Ours => o.push_str(line),
            S::Base => b.push_str(line),
            S::Theirs => t.push_str(line),
        }
    }
    flush(&mut cur, &mut out);
    out
}

impl Repo {
    /// The index as it is on disk: another handle may have written it since this one opened.
    pub(crate) fn fresh_index(&self) -> Result<Index> {
        let mut index = self.repo.index()?;
        index.read(false)?;
        Ok(index)
    }

    fn conflict(&self, path: &str) -> Result<IndexConflict> {
        self.fresh_index()?
            .conflicts()?
            .filter_map(|c| c.ok())
            .find(|c| path_of(c).as_deref() == Some(path))
            .ok_or_else(|| GitError::Git(format!("not conflicted: {path}")))
    }

    fn blob(&self, e: &git2::IndexEntry) -> Result<Vec<u8>> {
        Ok(self.repo.find_blob(e.id)?.content().to_vec())
    }

    /// The segments of a conflict, or `None` when a side is binary, not UTF-8 or deleted.
    fn segments(&self, c: &IndexConflict, path: &str) -> Result<Option<Vec<Segment>>> {
        let (Some(our), Some(their)) = (&c.our, &c.their) else {
            return Ok(None);
        };
        let base = c.ancestor.as_ref().map(|e| self.blob(e)).transpose()?;
        let (our, their) = (self.blob(our)?, self.blob(their)?);
        let base = base.unwrap_or_default();
        let binary = |b: &[u8]| b.contains(&0) || std::str::from_utf8(b).is_err();
        if binary(&our) || binary(&their) || binary(&base) {
            return Ok(None);
        }
        let mut o = MergeFileOptions::new();
        o.style_diff3(true)
            .our_label("ours")
            .their_label("theirs")
            .ancestor_label("base");
        let merged = git2::merge_file(
            &input(&base, path),
            &input(&our, path),
            &input(&their, path),
            Some(&mut o),
        )?;
        Ok(Some(parse(&String::from_utf8_lossy(merged.content()))))
    }

    /// Each conflicted file with its blocks. Works for a merge and for a stash apply.
    pub fn conflicts(&self) -> Result<Vec<ConflictFile>> {
        let mut out = Vec::new();
        for c in self.fresh_index()?.conflicts()?.filter_map(|c| c.ok()) {
            let Some(path) = path_of(&c) else { continue };
            let segments = self.segments(&c, &path)?;
            out.push(ConflictFile {
                text: segments.is_some(),
                segments: segments.unwrap_or_default(),
                path,
            });
        }
        Ok(out)
    }

    /// Resolve a text conflict with one choice per block, in order, then stage the file.
    pub fn resolve_blocks(&self, path: &str, choices: &[Choice]) -> Result<()> {
        check_paths(&[path.to_string()])?;
        let c = self.conflict(path)?;
        let segs = self
            .segments(&c, path)?
            .ok_or_else(|| GitError::Git(format!("no text blocks: take a side for {path}")))?;
        let blocks = segs
            .iter()
            .filter(|s| matches!(s, Segment::Block { .. }))
            .count();
        if blocks != choices.len() {
            return Err(GitError::Git(format!(
                "{path} has {blocks} blocks, got {} choices",
                choices.len()
            )));
        }
        let mut picks = choices.iter();
        let mut text = String::new();
        for s in &segs {
            match s {
                Segment::Text { text: t } => text.push_str(t),
                Segment::Block { ours, theirs, .. } => match picks.next() {
                    Some(Choice::Ours) => text.push_str(ours),
                    Some(Choice::Theirs) => text.push_str(theirs),
                    Some(Choice::Both) => {
                        text.push_str(ours);
                        text.push_str(theirs);
                    }
                    _ => {}
                },
            }
        }
        fs::write(self.workdir().join(path), text)?;
        self.clear(path, true)
    }

    /// Take a whole side, also when that side deleted the file, then stage the result.
    pub fn resolve_side(&self, path: &str, side: Side) -> Result<()> {
        check_paths(&[path.to_string()])?;
        let c = self.conflict(path)?;
        let abs = self.workdir().join(path);
        match match side {
            Side::Ours => &c.our,
            Side::Theirs => &c.their,
        } {
            Some(e) => {
                fs::write(&abs, self.blob(e)?)?;
                self.clear(path, true)
            }
            None => {
                match fs::remove_file(&abs) {
                    Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
                    _ => {}
                }
                self.clear(path, false)
            }
        }
    }

    /// Stage a file that a person edited by hand. Refuses while a conflict marker is left.
    /// A file that a person deleted is staged as a deletion.
    pub fn mark_resolved(&self, path: &str) -> Result<()> {
        check_paths(&[path.to_string()])?;
        self.conflict(path)?;
        match fs::read(self.workdir().join(path)) {
            Ok(b) => {
                let text = String::from_utf8_lossy(&b);
                if text
                    .lines()
                    .any(|l| l.starts_with("<<<<<<<") || l.starts_with(">>>>>>>"))
                {
                    return Err(GitError::ConflictMarkers(path.to_string()));
                }
                self.clear(path, true)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => self.clear(path, false),
            Err(e) => Err(e.into()),
        }
    }

    /// Replace the conflict of `path` with the working copy file (`present`) or with a deletion.
    fn clear(&self, path: &str, present: bool) -> Result<()> {
        let mut index = self.fresh_index()?;
        let p = Path::new(path);
        if present {
            index.add_path(p)?;
        } else {
            index.remove_path(p).ok();
        }
        index.conflict_remove(p).ok();
        index.write()?;
        Ok(())
    }
}
