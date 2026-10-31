// Moves a board between Mermaid, draw.io, BPMN and Excalidraw through one small graph: boxes with a
// label and arrows with a label. Positions, styles and anything else that the graph lacks are not kept.
// shortcut: a draw.io file with a compressed page is refused, a Mermaid file is read as a flowchart.

export type BoardFormat = "excalidraw" | "mermaid" | "drawio" | "bpmn";
type Kind = "task" | "gateway" | "event";
type Graph = {
	nodes: { id: string; label: string; kind: Kind }[];
	edges: { from: string; to: string; label: string }[];
};

const W = 140;
const H = 60;
const GAP_X = 80;
const GAP_Y = 40;

const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (html: string) =>
	new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";

// ---------------------------------------------------------------- read

function fromMermaid(text: string): Graph {
	const g: Graph = { nodes: [], edges: [] };
	const add = (raw: string): string | null => {
		const m =
			/^\s*([A-Za-z0-9_]+)\s*(?:\(\(\s*"?(.*?)"?\s*\)\)|\(\[\s*"?(.*?)"?\s*\]\)|\[\s*"?(.*?)"?\s*\]|\(\s*"?(.*?)"?\s*\)|\{\s*"?(.*?)"?\s*\})?\s*$/.exec(
				raw,
			);
		if (!m) return null;
		const id = m[1] as string;
		const label = (m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6])?.replace(/#quot;/g, '"');
		const kind: Kind = m[6] !== undefined ? "gateway" : m[2] !== undefined ? "event" : "task";
		const known = g.nodes.find((n) => n.id === id);
		if (!known) g.nodes.push({ id, label: label ?? id, kind });
		else if (label !== undefined) Object.assign(known, { label, kind });
		return id;
	};
	for (const line of text.split("\n").slice(1)) {
		const body = line.trim();
		if (!body || body.startsWith("%%")) continue;
		// Alternating node text and arrow label: `A -->|yes| B --> C`.
		const parts = body.split(/\s*(?:-->|---|==>|-\.->)\s*(?:\|([^|]*)\|\s*)?/);
		let prev: string | null = null;
		for (let i = 0; i < parts.length; i += 2) {
			const id = add(parts[i] ?? "");
			if (id && prev) g.edges.push({ from: prev, to: id, label: (parts[i - 1] ?? "").trim() });
			prev = id;
		}
	}
	return g;
}

function xml(text: string): Document {
	const doc = new DOMParser().parseFromString(text, "application/xml");
	if (doc.getElementsByTagName("parsererror").length) throw new Error("Not a valid XML board");
	return doc;
}

function fromDrawio(text: string): Graph {
	const doc = xml(text);
	if (doc.getElementsByTagName("mxGraphModel").length === 0)
		throw new Error("This draw.io file is compressed: save it uncompressed first");
	const g: Graph = { nodes: [], edges: [] };
	for (const c of Array.from(doc.getElementsByTagName("mxCell"))) {
		const id = c.getAttribute("id") ?? "";
		const style = c.getAttribute("style") ?? "";
		const label = plain(c.getAttribute("value") ?? "");
		if (c.getAttribute("vertex") === "1")
			g.nodes.push({
				id,
				label,
				kind: style.includes("rhombus") ? "gateway" : style.includes("ellipse") ? "event" : "task",
			});
		else if (c.getAttribute("edge") === "1" && c.getAttribute("source") && c.getAttribute("target"))
			g.edges.push({
				from: c.getAttribute("source") as string,
				to: c.getAttribute("target") as string,
				label,
			});
	}
	return g;
}

