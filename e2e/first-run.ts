import type { Page } from "@playwright/test";

/** The first run of a fresh browser: pick the role (Continue), then open the first local folder. */
export async function openFirstFolder(page: Page) {
	await page.getByRole("button", { name: "Continue" }).click();
	await page.getByRole("button", { name: "Open a local folder" }).click();
}
