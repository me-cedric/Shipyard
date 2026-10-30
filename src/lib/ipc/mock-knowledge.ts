// The mock of the Knowledge commands. It mirrors `crates/shipyard-app/src/knowledge.rs` and the
// rules of `crates/shipyard-core/src/knowledge.rs`: the graph comes from the entities and the
// citations of the other mocks, the pages are repository files and a dashboard of a newer version
// stays read-only.
import { parse, stringify } from "yaml";
import type {
	CodeGraph_Serialize,
	Dashboard_Deserialize,
	Dashboard_Serialize,
	DashEntry,
	DashView_Serialize,
	Deck,
	DeckTheme_Deserialize,
	DocList,
	ExplainContext_Serialize,
	ExportText,
	KGraph_Serialize,
	Learn,
	PageEntry,
	Resolved_Serialize,
	SheetIn,
	Text,
	ThemeView_Serialize,
	TileData_Serialize,
	ViewImage,
	Written_Serialize,
} from "./bindings";
import {
	type Entity,
	type Files,
	fileCitations,
	putText,
	readText,
	resolvePath,
	slug as slugOf,
} from "./mock-design";

const YAML = { indentSeq: false };
const VERSION = 1;
const FOLDERS = { handbook: "docs/handbook", documents: "docs/documents", slides: "docs/slides" };
const DASH = "docs/dashboards";
const THEME = `${FOLDERS.slides}/theme.yaml`;
const TILES = ["work", "runs", "questions", "specs", "estimates", "quality", "impact"];
const TILE_ROWS = 50;

export type MockKnowledge = {
	files: Files;
	/** The time of the last change of an entity, by ref. `0` or absent means unknown. */
	changed: Record<string, number>;
	/** The codebase-memory server is active. */
	server: boolean;
	/** The code index exists. The Index action sets it. */
	indexed: boolean;
	/** The files that the export commands "wrote": kind and path. */
	exported: { kind: "dossier" | "functional" | "sheet"; path: string }[];
};

/** What the Knowledge commands read from the other mocks. */
export type Env = {
	entities: Entity[];
	citations: [string, string][];
	resolve: (ref: string) => Resolved_Serialize | null;
	/** The ref and the text of each capability spec, for the glossary. */
	specs: [string, string][];
	/** The statuses behind a tile. `null` when the source is not available. */
	tiles: Record<string, string[] | null>;
};

const file = (text: string): Files[string] => ({ text, stamp: "1" });

// ---------------------------------------------------------------- seed

const DECK = `# Kickoff\n\nShipyard, one place for the work\n\n---\n\n## Goals\n\n- One graph of refs\n- One factory\n- One handbook\n\n---\n\n## Decisions\n\n- adr:0001 Use Tauri\n- adr:0004 Polling sync\n\n---\n\n## Plan\n\n1. Specs first\n2. Waves\n\n---\n\n## Questions\n\nAsk now.\n`;

const DASHBOARD: Dashboard_Serialize = {
	version: VERSION,
	title: "Team",
	tiles: [
		{ id: "work", kind: "work", x: 0, y: 0, w: 4, h: 3 },
		{ id: "runs", kind: "runs", x: 4, y: 0, w: 4, h: 3 },
		{ id: "questions", kind: "questions", x: 8, y: 0, w: 4, h: 3 },
		{ id: "quality", kind: "quality", x: 0, y: 3, w: 6, h: 3 },
	],
};

const THEME_DEFAULT = {
	version: VERSION,
	background: "#ffffff",
	text: "#1a1a1a",
	accent: "#2563eb",
	logo: null,
	font: "system-ui",
};

export function seedKnowledge(): MockKnowledge {
	const h = FOLDERS.handbook;
	return {
		files: {
			[`${h}/getting-started.md`]: file(
				"# Getting started\n\nRead adr:0001 first, then the architecture overview. The first tracker is q:Q-012.\n",
			),
			[`${h}/architecture/overview.md`]: file(
				"# Architecture overview\n\nThe model is model:system. The domain stays in Rust (adr:0002) and sync polls (adr:0004).\n",
			),
			[`${h}/operations/release.md`]: file(
				"# Release\n\n1. Run the checks\n2. Tag the release\n\nSee spec:auth.\n",
			),
			[`${FOLDERS.documents}/client-brief.md`]: file(
				"# Client brief\n\nThe scope follows spec:billing and adr:0004.\n",
			),
			[`${FOLDERS.slides}/kickoff.md`]: file(DECK),
			[THEME]: file(stringify(THEME_DEFAULT, YAML)),
			[`${DASH}/team.yaml`]: file(stringify(DASHBOARD, YAML)),
		},
		// The spec changed after the ADR that it cites, so the graph marks it stale.
		changed: { "spec:auth": 100, "adr:0004": 200, "adr:0001": 50 },
		server: true,
		indexed: true,
		exported: [],
	};
}

