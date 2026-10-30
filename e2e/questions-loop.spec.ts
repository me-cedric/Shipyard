import { expect, test } from "@playwright/test";

test("answers Q-101 with the keyboard, and the run leaves Needs you", async ({ page }) => {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	const card = page.getByRole("region", { name: "Q-101" });
	await expect(card).toContainText("ACME-1");
	await expect(card.getByRole("radio")).toHaveCount(3);
	await expect(page.getByRole("heading", { name: "Agent questions (3)" })).toBeVisible();

	await card.getByRole("radio").first().focus();
	await page.keyboard.press("3");
	await page.keyboard.press("Enter");
	await expect(card.getByText("Answered")).toBeVisible();
	await expect(card.getByRole("radio")).toHaveCount(0);

	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Factory" })
		.click();
	await page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Runs" }).click();
	await expect(
		page.getByRole("region", { name: "Needs you" }).getByRole("button", { name: /ACME-1(?!\d)/ }),
	).toHaveCount(0);
	await expect(
		page.getByRole("region", { name: "Working" }).getByRole("button", { name: /ACME-1(?!\d)/ }),
	).toBeVisible();
});
