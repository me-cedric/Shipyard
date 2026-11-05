# Spec: provider-sign-in

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-05
Change: `change:add-provider-sign-in`

### Goal

One view in Settings / Agents and rules lists every AI tool and provider. Each row shows its state and one action. A person signs in or adds a key without a terminal when the tool or provider allows it.

### Why

Today the person must know each tool, its login command and its key page. The owner wants a first hour that works for every role. The boundary is strict: Shipyard runs the own login of a tool and never uses the tokens of that tool for its own calls (ADR 0017).

### Users And Scenarios

- Project manager: opens the view, sees "Signed out" on Claude Code, clicks "Sign in" and finishes in the browser.
- Developer: pastes an OpenAI key after the "Get a key" link, and sees the test result at once.
- Junior: starts Ollama and sees it listed with no action.

### Requirements

- REQ-001: The view SHALL list each coding tool and each provider in one list. Each row SHALL show a name, a state and one action.
- REQ-002: The system SHALL detect the coding tools Claude Code, Codex, GitHub Copilot, OpenCode and Gemini CLI. For the Gemini family it SHALL detect `agy` as well as `gemini`.
- REQ-003: A detected tool SHALL show "Sign in". The action SHALL run the own login command of the tool. The system SHALL NOT read, copy or reuse a token of the tool.
- REQ-004: The system SHALL get the sign-in state of a tool from its status command only: `codex login status` and `claude auth status`. For `opencode`, it SHALL use `opencode auth list` only when Q-134 confirms the output. A tool with no status command SHALL show the state "Not checked", with its sign-in action, until a run of the tool ends on a sign-in error (Q-134). Then it SHALL show "Signed out" until a run ends well or the person clicks Sign in.
- REQ-005: The OpenRouter row SHALL sign in with OAuth PKCE in the browser. The system SHALL exchange the code for a key and SHALL store the key in the keychain.
- REQ-006 (deferred by Q-132: in this change Azure uses a pasted key, REQ-007): The Azure row SHALL sign in with the Entra ID device code flow. The system SHALL store the tokens in the keychain. The row SHALL show a plain message when the person lacks the role Cognitive Services OpenAI User.
- REQ-007: A provider with no OAuth for third parties (OpenAI, Anthropic, Mistral, Google AI Studio) SHALL show a "Get a key" link and a key field. The system SHALL test the key on save and SHALL store it in the keychain only when the test passes.
- REQ-008: The system SHALL probe the local runtimes on localhost only, and SHALL list each one that answers. The system SHALL NOT probe another host.
- REQ-009: A key that Shipyard holds SHALL stay in the keychain. A secret SHALL NOT appear in an argument, a URL, a log or a repository file.
- REQ-010: Each failure SHALL use the error contract and name the reason and one action in plain words. Each view label SHALL exist in English and French. The view SHALL work with the keyboard only.

### Non-Goals

- GitHub Models (retired 2026-07-30).
- "Sign in with ChatGPT" for partners (a preview, with no API key).
- Reuse of the Claude.ai, ChatGPT, Copilot or Antigravity login for a Shipyard call.
- A new model provider type.

### Acceptance Criteria

- [ ] The view shows one row for each detected tool, each provider and each local runtime that answers.
- [ ] "Sign in" on a tool opens its own login. The state changes after the login ends.
- [ ] No Shipyard file or log holds a token of a tool.
- [ ] An OpenRouter sign-in gives a key in the keychain, and a test call works.
- [ ] A wrong pasted key is refused and is not stored.

### Existing References

- Existing code/docs/specs: `crates/shipyard-agents/src/runners.rs`, `crates/shipyard-app/src/device_login.rs`, `src/features/settings/connections/device-signin.ts`, `src/features/settings/agents-rules.tsx`, `crates/shipyard-app/src/errors.rs`
- Supersedes or extends: extends `docs/openspec/specs/extensions/` REQ-001

### Clarifications

- Q-132 Who registers the Azure application, and in which tenant?
- Q-133 Run interactive logins in the integrated terminal or in a dedicated sheet?
- Q-134 How does the view show Gemini, `agy` and Copilot state with no status command, and what does `opencode auth list` print?
- Q-135 Does the view offer the Codex device code (beta)?

## ADDED Requirements

### Requirement: REQ-001 One view

The view SHALL list each coding tool and each provider in one list. Each row SHALL show a name, a state and one action.

#### Scenario: Open the view
- GIVEN Claude Code detected and OpenRouter with no key
- WHEN a person opens Settings / Agents and rules
- THEN one list shows both rows with a state and one action each

### Requirement: REQ-002 Detection

The system SHALL detect the coding tools Claude Code, Codex, GitHub Copilot, OpenCode and Gemini CLI. For the Gemini family it SHALL detect `agy` as well as `gemini`.

