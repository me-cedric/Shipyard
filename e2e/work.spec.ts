import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";
import { placeOf } from "./places";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
const inspector = (page: Page, name: string) => page.getByRole("complementary", { name });
/** The name of the row or the card of a feature: its title, then the key of its ticket. */
const ticket = (key: string) => new RegExp(`${key}(?!\\d)`);

/** Opens the mock project with a Linear tracker, imports the backlog and opens a section of Flow, Plan or Crew. */
async function openWork(page: Page, tab: string) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Setup" }).click();
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
	await expect(page.getByRole("combobox", { name: "Issue tracker", exact: true })).toContainText(
		"Acme",
	);
	await sidebar(page).getByRole("link", { name: "Flow" }).click();
	await tabs(page).getByRole("link", { name: "List" }).click();
	await page.getByRole("button", { name: "Import" }).click();
	await page.getByRole("button", { name: "Confirm" }).click();
	await expect(page.getByRole("button", { name: ticket("ACME-1") })).toBeVisible();
	await sidebar(page)
		.getByRole("link", { name: placeOf(tab) })
		.click();
	await tabs(page).getByRole("link", { name: tab, exact: true }).click();
}

test("assigns a member from the ranked list and marks the item for the agent", async ({ page }) => {
	await openWork(page, "List");
	// The ticket opens on its page, in the Brief, from the menu of its row.
	await page.getByRole("button", { name: ticket("ACME-8") }).click({ button: "right" });
	await page.getByRole("menuitem", { name: "Edit the ticket" }).click();
	const assignee = page.getByRole("combobox", { name: "Assignee" });
	await assignee.click();
	await expect(page.getByRole("option", { name: /^Grace Hopper/ })).toBeVisible();
	// Opening the suggestion assigns nobody.
	await expect(assignee).not.toContainText("Hopper");
	await page.getByRole("option", { name: /^Grace Hopper/ }).click();
	await expect(assignee).toContainText("Grace Hopper");
	await page.getByRole("button", { name: "Mark for agent" }).click();
	await expect(page.getByRole("button", { name: "Mark for agent" })).toBeDisabled();
});

test("moves a card on the board with the keyboard", async ({ page }) => {
	await openWork(page, "Flow");
	// The drag and Shift+Arrow of the old board are the "Move to" item of the menu of the card.
	const card = page.getByRole("button", { name: ticket("ACME-3") });
	await card.focus();
	await page.keyboard.press("ContextMenu");
	await page.getByRole("menuitem", { name: "Move to In Progress" }).click();
	// The ticket has the new status: the list with the filter In Progress holds it, with 2 more.
	await tabs(page).getByRole("link", { name: "List" }).click();
	await page.getByRole("combobox", { name: "Status" }).click();
	await page.getByRole("option", { name: "In Progress" }).click();
	await expect(page.getByRole("button", { name: ticket("ACME-3") })).toBeVisible();
	await expect(page.getByRole("button", { name: /ACME-\d+/ })).toHaveCount(3);
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
	await openWork(page, "Timeline");
	await expect(page).toHaveURL(/\/plan\/timeline$/);
	const bar = page.getByRole("button", { name: /^Token API,/ });
	await expect(bar).toHaveAccessibleName(/2026-11-02 to/);
	await bar.focus();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("button", { name: /^Token API,/ })).toHaveAccessibleName(
		/2026-11-03 to/,
	);

	const send = page.getByRole("button", { name: "Send to the issue tracker" });
	await send.click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "New (8)" })).toBeVisible();
	await dialog.getByRole("button", { name: "Apply" }).click();
	await expect(dialog.getByRole("heading", { name: "Written (8)" })).toBeVisible();
	await page.keyboard.press("Escape");

	// A second apply creates nothing.
	await send.click();
	await expect(
		page.getByRole("dialog").getByRole("heading", { name: "Stays the same (8)" }),
	).toBeVisible();
	await expect(page.getByRole("dialog").getByRole("button", { name: "Apply" })).toBeDisabled();
});

test("adds a time entry that goes to the issue tracker on save, and sends a waiting one", async ({
	page,
}) => {
	await openWork(page, "Time");
	await expect(page.getByRole("heading", { name: "To send (2)" })).toBeVisible();
	await page.getByRole("button", { name: "Entry" }).click();
	await page.getByRole("textbox", { name: "Duration" }).fill("90");
	await page.getByRole("combobox", { name: "Ticket" }).fill("ACME-3");
	await page.getByRole("textbox", { name: "Note" }).fill("Pairing");
	await page.getByRole("button", { name: "Entry" }).last().click();
	// The issue tracker takes worklogs: the new entry is sent at once.
	await expect(page.getByRole("heading", { name: "In issue tracker (2)" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "To send (2)" })).toBeVisible();

	// An entry that waits is sent with one click.
	await page
		.getByRole("button", { name: /^Send / })
		.first()
		.click();
	await expect(page.getByRole("heading", { name: "To send (1)" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "In issue tracker (3)" })).toBeVisible();
});

