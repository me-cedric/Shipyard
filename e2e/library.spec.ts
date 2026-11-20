import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";
import { openLibrary } from "./places";

const main = (page: Page) => page.getByRole("main");

/** Opens the mock project and waits for Today. */
async function openProject(page: Page) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();
}

test("opens Library on the four doors, a chip opens its page and the back link returns", async ({
	page,
}) => {
	await openProject(page);
	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Library" })
		.click();
	await expect(page).toHaveURL(/\/library\/home$/);
	await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
	for (const door of ["What it must do", "How it is built", "Why it is so", "Learn and share"])
		await expect(main(page).getByRole("region", { name: door })).toBeVisible();
	// Library has no section switch (spec:app-redesign#REQ-020).
	await expect(page.getByRole("navigation", { name: "Tabs" })).toHaveCount(0);

	await main(page)
		.getByRole("region", { name: "How it is built" })
		.getByRole("link", { name: "Diagrams", exact: true })
		.click();
	await expect(page).toHaveURL(/\/library\/diagrams$/);
	await expect(page.getByRole("list", { name: "Diagrams" })).toBeVisible();
	await expect(page.getByRole("navigation", { name: "Tabs" })).toHaveCount(0);

	await main(page).getByRole("link", { name: "Library", exact: true }).click();
	await expect(page).toHaveURL(/\/library\/home$/);
	await expect(main(page).getByRole("region", { name: "Why it is so" })).toBeVisible();
});

