//! The model tier of an agent role (`shell-setup-rights` REQ-006). The view sends a role and a
//! tier, so it never writes the YAML of a role file. A bundled role with no project file gets one.

use crate::commands::{Api, AppState, Res, blocking};
use crate::factory::{role_read, role_save};

/// The tiers that the runner config maps to a model: best, standard and fast.
pub const TIERS: [&str; 3] = ["top", "mid", "small"];

/// `text` with the key `model: <tier>` in its frontmatter. A file with no frontmatter gets one.
fn with_tier(text: &str, tier: &str) -> String {
    let line = format!("model: {tier}");
    let Some(rest) = text.strip_prefix("---\n") else {
        return format!("---\n{line}\n---\n{text}");
    };
    let mut out = String::from("---\n");
    let (mut set, mut closed) = (false, false);
    for l in rest.split_inclusive('\n') {
        if !closed && l.trim_end() == "---" {
            if !set {
                out.push_str(&line);
                out.push('\n');
            }
            closed = true;
        } else if !closed && l.starts_with("model:") {
            out.push_str(&line);
            out.push('\n');
            set = true;
            continue;
        }
        out.push_str(l);
    }
    out
}

/// Set the tier of a role. It writes `.shipyard/roles/<id>.md` and needs `project.settings`, like
/// the write of a role file. A bundled role with no project file starts from its bundled text.
pub fn set(s: &AppState, id: &str, tier: &str) -> Res<()> {
    if !TIERS.contains(&tier) {
        return Err(format!("a tier is one of: {}", TIERS.join(", ")));
    }
    let file = role_read(s, id)?;
    role_save(s, id, &with_tier(&file.text, tier))
}

/// Set the model tier of an agent role.
#[tauri::command]
#[specta::specta]
pub async fn role_model_set(app: tauri::AppHandle, id: String, tier: String) -> Api<()> {
    blocking(app, move |s| set(s, &id, &tier)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::projects;
    use crate::factory::tests::fx;
    use shipyard_core::pickup::Writes;
    use shipyard_store::factory_files::parse_role;

    #[test]
    fn the_tier_replaces_the_key_or_adds_it_and_keeps_the_prompt() {
        let t = with_tier("---\nname: scout\nmodel: mid\n---\nLook it up.\n", "small");
        assert_eq!(t, "---\nname: scout\nmodel: small\n---\nLook it up.\n");
        let t = with_tier("---\nname: scout\n---\nLook it up.\n", "top");
        assert_eq!(t, "---\nname: scout\nmodel: top\n---\nLook it up.\n");
        assert_eq!(
            with_tier("Plain.\n", "mid"),
            "---\nmodel: mid\n---\nPlain.\n"
        );
        let role = parse_role("scout", &with_tier("Plain.\n", "mid")).unwrap();
        assert_eq!(role.model.as_deref(), Some("mid"));
        assert_eq!(role.prompt, "Plain.\n");
    }

    #[test]
    fn a_bundled_role_with_no_file_gets_its_project_file() {
        let f = fx(Writes::default());
        let file = f.repo.path().join(".shipyard/roles/scout.md");
        std::fs::remove_file(&file).unwrap();
        assert!(!file.exists());
        set(&f.s, "scout", "mid").unwrap();
        let role = parse_role("scout", &std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(role.model.as_deref(), Some("mid"));
        // The description of the bundled role stays.
        assert!(!role.description.is_empty());
        assert!(set(&f.s, "scout", "huge").is_err());
        assert!(set(&f.s, "../x", "mid").is_err());
        drop(projects::close(&f.s));
    }

    #[test]
    fn a_person_without_project_settings_cannot_set_a_tier() {
        use shipyard_core::work::{Member, Team};
        use shipyard_store::work::{TEAM_PATH, write_team};
        let f = fx(Writes::default());
        // The team names an admin that is not the person: the person is a viewer.
        let team = Team {
            members: vec![Member {
                name: "Root".into(),
                handle: "root".into(),
                emails: vec!["root@example.com".into()],
                role: "techlead".into(),
                admin: true,
                ..Member::default()
            }],
            ..Team::default()
        };
        std::fs::create_dir_all(f.repo.path().join(".shipyard")).unwrap();
        std::fs::write(
            f.repo.path().join(TEAM_PATH),
            write_team(&team, None).unwrap(),
        )
        .unwrap();
        let file = f.repo.path().join(".shipyard/roles/scout.md");
        let before = std::fs::read_to_string(&file).unwrap();
        let e = set(&f.s, "scout", "top").unwrap_err();
        assert!(e.starts_with("missing right project.settings"), "{e}");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), before);
    }
}
