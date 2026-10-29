import { expect, test } from "@playwright/test";

test("shows a notification for a newer version, in a toast and in the centre", async ({ page }) => {
	await page.goto("/settings/me");
	// The mock release address with `newer` in it has a newer version.
	const address = page.getByRole("textbox", { name: "Release address" });
	await address.fill("https://example.com/newer/latest");
	await address.blur();

	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("dialog").getByRole("combobox").fill("Check for updates");
	await page.keyboard.press("Enter");

	const toast = page.getByRole("status", { name: "Notifications" });
	await expect(toast.getByText("Update available: 0.2.0")).toBeVisible();

	const bell = page.getByRole("button", { name: "Notifications" });
	await expect(bell).toContainText("1 unread");
	await bell.click();
	await expect(page.getByRole("dialog").getByText("Update available: 0.2.0")).toHaveCount(1);
	await expect(bell).not.toContainText("unread");
});

test("opens a context menu from the keyboard and Escape returns the focus to the row", async ({
	page,
}) => {
	await page.goto("/settings/connections");
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	await page.getByRole("button", { name: "Save" }).click();

	const row = page.getByRole("group", { name: "Acme" });
	const test_ = row.getByRole("button", { name: "Test" });
	await test_.focus();
	await page.keyboard.press("ContextMenu");
	const menu = page.getByRole("menu");
	await expect(menu.getByRole("menuitem")).toHaveText(["Test", "Edit", "Remove", "Copy ref"]);
	await page.keyboard.press("Escape");
	await expect(menu).toHaveCount(0);
	await expect(test_).toBeFocused();

	// The secondary click opens the same menu.
	await row.click({ button: "right" });
	await page.getByRole("menuitem", { name: "Remove" }).click();
	await expect(row.getByRole("button", { name: "Confirm" })).toBeVisible();
});
