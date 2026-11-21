import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const setup = async () => {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	const runs = mockState().factory.runs;
	runs.forEach((r, i) => {
		r.state = i < 2 ? "Working" : "Done";
	});
	const user = userEvent.setup();
	const router = mountApp("/home/today");
	await user.click(await screen.findByRole("button", { name: /^Project/ }));
	await user.click(await screen.findByRole("menuitem", { name: "Close project" }));
	return { user, router, dialog: within(await screen.findByRole("dialog")) };
};
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

// spec:shell-setup-rights#REQ-012: Cancel, Stop them and close, and Keep them working.
describe("Ask before a project closes", () => {
	it("asks with the number of agents and closes nothing on Cancel", async () => {
		const { user, router, dialog } = await setup();
		expect(dialog.getByRole("heading", { name: "Agents still work: 2" })).toBeInTheDocument();
		await user.click(dialog.getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(await unwrap(commands.projectsActive())).not.toBeNull();
		expect(mockState().factory.runs.filter((r) => r.state === "Working")).toHaveLength(2);
		await idle(router);
	});

	it("Stop them and close stops the runs and closes the project", async () => {
		const { user, router, dialog } = await setup();
		await user.click(dialog.getByRole("button", { name: "Stop them and close" }));
		await waitFor(async () => expect(await unwrap(commands.projectsActive())).toBeNull());
		expect(mockState().factory.runs.filter((r) => r.state === "Working")).toHaveLength(0);
		await idle(router);
	});

	it("Keep them working closes the project and the runs go on", async () => {
		const { user, router, dialog } = await setup();
		await user.click(dialog.getByRole("button", { name: "Keep them working" }));
		await waitFor(async () => expect(await unwrap(commands.projectsActive())).toBeNull());
		expect(mockState().factory.runs.filter((r) => r.state === "Working")).toHaveLength(2);
		await idle(router);
	});

	it("closes at once when no agent works", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		for (const r of mockState().factory.runs) r.state = "Done";
		const user = userEvent.setup();
		const router = mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: /^Project/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Close project" }));
		await waitFor(async () => expect(await unwrap(commands.projectsActive())).toBeNull());
		expect(screen.queryByRole("dialog")).toBeNull();
		await idle(router);
	});
});
