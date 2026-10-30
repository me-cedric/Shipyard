import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { ShellProvider, useShell } from "@/lib/shell";
import { bindable, chordOf, chordText } from "@/lib/shell/shortcuts";
import { mountApp } from "@/test/mount";
import { CloseGuard } from "./close-guard";
import { MENU_ACTIONS, menuLabels } from "./events";

const dialog = async () => within(await screen.findByRole("dialog"));

describe("shortcut chords", () => {
	it("reads a key event as a chord, with digits by physical key", () => {
		const e = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
		expect(chordOf(e({ key: "S", ctrlKey: true, shiftKey: true }))).toBe("mod+shift+s");
		expect(chordOf(e({ key: "&", code: "Digit1", metaKey: true }))).toBe("mod+1");
		expect(chordOf(e({ key: "Shift", shiftKey: true }))).toBe("");
		expect(chordText("mod+shift+s")).toMatch(/S$/);
	});

	it("binds only a chord that holds Mod and a key", () => {
		expect(bindable("mod+k")).toBe(true);
		expect(bindable("k")).toBe(false);
		expect(bindable("mod+")).toBe(false);
	});
});

describe("keyboard shortcuts overlay (shell REQ-005)", () => {
	it("opens with its chord and lists each action with its chord", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
		const d = await dialog();
		expect(await d.findByText("Ctrl+Shift+S")).toBeVisible();
		expect(d.getByRole("button", { name: "Change Sync" })).toBeVisible();
		expect(d.getByText("Ctrl+K")).toBeVisible();
	});

	it("rebinds an action, runs it with the new chord and stores it in the preferences", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
		const d = await dialog();
		await user.click(await d.findByRole("button", { name: "Change Toggle sidebar" }));
		await user.keyboard("{Control>}{Shift>}y{/Shift}{/Control}");
		await waitFor(() => expect(mockState().prefs.shortcuts["toggle-sidebar"]).toBe("mod+shift+y"));
		expect(await d.findByText("Ctrl+Shift+Y")).toBeVisible();
		expect(await d.findByRole("button", { name: "Reset Toggle sidebar" })).toBeVisible();
		await user.click(d.getByRole("button", { name: "Reset Toggle sidebar" }));
		await waitFor(() => expect(mockState().prefs.shortcuts).toEqual({}));
	});

	it("refuses a chord that another action holds and a chord without Mod", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
		const d = await dialog();
		await user.click(await d.findByRole("button", { name: "Change Toggle sidebar" }));
		await user.keyboard("{Control>}k{/Control}");
		expect(await d.findByRole("status")).toHaveTextContent("Ctrl+K is used by Command palette.");
		await user.keyboard("x");
		expect(await d.findByRole("status")).toHaveTextContent("Use Ctrl or Cmd with another key.");
		expect(mockState().prefs.shortcuts).toEqual({});
	});

	it("keeps a stored chord after a reload of the preferences", async () => {
		const user = userEvent.setup();
		await unwrap(commands.prefsSet({ shortcuts: { "toggle-inspector": "mod+shift+u" } }));
		mountApp("/home");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}{Shift>}u{/Shift}{/Control}");
		await waitFor(() =>
			expect(screen.getByLabelText("Inspector", { selector: "aside" })).toHaveAttribute(
				"data-open",
				"true",
			),
		);
	});
});

describe("native menu", () => {
	it("labels each item that runs a palette action, in both languages", () => {
		for (const t of [en, fr]) {
			const labels = menuLabels(t);
			for (const id of MENU_ACTIONS) expect(labels[id], id).toBeTruthy();
			expect(labels.go).toBeTruthy();
		}
		expect(menuLabels(en)["go-factory"]).toBe("Factory");
		expect(menuLabels(fr)["shortcuts-help"]).toBe("Raccourcis clavier");
	});
});

function Open() {
	const { setCloseGuardOpen } = useShell();
	return (
		<button type="button" onClick={() => setCloseGuardOpen(true)}>
			ask
		</button>
	);
}

describe("close guard", () => {
	const mount = () =>
		render(
			<Providers>
				<ShellProvider>
					<Open />
					<CloseGuard />
				</ShellProvider>
			</Providers>,
		);

	it("names the work in flight and closes only after Close anyway", async () => {
		const user = userEvent.setup();
		mockState().inFlight = { runs: 2, turns: 1 };
		mount();
		await user.click(await screen.findByRole("button", { name: "ask" }));
		const d = await dialog();
		expect(await d.findByText("2 runs and 1 assistant turns are in progress.")).toBeVisible();
		expect(mockState().closed).toBe(false);
		await user.click(d.getByRole("button", { name: "Close anyway" }));
		await waitFor(() => expect(mockState().closed).toBe(true));
	});

	it("keeps the window open on Close", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(await screen.findByRole("button", { name: "ask" }));
		await user.click(
			await within(await screen.findByRole("dialog")).findByRole("button", { name: "Close" }),
		);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(mockState().closed).toBe(false);
	});
});
