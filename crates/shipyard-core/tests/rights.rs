//! Team rights (spec `team-rights`, REQ-001, REQ-003 to REQ-006).

use shipyard_core::rights::*;
use shipyard_core::work::{Member, Team};

fn member(handle: &str, role: &str) -> Member {
    Member {
        name: handle.to_uppercase(),
        handle: handle.into(),
        trackers: vec![format!("{handle}-gh")],
        emails: vec![format!("{handle}@example.com")],
        role: role.into(),
        ..Member::default()
    }
}

/// A team with these members and, when there is one, an admin `root` that no test matches:
/// rights apply only to a team that names an admin.
fn team(mut members: Vec<Member>) -> Team {
    if !members.is_empty() && !members.iter().any(|m| m.admin) {
        let mut root = member("root", "techlead");
        root.admin = true;
        members.push(root);
    }
    Team {
        members,
        ..Team::default()
    }
}

#[test]
fn a_team_with_no_admin_keeps_every_right_and_says_so() {
    let old = Team {
        members: vec![member("ana", "architect")],
        ..Team::default()
    };
    let p = person(&old, &[], Some("someone@example.com"), None, false);
    assert_eq!((p.found, p.rights.len()), (Found::Solo, Right::ALL.len()));
    assert!(findings(&old).iter().any(|f| f.code == "team-no-admin"));
    assert!(
        !findings(&team(vec![member("ana", "architect")]))
            .iter()
            .any(|f| f.code == "team-no-admin")
    );
}

fn names(rights: &[Right]) -> Vec<&'static str> {
    rights.iter().map(|r| r.as_str()).collect()
}

#[test]
fn each_role_has_the_rights_of_the_table() {
    let has = |role: Role, right: Right| role.defaults().has(right);
    assert!(has(Role::Po, Right::SpecsEdit) && !has(Role::Po, Right::CodeMerge));
    assert!(has(Role::Pm, Right::CostsView) && !has(Role::Pm, Right::RunsApprove));
    assert!(
        has(Role::Architect, Right::CodeMerge) && !has(Role::Architect, Right::ProjectSettings)
    );
    assert_eq!(Role::Techlead.defaults().rights(), Right::ALL);
    assert!(has(Role::Ba, Right::RunsStart) && !has(Role::Ba, Right::CostsView));
    assert!(has(Role::Developer, Right::RunsApprove) && !has(Role::Developer, Right::CodeMerge));
    assert!(has(Role::Qa, Right::CodeWrite) && !has(Role::Qa, Right::RunsApprove));
    assert!(has(Role::Designer, Right::DesignEdit) && !has(Role::Designer, Right::RunsStart));
    assert!(Role::Viewer.defaults().rights().is_empty());
    // Each right names itself, and each role too.
    for r in Right::ALL {
        assert_eq!(Right::parse(r.as_str()), Some(r));
        assert_eq!(serde_json::to_value(r).unwrap(), r.as_str());
    }
    for r in Role::ALL {
        assert_eq!(Role::parse(r.as_str()), Some(r));
    }
    assert_eq!(Role::parse(" Developer "), Some(Role::Developer));
}

#[test]
fn overrides_apply_after_the_role_and_admin_gives_each_right() {
    let mut bo = member("bo", "developer");
    bo.rights = vec![
        "+code.merge".into(),
        "-design.edit".into(),
        "+nope".into(),
        "code.write".into(),
    ];
    let none = Team::default();
    let r = member_access(&none, &bo);
    assert!(r.has(Right::CodeMerge) && !r.has(Right::DesignEdit));
    assert_eq!(r.design, Level::Read);
    let mut ana = member("ana", "viewer");
    ana.admin = true;
    assert_eq!(member_access(&none, &ana), Access::ADMIN);
    // An unknown role is `viewer`.
    assert!(
        member_access(&none, &member("cy", "lead dev"))
            .rights()
            .is_empty()
    );
}

#[test]
fn a_solo_project_gives_each_right_and_an_unknown_person_none() {
    let solo = person(&team(vec![]), &[], Some("x@example.com"), None, false);
    assert_eq!(
        (solo.found, solo.admin, solo.role),
        (Found::Solo, true, None)
    );
    assert_eq!(solo.rights, Right::ALL);
    let t = team(vec![member("ana", "po"), member("bo", "developer")]);
    let p = person(&t, &[], Some("who@example.com"), None, false);
    assert_eq!(
        (p.found, p.role, &p.member),
        (Found::Unknown, Some(Role::Viewer), &None)
    );
    assert!(p.rights.is_empty());
    assert_eq!(
        p.refusal(Right::WorkEdit),
        "missing right work.edit (viewer)"
    );
}

