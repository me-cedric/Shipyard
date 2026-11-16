import { expect, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";

test("answers Q-101 with the keyboard, and the run leaves Needs you", async ({ page }) => {
	await page.goto("/home/today");
	await openFirstFolder(page);
	const card = page.getByRole("region", { name: "Q-101" });
	await expect(card).toContainText("ACME-1");
	await expect(card.getByRole("radio")).toHaveCount(3);
	await expect(
		page.getByRole("heading", { level: 1, name: /^\d+ things need you$/ }),
	).toBeVisible();

	await card.getByRole("radio").first().focus();
	await page.keyboard.press("3");
	await page.keyboard.press("Enter");
	// The question row leaves its region once answered: the card of Today keeps the answer.
	const today = page.getByRole("article").first();
	await expect(today.getByText("Answered")).toBeVisible();
	await expect(today.getByRole("radio")).toHaveCount(0);

	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Flow" })
		.click();
	await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Runs" }).click();
	await expect(
		page.getByRole("region", { name: "Needs you" }).getByRole("button", { name: /ACME-1(?!\d)/ }),
	).toHaveCount(0);
	await expect(
		page.getByRole("region", { name: "Working" }).getByRole("button", { name: /ACME-1(?!\d)/ }),
	).toBeVisible();
});
