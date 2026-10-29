import { expect, test } from "@playwright/test";

const TOKEN = "tok-e2e-secret-7";

test("adds a tracker with a secret, tests it and removes it", async ({ page }) => {
	await page.goto("/settings/connections");
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	await page.getByLabel("Secret", { exact: true }).and(page.locator("input")).fill(TOKEN);
	await page.getByRole("button", { name: "Save" }).click();

	const row = page.getByRole("group", { name: "Acme" });
	await expect(page.getByRole("heading", { name: "Trackers (1)" })).toBeVisible();
	await expect(row.getByRole("list", { name: "Flags" }).getByRole("listitem")).toHaveCount(6);

	// The secret is masked, empty and never in the page (REQ-011).
	await row.getByRole("button", { name: "Edit" }).click();
	const secret = page.getByLabel("Secret", { exact: true }).and(page.locator("input"));
	await expect(secret).toHaveValue("");
	await expect(secret).toHaveAttribute("placeholder", "••••••••");
	expect(await page.content()).not.toContain(TOKEN);
	await page.getByRole("button", { name: "Cancel" }).click();

	await row.getByRole("button", { name: "Test" }).click();
	await expect(row.getByRole("status")).toHaveText("Passed: Ada Lovelace");

	await row.getByRole("button", { name: "Remove" }).click();
	await row.getByRole("button", { name: "Confirm" }).click();
	await expect(row).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Connection" })).toBeVisible();
});

test("names a missing secret and the missing scope of a forge", async ({ page }) => {
	await page.goto("/settings/connections");
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Code");
	await page.getByRole("combobox", { name: "Type" }).click();
	await page.getByRole("option", { name: "Forge" }).click();
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "GitHub" }).click();
	await page.getByRole("textbox", { name: "Address" }).fill("https://noscope.example.com");
	await page.getByRole("button", { name: "Save" }).click();

	const row = page.getByRole("group", { name: "Code" });
	await expect(page.getByRole("heading", { name: "Forges (1)" })).toBeVisible();
	// No secret saved yet.
	await row.getByRole("button", { name: "Test" }).click();
	await expect(row.getByRole("status")).toHaveText("no secret saved");

	await row.getByRole("button", { name: "Edit" }).click();
	await page.getByLabel("Secret", { exact: true }).and(page.locator("input")).fill("any");
	await page.getByRole("button", { name: "Save" }).click();
	await row.getByRole("button", { name: "Test" }).click();
	await expect(row.getByRole("status")).toHaveText("Missing scope: Pull requests: read");

	await row.getByRole("button", { name: "Repositories" }).click();
	await expect(row.getByRole("heading", { name: "Repositories (2)" })).toBeVisible();
	await expect(row.getByRole("group", { name: "acme/docs" }).getByText("No push")).toBeVisible();
});

test("adds a connection with the keyboard", async ({ page }) => {
	await page.goto("/settings/connections");
	await page.getByRole("button", { name: "Connection" }).focus();
	await page.keyboard.press("Enter");
	await page.getByRole("textbox", { name: "Name" }).focus();
	await page.keyboard.type("Acme");
	// Jira Cloud is the first product and needs an address and an email.
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await page.keyboard.press("Tab");
	await page.keyboard.type("https://acme.atlassian.net");
	await page.keyboard.press("Tab");
	await page.keyboard.type("ada@example.com");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("group", { name: "Acme" })).toBeVisible();
});
