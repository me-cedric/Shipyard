import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { graphNode, inspector, mountKnowledge } from "./harness";

describe("Explain", () => {
	it("opens the assistant on the entity and shows the answer with each cited ref as a chip", async () => {
		const user = userEvent.setup();
		await mountKnowledge("graph");
		const g = await unwrap(commands.graphGet());
		const spec = g.nodes.find((n) => n.kind === "spec");
		if (!spec) throw new Error("spec");
		await user.click(await graphNode(spec.ref));
		const panel = await inspector();
		await user.click(await within(panel).findByRole("button", { name: "Explain" }));
		const log = await screen.findByRole("log");
		expect(await within(log).findByText(/part of the project graph/)).toBeInTheDocument();
		expect(
			within(log).getAllByRole("button", { name: new RegExp(`^${spec.ref}`) }),
		).not.toHaveLength(0);
	});

	it("finds no source for an entity that does not exist, and the neighbours for one that does", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const none = await unwrap(commands.explainContextGet("adr:9999"));
		expect(none.found).toBe(false);
		expect(none.refs.some((r) => r.state === "resolved")).toBe(false);
		const edge = (await unwrap(commands.graphGet())).edges[0];
		if (!edge) throw new Error("edge");
		const ctx = await unwrap(commands.explainContextGet(edge.source));
		expect(ctx.found).toBe(true);
		expect(ctx.refs.map((r) => r.ref)).toContain(edge.target);
	});
});
