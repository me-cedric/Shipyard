//! Flow table tests (spec `design` REQ-016 to REQ-018).

use shipyard_core::flows::{Action, Filter, FlowRow, add, check, filter, remove, update};

fn row(id: u32, network: &str, protocol: &str, action: Action) -> FlowRow {
    FlowRow {
        id,
        source: "web".into(),
        destination: "db".into(),
        network: network.into(),
        protocol: protocol.into(),
        port: Some("5432".into()),
        action,
        note: None,
        name: None,
        subnet: None,
        source_name: None,
        destination_name: None,
    }
}

fn table() -> Vec<FlowRow> {
    vec![
        row(1, "VLAN10", "TCP", Action::Allow),
        row(2, "VLAN10", "TCP", Action::Deny),
        row(3, "VLAN20", "UDP", Action::Deny),
        row(4, "VNET1", "TCP", Action::Allow),
    ]
}

fn ids(rows: &[FlowRow]) -> Vec<u32> {
    rows.iter().map(|r| r.id).collect()
}

#[test]
fn check_names_the_missing_field() {
    let mut r = row(1, "VLAN10", "  ", Action::Allow);
    assert_eq!(check(&r), Err("missing field: protocol".into()));
    r.protocol = "TCP".into();
    r.source = String::new();
    assert_eq!(check(&r), Err("missing field: source".into()));
    r.source = "web".into();
    r.port = None;
    assert_eq!(check(&r), Ok(()));
}

#[test]
fn filters_combine() {
    let f = Filter {
        network: Some("vlan10".into()),
        action: Some(Action::Deny),
        ..Filter::default()
    };
    assert_eq!(ids(&filter(&table(), &f)), vec![2]);
}

#[test]
fn empty_filter_keeps_every_row() {
    assert_eq!(filter(&table(), &Filter::default()).len(), 4);
}

#[test]
fn protocol_filter_and_text_filter() {
    let f = Filter {
        protocol: Some("udp".into()),
        ..Filter::default()
    };
    assert_eq!(ids(&filter(&table(), &f)), vec![3]);
    let mut rows = table();
    rows[3].note = Some("Backup LINK".into());
    let f = Filter {
        text: Some("backup".into()),
        ..Filter::default()
    };
    assert_eq!(ids(&filter(&rows, &f)), vec![4]);
}

#[test]
fn add_takes_the_next_free_id() {
    let rows = add(&table(), row(0, "VLAN30", "TCP", Action::Allow)).unwrap();
    assert_eq!(ids(&rows), vec![1, 2, 3, 4, 5]);
    assert_eq!(
        add(&[], row(9, "VLAN30", "TCP", Action::Allow)).unwrap()[0].id,
        1
    );
}

#[test]
fn add_rejects_a_row_with_no_protocol() {
    let err = add(&table(), row(0, "VLAN30", "", Action::Allow)).unwrap_err();
    assert_eq!(err, "missing field: protocol");
}

#[test]
fn update_replaces_by_id() {
    let rows = update(&table(), row(2, "VLAN10", "TCP", Action::Allow)).unwrap();
    assert_eq!(rows[1].action, Action::Allow);
    assert!(update(&table(), row(9, "VLAN10", "TCP", Action::Allow)).is_err());
    assert!(update(&table(), row(2, "", "TCP", Action::Allow)).is_err());
}

#[test]
fn remove_drops_by_id() {
    assert_eq!(ids(&remove(&table(), 2).unwrap()), vec![1, 3, 4]);
    assert!(remove(&table(), 9).is_err());
}

#[test]
fn row_type_is_camel_case_in_serde() {
    let t = serde_json::to_string(&row(1, "VLAN10", "TCP", Action::Allow)).unwrap();
    assert!(t.contains("\"action\":\"allow\""), "{t}");
}

#[test]
fn add_gives_a_bare_address_a_32_mask_and_keeps_a_name() {
    let mut r = row(0, "VLAN10", "TCP", Action::Allow);
    r.source = " 10.0.1.5 ".into();
    r.destination = "Internet".into();
    let rows = add(&[], r).unwrap();
    assert_eq!(rows[0].source, "10.0.1.5/32");
    assert_eq!(rows[0].destination, "Internet");
    let mut r = row(1, "VLAN10", "TCP", Action::Allow);
    r.source = "10.0.1.0/24".into();
    assert_eq!(update(&rows, r).unwrap()[0].source, "10.0.1.0/24");
}

#[test]
fn check_rejects_a_malformed_address() {
    for bad in [
        "10.0.1.256",
        "10.0.1.0/33",
        "10.0.1.",
        "10.0.1.0/",
        "01.0.0.1",
    ] {
        let mut r = row(1, "VLAN10", "TCP", Action::Allow);
        r.destination = bad.into();
        assert_eq!(
            check(&r),
            Err(format!("invalid destination: {bad}")),
            "{bad}"
        );
        assert!(add(&[], r).is_err(), "{bad}");
    }
}

#[test]
fn action_reads_a_capitalized_value() {
    let a: Action = serde_json::from_str("\"Deny\"").unwrap();
    assert_eq!(a, Action::Deny);
}
