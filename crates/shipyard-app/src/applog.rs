//! The app log that Settings / Health shows. A capped
//! ring buffer that any thread writes and the view reads. A line that holds a secret shape is
//! replaced, so the console and its copy never show a value.
//!
//! shortcut: memory only, and a line is dropped whole when it looks like a secret. Keep a file and
//! redact only the value when a person needs the log after a restart.

use std::collections::VecDeque;
use std::sync::Mutex;

use serde::Serialize;
use specta::Type;

use crate::commands::{Api, blocking};

const CAP: usize = 500;
const LEVELS: [&str; 3] = ["info", "warn", "error"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct LogLine {
    /// `HH:MM:SS` of the day, UTC.
    pub at: String,
    /// `info`, `warn` or `error`.
    pub level: String,
    pub message: String,
}

static BUFFER: Mutex<VecDeque<LogLine>> = Mutex::new(VecDeque::new());

fn clock() -> String {
    let s = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    format!(
        "{:02}:{:02}:{:02}",
        s % 86_400 / 3600,
        s % 3600 / 60,
        s % 60
    )
}

/// Add a line. An unknown level counts as `info`.
pub fn record(level: &str, message: &str) {
    let level = if LEVELS.contains(&level) {
        level
    } else {
        "info"
    };
    let message = if crate::code::scan_text("log", message).is_empty() {
        message.chars().take(2000).collect()
    } else {
        "[line hidden: it held a secret]".to_string()
    };
    let mut b = BUFFER.lock().unwrap_or_else(|e| e.into_inner());
    b.push_back(LogLine {
        at: clock(),
        level: level.into(),
        message,
    });
    while b.len() > CAP {
        b.pop_front();
    }
}

pub fn lines() -> Vec<LogLine> {
    BUFFER
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .cloned()
        .collect()
}

#[tauri::command]
#[specta::specta]
pub async fn debug_log(app: tauri::AppHandle) -> Api<Vec<LogLine>> {
    blocking(app, |_| Ok(lines())).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_log_is_capped_and_hides_a_secret() {
        for i in 0..CAP + 10 {
            record("info", &format!("line {i}"));
        }
        record("bogus", "ghp_abcdefghijklmnopqrstuvwxyz0123456789 leaked");
        let all = lines();
        assert_eq!(all.len(), CAP);
        let last = all.last().unwrap();
        assert_eq!(last.level, "info");
        assert!(!last.message.contains("ghp_") && last.message.contains("hidden"));
        assert!(all.iter().all(|l| !l.message.contains("line 0")));
    }
}
