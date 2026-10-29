// The mock of the Design commands. It mirrors `crates/shipyard-app/src/design.rs`: a file map holds
// the repository files, a write stamps its file, and the lists come from the files.
import { parse, stringify } from "yaml";
import type {
	Adr,
	Artifact_Serialize,
	Decision,
	DesignList_Serialize,
	FlowRow_Deserialize,
	FlowRow_Serialize,
	Screen_Serialize,
	Text,
	TryRequest_Deserialize,
	TryResponse,
	Written_Serialize,
} from "./bindings";
import { isRef } from "./mock-refs";

// The same layout as `serde_yaml`.
const YAML = { indentSeq: false };

export type Files = Record<string, { text: string; stamp: string }>;

export type MockDesign = {
	files: Files;
	/** The targets that `design_open` handed to the OS. */
	opened: string[];
};

export type Entity = { ref: string; title: string; status: string | null };

const DIR = {
	diagram: "docs/diagrams",
	model: "docs/models",
	api: "docs/api",
	data: "docs/data-models",
	flow: "docs/flows",
	design: "docs/designs",
	decisions: "docs/decisions",
};
const SCREENS = `${DIR.design}/screens.json`;
const DOC = `${DIR.design}/design.md`;
const DESIGN_FOLDERS = Object.values(DIR);

// ---------------------------------------------------------------- files

export const needClick = (click: boolean) => {
	if (!click) throw "this change needs the click of a person";
};

export const isUnder = (rel: string, folder: string) => rel.startsWith(`${folder}/`);

/** The path guard of `shipyard_store::design::resolve_in`. */
export function resolvePath(rel: string, folders: string[]) {
	const plain =
		rel && !rel.includes("\\") && rel.split("/").every((s) => s && s !== "." && s !== "..");
	if (!plain || !folders.some((f) => isUnder(rel, f))) throw `path not allowed: ${rel}`;
}

export function readText(files: Files, rel: string): Text {
	const f = files[rel];
	if (!f) throw `${rel}: no such file`;
	return { text: f.text, stamp: f.stamp };
}

/** Write in full or not at all. With a stamp, an old one gives the conflict. Without, it replaces. */
export function putText(
	files: Files,
	rel: string,
	text: string,
	stamp: string | null,
	create: boolean,
): Written_Serialize {
	const old = files[rel];
	if (create && old) throw `${rel} exists`;
	if (!create && old && stamp != null && stamp !== old.stamp)
		return { conflict: true, stamp: old.stamp };
	const next = String(Number(old?.stamp ?? 0) + 1);
	files[rel] = { text, stamp: next };
	return { conflict: false, stamp: next };
}

const file = (text: string): Files[string] => ({ text, stamp: "1" });

