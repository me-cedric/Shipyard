import { expect, type Page, test } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });

/** Opens the mock project and names a Linear tracker with a secret as its tracker. */
async function openWithTracker(page: Page, secret: string | null = "tok-e2e-sync") {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Settings" }).click();
	await tabs(page).getByRole("link", { name: "Connections" }).click();
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	if (secret)
		await page.getByLabel("Secret", { exact: true }).and(page.locator("input")).fill(secret);
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("group", { name: "Acme" })).toBeVisible();
	await tabs(page).getByRole("link", { name: "Project" }).click();
	await page.getByRole("combobox", { name: "Tracker" }).click();
	await page.getByRole("option", { name: "Acme" }).click();
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
}

test("imports the backlog after a count, then reads it from the mirror with no tick", async ({
	page,
}) => {
	await openWithTracker(page);
	await sidebar(page).getByRole("link", { name: "Work" }).click();
	await tabs(page).getByRole("link", { name: "Backlog" }).click();

	await page.getByRole("button", { name: "Import" }).click();
	await expect(page.getByRole("main").getByRole("status")).toHaveText("10 open tickets");
	await expect(page.getByRole("group", { name: /^ACME-/ })).toHaveCount(0);
	await page.getByRole("button", { name: "Confirm" }).click();
	await expect(page.getByRole("heading", { name: "To Do (7)" })).toBeVisible();

	await page.getByRole("textbox", { name: "Search" }).fill("export");
	await expect(page.getByRole("group", { name: /^ACME-/ })).toHaveCount(1);
	await expect(page.getByRole("group", { name: "ACME-2" })).toBeVisible();
});

test("the sync action in the status bar runs a tick and the connection shows its state", async ({
	page,
}) => {
	await openWithTracker(page);
	await sidebar(page).getByRole("link", { name: "Settings" }).click();
	await tabs(page).getByRole("link", { name: "Connections" }).click();
	const row = page.getByRole("group", { name: "Acme" });
	await expect(row.getByRole("status")).toHaveText("Idle");

	// Keyboard only: focus the action, press Enter.
	const sync = page.getByRole("contentinfo").getByRole("button", { name: "Sync" });
	await sync.focus();
	await page.keyboard.press("Enter");
	await expect(row.getByRole("status")).toContainText(/Idle\s*\d{1,2}[:.]\d{2}/);

	// The tick filled the mirror: the backlog shows tickets with no import.
	await sidebar(page).getByRole("link", { name: "Work" }).click();
	await tabs(page).getByRole("link", { name: "Backlog" }).click();
	await expect(page.getByRole("heading", { name: "To Do (7)" })).toBeVisible();
});

test("a failed poll shows the failed state and keeps the mirror", async ({ page }) => {
	await openWithTracker(page, null);
	await sidebar(page).getByRole("link", { name: "Settings" }).click();
	await tabs(page).getByRole("link", { name: "Connections" }).click();
	await page.getByRole("contentinfo").getByRole("button", { name: "Sync" }).click();
	const row = page.getByRole("group", { name: "Acme" });
	await expect(row.getByRole("status")).toContainText("Failed");
	await expect(row.getByRole("status")).toContainText("no secret saved");
});

test("refuses an interval under 30 s and saves the pickup rules with the write switches off", async ({
	page,
}) => {
	await openWithTracker(page);
	const interval = page.getByRole("spinbutton", { name: "Interval (s)" });
	await expect(interval).toHaveValue("60");
	for (const name of ["Push", "Pull request", "Ticket transition", "Ticket comment"])
		await expect(page.getByRole("switch", { name })).not.toBeChecked();

	await interval.fill("10");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("alert")).toHaveText("Interval: at least 30 s");

	await interval.fill("45");
	await page.getByRole("textbox", { name: "Label", exact: true }).fill("agent");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
	await expect(page.getByRole("spinbutton", { name: "Interval (s)" })).toHaveValue("45");
	await expect(page.getByRole("textbox", { name: "Label", exact: true })).toHaveValue("agent");
});
