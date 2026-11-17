import { expect, test } from "@playwright/test";

const PLACES = [
	["Today", "Today"],
	["Flow", "Flow"],
	["Plan", "Plan"],
	["Crew", "Team"],
	["Library", "Diagrams"],
	["Code", "Local changes"],
	["Setup", "Project"],
] as const;

test("opens each place from the sidebar on its first section", async ({ page }) => {
	await page.goto("/");
	// Each page names itself before the app: "Today · Shipyard".
	await expect(page).toHaveTitle(/Shipyard$/);
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	const tabs = page.getByRole("navigation", { name: "Tabs" });
	for (const [place, tab] of PLACES) {
		await sidebar.getByRole("link", { name: place }).click();
		await expect(sidebar.getByRole("link", { name: place })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(tabs.getByRole("link").first()).toHaveText(tab);
		await expect(tabs.getByRole("link").first()).toHaveAttribute("aria-current", "page");
	}
});

test("runs an action from the Ask bar with the keyboard", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
	await page.keyboard.press("ControlOrMeta+k");
	await expect(page.getByRole("combobox", { name: "Ask or tell Shipyard" })).toBeFocused();
	await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("Theme: Dark");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("listbox")).toBeHidden();
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("switches the theme in Settings / Me", async ({ page }) => {
	await page.goto("/settings/me");
	await page.getByRole("combobox", { name: "Theme" }).click();
	await page.getByRole("option", { name: "Dark", exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("switches the language to French", async ({ page }) => {
	await page.goto("/settings/me");
	await page.getByRole("combobox", { name: "Language", exact: true }).click();
	await page.getByRole("option", { name: "French" }).click();
	await expect(
		page
			.getByRole("navigation", { name: "Barre latérale" })
			.getByRole("link", { name: "Aujourd'hui" }),
	).toBeVisible();
});

for (const [option, sidebar, home, lang] of [
	["German", "Seitenleiste", "Heute", "de"],
	["Spanish", "Barra lateral", "Hoy", "es"],
]) {
	test(`switches the language to ${option}`, async ({ page }) => {
		await page.goto("/settings/me");
		await page.getByRole("combobox", { name: "Language", exact: true }).click();
		await page.getByRole("option", { name: option }).click();
		await expect(
			page.getByRole("navigation", { name: sidebar }).getByRole("link", { name: home }),
		).toBeVisible();
		await expect(page.locator("html")).toHaveAttribute("lang", lang);
	});
}

test("shows the not-found view in the release build for the gallery path", async ({ page }) => {
	await page.goto("/dev/gallery");
	await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
