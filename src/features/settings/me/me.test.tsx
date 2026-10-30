import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

async function choose(user: ReturnType<typeof userEvent.setup>, field: string, option: string) {
	await user.click(await screen.findByRole("combobox", { name: field }));
	await user.click(await screen.findByRole("option", { name: option }));
}

describe("Settings / Me (shell REQ-010)", () => {
	it("saves the theme for the person, not for a project", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await choose(user, "Theme", "Dark");
		await waitFor(() => expect(mockState().prefs.theme).toBe("dark"));
		expect(document.documentElement.dataset.theme).toBe("dark");
	});

	it("saves density and contrast with a switch", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await user.click(await screen.findByRole("switch", { name: "Compact" }));
		await user.click(screen.getByRole("switch", { name: "High contrast" }));
		await waitFor(() => expect(mockState().prefs.density).toBe("compact"));
		expect(mockState().prefs.contrast).toBe("high");
	});

	it("saves the role", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await choose(user, "Role", "Developer");
		await waitFor(() => expect(mockState().prefs.role).toBe("developer"));
	});
});

describe("Settings / Me fonts, terminal and agent (Legacy preferences)", () => {
	it("saves the fonts, the shell, the terminal size and the default agent", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await choose(user, "Interface font", "Serif");
		await choose(user, "Code font", "Menlo");
		await waitFor(() => expect(mockState().prefs.uiFont).toBe("serif"));
		expect(mockState().prefs.codeFont).toBe("menlo");
		expect(document.documentElement.style.getPropertyValue("--font-sans")).toContain("Charter");
		const shell = await screen.findByRole("textbox", { name: "Shell" });
		await user.type(shell, "/bin/zsh");
		await user.tab();
		await waitFor(() => expect(mockState().prefs.terminalShell).toBe("/bin/zsh"));
		const size = screen.getByRole("spinbutton", { name: "Terminal font size" });
		await user.clear(size);
		await user.type(size, "90");
		await user.tab();
		await waitFor(() => expect(mockState().prefs.terminalFontSize).toBe(24));
		await choose(user, "Default agent", "codex");
		await waitFor(() => expect(mockState().prefs.defaultAgent).toBe("codex"));
	});
});

describe("Settings / Me notifications (shell REQ-008)", () => {
	it("turns a source off and on through notifyOff", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		const sw = await screen.findByRole("switch", { name: "Approval" });
		expect(sw).toBeChecked();
		await user.click(sw);
		await waitFor(() => expect(mockState().prefs.notifyOff).toEqual(["approval"]));
		await user.click(screen.getByRole("switch", { name: "Failed sync" }));
		await waitFor(() => expect(mockState().prefs.notifyOff).toEqual(["approval", "sync-failure"]));
		await user.click(screen.getByRole("switch", { name: "Approval" }));
		await waitFor(() => expect(mockState().prefs.notifyOff).toEqual(["sync-failure"]));
	});

	it("keeps both changes when two switches turn off in quick succession", async () => {
		mountApp("/settings/me");
		const a = await screen.findByRole("switch", { name: "Approval" });
		const b = screen.getByRole("switch", { name: "Failed sync" });
		fireEvent.click(a);
		fireEvent.click(b);
		await waitFor(() =>
			expect([...mockState().prefs.notifyOff].sort()).toEqual(["approval", "sync-failure"]),
		);
	});
});

describe("language switch (shell REQ-011)", () => {
	it("applies French to the sidebar and the palette without a restart, and keeps it", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await choose(user, "Language", "French");
		await screen.findByRole("navigation", { name: "Barre latérale" });
		expect(document.documentElement.lang).toBe("fr");
		await user.keyboard("{Control>}k{/Control}");
		expect(await screen.findByRole("option", { name: /Basculer l'inspecteur/ })).toBeVisible();
		expect(mockState().prefs.lang).toBe("fr");
		await user.keyboard("{Escape}");
		const nav = within(await screen.findByRole("navigation", { name: "Barre latérale" }));
		expect(nav.getAllByRole("link")).toHaveLength(8);
	});
});
