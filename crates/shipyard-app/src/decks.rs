//! HTML slide decks (ADR 0016): the list of the slides folder, the `deck` protocol that gives one
//! deck to the sandboxed frame under its own strict policy, and the PDF export.

use std::path::{Path, PathBuf};

use shipyard_store::design::resolve_in;
use shipyard_store::knowledge::{PageEntry, decks};
use tauri::http::{Response, StatusCode, header};
use tauri::{AppHandle, Manager, Runtime, UriSchemeContext};

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::design::project;

/// The policy of a deck page: inline script and style, pictures and fonts in the file. No fetch,
/// no form, no frame and no other place: a deck cannot send data out.
pub const DECK_CSP: &str = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; base-uri 'none'; form-action 'none'";

pub fn list(s: &AppState) -> Res<Vec<PageEntry>> {
    let p = project(s)?;
    Ok(decks(&p.root, p.file.path("slides")))
}

/// The file of a deck: an `.html` file in the slides folder of the active project.
fn deck_file(s: &AppState, rel: &str) -> Res<PathBuf> {
    let p = project(s)?;
    if !rel.ends_with(".html") {
        return Err(format!("path not allowed: {rel}"));
    }
    resolve_in(&p.root, &p.file, rel, &["slides"])
}

/// `%XX` escapes to bytes, as `encodeURIComponent` writes them.
fn decode(text: &str) -> Option<String> {
    let b = text.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// The answer of the `deck` protocol for the path of a request (`/<encoded repository path>`).
pub fn respond(s: &AppState, uri_path: &str) -> Response<Vec<u8>> {
    let read = decode(uri_path.trim_start_matches('/'))
        .ok_or_else(|| "bad path".to_string())
        .and_then(|rel| deck_file(s, &rel))
        .and_then(|full| std::fs::read(full).map_err(err));
    let (status, body) = match read {
        Ok(bytes) => (StatusCode::OK, bytes),
        Err(_) => (StatusCode::NOT_FOUND, Vec::new()),
    };
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CONTENT_SECURITY_POLICY, DECK_CSP)
        .body(body)
        .expect("a fixed response")
}

/// The handler of the `deck` scheme, registered in `run`.
pub fn protocol<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    req: tauri::http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    respond(&ctx.app_handle().state::<AppState>(), req.uri().path())
}

#[tauri::command]
#[specta::specta]
pub async fn deck_list(app: AppHandle) -> Api<Vec<PageEntry>> {
    blocking(app, list).await
}

/// Prints the deck with its print style sheet to a PDF at `dest`, one page per slide.
#[tauri::command]
#[specta::specta]
pub async fn deck_pdf(app: AppHandle, path: String, dest: String) -> Api<()> {
    let rel = path.clone();
    let tmp = blocking(app.clone(), move |s| {
        deck_file(s, &rel)?;
        Ok(s.dir.join(format!("deck-print-{}.pdf", std::process::id())))
    })
    .await?;
    let (handle, out) = (app.clone(), tmp.clone());
    tauri::async_runtime::spawn_blocking(move || print_pdf(&handle, &path, &out))
        .await
        .map_err(err)??;
    blocking(app, move |s| {
        let bytes = std::fs::read(&tmp).map_err(err);
        let _ = std::fs::remove_file(&tmp);
        crate::knowledge::write_export(s, &dest, "pdf", &bytes?)
    })
    .await
}

/// shortcut: macOS only. Windows (WebView2 `PrintToPdf`) and Linux (WebKitGTK print operation)
/// need their own call; add them when a person exports a deck there.
#[cfg(not(target_os = "macos"))]
fn print_pdf(_app: &AppHandle, _rel: &str, _out: &Path) -> Res<()> {
    Err("the PDF export of a deck works on macOS only for now".into())
}

/// A hidden window with JavaScript off loads the deck from the `deck` protocol. WebKit prints it
/// to `out` with the print style sheet of the deck: the text stays vector text.
#[cfg(target_os = "macos")]
fn print_pdf(app: &AppHandle, rel: &str, out: &Path) -> Res<()> {
    use std::time::Duration;
    use tauri::webview::PageLoadEvent;
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    let _ = std::fs::remove_file(out);
    let url = tauri::Url::parse(&format!("deck://localhost/{}", encode(rel))).map_err(err)?;
    let (tx, rx) = std::sync::mpsc::channel();
    let window = WebviewWindowBuilder::new(app, "deck-print", WebviewUrl::CustomProtocol(url))
        .visible(false)
        .inner_size(1280.0, 720.0)
        .disable_javascript()
        .on_page_load(move |_, p| {
            if p.event() == PageLoadEvent::Finished {
                let _ = tx.send(());
            }
        })
        .build()
        .map_err(err)?;
    let done = rx
        .recv_timeout(Duration::from_secs(20))
        .map_err(|_| "the deck did not load".to_string())
        .and_then(|()| {
            let to = out.to_path_buf();
            // Safety: on macOS the platform webview is a `WKWebView`; the call runs on the main thread.
            window
                .with_webview(move |v| unsafe { print_to(v.inner().cast(), &to) })
                .map_err(err)
        })
        .and_then(|()| wait_for(out, Duration::from_secs(60)));
    let _ = window.destroy();
    done
}

