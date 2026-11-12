import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
const lane = (page: Page, name: string) => page.getByRole("region", { name });

/** Opens the mock project (it owns the 14 factory runs), then Factory on the given tab. */
async function openFactory(page: Page, tab: string) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(page.getByRole("heading", { name: "Agent questions (3)" })).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Factory" }).click();
	await tabs(page).getByRole("link", { name: tab }).click();
}

test("shows five lanes with counts, opens a run and stops it", async ({ page }) => {
	await openFactory(page, "Runs");
	for (const name of [
		"Queued (1)",
		"Working (2)",
		"Needs you (4)",
		"In review (2)",
		"Ready to merge (1)",
	])
		await expect(page.getByRole("heading", { name })).toBeVisible();
	// An ended run is in History, not on the board.
	await expect(page.getByRole("heading", { name: /^Done \(/ })).toHaveCount(0);
	await expect(lane(page, "Ready to merge").getByRole("button", { name: /ACME-8/ })).toBeVisible();

	await lane(page, "Working")
		.getByRole("button", { name: /ACME-2/ })
		.click();
	// The run is a page, not a sheet: the lanes are not there until Back.
	await expect(page).toHaveURL(/\/factory\/runs\/[0-9A-Z]{26}$/);
	// Three tabs: Activity opens first, and the Workflow tab is in the address.
	await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await page.getByRole("tab", { name: "Workflow" }).click();
	await expect(page).toHaveURL(/\?tab=workflow$/);
	await expect(page.getByRole("tabpanel", { name: "Workflow" })).toBeVisible();
	await expect(page.getByRole("region", { name: /^Sessions/ })).toBeVisible();
	await page.getByRole("tab", { name: "Activity" }).click();
	const events = page.getByRole("region", { name: /^Events/ });
	await expect(events.getByRole("listitem").first()).toBeVisible();
	// One word for the stop: it sits in the summary menu and asks once before it acts.
	await page.getByRole("button", { name: "More actions" }).click();
	await page.getByRole("menuitem", { name: "Stop" }).click();
	await page.getByRole("button", { name: "Stop ACME-2?" }).click();
	await expect(page.getByRole("button", { name: "More actions" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();
	await page.getByRole("link", { name: "Runs", exact: true }).first().click();
	await page.getByRole("button", { name: "History" }).click();
	await expect(
		page.getByRole("table", { name: "History" }).getByRole("row", { name: /ACME-2/ }),
	).toContainText("Cancelled");
});

test("the five lanes fit a window of 1100 px with no sideways scroll", async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await openFactory(page, "Runs");
	await expect(page.getByRole("heading", { name: "Queued (1)" })).toBeVisible();
	const board = lane(page, "Queued").locator("xpath=..");
	const [scroll, client] = await board.evaluate((el) => [el.scrollWidth, el.clientWidth]);
	expect(scroll).toBeLessThanOrEqual(client);
});

test("filters the board to Needs you and keeps the choice in the address", async ({ page }) => {
	await openFactory(page, "Runs");
	await page.getByRole("button", { name: "Needs you", exact: true }).click();
	await expect(page).toHaveURL(/\?filter=needs$/);
	await expect(page.getByRole("heading", { name: "Working (0)" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Needs you (4)" })).toBeVisible();
	// The mock keeps its state in memory, so a reload would close the project: leave the page and come back.
	await lane(page, "Needs you")
		.getByRole("button", { name: /ACME-4/ })
		.first()
		.click();
	await page.goBack();
	await expect(page).toHaveURL(/\?filter=needs$/);
	await expect(page.getByRole("button", { name: "Needs you", exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
});

test("History lists the ended runs, and a row opens the run", async ({ page }) => {
	await openFactory(page, "Runs");
	await page.getByRole("button", { name: "History" }).click();
	await expect(page).toHaveURL(/\?view=history$/);
	const table = page.getByRole("table", { name: "History" });
	const row = table.getByRole("row", { name: /ACME-11/ }).first();
	await expect(row).toBeVisible();
	await row.click();
	await expect(page).toHaveURL(/\/factory\/runs\/[0-9A-Z]{26}$/);
	await expect(page.getByRole("region", { name: "ACME-11", exact: true })).toBeVisible();
});

test("opens a run by its address, and the browser Back returns to the list", async ({ page }) => {
	await openFactory(page, "Runs");
	await lane(page, "Working")
		.getByRole("button", { name: /ACME-2/ })
		.click();
	await expect(page).toHaveURL(/\/factory\/runs\/[0-9A-Z]{26}$/);
	const address = new URL(page.url()).pathname;
	await page.goBack();
	await expect(page).toHaveURL(/\/factory\/runs$/);
	await expect(page.getByRole("heading", { name: "Working (2)" })).toBeVisible();
	// Forward returns to the address: the same run, with Runs selected in the Factory bar.
	// (A new load would empty the in-memory mock project, so the history stands for it.)
	await page.goForward();
	await expect(page).toHaveURL(new RegExp(`${address}$`));
	await expect(page.getByRole("region", { name: "ACME-2", exact: true })).toBeVisible();
	await expect(tabs(page).getByRole("link", { name: "Runs" })).toHaveAttribute(
		"aria-current",
		"page",
	);
});

test("approves a plan on ACME-4 from the run view", async ({ page }) => {
	await openFactory(page, "Runs");
	await lane(page, "Needs you")
		.getByRole("button", { name: /ACME-4/ })
		.click();
	await page.getByRole("button", { name: "Approve plan" }).click();
	await page.getByRole("link", { name: "Runs", exact: true }).first().click();
	await expect(lane(page, "Working").getByRole("button", { name: /ACME-4/ })).toBeVisible();
});

test("the global kill switch cancels the runs and releases", async ({ page }) => {
	await openFactory(page, "Sessions");
	await expect(page.getByRole("switch", { name: "Agents on" })).toBeChecked();
	await page.getByRole("switch", { name: "Agents on" }).click();
	await expect(page.getByRole("switch", { name: "Agents stopped" })).not.toBeChecked();
	await page.getByRole("switch", { name: "Agents stopped" }).click();
	await expect(page.getByRole("switch", { name: "Agents on" })).toBeChecked();
});

test("shows a check error with its line for a broken workflow", async ({ page }) => {
	await openFactory(page, "Workflows");
	await page.getByRole("button", { name: /^Bug/ }).click();
	await page.getByRole("tab", { name: "Text" }).click();
	const editor = page.getByRole("textbox", { name: "bug" });
	await editor.fill((await editor.inputValue()).replace("id: bug", "id: other"));
	const alert = page.getByRole("alert");
	await expect(alert).toContainText("Line 2");
	await expect(alert).toContainText("differs from the file name");
	await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("makes a workflow from a preset, changes an effort in the form and saves it", async ({
	page,
}) => {
	await openFactory(page, "Workflows");
	await page.getByRole("button", { name: "New", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("combobox", { name: "Preset" }).click();
	await page.getByRole("option", { name: "bug" }).click();
	await dialog.getByRole("textbox", { name: "New id" }).fill("hotfix");
	await dialog.getByRole("button", { name: "Create" }).click();
	const triage = page.getByRole("region", { name: "Step triage" });
	await triage.getByRole("combobox", { name: "Effort" }).click();
	await page.getByRole("option", { name: "max" }).click();
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
	await expect(page.getByRole("button", { name: /^Hotfix/ })).toBeVisible();
});

test("lists every AI session on the computer and stops a running one", async ({ page }) => {
	await openFactory(page, "Sessions");
	const machine = page.getByRole("table", { name: "This computer" });
	await expect(machine.getByText("Fix the login")).toBeVisible();
	await page.getByRole("button", { name: "Stop claude alpha" }).click();
	await expect(machine.getByText("Fix the login")).toHaveCount(0);
});

test("shows the spend of the computer as a chart and keeps a monthly budget", async ({ page }) => {
	await openFactory(page, "Usage");
	await expect(page.getByRole("img", { name: "Spend by day" })).toBeVisible();
	await page.getByRole("spinbutton", { name: "Monthly budget (USD)" }).fill("1000");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("meter", { name: /Monthly budget/ })).toBeVisible();
});
