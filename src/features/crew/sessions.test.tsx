import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));
const sheet = () => JSON.stringify(mockState().work.sheets["mvp-1"]);
/** Starts an estimate of the sheet that runs until its stop. */
function hold() {
	mockState().estimateAgent = { hold: true, running: {} };
	const task = mockState().work.sheets["mvp-1"]?.features[0]?.tasks[0]?.id;
	if (!task) throw new Error("no task");
	return unwrap(commands.estimateAgentStart("mvp-1", [task], true)).catch((e: unknown) => e);
}
/** The panel shows one session: pick the estimate in the list first. */
const pick = async (user: ReturnType<typeof userEvent.setup>, name = /Estimates mvp-1/) => {
	// The list shows its first rows: Show all adds the rest.
	await user.click(await screen.findByRole("button", { name: /^Show all \d+$/ }));
	await user.click(await screen.findByRole("button", { name }));
};
const estimates = async () =>
	(await unwrap(commands.sessionsList())).filter((s) => s.step === "estimate");

// spec:app-redesign#REQ-033: an estimate is a session, and the person stops it in Crew.
describe("Crew / Sessions: an estimate of an agent", () => {
	it("stops the estimate with Stop and leaves the sheet as it was", async () => {
		const user = userEvent.setup();
		await withTracker();
		const before = sheet();
		const turn = hold();
		expect(await estimates()).toHaveLength(1);
		const router = mountApp("/crew/sessions");
		await pick(user);
		await user.click(await screen.findByRole("button", { name: "Stop mvp-1" }));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Stop mvp-1" })).toBeNull());
		await turn;
		expect(await estimates()).toEqual([]);
		expect(sheet()).toBe(before);
		await idle(router);
	});

	it("opens the sheet of the estimate, not a run page", async () => {
		const user = userEvent.setup();
		await withTracker();
		const turn = hold();
		const router = mountApp("/crew/sessions");
		await pick(user);
		// The estimate is the session shown: its panel opens the sheet.
		const panel = within(
			await screen.findByRole("region", { name: "Live output of Estimates mvp-1" }),
		);
		await user.click(panel.getByRole("button", { name: "Open" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/plan/estimates"));
		expect(router.state.location.search).toEqual({ sheet: "mvp-1" });
		await unwrap(commands.estimateAgentStop("mvp-1"));
		await turn;
		await idle(router);
	});

	it("turns Stop off without the right to start runs", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().person = {
			member: "ada",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		const turn = hold();
		const router = mountApp("/crew/sessions");
		await pick(user);
		const stop = await screen.findByRole("button", { name: "Stop mvp-1" });
		await waitFor(() => expect(stop).toBeDisabled());
		await unwrap(commands.estimateAgentStop("mvp-1"));
		await turn;
		await idle(router);
	});
});

// spec:app-redesign#REQ-016: the panel of a run session stops the run after a confirmation.
describe("Crew / Sessions: Stop of a run session", () => {
	const liveRun = async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const s = (await unwrap(commands.sessionsList())).find(
			(x) => x.state === "running" && x.pull == null && x.step !== "estimate",
		);
		if (!s) throw new Error("the demo has a running session");
		const run = mockState().factory.runs.find((r) => r.id === s.run);
		if (!run) throw new Error("no run");
		return { s, run };
	};

	it("asks first, ends the run as cancelled on Yes and does nothing on No", async () => {
		const user = userEvent.setup();
		const { s, run } = await liveRun();
		const router = mountApp(`/crew/sessions?session=${encodeURIComponent(`${s.run}/${s.step}`)}`);
		const panel = within(await screen.findByRole("region", { name: /^Live output of/ }));
		await user.click(panel.getByRole("button", { name: "Stop" }));
		// Leaving the question is No: the run goes on.
		await user.click(document.body);
		expect(panel.queryByRole("button", { name: /^Stop .*\?$/ })).toBeNull();
		expect(run.state).not.toBe("Cancelled");
		await user.click(panel.getByRole("button", { name: "Stop" }));
		await user.click(panel.getByRole("button", { name: /^Stop .*\?$/ }));
		await waitFor(() => expect(run.state).toBe("Cancelled"));
		await idle(router);
	});
});

// spec:app-redesign#REQ-033: a tile build is a session, and the person stops it in Crew.
describe("Crew / Sessions: a tile build", () => {
	it("shows Stop on the build and Stop ends it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const build = unwrap(commands.dashboardTileBuild("team", "Runs", 1)).catch((e) => e);
		const router = mountApp("/crew/sessions");
		await pick(user, /Dashboard tile team/);
		await user.click(await screen.findByRole("button", { name: "Stop team" }));
		expect(await build).toMatchObject({ code: "stopped" });
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: /Dashboard tile team/ })).toBeNull(),
		);
		await idle(router);
	});
});

// spec:app-redesign#REQ-016: the list shows the first rows and a button that shows the rest.
describe("Crew / Sessions: the list", () => {
	it("shows three rows and Show all shows the rest", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/sessions");
		const here = async () =>
			(await screen.findByRole("region", { name: "On this machine" })).querySelectorAll(
				"[aria-pressed]",
			);
		const more = await screen.findByRole("button", { name: /^Show all \d+$/ });
		const count = Number(more.textContent?.replace("Show all ", ""));
		expect(count).toBeGreaterThan(3);
		expect(await here()).toHaveLength(3);
		await user.click(more);
		expect(await here()).toHaveLength(count);
		expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
		await idle(router);
	});
});
