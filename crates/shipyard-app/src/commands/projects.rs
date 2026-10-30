//! Projects: open, create, clone, switch, the project file, overrides and the last view.

use std::path::{Path, PathBuf};

use serde::Serialize;
use shipyard_core::pickup::Automation;
use shipyard_core::project::{ProjectFile, validate};
use shipyard_git::Repo;
use shipyard_git::project::{WorkState, clone_repo, init, is_repo, state};
use shipyard_store::automation_file::{AutomationRead, read_automation, write_automation};
use shipyard_store::docs_layout::layout_file;
use shipyard_store::project::{Entry, FileRead, Overrides, read_project_file, write_project_file};
use specta::Type;
use tauri::AppHandle;

use super::{Api, AppState, Res, blocking, err};

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub id: String,
    pub name: String,
    pub key: String,
    pub path: String,
    pub state: WorkState,
    pub active: bool,
    pub last_used: u32,
    pub last_view: Option<String>,
    pub overrides: Overrides,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum OpenStatus {
    Opened,
    NotRepository,
    FolderNotEmpty,
    Invalid,
    Failed,
}

#[derive(Debug, Serialize, Type)]
pub struct ProjectOutcome {
    pub status: OpenStatus,
    pub project: Option<ProjectEntry>,
    pub message: Option<String>,
}

fn outcome(status: OpenStatus, message: impl Into<String>) -> ProjectOutcome {
    ProjectOutcome {
        status,
        project: None,
        message: Some(message.into()),
    }
}

fn to_entry(e: &Entry, active: bool) -> ProjectEntry {
    ProjectEntry {
        id: e.id.clone(),
        name: e.name.clone(),
        key: e.key.clone(),
        path: e.path.clone(),
        state: state(Path::new(&e.path)),
        active,
        last_used: e.last_used as u32,
        last_view: e.last_view.clone(),
        overrides: e.overrides.clone(),
    }
}

pub fn list(s: &AppState) -> Res<Vec<ProjectEntry>> {
    let reg = s.registry()?;
    let active = reg.active().map(|e| e.id.clone());
    Ok(reg
        .projects()
        .iter()
        .map(|e| to_entry(e, active.as_deref() == Some(&e.id)))
        .collect())
}

pub fn active(s: &AppState) -> Res<Option<ProjectEntry>> {
    let reg = s.registry()?;
    Ok(reg.active().map(|e| to_entry(e, true)))
}

fn folder_name(root: &Path) -> String {
    root.file_name()
        .map_or_else(|| "project".into(), |n| n.to_string_lossy().into_owned())
}

/// A key from a name: upper case letters and digits, at most six, starting with a letter.
pub fn derive_key(name: &str) -> String {
    let mut key: String = name
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.to_ascii_uppercase())
        .take(6)
        .collect();
    if !key.starts_with(|c: char| c.is_ascii_uppercase()) {
        key = format!("P{key}");
        key.truncate(6);
    }
    key
}

/// Registers the project and makes it active.
fn activate(s: &AppState, root: &Path, file: &ProjectFile) -> Res<ProjectOutcome> {
    let path = root.to_str().ok_or("invalid folder")?.to_string();
    let project = s.with_registry(|reg| {
        let id = reg.register(&path, file).id.clone();
        reg.activate(&id);
        let e = reg.get(&id).ok_or("unknown project")?;
        Ok(to_entry(e, true))
    })?;
    super::sync::refresh(s);
    Ok(ProjectOutcome {
        status: OpenStatus::Opened,
        project: Some(project),
        message: None,
    })
}

