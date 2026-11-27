# Spec: visual-cues

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-05
Change: `change:add-visual-cues`

### Goal

A person finds an AI tool, a provider, an issue tracker, a code host and a Settings section by its logo or icon, without reading each label.

### Why

Most screens show these products as words or raw ids, and the long Settings pages have few marks.

### Users And Scenarios

- Junior: opens Settings / Connections and sees the GitHub and Jira logos on their cards.
- Developer: opens the model menu of the assistant and sees Claude Code with its logo, not `claude`.
- PM: opens Factory / Usage and reads the spend of each AI tool by its logo and name.
- Functional lead: opens Settings / Project, clicks Tickets in the section list and lands on that section.

### Requirements

- REQ-001: A known product SHALL show its logo, in the text colour by default and in its brand colour on request. An unknown product SHALL show its first letter. The logos SHALL come from a CC0 set, with the licence noted next to them.
- REQ-002: A logo next to its name SHALL be hidden from assistive technology. A logo shown alone SHALL have the product name as its accessible name.
- REQ-003: A connection card of an AI tool, a model provider, an issue tracker, a code host or an MCP server SHALL show the logo of its product.
- REQ-004: Each place that names an AI tool (the assistant model menu, the default agent, the project overrides, the model tiers, Factory / Usage, Factory / Sessions, the active sessions) SHALL show its logo and its name, not its raw id.
- REQ-005: A pull request ref of a known code host SHALL show the logo of the code host.
- REQ-006: Settings / Project, Connections and Me SHALL show a list of their sections that stays in view, each item with an icon and the section name. A click SHALL scroll to the section. Each section heading of those pages SHALL have an icon.

### Non-Goals

- File type icons, tab bar icons and scanner logos (listed in the proposal for later).
- A change to the words or the states of the screens.

### Acceptance Criteria

- [ ] The GitHub card in Settings / Connections shows the GitHub logo; an unknown product shows its first letter.
- [ ] The model menu lists Claude Code with its logo, and no raw id shows.
- [ ] `pr:github:42` shows the GitHub logo.
- [ ] A click on a section in the section list of Settings / Project scrolls to it.
- [ ] Each logo is `aria-hidden` next to its name or has the product name as its label.

## ADDED Requirements

### Requirement: REQ-001 Product logos

A known product SHALL show its logo, in the text colour by default and in its brand colour on request. An unknown product SHALL show its first letter. The logos SHALL come from a CC0 set, with the licence noted next to them.

#### Scenario: Known product
- GIVEN the product GitHub
- WHEN its logo shows
- THEN the GitHub mark draws in the text colour

#### Scenario: Unknown product
- GIVEN the product `acme`, which has no logo
- WHEN its logo shows
- THEN the letter A shows in a tile

### Requirement: REQ-002 Logo names

A logo next to its name SHALL be hidden from assistive technology. A logo shown alone SHALL have the product name as its accessible name.

#### Scenario: Logo alone
- GIVEN a logo with no visible name
- WHEN a screen reader reads it
- THEN it reads the product name

### Requirement: REQ-003 Connection cards

A connection card of an AI tool, a model provider, an issue tracker, a code host or an MCP server SHALL show the logo of its product.

#### Scenario: Issue tracker card
- GIVEN a Jira Cloud connection
- WHEN Settings / Connections opens
- THEN its card shows the Jira logo

### Requirement: REQ-004 AI tool names

Each place that names an AI tool (the assistant model menu, the default agent, the project overrides, the model tiers, Factory / Usage, Factory / Sessions, the active sessions) SHALL show its logo and its name, not its raw id.

#### Scenario: Model menu
- GIVEN the AI tool `claude` is installed
- WHEN the person opens the model menu of the assistant
- THEN the menu shows the Claude logo and Claude Code

### Requirement: REQ-005 Code host refs

A pull request ref of a known code host SHALL show the logo of the code host.

#### Scenario: GitHub pull request
- GIVEN the ref `pr:github:42`
- WHEN its chip shows
- THEN the chip shows the GitHub logo

### Requirement: REQ-006 Settings sections

Settings / Project, Connections and Me SHALL show a list of their sections that stays in view, each item with an icon and the section name. A click SHALL scroll to the section. Each section heading of those pages SHALL have an icon.

#### Scenario: Jump to a section
- GIVEN Settings / Project is open at the top
- WHEN the person clicks Tickets in the section list
- THEN the page scrolls to the Tickets section
