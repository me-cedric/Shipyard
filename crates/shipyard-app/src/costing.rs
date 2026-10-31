//! Costing and plan extras (spec `work`): the summary by profile, the delete of a sheet to the
//! trash, the PNG of the plan and the calendar for Settings / Project. A summary holds days and
//! costs, never a day rate: a sealed rate stays sealed.

use std::collections::BTreeMap;

use serde::Serialize;
use shipyard_core::work::{self, Calendar, Sheet};
use shipyard_store::work::sheet_path;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::work::{FROZEN, need_click};

/// The days and the cost of one profile (a role). `cost` is `None` when no member rate covers the
/// role: a locked seal hides every rate. It is also `None` when fewer than three members with a
/// rate have the role (`work::MIN_RATED`): the cost over the days would show a rate.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSum {
    pub role: String,
    pub days: f64,
    pub cost: Option<f64>,
}

/// The sum of each role over `sheets`, the largest first.
fn by_role(sheets: &[Sheet], rates: &BTreeMap<String, f64>) -> Vec<ProfileSum> {
    let mut by: BTreeMap<String, ProfileSum> = BTreeMap::new();
    for sheet in sheets {
        let build = work::build_days(sheet);
        for (_, t) in sheet.tasks() {
            let days = work::task_days(t, build);
            let key = t.role.to_ascii_lowercase();
            let rate = rates.get(&key).copied();
            let e = by.entry(key).or_insert_with(|| ProfileSum {
                role: t.role.clone(),
                days: 0.0,
                cost: Some(0.0),
            });
            e.days += days;
            e.cost = match (e.cost, rate) {
                (Some(c), Some(r)) => Some(c + days * r),
                _ => None,
            };
        }
    }
    let mut out: Vec<ProfileSum> = by.into_values().collect();
    out.sort_by(|a, b| b.days.total_cmp(&a.days).then_with(|| a.role.cmp(&b.role)));
    out
}

/// The summary by profile of one sheet, or of every sheet that opens now when `slug` is `None`.
pub fn profiles(s: &AppState, slug: Option<&str>) -> Res<Vec<ProfileSum>> {
    let sheets = match slug {
        Some(slug) => vec![crate::work::sheet_get(s, slug)?.sheet],
        None => crate::work::sheets_for_export(s)?
            .into_iter()
            .filter_map(|(_, sheet)| sheet.ok())
            .collect(),
    };
    let team = crate::work::team_get(s)?.team;
    Ok(by_role(&sheets, &work::shared_rates(&team)))
}

/// Move a sheet file to the system trash. A frozen sheet stays.
pub fn delete(s: &AppState, slug: &str, click: bool) -> Res<()> {
    need_click(s, click)?;
    let yaml = sheet_path(slug).map_err(err)?;
    if crate::work::sheet_get(s, slug).is_ok_and(|v| v.sheet.frozen) {
        return Err(FROZEN.into());
    }
    let root = s
        .registry()?
        .active()
        .map(|e| std::path::PathBuf::from(&e.path))
        .ok_or("no active project")?;
    let json = format!("docs/costing/{slug}.json");
    let rel = [yaml.as_str(), json.as_str()]
        .into_iter()
        .find(|rel| root.join(rel).is_file())
        .ok_or_else(|| format!("no sheet `{slug}`"))?;
    crate::files::delete(s, rel, click)
}

/// The largest PNG that a save takes.
const MAX_PNG: usize = 64 * 1_048_576;

/// Write the PNG that the view drew. The bytes must be a PNG image.
pub fn png_save(s: &AppState, path: &str, bytes: &[u8], click: bool) -> Res<()> {
    crate::reports::need_export_click(s, path, click)?;
    if bytes.len() > MAX_PNG || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("the image is not a PNG file".into());
    }
    crate::knowledge::write_export(path, "png", bytes)
}

#[tauri::command]
#[specta::specta]
pub async fn estimate_profiles(app: AppHandle, slug: Option<String>) -> Api<Vec<ProfileSum>> {
    blocking(app, move |s| profiles(s, slug.as_deref())).await
}

