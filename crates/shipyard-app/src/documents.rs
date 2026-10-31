//! Knowledge / Documents extras: a search in the text of the pages and a read-only view of the
//! `.docx` files of the documents folder. Rename and delete use the file actions (`files.rs`).

use serde::Serialize;
use shipyard_store::design::resolve_in;
use shipyard_store::docx_view::{self, Paragraph};
use shipyard_store::knowledge::PageEntry;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};
use crate::design::project;

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

/// The `.docx` files of the documents folder.
pub fn docx_list(s: &AppState) -> Res<Vec<PageEntry>> {
    let p = project(s)?;
    let dir = p.file.path("documents").to_string();
    let mut out: Vec<PageEntry> = std::fs::read_dir(p.root.join(&dir))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let title = name.strip_suffix(".docx")?.to_string();
            Some(PageEntry {
                path: format!("{dir}/{name}"),
                title,
            })
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
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
}