#[test]
fn the_account_wins_over_the_email_and_two_members_give_unknown() {
    let t = team(vec![member("ana", "architect"), member("bo", "developer")]);
    let p = person(&t, &["ANA-gh".into()], Some("bo@example.com"), None, false);
    assert_eq!(
        (p.member.as_deref(), p.found),
        (Some("ana"), Found::Account)
    );
    let p = person(&t, &[], Some("Bo@Example.com"), None, false);
    assert_eq!((p.member.as_deref(), p.found), (Some("bo"), Found::Email));
    assert!(p.has(Right::CodeWrite) && !p.has(Right::CodeMerge));
    assert_eq!(
        p.refusal(Right::CodeMerge),
        "missing right code.merge (developer)"
    );
    let two = person(
        &t,
        &["ana-gh".into(), "bo-gh".into()],
        Some("bo@example.com"),
        None,
        false,
    );
    assert_eq!((two.member, two.found), (None, Found::Unknown));
    // An empty account matches nobody.
    let mut blank = member("cy", "qa");
    blank.trackers = vec![String::new()];
    let p = person(&team(vec![blank]), &[String::new()], None, None, false);
    assert_eq!(p.found, Found::Unknown);
}

#[test]
fn the_personal_role_and_read_only_only_remove_rights() {
    let t = team(vec![member("dee", "pm"), member("ana", "techlead")]);
    // `techlead` on this machine gives `dee` no `code.merge`.
    let p = person(&t, &["dee-gh".into()], None, Some("techlead"), false);
    assert_eq!(
        names(&p.rights),
        ["work.edit", "knowledge.edit", "costs.view"]
    );
    // `pm` on this machine narrows a tech lead.
    let p = person(&t, &["ana-gh".into()], None, Some("pm"), false);
    assert_eq!(
        names(&p.rights),
        ["work.edit", "knowledge.edit", "costs.view"]
    );
    // The old roles map as the migration does; `none` narrows nothing; a strange text leaves nothing.
    let none = Team::default();
    let junior = personal_access(&none, "junior").unwrap();
    assert!(junior.has(Right::CodeWrite) && !junior.has(Right::RunsApprove));
    assert_eq!(personal_access(&none, "lead"), Some(Role::Po.defaults()));
    assert_eq!(personal_access(&none, "none"), None);
    assert_eq!(
        personal_access(&none, "boss"),
        Some(Role::Viewer.defaults())
    );
    // Read only keeps the read right only, for an admin too.
    let p = person(&team(vec![]), &[], None, None, true);
    assert_eq!(names(&p.rights), ["costs.view"]);
    assert_eq!(
        p.refusal(Right::WorkEdit),
        "missing right work.edit (admin): the profile of this project is read only"
    );
}

#[test]
fn an_unknown_role_or_right_is_a_finding() {
    let mut ana = member("ana", "lead dev");
    ana.rights = vec!["+merge".into(), "+code.merge".into()];
    let found = findings(&team(vec![ana, member("bo", "qa")]));
    let codes: Vec<_> = found
        .iter()
        .map(|f| (f.code.as_str(), f.detail.as_deref()))
        .collect();
    assert_eq!(
        codes,
        [
            ("team-role-unknown", Some("ana: lead dev")),
            ("team-right-unknown", Some("ana: +merge")),
        ]
    );
}

#[test]
fn a_shared_email_makes_the_team_invalid_and_resolves_the_member() {
    let mut bo = member("bo", "qa");
    bo.emails = vec!["ANA@example.com".into()];
    assert!(team(vec![member("ana", "po"), bo]).check().is_err());
    let t = team(vec![member("ana", "po")]);
    assert_eq!(
        t.resolve("ana@example.com").map(|m| m.handle.as_str()),
        Some("ana")
    );
}

#[test]
fn the_new_fields_stay_out_of_a_file_that_has_none() {
    let text = serde_norway::to_string(&member("ana", "po")).unwrap();
    assert!(text.contains("emails") && !text.contains("admin") && !text.contains("rights"));
    let back: Member =
        serde_norway::from_str("handle: ana\nrole: po\nadmin: true\nrights: ['+code.merge']\n")
            .unwrap();
    assert!(back.admin && back.rights == ["+code.merge"]);
}

