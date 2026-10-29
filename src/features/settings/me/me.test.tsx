import { screen, waitFor, within } from "@testing-library/react";
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
