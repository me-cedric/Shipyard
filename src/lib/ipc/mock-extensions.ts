// The mock of the Extensions commands. It mirrors `crates/shipyard-app/src/extensions/` and the
// rules of `crates/shipyard-core/src/extensions.rs`: a compass entry is absent, stale or current,
// a write keeps each file that exists, a plugin writes only the accepted items, and a deploy to a
// child makes a branch and a commit and never pushes.
import type {
	Child,
	ChildResult_Serialize,
	Compass_Serialize,
	CompassApplied,
	CompassEntry_Serialize,
	Component,
	EntryKind,
	PluginApplied,
	PluginItem,
	PluginReview_Serialize,
	RoleSkillRow_Serialize,
	SyncState,
	WriteReport,
} from "./bindings";

const VERSION = "1.0.2";
const OLD = "1.0.1";
export const PLUGIN_PATH = "/mock/plugins/team-kit.zip";
const GUIDANCE = "agents/openspec-guidance";

type MockChild = { id: string; name: string; url: string; cloned: boolean; has: string[] };

export type MockExtensions = {
	pinned: boolean;
	entries: CompassEntry_Serialize[];
	/** The preview text of an entry, by key. */
	texts: Record<string, string>;
	rows: RoleSkillRow_Serialize[];
	catalog: Component[];
	/** The files that the project holds. A write keeps each of them. */
	files: string[];
	/** The version of the applied plugin, or `null`. */
	plugin: string | null;
	children: MockChild[];
};

const key = (e: CompassEntry_Serialize) => `${e.kind}:${e.id}`;

function entry(
	kind: EntryKind,
	id: string,
	state: SyncState,
	more: Partial<CompassEntry_Serialize> = {},
): CompassEntry_Serialize {
	return {
		kind,
		id,
		title: id,
		risk: null,
		writes: false,
		suits: false,
		state,
		pinned: state === "absent" ? null : state === "stale" ? OLD : VERSION,
		expected: VERSION,
		...more,
	};
}

export function seedExtensions(): MockExtensions {
	const entries = [
		entry("skill", "review", "current", { risk: "medium" }),
		entry("skill", "spec-flow", "stale", { risk: "low", writes: true }),
		entry("skill", "ui-conformance", "absent", { risk: "low", writes: true, suits: true }),
		entry("skill", "vuln-triage", "absent", { risk: "high", writes: true }),
		entry("pack", "e2e", "current", { writes: true }),
		entry("pack", "security", "stale", { writes: true }),
		entry("pack", "renovate", "absent", { writes: true }),
		entry("guide", "delivery", "current"),
		entry("guide", "ui", "current"),
		entry("pattern", "small-steps", "current", { writes: true }),
		entry("contract", "contract", "current", { writes: true }),
	];
	const comp = (group: Component["group"], name: string, files: string[], state: SyncState) => ({
		id: `${group === "devops-security" ? "devops-security" : group}/${name}`,
		name,
		group,
		files,
		version: VERSION,
		state,
	});
	return {
		pinned: true,
		entries,
		texts: Object.fromEntries(
			entries.map((e) => [key(e), `# ${e.id}\n\nThe text of the ${e.kind} ${e.id}.\n`]),
		),
		rows: [
			{
				kind: "role",
				name: "worker",
				loaders: ["factory"],
				usedBy: ["feature", "bug"],
				path: ".shipyard/roles/worker.md",
			},
			{
				kind: "role",
				name: "reviewer",
				loaders: ["factory"],
				usedBy: ["review-only"],
				path: ".shipyard/roles/reviewer.md",
			},
			{ kind: "role", name: "planner", loaders: ["factory"], usedBy: [], path: null },
			{
				kind: "skill",
				name: "review",
				loaders: ["factory", "assistant"],
				usedBy: [],
				path: ".agents/skills/review/SKILL.md",
			},
		],
		catalog: [
			comp("devcontainers", "node", [".devcontainer/devcontainer.json"], "absent"),
			comp("agents", "openspec-guidance", ["AGENTS.md", "docs/openspec/specs/.gitkeep"], "absent"),
			comp("devops-security", "scan", [".github/workflows/scan.yml"], "current"),
		].map((c) => (c.id === "agents/openspec-guidance" ? { ...c, id: GUIDANCE } : c)),
		files: ["AGENTS.md", "README.md"],
		plugin: null,
		children: [
			{
				id: "api-gateway",
				name: "API gateway",
				url: "https://example.com/acme/api-gateway.git",
				cloned: true,
				has: ["skill:review", "pack:e2e", "contract:contract", "component:devops-security/scan"],
			},
		],
	};
}