test("opens an architecture model on its picture, and a switch shows the text", async ({
	page,
}) => {
	await openProject(page);
	await openLibrary(page, "Architecture");
	await page.getByRole("group", { name: "Models" }).getByRole("button", { name: "system" }).click();
	// spec:app-redesign#REQ-021: the picture first, the text on demand.
	const view = page.getByRole("navigation", { name: "View" });
	const text = page.getByRole("textbox", { name: "Model text" });
	await expect(view.getByRole("button", { name: "Picture" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByRole("heading", { name: "system" })).toBeVisible();
	await expect(text).toHaveCount(0);
	await view.getByRole("button", { name: "Text" }).click();
	await expect(text).toHaveValue(/\S/);
	await view.getByRole("button", { name: "Both" }).click();
	await expect(text).toBeVisible();
	await expect(page.getByRole("heading", { name: "system" })).toBeVisible();
});

test("lists the reports on one page, filters them by format and exports one", async ({ page }) => {
	await openProject(page);
	await openLibrary(page, "Reports");
	await expect(page).toHaveURL(/\/library\/reports$/);
	await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
	const card = (name: string) => main(page).getByRole("heading", { level: 2, name, exact: true });
	for (const name of ["Complete dossier", "Work done", "Questions and risks", "Timeline picture"])
		await expect(card(name)).toBeVisible();
	await expect(page.getByRole("link", { name: "Fill the form Change request" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Open Estimates" })).toBeVisible();

	// The format choice is a filter: the dossier is a Word file.
	const format = page.getByRole("group", { name: "Format" });
	await format.getByRole("button", { name: "Excel" }).click();
	await expect(card("Work done")).toBeVisible();
	await expect(card("Complete dossier")).toHaveCount(0);
	await format.getByRole("button", { name: "Word" }).click();
	await page.getByRole("button", { name: "Export Complete dossier" }).click();
	await expect(page.getByText("Exported: /mock/dossier.docx").first()).toBeVisible();
});

test("builds a tile for me: the dashboard changes only on Accept", async ({ page }) => {
	await openProject(page);
	await openLibrary(page, "Dashboards");
	// The dashboard is edited on its own page.
	await page.getByRole("link", { name: "Edit", exact: true }).click();
	await expect(page).toHaveURL(/\/library\/dashboards\/[^/]+\/edit$/);
	const tiles = page.getByRole("list", { name: /^Tiles \(\d+\)$/ });
	const before = Number((await tiles.getAttribute("aria-label"))?.match(/\d+/)?.[0]);

	// spec:app-redesign#REQ-032, scenario "A proposed tile".
	await page.getByRole("button", { name: "Build a tile for me" }).click();
	await page.getByRole("textbox", { name: "What the tile must show" }).fill("Specs health");
	await expect(page.getByRole("group", { name: "Budget (USD)" })).toContainText("$2");
	await page.getByRole("button", { name: "Build", exact: true }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "The agent builds the tile" }),
	).toBeVisible();
	const proposed = page.getByRole("region", { name: "Proposed tile" });
	await expect(proposed.getByRole("region", { name: "Specs health" })).toBeVisible();
	await expect(proposed.getByRole("button", { name: "Discard" })).toBeVisible();
	await expect(page.getByRole("list", { name: `Tiles (${before})` })).toBeVisible();

	// Scenario "Accept".
	await proposed.getByRole("button", { name: "Accept" }).click();
	await expect(page.getByRole("list", { name: `Tiles (${before + 1})` })).toBeVisible();
	await expect(proposed).toHaveCount(0);
	await expect(
		page.getByRole("list", { name: `Tiles (${before + 1})` }).getByRole("region", {
			name: "Specs health",
		}),
	).toBeVisible();
});

test("opens the form of a report on its own page and asks for each field", async ({ page }) => {
	await openProject(page);
	await openLibrary(page, "Reports");
	await page.getByRole("link", { name: "Fill the form Change request" }).click();
	await expect(page).toHaveURL(/\/library\/reports\/change-request$/);
	await expect(page.getByRole("heading", { level: 1, name: "Change request" })).toBeVisible();
	// An empty required field gives an error line and writes nothing.
	await page.getByRole("button", { name: "Write the report" }).click();
	await expect(page.getByText("Fill in each field before you write the report.")).toBeVisible();
	await expect(page.getByText("Written", { exact: true })).toHaveCount(0);
	await page.getByRole("textbox", { name: "Title" }).fill("Add billing");
	await page.getByRole("button", { name: "Write the report" }).click();
	await expect(page.getByText("Fill in each field before you write the report.")).toHaveCount(0);
	await expect(page.getByText("Written", { exact: true }).first()).toBeVisible();
	// The back link returns to Reports.
	await page.getByRole("main").getByRole("link", { name: "Reports", exact: true }).click();
	await expect(page).toHaveURL(/\/library\/reports$/);
});

test("opens the dashboard editor from Dashboards and returns by its back link", async ({
	page,
}) => {
	await openProject(page);
	await openLibrary(page, "Dashboards");
	await page.getByRole("link", { name: "Edit", exact: true }).click();
	await expect(page).toHaveURL(/\/library\/dashboards\/team\/edit$/);
	await expect(page.getByRole("heading", { level: 2, name: "Add a tile" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Tile settings Runs" })).toBeVisible();
	await page.getByRole("main").getByRole("link", { name: "Dashboards", exact: true }).click();
	await expect(page).toHaveURL(/\/library\/dashboards$/);
});

test("opens the full flow matrix and the coverage page from their back links", async ({ page }) => {
	await openProject(page);
	await openLibrary(page, "Network flows");
	await page.getByRole("link", { name: "Open the full matrix" }).click();
	await expect(page).toHaveURL(/\/library\/flows\/matrix$/);
	await expect(page.getByRole("heading", { level: 1, name: "Flow matrix" })).toBeVisible();
	await page.getByRole("main").getByRole("link", { name: "Network flows", exact: true }).click();
	await expect(page).toHaveURL(/\/library\/flows$/);

	// The home of Library has a chip for "What is tested".
	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Library" })
		.click();
	await page.getByRole("main").getByRole("link", { name: "What is tested", exact: true }).click();
	await expect(page).toHaveURL(/\/library\/test-plans\/coverage$/);
	await expect(page.getByRole("heading", { level: 1, name: "What is tested" })).toBeVisible();
	await page.getByRole("main").getByRole("link", { name: "Test plans", exact: true }).click();
	await expect(page).toHaveURL(/\/library\/test-plans$/);
});
