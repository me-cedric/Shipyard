#[tauri::command]
#[specta::specta]
pub fn health_ping() -> String {
    "pong".into()
}
