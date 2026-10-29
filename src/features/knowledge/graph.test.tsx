import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { graphNode, inspector, mountKnowledge } from "./harness";

const graph = () => unwrap(commands.graphGet());

describe("Knowledge / Graph", () => {
	it("draws the nodes with their ref and kind, and the kinds with a count", async () => {
		await mountKnowledge("graph");
		const g = await graph();
		const spec = g.nodes.filter((n) => n.kind === "spec");
		expect(spec.length).toBeGreaterThan(0);
		const first = g.nodes[0];
		if (!first) throw new Error("no node");
		expect(await graphNode(first.ref)).toHaveAttribute(
			"aria-label",
			expect.stringContaining(first.ref),
		);
		expect(await screen.findByRole("button", { name: `Spec ${spec.length}` })).toBeInTheDocument();
	});

	it("hides a kind with its toggle and keeps the others", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		const g = await graph();
		const spec = g.nodes.find((n) => n.kind === "spec");
		const other = g.nodes.find((n) => n.kind !== "spec");
		if (!spec || !other) throw new Error("kinds");
		await graphNode(spec.ref);
		const count = g.nodes.filter((n) => n.kind === "spec").length;
		await user.click(await screen.findByRole("button", { name: `Spec ${count}` }));
		await waitFor(() => expect(screen.queryByTestId(`rf__node-${spec.ref}`)).toBeNull());
		expect(screen.getByTestId(`rf__node-${other.ref}`)).toBeInTheDocument();
	});

	it("marks the stale and the orphan nodes and lists them in the table view", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		const g = await graph();
		const stale = g.nodes.find((n) => n.stale);
		const orphan = g.nodes.find((n) => n.orphan && !n.stale);
		if (!stale || !orphan) throw new Error("marks");
		expect(await graphNode(stale.ref)).toHaveAttribute(
			"aria-label",
			expect.stringContaining("Stale"),
		);
		expect(await graphNode(orphan.ref)).toHaveAttribute(
			"aria-label",
			expect.stringContaining("Orphan"),
		);
		await user.click(screen.getByRole("button", { name: "Table view" }));
		const rows = within(screen.getByRole("table", { name: "Table view" })).getAllByRole("row");
		expect(rows).toHaveLength(g.nodes.length + 1);
	});

	it("opens the entity in the inspector, then centres the graph on it with its neighbours", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		const g = await graph();
		const edge = g.edges[0];
		if (!edge) throw new Error("edge");
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
		await waitFor(() => expect(screen.getAllByTestId(/^rf__node-/)).toHaveLength(g.nodes.length));
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
});
