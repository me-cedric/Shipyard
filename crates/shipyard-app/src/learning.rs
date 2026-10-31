//! Knowledge / Learn IPC (spec `knowledge`): the feeds, the learning paths and the progress of
//! each person. The backend reads each feed, keeps a copy in the app data folder for an hour and
//! gives plain text to the view. A write needs a click and a project that is not read only.

use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use shipyard_http::{Auth, Http, Request};
use shipyard_store::learning::{self as store, Feed, Learning, LearningPath, parse_feed};
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::errors::AppError;
use crate::work::need_click;

/// A copy younger than this is shown without a new read.
const FRESH_SECS: u64 = 3600;

#[derive(Debug, Clone, Serialize, Type)]
pub struct FeedRead {
    pub url: String,
    pub feed: Feed,
    /// Seconds since 1970 of the read that gave `feed`. `None` when no read worked yet.
    pub fetched: Option<f64>,
    /// Why the last read failed. The copy, if any, stays in `feed`.
    pub error: Option<AppError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Cached {
    fetched: u64,
    feed: Feed,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

fn cache_file(dir: &Path, url: &str) -> std::path::PathBuf {
    use std::hash::{Hash, Hasher};
    // shortcut: the std hash can change with the Rust version; a new name only costs one read.
    let mut h = std::hash::DefaultHasher::new();
    url.hash(&mut h);
    dir.join("feeds").join(format!("{:016x}.json", h.finish()))
}

fn fetch(http: &dyn Http, url: &str) -> Res<Feed> {
    store::check_address(url).map_err(err)?;
    let req = Request::get(url, Auth::None)
        .header(
            "Accept",
            "application/rss+xml, application/atom+xml, text/xml",
        )
        .timeout(Duration::from_secs(15));
    let res = http.send(&req).map_err(err)?.ok().map_err(err)?;
    parse_feed(&String::from_utf8_lossy(&res.body)).map_err(err)
}

/// One feed: the copy when it is fresh, else a new read. A failed read keeps the copy.
pub fn read_feed(http: &dyn Http, dir: &Path, url: &str, refresh: bool) -> FeedRead {
    let file = cache_file(dir, url);
    let cached: Option<Cached> = std::fs::read_to_string(&file)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok());
    if let Some(c) = cached
        .as_ref()
        .filter(|c| !refresh && now() < c.fetched + FRESH_SECS)
    {
        return FeedRead {
            url: url.into(),
            feed: c.feed.clone(),
            fetched: Some(c.fetched as f64),
            error: None,
        };
    }
    match fetch(http, url) {
        Ok(feed) => {
            let c = Cached {
                fetched: now(),
                feed,
            };
            // A copy that cannot be written only costs a read next time.
            if let Ok(text) = serde_json::to_string(&c) {
                let _ = shipyard_store::project::write_atomic(&file, text.as_bytes());
            }
            FeedRead {
                url: url.into(),
                feed: c.feed,
                fetched: Some(c.fetched as f64),
                error: None,
            }
        }
        Err(e) => FeedRead {
            url: url.into(),
            feed: cached.as_ref().map(|c| c.feed.clone()).unwrap_or_default(),
            fetched: cached.map(|c| c.fetched as f64),
            error: Some(AppError::from(e)),
        },
    }
}

fn root(s: &AppState) -> Res<std::path::PathBuf> {
    Ok(crate::design::project(s)?.root)
}

#[tauri::command]
#[specta::specta]
pub async fn learning_get(app: AppHandle) -> Api<Learning> {
    blocking(app, |s| store::read(&root(s)?).map_err(err)).await
}

/// Reads each feed of the project. `refresh` reads again even when the copy is fresh.
#[tauri::command]
#[specta::specta]
pub async fn learning_feeds_read(app: AppHandle, refresh: bool) -> Api<Vec<FeedRead>> {
    blocking(app, move |s| {
        let feeds = store::read(&root(s)?).map_err(err)?.feeds;
        let http = s.connections.http();
        Ok(feeds
            .iter()
            .map(|u| read_feed(http.as_ref(), &s.dir, u, refresh))
            .collect())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn learning_feed_add(app: AppHandle, url: String, click: bool) -> Api<Learning> {
    blocking(app, move |s| {
        need_click(s, click)?;
        store::feed_add(&root(s)?, &url).map_err(err)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn learning_feed_remove(app: AppHandle, url: String, click: bool) -> Api<Learning> {
    blocking(app, move |s| {
        need_click(s, click)?;
        store::feed_remove(&root(s)?, &url).map_err(err)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn learning_path_save(app: AppHandle, path: LearningPath, click: bool) -> Api<Learning> {
    blocking(app, move |s| {
        need_click(s, click)?;
        store::path_save(&root(s)?, path).map_err(err)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn learning_path_delete(app: AppHandle, id: String, click: bool) -> Api<Learning> {
    blocking(app, move |s| {
        need_click(s, click)?;
        store::path_delete(&root(s)?, &id).map_err(err)
    })
    .await
}

/// `step` is `<path>/<step>`.
#[tauri::command]
#[specta::specta]
pub async fn learning_progress_set(
    app: AppHandle,
    person: String,
    step: String,
    done: bool,
    click: bool,
) -> Api<Learning> {
    blocking(app, move |s| {
        need_click(s, click)?;
        store::progress_set(&root(s)?, &person, &step, done).map_err(err)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_http::fake::FakeHttp;

    const RSS: &str = "<rss><channel><title>News</title><item><title>One</title>\
        <link>https://example.com/1</link></item></channel></rss>";

    #[test]
    fn a_feed_is_read_once_then_the_copy_answers_and_survives_a_failure() {
        let dir = tempfile::tempdir().unwrap();
        let http = FakeHttp::new();
        http.get("example.com/feed", 200, RSS);
        let url = "https://example.com/feed";
        let first = read_feed(&http, dir.path(), url, false);
        assert_eq!(first.feed.items[0].title, "One");
        assert!(first.error.is_none());
        // The copy is fresh: no second request.
        read_feed(&http, dir.path(), url, false);
        assert_eq!(http.requests().len(), 1);

        let down = FakeHttp::new();
        down.get("example.com/feed", 500, "down");
        let again = read_feed(&down, dir.path(), url, true);
        assert_eq!(again.feed.items.len(), 1, "the copy stays");
        assert!(again.error.is_some());

        let page = FakeHttp::new();
        page.get("example.com/page", 200, "<html>no</html>");
        let bad = read_feed(&page, dir.path(), "https://example.com/page", false);
        assert!(bad.feed.items.is_empty());
        assert!(bad.error.unwrap().details.contains("RSS or Atom"));
    }
}
