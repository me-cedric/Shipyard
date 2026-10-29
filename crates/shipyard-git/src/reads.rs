//! What a run reads from its folder for review and delivery (spec `delivery` REQ-001, REQ-002,
//! REQ-005): the files and the diff against a base, one line of a file, a folder at a revision.
//! Reads only: no call here changes the repository.

use git2::{DiffFormat, DiffOptions, ObjectType, Patch, TreeWalkMode, TreeWalkResult};

use crate::code::{FileDiff, FileView, Repo, check_paths};
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
    /// The tag names, sorted (spec `code`, REQ-029: a tag is a base to compare with).
    pub fn tags(&self) -> Result<Vec<String>> {
        let names = self.repo.tag_names(None)?;
        let mut out: Vec<String> = names
            .iter()
            .flatten()
            .flatten()
            .map(str::to_string)
            .collect();
        out.sort();
        Ok(out)
    }

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

    /// The diff of [`Repo::changed_since`], one entry for each file, in the shape of the Code
    /// space. `max_bytes` caps the text of all files together: the entry that crosses it is cut
    /// (`truncated`) and the next ones come with no text.
    pub fn file_diffs_since(&self, base: &str, max_bytes: usize) -> Result<Vec<FileDiff>> {
        let diff = self.since(base)?;
        let mut left = max_bytes;
        let mut out = Vec::new();
        for i in 0..diff.deltas().len() {
            let Some(mut patch) = Patch::from_diff(&diff, i)? else {
                continue;
            };
            let d = patch.delta();
            let path = d.new_file().path().or_else(|| d.old_file().path());
            let path = path.map_or_else(String::new, |p| p.to_string_lossy().replace('\\', "/"));
            let binary = d.flags().is_binary();
            let mut text = match binary {
                true => String::new(),
                false => String::from_utf8_lossy(&patch.to_buf()?).into_owned(),
            };
            let truncated = cut(&mut text, left);
            left -= text.len();
            out.push(FileDiff {
                path,
                text,
                binary,
                truncated,
            });
        }
        Ok(out)
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

    /// A file of the working copy, or at `rev`, for the viewer (REQ-036). The path stays inside
    /// the working copy: a link that leaves it is refused. A binary file gives its size only.
    pub fn read_file(&self, path: &str, rev: Option<&str>, max_bytes: usize) -> Result<FileView> {
        check_paths(&[path.to_string()])?;
        // A file above `MAX_FILE_BYTES` is not read: its size is all that the view gives.
        let big = |n: u64| FileView {
            path: path.to_string(),
            size: u32::try_from(n).unwrap_or(u32::MAX),
            binary: true,
            truncated: false,
            text: String::new(),
        };
        let too_big = |n: u64| n > MAX_FILE_BYTES.unsigned_abs();
        let bytes = match rev {
            Some(rev) => {
                let tree = self.repo.revparse_single(rev)?.peel_to_tree()?;
                let entry = tree.get_path(std::path::Path::new(path))?;
                let (n, _) = self.repo.odb()?.read_header(entry.id())?;
                if too_big(n as u64) {
                    return Ok(big(n as u64));
                }
                self.repo.find_blob(entry.id())?.content().to_vec()
            }
            None => {
                let (root, file) = (
                    self.workdir().canonicalize()?,
                    self.workdir().join(path).canonicalize()?,
                );
                if !file.starts_with(&root) || !file.is_file() {
                    return Err(GitError::BadPath(path.to_string()));
                }
                let n = file.metadata()?.len();
                if too_big(n) {
                    return Ok(big(n));
                }
                std::fs::read(file)?
            }
        };
        let size = u32::try_from(bytes.len()).unwrap_or(u32::MAX);
        let mut text =
            String::from_utf8_lossy(&bytes[..bytes.len().min(max_bytes + 4)]).into_owned();
        let binary = bytes.contains(&0);
        let truncated = !binary && cut(&mut text, max_bytes);
        Ok(FileView {
            path: path.to_string(),
            size,
            binary,
            truncated,
            text: if binary { String::new() } else { text },
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
