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
/// The address is `https`, or `http` on a local host. Sends no credential.
pub fn check(http: &dyn Http, release_url: &str, current: &str) -> Result<UpdateInfo, String> {
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
    Ok(UpdateInfo {
        current: current.into(),
        newer: is_newer(current, &latest),
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
        let info = check(&http, "https://example.com/releases/latest", "0.1.0").unwrap();
        assert_eq!(
            info,
            UpdateInfo {
                current: "0.1.0".into(),
                latest: "0.2.0".into(),
                newer: true,
                url: "https://example.com/r/0.2.0".into()
            }
        );
        assert!(http.requests().iter().all(|r| r.auth.secret().is_none()));
    }

    #[test]
    fn the_same_version_is_not_newer_and_a_bad_answer_or_address_is_an_error() {
        let http = FakeHttp::new();
        http.get("/same", 200, r#"{"tag_name":"v0.1.0"}"#);
        http.get("/odd", 200, r#"{"name":"x"}"#);
        let same = check(&http, "https://example.com/same", "0.1.0").unwrap();
        assert!(!same.newer);
        assert_eq!(
            same.url, "https://example.com/same",
            "no page: the release address"
        );
        assert!(check(&http, "https://example.com/odd", "0.1.0").is_err());
        assert!(
            check(&http, "http://example.com/same", "0.1.0").is_err(),
            "http only on a local host"
        );
    }
}