/// `encodeURIComponent` for a repository path.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn encode(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// The print operation runs on its own: the file is done when `%%EOF` ends it.
#[cfg(target_os = "macos")]
fn wait_for(out: &Path, limit: std::time::Duration) -> Res<()> {
    let step = std::time::Duration::from_millis(100);
    let mut waited = std::time::Duration::ZERO;
    while waited < limit {
        std::thread::sleep(step);
        waited += step;
        if pdf_done(out) {
            return Ok(());
        }
    }
    Err("the PDF was not written".into())
}

/// A PDF ends with the `%%EOF` marker, then at most a line break.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn pdf_done(out: &Path) -> bool {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(out) else {
        return false;
    };
    let mut tail = Vec::new();
    f.seek(SeekFrom::End(-16))
        .or_else(|_| f.rewind().map(|()| 0))
        .and_then(|_| f.read_to_end(&mut tail))
        .is_ok()
        && tail.trim_ascii_end().ends_with(b"%%EOF")
}

/// A save job to `out` on a 16:9 page with no margin, without a panel.
#[cfg(target_os = "macos")]
unsafe fn print_to(view: *mut objc2_web_kit::WKWebView, out: &Path) {
    use objc2_app_kit::{
        NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob, NSPrintingPaginationMode,
    };
    use objc2_foundation::{NSSize, NSString, NSURL};

    // Safety: the caller gives the live `WKWebView` of the window.
    let view = unsafe { &*view };
    let info = NSPrintInfo::new();
    let url = NSURL::fileURLWithPath(&NSString::from_str(&out.to_string_lossy()));
    // Safety: the keys and values are the constants that AppKit documents for a save job.
    unsafe {
        info.setJobDisposition(NSPrintSaveJob);
        info.dictionary().insert(NSPrintJobSavingURL, &url);
    }
    // A slide is 1920 x 1080 CSS pixels: 1440 x 810 points.
    info.setPaperSize(NSSize::new(1440.0, 810.0));
    info.setTopMargin(0.0);
    info.setBottomMargin(0.0);
    info.setLeftMargin(0.0);
    info.setRightMargin(0.0);
    info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
    // Safety: the operation and the window belong to this view, on the main thread.
    unsafe {
        let op = view.printOperationWithPrintInfo(&info);
        op.setShowsPrintPanel(false);
        op.setShowsProgressPanel(false);
        // WebKit prints a page only through the modal run, not through `runOperation`.
        if let Some(window) = view.window() {
            op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                &window,
                None,
                None,
                std::ptr::null_mut(),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work::tests::fx;

    fn put(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    #[test]
    fn the_protocol_gives_a_deck_of_the_slides_folder_under_the_strict_policy() {
        let f = fx();
        put(f.repo.path(), "docs/slides/a b.html", "<title>A</title>");
        put(f.repo.path(), "docs/handbook/x.html", "<p>x</p>");
        put(f.repo.path(), "docs/slides/old.md", "# Old");

        let ok = respond(&f.s, &format!("/{}", encode("docs/slides/a b.html")));
        assert_eq!(ok.status(), StatusCode::OK);
        assert_eq!(ok.body(), b"<title>A</title>");
        let csp = ok.headers()[header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap();
        assert!(csp.starts_with("default-src 'none'"), "{csp}");
        assert!(!csp.contains("connect-src"), "no fetch: {csp}");

        for bad in [
            "/docs%2Fhandbook%2Fx.html",
            "/docs%2Fslides%2Fold.md",
            "/docs%2Fslides%2F..%2Fhandbook%2Fx.html",
            "/docs%2Fslides%2Fa%ZZb.html",
        ] {
            assert_eq!(respond(&f.s, bad).status(), StatusCode::NOT_FOUND, "{bad}");
        }
    }

    #[test]
    fn a_pdf_is_done_when_eof_ends_it() {
        let f = fx();
        put(f.repo.path(), "a.pdf", "%PDF-1.4 body");
        assert!(!pdf_done(&f.repo.path().join("a.pdf")));
        put(f.repo.path(), "a.pdf", "%PDF-1.4 body\n%%EOF\n");
        assert!(pdf_done(&f.repo.path().join("a.pdf")));
        put(f.repo.path(), "b.pdf", "%%EOF");
        assert!(pdf_done(&f.repo.path().join("b.pdf")));
        assert!(!pdf_done(&f.repo.path().join("none.pdf")));
    }

    #[test]
    fn the_list_holds_the_html_decks_and_encode_and_decode_agree() {
        let f = fx();
        put(
            f.repo.path(),
            "docs/slides/kickoff.html",
            "<title>Kick-off</title>",
        );
        let got = list(&f.s).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(
            (got[0].path.as_str(), got[0].title.as_str()),
            ("docs/slides/kickoff.html", "Kick-off")
        );
        let path = "docs/slides/équipe 1.html";
        assert_eq!(decode(&encode(path)).as_deref(), Some(path));
    }
}
