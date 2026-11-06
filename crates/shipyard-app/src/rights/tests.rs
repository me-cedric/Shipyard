//! Team rights in the app (spec `team-rights`, REQ-002 to REQ-007, REQ-009, REQ-010).

use std::process::Command;

use shipyard_core::pickup::Automation;
use shipyard_core::project::ProjectFile;
use shipyard_core::work::{Calendar, Member};
use shipyard_forges::MergeMethod;
use shipyard_store::project::Overrides;
use shipyard_store::project::write_project_file;
use shipyard_store::work::write_team;

use super::*;
use crate::commands::projects;

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

struct Fx {
    dir: tempfile::TempDir,
    s: AppState,
    root: PathBuf,
}

/// A project whose git e-mail is the one of `bo`.
fn fx() -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("p");
    shipyard_git::project::init(&root).unwrap();
    git(&root, &["config", "user.email", "bo@example.com"]);
    git(&root, &["config", "user.name", "Bo"]);
    let s = AppState::new(dir.path().join("data"));
    projects::open(&s, root.to_str().unwrap()).unwrap();
    Fx { dir, s, root }
}

fn member(handle: &str, role: &str) -> Member {
    Member {
        name: handle.to_uppercase(),
        handle: handle.into(),
        emails: vec![format!("{handle}@example.com")],
        role: role.into(),
        capacity: 5.0,
        ..Member::default()
    }
}

/// The team file with these members and, when there is one, an admin `root` that no test
/// matches: rights apply only to a team that names an admin.
fn team_file(root: &Path, mut members: Vec<Member>) {
    std::fs::create_dir_all(root.join(".shipyard")).unwrap();
    if !members.is_empty() && !members.iter().any(|m| m.admin) {
        let mut admin = member("root", "techlead");
        admin.admin = true;
        members.push(admin);
    }
    let team = Team {
        members,
        locked: false,
    };
    std::fs::write(root.join(TEAM_PATH), write_team(&team, None).unwrap()).unwrap();
}

#[test]
fn a_solo_project_gives_each_right_and_the_write_has_an_audit_line() {
    let f = fx();
    let v = current(&f.s).unwrap();
    assert_eq!((v.person.found, v.person.admin), (Found::Solo, true));
    assert_eq!(v.person.rights, Right::ALL);
    assert!(v.branch.is_none() && v.warnings.is_empty() && v.roles.len() == 9);
    require(&f.s, Right::WorkEdit, "work_mark", "SHIP-1").unwrap();
    let tail = audit_tail(&f.s).unwrap();
    assert_eq!(tail.len(), 1);
    let line = &tail[0];
    assert_eq!(
        (line.right, line.found, line.result.as_str()),
        (Right::WorkEdit, Found::Solo, "allowed")
    );
    assert!(
        line.member.is_none()
            && (line.what.as_str(), line.target.as_str()) == ("work_mark", "SHIP-1")
    );
}

#[test]
fn an_unknown_person_gets_a_refusal_that_names_each_right() {
    let f = fx();
    team_file(&f.root, vec![member("ana", "po"), member("cy", "qa")]);
    let s = &f.s;
    let v = current(s).unwrap();
    assert_eq!(
        (v.person.found, v.person.role),
        (Found::Unknown, Some(Role::Viewer))
    );
    let refused = |r: Res<()>, right: &str| {
        assert_eq!(r.unwrap_err(), format!("missing right {right} (viewer)"));
    };
    refused(
        crate::work::calendar_save(s, &Calendar::default()),
        "work.edit",
    );
    refused(
        crate::commands::delivery_docs::personas_set(s, &[]),
        "specs.edit",
    );
    refused(
        crate::design::adr_create(s, "Use X").map(drop),
        "design.edit",
    );
    refused(
        crate::knowledge::doc_write(s, "docs/handbook/a.md", "x", None, true).map(drop),
        "knowledge.edit",
    );
    refused(crate::commands::code::stage(s, &[]), "code.write");
    refused(
        crate::code::pull_merge(s, 1, MergeMethod::Merge, true),
        "code.merge",
    );
    refused(crate::factory::cancel(s, "r1"), "runs.start");
    refused(crate::factory::approve_plan(s, "r1"), "runs.approve");
    refused(crate::delivery::approve(s, 1).map(drop), "runs.approve");
    refused(
        crate::commands::sync::automation_save(s, &Automation::default()),
        "project.settings",
    );
    refused(
        crate::factory::workflow_save(s, "a", "x"),
        "project.settings",
    );
    refused(
        crate::commands::projects::save_overrides(
            s,
            Overrides {
                assignments: Some([("cy@example.com".into(), "viewer".into())].into()),
                ..Overrides::default()
            },
        ),
        "project.settings",
    );
    assert!(!f.root.join("docs/handbook/a.md").exists());
    // The refusals are in the audit log, which a viewer cannot read.
    assert!(audit_tail(s).is_err());
    let lines = audit_lines(s).unwrap();
    assert!(lines.iter().any(|l| l.right == Right::WorkEdit
        && l.result == "refused"
        && l.found == Found::Unknown
        && l.member.is_none()));
    assert!(!allows(s, Right::CostsView));
}

