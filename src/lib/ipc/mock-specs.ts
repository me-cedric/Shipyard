// The mock of the Specs commands. It mirrors `crates/shipyard-app/src/specs.rs`: a file map holds
// the changes, the settled specs, the RAID register and the test plans; the lists come from the
// files. The validator is a stand-in for the OpenSpec CLI.
import type {
	ApplyRow_Serialize,
	ArtifactState_Serialize,
	BddRow,
	CapabilityRow,
	ChangeView_Serialize,
	Draft_Deserialize,
	Draft_Serialize,
	Entry,
	GeneratedPlan,
	PlanRow,
	Question,
	RequirementRow,
	SpecFinding_Serialize,
	SpecView_Serialize,
	SplitPreview_Serialize,
	WorkItemView_Serialize,
	Written_Serialize,
} from "./bindings";
import {
	type Entity,
	type Files,
	fileCitations,
	isUnder,
	needClick,
	putText,
	readText,
	resolvePath,
	scanRefs,
	slug,
} from "./mock-design";
import { isRef } from "./mock-refs";
import * as work from "./mock-work";

export type MockSpecs = {
	files: Files;
	/** The last validation of each change, by id. Memory only, as in the app. */
	validated: Record<string, SpecFinding_Serialize[]>;
	/** The split drafts that a person saved, by change id. */
	drafts: Record<string, Draft_Serialize>;
};

const SPEC = "docs/openspec";
const CH = `${SPEC}/changes`;
const QDIR = "docs/delivery/questions";
const PDIR = "docs/delivery/test-plans";
const FOLDERS = [SPEC, QDIR, PDIR];
const ARTIFACTS = ["proposal", "spec", "plan", "checklist", "tasks"];
const KINDS = ["risk", "assumption", "issue", "dependency", "question", "decision"];
const STATUSES = ["open", "answered", "withdrawn"];
const KEYS = [
	"id",
	"kind",
	"status",
	"raisedAt",
	"raisedBy",
	"owner",
	"specRef",
	"taskRef",
	"ticket",
] as const;

// ---------------------------------------------------------------- text rules

type Req = { id: string; title: string; line: number };

/** Each `### Requirement: REQ-NNN Title` line. */
function requirements(text: string): Req[] {
	return text.split("\n").flatMap((l, i) => {
		const m = /^### Requirement: (REQ-\d{3,})(?: (.*))?$/.exec(l);
		return m ? [{ id: m[1] ?? "", title: (m[2] ?? "").trim(), line: i + 1 }] : [];
	});
}

/**
 * The Given, When and Then lines of the first scenario that a requirement holds in its own text,
 * as Gherkin steps. Empty without a When and a Then: a scenario of filler would say nothing.
 */
function stepsOf(text: string, line: number): string[] {
	const out: string[] = [];
	for (const l of text.split("\n").slice(line)) {
		if (l.startsWith("### ") || (l.startsWith("####") && out.length > 0)) break;
		const m = /^(GIVEN|WHEN|THEN|AND)\s+(.*)$/.exec(
			l.replaceAll("**", "").trim().replace(/^-\s*/, ""),
		);
		if (!m || (m[1] === "AND" && out.length === 0)) continue;
		out.push(`    ${(m[1] ?? "")[0]}${(m[1] ?? "").slice(1).toLowerCase()} ${(m[2] ?? "").trim()}`);
	}
	const has = (k: string) => out.some((l) => l.trimStart().startsWith(k));
	return has("When") && has("Then") ? out : [];
}

/** Each `[NEEDS CLARIFICATION: ...]` marker. */
function markers(text: string) {
	return text.split("\n").flatMap((l, i) =>
		[...l.matchAll(/\[NEEDS CLARIFICATION:([^\]]*)\]/g)].map((m) => {
			const t = (m[1] ?? "").trim();
			const q = t.split(/\s+/)[0] ?? "";
			return { line: i + 1, question: /^Q-\d{3,}$/.test(q) ? q : null, text: t };
		}),
	);
}

