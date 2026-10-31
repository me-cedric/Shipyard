// The mock of the Code forge, quality, impact and terminal commands. It mirrors
// `crates/shipyard-app/src/code.rs`, `terminal.rs` and the forge rules of
// `crates/shipyard-forges/src/code.rs`: every write needs a click, a draft cannot merge, a request
// for changes needs a text, only a declared check runs, a report holds no secret value, and the
// digest holds no path. The terminal is a fake that echoes what it gets.
import type {
	ImpactEntry,
	ImpactRefs,
	MergeMethod,
	OpenedPull_Serialize,
	OpenPull_Deserialize,
	PrRowView,
	PullDetail_Serialize,
	QualityReport_Serialize,
	QualityRow_Serialize,
	QualityView_Serialize,
	SbomReport,
	Verdict,
} from "./bindings";
import type { MockCode } from "./mock-code";

const CLICK = "this change needs the click of a person";
const NO_FORGE = "the project names no forge connection";
const CONNECTION = "github-demo";
const METHODS: MergeMethod[] = ["merge", "squash", "rebase"];
const LABELS = ["feat", "bug", "docs"];
const VERIFY_DOCS = "verify all docs";
/** The checks of the project files: a command and the key of its plain name. */
const CHECKS: [string, string | null][] = [
	["pnpm run lint", "lint"],
	["pnpm run test", "test"],
	[VERIFY_DOCS, null],
];
const SCANNERS: [string, boolean][] = [
	["secrets", true],
	["dependencies", false],
	["code", false],
	["skills", false],
];

export type MockPrs = {
	pulls: PullDetail_Serialize[];
	reports: QualityReport_Serialize[];
	impacts: ImpactEntry[];
	/** The text of each saved file, by path. */
	texts: Record<string, string>;
	/** The output that each fake terminal wrote, by id. */
	terminals: Record<string, string>;
	listeners: ((id: string, data: string) => void)[];
	counter: number;
	/** The scanners that an install click added. */
	installed: string[];
	/** The `gates` that the person saved. An empty list means the checks of the project files. */
	gates: string[];
};

const sha = (n: number) => `${n}`.padStart(7, "0").padEnd(40, "c");

function pull(
	number: number,
	title: string,
	more: Partial<PullDetail_Serialize>,
): PullDetail_Serialize {
	return {
		reference: `pr:${CONNECTION}:${number}`,
		number,
		title,
		description: `${title}.`,
		state: "open",
		draft: false,
		author: "Ada Lovelace",
		sourceBranch: `feat/demo/pr-${number}`,
		targetBranch: "main",
		headSha: sha(number),
		url: `https://github.com/acme/web/pull/${number}`,
		files: [
			{
				path: "src/app.ts",
				status: "modified",
				patch: "@@ -1,2 +1,3 @@\n a\n b\n+c\n",
			},
		],
		commits: [{ reference: `commit:${sha(number)}`, summary: title }],
		checks: [{ name: "build", state: "passing", url: "https://ci.example.com/build" }],
		ci: "passing",
		threads: [],
		verdicts: [],
		mergeable: "clean",
		mergeMethods: METHODS,
		links: [],
		...more,
	};
}

export function seedPrs(): MockPrs {
	const failed = pull(142, "fix(auth): refuse an empty token", {
		ci: "failing",
		checks: [
			{ name: "build", state: "passing", url: "https://ci.example.com/build" },
			{ name: "unit", state: "failing", url: "https://ci.example.com/unit" },
			{ name: "lint", state: "failing", url: "https://ci.example.com/lint" },
		],
		threads: [
			{
				id: "T1",
				resolved: false,
				path: "src/app.ts",
				line: 2,
				comments: ["Grace Hopper: rename this", "Ada Lovelace: done"],
			},
		],
		verdicts: [{ reviewer: "Grace Hopper", state: "changes-requested" }],
		links: ["wi:SHIP-42"],
	});
	return {
		pulls: [
			pull(141, "feat(api): add the health route", {
				verdicts: [{ reviewer: "Grace Hopper", state: "approved" }],
				links: ["wi:SHIP-41"],
			}),
			failed,
			pull(143, "feat(code): show the pull requests", {
				draft: true,
				mergeable: "blocked",
				links: ["wi:SHIP-43", "run:r-3"],
			}),
		],
		reports: [
			{
				kind: "check",
				name: "pnpm run test",
				at: "2026-10-28T09:00:00Z",
				passed: true,
				durationMs: 5200,
				tail: "Tests 42 passed (42)",
				findings: [],
			},
		],
		impacts: [
			{
				date: "2026-10-28",
				slug: "main",
				plan: ".shipyard/impacts/2026-10-28-main.plan.md",
				digest: ".shipyard/impacts/2026-10-28-main.digest.md",
			},
		],
		texts: {
			".shipyard/impacts/2026-10-28-main.plan.md":
				"# Impact plan: main\n\n## Axes\n\n- behaviour: low\n- contracts: none\n- data: none\n- configuration: none\n- security: none\n- operations: none\n- artifacts: low\n\n## Stale refs\n\n## Actions\n\n1. Update the guide.\n",
			".shipyard/impacts/2026-10-28-main.digest.md": "The change is small. The release date holds.",
		},
		terminals: {},
		listeners: [],
		counter: 1,
		installed: [],
		gates: [],
	};
}

