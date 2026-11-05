//! Watches the files of the active project. Agents, editors and git write them; the views read
//! them again on one `files-changed` event with the changed paths (relative to the project).
//!
//! shortcut: a poll of mtime and size, not OS events, so the tree needs no new dependency.
//! Upgrade to `notify` when a project is so large that one scan per second costs too much.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, channel};
use std::time::{Duration, Instant};

use notify::{EventKind, RecursiveMode, Watcher as _};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::AppState;

pub const FILES_EVENT: &str = "files-changed";
/// A burst of writes makes one event: it goes out when the files were quiet for this long, or at
/// the latest `MAX_WAIT` after the first change (a file that changes all the time must not block
/// the events).
const DEBOUNCE: Duration = Duration::from_millis(300);
const MAX_WAIT: Duration = Duration::from_secs(2);
/// How often the loop reads the events of the system. It scans no tree.
const POLL: Duration = Duration::from_millis(100);
/// Idle: no project is open, so the loop only waits.
const IDLE: Duration = Duration::from_secs(2);
/// An event names at most this many paths. A bigger change (a branch switch) sets `truncated`:
/// the window then reads everything again.
const MAX_PATHS: usize = 500;
const SKIP_DIRS: [&str; 4] = [".git", "node_modules", "target", ".DS_Store"];

/// What the window gets in the `files-changed` event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Batch {
    pub paths: Vec<String>,
    /// The paths are not all: read every view again.
    pub truncated: bool,
}

/// Matches `*` as any run of characters. Other characters match as they are.
fn glob(pat: &[u8], text: &[u8]) -> bool {
    match pat.split_first() {
        None => text.is_empty(),
        Some((b'*', rest)) => (0..=text.len()).any(|i| glob(rest, &text[i..])),
        Some((c, rest)) => text.first() == Some(c) && glob(rest, &text[1..]),
    }
}

/// The rules of the `.gitignore` at the root of the project.
/// shortcut: no `!` negation, no `**`, no nested `.gitignore` (the `ignore` crate is not in the
/// tree); upgrade when it is added.
#[derive(Default)]
pub struct Ignore(Vec<(String, bool)>);

impl Ignore {
    pub fn parse(text: &str) -> Self {
        let rules = text
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with('!'))
            .map(|l| {
                (
                    l.trim_matches('/').to_string(),
                    l.trim_end_matches('/').contains('/'),
                )
            })
            .collect();
        Self(rules)
    }

    /// `rel` uses `/`. The path is skipped when it or one of its folders is.
    pub fn skips(&self, rel: &str) -> bool {
        rel.match_indices('/')
            .map(|(i, _)| &rel[..i])
            .chain([rel])
            .any(|p| self.skips_one(p))
    }

    /// A rule with a `/` inside matches from the root; a bare name matches at any depth.
    fn skips_one(&self, rel: &str) -> bool {
        let name = rel.rsplit('/').next().unwrap_or(rel);
        SKIP_DIRS.contains(&name)
            || self.0.iter().any(|(pat, anchored)| {
                if *anchored {
                    glob(pat.as_bytes(), rel.as_bytes())
                } else {
                    glob(pat.as_bytes(), name.as_bytes())
                }
            })
    }
}

/// One watcher for the active project. `step` runs on each poll.
#[derive(Default)]
pub struct Watcher {
    root: Option<PathBuf>,
    /// The root with its links resolved: the system reports paths in that form.
    real: PathBuf,
    ignore: Ignore,
    /// Keeps the watch alive. A paths of `None` is an error or an overflow: events were lost.
    _watch: Option<notify::RecommendedWatcher>,
    rx: Option<Receiver<Option<PathBuf>>>,
    pending: BTreeSet<String>,
    truncated: bool,
    first: Option<Instant>,
    last: Option<Instant>,
}

impl Watcher {
    fn start(root: &Path) -> Self {
        let real = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
        let (tx, rx) = channel();
        let watch =
            notify::recommended_watcher(move |res: notify::Result<notify::Event>| match res {
                Ok(e) if matches!(e.kind, EventKind::Access(_)) => {}
                Ok(e) => e.paths.into_iter().for_each(|p| drop(tx.send(Some(p)))),
                Err(_) => drop(tx.send(None)),
            })
            .and_then(|mut w| w.watch(&real, RecursiveMode::Recursive).map(|()| w))
            .ok();
        Self {
            root: Some(root.to_path_buf()),
            ignore: read_ignore(&real),
            real,
            _watch: watch,
            rx: Some(rx),
            ..Self::default()
        }
    }

    /// Takes the paths of the system. A path that the rules skip is dropped; more than `MAX_PATHS`
    /// sets `truncated` and keeps only the first ones. `None` is a lost event: truncated too.
    fn feed(&mut self, got: impl IntoIterator<Item = Option<PathBuf>>, now: Instant) {
        for path in got {
            self.first.get_or_insert(now);
            self.last = Some(now);
            let Some(path) = path else {
                self.truncated = true;
                continue;
            };
            let Ok(rel) = path.strip_prefix(&self.real) else {
                continue;
            };
            let rel = rel.to_string_lossy().replace('\\', "/");
            if rel == ".gitignore" {
                self.ignore = read_ignore(&self.real);
            }
            if rel.is_empty() || self.ignore.skips(&rel) {
                continue;
            }
            if self.pending.len() >= MAX_PATHS {
                self.truncated = true;
            } else {
                self.pending.insert(rel);
            }
        }
        if self.pending.is_empty() && !self.truncated {
            (self.first, self.last) = (None, None);
        }
    }

