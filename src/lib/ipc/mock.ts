import { mockIPC } from "@tauri-apps/api/mocks";
import type {
	BacklinkGroup_Serialize,
	Capabilities,
	Connection_Serialize,
	ConnectionDraft_Deserialize,
	ConnectionKind,
	commands,
	Finding_Serialize,
	Overrides_Serialize,
	Prefs_Serialize,
	ProjectEntry_Serialize,
	ProjectFile_Serialize,
	ProjectOutcome_Serialize,
	Resolved_Serialize,
	SearchHit,
	TestOutcome,
} from "./bindings";
import {
	type MockAgents,
	mcpAddCustom,
	mcpServer,
	mcpStart,
	mcpState,
	provider,
	providerAdd,
	providerEdit,
	providerTest,
	seedAgents,
} from "./mock-agents";
import * as ai from "./mock-assistant";
import {
	codeBlame,
	codeBranchCreate,
	codeBranchDelete,
	codeBranches,
	codeBranchMerge,
	codeBranchRebase,
	codeBranchSwitch,
	codeCommit,
	codeCommitDetail,
	codeCommitDiff,
	codeDiff,
	codeDiscard,
	codeFileRead,
	codeLog,
	codeMergeAbort,
	codePull,
	codePush,
	codeRebaseAbort,
	codeRebaseContinue,
	codeResolve,
	codeStage,
	codeStashApply,
	codeStashDrop,
	codeStashList,
	codeStashPush,
	codeStatus,
	codeUnstage,
	codeWatchIntervalSet,
	conflictToFactory,
	type MockCode,
	seedCode,
} from "./mock-code";
import * as cp from "./mock-code-prs";
import * as dv from "./mock-delivery";
import * as design from "./mock-design";
import * as dr from "./mock-doctor";
import * as ex from "./mock-extensions";
import * as fx from "./mock-factory";
import * as kw from "./mock-knowledge";
import * as mc from "./mock-machine";
import { cards, chainGate, seedLinks, seedNotes } from "./mock-overview";
import { parseRef } from "./mock-refs";
import * as specs from "./mock-specs";
import {
	automationGet,
	automationSave,
	importConfirm,
	importPlan,
	type MockSync,
	seedSync,
	adopt as syncAdopt,
	syncItems,
	link as syncLink,
	syncNow,
	syncState,
	unlink as syncUnlink,
} from "./mock-sync";
import * as work from "./mock-work";

type Bindings = typeof commands;
// A command with a Result returns its data in the mock. The generated wrapper adds the Result.
type Out<F> = F extends (...a: never[]) => Promise<infer P>
	? [Extract<P, { status: "ok" }>] extends [never]
		? P
		: P extends { status: "ok"; data: infer D }
			? D
			: never
	: never;
type Handlers = {
	[K in keyof Bindings]: (
		...args: Parameters<Bindings[K]>
	) => Out<Bindings[K]> | Promise<Out<Bindings[K]>>;
};

const NO_OVERRIDES: Overrides_Serialize = {
	theme: null,
	density: null,
	contrast: null,
	accent: null,
	remoteWatch: null,
	notifications: null,
	profileRole: null,
	profileTabs: null,
	readOnly: null,
};

type State = {
	prefs: Prefs_Serialize;
	projects: ProjectEntry_Serialize[];
	files: Record<string, ProjectFile_Serialize>;
	fixed: string[];
	/** The folder that the next picker returns. Without it the picker walks `FOLDERS`. */
	nextFolder?: string;
	/** The path of the next file dialog (a workbook). */
	nextFile?: string;
	cursor: number;
	confirm: boolean;
	connections: Connection_Serialize[];
	/** The logins of the gh and glab tools on this machine, and the hosts that refuse their token. */
	logins: { tool: string; host: string; user: string }[];
	refusedLogins: string[];
	/** The keychain. No command returns a value from it: the tests read it to prove a write. */
	secrets: Record<string, string>;
	/** The working copy of the active project. Seeded on first use. */
	code?: MockCode;
	/** The demo pull requests, reports and fake terminal of Code. Seeded on first use. */
	prs?: cp.MockPrs;
	agents: MockAgents;
	/** The mirror of the fake tracker, the automation file and the ticks. */
	sync: MockSync;
	/** The team, the sheets, the plan, the time entries and the worklogs of the Work space. */
	work: work.MockWork;
	/** The files of the Design space: diagrams, models, contracts, ADRs, flows and screens. */
	design: design.MockDesign;
	/** The files of the Specs space: changes, specs, questions and test plans. */
	specs: specs.MockSpecs;
	/** The runs, questions, approvals, workflows, roles and tiers of the factory. */
	factory: fx.MockFactory;
	/** The assistant threads, their worktrees and the project defaults. */
	assistant: ai.MockAssistant;
	/** The handbook, documents, decks, dashboards and the code index of the Knowledge space. */
	knowledge: kw.MockKnowledge;
	/** The compass entries, roles, catalog, plugin and child projects of the Extensions views. */
	extensions: ex.MockExtensions;
	/** The personas, the work split by profile and the tickets config. */
	delivery: dv.MockDelivery;
	/** The system notifications that the app asked for. */
	os: { title: string; body: string }[];
	/** The labels of the last native menu. */
	menu: Record<string, string>;
	/** The AI sessions and spend of this computer. */
	machine: mc.MockMachine;
	/** The Doctor tools and ledger, and the MCP server for outside agents. */
	doctor: dr.MockDoctor;
	/** The auto-commit option of the active project, the work in flight and the close answer. */
	autoCommit: boolean;
	inFlight: { runs: number; turns: number };
	closed: boolean;
};

const RELEASE_URL = "https://api.github.com/repos/me-cedric/Shipyard/releases/latest";

const FOLDERS = ["/mock/alpha", "/mock/beta", "/mock/gamma"];

/**
 * The project that the browser build opens first. It has a Linear tracker, an imported mirror and
 * the seeded team, sheets and time, so a reviewer reaches every space with one click. Tests and
 * the e2e build run without it (`installMockIpc`).
 */
export const DEMO_FOLDER = "/mock/demo";
let demo = false;

/** The projects of the Legacy registry on the machine of the mock. */
const LEGACY = [{ id: "kvy-storyarc", name: "StoryArc", path: "/mock/storyarc" }];

const DEFAULT_PATHS = {
	decisions: "docs/decisions",
	questions: "docs/delivery/questions",
	specs: "docs/openspec",
};

const fresh = (): State => ({
	prefs: {
		theme: "system",
		density: "default",
		contrast: "default",
		role: "none",
		sidebarOpen: true,
		lang: null,
		releaseUrl: RELEASE_URL,
		assistantWidth: 400,
		assistantSide: "right",
		notifyOff: [],
		seenVersion: null,
		shortcuts: {},
	},
	projects: [],
	files: {},
	fixed: [],
	cursor: 0,
	confirm: true,
	connections: [],
	logins: [],
	refusedLogins: [],
	secrets: {},
	agents: seedAgents(),
	sync: seedSync(),
	work: work.seedWork(),
	design: design.seedDesign(),
	specs: specs.seedSpecs(),
	factory: fx.seedFactory(),
	assistant: ai.seedAssistant(),
	knowledge: kw.seedKnowledge(),
	extensions: ex.seedExtensions(),
	delivery: dv.seedDelivery(),
	os: [],
	menu: {},
	machine: mc.seedMachine(),
	doctor: dr.seedDoctor(),
	autoCommit: false,
	inFlight: { runs: 0, turns: 0 },
	closed: false,
});

