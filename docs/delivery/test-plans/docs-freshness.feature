Feature: docs-freshness


  @spec:docs-freshness#REQ-001
  Scenario: Doc rules in the project file: A rule
    Given a project file with a rule that maps `crates/*/Cargo.toml` to `models`
    When Shipyard reads the project file
    Then the project holds that rule

  @spec:docs-freshness#REQ-001
  Scenario: Doc rules in the project file: No list
    Given a project file with no `docs` list
    When Shipyard reads the project file
    Then the project holds no rule of its own

  @spec:docs-freshness#REQ-002
  Scenario: Default rules: Same warnings as before
    Given a project with no `docs` list
    When a file of the specs folder changes and the models folder does not
    Then the warning from specs to models shows as it does today

  @spec:docs-freshness#REQ-003
  Scenario: Stale doc: Doc did not follow
    Given a rule that maps `crates/*/Cargo.toml` to `models`
    When a Cargo file changes and nothing in the models folder changes
    Then the models doc is stale

  @spec:docs-freshness#REQ-003
  Scenario: Stale doc: Doc followed
    Given the same rule
    When a Cargo file and a file of the models folder change together
    Then the models doc is not stale

  @spec:docs-freshness#REQ-004
  Scenario: Same ranges as the docs chain: Before a commit
    Given a staged code file that a rule matches and no staged doc
    When the person starts a commit
    Then the warning shows

  @spec:docs-freshness#REQ-004
  Scenario: Same ranges as the docs chain: Branch watch
    Given a branch that changed a matched code file and no fed doc since its base
    When the person opens the branch watch in Code / Changes
    Then the warning shows

  @spec:docs-freshness#REQ-005
  Scenario: Warnings and acknowledgement: Acknowledge
    Given a stale doc warning
    When the person acknowledges it with a reason
    Then the warning shows as acknowledged and the repository holds the reason

  @spec:docs-freshness#REQ-005
  Scenario: Warnings and acknowledgement: New file
    Given an acknowledged warning
    When another matched code file changes
    Then the warning comes back

  @spec:docs-freshness#REQ-006
  Scenario: Docs check in Quality: Stale docs
    Given a branch with two stale docs
    When the person opens Code / Quality
    Then the Docs check fails and lists the two docs with their code files

  @spec:docs-freshness#REQ-006
  Scenario: Docs check in Quality: Clean
    Given a branch with no stale doc
    When the person opens Code / Quality
    Then the Docs check passes

  @spec:docs-freshness#REQ-007
  Scenario: Update after a click: Click
    Given a stale doc
    When the person clicks "Update with an agent"
    Then one run with the `docs` role starts

  @spec:docs-freshness#REQ-007
  Scenario: Update after a click: No click
    Given a stale doc
    When a sync tick or a check runs
    Then no run starts

  @spec:docs-freshness#REQ-008
  Scenario: Agent run: Run ends
    Given a run that updated the models doc
    When the run ends
    Then the worktree holds changes in the models folder only
    And the pull request waits for a click in Home / Needs you when the switch is off

  @spec:docs-freshness#REQ-009
  Scenario: Readable docs: Broken doc
    Given an agent that left a model file with a syntax error
    When the run ends
    Then the report names the file and the error
    And the pull request does not hold the file

  @spec:docs-freshness#REQ-010
  Scenario: Rule validation: Bad pattern
    Given a rule with the pattern `../outside/*`
    When Shipyard validates the project file
    Then it reports the field `docs[0].code[0]` with that value

  @spec:docs-freshness#REQ-011
  Scenario: Read only check: Check runs
    Given a project with stale docs
    When the check runs
    Then no file of the project changes

  @spec:docs-freshness#REQ-012
  Scenario: Plain words and both languages: Language switch
    Given the person switches the language to French
    When the person opens a stale doc warning
    Then the labels show in French
