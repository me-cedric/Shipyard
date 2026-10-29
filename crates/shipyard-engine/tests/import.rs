//! Adopt, link and import (spec `sync`, REQ-015).

mod common;

use common::{World, auto, secs};
use shipyard_core::work_item::StatusCategory;
use shipyard_engine::fake::{ticket, todo};

fn world_with(n: usize) -> World {
    let w = World::new();
    w.tracker.set_page_size(50);
    for i in 1..=n {
        w.tracker.put(todo(&format!("A-{i:03}")));
    }
    w
}

#[test]
fn the_import_shows_the_count_before_it_writes_anything() {
    let w = world_with(120);
    // A closed ticket is not part of the open backlog.
    w.tracker.put(ticket("A-999", "Done", StatusCategory::Done));
    let m = w.machine("m1", auto(false));
    let plan = m.engine.import_plan().unwrap();
    assert_eq!(plan.count(), 120);
    assert!(
        m.engine.mirror().tickets("jira").unwrap().is_empty(),
        "nothing is written yet"
    );
    assert_eq!(m.engine.import(&plan).unwrap(), 120);
    assert_eq!(m.engine.mirror().tickets("jira").unwrap().len(), 120);
}

#[test]
fn an_import_does_not_move_the_tick_cursor() {
    let w = world_with(3);
    let mut m = w.machine("m1", auto(false));
    let plan = m.engine.import_plan().unwrap();
    m.engine.import(&plan).unwrap();
    assert_eq!(m.engine.mirror().state("jira").unwrap().last_ok, None);
    // The first tick still reads the open tickets, then the changes.
    m.engine.tick(false).unwrap();
    assert_eq!(w.tracker.queries().last().unwrap().since, None);
    assert!(m.engine.mirror().state("jira").unwrap().last_ok.is_some());
}

#[test]
fn an_import_does_not_overwrite_a_row_that_a_tick_made_newer() {
    let w = world_with(2);
    let mut m = w.machine("m1", auto(false));
    let plan = m.engine.import_plan().unwrap();
    // The tracker moves on and a tick reads it before the person confirms.
    w.tracker.update("A-001", "2026-10-29T12:00:00Z", |t| {
        t.item.status.name = "In Progress".into();
    });
    w.clock.advance(secs(70));
    m.engine.tick(true).unwrap();
    assert_eq!(
        m.engine.import(&plan).unwrap(),
        1,
        "only A-002 is not newer"
    );
    let mirror = m.engine.mirror();
    let row = mirror.ticket("jira", "A-001").unwrap().unwrap();
    assert_eq!(row.item.status.name, "In Progress");
}

#[test]
fn a_list_that_never_ends_stops_the_import_and_the_tick() {
    let w = world_with(2);
    w.tracker.set_endless(true);
    let mut m = w.machine("m1", auto(false));
    assert!(m.engine.import_plan().is_err());
    // A tick reads at most 20 pages, keeps what it has and says so.
    let r = m.engine.tick(false).unwrap();
    assert!(r.errors.iter().any(|e| e.contains("20 pages")), "{r:?}");
    assert_eq!(m.engine.mirror().tickets("jira").unwrap().len(), 2);
    assert_eq!(w.log.count("list"), 1000 + 20);
    // A cut-off poll leaves items unread: the cursor does not move past them.
    assert_eq!(m.engine.mirror().state("jira").unwrap().last_ok, None);
}

#[test]
fn adopt_reads_the_ticket_and_the_tick_keeps_it_current() {
    let w = World::new();
    // A ticket that the list leaves out: it is in the mirror only because a person adopted it.
    let mut t = ticket("B-1", "To Do", StatusCategory::Todo);
    t.item.labels.clear();
    t.item.updated = "2020-01-01T00:00:00Z".into();
    w.tracker.put(t);
    let mut m = w.machine("m1", auto(false));
    let got = m.engine.adopt("B-1").unwrap();
    assert_eq!(got.item.key, "B-1");
    assert_eq!(m.engine.mirror().adopted("jira").unwrap(), ["B-1"]);
    assert!(m.engine.adopt("NOPE-1").is_err());
    m.engine.tick(false).unwrap();
    w.clock.advance(secs(70));
    // The list asks for items since the last poll, so it leaves B-1 out. The tick reads it by key.
    w.tracker.update("B-1", "2020-01-02T00:00:00Z", |t| {
        t.item.title = "renamed".into()
    });
    m.engine.tick(false).unwrap();
    let mirrored = m.engine.mirror().ticket("jira", "B-1").unwrap().unwrap();
    assert_eq!(mirrored.item.title, "renamed");
}

#[test]
fn link_ties_one_local_item_to_one_ticket_and_adopts_a_missing_ticket() {
    let w = world_with(1);
    w.tracker.put(todo("B-1"));
    let m = w.machine("m1", auto(false));
    m.engine.link("local-1", "B-1").unwrap();
    assert!(
        m.engine.mirror().ticket("jira", "B-1").unwrap().is_some(),
        "adopted by the link"
    );
    assert_eq!(m.engine.mirror().adopted("jira").unwrap(), ["B-1"]);
    m.engine.link("local-1", "B-1").unwrap();
    assert!(m.engine.link("local-2", "B-1").is_err());
    assert!(m.engine.link("local-1", "A-001").is_err());
    assert!(m.engine.link("local-3", "NOPE-1").is_err());
    assert!(m.engine.unlink("local-1").unwrap());
    m.engine.link("local-2", "B-1").unwrap();
}
