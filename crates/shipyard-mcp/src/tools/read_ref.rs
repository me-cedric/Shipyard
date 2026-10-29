//! The `read_ref` tool (spec `refs`, REQ-014). It reads the index and writes nothing.

use serde::Serialize;
use shipyard_store::ref_index::RefIndex;
use shipyard_store::ref_query::{BacklinkGroup, Resolved};

#[derive(Debug, Serialize)]
pub struct ReadRef {
    #[serde(flatten)]
    pub resolved: Resolved,
    pub backlinks: Vec<BacklinkGroup>,
}

/// The title, the state, the location and the backlinks of a ref.
/// A ref with no target returns an unresolved result. Text that is not a ref is an error.
pub fn read_ref(index: &RefIndex, text: &str) -> Result<ReadRef, String> {
    let resolved = index
        .resolve(text)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("not a ref: {text}"))?;
    let backlinks = index.backlinks(text).map_err(|e| e.to_string())?;
    Ok(ReadRef {
        resolved,
        backlinks,
    })
}