const need = (click: boolean) => {
	if (!click) throw CLICK;
};

const find = (p: MockPrs, number: number) => {
	const found = p.pulls.find((x) => x.number === number);
	if (!found) throw `not found: ${number}`;
	return found;
};

/** The rows that `pulls_list` adds: the mirror of the demo forge. */
export function prRows(p: MockPrs): PrRowView[] {
	return p.pulls.map((d) => ({
		reference: d.reference,
		forge: CONNECTION,
		number: d.number,
		title: d.title,
		state: d.state,
		draft: d.draft,
		ci: d.ci,
		review: d.verdicts.some((v) => v.state === "changes-requested") ? "changes_requested" : "clear",
		headSha: d.headSha,
		url: d.url,
		updated: "2026-10-29T10:00:00Z",
		lane: d.state === "merged" ? "done" : d.draft ? "working" : "in_review",
		runs: d.links.filter((l) => l.startsWith("run:")),
	}));
}

/** A row of the list that this mock does not hold gets a detail made from the row, so the list and the detail agree. */
export function pullDetail(p: MockPrs, number: number, row?: PrRowView): PullDetail_Serialize {
	if (row && !p.pulls.some((x) => x.number === number)) {
		p.pulls.push(
			pull(number, row.title, {
				reference: row.reference,
				state: row.state,
				draft: row.draft,
				ci: row.ci,
				headSha: row.headSha,
				url: row.url,
			}),
		);
	}
	return find(p, number);
}

export const pullLabels = (): string[] => [...LABELS];

/** The working branch must be published first, as the real command asks. */
export function pullOpen(
	p: MockPrs,
	c: MockCode,
	input: OpenPull_Deserialize,
	click: boolean,
): OpenedPull_Serialize {
	need(click);
	if (!c.remoteBranches.includes(`origin/${c.branch}`))
		throw "publish the working branch before you open a pull request";
	if (!input.title.trim()) throw "a pull request needs a title";
	const target = input.base?.trim() || "main";
	if (target === c.branch) throw "a pull request cannot go into its own branch";
	const number = Math.max(0, ...p.pulls.map((x) => x.number)) + 1;
	p.pulls.push(
		pull(number, input.title.trim(), {
			description: input.body,
			draft: input.draft,
			sourceBranch: c.branch,
			targetBranch: target,
			author: "Ada Lovelace",
			mergeable: input.draft ? "blocked" : "clean",
		}),
	);
	const wanted = input.labels.map((l) => l.trim()).filter(Boolean);
	return {
		reference: `pr:${CONNECTION}:${number}`,
		number,
		url: `https://github.com/acme/web/pull/${number}`,
		missingLabels: wanted.filter((l) => !LABELS.some((x) => x.toLowerCase() === l.toLowerCase())),
		labelError: null,
	};
}

export function pullComment(p: MockPrs, number: number, body: string, click: boolean) {
	need(click);
	if (!body.trim()) throw "a comment needs some text";
	find(p, number).threads.push({
		id: `T${++p.counter}`,
		resolved: false,
		path: null,
		line: null,
		comments: [`Ada Lovelace: ${body.trim()}`],
	});
	return null;
}

export function pullVerdict(
	p: MockPrs,
	number: number,
	verdict: Verdict,
	body: string,
	click: boolean,
) {
	need(click);
	if (verdict === "request-changes" && !body.trim()) throw "a request for changes needs some text";
	const d = find(p, number);
	const state = verdict === "approve" ? "approved" : "changes-requested";
	d.verdicts = [
		...d.verdicts.filter((v) => v.reviewer !== "Ada Lovelace"),
		{ reviewer: "Ada Lovelace", state },
	];
	if (body.trim()) pullComment(p, number, body, true);
	return null;
}