test("edits the team and seals the project, then unlocks it", async ({ page }) => {
	await openWork(page, "Crew");
	const grace = page
		.getByRole("list", { name: "People" })
		.getByRole("button", { name: /^Grace Hopper/ });
	await grace.click();
	// The member is a page of Crew, with its handle in the address.
	await expect(page).toHaveURL(/\/crew\/crew\?member=grace$/);
	const panel = page.getByRole("main");
	await expect(panel.getByRole("heading", { level: 1, name: "Grace Hopper" })).toBeVisible();
	const capacity = panel.getByRole("spinbutton", { name: "Capacity (days a week)" });
	await capacity.fill("3");
	await panel.getByRole("button", { name: "Save" }).click();
	await panel.getByRole("button", { name: "Crew", exact: true }).click();
	await expect(grace).toContainText("3 days a week");

	await sidebar(page).getByRole("link", { name: "Plan" }).click();
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
	await sidebar(page).getByRole("link", { name: "Setup" }).click();
	await tabs(page).getByRole("link", { name: "Me" }).click();
	await page.getByRole("combobox", { name: "Language", exact: true }).click();
	await page.getByRole("option", { name: "French" }).click();
	const barre = page.getByRole("navigation", { name: "Barre latérale" });
	await barre.getByRole("link", { name: "Plan" }).click();
	const onglets = page.getByRole("navigation", { name: "Onglets" });
	await onglets.getByRole("link", { name: "Temps" }).click();
	await expect(page.getByRole("heading", { name: "À envoyer (2)" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Saisie" })).toBeVisible();
	await barre.getByRole("link", { name: "Équipe" }).click();
	await onglets.getByRole("link", { name: "Équipe" }).click();
	await expect(page.getByRole("button", { name: "Membre" })).toBeVisible();
});

test("Plan gives the end date in its title and one capacity card with proposals", async ({
	page,
}) => {
	await openWork(page, "Timeline");
	const main = page.getByRole("main");
	// The title says when the release ends, and it is the only level-one heading.
	await expect(main.getByRole("heading", { level: 1 })).toHaveText(
		/^MVP 1 ends \d{1,2}\/\d{1,2}\/\d{4}$/,
	);
	await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
	// The people who are over are one card, not one warning for each person.
	const card = main.getByRole("article").filter({ hasText: "too much work" });
	await expect(card).toHaveCount(1);
	await expect(card.getByRole("heading", { name: /too much work$/ })).toBeVisible();
	await expect(card.getByRole("button", { name: /^Apply: / })).not.toHaveCount(0);
	await expect(card.getByRole("button", { name: "Rebalance" })).toBeVisible();
	// One proposal applies as a decision of the plan: the task starts on the proposed day.
	const later = card.getByRole("button", { name: "Apply: Export endpoint starts 11/13/2026" });
	await later.click();
	await expect(later).toHaveCount(0);
	await expect(page.getByRole("button", { name: /^Export endpoint,/ })).toHaveAccessibleName(
		/2026-11-13 to /,
	);

	// Show opens People: each person with the load, and the proposals of a person who is over.
	await card.getByRole("link", { name: "Show" }).click();
	await expect(page).toHaveURL(/\/plan\/people/);
	await expect(main.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
	await expect(main.getByRole("heading", { name: /^Ada Lovelace \(\d+\)$/ })).toBeVisible();
	await expect(main.getByText(/^[\d.]+ of [\d.]+ days$/).first()).toBeVisible();
	// A capacity warning opens the member in Crew.
	await main
		.getByRole("link", { name: /is over capacity on \d+ days?/ })
		.first()
		.click();
	await expect(page).toHaveURL(/\/crew\/crew\?member=/);
	await expect(page.getByRole("spinbutton", { name: "Capacity (days a week)" })).toBeVisible();
});

test("asks an agent to estimate, and Accept puts the values in the sheet", async ({ page }) => {
	await openWork(page, "Estimates");
	const table = page.getByRole("table", { name: "Backlog" });
	const ask = page.getByRole("button", { name: "Ask an agent to estimate" });
	// No task is selected: the action is off.
	await expect(ask).toBeDisabled();
	await expect(table.getByRole("row", { name: /Export endpoint dev 6/ })).toBeVisible();
	await table.getByRole("checkbox", { name: "Select Export endpoint" }).check();
	await ask.click();
	// The agent only proposes: the sheet keeps its 6 days until Accept.
	const row = page
		.getByRole("region", { name: "Proposals of the agent" })
		.getByRole("listitem", { name: "Export endpoint" });
	await expect(row).toContainText("6 → 7");
	await expect(row).toContainText("— → 3.5");
	await expect(row).toContainText("— → 14");
	await expect(table.getByRole("row", { name: /Export endpoint dev 6/ })).toBeVisible();
	await row.getByRole("button", { name: "Accept" }).click();
	await expect(row).toHaveCount(0);
	await expect(table.getByRole("row", { name: /Export endpoint dev 7/ })).toBeVisible();
	// The three values are in the task.
	await table.getByRole("cell", { name: "Export endpoint", exact: true }).click();
	const panel = inspector(page, "Task");
	await expect(panel.getByRole("spinbutton", { name: "Likely" })).toHaveValue("7");
	await expect(panel.getByRole("spinbutton", { name: "Optimistic" })).toHaveValue("3.5");
	await expect(panel.getByRole("spinbutton", { name: "Pessimistic" })).toHaveValue("14");
});