/** Replace each marker of the question with the answer and note it under `### Clarifications`. */
export function fold(spec: string, id: string, question: string, answer: string): string {
	if (/\n/.test(question + answer)) throw "the question and the answer must be one line";
	let hits = 0;
	const replaced = spec.replace(/\[NEEDS CLARIFICATION:([^\]]*)\]/g, (m, inner: string) => {
		const t = inner.trim();
		if (!t.startsWith(id) || /^\d/.test(t.slice(id.length))) return m;
		hits++;
		return answer;
	});
	if (!hits) throw `no marker cites ${id}`;
	const trail = replaced.endsWith("\n");
	const lines = (trail ? replaced.slice(0, -1) : replaced).split("\n");
	const purpose = lines.findIndex((l) => l.trimEnd() === "## Purpose");
	if (purpose < 0) throw "the spec has no `## Purpose` section";
	const next = lines.findIndex((l, i) => i > purpose && l.startsWith("## "));
	const end = next < 0 ? lines.length : next;
	const afterLast = (from: number, to: number) => {
		for (let i = to - 1; i >= from; i--) if (lines[i]?.trim()) return i + 1;
		return from + 1;
	};
	const bullet = `- ${id} ${question}: ${answer}`;
	const c = lines.findIndex(
		(l, i) => i > purpose && i < end && l.trimEnd() === "### Clarifications",
	);
	if (c >= 0) {
		const b = lines.findIndex((l, i) => i > c && i < end && l.startsWith("#"));
		lines.splice(afterLast(c, b < 0 ? end : b), 0, bullet);
	} else lines.splice(afterLast(purpose, end), 0, "", "### Clarifications", "", bullet);
	return lines.join("\n") + (trail ? "\n" : "");
}

// ---------------------------------------------------------------- RAID

const unquote = (v: string) => {
	const t = v.trim();
	if (t.startsWith('"')) {
		try {
			return JSON.parse(t) as string;
		} catch {
			return t;
		}
	}
	return t;
};

function readQ(text: string): [Question, string[]] {
	const clean = text.replace(/\r\n/g, "\n");
	const m = /^---\n([\s\S]*?)\n---\n?/.exec(clean);
	const issues = m ? [] : ["no frontmatter"];
	const pairs = new Map<string, string>();
	for (const l of (m?.[1] ?? "").split("\n")) {
		const kv = /^([A-Za-z][\w-]*):(.*)$/.exec(l);
		if (kv) pairs.set(kv[1] ?? "", unquote(kv[2] ?? ""));
	}
	const q: Question = {
		id: "",
		kind: "",
		status: "",
		raisedAt: "",
		raisedBy: "",
		owner: "",
		specRef: "",
		taskRef: "",
		ticket: "",
		title: "",
		body: "",
	};
	for (const k of KEYS) {
		const v = pairs.get(k);
		if (v === undefined) issues.push(`missing key: ${k}`);
		else q[k] = v;
	}
	for (const [k, list] of [
		["kind", KINDS],
		["status", STATUSES],
	] as const) {
		const folded = q[k].trim().toLowerCase();
		if (list.includes(folded)) q[k] = folded;
		else if (pairs.has(k)) issues.push(`unknown ${k}: ${q[k]}`);
	}
	const rest = m ? clean.slice(m[0].length) : clean;
	const t = /^# (.*)\n?/.exec(rest);
	q.title = t?.[1] ?? "";
	q.body = t ? rest.slice(t[0].length) : rest;
	return [q, issues];
}

const scalar = (v: string) =>
	v === v.trim() && !/^["']/.test(v) && !/[\r\n]/.test(v) && !v.includes(" #")
		? v
		: JSON.stringify(v);

/** The file text. It refuses an unknown kind or status, so the file stays as it was. */
function writeQ(q: Question): string {
	if (!/^Q-\d{3,}$/.test(q.id)) throw `invalid id: ${q.id}`;
	if (!KINDS.includes(q.kind)) throw `unknown kind: ${q.kind}`;
	if (!STATUSES.includes(q.status)) throw `unknown status: ${q.status}`;
	const head = KEYS.map((k) => `${k}: ${scalar(q[k])}\n`).join("");
	return `---\n${head}---\n${q.title ? `# ${q.title}\n` : ""}${q.body}`;
}

const qNum = (s: string) => /^Q-(\d+)$/i.exec(s.trim())?.[1];
const idNum = (e: Entry) =>
	Math.max(
		Number(qNum(e.path.slice(e.path.lastIndexOf("/") + 1, -3))) || 0,
		Number(qNum(e.question.id)) || 0,
	);

export function questions(s: MockSpecs): Entry[] {
	return Object.keys(s.files)
		.filter((p) => isUnder(p, QDIR) && p.endsWith(".md"))
		.map((path) => {
			const [question, issues] = readQ(s.files[path]?.text ?? "");
			question.id ||= path.slice(path.lastIndexOf("/") + 1, -3);
			return { path, question, issues };
		})
		.sort((a, b) => idNum(a) - idNum(b) || a.path.localeCompare(b.path));
}

export function questionSave(
	s: MockSpecs,
	rel: string,
	q: Question,
	stamp: string | null,
): Written_Serialize {
	resolvePath(rel, FOLDERS);
	if (!isUnder(rel, QDIR)) throw `not a question file: ${rel}`;
	if (questions(s).some((e) => e.path !== rel && e.question.id === q.id))
		throw `duplicate id ${q.id}`;
	return putText(s.files, rel, writeQ(q), stamp, false);
}

/** An empty id takes the next free one. It returns the path. */
export function questionCreate(s: MockSpecs, q: Question): string {
	const all = questions(s);
	const id = q.id || `Q-${String(Math.max(0, ...all.map(idNum)) + 1).padStart(3, "0")}`;
	const text = writeQ({ ...q, id });
	if (all.some((e) => idNum(e) === Number(qNum(id)))) throw `duplicate id ${id}`;
	const path = `${QDIR}/${id}.md`;
	putText(s.files, path, text, null, true);
	return path;
}

// ---------------------------------------------------------------- seed

const spec = (
	cap: string,
	purpose: string,
	reqs: [string, string, boolean][],
	terms: [string, string][] = [],
) =>
	`# Spec: ${cap}\n\n## Purpose\n\n${purpose}\n\n${
		terms.length ? `### Glossary\n\n${terms.map(([t, m]) => `- ${t}: ${m}`).join("\n")}\n\n` : ""
	}## Requirements\n\n${reqs
		.map(
			([id, title, scenario]) =>
				`### Requirement: ${id} ${title}\n\nThe system SHALL ${title.toLowerCase()}.\n\n${
					scenario
						? `#### Scenario: ${title}\n\n- **WHEN** a person asks\n- **THEN** it works\n\n`
						: ""
				}`,
		)
		.join("")}`;

