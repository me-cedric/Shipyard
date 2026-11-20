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

/// The file of a deck: an `.html` or `.md` file in the slides folder of the active project.
fn deck_file(s: &AppState, rel: &str) -> Res<PathBuf> {
    let p = project(s)?;
    if !(rel.ends_with(".html") || rel.ends_with(".md")) {
        return Err(format!("path not allowed: {rel}"));
    }
    resolve_in(&p.root, &p.file, rel, &["slides"])
}

/// A theme value goes into a style sheet: only the characters of a colour or a font name pass.
fn css_value<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    let ok = !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || " #(),.%-'".contains(c));
    if ok { value } else { fallback }
}

fn esc(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// `**bold**`, `*em*` and `` `code` `` in one line. The text is escaped first: no raw HTML passes.
fn inline(text: &str) -> String {
    fn pair(text: &str, mark: &str, tag: &str) -> String {
        let parts: Vec<&str> = text.split(mark).collect();
        // An odd number of marks leaves the last one as text.
        let paired = parts.len() - (1 - parts.len() % 2);
        let mut out = String::new();
        for (i, part) in parts.iter().enumerate() {
            match (i, i < paired) {
                (0, _) => out.push_str(part),
                (_, true) if i % 2 == 1 => out.push_str(&format!("<{tag}>{part}</{tag}>")),
                (_, true) => out.push_str(part),
                _ => out.push_str(&format!("{mark}{part}")),
            }
        }
        out
    }
    let escaped = esc(text);
    let parts: Vec<&str> = escaped.split('`').collect();
    let paired = parts.len() - (1 - parts.len() % 2);
    let mut out = String::new();
    for (i, part) in parts.iter().enumerate() {
        if i % 2 == 1 && i < paired {
            out.push_str(&format!("<code>{part}</code>"));
        } else {
            let sep = if i > 0 && i % 2 == 1 { "`" } else { "" };
            out.push_str(&format!(
                "{sep}{}",
                pair(&pair(part, "**", "strong"), "*", "em")
            ));
        }
    }
    out
}

/// A slide without its speaker note: the `Note:` line and the lines after it (not in a code fence).
fn without_note(slide: &str) -> String {
    let mut fenced = false;
    let mut kept = Vec::new();
    for line in slide.lines() {
        if line.trim_start().starts_with("```") {
            fenced = !fenced;
        }
        if !fenced && line.starts_with("Note:") {
            break;
        }
        kept.push(line);
    }
    kept.join("\n")
}

/// Markdown of one slide as HTML: headings, lists, tables, code fences and paragraphs.
fn slide_html(md: &str) -> String {
    let mut out = String::new();
    let mut para: Vec<String> = Vec::new();
    let mut list: Option<(&str, Vec<String>)> = None;
    let mut table: Vec<Vec<String>> = Vec::new();
    let mut fence: Option<Vec<&str>> = None;
    let cells = |l: &str| -> Vec<String> {
        l.trim()
            .trim_matches('|')
            .split('|')
            .map(|c| c.trim().to_string())
            .collect()
    };
    macro_rules! flush {
        () => {
            if !para.is_empty() {
                out.push_str(&format!("<p>{}</p>", inline(&para.join(" "))));
                para.clear();
            }
            if let Some((tag, items)) = list.take() {
                let li: String = items
                    .iter()
                    .map(|i| format!("<li>{}</li>", inline(i)))
                    .collect();
                out.push_str(&format!("<{tag}>{li}</{tag}>"));
            }
            if !table.is_empty() {
                let row = |r: &Vec<String>, tag: &str| -> String {
                    let c: String = r
                        .iter()
                        .map(|c| format!("<{tag}>{}</{tag}>", inline(c)))
                        .collect();
                    format!("<tr>{c}</tr>")
                };
                let (head, rows) = table.split_first().expect("a row");
                let body: String = rows.iter().map(|r| row(r, "td")).collect();
                out.push_str(&format!("<table>{}{body}</table>", row(head, "th")));
                table.clear();
            }
        };
    }
    for line in md.lines() {
        if let Some(code) = fence.as_mut() {
            if line.trim_start().starts_with("```") {
                out.push_str(&format!(
                    "<pre><code>{}</code></pre>",
                    esc(&code.join("\n"))
                ));
                fence = None;
            } else {
                code.push(line);
            }
            continue;
        }
        let t = line.trim();
        if t.starts_with("```") {
            flush!();
            fence = Some(Vec::new());
        } else if t.is_empty() {
            flush!();
        } else if let Some(h) = t.strip_prefix('#').map(|_| t.trim_start_matches('#')) {
            flush!();
            let level = (t.len() - h.len()).min(6);
            out.push_str(&format!("<h{level}>{}</h{level}>", inline(h.trim())));
        } else if t.starts_with('|') {
            if !list.is_none() || !para.is_empty() {
                flush!();
            }
            // The separator row `| --- | --- |` has no cell of text.
            if !cells(t)
                .iter()
                .all(|c| c.chars().all(|ch| ch == '-' || ch == ':'))
            {
                table.push(cells(t));
            }
        } else if let Some(item) = t
            .strip_prefix("- ")
            .or_else(|| t.strip_prefix("* "))
            .or_else(|| t.strip_prefix("+ "))
        {
            if para.len() + table.len() > 0 {
                flush!();
            }
            list.get_or_insert(("ul", Vec::new()))
                .1
                .push(item.to_string());
        } else if let Some((_, item)) = t
            .split_once(". ")
            .filter(|(n, _)| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
        {
            if para.len() + table.len() > 0 {
                flush!();
            }
            list.get_or_insert(("ol", Vec::new()))
                .1
                .push(item.to_string());
        } else {
            if list.is_some() || !table.is_empty() {
                flush!();
            }
            para.push(t.to_string());
        }
    }
    if let Some(code) = fence {
        out.push_str(&format!(
            "<pre><code>{}</code></pre>",
            esc(&code.join("\n"))
        ));
    }
    flush!();
    out
}

/// The print page of a Markdown deck: one 1920 x 1080 page for each slide in the colours of the
/// deck theme, with no script and no speaker note. The PDF export prints it like an HTML deck.
fn print_page(text: &str, theme: &shipyard_store::knowledge::DeckTheme) -> String {
    let deck = shipyard_store::knowledge::parse_deck(text, "deck");
    let slides: String = deck
        .slides
        .iter()
        .map(|s| without_note(s))
        .filter(|s| !s.trim().is_empty())
        .map(|s| format!("<section class=\"slide\">{}</section>", slide_html(&s)))
        .collect();
    format!(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>{}</title><style>\
@page{{size:1920px 1080px;margin:0}}\
html,body{{margin:0}}\
body{{background:{};color:{};font:40px/1.45 {}}}\
.slide{{box-sizing:border-box;width:1920px;height:1080px;padding:96px 128px;overflow:hidden;break-after:page;display:flex;flex-direction:column;justify-content:center;gap:24px;background:{}}}\
h1{{font-size:96px;margin:0}}h2{{font-size:72px;margin:0}}h3,h4,h5,h6{{font-size:52px;margin:0}}p,ul,ol,pre{{margin:0}}\
li{{margin:8px 0}}code{{font-family:ui-monospace,monospace;color:{}}}\
table{{border-collapse:collapse}}th,td{{padding:12px 24px;text-align:left;border-bottom:2px solid {}}}\
</style></head><body>{slides}</body></html>",
        esc(&deck.title),
        css_value(&theme.background, "#ffffff"),
        css_value(&theme.text, "#1a1a1a"),
        css_value(&theme.font, "system-ui"),
        css_value(&theme.background, "#ffffff"),
        css_value(&theme.accent, "#2563eb"),
        css_value(&theme.accent, "#2563eb"),
    )
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
        .and_then(|rel| deck_file(s, &rel).map(|full| (rel, full)))
        .and_then(|(rel, full)| {
            let bytes = std::fs::read(full).map_err(err)?;
            // A Markdown deck is served as the print page that the PDF export loads.
            if rel.ends_with(".md") {
                let text = String::from_utf8(bytes).map_err(err)?;
                return Ok(
                    print_page(&text, &crate::knowledge::theme_get(s)?.loaded.value).into_bytes(),
                );
            }
            Ok(bytes)
        });
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
            "/docs%2Fhandbook%2Fx.md",
            "/docs%2Fslides%2F..%2Fhandbook%2Fx.html",
            "/docs%2Fslides%2Fa%ZZb.html",
        ] {
            assert_eq!(respond(&f.s, bad).status(), StatusCode::NOT_FOUND, "{bad}");
        }
    }

    #[test]
    fn a_markdown_deck_is_served_as_a_print_page_with_no_notes_and_no_raw_html() {
        let f = fx();
        put(
            f.repo.path(),
            "docs/slides/old.md",
            "# Old\n\n**Bold** and `code` <script>x</script>\n\n---\n\n## Two\n\n- a\n- b\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nNote: say this aloud\n",
        );
        let ok = respond(&f.s, &format!("/{}", encode("docs/slides/old.md")));
        assert_eq!(ok.status(), StatusCode::OK);
        let html = String::from_utf8(ok.body().clone()).unwrap();
        assert_eq!(
            html.matches("<section class=\"slide\">").count(),
            2,
            "{html}"
        );
        assert!(html.contains("<h1>Old</h1>"));
        assert!(html.contains("<strong>Bold</strong> and <code>code</code>"));
        assert!(html.contains("&lt;script&gt;x&lt;/script&gt;"));
        assert!(!html.contains("<script>"));
        assert!(html.contains("<ul><li>a</li><li>b</li></ul>"));
        assert!(html.contains("<th>A</th>") && html.contains("<td>2</td>"));
        assert!(!html.contains("say this aloud"), "a note is not printed");
        assert!(html.contains("@page"));
        assert!(
            ok.headers()[header::CONTENT_SECURITY_POLICY]
                .to_str()
                .unwrap()
                .starts_with("default-src 'none'")
        );
    }

    #[test]
    fn a_theme_value_that_could_break_out_of_the_style_is_replaced() {
        assert_eq!(css_value("#ffffff", "x"), "#ffffff");
        assert_eq!(css_value("rgb(1, 2, 3)", "x"), "rgb(1, 2, 3)");
        assert_eq!(css_value("red;}</style><script>", "x"), "x");
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
