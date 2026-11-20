//! Knowledge / Documents extras: a search in the text of the pages and a read-only view of the
//! `.docx` files of the documents folder. Rename and delete use the file actions (`files.rs`).

use std::path::Path;

use serde::Serialize;
use shipyard_store::design::resolve_in;
use shipyard_store::docx_view::{self, Paragraph};
use shipyard_store::export::{Block, Meta, markdown_blocks};
use shipyard_store::knowledge::PageEntry;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::design::project;
use crate::work::need_click;

const FOLDERS: [&str; 3] = ["handbook", "documents", "slides"];
const MAX_HITS: usize = 50;
const MAX_DOCX: u64 = 20_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DocHit {
    pub path: String,
    pub title: String,
    pub line: u32,
    /// The line that holds the text.
    pub snippet: String,
}

/// The documents that hold `query` in their text, in any case, each with its first line that does.
/// At most `MAX_HITS` hits.
pub fn search(s: &AppState, query: &str) -> Res<Vec<DocHit>> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let p = project(s)?;
    let mut out = Vec::new();
    for page in shipyard_store::knowledge::pages(&p.root, p.file.path("documents")) {
        let Ok(text) = std::fs::read_to_string(p.root.join(&page.path)) else {
            continue;
        };
        if let Some((i, line)) = text
            .lines()
            .enumerate()
            .find(|(_, l)| l.to_lowercase().contains(&query))
        {
            out.push(DocHit {
                path: page.path,
                title: page.title,
                line: i as u32 + 1,
                snippet: line.trim().chars().take(160).collect(),
            });
            if out.len() == MAX_HITS {
                break;
            }
        }
    }
    Ok(out)
}

/// The files of the documents folder that are not Markdown pages: the Word files and the other
/// files that a person added. A hidden file and a folder are not listed.
pub fn docx_list(s: &AppState) -> Res<Vec<PageEntry>> {
    let p = project(s)?;
    let dir = p.file.path("documents").to_string();
    let mut out: Vec<PageEntry> = std::fs::read_dir(p.root.join(&dir))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name.ends_with(".md") {
                return None;
            }
            let title = name.strip_suffix(".docx").unwrap_or(&name).to_string();
            Some(PageEntry {
                path: format!("{dir}/{name}"),
                title,
            })
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

// shortcut: a file of 100 MB or more is refused; stream the copy when a person needs more.
const MAX_ADD: u64 = 100_000_000;

/// Copies a file that the person chose into the documents folder, byte for byte: a Word file stays
/// Word. A name that is taken gets a number (`plan-2.docx`): no file is replaced.
pub fn add_file(s: &AppState, source: &str, click: bool) -> Res<PageEntry> {
    need_click(
        s,
        click,
        crate::rights::Right::KnowledgeEdit,
        "doc_add_file",
        source,
    )?;
    let p = project(s)?;
    let src = Path::new(source);
    let name = src
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.starts_with('.'))
        .ok_or_else(|| format!("{source} is not a file"))?;
    let meta = std::fs::metadata(src).map_err(|e| format!("{source}: {e}"))?;
    if !meta.is_file() || meta.len() > MAX_ADD {
        return Err(format!("{source}: not a file or too big"));
    }
    let dir = p.file.path("documents").to_string();
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) => (stem, format!(".{ext}")),
        None => (name, String::new()),
    };
    let _g = s.guard();
    for n in 1.. {
        let file = if n == 1 {
            name.to_string()
        } else {
            format!("{stem}-{n}{ext}")
        };
        let rel = format!("{dir}/{file}");
        let full = resolve_in(&p.root, &p.file, &rel, &FOLDERS)?;
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        // `create_new` fails when the name is taken: the next number is tried.
        let mut out = match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&full)
        {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(err(e)),
        };
        let mut input = std::fs::File::open(src).map_err(err)?;
        if let Err(e) = std::io::copy(&mut input, &mut out) {
            drop(out);
            let _ = std::fs::remove_file(&full);
            return Err(err(e));
        }
        let title = file.strip_suffix(".docx").unwrap_or(&file).to_string();
        return Ok(PageEntry { path: rel, title });
    }
    unreachable!("the loop returns")
}

