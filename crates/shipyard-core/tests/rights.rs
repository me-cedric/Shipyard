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
        ["work.edit", "knowledge.edit", "costs.view", "plan.edit"]
    );
    // `pm` on this machine narrows a tech lead.
    let p = person(&t, &["ana-gh".into()], None, Some("pm"), false);
    assert_eq!(
        names(&p.rights),
        ["work.edit", "knowledge.edit", "costs.view", "plan.edit"]
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
    // `spec:app-redesign#REQ-006`: a viewer does not see Code, until the `roles:` block gives it back.
    assert_eq!(Role::Viewer.defaults().hidden(), [Area::Code, Area::Costs]);
    let t: Team =
        serde_norway::from_str("members: []\nroles:\n  viewer: { code: read }\n").unwrap();
    assert_eq!(role_access(&t, Role::Viewer).hidden(), [Area::Costs]);
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
    let back = block(&table(&t), &[]);
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

// `runs-recipes` REQ-008: the role of a human step.

#[test]
fn only_a_member_with_the_role_approves_a_step_that_names_it_and_a_solo_person_approves_each() {
    let t = team(vec![member("ana", "techlead"), member("bo", "developer")]);
    let by = |email: &str| person(&t, &[], Some(email), None, false);
    let (lead, dev) = (by("ana@example.com"), by("bo@example.com"));
    assert!(may_approve_as(&lead, "techlead"));
    assert!(may_approve_as(&lead, "Techlead"));
    assert!(!may_approve_as(&dev, "techlead"));
    assert!(may_approve_as(&dev, "developer"));
    // An admin without the role does not approve a step of that role: only the role does.
    let admin = by("root@example.com");
    assert!(admin.admin && admin.roles.iter().all(|r| r.as_str() == "techlead"));
    // No team file: solo, with every right.
    let solo = person(&team(vec![]), &[], Some("x@example.com"), None, false);
    assert!(may_approve_as(&solo, "techlead"));
}

// ---- shell-setup-rights REQ-004: the Plan right

#[test]
fn the_default_plan_level_of_each_role_is_its_work_level() {
    for role in Role::ALL {
        let d = role.defaults();
        assert_eq!(d.plan, d.work, "{role:?}");
        assert_eq!(d.has(Right::PlanEdit), d.work == Level::Write);
    }
    assert_eq!(Right::PlanEdit.area(), Area::Plan);
    assert_eq!(Right::parse("plan.edit"), Some(Right::PlanEdit));
}

#[test]
fn plan_see_has_no_plan_edit_and_plan_change_has_it() {
    let see = Access {
        plan: Level::Read,
        ..Role::Developer.defaults()
    };
    assert!(!see.has(Right::PlanEdit) && see.has(Right::WorkEdit));
    let change = Access {
        plan: Level::Write,
        ..Role::Viewer.defaults()
    };
    assert!(change.has(Right::PlanEdit));
}

#[test]
fn a_plan_level_leaves_the_block_only_when_it_differs_from_the_default() {
    let mut t = team(vec![member("ana", "developer")]);
    let mut rows = table(&t);
    assert!(block(&rows, &[]).is_empty());
    rows.iter_mut()
        .find(|(r, _)| *r == Role::Developer)
        .unwrap()
        .1
        .plan = Level::Read;
    t.roles = block(&rows, &[]);
    assert_eq!(t.roles["developer"]["plan"], Cell::Text("read".into()));
    assert_eq!(role_access(&t, Role::Developer).plan, Level::Read);
    assert!(findings(&t).iter().all(|f| f.code != "team-level-unknown"));
}

// ---- shell-setup-rights REQ-011: the places that a role does not see

#[test]
fn a_role_hides_the_places_that_the_block_lists_and_the_defaults_follow_the_design() {
    let mut t = team(vec![member("dee", "designer")]);
    let design: [(Role, &[&str]); 9] = [
        (Role::Po, &["code"]),
        (Role::Pm, &["code"]),
        (Role::Ba, &["crew", "code"]),
        (Role::Architect, &["plan"]),
        (Role::Techlead, &[]),
        (Role::Developer, &[]),
        (Role::Qa, &["plan", "crew"]),
        (Role::Designer, &["plan", "crew", "code"]),
        (Role::Viewer, &["crew", "code"]),
    ];
    for (role, places) in design {
        assert_eq!(role_hidden(&t, role), places);
    }
    assert_eq!(
        person(&t, &[], Some("dee@example.com"), None, false).hidden,
        ["plan", "crew", "code"]
    );
    // The default rights do not change.
    assert!(
        block(
            &table(&t),
            &design.map(|(r, p)| (r, p.iter().map(|x| x.to_string()).collect()))
        )
        .is_empty()
    );
    let rows = table(&t);
    t.roles = block(
        &rows,
        &[(Role::Designer, vec!["code".into(), "plan".into()])],
    );
    assert_eq!(role_hidden(&t, Role::Designer), ["plan", "code"]);
    let dee = person(&t, &[], Some("dee@example.com"), None, false);
    assert_eq!(dee.hidden, ["plan", "code"]);
    // The rights stay the same.
    assert_eq!(dee.rights, Role::Designer.defaults().rights());
    assert!(findings(&t).iter().all(|f| f.code != "team-level-unknown"));
}

#[test]
fn an_admin_and_a_person_with_a_second_role_that_sees_the_place_keep_it() {
    let mut admin = member("ada", "designer");
    admin.admin = true;
    let mut two = member("tom", "designer");
    two.roles = vec!["designer".into(), "developer".into()];
    let mut t = team(vec![admin, two]);
    t.roles = block(&table(&t), &[(Role::Designer, vec!["code".into()])]);
    assert!(
        person(&t, &[], Some("ada@example.com"), None, false)
            .hidden
            .is_empty()
    );
    assert!(
        person(&t, &[], Some("tom@example.com"), None, false)
            .hidden
            .is_empty()
    );
}

#[test]
fn only_known_places_can_be_hidden_and_a_bad_cell_is_a_finding() {
    assert!(clean_hidden(&["setup".into()]).is_err());
    assert!(clean_hidden(&["today".into()]).is_err());
    assert_eq!(
        clean_hidden(&["code".into(), "flow".into(), "code".into()]).unwrap(),
        ["flow", "code"]
    );
    let mut t = team(vec![member("dee", "designer")]);
    t.roles = [(
        "designer".to_string(),
        [("hide".to_string(), Cell::Text("setup".into()))].into(),
    )]
    .into();
    assert!(findings(&t).iter().any(|f| f.code == "team-level-unknown"));
    assert_eq!(role_hidden(&t, Role::Designer), ["plan", "crew", "code"]);
}

#[test]
fn an_empty_hide_cell_shows_every_place_and_is_kept() {
    let mut t = team(vec![member("dee", "designer")]);
    t.roles = block(&table(&t), &[(Role::Designer, Vec::new())]);
    assert_eq!(t.roles["designer"]["hide"], Cell::Text(String::new()));
    assert!(role_hidden(&t, Role::Designer).is_empty());
    assert!(findings(&t).iter().all(|f| f.code != "team-level-unknown"));
    let yaml = serde_norway::to_string(&t).unwrap();
    let back: Team = serde_norway::from_str(&yaml).unwrap();
    assert!(role_hidden(&back, Role::Designer).is_empty());
}

#[test]
fn a_personal_role_that_is_not_known_hides_nothing() {
    let t = team(vec![member("dee", "techlead")]);
    for personal in ["other", "boss", "none"] {
        let p = person(&t, &["dee-gh".into()], None, Some(personal), false);
        assert!(p.hidden.is_empty(), "{personal}");
    }
    let p = person(&t, &["dee-gh".into()], None, Some("lead"), false);
    assert_eq!(p.hidden, ["code"]);
    let p = person(&t, &["dee-gh".into()], None, Some("junior"), false);
    assert!(p.hidden.is_empty());
}

#[test]
fn a_solo_person_sees_the_places_of_the_personal_role_and_a_team_admin_sees_each() {
    let solo = person(&team(vec![]), &[], Some("x@example.com"), Some("po"), false);
    assert_eq!(solo.hidden, ["code"]);
    assert!(
        person(
            &team(vec![]),
            &[],
            Some("x@example.com"),
            Some("other"),
            false
        )
        .hidden
        .is_empty()
    );
    let mut ada = member("ada", "developer");
    ada.admin = true;
    let t = team(vec![ada]);
    assert!(
        person(&t, &[], Some("ada@example.com"), Some("designer"), false)
            .hidden
            .is_empty()
    );
}
