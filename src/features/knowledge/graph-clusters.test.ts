import { boxOf, clusterNodes, clusterView, forceLayout, type GNode } from "./graph-clusters";

const n = (ref: string, location?: string): GNode => ({
	ref,
	kind: ref.slice(0, ref.indexOf(":")),
	title: ref,
	location,
});
const C = "docs/openspec/changes/add-connections";
const nodes: GNode[] = [
	n("change:add-connections", `${C}/proposal.md`),
	n("doc:docs/openspec/changes/add-connections/plan.md"),
	n("doc:docs/openspec/changes/add-connections/.openspec.yaml"),
	n("doc:docs/openspec/changes/add-connections/tasks.md", `${C}/tasks.md`),
	n("spec:connections", `${C}/specs/connections/spec.md`),
	n("spec:connections#REQ-001"),
	n("spec:auth"),
	n("spec:auth#REQ-001"),
	n("adr:0001"),
	n("adr:0002"),
	n("doc:docs/readme.md"),
];
const ids = (k: string) =>
	clusterNodes(nodes)
		.find((c) => c.id === k)
		?.members.map((m) => m.ref);

describe("clusterNodes", () => {
	it("puts a change with its files, its spec and its requirements in one cluster", () => {
		expect(ids("cluster/change:add-connections")).toEqual([
			"change:add-connections",
			"doc:docs/openspec/changes/add-connections/plan.md",
			"doc:docs/openspec/changes/add-connections/.openspec.yaml",
			"doc:docs/openspec/changes/add-connections/tasks.md",
			"spec:connections",
			"spec:connections#REQ-001",
		]);
	});

	it("groups a capability alone, and the rest by kind", () => {
		expect(ids("cluster/spec:auth")).toEqual(["spec:auth", "spec:auth#REQ-001"]);
		expect(ids("cluster/adr")).toEqual(["adr:0001", "adr:0002"]);
		expect(ids("cluster/doc")).toEqual(["doc:docs/readme.md"]);
	});

	it("joins a settled spec to the change of its capability and counts a ref once", () => {
		const more = [...nodes, n("spec:connections", "docs/openspec/specs/connections/spec.md")];
		const c = clusterNodes(more).find((x) => x.id === "cluster/change:add-connections");
		expect(c?.members.filter((m) => m.ref === "spec:connections")).toHaveLength(1);
		expect(clusterNodes(more).reduce((a, x) => a + x.members.length, 0)).toBe(nodes.length);
	});
});

describe("clusterView", () => {
	const edges: [string, string][] = [
		["spec:auth", "adr:0001"],
		["spec:auth#REQ-001", "adr:0002"],
		["adr:0001", "adr:0002"],
	];

	it("aggregates the links between clusters and drops the links inside one", () => {
		const v = clusterView(nodes, nodes, edges, []);
		expect(v.links).toEqual([
			["cluster/spec:auth", "cluster/adr"],
			["cluster/spec:auth", "cluster/adr"],
		]);
	});

	it("draws a link to the member of an open cluster", () => {
		const v = clusterView(nodes, nodes, edges, ["cluster/adr"]);
		expect(v.links).toContainEqual(["adr:0001", "adr:0002"]);
		expect(v.links).toContainEqual(["cluster/spec:auth", "adr:0001"]);
	});

	it("opens the clusters of a search and drops the clusters without a match", () => {
		const shown = nodes.filter((x) => x.ref === "adr:0002");
		const v = clusterView(nodes, shown, edges, [], "0002");
		expect(v.clusters.map((c) => [c.id, c.members.length])).toEqual([["cluster/adr", 1]]);
		expect([...v.open]).toEqual(["cluster/adr"]);
	});
});

describe("forceLayout", () => {
	it("places boxes without overlap and is stable", () => {
		const boxes = ["a", "b", "c", "d"].map((id) => boxOf(id, 1, false));
		const links: [string, string][] = [
			["a", "b"],
			["b", "c"],
		];
		const p = forceLayout(boxes, links);
		expect(forceLayout(boxes, links)).toEqual(p);
		const at = [...p.values()];
		for (const [i, a] of at.entries())
			for (const b of at.slice(i + 1))
				expect(Math.abs(a.x - b.x) >= 208 || Math.abs(a.y - b.y) >= 56).toBe(true);
	});
});

describe("forceLayout at the size of a real repository", () => {
	it("keeps every place finite and near the centre", () => {
		const nodes: GNode[] = [];
		for (let c = 0; c < 60; c++) {
			const dir = `docs/openspec/changes/c${c}`;
			nodes.push({
				ref: `change:c${c}`,
				kind: "change",
				title: `c${c}`,
				location: `${dir}/proposal.md`,
			});
			for (let d = 0; d < 3; d++)
				nodes.push({
					ref: `doc:${dir}/f${d}.md`,
					kind: "document",
					title: "f",
					location: `${dir}/f${d}.md`,
				});
		}
		for (let c = 0; c < 70; c++)
			for (let r = 0; r < 6; r++)
				nodes.push({
					ref: `spec:cap${c}#REQ-${r}`,
					kind: "spec",
					title: "r",
					location: `docs/openspec/specs/cap${c}/spec.md`,
				});
		for (let i = 0; i < 117; i++)
			nodes.push({ ref: `question:q${i}`, kind: "question", title: "q" });
		for (let i = 0; i < 100; i++)
			nodes.push({
				ref: `doc:docs/x/${i}.md`,
				kind: "document",
				title: "d",
				location: `docs/x/${i}.md`,
			});
		const edges: [string, string][] = [];
		for (let i = 0; i < 1500; i++)
			edges.push([
				nodes[(i * 7) % nodes.length]?.ref ?? "",
				nodes[(i * 13 + 5) % nodes.length]?.ref ?? "",
			]);
		const view = clusterView(nodes, nodes, edges, []);
		const boxes = view.clusters.map((c) => boxOf(c.id, c.members.length, false));
		const places = [...forceLayout(boxes, view.links).values()];
		expect(places.length).toBeGreaterThan(100);
		for (const p of places) expect(Math.abs(p.x) + Math.abs(p.y)).toBeLessThan(10_000);
	});
});
