//! Mirror and atomic claims (spec `sync`, REQ-005, REQ-008, REQ-010, REQ-016).

use shipyard_core::pickup::{Ci, PrEvent, PrEventKind, PrState, PullSnapshot, SyncEvent, Ticket};
use shipyard_core::work_item::{Comment, Person, Status, StatusCategory, WorkItem, WorkKind};
use shipyard_store::mirror::{Mirror, Poll};

fn ticket(key: &str, status: &str) -> Ticket {
    let mut t = Ticket::new(WorkItem {
        key: key.into(),
        title: format!("title {key}"),
        description: "d".into(),
        kind: WorkKind::Task,
        status: Status {
            name: status.into(),
            category: StatusCategory::Todo,
        },
        assignee: None,
        labels: vec!["shipyard".into()],
        parent: None,
        url: format!("https://t/{key}"),
        updated: "2026-10-29T10:00:00Z".into(),
        time: None,
    });
    t.components = vec!["api".into()];
    t.priority = Some("High".into());
    t
}

fn pull(number: u64) -> PullSnapshot {
    PullSnapshot {
        number,
        title: "pr".into(),
        state: PrState::Open,
        draft: false,
        head_sha: "abc".into(),
        url: "u".into(),
        ci: Ci::Pending,
        changes_requested: false,
        updated: "2026-10-29T10:00:00Z".into(),
    }
}

fn comment_event(id: &str) -> SyncEvent {
    SyncEvent::Comment {
        key: "A-1".into(),
        comment: Comment {
            id: id.into(),
            author: Person {
                id: "u".into(),
                name: "n".into(),
            },
            body: "b".into(),
            created: "c".into(),
        },
        answers: Some("Q-001".into()),
    }
}

// ---- mirror (REQ-005)

#[test]
fn a_commit_stores_tickets_pulls_and_the_good_tick_in_one_step() {
    let m = Mirror::open_memory().unwrap();
    assert!(m.tickets("jira").unwrap().is_empty());
    assert_eq!(m.state("jira").unwrap().last_ok, None);
    m.commit(
        "jira",
        &Poll {
            tickets: &[ticket("A-1", "To Do"), ticket("A-2", "To Do")],
            pulls: &[pull(7)],
            seen: &[],
            events: &[],
            at: Some(1000),
        },
    )
    .unwrap();
    let got = m.tickets("jira").unwrap();
    assert_eq!(got.len(), 2);
    assert_eq!(
        got[0],
        ticket("A-1", "To Do"),
        "components and priority survive"
    );
    assert_eq!(m.ticket("jira", "A-2").unwrap().unwrap().item.key, "A-2");
    assert!(m.ticket("jira", "A-9").unwrap().is_none());
    assert_eq!(m.pulls("jira").unwrap(), [pull(7)]);
    let s = m.state("jira").unwrap();
    assert_eq!((s.last_ok, s.failures, s.error), (Some(1000), 0, None));
    // Another connection has its own rows.
    assert!(m.tickets("gh").unwrap().is_empty());
}

#[test]
fn a_commit_replaces_a_row_with_the_same_key() {
    let m = Mirror::open_memory().unwrap();
    for status in ["To Do", "Done"] {
        m.commit(
            "jira",
            &Poll {
                tickets: &[ticket("A-1", status)],
                pulls: &[],
                seen: &[],
                events: &[],
                at: Some(1),
            },
        )
        .unwrap();
    }
    let got = m.tickets("jira").unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].item.status.name, "Done");
}

#[test]
fn a_failed_poll_keeps_the_mirror_and_counts() {
    let m = Mirror::open_memory().unwrap();
    m.commit(
        "jira",
        &Poll {
            tickets: &[ticket("A-1", "To Do")],
            pulls: &[],
            seen: &[],
            events: &[],
            at: Some(500),
        },
    )
    .unwrap();
    m.mark_failed("jira", "timeout").unwrap();
    m.mark_failed("jira", "timeout 2").unwrap();
    let s = m.state("jira").unwrap();
    assert_eq!((s.last_ok, s.failures), (Some(500), 2));
    assert_eq!(s.error.as_deref(), Some("timeout 2"));
    assert_eq!(m.tickets("jira").unwrap().len(), 1);
    m.commit(
        "jira",
        &Poll {
            tickets: &[],
            pulls: &[],
            seen: &[],
            events: &[],
            at: Some(600),
        },
    )
    .unwrap();
    let s = m.state("jira").unwrap();
    assert_eq!((s.last_ok, s.failures, s.error), (Some(600), 0, None));
}

