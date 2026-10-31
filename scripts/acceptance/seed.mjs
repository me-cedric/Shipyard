#!/usr/bin/env node
// Seed project for the acceptance run (W13). It writes ~/Projects/shipyard-acceptance as a Shipyard
// project with one file for each artifact kind that the app reads. Run it twice: the second run
// changes nothing. `--remote github` also makes the private repository and a few issues.
//
//   node scripts/acceptance/seed.mjs [--dir <folder>] [--remote github]
//
// No token is read or written here. The `gh` CLI holds the sign-in: git gets it through the
// `gh auth git-credential` helper, never through an argument or an address.

import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const args = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(name);
	return i < 0 ? null : (args[i + 1] ?? "");
};
const target = resolve(flag("--dir") ?? join(homedir(), "Projects", "shipyard-acceptance"));
const remote = flag("--remote");
if (remote !== null && remote !== "github") {
	console.error("--remote takes `github`");
	process.exit(2);
}
const OWNER = "me-cedric";
const REPO = `${OWNER}/shipyard-acceptance`;

/** @type {Map<string, string>} */
const files = new Map();
const put = (path, text) => files.set(path, text.endsWith("\n") ? text : `${text}\n`);
const json = (path, value) => put(path, JSON.stringify(value, null, 2));

// ---------------------------------------------------------------- .shipyard

put(
	".shipyard/project.yaml",
	`name: Shipyard Acceptance
key: ACC
paths:
  decisions: docs/decisions
  questions: docs/delivery/questions
  specs: docs/openspec
defaultWorkflow: feature
gates:
  - git diff --check
`,
);

const team = [
	["Alice Martin", "alice", "Project manager", 5, ["planning", "delivery"], 700, []],
	["Bruno Costa", "bruno", "Architect", 5, ["architecture", "rust"], 850, []],
	["Chloe Dupont", "chloe", "Developer", 5, ["rust", "typescript"], 650, [OWNER]],
	["David Lee", "david", "QA tester", 4, ["testing", "gherkin"], 550, []],
	["Emma Rossi", "emma", "Business analyst", 5, ["specs", "workshops"], 600, []],
	["Farid Haddad", "farid", "Functional lead", 3, ["specs", "governance"], 800, []],
	["Gina Novak", "gina", "Junior", 5, ["typescript"], 400, []],
];
put(
	".shipyard/team.yaml",
	`members:\n${team
		.map(
			([name, handle, role, cap, skills, rate, trackers]) =>
				`  - name: ${name}
    handle: ${handle}
    role: ${role}
    capacity: ${cap}
    skills: [${skills.join(", ")}]
    dayRate: ${rate}${trackers.length ? `\n    trackers: [${trackers.join(", ")}]` : ""}${
			handle === "david"
				? "\n    availability:\n      absences:\n        - from: 2026-12-21\n          to: 2026-12-31"
				: ""
		}`,
		)
		.join("\n")}
`,
);

put(
	".shipyard/automation.yaml",
	`interval: 60
pickup:
  label: agent
  statuses: []
concurrency:
  global: 2
writes:
  push: false
  pull_request: false
  tracker_transition: false
  tracker_comment: false
`,
);

put(
	".shipyard/learning.yaml",
	`feeds: []
paths:
  - id: start-here
    title: Start here
    experts: [chloe, bruno]
    steps:
      - id: loop
        kind: reading
        title: The loop from design to merge
        url: https://github.com/me-cedric/shipyard-acceptance
      - id: gherkin
        kind: course
        title: Write a Gherkin scenario
        url: https://cucumber.io/docs/gherkin/
  - id: architecture
    title: Read the architecture
    experts: [bruno]
    steps:
      - id: c4
        kind: reading
        title: The C4 model
        url: https://c4model.com/
progress:
  gina:
    - start-here/loop
`,
);

