import { expect, type Page } from "@playwright/test";

/** The first run of a fresh browser: pick the role (Continue), then open the first local folder. */
export async function openFirstFolder(page: Page) {
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Open a local folder" }).click();
}

/** Light is the default theme (`q:Q-168`), so a dark run picks Dark from the palette. */
export async function pickDarkTheme(page: Page) {
	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("combobox", { name: "Ask or tell Shipyard" }).fill("Theme: Dark");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
}
