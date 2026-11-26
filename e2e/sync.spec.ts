import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder, openSync } from "./first-run";
import { pickMore } from "./places";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
/** The rows of the tickets of Flow / List: one button for each, with the key in its name. */
const rows = (page: Page) => page.getByRole("button", { name: /ACME-\d+/ });
/** The Status filter of Flow / List is a choice of the More menu. */
const onlyStatus = (page: Page, status: string) => pickMore(page, status, "menuitemradio");

/** Opens the mock project and names a Linear tracker with a secret as its tracker. */
async function openWithTracker(page: Page, secret: string | null = "tok-e2e-sync") {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Setup" }).click();
	await tabs(page).getByRole("link", { name: "This project" }).click();
	// The card Issue tracker of This project opens the page of the connections.
	await page
		.getByRole("region", { name: "Issue tracker" })
		.getByRole("link", { name: "Connect" })
		.click();
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	if (secret)
		await page.getByLabel("API key", { exact: true }).and(page.locator("input")).fill(secret);
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("group", { name: "Acme" })).toBeVisible();
	// The only tracker links itself to the project.
	await tabs(page).getByRole("link", { name: "This project" }).click();
	// The card says Connected; its Change link opens the choice behind More.
	await page
		.getByRole("region", { name: "Issue tracker" })
		.getByRole("link", { name: "Change" })
		.click();
	await expect(page.getByRole("combobox", { name: "Issue tracker", exact: true })).toContainText(
		"Acme",
	);
}

test("imports the backlog after a count, then reads it from the mirror with no tick", async ({
	page,
}) => {
	await openWithTracker(page);
	await sidebar(page).getByRole("link", { name: "Flow" }).click();
	await tabs(page).getByRole("link", { name: "List" }).click();

	await pickMore(page, "Import");
	await expect(page.getByRole("main").getByRole("status")).toHaveText("10 open tickets");
	// The mirror holds no ticket yet: the Status filter has no status to offer.
	await page.getByRole("button", { name: "More", exact: true }).click();
	await expect(page.getByRole("menuitemradio", { name: "To Do" })).toHaveCount(0);
	await expect(page.getByRole("menuitemradio", { name: "All statuses" })).toBeChecked();
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Confirm" }).click();
	await onlyStatus(page, "To Do");
	await expect(rows(page)).toHaveCount(7);
	await onlyStatus(page, "All statuses");

	// The search of Flow is the search of the tickets: Find a feature in More opens it.
	await pickMore(page, "Find a feature");
	await page.getByRole("searchbox", { name: "Find a feature" }).fill("export");
	await expect(rows(page)).toHaveCount(1);
	await expect(page.getByRole("button", { name: /ACME-2(?!\d)/ })).toBeVisible();
});

test("the sync action in the card of the sync mark runs a tick and the connection shows its state", async ({
	page,
}) => {
	await openWithTracker(page);
	await sidebar(page).getByRole("link", { name: "Setup" }).click();
	await tabs(page).getByRole("link", { name: "This project" }).click();
	// The accounts live on the page of the connections: the card Code host (not connected) opens it.
	await page
		.getByRole("region", { name: "Code host" })
		.getByRole("link", { name: "Connect" })
		.click();
	const row = page.getByRole("group", { name: "Acme" });
	await expect(row.getByRole("status")).toHaveText("Idle");

	// Keyboard only: focus the sync mark, press Enter, then focus the action, press Enter.
	await page
		.getByRole("banner")
		.getByRole("button", { name: /^Sync state/ })
		.focus();
	await page.keyboard.press("Enter");
	await page
		.getByRole("dialog", { name: "Sync state" })
		.getByRole("button", { name: "Sync", exact: true })
		.focus();
	await page.keyboard.press("Enter");
	await expect(row.getByRole("status")).toContainText(/Last check\s*\d{1,2}[:.]\d{2}/);

	// The tick filled the mirror: the backlog shows tickets with no import.
	await sidebar(page).getByRole("link", { name: "Flow" }).click();
	await tabs(page).getByRole("link", { name: "List" }).click();
	await onlyStatus(page, "To Do");
	await expect(rows(page)).toHaveCount(7);
});

test("a failed poll shows the failed state and keeps the mirror", async ({ page }) => {
	await openWithTracker(page, null);
	await sidebar(page).getByRole("link", { name: "Setup" }).click();
	await tabs(page).getByRole("link", { name: "This project" }).click();
	// The accounts live on the page of the connections: the card Code host (not connected) opens it.
	await page
		.getByRole("region", { name: "Code host" })
		.getByRole("link", { name: "Connect" })
		.click();
	await (await openSync(page)).getByRole("button", { name: "Sync", exact: true }).click();
	const row = page.getByRole("group", { name: "Acme" });
	await expect(row.getByRole("status")).toContainText("Failed");
	await expect(row.getByRole("status")).toContainText("This connection has no token yet.");
});

test("refuses an interval under 30 s and saves the pickup rules with the write switches on", async ({
	page,
}) => {
	await openWithTracker(page);
	// The pickup rules are on the page Automation of This project: the fields are under their rows.
	await page
		.getByRole("navigation", { name: "This project" })
		.getByRole("link", { name: "Automation" })
		.click();
	const open = async (row: string) => page.locator("summary", { hasText: row }).click();
	await open("Look for new tickets");
	const interval = page.getByRole("spinbutton", { name: "Interval (s)" });
	await expect(interval).toHaveValue("60");
	await expect(page.getByRole("link", { name: "What agents may do alone" })).toBeVisible();

	await interval.fill("10");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("alert")).toHaveText("Interval: at least 30 s");

	await interval.fill("45");
	await open("Label of the ticket");
	await page.getByRole("textbox", { name: "Label", exact: true }).fill("agent");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
	// The saved page opens again with its rows closed.
	await open("Look for new tickets");
	await open("Label of the ticket");
	await expect(page.getByRole("spinbutton", { name: "Interval (s)" })).toHaveValue("45");
	await expect(page.getByRole("textbox", { name: "Label", exact: true })).toHaveValue("agent");
});
