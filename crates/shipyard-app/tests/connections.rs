//! The connection store and the `conn:` entity (spec `connections`, REQ-011, REQ-013 to REQ-015).
//! A memory keychain and a fake HTTP client stand in for the OS and the network.

use std::sync::Arc;

use shipyard_app::connections::{
    ConnectionDraft, ConnectionGroup, ConnectionKind, ConnectionState, Connections,
};
use shipyard_core::work_item::Capability;
use shipyard_http::TestOutcome;
use shipyard_http::fake::FakeHttp;
use shipyard_secrets::{MemoryStore, Secret, SecretError, SecretStore};

const TOKEN: &str = "tok-store-secret-4242";

struct Fixture {
    dir: tempfile::TempDir,
    keys: Arc<MemoryStore>,
    http: Arc<FakeHttp>,
    conns: Connections,
}

fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let keys = Arc::new(MemoryStore::default());
    let http = Arc::new(FakeHttp::new());
    let conns = Connections::new(dir.path(), keys.clone(), http.clone());
    Fixture {
        dir,
        keys,
        http,
        conns,
    }
}

fn draft(name: &str, group: ConnectionGroup, kind: ConnectionKind, url: &str) -> ConnectionDraft {
    ConnectionDraft {
        name: name.into(),
        group,
        kind,
        url: url.into(),
        user: None,
    }
}

fn github(name: &str) -> ConnectionDraft {
    draft(
        name,
        ConnectionGroup::Tracker,
        ConnectionKind::GitHub,
        "https://github.com",
    )
}

fn forge(name: &str) -> ConnectionDraft {
    draft(
        name,
        ConnectionGroup::Forge,
        ConnectionKind::GitHub,
        "https://github.com",
    )
}

fn stored(f: &Fixture, account: &str) -> Option<String> {
    f.keys.get(account).unwrap().map(|s| s.expose().to_string())
}

#[test]
fn an_empty_store_lists_nothing() {
    assert!(fixture().conns.list().unwrap().is_empty());
}

#[test]
fn a_tracker_shows_its_flags_and_a_forge_shows_none() {
    let f = fixture();
    let t = f.conns.add(github("Issues")).unwrap();
    let caps = t.capabilities.unwrap();
    assert!(caps.has(Capability::Comments));
    assert!(!caps.has(Capability::TimeTracking));
    assert_eq!(f.conns.add(forge("Code")).unwrap().capabilities, None);
    assert_eq!(f.conns.list().unwrap().len(), 2);
}

#[test]
fn the_id_is_a_slug_and_stays_unique() {
    let f = fixture();
    assert_eq!(
        f.conns.add(github("Acme Issues")).unwrap().id,
        "acme-issues"
    );
    assert_eq!(
        f.conns.add(github("Acme Issues")).unwrap().id,
        "acme-issues-2"
    );
    let linear = draft("***", ConnectionGroup::Tracker, ConnectionKind::Linear, "");
    assert_eq!(f.conns.add(linear).unwrap().id, "linear");
}

#[test]
fn a_bad_draft_is_refused_and_nothing_is_saved() {
    let f = fixture();
    let bad = [
        github("  "),
        draft(
            "A",
            ConnectionGroup::Tracker,
            ConnectionKind::GitHub,
            "http://github.com",
        ),
        draft(
            "A",
            ConnectionGroup::Tracker,
            ConnectionKind::GitHub,
            "https://u:p@github.com",
        ),
        // Jira Cloud needs the account email.
        draft(
            "A",
            ConnectionGroup::Tracker,
            ConnectionKind::JiraCloud,
            "https://acme.atlassian.net",
        ),
        // Linear is not a forge.
        draft("A", ConnectionGroup::Forge, ConnectionKind::Linear, ""),
    ];
    for d in bad {
        assert!(f.conns.add(d).is_err());
    }
    assert!(f.conns.list().unwrap().is_empty());
}