const question = (
	id: string,
	kind: string,
	status: string,
	owner: string,
	title: string,
	specRef = "",
): [string, string] => [
	`${QDIR}/${id}.md`,
	writeQ({
		id,
		kind,
		status,
		raisedAt: "2026-09-10",
		raisedBy: "ada",
		owner,
		specRef,
		taskRef: "",
		ticket: "",
		title,
		body: `\n${title}\n`,
	}),
];

const feature = (title: string, scenarios: [ref: string, name: string][]) =>
	`Feature: ${title}\n\n${scenarios
		.map(
			([ref, name]) =>
				`  @${ref}\n  Scenario: ${name}\n    Given a person\n    When they act\n    Then it works\n`,
		)
		.join("\n")}`;

export function seedSpecs(): MockSpecs {
	const change = (id: string, caps: Record<string, Record<string, string>>, proposal: string) => ({
		[`${CH}/${id}/.openspec.yaml`]: "schema: shipyard-delivery\ncreated: 2026-10-20\n",
		[`${CH}/${id}/proposal.md`]: proposal,
		...Object.fromEntries(
			Object.entries(caps).flatMap(([cap, arts]) =>
				Object.entries(arts).map(([a, t]) => [`${CH}/${id}/specs/${cap}/${a}.md`, t]),
			),
		),
	});
	const texts: Record<string, string> = {
		[`${SPEC}/specs/auth/spec.md`]: spec(
			"auth",
			"Let a person sign in. The sync follows adr:0004 and reads conn:linear.",
			[
				["REQ-001", "Keep a session", true],
				["REQ-002", "Sign out", true],
				["REQ-003", "Login", true],
			],
			[
				["session", "the time between a sign in and a sign out"],
				["login", "the act of a person who proves who they are"],
			],
		),
		[`${SPEC}/specs/billing/spec.md`]: spec(
			"billing",
			"Bill a customer. The sync follows adr:0004.",
			[
				["REQ-001", "Issue an invoice", true],
				["REQ-002", "Send a receipt", true],
			],
			[["invoice", "the bill that a customer pays"]],
		),
		...change(
			"add-auth",
			{
				sessions: {
					spec: spec("sessions", "Renew a session.", [
						["REQ-001", "Refresh a token", true],
						["REQ-002", "Expire a token", true],
					]),
					plan: "# Plan\n\nRenew the token before it expires.\n",
					checklist: "# Checklist\n\n- [x] Refresh\n",
					tasks: "# Tasks\n\n- [ ] T001 Refresh the token\n",
				},
			},
			"# add-auth\n\n## Why\n\nSessions end too soon. See adr:0004.\n",
		),
		...change(
			"add-billing",
			{
				invoices: {
					spec: spec("invoices", "Total an invoice.", [
						["REQ-001", "Total the lines", true],
						["REQ-002", "Round the total", false],
					]),
					plan: "# Plan\n\nSum the lines.\n",
				},
			},
			"# add-billing\n\n## Why\n\nInvoices need totals.\n",
		),
		...change(
			"add-export",
			{
				export: {
					spec: spec("export", "Export the data.", [["REQ-001", "Export a report", true]]).replace(
						"export a report.",
						"export a report in [NEEDS CLARIFICATION: Q-035 Which export formats ship first?].",
					),
				},
			},
			"# add-export\n\n## Why\n\nPeople ask for a file.\n",
		),
		[`${PDIR}/auth-login.feature`]: feature("Login", [
			["spec:auth#REQ-001", "A session starts"],
			["spec:auth#REQ-003", "A person signs in"],
			["spec:auth#REQ-009", "An old rule"],
		]),
		[`${PDIR}/auth-login.json`]: JSON.stringify({
			version: 1,
			base: "main",
			runs: [
				{
					scenario: "A session starts",
					verdict: "pass",
					at: "2026-10-28T10:00:00Z",
					by: "automated",
					evidence: "pnpm test",
				},
				{
					scenario: "A person signs in",
					verdict: "fail",
					at: "2026-10-28T10:00:00Z",
					by: "manual",
				},
			],
		}),
		[`${PDIR}/billing-invoice.feature`]: feature("Invoice", [
			["spec:billing#REQ-001", "An invoice is issued"],
			["spec:billing#REQ-002", "A receipt is sent"],
		]),
		...Object.fromEntries([
			question("Q-012", "question", "answered", "ada", "Which tracker first?"),
			question("Q-020", "risk", "open", "grace", "Claim stamps need a tracker comment write"),
			question("Q-021", "assumption", "answered", "alan", "One tracker for each project"),
			question("Q-030", "dependency", "open", "ada", "The forge adapter ships first"),
			question("Q-033", "decision", "answered", "margaret", "The row ref is a ticket label"),
			question("Q-034", "issue", "withdrawn", "edsger", "A duplicate of Q-020"),
			question(
				"Q-035",
				"question",
				"open",
				"ada",
				"Which export formats ship first?",
				"spec:export",
			),
		]),
		"docs/openspec/constitution.md":
			"# Constitution\n\n## Principles\n\n- The spec comes first.\n- A change that cannot be undone needs a click.\n",
	};
	const files: Files = {};
	for (const [p, t] of Object.entries(texts)) files[p] = { text: t, stamp: "1" };
	return { files, validated: {}, drafts: {} };
}

