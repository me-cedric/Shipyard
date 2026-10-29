//! Assistant threads in the app data folder (spec `assistant`, REQ-002, REQ-003). One JSON file
//! for each thread: `<data>/assistant/<project>/threads/<id>.json`. Nothing goes to the repository.
//! shortcut: one file per thread is read whole, a thread of thousands of messages wants SQLite.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use shipyard_core::assistant::{Context, Thread, ThreadSettings, ThreadSummary, Usage};

use crate::Result;
use crate::project::write_atomic;

static COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn now() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as u32)
}

/// An id becomes a file name: plain characters only.
fn plain(id: &str) -> Result<&str> {
    let ok = !id.is_empty()
        && !id.starts_with(['-', '.'])
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if ok {
        Ok(id)
    } else {
        Err(format!("not a plain id: {id}").into())
    }
}

pub struct Threads {
    root: PathBuf,
}

impl Threads {
    pub fn new(data: &Path) -> Self {
        Self {
            root: data.join("assistant"),
        }
    }

    fn dir(&self, project: &str) -> Result<PathBuf> {
        Ok(self.root.join(plain(project)?).join("threads"))
    }

    fn file(&self, project: &str, id: &str) -> Result<PathBuf> {
        Ok(self.dir(project)?.join(format!("{}.json", plain(id)?)))
    }

    /// The threads of one project, newest first. A file that does not read is skipped.
    pub fn list(&self, project: &str) -> Result<Vec<ThreadSummary>> {
        let Ok(rd) = std::fs::read_dir(self.dir(project)?) else {
            return Ok(Vec::new());
        };
        let mut out: Vec<ThreadSummary> = rd
            .filter_map(|e| std::fs::read(e.ok()?.path()).ok())
            .filter_map(|b| serde_json::from_slice::<Thread>(&b).ok())
            .map(|t| t.summary())
            .collect();
        out.sort_by(|a, b| b.updated.cmp(&a.updated).then(b.id.cmp(&a.id)));
        Ok(out)
    }

    pub fn create(&self, project: &str, title: &str, settings: ThreadSettings) -> Result<Thread> {
        let at = now();
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let id = format!("th-{nanos:x}-{}", COUNTER.fetch_add(1, Ordering::Relaxed));
        let t = Thread {
            id,
            project: project.into(),
            title: title.into(),
            settings,
            context: Context::default(),
            draft: String::new(),
            session: None,
            granted: Vec::new(),
            messages: Vec::new(),
            usage: Usage::default(),
            worktree: None,
            created: at,
            updated: at,
        };
        self.save(&t)?;
        Ok(t)
    }

    pub fn get(&self, project: &str, id: &str) -> Result<Thread> {
        let b = std::fs::read(self.file(project, id)?)
            .map_err(|_| format!("no thread {id} in project {project}"))?;
        Ok(serde_json::from_slice(&b)?)
    }

    /// Write the whole thread: the transcript, the draft, the session and the usage.
    pub fn save(&self, t: &Thread) -> Result<()> {
        write_atomic(
            &self.file(&t.project, &t.id)?,
            &serde_json::to_vec_pretty(t)?,
        )
    }

    pub fn rename(&self, project: &str, id: &str, title: &str) -> Result<Thread> {
        let mut t = self.get(project, id)?;
        t.title = title.trim().into();
        self.save(&t)?;
        Ok(t)
    }

    pub fn delete(&self, project: &str, id: &str) -> Result<()> {
        Ok(std::fs::remove_file(self.file(project, id)?)?)
    }
}
