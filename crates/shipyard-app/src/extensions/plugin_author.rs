//! The plugin author tools (spec `extensions`): copy the sample to a folder, package a folder as a
//! zip, and open the line of a manifest fault. A write needs a click. No plugin code runs.

use std::path::Path;

use shipyard_store::plugins;
use tauri::AppHandle;

use crate::commands::{Api, blocking, err};
use crate::work::need_click;

/// The sample plugin and the author skill. `plugin_new` copies them.
const SAMPLE: [(&str, &str); 6] = [
    (
        "manifest.json",
        include_str!("../../../../examples/plugin-sample/manifest.json"),
    ),
    (
        "plugin-manifest.schema.json",
        include_str!("../../../../examples/plugin-sample/plugin-manifest.schema.json"),
    ),
    (
        "README.md",
        include_str!("../../../../examples/plugin-sample/README.md"),
    ),
    (
        "files/skills/sample-skill/SKILL.md",
        include_str!("../../../../examples/plugin-sample/files/skills/sample-skill/SKILL.md"),
    ),
    (
        "files/rules/sample-rule.md",
        include_str!("../../../../examples/plugin-sample/files/rules/sample-rule.md"),
    ),
    (
        ".claude/skills/plugin-author/SKILL.md",
        include_str!("../../../../docs/agent-compass/skills/plugin-author/SKILL.md"),
    ),
];

/// Copy the sample into a new folder `acme-sample` of `parent`. Returns the new folder. An existing
/// folder is an error: nothing is overwritten.
#[tauri::command]
#[specta::specta]
pub async fn plugin_new(app: AppHandle, parent: String, click: bool) -> Api<String> {
    blocking(app, move |s| {
        need_click(s, click)?;
        let dir = Path::new(&parent).join("acme-sample");
        std::fs::create_dir(&dir).map_err(err)?;
        let files: Vec<_> = SAMPLE
            .iter()
            .map(|(p, t)| (p.to_string(), t.as_bytes().to_vec()))
            .collect();
        shipyard_store::catalog::write_new(&dir, &files).map_err(err)?;
        Ok(dir.to_string_lossy().into_owned())
    })
    .await
}

/// Zip a plugin folder to `dest`. The folder is read as a plugin first, so a fault stops it with
/// the file and line.
#[tauri::command]
#[specta::specta]
pub async fn plugin_package(app: AppHandle, dir: String, dest: String, click: bool) -> Api<String> {
    blocking(app, move |s| {
        need_click(s, click)?;
        if !dest.ends_with(".zip") {
            return Err("the package needs a .zip name".into());
        }
        let bytes = plugins::pack(Path::new(&dir)).map_err(err)?;
        shipyard_store::project::write_atomic(Path::new(&dest), &bytes).map_err(err)?;
        Ok(dest)
    })
    .await
}

/// Open the manifest of a plugin folder at a line, in the code editor of the person.
#[tauri::command]
#[specta::specta]
pub async fn plugin_open_line(app: AppHandle, dir: String, line: u32) -> Api<()> {
    blocking(app, move |_| {
        crate::openers::open_in_editor_with(
            Path::new(&dir),
            &crate::openers::app_dirs(),
            None,
            "manifest.json",
            Some(line),
        )
    })
    .await
}
