import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";
import { placeOf } from "./places";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
const lane = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** Opens the mock project (it owns the 14 factory runs), then the given section of Flow or Crew. */
async function openFactory(page: Page, tab: string) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(
		page.getByRole("heading", { level: 1, name: /^\d+ things need you$/ }),
	).toBeVisible();
	await sidebar(page)
		.getByRole("link", { name: placeOf(tab) })
		.click();
	await tabs(page).getByRole("link", { name: tab, exact: true }).click();
}

test("shows five stage columns with counts, opens a run and stops it", async ({ page }) => {
	await openFactory(page, "Flow");
	for (const name of ["Idea 0", "Spec 4", "Build 4", "Review 10", "Ready 2"])
		await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
	// A finished run stays in Ready, and Done lists it with the ended runs.
	await expect(lane(page, "Ready").getByRole("button", { name: /ACME-11/ })).toBeVisible();
	await expect(lane(page, "Review").getByRole("button", { name: /ACME-8/ })).toBeVisible();

	await lane(page, "Build")
		.getByRole("button", { name: /ACME-2/ })
		.click();
	// The run is a page, not a sheet: the columns are not there until Back.
	await expect(page).toHaveURL(/\/flow\/feature\//);
	// Six sections: Story opens first. For developers is in Chat: the requests and sessions open on demand.
	await expect(page.getByRole("tabpanel", { name: "Story" })).toBeVisible();
	const sections = page.getByRole("navigation", { name: "Sections" });
	await sections.getByRole("button", { name: "Chat" }).click();
	await page.getByRole("button", { name: "Requests and cost" }).click();
	await expect(page.getByRole("region", { name: "Requests" })).toBeVisible();
	await expect(page.getByRole("region", { name: /^Sessions/ })).toBeVisible();
	await page.getByRole("button", { name: /^All \d+ events$/ }).click();
	const events = page.getByRole("region", { name: /^Events/ });
	await expect(events.getByRole("listitem").first()).toBeVisible();
	// One word for the stop: it sits in the Agent card and asks once before it acts.
	await sections.getByRole("button", { name: "Story" }).click();
	const agent = page.getByRole("region", { name: "Agent", exact: true });
	await agent.getByRole("button", { name: "Stop", exact: true }).click();
	await page.getByRole("button", { name: "Stop Add export endpoint?" }).click();
	await expect(agent.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();
	await page.getByRole("link", { name: "Flow", exact: true }).first().click();
	await tabs(page).getByRole("link", { name: "Done" }).click();
	await expect(
		page
			.getByRole("list", { name: "History" })
			.getByRole("listitem")
			.filter({ hasText: /ACME-2/ }),
	).toContainText("Cancelled");
});

test("the five stage columns fit a window of 1100 px with no sideways scroll", async ({ page }) => {
	await page.setViewportSize({ width: 1100, height: 800 });
	await openFactory(page, "Flow");
	await expect(lane(page, "Idea").getByRole("heading", { name: "Idea" })).toBeVisible();
	const board = lane(page, "Idea").locator("xpath=..");
	const [scroll, client] = await board.evaluate((el) => [el.scrollWidth, el.clientWidth]);
	expect(scroll).toBeLessThanOrEqual(client);
});

test("filters the board to Needs me and keeps the choice in the address", async ({ page }) => {
	await openFactory(page, "Flow");
	await page.getByRole("button", { name: "Needs me", exact: true }).click();
	await expect(page).toHaveURL(/\?filter=needs$/);
	await expect(lane(page, "Build").getByRole("heading", { name: "Build" })).toBeVisible();
	// The mock keeps its state in memory, so a reload would close the project: leave the page and come back.
	await page
		.getByRole("button", { name: /ACME-4/ })
		.first()
		.click();
	await page.goBack();
	await expect(page).toHaveURL(/\?filter=needs$/);
	await expect(page.getByRole("button", { name: "Needs me", exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
});

test("Done lists the ended runs, and a row opens the run", async ({ page }) => {
	await openFactory(page, "Done");
	await expect(page).toHaveURL(/\/flow\/done$/);
	const table = page.getByRole("list", { name: "History" });
	const row = table
		.getByRole("listitem")
		.filter({ hasText: /ACME-11/ })
		.first();
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: /ACME-11/ }).click();
	await expect(page).toHaveURL(/\/flow\/runs\/[0-9A-Z]{26}$/);
	await expect(page.getByRole("region", { name: "ACME-11", exact: true })).toBeVisible();
});

test("opens a run by its address, and the browser Back returns to the list", async ({ page }) => {
	await openFactory(page, "Flow");
	await lane(page, "Build")
		.getByRole("button", { name: /ACME-2/ })
		.click();
	await expect(page).toHaveURL(/\/flow\/feature\//);
	const address = new URL(page.url()).pathname;
	await page.goBack();
	await expect(page).toHaveURL(/\/flow\/flow$/);
	await expect(lane(page, "Build").getByRole("heading", { name: "Build" })).toBeVisible();
	// Forward returns to the address: the same run, with Flow selected in the Flow bar.
	// (A new load would empty the in-memory mock project, so the history stands for it.)
	await page.goForward();
	await expect(page).toHaveURL(new RegExp(`${address}$`));
	await expect(page.getByRole("region", { name: "ACME-2", exact: true })).toBeVisible();
	await expect(sidebar(page).getByRole("link", { name: "Flow" })).toHaveAttribute(
		"aria-current",
		"page",
	);
});

test("approves a plan on ACME-4 from the run view", async ({ page }) => {
	await openFactory(page, "Flow");
	await page
		.getByRole("button", { name: /ACME-4/ })
		.first()
		.click();
	await page.getByRole("button", { name: "Approve the plan" }).click();
	await page.getByRole("link", { name: "Flow", exact: true }).first().click();
	await expect(lane(page, "Build").getByRole("button", { name: /ACME-4/ })).toBeVisible();
});

test("the global kill switch cancels the runs and releases", async ({ page }) => {
	// The switch is in the header of Crew, no longer on Sessions.
	await openFactory(page, "Crew");
	await expect(page.getByRole("switch", { name: "Agents on" })).toBeChecked();
	await page.getByRole("switch", { name: "Agents on" }).click();
	await expect(page.getByRole("switch", { name: "Agents stopped" })).not.toBeChecked();
	await page.getByRole("switch", { name: "Agents stopped" }).click();
	await expect(page.getByRole("switch", { name: "Agents on" })).toBeChecked();
});

test("shows a check error with its line for a broken workflow", async ({ page }) => {
	await openFactory(page, "Recipes");
	await expect(page).toHaveURL(/\/crew\/recipes$/);
	await page.getByRole("button", { name: /^Bug/ }).click();
	await page.getByRole("button", { name: "Edit as text" }).click();
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
	await openFactory(page, "Recipes");
	await page.getByRole("button", { name: "New recipe", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("combobox", { name: "Start from" }).click();
	await page.getByRole("option", { name: "bug" }).click();
	await dialog.getByRole("textbox", { name: "Name" }).fill("hotfix");
	await dialog.getByRole("button", { name: "Create" }).click();
	// A step is a page of its own: the chain links to it.
	await page.getByRole("link", { name: "Triage", exact: true }).click();
	await expect(page).toHaveURL(/\?recipe=hotfix&step=triage$/);
	await page.getByRole("combobox", { name: "Effort" }).click();
	await page.getByRole("option", { name: "max" }).click();
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
	await page.getByRole("link", { name: "Recipes", exact: true }).click();
	await expect(page.getByRole("button", { name: /^Hotfix/ })).toBeVisible();
});

test("lists every AI session on the computer and stops a running one", async ({ page }) => {
	await openFactory(page, "Sessions");
	const machine = page.getByRole("region", { name: "On this machine" });
	await expect(machine.getByText("Fix the login")).toBeVisible();
	await page.getByRole("button", { name: "Stop Fix the login" }).click();
	await page.getByRole("button", { name: "Stop Fix the login?" }).click();
	await expect(machine.getByText("Fix the login")).toHaveCount(0);
});

test("shows the spend of the computer as a chart and keeps a monthly budget", async ({ page }) => {
	await openFactory(page, "Spend");
	await expect(page).toHaveURL(/\/crew\/spend$/);
	// The chart by day is on the usage page: Spend, How agents do, More, Usage.
	await page.getByRole("link", { name: "Use of this machine" }).click();
	await page.getByRole("button", { name: "More", exact: true }).click();
	await page.getByRole("menuitem", { name: "Usage", exact: true }).click();
	await expect(page).toHaveURL(/\/crew\/spend\?page=usage$/);
	await expect(page.getByRole("img", { name: "Spend by day" })).toBeVisible();
	// The monthly budget is a row of the page Budgets.
	await page.getByRole("link", { name: "Spend", exact: true }).first().click();
	await page.getByRole("link", { name: "All budgets" }).click();
	await expect(page).toHaveURL(/\/crew\/spend\?page=budgets$/);
	await page.getByRole("button", { name: "Edit the limit of each month" }).click();
	await page.getByRole("spinbutton", { name: "Monthly budget (USD)" }).fill("1000");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("meter", { name: /Monthly budget/ })).toBeVisible();
});
