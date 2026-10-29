//! Assistant threads in the app data folder (spec `assistant`, REQ-002, REQ-003).

use shipyard_core::assistant::{ChatMessage, ThreadSettings};
use shipyard_store::threads::Threads;

fn settings() -> ThreadSettings {
    ThreadSettings::new("claude")
}

#[test]
fn each_project_lists_its_own_threads_and_each_thread_keeps_its_own_state() {
    let dir = tempfile::tempdir().unwrap();
    let st = Threads::new(dir.path());
    let a = st.create("a", "one", settings()).unwrap();
    let b = st.create("a", "two", settings()).unwrap();
    st.create("b", "other", settings()).unwrap();

    let mut a2 = st.get("a", &a.id).unwrap();
    a2.draft = "typing".into();
    a2.session = Some("sess-1".into());
    a2.messages.push(ChatMessage::user("hello", vec![], 5));
    a2.usage.input_tokens = 7;
    st.save(&a2).unwrap();

    let again = Threads::new(dir.path()); // a restart
    let a3 = again.get("a", &a.id).unwrap();
    assert_eq!(
        (a3.draft.as_str(), a3.session.as_deref()),
        ("typing", Some("sess-1"))
    );
    assert_eq!((a3.messages.len(), a3.usage.input_tokens), (1, 7));
    assert!(again.get("a", &b.id).unwrap().messages.is_empty());
    assert_eq!(again.list("a").unwrap().len(), 2);
    assert_eq!(again.list("b").unwrap().len(), 1);
    assert!(again.list("none").unwrap().is_empty());
    // A thread of project a is not in project b.
    assert!(again.get("b", &a.id).is_err());
}

#[test]
fn rename_and_delete_touch_one_thread_and_nothing_goes_to_the_repository() {
    let dir = tempfile::tempdir().unwrap();
    let repo = tempfile::tempdir().unwrap();
    let st = Threads::new(dir.path());
    let a = st.create("a", "one", settings()).unwrap();
    let b = st.create("a", "two", settings()).unwrap();
    assert_eq!(st.rename("a", &a.id, " new ").unwrap().title, "new");
    st.delete("a", &a.id).unwrap();
    let left = st.list("a").unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].id, b.id);
    assert!(st.get("a", &a.id).is_err());
    assert!(dir.path().join("assistant").exists());
    assert_eq!(std::fs::read_dir(repo.path()).unwrap().count(), 0);
}

#[test]
fn an_id_that_is_not_plain_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let st = Threads::new(dir.path());
    assert!(st.create("../x", "t", settings()).is_err());
    assert!(st.get("a", "../../etc/passwd").is_err());
    assert!(st.delete("a", "").is_err());
}
