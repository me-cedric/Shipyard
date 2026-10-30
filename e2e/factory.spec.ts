import { expect, type Page, test } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
const lane = (page: Page, name: string) => page.getByRole("region", { name });

/** Opens the mock project (it owns the 14 factory runs), then Factory on the given tab. */
async function openFactory(page: Page, tab: string) {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Questions (3)" })).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Factory" }).click();
	await tabs(page).getByRole("link", { name: tab }).click();
}

test("shows six lanes with counts, opens a run and kills it", async ({ page }) => {
	await openFactory(page, "Runs");
	for (const name of [
		"Queued (1)",
		"Working (2)",
		"Needs you (5)",
		"In review (2)",
		"Ready to merge (1)",
		"Done (3)",
	])
		await expect(page.getByRole("heading", { name })).toBeVisible();
	await expect(lane(page, "Ready to merge").getByRole("button", { name: /ACME-8/ })).toBeVisible();

	await lane(page, "Working")
		.getByRole("button", { name: /ACME-2/ })
		.click();
	await expect(page.getByRole("region", { name: "Workflow" })).toBeVisible();
	await expect(
		page
			.getByRole("region", { name: /^Events/ })
			.getByRole("listitem")
			.first(),
	).toBeVisible();
	await page.getByRole("button", { name: "Kill run" }).click();
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
	await expect(page.getByText("Kill switch off")).toBeVisible();
	await page.getByRole("button", { name: "Kill all" }).click();
	await expect(page.getByText("Kill switch on")).toBeVisible();
	await page.getByRole("button", { name: "Release" }).click();
	await expect(page.getByText("Kill switch off")).toBeVisible();
});

test("shows a check error with its line for a broken workflow", async ({ page }) => {
	await openFactory(page, "Workflows");
	await page.getByRole("button", { name: /^bug/ }).click();
	const editor = page.getByRole("textbox", { name: "bug" });
	await editor.fill((await editor.inputValue()).replace("id: bug", "id: other"));
	const alert = page.getByRole("alert");
	await expect(alert).toContainText("Line 2");
	await expect(alert).toContainText("differs from the file name");
	await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
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
