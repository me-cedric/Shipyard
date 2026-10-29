//! Hand-off of comments and pull request events (spec `sync`, REQ-011, REQ-012).
//!
//! The compare step queues each event in the outbox of the mirror, in the same transaction as the
//! mirror update. The hand-off step sends the queue and removes an event once the listener took
//! it. A crash or a refusal keeps the event for the next tick: an event is never lost, and a
//! normal tick sends it once.

use std::collections::HashSet;

use shipyard_core::pickup::{SyncEvent, answers};
use shipyard_core::work_item::Comment;
use shipyard_store::mirror::Mirror;

use crate::Result;
use crate::ports::Dispatch;

/// Stored with the seen comment ids of a ticket after its first scan.
pub const BASELINE: &str = "#baseline";

/// The new comments of a ticket as events, and the ids to remember.
///
/// The first scan of a ticket is a baseline: the comments that exist already are not new, so they
/// are remembered and not sent. An answer to a question marker is sent anyway: the question may
/// be older than the mirror.
pub fn comment_events(
    key: &str,
    comments: &[Comment],
    seen: &HashSet<String>,
) -> (Vec<SyncEvent>, Vec<String>) {
    let first = !seen.contains(BASELINE);
    let (mut events, mut ids) = (Vec::new(), Vec::new());
    for (c, answers) in comments.iter().zip(answers(comments)) {
        if seen.contains(&c.id) {
            continue;
        }
        ids.push(c.id.clone());
        if first && answers.is_none() {
            continue;
        }
        events.push(SyncEvent::Comment {
            key: key.into(),
            comment: c.clone(),
            answers: answers.map(str::to_string),
        });
    }
    if first {
        ids.push(BASELINE.into());
    }
    (events, ids)
}

/// Send the queued events, oldest first. It stops at the first refusal and keeps the rest in
/// order. Returns the count sent.
pub fn deliver(mirror: &Mirror, dispatch: &dyn Dispatch, errors: &mut Vec<String>) -> Result<u32> {
    let mut sent = 0;
    for (id, event) in mirror.pending_events()? {
        match dispatch.event(&event) {
            Ok(()) => {
                mirror.ack(id)?;
                sent += 1;
            }
            Err(e) => {
                errors.push(format!("hand-off: {e}"));
                break;
            }
        }
    }
    Ok(sent)
}