/// The cover and the blocks of a Markdown document, for Word or PDF. The title is the first heading
/// of the text, or the name of the file; it sits on the cover, so the text does not repeat it.
pub(crate) fn document_doc(s: &AppState, rel: &str) -> Res<(Meta, Vec<Block>)> {
    let p = project(s)?;
    if !rel.ends_with(".md") {
        return Err(format!("{rel} is not a Markdown document"));
    }
    let full = resolve_in(&p.root, &p.file, rel, &["documents"])?;
    let text = crate::design::read_text(&full, rel)?.text;
    let mut blocks = markdown_blocks(&text, 1);
    let title = match blocks.first() {
        Some(Block::Heading(_, h)) => {
            let h = h.clone();
            blocks.remove(0);
            h
        }
        _ => Path::new(rel)
            .file_stem()
            .map_or_else(String::new, |n| n.to_string_lossy().into_owned()),
    };
    let meta = Meta {
        title: title.clone(),
        project: p.file.name.clone(),
        generated_on: crate::work::today(s),
        empty: String::new(),
        gap: String::new(),
        generated: "Generated".into(),
        contents: "Contents".into(),
    };
    let mut all = vec![Block::Title(title), Block::Subtitle(meta.project.clone())];
    all.extend(blocks);
    Ok((meta, all))
}

/// One document as a Word file at `dest` (a `.docx` path). A Markdown document is converted; a
/// Word document is copied as it is. A PDF goes through the print window: see `doc_download`.
pub fn download_document(s: &AppState, rel: &str, dest: &str, click: bool) -> Res<()> {
    crate::reports::need_export_click(s, dest, click)?;
    if rel.ends_with(".docx") {
        let p = project(s)?;
        let full = resolve_in(&p.root, &p.file, rel, &FOLDERS)?;
        let meta = std::fs::metadata(&full).map_err(|e| format!("{rel}: {e}"))?;
        if !meta.is_file() || meta.len() > MAX_DOCX {
            return Err(format!("{rel}: not a file or too big"));
        }
        let bytes = std::fs::read(&full).map_err(err)?;
        return crate::knowledge::write_export(s, dest, "docx", &bytes);
    }
    let (m, blocks) = document_doc(s, rel)?;
    crate::knowledge::write_doc(s, dest, &m, &blocks)
}

/// The paragraphs of a `.docx` file. The file stays unchanged.
pub fn docx_read(s: &AppState, rel: &str) -> Res<Vec<Paragraph>> {
    let p = project(s)?;
    if !rel.ends_with(".docx") {
        return Err(format!("{rel} is not a .docx file"));
    }
    let full = resolve_in(&p.root, &p.file, rel, &FOLDERS)?;
    let meta = std::fs::metadata(&full).map_err(|e| format!("{rel}: {e}"))?;
    if !meta.is_file() || meta.len() > MAX_DOCX {
        return Err(format!("{rel}: not a file or too big"));
    }
    let bytes = std::fs::read(&full).map_err(|e| format!("{rel}: {e}"))?;
    docx_view::paragraphs(&bytes).map_err(err)
}

#[tauri::command]
#[specta::specta]
pub async fn doc_search(app: AppHandle, query: String) -> Api<Vec<DocHit>> {
    blocking(app, move |s| search(s, &query)).await
}

#[tauri::command]
#[specta::specta]
pub async fn doc_docx_list(app: AppHandle) -> Api<Vec<PageEntry>> {
    blocking(app, docx_list).await
}

/// Copies a file that the person chose into the documents folder, after the click of a person.
#[tauri::command]
#[specta::specta]
pub async fn doc_add_file(app: AppHandle, source: String, click: bool) -> Api<PageEntry> {
    blocking(app, move |s| add_file(s, &source, click)).await
}

/// One document as a Word file or as a PDF (macOS first), at the path of a save dialog.
#[tauri::command]
#[specta::specta]
pub async fn doc_download(app: AppHandle, path: String, dest: String, click: bool) -> Api<()> {
    if crate::knowledge::is_pdf(&dest) {
        let to = dest.clone();
        return crate::knowledge::pdf_report(app, dest, move |s| {
            crate::reports::need_export_click(s, &to, click)?;
            document_doc(s, &path)
        })
        .await;
    }
    blocking(app, move |s| download_document(s, &path, &dest, click)).await
}

