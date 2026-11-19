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
const pick = async (user: ReturnType<typeof userEvent.setup>) =>
	user.click(await screen.findByRole("button", { name: /Estimates mvp-1/ }));
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