#### Scenario: agy only
- GIVEN `agy` on the path and no `gemini`
- WHEN the view loads
- THEN the Gemini row shows as detected

### Requirement: REQ-003 Tool sign-in

A detected tool SHALL show "Sign in". The action SHALL run the own login command of the tool. The system SHALL NOT read, copy or reuse a token of the tool.

#### Scenario: Sign in
- GIVEN Codex detected and signed out
- WHEN a person clicks "Sign in"
- THEN the system runs `codex login` and the browser opens

#### Scenario: No token read
- GIVEN a signed-in Claude Code
- WHEN the view loads
- THEN the system reads no keychain entry and no credential file of the tool

### Requirement: REQ-004 Tool state

The system SHALL get the sign-in state of a tool from its status command only: `codex login status` and `claude auth status`. For `opencode`, it SHALL use `opencode auth list` only when Q-134 confirms the output. A tool with no status command SHALL show the state "Not checked", with its sign-in action, until a run of the tool ends on a sign-in error (Q-134). Then it SHALL show "Signed out" until a run ends well or the person clicks Sign in.

#### Scenario: Codex signed out
- GIVEN `codex login status` exits 1
- WHEN the view loads
- THEN the Codex row shows "Signed out"

#### Scenario: Claude signed in
- GIVEN `claude auth status` exits 0
- WHEN the view loads
- THEN the Claude Code row shows "Signed in"

#### Scenario: No status command
- GIVEN Copilot detected
- WHEN the view loads
- THEN the row shows "Not checked" and "Sign in"

#### Scenario: Sign-in error in a run
- GIVEN Copilot detected
- AND the last run of Copilot ended with the error "not logged in"
- WHEN the view loads
- THEN the row shows "Signed out" and "Sign in"

### Requirement: REQ-005 OpenRouter sign-in

The OpenRouter row SHALL sign in with OAuth PKCE in the browser. The system SHALL exchange the code for a key and SHALL store the key in the keychain.

#### Scenario: Sign in
- GIVEN a person clicks "Sign in" on OpenRouter
- WHEN the browser returns the code to the localhost callback within 10 minutes
- THEN the system gets a key and stores it in the keychain

#### Scenario: Code expired
- GIVEN the code is older than 10 minutes
- WHEN the system exchanges it
- THEN the row shows a plain error and "Sign in" again

### Requirement: REQ-006 Azure sign-in

The Azure row SHALL sign in with the Entra ID device code flow. The system SHALL store the tokens in the keychain. The row SHALL show a plain message when the person lacks the role Cognitive Services OpenAI User.

#### Scenario: Device code
- GIVEN a person clicks "Sign in" on Azure
- WHEN the system gets a device code
- THEN the view shows the code and opens the Microsoft page

#### Scenario: Missing role
- GIVEN a person with no Cognitive Services OpenAI User role
- WHEN a call is refused
- THEN the row names the role

### Requirement: REQ-007 Key paste

A provider with no OAuth for third parties (OpenAI, Anthropic, Mistral, Google AI Studio) SHALL show a "Get a key" link and a key field. The system SHALL test the key on save and SHALL store it in the keychain only when the test passes.

#### Scenario: Good key
- GIVEN a valid OpenAI key
- WHEN a person saves it
- THEN the test passes and the row shows "Ready"

#### Scenario: Bad key
- GIVEN a wrong key
- WHEN a person saves it
- THEN the row shows an error and the system stores nothing

### Requirement: REQ-008 Local runtimes

The system SHALL probe the local runtimes on localhost only, and SHALL list each one that answers. The system SHALL NOT probe another host.

#### Scenario: Ollama runs
- GIVEN Ollama on port 11434
- WHEN the view loads
- THEN `GET /api/tags` answers and the row shows "Running" with no action

#### Scenario: Nothing runs
- GIVEN no local runtime
- WHEN the view loads
- THEN the view lists no local row

### Requirement: REQ-009 Secrets

A key that Shipyard holds SHALL stay in the keychain. A secret SHALL NOT appear in an argument, a URL, a log or a repository file.

#### Scenario: Codex key on stdin
- GIVEN a person pastes a Codex API key
- WHEN the system runs `codex login --with-api-key`
- THEN the key goes on stdin and not in the arguments

### Requirement: REQ-010 Errors and interface

Each failure SHALL use the error contract and name the reason and one action in plain words. Each view label SHALL exist in English and French. The view SHALL work with the keyboard only.

#### Scenario: Language
- GIVEN the language is French
- WHEN a person opens the view
- THEN all labels show in French

#### Scenario: Keyboard
- GIVEN the view is open
- WHEN a person uses only the keyboard
- THEN the person can sign in, paste a key and save
