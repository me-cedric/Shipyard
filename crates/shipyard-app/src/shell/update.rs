//! The update check (spec `shell`, REQ-014, Q-009 option 1). It reads one address and tells the
//! person whether a newer version exists. It never downloads and never installs.

use serde::Serialize;
use shipyard_http::{Auth, Http, Request, base_url, text};
use specta::Type;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub newer: bool,
    /// The page of the release, for the person to read.
    pub url: String,
    /// The changelog sections after the last version that ran, up to the running one. Empty when none.
    pub notes: String,
}

/// The sections of a changelog text (`## 1.2.0 ...` headings) with a version above `from` and
/// not above `to`. A text with no version heading is one note of the release: kept whole when
/// `to` is above `from`.
pub fn sections(body: &str, from: &str, to: &str) -> String {
    let (Some(from), Some(to)) = (parts(from), parts(to)) else {
        return String::new();
    };
    let version = |line: &str| {
        let word = line.strip_prefix("## ")?.trim_start_matches(['[', 'v']);
        parts(word.split([' ', ']']).next()?)
    };
    let mut kept = Vec::new();
    let mut keep = false;
    let mut headed = false;
    for line in body.lines() {
        if let Some(v) = version(line) {
            headed = true;
            keep = v > from && v <= to;
        }
        if keep {
            kept.push(line);
        }
    }
    if headed {
        kept.join("\n").trim().to_string()
    } else if to > from {
        body.trim().to_string()
    } else {
        String::new()
    }
}

/// `v1.2.3-beta.1` gives `[1, 2, 3]`. Text that is not a version gives `None`.
fn parts(version: &str) -> Option<Vec<u64>> {
    let core = version.trim().trim_start_matches('v');
    let core = core.split(['-', '+']).next()?;
    core.split('.').map(|n| n.parse().ok()).collect()
}

/// True when `latest` is a higher version than `current`. A text that is not a version is not newer.
pub fn is_newer(current: &str, latest: &str) -> bool {
    match (parts(current), parts(latest)) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    }
}

/// Reads the release at `release_url` (a GitHub release answer: `tag_name` and `html_url`).
/// The address is `https`, or `http` on a local host. Sends no credential. `seen` is the last
/// version that ran. After an update (`current` above `seen`) the notes are the sections in
/// between. With no `seen` (first start) or no update, the notes are empty.
pub fn check(
    http: &dyn Http,
    release_url: &str,
    current: &str,
    seen: Option<&str>,
) -> Result<UpdateInfo, String> {
    let url = base_url(release_url).map_err(|e| e.to_string())?;
    let reply = http
        .json(&Request::get(url.clone(), Auth::None))
        .map_err(|e| e.to_string())?;
    let latest = text(&reply, "/tag_name");
    let latest = latest.trim().trim_start_matches('v').to_string();
    if parts(&latest).is_none() {
        return Err("the release answer holds no version".into());
    }
    let page = text(&reply, "/html_url");
    let notes = seen
        .filter(|s| is_newer(s, current))
        .map_or(String::new(), |s| {
            sections(&text(&reply, "/body"), s, current)
        });
    Ok(UpdateInfo {
        current: current.into(),
        newer: is_newer(current, &latest),
        notes,
        latest,
        url: if page.is_empty() { url } else { page },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_http::fake::FakeHttp;

    #[test]
    fn versions_compare_by_number_not_by_text() {
        assert!(is_newer("0.1.0", "0.2.0"));
        assert!(is_newer("0.9.0", "v0.10.0"));
        assert!(
            is_newer("1.2.3", "1.2.4-beta.1"),
            "a pre-release of a higher core counts"
        );
        assert!(!is_newer("0.2.0", "0.2.0"));
        assert!(!is_newer("0.2.0", "0.1.9"));
        assert!(!is_newer("0.2.0", "latest"), "not a version");
    }

    #[test]
    fn a_newer_release_is_reported_with_its_page() {
        let http = FakeHttp::new();
        http.get(
            "/releases/latest",
            200,
            r#"{"tag_name":"v0.2.0","html_url":"https://example.com/r/0.2.0"}"#,
        );
        let info = check(&http, "https://example.com/releases/latest", "0.1.0", None).unwrap();
        assert_eq!(
            info,
            UpdateInfo {
                current: "0.1.0".into(),
                latest: "0.2.0".into(),
                newer: true,
                url: "https://example.com/r/0.2.0".into(),
                notes: String::new()
            }
        );
        assert!(http.requests().iter().all(|r| r.auth.secret().is_none()));
    }

    #[test]
    fn the_same_version_is_not_newer_and_a_bad_answer_or_address_is_an_error() {
        let http = FakeHttp::new();
        http.get("/same", 200, r#"{"tag_name":"v0.1.0"}"#);
        http.get("/odd", 200, r#"{"name":"x"}"#);
        let same = check(&http, "https://example.com/same", "0.1.0", None).unwrap();
        assert!(!same.newer);
        assert_eq!(
            same.url, "https://example.com/same",
            "no page: the release address"
        );
        assert!(check(&http, "https://example.com/odd", "0.1.0", None).is_err());
        assert!(
            check(&http, "http://example.com/same", "0.1.0", None).is_err(),
            "http only on a local host"
        );
    }

    const LOG: &str = "## 0.3.0\n- c\n\n## [0.2.0] - 2026-10-01\n- b\n\n## 0.1.0\n- a";

    #[test]
    fn the_notes_are_the_sections_after_a_version_up_to_the_latest() {
        assert_eq!(
            sections(LOG, "0.1.0", "0.3.0"),
            "## 0.3.0\n- c\n\n## [0.2.0] - 2026-10-01\n- b"
        );
        assert_eq!(sections(LOG, "0.2.0", "0.2.0"), "");
        assert_eq!(
            sections(LOG, "0.1.0", "0.2.0"),
            "## [0.2.0] - 2026-10-01\n- b"
        );
        assert_eq!(sections("plain notes\n", "0.1.0", "0.2.0"), "plain notes");
        assert_eq!(sections("plain notes", "0.2.0", "0.2.0"), "");
        assert_eq!(sections(LOG, "latest", "0.3.0"), "");
    }

    #[test]
    fn the_notes_show_once_after_an_update_and_never_for_a_version_not_installed() {
        let http = FakeHttp::new();
        let body = serde_json::json!({"tag_name": "v0.3.0", "body": LOG}).to_string();
        http.get("/latest", 200, &body);
        let url = "https://example.com/latest";
        // Before the update: running 0.1.0 and 0.3.0 exists. No notes, only `newer`.
        let before = check(&http, url, "0.1.0", Some("0.1.0")).unwrap();
        assert!(before.newer && before.notes.is_empty());
        // First start after the update to 0.2.0: the sections in between, not 0.3.0 and not 0.1.0.
        let first = check(&http, url, "0.2.0", Some("0.1.0")).unwrap();
        assert!(first.newer && first.notes.contains("- b"));
        assert!(!first.notes.contains("- c") && !first.notes.contains("- a"));
        // Second start: the app stored `0.2.0` as the last version that ran. Nothing to show.
        assert_eq!(check(&http, url, "0.2.0", Some("0.2.0")).unwrap().notes, "");
        // No stored version (first install) or a newer one (downgrade): nothing to show.
        assert_eq!(check(&http, url, "0.2.0", None).unwrap().notes, "");
        assert_eq!(check(&http, url, "0.2.0", Some("0.9.0")).unwrap().notes, "");
    }
}
