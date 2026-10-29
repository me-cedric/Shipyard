//! The draft split of a change into epics and stories (spec `specs`, REQ-016, REQ-017, REQ-019).
//! No I/O.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::refs::parse;
use crate::specs::requirements;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Epic,
    Story,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub row_id: String,
    pub kind: Kind,
    pub title: String,
    pub description: String,
    /// The `spec:<capability>#REQ-NNN` refs that the item covers.
    pub reqs: Vec<String>,
    /// The row id of the epic of a story.
    pub parent: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub change: String,
    pub items: Vec<Item>,
}

/// The match mark of an item for the apply of `add-work`.
pub fn row_ref(change: &str, row_id: &str) -> String {
    format!("est:{change}#{row_id}")
}

/// One epic for each capability and one story for each requirement.
pub fn draft(change: &str, specs: &[(String, String)]) -> Draft {
    let mut items = Vec::new();
    for (cap, text) in specs {
        let reqs = requirements(text);
        items.push(Item {
            row_id: cap.clone(),
            kind: Kind::Epic,
            title: cap.clone(),
            description: String::new(),
            reqs: reqs
                .iter()
                .map(|r| format!("spec:{cap}#{}", r.id))
                .collect(),
            parent: None,
        });
        items.extend(reqs.into_iter().map(|r| Item {
            row_id: format!("{cap}-{}", r.id.to_lowercase()),
            kind: Kind::Story,
            title: r.title,
            description: String::new(),
            reqs: vec![format!("spec:{cap}#{}", r.id)],
            parent: Some(cap.clone()),
        }));
    }
    Draft {
        change: change.into(),
        items,
    }
}

/// The problems that block the apply. An empty list means the draft is fit for review.
pub fn check(d: &Draft, known_reqs: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for (i, it) in d.items.iter().enumerate() {
        let id = &it.row_id;
        if parse(&row_ref(&d.change, id)).is_none() {
            out.push(format!("{id}: invalid row id"));
        }
        if d.items[..i].iter().any(|o| o.row_id == *id) {
            out.push(format!("{id}: duplicate row id"));
        }
        if it.kind == Kind::Story {
            let epic = it
                .parent
                .as_ref()
                .and_then(|p| d.items.iter().find(|o| o.row_id == *p));
            match epic {
                None => out.push(format!("{id}: parent missing")),
                Some(e) if e.kind != Kind::Epic => out.push(format!("{id}: parent is not an epic")),
                _ => {}
            }
        }
        if it.reqs.is_empty() {
            out.push(format!("{id}: cites no ref"));
        }
        out.extend(
            it.reqs
                .iter()
                .filter(|r| !known_reqs.contains(r))
                .map(|r| format!("{id}: unknown ref {r}")),
        );
    }
    out
}

/// Removes an item and the stories under it.
pub fn remove(d: &mut Draft, row_id: &str) {
    d.items
        .retain(|i| i.row_id != row_id && i.parent.as_deref() != Some(row_id));
}

/// The ticket text: the description and the refs of the requirements (REQ-019).
pub fn description(it: &Item) -> String {
    let refs = format!("Requirements: {}", it.reqs.join(", "));
    match it.description.as_str() {
        "" => refs,
        d => format!("{d}\n\n{refs}"),
    }
}
