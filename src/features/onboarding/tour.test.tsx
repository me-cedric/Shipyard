import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const o = en.onboarding;
const titles = Object.values(o.steps).map((s) => s.title);

describe("Onboarding tour", () => {
	it("opens once on a fresh install, turns with Next and the arrows, and Escape ends it for good", async () => {
		const user = userEvent.setup();
		mockState().prefs.tourSeen = false;
		mountApp("/home/today");
		const dialog = await screen.findByRole("dialog", { name: titles[0] });
		expect(within(dialog).getByText(o.steps.loop.body)).toBeInTheDocument();
		expect(within(dialog).getByText("Step 1 of 6")).toBeInTheDocument();
		await user.click(within(dialog).getByRole("button", { name: o.next }));
		expect(await screen.findByRole("dialog", { name: titles[1] })).toBeInTheDocument();
		await user.keyboard("{ArrowRight}");
		expect(await screen.findByRole("dialog", { name: titles[2] })).toBeInTheDocument();
		await user.keyboard("{ArrowLeft}");
		expect(await screen.findByRole("dialog", { name: titles[1] })).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(mockState().prefs.tourSeen).toBe(true));
	});

	it("stays closed once seen, replays from the palette at step 1 and ends on the manual", async () => {
		const user = userEvent.setup();
		const router = mountApp("/home/today");
		await screen.findByRole("navigation", { name: "Sidebar" });
		expect(screen.queryByRole("dialog")).toBeNull();
		await user.keyboard("{Control>}k{/Control}");
		await user.type(await screen.findByRole("combobox"), o.replay);
		await user.keyboard("{Enter}");
		const first = await screen.findByRole("dialog", { name: titles[0] });
		expect(within(first).queryByRole("button", { name: o.back })).toBeNull();
		for (const title of titles.slice(1)) {
			await user.click(screen.getByRole("button", { name: o.next }));
			expect(await screen.findByRole("dialog", { name: title })).toBeInTheDocument();
		}
		expect(screen.queryByRole("button", { name: o.next })).toBeNull();
		await user.click(screen.getByRole("button", { name: o.manual }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/knowledge/manual"));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("asks for a permission after a click and sends a test notification", async () => {
		const user = userEvent.setup();
		mockState().prefs.tourSeen = false;
		mountApp("/home/today");
		await screen.findByRole("dialog", { name: titles[0] });
		for (let i = 0; i < 4; i++) await user.keyboard("{ArrowRight}");
		const dialog = await screen.findByRole("dialog", { name: o.steps.permissions.title });
		const row = await within(dialog).findByRole("group", {
			name: o.permissions.kind.notifications,
		});
		expect(within(row).getByText(o.permissions.state.notAsked)).toBeInTheDocument();
		await user.click(within(row).getByRole("button", { name: o.permissions.allow }));
		expect(await within(row).findByText(o.permissions.state.on)).toBeInTheDocument();
		await user.click(within(row).getByRole("button", { name: o.permissions.test }));
		await waitFor(() =>
			expect(mockState().os).toContainEqual({ title: "Shipyard", body: o.permissions.testBody }),
		);
		const files = within(dialog).getByRole("group", { name: o.permissions.kind.files });
		expect(within(files).getByRole("button", { name: o.permissions.allow })).toBeInTheDocument();
	});

	it("shows the permissions and Replay the tour in Settings / Me", async () => {
		const user = userEvent.setup();
		mockState().permissions[1] = { kind: "files", state: "off", settings: true };
		mountApp("/settings/me");
		const files = await screen.findByRole("group", { name: o.permissions.kind.files });
		expect(within(files).getByText(o.permissions.state.off)).toBeInTheDocument();
		expect(within(files).getByRole("button", { name: o.permissions.settings })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: o.replay }));
		expect(await screen.findByRole("dialog", { name: titles[0] })).toBeInTheDocument();
	});

	it("speaks French", async () => {
		mockState().prefs.tourSeen = false;
		mockState().prefs.lang = "fr";
		mountApp("/home/today");
		expect(
			await screen.findByRole("dialog", { name: "Une boucle, de l'idée au code fusionné" }),
		).toBeInTheDocument();
	});
});