// ---------------------------------------------------------------- pages

const mdFiles = (k: MockKnowledge, dir: string): PageEntry[] =>
	Object.entries(k.files)
		.filter(([p]) => p.startsWith(`${dir}/`) && p.endsWith(".md"))
		.map(([path, f]) => ({
			path,
			title:
				f.text
					.split("\n")
					.find((l) => l.startsWith("# "))
					?.slice(2)
					.trim() || (path.split("/").pop() ?? path).replace(/\.md$/, ""),
		}))
		.sort((a, b) => a.path.localeCompare(b.path));

export const docListGet = (k: MockKnowledge): DocList => ({
	handbook: mdFiles(k, FOLDERS.handbook),
	documents: mdFiles(k, FOLDERS.documents),
	slides: mdFiles(k, FOLDERS.slides),
});

const FOLDER_LIST = Object.values(FOLDERS);

export function docReadOne(k: MockKnowledge, path: string): Text {
	resolvePath(path, FOLDER_LIST);
	return readText(k.files, path);
}

export function docWriteOne(
	k: MockKnowledge,
	path: string,
	text: string,
	stamp: string | null,
	create: boolean,
): Written_Serialize {
	if (!path.endsWith(".md")) throw "a page is a .md file";
	resolvePath(path, FOLDER_LIST);
	return putText(k.files, path, text, stamp, create);
}

/** The `doc:` entities and citations of the pages. */
export function knowledgeEntities(k: MockKnowledge): Entity[] {
	return [FOLDERS.handbook, FOLDERS.documents, FOLDERS.slides].flatMap((d) =>
		mdFiles(k, d).map((p) => ({ ref: `doc:${p.path}`, title: p.title, status: null })),
	);
}

export const knowledgeCitations = (k: MockKnowledge): [string, string][] =>
	fileCitations(k.files, (p) => (p.endsWith(".md") ? `doc:${p}` : null));

// ---------------------------------------------------------------- graph

/** `marks` of `shipyard_core::knowledge`. */
function marks(env: Env, changed: Record<string, number>) {
	const cited = new Set(env.citations.filter(([s, t]) => s !== t).map(([, t]) => t));
	const stale = new Set(
		env.citations
			.filter(([s, t]) => (changed[s] ?? 0) > 0 && (changed[t] ?? 0) > (changed[s] ?? 0))
			.map(([s]) => s),
	);
	return (ref: string) => ({ orphan: !cited.has(ref), stale: stale.has(ref) });
}

const kindOf = (ref: string) => ref.slice(0, ref.indexOf(":"));

export function graphGet(k: MockKnowledge, env: Env): KGraph_Serialize {
	const seen = new Set<string>();
	const entities = env.entities.filter((e) => !seen.has(e.ref) && !!seen.add(e.ref));
	const mark = marks(env, k.changed);
	const edges = [...new Set(env.citations.map(([s, t]) => `${s}\n${t}`))]
		.map((e) => e.split("\n") as [string, string])
		.filter(([s, t]) => s !== t && seen.has(s) && seen.has(t))
		.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
		.map(([source, target]) => ({ source, target }));
	return {
		nodes: entities
			.map((e) => ({
				ref: e.ref,
				kind: kindOf(e.ref),
				title: e.title,
				status: e.status,
				location: null,
				...mark(e.ref),
			}))
			.sort((a, b) => a.ref.localeCompare(b.ref)),
		edges,
	};
}

const SYMBOLS: [file: string, name: string][] = [
	["src/lib/ipc/mock.ts", "installMockIpc"],
	["src/lib/ipc/mock.ts", "resolve"],
	["src/features/home/home.tsx", "Home"],
	["src/features/home/my-work.tsx", "MyWork"],
	["src/lib/query.ts", "useCommand"],
];
const CALLS: [number, number][] = [
	[2, 3],
	[3, 4],
	[2, 4],
	[0, 1],
];