// ---------------------------------------------------------------- compass

export function compassGet(m: MockExtensions): Compass_Serialize | null {
	if (!m.pinned) return null;
	return {
		tree: "docs/agent-compass",
		version: VERSION,
		pinned: OLD,
		stacks: ["react-web"],
		entries: m.entries,
	};
}

export function compassPreview(m: MockExtensions, kind: EntryKind, id: string): string {
	const text = m.texts[`${kind}:${id}`];
	if (text === undefined || id.includes("/") || id.includes("..")) throw `path not allowed: ${id}`;
	return text;
}

function paths(e: CompassEntry_Serialize): string[] {
	if (e.kind === "contract") return ["AGENTS.md", "CLAUDE.md"];
	if (e.kind === "skill") return [`.agents/skills/${e.id}/SKILL.md`];
	return [`.agents/${e.kind}s/${e.id}`];
}

/** Write what is new and keep what exists. The entries become current. */
function apply(m: MockExtensions, keys: string[]): CompassApplied {
	const report: WriteReport = { written: [], kept: [] };
	for (const k of keys) {
		const e = m.entries.find((x) => key(x) === k);
		if (!e) throw `unknown entry: ${k}`;
		for (const p of paths(e)) {
			if (m.files.includes(p)) report.kept.push(p);
			else {
				m.files.push(p);
				report.written.push(p);
			}
		}
		e.state = "current";
		e.pinned = VERSION;
	}
	return { report, version: VERSION };
}

export const compassApply = (m: MockExtensions, keys: string[]) => apply(m, keys);

export function compassUpgrade(m: MockExtensions, selection: string[] | null): CompassApplied {
	const keys = selection ?? m.entries.filter((e) => e.state === "stale").map(key);
	if (keys.some((k) => m.entries.find((e) => key(e) === k)?.state === "current"))
		throw "already current";
	return apply(m, keys);
}

export const rolesSkillsGet = (m: MockExtensions) => m.rows;

// ---------------------------------------------------------------- catalog

function plan(m: MockExtensions, id: string): WriteReport {
	const c = m.catalog.find((x) => x.id === id);
	if (!c) throw "unknown component";
	return {
		written: c.files.filter((f) => !m.files.includes(f)),
		kept: c.files.filter((f) => m.files.includes(f)),
	};
}

export const catalogPreview = plan;

export function catalogDeploy(m: MockExtensions, id: string): WriteReport {
	const report = plan(m, id);
	m.files.push(...report.written);
	const c = m.catalog.find((x) => x.id === id);
	if (c) c.state = "current";
	return report;
}

// ---------------------------------------------------------------- plugins

const PLUGIN_ITEMS = (m: MockExtensions): PluginItem[] => {
	const change = m.plugin ? "same" : "new";
	return [
		{
			id: "file:docs/team.md",
			kind: "file",
			label: "docs/team.md",
			exists: m.files.includes("docs/team.md"),
			change,
		},
		{
			id: "file:AGENTS.md",
			kind: "file",
			label: "AGENTS.md",
			exists: m.files.includes("AGENTS.md"),
			change,
		},
		{ id: "setting:team", kind: "setting", label: "team", exists: false, change },
		{ id: "mcp:docs", kind: "mcp", label: "docs", exists: false, change },
	];
};

function archive(path: string) {
	if (path.split("/").includes("..")) throw `path not allowed: ${path}`;
	if (path !== PLUGIN_PATH) throw "not a valid zip archive: invalid Zip archive";
}

