import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const NAMES = ["Token API", "Login form", "Export endpoint"];
const sheet = () => JSON.stringify(mockState().work.sheets["mvp-1"]);
const ask = () => screen.findByRole("button", { name: "Ask an agent to estimate" });

async function pick(user: ReturnType<typeof userEvent.setup>) {
	// The selection is behind More.
	await user.click(await screen.findByRole("button", { name: "More" }));
	await user.click(await screen.findByRole("menuitem", { name: "Search and select" }));
	for (const name of NAMES)
		await user.click(await screen.findByRole("checkbox", { name: `Select ${name}` }));
}

describe("Plan / Estimates: ask an agent to estimate", () => {
	it("shows a proposal for each of three selected tasks and keeps the values of the sheet", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		// No task is selected: the action is off.
		expect(await ask()).toBeDisabled();
		await pick(user);
		const before = sheet();
		await user.click(await ask());
		const list = within(await screen.findByRole("region", { name: "Proposals of the agent" }));
		for (const name of NAMES) {
			const row = within(list.getByRole("listitem", { name }));
			for (const label of ["Best", "Likely", "Worst"])
				expect(row.getByText(label, { selector: "dt" })).toBeInTheDocument();
			expect(row.getByText(`${name} needs no new service.`)).toBeInTheDocument();
		}
		// Export endpoint has 6 days in the sheet: the agent proposes 3.5, 7 and 14.
		const row = list.getByRole("listitem", { name: "Export endpoint" });
		expect(row).toHaveTextContent("— → 3.5");
		expect(row).toHaveTextContent("6 → 7");
		expect(row).toHaveTextContent("— → 14");
		expect(sheet()).toBe(before);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("puts the three values of an accepted task in the sheet, and drops a discarded proposal", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await pick(user);
		await user.click(await ask());
		const list = within(await screen.findByRole("region", { name: "Proposals of the agent" }));
		const task = (id: string) =>
			mockState()
				.work.sheets["mvp-1"]?.features.flatMap((f) => f.tasks)
				.find((x) => x.id === id);
		const login = JSON.stringify(task("auth-web"));
		await user.click(
			within(list.getByRole("listitem", { name: "Export endpoint" })).getByRole("button", {
				name: "Accept",
			}),
		);
		await waitFor(() =>
			expect(task("export-api")).toMatchObject({
				days: 7,
				optimistic: 3.5,
				pessimistic: 14,
				assumptions: "Export endpoint needs no new service.",
			}),
		);
		await waitFor(() =>
			expect(list.queryByRole("listitem", { name: "Export endpoint" })).toBeNull(),
		);
		await user.click(
			within(list.getByRole("listitem", { name: "Login form" })).getByRole("button", {
				name: "Discard",
			}),
		);
		expect(list.queryByRole("listitem", { name: "Login form" })).toBeNull();
		// The other tasks keep their values.
		expect(JSON.stringify(task("auth-web"))).toBe(login);
		expect(list.getByRole("listitem", { name: "Token API" })).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("keeps the values of the first accepted task when a second task is accepted", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await pick(user);
		await user.click(await ask());
		const list = within(await screen.findByRole("region", { name: "Proposals of the agent" }));
		const accept = (name: string) =>
			within(list.getByRole("listitem", { name })).getByRole("button", { name: "Accept" });
		const task = (id: string) =>
			mockState()
				.work.sheets["mvp-1"]?.features.flatMap((f) => f.tasks)
				.find((x) => x.id === id);
		await user.click(accept("Export endpoint"));
		// A save runs: the other proposals wait for it.
		const next = list.queryByRole("listitem", { name: "Login form" });
		if (next) await waitFor(() => expect(accept("Login form")).toBeEnabled());
		await user.click(accept("Login form"));
		await waitFor(() =>
			expect(task("auth-web")).toMatchObject({
				assumptions: "Login form needs no new service.",
			}),
		);
		expect(task("export-api")).toMatchObject({ days: 7, optimistic: 3.5, pessimistic: 14 });
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("turns Accept and Discard off while a save runs", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/estimates");
		await pick(user);
		await user.click(await ask());
		const list = within(await screen.findByRole("region", { name: "Proposals of the agent" }));
		// The save does not end before the test lets it.
		let end = () => {};
		const save = vi.spyOn(commands, "estimateSave").mockReturnValue(
			new Promise((_, fail) => {
				end = () => fail("held");
			}),
		);
		const row = within(list.getByRole("listitem", { name: "Login form" }));
		await user.click(
			within(list.getByRole("listitem", { name: "Export endpoint" })).getByRole("button", {
				name: "Accept",
			}),
		);
		await waitFor(() => expect(row.getByRole("button", { name: "Accept" })).toBeDisabled());
		expect(row.getByRole("button", { name: "Discard" })).toBeDisabled();
		await user.click(row.getByRole("button", { name: "Accept" }));
		expect(save).toHaveBeenCalledTimes(1);
		end();
		await waitFor(() => expect(row.getByRole("button", { name: "Accept" })).toBeEnabled());
		save.mockRestore();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("is off on a frozen sheet, with the reason", async () => {
		await withTracker();
		const frozen = mockState().work.sheets["mvp-1"];
		if (frozen) frozen.frozen = true;
		const router = mountApp("/plan/estimates");
		expect(await ask()).toBeDisabled();
		expect(await ask()).toHaveAccessibleDescription("Frozen");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("is off on a sealed sheet and on a frozen sheet", async () => {
		const user = userEvent.setup();
		await withTracker();
		// Sealed, and open on this machine: the sheet shows, the action is off.
		Object.assign(mockState().work, { sealed: "s3cret", unlocked: true });
		const router = mountApp("/plan/estimates");
		await pick(user);
		expect(await ask()).toBeDisabled();
		expect(await ask()).toHaveAccessibleDescription("The sheet is sealed");
		await expect(unwrap(commands.estimateAgentStart("mvp-1", ["auth-api"], true))).rejects.toThrow(
			/sealed/,
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows as a session while it runs, and Stop leaves the sheet as it was", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().estimateAgent = { hold: true, running: {} };
		const router = mountApp("/plan/estimates");
		await pick(user);
		const before = sheet();
		await user.click(await ask());
		const stop = await screen.findByRole("button", { name: "Stop" });
		expect(await ask()).toHaveAttribute("aria-busy", "true");
		const sessions = await unwrap(commands.sessionsList());
		expect(sessions.map((s) => [s.key, s.step, s.state])).toContainEqual([
			"mvp-1",
			"estimate",
			"running",
		]);
		await user.click(stop);
		await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
		expect(await screen.findByRole("alert")).toHaveTextContent("the estimate was stopped");
		expect(screen.queryByRole("region", { name: "Proposals of the agent" })).toBeNull();
		expect(sheet()).toBe(before);
		expect((await unwrap(commands.sessionsList())).filter((s) => s.step === "estimate")).toEqual(
			[],
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("stops when a person stops all agents", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().estimateAgent = { hold: true, running: {} };
		const router = mountApp("/plan/estimates");
		await pick(user);
		const before = sheet();
		await user.click(await ask());
		await screen.findByRole("button", { name: "Stop" });
		await unwrap(commands.killSwitchSet(true));
		expect(await screen.findByRole("alert")).toHaveTextContent("the estimate was stopped");
		expect(sheet()).toBe(before);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
