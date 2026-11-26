---
name: e2e
description: Run, write or heal end-to-end tests with the pnpm scripts: Playwright and its test agents, Maestro, agent-device. Read the result and the reports.
risk_level: medium
writes_files: true
requires_tools: [pnpm, npx]
---

# e2e

Run each suite with the e2e scripts of `package.json` (`pnpm test:e2e`, `pnpm test:personas`). Read the result. Do not guess the cause of a failure.

## Run a suite

1. Read the `scripts` of `package.json`. Look for the suite.
2. Use only these scripts. Never invent a command.
3. Run one test with `pnpm test:e2e <file>`.

## Read the result

Read the output of the script. Open the Playwright HTML report for traces and screenshots.

1. Fix one failure at a time. Run only that test again.
2. A test that fails on one run and passes on the next is flaky. Find the cause. Do not add a retry or a sleep.

## Playwright and its test agents

Set up the agents once with `npx playwright init-agents`. Use the option that matches your client (`--help` lists them).

- The planner explores the app and writes a test plan.
- The generator turns the plan into test files.
- The healer runs the failed tests and edits them.

Review every healer edit as a code change. Read the diff before you accept it.
Reject an edit that removes or weakens an assertion, adds a sleep, widens a selector, or skips a test.
A failing test can show a real bug in the app. Fix the app, not the test.

## Screenshots

Create and update `toHaveScreenshot` baselines only on the pinned CI image. That is the Playwright Docker image at the version in `package.json`.
A baseline from a laptop differs in fonts and rendering. Never commit one.
Review each changed baseline image as a code change.

## Mobile and native apps

- Write stable flows as Maestro YAML files in the flow folder. Run them with `maestro test`.
- Use the agent-device skill to drive a native app on a simulator or a device. Use it to explore and to reproduce a failure.
- Turn a flow that works into a Maestro flow. Then run it with `maestro test`.
