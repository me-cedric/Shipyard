import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { clusterNodes } from "./graph-clusters";
import { graphNode, inspector, mountKnowledge } from "./harness";

const graph = () => unwrap(commands.graphGet());

/** The cluster of a ref, as the graph draws it. */
const clusterOf = (g: Awaited<ReturnType<typeof graph>>, ref: string) =>
	clusterNodes(g.nodes).find((c) => c.members.some((m) => m.ref === ref))?.id ?? "";

describe("Knowledge / Graph", () => {
	it("draws the clusters first, with their counts, and the kinds with a count", async () => {
		await mountKnowledge("graph");
		const g = await graph();
		const spec = g.nodes.filter((n) => n.kind === "spec");
		expect(spec.length).toBeGreaterThan(0);
		const adr = await graphNode("cluster/adr");
		expect(adr).toHaveAttribute("aria-expanded", "false");
		expect(adr).toHaveTextContent(String(g.nodes.filter((n) => n.kind === "adr").length));
		expect(screen.queryByTestId("rf__node-adr:0001")).toBeNull();
		expect(await screen.findByRole("button", { name: `Spec ${spec.length}` })).toBeInTheDocument();
	});

	it("opens a cluster in place on a click or Enter, and closes it on a second one", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		const cluster = await graphNode("cluster/adr");
		await user.click(cluster);
		expect(await graphNode("adr:0001")).toHaveAttribute(
			"aria-label",
			expect.stringContaining("adr:0001"),
		);
		// A new node set mounts a new canvas: read the cluster again.
		expect(await graphNode("cluster/adr")).toHaveAttribute("aria-expanded", "true");
		await user.click(await graphNode("cluster/adr"));
		await waitFor(() => expect(screen.queryByTestId("rf__node-adr:0001")).toBeNull());
		(await graphNode("cluster/adr")).focus();
		await user.keyboard("{Enter}");
		await graphNode("adr:0001");
	});

	it("hides a kind with its toggle, and its cluster with it", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		const g = await graph();
		const count = g.nodes.filter((n) => n.kind === "adr").length;
		await graphNode("cluster/adr");
		await user.click(await screen.findByRole("button", { name: `ADR ${count}` }));
		await waitFor(() => expect(screen.queryByTestId("rf__node-cluster/adr")).toBeNull());
		expect(screen.getByTestId(`rf__node-${clusterOf(g, "spec:auth")}`)).toBeInTheDocument();
	});

	it("finds a node with the search, opens its cluster and shows only the matches", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		await graphNode("cluster/adr");
		await user.type(screen.getByRole("textbox", { name: "Search" }), "adr:0001");
		expect(await graphNode("adr:0001")).toBeInTheDocument();
		expect(await graphNode("cluster/adr")).toHaveAttribute("aria-expanded", "true");
		expect(screen.queryByTestId("rf__node-adr:0002")).toBeNull();
		expect(screen.queryByTestId("rf__node-cluster/spec:auth")).toBeNull();
	});

	it("marks a stale node and lists the clusters and their members in the table view", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		const g = await graph();
		const stale = g.nodes.find((n) => n.stale);
		if (!stale) throw new Error("marks");
		await user.click(await graphNode(clusterOf(g, stale.ref)));
		expect(await graphNode(stale.ref)).toHaveAttribute(
			"aria-label",
			expect.stringContaining("Stale"),
		);
		await user.click(screen.getByRole("button", { name: "Table view" }));
		const rows = within(screen.getByRole("table", { name: "Table view" })).getAllByRole("row");
		expect(rows).toHaveLength(g.nodes.length + clusterNodes(g.nodes).length + 1);
	});

	it("opens the entity in the inspector, then centres the graph on it with its neighbours", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		const g = await graph();
		const edge = g.edges[0];
		if (!edge) throw new Error("edge");
		await user.click(await graphNode(clusterOf(g, edge.source)));
		await user.click(await graphNode(edge.source));
		const panel = await inspector();
		await waitFor(() => expect(panel).toHaveTextContent(edge.source));
		await user.click(within(panel).getByRole("button", { name: "Open in graph" }));
		const near = new Set([edge.source]);
		for (const e of g.edges) {
			if (e.source === edge.source) near.add(e.target);
			if (e.target === edge.source) near.add(e.source);
		}
		await waitFor(() => expect(screen.getAllByTestId(/^rf__node-/)).toHaveLength(near.size));
		await user.click(screen.getByRole("button", { name: "Show all" }));
		// Show all returns to the clusters: the cluster that was open stays open.
		await waitFor(() =>
			expect(screen.getAllByTestId(/^rf__node-cluster\//)).toHaveLength(
				clusterNodes(g.nodes).length,
			),
		);
	});

	it("switches to the code graph", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		await user.click(await screen.findByRole("tab", { name: "Code" }));
		const code = await unwrap(commands.graphCode());
		expect(code.nodes.length).toBeGreaterThan(0);
		await screen.findByTestId(`rf__node-${code.nodes[0]?.ref}`);
		expect(screen.queryByTestId(`rf__node-adr:0001`)).toBeNull();
	});

	it("shows one Index action in place of a code graph that has no index", async () => {
		const user = userEvent.setup();
		mockState().knowledge.indexed = false;
		await mountKnowledge("graph");
		await user.click(await screen.findByRole("tab", { name: "Code" }));
		await user.click(await screen.findByRole("button", { name: "Index" }));
		const code = await unwrap(commands.graphCode());
		await screen.findByTestId(`rf__node-${code.nodes[0]?.ref}`);
	});

	describe("Index with the code graph server off", () => {
		afterEach(() => vi.restoreAllMocks());

		it("makes one backend call and does not change the saved server setting", async () => {
			const user = userEvent.setup();
			mockState().knowledge.indexed = false;
			await mountKnowledge("graph");
			const enable = vi.spyOn(commands, "mcpEnable");
			const start = vi.spyOn(commands, "mcpStart");
			const index = vi.spyOn(commands, "graphCodeIndex");
			await user.click(await screen.findByRole("tab", { name: "Code" }));
			await user.click(await screen.findByRole("button", { name: "Index" }));
			await waitFor(() => expect(index).toHaveBeenCalledTimes(1));
			expect(enable).not.toHaveBeenCalled();
			expect(start).not.toHaveBeenCalled();
		});

		it("shows the error of the index", async () => {
			const user = userEvent.setup();
			mockState().knowledge.indexed = false;
			await mountKnowledge("graph");
			vi.spyOn(commands, "graphCodeIndex").mockResolvedValue({
				status: "error",
				error: { code: "unknown", details: "it did not start", action: null },
			});
			await user.click(await screen.findByRole("tab", { name: "Code" }));
			await user.click(await screen.findByRole("button", { name: "Index" }));
			await screen.findByRole("alert");
		});
	});
});
