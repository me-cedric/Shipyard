//! The Legacy layout, read in place (Q-102, Q-103): path detection, the registry, the JSON
//! formats and a real Legacy repository.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use shipyard_core::flows::Action;
use shipyard_store::design::{self, list, read_flows, write_flows_json};
use shipyard_store::legacy::{detect_paths, layout_file, read_registry, sheet_json, team_json};
use shipyard_store::project_import::{roles, sheet, team};
use shipyard_store::madr;

fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn copy(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for e in fs::read_dir(from).unwrap().flatten() {
        let t = e.file_type().unwrap();
        if t.is_dir() {
            copy(&e.path(), &to.join(e.file_name()));
        } else if t.is_file() {
            fs::copy(e.path(), to.join(e.file_name())).unwrap();
        }
    }
}

#[test]
fn a_plain_folder_gets_the_defaults_and_a_legacy_folder_its_paths() {
    let dir = tempfile::tempdir().unwrap();
    assert!(detect_paths(dir.path()).is_empty());
    assert_eq!(
        layout_file(dir.path(), "A", "A", &BTreeMap::new())
            .paths
            .len(),
        3
    );
    put(dir.path(), "docs/drawings/a.excalidraw", "{}");
    put(dir.path(), "docs/diagrams/x/m.c4", "model {}");
    put(dir.path(), "docs/network/flows.json", "{}");
    let p = detect_paths(dir.path());
    assert_eq!(p["diagrams"], "docs/drawings");
    assert_eq!(p["models"], "docs/diagrams");
    assert_eq!(p["flows"], "docs/network/flows.json");
}

#[test]
fn a_shipyard_layout_is_not_moved() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/diagrams/a.mmd", "graph TD");
    put(dir.path(), "docs/models/m.c4", "model {}");
    assert!(detect_paths(dir.path()).is_empty());
}

#[test]
fn a_registry_path_that_breaks_the_rule_is_dropped() {
    let dir = tempfile::tempdir().unwrap();
    let extra = BTreeMap::from([
        ("api".to_string(), "../out".to_string()),
        ("data".to_string(), "db".to_string()),
    ]);
    let f = layout_file(dir.path(), "A", "A", &extra);
    assert_eq!((f.path("api"), f.path("data")), ("docs/api", "db"));
}

#[test]
fn the_registry_reads_four_fields_and_maps_the_keys() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("projects.json");
    let abs = dir.path().to_str().unwrap();
    fs::write(
        &file,
        serde_json::json!({"active": "a", "projects": [
            {"id": "a", "name": "Alpha", "path": abs, "username": "u", "url": "https://x",
             "paths": {"drawings": "docs/d", "diagrams": "docs/c", "delivery": "docs/dl/", "costing": "docs/cost", "adr": 3}},
            {"id": "b", "name": "Rel", "path": "relative"},
            {"id": "", "name": "No id", "path": abs},
        ]})
        .to_string(),
    )
    .unwrap();
    let all = read_registry(&file);
    assert_eq!(all.len(), 1);
    let p = &all[0];
    assert_eq!((p.id.as_str(), p.name.as_str()), ("a", "Alpha"));
    assert_eq!(p.paths["diagrams"], "docs/d");
    assert_eq!(p.paths["models"], "docs/c");
    assert_eq!(p.paths["questions"], "docs/dl/questions");
    assert!(!p.paths.contains_key("decisions") && !p.paths.contains_key("costing"));
    assert!(read_registry(&dir.path().join("none.json")).is_empty());
    fs::write(&file, "not json").unwrap();
    assert!(read_registry(&file).is_empty());
}

const FLOWS: &str = r#"{"version":1,"flows":[
 {"id":"f-1","name":"web","description":"front","sourceName":"Web","source":"10.0.1.0/24","destinationName":"Db","destination":"10.0.2.5/32","vlan":"vlan10","subnet":"s1","protocol":"TCP","ports":"5432","action":"Allow"},
 {"id":"f-2","name":"out","description":"","source":"Internet","destination":"10.0.1.0/24","vlan":"","subnet":"s2","protocol":"TCP","ports":"","action":"Deny"}]}"#;

