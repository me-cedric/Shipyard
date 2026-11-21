//! "Ask an agent to estimate" (spec `app-redesign`, REQ-030): the prompt for the selected tasks
//! of a sheet, and the check of the answer. No I/O. The prompt holds the tasks and no money: no
//! day rate, no margin, no currency, no price.

use serde_json::Value;
use shipyard_core::work::Sheet;

/// What the agent proposes for one task, in days. Nothing here is in the sheet.
#[derive(Debug, Clone, PartialEq)]
pub struct Proposal {
    pub task: String,
    pub best: f64,
    pub likely: f64,
    pub worst: f64,
    pub assumptions: Vec<String>,
}

/// The prompt that asks for a best, a likely and a worst value for each task of `ids`.
pub fn prompt(sheet: &Sheet, ids: &[String]) -> String {
    let mut t = String::from(
        "Estimate the effort of each task below, in person days. Read the repository when it \
         helps. Do not edit files.\n\nTasks:\n",
    );
    for (feature, task) in sheet.tasks().filter(|(_, x)| ids.contains(&x.id)) {
        t.push_str(&format!(
            "\n- id: {}\n  feature: {}\n  task: {}\n  role: {}\n",
            task.id, feature.name, task.name, task.role
        ));
        for (label, text) in [
            ("description", &task.description),
            ("note", &task.note),
            ("assumptions", &task.assumptions),
        ] {
            if !text.trim().is_empty() {
                t.push_str(&format!("  {label}: {}\n", text.trim()));
            }
        }
    }
    t.push_str(
        "\nAnswer with one JSON object and nothing else: {\"estimates\": [{\"task\": the id, \
         \"best\": days, \"likely\": days, \"worst\": days, \"assumptions\": [one short sentence \
         for each thing that the estimate takes for granted]}]}. Use best <= likely <= worst.\n",
    );
    t
}

/// The proposals of the answer, in the order of `ids`. It drops a task that was not asked, a
/// value that is not a number or is below zero, and values that are not best <= likely <= worst.
pub fn parse(text: &str, ids: &[String]) -> Result<Vec<Proposal>, String> {
    const NONE: &str = "the agent proposed no estimate";
    let (start, end) = (text.find('{'), text.rfind('}'));
    let (Some(start), Some(end)) = (start, end.filter(|e| Some(*e) > start)) else {
        return Err(NONE.into());
    };
    let v: Value = serde_json::from_str(&text[start..=end]).map_err(|_| NONE.to_string())?;
    let rows = v["estimates"].as_array().cloned().unwrap_or_default();
    let days = |row: &Value, key: &str| row[key].as_f64().filter(|n| n.is_finite() && *n >= 0.0);
    let out: Vec<Proposal> = ids
        .iter()
        .filter_map(|id| {
            rows.iter().find_map(|row| {
                if row["task"].as_str() != Some(id) {
                    return None;
                }
                let (best, likely, worst) = (
                    days(row, "best")?,
                    days(row, "likely")?,
                    days(row, "worst")?,
                );
                (best <= likely && likely <= worst).then(|| Proposal {
                    task: id.clone(),
                    best,
                    likely,
                    worst,
                    assumptions: row["assumptions"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|a| Some(a.as_str()?.trim().to_string()))
                        .filter(|a| !a.is_empty())
                        .collect(),
                })
            })
        })
        .collect();
    if out.is_empty() {
        return Err(NONE.into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use shipyard_core::work::{Feature, Task};

    use super::*;

    fn sheet() -> Sheet {
        let task = |id: &str| Task {
            id: id.into(),
            name: format!("Task {id}"),
            role: "dev".into(),
            days: Some(41.0),
            note: "Keep the old API".into(),
            ..Default::default()
        };
        Sheet {
            name: "Lot".into(),
            currency: "EUR".into(),
            margin_rate: 0.15,
            features: vec![Feature {
                id: "f".into(),
                name: "Sign in".into(),
                description: String::new(),
                tasks: vec![task("a"), task("b"), task("c")],
            }],
            frozen: false,
        }
    }

    fn ids(all: &[&str]) -> Vec<String> {
        all.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_prompt_names_the_selected_tasks_and_holds_no_money() {
        let p = prompt(&sheet(), &ids(&["a", "c"]));
        assert!(p.contains("id: a") && p.contains("id: c") && !p.contains("id: b"));
        assert!(p.contains("Sign in") && p.contains("Keep the old API"));
        for money in ["EUR", "0.15", "rate", "price", "margin", "41"] {
            assert!(!p.contains(money), "{money}");
        }
    }

    #[test]
    fn the_answer_gives_three_values_and_the_assumptions_of_each_task() {
        let text = r#"Here: {"estimates":[
            {"task":"b","best":1,"likely":2.5,"worst":4,"assumptions":["One API"," "]},
            {"task":"a","best":0,"likely":0,"worst":0}]}"#;
        let out = parse(text, &ids(&["a", "b"])).unwrap();
        assert_eq!(out.len(), 2);
        assert_eq!((out[0].task.as_str(), out[0].worst), ("a", 0.0));
        assert!(out[0].assumptions.is_empty());
        assert_eq!((out[1].best, out[1].likely, out[1].worst), (1.0, 2.5, 4.0));
        assert_eq!(out[1].assumptions, ["One API"]);
    }

    #[test]
    fn a_bad_row_is_dropped_and_an_answer_with_no_good_row_is_an_error() {
        let text = r#"{"estimates":[
            {"task":"x","best":1,"likely":2,"worst":3},
            {"task":"a","best":"1","likely":2,"worst":3},
            {"task":"b","best":-1,"likely":2,"worst":3},
            {"task":"c","best":3,"likely":2,"worst":4},
            {"task":"c","best":1,"likely":2,"worst":4}]}"#;
        let out = parse(text, &ids(&["a", "b", "c"])).unwrap();
        // The second row of `c` is in order: it is the proposal of `c`.
        assert_eq!(out.len(), 1);
        assert_eq!((out[0].task.as_str(), out[0].best), ("c", 1.0));
        assert!(parse(text, &ids(&["a", "b"])).is_err());
        assert!(parse("no json", &ids(&["a"])).is_err());
        assert!(
            parse(
                r#"{"estimates":[{"task":"a","best":1,"likely":2,"worst":1}]}"#,
                &ids(&["a"])
            )
            .is_err()
        );
    }
}
