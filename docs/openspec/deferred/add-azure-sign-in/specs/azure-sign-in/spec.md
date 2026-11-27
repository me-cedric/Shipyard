# Spec: azure-sign-in

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-05
Change: `change:add-azure-sign-in`

### Goal

A person signs in to Azure OpenAI from Settings / Agents and rules with a code in the browser, with no key to copy.

### Why

The owner moved this work out of `add-provider-sign-in` (Q-132). It waits for a Microsoft Entra public client app registration.

### Users And Scenarios

- Developer in a company that uses Azure OpenAI: clicks Sign in on the Azure row, types the code on the Microsoft page, and the row shows Signed in.
- Developer without the role: sees which role to ask for.

### Requirements

- REQ-001: The Azure row SHALL sign in with the Entra ID device code flow. The system SHALL store the tokens in the keychain.
- REQ-002: The row SHALL show a plain message that names the role Cognitive Services OpenAI User when a call is refused for a missing role.
- REQ-003: A token SHALL NOT appear in an argument, a URL, a log or a repository file. Each label SHALL exist in English and French.

### Non-Goals

- Other Microsoft services.
- A change to the pasted key of Azure. It stays as the fallback.

### Acceptance Criteria

- [ ] Sign in on the Azure row shows a code and opens the Microsoft page.
- [ ] After the sign-in, the token is in the keychain and the row shows Signed in.
- [ ] A missing role names Cognitive Services OpenAI User.

## ADDED Requirements

### Requirement: REQ-001 Device sign-in

The Azure row SHALL sign in with the Entra ID device code flow. The system SHALL store the tokens in the keychain.

#### Scenario: Device code
- GIVEN a person clicks "Sign in" on Azure
- WHEN the system gets a device code
- THEN the view shows the code and opens the Microsoft page

### Requirement: REQ-002 Missing role

The row SHALL show a plain message that names the role Cognitive Services OpenAI User when a call is refused for a missing role.

#### Scenario: Missing role
- GIVEN a person with no Cognitive Services OpenAI User role
- WHEN a call is refused
- THEN the row names the role

### Requirement: REQ-003 No secret outside the keychain

A token SHALL NOT appear in an argument, a URL, a log or a repository file. Each label SHALL exist in English and French.

#### Scenario: Token stays in the keychain
- GIVEN a person signed in to Azure
- WHEN the app writes its logs
- THEN no log line holds the token
