//! The profile picture of a commit author in Code / History. A GitHub no-reply address names the
//! GitHub account, so the picture comes from GitHub. Any other address goes to Gravatar as a
//! SHA-256 hash, never as the address. The app fetches it (proxy, extra CA and size cap apply) and
//! gives the web view a `data:` URL, because the web view may not call another host. A miss gives
//! `None` and the view shows the initials.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use sha2::{Digest, Sha256};
use shipyard_http::{Auth, Http, Request};
use tauri::AppHandle;

use crate::commands::{Api, blocking};

const SIZE: u32 = 64;
/// A picture bigger than this is not a profile picture.
const MAX_BYTES: usize = 256 * 1024;

/// The URL of the picture for an address: GitHub for its no-reply address, else Gravatar.
/// `None` for text that is not an address.
pub fn avatar_url(email: &str) -> Option<String> {
    let email = email.trim().to_lowercase();
    let (local, host) = email.split_once('@')?;
    if local.is_empty() || host.is_empty() {
        return None;
    }
    if host == "users.noreply.github.com" {
        // `<id>+<login>` or `<login>`.
        let (id, login) = local.split_once('+').unwrap_or(("", local));
        let ok = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
        if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
            return Some(format!(
                "https://avatars.githubusercontent.com/u/{id}?s={SIZE}"
            ));
        }
        if !login.is_empty() && ok(login) {
            return Some(format!(
                "https://avatars.githubusercontent.com/{login}?s={SIZE}"
            ));
        }
        return None;
    }
    let hash: String = Sha256::digest(email.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    Some(format!(
        "https://www.gravatar.com/avatar/{hash}?s={SIZE}&d=404"
    ))
}

/// The picture as a `data:` URL. `Ok(None)`: the host has no picture. `Err`: the call failed.
pub fn fetch(http: &dyn Http, url: &str) -> Result<Option<String>, shipyard_http::Error> {
    let res = http.send(&Request::get(url, Auth::None).timeout(Duration::from_secs(10)))?;
    if res.status != 200 || res.body.is_empty() || res.body.len() > MAX_BYTES {
        return Ok(None);
    }
    let kind = res.header("content-type").unwrap_or_default();
    let kind = kind.split(';').next().unwrap_or_default().trim();
    if !matches!(
        kind,
        "image/png" | "image/jpeg" | "image/webp" | "image/gif"
    ) {
        return Ok(None);
    }
    Ok(Some(format!(
        "data:{kind};base64,{}",
        STANDARD.encode(&res.body)
    )))
}

/// The answers of this run, by address. shortcut: kept in memory until the app quits, a failed
/// call is not kept so the next ask tries again; upgrade to the disk if the cold start shows.
fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// The picture for an address, from the cache or the network.
pub fn avatar(http: &dyn Http, email: &str) -> Option<String> {
    let key = email.trim().to_lowercase();
    if let Some(hit) = cache().lock().ok()?.get(&key) {
        return hit.clone();
    }
    let found = fetch(http, &avatar_url(&key)?);
    let Ok(found) = found else { return None };
    cache().lock().ok()?.insert(key, found.clone());
    found
}

#[tauri::command]
#[specta::specta]
pub async fn avatar_get(app: AppHandle, email: String) -> Api<Option<String>> {
    blocking(app, move |s| Ok(avatar(&*s.connections.http(), &email))).await
}

#[cfg(test)]
mod tests {
    use shipyard_http::fake::FakeHttp;

    use super::*;

    #[test]
    fn a_github_no_reply_address_names_the_github_account() {
        assert_eq!(
            avatar_url("583231+Octocat@users.noreply.github.com").unwrap(),
            "https://avatars.githubusercontent.com/u/583231?s=64"
        );
        assert_eq!(
            avatar_url("octo-cat@users.noreply.github.com").unwrap(),
            "https://avatars.githubusercontent.com/octo-cat?s=64"
        );
        assert_eq!(avatar_url("a/b@users.noreply.github.com"), None);
    }

    #[test]
    fn any_other_address_goes_to_gravatar_as_a_hash_only() {
        let url = avatar_url("  Me@Example.COM ").unwrap();
        assert_eq!(url, avatar_url("me@example.com").unwrap());
        assert!(url.starts_with("https://www.gravatar.com/avatar/"));
        assert!(!url.contains("example"), "the address never leaves the app");
        assert!(url.ends_with("?s=64&d=404"));
        assert_eq!(avatar_url("not an address"), None);
        assert_eq!(avatar_url("@example.com"), None);
    }

    #[test]
    fn a_picture_becomes_a_data_url_and_a_miss_gives_none() {
        let http = FakeHttp::new();
        http.get_with("good", 200, &[("content-type", "image/png")], "PNG");
        http.get("gone", 404, "");
        http.get_with("page", 200, &[("content-type", "text/html")], "<html>");
        assert_eq!(
            fetch(&http, "https://h/good").unwrap().unwrap(),
            "data:image/png;base64,UE5H"
        );
        assert_eq!(fetch(&http, "https://h/gone").unwrap(), None);
        assert_eq!(fetch(&http, "https://h/page").unwrap(), None);
    }
}
