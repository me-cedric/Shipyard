//! The project file of this repository stays valid: Code / Quality and the docs check read it.

use std::path::Path;

use shipyard_store::project::{FileRead, read_project_file};

#[test]
fn the_project_file_of_this_repository_is_valid_and_has_docs_rules() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    match read_project_file(&root).unwrap() {
        FileRead::Valid(f) => {
            assert!(!f.gates.is_empty(), "the gates of Code / Quality");
            assert!(!f.docs.is_empty(), "the docs freshness rules");
        }
        FileRead::Invalid(issues) => panic!("{issues:?}"),
        FileRead::Missing => panic!("no .shipyard/project.yaml"),
    }
}

/// Design / API reads these contracts: a YAML error makes one "Not readable".
#[test]
fn the_api_contracts_of_this_repository_parse() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/api");
    let mut read = 0;
    for e in std::fs::read_dir(&dir).unwrap() {
        let path = e.unwrap().path();
        if path.extension().is_some_and(|x| x == "yaml" || x == "yml") {
            let text = std::fs::read_to_string(&path).unwrap();
            serde_norway::from_str::<serde_norway::Value>(&text)
                .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            read += 1;
        }
    }
    assert!(read > 0, "no contract in docs/api");
}