/// Opens a folder that holds a repository. It never runs `git init`. Without a project file it
/// writes one: the existing layout that it finds, or the defaults (Q-102).
pub fn open(s: &AppState, path: &str) -> Res<ProjectOutcome> {
    let Ok(root) = std::fs::canonicalize(path) else {
        return Ok(outcome(OpenStatus::NotRepository, path));
    };
    if !is_repo(&root) {
        return Ok(outcome(OpenStatus::NotRepository, path));
    }
    let name = folder_name(&root);
    let fallback = || layout_file(&root, &name, &derive_key(&name));
    let file = match read_project_file(&root).map_err(err)? {
        FileRead::Valid(f) => f,
        FileRead::Missing => {
            let f = fallback();
            write_project_file(&root, &f).map_err(err)?;
            f
        }
        // The project opens. Settings / Health shows the line and the value.
        FileRead::Invalid(_) => ProjectFile::new(&name, &derive_key(&name)),
    };
    activate(s, &root, &file)
}

/// Creates a repository and a project file in an empty folder.
pub fn create(s: &AppState, path: &str, name: &str, key: &str) -> Res<ProjectOutcome> {
    let file = ProjectFile::new(name.trim(), key.trim());
    if let Some(i) = validate(&file).first() {
        return Ok(outcome(
            OpenStatus::Invalid,
            format!("{}: {}", i.field, i.value),
        ));
    }
    let root = PathBuf::from(path);
    if !root.is_absolute() {
        return Ok(outcome(OpenStatus::Invalid, path));
    }
    let taken = root.exists()
        && (!root.is_dir() || std::fs::read_dir(&root).map_err(err)?.next().is_some());
    if taken {
        return Ok(outcome(OpenStatus::FolderNotEmpty, path));
    }
    if let Err(e) = init(&root)
        .and_then(|()| write_project_file(&root, &file).map_err(err))
        .and_then(|()| seed_automation(&root))
    {
        return Ok(outcome(OpenStatus::Failed, e));
    }
    let out = activate(s, &std::fs::canonicalize(&root).map_err(err)?, &file)?;
    // The only tracker connection of the machine becomes the tracker of the new project.
    let _ = super::setup::auto_link(s);
    Ok(out)
}

/// A new project gets the default pickup rules, so the pickup label shows in Settings.
fn seed_automation(root: &Path) -> Result<(), String> {
    if matches!(read_automation(root), Ok(AutomationRead::Missing)) {
        write_automation(root, &Automation::default()).map_err(err)?;
    }
    Ok(())
}

/// Turns a plain folder into a project: `git init` and a project file. The first commit holds only
/// the files of Shipyard, never a file of the person, and it needs the click (`commit`).
pub fn make(s: &AppState, path: &str, commit: bool) -> Res<ProjectOutcome> {
    let Ok(root) = std::fs::canonicalize(path) else {
        return Ok(outcome(OpenStatus::Invalid, path));
    };
    if !root.is_dir() {
        return Ok(outcome(OpenStatus::Invalid, path));
    }
    if is_repo(&root) {
        return open(s, path);
    }
    let name = folder_name(&root);
    let file = match read_project_file(&root).map_err(err)? {
        FileRead::Valid(f) => f,
        _ => layout_file(&root, &name, &derive_key(&name)),
    };
    if let Err(e) = init(&root)
        .and_then(|()| write_project_file(&root, &file).map_err(err))
        .and_then(|()| seed_automation(&root))
    {
        return Ok(outcome(OpenStatus::Failed, e));
    }
    if commit {
        let repo = Repo::open(&root).map_err(err)?;
        repo.stage(&[".gitignore".into(), ".shipyard".into()])
            .map_err(err)?;
        repo.commit("chore(shipyard): start the project", "")
            .map_err(err)?;
    }
    let out = activate(s, &root, &file)?;
    let _ = super::setup::auto_link(s);
    Ok(out)
}

/// Clones a repository into a folder that the person picked, then opens it.
pub fn clone(s: &AppState, url: &str, path: &str) -> Res<ProjectOutcome> {
    if !Path::new(path).is_absolute() {
        return Ok(outcome(OpenStatus::Invalid, path));
    }
    let auth = s.connections.git_auth(url.trim())?;
    match clone_repo(url.trim(), Path::new(path), &auth) {
        Ok(()) => open(s, path),
        Err(e) => Ok(outcome(OpenStatus::Failed, e)),
    }
}