// ---------------------------------------------------------------- changes

const names = (files: Files, dir: string) => [
	...new Set(
		Object.keys(files)
			.filter((p) => p.startsWith(`${dir}/`))
			.map((p) => p.slice(dir.length + 1).split("/")[0] ?? "")
			.filter(Boolean),
	),
];

const validChange = (id: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id !== "archive";

function needChange(id: string) {
	if (!validChange(id)) throw `invalid change id: ${id}`;
}

function states(s: MockSpecs, id: string, found: SpecFinding_Serialize[] | undefined) {
	const caps = names(s.files, `${CH}/${id}/specs`);
	return ARTIFACTS.flatMap((artifact): ArtifactState_Serialize[] =>
		(artifact === "proposal" ? [null] : caps).map((capability) => {
			const path = capability === null ? "proposal.md" : `specs/${capability}/${artifact}.md`;
			const findings = (found ?? []).filter(
				(f) => f.artifact === artifact && f.capability === capability,
			);
			const exists = !!s.files[`${CH}/${id}/${path}`];
			const status = !exists ? "missing" : !found || findings.length ? "draft" : "done";
			return { artifact, capability, path, status, findings };
		}),
	);
}

/** The slug of a title: `[a-z0-9-]`, up to 40 characters, the same as `slug_text` in Rust. */
const slugOf = (title: string) =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+/, "")
		.slice(0, 40)
		.replace(/-+$/, "");

