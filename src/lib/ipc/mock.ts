import { mockIPC } from "@tauri-apps/api/mocks";
import type {
	BacklinkGroup_Serialize,
	commands,
	Finding_Serialize,
	Overrides_Serialize,
	Prefs_Serialize,
	ProjectEntry_Serialize,
	ProjectFile_Serialize,
	ProjectOutcome_Serialize,
	Resolved_Serialize,
	SearchHit,
} from "./bindings";
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
};

const FOLDERS = ["/mock/alpha", "/mock/beta", "/mock/gamma"];

const fresh = (): State => ({
	prefs: {
		theme: "system",
		density: "default",
		contrast: "default",
		role: "none",
		sidebarOpen: true,
		lang: null,
	},
	projects: [],
	files: {},
	fixed: [],
	cursor: 0,
	confirm: true,
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
];
const COVERED = ["adr", "q", "change", "spec", "wf", "doc"];

const active = () => state.projects.find((p) => p.active);

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

// A missing key fails `tsc`: each generated command needs a handler.
const handlers: Handlers = {
	appInfo: () => ({ name: "Shipyard", version: "0.1.0", os: "browser" }),
	prefsGet: () => state.prefs,
	prefsSet: (patch) => {
		for (const [k, v] of Object.entries(patch))
			if (v != null) Object.assign(state.prefs, { [k]: v });
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
		return out === undefined ? out : structuredClone(out);
	});
}
