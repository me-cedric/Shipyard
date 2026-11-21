import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { openAccount, openSync } from "./test-open";

const top = async () => within((await screen.findAllByRole("banner"))[0] as HTMLElement);
const alpha = () => unwrap(commands.projectsOpen("/mock/alpha", false));

describe("top row (ux-declutter REQ-009 to REQ-013)", () => {
	it("holds the rail toggle, Back, Forward, the Ask bar, the sync mark, Assistant and Terminal", async () => {
		await alpha();
		mountApp("/home/today");
		const bar = await top();
		await bar.findByRole("button", { name: /^Sync state: / });
		const controls = bar
			.getAllByRole("button")
			.concat(bar.queryAllByRole("link"), bar.queryAllByRole("combobox"));
		expect(controls.length).toBeLessThanOrEqual(13);
		for (const name of ["Hide sidebar", "Back", "Forward", "Assistant", "Terminal"])
			expect(bar.getByRole("button", { name })).toHaveClass("size-(--control-h)");
		// The project is in the rail. The branch, Sync and the files left the row.
		for (const gone of [
			/^Theme: /,
			"Open the manual for this page",
			"Search",
			"Ask",
			/^Activity/,
			"Notifications",
			/^Switch project/,
			/^Account/,
			"Sync",
			"Files",
		])
			expect(bar.queryByRole("button", { name: gone })).toBeNull();
		expect(bar.queryByRole("combobox", { name: "Working branch" })).toBeNull();
		// One bar replaces the search button, the palette and the Ask button.
		const ask = bar.getByRole("combobox", { name: "Ask or tell Shipyard" });
		expect(ask).toHaveClass("min-h-control");
		expect(bar.getByText("Ctrl+K")).toBeInTheDocument();
	});

	// spec:app-redesign#REQ-022: the sync state is one mark, and its card opens Code / Now.
	it("shows the sync state as one mark whose card links to Code / Now", async () => {
		const user = userEvent.setup();
		await alpha();
		const router = mountApp("/today/today");
		const bar = await top();
		expect(await bar.findByRole("button", { name: /^Sync state: / })).toBeVisible();
		const card = await openSync(user);
		expect(card.getByRole("link", { name: /^Changed files \(\d+\)$/ })).toHaveAttribute(
			"href",
			"/code/now",
		);
		expect(card.getByRole("combobox", { name: "Working branch" })).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("opens the account menu with the theme as one choice, the manual and the other entries", async () => {
		const user = userEvent.setup();
		mockState().prefs.customTheme = "ocean";
		// The default theme is light (q:Q-168): the test starts from System to see the change.
		mockState().prefs.theme = "system";
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		const menu = await openAccount(user);
		// The header row opens Setup / Me.
		expect(menu.getByRole("menuitem", { name: /Change$/ })).toBeVisible();
		for (const n of [
			/^Manual/,
			"Shortcuts",
			"What is new",
			"Show the tour again",
			"Check for an update",
			"Language English",
			/^Health/,
		])
			expect(menu.getByRole("menuitem", { name: n })).toBeVisible();
		// The language row is a button that shows the current language.
		expect(menu.getByRole("menuitem", { name: "Language English" })).toHaveTextContent(/^English$/);
		// The version row is an item that does nothing: the arrow keys reach it.
		expect(menu.getByRole("menuitem", { name: /^About Shipyard/ })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		// The shortcuts show beside the items that have one.
		expect(menu.getByRole("menuitem", { name: /^Manual/ })).toHaveTextContent("F1");
		// The theme is one segmented row: three choices in one group.
		const themes = within(menu.getByRole("group", { name: "Theme" }));
		expect(themes.getAllByRole("menuitemradio")).toHaveLength(3);
		expect(
			themes.getByRole("menuitemradio", { name: "Theme: System", checked: true }),
		).toHaveTextContent("System");
		expect(
			themes.getByRole("menuitemradio", { name: "Theme: Light", checked: false }),
		).toBeVisible();
		await user.click(themes.getByRole("menuitemradio", { name: "Theme: Light" }));
		await waitFor(() => expect(mockState().prefs.theme).toBe("light"));
		// A theme choice also clears the custom theme, as the old button did.
		expect(mockState().prefs.customTheme).toBe("");
	});

	it("opens Setup / Me from the header row of the account menu", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home/today");
		const menu = await openAccount(user);
		await user.click(menu.getByRole("menuitem", { name: /Change$/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/me"));
	});

	it("opens the manual from the account menu", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home/today");
		const menu = await openAccount(user);
		await user.click(menu.getByRole("menuitem", { name: /^Manual/ }));
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
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/today/today");
		await user.click(await screen.findByRole("combobox", { name: "Ask or tell Shipyard" }));
		expect(await screen.findByRole("option", { name: /^Assistant/ })).toBeVisible();
		expect(screen.queryByRole("option", { name: "Explain" })).toBeNull();
	});

	it("shows the ahead and behind counts on Sync and the changed files in the card of the sync mark", async () => {
		const user = userEvent.setup();
		await alpha();
		const real = await commands.codeStatus();
		if (real.status !== "ok") throw new Error("no status");
		vi.spyOn(commands, "codeStatus").mockResolvedValue({
			status: "ok",
			data: { ...real.data, ahead: 2, behind: 1 },
		});
		mountApp("/home/today");
		const card = await openSync(user);
		expect(card.getByRole("button", { name: /^Sync/ })).toHaveAccessibleName(
			"Sync 2 ahead 1 behind",
		);
		expect(card.getByRole("link", { name: /^Changed files \(\d+\)$/ })).toHaveAttribute(
			"href",
			"/code/now",
		);
	});
});
