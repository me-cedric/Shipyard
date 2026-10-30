//! Manage what a project holds (spec `extensions`): import a rules file, remove a compass entry,
//! apply a policy pack, undeploy a catalog component, list, switch and remove plugins. A change
//! needs a click and a project that is not read only (`need_click`).

use std::path::{Path, PathBuf};

use serde::Serialize;
use shipyard_core::extensions::Kind;
use shipyard_store::catalog_undeploy::{self, Undeployed};
use shipyard_store::compass::{self as store_compass};
use shipyard_store::compass_user::{self, Policy};
use shipyard_store::plugin_manage::{self, Installed, Removed};
use specta::Type;
use tauri::AppHandle;

use super::compass::ac;
use super::root;
use crate::commands::{Api, AppState, Res, blocking, err};
use crate::work::need_click;

#[derive(Debug, Clone, Serialize, Type)]
pub struct PolicyPacks {
    pub packs: Vec<Policy>,
    /// The id of the pack that the project holds.
    pub applied: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn compass_policies(app: AppHandle) -> Api<PolicyPacks> {
    blocking(app, |s| {
        Ok(PolicyPacks {
            packs: compass_user::policies(),
            applied: compass_user::policy_applied(&root(s)?),
        })
    })
    .await
}

/// Replaces the policy of the project. Returns the files that it wrote.
#[tauri::command]
#[specta::specta]
pub async fn compass_policy_apply(app: AppHandle, id: String, click: bool) -> Api<Vec<String>> {
    blocking(app, move |s| {
        need_click(s, click)?;
        compass_user::policy_apply(&root(s)?, &id).map_err(err)
    })
    .await
}

/// Copies a rules file into the instincts of the project. Returns the key `pattern:<id>`.
#[tauri::command]
#[specta::specta]
pub async fn compass_import(app: AppHandle, path: String, click: bool) -> Api<String> {
    blocking(app, move |s| {
        need_click(s, click)?;
        let id = compass_user::import_rules(&root(s)?, &PathBuf::from(path)).map_err(err)?;
        Ok(format!("pattern:{id}"))
    })
    .await
}

fn remove_entry(root: &Path, kind: Kind, id: &str) -> Res<()> {
    match kind {
        Kind::Pattern => compass_user::remove_pattern(root, id).map_err(err),
        Kind::Skill | Kind::Pack => {
            let c = store_compass::read(root)
                .map_err(err)?
                .ok_or("no compass is pinned")?;
            let key = c
                .entries
                .iter()
                .find(|e| e.kind == kind && e.id == id)
                .map(|e| e.key())
                .ok_or_else(|| format!("unknown entry: {id}"))?;
            ac(root, &c.tree, root, &["assets", "off", &key])?;
            ac(root, &c.tree, root, &["sync"]).map(|_| ())
        }
        Kind::Guide | Kind::Contract => Err("this entry cannot be removed".into()),
    }
}

/// Removes an entry from the project: an instinct file, or a skill or pack through `ac`.
#[tauri::command]
#[specta::specta]
pub async fn compass_remove(app: AppHandle, kind: Kind, id: String, click: bool) -> Api<()> {
    blocking(app, move |s| {
        need_click(s, click)?;
        remove_entry(&root(s)?, kind, &id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn catalog_undeploy(app: AppHandle, id: String, click: bool) -> Api<Undeployed> {
    blocking(app, move |s| {
        need_click(s, click)?;
        catalog_undeploy::undeploy(&root(s)?, &id).map_err(err)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_list(app: AppHandle) -> Api<Vec<Installed>> {
    blocking(app, |s| Ok(plugin_manage::list(&root(s)?))).await
}

/// The MCP servers that a plugin added, by name, as ids of the custom servers.
fn servers_of(s: &AppState, names: &[String]) -> Vec<String> {
    s.agents
        .mcp_list()
        .into_iter()
        .filter(|r| r.custom && names.contains(&r.label))
        .map(|r| r.id)
        .collect()
}

/// A disabled plugin has its MCP servers off. Its files stay.
#[tauri::command]
#[specta::specta]
pub async fn plugin_set_enabled(app: AppHandle, name: String, on: bool, click: bool) -> Api<()> {
    blocking(app, move |s| {
        need_click(s, click)?;
        let names = plugin_manage::set_enabled(&root(s)?, &name, on).map_err(err)?;
        for id in servers_of(s, &names) {
            s.agents.mcp_enable(&id, on)?;
        }
        Ok(())
    })
    .await
}

/// Removes the unchanged files of a plugin, its MCP servers and its record.
#[tauri::command]
#[specta::specta]
pub async fn plugin_remove(app: AppHandle, name: String, click: bool) -> Api<Removed> {
    blocking(app, move |s| {
        need_click(s, click)?;
        let out = plugin_manage::remove(&root(s)?, &name).map_err(err)?;
        for id in servers_of(s, &out.mcp) {
            s.agents.mcp_remove(&id)?;
        }
        Ok(out)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_instinct_is_removed_and_a_guide_or_the_contract_is_not() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("mine.md");
        std::fs::write(&file, "# mine\n").unwrap();
        let id = compass_user::import_rules(dir.path(), &file).unwrap();
        assert!(remove_entry(dir.path(), Kind::Pattern, &id).is_ok());
        assert!(remove_entry(dir.path(), Kind::Pattern, &id).is_err());
        assert!(remove_entry(dir.path(), Kind::Guide, "ui").is_err());
        assert!(remove_entry(dir.path(), Kind::Contract, "contract").is_err());
        // A skill needs a pinned compass.
        assert!(remove_entry(dir.path(), Kind::Skill, "review").is_err());
    }
}
