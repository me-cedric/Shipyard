use serde::Serialize;
use specta::Type;

#[derive(Serialize, Type)]
pub struct RecentProject {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[tauri::command]
#[specta::specta]
pub fn projects_recent() -> Vec<RecentProject> {
    Vec::new()
}
