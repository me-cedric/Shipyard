//! Projects: open, create, clone, switch, the project file, overrides and the last view.

use std::path::{Path, PathBuf};

use serde::Serialize;
use shipyard_core::project::{ProjectFile, validate};
use shipyard_git::project::{WorkState, clone_repo, init, is_repo, state};
use shipyard_store::project::{Entry, FileRead, Overrides, read_project_file, write_project_file};
use specta::Type;
use tauri::AppHandle;

use super::{AppState, Res, blocking, err};

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
    /// The repository has no project file. A person confirms, then the call repeats with `init`.
    NeedsProjectFile,
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
    Ok(ProjectOutcome {
        status: OpenStatus::Opened,
        project: Some(project),
        message: None,
    })
}

/// Opens a folder that holds a repository. It never runs `git init`.
/// Without a project file it asks first: `init` is the confirm.
pub fn open(s: &AppState, path: &str, init: bool) -> Res<ProjectOutcome> {
    let Ok(root) = std::fs::canonicalize(path) else {
        return Ok(outcome(OpenStatus::NotRepository, path));
    };
    if !is_repo(&root) {
        return Ok(outcome(OpenStatus::NotRepository, path));
    }
    let name = folder_name(&root);
    let fallback = || ProjectFile::new(&name, &derive_key(&name));
    let file = match read_project_file(&root).map_err(err)? {
        FileRead::Valid(f) => f,
        FileRead::Missing if init => {
            let f = fallback();
            write_project_file(&root, &f).map_err(err)?;
            f
        }
        FileRead::Missing => return Ok(outcome(OpenStatus::NeedsProjectFile, path)),
        // The project opens. Settings / Health shows the line and the value.
        FileRead::Invalid(_) => fallback(),
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
    if let Err(e) = init(&root).and_then(|()| write_project_file(&root, &file).map_err(err)) {
        return Ok(outcome(OpenStatus::Failed, e));
    }
    activate(s, &std::fs::canonicalize(&root).map_err(err)?, &file)
}

/// Clones a repository into a folder that the person picked, then opens it.
pub fn clone(s: &AppState, url: &str, path: &str) -> Res<ProjectOutcome> {
    if !Path::new(path).is_absolute() {
        return Ok(outcome(OpenStatus::Invalid, path));
    }
    let auth = s.connections.git_auth(url.trim())?;
    match clone_repo(url.trim(), Path::new(path), &auth) {
        Ok(()) => open(s, path, true),
        Err(e) => Ok(outcome(OpenStatus::Failed, e)),
    }
}

pub fn switch(s: &AppState, id: &str) -> Res<ProjectEntry> {
    s.with_registry(|reg| {
        if !reg.activate(id) {
            return Err(format!("unknown project: {id}"));
        }
        Ok(to_entry(reg.get(id).ok_or("unknown project")?, true))
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
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    write_project_file(Path::new(&e.path), &file).map_err(err)?;
    s.with_registry(|reg| {
        reg.register(&e.path, &file);
        Ok(())
    })
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
pub async fn projects_list(app: AppHandle) -> Res<Vec<ProjectEntry>> {
    blocking(app, list).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_active(app: AppHandle) -> Res<Option<ProjectEntry>> {
    blocking(app, active).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_open(app: AppHandle, path: String, init: bool) -> Res<ProjectOutcome> {
    blocking(app, move |s| open(s, &path, init)).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_create(
    app: AppHandle,
    path: String,
    name: String,
    key: String,
) -> Res<ProjectOutcome> {
    blocking(app, move |s| create(s, &path, &name, &key)).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_clone(app: AppHandle, url: String, path: String) -> Res<ProjectOutcome> {
    blocking(app, move |s| clone(s, &url, &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_switch(app: AppHandle, id: String) -> Res<ProjectEntry> {
    blocking(app, move |s| switch(s, &id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn projects_set_view(app: AppHandle, id: String, view: String) -> Res<()> {
    blocking(app, move |s| set_view(s, &id, &view)).await
}

#[tauri::command]
#[specta::specta]
pub async fn project_settings(app: AppHandle) -> Res<Option<ProjectSettings>> {
    blocking(app, settings).await
}

#[tauri::command]
#[specta::specta]
pub async fn project_file_save(app: AppHandle, file: ProjectFile) -> Res<()> {
    blocking(app, move |s| save_file(s, file)).await
}

#[tauri::command]
#[specta::specta]
pub async fn project_overrides_save(app: AppHandle, overrides: Overrides) -> Res<()> {
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
        let o = open(&s, &p, false).unwrap();
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
    fn a_repository_without_a_project_file_waits_for_the_confirm() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "beta", false);
        assert_eq!(
            open(&s, &p, false).unwrap().status,
            OpenStatus::NeedsProjectFile
        );
        assert!(!Path::new(&p).join(".shipyard").exists());
        assert!(list(&s).unwrap().is_empty());
        assert_eq!(open(&s, &p, true).unwrap().status, OpenStatus::Opened);
        assert!(Path::new(&p).join(".shipyard/project.yaml").exists());
    }

    #[test]
    fn a_folder_without_a_repository_opens_nothing_and_stays_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let plain = dir.path().join("plain");
        std::fs::create_dir(&plain).unwrap();
        let o = open(&s, plain.to_str().unwrap(), true).unwrap();
        assert_eq!(o.status, OpenStatus::NotRepository);
        assert!(!plain.join(".git").exists(), "no git init");
        assert_eq!(std::fs::read_dir(&plain).unwrap().count(), 0);
        assert_eq!(
            open(&s, "/does/not/exist", true).unwrap().status,
            OpenStatus::NotRepository
        );
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
        assert_eq!(open(&s, &p, false).unwrap().status, OpenStatus::Opened);
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
        open(&s, &p, false).unwrap();
        assert_eq!(
            std::fs::read_to_string(Path::new(&p).join(".gitignore")).unwrap(),
            "mine\n"
        );
    }

    #[test]
    fn switch_changes_the_active_project_and_keeps_the_last_view() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        open(&s, &repo(dir.path(), "one", true), false).unwrap();
        open(&s, &repo(dir.path(), "two", true), false).unwrap();
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
    fn a_missing_folder_shows_as_missing() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "gone", true);
        open(&s, &p, false).unwrap();
        std::fs::remove_dir_all(&p).unwrap();
        assert_eq!(list(&s).unwrap()[0].state, WorkState::Missing);
    }

    #[test]
    fn settings_write_the_file_and_overrides_stay_in_the_registry() {
        let dir = tempfile::tempdir().unwrap();
        let s = state_in(dir.path());
        let p = repo(dir.path(), "delta", true);
        open(&s, &p, false).unwrap();
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