export function graphCode(k: MockKnowledge): CodeGraph_Serialize {
	if (!k.server) return { state: "off", nodes: [], edges: [] };
	if (!k.indexed) return { state: "unindexed", nodes: [], edges: [] };
	const id = (i: number) => `${SYMBOLS[i]?.[0]}::${SYMBOLS[i]?.[1]}`;
	const files = [...new Set(SYMBOLS.map(([f]) => f))];
	return {
		state: "ready",
		nodes: [
			...files.map((f) => ({ ref: f, kind: "file", title: f, status: null, location: f })),
			...SYMBOLS.map(([f, n], i) => ({
				ref: id(i),
				kind: "symbol",
				title: n,
				status: null,
				location: f,
			})),
		],
		edges: [
			...SYMBOLS.map(([f], i) => ({ source: f, target: id(i) })),
			...CALLS.map(([a, b]) => ({ source: id(a), target: id(b) })),
		],
	};
}

export function graphCodeIndex(k: MockKnowledge): null {
	if (!k.server) throw "the codebase-memory server is not active";
	k.indexed = true;
	return null;
}

export function explainContext(env: Env, entity: string): ExplainContext_Serialize {
	const ref = entity.trim().replace(/^@/, "");
	const known = env.resolve(ref);
	const found = known?.state === "resolved";
	const near = found
		? [
				...new Set(env.citations.flatMap(([s, t]) => (s === ref ? [t] : t === ref ? [s] : []))),
			].sort()
		: [];
	const refs = [known, ...near.map((r) => env.resolve(r))].filter(
		(r): r is Resolved_Serialize => r != null,
	);
	return { entity: ref, found, refs };
}

// ---------------------------------------------------------------- slides

export function themeGet(k: MockKnowledge): ThemeView_Serialize {
	const f = k.files[THEME];
	if (!f) return { value: { ...THEME_DEFAULT }, readOnly: false, stamp: null };
	const raw = parse(f.text) ?? {};
	const readOnly = Number(raw.version ?? 1) > VERSION;
	return { value: { ...THEME_DEFAULT, ...raw }, readOnly, stamp: f.stamp };
}

export function themeSet(
	k: MockKnowledge,
	theme: DeckTheme_Deserialize,
	stamp: string | null,
): Written_Serialize {
	if (themeGet(k).readOnly) throw "the file was written by a newer version";
	for (const c of [theme.background, theme.text, theme.accent])
		if (c !== undefined && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) throw `not a colour: ${c}`;
	const text = stringify({ ...THEME_DEFAULT, ...theme, version: VERSION }, YAML);
	return putText(k.files, THEME, text, stamp, !k.files[THEME]);
}

/** `parse_deck`: a line of `---` outside a code fence starts a slide. */
export function slideParse(text: string): Deck {
	const slides: string[] = [""];
	let fenced = false;
	for (const line of text.split("\n")) {
		if (line.trimStart().startsWith("```")) fenced = !fenced;
		if (!fenced && line.trimEnd() === "---") slides.push("");
		else slides[slides.length - 1] += `${line}\n`;
	}
	const kept = slides.map((s) => s.trim()).filter(Boolean);
	const title =
		kept
			.flatMap((s) => s.split("\n"))
			.find((l) => l.startsWith("# "))
			?.slice(2)
			.trim() || "deck";
	return { title, slides: kept };
}

// ---------------------------------------------------------------- dashboards

const dashPath = (name: string) => {
	if (!name || slugOf(name) !== name) throw `not a dashboard name: ${name}`;
	return `${DASH}/${name}.yaml`;
};

const loadDash = (text: string) => {
	const raw = parse(text) ?? {};
	return {
		value: { version: VERSION, title: "", tiles: [], ...raw } as Dashboard_Serialize,
		readOnly: Number(raw.version ?? 1) > VERSION,
	};
};