export function pullClose(p: MockPrs, number: number) {
	find(p, number).state = "closed";
}

export function pullMerge(p: MockPrs, number: number, method: MergeMethod, click: boolean) {
	need(click);
	const d = find(p, number);
	if (!d.mergeMethods.includes(method)) throw `this forge does not offer the method ${method}`;
	if (d.state !== "open") throw "the pull request is not open";
	if (d.draft) throw "a draft pull request cannot merge: mark it ready first";
	d.state = "merged";
	return null;
}

export function pullReady(p: MockPrs, number: number, click: boolean) {
	need(click);
	const d = find(p, number);
	d.draft = false;
	d.mergeable = "clean";
	return null;
}

// ------------------------------------------------------------------ quality

const row = (
	p: MockPrs,
	kind: "check" | "scanner",
	name: string,
	available: boolean,
	label: string | null = null,
): QualityRow_Serialize => ({
	name,
	label,
	available,
	last: p.reports.find((r) => r.kind === kind && r.name === name) ?? null,
});

/** The saved gates, else the checks of the project files. The check that verifies all docs stays. */
const checkNames = (p: MockPrs): [string, string | null][] =>
	p.gates.length ? [...p.gates.map((g): [string, null] => [g, null]), [VERIFY_DOCS, null]] : CHECKS;

export const qualityView = (p: MockPrs): QualityView_Serialize => ({
	checks: checkNames(p).map(([n, label]) => row(p, "check", n, true, label)),
	scanners: SCANNERS.map(([n, a]) => row(p, "scanner", n, a || p.installed.includes(n))),
});

/** The proposal for the gates: the commands that the project files and its CI workflows show. */
export const gatesPropose = (): string[] => ["pnpm run lint", "pnpm run test", "cargo test"];

export function gatesSave(p: MockPrs, gates: string[], click: boolean) {
	need(click);
	p.gates = gates.map((g) => g.trim()).filter(Boolean);
	return null;
}

function keep(p: MockPrs, r: QualityReport_Serialize) {
	p.reports = [...p.reports.filter((x) => !(x.kind === r.kind && x.name === r.name)), r];
	return r;
}

export function checkRun(p: MockPrs, command: string, click: boolean): QualityReport_Serialize {
	need(click);
	if (!checkNames(p).some(([n]) => n === command))
		throw `\`${command}\` is not a check of this project`;
	if (command === VERIFY_DOCS)
		return keep(p, {
			kind: "check",
			name: command,
			at: "2026-10-29T10:00:00Z",
			passed: false,
			durationMs: 900,
			tail: "3 changes, 12 pages, 1 problems",
			findings: [
				{
					severity: "medium",
					path: "docs/handbook/start.md",
					line: 3,
					message: "broken link: gone.md",
				},
			],
		});
	// A command that the person saved in the gates fails, with its reason. A command of one word is
	// a program that the machine does not have.
	if (!CHECKS.some(([n]) => n === command))
		return keep(p, {
			kind: "check",
			name: command,
			at: "2026-10-29T10:00:00Z",
			passed: false,
			durationMs: 60,
			tail: "boom",
			findings: [
				{
					severity: "high",
					path: "",
					line: null,
					message: command.includes(" ")
						? `\`${command}\` stopped with exit code 1`
						: `${command} is not installed or not found`,
				},
			],
		});
	return keep(p, {
		kind: "check",
		name: command,
		at: "2026-10-29T10:00:00Z",
		passed: true,
		durationMs: 1800,
		tail: "all green",
		findings: [],
	});
}

/** One finding with a place and a kind. The mock never holds the value. */
export function scanRun(p: MockPrs, name: string, click: boolean): QualityReport_Serialize {
	need(click);
	const s = SCANNERS.find(([n]) => n === name);
	if (!s) throw `\`${name}\` is not a scanner`;
	if (!s[1] && !p.installed.includes(name)) throw `the scanner \`${name}\` is not installed`;
	return keep(p, {
		kind: "scanner",
		name,
		at: "2026-10-29T10:00:00Z",
		passed: false,
		durationMs: 640,
		tail: "1 finding(s)",
		findings: [{ severity: "high", path: "src/config.ts", line: 40, message: "GitHub token" }],
	});
}

