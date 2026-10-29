import { expect, test } from "@playwright/test";

const SPACES = [
	["Home", "Inbox"],
	["Design", "Diagrams"],
	["Specs", "Changes"],
	["Work", "Backlog"],
	["Factory", "Runs"],
	["Code", "Changes"],
	["Knowledge", "Graph"],
	["Settings", "Project"],
] as const;

test("opens each space from the sidebar on its first tab", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveTitle("Shipyard");
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	const tabs = page.getByRole("navigation", { name: "Tabs" });
	for (const [space, tab] of SPACES) {
		await sidebar.getByRole("link", { name: space }).click();
		await expect(sidebar.getByRole("link", { name: space })).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(tabs.getByRole("link").first()).toHaveText(tab);
		await expect(tabs.getByRole("link").first()).toHaveAttribute("aria-current", "page");
	}
});

test("runs an action from the palette with the keyboard", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
	await page.keyboard.press("ControlOrMeta+k");
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.getByRole("dialog").getByRole("combobox").fill("Theme: Dark");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("dialog")).toBeHidden();
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("switches the theme in Settings / Me", async ({ page }) => {
	await page.goto("/settings/me");
	await page.getByRole("combobox", { name: "Theme" }).click();
	await page.getByRole("option", { name: "Dark" }).click();
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("switches the language to French", async ({ page }) => {
	await page.goto("/settings/me");
	await page.getByRole("combobox", { name: "Language" }).click();
	await page.getByRole("option", { name: "French" }).click();
	await expect(
		page.getByRole("navigation", { name: "Barre latérale" }).getByRole("link", { name: "Accueil" }),
	).toBeVisible();
});

test("shows the not-found view in the release build for the gallery path", async ({ page }) => {
	await page.goto("/dev/gallery");
	await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
