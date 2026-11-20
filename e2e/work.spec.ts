import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";
import { placeOf } from "./places";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
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
	await tabs(page).getByRole("link", { name: "This project" }).click();
	// The connections of an issue tracker are behind the door Connections of This project.
	await page
		.getByRole("navigation", { name: "This project" })
		.getByRole("link", { name: "Connections" })
		.click();
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	await page.getByLabel("API key", { exact: true }).and(page.locator("input")).fill("tok-e2e-work");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("group", { name: "Acme" })).toBeVisible();
	// The only tracker links itself to the project.
	await tabs(page).getByRole("link", { name: "This project" }).click();
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
	// The tasks are sections by feature, with one row for each task.
	const section = page.getByRole("region", { name: "Authentication", exact: true });
	await expect(section.getByRole("heading", { name: "Authentication" })).toBeVisible();
	await expect(section.getByRole("listitem")).toHaveCount(4);
	// A task is a page of its own (`?task=<id>`).
	await page.getByRole("button", { name: "Export endpoint", exact: true }).click();
	await expect(page).toHaveURL(/\/plan\/estimates\?task=/);
	await expect(page.getByRole("heading", { level: 1, name: "Export endpoint" })).toBeVisible();
	const likely = page.getByRole("spinbutton", { name: "Likely" });
	await expect(likely).toHaveValue("6");
	await likely.fill("8");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("group", { name: "Export endpoint", exact: true })).toContainText(
		"8",
	);
	// Summary, Spread and Portfolio are one view; the amounts are on Costing. The Spread is a chart of the months.
	await page.getByRole("button", { name: "Summary", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
	await expect(page.getByRole("img", { name: /^Days of work for each month/ })).toBeVisible();
	await expect(page.getByText("All", { exact: true }).first()).toBeVisible();
	await page.getByRole("button", { name: "Costing", exact: true }).click();
	await expect(page.getByText("Price", { exact: true })).toBeVisible();
});

test("plans with the keyboard and applies the sheet to the tracker", async ({ page }) => {
	await openWork(page, "Timeline");
	await expect(page).toHaveURL(/\/plan\/timeline$/);
	const bar = page.getByRole("button", { name: /(^|, )Token API,/ });
	await expect(bar).toHaveAccessibleName(/2 Nov to/);
	await bar.focus();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("button", { name: /(^|, )Token API,/ })).toHaveAccessibleName(
		/3 Nov to/,
	);

	// The send is a page of People (`?page=send`): the button of People, then "Send".
	await tabs(page).getByRole("link", { name: "People" }).click();
	const open = () => page.getByRole("button", { name: "Send to the issue tracker" }).click();
	await open();
	await expect(page).toHaveURL(/\/plan\/people\?page=send$/);
	const main = page.getByRole("main");
	await expect(main.getByRole("heading", { name: "Create, 8" })).toBeVisible();
	await main.getByRole("button", { name: "Send", exact: true }).click();
	await expect(main.getByRole("heading", { name: "Written, 8" })).toBeVisible();
	await main.getByRole("link", { name: "People", exact: true }).first().click();

	// A second send creates nothing.
	await open();
	await expect(main.getByRole("heading", { name: "No change, 8" })).toBeVisible();
	await expect(main.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
});

test("adds a time entry that goes to the issue tracker on save, and sends a waiting one", async ({
	page,
}) => {
	await openWork(page, "Time");
	// The entries and their send are the page `?page=entries`, behind the row "Send the hours".
	const entries = () =>
		page.getByRole("link", { name: "Send the hours to the issue tracker" }).click();
	await entries();
	await expect(page).toHaveURL(/\/plan\/time\?page=entries$/);
	await expect(page.getByRole("heading", { name: "To send (2)" })).toBeVisible();
	await page.getByRole("link", { name: "Time", exact: true }).first().click();
	// A new entry opens from the week: the button "Add a ticket", then the same button sends the form.
	await page.getByRole("button", { name: "Add a ticket" }).first().click();
	await page.getByRole("textbox", { name: "Duration" }).fill("90");
	await page.getByRole("combobox", { name: "Ticket" }).fill("ACME-3");
	await page.getByRole("textbox", { name: "Note", exact: true }).fill("Pairing");
	await page.locator("form").getByRole("button", { name: "Add a ticket" }).click();
	await entries();
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
	// "Capacity (days a week)" is the stepper "Days in a week": half a day for each press.
	const less = panel.getByRole("button", { name: "Days in a week, less" });
	const value = less.locator("xpath=..").locator("output");
	const now = Number(await value.textContent());
	for (let n = 0; n < Math.round((now - 3) * 2); n++) await less.click();
	await expect(value).toHaveText("3");
	await panel.getByRole("button", { name: "Save" }).click();
	await panel.getByRole("link", { name: "Crew", exact: true }).click();
	// The card shows no capacity: the saved value shows on the page of the person.
	await grace.click();
	await expect(
		page
			.getByRole("main")
			.getByRole("button", { name: "Days in a week, less" })
			.locator("xpath=..")
			.locator("output"),
	).toHaveText("3");
	await page.getByRole("main").getByRole("link", { name: "Crew", exact: true }).click();

	await sidebar(page).getByRole("link", { name: "Plan" }).click();
	await tabs(page).getByRole("link", { name: "Estimates" }).click();
	// The seal is on the view Costing: one field asks the passphrase two times.
	await page.getByRole("button", { name: "Costing", exact: true }).click();
	const field = page.getByLabel("Passphrase", { exact: true });
	await expect(field).toHaveAttribute("type", "password");
	await field.fill("s3cret");
	await page.getByRole("button", { name: "Seal", exact: true }).click();
	await page.getByLabel("Repeat the passphrase").fill("s3cret");
	await page.getByRole("button", { name: "Seal", exact: true }).click();
	await page.getByRole("button", { name: "Lock" }).click();
	await expect(page.getByText("Sealed", { exact: true })).toBeVisible();
	await expect(page.getByRole("region", { name: "Authentication" })).toHaveCount(0);
	await page.getByLabel("Passphrase").fill("s3cret");
	await page.getByRole("button", { name: "Unlock" }).click();
	await page.getByRole("button", { name: "Tasks", exact: true }).click();
	await expect(page.getByRole("region", { name: "Authentication" })).toBeVisible();
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
	await expect(page.getByRole("button", { name: "Ajouter un ticket" }).first()).toBeVisible();
	await page.getByRole("link", { name: "Envoyer les heures à l'outil de suivi" }).click();
	await expect(page.getByRole("heading", { name: "À envoyer (2)" })).toBeVisible();
	await barre.getByRole("link", { name: "Équipe" }).click();
	await onglets.getByRole("link", { name: "Équipe" }).click();
	await page.getByRole("main").getByRole("button", { name: "Plus", exact: true }).click();
	await expect(page.getByRole("menuitem", { name: "Ajouter une personne" })).toBeVisible();
});

