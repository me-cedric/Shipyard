import { expect, type Page, test } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
const lane = (page: Page, name: string) => page.getByRole("region", { name });

/** Opens the mock project (it owns the 14 factory runs), then Factory on the given tab. */
async function openFactory(page: Page, tab: string) {
	await page.goto("/home/today");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Agent questions (3)" })).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Factory" }).click();
	await tabs(page).getByRole("link", { name: tab }).click();
}

test("shows six lanes with counts, opens a run and kills it", async ({ page }) => {
	await openFactory(page, "Runs");
	for (const name of [
		"Queued (1)",
		"Working (2)",
		"Needs you (4)",
		"In review (2)",
		"Ready to merge (1)",
		"Done (2)",
	])
		await expect(page.getByRole("heading", { name })).toBeVisible();
	await expect(lane(page, "Ready to merge").getByRole("button", { name: /ACME-8/ })).toBeVisible();

	await lane(page, "Working")
		.getByRole("button", { name: /ACME-2/ })
		.click();
	await expect(page.getByRole("region", { name: "Workflow" })).toBeVisible();
	const events = page.getByRole("region", { name: /^Events/ });
	await events.getByRole("button", { name: "Expand" }).click();
	await expect(events.getByRole("listitem").first()).toBeVisible();
	await page.getByRole("button", { name: "Kill run" }).click();
	// A stop asks once before it acts.
	await page.getByRole("button", { name: "Stop ACME-2?" }).click();
	await expect(lane(page, "Done").getByRole("button", { name: /ACME-2/ })).toBeVisible();
	await expect(page.getByRole("button", { name: "Kill run" })).toHaveCount(0);
});

test("approves a plan on ACME-4 from the run view", async ({ page }) => {
	await openFactory(page, "Runs");
	await lane(page, "Needs you")
		.getByRole("button", { name: /ACME-4/ })
		.click();
	await page.getByRole("button", { name: "Approve plan" }).click();
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
	await page.getByRole("button", { name: /^bug/ }).click();
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
	await expect(page.getByRole("button", { name: /^hotfix/ })).toBeVisible();
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