// Workflows and roles come from the templates that ship with the app.
const copyTree = (from, to) => {
	for (const name of readdirSync(from).sort()) {
		const src = join(from, name);
		if (statSync(src).isDirectory()) copyTree(src, `${to}/${name}`);
		else put(`${to}/${name}`, readFileSync(src, "utf8"));
	}
};
copyTree(
	join(repoRoot, "crates/shipyard-store/templates/factory/workflows"),
	".shipyard/workflows",
);
copyTree(join(repoRoot, "crates/shipyard-store/templates/factory/roles"), ".shipyard/roles");
copyTree(
	join(repoRoot, "docs/openspec/schemas/shipyard-delivery"),
	"docs/openspec/schemas/shipyard-delivery",
);

put(".gitignore", ".DS_Store\n._*\nThumbs.db\nDesktop.ini\n");
put(
	"README.md",
	`# Shipyard acceptance

Sample project for the acceptance run of Shipyard. It holds sample data only. The script
\`scripts/acceptance/seed.mjs\` of the Shipyard repository writes and refreshes it.
`,
);

// ---------------------------------------------------------------- decisions (MADR)

const adr = (n, slug, status, title, context, options, outcome, extra = "") =>
	put(
		`docs/decisions/${n}-${slug}.md`,
		`---
status: ${status}
date: 2026-10-${10 + Number(n)}
decision-makers: [Bruno Costa]
${extra}---
# ${title}
## Context and problem statement
${context}
## Considered options
${options.map((o) => `- ${o}`).join("\n")}
## Decision outcome
${outcome}
### Consequences
- See the spec \`spec:checkout\` and the diagram \`diagram:context\`.
`,
	);
adr(
	"0001",
	"one-payment-provider",
	"accepted",
	"One payment provider",
	"The shop needs card payments in the first release.",
	["Provider A", "Provider B"],
	'Chosen option: "Provider A", because it covers every card of the target countries.',
);
adr(
	"0002",
	"queue-for-orders",
	"proposed",
	"A queue for orders",
	"Order intake peaks on sale days.",
	["A queue", "Direct calls"],
	'Proposed option: "A queue". A person decides.',
);
adr(
	"0003",
	"no-shared-database",
	"rejected",
	"A shared database for all services",
	"Two services need the same customer rows.",
	["A shared database", "An API between services"],
	'Chosen option: "An API between services", because a shared database ties the release of both services.',
	'comment: "Refused. See ADR 0001 for the same reasoning."\n',
);

// ---------------------------------------------------------------- questions (RAID)