#[test]
fn an_edit_keeps_the_kind_and_resets_the_state_when_the_address_changes() {
    let f = fixture();
    let c = f.conns.add(github("One")).unwrap();
    f.conns.set_secret(&c.id, Secret::new(TOKEN)).unwrap();
    f.http.get("/user", 200, r#"{"login":"ada","name":"Ada"}"#);
    f.http.get("/issues", 200, "[]");
    assert!(matches!(
        f.conns.test(&c.id).unwrap(),
        TestOutcome::Passed { .. }
    ));
    // A new name keeps the state.
    let mut d = github("Renamed");
    let c = f.conns.edit(&c.id, d.clone()).unwrap();
    assert_eq!(
        (c.name.as_str(), c.state, c.secret),
        ("Renamed", ConnectionState::Passed, true)
    );
    // A new address resets it.
    d.url = "https://ghe.example.com".into();
    assert_eq!(
        f.conns.edit(&c.id, d).unwrap().state,
        ConnectionState::Untested
    );
    // The kind is fixed.
    assert!(f.conns.edit(&c.id, forge("Renamed")).is_err());
    assert!(f.conns.edit("none", github("x")).is_err());
}

#[test]
fn a_secret_goes_to_the_keychain_and_to_no_file_and_no_view() {
    let f = fixture();
    let c = f.conns.add(github("One")).unwrap();
    assert!(!c.secret);
    let c = f
        .conns
        .set_secret(&c.id, Secret::new(format!("  {TOKEN}\n")))
        .unwrap();
    assert!(c.secret);
    // The keychain holds the trimmed value under the `conn:<id>` account.
    assert_eq!(stored(&f, "conn:one").as_deref(), Some(TOKEN));
    // No file in the app data folder and no view holds it (REQ-011).
    for entry in std::fs::read_dir(f.dir.path()).unwrap() {
        let text = std::fs::read_to_string(entry.unwrap().path()).unwrap();
        assert!(!text.contains(TOKEN));
    }
    assert!(!format!("{:?}", f.conns.list().unwrap()).contains(TOKEN));
    assert!(f.conns.set_secret(&c.id, Secret::new("  ")).is_err());
    assert!(f.conns.set_secret("none", Secret::new(TOKEN)).is_err());
}

#[test]
fn the_settings_stay_in_the_app_data_folder() {
    let f = fixture();
    let host = draft(
        "Host",
        ConnectionGroup::Tracker,
        ConnectionKind::GitLab,
        "https://git.corp.example",
    );
    f.conns.add(host).unwrap();
    let text = std::fs::read_to_string(f.dir.path().join("connections.json")).unwrap();
    assert!(text.contains("git.corp.example"));
    // A second store on the same folder reads the same list.
    let again = Connections::new(f.dir.path(), f.keys.clone(), f.http.clone());
    assert_eq!(again.list().unwrap()[0].url, "https://git.corp.example");
}

#[test]
fn a_test_passes_sends_the_token_in_a_header_and_saves_the_state() {
    let f = fixture();
    let c = f.conns.add(github("One")).unwrap();
    f.conns.set_secret(&c.id, Secret::new(TOKEN)).unwrap();
    f.http
        .get("/user", 200, r#"{"login":"ada","name":"Ada Lovelace"}"#);
    f.http.get("/issues", 200, "[]");
    assert_eq!(
        f.conns.test(&c.id).unwrap(),
        TestOutcome::Passed {
            account: "Ada Lovelace".into()
        }
    );
    assert_eq!(
        f.conns.get(&c.id).unwrap().unwrap().state,
        ConnectionState::Passed
    );
    let sent = f.http.requests();
    assert!(!sent.is_empty());
    for r in sent {
        assert!(!r.url.contains(TOKEN), "token in a URL");
        assert!(r.auth.secret().is_some_and(|s| s.expose() == TOKEN));
        // The test reads only (REQ-012): the client has `Get` and a read-only `Post` (GraphQL).
        assert!(r.body.is_none());
    }
}

#[test]
fn a_failed_test_names_the_missing_scope_and_the_state_is_failed() {
    let f = fixture();
    let c = f.conns.add(github("One")).unwrap();
    f.conns.set_secret(&c.id, Secret::new(TOKEN)).unwrap();
    f.http.get_with(
        "/user",
        403,
        &[("X-Accepted-GitHub-Permissions", "issues=read")],
        "{}",
    );
    assert_eq!(
        f.conns.test(&c.id).unwrap(),
        TestOutcome::MissingScope {
            scope: "issues=read".into()
        }
    );
    assert_eq!(
        f.conns.get(&c.id).unwrap().unwrap().state,
        ConnectionState::Failed
    );
}

#[test]
fn a_test_without_a_secret_fails_and_sends_nothing() {
    let f = fixture();
    let c = f.conns.add(github("One")).unwrap();
    assert!(matches!(
        f.conns.test(&c.id).unwrap(),
        TestOutcome::Failed { .. }
    ));
    assert!(f.http.requests().is_empty());
}

#[test]
fn a_forge_lists_its_repositories_with_the_push_marker() {
    let f = fixture();
    let c = f.conns.add(forge("Code")).unwrap();
    f.conns.set_secret(&c.id, Secret::new(TOKEN)).unwrap();
    f.http.get(
        "/user/repos",
        200,
        r#"[{"full_name":"acme/web","html_url":"https://github.com/acme/web","default_branch":"main","archived":false,"permissions":{"push":true}},
            {"full_name":"acme/docs","html_url":"https://github.com/acme/docs","default_branch":"main","archived":false,"permissions":{"push":false}}]"#,
    );
    let page = f.conns.repos(&c.id, None, 100).unwrap();
    let marks: Vec<_> = page
        .items
        .iter()
        .map(|r| (r.slug.as_str(), r.can_push))
        .collect();
    assert_eq!(
        marks,
        [("acme/web", Some(true)), ("acme/docs", Some(false))]
    );
    assert_eq!(page.next, None);
    // A tracker has no repository list.
    let t = f.conns.add(github("Issues")).unwrap();
    assert!(f.conns.repos(&t.id, None, 100).is_err());
}

#[test]
fn the_adapter_of_a_connection_reaches_other_capabilities() {
    let f = fixture();
    let c = f.conns.add(github("One")).unwrap();
    // No secret yet: no adapter.
    assert!(f.conns.tracker(&c.id).is_err());
    f.conns.set_secret(&c.id, Secret::new(TOKEN)).unwrap();
    assert!(
        f.conns
            .tracker(&c.id)
            .unwrap()
            .capabilities()
            .has(Capability::Labels)
    );
    assert!(f.conns.forge(&c.id).is_err());
}

#[test]
fn a_removal_deletes_the_secret_and_the_entry() {
    let f = fixture();
    let c = f.conns.add(github("One")).unwrap();
    let keep = f.conns.add(github("Two")).unwrap();
    f.conns.set_secret(&c.id, Secret::new(TOKEN)).unwrap();
    f.conns.set_secret(&keep.id, Secret::new("other")).unwrap();
    f.conns.remove(&c.id).unwrap();
    assert_eq!(stored(&f, "conn:one"), None);
    assert!(stored(&f, "conn:two").is_some());
    assert_eq!(f.conns.list().unwrap().len(), 1);
    assert_eq!(f.conns.get("one").unwrap(), None);
    assert!(f.conns.remove("one").is_err());
}

#[test]
fn a_refused_keychain_delete_keeps_the_connection() {
    struct Locked(MemoryStore);
    impl SecretStore for Locked {
        fn get(&self, a: &str) -> Result<Option<Secret>, SecretError> {
            self.0.get(a)
        }
        fn set(&self, a: &str, s: &Secret) -> Result<(), SecretError> {
            self.0.set(a, s)
        }
        fn delete(&self, _: &str) -> Result<(), SecretError> {
            Err(SecretError::new("locked"))
        }
    }
    let dir = tempfile::tempdir().unwrap();
    let conns = Connections::new(
        dir.path(),
        Arc::new(Locked(MemoryStore::default())),
        Arc::new(FakeHttp::new()),
    );
    let c = conns.add(github("One")).unwrap();
    assert!(conns.remove(&c.id).is_err());
    assert_eq!(conns.list().unwrap().len(), 1);
}

#[test]
fn a_broken_file_is_an_error_and_is_not_overwritten() {
    let f = fixture();
    std::fs::write(f.dir.path().join("connections.json"), "{not json").unwrap();
    assert!(f.conns.list().is_err());
    assert!(f.conns.add(github("One")).is_err());
    assert_eq!(
        std::fs::read_to_string(f.dir.path().join("connections.json")).unwrap(),
        "{not json"
    );
}