let state = fresh();

/** Resets the mock state. Tests call it before each case. */
export function resetMock(patch: Partial<State> = {}) {
	state = { ...fresh(), ...patch };
}

export const mockState = () => state;

export function pickMock(): string | null {
	// The demo comes once, first. The next pick walks the folders as before.
	const first = demo && !state.projects.some((p) => p.path === DEMO_FOLDER) ? DEMO_FOLDER : null;
	const f = state.nextFolder ?? first ?? FOLDERS[state.cursor++ % FOLDERS.length] ?? null;
	state.nextFolder = undefined;
	return f;
}

/** The file picker of the mock: the path that a test names, or a workbook. Each name is used once. */
export function pickFileMock(): string | null {
	const f = state.nextFile ?? "/mock/costing.xlsx";
	state.nextFile = undefined;
	return f;
}

export const confirmMock = () => state.confirm;

// The refs of the app come from the repository files. The mock reads its seeded files.
const entities = () => [
	...design.designEntities(state.design),
	...specs.specsEntities(state.specs),
	...kw.knowledgeEntities(state.knowledge),
];
const citations = (): [string, string][] => [
	...design.designCitations(state.design),
	...specs.specsCitations(state.specs),
	...kw.knowledgeCitations(state.knowledge),
];
const COVERED = ["adr", "q", "change", "spec", "wf", "doc"];

const active = () => state.projects.find((p) => p.active);

/** The working copy of the active project. Without a project the Code commands fail as the real ones do. */
function code(): MockCode {
	if (!active()) throw "no active project";
	state.code ??= seedCode();
	return state.code;
}

function prs(): cp.MockPrs {
	if (!active()) throw "no active project";
	state.prs ??= cp.seedPrs();
	return state.prs;
}

/** The connection ids that the engine of the active project polls: the tracker, then the forge. */
function syncSources(): string[] {
	const p = active();
	const c = p ? state.files[p.id]?.connections : undefined;
	if (!c?.tracker || !state.connections.some((x) => x.id === c.tracker)) return [];
	return [
		c.tracker,
		...(c.forge && state.connections.some((x) => x.id === c.forge) ? [c.forge] : []),
	];
}

/** The mirror with the team handle of each assignee, as `sync_items` gives it. */
const memberRows = () =>
	state.sync.mirror.map((t) => ({ ...t, member: work.handleOf(state.work, t.assignee) }));

function resolve(text: string): Resolved_Serialize | null {
	const parsed = parseRef(text);
	if (!parsed) return null;
	const base = { ref: text, kind: parsed.kind, title: null, status: null, location: null };
	const project = state.projects.find((p) => `project:${p.id}` === text);
	if (project)
		return {
			...base,
			state: "resolved",
			title: project.name,
			status: project.state,
			location: project.path,
		};
	const conn = state.connections.find((c) => `conn:${c.id}` === text);
	if (conn)
		return {
			...base,
			state: "resolved",
			title: conn.name,
			status: `${conn.kind}: ${conn.state}`,
			location: null,
		};
	// The mirror gives `wi:` entities (`add-sync` REQ-016).
	const wi = text.startsWith("wi:") ? state.sync.mirror.find((t) => `wi:${t.key}` === text) : null;
	if (wi)
		return { ...base, state: "resolved", title: wi.title, status: wi.status, location: wi.url };
	const owned = active() ? work.workEntities(state.work).find((e) => e.ref === text) : undefined;
	if (owned)
		return { ...base, state: "resolved", title: owned.title, status: owned.status, location: null };
	const hit = active() ? entities().find((e) => e.ref === text) : undefined;
	if (hit)
		return { ...base, state: "resolved", title: hit.title, status: hit.status, location: null };
	return { ...base, state: active() && COVERED.includes(parsed.kind) ? "broken" : "unresolved" };
}

