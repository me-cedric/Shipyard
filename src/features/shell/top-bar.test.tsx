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
		const arrows = ["More ways to sync", "Ask the assistant"];
		const controls = bar
			.getAllByRole("button")
			.concat(bar.queryAllByRole("link"), bar.queryAllByRole("combobox"))
			.filter((c) => !arrows.includes(c.getAttribute("aria-label") ?? ""));
		expect(controls.length).toBeLessThanOrEqual(13);
		for (const gone of [/^Theme: /, "Open the manual for this page", "Assistant"])
			expect(bar.queryByRole("button", { name: gone })).toBeNull();
	});

	it("has one Activity button with the counts in its name and the three parts in its panel", async () => {
		const user = userEvent.setup();
		await alpha();
		mountApp("/home/today");
		const bar = await top();
		const button = await bar.findByRole("button", {
			name: /^Activity: Needs you \(\d+\), Active runs \(\d+\), Active sessions \(2\)$/,
		});
		expect(bar.queryByRole("link", { name: /^Active runs/ })).toBeNull();
		expect(bar.queryByRole("button", { name: /^Active sessions/ })).toBeNull();
		await user.click(button);
		const panel = within(await screen.findByRole("dialog"));
		expect(panel.getByRole("link", { name: /^Needs you/ })).toHaveAttribute("href", "/home/today");
		expect(panel.getByRole("link", { name: /^Active runs/ })).toHaveAttribute(
			"href",
			"/factory/runs",
		);
		expect(panel.getByRole("link", { name: "All sessions" })).toHaveAttribute(
			"href",
			"/factory/sessions",
		);
		expect(panel.getAllByRole("button", { name: /^Stop ACME/ }).length).toBeGreaterThan(0);
		// Sessions work, so the live mark shows.
		expect(button.querySelector("[class*='absolute']")).not.toBeNull();
		await user.click(panel.getByRole("button", { name: "Stop Codex beta" }));
		await waitFor(() =>
			expect(mockState().machine.sessions.some((s) => s.pid === 4188)).toBe(false),
		);
	});

	it("stops a live run from the panel after a confirmation", async () => {
		const user = userEvent.setup();
		await alpha();
		const cancel = vi.spyOn(commands, "runCancel");
		mountApp("/home/today");
		await user.click(await (await top()).findByRole("button", { name: /^Activity/ }));
		const panel = within(await screen.findByRole("dialog"));
		await user.click(panel.getAllByRole("button", { name: /^Stop ACME/ })[0] as HTMLElement);
		expect(cancel).not.toHaveBeenCalled();
		await user.click(await panel.findByRole("button", { name: /^Stop .*\?$/ }));
		await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
	});

	it("opens the avatar menu with the theme as one choice, the manual and the other entries", async () => {
		const user = userEvent.setup();
		mockState().prefs.customTheme = "ocean";
		mountApp("/home/today");
		const bar = await top();
		await user.click(await bar.findByRole("button", { name: "Account" }));
		expect(await screen.findByRole("menuitem", { name: "Settings / Me" })).toBeVisible();
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

	it("turns the stop of a run off for a person without the right to start runs", async () => {
		const user = userEvent.setup();
		await alpha();
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mountApp("/home/today");
		await user.click(await (await top()).findByRole("button", { name: /^Activity/ }));
		const panel = within(await screen.findByRole("dialog"));
		const stops = await panel.findAllByRole("button", { name: /^Stop ACME/ });
		for (const s of stops) expect(s).toBeDisabled();
	});

	it("opens the manual from the avatar menu", async () => {
		const user = userEvent.setup();
		const router = mountApp("/home/today");
		await user.click(await (await top()).findByRole("button", { name: "Account" }));
		await user.click(
			await screen.findByRole("menuitem", { name: "Open the manual for this page" }),
		);
		await waitFor(() => expect(router.state.location.pathname).toBe("/knowledge/manual"));
	});

	it("toggles the assistant with the main part of Ask and opens the items with the arrow", async () => {
		const user = userEvent.setup();
		await alpha();
		mountApp("/work/backlog");
		const bar = await top();
		const ask = await bar.findByRole("button", { name: "Ask", pressed: false });
		await user.click(ask);
		expect(await bar.findByRole("button", { name: "Ask", pressed: true })).toBeVisible();
		await user.click(bar.getByRole("button", { name: "Ask the assistant" }));
		expect(await screen.findByRole("menuitem", { name: "Explain" })).toBeVisible();
	});

	it("keeps Ask on a page of no item type, with its arrow off, and shows its shortcut", async () => {
		mountApp("/home/today");
		const bar = await top();
		const ask = await bar.findByRole("button", { name: "Ask" });
		expect(ask).toHaveAttribute("title", expect.stringMatching(/^Ask \(.+\)$/));
		expect(bar.getByRole("button", { name: "Ask the assistant" })).toBeDisabled();
	});

	it("opens the assistant with a canned prompt in the language of the preference", async () => {
		const user = userEvent.setup();
		mockState().prefs.promptLang = "fr";
		await alpha();
		mountApp("/design/decisions");
		await user.click(await (await top()).findByRole("button", { name: "Ask the assistant" }));
		await user.click(await screen.findByRole("menuitem", { name: "Explain" }));
		await waitFor(
			() =>
				expect(
					(screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement).value,
				).toContain("les décisions de ce projet"),
			{ timeout: 10_000 },
		);
	}, 20_000);

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
			"/code/changes",
		);
	});
});
