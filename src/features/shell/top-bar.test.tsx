import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const top = async () => within((await screen.findAllByRole("banner"))[0] as HTMLElement);
const alpha = () => unwrap(commands.projectsOpen("/mock/alpha", false));

describe("top bar (ux-declutter REQ-009 to REQ-013)", () => {
	it("holds 13 controls or fewer at 1100 px, a split button counting as one", async () => {
		await alpha();
		mountApp("/home/today");
		const bar = await top();
		await bar.findByRole("button", { name: "Sync" });
		// The arrow part of a split button belongs to its main part.
		const arrows = ["More ways to sync"];
		const controls = bar
			.getAllByRole("button")
			.concat(bar.queryAllByRole("link"), bar.queryAllByRole("combobox"))
			.filter((c) => !arrows.includes(c.getAttribute("aria-label") ?? ""));
		expect(controls.length).toBeLessThanOrEqual(13);
		for (const gone of [
			/^Theme: /,
			"Open the manual for this page",
			"Assistant",
			"Search",
			"Ask",
			/^Activity/,
			"Notifications",
		])
			expect(bar.queryByRole("button", { name: gone })).toBeNull();
		// One bar replaces the search button, the palette and the Ask button.
		const ask = bar.getByRole("combobox", { name: "Ask or tell Shipyard" });
		expect(ask).toHaveClass("min-h-control");
		expect(bar.getByText("Ctrl+K")).toBeInTheDocument();
	});

	// spec:app-redesign#REQ-022: the sync state is one mark that opens Code / Now.
	it("shows the sync state as a link to Code / Now", async () => {
		await alpha();
		const router = mountApp("/today/today");
		const bar = await top();
		expect(await bar.findByRole("link", { name: /^Sync state: / })).toHaveAttribute(
			"href",
			"/code/now",
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("opens the avatar menu with the theme as one choice, the manual and the other entries", async () => {
		const user = userEvent.setup();
		mockState().prefs.customTheme = "ocean";
		// The default theme is light (q:Q-168): the test starts from System to see the change.
		mockState().prefs.theme = "system";
		mountApp("/home/today");
		const bar = await top();
		await user.click(await bar.findByRole("button", { name: "Account" }));
		expect(await screen.findByRole("menuitem", { name: "Setup / Me" })).toBeVisible();
		for (const n of [
			"Open the manual for this page",
			"Keyboard shortcuts",
			"What's new",
			"Replay the tour",
		])
			expect(screen.getByRole("menuitem", { name: n })).toBeVisible();
		// The shortcuts show beside the items that have one.
		expect(
			screen.getByRole("menuitem", { name: "Open the manual for this page" }),
		).toHaveTextContent("F1");
		const system = screen.getByRole("menuitemradio", { name: "Theme: System", checked: true });
		expect(system).toHaveTextContent("✓");
		expect(
			screen.getByRole("menuitemradio", { name: "Theme: Light", checked: false }),
		).toBeVisible();
		await user.click(screen.getByRole("menuitemradio", { name: "Theme: Light" }));
		await waitFor(() => expect(mockState().prefs.theme).toBe("light"));
		// A theme choice also clears the custom theme, as the old button did.
		expect(mockState().prefs.customTheme).toBe("");
	});

	it("opens the manual from the avatar menu", async () => {
		const user = userEvent.setup();
		const router = mountApp("/home/today");
		await user.click(await (await top()).findByRole("button", { name: "Account" }));
		await user.click(
			await screen.findByRole("menuitem", { name: "Open the manual for this page" }),
		);
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/manual"));
	});

	it("lists the canned prompts of the page under Do, in the language of the preference", async () => {
		const user = userEvent.setup();
		mockState().prefs.promptLang = "fr";
		await alpha();
		mountApp("/library/decisions");
		await user.click(await screen.findByRole("combobox", { name: "Ask or tell Shipyard" }));
		await user.click(await screen.findByRole("option", { name: "Explain" }));
		await waitFor(
			() =>
				expect(
					(screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement).value,
				).toContain("les décisions de ce projet"),
			{ timeout: 10_000 },
		);
	}, 20_000);

	it("lists no canned prompt on a page of no item type", async () => {
		const user = userEvent.setup();
		mountApp("/today/today");
		await user.click(await screen.findByRole("combobox", { name: "Ask or tell Shipyard" }));
		expect(await screen.findByRole("option", { name: /^Assistant/ })).toBeVisible();
		expect(screen.queryByRole("option", { name: "Explain" })).toBeNull();
	});

	it("shows the ahead and behind counts on Sync and the changed files in the status bar", async () => {
		await alpha();
		const real = await commands.codeStatus();
		if (real.status !== "ok") throw new Error("no status");
		vi.spyOn(commands, "codeStatus").mockResolvedValue({
			status: "ok",
			data: { ...real.data, ahead: 2, behind: 1 },
		});
		mountApp("/home/today");
		const sync = await (await top()).findByRole("button", { name: /^Sync/ });
		expect(sync).toHaveAccessibleName("Sync 2 ahead 1 behind");
		const bar = within((await screen.findByRole("contentinfo")) as HTMLElement);
		expect(await bar.findByRole("link", { name: /^Changed files \(\d+\)$/ })).toHaveAttribute(
			"href",
			"/code/now",
		);
	});
});
