# Spec: quality-runs

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-05
Change: `change:update-quality-runs`

### Goal

A person sees each check and scanner of Code / Quality run, knows what each one is for, and gets findings that are real.

### Why

On the Shipyard repository, Run gave no feedback, and four items failed for causes in Shipyard itself.

### Users And Scenarios

- Developer: runs the tests, sees the time and the last lines, then opens the run in the terminal to read all of it.
- Tester: opens the info of the code scanner and learns that it looks for OWASP issues such as injection and remote code execution.
- Security lead: gets each dependency finding once, with no copy from a nested worktree.

### Requirements

- REQ-001: A running check or scanner SHALL show that it runs, the elapsed time that counts up each second, and the last lines of its output. The Run action SHALL stay off while it runs.
- REQ-002: A check or scanner SHALL offer to run its command in the integrated terminal, only after a click.
- REQ-003: Each check and scanner SHALL have an info button. It SHALL open a popover that says what the item looks for, why it matters and what to do when it fails, in English and French.
- REQ-004: The scanners SHALL skip nested git worktrees, git submodules and git-ignored folders. The dependencies scanner SHALL read only the lock files that git tracks.
- REQ-005: The secrets scanner SHALL NOT report a line that holds the marker `shipyard:allow-secret` or `gitleaks:allow`, or that follows a line with the marker. It SHALL NOT report a value that is a plain word.
- REQ-006: Shipyard SHALL write YAML with the items of a list indented under their key, the style that Biome and Prettier keep.
- REQ-007: Verify all docs SHALL skip the docs of git submodules.

### Non-Goals

- A new scanner program: the dependencies scanner (`osv-scanner`, CVE) and the code scanner (`semgrep`, OWASP rules) already cover CVE, RCE and OWASP issues.
- A change to the findings that a scanner program reports, other than its scope.

### Acceptance Criteria

- [ ] A running check shows Running, a counting time and the last output lines.
- [ ] Open in terminal runs the command in the terminal drawer after a click.
- [ ] Each check and scanner has an info popover in English and French.
- [ ] The dependencies scanner reports no finding from `.claude/worktrees`.
- [ ] A marked fixture and a plain label are not secrets.
- [ ] A project file that Shipyard saves passes `biome format`.
- [ ] Verify all docs skips a submodule.

## ADDED Requirements

### Requirement: REQ-001 Run progress

A running check or scanner SHALL show that it runs, the elapsed time that counts up each second, and the last lines of its output. The Run action SHALL stay off while it runs.

#### Scenario: Running check
- GIVEN a person clicks Run on a check that takes 20 seconds
- WHEN the check runs
- THEN the card shows Running, a time that counts up and the last lines of the output

### Requirement: REQ-002 Open in the terminal

A check or scanner SHALL offer to run its command in the integrated terminal, only after a click.

#### Scenario: Open in terminal
- GIVEN a check with the command `pnpm lint`
- WHEN the person clicks Open in terminal
- THEN the terminal drawer opens and runs `pnpm lint`

### Requirement: REQ-003 Explain each item

Each check and scanner SHALL have an info button. It SHALL open a popover that says what the item looks for, why it matters and what to do when it fails, in English and French.

#### Scenario: Info
- GIVEN the scanner dependencies
- WHEN the person opens its info
- THEN the popover says that it looks for known vulnerabilities (CVE) in the lock files

### Requirement: REQ-004 Scanner scope

The scanners SHALL skip nested git worktrees, git submodules and git-ignored folders. The dependencies scanner SHALL read only the lock files that git tracks.

#### Scenario: Nested worktree
- GIVEN a copy of the repository under `.claude/worktrees`
- WHEN the dependencies scanner runs
- THEN it reports each finding once, from the tracked lock files

### Requirement: REQ-005 Secret fixtures

The secrets scanner SHALL NOT report a line that holds the marker `shipyard:allow-secret` or `gitleaks:allow`, or that follows a line with the marker. It SHALL NOT report a value that is a plain word.

#### Scenario: Fixture
- GIVEN a test line with a fake token and the marker
- WHEN the secrets scanner runs
- THEN the line is not reported

#### Scenario: Label
- GIVEN an i18n label `secret: "Secret"`
- WHEN the secrets scanner runs
- THEN the line is not reported

### Requirement: REQ-006 YAML style

Shipyard SHALL write YAML with the items of a list indented under their key, the style that Biome and Prettier keep.

#### Scenario: Project file
- GIVEN a project with gates
- WHEN Shipyard saves `.shipyard/project.yaml`
- THEN `biome format` finds nothing to change in it

### Requirement: REQ-007 Docs check scope

Verify all docs SHALL skip the docs of git submodules.

#### Scenario: Submodule
- GIVEN a submodule with a broken link in its docs
- WHEN Verify all docs runs
- THEN the link of the submodule is not reported
