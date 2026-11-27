# Spec: factory (delta of add-project-creator)

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-06
Change: `change:add-project-creator`

### Goal

Shipyard ships the workflow `bootstrap` for a new project, and the existing `docs-update`.

### Why

`project-creator` REQ-013 starts a bootstrap run from the brief of a new project. The list of REQ-011 also misses `docs-update` of `docs-freshness`.

### Requirements

- REQ-011: The system SHALL ship the workflows `feature`, `bug`, `spike`, `spec-split`, `review-only`, `docs-update` and `bootstrap`.

### Non-Goals

- A change of the other workflows.

### Acceptance Criteria

- [ ] Factory / Workflows of a new project shows the seven workflows, and each one validates.

## MODIFIED Requirements

### Requirement: REQ-011 Default workflows

The system SHALL ship the workflows `feature`, `bug`, `spike`, `spec-split`, `review-only`, `docs-update` and `bootstrap`. `feature` SHALL grill, plan with a human gate, build with fan-out, review and open a pull request. `bug` SHALL triage, fix, review and open a pull request, with no `PlanReview`. `spike` SHALL grill, investigate and report, with no pull request. `spec-split` SHALL read a change and propose work items behind a human gate. `review-only` SHALL review an existing branch and report. `docs-update` SHALL bring one stale doc up to date and open a pull request. `bootstrap` SHALL plan the first specs and the skeleton of a new project behind a human gate, build them, review and open a pull request.

#### Scenario: Defaults present
- GIVEN a new project
- WHEN a person opens Factory / Workflows
- THEN the seven workflows show and each one validates
