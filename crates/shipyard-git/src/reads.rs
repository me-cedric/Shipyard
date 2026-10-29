//! What a run reads from its folder for review and delivery (spec `delivery` REQ-001, REQ-002,
//! REQ-005): the files and the diff against a base, one line of a file, a folder at a revision.
//! Reads only: no call here changes the repository.

use git2::{DiffFormat, DiffOptions, ObjectType, TreeWalkMode, TreeWalkResult};

use crate::code::{Repo, check_paths};
use crate::error::{GitError, Result};

/// Files above this size count as binary, so a huge file never loads as a diff.
const MAX_FILE_BYTES: i64 = 8 * 1024 * 1024;

fn cut(text: &mut String, max: usize) -> bool {
    if text.len() <= max {
        return false;
    }
    let mut at = max;
    while !text.is_char_boundary(at) {
        at -= 1;
    }
    text.truncate(at);
    true
}

impl Repo {
    /// Full id of HEAD.
    pub fn head_sha(&self) -> Result<String> {
        Ok(self.repo.head()?.peel_to_commit()?.id().to_string())
    }

    /// The diff of the working copy against the merge base of HEAD and `base`: commits, edits
    /// and untracked files together.
    fn since(&self, base: &str) -> Result<git2::Diff<'_>> {
        let head = self.repo.head()?.peel_to_commit()?.id();
        let base = self.repo.revparse_single(base)?.peel_to_commit()?.id();
        let tree = self
            .repo
            .find_commit(self.repo.merge_base(head, base)?)?
            .tree()?;
        let mut o = DiffOptions::new();
        o.include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true)
            .max_size(MAX_FILE_BYTES);
        Ok(self
            .repo
            .diff_tree_to_workdir_with_index(Some(&tree), Some(&mut o))?)
    }

    /// Every file that the run changed against `base`, committed or not, with `/` separators.
    pub fn changed_since(&self, base: &str) -> Result<Vec<String>> {
        Ok(self
            .since(base)?
            .deltas()
            .filter_map(|d| {
                let p = d.new_file().path().or_else(|| d.old_file().path())?;
                Some(p.to_string_lossy().replace('\\', "/"))
            })
            .collect())
    }

    /// The unified diff of [`Repo::changed_since`], cut at `max_bytes`. A cut ends with `[cut]`.
    pub fn diff_since(&self, base: &str, max_bytes: usize) -> Result<String> {
        let diff = self.since(base)?;
        let mut text = String::new();
        diff.print(DiffFormat::Patch, |_, _, l| {
            if matches!(l.origin(), '+' | '-' | ' ') {
                text.push(l.origin());
            }
            text.push_str(&String::from_utf8_lossy(l.content()));
            true
        })?;
        if cut(&mut text, max_bytes) {
            text.push_str("\n[cut]\n");
        }
        Ok(text)
    }

    /// Line `line` (from 1) of `path` in the working copy. `None`: no such file or line, or the
    /// file is not text. The path stays inside the working copy.
    pub fn line(&self, path: &str, line: u32) -> Result<Option<String>> {
        check_paths(&[path.to_string()])?;
        let Ok(text) = std::fs::read_to_string(self.workdir().join(path)) else {
            return Ok(None);
        };
        let n = usize::try_from(line).unwrap_or(0).saturating_sub(1);
        Ok(match line {
            0 => None,
            _ => text.lines().nth(n).map(str::to_string),
        })
    }

    /// The text files under `dir` at `rev`, sorted by path: at most `max_files`, each cut at
    /// `max_bytes`. A binary file and a missing folder give nothing.
    pub fn files_at(
        &self,
        rev: &str,
        dir: &str,
        max_files: usize,
        max_bytes: usize,
    ) -> Result<Vec<(String, String)>> {
        check_paths(&[dir.to_string()])?;
        let tree = self.repo.revparse_single(rev)?.peel_to_tree()?;
        let Ok(entry) = tree.get_path(std::path::Path::new(dir)) else {
            return Ok(Vec::new());
        };
        if entry.kind() != Some(ObjectType::Tree) {
            return Ok(Vec::new());
        }
        let sub = self.repo.find_tree(entry.id())?;
        let mut found: Vec<(String, git2::Oid)> = Vec::new();
        let mut failed = None;
        sub.walk(TreeWalkMode::PreOrder, |root, e| {
            if e.kind() == Some(ObjectType::Blob) {
                match e.name() {
                    Ok(name) => found.push((format!("{dir}/{root}{name}"), e.id())),
                    Err(_) => failed = Some(GitError::Git("a file name is not UTF-8".into())),
                }
            }
            TreeWalkResult::Ok
        })?;
        if let Some(e) = failed {
            return Err(e);
        }
        found.sort();
        let mut out = Vec::new();
        for (path, id) in found {
            if out.len() >= max_files {
                break;
            }
            let blob = self.repo.find_blob(id)?;
            if blob.is_binary() {
                continue;
            }
            let mut text = String::from_utf8_lossy(blob.content()).into_owned();
            cut(&mut text, max_bytes);
            out.push((path, text));
        }
        Ok(out)
    }
}