const raid = (id, kind, status, title, body, spec = "", answer = "") =>
	put(
		`docs/delivery/questions/${id}.md`,
		`---
id: ${id}
kind: ${kind}
status: ${status}
raisedAt: 2026-10-2${id.slice(-1)}
raisedBy: emma
owner: Farid Haddad
specRef: ${spec}
taskRef: 
ticket: 
---
# ${title}
${body}${answer ? `\n\n## Answer\n${answer}` : ""}
`,
	);
raid(
	"Q-001",
	"question",
	"open",
	"Can a customer combine two discount codes?",
	"The business rule is not written.\n\nOptions:\n1. One code for each order. (recommended)\n2. Codes stack.",
	"spec:discounts",
);
raid(
	"Q-002",
	"question",
	"answered",
	"Which currency does the shop use first?",
	"The price list needs one currency.\n\nOptions:\n1. EUR. (recommended)\n2. USD.",
	"spec:checkout",
	"EUR. The second currency waits for release 2.",
);
raid(
	"Q-003",
	"risk",
	"open",
	"The payment provider has a rate limit",
	"A sale day can reach the limit of the provider.",
);
raid(
	"Q-004",
	"assumption",
	"answered",
	"The shop sells to one country first",
	"Assumption: France only in release 1.",
	"",
	"Confirmed by the functional lead.",
);
raid(
	"Q-005",
	"dependency",
	"open",
	"The tax table comes from finance",
	"Checkout waits for the tax table of finance.",
);

// ---------------------------------------------------------------- OpenSpec

put("docs/openspec/config.yaml", "schema: shipyard-delivery\n");
put(
	"docs/openspec/constitution.md",
	`# Acceptance constitution

1. A spec comes before code.
2. Each spec names the roles it serves.
3. A person decides what an agent may not guess.
`,
);

const spec = (_cap, title, goal, reqs, status = "Draft", unknown = "") => `# Spec: ${title}

Status: ${status}
Owner: Emma Rossi
Created: 2026-10-20

## Goal

${goal}

## Why

A sample capability for the acceptance run.

## Users And Scenarios

- Project manager: reads the status of the capability.
- Developer: builds the capability from the requirements.
- QA tester: writes one scenario for each requirement.

## Requirements

${reqs.map((r, i) => `- REQ-00${i + 1}: ${r}`).join("\n")}${unknown ? `\n\n${unknown}` : ""}

## Non-Goals

- Anything that the requirements do not list.

## Acceptance Criteria

${reqs.map((r) => `- [ ] ${r}`).join("\n")}

## Existing References

- Existing code/docs/specs: \`adr:0001\`, \`diagram:context\`
- Supersedes or extends: N/A
`;
const plan = (title, cap) => `# Plan: ${title}

Spec: [spec.md](./spec.md)
Date: 2026-10-21

## Summary

Smallest change that meets the spec.

## Technical Context

| Item | Decision |
| ---- | -------- |
| Stack/runtime | Existing stack |
| Dependencies | None |
| Data/storage | N/A |
| APIs/contracts | \`api:shop\` |
| Risks | The payment provider has a rate limit. |

## Affected Surfaces

- Code: \`src/${cap}/\`
- Tests: \`docs/delivery/test-plans/${cap}.feature\`
- Docs/specs: \`docs/openspec/specs/${cap}/\`

## Approach

Add the rule, then the screen.

## Validation

\`\`\`bash
git diff --check
\`\`\`

## Docs And Spec Sync

- [x] Spec still matches intended behavior.
`;
const checklist = (title, ticked) => `# Checklist: ${title}

Spec: [spec.md](./spec.md)

## Clarity

- [${ticked ? "x" : " "}] Goal explains what changes and why.
- [${ticked ? "x" : " "}] No unresolved \`[NEEDS CLARIFICATION]\` markers remain.

## Completeness

- [${ticked ? "x" : " "}] Requirements are testable.

## Consistency

- [${ticked ? "x" : " "}] Tasks map to requirements and acceptance criteria.
`;
const tasks = (title, cap, done) => `# Tasks: ${title}

Spec: [spec.md](./spec.md)
Plan: [plan.md](./plan.md)

## Task Rules

- Tests before implementation when behavior changes.

## Tasks

- [${done ? "x" : " "}] T001 Write the scenarios in \`docs/delivery/test-plans/${cap}.feature\`. Covers REQ-001.
- [${done ? "x" : " "}] T002 Build the rule in \`src/${cap}/\`. Covers REQ-001, REQ-002.
- [${done ? "x" : " "}] T003 Run \`git diff --check\`.

## Completion Check

- [${done ? "x" : " "}] All acceptance criteria are met.
`;
const quartet = (
	base,
	cap,
	title,
	goal,
	reqs,
	{ status = "Draft", unknown = "", done = false } = {},
) => {
	put(`${base}/${cap}/spec.md`, spec(cap, title, goal, reqs, status, unknown));
	put(`${base}/${cap}/plan.md`, plan(title, cap));
	put(`${base}/${cap}/checklist.md`, checklist(title, done));
	put(`${base}/${cap}/tasks.md`, tasks(title, cap, done));
};

// Two settled capabilities, one open change, one change that is ready to archive, one archived change.
quartet(
	"docs/openspec/specs",
	"checkout",
	"checkout",
	"A customer pays for a cart in one page.",
	[
		"The customer SHALL see the cart total before paying.",
		"The system SHALL refuse an empty cart.",
	],
	{ status: "Accepted", done: true },
);
quartet(
	"docs/openspec/specs",
	"accounts",
	"accounts",
	"A customer signs in with an email and a password.",
	["The system SHALL refuse a weak password.", "The customer SHALL reset a password by email."],
	{ status: "Accepted", done: true },
);

put(
	"docs/openspec/changes/add-discount-codes/proposal.md",
	`# Add discount codes

## Why

Marketing wants to run a sale with a code.

## What Changes

- A customer types a discount code on the checkout page.
- The total shows the discount.

## Impact

- Affected capability: \`discounts\`
- Affected code/docs: \`src/discounts/\`
`,
);
quartet(
	"docs/openspec/changes/add-discount-codes/specs",
	"discounts",
	"discounts",
	"A customer applies one discount code to a cart.",
	[
		"The customer SHALL apply one code to a cart.",
		"The system SHALL show the discount in the total.",
	],
	{
		unknown: "[NEEDS CLARIFICATION: can a customer combine two codes? See q:Q-001.]",
	},
);

put(
	"docs/openspec/changes/add-gift-cards/proposal.md",
	`# Add gift cards

## Why

A customer wants to give a balance to a friend.

## What Changes

- A customer buys a gift card with a code.
- The code pays a part of a cart.

## Impact

- Affected capability: \`gift-cards\`
- Affected code/docs: \`src/gift-cards/\`
`,
);
quartet(
	"docs/openspec/changes/add-gift-cards/specs",
	"gift-cards",
	"gift cards",
	"A customer pays a part of a cart with a gift card.",
	[
		"The system SHALL give a code for each gift card.",
		"The customer SHALL pay a part of a cart with a code.",
	],
	{ done: true },
);

put(
	"docs/openspec/changes/archive/2026-10-20-add-checkout/proposal.md",
	`# Add checkout

## Why

The shop has no way to pay.

## What Changes

- A customer pays for a cart in one page.

## Impact

- Affected capability: \`checkout\`
- Affected code/docs: \`src/checkout/\`
`,
);
quartet(
	"docs/openspec/changes/archive/2026-10-20-add-checkout/specs",
	"checkout",
	"checkout",
	"A customer pays for a cart in one page.",
	[
		"The customer SHALL see the cart total before paying.",
		"The system SHALL refuse an empty cart.",
	],
	{ status: "Accepted", done: true },
);

// ---------------------------------------------------------------- diagrams, models, api, data, screens

const sw = (id, type, x, y, w, h, extra = {}) => ({
	id,
	type,
	x,
	y,
	width: w,
	height: h,
	angle: 0,
	strokeColor: "#1e1e1e",
	backgroundColor: "transparent",
	fillStyle: "solid",
	strokeWidth: 2,
	strokeStyle: "solid",
	roughness: 1,
	opacity: 100,
	groupIds: [],
	frameId: null,
	roundness: null,
	seed: 1,
	version: 1,
	versionNonce: 1,
	isDeleted: false,
	boundElements: null,
	updated: 1,
	link: null,
	locked: false,
	...extra,
});
const text = (id, x, y, t) =>
	sw(id, "text", x, y, t.length * 10, 25, {
		text: t,
		originalText: t,
		fontSize: 20,
		fontFamily: 1,
		textAlign: "left",
		verticalAlign: "top",
		baseline: 18,
		containerId: null,
		lineHeight: 1.25,
	});
json("docs/diagrams/context.excalidraw", {
	type: "excalidraw",
	version: 2,
	source: "shipyard-acceptance",
	elements: [
		sw("a", "rectangle", 100, 100, 180, 80, { roundness: { type: 3 } }),
		text("ta", 130, 126, "Web shop"),
		sw("b", "rectangle", 420, 100, 180, 80, { roundness: { type: 3 } }),
		text("tb", 440, 126, "Payments"),
		sw("c", "arrow", 280, 140, 140, 0, {
			points: [
				[0, 0],
				[140, 0],
			],
			startArrowhead: null,
			endArrowhead: "arrow",
			startBinding: null,
			endBinding: null,
			lastCommittedPoint: null,
		}),
	],
	appState: { viewBackgroundColor: "#ffffff" },
	files: {},
});
put(
	"docs/diagrams/checkout-flow.mmd",
	`flowchart LR
  cart[Cart] --> pay{Pay}
  pay -->|card ok| done[Order placed]
  pay -->|card refused| cart
`,
);
put(
	"docs/diagrams/order-process.bpmn",
	`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start" name="Order received"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Check" name="Check stock"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="End" name="Order shipped"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Check" />
    <bpmn:sequenceFlow id="F2" sourceRef="Check" targetRef="End" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="152" y="102" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Check_di" bpmnElement="Check"><dc:Bounds x="240" y="80" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_di" bpmnElement="End"><dc:Bounds x="392" y="102" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="188" y="120" /><di:waypoint x="240" y="120" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="340" y="120" /><di:waypoint x="392" y="120" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`,
);
put(
	"docs/diagrams/deployment.drawio",
	`<mxfile host="shipyard-acceptance">
  <diagram id="d1" name="Deployment">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" page="1" pageWidth="827" pageHeight="1169">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="2" value="Browser" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="80" y="80" width="120" height="60" as="geometry" /></mxCell>
        <mxCell id="3" value="API" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="300" y="80" width="120" height="60" as="geometry" /></mxCell>
        <mxCell id="4" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry" /></mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`,
);
put(
	"docs/models/shop.c4",
	`specification {
  element person
  element system
  element container
}

model {
  customer = person 'Customer'
  shop = system 'Web shop' {
    web = container 'Web app'
    api = container 'API'
  }
  payments = system 'Payments'

  customer -> shop.web 'buys'
  shop.web -> shop.api 'calls'
  shop.api -> payments 'charges'
}

views {
  view index {
    include *
  }
}
`,
);
put(
	"docs/api/shop.yaml",
	`openapi: 3.0.3
info:
  title: Shop API
  version: 1.0.0
servers:
  - url: https://api.example.test
paths:
  /carts/{id}:
    get:
      summary: Read a cart
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: The cart
`,
);
put(
	"docs/data-models/shop.dbml",
	`Table customers {
  id integer [pk]
  email varchar [unique]
}

Table orders {
  id integer [pk]
  customer_id integer [ref: > customers.id]
  total decimal
}
`,
);
put(
	"docs/designs/checkout.html",
	`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Checkout</title></head>
<body><h1>Checkout</h1><p>Total: 42.00 EUR</p><button>Pay</button></body></html>
`,
);
json("docs/designs/screens.json", {
	screens: [
		{ slug: "checkout", title: "Checkout", artifacts: ["diagram:checkout-flow", "api:shop"] },
	],
});

// ---------------------------------------------------------------- flows and bricks

json("docs/flows/network.json", {
	version: 1,
	flows: [
		{
			id: "flow-1",
			name: "web-to-api",
			source: "10.0.1.0/24",
			destination: "10.0.2.10/32",
			vlan: "vlan-10",
			subnet: "10.0.1.0/24",
			protocol: "tcp",
			ports: "443",
			action: "Allow",
			description: "The web tier calls the API.",
			sourceName: "Web",
			destinationName: "API",
		},
		{
			id: "flow-2",
			name: "api-to-db",
			source: "10.0.2.10/32",
			destination: "10.0.3.5/32",
			vlan: "vlan-20",
			subnet: "10.0.2.0/24",
			protocol: "tcp",
			ports: "5432",
			action: "Allow",
			description: "The API reads the database.",
			sourceName: "API",
			destinationName: "Database",
		},
		{
			id: "flow-3",
			name: "web-to-db",
			source: "10.0.1.0/24",
			destination: "10.0.3.5/32",
			vlan: "vlan-10",
			subnet: "10.0.1.0/24",
			protocol: "tcp",
			ports: "5432",
			action: "Deny",
			description: "No direct access.",
			sourceName: "Web",
			destinationName: "Database",
		},
	],
});
json("docs/flows/bricks.json", {
	version: 1,
	bricks: [
		{ id: "web", name: "Web", description: "The web tier" },
		{ id: "api", name: "API", description: "The application tier" },
		{ id: "database", name: "Database", description: "The data tier" },
	],
});

// ---------------------------------------------------------------- costing, plan, time

const task = (id, name, role, days, extra = "") => `      - id: ${id}
        name: ${name}
        description: ${name}.
        role: ${role}${days === null ? "" : `\n        days: ${days}`}${extra}`;
put(
	"docs/costing/checkout.yaml",
	`name: Checkout
currency: EUR
marginRate: 0.15
features:
  - id: f-cart
    name: Cart
    description: The cart page.
    tasks:
${task("t-cart-api", "Cart API", "developer", 3, "\n        optimistic: 2\n        pessimistic: 6\n        confidence: medium")}
${task("t-cart-page", "Cart page", "developer", 4)}
${task("t-cart-spec", "Cart specification", "business analyst", 2)}
  - id: f-pay
    name: Payment
    description: The payment step.
    tasks:
${task("t-pay-api", "Payment API", "developer", 5)}
${task("t-pay-design", "Payment design", "architect", 1)}
${task("t-tests", "Tests", "qa tester", null, "\n        percent: 20")}
`,
);
put(
	"docs/costing/onboarding.yaml",
	`name: Onboarding
currency: EUR
marginRate: 0.1
features:
  - id: f-guide
    name: Guide
    description: The first-hour guide.
    tasks:
${task("t-guide", "Write the guide", "junior", 2)}
`,
);
put(
	"docs/planning/plan.yaml",
	`order:
  - est:checkout#t-cart-spec
  - est:checkout#t-cart-api
  - est:checkout#t-cart-page
tasks:
  est:checkout#t-cart-spec:
    start: 2026-11-02
    member: emma
  est:checkout#t-cart-api:
    member: chloe
`,
);
put(
	"docs/planning/calendar.yaml",
	`workingDays: [1, 2, 3, 4, 5]\nholidays:\n  - 2026-12-24\ncountry: FR\n`,
);
const entries = (list) =>
	`entries:\n${list.map(([id, day, minutes, note, ticket]) => `  - id: ${id}\n    day: ${day}\n    minutes: ${minutes}\n    note: ${note}${ticket ? `\n    ticket: ${ticket}` : ""}`).join("\n")}\n`;
put(
	"docs/time/chloe/2026-10.yaml",
	entries([
		["e1", "2026-10-26", 240, "Cart API", `${REPO}#1`],
		["e2", "2026-10-27", 480, "Cart API", `${REPO}#1`],
		["e3", "2026-10-28", 120, "Review", ""],
	]),
);
put(
	"docs/time/alice/2026-10.yaml",
	entries([
		["e1", "2026-10-26", 60, "Planning", ""],
		["e2", "2026-10-29", 90, "Status report", ""],
	]),
);

// ---------------------------------------------------------------- test plans, personas, delivery files

put(
	"docs/delivery/test-plans/checkout.feature",
	`@spec:checkout
Feature: Checkout

  @spec:checkout#REQ-001
  Scenario: The customer sees the total
    Given a cart with two items
    When the customer opens the checkout page
    Then the page shows the cart total

  @spec:checkout#REQ-002
  Scenario: An empty cart is refused
    Given an empty cart
    When the customer opens the checkout page
    Then the page asks the customer to add an item
`,
);
put(
	"docs/delivery/test-plans/discounts.feature",
	`Feature: Discount codes

  @spec:discounts#REQ-001
  Scenario Outline: A code changes the total
    Given a cart of <total> EUR
    When the customer applies the code <code>
    Then the total is <result> EUR

    Examples:
      | total | code   | result |
      | 100   | SALE10 | 90     |
      | 50    | SALE20 | 40     |
`,
);
json("docs/personas/personas.json", {
	version: 1,
	personas: [
		{
			id: "pm",
			name: "Project manager",
			description: "Plans and follows the delivery.",
			tjm: 700,
			cjm: 450,
			username: "alice",
			active: true,
		},
		{
			id: "dev",
			name: "Developer",
			description: "Builds the rules.",
			tjm: 650,
			cjm: 420,
			username: "chloe",
			active: true,
		},
		{
			id: "qa",
			name: "QA tester",
			description: "Writes the scenarios.",
			tjm: 550,
			cjm: 350,
			username: "david",
			active: true,
		},
	],
});
json("docs/delivery/assignments.json", {
	generatedAt: "2026-10-30",
	overlapRisk: "low",
	gates: [{ what: "Tax table", blocks: ["A1"], unblockedBy: "finance", approver: "Farid Haddad" }],
	assignments: [
		{
			personaId: "dev",
			personaName: "Developer",
			scope: ["checkout"],
			brief: "Build the checkout rules.",
			items: [
				{
					id: "A1",
					title: "Cart API",
					why: "The page needs the total.",
					firstSteps: ["Read spec:checkout"],
					specRef: "spec:checkout",
					mandays: 3,
					gate: "Tax table",
				},
			],
			seams: [
				{
					with: "qa",
					contract: "docs/delivery/test-plans/checkout.feature",
					rule: "Scenarios first",
				},
			],
		},
	],
});
json("docs/delivery/tickets.config.json", {
	issueTypes: { epic: "Epic", story: "Story", task: "Task", subtask: "Sub-task" },
	estimate: { mode: "none" },
	hoursPerDay: 8,
	hierarchy: "feature",
	labels: ["agent"],
});

// ---------------------------------------------------------------- knowledge

put("docs/handbook/index.md", "# Handbook\n\nStart with [the checkout rules](./checkout.md).\n");
put(
	"docs/handbook/checkout.md",
	"# Checkout rules\n\nA customer pays in one page. See `spec:checkout` and `adr:0001`.\n",
);
put(
	"docs/documents/kickoff-notes.md",
	"# Kickoff notes\n\nThe team agreed on one payment provider. See `adr:0001`.\n",
);
put(
	"docs/documents/release-plan.md",
	"# Release plan\n\nRelease 1 sells in France only. See `q:Q-004`.\n",
);
put(
	"docs/slides/kickoff.md",
	"# Kickoff\n\nShop release 1\n\n---\n\n## Scope\n\n- Checkout\n- Accounts\n\n---\n\n## Next\n\nSpecs first, then the plan.\n",
);
put(
	"docs/slides/theme.yaml",
	"version: 1\nbackground: '#ffffff'\ntext: '#1a1a1a'\naccent: '#2563eb'\nlogo: null\nfont: system-ui\n",
);
put(
	"docs/dashboards/overview.yaml",
	`version: 1
title: Overview
tiles:
  - { id: t1, kind: work, x: 0, y: 0, w: 4, h: 3 }
  - { id: t2, kind: specs, x: 4, y: 0, w: 4, h: 3 }
  - { id: t3, kind: questions, x: 8, y: 0, w: 4, h: 3 }
  - { id: t4, kind: estimates, x: 0, y: 3, w: 6, h: 3 }
  - { id: t5, kind: tracker-open, x: 6, y: 3, w: 6, h: 3 }
`,
);

// ---------------------------------------------------------------- write, commit, remote

const run = (cmd, argv, opts = {}) =>
	execFileSync(cmd, argv, {
		cwd: target,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...opts,
	}).trim();
// git signs in through the gh helper. No token in an argument or an address.
const git = (...a) =>
	run("git", [
		"-c",
		"user.name=Shipyard Acceptance",
		"-c",
		"user.email=acceptance@example.invalid",
		"-c",
		"credential.helper=",
		"-c",
		"credential.helper=!gh auth git-credential",
		...a,
	]);

let written = 0;
mkdirSync(target, { recursive: true });
if (!existsSync(join(target, ".git"))) git("init", "-b", "main");
// A tracked file of the seed folders that this script no longer makes goes away: a refresh is exact.
for (const rel of run("git", ["ls-files", "docs", ".shipyard"]).split("\n").filter(Boolean)) {
	if (!files.has(rel)) {
		unlinkSync(join(target, rel));
		written += 1;
	}
}
for (const [rel, content] of files) {
	const path = join(target, rel);
	if (existsSync(path) && readFileSync(path, "utf8") === content) continue;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
	written += 1;
}
git("add", "-A");
const dirty = run("git", ["status", "--porcelain"]) !== "";
if (dirty) git("commit", "-m", "chore: seed the acceptance project");
console.log(
	`seed: ${files.size} files, ${written} written, ${dirty ? "committed" : "no change to commit"}: ${target}`,
);

if (remote === "github") {
	const gh = (...a) =>
		execFileSync("gh", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	const exists = (() => {
		try {
			gh("repo", "view", REPO, "--json", "name");
			return true;
		} catch {
			return false;
		}
	})();
	if (!exists)
		gh(
			"repo",
			"create",
			REPO,
			"--private",
			"--description",
			"Sample project for the Shipyard acceptance run",
		);
	console.log(`remote: ${REPO} ${exists ? "exists" : "created"}`);
	const url = `https://github.com/${REPO}.git`;
	let origin = "";
	try {
		origin = run("git", ["remote", "get-url", "origin"]);
	} catch {
		// no origin yet
	}
	if (origin === "") git("remote", "add", "origin", url);
	else if (origin !== url) git("remote", "set-url", "origin", url);
	git("push", "-u", "origin", "main");

	// Issues for the issue tracker tests: one label, one milestone, four issues.
	gh(
		"label",
		"create",
		"agent",
		"--repo",
		REPO,
		"--color",
		"0e8a16",
		"--description",
		"Ready for an agent",
		"--force",
	);
	const milestones = JSON.parse(gh("api", `repos/${REPO}/milestones?state=all&per_page=100`));
	if (!milestones.some((m) => m.title === "Release 1"))
		gh(
			"api",
			"-X",
			"POST",
			`repos/${REPO}/milestones`,
			"-f",
			"title=Release 1",
			"-f",
			"description=First release of the sample shop",
		);
	const have = new Set(
		JSON.parse(
			gh("issue", "list", "--repo", REPO, "--state", "all", "--limit", "200", "--json", "title"),
		).map((i) => i.title),
	);
	const issues = [
		["Build the cart API", "Return the cart total. See spec:checkout.", ["agent"]],
		["Show the discount in the total", "See spec:discounts.", ["agent"]],
		[
			"Write the scenarios for the checkout page",
			"See docs/delivery/test-plans/checkout.feature.",
			[],
		],
		["The payment page shows the wrong total", "A bug report for the triage tests.", ["bug"]],
	];
	let made = 0;
	for (const [title, body, labels] of issues) {
		if (have.has(title)) continue;
		gh(
			"issue",
			"create",
			"--repo",
			REPO,
			"--title",
			title,
			"--body",
			body,
			"--milestone",
			"Release 1",
			...labels.flatMap((l) => ["--label", l]),
		);
		made += 1;
	}
	console.log(`issues: ${made} created, ${issues.length - made} already there`);
}
