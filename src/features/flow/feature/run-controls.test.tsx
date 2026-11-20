import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize } from "@/lib/ipc/bindings";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

// `spec:runs-recipes` REQ-001 (Pause), REQ-002 (Take it over) and REQ-003 (Attach a file in the chat).
const feature = (f: Partial<FlowFeature_Serialize> & { title: string }): FlowFeature_Serialize => ({
	stage: "build",
	mark: null,
	ticket: null,
	change: null,
	run: null,
	pr: null,
	who: null,
	runState: null,
	approvals: 0,
	questions: 0,
	checks: null,
	stop: null,
	...f,
});

async function working() {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-2");
	if (!run) throw new Error("the demo has a run for ACME-2");
	vi.spyOn(commands, "featuresList").mockResolvedValue({
		status: "ok",
		data: [
			feature({
				title: "Add the health dot",
				ticket: "wi:ACME-2",
				run: `run:${run.id}`,
				runState: "Working",
			}),
		],
	});
	return run;
}

afterEach(() => vi.restoreAllMocks());

describe("Pause an agent (REQ-001)", () => {
	it("puts Pause between Talk and Stop, and pauses the run with the cause Person", async () => {
		const user = userEvent.setup();
		const run = await working();
		const pause = vi.spyOn(commands, "runPause");
		mountApp("/flow/feature/wi%3AACME-2");
		const card = within(await screen.findByRole("region", { name: "Agent" }));
		const names = card.getAllByRole("button").map((b) => b.textContent);
		expect(names.slice(names.indexOf("Pause") - 1, names.indexOf("Pause") + 2)).toEqual([
			"Talk to Build",
			"Pause",
			"Stop",
		]);
		await user.click(card.getByRole("button", { name: "Pause" }));
		await waitFor(() => expect(pause).toHaveBeenCalledWith(run.id));
		const rec = mockState().factory.runs.find((r) => r.id === run.id);
		expect(rec?.state).toBe("Paused");
		expect(rec?.returnTo).toBe("Working");
		// The stop card of a person pause: Resume, with Stop it.
		await waitFor(() => expect(card.queryByRole("button", { name: "Pause" })).toBeNull());
	});

	it("has no Pause for a run that waits for a person", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/flow/feature/wi%3AACME-9?ticket=true");
		const card = within(await screen.findByRole("region", { name: "Agent" }));
		expect(await card.findByRole("button", { name: "Stop" })).toBeVisible();
		expect(card.queryByRole("button", { name: "Pause" })).toBeNull();
	});

	it("refuses a pause in a state with no agent", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const blocked = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-9");
		if (!blocked) throw new Error("the demo has a blocked run");
		await expect(unwrap(commands.runPause(blocked.id))).rejects.toMatchObject({
			message: expect.stringContaining("refused Pause in Blocked"),
		});
	});
});

describe("Take it over (REQ-002)", () => {
	it("shows Take it over beside Unblock, and ends the run as Cancelled with the reason", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-9");
		if (!run) throw new Error("the demo has a blocked run");
		const takeOver = vi.spyOn(commands, "runTakeOver");
		mountApp(`/factory/runs/${run.id}`);
		const needs = within(await screen.findByRole("region", { name: "Needs you" }));
		const card = within(await needs.findByRole("article"));
		const order = card.getAllByRole("button").map((b) => b.textContent);
		expect(order.indexOf("Take it over")).toBeGreaterThanOrEqual(0);
		expect(order.indexOf("Take it over")).toBeLessThan(order.indexOf("Unblock"));
		await user.click(card.getByRole("button", { name: "Take it over" }));
		await waitFor(() => expect(takeOver).toHaveBeenCalledWith(run.id));
		const rec = mockState().factory.runs.find((r) => r.id === run.id);
		expect(rec?.state).toBe("Cancelled");
		const notes = rec?.log.map((e) => e.payload).filter((p) => p.includes("Taken over by"));
		expect(notes?.length).toBe(1);
		expect(await unwrap(commands.runTakeOver(run.id)).catch((e) => e)).toMatchObject({
			message: "the run ended",
		});
	});
});

describe("Attach a file in the agent chat (REQ-003)", () => {
	it("copies a file within the limits and names it beside the field", async () => {
		const user = userEvent.setup();
		const run = await working();
		const attach = vi.spyOn(commands, "runAttach");
		mountApp("/flow/feature/wi%3AACME-2?section=chat");
		const panel = await screen.findByRole("tabpanel", { name: "Chat" });
		const input = await within(panel).findByTestId("attach-input");
		expect(within(panel).getByRole("button", { name: "Attach file" })).toBeEnabled();
		await user.upload(
			input,
			new File(["use the new endpoint"], "notes.md", { type: "text/markdown" }),
		);
		await waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
		expect(attach.mock.calls[0]?.slice(0, 2)).toEqual([run.id, "notes.md"]);
		expect(await within(panel).findByRole("list", { name: "Attach file" })).toHaveTextContent(
			"notes.md",
		);
		expect(within(panel).queryByRole("alert")).toBeNull();
	});

	it("refuses a file over the limit and says the limit", async () => {
		const user = userEvent.setup();
		await working();
		const attach = vi.spyOn(commands, "runAttach");
		mountApp("/flow/feature/wi%3AACME-2?section=chat");
		const panel = await screen.findByRole("tabpanel", { name: "Chat" });
		const big = new File(["a".repeat(200 * 1024 + 1)], "big.txt", { type: "text/plain" });
		await user.upload(await within(panel).findByTestId("attach-input"), big);
		expect(await within(panel).findByRole("alert")).toHaveTextContent(
			"big.txt is larger than 200 KiB.",
		);
		expect(within(panel).queryByRole("list", { name: "Attach file" })).toBeNull();
		// A text file over the limit never reaches the command.
		expect(attach).not.toHaveBeenCalled();
	});
});
