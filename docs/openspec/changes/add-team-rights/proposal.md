# Team rights

## Why

The owner wants the whole project team in Shipyard (2026-11-06): PO, PM, architect, tech lead, BA, developers, testers and designers. Each person needs access to the project, the rights of their job and the information of their job.

Today, the role is a choice on each machine. Any person can change it, and any person can turn off the read-only flag of a project. The backend checks only that flag. Approve, merge, automation and workflow saves have no check. The team file has a role in free text and no e-mail, so Shipyard cannot find the person in it. Home and the Inbox are the same for each role. The roles have no PO, no tech lead and no admin. The `shell` spec says that a project cannot hide a tab, but the code hides tabs for a role.

## What Changes

- `.shipyard/team.yaml` becomes the one source of the roles and the rights. A member gets e-mails, accounts, a role from a fixed list, an admin flag and optional rights overrides. The team changes the file through pull requests, as code.
- Shipyard finds the person from the account of a signed-in connection, then from the git e-mail. A project with no member gives every right (solo use). With members, an unknown person reads everything and changes nothing.
- Levels per area replace the page modes: each role has `none`, `read` or `write` in `work`, `specs`, `design`, `knowledge`, `code`, `runs`, `settings` and `costs`, and the actions `code.merge` and `runs.approve`. The ten rights of the backend check map to these levels. A `roles:` block of the team file changes the default table, and a member can have several roles (Q-165).
- The backend checks the right of each write command and of each MCP tool. The view turns the control off and gives the reason. A right never hides a view. A role hides an area only with the level `none` (Q-165).
- Each gated write goes to an audit log with the person, the right and the time.
- Home / Today shows the panels of the role. Each role has a first tab. The Inbox sends each item to the people who can act on it, and keeps "Everyone" one click away.
- A one-time proposal moves the roles of this machine into the team file. Work / Team gets a guided setup.

## Impact

- Affected capability: `team-rights` (new). Modified: `shell` (REQ-009, REQ-016), `projects` (REQ-009, REQ-010), `work` (REQ-003).
- Loop: each write of the loop (design, spec, work, factory, code, knowledge) goes through one right check. The member ref `member:<handle>` stays the same.
- Constitution: rules 3.1 and 3.2 change (`adr:0019`).
- Affected code/docs: `crates/shipyard-core/src/rights.rs` (new), `crates/shipyard-core/src/work.rs`, `crates/shipyard-store/src/project.rs`, `crates/shipyard-store/src/prefs.rs`, `crates/shipyard-app/src/rights.rs` (new), `crates/shipyard-app/src/work.rs` and each write command, `crates/shipyard-mcp/src/outside.rs`, `src/lib/prefs/`, `src/features/shell/spaces.ts`, `src/features/home/`, `src/features/work/`, `src/features/settings/`, `src/lib/ipc/mock*.ts`, `src/lib/i18n/`, `docs/api/shipyard-mcp.yaml`, `docs/designs/screens.json`, `docs/guide/` (EN, FR), `docs/plan/MASTER-PLAN.md`, `docs/openspec/constitution.md`, `docs/delivery/test-plans/team-rights.feature`, `CHANGELOG.md`, `CHANGELOG.fr.md`.
- Decision: `adr:0019`. Questions: Q-144 to Q-151, Q-165.
