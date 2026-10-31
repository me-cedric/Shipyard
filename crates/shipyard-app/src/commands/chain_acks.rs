//! A docs-chain warning that a person acknowledged with a reason. The acknowledgements live in the
//! repository (`docs/delivery/chain-acks.json`), so the team shares them. An acknowledgement holds
//! the changed files that it covered: a new changed file brings the warning back.

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

use super::overview::{ChainWarning, chain_watch};
use super::{Api, AppState, Res, blocking, err};
use crate::code::now_iso;
use crate::design::put;
use crate::work::need_click;
use shipyard_store::safe_write;

pub const ACKS_FILE: &str = "docs/delivery/chain-acks.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ChainAck {
    pub from: String,
    pub to: String,
    pub reason: String,
    /// `YYYY-MM-DDTHH:MM:SSZ`.
    pub at: String,
    /// The changed files that the person saw.
    pub changed: Vec<String>,
}

fn read(root: &Path) -> Vec<ChainAck> {
    std::fs::read_to_string(root.join(ACKS_FILE))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

/// Puts the acknowledgement on each warning that it still covers.
pub fn with_acks(root: &Path, warnings: Vec<ChainWarning>) -> Vec<ChainWarning> {
    let acks = read(root);
    warnings
        .into_iter()
        .map(|mut w| {
            w.ack = acks
                .iter()
                .find(|a| {
                    a.from == w.from
                        && a.to == w.to
                        && w.changed.iter().all(|c| a.changed.contains(c))
                })
                .cloned();
            w
        })
        .collect()
}

fn save(s: &AppState, root: &Path, mut acks: Vec<ChainAck>) -> Res<()> {
    acks.sort_by(|a, b| (&a.from, &a.to).cmp(&(&b.from, &b.to)));
    let full = root.join(ACKS_FILE);
    let stamp = safe_write::stamp(&full).map_err(err)?;
    let text = serde_json::to_string_pretty(&acks).map_err(err)? + "\n";
    if let Some(dir) = full.parent() {
        std::fs::create_dir_all(dir).map_err(err)?;
    }
    let w = put(s, &full, &text, stamp.as_deref(), stamp.is_none())?;
    if w.conflict {
        return Err("the acknowledgements changed on disk: read them again".into());
    }
    Ok(())
}

fn root(s: &AppState) -> Res<std::path::PathBuf> {
    Ok(s.registry()?
        .active()
        .ok_or("no active project")?
        .path
        .clone()
        .into())
}

/// Acknowledge one warning with a reason, after the click of a person.
pub fn acknowledge(
    s: &AppState,
    base: Option<&str>,
    from: &str,
    to: &str,
    reason: &str,
    click: bool,
) -> Res<()> {
    need_click(s, click)?;
    let reason = reason.trim();
    if reason.is_empty() {
        return Err("a reason is needed".into());
    }
    let warning = chain_watch(s, base)?
        .warnings
        .into_iter()
        .find(|w| w.from == from && w.to == to)
        .ok_or("this link has no warning")?;
    let root = root(s)?;
    let mut acks = read(&root);
    acks.retain(|a| !(a.from == from && a.to == to));
    acks.push(ChainAck {
        from: from.into(),
        to: to.into(),
        reason: reason.into(),
        at: now_iso(),
        changed: warning.changed,
    });
    save(s, &root, acks)
}

/// Take the acknowledgement back, after the click of a person.
pub fn withdraw(s: &AppState, from: &str, to: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let root = root(s)?;
    let mut acks = read(&root);
    let before = acks.len();
    acks.retain(|a| !(a.from == from && a.to == to));
    if acks.len() == before {
        return Ok(());
    }
    save(s, &root, acks)
}

#[tauri::command]
#[specta::specta]
pub async fn code_chain_ack(
    app: AppHandle,
    base: Option<String>,
    from: String,
    to: String,
    reason: String,
    click: bool,
) -> Api<()> {
    blocking(app, move |s| {
        acknowledge(s, base.as_deref(), &from, &to, &reason, click)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn code_chain_ack_withdraw(
    app: AppHandle,
    from: String,
    to: String,
    click: bool,
) -> Api<()> {
    blocking(app, move |s| withdraw(s, &from, &to, click)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn warning(changed: &[&str]) -> ChainWarning {
        ChainWarning {
            from: "specs".into(),
            to: "api".into(),
            changed: changed.iter().map(|c| (*c).into()).collect(),
            ack: None,
        }
    }

    #[test]
    fn an_acknowledgement_covers_the_files_it_saw_and_a_new_file_brings_the_warning_back() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::new(dir.path().join("data"));
        let root = dir.path().join("p");
        std::fs::create_dir_all(&root).unwrap();
        let ack = ChainAck {
            from: "specs".into(),
            to: "api".into(),
            reason: "no API impact".into(),
            at: "2026-10-30T10:00:00Z".into(),
            changed: vec!["docs/openspec/a.md".into()],
        };
        assert!(
            with_acks(&root, vec![warning(&["docs/openspec/a.md"])])[0]
                .ack
                .is_none()
        );
        std::fs::create_dir_all(root.join("docs/delivery")).unwrap();
        save(&s, &root, vec![ack.clone()]).unwrap();
        assert_eq!(
            with_acks(&root, vec![warning(&["docs/openspec/a.md"])])[0].ack,
            Some(ack)
        );
        let w = with_acks(
            &root,
            vec![warning(&["docs/openspec/a.md", "docs/openspec/b.md"])],
        );
        assert!(w[0].ack.is_none(), "a new changed file");
        assert!(acknowledge(&s, None, "specs", "api", "x", false).is_err());
    }
}