/// Moves a sheet to the system trash, after the confirm of a person.
#[tauri::command]
#[specta::specta]
pub async fn estimate_delete(app: AppHandle, slug: String, click: bool) -> Api<()> {
    blocking(app, move |s| delete(s, &slug, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn plan_png_save(app: AppHandle, path: String, bytes: Vec<u8>, click: bool) -> Api<()> {
    blocking(app, move |s| png_save(s, &path, &bytes, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn plan_calendar_get(app: AppHandle) -> Api<Calendar> {
    blocking(app, crate::work::calendar_get).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work::tests::fx;
    use shipyard_core::work::{Feature, Member, Task, Team};

    fn sheet(frozen: bool) -> Sheet {
        let task = |id: &str, role: &str, days: f64| Task {
            id: id.into(),
            name: id.into(),
            role: role.into(),
            days: Some(days),
            ..Task::default()
        };
        Sheet {
            name: "Lot".into(),
            currency: "EUR".into(),
            features: vec![Feature {
                id: "f".into(),
                name: "F".into(),
                tasks: vec![
                    task("a", "dev", 2.0),
                    task("b", "Dev", 1.0),
                    task("c", "qa", 1.0),
                ],
                ..Feature::default()
            }],
            frozen,
            ..Sheet::default()
        }
    }

    #[test]
    fn a_profile_sums_days_and_cost_and_an_unrated_role_has_no_cost() {
        let rates = BTreeMap::from([("dev".to_string(), 500.0)]);
        let three = Task {
            id: "d".into(),
            role: "dev".into(),
            days: Some(2.0),
            optimistic: Some(1.0),
            pessimistic: Some(6.0),
            ..Task::default()
        };
        let mut s = sheet(false);
        s.features[0].tasks.push(three);
        let out = by_role(&[s], &rates);
        // 2 + 1 + the expected (1 + 8 + 6) / 6 = 2.5 days.
        assert_eq!(out[0].role, "dev");
        assert_eq!(out[0].days, 5.5);
        assert_eq!(out[0].cost, Some(2750.0));
        assert_eq!((out[1].role.as_str(), out[1].cost), ("qa", None));
    }

    #[test]
    fn a_frozen_sheet_takes_only_its_unfreeze_and_never_goes_to_the_trash() {
        let f = fx();
        crate::work::sheet_save(&f.s, "lot", sheet(true)).unwrap();
        let mut changed = sheet(true);
        changed.name = "Other".into();
        assert!(crate::work::sheet_save(&f.s, "lot", changed).is_err());
        assert!(delete(&f.s, "lot", true).is_err());
        crate::work::sheet_save(&f.s, "lot", sheet(false)).unwrap();
        assert!(delete(&f.s, "lot", false).is_err());
        assert!(profiles(&f.s, Some("lot")).unwrap().len() == 2);
        crate::work::team_save(
            &f.s,
            Team {
                members: vec![Member {
                    name: "Ana".into(),
                    handle: "ana".into(),
                    role: "dev".into(),
                    capacity: 5.0,
                    day_rate: Some(400.0),
                    ..Member::default()
                }],
                locked: false,
            },
        )
        .unwrap();
        // One member with a rate: the cost would show the day rate, so it stays hidden.
        assert_eq!(profiles(&f.s, None).unwrap()[0].cost, None);
        let member = |handle: &str, rate: f64| Member {
            name: handle.into(),
            handle: handle.into(),
            role: "Dev".into(),
            capacity: 5.0,
            day_rate: Some(rate),
            ..Member::default()
        };
        crate::work::team_save(
            &f.s,
            Team {
                members: vec![member("ana", 400.0), member("bob", 600.0)],
                locked: false,
            },
        )
        .unwrap();
        // Two members with a rate: each one would work out the rate of the other.
        assert_eq!(profiles(&f.s, None).unwrap()[0].cost, None);
        let team = |members| Team {
            members,
            locked: false,
        };
        crate::work::team_save(
            &f.s,
            team(vec![
                member("ana", 400.0),
                member("bob", 600.0),
                member("cy", 500.0),
            ]),
        )
        .unwrap();
        assert_eq!(profiles(&f.s, None).unwrap()[0].cost, Some(1500.0));
    }

    #[test]
    fn a_role_of_one_or_two_rated_members_shows_no_cost_in_totals_or_portfolio() {
        let f = fx();
        crate::work::sheet_save(&f.s, "lot", sheet(false)).unwrap();
        let rated = |handle: &str, role: &str, rate: f64| Member {
            name: handle.into(),
            handle: handle.into(),
            role: role.into(),
            capacity: 5.0,
            day_rate: Some(rate),
            ..Member::default()
        };
        crate::work::team_save(
            &f.s,
            Team {
                members: vec![
                    rated("ana", "dev", 400.0),
                    rated("bob", "dev", 600.0),
                    rated("cy", "qa", 300.0),
                ],
                locked: false,
            },
        )
        .unwrap();
        let totals = crate::work::sheet_get(&f.s, "lot").unwrap().totals;
        assert_eq!(totals.cost, 0.0);
        assert_eq!(totals.unrated, ["Dev", "dev", "qa"]);
        let listed = crate::work::list_sheets(&f.s).unwrap();
        assert_eq!(listed[0].totals.as_ref().map(|t| t.cost), Some(0.0));
        assert_eq!(crate::work::portfolio(&f.s).unwrap().total.cost, 0.0);
    }

    #[test]
    fn a_png_save_needs_a_click_and_png_bytes() {
        let f = fx();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("plan.png");
        let p = path.to_str().unwrap();
        let png = b"\x89PNG\r\n\x1a\nrest";
        assert!(png_save(&f.s, p, png, false).is_err());
        assert!(png_save(&f.s, p, b"<svg/>", true).is_err());
        png_save(&f.s, p, png, true).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), png);
    }
}