/** What the Knowledge commands read from the other mocks: the whole graph and the tile sources. */
function knowledgeEnv(): kw.Env {
	need(state.knowledge);
	const owned = work.workEntities(state.work);
	const mirror = state.sync.mirror;
	const statuses = (kind: string, all = false) =>
		[...entities(), ...owned]
			.filter((e) => e.ref.startsWith(`${kind}:`) && (all || !e.ref.includes("#")))
			.map((e) => e.status ?? "-");
	const project = active()?.id ?? null;
	return {
		entities: [
			...entities(),
			...owned,
			...mirror.map((t) => ({ ref: `wi:${t.key}`, title: t.title, status: t.status })),
		],
		citations: [...citations(), ...work.workCitations(state.work, memberRows())],
		resolve,
		specs: Object.entries(state.specs.files)
			.map(([p, f]) => [/\/specs\/([^/]+)\/spec\.md$/.exec(p)?.[1], f.text] as const)
			.filter((x): x is readonly [string, string] => !!x[0])
			.map(([cap, text]) => [`spec:${cap}`, text]),
		tiles: {
			work: mirror.map((t) => t.status),
			runs: fx.runsList(state.factory, project).map((r) => r.state),
			questions: statuses("q"),
			specs: statuses("spec"),
			estimates: owned
				.filter((e) => /^est:[^#]+#/.test(e.ref))
				.map((e) => e.ref.slice(4).split("#")[0] ?? ""),
			quality: null,
			impact: null,
		},
	};
}

function backlinks(text: string): BacklinkGroup_Serialize[] {
	if (!active()) return [];
	const groups = new Map<string, { source: string; title: string | null }[]>();
	const owned = [...entities(), ...work.workEntities(state.work)];
	const cites = [...citations(), ...work.workCitations(state.work, memberRows())];
	for (const [source, target] of cites) {
		if (target !== text) continue;
		const kind = source.slice(0, source.indexOf(":"));
		const title =
			owned.find((e) => e.ref === source)?.title ??
			state.sync.mirror.find((t) => `wi:${t.key}` === source)?.title ??
			null;
		const items = groups.get(kind) ?? [];
		if (!items.some((i) => i.source === source)) groups.set(kind, [...items, { source, title }]);
	}
	return [...groups]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([kind, items]) => ({ kind, count: items.length, items }));
}

function search(query: string, limit: number): SearchHit[] {
	const q = query.trim().toLowerCase();
	if (!q || !active()) return [];
	const all = [
		...entities().map((e) => [e.ref, e] as const),
		...work.workEntities(state.work).map((e) => [e.ref, e] as const),
	];
	const hits = all.flatMap(([ref, e]) => {
		const byRef = ref.toLowerCase().includes(q);
		return byRef || e.title.toLowerCase().includes(q)
			? [
					{
						rank: byRef ? 0 : 1,
						hit: { ref, kind: ref.slice(0, ref.indexOf(":")), title: e.title },
					},
				]
			: [];
	});
	return hits
		.sort((a, b) => a.rank - b.rank || a.hit.ref.localeCompare(b.hit.ref))
		.slice(0, limit)
		.map((h) => h.hit);
}

const deriveKey = (name: string) => {
	const key = name
		.replace(/[^a-z0-9]/gi, "")
		.toUpperCase()
		.slice(0, 6);
	return /^[A-Z]/.test(key) ? key : `P${key}`.slice(0, 6);
};

/** A tracker connection, a project file that names it, and the backlog in the mirror. */
function seedDemo(p: ProjectEntry_Serialize) {
	const id = "demo-tracker";
	state.connections.push({
		id,
		name: "Demo tracker",
		group: "tracker",
		kind: "linear",
		url: "",
		user: null,
		secret: true,
		state: "untested",
		capabilities: FLAGS.linear,
	});
	state.secrets[id] = "demo";
	state.files[p.id] = {
		name: p.name,
		key: p.key,
		paths: DEFAULT_PATHS,
		defaultWorkflow: null,
		gates: [],
		connections: { tracker: id, trackerScope: "ACME" },
	};
	importPlan(state.sync);
	importConfirm(state.sync);
}

const outcome = (
	status: ProjectOutcome_Serialize["status"],
	message: string | null,
	project: ProjectEntry_Serialize | null = null,
): ProjectOutcome_Serialize => ({ status, project, message });

function activate(path: string, name: string, key: string): ProjectOutcome_Serialize {
	let entry = state.projects.find((p) => p.path === path);
	if (!entry) {
		let id = key.toLowerCase();
		for (let n = 2; state.projects.some((p) => p.id === id); n++) id = `${key.toLowerCase()}-${n}`;
		entry = {
			id,
			name,
			key,
			path,
			state: "clean",
			active: false,
			lastUsed: 0,
			lastView: null,
			overrides: NO_OVERRIDES,
		};
		state.projects.push(entry);
	}
	for (const p of state.projects) p.active = p === entry;
	entry.lastUsed = Math.floor(Date.now() / 1000);
	return outcome("opened", null, entry);
}

const FIX_CONTENT = "# OS files\n.DS_Store\n._*\nThumbs.db\nDesktop.ini\n";
const FINDINGS: Finding_Serialize[] = [
	{
		id: "ignore-missing",
		group: "compliance",
		severity: "info",
		code: "ignore-missing",
		detail: null,
		source: null,
		fix: { kind: "write", path: ".gitignore", content: FIX_CONTENT },
	},
	{
		id: "ref-broken:adr:0009>spec:auth",
		group: "refs",
		severity: "warning",
		code: "ref-broken",
		detail: "adr:0009",
		source: "spec:auth",
		fix: { kind: "open", target: "spec:auth" },
	},
];

// The flags of each product. The real command returns them from `shipyard-core`.
const ALL_FLAGS: Capabilities = {
	hierarchy: true,
	transitions: true,
	labels: true,
	comments: true,
	timeTracking: true,
	assignee: true,
};
const FLAGS: Record<ConnectionKind, Capabilities> = {
	"jira-cloud": ALL_FLAGS,
	"jira-data-center": ALL_FLAGS,
	"azure-dev-ops": ALL_FLAGS,
	github: { ...ALL_FLAGS, hierarchy: false, timeTracking: false },
	gitlab: { ...ALL_FLAGS, hierarchy: false },
	linear: { ...ALL_FLAGS, timeTracking: false },
};
const FORGE_KINDS: ConnectionKind[] = ["github", "gitlab", "azure-dev-ops"];

const slug = (name: string, kind: string) => {
	const s = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/, "");
	return s || kind;
};

/** The checks of `connections_add` and `connections_edit`: the same rules as the Rust adapters. */
function checkDraft(d: ConnectionDraft_Deserialize) {
	if (!d.name.trim()) throw "the name needs 1 to 60 characters";
	if (d.group === "forge" && !FORGE_KINDS.includes(d.kind)) throw "this product is not a forge";
	if (d.kind !== "linear" || d.group === "forge") {
		if (!/^https:\/\/[^/\s@]+/.test(d.url.trim()) && !d.url.trim().startsWith("http://localhost"))
			throw "bad address: use an https address";
	}
	if (d.kind === "jira-cloud" && d.group === "tracker" && !d.user?.trim())
		throw "setting: Jira Cloud needs the account email";
}

const conn = (id: string) => {
	const c = state.connections.find((x) => x.id === id);
	if (!c) throw `unknown connection: ${id}`;
	return c;
};

function testConnection(id: string): TestOutcome {
	const c = conn(id);
	let out: TestOutcome;
	if (!c.secret) out = { kind: "failed", reason: "no secret saved" };
	else if (state.secrets[id] === "revoked")
		out = { kind: "failed", reason: "the token was rejected: wrong, expired or revoked" };
	else if (c.url.includes("noscope"))
		out = {
			kind: "missing-scope",
			scope: c.group === "forge" ? "Pull requests: read" : "Issues: read",
		};
	else out = { kind: "passed", account: "Ada Lovelace" };
	c.state = out.kind === "passed" ? "passed" : "failed";
	return out;
}

