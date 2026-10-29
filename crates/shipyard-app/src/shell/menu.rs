//! The native menu (spec `shell`, REQ-012). An item that is not predefined has the id of a palette
//! action. A click emits `menu-action` with that id, and the UI runs the same action as the
//! palette. The UI sends the labels in the language of the person (REQ-011), keyed by item id.
//!
//! shortcut: custom items show no accelerator. The webview already handles `Mod+K` and the like,
//! and a native accelerator would run an action twice on Windows and Linux.

use std::collections::HashMap;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Wry};

/// A predefined item: the system runs it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Native {
    About,
    Quit,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    Minimize,
    Maximize,
    Fullscreen,
    CloseWindow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Entry {
    /// `(id, English label)`. The id is a palette action id.
    Action(&'static str, &'static str),
    /// `(label key, English label)`.
    Native(Native, &'static str, &'static str),
    Separator,
}

use Entry::{Action, Native as Sys, Separator};

/// The menus, in order: `(label key, English label, items)`.
pub fn layout() -> Vec<(&'static str, &'static str, Vec<Entry>)> {
    vec![
        (
            "app",
            "Shipyard",
            vec![
                Sys(Native::About, "about", "About Shipyard"),
                Separator,
                Sys(Native::Quit, "quit", "Quit"),
            ],
        ),
        (
            "file",
            "File",
            vec![
                Action("project-open", "Open a local folder"),
                Action("project-switch", "Switch project"),
                Separator,
                Action("sync", "Sync"),
                Action("commit", "Commit"),
                Separator,
                Sys(Native::CloseWindow, "closeWindow", "Close window"),
            ],
        ),
        (
            "edit",
            "Edit",
            vec![
                Sys(Native::Undo, "undo", "Undo"),
                Sys(Native::Redo, "redo", "Redo"),
                Separator,
                Sys(Native::Cut, "cut", "Cut"),
                Sys(Native::Copy, "copy", "Copy"),
                Sys(Native::Paste, "paste", "Paste"),
                Sys(Native::SelectAll, "selectAll", "Select all"),
            ],
        ),
        (
            "view",
            "View",
            vec![
                Action("palette", "Command palette"),
                Action("toggle-sidebar", "Toggle sidebar"),
                Action("toggle-inspector", "Toggle inspector"),
                Separator,
                Sys(Native::Fullscreen, "fullscreen", "Full screen"),
            ],
        ),
        (
            "window",
            "Window",
            vec![
                Sys(Native::Minimize, "minimize", "Minimize"),
                Sys(Native::Maximize, "maximize", "Maximize"),
            ],
        ),
        (
            "help",
            "Help",
            vec![Action("update-check", "Check for updates")],
        ),
    ]
}

/// The ids of the items that run a palette action.
#[cfg(test)]
fn action_ids() -> Vec<&'static str> {
    layout()
        .into_iter()
        .flat_map(|(_, _, items)| items)
        .filter_map(|e| match e {
            Action(id, _) => Some(id),
            _ => None,
        })
        .collect()
}

/// Builds the menu. A key with no label in `labels` shows its English text.
pub fn build(app: &AppHandle, labels: &HashMap<String, String>) -> tauri::Result<Menu<Wry>> {
    let label =
        |key: &str, default: &str| labels.get(key).cloned().unwrap_or_else(|| default.into());
    let menu = Menu::new(app)?;
    for (key, title, entries) in layout() {
        let sub = Submenu::new(app, label(key, title), true)?;
        for entry in entries {
            match entry {
                Separator => sub.append(&PredefinedMenuItem::separator(app)?)?,
                Action(id, default) => sub.append(&MenuItem::with_id(
                    app,
                    id,
                    label(id, default),
                    true,
                    None::<&str>,
                )?)?,
                Sys(native, key, default) => {
                    let text = Some(label(key, default));
                    let text = text.as_deref();
                    let item = match native {
                        Native::About => PredefinedMenuItem::about(app, text, None)?,
                        Native::Quit => PredefinedMenuItem::quit(app, text)?,
                        Native::Undo => PredefinedMenuItem::undo(app, text)?,
                        Native::Redo => PredefinedMenuItem::redo(app, text)?,
                        Native::Cut => PredefinedMenuItem::cut(app, text)?,
                        Native::Copy => PredefinedMenuItem::copy(app, text)?,
                        Native::Paste => PredefinedMenuItem::paste(app, text)?,
                        Native::SelectAll => PredefinedMenuItem::select_all(app, text)?,
                        Native::Minimize => PredefinedMenuItem::minimize(app, text)?,
                        Native::Maximize => PredefinedMenuItem::maximize(app, text)?,
                        Native::Fullscreen => PredefinedMenuItem::fullscreen(app, text)?,
                        Native::CloseWindow => PredefinedMenuItem::close_window(app, text)?,
                    };
                    sub.append(&item)?;
                }
            }
        }
        menu.append(&sub)?;
    }
    Ok(menu)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_menu_offers_each_global_action_of_the_spec() {
        let ids = action_ids();
        for want in [
            "project-open",
            "project-switch",
            "sync",
            "commit",
            "palette",
            "toggle-inspector",
            "update-check",
        ] {
            assert!(ids.contains(&want), "{want}");
        }
        let has_quit = layout()
            .iter()
            .flat_map(|(_, _, items)| items)
            .any(|e| matches!(e, Sys(Native::Quit, ..)));
        assert!(has_quit);
    }

    #[test]
    fn each_action_id_is_used_once() {
        let mut ids = action_ids();
        ids.sort_unstable();
        let n = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), n);
    }
}