#[test]
fn the_default_branch_gives_the_rights_and_a_local_edit_gives_none() {
    let f = fx();
    team_file(
        &f.root,
        vec![member("bo", "developer"), member("ana", "techlead")],
    );
    git(&f.root, &["add", TEAM_PATH]);
    git(&f.root, &["commit", "-q", "-m", "team"]);
    let remote = f.dir.path().join("remote.git");
    git(
        f.dir.path(),
        &["init", "-q", "--bare", remote.to_str().unwrap()],
    );
    git(
        &f.root,
        &["remote", "add", "origin", remote.to_str().unwrap()],
    );
    git(&f.root, &["push", "-q", "origin", "HEAD:refs/heads/main"]);
    git(&f.root, &["fetch", "-q", "origin"]);
    // `bo` gives himself the admin flag in the working copy only.
    let mut bo = member("bo", "developer");
    bo.admin = true;
    team_file(&f.root, vec![bo, member("ana", "techlead")]);
    // A local branch and a tag named `origin/main` with the edit do not win over the remote ref.
    git(&f.root, &["add", TEAM_PATH]);
    git(&f.root, &["commit", "-q", "-m", "admin"]);
    git(&f.root, &["branch", "origin/main"]);
    git(&f.root, &["tag", "origin/main"]);
    let v = current(&f.s).unwrap();
    assert_eq!(v.branch.as_deref(), Some("origin/main"));
    assert_eq!(v.warnings, ["team-differs"]);
    assert_eq!(
        (v.person.member.as_deref(), v.person.found, v.person.admin),
        (Some("bo"), Found::Email, false)
    );
    assert_eq!(
        require(&f.s, Right::ProjectSettings, "test", "").unwrap_err(),
        "missing right project.settings (developer)"
    );
    require(&f.s, Right::CodeWrite, "test", "").unwrap();
    // A run that `bo` starts keeps his rights.
    let id = f.s.registry().unwrap().active().unwrap().id.clone();
    let a = actor(&f.s, &id).unwrap();
    assert_eq!(a.by, "bo");
    assert!(a.rights.contains(&Right::CodeWrite) && !a.rights.contains(&Right::CodeMerge));
    assert!(actor(&f.s, "another").is_none());
}

#[test]
fn read_only_and_the_personal_role_narrow_and_their_undo_still_saves() {
    let f = fx();
    let ro = Overrides {
        read_only: Some(true),
        ..Overrides::default()
    };
    projects::save_overrides(&f.s, ro).unwrap();
    assert_eq!(
        require(&f.s, Right::WorkEdit, "test", "").unwrap_err(),
        "missing right work.edit (admin): the profile of this project is read only"
    );
    assert!(allows(&f.s, Right::CostsView));
    let pm = Overrides {
        profile_role: Some("pm".into()),
        ..Overrides::default()
    };
    projects::save_overrides(&f.s, pm).unwrap();
    require(&f.s, Right::WorkEdit, "test", "").unwrap();
    assert!(require(&f.s, Right::CodeWrite, "test", "").is_err());
    projects::save_overrides(&f.s, Overrides::default()).unwrap();
    require(&f.s, Right::CodeWrite, "test", "").unwrap();
}

#[test]
fn a_team_file_that_cannot_be_read_gives_no_right() {
    let f = fx();
    std::fs::create_dir_all(f.root.join(".shipyard")).unwrap();
    std::fs::write(f.root.join(TEAM_PATH), "members: [ {").unwrap();
    let v = current(&f.s).unwrap();
    assert_eq!(v.warnings, ["team-invalid"]);
    assert!(v.person.rights.is_empty());
    assert!(require(&f.s, Right::WorkEdit, "test", "").is_err());
}

#[test]
fn the_audit_log_drops_the_lines_older_than_90_days() {
    let dir = tempfile::tempdir().unwrap();
    let line = |time: u64| AuditLine {
        time,
        member: Some("bo".into()),
        found: Found::Email,
        right: Right::CodeWrite,
        what: "push".into(),
        target: String::new(),
        result: "allowed".into(),
    };
    let now = 200 * 86_400;
    audit(dir.path(), "SHIP", &line(now - 100 * 86_400)).unwrap();
    audit(dir.path(), "SHIP", &line(now - 10 * 86_400)).unwrap();
    audit(dir.path(), "SHIP", &line(now)).unwrap();
    let text = std::fs::read_to_string(audit_path(dir.path(), "SHIP")).unwrap();
    let times: Vec<u64> = text.lines().map(time_of).collect();
    assert_eq!(times, [now - 10 * 86_400, now]);
}

/// A team that names `bo` a developer, with the git e-mail of `bo`.
fn developer_bo() -> Fx {
    let f = fx();
    team_file(&f.root, vec![member("bo", "developer")]);
    f
}