pub fn switch(s: &AppState, id: &str) -> Res<ProjectEntry> {
    let entry = s.with_registry(|reg| {
        if !reg.activate(id) {
            return Err(format!("unknown project: {id}"));
        }
        Ok(to_entry(reg.get(id).ok_or("unknown project")?, true))
    })?;
    super::sync::refresh(s);
    Ok(entry)
}

/// Stops the sync engine of the active project and leaves no project active. The registry keeps
/// every entry.
pub fn close(s: &AppState) -> Res<()> {
    if let Some(a) = s.registry()?.active() {
        s.sync.apply(&a.id, None)?;
    }
    s.with_registry(|reg| {
        reg.close();
        Ok(())
    })
}

/// Removes the entry from the registry. It never deletes a file. The active project closes first.
pub fn remove(s: &AppState, id: &str) -> Res<()> {
    if s.registry()?.active().is_some_and(|a| a.id == id) {
        close(s)?;
    }
    s.with_registry(|reg| {
        if reg.remove(id) {
            Ok(())
        } else {
            Err(format!("unknown project: {id}"))
        }
    })
}

/// The last view per project (`shell` REQ-015). A view is an app path.
pub fn set_view(s: &AppState, id: &str, view: &str) -> Res<()> {
    if !view.starts_with('/') || view.len() > 200 {
        return Err("invalid view".into());
    }
    s.with_registry(|reg| {
        reg.set_view(id, view);
        Ok(())
    })
}

#[derive(Debug, Serialize, Type)]
pub struct ProjectSettings {
    pub file: Option<ProjectFile>,
    pub overrides: Overrides,
}

pub fn settings(s: &AppState) -> Res<Option<ProjectSettings>> {
    let Some(e) = s.registry()?.active().cloned() else {
        return Ok(None);
    };
    let file = match read_project_file(Path::new(&e.path)).map_err(err)? {
        FileRead::Valid(f) => Some(f),
        _ => None,
    };
    Ok(Some(ProjectSettings {
        file,
        overrides: e.overrides,
    }))
}

/// Writes paths, default workflow and gates to the project file. Nothing personal goes there.
pub fn save_file(s: &AppState, file: ProjectFile) -> Res<()> {
    crate::work::refuse_read_only(s)?;
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    write_project_file(Path::new(&e.path), &file).map_err(err)?;
    s.with_registry(|reg| {
        reg.register(&e.path, &file);
        Ok(())
    })?;
    // The file can name another tracker or forge connection.
    super::sync::refresh(s);
    Ok(())
}

pub fn save_overrides(s: &AppState, overrides: Overrides) -> Res<()> {
    s.with_registry(|reg| {
        let id = reg.active().ok_or("no active project")?.id.clone();
        reg.set_overrides(&id, overrides);
        Ok(())
    })
}

