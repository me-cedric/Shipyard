import { expect, type Page } from "@playwright/test";

/** The first run of a fresh browser, a bare page: keep the role (Continue), then open the first local folder (a tile). */
export async function openFirstFolder(page: Page) {
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Open a local folder" }).click();
}

/** Opens the card of the sync mark in the top row: the home of Sync, Fetch only, Push and Commit. */
export async function openSync(page: Page) {
	const card = page.getByRole("dialog", { name: "Sync state" });
	if (!(await card.isVisible()))
		await page
			.getByRole("banner")
			.getByRole("button", { name: /^Sync state/ })
			.click();
	await expect(card).toBeVisible();
	return card;
}

/** Opens the account menu at the foot of the rail: the home of the manual, the version and Health. */
export async function openAccount(page: Page) {
	await page.getByRole("button", { name: /^Account/ }).click();
	const menu = page.getByRole("menu");
	await expect(menu).toBeVisible();
	return menu;
}

/** Light is the default theme (`q:Q-168`), so a dark run picks Dark from the palette. */
export async function pickDarkTheme(page: Page) {
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("Theme: Dark");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}
