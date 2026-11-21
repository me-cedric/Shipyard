import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

// spec:shell-setup-rights#REQ-007: the budget notice, Sound and the Release channel of Setup / Me.
describe("Setup / Me: budget notice, Sound and Release channel", () => {
	it("has the budget notice that follows Warn at, with 80 % until Warn at has a setting", async () => {
		const user = userEvent.setup();
		const router = mountApp("/setup/me");
		const budget = await screen.findByRole("switch", { name: "A budget reaches 80 %" });
		expect(budget).toBeChecked();
		await user.click(budget);
		await waitFor(() => expect(mockState().prefs.notifyOff).toContain("budget"));
		await user.click(screen.getByRole("switch", { name: "A budget reaches 80 %" }));
		await waitFor(() => expect(mockState().prefs.notifyOff).not.toContain("budget"));
		await idle(router);
	});

	it("turns the sound off and on", async () => {
		const user = userEvent.setup();
		const router = mountApp("/setup/me");
		const sound = await screen.findByRole("switch", { name: "Sound" });
		expect(sound).toBeChecked();
		await user.click(sound);
		await waitFor(() => expect(mockState().prefs.sound).toBe(false));
		await idle(router);
	});

	it("picks the release channel, and Preview considers the pre-releases of the address", async () => {
		const user = userEvent.setup();
		const router = mountApp("/setup/me");
		mockState().prefs.releaseUrl = "https://example.com/prerelease/releases/latest";
		expect((await unwrap(commands.updateCheck())).newer).toBe(false);
		expect(await screen.findByRole("button", { name: "Stable" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await user.click(screen.getByRole("button", { name: "Preview" }));
		await waitFor(() => expect(mockState().prefs.releaseChannel).toBe("preview"));
		const info = await unwrap(commands.updateCheck());
		expect(info).toMatchObject({ newer: true, latest: "0.3.0-beta.1" });
		await idle(router);
	});
});

describe("the budget notice", () => {
	it("shows a notification when a budget reaches Warn at, and none when the source is off", async () => {
		await unwrap(commands.machineBudgetSet("", 0.01));
		const status = await unwrap(commands.budgetStatus());
		expect(status.warnPercent).toBe(80);
		expect(status.reached.map((r) => r.runner)).toEqual([""]);
		mountApp("/today");
		expect((await screen.findAllByText("A budget reached 80 %")).length).toBeGreaterThan(0);
	});

	it("shows nothing for a budget that is far from Warn at", async () => {
		await unwrap(commands.machineBudgetSet("", 1_000_000));
		expect((await unwrap(commands.budgetStatus())).reached).toEqual([]);
		mountApp("/today");
		await screen.findByRole("navigation", { name: "Sidebar" });
		expect(screen.queryByText("A budget reached 80 %")).toBeNull();
	});

	it("is muted by the source budget", async () => {
		await unwrap(commands.machineBudgetSet("", 0.01));
		await unwrap(commands.prefsSet({ notifyOff: ["budget"] }));
		mountApp("/today");
		await screen.findByRole("navigation", { name: "Sidebar" });
		expect(screen.queryByText("A budget reached 80 %")).toBeNull();
	});
});