export function dashboardList(k: MockKnowledge): DashEntry[] {
	return Object.entries(k.files)
		.filter(([p]) => p.startsWith(`${DASH}/`) && p.endsWith(".yaml"))
		.map(([p, f]) => {
			const slug = p.slice(DASH.length + 1, -".yaml".length);
			const l = loadDash(f.text);
			return { slug, title: l.value.title || slug, readOnly: l.readOnly };
		})
		.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function dashboardGet(k: MockKnowledge, name: string): DashView_Serialize {
	const t = readText(k.files, dashPath(name));
	return { ...loadDash(t.text), stamp: t.stamp };
}

export function dashboardSave(
	k: MockKnowledge,
	name: string,
	dashboard: Dashboard_Deserialize,
	stamp: string | null,
): Written_Serialize {
	const path = dashPath(name);
	const old = k.files[path];
	if (old && loadDash(old.text).readOnly) throw "the file was written by a newer version";
	const tiles = dashboard.tiles ?? [];
	const ids = new Set<string>();
	for (const t of tiles) {
		if (!TILES.includes(t.kind)) throw `unknown tile: ${t.kind}`;
		if (ids.has(t.id)) throw `tile id used twice: ${t.id}`;
		ids.add(t.id);
	}
	const text = stringify({ version: VERSION, title: dashboard.title ?? "", tiles }, YAML);
	return putText(k.files, path, text, stamp, !old);
}

export function dashboardTile(env: Env, kind: string): TileData_Serialize {
	if (!TILES.includes(kind)) throw `unknown tile: ${kind}`;
	const statuses = env.tiles[kind];
	if (!statuses) return { kind, columns: [], rows: [], cut: false, off: kind };
	const counts = new Map<string, number>();
	for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
	const rows = [...counts]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([l, n]) => [l, String(n)]);
	return {
		kind,
		columns: [kind === "estimates" ? "sheet" : "status", "count"],
		rows: rows.slice(0, TILE_ROWS),
		cut: rows.length > TILE_ROWS,
		off: null,
	};
}

// ---------------------------------------------------------------- learn

const RANK: Record<string, number> = { model: 0, adr: 1, spec: 2 };

/** `path_order` and `glossary` of `shipyard_core::knowledge`. */
export function learnGet(env: Env): Learn {
	const step = (e: Entity) => ({ ref: e.ref, kind: kindOf(e.ref), title: e.title });
	const path = env.entities
		.filter((e) => kindOf(e.ref) in RANK && !e.ref.includes("#"))
		.map(step)
		.sort(
			(a, b) =>
				(RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9) ||
				a.ref.slice(a.kind.length + 1).localeCompare(b.ref.slice(b.kind.length + 1)),
		)
		.filter((s, i, all) => all.findIndex((o) => o.ref === s.ref) === i);
	const seen = new Set<string>();
	const glossary: Learn["glossary"] = [];
	for (const [spec, text] of env.specs) {
		let inside = false;
		for (const line of text.split("\n")) {
			if (line.startsWith("#")) {
				inside = line.trimEnd() === "### Glossary";
				continue;
			}
			const item = line.trim().replace(/^[-*]\s*/, "");
			const at = item.indexOf(":");
			if (!inside || at < 0) continue;
			const term = item.slice(0, at).trim().replace(/`/g, "");
			const meaning = item.slice(at + 1).trim();
			if (term && meaning && !seen.has(term.toLowerCase())) {
				seen.add(term.toLowerCase());
				glossary.push({ term, meaning, spec });
			}
		}
	}
	glossary.sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()));
	return { path, glossary };
}

// ---------------------------------------------------------------- exports

export function checkExport(path: string, ext: string) {
	if (!path.startsWith("/") || path.endsWith("/")) throw "the path is not an absolute file path";
	if (!path.toLowerCase().endsWith(`.${ext}`)) throw `the file is not a .${ext} file`;
}

export const checkTitles = (text: ExportText, n: number) => {
	if (text.sections.length !== n) throw `expected ${n} section titles`;
};

export function exportDossier(
	k: MockKnowledge,
	text: ExportText,
	_views: ViewImage[],
	path: string,
): null {
	checkTitles(text, 5);
	checkExport(path, "docx");
	k.exported.push({ kind: "dossier", path });
	return null;
}

export function exportFunctional(k: MockKnowledge, text: ExportText, path: string): null {
	checkTitles(text, 4);
	checkExport(path, "docx");
	k.exported.push({ kind: "functional", path });
	return null;
}

export function exportSheet(
	k: MockKnowledge,
	_text: ExportText,
	_sheets: SheetIn[],
	path: string,
): null {
	checkExport(path, "xlsx");
	k.exported.push({ kind: "sheet", path });
	return null;
}
