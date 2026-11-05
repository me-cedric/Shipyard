Feature: quality-runs

  @spec:quality-runs#REQ-001
  Scenario: Run progress: Running check
    Given a person clicks Run on a check that takes 20 seconds
    When the check runs
    Then the card shows Running, a time that counts up and the last lines of the output

  @spec:quality-runs#REQ-002
  Scenario: Open in the terminal: Open in terminal
    Given a check with the command `pnpm lint`
    When the person clicks Open in terminal
    Then the terminal drawer opens and runs `pnpm lint`

  @spec:quality-runs#REQ-003
  Scenario: Explain each item: Info
    Given the scanner dependencies
    When the person opens its info
    Then the popover says that it looks for known vulnerabilities (CVE) in the lock files

  @spec:quality-runs#REQ-004
  Scenario: Scanner scope: Nested worktree
    Given a copy of the repository under `.claude/worktrees`
    When the dependencies scanner runs
    Then it reports each finding once, from the tracked lock files

  @spec:quality-runs#REQ-005
  Scenario: Secret fixtures: Fixture
    Given a test line with a fake token and the marker
    When the secrets scanner runs
    Then the line is not reported

  @spec:quality-runs#REQ-005
  Scenario: Secret fixtures: Label
    Given an i18n label `secret: "Secret"`
    When the secrets scanner runs
    Then the line is not reported

  @spec:quality-runs#REQ-006
  Scenario: YAML style: Project file
    Given a project with gates
    When Shipyard saves `.shipyard/project.yaml`
    Then `biome format` finds nothing to change in it

  @spec:quality-runs#REQ-007
  Scenario: Docs check scope: Submodule
    Given a submodule with a broken link in its docs
    When Verify all docs runs
    Then the link of the submodule is not reported
