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
