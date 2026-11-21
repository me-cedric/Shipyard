import { screen, waitFor } from "@testing-library/react";
import { toolLabel } from "@/features/factory/usage/request-tree";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

// spec:shell-setup-rights#REQ-003: How agents do shows the load of the agent processes only.
describe("Crew / Spend / How agents do: Processor and Memory", () => {
	it("shows the sum of the two agent processes, not the whole computer", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/crew/spend?page=how");
		const cpu = await screen.findByRole("progressbar", { name: "Processor use" });
		// Two processes are at work in the demo: 20 % and 1.1 GB each.
		expect(cpu).toHaveAttribute("aria-valuenow", "40");
		expect(screen.getByText("Processor, 40 %")).toBeVisible();
		const memory = screen.getByRole("progressbar", { name: "Memory use" });
		expect(memory).toHaveAttribute("aria-valuenow", String(2.2e9));
		expect(memory).toHaveAttribute("aria-valuemax", String(16e9));
		expect(screen.getByText("Memory, 2.2 GB")).toBeVisible();
		await idle(router);
	});

	it("shows an empty bar when no agent process works", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		for (const s of mockState().machine.sessions) s.pid = null;
		const router = mountApp("/crew/spend?page=how");
		const cpu = await screen.findByRole("progressbar", { name: "Processor use" });
		expect(cpu).toHaveAttribute("aria-valuenow", "0");
		expect(screen.getByText("Processor, 0 %")).toBeVisible();
		await idle(router);
	});
});

describe("tool calls of a step", () => {
	it("reads a tool name in plain words", () => {
		expect(toolLabel("read_ticket")).toBe("read ticket");
		expect(toolLabel("mcp__shipyard__read_ref")).toBe("read ref");
	});

	it("lists under each step of a run the tool calls that the runner recorded", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const run = mockState().factory.runs.find((r) => r.tokens > 0);
		if (!run) throw new Error("the demo has a run with spend");
		const router = mountApp(`/crew/spend?page=how&run=${run.id}`);
		expect((await screen.findAllByText("read ticket")).length).toBeGreaterThan(0);
		expect(screen.getAllByText("read ref").length).toBeGreaterThan(0);
		await idle(router);
	});
});
