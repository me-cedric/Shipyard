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
import {
	codeBranchCreate,
	codeBranchDelete,
	codeBranches,
	codeBranchSwitch,
	codeCommit,
	codeCommitDetail,
	codeCommitDiff,
	codeDiff,
	codeDiscard,
	codeLog,
	codePull,
	codeResolve,
	codeStage,
	codeStashApply,
	codeStashDrop,
	codeStashList,
	codeStashPush,
	codeStatus,
	codeUnstage,
	type MockCode,
	seedCode,
} from "./mock-code";
import { parseRef } from "./mock-refs";

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
};

type State = {
	prefs: Prefs_Serialize;
	projects: ProjectEntry_Serialize[];
	files: Record<string, ProjectFile_Serialize>;
	fixed: string[];
	/** The folder that the next picker returns. Without it the picker walks `FOLDERS`. */
	nextFolder?: string;
	cursor: number;
	confirm: boolean;
	connections: Connection_Serialize[];
	/** The keychain. No command returns a value from it: the tests read it to prove a write. */
	secrets: Record<string, string>;
	/** The working copy of the active project. Seeded on first use. */
	code?: MockCode;
	agents: MockAgents;
	/** The system notifications that the app asked for. */
	os: { title: string; body: string }[];
	/** The labels of the last native menu. */
	menu: Record<string, string>;
};

const RELEASE_URL = "https://api.github.com/repos/me-cedric/Shipyard/releases/latest";

const FOLDERS = ["/mock/alpha", "/mock/beta", "/mock/gamma"];

const fresh = (): State => ({
	prefs: {
		theme: "system",
		density: "default",
		contrast: "default",
		role: "none",
		sidebarOpen: true,
		lang: null,
		releaseUrl: RELEASE_URL,
	},
	projects: [],
	files: {},
	fixed: [],
	cursor: 0,
	confirm: true,
	connections: [],
	secrets: {},
	agents: seedAgents(),
	os: [],
	menu: {},
});

let state = fresh();

/** Resets the mock state. Tests call it before each case. */
export function resetMock(patch: Partial<State> = {}) {
	state = { ...fresh(), ...patch };
}

export const mockState = () => state;

export function pickMock(): string | null {
	const f = state.nextFolder ?? FOLDERS[state.cursor++ % FOLDERS.length] ?? null;
	state.nextFolder = undefined;
	return f;
}

export const confirmMock = () => state.confirm;

// Demo refs. The app indexes the repository files, and the mock holds a few entities.
const ENTITIES: Record<string, { title: string; status: string | null }> = {
	"adr:0004": { title: "Polling sync with local mirror", status: "accepted" },
	"spec:auth": { title: "Spec: auth", status: "Draft" },
	"spec:auth#REQ-003": { title: "Login", status: null },
	"spec:billing": { title: "Spec: billing", status: "Draft" },
	"change:add-auth": { title: "add-auth", status: null },
	"q:Q-012": { title: "Which tracker first?", status: "open" },
};
const CITES: [source: string, target: string][] = [
	["spec:auth", "adr:0004"],
	["spec:billing", "adr:0004"],
	["change:add-auth", "adr:0004"],
	["adr:0004", "q:Q-012"],
	["spec:auth", "conn:linear"],
];
const COVERED = ["adr", "q", "change", "spec", "wf", "doc"];

const active = () => state.projects.find((p) => p.active);

/** The working copy of the active project. Without a project the Code commands fail as the real ones do. */
function code(): MockCode {
	if (!active()) throw "no active project";
	state.code ??= seedCode();
	return state.code;
}

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
	const hit = active() ? ENTITIES[text] : undefined;
	if (hit)
		return { ...base, state: "resolved", title: hit.title, status: hit.status, location: null };
	return { ...base, state: active() && COVERED.includes(parsed.kind) ? "broken" : "unresolved" };
}

function backlinks(text: string): BacklinkGroup_Serialize[] {
	if (!active()) return [];
	const groups = new Map<string, { source: string; title: string | null }[]>();
	for (const [source, target] of CITES) {
		if (target !== text) continue;
		const kind = source.slice(0, source.indexOf(":"));
		groups.set(kind, [
			...(groups.get(kind) ?? []),
			{ source, title: ENTITIES[source]?.title ?? null },
		]);
	}
	return [...groups]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([kind, items]) => ({ kind, count: items.length, items }));
}

function search(query: string, limit: number): SearchHit[] {
	const q = query.trim().toLowerCase();
	if (!q || !active()) return [];
	const hits = Object.entries(ENTITIES).flatMap(([ref, e]) => {
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
	projectsOpen: (path, init) => {
		if (path === "/mock/plain") return outcome("not-repository", path);
		if (path === "/mock/bare" && !init) return outcome("needs-project-file", path);
		const name = path.split("/").pop() ?? "project";
		return activate(path, name, deriveKey(name));
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
			paths: {
				decisions: "docs/decisions",
				questions: "docs/delivery/questions",
				specs: "docs/openspec",
			},
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
		};
		return null;
	},
	healthRun: () => (active() ? FINDINGS.filter((f) => !state.fixed.includes(f.id)) : []),
	healthFix: (id, confirm) => {
		const f = FINDINGS.find((x) => x.id === id);
		if (f?.fix.kind !== "write") throw "this fix writes no file";
		if (confirm) state.fixed.push(id);
		return { path: f.fix.path, content: f.fix.content, written: confirm };
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
		};
	},
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
	codeStashDrop: (index) => {
		codeStashDrop(code(), index);
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
		code();
		return null;
	},
	codeWatchTick: () => {
		const n = code().notice;
		return n ? [n] : [];
	},
	codeWatchNotice: () => (active() ? (code().notice ?? null) : null),
	projectImport: (source) => ({
		copied: [],
		skipped: [{ path: source, reason: "not-implemented" }],
		conflicts: [],
	}),
};

const camel = (s: string) => s.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

export function installMockIpc() {
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