function fromBpmn(text: string): Graph {
	const doc = xml(text);
	const g: Graph = { nodes: [], edges: [] };
	for (const p of Array.from(doc.getElementsByTagNameNS("*", "process")))
		for (const el of Array.from(p.children)) {
			const name = el.localName;
			const id = el.getAttribute("id") ?? "";
			if (name === "sequenceFlow")
				g.edges.push({
					from: el.getAttribute("sourceRef") ?? "",
					to: el.getAttribute("targetRef") ?? "",
					label: el.getAttribute("name") ?? "",
				});
			else if (/gateway$/i.test(name))
				g.nodes.push({ id, label: el.getAttribute("name") ?? "", kind: "gateway" });
			else if (/event$/i.test(name))
				g.nodes.push({ id, label: el.getAttribute("name") ?? "", kind: "event" });
			else if (/(task|subprocess|callactivity)$/i.test(name))
				g.nodes.push({ id, label: el.getAttribute("name") ?? "", kind: "task" });
		}
	return g;
}

type Scene = {
	id: string;
	type: string;
	text?: string;
	containerId?: string | null;
	isDeleted?: boolean;
	startBinding?: { elementId: string } | null;
	endBinding?: { elementId: string } | null;
};

function fromExcalidraw(text: string): Graph {
	const els = (JSON.parse(text).elements ?? []) as Scene[];
	const live = els.filter((e) => !e.isDeleted);
	const label = (id: string) =>
		live.find((e) => e.type === "text" && e.containerId === id)?.text ?? "";
	const g: Graph = { nodes: [], edges: [] };
	for (const e of live) {
		if (e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond")
			g.nodes.push({
				id: e.id,
				label: label(e.id),
				kind: e.type === "diamond" ? "gateway" : e.type === "ellipse" ? "event" : "task",
			});
		else if (e.type === "arrow" && e.startBinding && e.endBinding)
			g.edges.push({
				from: e.startBinding.elementId,
				to: e.endBinding.elementId,
				label: label(e.id),
			});
	}
	return g;
}

// ---------------------------------------------------------------- write

/** Left to right: a box sits one column after its furthest predecessor. */
function layout(g: Graph) {
	const col = new Map(g.nodes.map((n) => [n.id, 0]));
	// One pass for each node is enough to settle a graph with no cycle. A cycle stops at the pass limit.
	for (let pass = 0; pass < g.nodes.length; pass++)
		for (const e of g.edges)
			if (col.has(e.from) && col.has(e.to))
				col.set(
					e.to,
					Math.min(g.nodes.length, Math.max(col.get(e.to) ?? 0, (col.get(e.from) ?? 0) + 1)),
				);
	const rows = new Map<number, number>();
	return new Map(
		g.nodes.map((n) => {
			const c = col.get(n.id) ?? 0;
			const r = rows.get(c) ?? 0;
			rows.set(c, r + 1);
			return [n.id, { x: c * (W + GAP_X), y: r * (H + GAP_Y), w: W, h: H }] as const;
		}),
	);
}

const safe = (id: string, used: Set<string>, i: number) => {
	let s = id.replace(/[^A-Za-z0-9_]/g, "_");
	if (!/^[A-Za-z]/.test(s)) s = `n${s}`;
	while (used.has(s)) s = `${s}_${i}`;
	used.add(s);
	return s;
};

function toMermaid(g: Graph): string {
	const used = new Set<string>();
	const ids = new Map(g.nodes.map((n, i) => [n.id, safe(n.id, used, i)]));
	const q = (s: string) => s.replace(/"/g, "#quot;");
	const shape = (n: Graph["nodes"][number]) =>
		n.kind === "gateway"
			? `{"${q(n.label)}"}`
			: n.kind === "event"
				? `(("${q(n.label)}"))`
				: `["${q(n.label)}"]`;
	return `${[
		"flowchart LR",
		...g.nodes.map((n) => `  ${ids.get(n.id)}${shape(n)}`),
		...g.edges
			.filter((e) => ids.has(e.from) && ids.has(e.to))
			.map(
				(e) =>
					`  ${ids.get(e.from)} -->${e.label ? `|${e.label.replace(/\|/g, "/")}|` : ""} ${ids.get(e.to)}`,
			),
	].join("\n")}\n`;
}

function toDrawio(g: Graph): string {
	const at = layout(g);
	const style = (k: Kind) =>
		k === "gateway"
			? "rhombus;whiteSpace=wrap;html=1;"
			: k === "event"
				? "ellipse;whiteSpace=wrap;html=1;"
				: "rounded=1;whiteSpace=wrap;html=1;";
	const cells = [
		'<mxCell id="0"/>',
		'<mxCell id="1" parent="0"/>',
		...g.nodes.map((n) => {
			const p = at.get(n.id);
			return `<mxCell id="${esc(n.id)}" value="${esc(n.label)}" style="${style(n.kind)}" vertex="1" parent="1"><mxGeometry x="${p?.x}" y="${p?.y}" width="${W}" height="${H}" as="geometry"/></mxCell>`;
		}),
		...g.edges.map(
			(e, i) =>
				`<mxCell id="edge${i + 1}" value="${esc(e.label)}" style="endArrow=classic;html=1;" edge="1" parent="1" source="${esc(e.from)}" target="${esc(e.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
		),
	];
	return `<mxfile host="shipyard"><diagram name="Page-1" id="page1"><mxGraphModel><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>\n`;
}

function toBpmn(g: Graph): string {
	const at = layout(g);
	const used = new Set<string>();
	const ids = new Map(g.nodes.map((n, i) => [n.id, safe(n.id, used, i)]));
	const hasIn = new Set(g.edges.map((e) => e.to));
	const hasOut = new Set(g.edges.map((e) => e.from));
	const tag = (n: Graph["nodes"][number]) =>
		n.kind === "gateway"
			? "exclusiveGateway"
			: n.kind === "task"
				? "task"
				: !hasIn.has(n.id)
					? "startEvent"
					: !hasOut.has(n.id)
						? "endEvent"
						: "intermediateCatchEvent";
	const size = (n: Graph["nodes"][number]) => {
		const p = at.get(n.id);
		const [w, h] = n.kind === "task" ? [100, 80] : n.kind === "gateway" ? [50, 50] : [36, 36];
		return { x: (p?.x ?? 0) + (W - w) / 2, y: (p?.y ?? 0) + (H - h) / 2, w, h };
	};
	const flows = g.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
	const process = [
		...g.nodes.map((n) => `<bpmn:${tag(n)} id="${ids.get(n.id)}" name="${esc(n.label)}"/>`),
		...flows.map(
			(e, i) =>
				`<bpmn:sequenceFlow id="Flow_${i + 1}" name="${esc(e.label)}" sourceRef="${ids.get(e.from)}" targetRef="${ids.get(e.to)}"/>`,
		),
	];
	const shapes = g.nodes.map((n) => {
		const b = size(n);
		return `<bpmndi:BPMNShape id="${ids.get(n.id)}_di" bpmnElement="${ids.get(n.id)}"><dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/></bpmndi:BPMNShape>`;
	});
	const edges = flows.map((e, i) => {
		const a = size(g.nodes.find((n) => n.id === e.from) as Graph["nodes"][number]);
		const b = size(g.nodes.find((n) => n.id === e.to) as Graph["nodes"][number]);
		return `<bpmndi:BPMNEdge id="Flow_${i + 1}_di" bpmnElement="Flow_${i + 1}"><di:waypoint x="${a.x + a.w}" y="${a.y + a.h / 2}"/><di:waypoint x="${b.x}" y="${b.y + b.h / 2}"/></bpmndi:BPMNEdge>`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
<bpmn:process id="Process_1" isExecutable="false">${process.join("")}</bpmn:process>
<bpmndi:BPMNDiagram id="Diagram_1"><bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">${shapes.join("")}${edges.join("")}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

function toExcalidraw(g: Graph): string {
	const at = layout(g);
	const base = (
		id: string,
		type: string,
		x: number,
		y: number,
		w: number,
		h: number,
		i: number,
	) => ({
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
		seed: 1000 + i,
		version: 1,
		versionNonce: 2000 + i,
		isDeleted: false,
		updated: 1,
		link: null,
		locked: false,
	});
	const bound = new Map<string, { id: string; type: string }[]>();
	const hold = (id: string, b: { id: string; type: string }) =>
		bound.set(id, [...(bound.get(id) ?? []), b]);
	const texts: object[] = [];
	const arrows: object[] = [];
	let n = 0;
	const text = (container: string, label: string, x: number, y: number, w: number) => {
		if (!label) return;
		const id = `${container}-text`;
		hold(container, { id, type: "text" });
		texts.push({
			...base(id, "text", x, y, w, 20, ++n),
			text: label,
			originalText: label,
			fontSize: 16,
			fontFamily: 1,
			textAlign: "center",
			verticalAlign: "middle",
			containerId: container,
			lineHeight: 1.25,
			autoResize: true,
			baseline: 14,
			boundElements: null,
			roundness: null,
		});
	};
	g.edges.forEach((e, i) => {
		const a = at.get(e.from);
		const b = at.get(e.to);
		if (!a || !b) return;
		const id = `arrow-${i + 1}`;
		hold(e.from, { id, type: "arrow" });
		hold(e.to, { id, type: "arrow" });
		const dx = b.x - (a.x + a.w);
		const dy = b.y + b.h / 2 - (a.y + a.h / 2);
		arrows.push({
			...base(id, "arrow", a.x + a.w, a.y + a.h / 2, Math.abs(dx), Math.abs(dy), ++n),
			points: [
				[0, 0],
				[dx, dy],
			],
			startBinding: { elementId: e.from, focus: 0, gap: 4 },
			endBinding: { elementId: e.to, focus: 0, gap: 4 },
			startArrowhead: null,
			endArrowhead: "arrow",
			lastCommittedPoint: null,
			roundness: { type: 2 },
			boundElements: null,
		});
		text(id, e.label, a.x + a.w, a.y + a.h / 2 - 24, Math.max(dx, 30));
	});
	const shapes = g.nodes.map((node, i) => {
		const p = at.get(node.id) ?? { x: 0, y: 0, w: W, h: H };
		text(node.id, node.label, p.x, p.y + p.h / 2 - 10, p.w);
		return {
			...base(
				node.id,
				node.kind === "gateway" ? "diamond" : node.kind === "event" ? "ellipse" : "rectangle",
				p.x,
				p.y,
				p.w,
				p.h,
				i,
			),
			roundness: node.kind === "task" ? { type: 3 } : null,
		};
	});
	const elements = [...shapes, ...arrows, ...texts].map((e) => ({
		...e,
		boundElements: bound.get((e as { id: string }).id) ?? null,
	}));
	return `${JSON.stringify({ type: "excalidraw", version: 2, source: "shipyard", elements, appState: {}, files: {} })}\n`;
}

const READ: Record<BoardFormat, (text: string) => Graph> = {
	mermaid: fromMermaid,
	drawio: fromDrawio,
	bpmn: fromBpmn,
	excalidraw: fromExcalidraw,
};
const WRITE: Record<BoardFormat, (g: Graph) => string> = {
	mermaid: toMermaid,
	drawio: toDrawio,
	bpmn: toBpmn,
	excalidraw: toExcalidraw,
};

/** The text of the board `text` in the format `to`. It throws when the source cannot be read. */
export function convertBoard(from: BoardFormat, to: BoardFormat, text: string): string {
	const g = READ[from](text);
	if (g.nodes.length === 0) throw new Error("The board has no boxes to convert");
	return WRITE[to](g);
}

/** The text of a new board: a start, a task and an end. */
export const newBoard = (format: BoardFormat): string =>
	WRITE[format]({
		nodes: [
			{ id: "start", label: "Start", kind: "event" },
			{ id: "task", label: "Task", kind: "task" },
			{ id: "end", label: "End", kind: "event" },
		],
		edges: [
			{ from: "start", to: "task", label: "" },
			{ from: "task", to: "end", label: "" },
		],
	});