#[test]
fn each_right_maps_to_a_level_of_its_area() {
    let dev = Role::Developer.defaults();
    assert_eq!(
        (dev.code, dev.settings, dev.costs),
        (Level::Write, Level::Read, Level::None)
    );
    // An action counts only with `write` on its area.
    let mut a = Access { merge: true, ..dev };
    assert!(a.has(Right::CodeMerge));
    a.code = Level::Read;
    assert!(!a.has(Right::CodeMerge) && !a.has(Right::CodeWrite));
    assert_eq!(Right::ProjectSettings.area(), Area::Settings);
    assert_eq!(Right::CostsView.need(), Level::Read);
    assert_eq!(Role::Viewer.defaults().hidden(), [Area::Costs]);
}

#[test]
fn several_roles_give_the_highest_level_then_the_overrides() {
    let mut ana = member("ana", "po");
    ana.roles = vec!["designer".into(), "po".into()];
    assert_eq!(roles_of(&ana), [Role::Po, Role::Designer]);
    let t = team(vec![ana.clone()]);
    let p = person(&t, &["ana-gh".into()], None, None, false);
    assert_eq!(p.roles, [Role::Po, Role::Designer]);
    assert_eq!(p.role, Some(Role::Po));
    // `po` gives specs and costs, `designer` gives design.
    assert_eq!(
        (p.access.specs, p.access.design, p.access.costs),
        (Level::Write, Level::Write, Level::Read)
    );
    ana.rights = vec!["-design.edit".into(), "-costs.view".into()];
    let a = member_access(&Team::default(), &ana);
    assert_eq!((a.design, a.costs), (Level::Read, Level::None));
}

#[test]
fn the_roles_block_changes_the_table_and_an_unknown_cell_is_a_finding() {
    let mut t: Team = serde_norway::from_str(
        "members: []\nroles:\n  developer: { code: read, settings: none, merge: true }\n  qa: { cost: read, code: maybe }\n  boss: { work: write }\n",
    )
    .unwrap();
    let dev = role_access(&t, Role::Developer);
    assert_eq!(
        (dev.code, dev.settings, dev.merge),
        (Level::Read, Level::None, true)
    );
    // `merge` needs `write` on code.
    assert!(!dev.has(Right::CodeMerge));
    assert_eq!(role_access(&t, Role::Qa), Role::Qa.defaults());
    let codes: Vec<_> = findings(&t)
        .into_iter()
        .filter(|f| f.code == "team-level-unknown")
        .filter_map(|f| f.detail)
        .collect();
    assert_eq!(
        codes,
        [
            "roles.boss.work: write",
            "roles.qa.code: maybe",
            "roles.qa.cost: read",
        ]
    );
    // The block of a table keeps the cells that differ from the defaults.
    t.roles.remove("qa");
    t.roles.remove("boss");
    let back = block(&table(&t));
    assert_eq!(back, t.roles);
    // A member of the team gets the levels of the block.
    let mut with_bo = team(vec![member("bo", "developer")]);
    with_bo.roles = t.roles;
    let p = person(&with_bo, &["bo-gh".into()], None, None, false);
    assert_eq!(p.level(Area::Settings), Level::None);
    assert!(!p.has(Right::CodeWrite));
}

#[test]
fn settings_stays_visible_for_an_admin_and_the_last_admin_stays() {
    let mut t: Team =
        serde_norway::from_str("members: []\nroles:\n  pm: { settings: none }\n").unwrap();
    let mut root = member("root", "techlead");
    root.admin = true;
    t.members = vec![root, member("dee", "pm")];
    // An admin with the personal role `pm` keeps Settings visible.
    let p = person(&t, &["root-gh".into()], None, Some("pm"), false);
    assert_eq!(p.level(Area::Settings), Level::Read);
    let p = person(&t, &["dee-gh".into()], None, None, false);
    assert_eq!(p.access.hidden(), [Area::Settings]);
    let mut gone = t.clone();
    gone.members[0].admin = false;
    assert!(keeps_admin(&t, &gone).is_err());
    assert!(keeps_admin(&gone, &gone).is_ok());
    assert!(keeps_admin(&t, &t).is_ok());
}

#[test]
fn a_ref_names_its_area() {
    assert_eq!(ref_area("wi:SHIP-1"), Some(Area::Work));
    assert_eq!(ref_area("spec:auth#REQ-003"), Some(Area::Specs));
    assert_eq!(ref_area("adr:0019"), Some(Area::Design));
    assert_eq!(ref_area("doc:docs/a.md"), Some(Area::Knowledge));
    assert_eq!(ref_area("project:x"), None);
}