#[test]
fn legacy_flows_read_as_rows_and_write_back_in_json() {
    let rows = read_flows(FLOWS).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!((rows[0].id, rows[0].network.as_str()), (1, "vlan10"));
    assert_eq!(rows[0].port.as_deref(), Some("5432"));
    assert_eq!(rows[1].network, "s2");
    assert_eq!(rows[1].action, Action::Deny);
    let mut edit = rows.clone();
    edit[0].port = Some("5433".into());
    edit.remove(1);
    let text = write_flows_json(&edit, FLOWS).unwrap();
    let back: serde_json::Value = serde_json::from_str(&text).unwrap();
    let first = &back["flows"][0];
    assert_eq!(first["ports"], "5433");
    assert_eq!(
        (first["name"].as_str(), first["sourceName"].as_str()),
        (Some("web"), Some("Web"))
    );
    assert_eq!(back["flows"].as_array().unwrap().len(), 1);
    assert_eq!(read_flows(&text).unwrap().len(), 1);
    assert!(read_flows(r#"{"flows":[{"action":"Maybe"}]}"#).is_err());
    assert!(read_flows(r#"{"rows":[]}"#).is_err());
}

#[test]
fn a_flows_file_path_lists_as_one_artifact() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/network/flows.json", FLOWS);
    let mut f = layout_file(dir.path(), "A", "A", &BTreeMap::new());
    f.paths.extend(detect_paths(dir.path()));
    let a = list(dir.path(), &f);
    let flows: Vec<_> = a.iter().filter(|a| a.kind == "flow").collect();
    assert_eq!(flows.len(), 1);
    assert_eq!(flows[0].path, "docs/network/flows.json");
    assert!(flows[0].issue.is_none());
    assert!(design::resolve(dir.path(), &f, "docs/network/flows.json").is_ok());
    assert!(design::resolve(dir.path(), &f, "docs/network/other.json").is_err());
}

const PERSONAS: &str = r#"{"version":1,"personas":[{"id":"p1","name":"Dev Web","tjm":500}]}"#;
const COSTING: &str = r#"{"version":1,"groups":[{"id":"g","name":"G"}],"meta":{"name":"MVP","status":"draft","currency":"EUR","marginRate":0.15,"startDate":"2026-01-01"},
 "features":[{"id":"F1","name":"Login","groupId":"g","tasks":[
  {"id":"T1","name":"Form","personaId":"p1","mandays":3,"chargeType":"days","kind":"build","description":"d","comments":"c","basis":"human"},
  {"id":"T2","name":"QA","personaId":"p1","mandays":10,"chargeType":"ratio","kind":"other"}]}],
 "plan":{"p1":[1,2]}}"#;

#[test]
fn a_legacy_sheet_round_trips_and_keeps_the_keys_it_does_not_own() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/personas/personas.json", PERSONAS);
    let r = roles(dir.path());
    let v = serde_json::from_str(COSTING).unwrap();
    let mut s = sheet(&v, "mvp", &r);
    assert_eq!((s.name.as_str(), s.margin_rate), ("MVP", 0.15));
    assert_eq!(s.features[0].tasks[1].percent, Some(10.0));
    s.features[0].tasks[0].days = Some(4.0);
    s.margin_rate = 0.2;
    let text = sheet_json(&s, Some(COSTING), &r);
    let back: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(back["plan"]["p1"][1], 2);
    assert_eq!(back["groups"][0]["id"], "g");
    assert_eq!(back["meta"]["startDate"], "2026-01-01");
    let t0 = &back["features"][0]["tasks"][0];
    assert_eq!(
        (
            t0["mandays"].as_f64(),
            t0["personaId"].as_str(),
            t0["basis"].as_str()
        ),
        (Some(4.0), Some("p1"), Some("human"))
    );
    assert_eq!(back["features"][0]["tasks"][1]["chargeType"], "ratio");
    assert_eq!(sheet(&back, "mvp", &r), s);
}

#[test]
fn a_legacy_team_round_trips() {
    let dir = tempfile::tempdir().unwrap();
    put(dir.path(), "docs/personas/personas.json", PERSONAS);
    let r = roles(dir.path());
    let old = r#"{"version":1,"members":[{"id":"m1","name":"Ana Diaz","email":"Ana@x.io","personaId":"p1","tjm":450,
      "windows":[{"from":"2026-01-01","to":"2026-12-31","load":0.8}],"absences":[]}]}"#;
    let mut t = team(&serde_json::from_str(old).unwrap(), &r);
    assert_eq!(t.members[0].day_rate, Some(450.0));
    t.members[0].day_rate = Some(480.0);
    let text = team_json(&t, Some(old), &r);
    let back: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(back["members"][0]["tjm"], 480.0);
    assert_eq!(back["members"][0]["windows"][0]["load"], 0.8);
    assert_eq!(team(&back, &r), t);
}

/// A real Legacy repository. The test reads a copy and skips when the repository is not on this
/// machine.
#[test]
fn every_artifact_folder_of_storyarc_lists_its_files() {
    let src = Path::new("/Users/mecedric/Documents/Projects/StoryArc/docs");
    if !src.is_dir() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    for d in ["drawings", "diagrams", "decisions", "openspec", "delivery"] {
        copy(&src.join(d), &dir.path().join("docs").join(d));
    }
    put(
        dir.path(),
        "docs/designs/screens.json",
        &fs::read_to_string(src.join("designs/screens.json")).unwrap(),
    );
    let f = layout_file(dir.path(), "StoryArc", "STORY", &BTreeMap::new());
    assert_eq!(f.path("diagrams"), "docs/drawings");
    assert_eq!(f.path("models"), "docs/diagrams");
    let a = list(dir.path(), &f);
    let n = |k: &str| a.iter().filter(|a| a.kind == k).count();
    assert_eq!(n("diagram"), 7, "the .mmd files of docs/drawings");
    assert!(n("model") >= 3, "the .c4 files of docs/diagrams");
    assert!(
        a.iter()
            .filter(|a| a.kind == "model")
            .all(|a| a.path.starts_with("docs/diagrams/"))
    );
    assert!(
        !madr::list(dir.path(), &f).is_empty(),
        "the ADRs of docs/decisions"
    );
    assert!(dir.path().join(f.path("specs")).join("changes").is_dir());
    assert!(design::read_screens(dir.path(), &f).is_ok());
}