/** One install click: the scanner row turns available. */
/** The export of the lock files: the mock lists the lock files of the demo project. */
export function sbomExport(click: boolean): SbomReport {
	need(click);
	return {
		path: "docs/security/sbom.cdx.json",
		components: 312,
		sources: ["Cargo.lock", "pnpm-lock.yaml"],
	};
}

export function scannerInstall(p: MockPrs, name: string, click: boolean): null {
	need(click);
	if (!SCANNERS.some(([n]) => n === name)) throw `\`${name}\` is not a scanner`;
	if (!p.installed.includes(name)) p.installed.push(name);
	return null;
}

// ------------------------------------------------------------------ impacts

export const impactRefs = (c: MockCode): ImpactRefs => ({
	branches: Object.keys(c.branches),
	tags: ["v0.9", "v1.0"],
	default: "main",
});

export const impactList = (p: MockPrs): ImpactEntry[] =>
	[...p.impacts].sort((a, b) => `${b.date}${b.slug}`.localeCompare(`${a.date}${a.slug}`));

export function impactRead(p: MockPrs, path: string): string {
	const text = p.texts[path];
	if (text === undefined) throw `${path} is not a saved analysis in .shipyard/impacts`;
	return text;
}

const AXES = [
	"behaviour",
	"contracts",
	"data",
	"configuration",
	"security",
	"operations",
	"artifacts",
];

/** Two files, never overwritten: a second analysis of the same day and base gets `-2`. */
export function impactAnalyze(p: MockPrs, c: MockCode, base: string, click: boolean): ImpactEntry {
	need(click);
	const known = [...Object.keys(c.branches), ...impactRefs(c).tags];
	if (!known.includes(base)) throw `no such ref: ${base}`;
	const date = "2026-10-29";
	let stem = `${date}-${base.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
	for (let n = 2; p.texts[`.shipyard/impacts/${stem}.plan.md`]; n++)
		stem = `${stem.replace(/-\d+$/, "")}-${n}`;
	const entry: ImpactEntry = {
		date,
		slug: stem.slice(date.length + 1),
		plan: `.shipyard/impacts/${stem}.plan.md`,
		digest: `.shipyard/impacts/${stem}.digest.md`,
	};
	p.texts[entry.plan] =
		`# Impact plan: ${base}\n\n## Axes\n\n${AXES.map((a) => `- ${a}: ${a === "contracts" ? "high" : "none"}`).join("\n")}\n\n## Stale refs\n\n- spec:auth\n\n## Actions\n\n1. Update the contract.\n2. Run the tests.\n`;
	p.texts[entry.digest] =
		"The login change moves the release by one week. The team must confirm the date.";
	p.impacts.push(entry);
	return entry;
}

// ------------------------------------------------------------------ terminal

export function terminalOpen(p: MockPrs, id: string, folder: string | null): string {
	if (id in p.terminals) throw "that terminal is already open";
	if (folder?.split("/").includes("..")) throw `${folder} is not a folder of the project`;
	p.terminals[id] = `${folder ? `/project/${folder}` : "/project"} $ `;
	emit(p, id, p.terminals[id] ?? "");
	return id;
}

/** The fake shell echoes each line and shows a new prompt. */
export function terminalWrite(p: MockPrs, id: string, data: string) {
	if (!(id in p.terminals)) throw "that terminal is closed";
	const out = data.includes("\r") ? `${data.replace(/\r/g, "\r\n")}/project $ ` : data;
	p.terminals[id] += out;
	emit(p, id, out);
	return null;
}

export function terminalResize(p: MockPrs, id: string) {
	if (!(id in p.terminals)) throw "that terminal is closed";
	return null;
}

/** Closing the panel ends the shell (REQ-035). */
export function terminalClose(p: MockPrs, id: string) {
	delete p.terminals[id];
	return null;
}

export function terminalCloseAll(p: MockPrs) {
	p.terminals = {};
	return null;
}

const emit = (p: MockPrs, id: string, data: string) => {
	for (const l of p.listeners) l(id, data);
};

/** A test or the demo reads the output here: the real app sends the event `terminal-output`. */
export function onTerminalOutput(p: MockPrs, listener: (id: string, data: string) => void) {
	p.listeners.push(listener);
	return () => {
		p.listeners = p.listeners.filter((l) => l !== listener);
	};
}

export { NO_FORGE };
