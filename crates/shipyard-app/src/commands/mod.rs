//! IPC commands, one module for each feature.
//!
//! Each command is `async` and runs its work on a blocking thread, so git and disk never freeze the window.
//! The logic sits in plain functions that take `&AppState`, so tests need no Tauri runtime.

pub mod agents;
pub mod app;
pub mod assistant;
pub mod code;
pub mod connections;
pub mod health;
pub mod legacy;
pub mod logins;
pub mod overview;
pub mod prefs;
pub mod projects;
pub mod refs;
pub mod shell;
pub mod sync;

use std::collections::HashMap;
use std::fmt::Display;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use crate::agents::Agents;
use crate::connections::Connections;
use crate::factory::FactoryHost;
use crate::sync::SyncHost;
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
    pub connections: Arc<Connections>,
    pub agents: Agents,
    pub sync: SyncHost,
    pub factory: Arc<FactoryHost>,
    pub work: crate::work::Session,
    pub specs: crate::specs::Session,
    lock: Mutex<()>,
    /// The remote watch notice of each project id, until the person syncs (spec `code`, REQ-017).
    notices: Mutex<HashMap<String, code::WatchNotice>>,
    /// The ref index of each project that was opened, by project id. The factory reads the index
    /// of the project of a run (`read_ref`), never the one of another project.
    index: Mutex<HashMap<String, Arc<Mutex<RefIndex>>>>,
}

impl AppState {
    /// The ref index of a project: opened once, then shared by the views and the factory.
    pub(crate) fn index_of(&self, id: &str) -> Res<Arc<Mutex<RefIndex>>> {
        let mut map = self.index.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(index) = map.get(id) {
            return Ok(index.clone());
        }
        let db = self.dir.join("refs").join(format!("{id}.sqlite"));
        let index = Arc::new(Mutex::new(RefIndex::open(&db).map_err(err)?));
        map.insert(id.into(), index.clone());
        Ok(index)
    }

    pub fn new(dir: PathBuf) -> Self {
        let connections = Arc::new(Connections::system(&dir));
        Self::build(dir, connections, true, None)
    }

    /// A state over given connections, with no background sync thread and fake runners. A test
    /// ticks and pumps by hand.
    #[cfg(test)]
    pub fn with_connections(dir: PathBuf, connections: Arc<Connections>) -> Self {
        Self::with_agents(
            dir,
            connections,
            Arc::new(shipyard_engine::fake::FakeAgents::default()),
        )
    }

    /// `with_connections` with the runner port that the test gives, to read what it started.
    #[cfg(test)]
    pub fn with_agents(
        dir: PathBuf,
        connections: Arc<Connections>,
        agents: Arc<dyn shipyard_engine::ports::Agents>,
    ) -> Self {
        Self::build(dir, connections, false, Some(agents))
    }

    fn build(
        dir: PathBuf,
        connections: Arc<Connections>,
        background: bool,
        runners: Option<Arc<dyn shipyard_engine::ports::Agents>>,
    ) -> Self {
        let agents = Agents::system(&dir);
        let factory = Arc::new(FactoryHost::new(&dir, agents.tier_map(), runners));
        Self {
            sync: SyncHost::new(&dir, connections.clone(), background, factory.clone()),
            factory,
            connections,
            agents,
            work: Default::default(),
            specs: Default::default(),
            dir,
            lock: Mutex::new(()),
            notices: Mutex::new(HashMap::new()),
            index: Mutex::new(HashMap::new()),
        }
    }

    /// One writer at a time for the files in the app data folder.
    pub fn guard(&self) -> MutexGuard<'_, ()> {
        self.lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn notices(&self) -> MutexGuard<'_, HashMap<String, code::WatchNotice>> {
        self.notices.lock().unwrap_or_else(|e| e.into_inner())
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
