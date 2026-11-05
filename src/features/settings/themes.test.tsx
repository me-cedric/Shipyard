import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { BAD_THEME_PATH, SAMPLE_THEME, THEME_PATH } from "@/lib/ipc/mock-themes";
import { NEXT_THEME, resolveTheme, themeVars } from "@/lib/themes";
import { mountApp } from "@/test/mount";

async function choose(user: ReturnType<typeof userEvent.setup>, field: string, option: string) {
	await user.click(await screen.findByRole("combobox", { name: field }));
	await user.click(await screen.findByRole("option", { name: option }));
}

async function importSample(user: ReturnType<typeof userEvent.setup>, path = THEME_PATH) {
	mockState().nextFile = path;
	await user.click(await screen.findByRole("button", { name: "Import" }));
	return screen.findByRole("dialog");
}

describe("themes: OLED and the theme choice (REQ-001, REQ-002)", () => {
	it("offers five themes and applies OLED", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await user.click(await screen.findByRole("combobox", { name: "Theme" }));
		for (const name of ["Light", "Dark", "OLED", "System", "System, OLED when dark"])
			expect(await screen.findByRole("option", { name })).toBeInTheDocument();
		await user.click(screen.getByRole("option", { name: "OLED" }));
		await waitFor(() => expect(mockState().prefs.theme).toBe("oled"));
		expect(document.documentElement.dataset.theme).toBe("oled");
	});

	it("cycles Light, Dark, OLED, System and resolves System with OLED", () => {
		expect([NEXT_THEME.light, NEXT_THEME.dark, NEXT_THEME.oled, NEXT_THEME.system]).toEqual([
			"dark",
			"oled",
			"system",
			"light",
		]);
		expect(resolveTheme("system-oled", true)).toBe("oled");
		expect(resolveTheme("system-oled", false)).toBe("light");
		expect(resolveTheme("system", true)).toBe("system");
	});
});

describe("themes: the theme file (REQ-003)", () => {
	it("derives the surfaces from the simple level and lets a token win", () => {
		const v = themeVars({ ...SAMPLE_THEME, tokens: { "surface-1": "#111" } });
		expect(v["--surface-0"]).toBe("#0b1622");
		expect(v["--surface-1"]).toBe("#111");
		expect(v["--surface-2"]).toContain("color-mix(in oklch, var(--n-12) 7%, #0b1622)");
		expect(v["--n-12"]).toBe("#e6edf3");
		expect(v["--n-11"]).toContain("75%");
		expect(themeVars(SAMPLE_THEME)["--n-11"]).toBe("#9fb3c8");
		expect(v["--accent"]).toBe("#3bb9fd");
		expect(v["--radius-md"]).toBe("6px");
		expect(Object.values(v).join(" ")).not.toMatch(/url\(/);
	});

	it("moves the grey scale from the text colour alone", () => {
		const v = themeVars({ shipyardTheme: 1, id: "x", name: "X", base: "dark", foreground: "#eee" });
		expect(v["--n-11"]).toBe("color-mix(in oklch, var(--n-12) 75%, var(--surface-0))");
		expect(v["--n-1"]).toBeUndefined();
		expect(v["--surface-1"]).toBeUndefined();
	});
});

describe("themes: import, preview, export and remove (REQ-005 to REQ-008, REQ-010)", () => {
	it("shows the preview, and Cancel saves nothing", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		const dialog = await importSample(user);
		expect(within(dialog).getByText("Harbor night", { selector: "h2" })).toBeInTheDocument();
		await user.click(within(dialog).getByRole("button", { name: "Close" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
		expect(mockState().themes).toEqual([]);
		expect(mockState().prefs.customTheme).toBe("");
	});

	it("lists each fault of a bad file and saves nothing", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		const dialog = await importSample(user, BAD_THEME_PATH);
		expect(within(dialog).getByText("The theme file has faults")).toBeInTheDocument();
		expect(within(dialog).getByText("radius: use 0 to 16")).toBeInTheDocument();
		expect(within(dialog).getByText("tokens.n-99: not a token")).toBeInTheDocument();
		expect(within(dialog).queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
		expect(mockState().themes).toEqual([]);
	});

	it("adds and selects the theme, exports it the same, and removes it to its base", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		const dialog = await importSample(user);
		await user.click(within(dialog).getByRole("button", { name: "Add" }));
		await waitFor(() => expect(mockState().prefs.customTheme).toBe("harbor-night"));
		expect(mockState().prefs.theme).toBe("dark");
		await waitFor(() =>
			expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#3bb9fd"),
		);
		expect(await screen.findByRole("combobox", { name: "Theme" })).toHaveTextContent(
			"Harbor night",
		);

		mockState().nextFile = "/mock/out.json";
		await user.click(screen.getByRole("button", { name: "Export" }));
		await waitFor(() => expect(mockState().exportedThemes["/mock/out.json"]).toEqual(SAMPLE_THEME));

		const remove = screen.getByRole("button", { name: "Remove Harbor night" });
		remove.focus();
		await user.keyboard("{Enter}");
		await waitFor(() => expect(mockState().prefs.customTheme).toBe(""));
		expect(mockState().themes).toEqual([]);
		expect(mockState().prefs.theme).toBe("dark");
		await waitFor(() =>
			expect(document.documentElement.style.getPropertyValue("--accent")).toBe(""),
		);
	});

	it("keeps the high-contrast colours and takes only the radius of a theme", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await user.click(await screen.findByRole("switch", { name: "High contrast" }));
		await waitFor(() => expect(mockState().prefs.contrast).toBe("high"));
		const dialog = await importSample(user);
		await user.click(within(dialog).getByRole("button", { name: "Add" }));
		await waitFor(() =>
			expect(document.documentElement.style.getPropertyValue("--radius-md")).toBe("6px"),
		);
		expect(document.documentElement.style.getPropertyValue("--accent")).toBe("");
	});

	it("exports a built-in theme as a file of its base", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await choose(user, "Theme", "OLED");
		mockState().nextFile = "/mock/mine.json";
		await user.click(await screen.findByRole("button", { name: "Export" }));
		await waitFor(() =>
			expect(mockState().exportedThemes["/mock/mine.json"]).toMatchObject({
				shipyardTheme: 1,
				id: "my-theme",
				name: "My theme",
				base: "oled",
			}),
		);
	});
});
