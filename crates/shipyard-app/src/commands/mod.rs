//! IPC commands, one module for each feature.
//!
//! Each command is `async` and runs its work on a blocking thread, so git and disk never freeze the window.
//! The logic sits in plain functions that take `&AppState`, so tests need no Tauri runtime.

pub mod app;
pub mod connections;
pub mod health;
pub mod legacy;
pub mod prefs;
pub mod projects;
pub mod refs;

use std::fmt::Display;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use crate::connections::Connections;
use shipyard_store::project::Registry;
use shipyard_store::ref_index::RefIndex;
use tauri::{AppHandle, Manager};

pub type Res<T> = Result<T, String>;

pub fn err(e: impl Display) -> String {
    e.to_string()
}

/// Shared state: the app data folder, a write lock and the open ref index.
pub struct AppState {
    pub dir: PathBuf,
    pub connections: Connections,
    lock: Mutex<()>,
    pub(crate) index: Mutex<Option<(String, RefIndex)>>,
}

impl AppState {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            connections: Connections::system(&dir),
            dir,
            lock: Mutex::new(()),
            index: Mutex::new(None),
        }
    }

    /// One writer at a time for the files in the app data folder.
    pub fn guard(&self) -> MutexGuard<'_, ()> {
        self.lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn registry(&self) -> Res<Registry> {
        Registry::load(&self.dir).map_err(err)
    }

    /// Loads the registry, runs `f` and saves it.
    pub fn with_registry<T>(&self, f: impl FnOnce(&mut Registry) -> Res<T>) -> Res<T> {
        let _g = self.guard();
        let mut reg = self.registry()?;
        let out = f(&mut reg)?;
        reg.save().map_err(err)?;
        Ok(out)
    }
}

/// Runs `f` on a blocking thread with the shared state.
pub async fn blocking<T: Send + 'static>(
    app: AppHandle,
    f: impl FnOnce(&AppState) -> Res<T> + Send + 'static,
) -> Res<T> {
    tauri::async_runtime::spawn_blocking(move || f(&app.state::<AppState>()))
        .await
        .map_err(err)?
}