#[test]
fn seen_comments_are_kept_per_ticket() {
    let m = Mirror::open_memory().unwrap();
    assert!(m.seen("jira", "A-1").unwrap().is_empty());
    m.commit(
        "jira",
        &Poll {
            tickets: &[],
            pulls: &[],
            seen: &[("A-1".into(), vec!["c1".into(), "c2".into()])],
            events: &[],
            at: Some(1),
        },
    )
    .unwrap();
    let seen = m.seen("jira", "A-1").unwrap();
    assert!(seen.contains("c1") && seen.contains("c2"));
    assert!(m.seen("jira", "A-2").unwrap().is_empty());
}

#[test]
fn events_wait_in_the_outbox_until_they_are_acknowledged() {
    let m = Mirror::open_memory().unwrap();
    let pr = SyncEvent::Pr(PrEvent {
        number: 7,
        kind: PrEventKind::Merged,
        title: "t".into(),
        head_sha: "abc".into(),
        url: "u".into(),
    });
    m.commit(
        "jira",
        &Poll {
            tickets: &[],
            pulls: &[],
            seen: &[],
            events: &[comment_event("c1"), pr.clone()],
            at: Some(1),
        },
    )
    .unwrap();
    let pending = m.pending_events().unwrap();
    assert_eq!(pending.len(), 2);
    assert_eq!(pending[0].1, comment_event("c1"));
    assert_eq!(pending[1].1, pr);
    m.ack(pending[0].0).unwrap();
    let left = m.pending_events().unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].1, pr);
}

#[test]
fn adopted_tickets_and_links_persist() {
    let m = Mirror::open_memory().unwrap();
    assert!(m.adopted("jira").unwrap().is_empty());
    m.adopt("jira", "A-1").unwrap();
    m.adopt("jira", "A-1").unwrap();
    assert_eq!(m.adopted("jira").unwrap(), ["A-1"]);
    m.link("jira", "local-1", "A-1").unwrap();
    assert_eq!(
        m.links("jira").unwrap(),
        [("local-1".to_string(), "A-1".to_string())]
    );
    // One ticket, one local item. One local item, one ticket.
    assert!(m.link("jira", "local-2", "A-1").is_err());
    assert!(m.link("jira", "local-1", "A-2").is_err());
    m.link("jira", "local-1", "A-1").unwrap();
    assert!(m.unlink("jira", "local-1").unwrap());
    assert!(!m.unlink("jira", "local-1").unwrap());
    m.link("jira", "local-2", "A-1").unwrap();
}

#[test]
fn the_mirror_survives_a_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("data").join("mirror.sqlite");
    {
        let m = Mirror::open(&path).unwrap();
        m.commit(
            "jira",
            &Poll {
                tickets: &[ticket("A-1", "To Do")],
                pulls: &[],
                seen: &[],
                events: &[],
                at: Some(9),
            },
        )
        .unwrap();
        assert!(m.claim("jira", "A-1", "m1", "To Do", true, 5).unwrap());
    }
    let m = Mirror::open(&path).unwrap();
    assert_eq!(m.tickets("jira").unwrap().len(), 1);
    assert_eq!(m.claims("jira").unwrap().len(), 1);
}

// ---- claims (REQ-008, REQ-010)

#[test]
fn the_second_claim_of_a_ticket_fails() {
    let m = Mirror::open_memory().unwrap();
    assert!(m.claim("jira", "A-1", "m1", "To Do", false, 10).unwrap());
    assert!(!m.claim("jira", "A-1", "m1", "To Do", false, 11).unwrap());
    // Another ticket, another connection: free.
    assert!(m.claim("jira", "A-2", "m1", "To Do", false, 11).unwrap());
    assert!(m.claim("gh", "A-1", "m1", "To Do", false, 11).unwrap());
    let c = m.claims("jira").unwrap();
    assert_eq!(c.len(), 2);
    assert_eq!(c[0].key, "A-1");
    assert_eq!(
        (
            c[0].machine.as_str(),
            c[0].status.as_str(),
            c[0].stamped,
            c[0].claimed_at
        ),
        ("m1", "To Do", false, 10)
    );
}

