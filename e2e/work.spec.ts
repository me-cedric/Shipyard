import { expect, type Page, test } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
const inspector = (page: Page, name: string) => page.getByRole("complementary", { name });

/** Opens the mock project with a Linear tracker, imports the backlog and opens a Work tab. */
async function openWork(page: Page, tab: string) {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Settings" }).click();
	await tabs(page).getByRole("link", { name: "Connections" }).click();
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	await page.getByLabel("API key", { exact: true }).and(page.locator("input")).fill("tok-e2e-work");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("group", { name: "Acme" })).toBeVisible();
	// The only tracker links itself to the project.
	await tabs(page).getByRole("link", { name: "Project" }).click();
	await expect(page.getByRole("combobox", { name: "Tracker", exact: true })).toContainText("Acme");
	await sidebar(page).getByRole("link", { name: "Work" }).click();
	await tabs(page).getByRole("link", { name: "Backlog" }).click();
	await page.getByRole("button", { name: "Import" }).click();
	await page.getByRole("button", { name: "Confirm" }).click();
	await expect(page.getByRole("group", { name: "ACME-1", exact: true })).toBeVisible();
	await tabs(page).getByRole("link", { name: tab }).click();
}

test("assigns a member from the ranked list and marks the item for the agent", async ({ page }) => {
	await openWork(page, "Backlog");
	await page.getByRole("group", { name: "ACME-8" }).getByRole("button").click();
	const panel = inspector(page, "ACME-8");
	await expect(panel.getByRole("group", { name: "Grace Hopper" })).toBeVisible();
	// Opening the suggestion assigns nobody.
	await expect(page.getByRole("group", { name: "ACME-8" })).not.toContainText("Hopper");
	await panel.getByRole("button", { name: "Assign Grace Hopper" }).click();
	await expect(page.getByRole("group", { name: "ACME-8" })).toContainText("Grace Hopper");
	await panel.getByRole("button", { name: "Mark for agent" }).click();
	await expect(panel.getByRole("button", { name: "Mark for agent" })).toBeDisabled();
});

test("moves a card on the board with the keyboard", async ({ page }) => {
	await openWork(page, "Board");
	const card = page.getByRole("button", { name: /ACME-3/ });
	await card.focus();
	await page.keyboard.press("Shift+ArrowRight");
	await expect(
		page.getByRole("region", { name: "In Progress (3)" }).getByRole("button", { name: /ACME-3/ }),
	).toBeVisible();
});

test("estimates a task and sees the summary move", async ({ page }) => {
	await openWork(page, "Estimates");
	const table = page.getByRole("table", { name: "Backlog" });
	await expect(table.getByRole("heading", { name: "Authentication (4)" })).toBeVisible();
	await table.getByRole("cell", { name: "Export endpoint", exact: true }).click();
	const panel = inspector(page, "Task");
	const days = panel.getByRole("spinbutton", { name: "Days" });
	await expect(days).toHaveValue("6");
	await days.fill("8");
	await panel.getByRole("button", { name: "Save" }).click();
	await expect(table.getByRole("row", { name: /Export endpoint dev 8/ })).toBeVisible();
	await page.getByRole("tab", { name: "Summary" }).click();
	await expect(page.getByText("Price")).toBeVisible();
	await page.getByRole("tab", { name: "Spread" }).click();
	await expect(page.getByRole("table", { name: "Spread" }).getByRole("row").last()).toContainText(
		"Total",
	);
});

test("plans with the keyboard and applies the sheet to the tracker", async ({ page }) => {
	await openWork(page, "Plan");
	const bar = page.getByRole("button", { name: /^Token API,/ });
	await expect(bar).toHaveAccessibleName(/2026-11-02 to/);
	await bar.focus();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("button", { name: /^Token API,/ })).toHaveAccessibleName(
		/2026-11-03 to/,
	);

	await page.getByRole("button", { name: "Apply" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Create (8)" })).toBeVisible();
	await dialog.getByRole("button", { name: "Apply" }).click();
	await expect(dialog.getByRole("heading", { name: "Written (8)" })).toBeVisible();
	await page.keyboard.press("Escape");

	// A second apply creates nothing.
	await page.getByRole("button", { name: "Apply" }).click();
	await expect(
		page.getByRole("dialog").getByRole("heading", { name: "Unchanged (8)" }),
	).toBeVisible();
	await expect(page.getByRole("dialog").getByRole("button", { name: "Apply" })).toBeDisabled();
});

test("adds a time entry and sends it with one click", async ({ page }) => {
	await openWork(page, "Time");
	await expect(page.getByRole("heading", { name: "To send (2)" })).toBeVisible();
	await page.getByRole("button", { name: "Entry" }).click();
	await page.getByRole("textbox", { name: "Duration" }).fill("90");
	await page.getByRole("combobox", { name: "Ticket" }).fill("ACME-3");
	await page.getByRole("textbox", { name: "Note" }).fill("Pairing");
	await page.getByRole("button", { name: "Entry" }).last().click();
	await expect(page.getByRole("heading", { name: "To send (3)" })).toBeVisible();

	await page.getByRole("button", { name: /^Send 2026-11-02 ACME-3$/ }).click();
	await expect(page.getByRole("heading", { name: "To send (2)" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "In tracker (2)" })).toBeVisible();
	await expect(page.getByRole("button", { name: /^Send 2026-11-02 ACME-3$/ })).toHaveCount(0);
});

test("edits the team and seals the project, then unlocks it", async ({ page }) => {
	await openWork(page, "Team");
	await page.getByRole("row", { name: "grace" }).getByRole("button").click();
	const panel = inspector(page, "Grace Hopper");
	const capacity = panel.getByRole("spinbutton", { name: "Capacity (days a week)" });
	await capacity.fill("3");
	await panel.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("row", { name: "grace" }).getByRole("cell").nth(2)).toHaveText("3");

	await tabs(page).getByRole("link", { name: "Estimates" }).click();
	await page.getByRole("button", { name: "Seal" }).click();
	const field = page.getByLabel("Passphrase", { exact: true });
	await expect(field).toHaveAttribute("type", "password");
	await field.fill("s3cret");
	await page.getByLabel("Repeat the passphrase").fill("s3cret");
	await page.getByRole("button", { name: "Seal" }).last().click();
	await page.getByRole("button", { name: "Lock" }).click();
	await expect(page.getByText("Sealed")).toBeVisible();
	await expect(page.getByRole("table")).toHaveCount(0);
	await page.getByLabel("Passphrase").fill("s3cret");
	await page.getByRole("button", { name: "Unlock" }).click();
	await expect(page.getByRole("table", { name: "Backlog" })).toBeVisible();
});

test("shows the Work views in French", async ({ page }) => {
	await openWork(page, "Time");
	await sidebar(page).getByRole("link", { name: "Settings" }).click();
	await tabs(page).getByRole("link", { name: "Me" }).click();
	await page.getByRole("combobox", { name: "Language" }).click();
	await page.getByRole("option", { name: "French" }).click();
	await page
		.getByRole("navigation", { name: "Barre latérale" })
		.getByRole("link", { name: "Travail" })
		.click();
	const onglets = page.getByRole("navigation", { name: "Onglets" });
	await onglets.getByRole("link", { name: "Temps" }).click();
	await expect(page.getByRole("heading", { name: "À envoyer (2)" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Saisie" })).toBeVisible();
	await onglets.getByRole("link", { name: "Équipe" }).click();
	await expect(page.getByRole("button", { name: "Membre" })).toBeVisible();
});
