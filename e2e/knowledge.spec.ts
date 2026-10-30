import { expect, type Page, test } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });

/** Opens the mock project, then the Knowledge space on the given tab. */
async function openKnowledge(page: Page, tab: string) {
	await page.goto("/home/inbox");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Knowledge" }).click();
	await tabs(page).getByRole("link", { name: tab }).click();
}

test("filters the graph by kind and explains an entity from the inspector", async ({ page }) => {
	await openKnowledge(page, "Graph");
	const adr = page.getByRole("button", { name: /^ADR adr:0001/ });
	await expect(adr).toBeVisible();
	const spec = page.getByRole("button", { name: /^Spec spec:auth/ });
	await expect(spec.first()).toBeVisible();

	// A kind toggle hides its nodes and shows them again.
	const toggle = page.getByRole("button", { name: /^ADR \d+$/ });
	await toggle.click();
	await expect(adr).toHaveCount(0);
	await toggle.click();
	await expect(adr).toBeVisible();

	// The search field narrows the nodes by name.
	await page.getByRole("textbox", { name: "Search" }).fill("adr:0001");
	await expect(spec).toHaveCount(0);
	await expect(adr).toBeVisible();

	// The table lists the same nodes: its row opens the entity, whatever the pan of the canvas.
	await page.getByRole("button", { name: "Table view" }).click();
	await adr.click();
	const inspector = page.getByRole("complementary", { name: "Inspector" });
	await inspector.getByRole("button", { name: "Explain" }).click();
	const log = page.getByRole("complementary", { name: "Assistant" }).getByRole("log");
	await expect(log.getByText("Explain adr:0001")).toBeVisible();
	await expect(log.getByText(/adr:0001 is part of the project graph/)).toBeVisible();
});

test("edits a handbook page and saves it", async ({ page }) => {
	await openKnowledge(page, "Handbook");
	await page.getByRole("button", { name: "Getting started" }).click();
	await page.getByRole("tab", { name: "Edit" }).click();
	const text = page.getByRole("textbox", { name: "Markdown" });
	await expect(text).toHaveValue(/^# Getting started/);
	const save = page.getByRole("button", { name: "Save", exact: true });
	await expect(save).toBeDisabled();
	await text.fill("# Getting started\n\nA new line.\n");
	await expect(save).toBeEnabled();
	await save.click();
	await expect(save).toBeDisabled();
	await expect(text).toHaveValue(/A new line\./);
});

test("exports the architecture dossier to a .docx path", async ({ page }) => {
	await openKnowledge(page, "Documents");
	await page.getByRole("button", { name: "Export Architecture dossier" }).click();
	await expect(page.getByText("Exported: /mock/dossier.docx")).toBeVisible();
});

test("exports the complete dossier from the Export menu", async ({ page }) => {
	await openKnowledge(page, "Documents");
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await page.getByRole("menuitem", { name: "Complete dossier" }).click();
	await expect(page.getByText("Exported: /mock/dossier.docx").first()).toBeVisible();
});

test("edits a deck and presents it", async ({ page }) => {
	await openKnowledge(page, "Slides");
	await page.getByRole("button", { name: "Kickoff" }).click();
	await expect(page.getByRole("application", { name: "Slides (5)" })).toBeVisible();
	await page.getByRole("button", { name: "Present" }).click();
	await expect(page.getByRole("heading", { name: "Kickoff" }).last()).toBeVisible();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("heading", { name: "Goals" }).last()).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("button", { name: "Present" })).toBeVisible();
});

test("lists the learning path and the glossary", async ({ page }) => {
	await openKnowledge(page, "Learn");
	const path = page.getByRole("list", { name: "Path" });
	await expect(path.getByRole("listitem").first()).toBeVisible();
	await expect(path.getByRole("listitem").first()).toContainText("1");
	await expect(page.getByRole("list", { name: "Glossary" })).toBeVisible();
});

test("pins a dashboard tile to Home", async ({ page }) => {
	await openKnowledge(page, "Dashboards");
	const tile = page.getByRole("region", { name: "Work items" });
	await expect(tile).toBeVisible();
	await tile.getByRole("button", { name: "Pin to Home" }).click();
	await expect(tile.getByRole("button", { name: "Unpin from Home" })).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Home" }).click();
	await tabs(page).getByRole("link", { name: "My work" }).click();
	await expect(page.getByRole("region", { name: "Work items" })).toBeVisible();
});