// A missing key fails `tsc`: each generated command needs a handler.
const handlers: Handlers = {
	appInfo: () => ({ name: "Shipyard", version: "0.1.0", os: "browser" }),
	prefsGet: () => state.prefs,
	prefsSet: (patch) => {
		for (const [k, v] of Object.entries(patch))
			if (v != null) Object.assign(state.prefs, { [k]: v });
		// An empty release address goes back to the default.
		if (!state.prefs.releaseUrl.trim()) state.prefs.releaseUrl = RELEASE_URL;
		// An empty chord resets its action.
		state.prefs.shortcuts = Object.fromEntries(
			Object.entries(state.prefs.shortcuts).filter(([, v]) => v.trim()),
		);
		return state.prefs;
	},
	refsParse: parseRef,
	refsResolve: resolve,
	refsBacklinks: backlinks,
	refsSearch: search,
	refsCheck: () => (active() ? [{ target: "adr:0009", source: "spec:auth" }] : []),
	refsReindex: () => 0,
	projectsList: () => state.projects,
	projectsActive: () => active() ?? null,
	projectsOpen: (path) => {
		if (path === "/mock/plain") return outcome("not-repository", path);
		const name = path.split("/").pop() ?? "project";
		const known = state.projects.some((p) => p.path === path);
		const opened = activate(path, name, deriveKey(name));
		if (path === DEMO_FOLDER && !known && opened.project) seedDemo(opened.project);
		return opened;
	},
	projectsCreate: (path, name, key) => {
		if (!/^[A-Z][A-Z0-9]{0,9}$/.test(key)) return outcome("invalid", `key: ${key}`);
		if (path === "/mock/full") return outcome("folder-not-empty", path);
		return activate(path, name, key);
	},
	projectsClone: (url, path) =>
		url.includes("missing")
			? outcome("failed", "repository not found")
			: activate(path, path.split("/").pop() ?? "project", deriveKey(path.split("/").pop() ?? "")),
	projectsSwitch: (id) => {
		const p = state.projects.find((x) => x.id === id);
		if (!p) throw `unknown project: ${id}`;
		for (const x of state.projects) x.active = x === p;
		return p;
	},
	projectsClose: () => {
		for (const x of state.projects) x.active = false;
		return null;
	},
	projectsRemove: (id) => {
		if (!state.projects.some((x) => x.id === id)) throw `unknown project: ${id}`;
		state.projects = state.projects.filter((x) => x.id !== id);
		return null;
	},
	projectsSetView: (id, view) => {
		const p = state.projects.find((x) => x.id === id);
		if (p) p.lastView = view;
		return null;
	},
	projectSettings: () => {
		const p = active();
		if (!p) return null;
		const file = state.files[p.id] ?? {
			name: p.name,
			key: p.key,
			paths: DEFAULT_PATHS,
			defaultWorkflow: null,
			gates: [],
		};
		return { file, overrides: p.overrides };
	},
	projectFileSave: (file) => {
		const p = active();
		if (!p) throw "no active project";
		state.files[p.id] = {
			...file,
			paths: file.paths ?? {},
			defaultWorkflow: file.defaultWorkflow ?? null,
			gates: file.gates ?? [],
			// Unset ids stay out of the file, as in the Rust codec.
			connections: file.connections
				? {
						...(file.connections.tracker ? { tracker: file.connections.tracker } : {}),
						...(file.connections.forge ? { forge: file.connections.forge } : {}),
						...(file.connections.trackerScope
							? { trackerScope: file.connections.trackerScope }
							: {}),
					}
				: undefined,
		};
		p.name = file.name;
		return null;
	},
	projectOverridesSave: (o) => {
		const p = active();
		if (!p) throw "no active project";
		p.overrides = {
			theme: o.theme ?? null,
			density: o.density ?? null,
			contrast: o.contrast ?? null,
			accent: o.accent ?? null,
			remoteWatch: o.remoteWatch ?? null,
			notifications: o.notifications ?? null,
			profileRole: o.profileRole ?? null,
			profileTabs: o.profileTabs ?? null,
			readOnly: o.readOnly ?? null,
		};
		return null;
	},
	healthRun: () => (active() ? FINDINGS.filter((f) => !state.fixed.includes(f.id)) : []),
	healthFix: (id, expected) => {
		const f = FINDINGS.find((x) => x.id === id);
		if (f?.fix.kind !== "write") throw "this fix writes no file";
		if (expected != null && expected !== f.fix.content)
			throw "the file changed since the preview: preview the fix again";
		if (expected != null) state.fixed.push(id);
		return { path: f.fix.path, content: f.fix.content, written: expected != null };
	},
	connectionsList: () => state.connections,
	connectionsAdd: (d) => {
		checkDraft(d);
		const base = slug(d.name, d.kind);
		let id = base;
		for (let n = 2; state.connections.some((c) => c.id === id); n++) id = `${base}-${n}`;
		const c: Connection_Serialize = {
			id,
			name: d.name.trim(),
			group: d.group,
			kind: d.kind,
			url: d.kind === "linear" && d.group === "tracker" ? "" : d.url.trim(),
			user: d.user?.trim() || null,
			secret: false,
			state: "untested",
			capabilities: d.group === "tracker" ? FLAGS[d.kind] : null,
		};
		state.connections.push(c);
		return c;
	},
	connectionsEdit: (id, d) => {
		const c = conn(id);
		if (c.group !== d.group || c.kind !== d.kind) throw "the kind of a connection does not change";
		checkDraft(d);
		const url = d.kind === "linear" && d.group === "tracker" ? "" : d.url.trim();
		const user = d.user?.trim() || null;
		if (url !== c.url || user !== c.user) c.state = "untested";
		Object.assign(c, { name: d.name.trim(), url, user });
		return c;
	},
	connectionsUsers: (id) =>
		state.projects
			.filter((p) => {
				const c = state.files[p.id]?.connections;
				return c?.tracker === id || c?.forge === id;
			})
			.map((p) => ({ id: p.id, name: p.name, key: p.key })),
	connectionsRemove: (id) => {
		const c = conn(id);
		state.connections = state.connections.filter((x) => x !== c);
		delete state.secrets[id];
		return null;
	},
	connectionsSetSecret: (id, secret) => {
		const c = conn(id);
		if (!secret.trim()) throw "the secret needs 1 to 4096 characters";
		state.secrets[id] = secret.trim();
		c.secret = true;
		c.state = "untested";
		return c;
	},
	connectionsTest: testConnection,
	connectionsDetect: () => state.logins,
	connectionsUseLogin: (tool, host, click) => {
		if (!click) throw "this change needs the click of a person";
		const kind = tool === "gh" ? "github" : tool === "glab" ? "gitlab" : null;
		if (!kind) throw `unknown tool: ${tool}`;
		if (!state.logins.some((l) => l.tool === tool && l.host === host))
			throw `${tool} gave no token for ${host}`;
		if (state.refusedLogins.includes(host)) throw `${host} refused the token of ${tool}: 401`;
		const name = `${host} (${tool})`;
		const c: Connection_Serialize = {
			id: slug(name, kind),
			name,
			group: "forge",
			kind,
			url: `https://${host}`,
			user: null,
			secret: true,
			state: "passed",
			capabilities: null,
		};
		state.connections.push(c);
		state.secrets[c.id] = "from the tool";
		return c;
	},
	connectionsCreateRepo: (id, slug, click) => {
		if (conn(id).group !== "forge") throw `${id} is not a forge`;
		if (!click) throw "this change needs the click of a person";
		if (slug.split("/").length < 2 || slug.split("/").some((p) => !p || p === "." || p === ".."))
			throw `setting: a repository name has the form owner/name`;
		return {
			slug,
			url: `https://example.com/${slug}`,
			defaultBranch: "main",
			archived: false,
			canPush: true,
		};
	},
	connectionsRepos: (id) => {
		if (conn(id).group !== "forge") throw `${id} is not a forge`;
		return {
			items: [
				{
					slug: "acme/web",
					url: "https://example.com/acme/web",
					defaultBranch: "main",
					archived: false,
					canPush: true,
				},
				{
					slug: "acme/docs",
					url: "https://example.com/acme/docs",
					defaultBranch: "main",
					archived: false,
					canPush: false,
				},
			],
			next: null,
		};
	},
	runnersList: () => state.agents.runners,
	providersList: () => state.agents.providers,
	providersAdd: (d) => providerAdd(state.agents, d),
	providersEdit: (id, d) => providerEdit(state.agents, id, d),
	providersSetSecret: (id, secret) => {
		const p = provider(state.agents, id);
		if (!secret.trim()) throw "the secret needs 1 to 4096 characters";
		state.secrets[id] = secret.trim();
		p.secret = true;
		p.state = "untested";
		return p;
	},
	providersRemove: (id) => {
		const p = provider(state.agents, id);
		state.agents.providers = state.agents.providers.filter((x) => x !== p);
		delete state.secrets[id];
		return null;
	},
	providersTest: (id) => providerTest(state.agents, state.secrets, id),
	providersModels: (id) => {
		provider(state.agents, id);
		return ["llama-3", "qwen"];
	},
	mcpList: () => state.agents.mcp,
	mcpEnable: (id, on) => {
		const s = mcpServer(state.agents, id);
		s.enabled = on;
		if (!on) s.state = { state: "stopped" };
		return null;
	},
	mcpAddCustom: (d) => mcpAddCustom(state.agents, d),
	mcpRemove: (id) => {
		const s = mcpServer(state.agents, id);
		if (!s.custom) throw `unknown MCP server: ${id}`;
		state.agents.mcp = state.agents.mcp.filter((x) => x !== s);
		return null;
	},
	mcpForget: (id) => {
		const s = mcpServer(state.agents, id);
		Object.assign(s, { enabled: false, filled: [], state: { state: "stopped" } });
		return null;
	},
	mcpSetField: (id, key, value) => {
		const s = mcpServer(state.agents, id);
		if (!s.fields.some((f) => f.key === key)) throw `${id} has no field ${key}`;
		if (!value) throw "the value is empty";
		state.secrets[`${id}/${key}`] = value;
		if (!s.filled.includes(key)) s.filled.push(key);
		return null;
	},
	mcpStart: (id) => mcpStart(state.agents, id),
	mcpStop: (id) => {
		mcpServer(state.agents, id).state = { state: "stopped" };
		return null;
	},
	mcpState: (id) => mcpState(state.agents, id),
	mcpInstall: (command) => {
		for (const s of state.agents.mcp) s.missing = s.missing.filter((d) => d.command !== command);
		return `installed ${command}`;
	},
	machineSessions: () => state.machine.sessions,
	machineSessionStop: (pid, click) => {
		if (!click) throw "this change needs the click of a person";
		return mc.machineStop(state.machine, pid);
	},
	machineSpend: (days) => mc.machineSpend(state.machine, days),
	machineBudgetSet: (runner, usd) => mc.machineBudgetSet(state.machine, runner, usd),
	mcpOutsideGet: () => dr.outsideStatus(state.doctor),
	mcpOutsideSet: (gates) => dr.outsideSet(state.doctor, gates),
	mcpOutsideWire: () => dr.outsideWire(state.doctor, active()?.path ?? null),
	mcpOutsideToken: () => dr.outsideToken(state.doctor),
	mcpElsewhereList: () => state.doctor.elsewhere,
	mcpElsewhereImport: (source, name) => dr.elsewhereImport(state.doctor, source, name),
	doctorTools: () => state.doctor.tools,
	doctorToolInstall: (id, click) => {
		if (!click) throw "this change needs the click of a person";
		return dr.doctorInstall(state.doctor, id);
	},
	doctorLedger: () => dr.doctorLedger(state.doctor),
	shellMenu: (labels) => {
		state.menu = labels;
		return null;
	},
	notifyOs: (title, body) => {
		state.os.push({ title, body });
		return null;
	},
	// A release address with `newer` in it has a newer version; one with `broken` fails.
	updateCheck: () => {
		const url = state.prefs.releaseUrl;
		if (url.includes("broken")) throw "the release answer holds no version";
		const newer = url.includes("newer");
		return {
			current: "0.1.0",
			latest: newer ? "0.2.0" : "0.1.0",
			newer,
			url: "https://example.com/releases/latest",
			// The sections after the last version that ran, up to the running one.
			notes:
				state.prefs.seenVersion != null && state.prefs.seenVersion < "0.1.0"
					? "## 0.1.0\n- A change."
					: "",
		};
	},
	syncState: () => syncState(state.sync, syncSources()),
	syncNow: () => syncNow(state.sync, syncSources(), state.secrets),
	syncAutomationGet: () => {
		if (!active()) throw "no active project";
		return automationGet(state.sync);
	},
	syncAutomationSave: (a) => {
		if (!active()) throw "no active project";
		automationSave(state.sync, a as Parameters<typeof automationSave>[1]);
		return null;
	},
	syncItems: (filter) =>
		syncSources().length
			? syncItems(state.sync, filter).map((t) => ({
					...t,
					member: work.handleOf(state.work, t.assignee),
				}))
			: [],
	syncImportPlan: () => needTracker(() => importPlan(state.sync)),
	syncImportConfirm: () => needTracker(() => importConfirm(state.sync)),
	syncAdopt: (key) =>
		needTracker(() => {
			const t = syncAdopt(state.sync, key);
			return { ...t, member: work.handleOf(state.work, t.assignee) };
		}),
	syncLink: (local, key) => {
		needTracker(() => syncLink(state.sync, local, key));
		return null;
	},
	syncUnlink: (local) => needTracker(() => syncUnlink(state.sync, local)),
	workContext: () => {
		const p = active();
		const scope = p ? (state.files[p.id]?.connections?.trackerScope ?? null) : null;
		return work.workContext(
			state.work,
			syncSources()[0] ?? null,
			scope,
			state.sync.automation.pickup?.label ?? null,
		);
	},
	workTeam: () => work.teamGet(need(state.work)),
	workTeamSave: (team) => work.teamSave(need(state.work), team),
	workSuggest: (key) =>
		needTracker(() =>
			work.workSuggest(
				need(state.work),
				state.sync.mirror,
				state.sync.automation.pickup?.label ?? null,
				key,
			),
		),
	workAssign: (key, member, click) => {
		needTracker(() => work.workAssign(need(state.work), state.sync.mirror, key, member, click));
		return null;
	},
	workMark: (key, click) => {
		needTracker(() =>
			work.workMark(state.sync.mirror, state.sync.automation.pickup?.label ?? null, key, click),
		);
		return null;
	},
	workTransition: (key, to, click) => {
		needTracker(() => work.workTransition(state.sync.mirror, key, to, click));
		return null;
	},
	workTicketComments: (key) => needTracker(() => work.ticketComments(need(state.work), key)),
	workTicketCommentAdd: (key, body, click) => {
		needTracker(() => work.ticketCommentAdd(need(state.work), key, body, click));
		return null;
	},
	workTicketEdit: (key, title, _description, _days, click) =>
		needTracker(() => work.ticketEdit(state.sync.mirror, key, title, click)),
	workTicketLabelAdd: (key, label, click) => {
		needTracker(() => work.ticketLabelAdd(state.sync.mirror, key, label, click));
		return null;
	},
	workSealState: () => work.sealState(need(state.work)),
	workUnlock: (passphrase) => work.sealUnlock(need(state.work), passphrase),
	workLock: () => work.sealLock(need(state.work)),
	workSeal: (passphrase) => work.sealAll(need(state.work), passphrase),
	workUnseal: (passphrase) => work.unsealAll(need(state.work), passphrase),
	estimateList: () => work.estimateList(need(state.work)),
	estimateGet: (slug) => work.estimateGet(need(state.work), state.sync.mirror, slug),
	estimateSave: (slug, sheet) =>
		work.estimateSave(need(state.work), state.sync.mirror, slug, sheet),
	estimatePortfolio: () => work.estimatePortfolio(need(state.work)),
	excelPreview: (path, scope) => work.excelPreview(need(state.work), path, scope),
	excelConfirm: (slug, confirmed) =>
		work.excelConfirm(need(state.work), state.sync.mirror, slug, confirmed),
	excelExport: (slug, path) => {
		work.excelExport(need(state.work), slug, path);
		return null;
	},
	planGet: (slug) => work.planGet(need(state.work), slug),
	planDecisionsSave: (decisions) => {
		work.decisionsSave(need(state.work), decisions);
		return null;
	},
	planCalendarSave: (calendar) => {
		work.calendarSave(need(state.work), calendar);
		return null;
	},
	timeList: (member, month) =>
		work.timeList(need(state.work), member, month, syncSources().length > 0),
	timeAdd: (member, day, minutes, note, ticket) =>
		work.timeAdd(need(state.work), state.sync.mirror, member, day, minutes, note, ticket),
	timeFetch: (member, ticket) =>
		needTracker(() => work.timeFetch(need(state.work), member, ticket)),
	timeSend: (member, day, id, offset, reduce, click) =>
		needTracker(() =>
			work.timeSend(need(state.work), member, day, id, offset, reduce, click, true),
		),
	applyPreview: (slugs) => needTracker(() => work.applyPreview(need(state.work), slugs)),
	applyRun: (slugs, click) => needTracker(() => work.applyRun(need(state.work), slugs, click)),
	workItemPreview: (row) => needTracker(() => work.itemPreview(need(state.work), row)),
	workItemCreate: (row, click) => needTracker(() => work.itemCreate(need(state.work), row, click)),
	codeStatus: () => codeStatus(code()),
	codeDiff: (path, side) => codeDiff(code(), path, side),
	codeStage: (paths) => {
		codeStage(code(), paths);
		return null;
	},
	codeUnstage: (paths) => {
		codeUnstage(code(), paths);
		return null;
	},
	codeDiscard: (paths, untracked) => {
		codeDiscard(code(), paths, untracked);
		return null;
	},
	codeCommit: (summary, description) => codeCommit(code(), summary, description),
	codeLog: (skip, limit) => codeLog(code(), skip, Math.min(Math.max(limit, 1), 200)),
	codeCommitDetail: (sha) => codeCommitDetail(code(), sha),
	codeCommitDiff: (sha, path) => codeCommitDiff(code(), sha, path),
	codeBranches: () => codeBranches(code()),
	codeBranchCreate: (name) => {
		codeBranchCreate(code(), name);
		return null;
	},
	codeBranchSwitch: (name) => {
		codeBranchSwitch(code(), name);
		return null;
	},
	codeBranchMerge: (name) => codeBranchMerge(code(), name),
	codeMergeAbort: () => {
		codeMergeAbort(code());
		return null;
	},
	codeBranchRebase: (onto) => codeBranchRebase(code(), onto),
	codeRebaseContinue: () => codeRebaseContinue(code()),
	codeRebaseAbort: () => {
		codeRebaseAbort(code());
		return null;
	},
	codeBlame: (path) => codeBlame(code(), path),
	codePushForce: () => {
		codePush(code());
		return null;
	},
	codeBranchDelete: (name, force) => {
		codeBranchDelete(code(), name, force);
		return null;
	},
	codeStashPush: (message) => codeStashPush(code(), message),
	codeStashList: () => codeStashList(code()),
	codeStashApply: (index) => {
		codeStashApply(code(), index);
		return null;
	},
	codeStashDrop: (id) => {
		codeStashDrop(code(), id);
		return null;
	},
	codeConflicts: () => code().conflicts,
	codeResolve: (path, how) => {
		codeResolve(code(), path, how);
		return null;
	},
	codeFetch: () => {
		code();
		return null;
	},
	codePull: () => codePull(code()),
	codePush: () => {
		codePush(code());
		return null;
	},
	codeWatchTick: () => {
		const n = code().notice;
		return n ? [n] : [];
	},
	codeRemoteUrl: () => (need(code()).branch ? "https://example.com/acme/project.git" : null),
	codeWatchInterval: () => code().watchMinutes,
	codeWatchIntervalSet: (minutes) => codeWatchIntervalSet(code(), minutes),
	codeFileRead: (path, rev) => codeFileRead(code(), path, rev),
	codeWatchNotice: () => (active() ? (code().notice ?? null) : null),
	codePullDetail: (number) =>
		cp.pullDetail(
			prs(),
			number,
			fx.pullsList(state.factory, active()?.id ?? null).find((r) => r.number === number),
		),
	codePullLabels: () => cp.pullLabels(),
	codePullOpen: (input, click) => cp.pullOpen(prs(), code(), input, click),
	codePullComment: (number, body, click) => cp.pullComment(prs(), number, body, click),
	codePullVerdict: (number, verdict, body, click) =>
		cp.pullVerdict(prs(), number, verdict, body, click),
	codePullMerge: (number, method, click) => cp.pullMerge(prs(), number, method, click),
	codePullReady: (number, click) => cp.pullReady(prs(), number, click),
	codeQuality: () => cp.qualityView(prs()),
	codeCheckRun: (command, click) => cp.checkRun(prs(), command, click),
	codeScanRun: (name, click) => cp.scanRun(prs(), name, click),
	codeScannerInstall: (name, click) => cp.scannerInstall(prs(), name, click),
	codeImpactRefs: () => cp.impactRefs(code()),
	codeImpactList: () => cp.impactList(prs()),
	codeImpactRead: (path) => cp.impactRead(prs(), path),
	codeImpactAnalyze: (base, click) => cp.impactAnalyze(prs(), code(), base, click),
	terminalOpen: (id, folder) => cp.terminalOpen(prs(), id, folder),
	terminalWrite: (id, data) => cp.terminalWrite(prs(), id, data),
	terminalResize: (id) => cp.terminalResize(prs(), id),
	terminalClose: (id) => cp.terminalClose(prs(), id),
	terminalCloseAll: () => cp.terminalCloseAll(prs()),
	designList: () => design.designList(need(state.design)),
	designRead: (path) => design.designRead(need(state.design), path),
	designWrite: (path, text, stamp, create) =>
		design.designWrite(need(state.design), path, text, stamp, create),
	designAdrCreate: (title) => design.adrCreate(need(state.design), title, state.work.today),
	designAdrDecide: (path, decision, comment, stamp) =>
		design.adrDecide(need(state.design), path, decision, comment, stamp, state.work.today),
	designFlowsSave: (path, rows, stamp) => design.flowsSave(need(state.design), path, rows, stamp),
	designTry: (request, click) => design.designTry(need(state.design), request, click),
	designOpen: (target) => {
		design.designOpen(need(state.design), target);
		return null;
	},
	specsChanges: () => specs.changes(need(state.specs)),
	specsChangeCreate: (id) => specs.changeCreate(need(state.specs), id, state.work.today),
	specsRead: (path) => specs.specsRead(need(state.specs), path),
	specsWrite: (path, text, stamp, create) =>
		specs.specsWrite(need(state.specs), path, text, stamp, create),
	specsValidate: (id) => specs.validate(need(state.specs), id),
	specsCapabilities: () => specs.capabilities(need(state.specs)),
	specsSpec: (path) => specs.specView(need(state.specs), path),
	specsQuestions: () => specs.questions(need(state.specs)),
	specsQuestionSave: (path, question, stamp) =>
		specs.questionSave(need(state.specs), path, question, stamp),
	specsQuestionCreate: (question) => specs.questionCreate(need(state.specs), question),
	specsTestplans: () => specs.testplans(need(state.specs)),
	specsCoverage: (capability) => specs.coverage(need(state.specs), capability),
	specsFold: (specPath, questionId, answer, stamp, click) =>
		specs.foldAnswer(need(state.specs), specPath, questionId, answer, stamp, click),
	specsSplitDraft: (change) => specs.splitDraft(need(state.specs), change),
	specsSplitSave: (draft) => {
		specs.splitSave(need(state.specs), draft);
		return null;
	},
	specsSplitPreview: (change) =>
		needTracker(() => specs.splitPreview(need(state.specs), state.work, change)),
	specsSplitApply: (change, click) =>
		needTracker(() =>
			specs.splitApply(
				need(state.specs),
				state.work,
				state.sync.mirror,
				change,
				click,
				new Date().toISOString(),
			),
		),
	// No tracker means no mirrored items.
	specsArchive: (id, confirmed) =>
		specs.archive(
			need(state.specs),
			syncSources().length ? state.sync.mirror : [],
			id,
			confirmed,
			state.work.today,
		),
	compassGet: () => ex.compassGet(need(state.extensions)),
	compassPreview: (kind, id) => ex.compassPreview(need(state.extensions), kind, id),
	compassApply: (entries) => ex.compassApply(need(state.extensions), entries),
	compassUpgrade: (selection) => ex.compassUpgrade(need(state.extensions), selection),
	rolesSkillsGet: () => ex.rolesSkillsGet(need(state.extensions)),
	catalogGet: () => need(state.extensions).catalog,
	catalogPreview: (id) => ex.catalogPreview(need(state.extensions), id),
	catalogDeploy: (id) => ex.catalogDeploy(need(state.extensions), id),
	pluginReview: (path) => ex.pluginReview(need(state.extensions), path),
	pluginApply: (path, accepted) => ex.pluginApply(need(state.extensions), path, accepted),
	compassPolicies: () => ex.compassPolicies(need(state.extensions)),
	compassPolicyApply: (id, click) => ex.compassPolicyApply(need(state.extensions), id, click),
	compassImport: (path, click) => ex.compassImport(need(state.extensions), path, click),
	compassRemove: (kind, id, click) => ex.compassRemove(need(state.extensions), kind, id, click),
	catalogUndeploy: (id, click) => ex.catalogUndeploy(need(state.extensions), id, click),
	pluginList: () => ex.pluginList(need(state.extensions)),
	pluginSetEnabled: (name, on, click) =>
		ex.pluginSetEnabled(need(state.extensions), name, on, click),
	pluginRemove: (name, click) => ex.pluginRemove(need(state.extensions), name, click),
	autoCommitGet: () => state.autoCommit,
	autoCommitSet: (on) => {
		state.autoCommit = on;
		return on;
	},
	// The commit of the sync action: nothing when the option is off.
	autoCommitRun: () => (state.autoCommit ? "a1b2c3d" : null),
	closeGuardState: () => state.inFlight,
	closeAnyway: () => {
		state.closed = true;
		return null;
	},
	runnerInstall: (id, click) => {
		if (!click) throw "this change needs the click of a person";
		const r = state.agents.runners.find((x) => x.id === id);
		if (!r) throw `\`${id}\` is not a runner`;
		Object.assign(r, { state: "detected", path: `/usr/local/bin/${id}`, version: "1.0.0" });
		return null;
	},
	childList: () => ex.childList(need(state.extensions)),
	childAdd: (name, url) => ex.childAdd(need(state.extensions), name, url),
	childRemove: (id) => ex.childRemove(need(state.extensions), id),
	childClone: (id) => ex.childClone(need(state.extensions), id),
	childDeploy: (ids, keys) => ex.childDeploy(need(state.extensions), ids, keys),
	graphGet: () => kw.graphGet(need(state.knowledge), knowledgeEnv()),
	graphCode: () => kw.graphCode(need(state.knowledge)),
	graphCodeIndex: () => kw.graphCodeIndex(need(state.knowledge)),
	explainContextGet: (entity) => kw.explainContext(knowledgeEnv(), entity),
	docListGet: () => kw.docListGet(need(state.knowledge)),
	docReadOne: (path) => kw.docReadOne(need(state.knowledge), path),
	docWriteOne: (path, text, stamp, create) =>
		kw.docWriteOne(need(state.knowledge), path, text, stamp, create),
	slideThemeGet: () => kw.themeGet(need(state.knowledge)),
	slideThemeSet: (theme, stamp) => kw.themeSet(need(state.knowledge), theme, stamp),
	slideParse: (text) => kw.slideParse(text),
	dashboardListGet: () => kw.dashboardList(need(state.knowledge)),
	dashboardGetOne: (slug) => kw.dashboardGet(need(state.knowledge), slug),
	dashboardSaveOne: (slug, dashboard, stamp) =>
		kw.dashboardSave(need(state.knowledge), slug, dashboard, stamp),
	dashboardTile: (kind) => kw.dashboardTile(knowledgeEnv(), kind),
	learnGet: () => kw.learnGet(knowledgeEnv()),
	exportDossierFile: (text, views, path) =>
		kw.exportDossier(need(state.knowledge), text, views, path),
	exportFunctionalFile: (text, path) => kw.exportFunctional(need(state.knowledge), text, path),
	exportSheetFile: (text, sheets, path) =>
		kw.exportSheet(need(state.knowledge), text, sheets, path),
	tiersGet: () => fx.tiersGet(state.factory),
	tiersSet: (row) => fx.tiersSet(state.factory, row),
	runsList: () => fx.runsList(state.factory, active()?.id ?? null),
	runGetOne: (run) => fx.runGetOne(state.factory, active()?.id ?? null, run),
	runLogPage: (run, after, limit) => fx.runLogPage(state.factory, run, after, limit),
	sessionsList: () => fx.sessionsList(state.factory, active()?.id ?? null),
	usageGet: () => fx.usageGet(state.factory, active()?.id ?? null),
	budgetSet: (scope, key, usd) => fx.budgetSet(state.factory, scope, key, usd),
	runDiff: (run) => fx.runDiff(state.factory, active()?.id ?? null, run),
	runStart: (key) => {
		const p = active();
		if (!p) throw "no project is open";
		return needTracker(() => fx.runStart(state.factory, p.id, state.sync.mirror, key));
	},
	runCancel: (run) => fx.runCancel(state.factory, run),
	runResume: (run, addUsd, addTokens) => fx.runResume(state.factory, run, addUsd, addTokens),
	runUnblock: (run) => fx.runUnblock(state.factory, run),
	runPlanApprove: (run) => fx.runPlanApprove(state.factory, run),
	runPlanReject: (run, note) => fx.runPlanReject(state.factory, run, note),
	killSwitchGet: () => fx.killSwitchGet(state.factory),
	runLogDegraded: () => fx.runLogDegraded(),
	killSwitchSet: (on) => fx.killSwitchSet(state.factory, on),
	workflowsList: () => fx.workflowsList(need(state.factory)),
	workflowGet: (id) => fx.workflowGet(need(state.factory), id),
	workflowCheck: (id, text) => fx.workflowCheck(need(state.factory), id, text),
	workflowWrite: (id, text) => fx.workflowWrite(need(state.factory), id, text),
	rolesList: () => fx.rolesList(need(state.factory)),
	roleGet: (id) => fx.roleGet(need(state.factory), id),
	roleWrite: (id, text) => fx.roleWrite(need(state.factory), id, text),
	questionsList: () => fx.questionsList(state.factory, active()?.id ?? null),
	questionAnswer: (run, id, choice) => fx.questionAnswer(state.factory, run, id, choice),
	messagesList: () => fx.messagesList(state.factory, active()?.id ?? null),
	messageReadMark: (run, n) => fx.messageReadMark(state.factory, run, n),
	approvalsList: () => fx.approvalsList(state.factory, active()?.id ?? null),
	approvalApprove: (id) => fx.approvalApprove(state.factory, id),
	approvalReject: (id) => fx.approvalReject(state.factory, id),
	pullsList: () => {
		const rows = fx.pullsList(state.factory, active()?.id ?? null);
		// The mock forge mirror belongs to the project that owns the factory demo, as its rows do.
		return rows.length ? [...rows, ...cp.prRows(prs())] : [];
	},
	assistantThreads: () => ai.threads(state.assistant, assistantEnv()),
	assistantCreate: (title) => ai.create(state.assistant, assistantEnv(), title),
	assistantGet: (id) => ai.get(state.assistant, assistantEnv(), id),
	assistantRename: (id, title) => ai.rename(state.assistant, assistantEnv(), id, title),
	assistantDelete: (id) => ai.remove(state.assistant, assistantEnv(), id),
	assistantWorktreeDiscard: (id, force) =>
		ai.worktreeDiscard(state.assistant, assistantEnv(), id, force),
	assistantDiff: (id) => ai.diff(state.assistant, assistantEnv(), id),
	assistantSaveDraft: (id, draft, context) =>
		ai.saveDraft(state.assistant, assistantEnv(), id, draft, context),
	assistantSettingsSet: (id, settings) =>
		ai.settingsSet(state.assistant, assistantEnv(), id, settings),
	assistantRefAdd: (id, text) => ai.refAdd(state.assistant, assistantEnv(), id, text),
	assistantRefRemove: (id, text) => ai.refRemove(state.assistant, assistantEnv(), id, text),
	assistantSend: (id, text, quotes, context) =>
		ai.send(state.assistant, assistantEnv(), id, text, quotes, context),
	assistantGrant: (id) => ai.grant(state.assistant, assistantEnv(), id),
	assistantRetry: (id) => ai.retry(state.assistant, assistantEnv(), id),
	assistantExplain: (id, entity) => ai.explain(state.assistant, assistantEnv(), id, entity),
	assistantToFactoryPreview: (id) => ai.toFactoryPreview(state.assistant, assistantEnv(), id),
	assistantToFactory: (id, workflow, click) =>
		ai.toFactory(state.assistant, assistantEnv(), id, workflow, click),
	conflictToFactory: (workflow, click) => conflictToFactory(code(), workflow, click),
	assistantDefaultsGet: () => ai.defaultsGet(state.assistant),
	assistantDefaultsSet: (d) => ai.defaultsSet(state.assistant, d),
	assistantOptions: () => ai.options(),
	personasList: () => need(state.delivery.personas),
	personasSave: (list) => {
		need(null);
		dv.personasSave(state.delivery, list);
		return null;
	},
	assignmentsRead: () => need(state.delivery.assignments),
	ticketsConfigGet: () => need(state.delivery.tickets),
	ticketsConfigSave: (c) => {
		need(null);
		dv.ticketsConfigSave(state.delivery, c);
		return null;
	},
	ticketsLinks: () => need(seedLinks()),
	deliveryNotes: () => need(seedNotes()),
	projectsOverview: () => cards(state.projects),
	projectOpenRemote: (id) => {
		if (!cards(state.projects).find((c) => c.id === id)?.webUrl) throw "the project has no remote";
		return null;
	},
	codePushTarget: () => {
		const branch = need(code()).branch;
		return { remote: "origin", branch, canPush: true, onDefault: branch === "main" };
	},
	codeChainGate: (push) => chainGate(push ? [] : codeStatus(code()).staged.map((f) => f.path)),
	projectImport: () => ({ copied: [], skipped: [], conflicts: [] }),
	legacyProjects: () => LEGACY.filter((k) => !state.projects.some((p) => p.path === k.path)),
	legacyProjectOpen: (id) => {
		const k = LEGACY.find((x) => x.id === id);
		if (!k) throw `unknown Legacy project: ${id}`;
		const known = state.projects.some((p) => p.path === k.path);
		const opened = activate(k.path, k.name, deriveKey(k.name));
		// The Legacy paths of the registry entry, written once. A saved file wins.
		const p = opened.project;
		if (p && !(known || state.files[p.id]))
			state.files[p.id] = {
				name: p.name,
				key: p.key,
				paths: { ...DEFAULT_PATHS, diagrams: "docs/drawings", models: "docs/diagrams" },
				defaultWorkflow: null,
				gates: [],
			};
		return opened;
	},
};