#[test]
fn a_file_action_on_the_team_file_needs_project_settings() {
    let f = developer_bo();
    let s = &f.s;
    let refused = |r: Res<()>| {
        assert_eq!(r.unwrap_err(), "missing right project.settings (developer)");
    };
    refused(crate::files::delete(s, TEAM_PATH, true));
    refused(crate::files::delete(s, ".shipyard", true));
    refused(crate::files::delete(s, ".SHIPYARD/Team.yaml", true));
    refused(crate::files::rename(s, ".shipyard", "old", true));
    std::fs::write(f.root.join("a.yaml"), "members: []").unwrap();
    refused(crate::files::rename(s, "a.yaml", TEAM_PATH, true));
    refused(crate::commands::code::discard(
        s,
        &[TEAM_PATH.to_string()],
        true,
    ));
    // A link of the root to the folder does not skip the check.
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(f.root.join(".shipyard"), f.root.join("cfg")).unwrap();
        refused(crate::files::delete(s, "cfg/team.yaml", true));
    }
    assert!(f.root.join(TEAM_PATH).is_file());
    crate::files::create_file(s, "notes.txt", true).unwrap();
    let last = audit_lines(s).unwrap().pop().unwrap();
    assert_eq!(
        (last.what.as_str(), last.target.as_str()),
        ("files_create_file", "notes.txt")
    );
}

#[test]
fn a_typed_user_of_a_connection_finds_no_member() {
    use crate::connections::{ConnectionDraft, ConnectionGroup, ConnectionKind};
    let f = fx();
    let mut zed = member("zed", "techlead");
    zed.admin = true;
    zed.trackers = vec!["zed-acct".into()];
    team_file(&f.root, vec![member("bo", "developer"), zed]);
    let c =
        f.s.connections
            .add(ConnectionDraft {
                name: "Jira".into(),
                group: ConnectionGroup::Tracker,
                kind: ConnectionKind::JiraCloud,
                url: "https://acme.atlassian.net".into(),
                user: Some("zed-acct".into()),
            })
            .unwrap();
    let mut file = ProjectFile::new("p", "P");
    file.connections = Some(shipyard_core::project::ProjectConnections {
        tracker: Some(c.id),
        ..Default::default()
    });
    write_project_file(&f.root, &file).unwrap();
    let p = current(&f.s).unwrap().person;
    assert_eq!(
        (p.member.as_deref(), p.found, p.admin),
        (Some("bo"), Found::Email, false)
    );
}

#[test]
fn a_remote_with_no_default_branch_reads_the_working_copy_with_a_warning() {
    let f = developer_bo();
    let remote = f.dir.path().join("remote.git");
    git(
        f.dir.path(),
        &["init", "-q", "--bare", remote.to_str().unwrap()],
    );
    git(
        &f.root,
        &["remote", "add", "origin", remote.to_str().unwrap()],
    );
    let v = current(&f.s).unwrap();
    assert!(v.branch.is_none());
    assert_eq!(v.warnings, ["team-differs"]);
    assert_eq!(v.person.role, Some(Role::Developer));
    assert!(!v.person.has(Right::ProjectSettings));
}

#[test]
fn each_project_has_its_own_actor_and_an_unknown_one_has_none() {
    let f = developer_bo();
    let first = f.s.registry().unwrap().active().unwrap().id.clone();
    let other = f.dir.path().join("q");
    shipyard_git::project::init(&other).unwrap();
    projects::open(&f.s, other.to_str().unwrap()).unwrap();
    let second = f.s.registry().unwrap().active().unwrap().id.clone();
    assert_ne!(first, second);
    // The project that is not active keeps the person of its own team file.
    let a = actor(&f.s, &first).unwrap();
    assert_eq!(a.by, "bo");
    assert!(!a.rights.contains(&Right::ProjectSettings));
    assert_eq!(actor(&f.s, &second).unwrap().by, "solo");
    assert!(actor(&f.s, "gone").is_none());
}

#[test]
fn a_person_without_project_settings_still_narrows_themselves() {
    let f = developer_bo();
    let ro = Overrides {
        read_only: Some(true),
        theme: Some(shipyard_store::prefs::Theme::Dark),
        ..Overrides::default()
    };
    projects::save_overrides(&f.s, ro).unwrap();
    projects::save_overrides(&f.s, Overrides::default()).unwrap();
    assert!(
        projects::save_overrides(
            &f.s,
            Overrides {
                page_modes: Some(
                    [(
                        "qa".into(),
                        [("code/changes".into(), "read-only".into())].into()
                    )]
                    .into()
                ),
                ..Overrides::default()
            }
        )
        .is_err()
    );
}

#[test]
fn a_junior_keeps_its_narrowing() {
    let f = fx();
    let junior = Overrides {
        assignments: Some([("bo@example.com".into(), "junior".into())].into()),
        ..Overrides::default()
    };
    projects::save_overrides(&f.s, junior).unwrap();
    assert!(allows(&f.s, Right::CodeWrite));
    assert!(!allows(&f.s, Right::CodeMerge) && !allows(&f.s, Right::RunsApprove));
    // A later save of a look override keeps it.
    let mut o = f.s.registry().unwrap().active().unwrap().overrides.clone();
    o.theme = Some(shipyard_store::prefs::Theme::Dark);
    projects::save_overrides(&f.s, o).unwrap();
    assert!(!allows(&f.s, Right::CodeMerge));
}
