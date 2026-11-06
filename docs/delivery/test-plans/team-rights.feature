Feature: team-rights

  @spec:team-rights#REQ-001
  Scenario: Team file: Unknown role
    Given a team file where the member `ana` has the role `lead dev`
    When Shipyard loads the team
    Then `ana` has the rights of `viewer`
    And Settings / Health shows a finding for the role of `ana`

  @spec:team-rights#REQ-001
  Scenario: Team file: Unknown level in the roles block
    Given a team file with the `roles:` block `qa: { code: maybe }`
    When Shipyard loads the team
    Then `qa` keeps its default level in `code`
    And Settings / Health shows a finding for `roles.qa.code`

  @spec:team-rights#REQ-002
  Scenario: Rights from the default branch: Local edit
    Given the developer `bo` sets `admin: true` for `bo` in the team file of the working copy
    When `bo` saves Settings / Project
    Then the backend refuses the save and names `project.settings`
    And Work / Team shows the warning that the team file differs from the default branch

  @spec:team-rights#REQ-003
  Scenario: Identity: Account wins
    Given the code host connection gives the login `ana-gh`, which is an account of `ana`
    And the git e-mail is an e-mail of `bo`
    When Shipyard finds the person
    Then the person is `ana`, found from the code host account

  @spec:team-rights#REQ-004
  Scenario: Solo and unknown person: Solo
    Given a project with no team file
    When the person opens Settings / Project
    Then each control is on

  @spec:team-rights#REQ-004
  Scenario: Solo and unknown person: Team file with no admin
    Given a team file with one member and no admin
    When a person opens Settings / Project
    Then each control is on and Health names the missing admin

  @spec:team-rights#REQ-005
  Scenario: Roles and default rights: Override
    Given the member `bo` has the role `developer` and the right `+code.merge`
    When `bo` opens a pull request that is ready
    Then the Merge control is on

  @spec:team-rights#REQ-005
  Scenario: Roles and default rights: Two roles
    Given the member `ana` has the roles `po` and `designer`
    When Shipyard gives the levels of `ana`
    Then `ana` has `write` in `specs` and in `design`

  @spec:team-rights#REQ-006
  Scenario: Personal narrowing: No widening
    Given the member `dee` has the role `pm` in the team file
    When `dee` chooses the personal role `techlead` in Settings / Me
    Then `dee` still has no `code.merge`

  @spec:team-rights#REQ-007
  Scenario: Backend check: MCP tool refused
    Given the person is `viewer` and an outside agent runs with the Shipyard MCP server
    When the agent calls `ticket_comment`
    Then the tool returns an error that names `work.edit` and `viewer`
    And the issue tracker gets no comment

  @spec:team-rights#REQ-008
  Scenario: Same result in the view: Merge off
    Given the member `bo` has the role `developer`
    When `bo` opens a pull request that is ready
    Then the Merge control shows, is off, and its tooltip names `code.merge`

  @spec:team-rights#REQ-009
  Scenario: Runs act for a member: Push waits
    Given the member `cy` has the role `qa` with `-code.write`, and the switch `push` is on
    When a run that `cy` started asks to push
    Then the push waits in the Inbox
    And a person with `code.write` sends it with one click

  @spec:team-rights#REQ-010
  Scenario: Audit log: Refusal logged
    Given the person is `viewer`
    When the person tries to save a ticket
    Then the audit log has a line with `viewer`, `work.edit`, the ticket ref and the result refused

  @spec:team-rights#REQ-011
  Scenario: Ask to join: Join request
    Given an unknown person with a code host connection
    When the person asks to join as `qa`
    Then a pull request adds the person to the team file with the role `viewer`
    And its text names the asked role `qa`

  @spec:team-rights#REQ-012
  Scenario: Role panels on Today: PO panels
    Given the member `eve` has the role `po` and three tickets are ready
    When `eve` opens Home / Today
    Then the panel of the ready items lists the three tickets

  @spec:team-rights#REQ-013
  Scenario: First tab of each role: Architect
    Given the member `ana` has the role `architect` and no last view
    When `ana` opens the project
    Then the main area shows Design / Decisions
    And Design is the second space of the sidebar

  @spec:team-rights#REQ-014
  Scenario: Inbox routing: Approval routing
    Given a run waits for the approval of its plan
    When the member `dee` with the role `pm` opens the Inbox
    Then the approval does not show
    And it shows after one click on "Everyone", with its control off

  @spec:team-rights#REQ-015
  Scenario: Migration of the machine roles: Confirm
    Given this machine maps `eve@example.com` to `lead` for the project
    When an admin confirms the proposal
    Then the team file has a member with the e-mail `eve@example.com` and the role `po`
    And the registry of this machine has no e-mail to role map for the project

  @spec:team-rights#REQ-016
  Scenario: Guided setup: Add a member
    Given an admin in Work / Team
    When the admin adds `fay` with the role `designer`
    Then the view lists the rights of `designer` before the save
    And the save writes `fay` to the team file

  @spec:team-rights#REQ-017
  Scenario: Languages and accessibility: Screen reader
    Given the person has no `code.merge`
    When the focus reaches the Merge control
    Then a screen reader reads the name of the control and the missing right

  @spec:team-rights#REQ-018
  Scenario: Hidden areas: Hidden space
    Given the `roles:` block gives `designer` the level `none` in `code`
    When the member `fay` with the role `designer` opens `/code/history`
    Then the sidebar has no Code
    And the main area shows "No access"

  @spec:team-rights#REQ-018
  Scenario: Hidden areas: Hidden area in a run
    Given the member `fay` has the level `none` in `work`
    When a run that `fay` started calls `read_ticket`
    Then the tool returns an error that names the hidden area `work`

  @spec:team-rights#REQ-019
  Scenario: Edit of the role table: Last admin
    Given the member `ana` is the one admin of the team
    When `ana` removes her admin flag in Work / Team
    Then the backend refuses the save
