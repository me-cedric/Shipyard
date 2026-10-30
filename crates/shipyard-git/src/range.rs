//! What changed between two refs, for the reports that go to a client (change request, work done).
//! Reads only: no call here changes the repository.

use git2::{Delta, Diff, Patch, Sort};

use crate::code::Repo;
use crate::error::{GitError, Result};

/// A range with more commits than this is refused, so a wrong ref cannot stall the app.
pub const MAX_COMMITS: usize = 10_000;

/// One file of a diff: the status letter (`A`, `M`, `D`, `R`) and the lines added and removed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RangeFile {
    pub path: String,
    pub status: char,
    pub added: u32,
    pub removed: u32,
}

/// One commit of `base..head`. A merge commit is left out: its changes sit in its parents.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RangeCommit {
    pub id: String,
    pub author: String,
    /// Unix time of the commit.
    pub time: i64,
    pub message: String,
    pub files: Vec<RangeFile>,
}

fn files_of(diff: &Diff<'_>) -> Result<Vec<RangeFile>> {
    let mut out = Vec::new();
    for i in 0..diff.deltas().len() {
        let Some(patch) = Patch::from_diff(diff, i)? else {
            continue;
        };
        let d = patch.delta();
        let path = d.new_file().path().or_else(|| d.old_file().path());
        let (_, added, removed) = patch.line_stats()?;
        out.push(RangeFile {
            path: path.map_or_else(String::new, |p| p.to_string_lossy().replace('\\', "/")),
            status: match d.status() {
                Delta::Added => 'A',
                Delta::Deleted => 'D',
                Delta::Renamed => 'R',
                _ => 'M',
            },
            added: u32::try_from(added).unwrap_or(u32::MAX),
            removed: u32::try_from(removed).unwrap_or(u32::MAX),
        });
    }
    Ok(out)
}

impl Repo {
    /// The files that differ between the trees of `base` and `head`, sorted by path.
    pub fn range_diff(&self, base: &str, head: &str) -> Result<Vec<RangeFile>> {
        let tree = |rev: &str| -> Result<_> { Ok(self.repo.revparse_single(rev)?.peel_to_tree()?) };
        let diff = self
            .repo
            .diff_tree_to_tree(Some(&tree(base)?), Some(&tree(head)?), None)?;
        let mut out = files_of(&diff)?;
        out.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(out)
    }

    /// The commits that `head` has and `base` has not, oldest first, with their files.
    pub fn range_commits(&self, base: &str, head: &str) -> Result<Vec<RangeCommit>> {
        let id =
            |rev: &str| -> Result<_> { Ok(self.repo.revparse_single(rev)?.peel_to_commit()?.id()) };
        let mut walk = self.repo.revwalk()?;
        walk.set_sorting(Sort::TIME | Sort::REVERSE)?;
        walk.push(id(head)?)?;
        walk.hide(id(base)?)?;
        let mut out = Vec::new();
        for oid in walk {
            if out.len() == MAX_COMMITS {
                return Err(GitError::Git(format!(
                    "more than {MAX_COMMITS} commits between the two refs"
                )));
            }
            let c = self.repo.find_commit(oid?)?;
            if c.parent_count() > 1 {
                continue;
            }
            let parent = c.parents().next().map(|p| p.tree()).transpose()?;
            let diff = self
                .repo
                .diff_tree_to_tree(parent.as_ref(), Some(&c.tree()?), None)?;
            out.push(RangeCommit {
                id: c.id().to_string(),
                author: c.author().name().unwrap_or_default().to_string(),
                time: c.time().seconds(),
                message: c.message().unwrap_or_default().to_string(),
                files: files_of(&diff)?,
            });
        }
        Ok(out)
    }
}

/// The work item keys in a text (`PROJ-12`, `wi:PROJ-12`): upper case letters and digits, a
/// dash, digits. A key inside a longer word does not count. Sorted, with no duplicate.
pub fn work_item_keys(text: &str) -> Vec<String> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let start = i;
        // The word must start at a boundary and with an upper case letter.
        if !b[i].is_ascii_uppercase() || (i > 0 && b[i - 1].is_ascii_alphanumeric()) {
            i += 1;
            continue;
        }
        while i < b.len() && (b[i].is_ascii_uppercase() || b[i].is_ascii_digit()) {
            i += 1;
        }
        let digits = b
            .get(i + 1..)
            .unwrap_or_default()
            .iter()
            .take_while(|c| c.is_ascii_digit())
            .count();
        let ends = i + 1 + digits >= b.len() || !b[i + 1 + digits].is_ascii_alphanumeric();
        if i < b.len() && b[i] == b'-' && digits > 0 && b[i + 1] != b'0' && ends {
            out.push(text[start..i + 1 + digits].to_string());
            i += 1 + digits;
        }
    }
    out.sort();
    out.dedup();
    out
}

#[cfg(test)]
mod tests {
    use super::work_item_keys;

    #[test]
    fn keys_are_found_at_word_boundaries_only() {
        assert_eq!(
            work_item_keys("feat: PAY-12 and wi:SHIP-7, fix (PAY-12)"),
            ["PAY-12", "SHIP-7"]
        );
        assert!(work_item_keys("xPAY-1 PAY-0 PAY-1x pay-1 PAY-").is_empty());
    }
}
