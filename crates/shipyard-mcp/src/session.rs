//! The per-run bearer tokens (REQ-016, REQ-037).
//!
//! The engine opens a [`Session`] for each step that starts an agent and gives the token to the
//! agent in its MCP config file (`McpEntry` vars, a `0600` file), never in an argument. The token
//! is the only thing that names the run and the step: a tool input cannot name another run.

use std::sync::{Arc, Mutex};

/// Who calls: the run, the step and the tools that the step may call (its `tools` field).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Binding {
    pub run: String,
    pub step: String,
    pub tools: Vec<String>,
}

pub struct Session {
    pub binding: Binding,
    /// Start of the rate window in ms, and the calls in it.
    window: Mutex<(u64, u32)>,
}

impl Session {
    pub fn allows(&self, tool: &str) -> bool {
        self.binding.tools.iter().any(|t| t == tool)
    }

    /// Count one call in a window of one minute. `Err` is the ms until the window ends.
    pub fn take(&self, now_ms: u64, per_minute: u32) -> Result<(), u64> {
        const WINDOW: u64 = 60_000;
        let mut w = self.window.lock().unwrap_or_else(|e| e.into_inner());
        if now_ms.saturating_sub(w.0) >= WINDOW {
            *w = (now_ms, 0);
        }
        if w.1 >= per_minute {
            return Err(WINDOW - now_ms.saturating_sub(w.0));
        }
        w.1 += 1;
        Ok(())
    }
}

#[derive(Default)]
pub struct Sessions {
    list: Mutex<Vec<(String, Arc<Session>)>>,
}

/// Compare without stopping at the first difference.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0, |d, (x, y)| d | (x ^ y)) == 0
}

impl Sessions {
    /// A new token (256 random bits, hex) for `binding`.
    pub fn open(&self, binding: Binding) -> Result<(String, Arc<Session>), getrandom::Error> {
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes)?;
        let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        let session = Arc::new(Session {
            binding,
            window: Mutex::new((0, 0)),
        });
        self.list
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push((token.clone(), session.clone()));
        Ok((token, session))
    }

    pub fn resolve(&self, token: &str) -> Option<Arc<Session>> {
        let list = self.list.lock().unwrap_or_else(|e| e.into_inner());
        let mut found = None;
        for (t, s) in list.iter() {
            if same(t, token) {
                found = Some(s.clone());
            }
        }
        found
    }

    /// End each session of a run. Call it when the run or the step ends.
    pub fn revoke_run(&self, run: &str) -> usize {
        let mut list = self.list.lock().unwrap_or_else(|e| e.into_inner());
        let before = list.len();
        list.retain(|(_, s)| s.binding.run != run);
        before - list.len()
    }
}