/** The refs in a text, as `refs::detect` finds them. */
export function scanRefs(text: string): string[] {
	const found = new Set<string>();
	for (const m of text.matchAll(/\b[a-z]+:[A-Za-z0-9][\w#./:-]*/g)) {
		const ref = m[0].replace(/[.,:;]+$/, "");
		if (isRef(ref)) found.add(ref);
	}
	return [...found];
}

/** `[source, target]` for each ref that a file cites. `sourceOf` gives the ref of a file. */
export function fileCitations(
	files: Files,
	sourceOf: (path: string) => string | null,
): [string, string][] {
	return Object.entries(files).flatMap(([path, f]) => {
		const source = sourceOf(path);
		return source
			? scanRefs(f.text)
					.filter((t) => t !== source)
					.map((t): [string, string] => [source, t])
			: [];
	});
}

export const slug = (stem: string) =>
	stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

// ---------------------------------------------------------------- seed

const ADR = (status: string, date: string, title: string, comment?: string) =>
	`---\nstatus: ${status}\ndate: ${date}\ndecision-makers: [ada]\n${comment ? `comment: ${JSON.stringify(comment)}\n` : ""}---\n# ${title}\n## Context and problem statement\n\n${title}.\n\n## Decision outcome\n\nSee the design doc.\n`;

const CONTRACT = `openapi: 3.0.3
info:
  title: Orders API
  version: 1.2.0
servers:
  - url: https://{env}.example.com/v1
    variables:
      env:
        default: api
tags:
  - name: orders
  - name: customers
paths:
  /orders:
    get:
      tags: [orders]
      summary: List the orders
      responses:
        "200":
          description: The orders
          content:
            application/json:
              example: { items: [{ id: o-1, total: 42.5, status: paid }] }
    post:
      tags: [orders]
      summary: Create an order
      responses:
        "201":
          description: The new order
          content:
            application/json:
              example: { id: o-2, status: new }
  /orders/{id}:
    get:
      tags: [orders]
      summary: Read one order
      responses:
        "200":
          description: The order
          content:
            application/json:
              example: { id: o-1, total: 42.5, status: paid }
        "404":
          description: No such order
  /customers/{id}:
    get:
      tags: [customers]
      summary: Read one customer
      responses:
        "200":
          description: The customer
          content:
            application/json:
              example: { id: c-1, name: Ada Lovelace }
`;

const DBML = `Table customers {
  id integer [pk]
  name varchar
}

Table orders {
  id integer [pk]
  customer_id integer
  total decimal
}

Table order_lines {
  id integer [pk]
  order_id integer
  sku varchar
}

Ref: orders.customer_id > customers.id
Ref: order_lines.order_id > orders.id
`;

type FlowTuple = [string, string, string, string, string, "allow" | "deny", string?];
const FLOW_ROWS: FlowTuple[] = [
	["10.10.0.0/24", "10.20.0.10/32", "VLAN 10", "tcp", "443", "allow", "Web portal"],
	["10.10.0.0/24", "10.20.0.11/32", "VLAN 10", "tcp", "8443", "allow", "Admin portal"],
	["10.10.0.0/24", "10.20.0.20/32", "VLAN 10", "tcp", "5432", "deny", "No direct database"],
	["10.10.0.0/24", "10.20.0.53/32", "VLAN 10", "udp", "53", "allow", "DNS"],
	["10.10.0.0/24", "10.20.0.123/32", "VLAN 10", "udp", "123", "allow", "NTP"],
	["10.10.0.0/24", "10.20.0.25/32", "VLAN 10", "tcp", "25", "deny", "No mail relay"],
	["10.10.0.0/24", "10.20.0.0/24", "VLAN 10", "icmp", "", "allow", "Ping"],
	["10.10.0.0/24", "10.20.0.30/32", "VLAN 10", "tcp", "22", "deny", "No SSH"],
	["10.10.0.0/24", "10.20.0.40/32", "VLAN 10", "tcp", "9000", "allow", "Metrics"],
	["10.10.0.0/24", "10.20.0.50/32", "VLAN 10", "tcp", "389", "deny", "No LDAP"],
	["10.20.0.10/32", "10.20.0.20/32", "VLAN 20", "tcp", "5432", "allow", "Web to database"],
	["10.20.0.11/32", "10.20.0.20/32", "VLAN 20", "tcp", "5432", "allow", "Admin to database"],
	["10.20.0.0/24", "10.20.0.53/32", "VLAN 20", "udp", "53", "allow", "DNS"],
	["10.20.0.0/24", "10.20.0.123/32", "VLAN 20", "udp", "123", "allow", "NTP"],
	["10.20.0.20/32", "10.10.0.0/24", "VLAN 20", "tcp", "", "deny", "No call back to users"],
	["10.20.0.30/32", "10.20.0.0/24", "VLAN 20", "tcp", "22", "allow", "Bastion"],
	["10.20.0.40/32", "10.20.0.0/24", "VLAN 20", "tcp", "9100", "allow", "Scrape"],
	["10.20.0.0/24", "10.20.0.25/32", "VLAN 20", "tcp", "25", "allow", "Mail relay"],
	["10.20.0.0/24", "10.10.0.0/24", "VLAN 20", "icmp", "", "deny", "No ping to users"],
	["10.20.0.50/32", "10.20.0.0/24", "VLAN 20", "tcp", "636", "allow", "LDAPS"],
];

const flowRow = (r: FlowTuple, i: number): FlowRow_Serialize => ({
	id: i + 1,
	source: r[0],
	destination: r[1],
	network: r[2],
	protocol: r[3],
	...(r[4] ? { port: r[4] } : {}),
	action: r[5],
	...(r[6] ? { note: r[6] } : {}),
});

const DIAGRAMS: Record<string, string> = {
	"context.excalidraw": JSON.stringify({
		type: "excalidraw",
		version: 2,
		elements: [
			{ id: "a", type: "rectangle", x: 40, y: 40, width: 160, height: 70 },
			{ id: "b", type: "rectangle", x: 320, y: 40, width: 160, height: 70 },
			{ id: "c", type: "arrow", x: 200, y: 75, width: 120, height: 0 },
		],
		appState: {},
	}),
	"sync-flow.mmd":
		"flowchart LR\n  Tracker --> Mirror\n  Mirror --> Work\n  Work -->|apply| Tracker\n",
	"order-process.bpmn": `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d1">
  <process id="order" isExecutable="false">
    <startEvent id="s" />
    <task id="t" name="Check the order" />
    <endEvent id="e" />
    <sequenceFlow id="f1" sourceRef="s" targetRef="t" />
    <sequenceFlow id="f2" sourceRef="t" targetRef="e" />
  </process>
</definitions>
`,
	"network.drawio.svg": `<svg xmlns="http://www.w3.org/2000/svg" content="&lt;mxfile&gt;&lt;diagram name=&quot;Network&quot;&gt;&lt;mxGraphModel&gt;&lt;root&gt;&lt;mxCell id=&quot;0&quot;/&gt;&lt;/root&gt;&lt;/mxGraphModel&gt;&lt;/diagram&gt;&lt;/mxfile&gt;" width="200" height="80"><rect width="200" height="80" fill="none" stroke="#000"/></svg>\n`,
};

const MODEL = `specification {
  element actor
  element system
}
model {
  user = actor 'Person'
  shipyard = system 'Shipyard'
  user -> shipyard 'plans and delivers'
}
views {
  view index { include * }
}
`;

const DESIGN_DOC = `# Design

The context is in diagram:context and the model:system model. The sync follows adr:0004.
The contract is api:orders and the store is data:shop. The network rules are in flow:network.
The first screen is screen:home.
`;

const SCREEN_FILE = JSON.stringify({
	screens: [
		{
			slug: "home",
			title: "Home",
			artifacts: ["diagram:context"],
			figma: "https://www.figma.com/file/abc123/Home",
		},
		{
			slug: "checkout",
			title: "Checkout",
			artifacts: ["diagram:order-process", "api:orders"],
			figma: "docs/designs/checkout.fig",
		},
	],
});

export function seedDesign(): MockDesign {
	const files: Files = {
		[DOC]: file(DESIGN_DOC),
		[SCREENS]: file(SCREEN_FILE),
		[`${DIR.model}/system.c4`]: file(MODEL),
		[`${DIR.api}/orders.yaml`]: file(CONTRACT),
		[`${DIR.data}/shop.dbml`]: file(DBML),
		[`${DIR.flow}/network.yaml`]: file(stringify({ rows: FLOW_ROWS.map(flowRow) }, YAML)),
		[`${DIR.decisions}/0001-use-tauri.md`]: file(ADR("accepted", "2026-08-12", "Use Tauri")),
		[`${DIR.decisions}/0002-rust-core.md`]: file(
			ADR("accepted", "2026-08-14", "Keep the domain in Rust"),
		),
		[`${DIR.decisions}/0003-ship-a-browser-mock.md`]: file(
			ADR("proposed", "2026-10-20", "Ship a browser mock"),
		),
		[`${DIR.decisions}/0004-polling-sync-with-local-mirror.md`]: file(
			`${ADR("accepted", "2026-09-02", "Polling sync with local mirror")}\nThe first tracker is q:Q-012.\n`,
		),
	};
	for (const [name, text] of Object.entries(DIAGRAMS)) files[`${DIR.diagram}/${name}`] = file(text);
	return { files, opened: [] };
}

// ---------------------------------------------------------------- list

const split = (name: string): [stem: string, ext: string] => {
	const cut = name.toLowerCase().endsWith(".drawio.svg") ? name.length - 11 : name.lastIndexOf(".");
	return [
		name.slice(0, cut < 0 ? name.length : cut),
		name
			.slice(cut < 0 ? name.length : cut)
			.replace(/^\./, "")
			.toLowerCase(),
	];
};

const FORMAT: Record<string, string> = {
	excalidraw: "excalidraw",
	drawio: "drawio",
	"drawio.svg": "drawio",
	mmd: "mermaid",
	mermaid: "mermaid",
	bpmn: "bpmn",
};
const EXT: Record<string, string[]> = {
	model: ["c4", "likec4"],
	api: ["yaml", "yml", "json"],
	data: ["dbml"],
	flow: ["yaml", "yml"],
};

function artifacts(files: Files): Artifact_Serialize[] {
	const out: Artifact_Serialize[] = [];
	for (const kind of ["diagram", "model", "api", "data", "flow"] as const) {
		const paths = Object.keys(files)
			.filter((p) => isUnder(p, DIR[kind]))
			.sort();
		for (const path of paths) {
			const [stem, ext] = split(path.slice(path.lastIndexOf("/") + 1));
			const a: Artifact_Serialize = {
				reference: "",
				kind,
				slug: slug(stem),
				path,
				title: stem,
				format: null,
				version: null,
				issue: null,
			};
			if (kind === "diagram") {
				a.format = FORMAT[ext] ?? null;
				const c = files[path]?.text.split('content="')[1]?.trimStart();
				if (ext === "drawio.svg" && !(c?.startsWith("&lt;") || c?.startsWith("<")))
					a.issue = "not a draw.io board";
				if (!a.format) continue;
			} else if (!EXT[kind]?.includes(ext)) continue;
			if (kind === "api") {
				try {
					const v = parse(files[path]?.text ?? "") as {
						openapi?: string;
						info?: { title?: string; version?: string };
					};
					if (!v?.openapi) continue;
					a.title = v.info?.title ?? a.title;
					a.version = v.info?.version == null ? null : String(v.info.version);
				} catch (e) {
					a.issue = String(e);
				}
			}
			if (out.some((b) => b.kind === kind && b.slug === a.slug))
				a.slug = `${a.slug}-${a.format ?? ext}`;
			a.reference = `${kind}:${a.slug}`;
			if (isRef(a.reference)) out.push(a);
		}
	}
	return out;
}

const field = (fm: string, k: string) =>
	new RegExp(`^${k}:(.*)$`, "m")
		.exec(fm)?.[1]
		?.trim()
		.replace(/^["']|["']$/g, "") ?? "";

function adrs(files: Files): Adr[] {
	return Object.keys(files)
		.filter((p) => isUnder(p, DIR.decisions) && /\/\d{4}-[^/]*\.md$/.test(p))
		.sort()
		.map((path) => {
			const text = files[path]?.text ?? "";
			const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
			const name = path.slice(path.lastIndexOf("/") + 1);
			return {
				number: name.slice(0, 4),
				title: /^# (.*)$/m.exec(text)?.[1]?.trim() ?? name.slice(0, -3),
				status: field(fm, "status") || "unknown",
				date: field(fm, "date"),
				path,
			};
		});
}

function screens(files: Files): { screens: Screen_Serialize[]; error: string | null } {
	const text = files[SCREENS]?.text;
	if (text === undefined) return { screens: [], error: null };
	try {
		const list = (JSON.parse(text) as { screens: Partial<Screen_Serialize>[] }).screens;
		if (!Array.isArray(list)) throw new Error("missing field `screens`");
		return {
			screens: list.map((s) => {
				const figma = s.figma ?? null;
				return {
					slug: s.slug ?? "",
					title: s.title ?? "",
					artifacts: s.artifacts ?? [],
					figma,
					broken: figma !== null && !figma.startsWith("https://") && !files[figma],
				};
			}),
			error: null,
		};
	} catch (e) {
		return { screens: [], error: String(e instanceof Error ? e.message : e) };
	}
}

export function designList(d: MockDesign): DesignList_Serialize {
	const s = screens(d.files);
	const shown = s.screens.map((x) => ({
		reference: `screen:${x.slug}`,
		kind: "screen",
		slug: x.slug,
		path: SCREENS,
		title: x.title,
		format: null,
		version: null,
		issue: null,
	}));
	const all = [...artifacts(d.files), ...shown.filter((x) => isRef(x.reference))];
	all.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
	return {
		artifacts: all,
		adrs: adrs(d.files),
		screens: s.screens,
		screensError: s.error,
		doc: DOC,
	};
}

export const designRead = (d: MockDesign, rel: string) => {
	resolvePath(rel, DESIGN_FOLDERS);
	return readText(d.files, rel);
};

export function designWrite(
	d: MockDesign,
	rel: string,
	text: string,
	stamp: string | null,
	create: boolean,
) {
	resolvePath(rel, DESIGN_FOLDERS);
	return putText(d.files, rel, text, stamp, create);
}

// ---------------------------------------------------------------- ADR

export function adrCreate(d: MockDesign, title: string, today: string): Adr {
	const t = title.trim();
	if (!t || /[\r\n]/.test(t)) throw "the title must be one line";
	const number = String(Math.max(0, ...adrs(d.files).map((a) => Number(a.number))) + 1).padStart(
		4,
		"0",
	);
	const path = `${DIR.decisions}/${number}-${slug(t) || "untitled"}.md`;
	putText(
		d.files,
		path,
		`---\nstatus: proposed\ndate: ${today}\ndecision-makers: []\n---\n# ${t}\n## Context and problem statement\n\n## Decision drivers\n\n## Considered options\n\n## Decision outcome\n\n### Consequences\n`,
		null,
		true,
	);
	return { number, title: t, status: "proposed", date: today, path };
}

/** Sets status, date and comment of a proposed ADR. Every other byte stays. */
export function adrDecide(
	d: MockDesign,
	rel: string,
	decision: Decision,
	comment: string,
	stamp: string,
	today: string,
): Written_Serialize {
	resolvePath(rel, DESIGN_FOLDERS);
	if (!isUnder(rel, DIR.decisions)) throw `not an ADR: ${rel}`;
	const text = readText(d.files, rel).text;
	const c = comment.trim();
	if (!c) throw "a comment is required";
	const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
	if (!m) throw "no front matter";
	const fm = (m[1] ?? "").split("\n");
	if (field(fm.join("\n"), "status") !== "proposed") throw "only a proposed ADR can be decided";
	const set = (k: string, v: string) => {
		const i = fm.findIndex((l) => l.startsWith(`${k}:`));
		if (i < 0) fm.push(`${k}: ${v}`);
		else fm[i] = `${k}: ${v}`;
	};
	set("status", decision === "accept" ? "accepted" : "rejected");
	set("date", today);
	set("comment", JSON.stringify(c));
	return putText(
		d.files,
		rel,
		`---\n${fm.join("\n")}\n---\n${text.slice(m[0].length)}`,
		stamp,
		false,
	);
}

// ---------------------------------------------------------------- flows

/** The first required field that is empty, then the first address that is malformed. */
function checkFlow(r: FlowRow_Deserialize) {
	const missing = (["source", "destination", "network", "protocol"] as const).find(
		(k) => !(r[k] ?? "").trim(),
	);
	if (missing) throw `row ${r.id}: missing field: ${missing}`;
	for (const k of ["source", "destination"] as const) {
		const v = r[k].trim();
		const [ip = "", mask] = v.split("/");
		const octets = ip.split(".");
		const ok =
			octets.length === 4 &&
			octets.every((o) => /^(0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255) &&
			(mask === undefined || (/^\d{1,2}$/.test(mask) && Number(mask) <= 32));
		if (/^[\d./]+$/.test(v) && !ok) throw `row ${r.id}: invalid ${k}: ${v}`;
	}
}

/** Save the flow table. Each row must pass the check (REQ-018). */
export function flowsSave(
	d: MockDesign,
	rel: string,
	rows: FlowRow_Deserialize[],
	stamp: string | null,
) {
	resolvePath(rel, DESIGN_FOLDERS);
	if (!isUnder(rel, DIR.flow)) throw `not a flow file: ${rel}`;
	for (const r of rows) checkFlow(r);
	const clean = rows.map((r) => ({
		id: r.id,
		source: r.source,
		destination: r.destination,
		network: r.network,
		protocol: r.protocol,
		...(r.port ? { port: r.port } : {}),
		action: r.action,
		...(r.note ? { note: r.note } : {}),
	}));
	return putText(d.files, rel, stringify({ rows: clean }, YAML), stamp, !d.files[rel]);
}

// ---------------------------------------------------------------- try

type Contract = {
	servers?: { url?: string; variables?: Record<string, { default?: string }> }[];
	paths?: Record<
		string,
		Record<
			string,
			{ responses?: Record<string, { content?: Record<string, { example?: unknown }> }> }
		>
	>;
};

/** Answer one request from the contract: the first 2xx response and its JSON example. */
export function designTry(d: MockDesign, r: TryRequestIn, click: boolean): TryResponse {
	const method = r.method.toUpperCase();
	if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
		throw `method not allowed: ${method}`;
	if (method !== "GET") needClick(click);
	if (!r.route.startsWith("/") || r.route.startsWith("//") || /\s/.test(r.route))
		throw "the route must start with one `/` and hold no space";
	resolvePath(r.path, DESIGN_FOLDERS);
	if (!isUnder(r.path, DIR.api)) throw `not a contract: ${r.path}`;
	const c = parse(readText(d.files, r.path).text) as Contract;
	const server = (c.servers ?? []).find((s) => s.url === r.server);
	if (!server) throw "the contract does not list this server";
	const base = Object.entries(server.variables ?? {}).reduce(
		(u, [k, v]) => u.replace(`{${k}}`, v.default ?? ""),
		r.server,
	);
	if (!/^https?:\/\//.test(base)) throw "the server is not an absolute http or https address";
	if (r.body?.trim())
		try {
			JSON.parse(r.body);
		} catch (e) {
			throw `the body is not JSON: ${e instanceof Error ? e.message : e}`;
		}
	const route = r.route.split("?")[0] ?? "";
	const op = Object.entries(c.paths ?? {}).find(([p]) =>
		new RegExp(`^${p.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(route),
	)?.[1]?.[method.toLowerCase()];
	const reply = (status: number, body: unknown): TryResponse => ({
		status,
		body: JSON.stringify(body),
		truncated: false,
		elapsedMs: 8,
	});
	if (!op) return reply(404, { error: "not found" });
	const code =
		Object.keys(op.responses ?? {})
			.sort()
			.find((k) => k.startsWith("2")) ?? "200";
	return reply(Number(code), op.responses?.[code]?.content?.["application/json"]?.example ?? {});
}

type TryRequestIn = TryRequest_Deserialize;

// ---------------------------------------------------------------- open outside

export function designOpen(d: MockDesign, target: string) {
	const bad = `not an https address or a design file of the project: ${target}`;
	if (target.startsWith("https://")) {
		if (target.length === 8 || /[\s\p{Cc}]/u.test(target)) throw "bad address";
	} else if (!(d.files[target] && /\.(fig|drawio|drawio\.svg|bpmn)$/i.test(target))) throw bad;
	d.opened.push(target);
}

// ---------------------------------------------------------------- refs

export function designEntities(d: MockDesign): Entity[] {
	const l = designList(d);
	return [
		...l.artifacts.map((a) => ({ ref: a.reference, title: a.title, status: null })),
		...l.adrs.map((a) => ({ ref: `adr:${a.number}`, title: a.title, status: a.status })),
		{ ref: `doc:${DOC}`, title: "Design", status: null },
	];
}

export function designCitations(d: MockDesign): [string, string][] {
	const l = designList(d);
	const adrOf = new Map(l.adrs.map((a) => [a.path, `adr:${a.number}`]));
	const artOf = new Map(
		l.artifacts.filter((a) => a.kind !== "screen").map((a) => [a.path, a.reference]),
	);
	return [
		...fileCitations(d.files, (p) =>
			p === DOC ? `doc:${DOC}` : (adrOf.get(p) ?? artOf.get(p) ?? null),
		),
		...l.screens.flatMap((s) => s.artifacts.map((t): [string, string] => [`screen:${s.slug}`, t])),
	];
}