#[test]
fn two_connections_to_one_file_race_and_one_wins() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("mirror.sqlite");
    Mirror::open(&path).unwrap();
    let wins: usize = std::thread::scope(|s| {
        let handles: Vec<_> = (0..8)
            .map(|i| {
                let path = path.clone();
                s.spawn(move || {
                    let m = Mirror::open(&path).unwrap();
                    m.claim("jira", "A-1", &format!("m{i}"), "To Do", false, 1)
                        .unwrap()
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|h| usize::from(h.join().unwrap()))
            .sum()
    });
    assert_eq!(wins, 1);
}

#[test]
fn release_frees_the_ticket_and_stamped_is_updatable() {
    let m = Mirror::open_memory().unwrap();
    assert!(m.claim("jira", "A-1", "m1", "To Do", false, 10).unwrap());
    m.set_stamped("jira", "A-1", true).unwrap();
    assert!(m.claims("jira").unwrap()[0].stamped);
    assert!(m.release("jira", "A-1").unwrap());
    assert!(!m.release("jira", "A-1").unwrap());
    assert!(m.claims("jira").unwrap().is_empty());
    assert!(m.claim("jira", "A-1", "m1", "To Do", false, 20).unwrap());
}

#[test]
fn put_tickets_and_record_leave_the_tick_cursor_alone() {
    let m = Mirror::open_memory().unwrap();
    m.put_tickets("jira", &[ticket("A-1", "To Do")]).unwrap();
    m.record(
        "jira",
        &[("A-1".into(), vec!["c1".into()])],
        &[comment_event("c1")],
    )
    .unwrap();
    assert_eq!(m.tickets("jira").unwrap().len(), 1);
    assert!(m.seen("jira", "A-1").unwrap().contains("c1"));
    assert_eq!(m.pending_events().unwrap().len(), 1);
    assert_eq!(m.state("jira").unwrap().last_ok, None);
}

#[test]
fn the_fingerprint_moves_with_a_ticket_a_pull_request_and_a_link() {
    let m = Mirror::open_memory().unwrap();
    let mut last = m.fingerprint("t").unwrap();
    let mut moved = |m: &Mirror| {
        let now = m.fingerprint("t").unwrap();
        assert_ne!(last, now);
        last = now;
    };
    m.put_tickets("t", &[ticket("A-1", "To Do")]).unwrap();
    moved(&m);
    // A changed row replaces the row.
    m.put_tickets("t", &[ticket("A-1", "Done")]).unwrap();
    moved(&m);
    m.link("t", "change:x", "A-1").unwrap();
    moved(&m);
    m.unlink("t", "change:x").unwrap();
    moved(&m);
    m.commit(
        "t",
        &Poll {
            tickets: &[],
            pulls: &[pull(7)],
            seen: &[],
            events: &[],
            at: Some(1),
        },
    )
    .unwrap();
    moved(&m);
    // Another source does not move it.
    let before = m.fingerprint("t").unwrap();
    m.put_tickets("other", &[ticket("B-1", "To Do")]).unwrap();
    assert_eq!(m.fingerprint("t").unwrap(), before);
}

// ---- cursor of a cut-off poll, import guard, question comments

#[test]
fn a_cut_off_poll_keeps_the_cursor_and_clears_the_failures() {
    let m = Mirror::open_memory().unwrap();
    let poll = |at| Poll {
        tickets: &[],
        pulls: &[],
        seen: &[],
        events: &[],
        at,
    };
    m.commit("jira", &poll(Some(100))).unwrap();
    m.mark_failed("jira", "offline").unwrap();
    m.commit("jira", &poll(None)).unwrap();
    let s = m.state("jira").unwrap();
    assert_eq!((s.last_ok, s.failures, s.error), (Some(100), 0, None));
    m.commit("gh", &poll(None)).unwrap();
    assert_eq!(m.state("gh").unwrap().last_ok, None);
}

#[test]
fn a_put_that_is_not_newer_leaves_the_row() {
    let m = Mirror::open_memory().unwrap();
    let mut newer = ticket("A-1", "In Progress");
    newer.item.updated = "2026-10-29T12:00:00Z".into();
    m.put_tickets("jira", &[newer]).unwrap();
    let older = [ticket("A-1", "To Do"), ticket("A-2", "To Do")];
    assert_eq!(m.put_tickets_newer("jira", &older).unwrap(), 1);
    assert_eq!(
        m.ticket("jira", "A-1").unwrap().unwrap().item.status.name,
        "In Progress"
    );
    assert!(m.ticket("jira", "A-2").unwrap().is_some());
}

#[test]
fn the_comment_ids_of_the_questions_that_the_system_posted_are_kept_per_ticket() {
    let m = Mirror::open_memory().unwrap();
    m.question_posted("jira", "A-1", "11").unwrap();
    m.question_posted("jira", "A-1", "11").unwrap();
    m.question_posted("jira", "A-2", "12").unwrap();
    assert_eq!(m.questions("jira", "A-1").unwrap().len(), 1);
    assert!(m.questions("jira", "A-1").unwrap().contains("11"));
    assert!(m.questions("gh", "A-1").unwrap().is_empty());
}