    /// The batch, once the files were quiet for `DEBOUNCE` or `MAX_WAIT` passed since the first change.
    fn due(&mut self, now: Instant) -> Option<Batch> {
        let (first, last) = (self.first?, self.last?);
        if now.duration_since(last) < DEBOUNCE && now.duration_since(first) < MAX_WAIT {
            return None;
        }
        (self.first, self.last) = (None, None);
        Some(Batch {
            paths: std::mem::take(&mut self.pending).into_iter().collect(),
            truncated: std::mem::take(&mut self.truncated),
        })
    }

    /// `root` is the active project, or `None`. A new root starts a new watch and makes no event.
    pub fn step(&mut self, root: Option<&Path>, now: Instant) -> Option<Batch> {
        if self.root.as_deref() != root {
            *self = root.map(Self::start).unwrap_or_default();
            return None;
        }
        let got: Vec<_> = self.rx.as_ref()?.try_iter().collect();
        self.feed(got, now);
        self.due(now)
    }
}

fn read_ignore(root: &Path) -> Ignore {
    Ignore::parse(&std::fs::read_to_string(root.join(".gitignore")).unwrap_or_default())
}

/// Starts the watch thread. With no active project it only waits.
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut w = Watcher::default();
        loop {
            let root = app
                .state::<AppState>()
                .registry()
                .ok()
                .and_then(|r| r.active().map(|e| PathBuf::from(&e.path)));
            if let Some(batch) = w.step(root.as_deref(), Instant::now()) {
                let _ = app.emit(FILES_EVENT, batch);
            }
            std::thread::sleep(if root.is_some() { POLL } else { IDLE });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    #[test]
    fn ignores_git_build_folders_and_gitignore_paths() {
        let i = Ignore::parse("# note\ndist/\n*.log\n/docs/tmp\n");
        for p in [
            ".git",
            "a/.git",
            "a/node_modules",
            "target",
            "dist",
            "x/dist",
            "a/b.log",
            "docs/tmp",
        ] {
            assert!(i.skips(p), "{p}");
        }
        for p in ["docs/a.md", "src/tmp", "logs"] {
            assert!(!i.skips(p), "{p}");
        }
    }

    fn batch(w: &mut Watcher, got: &[&str], now: Instant) -> Option<Batch> {
        let real = w.real.clone();
        w.feed(got.iter().map(|p| Some(real.join(p))), now);
        w.due(now)
    }

    fn started() -> (tempfile::TempDir, Watcher) {
        let dir = tempfile::tempdir().unwrap();
        // No system watch: the tests feed the paths themselves.
        let w = Watcher {
            real: dir.path().to_path_buf(),
            ignore: Ignore::parse("out\n"),
            ..Watcher::default()
        };
        (dir, w)
    }

    #[test]
    fn a_path_under_an_ignored_folder_is_skipped() {
        let i = Ignore::parse("dist/\n");
        assert!(i.skips("dist/a/b.js") && i.skips("x/node_modules/y") && !i.skips("src/b.js"));
    }

    #[test]
    fn writes_in_a_row_make_one_event_after_the_quiet_time() {
        let (_d, mut w) = started();
        let t = Instant::now();
        assert!(batch(&mut w, &["docs/a.md", "out/b.md", "docs/c.md"], t).is_none());
        assert!(batch(&mut w, &["docs/c.md"], t + Duration::from_millis(200)).is_none());
        let got = batch(&mut w, &[], t + Duration::from_millis(600)).unwrap();
        assert_eq!(
            got,
            Batch {
                paths: vec!["docs/a.md".into(), "docs/c.md".into()],
                truncated: false
            }
        );
        assert!(batch(&mut w, &[], t + Duration::from_millis(1200)).is_none());
    }

    #[test]
    fn a_file_that_changes_all_the_time_does_not_block_the_event() {
        let (_d, mut w) = started();
        let t = Instant::now();
        for i in 0..30u64 {
            let at = t + Duration::from_millis(i * 100);
            if let Some(b) = batch(&mut w, &["busy.log2"], at) {
                assert_eq!(b.paths, ["busy.log2"]);
                assert!(at.duration_since(t) <= MAX_WAIT + POLL);
                return;
            }
        }
        panic!("no event in 3 s of steady changes");
    }

    #[test]
    fn more_than_the_cap_sets_truncated_and_a_lost_event_does_too() {
        let (_d, mut w) = started();
        let t = Instant::now();
        let names: Vec<String> = (0..MAX_PATHS + 5).map(|i| format!("f{i}")).collect();
        let refs: Vec<&str> = names.iter().map(String::as_str).collect();
        batch(&mut w, &refs, t);
        let got = batch(&mut w, &[], t + Duration::from_secs(1)).unwrap();
        assert!(got.truncated && got.paths.len() == MAX_PATHS);
        w.feed([None], t + Duration::from_secs(2));
        let got = w.due(t + Duration::from_secs(4)).unwrap();
        assert!(got.truncated && got.paths.is_empty());
    }

    #[test]
    fn the_system_reports_a_real_write_and_a_switch_of_project_makes_no_event() {
        let (a, b) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let mut w = Watcher::default();
        assert!(w.step(Some(a.path()), Instant::now()).is_none());
        assert!(w.step(Some(b.path()), Instant::now()).is_none());
        write(b.path(), "z.md", "1");
        let end = Instant::now() + Duration::from_secs(10);
        let mut got = None;
        while got.is_none() && Instant::now() < end {
            std::thread::sleep(POLL);
            got = w.step(Some(b.path()), Instant::now());
        }
        assert!(got.unwrap().paths.contains(&"z.md".to_string()));
        assert!(w.step(None, Instant::now()).is_none());
        assert!(w.root.is_none() && w.rx.is_none());
    }
}
