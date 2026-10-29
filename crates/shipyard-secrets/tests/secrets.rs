//! REQ-011, REQ-014: a secret never prints; delete leaves nothing.

use shipyard_secrets::{Keychain, MemoryStore, Secret, SecretStore, conn_account};

const TOKEN: &str = "tok-abc-123-XYZ";

#[derive(Debug)]
struct Holder {
    #[allow(dead_code)]
    token: Secret,
}

#[test]
fn debug_and_display_never_print_the_value() {
    let s = Secret::new(TOKEN);
    let holder = Holder { token: s.clone() };
    for text in [
        format!("{s:?}"),
        format!("{s}"),
        format!("{holder:?}"),
        format!("{holder:#?}"),
    ] {
        assert!(!text.contains(TOKEN), "leaked: {text}");
    }
    assert_eq!(s.expose(), TOKEN);
}

#[test]
fn scrub_masks_every_occurrence() {
    let s = Secret::new(TOKEN);
    let out = s.scrub(&format!("a {TOKEN} b {TOKEN}"));
    assert_eq!(out, "a *** b ***");
    assert_eq!(Secret::new("").scrub("keep"), "keep");
}

#[test]
fn store_round_trip_and_idempotent_delete() {
    let store = MemoryStore::default();
    let account = conn_account("jira-1");
    assert_eq!(account, "conn:jira-1");
    assert!(store.get(&account).unwrap().is_none());
    store.set(&account, &Secret::new(TOKEN)).unwrap();
    assert_eq!(store.get(&account).unwrap().unwrap().expose(), TOKEN);
    store.delete(&account).unwrap();
    store.delete(&account).unwrap();
    assert!(store.get(&account).unwrap().is_none());
}

#[test]
fn keychain_maps_a_missing_entry_to_none() {
    // The mock builder keeps nothing between entries: it proves the NoEntry mapping only.
    keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    let kc = Keychain;
    assert!(kc.get("conn:absent").unwrap().is_none());
    kc.delete("conn:absent").unwrap();
}