test("Plan gives the end date in its title and one capacity card with proposals", async ({
	page,
}) => {
	await openWork(page, "Timeline");
	const main = page.getByRole("main");
	// The title says when the release ends, and it is the only level-one heading.
	await expect(main.getByRole("heading", { level: 1 })).toHaveText(/^MVP 1 ends \d{1,2} \w{3}$/);
	await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
	// The people who are over are one card, not one warning for each person.
	const card = main.getByRole("region").filter({ hasText: "too much work" });
	await expect(card).toHaveCount(1);
	await expect(card.getByRole("heading", { name: /too much work$/ })).toBeVisible();
	await expect(card.getByRole("button", { name: "Rebalance" })).toBeVisible();

	// Show opens People: each person with the load, and the proposals of a person who is over.
	await card.getByRole("link", { name: "Show" }).click();
	await expect(page).toHaveURL(/\/plan\/people/);
	await expect(main.getByRole("heading", { level: 1 })).toHaveText(/too much work$/);
	await expect(main.getByText("Ada", { exact: true }).first()).toBeVisible();
	await expect(main.getByRole("img", { name: /: [\d.]+ of [\d.]+ days$/ }).first()).toBeVisible();
	// The proposals are on People. One proposal applies as a decision of the plan: the task starts on the proposed day.
	const proposals = main.getByRole("button", { name: /^Apply: / });
	await expect(proposals).not.toHaveCount(0);
	const later = main.getByRole("button", { name: /^Apply: Export endpoint starts \d{1,2} \w{3}$/ });
	await later.click();
	await expect(later).toHaveCount(0);
	await tabs(page).getByRole("link", { name: "Timeline" }).click();
	await expect(page.getByRole("button", { name: /(^|, )Export endpoint,/ })).toHaveAccessibleName(
		/13 Nov to /,
	);
	await tabs(page).getByRole("link", { name: "People" }).click();
	// A capacity warning opens the member in Crew.
	await main
		.getByRole("link", { name: /is over capacity on \d+ days?/ })
		.first()
		.click();
	await expect(page).toHaveURL(/\/crew\/crew\?member=/);
	await expect(page.getByRole("button", { name: "Days in a week, less" })).toBeVisible();
});

test("asks an agent to estimate, and Accept puts the values in the sheet", async ({ page }) => {
	await openWork(page, "Estimates");
	const days = page.getByRole("group", { name: "Export endpoint", exact: true });
	const ask = page.getByRole("button", { name: "Ask an agent to estimate" });
	// No task is selected: the action asks for a choice, opens the selection and starts nothing.
	await expect(days).toContainText("6");
	await ask.click();
	await expect(page.getByText("Select tasks first")).toBeVisible();
	await expect(page.getByRole("region", { name: "Proposals of the agent" })).toHaveCount(0);
	await page.getByRole("checkbox", { name: "Select Export endpoint" }).check();
	await ask.click();
	// The agent only proposes: the sheet keeps its 6 days until Accept.
	const row = page
		.getByRole("region", { name: "Proposals of the agent" })
		.getByRole("listitem", { name: "Export endpoint" });
	await expect(row).toContainText("6 → 7");
	await expect(row).toContainText("— → 3.5");
	await expect(row).toContainText("— → 14");
	await expect(days).toContainText("6");
	await row.getByRole("button", { name: "Accept" }).click();
	await expect(row).toHaveCount(0);
	await expect(days).toContainText("7");
	// The three values are in the task.
	await page.getByRole("button", { name: "Export endpoint", exact: true }).click();
	await expect(page.getByRole("spinbutton", { name: "Likely" })).toHaveValue("7");
	await expect(page.getByRole("spinbutton", { name: "Best" })).toHaveValue("3.5");
	await expect(page.getByRole("spinbutton", { name: "Worst" })).toHaveValue("14");
});
