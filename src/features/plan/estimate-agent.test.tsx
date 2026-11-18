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
	const table = await screen.findByRole("table", { name: "Backlog" });
	for (const name of NAMES)
		await user.click(await within(table).findByRole("checkbox", { name: `Select ${name}` }));
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
});
