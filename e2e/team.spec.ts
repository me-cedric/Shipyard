import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });

const main = (page: Page) => page.getByRole("main");
const people = (page: Page) => page.getByRole("list", { name: "People" });

/** Opens the mock project on Crew. */
async function openCrew(page: Page) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Crew" }).click();
	await tabs(page).getByRole("link", { name: "Crew" }).click();
}

/** The item "Add a person" of the More menu of Crew. */
const addItem = (page: Page) => page.getByRole("menuitem", { name: "Add a person" });
const openMore = (page: Page) =>
	main(page).getByRole("button", { name: "More", exact: true }).click();

/** Adds a member on the member page of Crew, saves, and goes back to the cards. */
async function addMember(page: Page, name: string, handle: string, role: string, admin = false) {
	await openMore(page);
	await addItem(page).click();
	const panel = main(page);
	await expect(panel.getByRole("heading", { level: 1, name: "Add a person" })).toBeVisible();
	await panel.getByRole("textbox", { name: "Name" }).fill(name);
	await panel.getByRole("textbox", { name: "Handle" }).fill(handle);
	await panel.getByRole("combobox", { name: "Role" }).click();
	await page.getByRole("option", { name: role }).click();
	if (admin) await panel.getByRole("switch", { name: "Admin" }).click();
	await panel.getByRole("button", { name: "Save" }).click();
	// The saved member stays open under its name, and its address holds the handle.
	await expect(panel.getByRole("heading", { level: 1, name })).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`member=${handle}$`));
	await panel.getByRole("link", { name: "Crew", exact: true }).click();
	await expect(people(page).getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
}

test("a solo project gets two members with an admin, then an unknown person reads and cannot save", async ({
	page,
}) => {
	await openCrew(page);
	// No admin in the team file: every right, so the item "Add a person" is on.
	await openMore(page);
	await expect(addItem(page)).toBeEnabled();
	await page.keyboard.press("Escape");
	await addMember(page, "Bo Dev", "bo", "Developer");
	await addMember(page, "Cy Lead", "cy", "Tech lead", true);
	// The team has an admin and this person matches no member: a viewer.
	// The menu item has no reason text (the shared PageHeader gives none): the item is off.
	await openMore(page);
	await expect(addItem(page)).toHaveAttribute("aria-disabled", "true");
	await page.keyboard.press("Escape");
	// Crew / Rights says who the person is.
	await tabs(page).getByRole("link", { name: "Rights" }).click();
	await main(page).getByRole("link", { name: "Team file, requests and log" }).click();
	await expect(page.getByText("You are not in the team file")).toBeVisible();
	// Every view still reads: Setup / This project opens, and its save is off.
	await sidebar(page).getByRole("link", { name: "Setup" }).click();
	await tabs(page).getByRole("link", { name: "This project" }).click();
	// The name is a row of the card Project: open the row to reach its field.
	await page.locator("summary", { hasText: /^Name/ }).click();
	await page.getByRole("textbox", { name: "Name" }).first().fill("Renamed");
	const save = page.getByRole("button", { name: "Save", exact: true });
	await expect(save).toBeDisabled();
	await expect(save).toHaveAccessibleDescription(
		"Needs the right project.settings (your role: Viewer)",
	);
});

test("Crew shows the people and the agents on one page, and the live view shows a row for each agent at work", async ({
	page,
}) => {
	await openCrew(page);
	await expect(page).toHaveURL(/\/crew\/crew$/);
	await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(/^Crew/);
	await expect(main(page).getByRole("heading", { level: 1 })).toHaveCount(1);
	// The people, each with the load of the plan.
	await expect(people(page).getByRole("button", { name: /^Ada Lovelace/ })).toContainText(
		"Ada Lovelace",
	);
	await expect(people(page).getByRole("button", { name: /^Grace Hopper/ })).toContainText(
		/Has room|Over by \d+ days/,
	);
	// The agent roles with their current work, then the spend and the recipes.
	const agents = page.getByRole("list", { name: "Agents" });
	await expect(agents.getByRole("link", { name: /^Worker/ })).toContainText(/\d at work|Needs you/);
	await expect(agents.getByRole("link", { name: "Budgets" })).toHaveAttribute(
		"href",
		"/crew/spend",
	);
	await expect(
		page.getByRole("list", { name: "Recipes" }).getByRole("link", { name: "Edit Bug" }),
	).toHaveAttribute("href", "/crew/recipes?recipe=bug");

	// Live: the address keeps the view, and each agent at work has one row.
	await openMore(page);
	await page.getByRole("menuitem", { name: "Live", exact: true }).click();
	await expect(page).toHaveURL(/\/crew\/crew\?view=live$/);
	await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(/^\d+ agents? at work$/);
	// The cards and the live rows are one switch of two.
	await expect(main(page).getByRole("button", { name: "Live", exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	const rows = page.getByRole("table", { name: "Agents at work" }).locator("tbody tr");
	await expect(rows.first().getByRole("button").first()).toBeVisible();
	expect(await rows.count()).toBeGreaterThan(0);
	// A row names its feature, and the feature opens from it.
	await rows.first().getByRole("link").first().click();
	await expect(page).toHaveURL(/\/flow\//);
});

test("the old addresses of Team, Agents map, Workflows and Usage open their section of Crew", async ({
	page,
}) => {
	for (const [old, now] of [
		["/work/team", /\/crew\/crew$/],
		["/factory/agents-map", /\/crew\/crew\?view=live$/],
		["/factory/workflows", /\/crew\/recipes$/],
		["/factory/usage", /\/crew\/spend$/],
		["/work/plan", /\/plan\/timeline$/],
	] as const) {
		await page.goto(old);
		await expect(page).toHaveURL(now);
	}
});