#[tauri::command]
#[specta::specta]
pub async fn doc_docx_read(app: AppHandle, path: String) -> Api<Vec<Paragraph>> {
    blocking(app, move |s| docx_read(s, &path)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open(dir: &std::path::Path) -> (AppState, std::path::PathBuf) {
        let s = AppState::new(dir.join("data"));
        let p = dir.join("one");
        shipyard_git::project::init(&p).unwrap();
        crate::commands::projects::open(&s, p.to_str().unwrap()).unwrap();
        (s, p)
    }

    #[test]
    fn a_search_finds_the_first_line_of_each_document_and_a_docx_is_listed_and_checked() {
        let dir = tempfile::tempdir().unwrap();
        let (s, p) = open(dir.path());
        let docs = p.join("docs/documents");
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::write(
            docs.join("brief.md"),
            "# Brief\n\nThe Scope is wide.\nscope again\n",
        )
        .unwrap();
        std::fs::write(docs.join("other.md"), "# Other\n").unwrap();
        std::fs::write(docs.join("notes.docx"), b"not a zip").unwrap();
        assert!(search(&s, "  ").unwrap().is_empty());
        let hits = search(&s, "SCOPE").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(
            (
                hits[0].path.as_str(),
                hits[0].line,
                hits[0].snippet.as_str()
            ),
            ("docs/documents/brief.md", 3, "The Scope is wide.")
        );
        let list = docx_list(&s).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "notes");
        assert!(
            docx_read(&s, "docs/documents/notes.docx").is_err(),
            "not a zip"
        );
        assert!(docx_read(&s, "docs/documents/brief.md").is_err());
        assert!(docx_read(&s, "../x.docx").is_err());
    }

    #[test]
    fn a_document_downloads_as_word_and_a_word_file_stays_word() {
        let f = crate::work::tests::fx();
        let docs = f.repo.path().join("docs/documents");
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::write(
            docs.join("brief.md"),
            "# Brief\n\nScope: **wide**.\n\n- a\n- b\n",
        )
        .unwrap();
        std::fs::write(docs.join("plan.docx"), b"PK word bytes").unwrap();
        let out = tempfile::tempdir().unwrap();
        let word = out.path().join("brief.docx");
        assert!(
            download_document(
                &f.s,
                "docs/documents/brief.md",
                word.to_str().unwrap(),
                false
            )
            .is_err()
        );
        download_document(
            &f.s,
            "docs/documents/brief.md",
            word.to_str().unwrap(),
            true,
        )
        .unwrap();
        assert!(std::fs::read(&word).unwrap().starts_with(b"PK"));
        let (m, blocks) = document_doc(&f.s, "docs/documents/brief.md").unwrap();
        assert_eq!(m.title, "Brief");
        assert!(blocks.contains(&Block::Bullets(vec!["a".into(), "b".into()])));
        // The title is on the cover once: the first heading of the text does not repeat it.
        assert!(!blocks.contains(&Block::Heading(1, "Brief".into())));
        // A Word file is copied as it is, and has no PDF form here.
        let copy = out.path().join("plan.docx");
        download_document(
            &f.s,
            "docs/documents/plan.docx",
            copy.to_str().unwrap(),
            true,
        )
        .unwrap();
        assert_eq!(std::fs::read(&copy).unwrap(), b"PK word bytes");
        assert!(document_doc(&f.s, "docs/documents/plan.docx").is_err());
        // Only a file of the documents folder.
        assert!(document_doc(&f.s, "docs/handbook/x.md").is_err());
    }

    #[test]
    fn add_file_copies_any_file_unchanged_and_never_replaces_one() {
        let f = crate::work::tests::fx();
        let from = tempfile::tempdir().unwrap();
        let word = from.path().join("plan.docx");
        std::fs::write(&word, b"PK word bytes").unwrap();
        let w = word.to_str().unwrap();
        assert!(add_file(&f.s, w, false).is_err(), "needs a click");

        let first = add_file(&f.s, w, true).unwrap();
        assert_eq!(first.path, "docs/documents/plan.docx");
        assert_eq!(first.title, "plan");
        let copy = f.repo.path().join(&first.path);
        assert_eq!(std::fs::read(&copy).unwrap(), b"PK word bytes");
        // The same name again gets a number: the first copy stays.
        std::fs::write(&word, b"newer").unwrap();
        let second = add_file(&f.s, w, true).unwrap();
        assert_eq!(second.path, "docs/documents/plan-2.docx");
        assert_eq!(std::fs::read(&copy).unwrap(), b"PK word bytes");

        // Any kind of file, listed with the Word files.
        let pdf = from.path().join("brief.pdf");
        std::fs::write(&pdf, b"%PDF").unwrap();
        add_file(&f.s, pdf.to_str().unwrap(), true).unwrap();
        let titles: Vec<_> = docx_list(&f.s)
            .unwrap()
            .into_iter()
            .map(|e| e.path)
            .collect();
        assert_eq!(
            titles,
            [
                "docs/documents/brief.pdf",
                "docs/documents/plan-2.docx",
                "docs/documents/plan.docx"
            ]
        );

        // A folder and a missing file are refused.
        assert!(add_file(&f.s, from.path().to_str().unwrap(), true).is_err());
        assert!(add_file(&f.s, "/no/such/file.docx", true).is_err());
    }
}
