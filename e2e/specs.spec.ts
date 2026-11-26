import { expect, type Page, test } from "@playwright/test";
import { openFirstFolder } from "./first-run";
import { openLibrary, placeOf } from "./places";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
/** The row of a spec change in Flow / List: the title is the id of the change. */
const change = (page: Page, title: string) =>
	page.getByRole("button", { name: new RegExp(`^${title}`) });

/** Opens the mock project with a Linear tracker, then the Specs space on the given tab. */
async function openSpecs(page: Page, tab: string) {
	await page.goto("/home/today");
	await openFirstFolder(page);
	await expect(
		page.getByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ }),
	).toBeVisible();
	const sidebar = page.getByRole("navigation", { name: "Sidebar" });
	await sidebar.getByRole("link", { name: "Setup" }).click();
	await tabs(page).getByRole("link", { name: "This project" }).click();
	// The card Issue tracker of This project opens the page of the connections.
	await page
		.getByRole("region", { name: "Issue tracker" })
		.getByRole("link", { name: "Connect" })
		.click();
	await page.getByRole("button", { name: "Connection" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Acme");
	await page.getByRole("combobox", { name: "Product" }).click();
	await page.getByRole("option", { name: "Linear" }).click();
	await page
		.getByLabel("API key", { exact: true })
		.and(page.locator("input"))
		.fill("tok-e2e-specs");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("group", { name: "Acme" })).toBeVisible();
	// The only tracker links itself to the project.
	await tabs(page).getByRole("link", { name: "This project" }).click();
	// The card says Connected; its Change link opens the choice behind More.
	await page
		.getByRole("region", { name: "Issue tracker" })
		.getByRole("link", { name: "Change" })
		.click();
	await expect(page.getByRole("combobox", { name: "Issue tracker", exact: true })).toContainText(
		"Acme",
	);
	// Library has no section switch: a page opens from its chip.
	if (placeOf(tab) === "Library") return openLibrary(page, tab);
	await sidebar.getByRole("link", { name: placeOf(tab) }).click();
	await tabs(page).getByRole("link", { name: tab }).click();
}

test("shows a validation finding on the artifact that holds it, with its line", async ({
	page,
}) => {
	await openSpecs(page, "List");
	await change(page, "Add billing").click();
	// The files of the change are a page of their own, opened from the Brief.
	await page.getByRole("link", { name: "Files of the change" }).click();
	await page.getByRole("button", { name: "Check", exact: true }).click();
	const files = page.getByRole("region", { name: "State of each file" });
	await expect(files.getByRole("img", { name: "Proposal: Done" })).toBeVisible();
	await page
		.getByRole("group", { name: "Files of the change" })
		.getByRole("button", { name: "Spec", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: /REQ-002 has no scenario.*Line \d+/ }),
	).toBeVisible();
});

test("folds an answer into its spec after the preview and one click", async ({ page }) => {
	await openSpecs(page, "Questions");
	const title = "Which export formats ship first?";
	// An open question has its Answer field on its card: an empty answer is refused.
	await page.getByRole("button", { name: `Answer: ${title}`, exact: true }).click();
	await expect(page.getByText("Write an answer first.")).toBeVisible();
	await page.getByRole("textbox", { name: `Answer: ${title}` }).fill("CSV first");
	await page.getByRole("button", { name: `Answer: ${title}`, exact: true }).click();
	// The answered question moves to the Closed card, where its answer folds into the spec.
	await page.getByRole("button", { name: `Add the answer to the spec: ${title}` }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("textbox", { name: "Answer" }).fill("CSV first");
	const preview = dialog.getByRole("region", { name: "Preview" });
	await expect(preview).toContainText("NEEDS CLARIFICATION");
	await dialog.getByRole("button", { name: "Fold" }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page
		.getByRole("navigation", { name: "Sidebar" })
		.getByRole("link", { name: "Flow" })
		.click();
	await tabs(page).getByRole("link", { name: "List" }).click();
	// The change add-export belongs to the feature of ACME-3.
	await page.getByRole("button", { name: /^Bump dependencies/ }).click();
	await page
		.getByRole("navigation", { name: "Sections" })
		.getByRole("button", { name: "Brief" })
		.click();
	await page.getByRole("link", { name: "Files of the change" }).click();
	await page
		.getByRole("group", { name: "Files of the change" })
		.getByRole("button", { name: "Spec", exact: true })
		.click();
	await page.getByRole("button", { name: "Text", exact: true }).click();
	await expect(page.getByRole("textbox", { name: "Spec", exact: true })).toHaveValue(
		/### Clarifications[\s\S]*Q-035 .*: CSV first/,
	);
});

test("applies a split once and a second apply creates no duplicate", async ({ page }) => {
	await openSpecs(page, "List");
	await change(page, "Add auth").click();
	const open = async () => {
		await page.getByRole("main").getByRole("button", { name: "Split into more tickets" }).click();
		await page.getByRole("button", { name: "Preview" }).click();
	};
	await open();
	let dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Create (3)" })).toBeVisible();
	await dialog.getByRole("button", { name: "Apply" }).click();
	await expect(dialog.getByRole("heading", { name: "Written (3)" })).toBeVisible();
	await page.keyboard.press("Escape");
	await open();
	dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Unchanged (3)" })).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
});