/** The active project and the ref index, for the assistant commands. */
function assistantEnv(): ai.Env {
	const p = active();
	if (!p) throw "no active project";
	return { project: p.id, resolves: (ref) => resolve(ref)?.state === "resolved" };
}

/** The Work data of the active project. Without a project the commands fail as the real ones do. */
function need<T>(data: T): T {
	if (!active()) throw "no active project";
	return data;
}

function needTracker<T>(f: () => T): T {
	if (syncSources().length === 0) throw "the project has no tracker connection";
	return f();
}

const camel = (s: string) => s.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

/** The output of the fake terminal. The real app sends the event `terminal-output`, payload `TerminalOutput` (`{ id, data }`). */
export function onMockTerminalOutput(listener: (id: string, data: string) => void) {
	return cp.onTerminalOutput(prs(), listener);
}

/** `demo`: the first folder that the picker returns is the demo project (`DEMO_FOLDER`). */
export function installMockIpc(options: { demo?: boolean } = {}) {
	demo = options.demo === true;
	mockIPC((cmd, args) => {
		const handler = (handlers as Record<string, ((...a: unknown[]) => unknown) | undefined>)[
			camel(cmd)
		];
		if (!handler) throw new Error(`No mock handler for command: ${cmd}`);
		// The generated code sends `{ a, b }` in the order of the parameters.
		const out = handler(...Object.values((args ?? {}) as Record<string, unknown>));
		// A real command sends a copy. A shared object would hide a change from the query cache.
		// A handler can be async (an MCP start): wait for it, then copy.
		const copy = (v: unknown) => (v === undefined ? v : structuredClone(v));
		return out instanceof Promise ? out.then(copy) : copy(out);
	});
}