#[tauri::command]
#[specta::specta]
pub async fn projects_list(app: AppHandle) -> Api<Vec<ProjectEntry>> {
    blocking(app, list).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_active(app: AppHandle) -> Api<Option<ProjectEntry>> {
    blocking(app, active).await
}

#[tauri::command]
#[specta::specta]
// `init` stays for the IPC contract. The file is written without a confirm.
#[allow(unused_variables)]
pub async fn projects_open(app: AppHandle, path: String, init: bool) -> Api<ProjectOutcome> {
    blocking(app, move |s| open(s, &path)).await
}

/// Turns a plain folder into a project. `commit` is the click for the first commit.
#[tauri::command]
#[specta::specta]
pub async fn projects_init(app: AppHandle, path: String, commit: bool) -> Api<ProjectOutcome> {
    blocking(app, move |s| make(s, &path, commit)).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_create(
    app: AppHandle,
    path: String,
    name: String,
    key: String,
) -> Api<ProjectOutcome> {
    blocking(app, move |s| create(s, &path, &name, &key)).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_clone(app: AppHandle, url: String, path: String) -> Api<ProjectOutcome> {
    blocking(app, move |s| clone(s, &url, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_switch(app: AppHandle, id: String) -> Api<ProjectEntry> {
    blocking(app, move |s| switch(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_close(app: AppHandle) -> Api<()> {
    blocking(app, close).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_remove(app: AppHandle, id: String) -> Api<()> {
    blocking(app, move |s| remove(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_set_view(app: AppHandle, id: String, view: String) -> Api<()> {
    blocking(app, move |s| set_view(s, &id, &view)).await
}

#[tauri::command]
#[specta::specta]
pub async fn project_settings(app: AppHandle) -> Api<Option<ProjectSettings>> {
    blocking(app, settings).await
}

#[tauri::command]
#[specta::specta]
pub async fn project_file_save(app: AppHandle, file: ProjectFile) -> Api<()> {
    blocking(app, move |s| save_file(s, file)).await
}

#[tauri::command]
#[specta::specta]
pub async fn project_overrides_save(app: AppHandle, overrides: Overrides) -> Api<()> {
    blocking(app, move |s| save_overrides(s, overrides)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_store::project::Accent;

    fn state_in(dir: &Path) -> AppState {
        AppState::new(dir.join("data"))
    }

    fn repo(dir: &Path, name: &str, with_file: bool) -> String {
        let root = dir.join(name);
        init(&root).unwrap();
        if with_file {
            write_project_file(&root, &ProjectFile::new(name, &derive_key(name))).unwrap();
        }
        root.to_str().unwrap().into()
    }

    #[test]
    fn keys_start_with_a_letter_and_fit_the_rule() {
        assert_eq!(derive_key("shipyard"), "SHIPYA");
        assert_eq!(derive_key("42 things"), "P42THI");
        assert_eq!(derive_key("---"), "P");
        assert!(validate(&ProjectFile::new("x", &derive_key("my-app"))).is_empty());
    }

    #[test]
    fn a_repository_with_a_project_file_opens_and_registers() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "alpha", true);
        let o = open(&s, &p).unwrap();
        assert_eq!(o.status, OpenStatus::Opened);
        let e = o.project.unwrap();
        assert_eq!(
            (e.id.as_str(), e.state, e.active),
            ("alpha", WorkState::Changed, true)
        );
        assert_eq!(list(&s).unwrap().len(), 1);
        assert_eq!(active(&s).unwrap().unwrap().id, "alpha");
    }

    #[test]
    fn a_repository_without_a_project_file_gets_the_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "beta", false);
        assert_eq!(open(&s, &p).unwrap().status, OpenStatus::Opened);
        let f = read_project_file(Path::new(&p)).unwrap();
        let FileRead::Valid(f) = f else {
            panic!("no file")
        };
        assert_eq!(f.paths.len(), 3);
        assert_eq!(f.path("models"), "docs/models");
    }

    #[test]
    fn a_folder_with_the_old_layout_gets_its_paths() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "legacy", false);
        let root = Path::new(&p);
        for (rel, text) in [
            ("docs/drawings/a.mmd", "graph TD"),
            ("docs/diagrams/ctx/m.c4", "model {}"),
            ("docs/network/flows.json", "{\"flows\":[]}"),
        ] {
            std::fs::create_dir_all(root.join(rel).parent().unwrap()).unwrap();
            std::fs::write(root.join(rel), text).unwrap();
        }
        assert_eq!(open(&s, &p).unwrap().status, OpenStatus::Opened);
        let FileRead::Valid(f) = read_project_file(root).unwrap() else {
            panic!("no file")
        };
        assert_eq!(f.path("diagrams"), "docs/drawings");
        assert_eq!(f.path("models"), "docs/diagrams");
        assert_eq!(f.path("flows"), "docs/network/flows.json");
        // A project file that exists is never changed.
        std::fs::write(root.join(".shipyard/project.yaml"), "name: L\nkey: LGC\n").unwrap();
        open(&s, &p).unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join(".shipyard/project.yaml")).unwrap(),
            "name: L\nkey: LGC\n"
        );
    }

    #[test]
    fn a_folder_without_a_repository_opens_nothing_and_stays_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let plain = dir.path().join("plain");
        std::fs::create_dir(&plain).unwrap();
        let o = open(&s, plain.to_str().unwrap()).unwrap();
        assert_eq!(o.status, OpenStatus::NotRepository);
        assert!(!plain.join(".git").exists(), "no git init");
        assert_eq!(std::fs::read_dir(&plain).unwrap().count(), 0);
        assert_eq!(
            open(&s, "/does/not/exist").unwrap().status,
            OpenStatus::NotRepository
        );
    }

    #[test]
    fn a_plain_folder_becomes_a_project_and_the_commit_waits_for_the_click() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let plain = dir.path().join("plain");
        std::fs::create_dir(&plain).unwrap();
        std::fs::write(plain.join("notes.txt"), "mine").unwrap();
        let p = plain.to_str().unwrap();
        assert_eq!(make(&s, p, false).unwrap().status, OpenStatus::Opened);
        let repo = Repo::open(&plain).unwrap();
        assert!(repo.status().unwrap().head.is_none(), "no commit yet");
        assert!(plain.join(".shipyard/project.yaml").exists());
        assert!(plain.join(".shipyard/automation.yaml").exists());
        // The click commits the files of Shipyard and leaves the file of the person alone.
        let other = dir.path().join("other");
        std::fs::create_dir(&other).unwrap();
        std::fs::write(other.join("notes.txt"), "mine").unwrap();
        assert_eq!(
            make(&s, other.to_str().unwrap(), true).unwrap().status,
            OpenStatus::Opened
        );
        let st = Repo::open(&other).unwrap().status().unwrap();
        assert!(st.head.is_some());
        assert_eq!(st.untracked.len(), 1);
        assert_eq!(st.untracked[0].path, "notes.txt");
    }

    #[test]
    fn an_invalid_project_file_still_opens() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "gamma", false);
        std::fs::create_dir_all(Path::new(&p).join(".shipyard")).unwrap();
        std::fs::write(
            Path::new(&p).join(".shipyard/project.yaml"),
            "name: G\nkey: bad\n",
        )
        .unwrap();
        assert_eq!(open(&s, &p).unwrap().status, OpenStatus::Opened);
    }

    #[test]
    fn create_needs_an_empty_folder_and_a_valid_key() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let target = dir.path().join("new");
        let t = target.to_str().unwrap();
        assert_eq!(
            create(&s, t, "New", "bad").unwrap().status,
            OpenStatus::Invalid
        );
        assert_eq!(
            create(&s, "rel/path", "New", "NEW").unwrap().status,
            OpenStatus::Invalid
        );
        let o = create(&s, t, "New", "NEW").unwrap();
        assert_eq!(o.status, OpenStatus::Opened);
        assert!(target.join(".shipyard/project.yaml").exists());
        assert!(
            std::fs::read_to_string(target.join(".gitignore"))
                .unwrap()
                .contains(".DS_Store")
        );
        let full = dir.path().join("full");
        std::fs::create_dir(&full).unwrap();
        std::fs::write(full.join("f"), "x").unwrap();
        assert_eq!(
            create(&s, full.to_str().unwrap(), "F", "F").unwrap().status,
            OpenStatus::FolderNotEmpty
        );
        assert!(full.join("f").exists());
    }

    #[test]
    fn an_opened_repository_keeps_its_ignore_file() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "keep", true);
        std::fs::write(Path::new(&p).join(".gitignore"), "mine\n").unwrap();
        open(&s, &p).unwrap();
        assert_eq!(
            std::fs::read_to_string(Path::new(&p).join(".gitignore")).unwrap(),
            "mine\n"
        );
    }

    #[test]
    fn switch_changes_the_active_project_and_keeps_the_last_view() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        open(&s, &repo(dir.path(), "one", true)).unwrap();
        open(&s, &repo(dir.path(), "two", true)).unwrap();
        assert_eq!(active(&s).unwrap().unwrap().id, "two");
        set_view(&s, "two", "/work/board").unwrap();
        assert!(set_view(&s, "two", "nope").is_err());
        assert_eq!(switch(&s, "one").unwrap().id, "one");
        assert_eq!(active(&s).unwrap().unwrap().id, "one");
        assert_eq!(
            switch(&s, "two").unwrap().last_view.as_deref(),
            Some("/work/board")
        );
        assert!(switch(&s, "none").is_err());
    }

    #[test]
    fn close_leaves_no_active_project_and_keeps_the_list() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "one", true);
        open(&s, &p).unwrap();
        close(&s).unwrap();
        assert!(active(&s).unwrap().is_none());
        let all = list(&s).unwrap();
        assert_eq!((all.len(), all[0].active), (1, false));
        close(&s).unwrap();
        assert_eq!(open(&s, &p).unwrap().status, OpenStatus::Opened);
        assert_eq!(active(&s).unwrap().unwrap().id, "one");
    }

    #[test]
    fn remove_drops_the_entry_and_never_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let one = repo(dir.path(), "one", true);
        open(&s, &one).unwrap();
        open(&s, &repo(dir.path(), "two", true)).unwrap();
        remove(&s, "one").unwrap();
        assert_eq!(list(&s).unwrap().len(), 1);
        assert_eq!(active(&s).unwrap().unwrap().id, "two");
        assert!(Path::new(&one).join(".shipyard/project.yaml").exists());
        remove(&s, "two").unwrap();
        assert!(active(&s).unwrap().is_none() && list(&s).unwrap().is_empty());
        assert!(remove(&s, "two").is_err());
    }

    #[test]
    fn a_missing_folder_shows_as_missing() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "gone", true);
        open(&s, &p).unwrap();
        std::fs::remove_dir_all(&p).unwrap();
        assert_eq!(list(&s).unwrap()[0].state, WorkState::Missing);
    }

    #[test]
    fn settings_write_the_file_and_overrides_stay_in_the_registry() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "delta", true);
        open(&s, &p).unwrap();
        let mut file = settings(&s).unwrap().unwrap().file.unwrap();
        file.paths.insert("decisions".into(), "adr".into());
        save_file(&s, file).unwrap();
        save_overrides(
            &s,
            Overrides {
                accent: Some(Accent::Rose),
                ..Default::default()
            },
        )
        .unwrap();
        let text = std::fs::read_to_string(Path::new(&p).join(".shipyard/project.yaml")).unwrap();
        assert!(text.contains("decisions: adr"));
        assert!(
            !text.contains("rose") && !text.contains(&p),
            "no override, no machine path"
        );
        assert_eq!(
            settings(&s).unwrap().unwrap().overrides.accent,
            Some(Accent::Rose)
        );
        let mut bad = ProjectFile::new("D", "DELTA");
        bad.paths.insert("decisions".into(), "/abs".into());
        assert!(save_file(&s, bad).is_err());
    }

    #[test]
    fn a_clone_opens_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let src = repo(dir.path(), "src", true);
        let g = |a: &[&str]| {
            let o = std::process::Command::new("git")
                .arg("-C")
                .arg(&src)
                .args([
                    "-c",
                    "user.name=t",
                    "-c",
                    "user.email=t@t",
                    "-c",
                    "commit.gpgsign=false",
                ])
                .args(a)
                .output()
                .unwrap();
            assert!(o.status.success());
        };
        g(&["add", "-A"]);
        g(&["commit", "-q", "-m", "x"]);
        let dest = dir.path().join("copy");
        let o = clone(&s, &src, dest.to_str().unwrap()).unwrap();
        assert_eq!(o.status, OpenStatus::Opened);
        assert_eq!(o.project.unwrap().state, WorkState::Clean);
        let bad = clone(
            &s,
            "/nonexistent/x.git",
            dir.path().join("c2").to_str().unwrap(),
        )
        .unwrap();
        assert_eq!(bad.status, OpenStatus::Failed);
        assert!(!dir.path().join("c2").exists());
    }
}