/** Read the archive as data. Nothing is written. */
export function pluginReview(m: MockExtensions, path: string): PluginReview_Serialize {
	archive(path);
	return {
		name: "team-kit",
		version: "1.0.0",
		applied: m.plugin,
		items: PLUGIN_ITEMS(m),
		refused: ["mcp:shell: a local command"],
	};
}

export function pluginApply(m: MockExtensions, path: string, accepted: string[]): PluginApplied {
	archive(path);
	const items = PLUGIN_ITEMS(m);
	const bad = accepted.find((a) => !items.some((i) => i.id === a));
	if (bad) throw `unknown item: ${bad}`;
	const report: WriteReport = { written: [], kept: [] };
	for (const i of items.filter((x) => x.kind === "file" && accepted.includes(x.id))) {
		if (m.files.includes(i.label)) report.kept.push(i.label);
		else {
			m.files.push(i.label);
			report.written.push(i.label);
		}
	}
	m.plugin = "1.0.0";
	return {
		report,
		mcpAdded: accepted.filter((a) => a.startsWith("mcp:")).map((a) => a.slice(4)),
		mcpFailed: [],
	};
}

// ---------------------------------------------------------------- child projects

/** The keys that a child may take: the current parent entries (no guide) and the deployed components. */
function parentKeys(m: MockExtensions): string[] {
	return [
		...m.entries.filter((e) => e.state === "current" && e.kind !== "guide").map(key),
		...m.catalog.filter((c) => c.state === "current").map((c) => `component:${c.id}`),
	];
}

function view(m: MockExtensions, c: MockChild): Child {
	const all = parentKeys(m);
	const has = c.cloned ? c.has : [];
	return {
		id: c.id,
		name: c.name,
		url: c.url,
		cloned: c.cloned,
		held: all.filter((k) => has.includes(k)).length,
		total: all.length,
		proposed: all.filter((k) => !has.includes(k)),
	};
}

const find = (m: MockExtensions, id: string) => {
	const c = m.children.find((x) => x.id === id);
	if (!c) throw `unknown child project: ${id}`;
	return c;
};

export const childList = (m: MockExtensions) => m.children.map((c) => view(m, c));

export function childAdd(m: MockExtensions, name: string, url: string): Child {
	const id = name
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!id || !url.trim() || url.startsWith("-"))
		throw "a child project needs a name and an address";
	if (m.children.some((c) => c.id === id)) throw `${id} exists`;
	const c = { id, name: name.trim(), url: url.trim(), cloned: false, has: [] };
	m.children.push(c);
	return view(m, c);
}

export function childRemove(m: MockExtensions, id: string): null {
	m.children = m.children.filter((c) => c.id !== id);
	return null;
}

export function childClone(m: MockExtensions, id: string): Child {
	const c = find(m, id);
	c.cloned = true;
	return view(m, c);
}

/** One branch and one commit in each chosen clone. A child that fails holds its error. */
export function childDeploy(
	m: MockExtensions,
	ids: string[],
	keys: string[],
): ChildResult_Serialize[] {
	return ids.map((id) => {
		const none = { id, branch: null, commit: null, report: { written: [], kept: [] } };
		try {
			const c = find(m, id);
			if (!c.cloned) throw "clone the child project first";
			const v = view(m, c);
			const bad = keys.find((k) => !v.proposed.includes(k));
			if (bad) throw `not proposed: ${bad}`;
			c.has.push(...keys);
			const written = keys.flatMap((k) =>
				k.startsWith("component:")
					? (m.catalog.find((x) => `component:${x.id}` === k)?.files ?? [])
					: [`.agents/${k.replace(":", "/")}`],
			);
			return {
				id,
				branch: "shipyard/extensions-1",
				commit: "3f2a9c1d5e7b8a60b1c2d3e4f5a6b7c8d9e0f1a2",
				report: { written, kept: [] },
				error: null,
			};
		} catch (e) {
			return { ...none, error: String(e) };
		}
	});
}
