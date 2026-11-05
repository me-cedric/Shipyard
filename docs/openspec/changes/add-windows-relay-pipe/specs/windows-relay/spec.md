# Spec: windows-relay

## Purpose

Status: Draft
Owner: Cédric Meyer
Created: 2026-11-05
Change: `change:add-windows-relay-pipe`

### Goal

On Windows, an agent turn reuses the MCP server that the app keeps open, as it does on macOS and Linux.

### Why

Without the pipe, each turn on Windows starts the server again. That is slow, and a server with a sign-in can ask again.

### Users And Scenarios

- Developer on Windows: sends a second message in an assistant thread, and the turn reuses the open server.

### Requirements

- REQ-001: On Windows, the relay SHALL forward each request to the server that the app keeps open, through a named pipe that only the current user can open.
- REQ-002: When the app is closed, the relay SHALL start the server itself, as on the other systems.

### Non-Goals

- A change to the relay on macOS or Linux.
- A network listener.

### Acceptance Criteria

- [ ] On Windows, a second turn reuses the open server.
- [ ] On Windows with the app closed, a headless run still gets its tools.
- [ ] Another user of the machine cannot open the pipe.

## ADDED Requirements

### Requirement: REQ-001 Named pipe

On Windows, the relay SHALL forward each request to the server that the app keeps open, through a named pipe that only the current user can open.

#### Scenario: Second turn on Windows
- GIVEN an assistant thread with an MCP server on Windows
- WHEN the person sends a second message
- THEN the turn reuses the open server and does not start it again

### Requirement: REQ-002 App closed

When the app is closed, the relay SHALL start the server itself, as on the other systems.

#### Scenario: App closed on Windows
- GIVEN the app is closed on Windows
- WHEN a headless run calls the relay
- THEN the relay starts the server and the run continues