/** The first heading of `proposal.md` when it is not the id, else the id (strict OpenSpec has no `title` key). */
function titleOf(s: MockSpecs, id: string): string {
	const heading = s.files[`${CH}/${id}/proposal.md`]?.text.match(/^# (.+)$/m)?.[1]?.trim();
	return heading && heading !== id ? heading : id;
}

const view = (s: MockSpecs, id: string): ChangeView_Serialize => ({
	id,
	title: titleOf(s, id),
	path: `${CH}/${id}`,
	validated: id in s.validated,
	artifacts: states(s, id, s.validated[id]),
});

export const changes = (s: MockSpecs) =>
	names(s.files, CH)
		.filter((id) => id !== "archive")
		.sort()
		.map((id) => view(s, id));

export function changeCreate(s: MockSpecs, title: string, today: string): ChangeView_Serialize {
	title = title.trim();
	const id = slugOf(title);
	if (!validChange(id)) throw `the title needs a letter or a digit: ${title}`;
	if (names(s.files, CH).includes(id)) throw `change exists: ${id}`;
	putText(
		s.files,
		`${CH}/${id}/proposal.md`,
		`# ${title}\n\n## Why\n\n## What Changes\n\n## Impact\n`,
		null,
		true,
	);
	putText(
		s.files,
		`${CH}/${id}/.openspec.yaml`,
		`schema: shipyard-delivery\ncreated: ${today}\n`,
		null,
		true,
	);
	return view(s, id);
}

/** A change from an issue tracker item: the ticket text opens the proposal, the branch is `specs/<id>`. */
export function changeFromTicket(
	s: MockSpecs,
	tickets: { key: string; title: string; description: string }[],
	key: string,
	click: boolean,
	today: string,
): { change: ChangeView_Serialize; branch: string } {
	if (!click) throw "this change needs the click of a person";
	const ticket = tickets.find((t) => t.key === key);
	if (!ticket) throw `${key} is not in the mirror: sync first`;
	const change = changeCreate(s, ticket.title, today);
	const file = s.files[`${CH}/${change.id}/proposal.md`];
	if (file)
		file.text = file.text.replace(
			"## Why\n",
			`## Why\n\nTicket \`wi:${key}\`.\n\n${ticket.description.trim()}\n`,
		);
	return { change: view(s, change.id), branch: `specs/${change.id}` };
}

/** The findings of the stand-in validator: an empty file, an open marker, a requirement with no scenario. */
export function validate(s: MockSpecs, id: string): SpecFinding_Serialize[] {
	needChange(id);
	const found = states(s, id, undefined)
		.filter((a) => a.status !== "missing")
		.flatMap((a) => {
			const text = s.files[`${CH}/${id}/${a.path}`]?.text ?? "";
			const f = (line: number | null, message: string): SpecFinding_Serialize => ({
				artifact: a.artifact,
				capability: a.capability,
				path: a.path,
				line,
				message,
				level: "error",
			});
			if (!text.trim()) return [f(null, "the file is empty")];
			if (a.artifact !== "spec") return [];
			const lines = text.split("\n");
			const noScenario = (r: Req) => {
				const rest = lines.slice(r.line);
				const stop = rest.findIndex((l) => l.startsWith("### "));
				return !(stop < 0 ? rest : rest.slice(0, stop)).some((l) => l.startsWith("#### Scenario:"));
			};
			return [
				...markers(text).map((m) => f(m.line, `open clarification: ${m.text}`)),
				...requirements(text)
					.filter(noScenario)
					.map((r) => f(r.line, `${r.id} has no scenario`)),
			];
		});
	s.validated[id] = found;
	return found;
}

// ---------------------------------------------------------------- files

export const specsRead = (s: MockSpecs, rel: string) => {
	resolvePath(rel, FOLDERS);
	return readText(s.files, rel);
};

export function specsWrite(
	s: MockSpecs,
	rel: string,
	text: string,
	stamp: string | null,
	create: boolean,
): Written_Serialize {
	resolvePath(rel, FOLDERS);
	const out = putText(s.files, rel, text, stamp, create);
	// The text changed, so the last validation says nothing about it.
	const id = rel.startsWith(`${CH}/`) ? rel.slice(CH.length + 1).split("/")[0] : undefined;
	if (id && !out.conflict) delete s.validated[id];
	return out;
}

export const capabilities = (s: MockSpecs): CapabilityRow[] =>
	names(s.files, `${SPEC}/specs`).flatMap((capability) => {
		const path = `${SPEC}/specs/${capability}/spec.md`;
		const f = s.files[path];
		return f ? [{ capability, path, requirements: requirements(f.text).length }] : [];
	});

export function specView(s: MockSpecs, rel: string): SpecView_Serialize {
	const { text } = specsRead(s, rel);
	return { requirements: requirements(text), markers: markers(text) };
}

// ---------------------------------------------------------------- fold

export function foldAnswer(
	s: MockSpecs,
	rel: string,
	id: string,
	answer: string,
	stamp: string,
	click: boolean,
): Written_Serialize {
	needClick(click);
	resolvePath(rel, FOLDERS);
	if (!isUnder(rel, SPEC) || !rel.endsWith("/spec.md")) throw `not a spec: ${rel}`;
	const title = questions(s).find((e) => e.question.id === id)?.question.title;
	if (title === undefined) throw `no question ${id}`;
	return specsWrite(s, rel, fold(readText(s.files, rel).text, id, title, answer), stamp, false);
}

// ---------------------------------------------------------------- test plans

/** The requirement refs of the settled specs and of the specs of each change, by capability. */
function reqRefs(s: MockSpecs): { cap: string; ref: string }[] {
	return Object.entries(s.files)
		.map(([p, f]) => [/(?:^|\/)specs\/([^/]+)\/spec\.md$/.exec(p)?.[1], f.text, p] as const)
		.filter(([cap, , p]) => cap && !p.includes("/archive/"))
		.flatMap(([cap, text]) =>
			requirements(text).map((r) => ({ cap: cap ?? "", ref: `spec:${cap}#${r.id}` })),
		);
}

const plans = (s: MockSpecs) =>
	Object.keys(s.files)
		.filter((p) => isUnder(p, PDIR) && p.endsWith(".feature"))
		.sort();

export function testplans(s: MockSpecs): PlanRow[] {
	const known = new Set(reqRefs(s).flatMap((r) => [r.ref, r.ref.split("#")[0] ?? ""]));
	return plans(s).map((path) => {
		const text = s.files[path]?.text ?? "";
		const title = /^\s*Feature:\s*(.*)$/m.exec(text)?.[1]?.trim();
		if (title === undefined)
			return {
				path,
				title: path.slice(path.lastIndexOf("/") + 1),
				scenarios: 0,
				refs: [],
				errors: [{ line: 1, message: "expected `Feature:`" }],
				broken: [],
			};
		const refs = scanRefs(text);
		return {
			path,
			title,
			scenarios: (text.match(/^\s*Scenario( Outline)?:/gm) ?? []).length,
			refs,
			errors: [],
			broken: refs.filter((r) => r.startsWith("spec:") && !known.has(r)),
		};
	});
}

const VERDICTS = ["pass", "fail", "partial", "blocked", "not-covered"];

/** Every scenario of every plan with its last run from the `.json` beside the plan. A gap stays a gap. */
export function bdd(s: MockSpecs): BddRow[] {
	return plans(s).flatMap((plan) => {
		let runs: {
			scenario?: string;
			verdict?: string;
			at?: string;
			by?: string;
			evidence?: string;
		}[] = [];
		try {
			runs = JSON.parse(s.files[plan.replace(/\.feature$/, ".json")]?.text ?? "{}").runs ?? [];
		} catch {
			/* a broken sibling is no run */
		}
		const lines = (s.files[plan]?.text ?? "").split("\n");
		const out: BddRow[] = [];
		lines.forEach((l, i) => {
			const name = /^\s*Scenario( Outline)?:\s*(.*)$/.exec(l)?.[2]?.trim();
			if (name === undefined) return;
			const run = runs.find((r) => r.scenario === name);
			const end = lines.findIndex((x, j) => j > i && /^\s*(@|Scenario)/.test(x));
			const body = lines.slice(i + 1, end < 0 ? undefined : end);
			out.push({
				plan,
				scenario: name,
				line: i + 1,
				steps: body.filter((x) => /^\s*(Given|When|Then|And|But)\b/.test(x)).length,
				refs: scanRefs([lines[i - 1] ?? "", l, ...body].join("\n")),
				verdict: VERDICTS.includes(run?.verdict ?? "") ? (run?.verdict ?? "") : "not-covered",
				at: run?.at ?? "",
				by: run?.by ?? "",
				evidence: run?.evidence ?? "",
			});
		});
		return out;
	});
}

/** The requirements of a capability that no scenario cites. */
export function coverage(s: MockSpecs, cap: string): string[] {
	const cited = new Set(testplans(s).flatMap((p) => (p.errors.length ? [] : p.refs)));
	return [
		...new Set(
			reqRefs(s)
				.filter((r) => r.cap === cap)
				.map((r) => r.ref),
		),
	].filter((r) => !cited.has(r));
}

/** Each requirement with the scenarios that cite it. */
export function requirementRows(s: MockSpecs): RequirementRow[] {
	const scenarios = bdd(s);
	const seen = new Set<string>();
	return Object.entries(s.files)
		.map(([p, f]) => [/(?:^|\/)specs\/([^/]+)\/spec\.md$/.exec(p)?.[1], f.text, p] as const)
		.filter(([cap, , p]) => cap && !p.includes("/archive/"))
		.flatMap(([cap, text]) =>
			requirements(text).map((r) => ({
				capability: cap ?? "",
				reference: `spec:${cap}#${r.id}`,
				title: r.title,
				steps: stepsOf(text, r.line),
			})),
		)
		.filter((r) => !seen.has(r.reference) && !!seen.add(r.reference))
		.map(({ steps, ...r }) => ({
			...r,
			detailed: steps.length > 0,
			scenarios: scenarios
				.filter((b) => b.refs.includes(r.reference))
				.map((b) => ({ plan: b.plan, scenario: b.scenario, line: b.line, verdict: b.verdict })),
		}));
}

/** One scenario, with the steps of the requirement, for each requirement that no scenario cites and that has such text. */
export function testplanGenerate(s: MockSpecs, cap: string, click: boolean): GeneratedPlan {
	if (!click) throw "this change needs the click of a person";
	const rows = requirementRows(s).filter((r) => r.capability === cap);
	if (rows.length === 0) throw `no capability ${cap}`;
	const path = `${PDIR}/${cap}.feature`;
	const missing = coverage(s, cap);
	if (missing.length === 0) return { path, added: 0 };
	const stubs = missing
		.flatMap((ref) => {
			const row = rows.find((r) => r.reference === ref);
			const steps = Object.entries(s.files)
				.filter(([p]) => p.includes(`/specs/${cap}/spec.md`) && !p.includes("/archive/"))
				.flatMap(([, f]) =>
					requirements(f.text)
						.filter((r) => `spec:${cap}#${r.id}` === ref)
						.map((r) => stepsOf(f.text, r.line)),
				)
				.find((x) => x.length > 0);
			return row && steps ? [`\n  @${ref}\n  Scenario: ${row.title}\n${steps.join("\n")}\n`] : [];
		})
		.join("");
	if (stubs === "") return { path, added: 0 };
	const old = s.files[path]?.text;
	const base = old === undefined ? `Feature: ${cap}\n` : old.endsWith("\n") ? old : `${old}\n`;
	putText(
		s.files,
		path,
		base + stubs,
		old === undefined ? null : (s.files[path]?.stamp ?? null),
		old === undefined,
	);
	return { path, added: stubs.split("  Scenario:").length - 1 };
}

// ---------------------------------------------------------------- split

type Item = Draft_Serialize["items"][number];

/** One epic for each capability and one story for each requirement. */
export function splitDraft(s: MockSpecs, change: string): Draft_Serialize {
	needChange(change);
	const saved = s.drafts[change];
	if (saved) return saved;
	if (!names(s.files, CH).includes(change)) throw `no change ${change}`;
	const items: Item[] = [];
	for (const cap of names(s.files, `${CH}/${change}/specs`)) {
		const reqs = requirements(s.files[`${CH}/${change}/specs/${cap}/spec.md`]?.text ?? "");
		items.push({
			rowId: cap,
			kind: "epic",
			title: cap,
			description: "",
			reqs: reqs.map((r) => `spec:${cap}#${r.id}`),
			parent: null,
		});
		for (const r of reqs)
			items.push({
				rowId: `${cap}-${r.id.toLowerCase()}`,
				kind: "story",
				title: r.title,
				description: "",
				reqs: [`spec:${cap}#${r.id}`],
				parent: cap,
			});
	}
	return { change, items };
}

export function splitSave(s: MockSpecs, d: Draft_Deserialize) {
	needChange(d.change);
	s.drafts[d.change] = {
		change: d.change,
		items: d.items.map((i) => ({ ...i, parent: i.parent ?? null })),
	};
}

/** The problems that block the apply. */
function problems(s: MockSpecs, d: Draft_Serialize): string[] {
	const known = new Set(reqRefs(s).map((r) => r.ref));
	return d.items.flatMap((it, i) => {
		const id = it.rowId;
		const parent = d.items.find((o) => o.rowId === it.parent);
		return [
			...(isRef(`est:${d.change}#${id}`) ? [] : [`${id}: invalid row id`]),
			...(d.items.slice(0, i).some((o) => o.rowId === id) ? [`${id}: duplicate row id`] : []),
			...(it.kind !== "story"
				? []
				: !parent
					? [`${id}: parent missing`]
					: parent.kind !== "epic"
						? [`${id}: parent is not an epic`]
						: []),
			...(it.reqs.length ? [] : [`${id}: cites no ref`]),
			...it.reqs.filter((r) => !known.has(r)).map((r) => `${id}: unknown ref ${r}`),
		];
	});
}

/** The rows in the shape of the Work apply. Epics come first, so a story finds its parent. */
const splitRows = (d: Draft_Serialize) =>
	[...d.items]
		.sort((a, b) => Number(b.kind === "epic") - Number(a.kind === "epic"))
		.map((i) => ({
			reference: `est:${d.change}#${i.rowId}`,
			kind: i.kind,
			title: i.title,
			description: `${i.description ? `${i.description}\n\n` : ""}Requirements: ${i.reqs.join(", ")}`,
			days: null,
			parent: i.parent ? `est:${d.change}#${i.parent}` : null,
		}));

export function splitPreview(
	s: MockSpecs,
	w: work.MockWork,
	change: string,
): SplitPreview_Serialize {
	const d = splitDraft(s, change);
	return { problems: problems(s, d), rows: splitRows(d).map((r) => work.itemPreview(w, r)) };
}

/** Hand the split to the Work apply. A ticket that the apply wrote has the row ref as a label, so a second apply creates none. */
export function splitApply(
	s: MockSpecs,
	w: work.MockWork,
	mirror: work.Mirror,
	change: string,
	click: boolean,
	now: string,
): ApplyRow_Serialize[] {
	needClick(click);
	const d = splitDraft(s, change);
	const bad = problems(s, d);
	if (bad.length) throw bad.join("; ");
	return splitRows(d).map((row) => {
		const out = work.itemCreate(w, row, click);
		if (out.key && !out.error) {
			const at = mirror.findIndex((t) => t.key === out.key);
			if (at >= 0) mirror[at] = { ...(mirror[at] as WorkItemView_Serialize), title: row.title };
			else
				mirror.push({
					key: out.key,
					title: row.title,
					description: "",
					kind: row.kind === "epic" ? "epic" : "story",
					status: "To Do",
					category: "todo",
					assignee: null,
					member: null,
					labels: [row.reference],
					parent: null,
					url: `https://tracker.example.com/browse/${out.key}`,
					updated: now,
					linked: null,
					claimed: false,
					estimateMinutes: null,
					spentMinutes: null,
				});
		}
		return out;
	});
}

// ---------------------------------------------------------------- archive

/** Move the change. The items of the change that are not done need `confirmed`. */
export function archive(
	s: MockSpecs,
	mirror: work.Mirror,
	id: string,
	confirmed: boolean,
	today: string,
): string[] {
	needChange(id);
	const dir = `${CH}/${id}`;
	if (!names(s.files, CH).includes(id)) throw `no change ${id}`;
	const open = mirror
		.filter((t) => t.labels.some((l) => l.startsWith(`est:${id}#`)) && t.category !== "done")
		.map((t) => `${t.key} ${t.title}`);
	if (open.length && !confirmed) throw `open items: ${open.join("; ")}`;
	const dest = `${CH}/archive/${today}-${id}`;
	if (Object.keys(s.files).some((p) => p.startsWith(`${dest}/`))) throw `${dest} exists`;
	const caps = names(s.files, `${dir}/specs`);
	for (const [p, f] of Object.entries(s.files)) {
		if (!p.startsWith(`${dir}/`)) continue;
		const rel = p.slice(dir.length + 1);
		if (rel.startsWith("specs/")) putText(s.files, `${SPEC}/${rel}`, f.text, null, false);
		s.files[`${dest}/${rel}`] = f;
		delete s.files[p];
	}
	delete s.validated[id];
	return caps;
}

// ---------------------------------------------------------------- refs

export function specsEntities(s: MockSpecs): Entity[] {
	const settled = new Set(capabilities(s).map((c) => c.capability));
	const out: Entity[] = [];
	for (const [p, f] of Object.entries(s.files)) {
		const cap = /(?:^|\/)specs\/([^/]+)\/spec\.md$/.exec(p)?.[1];
		if (cap && !p.includes("/archive/")) {
			if (p.startsWith(`${SPEC}/specs/`) || !settled.has(cap))
				out.push({
					ref: `spec:${cap}`,
					title: `Spec: ${cap}`,
					status: p.startsWith(`${CH}/`) ? "proposed" : "settled",
				});
			for (const r of requirements(f.text))
				out.push({ ref: `spec:${cap}#${r.id}`, title: r.title, status: null });
		}
	}
	for (const e of questions(s))
		out.push({ ref: `q:${e.question.id}`, title: e.question.title, status: e.question.status });
	for (const c of changes(s)) out.push({ ref: `change:${c.id}`, title: c.id, status: null });
	for (const p of testplans(s))
		out.push({
			ref: `test:${slug(p.path.slice(p.path.lastIndexOf("/") + 1).replace(/\.feature$/, ""))}`,
			title: p.title,
			status: null,
		});
	return out;
}

const sourceOf = (p: string): string | null => {
	const stem = p.slice(p.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
	if (isUnder(p, QDIR)) return `q:${stem}`;
	if (isUnder(p, PDIR)) return `test:${slug(stem)}`;
	const change = p.startsWith(`${CH}/`) ? p.slice(CH.length + 1).split("/")[0] : undefined;
	if (change) return change === "archive" ? null : `change:${change}`;
	const cap = /^docs\/openspec\/specs\/([^/]+)\/spec\.md$/.exec(p)?.[1];
	return cap ? `spec:${cap}` : null;
};

export const specsCitations = (s: MockSpecs): [string, string][] => [
	...fileCitations(s.files, sourceOf),
	// A work item that covers one requirement.
	["wi:ACME-1", "spec:auth#REQ-003"],
];
